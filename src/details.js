import './jquery.js';

var cururl = null;

var target = null;
var port = null;
var progress = 0; //the reading progress in one chapter
var reconnected = false;
var rTitle = null;
var flist = [];
var clist = [];
var tlist = [];
var plist = [];
var nlist = [];
var dir = true;
var twocolumn = false;
var rjs = null;
var lastY = 0;
var sumDelta = 0;
var scrollCnt = 0;

var bklist = [];
var readingTimeList = [];
var css = null;
var fontfamily = '';
var detectedSystemFontMap = {};
var confirmResolver = null;
var READER_FONT_DEFAULT_VALUE = '__embedded__';
var READER_FONT_CUSTOM_VALUE = '__custom__';
var globalWheelBound = false;
var XMNOTE_SYNC_CONFIG_KEY = 'xmnoteSyncConfig';
var XMNOTE_DEFAULT_ENDPOINT = '127.0.0.1:8080';
var xmnoteSyncConfig = { endpoint: XMNOTE_DEFAULT_ENDPOINT };
var currentSyncBookRows = [];

var FONT_CANDIDATES = [
    { label: '默认（内嵌字体）', value: READER_FONT_DEFAULT_VALUE },
    { label: '自定义输入', value: READER_FONT_CUSTOM_VALUE },
    { label: '微软雅黑 (Microsoft YaHei)', value: 'Microsoft YaHei, 微软雅黑', probes: ['Microsoft YaHei', '微软雅黑'] },
    { label: '宋体 (SimSun)', value: 'SimSun, 宋体', probes: ['SimSun', '宋体'] },
    { label: '黑体 (SimHei)', value: 'SimHei, 黑体', probes: ['SimHei', '黑体'] },
    { label: '楷体 (KaiTi)', value: 'KaiTi, 楷体', probes: ['KaiTi', '楷体'] },
    { label: '仿宋 (FangSong)', value: 'FangSong, 仿宋', probes: ['FangSong', '仿宋'] },
    { label: '等线 (DengXian)', value: 'DengXian, 等线', probes: ['DengXian', '等线'] },
    { label: '苹方 (PingFang SC)', value: 'PingFang SC, 苹方', probes: ['PingFang SC', '苹方'] },
    { label: '华文宋体 (STSong)', value: 'STSong, 华文宋体', probes: ['STSong', '华文宋体'] },
    { label: '华文仿宋 (STFangsong)', value: 'STFangsong, 华文仿宋', probes: ['STFangsong', '华文仿宋'] },
    { label: '华文楷体 (STKaiti)', value: 'STKaiti, 华文楷体', probes: ['STKaiti', '华文楷体'] },
    { label: '思源黑体 (Source Han Sans SC)', value: 'Source Han Sans SC, Noto Sans CJK SC', probes: ['Source Han Sans SC', 'Noto Sans CJK SC'] },
    { label: '思源宋体 (Source Han Serif SC)', value: 'Source Han Serif SC, Noto Serif CJK SC', probes: ['Source Han Serif SC', 'Noto Serif CJK SC'] },
    { label: '文泉驿微米黑', value: 'WenQuanYi Micro Hei', probes: ['WenQuanYi Micro Hei'] },
    { label: 'Segoe UI', value: 'Segoe UI', probes: ['Segoe UI'] },
    { label: 'Arial', value: 'Arial', probes: ['Arial'] },
    { label: 'Helvetica Neue', value: 'Helvetica Neue, Helvetica', probes: ['Helvetica Neue', 'Helvetica'] },
    { label: 'Verdana', value: 'Verdana', probes: ['Verdana'] },
    { label: 'Tahoma', value: 'Tahoma', probes: ['Tahoma'] },
    { label: 'Georgia', value: 'Georgia', probes: ['Georgia'] },
    { label: 'Times New Roman', value: 'Times New Roman', probes: ['Times New Roman'] },
    { label: 'Cambria', value: 'Cambria', probes: ['Cambria'] },
    { label: 'Garamond', value: 'Garamond', probes: ['Garamond'] },
    { label: 'Palatino', value: 'Palatino', probes: ['Palatino'] },
    { label: 'Baskerville', value: 'Baskerville', probes: ['Baskerville'] }
];

function isSystemFontAvailable(fontName) {
    var baseFonts = ['monospace', 'sans-serif', 'serif'];
    var testStrings = ['mmmmmmmmmwwwwwiiiiii@@##', '汉字测试閱讀排版字体'];
    var testSize = '72px';
    var canvas = document.createElement('canvas');
    var context = canvas.getContext('2d');
    if (!context) {
        return false;
    }

    var baseline = {};
    for (var i = 0; i < baseFonts.length; i++) {
        baseline[baseFonts[i]] = [];
        for (var t = 0; t < testStrings.length; t++) {
            context.font = testSize + ' ' + baseFonts[i];
            baseline[baseFonts[i]].push(context.measureText(testStrings[t]).width);
        }
    }

    for (var j = 0; j < baseFonts.length; j++) {
        var base = baseFonts[j];
        for (var k = 0; k < testStrings.length; k++) {
            context.font = testSize + ' "' + fontName + '",' + base;
            var width = context.measureText(testStrings[k]).width;
            if (Math.abs(width - baseline[base][k]) > 0.1) {
                return true;
            }
        }
    }
    return false;
}

function detectSystemFonts() {
    var map = {};
    for (var i = 0; i < FONT_CANDIDATES.length; i++) {
        var candidate = FONT_CANDIDATES[i];
        if (candidate.value === READER_FONT_DEFAULT_VALUE) {
            map[candidate.value] = true;
            continue;
        }
        if (candidate.value === READER_FONT_CUSTOM_VALUE) {
            map[candidate.value] = true;
            continue;
        }
        var probes = candidate.probes || [candidate.value.split(',')[0].trim()];
        var available = false;
        for (var p = 0; p < probes.length; p++) {
            if (isSystemFontAvailable(probes[p])) {
                available = true;
                break;
            }
        }
        map[candidate.value] = available;
    }
    return map;
}

