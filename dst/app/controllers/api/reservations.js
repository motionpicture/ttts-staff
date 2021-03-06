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
 * 予約APIコントローラー
 */
const tttsapi = require("@motionpicture/ttts-api-nodejs-client");
const conf = require("config");
const createDebug = require("debug");
const http_status_1 = require("http-status");
const moment = require("moment-timezone");
const _ = require("underscore");
const debug = createDebug('ttts-staff:controllers');
const paymentMethodsForCustomer = conf.get('paymentMethodsForCustomer');
const paymentMethodsForStaff = conf.get('paymentMethodsForStaff');
const FRONTEND_CLIENT_IDS = (typeof process.env.FRONTEND_CLIENT_ID === 'string')
    ? process.env.FRONTEND_CLIENT_ID.split(',')
    : [];
const POS_CLIENT_IDS = (typeof process.env.POS_CLIENT_ID === 'string')
    ? process.env.POS_CLIENT_ID.split(',')
    : [];
const STAFF_CLIENT_IDS = [
    ...(typeof process.env.STAFF_CLIENT_IDS === 'string') ? process.env.STAFF_CLIENT_IDS.split(',') : [],
    ...(typeof process.env.API_CLIENT_ID === 'string') ? [process.env.API_CLIENT_ID] : [],
    ...(typeof process.env.API_CLIENT_ID_OLD === 'string') ? [process.env.API_CLIENT_ID_OLD] : []
];
/**
 * 予約検索
 */
