/**
 * 運行・オンライン販売停止コントローラ共通
 *
 * @namespace controller/staff/suspensionSetting
 */
import * as ttts from '@motionpicture/ttts-domain';
import * as numeral from 'numeral';

/**
 * 返金対象予約情報取得
 *  [一般予約]かつ
 *  [予約データ]かつ
 *  [同一購入単位に入塔記録のない]予約のid配列
 *
 *  info: {
 *     targrtIds:    [id1,id2,,,idn]
 *     cancelledIds: [id1,id2,,,idn]
 *     targrtInfo:   {performance_day:'20171201', payment_no:'67890'}
 *     arrivedInfos: [{performance_day:'20171201', payment_no:'12345'}]
 *     refundedInfo: {'20171201_12345': [r1,r2,,,rn]}
 *     cancelledInfo:{'20171201_12345': [r1,r2,,,rn]}
 * }
 *
 * @param {string} performanceIds
 * @return {any}
 */
export async function getTargetReservationsForRefund(performanceIds: string[],
                                                     refundStatus: string,
                                                     allFields: boolean): Promise<any> {
    // パフォーマンスに紐づく予約情報取得
    const reservationRepo = new ttts.repository.Reservation(ttts.mongoose.connection);
    const reservations = await getReservations(reservationRepo,
                                               performanceIds,
                                               refundStatus,
                                               allFields);

    // パフォーマンスに紐づくキャンセル情報取得
    const reservationsCancel = await getReservationsCancel(reservationRepo,
                                                           performanceIds);

    // 入塔済、返金済の予約情報セット
    const arrivedInfos: any[] = [];
    const refundedInfo: any = {};
    reservations.map((reservation: any) => {
        // 入塔済情報 [{performance_day:'20171201', payment_no:'12345'}]
        if (reservation.checkins.length > 0) {
            arrivedInfos.push({
                performance_day: reservation.performance_day,
                payment_no: reservation.payment_no
            });
        }
        // 返金済情報 [{'20171201_12345': [r1,r2,,,rn]}]
        const key: string = `${reservation.performance_day}_${reservation.payment_no}`;
        // 返金済の時
        if (reservation.performance_ttts_extension.refund_status === ttts.PerformanceUtil.REFUND_STATUS.COMPLETE) {
            if (refundedInfo.hasOwnProperty(key) === false) {
                refundedInfo[key] = [];
            }
            refundedInfo[key].push(reservation._id.toString());
        }
    });

    // 入塔済判定
    const isArrived = (reservation: any): boolean => {
        for (const arrivedInfo of arrivedInfos) {
            if (arrivedInfo.performance_day === reservation.performance_day &&
                arrivedInfo.payment_no === reservation.payment_no) {
                return true;
            }
        }

        return false;
    };

    // キャンセル情報セット
    const cancelledInfo: any = {};
    reservationsCancel.map((reservation: any) => {
        // キャンセル情報 [{'20171201_12345': [r1,r2,,,rn]}]
        const key: string = `${reservation.performance_day}_${reservation.payment_no}`;
        if (cancelledInfo.hasOwnProperty(key) === false) {
            cancelledInfo[key] = [];
        }
        cancelledInfo[key].push(reservation._id.toString());
    });

    // 更新対象の予約IDセット
    const targrtIds: any = [];
    const cancelledIds: any = [];
    const targrtInfo: any = {};
    reservations.map((reservation: any) => {
        // 入塔記録がない時
        if (isArrived(reservation) === false) {
            const key: string = `${reservation.performance_day}_${reservation.payment_no}`;
            // キャンセルがある購入の時
            if (cancelledInfo.hasOwnProperty(key)) {
                cancelledIds.push(reservation._id);
            } else {
                targrtIds.push(reservation._id);
                // メール送信情報 {'20171201_12345': [r1,r2,,,rn]}
                if (targrtInfo.hasOwnProperty(key) === false) {
                    targrtInfo[key] = [];
                }
                targrtInfo[key].push(reservation);
            }
        }
    });

    // 戻り値セット
    return ({
        targrtIds: targrtIds,
        cancelledIds: cancelledIds,
        targrtInfo: targrtInfo,
        arrivedInfos: arrivedInfos,
        refundedInfo: refundedInfo,
        cancelledInfo: cancelledInfo
    });
}

