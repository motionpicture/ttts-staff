/**
 * 予約APIコントローラー
 * @namespace controllers.api.reservations
 */

import * as ttts from '@motionpicture/ttts-domain';
import * as conf from 'config';
import * as createDebug from 'debug';
import { NextFunction, Request, Response } from 'express';
import { INTERNAL_SERVER_ERROR, NO_CONTENT, NOT_FOUND } from 'http-status';
import * as moment from 'moment';
import * as _ from 'underscore';

const debug = createDebug('ttts-staff:controllers:api:reservations');

const redisClient = ttts.redis.createClient({
    host: <string>process.env.REDIS_HOST,
    // tslint:disable-next-line:no-magic-numbers
    port: parseInt(<string>process.env.REDIS_PORT, 10),
    password: <string>process.env.REDIS_KEY,
    tls: { servername: <string>process.env.REDIS_HOST }
});

const paymentMethodsForCustomer = conf.get('paymentMethodsForCustomer');
const paymentMethodsForStaff = conf.get('paymentMethodsForStaff');

/**
 * 予約検索
 */
// tslint:disable-next-line:cyclomatic-complexity max-func-body-length
export async function search(req: Request, res: Response): Promise<void> {
    // バリデーション
    const errors: any = {};

    // 片方入力エラーチェック
    if (!isInputEven(req.query.start_hour1, req.query.start_minute1)) {
        errors.start_hour1 = { msg: '時分Fromが片方しか指定されていません' };
    }
    if (!isInputEven(req.query.start_hour2, req.query.start_minute2)) {
        errors.start_hour2 = { msg: '時分Toが片方しか指定されていません' };
    }

    if (Object.keys(errors).length > 0) {
        res.json({
            success: false,
            results: null,
            count: 0,
            errors: errors
        });

        return;
    }

    // tslint:disable-next-line:no-magic-numbers
    const limit: number = (!_.isEmpty(req.query.limit)) ? parseInt(req.query.limit, 10) : 10;
    // tslint:disable-next-line:no-magic-numbers
    const page: number = (!_.isEmpty(req.query.page)) ? parseInt(req.query.page, 10) : 1;
    // ご来塔日時
    const day: string | null = (!_.isEmpty(req.query.day)) ? req.query.day : null;
    const startHour1: string | null = (!_.isEmpty(req.query.start_hour1)) ? req.query.start_hour1 : null;
    const startMinute1: string | null = (!_.isEmpty(req.query.start_minute1)) ? req.query.start_minute1 : null;
    const startHour2: string | null = (!_.isEmpty(req.query.start_hour2)) ? req.query.start_hour2 : null;
    const startMinute2: string | null = (!_.isEmpty(req.query.start_minute2)) ? req.query.start_minute2 : null;
    // 購入番号
    let paymentNo: string | null = (!_.isEmpty(req.query.payment_no)) ? req.query.payment_no : null;
    // アカウント
    const owner: string | null = (!_.isEmpty(req.query.owner)) ? req.query.owner : null;
    // 予約方法
    const purchaserGroup: string | null = (!_.isEmpty(req.query.purchaser_group)) ? req.query.purchaser_group : null;
    // 決済手段
    const paymentMethod: string | null = (!_.isEmpty(req.query.payment_method)) ? req.query.payment_method : null;
    // 名前
    const purchaserLastName: string | null = (!_.isEmpty(req.query.purchaser_last_name)) ? req.query.purchaser_last_name : null;
    const purchaserFirstName: string | null = (!_.isEmpty(req.query.purchaser_first_name)) ? req.query.purchaser_first_name : null;
    // メアド
    const purchaserEmail: string | null = (!_.isEmpty(req.query.purchaser_email)) ? req.query.purchaser_email : null;
    // 電話番号
    const purchaserTel: string | null = (!_.isEmpty(req.query.purchaser_tel)) ? req.query.purchaser_tel : null;
    // メモ
    const watcherName: string | null = (!_.isEmpty(req.query.watcher_name)) ? req.query.watcher_name : null;

    // 検索条件を作成
    const conditions: any[] = [];

    // 管理者の場合、内部関係者の予約全て&確保中
    conditions.push(
        {
            status: ttts.factory.reservationStatusType.ReservationConfirmed
        }
    );

    // 来塔日
    if (day !== null) {
        conditions.push({ performance_day: day });
    }
    // 開始時間
    const startTimeFrom: any = (startHour1 !== null && startMinute1 !== null) ? startHour1 + startMinute1 : null;
    const startTimeTo: any = (startHour2 !== null && startMinute2 !== null) ? startHour2 + startMinute2 : null;
    if (startTimeFrom !== null || startTimeTo !== null) {
        const conditionsTime: any = {};
        // 開始時間From
        if (startTimeFrom !== null) {
            conditionsTime.$gte = startTimeFrom;
        }
        // 開始時間To
        if (startTimeTo !== null) {
            conditionsTime.$lte = startTimeTo;
        }
        conditions.push({ performance_start_time: conditionsTime });
    }
    // 購入番号
    if (paymentNo !== null) {
        // remove space characters
        paymentNo = ttts.CommonUtil.toHalfWidth(paymentNo.replace(/\s/g, ''));
        conditions.push({ payment_no: { $regex: `${paymentNo}` } });
    }
    // アカウント
    if (owner !== null) {
        conditions.push({ owner_username: owner });
    }
    // 予約方法
    if (purchaserGroup !== null) {
        conditions.push({ purchaser_group: purchaserGroup });
    }
    // 決済手段
    if (paymentMethod !== null) {
        conditions.push({ payment_method: paymentMethod });
    }
    // 名前
    if (purchaserLastName !== null) {
        conditions.push({ purchaser_last_name: { $regex: purchaserLastName } });
        //conditions['name.ja'] = { $regex: managementTypeName };
    }
    if (purchaserFirstName !== null) {
        conditions.push({ purchaser_first_name: { $regex: purchaserFirstName } });
        //conditions.push({ purchaser_first_name: purchaserFirstName });
    }
    // メアド
    if (purchaserEmail !== null) {
        conditions.push({ purchaser_email: purchaserEmail });
    }
    // 電話番号
    if (purchaserTel !== null) {
        conditions.push({
            purchaser_tel: { $regex: new RegExp(`${purchaserTel}$`) }
        });
    }
    // メモ
    if (watcherName !== null) {
        conditions.push({ watcher_name: watcherName });
    }

    debug('searching reservations...', conditions);
    const reservationRepo = new ttts.repository.Reservation(ttts.mongoose.connection);
    try {
        // 総数検索
        const count = await reservationRepo.reservationModel.count(
            {
                $and: conditions
            }
        ).exec();
        debug('reservation count:', count);

        // データ検索(検索→ソート→指定ページ分切取り)
        const reservations = await reservationRepo.reservationModel.find({ $and: conditions })
            .sort({
                performance_day: 1,
                performance_start_time: 1,
                payment_no: 1,
                ticket_type: 1
            })
            .skip(limit * (page - 1))
            .limit(limit)
            .exec()
            .then((docs) => docs.map((doc) => <ttts.factory.reservation.event.IReservation>doc.toObject()));

        // 0件メッセージセット
        const message : string = (reservations.length === 0) ?
            '検索結果がありません。予約データが存在しないか、検索条件を見直してください' : '';

        const getPaymentMethodName = (method: string) => {
            if (paymentMethodsForCustomer.hasOwnProperty(method)) {
                return (<any>paymentMethodsForCustomer)[method];
            }
            if (paymentMethodsForStaff.hasOwnProperty(method)) {
                return (<any>paymentMethodsForStaff)[method];
            }

            return method;
        };
        // 決済手段名称追加
        for (const reservation of reservations) {
            (<any>reservation).payment_method_name = getPaymentMethodName(reservation.payment_method);
        }

        res.json({
            results: reservations,
            count: count,
            errors: null,
            message: message
        });
    } catch (error) {
        res.status(INTERNAL_SERVER_ERROR).json({
            errors: [{
                message: error.message
            }]
        });
    }
}

