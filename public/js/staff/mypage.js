/* global moment */
'use strict';
$(function () {
    // POSクライアントID
    var POS_CLIENT_ID = $('input[name="POS_CLIENT_ID"]').val();

    // idごとにまとめた予約ドキュメントリスト
    var reservationsById = {};

    var dom_totalcount = document.getElementById('echo_totalcount');

    // サーマル印刷実行ボタン(58mm)
    $(document).on('click', '.btn-thermalprint', function (e) {
        var id = e.currentTarget.getAttribute('data-targetid');
        window.open('/staff/mypage/print?output=thermal_normal&ids[]=' + id);
    });

    // 厚紙印刷実行ボタン(72mm)
    $(document).on('click', '.btn-widethermalprint', function (e) {
        var id = e.currentTarget.getAttribute('data-targetid');
        window.open('/staff/mypage/print?output=thermal&ids[]=' + id);
    });

    // 日付選択カレンダー (再読込時のために日付はsessionStorageにキープしておく)
    window.flatpickr.localize(window.flatpickr.l10ns.ja);
    var input_day = document.getElementById('input_performancedate');
    var $modal_calender = $('.modal-calender');
    var calendar = new window.flatpickr(input_day, {
        allowInput: true,
        appendTo: $('#calendercontainer').on('click', function (e) { e.stopPropagation(); })[0], // モーダル内コンテナに挿入しつつカレンダークリックでモーダルが閉じるのを防止
        defaultDate: 'today',
        disableMobile: true, // 端末自前の日付選択UIを使わない
        locale: 'ja',
        dateFormat: "Ymd",
        // minDate: moment().add(-3, 'months').toDate(),
        // maxDate: moment().add(3, 'months').toDate(),
        onOpen: function () {
            $modal_calender.fadeIn(200);
        },
        onClose: function () {
            $modal_calender.hide();
        }
    });
    // モーダルを閉じたら中のカレンダーも閉じる
    $modal_calender.click(function () { calendar.close(); });

    // purchaser_groupをキーにした「予約方法」辞書
    var purchaseRoute = {
        'Customer': '一般ネット予約',
        'Staff': '窓口代理予約',
        'Pos': 'POS'
    };

    var conditions = {
        limit: $('.search-form input[name="limit"]').val(),
        page: '1'
    };

    var reservationsIds4cancel = null;

    function showReservations(reservations) {
        var html = '';

        reservations.forEach(function (reservation) {
            // POS注文かどうか
            var orderedAtPOS = (reservation.transaction_agent !== undefined && reservation.transaction_agent.id === POS_CLIENT_ID);
            var transactionAgentName = (orderedAtPOS) ? 'POS' : purchaseRoute[reservation.purchaser_group];
            // とりあえずPOSの決済方法は「---」とする仕様
            var paymentMethodName = (orderedAtPOS) ? '---' : reservation.payment_method_name;

            var startDatetime = reservation.performance_day.substr(0, 4)
                + '/' + reservation.performance_day.substr(4, 2)
                + '/' + reservation.performance_day.substr(6)
                + ' ' + reservation.performance_start_time.substr(0, 2) + ':' + reservation.performance_start_time.substr(2);

            html += ''
                + '<tr data-seat-code="' + reservation.seat_code + '"'
                + ' data-reservation-id="' + reservation.id + '"'
                + ' data-payment-no="' + reservation.payment_no + '"'
                + ' data-purchaser-name="' + reservation.purchaser_last_name + ' ' + reservation.purchaser_first_name + '"'
                + ' data-purchaser-tel="' + reservation.purchaser_tel + '"'
                + ' data-performance-start-datetime="' + startDatetime + '"'
                + ' data-purchased-datetime="' + moment(reservation.purchased_at).format('YYYY/MM/DD HH:mm') + '"'
                + ' data-watcher-name="' + reservation.watcher_name + '"'
                + ' data-ticketname="' + reservation.ticket_type_name.ja + '"'
                + ' data-purchase-route="' + transactionAgentName + '"'
                + ' data-payment-method="' + reservation.payment_method + '"'
                + ' data-checkined="' + ((reservation.checkins.length) ? '入場済み' : '未入場') + '"'
                + '>'
                + '<th class="td-checkbox">';

            if (reservation.payment_no && !reservation.performance_canceled) {
                html += ''
                    + '<input type="checkbox" value="">';
            }
            html += ''
                + '</th>'
                + '<td class="td-number">'
                + '<span class="paymentno">' + reservation.payment_no + '</span><span class="starttime">' + moment(reservation.performance_day + ' ' + reservation.performance_start_time, 'YYYYMMDD HHmm').format('YYYY/MM/DD HH:mm') + '</span></td>'
                + '<td class="td-name">' + reservation.purchaser_last_name + ' ' + reservation.purchaser_first_name + '</td>'
                + '<td class="td-amemo">' + reservation.watcher_name + '</td>'
                + '<td class="td-seat">' + reservation.seat_code + '</td>'
                + '<td class="td-ticket">' + reservation.ticket_type_name.ja + '</td>'
                + '<td class="td-route">' + transactionAgentName + '</td>'
                + '<td class="td-route">' + paymentMethodName + '</td>'
                + '<td class="td-checkin">' + ((reservation.checkins.length) ? '<span class="entered">入場済み</span>' : '<span class="unentered">未入場</span>') + '</td>'
                + '<td class="td-actions">';
            if (reservation.payment_no && !reservation.performance_canceled) {
                html += ''
                    + '<p class="btn call-modal"><span>詳細</span></p>'
                    + '<p class="btn btn-print" data-targetid="' + reservation.id + '"><span>A4チケット印刷</span></p>'
                    + '<p class="btn btn-thermalprint" data-targetid="' + reservation.id + '"><span>サーマル印刷</span></p>'
                    + '<p class="btn btn-widethermalprint" data-targetid="' + reservation.id + '"><span>団体印刷</span></p>';
            }
            html += ''
                + '</td>'
                + '</tr>';
        });

        $('#reservations').html(html);
    }

    /**
     * ページャーを表示する
     * @param {number} count 全件数
     */
    function showPager(count) {
        var html = '';
        var page = parseInt(conditions.page, 10);
        var limit = parseInt(conditions.limit, 10);

        if (page > 1) {
            html += ''
                + '<span><a href="javascript:void(0)" class="change-page" data-page="' + (page - 1) + '">&lt;</a></span>'
                + '<span><a href="javascript:void(0)" class="change-page" data-page="1">最初</a></span>';
        }

        var pages = Math.ceil(count / parseInt(limit, 10));

        for (var i = 0; i < pages; i++) {
            var _page = i + 1;
            if (parseInt(page, 10) === i + 1) {
                html += '<span>' + _page + '</span>';
            } else if (page - 9 < _page && _page < page + 9) {
                html += '<span><a href="javascript:void(0)" class="change-page" data-page="' + _page + '">' + _page + '</a></span>';
            }
        }

        if (parseInt(page, 10) < pages) {
            html += ''
                + '<span><a href="javascript:void(0)" class="change-page" data-page="' + pages + '">最後</a></span>'
                + '<span><a href="javascript:void(0)" class="change-page" data-page="' + (page + 1) + '">&gt;</a></span>';
        }

        $('.navigation').html(html);
    }
    function setConditions() {
        // 検索フォームの値を全て条件に追加
        var formDatas = $('.search-form').serializeArray();
        formDatas.forEach(function (formData) {
            conditions[formData.name] = formData.value;
        });
        // hourだけ選択されていたら00分にする && minuteだけ選択されていたら00時にする
        if (conditions.start_hour1 && !conditions.start_minute1) {
            conditions.start_minute1 = '00';
            document.querySelector('[name=start_minute1]').value = '00';
        } else if (!conditions.start_hour1 && conditions.start_minute1) {
            conditions.start_hour1 = '00';
            document.querySelector('[name=start_hour1]').value = '00';
        }
        if (conditions.start_hour2 && !conditions.start_minute2) {
            conditions.start_minute2 = '00';
            document.querySelector('[name=start_minute2]').value = '00';
        } else if (!conditions.start_hour2 && conditions.start_minute2) {
            conditions.start_hour2 = '00';
            document.querySelector('[name=start_hour2]').value = '00';
        }
    }
    function showConditions() {
        var formDatas = $('.search-form').serializeArray();
        formDatas.forEach(function (formData) {
            var name = formData.name;
            if (conditions.hasOwnProperty(name)) {
                $('input[name="' + name + '"], select[name="' + name + '"]', $('.search-form')).val(conditions[name]);
            } else {
                $('input[name="' + name + '"], select[name="' + name + '"]', $('.search-form')).val('');
            }
        });
    }

    var dom_searchmsg = document.getElementById('echo_searchmsg');
    function search() {
        conditions.day = conditions.day.replace(/\-/g, '');
        conditions.searched_at = Date.now(); // ブラウザキャッシュ対策
        $('.error-message').hide();

        $.ajax({
            dataType: 'json',
            url: $('.search-form').attr('action'),
            type: 'GET',
            data: conditions,
            beforeSend: function () {
                $('.loading').modal();
                $('.wrapper-reservations input[type="checkbox"]').prop('checked', false);
            }
        }).done(function (data) {
            // データ表示
            var message = (typeof data.message === 'string' && data.message.length) ? data.message : '';
            if (!Array.isArray(data.results)) {
                message = '検索APIが異常なレスポンスを返しました (data.resultsが配列でない)';
            }
            dom_searchmsg.innerText = message;
            dom_searchmsg.style.display = (message) ? 'block' : 'none';
            dom_totalcount.innerHTML = data.count + '件';

            if (!data.results) {
                return false;
            }

            data.results.forEach(function (reservation) {
                reservationsById[reservation.id] = reservation;
            });
            showReservations(data.results);
            showPager(parseInt(data.count, 10));
            showConditions();
        }).fail(function (jqxhr, textStatus, error) {
            // エラーメッセージ表示
            try {
                var res = $.parseJSON(jqxhr.responseText);
                if (res.errors) {
                    for (var err in res.errors) {
                        if (err) {
                            $('[name="error_' + error + '"]').text(res.errors[err].message);
                        }
                    }
                    $('.error-message').show();
                }
            } catch (e) {
                // no op
            }
            console.log(error);
        }).always(function () {
            $('.loading').modal('hide');
        });
    }

    //ポップアップを表示
    function cancel(reservationsIds) {
        var modal_show_list = document.getElementById('modal_show_list');
        var tempHTML = reservationsIds.map(function (id) {
            return '<h3>' + reservationsById[id].payment_no + ' ' + reservationsById[id].seat_code + ' ' + reservationsById[id].ticket_type_name.ja + '</h3>';
        }).join('\n');
        reservationsIds4cancel = reservationsIds;
        document.getElementById('echo_showlist').innerHTML = tempHTML;
        $(modal_detail).modal('hide');
        $(modal_show_list).modal();
    }

    // 指定した予約のキャンセル処理
    $(document).on('click', '.btn-modal-show-list', function (e) {
        var modal_show_list = document.getElementById('modal_show_list');
        $(modal_show_list).modal('hide');

        setTimeout(function() {
            if (!confirm('キャンセルをした予約は復元できませんが本当に実行しますか？')) {
                return false;
            }
    
            $.ajax({
                dataType: 'json',
                url: $('input[name="urlCancel"]').val(),
                type: 'POST',
                data: {
                    reservationIds: reservationsIds4cancel
                },
                beforeSend: function () {
                    $('#modal_detail').modal('hide');
                }
            }).done(function (data) {
                console.log('[succeeded] cancelReservation', data);
                var tempHTML = '';
                reservationsIds4cancel.forEach(function (id) {
                    tempHTML += '<h3><span>購入番号:</span>' + reservationsById[id].payment_no + '<span>座席 / 券種:</span>' + reservationsById[id].seat_code + '/' + reservationsById[id].ticket_type_name.ja + '</h3>';
                });
                document.getElementById('echo_canceledreservations').innerHTML = tempHTML;
                $('#modal_cancelcompleted').modal();
            }).fail(function (jqxhr, textStatus, error) {
                alert(error);
            }).always(function () {});
        }, 500);
    });

    // キャンセル完了モーダルの閉じるボタンで再検索 (※キャンセル完了のモーダルが出たままsearchするとモーダルが衝突してしまう)
    document.getElementById('btn_cancelcompleted').onclick = function () {
        search();
        $('html, body').animate({ scrollTop: dom_totalcount.offsetTop }, 200);
    };

    // 検索
    $(document).on('click', '.search-form .btn', function () {
        conditions.page = '1';
        // 画面から検索条件セット
        setConditions();
        search();
    });

    // 検索条件リセットボタン
    document.getElementById('btn_clearconditions').onclick = function () {
        calendar.setDate(new Date())

        $('select[name="start_hour1"]').val('').prop('selected', true)
        $('select[name="start_minute1"]').val('').prop('selected', true)
        $('select[name="start_hour2"]').val('').prop('selected', true)
        $('select[name="start_minute2"]').val('').prop('selected', true)

        $('input[name="payment_no"]').val('')
        $('select[name="purchaser_group"]').val('')
        $('select[name="owner"]').val('')
        $('select[name="payment_method"]').val('')

        $('input[name="purchaser_last_name"]').val('')
        $('input[name="purchaser_first_name"]').val('')
        $('input[name="purchaser_email"]').val('')
        $('input[name="purchaser_tel"]').val('')
        $('input[name="watcher_name"]').val('')

        conditions.page = '1';
        setConditions();
        search();
    };

    // ページ変更
    $(document).on('click', '.change-page', function () {
        conditions.page = $(this).attr('data-page');
        search();
        $('html, body').animate({ scrollTop: dom_totalcount.offsetTop }, 200);
    });

    // A4印刷
    $(document).on('click', '.btn-print', function (e) {
        var id = e.currentTarget.getAttribute('data-targetid');
        window.open('/staff/mypage/print?output=a4&ids[]=' + id);
        console.log('/staff/mypage/print?output=a4&ids[]=' + id);
    });

    // 予約詳細モーダル呼び出し
    $(document).on('click', '.call-modal', function () {
        var modal_detail = document.getElementById('modal_detail');
        var reservationNode = this.parentNode.parentNode;
        var id = reservationNode.getAttribute('data-reservation-id');
        document.getElementById('echo_detailmodal__payment_no').innerHTML = reservationNode.getAttribute('data-payment-no');
        document.getElementById('echo_detailmodal__purchaserinfo').innerHTML = reservationNode.getAttribute('data-purchaser-name') + ' / ' + reservationNode.getAttribute('data-purchaser-tel');
        document.getElementById('echo_detailmodal__date').innerHTML = reservationNode.getAttribute('data-purchased-datetime') + ' / ' + reservationNode.getAttribute('data-performance-start-datetime');
        document.getElementById('echo_detailmodal__info').innerHTML = reservationNode.getAttribute('data-seat-code') + ' / ' + reservationNode.getAttribute('data-ticketname') + ' / ' + reservationNode.getAttribute('data-watcher-name');
        document.getElementById('echo_detailmodal__purchaseinfo').innerHTML = reservationNode.getAttribute('data-purchase-route') + ' / ' + reservationNode.getAttribute('data-payment-method') + ' / ' + reservationNode.getAttribute('data-checkined');
        modal_detail.querySelector('.btn-print').setAttribute('data-targetid', id);
        modal_detail.querySelector('.btn-thermalprint').setAttribute('data-targetid', id);
        modal_detail.querySelector('.btn-widethermalprint').setAttribute('data-targetid', id);
        modal_detail.querySelector('.btn-cancelrsrv').onclick = function () { cancel([id]); };
        $(modal_detail).modal();
    });

    // 配布先更新
    $(document).on('click', '.update-watcher-name', function () {
        var reservationId = $(this).parent().parent().parent().attr('data-reservation-id');
        var watcherName = $('input', $(this).parent().parent()).val();

        $.ajax({
            dataType: 'json',
            url: $('input[name="urlUpdateWatcherName"]').val(),
            type: 'POST',
            data: {
                reservationId: reservationId,
                watcherName: watcherName
            },
            beforeSend: function () {
            }
        }).done(function (data) {
            console.log('[succeeded] updateWatcherName', data);
            search();
        }).fail(function (jqxhr, textStatus, error) {
            alert('Failed Updating.');
            console.log(error);
        }).always(function () {
        });
    });

    // まとめて操作
    $(document).on('click', '.action-to-reservations', function () {
        var ids = $('.td-checkbox input[type="checkbox"]:checked').map(function () {
            return this.parentNode.parentNode.getAttribute('data-reservation-id');
        }).get();
        if (!ids.length) {
            return alert('対象にする予約が選択されていません');
        }

        var action = document.getElementById('select_action').value;
        if (action === 'cancel') {
            cancel(ids);
        } else if (action === 'print') {
            window.open('/staff/mypage/print?output=a4&' + ids.map(function (id) { return 'ids[]=' + id; }).join('&'));
        } else if (action === 'thermalprint') {
            window.open('/staff/mypage/print?output=thermal_normal&' + ids.map(function (id) { return 'ids[]=' + id; }).join('&'));
        } else if (action === 'widethermalprint') {
            window.open('/staff/mypage/print?output=thermal&' + ids.map(function (id) { return 'ids[]=' + id; }).join('&'));
        } else {
            alert('操作を選択してください');
        }
    });

    // 全てチェックする
    $(document).on('click', '.check-all', function () {
        $('.td-checkbox input[type="checkbox"]').prop('checked', this.checked);
    });

    // エラー表示クリア
    $('.error-message').hide();
    // 画面から検索条件セット
    setConditions();
    // 予約リスト表示
    search();
});
