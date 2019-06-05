/**
 * パフォーマンスAPIコントローラー
 */
import * as tttsapi from '@motionpicture/ttts-api-nodejs-client';

import * as conf from 'config';
import * as createDebug from 'debug';
import { Request, Response } from 'express';
import { INTERNAL_SERVER_ERROR, NO_CONTENT } from 'http-status';
import * as moment from 'moment';
import * as numeral from 'numeral';

import StaffUser from '../../models/user/staff';

const debug = createDebug('ttts-staff:controllers');

/**
 * 運行・オンライン販売ステータス変更
 */
export async function updateOnlineStatus(req: Request, res: Response): Promise<void> {
    try {
        // パフォーマンスIDリストをjson形式で受け取る
        const performanceIds = req.body.performanceIds;
        if (!Array.isArray(performanceIds)) {
            throw new Error(req.__('UnexpectedError'));
        }

        // パフォーマンス・予約(入塔記録のないもの)のステータス更新
        const onlineStatus: tttsapi.factory.performance.OnlineSalesStatus = req.body.onlineStatus;
        const evStatus: tttsapi.factory.performance.EvServiceStatus = req.body.evStatus;
        const notice: string = req.body.notice;
        debug('updating performances...', performanceIds, onlineStatus, evStatus, notice);

        const now = new Date();

        // 返金対象予約情報取得(入塔記録のないもの)
        const targetPlaceOrderTransactions = await getTargetReservationsForRefund(req, performanceIds);
        debug('email target placeOrderTransactions:', targetPlaceOrderTransactions);

        // 返金ステータスセット(運行停止は未指示、減速・再開はNONE)
        const refundStatus: tttsapi.factory.performance.RefundStatus =
            evStatus === tttsapi.factory.performance.EvServiceStatus.Suspended ?
                tttsapi.factory.performance.RefundStatus.NotInstructed :
                tttsapi.factory.performance.RefundStatus.None;

        // パフォーマンス更新
        debug('updating performance online_sales_status...');

        const eventService = new tttsapi.service.Event({
            endpoint: <string>process.env.API_ENDPOINT,
            auth: req.tttsAuthClient
        });
        const reservationService = new tttsapi.service.Reservation({
            endpoint: <string>process.env.API_ENDPOINT,
            auth: req.tttsAuthClient
        });

        const updateUser = (<StaffUser>req.staffUser).username;

        await Promise.all(performanceIds.map(async (performanceId) => {
            // パフォーマンスに対する予約検索(1パフォーマンスに対する予約はmax41件なので、これで十分)
            const searchReservationsResult = await reservationService.search({
                limit: 100,
                performance: performanceId
            });
            const reservations4performance = searchReservationsResult.data;

            const reservationsAtLastUpdateDate: tttsapi.factory.performance.IReservationAtLastupdateDate[] =
                reservations4performance.map((r) => {
                    return {
                        id: r.id,
                        status: r.status,
                        purchaser_group: r.purchaser_group,
                        transaction_agent: r.transaction_agent,
                        payment_method: r.payment_method,
                        order_number: r.order_number
                    };
                });

            await eventService.updateExtension({
                id: performanceId,
                reservationsAtLastUpdateDate: reservationsAtLastUpdateDate,
                onlineSalesStatus: onlineStatus,
                onlineSalesStatusUpdateUser: updateUser,
                onlineSalesStatusUpdateAt: now,
                evServiceStatus: evStatus,
                evServiceStatusUpdateUser: updateUser,
                evServiceStatusUpdateAt: now,
                refundStatus: refundStatus,
                refundStatusUpdateUser: updateUser,
                refundStatusUpdateAt: now
            });
        }));
        debug('performance online_sales_status updated.');

        // 運行停止の時(＜必ずオンライン販売停止・infoセット済)、メール作成
        if (evStatus === tttsapi.factory.performance.EvServiceStatus.Suspended) {
            try {
                await createEmails(req, res, targetPlaceOrderTransactions, notice);
            } catch (error) {
                // no op
                debug('createEmails failed', error);
            }
        }

        res.status(NO_CONTENT).end();
    } catch (error) {
        res.status(INTERNAL_SERVER_ERROR).json({
            message: error.message
        });
    }
}

export type IPlaceOrderTransaction = tttsapi.factory.transaction.placeOrder.ITransaction;

/**
 * 返金対象予約情報取得
 *  [一般予約]かつ
 *  [予約データ]かつ
 *  [同一購入単位に入塔記録のない]予約のid配列
 */