/**
 * 両方入力チェック(両方入力、または両方未入力の時true)
 *
 * @param {string} value1
 * @param {string} value2
 * @return {boolean}
 */
function isInputEven(value1: string, value2: string): boolean {
    if (_.isEmpty(value1) && _.isEmpty(value2)) {
        return true;
    }
    if (!_.isEmpty(value1) && !_.isEmpty(value2)) {
        return true;
    }

    return false;
}

/**
 * 配布先を更新する
 */
export async function updateWatcherName(req: Request, res: Response, next: NextFunction): Promise<void> {
    if (req.staffUser === undefined) {
        next(new Error(req.__('UnexpectedError')));

        return;
    }

    const reservationId = req.body.reservationId;
    const watcherName = req.body.watcherName;

    const condition = {
        _id: reservationId,
        status: ttts.factory.reservationStatusType.ReservationConfirmed
    };

    const reservationRepo = new ttts.repository.Reservation(ttts.mongoose.connection);
    try {
        const reservation = await reservationRepo.reservationModel.findOneAndUpdate(
            condition,
            {
                watcher_name: watcherName,
                watcher_name_updated_at: Date.now()
            },
            { new: true }
        ).exec();

        if (reservation === null) {
            res.status(NOT_FOUND).json(null);
        } else {
            res.status(NO_CONTENT).end();
        }
    } catch (error) {
        res.status(INTERNAL_SERVER_ERROR).json({
            errors: [{
                message: req.__('UnexpectedError')
            }]
        });
    }
}

