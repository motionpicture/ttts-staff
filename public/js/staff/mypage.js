$(function () {
    var locale = $('html').attr('lang');
    var userId = $('input[name="userId"]').val(); // 内部関係者ユーザーID
    // 購入番号ごとにまとめた予約ドキュメントリスト
    var reservations = [];
    var conditions = {
        limit: $('.search-form input[name="limit"]').val(),
        page: '1'
    };

    function showReservations() {
        var html = '';

        reservations.forEach(function (reservation) {
            var startDatetime = reservation.performance_day.substr(0, 4)
                + '/' + reservation.performance_day.substr(4, 2)
                + '/' + reservation.performance_day.substr(6)
                + ' ' + reservation.performance_start_time.substr(0, 2) + ':' + reservation.performance_start_time.substr(2);
            html += ''
                + '<tr data-seat-code="' + reservation.seat_code + '"'
                + ' data-reservation-id="' + reservation._id + '"'
                + ' data-payment-no="' + ((reservation.payment_no) ? reservation.payment_no : '') + '"'
                + ' data-film-name="' + reservation['film_name'][locale] + '"'
                + ' data-performance-start-datetime="' + startDatetime + '"'
                + ' data-theater-name="' + reservation['theater_name'][locale] + '"'
                + ' data-screen-name="' + reservation['screen_name'][locale] + '"'
                + '>'
                + '<th class="td-checkbox">';

            if (reservation.payment_no && !reservation.performance_canceled) {
                html += ''
                    + '<input type="checkbox" value="">';
            }

            html += ''
                + '</th>'
                + '<td class="td-number">' + ((reservation.payment_no) ? reservation.payment_no : '') + '</td>'
                + '<td class="td-name">' + reservation.purchaser_last_name + ' ' + reservation.purchaser_first_name + '</td>'
                + '<td class="td-amemo">' + reservation.watcher_name + '</td>'
                + '<td class="td-seat">' + reservation.seat_code + '</td>'
                + '<td class="td-updater">' + reservation['ticket_type_name'][locale] + '</td>';

            // // TTTS確保でなければ配布先更新フォームを表示
            // if (reservation.payment_no && !reservation.performance_canceled) {
            //     html += ''
            //         + '<div class="form-group">'
            //         + '<input class="form-control" type="text" value="' + ((reservation.watcher_name) ? reservation.watcher_name : '') + '">'
            //         + '</div>'
            //         + '<div class="form-group">'
            //         + '<p class="btn update-watcher-name"><span>Update</span></p>'
            //         + '</div>'
            //         + '<p class="small">'
            //         + '※日本人の場合は「全角カタカナ」外国人の場合は「半角英字」で入力してください。<br>※セイとメイの間に半角スペースを入れないでください。'
            //         + '<br>* Use full-width katakana for the Japanese names and in half-width alphanumeric characters for foreign names.<br>* Do not leave a half-width space between the last name and the first name.'
            //         + '</p>';
            //}

            html += ''
                + '</td>'
                + '<td class="td-actions">'

            if (userId === 'motionpicture') {
                html += ''
                    + '<p class="btn print"><span>Print</span></p>';
            } else {
                if (reservation.payment_no && !reservation.performance_canceled) {
                    html += ''
                        + '<p class="btn detail"><span>Detail</span></p>'
                        + '<p class="btn print" style="margin-bottom: 12px;"><span>Print</span></p>'
                        + '<p class="btn confirm-cancel"><span>Cancel</span></p>'
                }
            }

            html += ''
                + '</td>'
                + '</tr>';
        });

        $('#reservations').html(html);
    }

    /**
     * ページャーを表示する
     * 
     * @param {number} count 全件数
     */
    function showPager(count) {
        var html = '';
        var page = parseInt(conditions.page);
        var limit = parseInt(conditions.limit);

        if (page > 1) {
            html += ''
                + '<span><a href="javascript:void(0)" class="change-page" data-page="' + (page - 1) + '">&lt;</a></span>'
                + '<span><a href="javascript:void(0)" class="change-page" data-page="1">最初</a></span>'
                ;
        }

        pages = Math.ceil(count / parseInt(limit));

        for (var i = 0; i < pages; i++) {
            var _page = i + 1;
            if (parseInt(page) === i + 1) {
                html += '<span>' + _page + '</span>';
            } else {
                if (page - 9 < _page && _page < page + 9) {
                    html += '<span><a href="javascript:void(0)" class="change-page" data-page="' + _page + '">' + _page + '</a></span>';
                }
            }
        }

        if (parseInt(page) < pages) {
            html += ''
                + '<span><a href="javascript:void(0)" class="change-page" data-page="' + pages + '">最後</a></span>'
                + '<span><a href="javascript:void(0)" class="change-page" data-page="' + (page + 1) + '">&gt;</a></span>';
        }

        $('.navigation').html(html);
    }
    function setConditions() {
        // 検索フォームの値を全て条件に追加
        var formDatas = $('.search-form').serializeArray();
        formDatas.forEach(function (formData, index) {
            conditions[formData.name] = formData.value;
        });
    }
    function showConditions() {
        var formDatas = $('.search-form').serializeArray();
        formDatas.forEach(function (formData, index) {
            var name = formData.name;
            if (conditions.hasOwnProperty(name)) {
                $('input[name="' + name + '"], select[name="' + name + '"]', $('.search-form')).val(conditions[name]);
            } else {
                $('input[name="' + name + '"], select[name="' + name + '"]', $('.search-form')).val('');
            }
        });
    }

    function search() {
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
            // エラーメッセージ表示
            if (data.errors) {
                for (error in data.errors) {
                    $('[name="error_' + error + '"]').text(data.errors[error].msg);
                }
                $('.error-message').show();
            }
            // データ表示
            if (data.success) {
                reservations = data.results;

                showReservations();
                showPager(parseInt(data.count));
                showConditions();
                $('.total-count').text(data.count);

            } else {
            }
        }).fail(function (jqxhr, textStatus, error) {
        }).always(function () {
            $('.loading').modal('hide');
        });
    }

    // 検索
    $(document).on('click', '.search-form .btn', function () {
        conditions.page = '1';
        // 画面から検索条件セット
        setConditions();
        search();
    });

    // ページ変更
    $(document).on('click', '.change-page', function () {
        conditions.page = $(this).attr('data-page');
        search();
    });

    // 印刷
    $(document).on('click', '.print', function () {
        var ids = [$(this).parent().parent().attr('data-reservation-id')];
        window.open('/reserve/print?ids=' + JSON.stringify(ids));
    });

    // キャンセルしようとしている予約IDリスト
    var reservationsIds4cancel = [];

    // キャンセル確認
    $(document).on('click', '.confirm-cancel', function () {
        var reservationNode = $(this).parent().parent();

        reservationsIds4cancel = [reservationNode.attr('data-reservation-id')];

        var body;
        if (locale === 'ja') {
            body = '<tr><th>購入番号:</th><td>' + reservationNode.attr('data-payment-no') + '</td></tr>'
                + '<tr><th>タイトル:</th><td>' + reservationNode.attr('data-film-name') + '</td></tr>'
                + '<tr><th>上映時間/場所:</th><td>'
                + reservationNode.attr('data-performance-start-datetime') + '-'
                + ' ' + reservationNode.attr('data-theater-name')
                + ' ' + reservationNode.attr('data-screen-name')
                + '</td></tr>'
                + '<tr><th>座席</th><td>' + reservationNode.attr('data-seat-code') + '</td></tr>';
        } else {
            body = '<tr><th>Transaction number:</th><td>' + reservationNode.attr('data-payment-no') + '</td></tr>'
                + '<tr><th>Title:</th><td>' + reservationNode.attr('data-film-name') + '</td></tr>'
                + '<tr><th>Date/Location:</th><td>'
                + reservationNode.attr('data-performance-start-datetime') + '-'
                + ' ' + reservationNode.attr('data-theater-name')
                + ' ' + reservationNode.attr('data-screen-name')
                + '</td></tr>'
                + '<tr><th>Seat</th><td>' + reservationNode.attr('data-seat-code') + '</td></tr>';
        }

        $('.cancel-reservation-confirm .table-reservation-confirm').html(body);
        $('.cancel-reservation-confirm .message').html($('input[name="messageAreYouSureCancel"]').val());
        $('.cancel-reservation-confirm').modal();
    });

    // キャンセル実行
    $(document).on('click', '.execute-cancel', function () {
        $.ajax({
            dataType: 'json',
            url: $('input[name="urlCancel"]').val(),
            type: 'POST',
            data: {
                reservationIds: JSON.stringify(reservationsIds4cancel)
            },
            beforeSend: function () {
                $('.cancel-reservation-confirm').modal('hide');
            }
        }).done(function (data) {
            if (data.success) {
                // 再検索
                search();

                $('.cancel-reservation-complete').modal();
            } else {
                alert('Failed canceling.');
            }
        }).fail(function (jqxhr, textStatus, error) {
        }).always(function () {
        });
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
                watcherName: watcherName,
            },
            beforeSend: function () {
            }
        }).done(function (data) {
            if (data.success) {
                // 再検索
                search();

            } else {
                alert('Failed Updating.');
            }
        }).fail(function (jqxhr, textStatus, error) {
        }).always(function () {
        });
    });

    // まとめて操作
    $(document).on('click', '.action-to-reservations', function () {
        var action = $('select[name="action"]').val();

        if (action === 'cancel') {
            reservationsIds4cancel = [];
            var _seatCodes = [];

            // チェック予約リストを取得
            $('.td-checkbox input[type="checkbox"]:checked').each(function () {
                var reservationId = $(this).parent().parent().attr('data-reservation-id');
                var seatCode = $(this).parent().parent().attr('data-seat-code');

                if (reservationId) {
                    reservationsIds4cancel.push(reservationId);
                    _seatCodes.push(seatCode);
                }
            });

            if (reservationsIds4cancel.length < 1) {
                alert('Select reservations.');
            } else {
                // 確認モーダル表示
                $('.cancel-reservation-confirm .table-reservation-confirm').html('');
                $('.cancel-reservation-confirm .message').html($('input[name="messageConfirmCancelSelectedTickets"]').val());
                $('.cancel-reservation-confirm').modal();
            }

        } else if (action === 'print') {
            var ids = $('.td-checkbox input[type="checkbox"]:checked').map(function () {
                return $(this).parent().parent().attr('data-reservation-id');
            }).get();

            if (ids.length < 1) {
                return alert('Select reservations.');
            }

            window.open('/reserve/print?ids=' + JSON.stringify(ids));
        } else {
            alert('Select Your Action.');
        }
    });

    // 全てチェックする
    $(document).on('click', '.check-all', function () {
        $('.td-checkbox input[type="checkbox"]').prop('checked', $(this).is(':checked'));
    });

    // エラー表示クリア
    $('.error-message').hide();
    // 画面から検索条件セット
    setConditions();
    // 予約リスト表示
    search();
});