function renderFontFamilyOptions(selectedFontFamily) {
    var $select = $('#fontfamily');
    if ($select.length === 0) {
        return;
    }

    var list = FONT_CANDIDATES.slice().sort(function (a, b) {
        var ad = detectedSystemFontMap[a.value] ? 1 : 0;
        var bd = detectedSystemFontMap[b.value] ? 1 : 0;
        return bd - ad;
    });

    var isPreset = list.some(function (it) { return it.value === selectedFontFamily; });
    var isCustomValue = !!selectedFontFamily && !isPreset;
    if (isCustomValue) {
        list.unshift({ label: '自定义: ' + selectedFontFamily, value: READER_FONT_CUSTOM_VALUE, probes: [selectedFontFamily] });
    }

    var options = [];
    for (var i = 0; i < list.length; i++) {
        var item = list[i];
        var available = !!detectedSystemFontMap[item.value];
        var isSpecial = item.value === READER_FONT_DEFAULT_VALUE || item.value === READER_FONT_CUSTOM_VALUE;
        var suffix = (!isSpecial && item.value && !available) ? '（未检测到）' : '';
        var escapedValue = (item.value || '').replace(/"/g, '&quot;');
        var escapedLabel = (item.label || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        options.push('<option value="' + escapedValue + '">' + escapedLabel + suffix + '</option>');
    }
    $select.html(options.join(''));

    if (isCustomValue) {
        $select.val(READER_FONT_CUSTOM_VALUE);
        $('#fontfamily-custom').val(selectedFontFamily);
    } else {
        $select.val(selectedFontFamily || READER_FONT_DEFAULT_VALUE);
        $('#fontfamily-custom').val('');
    }
}

function ensureFeedbackUi() {
    if ($('#ui-toast-host').length === 0) {
        $('body').append('<div id="ui-toast-host" class="ui-toast-host" aria-live="polite" aria-atomic="true"></div>');
    }

    if ($('#ui-dialog-backdrop').length === 0) {
        var dialogHtml = '' +
            '<div id="ui-dialog-backdrop" class="ui-dialog-backdrop" aria-hidden="true">' +
            '  <div class="ui-dialog" role="dialog" aria-modal="true" aria-labelledby="ui-dialog-title">' +
            '    <div class="ui-dialog-title" id="ui-dialog-title">请确认</div>' +
            '    <div class="ui-dialog-message" id="ui-dialog-message"></div>' +
            '    <div class="ui-dialog-actions">' +
            '      <button type="button" id="ui-dialog-cancel" class="btn btn-ghost">取消</button>' +
            '      <button type="button" id="ui-dialog-ok" class="btn btn-primary">确认</button>' +
            '    </div>' +
            '  </div>' +
            '</div>';
        $('body').append(dialogHtml);
    }

    $('#ui-dialog-cancel').off('click.ui').on('click.ui', function () {
        closeConfirmDialog(false);
    });
    $('#ui-dialog-ok').off('click.ui').on('click.ui', function () {
        closeConfirmDialog(true);
    });
    $('#ui-dialog-backdrop').off('click.ui').on('click.ui', function (e) {
        if (e.target.id === 'ui-dialog-backdrop') {
            closeConfirmDialog(false);
        }
    });
}

function showToast(message, type = 'success', duration = 3000) {
    ensureFeedbackUi();
    var $host = $('#ui-toast-host');
    var $toast = $('<div class="ui-toast"></div>');
    $toast.addClass('ui-toast-' + type).text(message);
    $host.append($toast);

    requestAnimationFrame(function () {
        $toast.addClass('show');
    });

    setTimeout(function () {
        $toast.removeClass('show');
        setTimeout(function () {
            $toast.remove();
        }, 200);
    }, duration);
}

function closeConfirmDialog(result) {
    var $backdrop = $('#ui-dialog-backdrop');
    $backdrop.removeClass('show').attr('aria-hidden', 'true');
    if (confirmResolver) {
        var resolver = confirmResolver;
        confirmResolver = null;
        resolver(result);
    }
}

function showConfirmDialog(message, title = '请确认') {
    ensureFeedbackUi();

    if (confirmResolver) {
        closeConfirmDialog(false);
    }

    $('#ui-dialog-title').text(title);
    $('#ui-dialog-message').text(message);
    $('#ui-dialog-backdrop').addClass('show').attr('aria-hidden', 'false');

    return new Promise(function (resolve) {
        confirmResolver = resolve;
        setTimeout(function () {
            $('#ui-dialog-ok').trigger('focus');
        }, 0);
    });
}

function normalizeWheelDelta(event) {
    var deltaY = event.deltaY || 0;
    // 0: pixels, 1: lines, 2: pages
    if (event.deltaMode === 1) {
        return deltaY * 16;
    }
    if (event.deltaMode === 2) {
        return deltaY * window.innerHeight;
    }
    return deltaY;
}

function bindGlobalWheelToContainer() {
    if (globalWheelBound) {
        return;
    }
    var container = document.getElementById('scroll-container');
    if (!container) {
        return;
    }

    window.addEventListener('wheel', function (event) {
        if (!container || container.contains(event.target)) {
            return;
        }

        event.preventDefault();
        container.scrollTop += normalizeWheelDelta(event);
    }, { passive: false });

    globalWheelBound = true;
}

function connectToBackground() {
    try {
        port = chrome.runtime.connect({ name: "detailspage" });
        if (chrome.runtime.lastError) {
            console.warn("details connectToBackground: runtime.lastError", chrome.runtime.lastError.message);
            port = null;
        }
    } catch (error) {
        console.warn("details connectToBackground: connect failed", error.message);
        port = null;
    }

    if (!port) {
        console.info("details connectToBackground: port null, retrying in 100ms...");
        setTimeout(connectToBackground, 100);
        return;
    }

    // Main function (Should be used recursively)
    port.onMessage.addListener(function (msg) {
        console.log(msg);
        //Log Print
        if (msg.type == 'cfg') {
            flist = msg.flist;
            clist = msg.clist;
            tlist = msg.tlist;
            plist = msg.plist;
            nlist = msg.nlist;
            dir = msg.dir;
            twocolumn = msg.twocolumn;
            rjs = msg.js;
        };
        if (msg.type == "go") {
            if (msg.progress != null) {
                progress = msg.progress;
                handlePage(progress);
            } else {
                handlePage(0);
            }
        };
        if (msg.type == "action") {
            if (msg.content == 'refresh')
                refreshDetailsPage();
        };
    });

    // 监听断开连接事件
    port.onDisconnect.addListener(() => {
        console.info("Disconnected from background script. Reconnecting...");
        // 尝试重新连接
        reconnected = true;
        setTimeout(connectToBackground, 10); // 等待 0.01 秒后重连
    });
}

//Connect port
connectToBackground();

$(document).ready(function () {
    detectedSystemFontMap = detectSystemFonts();
    refreshDetailsPage();
    bindGlobalWheelToContainer();

    var openSection = null;
    try {
        openSection = new URLSearchParams(window.location.search).get('openSection');
    } catch (e) {
        openSection = null;
    }
    if (openSection) {
        setTimeout(function () {
            openSectionCard(openSection);
        }, 30);
    }

    // Version Update
    // Get the manifest object
    const manifest = chrome.runtime.getManifest();

    // Access the manifest version
    const manifestVersion = manifest.version;
    $('#verid').html(manifestVersion);
});

function openSectionCard(toggleTarget) {
    if (!toggleTarget) {
        return false;
    }

    var selector = '.section-card[toggle_target="' + toggleTarget + '"]';
    var $targetCard = $(selector).eq(0);
    if ($targetCard.length === 0) {
        return false;
    }

    var $allCards = $('.section-card');
    $allCards.each(function () {
        var $card = $(this);
        var $body = $card.find('.section-body').eq(0);
        var $header = $card.find('.section-header').eq(0);
        var $arrow = $header.find('.section-arrow').eq(0);

        if ($card.is($targetCard)) {
            return;
        }

        $body.stop(true, true).hide().removeClass('is-open');
        $header.removeClass('is-open');
        $arrow.removeClass('is-open');
    });

    var $targetBody = $targetCard.find('.section-body').eq(0);
    var $targetHeader = $targetCard.find('.section-header').eq(0);
    var $targetArrow = $targetHeader.find('.section-arrow').eq(0);

    $targetBody.stop(true, true).show().addClass('is-open');
    $targetHeader.addClass('is-open');
    $targetArrow.addClass('is-open');

    var element = $targetCard.get(0);
    if (element && typeof element.scrollIntoView === 'function') {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    return true;
}

function getBookmarksFromDb() {
    return new Promise(function (resolve) {
        chrome.runtime.sendMessage({ type: 'bookmarksGetAll' }, function (response) {
            if (chrome.runtime.lastError) {
                console.warn('getBookmarksFromDb failed:', chrome.runtime.lastError.message);
                resolve([]);
                return;
            }
            if (!response || !response.ok || !Array.isArray(response.bookmarks)) {
                resolve([]);
                return;
            }
            resolve(response.bookmarks);
        });
    });
}

function getReadingTimeRecordsFromDb() {
    return new Promise(function (resolve) {
        chrome.runtime.sendMessage({ type: 'readingTimeGetAll' }, function (response) {
            if (chrome.runtime.lastError) {
                console.warn('getReadingTimeRecordsFromDb failed:', chrome.runtime.lastError.message);
                resolve([]);
                return;
            }
            if (!response || !response.ok || !Array.isArray(response.readingTime)) {
                resolve([]);
                return;
            }
            resolve(response.readingTime);
        });
    });
}

function getXmnoteSyncConfigFromStorage() {
    return new Promise(function (resolve) {
        chrome.storage.local.get({ xmnoteSyncConfig: { endpoint: XMNOTE_DEFAULT_ENDPOINT } }, function (result) {
            var raw = (result && result.xmnoteSyncConfig) || {};
            var endpoint = (raw.endpoint || XMNOTE_DEFAULT_ENDPOINT);
            resolve({ endpoint: String(endpoint).trim() || XMNOTE_DEFAULT_ENDPOINT });
        });
    });
}

function saveXmnoteSyncConfigToStorage(config) {
    var next = config || {};
    var payload = {
        endpoint: String(next.endpoint || '').trim() || XMNOTE_DEFAULT_ENDPOINT
    };
    return new Promise(function (resolve) {
        var obj = {};
        obj[XMNOTE_SYNC_CONFIG_KEY] = payload;
        chrome.storage.local.set(obj, function () {
            resolve(payload);
        });
    });
}

function buildSyncBookRows(records) {
    var list = Array.isArray(records) ? records.slice() : [];
    list.sort(function (a, b) {
        return Number(b && b.updatedAt || 0) - Number(a && a.updatedAt || 0);
    });
    var rows = [];
    for (var i = 0; i < list.length; i++) {
        var rec = list[i] || {};
        var uniqueid = String(rec.uniqueid || rec.bookuniqueid || '').trim();
        rows.push({
            id: String(rec.id || ''),
            cururlKey: String(rec.cururlKey || ''),
            title: String(rec.rTitle || rec.cururl || '未命名书籍'),
            cururl: String(rec.cururl || ''),
            uniqueid: uniqueid,
            totalReadingSec: Number(rec.totalReadingSec || Math.floor(Number(rec.totalReadingMs || 0) / 1000) || 0),
            sessionCount: Number(rec.sessionCount || 0),
            firstReadAt: Number(rec.firstReadAt || 0),
            lastReadAt: Number(rec.lastReadAt || 0),
            updatedAt: Number(rec.updatedAt || 0),
            dailyDurations: rec.dailyDurations && typeof rec.dailyDurations === 'object' ? rec.dailyDurations : {},
            hourlyDurations: rec.hourlyDurations && typeof rec.hourlyDurations === 'object' ? rec.hourlyDurations : {},
            entries: Array.isArray(rec.entries) ? rec.entries : []
        });
    }
    return rows;
}

function renderXmnoteSyncBookList() {
    var $list = $('#xmnote-sync-book-list');
    if ($list.length === 0) {
        return;
    }
    if (!currentSyncBookRows || currentSyncBookRows.length === 0) {
        $list.html('<div class="xmnote-sync-book-empty">暂无可同步的阅读时间记录。</div>');
        return;
    }

    var html = [];
    for (var i = 0; i < currentSyncBookRows.length; i++) {
        var row = currentSyncBookRows[i];
        var uid = row.uniqueid ? escapeHtml(row.uniqueid) : '-';
        var uidClass = row.uniqueid ? 'xmnote-sync-book-meta' : 'xmnote-sync-book-meta missing';
        html.push(
            '<label class="xmnote-sync-book-item">' +
            '<input type="checkbox" class="xmnote-sync-book-check" data-book-id="' + escapeHtml(row.id) + '" checked>' +
            '<span class="xmnote-sync-book-title" title="' + escapeHtml(row.title) + '">' + escapeHtml(row.title) + '</span>' +
            '<span class="' + uidClass + '">uniqueid: ' + uid + '</span>' +
            '</label>'
        );
    }
    $list.html(html.join(''));
}

function setXmnoteBookListDisabled(disabled) {
    var $list = $('#xmnote-sync-book-list');
    if ($list.length === 0) {
        return;
    }
    if (disabled) {
        $list.addClass('is-disabled');
    } else {
        $list.removeClass('is-disabled');
    }
    $list.find('input.xmnote-sync-book-check').prop('disabled', !!disabled);
}

function collectSelectedSyncRows(mode) {
    if (mode === 'all') {
        return currentSyncBookRows.slice();
    }
    var checkedMap = {};
    $('.xmnote-sync-book-check:checked').each(function () {
        checkedMap[$(this).attr('data-book-id')] = true;
    });
    var picked = [];
    for (var i = 0; i < currentSyncBookRows.length; i++) {
        var row = currentSyncBookRows[i];
        if (checkedMap[row.id]) {
            picked.push(row);
        }
    }
    return picked;
}

function closeXmnoteSyncModal() {
    var $backdrop = $('#xmnote-sync-modal-backdrop');
    if ($backdrop.length === 0) {
        return;
    }
    $backdrop.removeClass('show').attr('aria-hidden', 'true');
}

function openXmnoteSyncModal() {
    var $backdrop = $('#xmnote-sync-modal-backdrop');
    if ($backdrop.length === 0) {
        return;
    }
    currentSyncBookRows = buildSyncBookRows(readingTimeList);
    renderXmnoteSyncBookList();
    $('#xmnote-sync-endpoint').val((xmnoteSyncConfig && xmnoteSyncConfig.endpoint) || XMNOTE_DEFAULT_ENDPOINT);
    $('input[name="xmnote-sync-mode"][value="all"]').prop('checked', true);
    setXmnoteBookListDisabled(true);
    $backdrop.addClass('show').attr('aria-hidden', 'false');
}

function syncReadingTimeToXmnote(endpoint, records) {
    function normalizeXmnoteEndpoint(rawEndpoint) {
        var ep = String(rawEndpoint || '').trim();
        if (!ep) {
            ep = XMNOTE_DEFAULT_ENDPOINT;
        }
        if (/^https?:\/\//i.test(ep)) {
            try {
                var parsed = new URL(ep);
                var pathname = parsed.pathname || '/';
                if (pathname === '/' || pathname === '') {
                    parsed.pathname = '/send';
                }
                return parsed.toString();
            } catch (e) {
                return ep;
            }
        }
        var normalized = ep.replace(/\/+$/, '');
        if (/\/send$/i.test(normalized)) {
            return 'http://' + normalized;
        }
        return 'http://' + normalized + '/send';
    }

    function buildXmnotePayload(row) {
        var uniqueid = String(row && row.uniqueid || '').trim();
        var hourly = row && row.hourlyDurations && typeof row.hourlyDurations === 'object' ? row.hourlyDurations : {};
        var keys = Object.keys(hourly);
        var fuzzy = [];
        for (var i = 0; i < keys.length; i++) {
            var hourKey = keys[i];
            var seconds = Math.floor(Number(hourly[hourKey] || 0) / 1000);
            if (!Number.isFinite(seconds) || seconds <= 0) {
                continue;
            }
            var dateSec = Math.floor(new Date(hourKey.replace(' ', 'T') + ':00:00').getTime() / 1000);
            if (!Number.isFinite(dateSec) || dateSec <= 0) {
                continue;
            }
            fuzzy.push({ date: dateSec, durationSeconds: seconds });
        }

        if (fuzzy.length === 0) {
            var daily = row && row.dailyDurations && typeof row.dailyDurations === 'object' ? row.dailyDurations : {};
            var dateKeys = Object.keys(daily);
            for (var d = 0; d < dateKeys.length; d++) {
                var dateKey = dateKeys[d];
                var daySeconds = Math.floor(Number(daily[dateKey] || 0) / 1000);
                if (!Number.isFinite(daySeconds) || daySeconds <= 0) {
                    continue;
                }
                var daySec = Math.floor(new Date(dateKey + 'T00:00:00').getTime() / 1000);
                if (!Number.isFinite(daySec) || daySec <= 0) {
                    continue;
                }
                fuzzy.push({ date: daySec, durationSeconds: daySeconds });
            }
        }
        fuzzy.sort(function (a, b) { return a.date - b.date; });

        if (fuzzy.length === 0) {
            var fallbackSec = Number(row && row.totalReadingSec || 0);
            if (Number.isFinite(fallbackSec) && fallbackSec > 0) {
                var todaySec = Math.floor(new Date().setHours(0, 0, 0, 0) / 1000);
                fuzzy.push({ date: todaySec, durationSeconds: Math.floor(fallbackSec) });
            }
        }

        var lastReadAtSec = Math.floor(Number(row && (row.lastReadAt || row.updatedAt || Date.now())) / 1000);
        var rangeNote = '';
        if (fuzzy.length > 0) {
            var firstBucket = fuzzy[0];
            var lastBucket = fuzzy[fuzzy.length - 1];
            var rangeStart = new Date(firstBucket.date * 1000).toISOString();
            var rangeEnd = new Date((lastBucket.date + 3600) * 1000).toISOString();
            rangeNote = '\n小时范围: ' + rangeStart + ' ~ ' + rangeEnd;
        }
        var mappedEntries = [];
        var rawEntries = Array.isArray(row && row.entries) ? row.entries : [];
        for (var e = 0; e < rawEntries.length; e++) {
            var item = rawEntries[e] || {};
            var text = String(item.text || '').trim();
            if (!text) {
                continue;
            }
            var note = String(item.note || '').trim();
            var chapter = String(item.chapter || '').trim();
            var ts = Number(item.time || 0);
            if (!Number.isFinite(ts) || ts <= 0) {
                ts = lastReadAtSec;
            }
            if (ts > 1000000000000) {
                ts = Math.floor(ts / 1000);
            }
            mappedEntries.push({
                text: text,
                note: note,
                chapter: chapter,
                time: Math.floor(ts)
            });
        }
        if (mappedEntries.length === 0) {
            mappedEntries.push({
                chapter: '阅读时间同步',
                text: '阅读时间导入（uniqueid=' + uniqueid + '）',
                note: '来源: LeanRabbook\nURL: ' + String(row && row.cururl || '') + rangeNote,
                time: lastReadAtSec
            });
        }

        return {
            title: String(row && (row.uniqueid || row.title || row.cururl) || '未命名书籍'),
            type: 1,
            locationUnit: 1,
            readingStatus: 2,
            readingStatusChangedDate: lastReadAtSec,
            source: 'LeanRabbook',
            tags: ['LeanRabbook', 'uid:' + uniqueid],
            fuzzyReadingDurations: fuzzy,
            currentPage: 0,
            totalPageCount: 100,
            entries: mappedEntries
        };
    }

    function fetchWithTimeout(url, options, timeoutMs) {
        var controller = new AbortController();
        var timer = setTimeout(function () { controller.abort(); }, timeoutMs);
        var opts = Object.assign({}, options, { signal: controller.signal });
        return fetch(url, opts).finally(function () {
            clearTimeout(timer);
        });
    }

    return new Promise(async function (resolve) {
        var list = Array.isArray(records) ? records : [];
        if (list.length === 0) {
            resolve({ ok: false, error: 'empty_records', message: 'no records to import' });
            return;
        }

        var url = normalizeXmnoteEndpoint(endpoint);
        var importedCount = 0;
        for (var i = 0; i < list.length; i++) {
            var row = list[i] || {};
            var uid = String(row.uniqueid || '').trim();
            if (!uid) {
                continue;
            }
            var payload = buildXmnotePayload(row);
            var resp;
            try {
                resp = await fetchWithTimeout(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                }, 12000);
            } catch (err) {
                var isAbort = !!(err && (err.name === 'AbortError' || String(err.message || '').indexOf('aborted') >= 0));
                resolve({
                    ok: false,
                    error: isAbort ? 'network_timeout' : 'network_error',
                    message: isAbort ? '请求超时（12s），请检查 xmnote 地址、网络及 API 导入页' : (err && err.message ? err.message : String(err)),
                    requestUrl: url
                });
                return;
            }

            var body = null;
            try {
                body = await resp.json();
            } catch (e) {
                body = null;
            }

            if (!resp.ok) {
                resolve({
                    ok: false,
                    error: 'remote_http_error',
                    message: body && (body.message || body.error) ? String(body.message || body.error) : ('HTTP ' + resp.status),
                    requestUrl: url
                });
                return;
            }

            if (body && typeof body.code !== 'undefined' && Number(body.code) !== 200) {
                resolve({
                    ok: false,
                    error: 'remote_business_error',
                    message: String(body.message || ('code=' + body.code)),
                    requestUrl: url
                });
                return;
            }
            importedCount += 1;
        }

        resolve({ ok: true, importedCount: importedCount, requestUrl: url });
    });
}

async function ensureUniqueIdForSyncRows(rows) {
    var list = Array.isArray(rows) ? rows : [];
    var readyRows = [];
    var skippedNoUniqueId = 0;
    for (var i = 0; i < list.length; i++) {
        var row = list[i];
        if (row.uniqueid) {
            readyRows.push(row);
            continue;
        }
        var title = row.title || row.cururl || '未命名书籍';
        var input = window.prompt('《' + title + '》缺少 uniqueid，请输入后继续同步（取消则跳过该书）', '');
        if (input === null) {
            skippedNoUniqueId += 1;
            continue;
        }
        var uid = String(input || '').trim();
        if (!uid) {
            skippedNoUniqueId += 1;
            continue;
        }

        var key = row.cururlKey || (row.id || '').replace(/^time::/, '');
        var saved = await setBookmarkUniqueIdByCururlKey(key, uid);
        if (!saved) {
            return { ok: false, cancelled: false, message: '保存 uniqueid 失败：' + title };
        }
        row.uniqueid = uid;
        readyRows.push(row);
    }
    return { ok: true, rows: readyRows, skippedNoUniqueId: skippedNoUniqueId };
}

async function submitXmnoteSync() {
    var endpoint = ($('#xmnote-sync-endpoint').val() || '').trim();
    if (!endpoint) {
        endpoint = XMNOTE_DEFAULT_ENDPOINT;
    }
    var mode = $('input[name="xmnote-sync-mode"]:checked').val() || 'all';
    var pickedRows = collectSelectedSyncRows(mode);
    if (!pickedRows || pickedRows.length === 0) {
        showToast('请至少选择一本书。', 'danger', 2400);
        return;
    }

    var ensureRet = await ensureUniqueIdForSyncRows(pickedRows);
    if (!ensureRet.ok) {
        showToast('同步前校验失败：' + ensureRet.message, 'danger', 2800);
        return;
    }

    var readyRows = Array.isArray(ensureRet.rows) ? ensureRet.rows : [];
    if (readyRows.length === 0) {
        showToast('没有可导入书籍（缺少 uniqueid 的书已跳过）。', 'danger', 2800);
        return;
    }

    var $submitBtn = $('#xmnote-sync-submit');
    $submitBtn.prop('disabled', true).text('同步中...');

    var response = await syncReadingTimeToXmnote(endpoint, readyRows);
    $submitBtn.prop('disabled', false).text('开始同步');

    if (!response || !response.ok) {
        var failMsg = (response && (response.message || response.error)) ? String(response.message || response.error) : '未知错误';
        if (response && response.requestUrl) {
            failMsg += '（URL: ' + response.requestUrl + '）';
        }
        showToast('同步失败：' + failMsg, 'danger', 3200);
        return;
    }

    xmnoteSyncConfig = await saveXmnoteSyncConfigToStorage({ endpoint: endpoint });
    var importedCount = Number(response.importedCount || readyRows.length);
    var tip = '同步成功，已导入 ' + importedCount + ' 本书（含阅读时间与书摘）。';
    if (Number(ensureRet.skippedNoUniqueId || 0) > 0) {
        tip += '（跳过无 uniqueid：' + Number(ensureRet.skippedNoUniqueId) + '）';
    }
    showToast(tip, 'success', 3200);
    refreshDetailsPage();
    closeXmnoteSyncModal();
}

function mergeDailyDurationMaps(target, source) {
    var next = {};
    var targetKeys = Object.keys(target || {});
    for (var i = 0; i < targetKeys.length; i++) {
        var tKey = targetKeys[i];
        var tVal = Number(target[tKey] || 0);
        if (Number.isFinite(tVal) && tVal > 0) {
            next[tKey] = tVal;
        }
    }
    var sourceKeys = Object.keys(source || {});
    for (var j = 0; j < sourceKeys.length; j++) {
        var sKey = sourceKeys[j];
        var sVal = Number(source[sKey] || 0);
        if (!Number.isFinite(sVal) || sVal <= 0) {
            continue;
        }
        next[sKey] = Number(next[sKey] || 0) + sVal;
    }
    return next;
}

function getDailyDurationMapFromRecord(record) {
    var daily = {};
    if (record && record.hourlyDurations && typeof record.hourlyDurations === 'object') {
        var hourKeys = Object.keys(record.hourlyDurations);
        for (var h = 0; h < hourKeys.length; h++) {
            var hourKey = hourKeys[h];
            var hourVal = Number(record.hourlyDurations[hourKey] || 0);
            if (!Number.isFinite(hourVal) || hourVal <= 0) {
                continue;
            }
            var dayKey = String(hourKey).split(' ')[0];
            if (!dayKey) {
                continue;
            }
            daily[dayKey] = Number(daily[dayKey] || 0) + hourVal;
        }
    }
    if (record && record.dailyDurations && typeof record.dailyDurations === 'object') {
        var keys = Object.keys(record.dailyDurations);
        for (var i = 0; i < keys.length; i++) {
            var key = keys[i];
            var val = Number(record.dailyDurations[key] || 0);
            if (Number.isFinite(val) && val > 0) {
                daily[key] = val;
            }
        }
    }
    if (Object.keys(daily).length === 0 && record) {
        var fallbackDate = getDateKeyFromTs(record.lastReadAt || record.updatedAt || Date.now());
        var fallbackSec = Number(record.totalReadingSec || Math.floor(Number(record.totalReadingMs || 0) / 1000));
        if (fallbackDate && Number.isFinite(fallbackSec) && fallbackSec > 0) {
            daily[fallbackDate] = fallbackSec * 1000;
        }
    }
    return daily;
}

function renderHeatmapToElement(elementSelector, dailyMap) {
    var $heatmap = $(elementSelector);
    if ($heatmap.length === 0) {
        return { totalDays: 0, totalSeconds: 0, maxSeconds: 0 };
    }
    var keys = Object.keys(dailyMap || {});
    var totalMs = 0;
    var maxMs = 0;
    for (var i = 0; i < keys.length; i++) {
        var value = Number(dailyMap[keys[i]] || 0);
        if (Number.isFinite(value) && value > 0) {
            totalMs += value;
            if (value > maxMs) {
                maxMs = value;
            }
        }
    }

    var today = new Date();
    today.setHours(0, 0, 0, 0);
    var start = new Date(today.getTime() - 83 * 24 * 60 * 60 * 1000);
    start.setHours(0, 0, 0, 0);
    var cells = [];
    for (var d = 0; d < 84; d++) {
        var current = new Date(start.getTime() + d * 24 * 60 * 60 * 1000);
        var year = current.getFullYear();
        var month = current.getMonth() + 1;
        var day = current.getDate();
        var key = year + '-' + (month < 10 ? '0' + month : '' + month) + '-' + (day < 10 ? '0' + day : '' + day);
        var dayValueMs = Number((dailyMap || {})[key] || 0);
        var dayValueSeconds = Math.floor(dayValueMs / 1000);
        var intensity = getHeatmapIntensityClass(dayValueMs, maxMs);
        var weekDay = current.getDay();
        cells.push('<div class="readingtime-cell ' + intensity + ' wd-' + weekDay + '" title="' + escapeHtml(key + ' · ' + formatSeconds(dayValueSeconds)) + '"></div>');
    }
    $heatmap.html(cells.join(''));
    return {
        totalDays: keys.length,
        totalSeconds: Math.floor(totalMs / 1000),
        maxSeconds: Math.floor(maxMs / 1000)
    };
}

function renderGlobalReadingTimeSummary(records) {
    var list = Array.isArray(records) ? records : [];
    var $title = $('#readingtime-agg-title');
    var $subtitle = $('#readingtime-agg-subtitle');
    var $grid = $('#readingtime-agg-summary-grid');
    if ($title.length === 0 || $subtitle.length === 0 || $grid.length === 0) {
        return;
    }

    if (list.length === 0) {
        $title.text('所有书籍阅读汇总');
        $subtitle.text('暂无统计数据');
        $grid.html('<div class="readingtime-summary-empty">暂无阅读时间记录。</div>');
        renderHeatmapToElement('#readingtime-agg-heatmap', {});
        return;
    }

    var totalSec = 0;
    var totalSessions = 0;
    var lastReadAt = 0;
    var firstReadAt = 0;
    var dailyMerged = {};
    var uniqueidBookCount = 0;
    for (var i = 0; i < list.length; i++) {
        var rec = list[i] || {};
        var sec = Number(rec.totalReadingSec || Math.floor(Number(rec.totalReadingMs || 0) / 1000));
        if (Number.isFinite(sec) && sec > 0) {
            totalSec += sec;
        }
        var sessions = Number(rec.sessionCount || 0);
        if (Number.isFinite(sessions) && sessions > 0) {
            totalSessions += sessions;
        }
        var lr = Number(rec.lastReadAt || 0);
        if (lr > lastReadAt) {
            lastReadAt = lr;
        }
        var fr = Number(rec.firstReadAt || 0);
        if (fr > 0) {
            firstReadAt = firstReadAt > 0 ? Math.min(firstReadAt, fr) : fr;
        }
        if ((rec.uniqueid && String(rec.uniqueid).trim()) || (rec.bookuniqueid && String(rec.bookuniqueid).trim())) {
            uniqueidBookCount += 1;
        }
        dailyMerged = mergeDailyDurationMaps(dailyMerged, getDailyDurationMapFromRecord(rec));
    }

    var heatmapStat = renderHeatmapToElement('#readingtime-agg-heatmap', dailyMerged);
    var avgSessionSec = totalSessions > 0 ? Math.floor(totalSec / totalSessions) : 0;
    var html = [
        ['统计书籍', String(list.length)],
        ['累计时长', formatSeconds(totalSec)],
        ['累计秒数', String(totalSec)],
        ['阅读次数', String(totalSessions)],
        ['单次均值', formatSeconds(avgSessionSec)],
        ['活跃天数', String(heatmapStat.totalDays)],
        ['近84天峰值', formatSeconds(heatmapStat.maxSeconds)],
        ['最近阅读', formatTimeStamp(lastReadAt)],
        ['最早阅读', formatTimeStamp(firstReadAt)],
        ['已设uniqueid', String(uniqueidBookCount)]
    ];

    var cells = [];
    for (var h = 0; h < html.length; h++) {
        cells.push('<div class="readingtime-summary-item"><div class="readingtime-summary-label">' + escapeHtml(html[h][0]) + '</div><div class="readingtime-summary-value">' + escapeHtml(html[h][1]) + '</div></div>');
    }
    $title.text('所有书籍阅读汇总');
    $subtitle.text('更新时间：' + formatTimeStamp(lastReadAt));
    $grid.html(cells.join(''));
}

function exportBookData(bookmarkId) {
    var bookmark = null;
    for (var i = 0; i < bklist.length; i++) {
        if (bklist[i].id === bookmarkId) {
            bookmark = bklist[i];
            break;
        }
    }
    if (!bookmark) {
        return { ok: false, error: 'bookmark_not_found' };
    }
    var cururlKey = bookmark.cururlKey || '';
    var records = [];
    for (var j = 0; j < readingTimeList.length; j++) {
        var rec = readingTimeList[j];
        if (!rec) { continue; }
        var recKey = rec.cururlKey || '';
        if (recKey && recKey === cururlKey) {
            records.push(rec);
        }
    }
    return { ok: true, bookmark: bookmark, readingRecords: records };
}

function exportAllData() {
    return { ok: true, bookmarks: bklist, readingRecords: readingTimeList };
}

function downloadJsonFile(data, filename, options) {
    var opts = options || {};
    var appendDate = opts.appendDate !== false;
    var sanitizedFilename = (filename || 'export').replace(/[\\/:*?"<>|]/g, '_');
    var timestamp = new Date().toISOString().slice(0, 10);
    var finalFilename = appendDate ? (sanitizedFilename + '_' + timestamp + '.json') : (sanitizedFilename + '.json');
    
    var jsonStr = JSON.stringify(data, null, 2);
    var blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' });
    var link = document.createElement('a');
    var url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', finalFilename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    showToast('文件已导出：' + finalFilename, 'success', 2200);
}

function deleteBookmarkById(bookmarkId) {
    return new Promise(function (resolve) {
        chrome.runtime.sendMessage({ type: 'bookmarkDeleteById', id: bookmarkId }, function (response) {
            if (chrome.runtime.lastError) {
                console.warn('deleteBookmarkById failed:', chrome.runtime.lastError.message);
                resolve({ ok: false, readingRecordDeleted: 0, entryDeletedCount: 0 });
                return;
            }
            resolve(response || { ok: false, readingRecordDeleted: 0, entryDeletedCount: 0 });
        });
    });
}

function cleanupReadingTimeOrphans() {
    return new Promise(function (resolve) {
        chrome.runtime.sendMessage({ type: 'readingTimeCleanupOrphans' }, function (response) {
            if (chrome.runtime.lastError) {
                console.warn('cleanupReadingTimeOrphans failed:', chrome.runtime.lastError.message);
                resolve({ ok: false, deletedCount: 0, totalCount: 0 });
                return;
            }
            resolve(response || { ok: false, deletedCount: 0, totalCount: 0 });
        });
    });
}

function setBookmarkUniqueId(bookmarkId, bookuniqueid) {
    return new Promise(function (resolve) {
        chrome.runtime.sendMessage({ type: 'bookmarkSetUniqueId', id: bookmarkId, bookuniqueid: bookuniqueid }, function (response) {
            if (chrome.runtime.lastError) {
                console.warn('setBookmarkUniqueId failed:', chrome.runtime.lastError.message);
                resolve(false);
                return;
            }
            resolve(!!(response && response.ok));
        });
    });
}

function setBookmarkUniqueIdByCururlKey(cururlKey, bookuniqueid) {
    return new Promise(function (resolve) {
        chrome.runtime.sendMessage({ type: 'bookmarkSetUniqueIdByCururlKey', cururlKey: cururlKey, bookuniqueid: bookuniqueid }, function (response) {
            if (chrome.runtime.lastError) {
                console.warn('setBookmarkUniqueIdByCururlKey failed:', chrome.runtime.lastError.message);
                resolve(false);
                return;
            }
            resolve(!!(response && response.ok));
        });
    });
}

function formatSeconds(totalSeconds) {
    var sec = Number(totalSeconds || 0);
    if (!Number.isFinite(sec) || sec <= 0) {
        return '0秒';
    }
    var hours = Math.floor(sec / 3600);
    var mins = Math.floor((sec % 3600) / 60);
    var seconds = Math.floor(sec % 60);
    var parts = [];
    if (hours > 0) parts.push(hours + '小时');
    if (mins > 0) parts.push(mins + '分');
    if (hours === 0 && mins === 0) parts.push(seconds + '秒');
    return parts.join('');
}

function formatTimeStamp(value) {
    var ts = Number(value || 0);
    if (!Number.isFinite(ts) || ts <= 0) {
        return '-';
    }
    if (ts < 10000000000) {
        ts = ts * 1000;
    }
    var d = new Date(ts);
    if (isNaN(d.getTime())) {
        return '-';
    }
    function pad(n) { return n < 10 ? '0' + n : '' + n; }
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
}

function getDateKeyFromTs(ts) {
    var d = new Date(Number(ts || 0));
    if (isNaN(d.getTime())) {
        return '';
    }
    var year = d.getFullYear();
    var month = d.getMonth() + 1;
    var day = d.getDate();
    return year + '-' + (month < 10 ? '0' + month : '' + month) + '-' + (day < 10 ? '0' + day : '' + day);
}

function escapeHtml(text) {
    return String(text == null ? '' : text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function getBookIdentityKeyFromUrl(rawUrl) {
    if (!rawUrl || typeof rawUrl !== 'string') {
        return '';
    }
    try {
        var parsed = new URL(rawUrl);
        var parts = (parsed.pathname || '').split('/').filter(function (it) { return !!it; });
        if (parts.length > 0) {
            parts = parts.slice(0, parts.length - 1);
        }
        return parsed.origin + '/' + parts.join('/');
    } catch (e) {
        var normalized = rawUrl.split('#')[0].split('?')[0];
        var arr = normalized.split('/');
        if (arr.length > 0 && arr[arr.length - 1] === '') {
            arr.pop();
        }
        if (arr.length > 0) {
            arr.pop();
        }
        return arr.join('/');
    }
}

function getBookmarkKey(bookmark) {
    if (!bookmark) {
        return '';
    }
    if (bookmark.id) {
        return bookmark.id;
    }
    return 'book::' + getBookIdentityKeyFromUrl(bookmark.cururl || '');
}

function ensureReadingTimeModalUi() {
    var $backdrop = $('#readingtime-modal-backdrop');
    if ($backdrop.length === 0) {
        return;
    }
    $('#readingtime-modal-close').off('click.readingtime').on('click.readingtime', function () {
        closeReadingTimeModal();
    });
    $backdrop.off('click.readingtime').on('click.readingtime', function (e) {
        if (e.target.id === 'readingtime-modal-backdrop') {
            closeReadingTimeModal();
        }
    });
    $(document).off('keydown.readingtime').on('keydown.readingtime', function (e) {
        if (e.key === 'Escape') {
            closeReadingTimeModal();
        }
    });
}

function closeReadingTimeModal() {
    var $backdrop = $('#readingtime-modal-backdrop');
    if ($backdrop.length === 0) {
        return;
    }
    $backdrop.removeClass('show').attr('aria-hidden', 'true');
}

function ensureXmnoteSyncModalUi() {
    var $backdrop = $('#xmnote-sync-modal-backdrop');
    if ($backdrop.length === 0) {
        return;
    }

    $('#xmnote-sync-close').off('click.xmnote').on('click.xmnote', function () {
        closeXmnoteSyncModal();
    });
    $('#xmnote-sync-cancel').off('click.xmnote').on('click.xmnote', function () {
        closeXmnoteSyncModal();
    });
    $('#xmnote-sync-submit').off('click.xmnote').on('click.xmnote', function () {
        submitXmnoteSync();
    });

    $backdrop.off('click.xmnote').on('click.xmnote', function (e) {
        if (e.target.id === 'xmnote-sync-modal-backdrop') {
            closeXmnoteSyncModal();
        }
    });

    $('input[name="xmnote-sync-mode"]').off('change.xmnote').on('change.xmnote', function () {
        var mode = $('input[name="xmnote-sync-mode"]:checked').val() || 'all';
        setXmnoteBookListDisabled(mode === 'all');
    });
}

function getDailyDurationMap(record) {
    var daily = {};
    if (record && record.hourlyDurations && typeof record.hourlyDurations === 'object') {
        var hourKeys = Object.keys(record.hourlyDurations);
        for (var h = 0; h < hourKeys.length; h++) {
            var hourKey = hourKeys[h];
            var hourVal = Number(record.hourlyDurations[hourKey] || 0);
            if (!Number.isFinite(hourVal) || hourVal <= 0) {
                continue;
            }
            var dayKey = String(hourKey).split(' ')[0];
            if (!dayKey) {
                continue;
            }
            daily[dayKey] = Number(daily[dayKey] || 0) + hourVal;
        }
    }
    if (record && record.dailyDurations && typeof record.dailyDurations === 'object') {
        var keys = Object.keys(record.dailyDurations);
        for (var i = 0; i < keys.length; i++) {
            var key = keys[i];
            var val = Number(record.dailyDurations[key] || 0);
            if (Number.isFinite(val) && val > 0) {
                daily[key] = val;
            }
        }
    }
    if (Object.keys(daily).length === 0) {
        var fallbackDate = getDateKeyFromTs(record && (record.lastReadAt || record.updatedAt || Date.now()));
        var fallbackSeconds = Number(record && record.totalReadingSec);
        if (!Number.isFinite(fallbackSeconds) || fallbackSeconds <= 0) {
            fallbackSeconds = Math.floor(Number(record && record.totalReadingMs || 0) / 1000);
        }
        if (fallbackDate && fallbackSeconds > 0) {
            daily[fallbackDate] = fallbackSeconds * 1000;
        }
    }
    return daily;
}

function getHeatmapIntensityClass(value, maxValue) {
    if (!value || value <= 0) {
        return 'intensity-0';
    }
    if (!maxValue || maxValue <= 0) {
        return 'intensity-1';
    }
    var ratio = value / maxValue;
    if (ratio < 0.25) return 'intensity-1';
    if (ratio < 0.5) return 'intensity-2';
    if (ratio < 0.75) return 'intensity-3';
    return 'intensity-4';
}

function renderReadingTimeHeatmap(record) {
    var daily = getDailyDurationMap(record);
    return renderHeatmapToElement('#readingtime-modal-heatmap', daily);
}

function renderReadingTimeModal(record, bookmark) {
    ensureReadingTimeModalUi();
    var $backdrop = $('#readingtime-modal-backdrop');
    var $title = $('#readingtime-modal-title');
    var $subtitle = $('#readingtime-modal-subtitle');
    var $summary = $('#readingtime-modal-summary-grid');
    if ($backdrop.length === 0 || $title.length === 0 || $subtitle.length === 0 || $summary.length === 0) {
        return;
    }

    var titleText = (bookmark && bookmark.rTitle) || (record && record.rTitle) || '单书阅读时间统计';
    var subtitleText = (record && record.cururl) || (bookmark && bookmark.cururl) || '';
    $title.text(titleText);
    $subtitle.text(subtitleText);

    if (!record) {
        $summary.html('<div class="readingtime-summary-empty">暂无阅读时间统计。</div>');
        $('#readingtime-modal-heatmap').empty();
        $backdrop.addClass('show').attr('aria-hidden', 'false');
        return;
    }

    var heatmapStat = renderReadingTimeHeatmap(record);
    var summaryItems = [
        ['uniqueid', record.uniqueid || record.bookuniqueid || '-'],
        ['累计时长', formatSeconds(record.totalReadingSec || Math.floor(Number(record.totalReadingMs || 0) / 1000))],
        ['阅读次数', String(record.sessionCount || 0)],
        ['首次阅读', formatTimeStamp(record.firstReadAt)],
        ['最后阅读', formatTimeStamp(record.lastReadAt)],
        ['活跃天数', String(heatmapStat.totalDays)],
        ['近84天峰值', formatSeconds(heatmapStat.maxSeconds)],
        ['更新时间', formatTimeStamp(record.updatedAt)]
    ];

    var html = [];
    for (var i = 0; i < summaryItems.length; i++) {
        html.push('<div class="readingtime-summary-item"><div class="readingtime-summary-label">' + escapeHtml(summaryItems[i][0]) + '</div><div class="readingtime-summary-value">' + escapeHtml(summaryItems[i][1]) + '</div></div>');
    }
    $summary.html(html.join(''));
    $backdrop.addClass('show').attr('aria-hidden', 'false');
}

async function showReadingTimeForBookmark(bookmark) {
    if (!bookmark) {
        renderReadingTimeModal(null, null);
        return;
    }
    var key = getBookmarkKey(bookmark);
    var all = Array.isArray(readingTimeList) && readingTimeList.length > 0 ? readingTimeList : await getReadingTimeRecordsFromDb();
    var found = null;
    for (var i = 0; i < all.length; i++) {
        var row = all[i];
        if (!row) {
            continue;
        }
        if ((row.id && row.id === key) || (row.cururlKey && row.cururlKey === getBookIdentityKeyFromUrl(bookmark.cururl || '')) || (row.uniqueid && bookmark.bookuniqueid && row.uniqueid === bookmark.bookuniqueid)) {
            found = row;
            break;
        }
    }
    renderReadingTimeModal(found, bookmark);
}

function refreshDetailsPage() {
    chrome.storage.local.get({
        'clist': [], 'flist': [], 'tlist': [], 'plist': [], 'nlist': [],
        'dir': false, 'css': null, 'js': null, 'twocolumn': true,
        'fontsize': 16, 'linespacing': 1.6, 'contentwidth': 960, 'fontfamily': READER_FONT_DEFAULT_VALUE
    }, async function (result) {
        clist = result.clist;
        tlist = result.tlist;
        plist = result.plist;
        nlist = result.nlist;
        flist = result.flist;
        css = result.css;
        rjs = result.js;
        dir = result.dir;
        twocolumn = result.twocolumn;
        var loaded = await Promise.all([getBookmarksFromDb(), getReadingTimeRecordsFromDb(), getXmnoteSyncConfigFromStorage()]);
        bklist = loaded[0];
        readingTimeList = loaded[1];
        xmnoteSyncConfig = loaded[2] || { endpoint: XMNOTE_DEFAULT_ENDPOINT };
        fontfamily = result.fontfamily || READER_FONT_DEFAULT_VALUE;
        $('#text-selector').val(JSON.stringify(clist));
        $('#text-filter').val(JSON.stringify(flist));
        $('#reader-dir').prop("checked", dir);
        $('#two-column').prop("checked", twocolumn);
        $('#title-selector').val(JSON.stringify(tlist));
        $('#nav-p-selector').val(JSON.stringify(plist));
        $('#nav-selector').val(JSON.stringify(nlist));
        $('#cssinput').val(css);
        $('#jsinput').val(rjs);
        // Layout settings
        $('#fontsize').val(result.fontsize);
        $('#fontsize-val').text(result.fontsize + 'px');
        $('#linespacing').val(result.linespacing);
        $('#linespacing-val').text(result.linespacing.toFixed(1));
        $('#contentwidth').val(result.contentwidth);
        $('#contentwidth-val').text(result.contentwidth + 'px');
        renderFontFamilyOptions(fontfamily);
        renderGlobalReadingTimeSummary(readingTimeList);
        // Load show
        displayPage();
    });
};





function displayPage() {
    //Refresh the bookmark
    //Insert current bkmarks

    //Display the bkmarks
    if (rTitle != null) {
    }

    //Show:
    $('.bookmarks-list').empty();
    ensureXmnoteSyncModalUi();

    for (var i = 0; i < bklist.length; i++) {
        var bookmarkId = bklist[i].id || '';
        var uniqueIdLabel = (bklist[i].bookuniqueid || '').trim();
        var uidTag = uniqueIdLabel ? ("<span class='uid-tag'>ID: " + uniqueIdLabel + "</span>") : '';
        var cstr = "<li><span class='spanbut time' title='查看该书阅读时间'>时</span><span class='spanbut uid' title='设置唯一ID'>ID</span><span class='spanbut export' title='导出该书所有记录'>导</span><span class='spanbut del'>删</span><span class='linka' bookmark-id='" + bookmarkId + "' ind='" + i + "' progress='" + bklist[i].curprog + "' href='" + bklist[i].cururl + "'>" + bklist[i].rTitle + uidTag + "</span></li>";
        $('.bookmarks-list').append(cstr);
    }

    $('.time.spanbut').off('click').on('click', async function (e) {
        e.preventDefault();
        e.stopPropagation();
        var $target = $(this).parent().find('.linka').eq(0);
        var ind = Number($target.attr('ind'));
        if (!Number.isFinite(ind) || !bklist[ind]) {
            showToast('未找到对应记录。', 'danger', 2200);
            return;
        }
        await showReadingTimeForBookmark(bklist[ind]);
    });

    $('#readingtime-sync-btn').off('click').on('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (!Array.isArray(readingTimeList) || readingTimeList.length === 0) {
            showToast('暂无可同步的阅读时间记录。', 'danger', 2200);
            return;
        }
        openXmnoteSyncModal();
    });

    $('#readingtime-clean-btn').off('click').on('click', async function (e) {
        e.preventDefault();
        e.stopPropagation();
        var ok = await showConfirmDialog('清理不存在的书籍记录', '清理记录');
        if (!ok) {
            return;
        }
        var ret = await cleanupReadingTimeOrphans();
        if (!ret || !ret.ok) {
            showToast('清理失败，请稍后重试。', 'danger', 2600);
            return;
        }
        showToast('清理完成：已移除 ' + Number(ret.deletedCount || 0) + ' 条孤立阅读时间记录。');
        refreshDetailsPage();
    });

    $('.uid.spanbut').off('click').on('click', async function (e) {
        e.preventDefault();
        e.stopPropagation();
        var $target = $(this).parent().find('.linka').eq(0);
        var bookmarkId = $target.attr('bookmark-id') || '';
        var ind = Number($target.attr('ind'));
        if (!bookmarkId || !Number.isFinite(ind) || !bklist[ind]) {
            showToast('未找到对应记录。', 'danger', 2200);
            return;
        }
        var oldVal = (bklist[ind].bookuniqueid || '').trim();
        var nextVal = window.prompt('请输入该书籍唯一ID（留空可清除）', oldVal);
        if (nextVal === null) {
            return;
        }
        var ok = await setBookmarkUniqueId(bookmarkId, nextVal);
        if (!ok) {
            showToast('保存唯一ID失败，请稍后重试。', 'danger', 2400);
            return;
        }
        showToast('唯一ID已更新');
        setTimeout(function () {
            window.location.reload();
        }, 200);
    });

    $('.export.spanbut').off('click').on('click', async function (e) {
        e.preventDefault();
        e.stopPropagation();
        var $target = $(this).parent().find('.linka').eq(0);
        var bookmarkId = $target.attr('bookmark-id') || '';
        var ind = Number($target.attr('ind'));
        if (!bookmarkId || !Number.isFinite(ind) || !bklist[ind]) {
            showToast('未找到对应记录。', 'danger', 2200);
            return;
        }
        var uniqueid = String((bklist[ind].bookuniqueid || bklist[ind].uniqueid || '')).trim();
        while (!uniqueid) {
            var input = window.prompt('导出该书需要 uniqueid 作为文件名，请输入 uniqueid（不能为空）', '');
            if (input === null) {
                showToast('已取消导出：需要 uniqueid。', 'warn', 2400);
                return;
            }
            uniqueid = String(input || '').trim();
            if (!uniqueid) {
                showToast('uniqueid 不能为空，请重新输入。', 'danger', 2200);
            }
        }

        var saved = await setBookmarkUniqueId(bookmarkId, uniqueid);
        if (!saved) {
            showToast('保存 uniqueid 失败，请稍后重试。', 'danger', 2400);
            return;
        }
        bklist[ind].bookuniqueid = uniqueid;

        var exportData = exportBookData(bookmarkId);
        if (!exportData || !exportData.ok) {
            showToast((exportData && exportData.error) || '导出失败，请稍后重试。', 'danger', 2400);
            return;
        }
        if (exportData.bookmark) {
            exportData.bookmark.bookuniqueid = uniqueid;
            exportData.bookmark.uniqueid = uniqueid;
        }
        var fileNameBase = uniqueid + '_' + Date.now();
        downloadJsonFile(exportData, fileNameBase, { appendDate: false });
    });

    $('#readingtime-export-all-btn').off('click').on('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (!Array.isArray(bklist) || bklist.length === 0) {
            showToast('暂无可导出的记录。', 'danger', 2200);
            return;
        }
        var exportData = exportAllData();
        downloadJsonFile(exportData, 'rabbook_all');
    });

    $('.del.spanbut').off('click').on('click', async function () {

        var ok = await showConfirmDialog('阅读记录和书摘也将删除，建议先导出。确认删除吗？', '删除确认');
        if (!ok) {
            return;
        }
        var $target = $(this).parent().find('.linka').eq(0);
        var bookmarkId = $target.attr('bookmark-id') || '';
        var deleted = await deleteBookmarkById(bookmarkId);
        if (!deleted || !deleted.ok) {
            showToast('删除失败，请稍后重试。', 'danger', 2400);
            return;
        }
        var readingDeleted = Number(deleted.readingRecordDeleted || 0);
        var entryDeleted = Number(deleted.entryDeletedCount || 0);
        var tip = '已删除书籍';
        if (readingDeleted > 0 || entryDeleted > 0) {
            tip += '（阅读记录 ' + readingDeleted + ' 条，书摘 ' + entryDeleted + ' 条）';
        }
        showToast(tip);
        setTimeout(function () {
            window.location.reload();
        }, 280);
    });
    $('.linka').click(function () {
        var ind = $(this).attr('ind');
        console.log($(this).attr('ind'));
        //Open and injection
        // Let's register this one and try to inject?
        port.postMessage({ type: "register", url: $(this).attr('href') });
        window.location = $(this).attr('href');
    });

    // Card-based section toggling (accordion mode - only one open at a time)
    // Ignore clicks while animation is in progress to prevent rapid toggling
    $('.section-header').click(function () {
        var $this = $(this);
        var $parent = $this.parent('.section-card');
        var $body = $this.next('.section-body');
        var $arrow = $this.find('.section-arrow');

        // Ignore click if section body is currently animating
        if ($body.is(':animated')) {
            return;
        }

        // Check if this section is already open
        var isOpening = !$body.is(':visible');

        if (isOpening) {
            // Close all other open sections first
            var $otherCards = $('.section-card').not($parent);
            $otherCards.each(function () {
                var $otherBody = $(this).find('.section-body');
                var $otherHeader = $(this).find('.section-header');
                var $otherArrow = $(this).find('.section-arrow');
                
                if ($otherBody.is(':visible')) {
                    $otherBody.stop(true, true).slideUp(200);
                    $otherHeader.removeClass('is-open');
                    $otherArrow.removeClass('is-open');
                    $otherBody.removeClass('is-open');
                }
            });
            
            // Open this section
            $body.stop(true, true).slideDown(200, function () {
                $this.addClass('is-open');
                $arrow.addClass('is-open');
            });
            $this.addClass('is-open');
            $arrow.addClass('is-open');
            $body.addClass('is-open');
        } else {
            // Close this section
            $body.stop(true, true).slideUp(200, function () {
                $this.removeClass('is-open');
                $arrow.removeClass('is-open');
            });
            $this.removeClass('is-open');
            $arrow.removeClass('is-open');
            $body.removeClass('is-open');
        }
    });

    $('.save').off('click').on('click', function () {
        var sok = true;
        var ttxt = $("#title-selector").val();
        if (ttxt != "") {
            try {
                var cps = JSON.parse(ttxt);
                if (Object.prototype.toString.call(cps) === '[object Array]') {
                    tlist = cps;
                }
            } catch (err) {
                sok = false;
            };
        }
        var ptxt = $("#nav-p-selector").val();
        if (ptxt != "") {
            try {
                var cps = JSON.parse(ptxt);
                if (Object.prototype.toString.call(cps) === '[object Array]') {
                    plist = cps;
                }
            } catch (err) {
                sok = false;
            };
        }

        var ntxt = $("#nav-selector").val();
        if (ntxt != "") {
            try {
                var cps = JSON.parse(ntxt);
                if (Object.prototype.toString.call(cps) === '[object Array]') {
                    nlist = cps;
                }
            } catch (err) {
                sok = false;
            };
        }


        var ftxt = $("#text-filter").val();
        if (ftxt != "") {
            try {
                var fps = JSON.parse(ftxt);
                console.log(fps);
                if (Object.prototype.toString.call(fps) === '[object Array]') {
                    flist = fps;
                }
            } catch (err) {
                sok = false;
            };
        }

        var ctxt = $("#text-selector").val();
        if (ctxt != "") {
            try {
                var cps = JSON.parse(ctxt);
                console.log(cps);
                if (Object.prototype.toString.call(cps) === '[object Array]') {
                    clist = cps;
                }
            } catch (err) {
                sok = false;
            };
        }

        if (sok) {
            chrome.storage.local.set({ "clist": clist, "flist": flist, "plist": plist, "nlist": nlist, "tlist": tlist }, function () {
                showToast("设置完成");
            });
        } else {
            showToast("配置无效，请检查格式。", 'danger', 2400);
        }
    });

    $('.reset').off('click').on('click', async function () {
        var ok = await showConfirmDialog('将恢复高级配置到默认值，是否继续？', '重置确认');
        if (!ok) {
            return;
        }
        clist = [];
        flist = [];
        dir = false;
        twocolumn = false;
        chrome.storage.local.set({ "clist": clist, "flist": flist, "plist": plist, "nlist": nlist, "tlist": tlist, "dir": dir, "twocolumn": twocolumn }, function () { });
        showToast("重置完成");
        setTimeout(function () {
            window.location.reload();
        }, 280);
    });

    // Layout save/reset
    $('.layoutsave').off('click').on('click', function () {
        var fontsize = parseInt($('#fontsize').val());
        var linespacing = parseFloat($('#linespacing').val());
        var contentwidth = parseInt($('#contentwidth').val());
        var fontfamilySelectValue = ($('#fontfamily').val() || READER_FONT_DEFAULT_VALUE).trim();
        var fontfamilyCustomValue = ($('#fontfamily-custom').val() || '').trim();
        var fontfamilyInput = fontfamilySelectValue;
        if (fontfamilyCustomValue) {
            fontfamilyInput = fontfamilyCustomValue;
        } else if (fontfamilySelectValue === READER_FONT_CUSTOM_VALUE) {
            fontfamilyInput = READER_FONT_DEFAULT_VALUE;
        }
        var sdir = false; // 横向翻页已禁用，固定为纵向
        var stwocolumn = !!$('#two-column').prop('checked');

        if (!Number.isFinite(fontsize) || !Number.isFinite(linespacing) || !Number.isFinite(contentwidth)) {
            showToast("排版参数无效，请检查后重试。", 'danger', 2400);
            return;
        }

        dir = sdir;
        twocolumn = stwocolumn;
        fontfamily = fontfamilyInput || READER_FONT_DEFAULT_VALUE;
        chrome.storage.local.set({
            "fontsize": fontsize,
            "linespacing": linespacing,
            "contentwidth": contentwidth,
            "fontfamily": fontfamily,
            "dir": dir,
            "twocolumn": twocolumn
        }, function () {
            showToast("排版设置保存完毕");
        });
    });
    $('.layoutreset').off('click').on('click', async function () {
        var ok = await showConfirmDialog('将恢复排版参数到默认值，是否继续？', '重置确认');
        if (!ok) {
            return;
        }
        dir = false;
        twocolumn = true;
        fontfamily = READER_FONT_DEFAULT_VALUE;
        $('#reader-dir').prop('checked', dir);
        $('#two-column').prop('checked', twocolumn);
        $('#fontfamily').val(READER_FONT_DEFAULT_VALUE);
        $('#fontfamily-custom').val('');
        chrome.storage.local.set({ "fontsize": 16, "linespacing": 1.6, "contentwidth": 960, "fontfamily": fontfamily, "dir": dir, "twocolumn": twocolumn }, function () {
            showToast("排版已重置为默认值");
            setTimeout(function () {
                window.location.reload();
            }, 280);
        });
    });

    $('#fontfamily').off('change').on('change', function () {
        if ($(this).val() !== READER_FONT_CUSTOM_VALUE) {
            $('#fontfamily-custom').val('');
        }
    });

    // Live value display for range sliders
    $('#fontsize').on('input', function () {
        $('#fontsize-val').text($(this).val() + 'px');
    });
    $('#linespacing').on('input', function () {
        $('#linespacing-val').text(parseFloat($(this).val()).toFixed(1));
    });
    $('#contentwidth').on('input', function () {
        $('#contentwidth-val').text($(this).val() + 'px');
    });

    $('.csssave').off('click').on('click', function () {
        css = $('#cssinput').val();
        chrome.storage.local.set({ "css": css }, function () {
            showToast("样式保存完毕");
        });
    });
    $('.cssclean').off('click').on('click', async function () {
        var ok = await showConfirmDialog('将清空当前自定义主题，是否继续？', '清空确认');
        if (!ok) {
            return;
        }
        $('#cssinput').val("");
        css = '';
        chrome.storage.local.set({ "css": css }, function () {
            showToast("主题已清空");
        });
    });

    $('.jssave').off('click').on('click', function () {
        rjs = $('#jsinput').val();
        chrome.storage.local.set({ "js": rjs }, function () {
            showToast("脚本保存完毕");
        });
    });
    $('.jsclean').off('click').on('click', async function () {
        var ok = await showConfirmDialog('将清空当前附加脚本，是否继续？', '清空确认');
        if (!ok) {
            return;
        }
        $('#jsinput').val("");
        rjs = '';
        chrome.storage.local.set({ "js": rjs }, function () {
            showToast("脚本已清空");
        });
    });



    //Some patch
    var jsplc = "当有内容时，将会在处理解析页面内容时执行这段代码。\n\n注意： 强烈不建议普通用户修改增加这部分配置，如果是没有基础的用户，与其学习脚本编写，不如换个普通一点的网站。\n\n待处理的数据放在 loadedContent（对象）中，当前结构如下：\n\n\tloadedContent.title: 标题文本；\n\n\tloadedContent.prevHref: 上一页链接（字符串，可能为空）；\n\n\tloadedContent.nextHref: 下一页链接（字符串，可能为空）；\n\n\tloadedContent.contentHtml: 正文 HTML 字符串。\n\n你可以直接修改 loadedContent 里的字段，也可以 return 一个新的 loadedContent 对象。\n\n处理完毕后，必须把结果以 loadedContent 结构返回；需要更多信息，建议先通过 console.log(loadedContent) 打印理解。";


    $('#jsinput').attr('placeholder', jsplc);

    var cssplc = "留空使用系统内置主题,当有内容时，将会用此内容覆盖。\n\n涉及关键字：#gnContent（正文）， #lrbk_title（标题，根据原始页面的标记可能有h1-h4等各级），#nav （翻页按钮）\n\n 需要更多信息，请通过检视页面来获取。"
    $('#cssinput').attr('placeholder', cssplc);

}; // End of displayPage