// tslint:disable-next-line:cyclomatic-complexity max-func-body-length
function search(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        // バリデーション
        const errors = {};
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
        const limit = (!_.isEmpty(req.query.limit)) ? parseInt(req.query.limit, 10) : 10;
        // tslint:disable-next-line:no-magic-numbers
        const page = (!_.isEmpty(req.query.page)) ? parseInt(req.query.page, 10) : 1;
        // ご来塔日時
        const day = (!_.isEmpty(req.query.day)) ? req.query.day : null;
        const startHour1 = (!_.isEmpty(req.query.start_hour1)) ? req.query.start_hour1 : null;
        const startMinute1 = (!_.isEmpty(req.query.start_minute1)) ? req.query.start_minute1 : null;
        const startHour2 = (!_.isEmpty(req.query.start_hour2)) ? req.query.start_hour2 : null;
        const startMinute2 = (!_.isEmpty(req.query.start_minute2)) ? req.query.start_minute2 : null;
        // 購入番号
        const paymentNo = (!_.isEmpty(req.query.payment_no)) ? req.query.payment_no : null;
        // アカウント
        const owner = (!_.isEmpty(req.query.owner)) ? req.query.owner : null;
        // 予約方法
        const purchaserGroup = (!_.isEmpty(req.query.purchaser_group)) ? req.query.purchaser_group : null;
        // 決済手段
        const paymentMethod = (!_.isEmpty(req.query.payment_method)) ? req.query.payment_method : null;
        // 名前
        const purchaserLastName = (!_.isEmpty(req.query.purchaser_last_name)) ? req.query.purchaser_last_name : null;
        const purchaserFirstName = (!_.isEmpty(req.query.purchaser_first_name)) ? req.query.purchaser_first_name : null;
        // メアド
        const purchaserEmail = (!_.isEmpty(req.query.purchaser_email)) ? req.query.purchaser_email : null;
        // 電話番号
        const purchaserTel = (!_.isEmpty(req.query.purchaser_tel)) ? req.query.purchaser_tel : null;
        // メモ
        const watcherName = (!_.isEmpty(req.query.watcher_name)) ? req.query.watcher_name : null;
        // 検索条件を作成
        const startTimeFrom = (startHour1 !== null && startMinute1 !== null) ? startHour1 + startMinute1 : null;
        const startTimeTo = (startHour2 !== null && startMinute2 !== null) ? startHour2 + startMinute2 : null;
        let eventStartFrom;
        let eventStartThrough;
        if (day !== null) {
            // tslint:disable-next-line:no-magic-numbers
            const date = `${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6, 8)}`;
            eventStartFrom = moment(`${date}T00:00:00+09:00`).toDate();
            eventStartThrough = moment(eventStartFrom).add(1, 'day').toDate();
            if (startTimeFrom !== null) {
                // tslint:disable-next-line:no-magic-numbers
                eventStartFrom = moment(`${date}T${startTimeFrom.slice(0, 2)}:${startTimeFrom.slice(2, 4)}:00+09:00`)
                    .toDate();
            }
            if (startTimeTo !== null) {
                // tslint:disable-next-line:no-magic-numbers
                eventStartThrough = moment(`${date}T${startTimeTo.slice(0, 2)}:${startTimeTo.slice(2, 4)}:00+09:00`)
                    .add(1, 'second')
                    .toDate();
            }
        }
        const clientIds = [];
        switch (purchaserGroup) {
            case 'Customer':
                clientIds.push(...FRONTEND_CLIENT_IDS);
                break;
            case 'Staff':
                clientIds.push(...STAFF_CLIENT_IDS);
                break;
            case 'POS':
                clientIds.push(...POS_CLIENT_IDS);
                break;
            default:
        }
        const searchConditions = {
            limit: limit,
            page: page,
            sort: {
                'reservationFor.startDate': 1,
                reservationNumber: 1,
                'reservedTicket.ticketType.id': 1,
                'reservedTicket.ticketedSeat.seatNumber': 1
            },
            typeOf: tttsapi.factory.chevre.reservationType.EventReservation,
            reservationStatuses: [tttsapi.factory.chevre.reservationStatusType.ReservationConfirmed],
            reservationFor: {
                startFrom: eventStartFrom,
                startThrough: eventStartThrough
            },
            underName: {
                familyName: (purchaserLastName !== null) ? purchaserLastName : undefined,
                givenName: (purchaserFirstName !== null) ? purchaserFirstName : undefined,
                email: (purchaserEmail !== null) ? purchaserEmail : undefined,
                telephone: (purchaserTel !== null) ? `${purchaserTel}$` : undefined,
                identifier: Object.assign({ $all: [
                        ...(owner !== null) ? [{ name: 'username', value: owner }] : [],
                        ...(paymentMethod !== null) ? [{ name: 'paymentMethod', value: paymentMethod }] : []
                    ], $in: [
                        ...clientIds.map((id) => {
                            return { name: 'clientId', value: id };
                        })
                    ] }, {
                    $elemMatch: (paymentNo !== null)
                        ? { name: 'paymentNo', value: { $regex: toHalfWidth(paymentNo.replace(/\s/g, '')) } }
                        : undefined
                })
            },
            additionalTicketText: (watcherName !== null) ? watcherName : undefined
        };
        debug('searching reservations...', searchConditions);
        const reservationService = new tttsapi.service.Reservation({
            endpoint: process.env.API_ENDPOINT,
            auth: req.tttsAuthClient
        });
        try {
            // 総数検索
            // データ検索(検索→ソート→指定ページ分切取り)
            const searchReservationsResult = yield reservationService.search(searchConditions);
            const count = searchReservationsResult.totalCount;
            debug('reservation count:', count);
            const reservations = searchReservationsResult.data;
            // 0件メッセージセット
            const message = (reservations.length === 0) ?
                '検索結果がありません。予約データが存在しないか、検索条件を見直してください' : '';
            res.json({
                results: addCustomAttributes(reservations),
                count: count,
                errors: null,
                message: message
            });
        }
        catch (error) {
            res.status(http_status_1.INTERNAL_SERVER_ERROR).json({
                errors: [{
                        message: error.message
                    }]
            });
        }
    });
}
exports.search = search;
function addCustomAttributes(reservations) {
    // tslint:disable-next-line:cyclomatic-complexity
    return reservations.map((reservation) => {
        // 決済手段名称追加
        let paymentMethod4reservation = '';
        if (reservation.underName !== undefined && Array.isArray(reservation.underName.identifier)) {
            const paymentMethodProperty = reservation.underName.identifier.find((p) => p.name === 'paymentMethod');
            if (paymentMethodProperty !== undefined) {
                paymentMethod4reservation = paymentMethodProperty.value;
            }
        }
        const underName = reservation.underName;
        let age = '';
        if (reservation.underName !== undefined && Array.isArray(reservation.underName.identifier)) {
            const ageProperty = reservation.underName.identifier.find((p) => p.name === 'age');
            if (ageProperty !== undefined) {
                age = ageProperty.value;
            }
        }
        let clientId = '';
        if (reservation.underName !== undefined && Array.isArray(reservation.underName.identifier)) {
            const clientIdProperty = reservation.underName.identifier.find((p) => p.name === 'clientId');
            if (clientIdProperty !== undefined) {
                clientId = clientIdProperty.value;
            }
        }
        // 購入番号
        let paymentNo = reservation.reservationNumber;
        if (reservation.underName !== undefined && Array.isArray(reservation.underName.identifier)) {
            const paymentNoProperty = reservation.underName.identifier.find((p) => p.name === 'paymentNo');
            if (paymentNoProperty !== undefined) {
                paymentNo = paymentNoProperty.value;
            }
        }
        return Object.assign({}, reservation, { paymentNo: paymentNo, payment_method_name: paymentMethod2name(paymentMethod4reservation), performance: reservation.reservationFor.id, performance_day: moment(reservation.reservationFor.startDate).tz('Asia/Tokyo').format('YYYYMMDD'), performance_start_time: moment(reservation.reservationFor.startDate).tz('Asia/Tokyo').format('HHmm'), performance_end_time: moment(reservation.reservationFor.endDate).tz('Asia/Tokyo').format('HHmm'), performance_canceled: false, ticket_type: reservation.reservedTicket.ticketType.identifier, ticket_type_name: reservation.reservedTicket.ticketType.name, purchaser_group: (STAFF_CLIENT_IDS.indexOf(clientId) >= 0) ? 'Staff' : 'Customer', purchased_at: (reservation.bookingTime !== undefined) ? reservation.bookingTime : reservation.purchased_at, purchaser_name: (underName !== undefined) ? underName.name : '', purchaser_last_name: (underName !== undefined) ? underName.familyName : '', purchaser_first_name: (underName !== undefined) ? underName.givenName : '', purchaser_email: (underName !== undefined) ? underName.email : '', purchaser_tel: (underName !== undefined) ? underName.telephone : '', purchaser_international_tel: '', purchaser_age: age, purchaser_address: (underName !== undefined) ? underName.address : '', purchaser_gender: (underName !== undefined) ? underName.gender : '', watcher_name: reservation.additionalTicketText });
    });
}
/**
 * 全角→半角変換
 */