/**
 * 予約情報取得
 *
 * @param {ttts.repository.Reservation} reservationRepo
 * @param {string[]} performanceIds
 * @param {string} refundStatus
 * @param {boolean} allFields
 * @return {Promise<any>}
 */
async function getReservations(reservationRepo: ttts.repository.Reservation,
                               performanceIds: string[],
                               refundStatus: string,
                               allFields: boolean): Promise<any> {

    // 検索条件セット([指定パフォーマンス]かつ[一般予約]かつ[予約済])
    const conditions: any = {
        purchaser_group: ttts.ReservationUtil.PURCHASER_GROUP_CUSTOMER,
        status: {
            $in: [
                ttts.factory.reservationStatusType.ReservationConfirmed,
                ttts.factory.reservationStatusType.ReservationSecuredExtra
            ]
        },
        performance: { $in: performanceIds }
    };
    // 返金ステータス条件セット
    if (refundStatus !== '') {
        conditions['performance_ttts_extension.refund_status'] = refundStatus;
    }
    // フィールドセット
    const fields: string = allFields ? '' : '_id performance_day payment_no checkins performance_ttts_extension';

    // パフォーマンスに紐づく予約情報取得
    return (<any[]>await reservationRepo.reservationModel.find(
        conditions,
        fields
    ).exec());
}
/**
 * キャンセル情報取得
 *
 * @param {ttts.repository.Reservation} reservationRepo
 * @param {string[]} performanceIds
 * @return {Promise<any>}
 */
async function getReservationsCancel(reservationRepo: ttts.repository.Reservation,
                                     performanceIds: string[]) : Promise<any> {

    // パフォーマンスに紐づくキャンセル情報取得
    return (<any[]>await reservationRepo.reservationModel.find(
        {
            purchaser_group: ttts.ReservationUtil.PURCHASER_GROUP_CUSTOMER,
            status: ttts.factory.reservationStatusType.ReservationCancelled,
            performance: { $in: performanceIds }
        },
        '_id performance_day payment_no'
    ).exec());
}

/**
 * メールキューインタフェース
 *
 * @interface IEmailQueue
 */
export interface IEmailQueue {
    // tslint:disable-next-line:no-reserved-keywords
    from: { // 送信者
        address: string;
        name: string;
    };
    to: { // 送信先
        address: string;
        name?: string;
    };
    subject: string;
    content: { // 本文
        mimetype: string;
        text: string;
    };
    status: string;
}

/**
 * チケット情報取得
 *
 */
export function getTicketInfo(reservations: any[], leaf: string, locale: string): string[] {
    // 券種ごとに合計枚数算出
    const keyName: string = 'ticket_type';
    const ticketInfos: {} = {};
    for (const reservation of reservations) {
        // チケットタイプセット
        const dataValue = reservation[keyName];
        // チケットタイプごとにチケット情報セット
        if (!ticketInfos.hasOwnProperty(dataValue)) {
            (<any>ticketInfos)[dataValue] = {
                ticket_type_name: reservation.ticket_type_name[locale],
                charge: `\\${numeral(reservation.charge).format('0,0')}`,
                count: 1
            };
        } else {
            (<any>ticketInfos)[dataValue].count += 1;
        }
    }
    // 券種ごとの表示情報編集
    const ticketInfoArray: string[] = [];
    Object.keys(ticketInfos).forEach((key) => {
        const ticketInfo = (<any>ticketInfos)[key];
        ticketInfoArray.push(`${ticketInfo.ticket_type_name} ${ticketInfo.count}${leaf}`);
    });

    return ticketInfoArray;
}