export async function getTargetReservationsForRefund(req: Request, performanceIds: string[]): Promise<IPlaceOrderTransaction[]> {
    const placeOrderService = new tttsapi.service.transaction.PlaceOrder({
        endpoint: <string>process.env.API_ENDPOINT,
        auth: req.tttsAuthClient
    });

    // 返品されていない、かつ、入場履歴なし、の予約から、取引IDリストを取得
    const reservationService = new tttsapi.service.Reservation({
        endpoint: <string>process.env.API_ENDPOINT,
        auth: req.tttsAuthClient
    });
    const targetTransactionIds = await reservationService.distinct(
        'transaction',
        {
            status: tttsapi.factory.reservationStatusType.ReservationConfirmed,
            purchaser_group: tttsapi.factory.person.Group.Customer,
            performances: performanceIds,
            checkins: { $size: 0 }
        }
    );

    // 全取引検索
    const limit = 100;
    let page = 0;
    let numData: number = limit;
    const transactions: IPlaceOrderTransaction[] = [];
    while (numData === limit) {
        page += 1;
        const searchTransactionsResult = await placeOrderService.search({
            limit: limit,
            page: page,
            typeOf: tttsapi.factory.transactionType.PlaceOrder,
            ids: targetTransactionIds
        });
        numData = searchTransactionsResult.data.length;
        debug('numData:', numData);
        transactions.push(...searchTransactionsResult.data);
    }

    return transactions;
}

/**
 * 運行・オンライン販売停止メール作成
 * @param {Response} res
 * @param {tttsapi.factory.transaction.placeOrder.ITransaction[]} transactions
 * @param {string} notice
 * @return {Promise<void>}
 */
async function createEmails(
    req: Request,
    res: Response,
    transactions: tttsapi.factory.transaction.placeOrder.ITransaction[],
    notice: string
): Promise<void> {
    if (transactions.length === 0) {
        return;
    }

    // 購入単位ごとにメール作成
    await Promise.all(transactions.map(async (transaction) => {
        const result = <tttsapi.factory.transaction.placeOrder.IResult>transaction.result;
        const confirmedReservations = result.eventReservations
            .filter((r) => r.status === tttsapi.factory.reservationStatusType.ReservationConfirmed);
        await createEmail(req, res, confirmedReservations, notice);
    }));
}

/**
 * 運行・オンライン販売停止メール作成(1通)
 * @param {Response} res
 * @param {tttsapi.factory.reservation.event.IReservation[]} reservation
 * @param {string} notice
 * @return {Promise<void>}
 */
