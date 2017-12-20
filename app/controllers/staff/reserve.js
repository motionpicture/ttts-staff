"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * 内部関係者座席予約コントローラー
 *
 * @namespace controller/staff/reserve
 */
const ttts = require("@motionpicture/ttts-domain");
const conf = require("config");
const createDebug = require("debug");
const moment = require("moment");
const _ = require("underscore");
const reservePerformanceForm_1 = require("../../forms/reserve/reservePerformanceForm");
const session_1 = require("../../models/reserve/session");
const reserveBaseController = require("../reserveBase");
const debug = createDebug('ttts-staff:controller:reserve');
const PURCHASER_GROUP = ttts.factory.person.Group.Staff;
const layout = 'layouts/staff/layout';
const PAY_TYPE_FREE = 'F';
const paymentMethodNames = { F: '無料招待券', I: '請求書支払い' };
const reserveMaxDateInfo = conf.get('reserve_max_date');
function start(req, res, next) {
    return __awaiter(this, void 0, void 0, function* () {
        // 期限指定
        if (moment() < moment(conf.get('datetimes.reservation_start_staffs'))) {
            next(new Error(req.__('Message.OutOfTerm')));
            return;
        }
        try {
            const reservationModel = yield reserveBaseController.processStart(PURCHASER_GROUP, req);
            reservationModel.save(req);
            if (reservationModel.performance !== undefined) {
                const cb = '/staff/reserve/tickets';
                res.redirect(`/staff/reserve/terms?cb=${encodeURIComponent(cb)}`);
            }
            else {
                const cb = '/staff/reserve/performances';
                res.redirect(`/staff/reserve/terms?cb=${encodeURIComponent(cb)}`);
            }
        }
        catch (error) {
            next(new Error(req.__('UnexpectedError')));
        }
    });
}
exports.start = start;
/**
 * 規約(スキップ)
 */
function terms(req, res, __) {
    const cb = (!_.isEmpty(req.query.cb)) ? req.query.cb : '/';
    res.redirect(cb);
}
exports.terms = terms;
/**
 * スケジュール選択
 * @method performances
 * @returns {Promise<void>}
 */
function performances(req, res, next) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const reservationModel = session_1.default.FIND(req);
            if (reservationModel === null) {
                next(new Error(req.__('Expired')));
                return;
            }
            const token = yield ttts.CommonUtil.getToken({
                authorizeServerDomain: process.env.API_AUTHORIZE_SERVER_DOMAIN,
                clientId: process.env.API_CLIENT_ID,
                clientSecret: process.env.API_CLIENT_SECRET,
                scopes: [
                    `${process.env.API_RESOURECE_SERVER_IDENTIFIER}/performances.read-only`
                ],
                state: ''
            });
            // tslint:disable-next-line:no-console
            // console.log('token=' + JSON.stringify(token));
            const maxDate = moment();
            Object.keys(reserveMaxDateInfo).forEach((key) => {
                maxDate.add(key, reserveMaxDateInfo[key]);
            });
            const reserveMaxDate = maxDate.format('YYYY/MM/DD');
            if (req.method === 'POST') {
                reservePerformanceForm_1.default(req);
                const validationResult = yield req.getValidationResult();
                if (!validationResult.isEmpty()) {
                    next(new Error(req.__('UnexpectedError')));
                    return;
                }
                try {
                    // パフォーマンスFIX
                    yield reserveBaseController.processFixPerformance(reservationModel, req.body.performanceId, req);
                    reservationModel.save(req);
                    res.redirect('/staff/reserve/tickets');
                    return;
                }
                catch (error) {
                    next(new Error(req.__('UnexpectedError')));
                    return;
                }
            }
            else {
                // 仮予約あればキャンセルする
                yield reserveBaseController.processCancelSeats(reservationModel);
                reservationModel.save(req);
                res.render('staff/reserve/performances', {
                    // FilmUtil: ttts.FilmUtil,
                    token: token,
                    reserveMaxDate: reserveMaxDate,
                    layout: layout
                });
            }
        }
        catch (error) {
            console.error(error);
            next(new Error(req.__('UnexpectedError')));
        }
    });
}
exports.performances = performances;
/**
 * 券種選択
 */
function tickets(req, res, next) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const reservationModel = session_1.default.FIND(req);
            if (reservationModel === null) {
                next(new Error(req.__('Expired')));
                return;
            }
            reservationModel.paymentMethod = '';
            if (req.method === 'POST') {
                // 仮予約あればキャンセルする
                try {
                    yield reserveBaseController.processCancelSeats(reservationModel);
                }
                catch (error) {
                    // tslint:disable-next-line:no-console
                    console.log(error);
                    next(error);
                    return;
                }
                try {
                    // 予約処理
                    yield reserveBaseController.processFixSeatsAndTickets(reservationModel, req);
                    reservationModel.save(req);
                    res.redirect('/staff/reserve/profile');
                }
                catch (error) {
                    // "予約可能な席がございません"などのメッセージ表示
                    res.locals.message = error.message;
                    res.render('staff/reserve/tickets', {
                        reservationModel: reservationModel,
                        layout: layout
                    });
                }
            }
            else {
                // 券種選択画面へ遷移
                res.locals.message = '';
                res.render('staff/reserve/tickets', {
                    reservationModel: reservationModel,
                    layout: layout
                });
            }
        }
        catch (error) {
            next(new Error(req.__('UnexpectedError')));
        }
    });
}
exports.tickets = tickets;
/**
 * 購入者情報
 */