function toHalfWidth(str) {
    return str.split('').map((value) => {
        // 全角であれば変換
        // tslint:disable-next-line:no-magic-numbers no-irregular-whitespace
        return value.replace(/[！-～]/g, String.fromCharCode(value.charCodeAt(0) - 0xFEE0)).replace('　', ' ');
    }).join('');
}
function paymentMethod2name(method) {
    if (paymentMethodsForCustomer.hasOwnProperty(method)) {
        return paymentMethodsForCustomer[method];
    }
    if (paymentMethodsForStaff.hasOwnProperty(method)) {
        return paymentMethodsForStaff[method];
    }
    return method;
}
/**
 * 両方入力チェック(両方入力、または両方未入力の時true)
 */
function isInputEven(value1, value2) {
    if (_.isEmpty(value1) && _.isEmpty(value2)) {
        return true;
    }
    if (!_.isEmpty(value1) && !_.isEmpty(value2)) {
        return true;
    }
    return false;
}
/**
 * キャンセル実行api
 */
function cancel(req, res, next) {
    return __awaiter(this, void 0, void 0, function* () {
        if (req.staffUser === undefined) {
            next(new Error(req.__('UnexpectedError')));
            return;
        }
        const successIds = [];
        const errorIds = [];
        try {
            const reservationIds = req.body.reservationIds;
            if (!Array.isArray(reservationIds)) {
                throw new Error(req.__('UnexpectedError'));
            }
            const reservationService = new tttsapi.service.Reservation({
                endpoint: process.env.API_ENDPOINT,
                auth: req.tttsAuthClient
            });
            const promises = reservationIds.map((id) => __awaiter(this, void 0, void 0, function* () {
                // 予約データの解放
                try {
                    yield reservationService.cancel({ id: id });
                    successIds.push(id);
                }
                catch (error) {
                    errorIds.push(id);
                }
            }));
            yield Promise.all(promises);
            res.status(http_status_1.NO_CONTENT).end();
        }
        catch (error) {
            res.status(http_status_1.INTERNAL_SERVER_ERROR).json({
                message: error.message,
                successIds: successIds,
                errorIds: errorIds
            });
        }
    });
}
exports.cancel = cancel;