/**
 * キャンセル実行api
 * @param {string} reservationId
 * @return {Promise<boolean>}
 */
export async function cancel(req: Request, res: Response, next: NextFunction): Promise<void> {
    if (req.staffUser === undefined) {
        next(new Error(req.__('UnexpectedError')));

        return;
    }
    const successIds: string[] = [];
    const errorIds: string[] = [];
    try {
        const reservationIds = req.body.reservationIds;
        if (!Array.isArray(reservationIds)) {
            throw new Error(req.__('UnexpectedError'));
        }

        const promises = reservationIds.map(async (id) => {
            // 予約データの解放
            const result: boolean = await cancelById(id);
            if (result) {
                successIds.push(id);
            } else {
                errorIds.push(id);
            }
        });
        await Promise.all(promises);
        res.status(NO_CONTENT).end();
    } catch (error) {
        res.status(INTERNAL_SERVER_ERROR).json({
            message: error.message,
            successIds: successIds,
            errorIds: errorIds
        });
    }
}

/**
 * キャンセル処理(idから)
 * @param {string} reservationId
 * @return {Promise<boolean>}
 */
async function cancelById(reservationId: string): Promise<boolean> {
    try {
        const reservationRepo = new ttts.repository.Reservation(ttts.mongoose.connection);
        const stockRepo = new ttts.repository.Stock(ttts.mongoose.connection);

        // idから予約データ取得
        const reservation = await reservationRepo.reservationModel.findOne(
            {
                _id: reservationId,
                status: ttts.factory.reservationStatusType.ReservationConfirmed
            }
        ).exec().then((doc) => {
            if (doc === null) {
                throw new Error('Reservation not found.');
            }

            return <ttts.factory.reservation.event.IReservation>doc.toObject();
        });

        // 同じseat_code_baseのチケット一式を予約キャンセル(車椅子予約の場合は、システムホールドのデータもキャンセルする必要があるので)
        const cancelingReservations = await reservationRepo.reservationModel.find(
            {
                performance_day: reservation.performance_day,
                payment_no: reservation.payment_no,
                'reservation_ttts_extension.seat_code_base': reservation.seat_code
            }
        ).exec();

        debug('canceling...', cancelingReservations);
        await Promise.all(cancelingReservations.map(async (cancelingReservation) => {
            // 予約をキャンセル
            await reservationRepo.reservationModel.findByIdAndUpdate(
                <string>cancelingReservation.id,
                { status: ttts.factory.reservationStatusType.ReservationCancelled }
            ).exec();

            // 在庫を空きに(在庫IDに対して、元の状態に戻す)
            await stockRepo.stockModel.findByIdAndUpdate(
                cancelingReservation.get('stock'),
                { availability: cancelingReservation.get('stock_availability_before') }
            ).exec();
        }));
        debug(cancelingReservations.length, 'reservation(s) canceled.');

        // 券種による流入制限解放
        if (reservation.rate_limit_unit_in_seconds > 0) {
            const rateLimitRepo = new ttts.repository.rateLimit.TicketTypeCategory(redisClient);
            await rateLimitRepo.unlock({
                ticketTypeCategory: reservation.ticket_ttts_extension.category,
                performanceStartDate: moment(reservation.performance_start_date).toDate(),
                unitInSeconds: reservation.rate_limit_unit_in_seconds
            });
            debug('rate limit reset.');
        }
    } catch (error) {
        return false;
    }

    return true;
}