function profile(req, res, next) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const reservationModel = session_1.default.FIND(req);
            if (reservationModel === null) {
                next(new Error(req.__('Expired')));
                return;
            }
            if (req.method === 'POST') {
                try {
                    yield reserveBaseController.processFixProfile(reservationModel, req, res);
                    reservationModel.save(req);
                    res.redirect('/staff/reserve/confirm');
                }
                catch (error) {
                    console.error(error);
                    res.render('staff/reserve/profile', {
                        reservationModel: reservationModel,
                        layout: layout
                    });
                }
            }
            else {
                // セッションに情報があれば、フォーム初期値設定
                const email = reservationModel.purchaser.email;
                res.locals.lastName = reservationModel.purchaser.lastName;
                res.locals.firstName = reservationModel.purchaser.firstName;
                res.locals.tel = reservationModel.purchaser.tel;
                res.locals.age = reservationModel.purchaser.age;
                res.locals.address = reservationModel.purchaser.address;
                res.locals.gender = reservationModel.purchaser.gender;
                res.locals.email = (!_.isEmpty(email)) ? email : '';
                res.locals.emailConfirm = (!_.isEmpty(email)) ? email.substr(0, email.indexOf('@')) : '';
                res.locals.emailConfirmDomain = (!_.isEmpty(email)) ? email.substr(email.indexOf('@') + 1) : '';
                res.locals.paymentMethod =
                    (!_.isEmpty(reservationModel.paymentMethod)) ? reservationModel.paymentMethod : PAY_TYPE_FREE;
                res.render('staff/reserve/profile', {
                    reservationModel: reservationModel,
                    GMO_ENDPOINT: process.env.GMO_ENDPOINT,
                    GMO_SHOP_ID: process.env.GMO_SHOP_ID,
                    layout: layout
                });
            }
        }
        catch (error) {
            next(new Error(req.__('UnexpectedError')));
        }
    });
}
exports.profile = profile;
/**
 * 予約内容確認
 */
function confirm(req, res, next) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const reservationModel = session_1.default.FIND(req);
            if (reservationModel === null) {
                next(new Error(req.__('Expired')));
                return;
            }
            if (req.method === 'POST') {
                try {
                    // 仮押さえ有効期限チェック
                    if (reservationModel.expiredAt !== undefined && reservationModel.expiredAt < moment().valueOf()) {
                        throw new Error(req.__('Expired'));
                    }
                    // 予約確定
                    yield reserveBaseController.processFixReservations(reservationModel, res);
                    session_1.default.REMOVE(req);
                    res.redirect(`/staff/reserve/${reservationModel.performance.day}/${reservationModel.paymentNo}/complete`);
                }
                catch (error) {
                    session_1.default.REMOVE(req);
                    next(error);
                }
            }
            else {
                const reservations = reserveBaseController.getReservations(reservationModel);
                const ticketInfos = reserveBaseController.getTicketInfos(reservations);
                // 券種ごとの表示情報編集
                Object.keys(ticketInfos).forEach((key) => {
                    const ticketInfo = ticketInfos[key];
                    ticketInfos[key].info =
                        `${ticketInfo.ticket_type_name[res.locale]} ${ticketInfo.charge} × ${res.__('{{n}}Leaf', { n: ticketInfo.count })}`;
                });
                res.render('staff/reserve/confirm', {
                    reservationModel: reservationModel,
                    ticketInfos: ticketInfos,
                    paymentMethodName: paymentMethodNames[reservationModel.paymentMethod],
                    layout: layout
                });
            }
        }
        catch (error) {
            next(new Error(req.__('UnexpectedError')));
        }
    });
}
exports.confirm = confirm;
/**
 * 予約完了
 */
function complete(req, res, next) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const transactionRepo = new ttts.repository.Transaction(ttts.mongoose.connection);
            const transactionDoc = yield transactionRepo.transactionModel.findOne({
                'result.eventReservations.performance_day': req.params.performanceDay,
                'result.eventReservations.payment_no': req.params.paymentNo,
                'result.eventReservations.purchaser_group': PURCHASER_GROUP,
                'result.eventReservations.status': ttts.factory.reservationStatusType.ReservationConfirmed,
                'result.eventReservations.owner': req.staffUser.get('id'),
                'result.eventReservations.purchased_at': {
                    $gt: moment().add(-30, 'minutes').toDate() // tslint:disable-line:no-magic-numbers
                }
            }).exec();
            if (transactionDoc === null) {
                next(new Error(req.__('NotFound')));
                return;
            }
            const transaction = transactionDoc.toObject();
            debug('confirmed transaction:', transaction.id);
            let reservations = transaction.result.eventReservations;
            debug(reservations.length, 'reservation(s) found.');
            reservations = reservations.filter((r) => r.status === ttts.factory.reservationStatusType.ReservationConfirmed);
            if (reservations.length === 0) {
                next(new Error(req.__('NotFound')));
                return;
            }
            reservations.sort((a, b) => ttts.factory.place.screen.sortBySeatCode(a.seat_code, b.seat_code));
            res.render('staff/reserve/complete', {
                reservations: reservations,
                layout: layout
            });
        }
        catch (error) {
            next(new Error(req.__('UnexpectedError')));
        }
    });
}
exports.complete = complete;