// tslint:disable-next-line:max-func-body-length
async function createEmail(
    req: Request, res: Response, reservations: tttsapi.factory.reservation.event.IReservation[], notice: string
): Promise<void> {
    const reservation = reservations[0];
    // タイトル編集
    // 東京タワー TOP DECK Ticket
    // 東京タワー TOP DECK エレベータ運行停止のお知らせ
    const title = conf.get<string>('emailSus.title');
    const titleEn = conf.get<string>('emailSus.titleEn');
    //トウキョウ タロウ 様
    const purchaserNameJp = `${reservation.purchaser_last_name} ${reservation.purchaser_first_name}`;
    const purchaserName: string = `${res.__('{{name}}様', { name: purchaserNameJp })}`;
    const purchaserNameEn: string = `${res.__('Mr./Ms.{{name}}', { name: reservation.purchaser_name })}`;

    // 購入チケット情報
    const paymentTicketInfos: string[] = [];

    // ご来塔日時 : 2017/12/10 09:15
    const day: string = moment(reservation.performance_day, 'YYYYMMDD').format('YYYY/MM/DD');
    // tslint:disable-next-line:no-magic-numbers
    const time: string = `${reservation.performance_start_time.substr(0, 2)}:${reservation.performance_start_time.substr(2, 2)}`;

    // 購入番号 : 850000001
    paymentTicketInfos.push(`${res.__('PaymentNo')} : ${reservation.payment_no}`);
    paymentTicketInfos.push(`${res.__('EmailReserveDate')} : ${day} ${time}`);
    paymentTicketInfos.push(`${res.__('TicketType')} ${res.__('TicketCount')}`); // 券種 枚数
    const infos = getTicketInfo(reservations, res.__, res.locale); // TOP DECKチケット(大人) 1枚
    paymentTicketInfos.push(infos.join('\n'));

    // 英語表記を追加
    paymentTicketInfos.push(''); // 日英の間の改行
    paymentTicketInfos.push(`${res.__({ phrase: 'PaymentNo', locale: 'en' })} : ${reservation.payment_no}`);
    paymentTicketInfos.push(`${res.__({ phrase: 'EmailReserveDate', locale: 'en' })} : ${day} ${time}`);
    paymentTicketInfos.push(`${res.__({ phrase: 'TicketType', locale: 'en' })} ${res.__({ phrase: 'TicketCount', locale: 'en' })}`);
    // TOP DECKチケット(大人) 1枚
    const infosEn = getTicketInfo(reservations, res.__, 'en');
    paymentTicketInfos.push(infosEn.join('\n'));

    // foot
    const foot1 = conf.get<string>('emailSus.EmailFoot1');
    const footEn1 = conf.get<string>('emailSus.EmailFootEn1');
    const foot2 = conf.get<string>('emailSus.EmailFoot2');
    const footEn2 = conf.get<string>('emailSus.EmailFootEn2');
    const foot3 = conf.get<string>('emailSus.EmailFoot3');
    const footEn3 = conf.get<string>('emailSus.EmailFootEn3');
    const access1 = conf.get<string>('emailSus.EmailAccess1');
    const accessEn1 = conf.get<string>('emailSus.EmailAccessEn1');
    const access2 = conf.get<string>('emailSus.EmailAccess2');
    const accessEn2 = conf.get<string>('emailSus.EmailAccessEn2');

    // 本文セット
    // tslint:disable-next-line:max-line-length
    const content: string = `${title}\n${titleEn}\n\n${purchaserName}\n${purchaserNameEn}\n\n${notice}\n\n${paymentTicketInfos.join('\n')}\n\n\n${foot1}\n${foot2}\n${foot3}\n\n${footEn1}\n${footEn2}\n${footEn3}\n\n${access1}\n${access2}\n\n${accessEn1}\n${accessEn2}`;

    // メール編集
    const emailAttributes: tttsapi.factory.creativeWork.message.email.IAttributes = {
        sender: {
            name: conf.get<string>('email.fromname'),
            email: conf.get<string>('email.from')
        },
        toRecipient: {
            // tslint:disable-next-line:max-line-length
            name: reservation.purchaser_name,
            email: reservation.purchaser_email
        },
        about: `${title} ${titleEn}`,
        text: content
    };

    // メール作成
    const taskService = new tttsapi.service.Task({
        endpoint: <string>process.env.API_ENDPOINT,
        auth: req.tttsAuthClient
    });

    const emailMessage = tttsapi.factory.creativeWork.message.email.create({
        identifier: `updateOnlineStatus-${reservation.id}`,
        sender: {
            typeOf: 'Corporation',
            name: emailAttributes.sender.name,
            email: emailAttributes.sender.email
        },
        toRecipient: {
            typeOf: tttsapi.factory.personType.Person,
            name: emailAttributes.toRecipient.name,
            email: emailAttributes.toRecipient.email
        },
        about: emailAttributes.about,
        text: emailAttributes.text
    });

    // その場で送信ではなく、DBにタスクを登録
    const taskAttributes = tttsapi.factory.task.sendEmailNotification.createAttributes({
        status: tttsapi.factory.taskStatus.Ready,
        runsAt: new Date(), // なるはやで実行
        remainingNumberOfTries: 10,
        lastTriedAt: null,
        numberOfTried: 0,
        executionResults: [],
        data: {
            emailMessage: emailMessage
        }
    });
    await taskService.create(taskAttributes);
    debug('sendEmail task created.');
}

/**
 * チケット情報取得
 *
 */
export function getTicketInfo(reservations: tttsapi.factory.reservation.event.IReservation[], __: Function, locale: string): string[] {
    // 券種ごとに合計枚数算出
    const ticketInfos: {
        [ticketTypeId: string]: {
            ticket_type_name: string;
            charge: string;
            count: number;
        };
    } = {};
    for (const reservation of reservations) {
        // チケットタイプごとにチケット情報セット
        if (ticketInfos[reservation.ticket_type] === undefined) {
            ticketInfos[reservation.ticket_type] = {
                ticket_type_name: (<any>reservation.ticket_type_name)[locale],
                charge: `\\${numeral(reservation.charge).format('0,0')}`,
                count: 1
            };
        } else {
            ticketInfos[reservation.ticket_type].count += 1;
        }
    }

    // 券種ごとの表示情報編集
    return Object.keys(ticketInfos).map((ticketTypeId) => {
        return `${ticketInfos[ticketTypeId].ticket_type_name} ${__('{{n}}Leaf', { n: ticketInfos[ticketTypeId].count })}`;
    });
}
