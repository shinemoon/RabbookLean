// service_worker.js
var popport = null;
var cntport = null;
//var detport = [];
var detport = null;
var config = null;

var DEFAULT_CONFIG = { 'bookmarks': [], "clist": [], "flist": [], "plist": [], "nlist": [], "tlist": [], "dir": false, "twocolumn": true, "css": null, "innight": false, "js": null, "fontsize": 16, "linespacing": 1.6, "contentwidth": 960, "fontfamily": '__embedded__' };

// 允许访问本扩展外部消息接口的扩展 ID（与 manifest externally_connectable.ids 保持一致）
var ALLOWED_EXTERNAL_IDS = {
    "ipmdlkljiioildfgddmmkfdmdfehboal": true,
    "fgkgjmmeoaojnhkeiebbibgbodikmgoe": true,
    "ablggfkhbegbnlgjbleoklekinmglnia": true
};

// 测试函数：向指定白名单扩展发送 init 消息
function extPing(extensionId) {
    if (!extensionId || !ALLOWED_EXTERNAL_IDS[extensionId]) {
        console.warn('extPing: extensionId is missing or not in allow list:', extensionId);
        return;
    }

    chrome.runtime.sendMessage(extensionId, { type: 'rabbook', content: 'init' }, function (response) {
        if (chrome.runtime.lastError) {
            var errMsg = chrome.runtime.lastError.message || '';
            // 对端未调用 sendResponse 时，Chrome 会返回该提示，但消息通常已成功送达。
            if (errMsg.indexOf('The message port closed before a response was received') !== -1) {
                console.info('extPing status:', extensionId, 'sent_no_response');
                return;
            }
            console.warn('extPing status:', extensionId, 'failed', errMsg);
            return;
        }
        console.log('extPing status:', extensionId, 'acknowledged', response);
    });
}

// 测试函数：向白名单内全部扩展发送 init 消息
function extPingAll(reason) {
    var ids = Object.keys(ALLOWED_EXTERNAL_IDS);
    if (ids.length === 0) {
        console.warn('extPingAll: allow list is empty');
        return;
    }

    console.info('extPingAll: sending init to', ids.length, 'extensions', reason ? ('reason=' + reason) : '');
    for (var i = 0; i < ids.length; i++) {
        extPing(ids[i]);
    }
}

globalThis.extPing = extPing;
globalThis.extPingAll = extPingAll;

chrome.runtime.onStartup.addListener(function () {
    extPingAll('onStartup');
});

chrome.runtime.onInstalled.addListener(function () {
    extPingAll('onInstalled');
});

// Allowd url , only from bookmark page!
var allowedurl = null;

// From Details page injection
var fromDetails = false;

// Bookmark list variable
var bklist = [];

var RABBOOK_DB_NAME = 'rabbook_db';
var RABBOOK_DB_VERSION = 2;
var RABBOOK_STACK_STORE = 'reading_stack';
var RABBOOK_TIME_STORE = 'reading_time';
var LEGACY_BOOKMARKS_MIGRATED_FLAG = 'bookmarks_db_migrated';
var READING_TIME_MAX_GAP_MS = 5 * 60 * 1000;
var READING_TIME_SCHEMA_VERSION = 1;

// 标志：配置是否已就绪
var configReady = false;

function openRabbookDb() {
    return new Promise(function (resolve, reject) {
        var req = indexedDB.open(RABBOOK_DB_NAME, RABBOOK_DB_VERSION);
        req.onupgradeneeded = function (event) {
            var db = event.target.result;
            if (!db.objectStoreNames.contains(RABBOOK_STACK_STORE)) {
                var store = db.createObjectStore(RABBOOK_STACK_STORE, { keyPath: 'id' });
                store.createIndex('updatedAt', 'updatedAt', { unique: false });
            }
            if (!db.objectStoreNames.contains(RABBOOK_TIME_STORE)) {
                var timeStore = db.createObjectStore(RABBOOK_TIME_STORE, { keyPath: 'id' });
                timeStore.createIndex('cururlKey', 'cururlKey', { unique: true });
                timeStore.createIndex('cururl', 'cururl', { unique: false });
                timeStore.createIndex('uniqueid', 'uniqueid', { unique: false });
                timeStore.createIndex('updatedAt', 'updatedAt', { unique: false });
            }
        };
        req.onsuccess = function () {
            resolve(req.result);
        };
        req.onerror = function () {
            reject(req.error || new Error('openRabbookDb failed'));
        };
    });
}

function txRequestToPromise(req) {
    return new Promise(function (resolve, reject) {
        req.onsuccess = function () {
            resolve(req.result);
        };
        req.onerror = function () {
            reject(req.error || new Error('indexedDB request failed'));
        };
    });
}

function getBookIdentityKey(rawUrl) {
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

function normalizeBookmarkRecord(input) {
    var cururl = (input && input.cururl) || '';
    var progressRaw = null;
    if (input && typeof input.curprog !== 'undefined') {
        progressRaw = input.curprog;
    } else if (input && typeof input.progress !== 'undefined') {
        progressRaw = input.progress;
    }
    var curprog = Number(progressRaw);
    if (!Number.isFinite(curprog)) {
        curprog = 0;
    }
    var cururlKey = getBookIdentityKey(cururl);
    return {
        id: 'book::' + cururlKey,
        cururlKey: cururlKey,
        rTitle: (input && input.rTitle) || '',
        cururl: cururl,
        curprog: curprog,
        bookuniqueid: (input && typeof input.bookuniqueid === 'string') ? input.bookuniqueid.trim() : '',
        updatedAt: Date.now()
    };
}

function normalizeUniqueId(raw) {
    if (typeof raw !== 'string') {
        return '';
    }
    return raw.trim();
}

function getDateKeyFromTs(ts) {
    var date = new Date(Number(ts || 0));
    if (isNaN(date.getTime())) {
        return '';
    }
    var year = date.getFullYear();
    var month = date.getMonth() + 1;
    var day = date.getDate();
    return year + '-' + (month < 10 ? '0' + month : '' + month) + '-' + (day < 10 ? '0' + day : '' + day);
}

function getHourKeyFromTs(ts) {
    var date = new Date(Number(ts || 0));
    if (isNaN(date.getTime())) {
        return '';
    }
    var year = date.getFullYear();
    var month = date.getMonth() + 1;
    var day = date.getDate();
    var hour = date.getHours();
    return year + '-' + (month < 10 ? '0' + month : '' + month) + '-' + (day < 10 ? '0' + day : '' + day) + ' ' + (hour < 10 ? '0' + hour : '' + hour);
}

function cloneDailyDurations(dailyDurations) {
    var next = {};
    if (!dailyDurations || typeof dailyDurations !== 'object') {
        return next;
    }
    var keys = Object.keys(dailyDurations);
    for (var i = 0; i < keys.length; i++) {
        var key = keys[i];
        var value = Number(dailyDurations[key] || 0);
        if (Number.isFinite(value) && value > 0) {
            next[key] = value;
        }
    }
    return next;
}

function mergeDailyDurations(target, source) {
    var next = cloneDailyDurations(target);
    if (!source || typeof source !== 'object') {
        return next;
    }
    var keys = Object.keys(source);
    for (var i = 0; i < keys.length; i++) {
        var key = keys[i];
        var value = Number(source[key] || 0);
        if (!Number.isFinite(value) || value <= 0) {
            continue;
        }
        next[key] = Number(next[key] || 0) + value;
    }
    return next;
}

function cloneHourlyDurations(hourlyDurations) {
    var next = {};
    if (!hourlyDurations || typeof hourlyDurations !== 'object') {
        return next;
    }
    var keys = Object.keys(hourlyDurations);
    for (var i = 0; i < keys.length; i++) {
        var key = keys[i];
        var value = Number(hourlyDurations[key] || 0);
        if (Number.isFinite(value) && value > 0) {
            next[key] = value;
        }
    }
    return next;
}

function mergeHourlyDurations(target, source) {
    var next = cloneHourlyDurations(target);
    if (!source || typeof source !== 'object') {
        return next;
    }
    var keys = Object.keys(source);
    for (var i = 0; i < keys.length; i++) {
        var key = keys[i];
        var value = Number(source[key] || 0);
        if (!Number.isFinite(value) || value <= 0) {
            continue;
        }
        next[key] = Number(next[key] || 0) + value;
    }
    return next;
}

function normalizeReadingEntry(input) {
    var item = input || {};
    var text = String(item.text || '').trim();
    if (!text) {
        return null;
    }
    var note = String(item.note || '').trim();
    var chapter = String(item.chapter || '').trim();
    var time = Number(item.time || 0);
    if (!Number.isFinite(time) || time <= 0) {
        time = Math.floor(Date.now() / 1000);
    }
    if (time > 1000000000000) {
        time = Math.floor(time / 1000);
    }
    return {
        text: text,
        note: note,
        chapter: chapter,
        time: Math.floor(time)
    };
}

function cloneReadingEntries(entries) {
    var next = [];
    if (!Array.isArray(entries)) {
        return next;
    }
    for (var i = 0; i < entries.length; i++) {
        var normalized = normalizeReadingEntry(entries[i]);
        if (normalized) {
            next.push(normalized);
        }
    }
    return next;
}

function mergeReadingEntries(target, source) {
    var merged = cloneReadingEntries(target);
    var seen = {};
    for (var i = 0; i < merged.length; i++) {
        var it = merged[i];
        var sig = [it.text, it.note, it.chapter, it.time].join('||');
        seen[sig] = true;
    }
    var list = cloneReadingEntries(source);
    for (var j = 0; j < list.length; j++) {
        var row = list[j];
        var key = [row.text, row.note, row.chapter, row.time].join('||');
        if (seen[key]) {
            continue;
        }
        seen[key] = true;
        merged.push(row);
    }
    return merged;
}

function buildReadingTimeId(cururlKey) {
    return 'time::' + cururlKey;
}

function normalizeReadingTimeRecord(input) {
    var cururl = (input && input.cururl) || '';
    var cururlKey = getBookIdentityKey(cururl);
    var uniqueid = normalizeUniqueId(input && (input.bookuniqueid || input.uniqueid));
    return {
        id: buildReadingTimeId(cururlKey),
        schemaVersion: READING_TIME_SCHEMA_VERSION,
        cururl: cururl,
        cururlKey: cururlKey,
        rTitle: (input && input.rTitle) || '',
        uniqueid: uniqueid,
        bookuniqueid: uniqueid,
        totalReadingMs: 0,
        totalReadingSec: 0,
        sessionCount: 0,
        dailyDurations: {},
        hourlyDurations: {},
        entries: [],
        firstReadAt: 0,
        lastReadAt: 0,
        updatedAt: Date.now(),
        lastMergeSource: ''
    };
}

function mergeReadingTimeRecord(existing, incoming, nowTs, source, options) {
    var opts = options || {};
    var shouldAccumulateTime = opts.accumulateTime !== false;
    var next = existing ? Object.assign({}, existing) : normalizeReadingTimeRecord(incoming);
    var deltaMs = 0;
    var prevTouch = Number(next.lastReadAt || next.updatedAt || 0);
    if (shouldAccumulateTime) {
        if (prevTouch > 0) {
            var gap = nowTs - prevTouch;
            if (gap > 0 && gap <= READING_TIME_MAX_GAP_MS) {
                deltaMs = gap;
            }
            if (gap > READING_TIME_MAX_GAP_MS) {
                next.sessionCount = Number(next.sessionCount || 0) + 1;
            }
        } else {
            next.sessionCount = Number(next.sessionCount || 0) + 1;
            next.firstReadAt = nowTs;
        }
    } else if (!next.firstReadAt) {
        next.firstReadAt = nowTs;
    }

    if (!next.firstReadAt) {
        next.firstReadAt = nowTs;
    }

    var incomingUniqueId = normalizeUniqueId(incoming && (incoming.bookuniqueid || incoming.uniqueid));
    if (incomingUniqueId) {
        next.uniqueid = incomingUniqueId;
        next.bookuniqueid = incomingUniqueId;
    } else {
        var keptUnique = normalizeUniqueId(next.uniqueid || next.bookuniqueid);
        next.uniqueid = keptUnique;
        next.bookuniqueid = keptUnique;
    }

    if (incoming && incoming.cururl) {
        next.cururl = incoming.cururl;
        next.cururlKey = getBookIdentityKey(incoming.cururl);
        next.id = buildReadingTimeId(next.cururlKey);
    }
    if (incoming && incoming.rTitle) {
        next.rTitle = incoming.rTitle;
    }

    next.totalReadingMs = Number(next.totalReadingMs || 0) + deltaMs;
    next.totalReadingSec = Math.floor(next.totalReadingMs / 1000);
    if (shouldAccumulateTime && deltaMs > 0) {
        var dateKey = getDateKeyFromTs(nowTs);
        if (dateKey) {
            next.dailyDurations = mergeDailyDurations(next.dailyDurations, (function () {
                var obj = {};
                obj[dateKey] = deltaMs;
                return obj;
            })());
        }
        var hourKey = getHourKeyFromTs(nowTs);
        if (hourKey) {
            next.hourlyDurations = mergeHourlyDurations(next.hourlyDurations, (function () {
                var obj = {};
                obj[hourKey] = deltaMs;
                return obj;
            })());
        }
    } else {
        next.dailyDurations = cloneDailyDurations(next.dailyDurations);
        next.hourlyDurations = cloneHourlyDurations(next.hourlyDurations);
    }
    next.entries = cloneReadingEntries(next.entries);
    next.lastReadAt = nowTs;
    next.updatedAt = nowTs;
    next.lastMergeSource = source || 'updatebk';
    next.schemaVersion = READING_TIME_SCHEMA_VERSION;
    return next;
}

async function getBookmarkByCururlKey(cururlKey) {
    var key = String(cururlKey || '').trim();
    if (!key) {
        return null;
    }
    var db = await openRabbookDb();
    try {
        var tx = db.transaction(RABBOOK_STACK_STORE, 'readonly');
        var store = tx.objectStore(RABBOOK_STACK_STORE);
        var directId = 'book::' + key;
        var direct = await txRequestToPromise(store.get(directId));
        if (direct) {
            return direct;
        }
        var rows = await txRequestToPromise(store.getAll());
        for (var i = 0; i < rows.length; i++) {
            var row = rows[i];
            if (!row) {
                continue;
            }
            var rowKey = row.cururlKey || getBookIdentityKey(row.cururl || '');
            if (rowKey === key) {
                return row;
            }
        }
        return null;
    } finally {
        db.close();
    }
}

async function ensureBookmarkUniqueIdByInput(input) {
    var raw = input || {};
    var key = String(raw.cururlKey || getBookIdentityKey(raw.cururl || '') || '').trim();
    var uid = normalizeUniqueId(raw.bookuniqueid);
    if (!key) {
        return { ok: false, error: 'missing_cururl_key' };
    }

    var existing = await getBookmarkByCururlKey(key);
    if (!existing) {
        var cururl = String(raw.cururl || '').trim();
        if (!cururl) {
            return { ok: false, error: 'bookmark_not_found_and_missing_cururl' };
        }
        await upsertBookmarkRecord({
            cururl: cururl,
            rTitle: String(raw.rTitle || ''),
            curprog: Number(raw.curprog || 0),
            bookuniqueid: uid
        });
        var created = await getBookmarkByCururlKey(key);
        return { ok: !!created, record: created || null };
    }

    if (uid) {
        var updated = await updateBookmarkUniqueId(existing.id, uid);
        if (!updated || !updated.ok) {
            return updated || { ok: false, error: 'bookmark_set_uniqueid_failed' };
        }
        existing = updated.record || existing;
    }
    return { ok: true, record: existing };
}

async function appendReadingEntryByBookmark(input, entryInput) {
    var base = normalizeBookmarkRecord(input);
    if (!base.cururlKey) {
        return { ok: false, error: 'invalid_cururl' };
    }
    var normalizedEntry = normalizeReadingEntry(entryInput);
    if (!normalizedEntry) {
        return { ok: false, error: 'invalid_entry_text' };
    }
    var uid = normalizeUniqueId(input && (input.bookuniqueid || input.uniqueid));
    if (!uid) {
        return { ok: false, error: 'missing_uniqueid' };
    }

    var db = await openRabbookDb();
    try {
        var tx = db.transaction(RABBOOK_TIME_STORE, 'readwrite');
        var store = tx.objectStore(RABBOOK_TIME_STORE);
        var recId = buildReadingTimeId(base.cururlKey);
        var existing = await txRequestToPromise(store.get(recId));
        if (!existing) {
            var rows = await txRequestToPromise(store.getAll());
            for (var i = 0; i < rows.length; i++) {
                var row = rows[i];
                if (!row) {
                    continue;
                }
                var rowKey = row.cururlKey || getBookIdentityKey(row.cururl || '');
                if (rowKey === base.cururlKey) {
                    existing = row;
                    break;
                }
            }
        }
        var merged = mergeReadingTimeRecord(existing, {
            cururl: base.cururl,
            rTitle: base.rTitle,
            bookuniqueid: uid
        }, Date.now(), 'reading_entry_add', { accumulateTime: false });
        merged.entries = mergeReadingEntries(merged.entries, [normalizedEntry]);
        merged.uniqueid = uid;
        merged.bookuniqueid = uid;
        merged.lastMergeSource = 'reading_entry_add';
        await txRequestToPromise(store.put(merged));
        return { ok: true, record: merged };
    } finally {
        db.close();
    }
}

async function upsertBookmarkRecord(input) {
    var record = normalizeBookmarkRecord(input);
    if (!record.id || !record.cururl || !record.cururlKey) {
        return { ok: false, error: 'invalid_bookmark' };
    }
    var db = await openRabbookDb();
    try {
        var tx = db.transaction(RABBOOK_STACK_STORE, 'readwrite');
        var store = tx.objectStore(RABBOOK_STACK_STORE);
        var existing = null;

        // 兼容旧版本数据：优先按 cururl 精确匹配已有记录，避免不同 cururl 被自动合并
        var rows = await txRequestToPromise(store.getAll());
        for (var i = 0; i < rows.length; i++) {
            var row = rows[i];
            if (!row) {
                continue;
            }
            var rowUrlKey = row.cururlKey || getBookIdentityKey(row.cururl || '');
            if (rowUrlKey === record.cururlKey) {
                existing = row;
                break;
            }
        }

        if (existing && existing.id) {
            record.id = existing.id;
        }
        var hasInputUniqueId = !!(input && Object.prototype.hasOwnProperty.call(input, 'bookuniqueid'));
        if (!hasInputUniqueId && existing && typeof existing.bookuniqueid === 'string') {
            record.bookuniqueid = existing.bookuniqueid;
        }
        await txRequestToPromise(store.put(record));
        return { ok: true, record: record };
    } finally {
        db.close();
    }
}

async function mergeReadingTimeByBookmark(input, source) {
    var base = normalizeBookmarkRecord(input);
    if (!base.cururlKey) {
        return { ok: false, error: 'invalid_cururl' };
    }
    var db = await openRabbookDb();
    try {
        var tx = db.transaction(RABBOOK_TIME_STORE, 'readwrite');
        var store = tx.objectStore(RABBOOK_TIME_STORE);
        var recId = buildReadingTimeId(base.cururlKey);
        var existing = await txRequestToPromise(store.get(recId));
        if (!existing) {
            var rows = await txRequestToPromise(store.getAll());
            for (var i = 0; i < rows.length; i++) {
                var row = rows[i];
                if (!row) {
                    continue;
                }
                var rowKey = row.cururlKey || getBookIdentityKey(row.cururl || '');
                if (rowKey === base.cururlKey) {
                    existing = row;
                    break;
                }
            }
        }
        var merged = mergeReadingTimeRecord(existing, {
            cururl: base.cururl,
            rTitle: base.rTitle,
            bookuniqueid: base.bookuniqueid
        }, Date.now(), source || 'updatebk');
        await txRequestToPromise(store.put(merged));
        return { ok: true, record: merged };
    } finally {
        db.close();
    }
}

async function listReadingTimeRecords() {
    var db = await openRabbookDb();
    try {
        var tx = db.transaction(RABBOOK_TIME_STORE, 'readonly');
        var store = tx.objectStore(RABBOOK_TIME_STORE);
        var all = await txRequestToPromise(store.getAll());
        all.sort(function (a, b) {
            return (b.updatedAt || 0) - (a.updatedAt || 0);
        });
        return all;
    } finally {
        db.close();
    }
}

function normalizeEntryCompareText(value) {
    return String(value || '').trim();
}

function isSameReadingEntry(candidate, expectedText, expectedChapter, expectedTime) {
    if (!candidate) {
        return false;
    }
    if (normalizeEntryCompareText(candidate.text) !== normalizeEntryCompareText(expectedText)) {
        return false;
    }
    if (normalizeEntryCompareText(candidate.chapter) !== normalizeEntryCompareText(expectedChapter)) {
        return false;
    }
    if (expectedTime === null || expectedTime === undefined || expectedTime === '') {
        return true;
    }
    return Number(candidate.time || 0) === Number(expectedTime || 0);
}

async function findReadingRecordByMessage(store, msg) {
    var cururlKey = String((msg && msg.cururlKey) || '').trim();
    var bookmarkId = String((msg && msg.bookmarkId) || '').trim();

    if (!cururlKey && bookmarkId.indexOf('book::') === 0) {
        cururlKey = bookmarkId.slice('book::'.length);
    }

    if (cururlKey) {
        var byId = await txRequestToPromise(store.get(buildReadingTimeId(cururlKey)));
        if (byId) {
            return byId;
        }
    }

    var rows = await txRequestToPromise(store.getAll());
    if (cururlKey) {
        for (var i = 0; i < rows.length; i++) {
            var row = rows[i];
            if (!row) {
                continue;
            }
            var rowKey = String(row.cururlKey || getBookIdentityKey(row.cururl || '') || '').trim();
            if (rowKey && rowKey === cururlKey) {
                return row;
            }
        }
    }

    var expectedText = msg && msg.entryText;
    var expectedChapter = msg && msg.entryChapter;
    var expectedTime = msg && msg.entryTime;
    for (var j = 0; j < rows.length; j++) {
        var rec = rows[j];
        if (!rec) {
            continue;
        }
        var entries = Array.isArray(rec.entries) ? rec.entries : [];
        for (var k = 0; k < entries.length; k++) {
            if (isSameReadingEntry(entries[k], expectedText, expectedChapter, expectedTime)) {
                return rec;
            }
        }
    }

    return null;
}

async function deleteReadingEntryByMessage(msg) {
    var entryText = String(msg && msg.entryText || '').trim();
    var entryChapter = String(msg && msg.entryChapter || '').trim();
    var entryTime = msg && msg.entryTime;
    if (!entryText) {
        return { ok: false, error: 'missing_entry_info' };
    }

    var db = await openRabbookDb();
    try {
        var tx = db.transaction(RABBOOK_TIME_STORE, 'readwrite');
        var store = tx.objectStore(RABBOOK_TIME_STORE);
        var rec = await findReadingRecordByMessage(store, msg);
        if (!rec) {
            return { ok: false, error: 'record_not_found' };
        }

        var entries = Array.isArray(rec.entries) ? rec.entries : [];
        var deleted = false;
        var nextEntries = [];
        for (var i = 0; i < entries.length; i++) {
            var e = entries[i];
            if (!deleted && isSameReadingEntry(e, entryText, entryChapter, entryTime)) {
                deleted = true;
                continue;
            }
            nextEntries.push(e);
        }
        if (!deleted) {
            return { ok: false, error: 'entry_not_found' };
        }

        rec.entries = nextEntries;
        await txRequestToPromise(store.put(rec));
        try {
            notifyDetailsRefresh();
        } catch (e) {}
        return { ok: true };
    } catch (err) {
        return {
            ok: false,
            error: 'delete_failed',
            message: err && err.message ? err.message : String(err)
        };
    } finally {
        db.close();
    }
}

async function updateReadingEntryByMessage(msg) {
    var entryText = String(msg && msg.entryText || '').trim();
    var entryChapter = String(msg && msg.entryChapter || '').trim();
    var entryTime = msg && msg.entryTime;
    var newNote = String(msg && msg.newNote || '').trim();
    if (!entryText) {
        return { ok: false, error: 'missing_entry_info' };
    }

    var db = await openRabbookDb();
    try {
        var tx = db.transaction(RABBOOK_TIME_STORE, 'readwrite');
        var store = tx.objectStore(RABBOOK_TIME_STORE);
        var rec = await findReadingRecordByMessage(store, msg);
        if (!rec) {
            return { ok: false, error: 'record_not_found' };
        }

        var entries = Array.isArray(rec.entries) ? rec.entries : [];
        var updated = false;
        for (var i = 0; i < entries.length; i++) {
            if (isSameReadingEntry(entries[i], entryText, entryChapter, entryTime)) {
                entries[i].note = newNote;
                updated = true;
                break;
            }
        }
        if (!updated) {
            return { ok: false, error: 'entry_not_found' };
        }

        rec.entries = entries;
        await txRequestToPromise(store.put(rec));
        try {
            notifyDetailsRefresh();
        } catch (e) {}
        return { ok: true };
    } catch (err) {
        return {
            ok: false,
            error: 'update_failed',
            message: err && err.message ? err.message : String(err)
        };
    } finally {
        db.close();
    }
}

async function cleanupOrphanReadingTimeRecords() {
    var db = await openRabbookDb();
    try {
        var readTx = db.transaction([RABBOOK_STACK_STORE, RABBOOK_TIME_STORE], 'readonly');
        var stackStore = readTx.objectStore(RABBOOK_STACK_STORE);
        var timeStore = readTx.objectStore(RABBOOK_TIME_STORE);

        var bookmarks = await txRequestToPromise(stackStore.getAll());
        var rows = await txRequestToPromise(timeStore.getAll());

        var existingKeys = {};
        for (var i = 0; i < bookmarks.length; i++) {
            var bk = bookmarks[i];
            if (!bk) {
                continue;
            }
            var bkKey = bk.cururlKey || getBookIdentityKey(bk.cururl || '');
            if (bkKey) {
                existingKeys[bkKey] = true;
            }
        }

        var grouped = {};
        for (var j = 0; j < rows.length; j++) {
            var row = rows[j];
            if (!row || !row.id) {
                continue;
            }
            var rowKey = row.cururlKey || getBookIdentityKey(row.cururl || '');
            if (!rowKey || !existingKeys[rowKey]) {
                grouped['__orphan__' + j] = grouped['__orphan__' + j] || [];
                grouped['__orphan__' + j].push(row);
                continue;
            }
            if (!grouped[rowKey]) {
                grouped[rowKey] = [];
            }
            grouped[rowKey].push(row);
        }

        var deleteIds = [];
        var keys = Object.keys(grouped);
        for (var g = 0; g < keys.length; g++) {
            var key = keys[g];
            var list = grouped[key] || [];
            if (key.indexOf('__orphan__') === 0) {
                for (var o = 0; o < list.length; o++) {
                    deleteIds.push(list[o].id);
                }
                continue;
            }
            if (list.length <= 1) {
                continue;
            }
            list.sort(function (a, b) {
                return Number(b && b.updatedAt || 0) - Number(a && a.updatedAt || 0);
            });
            for (var d = 1; d < list.length; d++) {
                deleteIds.push(list[d].id);
            }
        }

        if (deleteIds.length > 0) {
            var writeTx = db.transaction(RABBOOK_TIME_STORE, 'readwrite');
            var writeStore = writeTx.objectStore(RABBOOK_TIME_STORE);
            for (var x = 0; x < deleteIds.length; x++) {
                await txRequestToPromise(writeStore.delete(deleteIds[x]));
            }
        }

        return {
            ok: true,
            deletedCount: deleteIds.length,
            totalCount: rows.length,
            remainingCount: rows.length - deleteIds.length
        };
    } finally {
        db.close();
    }
}

async function syncReadingTimeUniqueIdByBookmarkId(bookmarkId, bookuniqueid) {
    if (!bookmarkId || bookmarkId.indexOf('::') <= 0) {
        return { ok: false, error: 'invalid_bookmark_id' };
    }
    var cururlKey = bookmarkId.slice(bookmarkId.indexOf('::') + 2);
    if (!cururlKey) {
        return { ok: false, error: 'invalid_cururl_key' };
    }
    var db = await openRabbookDb();
    try {
        var tx = db.transaction(RABBOOK_TIME_STORE, 'readwrite');
        var store = tx.objectStore(RABBOOK_TIME_STORE);
        var recId = buildReadingTimeId(cururlKey);
        var existing = await txRequestToPromise(store.get(recId));
        if (!existing) {
            var rows = await txRequestToPromise(store.getAll());
            for (var i = 0; i < rows.length; i++) {
                var row = rows[i];
                if (!row) {
                    continue;
                }
                var rowKey = row.cururlKey || getBookIdentityKey(row.cururl || '');
                if (rowKey === cururlKey) {
                    existing = row;
                    break;
                }
            }
        }
        if (!existing) {
            return { ok: true, skipped: true };
        }
        var merged = mergeReadingTimeRecord(existing, {
            cururl: existing.cururl,
            rTitle: existing.rTitle,
            bookuniqueid: normalizeUniqueId(bookuniqueid)
        }, Date.now(), 'bookmark_uniqueid_sync', { accumulateTime: false });
        await txRequestToPromise(store.put(merged));
        return { ok: true, record: merged };
    } finally {
        db.close();
    }
}

async function compactBookmarkStoreByBook() {
    var db = await openRabbookDb();
    try {
        var tx = db.transaction(RABBOOK_STACK_STORE, 'readwrite');
        var store = tx.objectStore(RABBOOK_STACK_STORE);
        var rows = await txRequestToPromise(store.getAll());
        var grouped = {};

        for (var i = 0; i < rows.length; i++) {
            var row = rows[i];
            if (!row || !row.cururl) {
                continue;
            }
            var key = getBookIdentityKey(row.cururl);
            if (!key) {
                continue;
            }
            if (!grouped[key]) {
                grouped[key] = [];
            }
            grouped[key].push(row);
        }

        var keys = Object.keys(grouped);
        for (var g = 0; g < keys.length; g++) {
            var bookKey = keys[g];
            var list = grouped[bookKey];
            if (!list || list.length === 0) {
                continue;
            }

            list.sort(function (a, b) {
                return (b.updatedAt || 0) - (a.updatedAt || 0);
            });

            var latest = list[0];
            var pickedUniqueId = '';
            for (var u = 0; u < list.length; u++) {
                var cand = normalizeUniqueId(list[u].bookuniqueid);
                if (cand) {
                    pickedUniqueId = cand;
                    break;
                }
            }

            var merged = {
                id: 'book::' + bookKey,
                cururlKey: bookKey,
                rTitle: latest.rTitle || '',
                cururl: latest.cururl || '',
                curprog: Number.isFinite(Number(latest.curprog)) ? Number(latest.curprog) : 0,
                bookuniqueid: pickedUniqueId,
                updatedAt: latest.updatedAt || Date.now()
            };

            await txRequestToPromise(store.put(merged));
            for (var d = 0; d < list.length; d++) {
                var rec = list[d];
                if (!rec || rec.id === merged.id) {
                    continue;
                }
                await txRequestToPromise(store.delete(rec.id));
            }
        }
    } finally {
        db.close();
    }
}

async function compactReadingTimeStoreByBook() {
    var db = await openRabbookDb();
    try {
        var tx = db.transaction(RABBOOK_TIME_STORE, 'readwrite');
        var store = tx.objectStore(RABBOOK_TIME_STORE);
        var rows = await txRequestToPromise(store.getAll());
        var grouped = {};

        for (var i = 0; i < rows.length; i++) {
            var row = rows[i];
            if (!row || !row.cururl) {
                continue;
            }
            var key = getBookIdentityKey(row.cururl);
            if (!key) {
                continue;
            }
            if (!grouped[key]) {
                grouped[key] = [];
            }
            grouped[key].push(row);
        }

        var keys = Object.keys(grouped);
        for (var g = 0; g < keys.length; g++) {
            var bookKey = keys[g];
            var list = grouped[bookKey];
            if (!list || list.length === 0) {
                continue;
            }

            list.sort(function (a, b) {
                return (b.updatedAt || 0) - (a.updatedAt || 0);
            });

            var latest = list[0];
            var totalMs = 0;
            var firstReadAt = 0;
            var lastReadAt = 0;
            var sessionCount = 0;
            var dailyDurations = {};
            var hourlyDurations = {};
            var mergedEntries = [];
            var pickedUniqueId = '';

            for (var m = 0; m < list.length; m++) {
                var rec = list[m];
                var ms = Number(rec.totalReadingMs || 0);
                if (Number.isFinite(ms) && ms > 0) {
                    totalMs += ms;
                }
                var sCnt = Number(rec.sessionCount || 0);
                if (Number.isFinite(sCnt) && sCnt > 0) {
                    sessionCount += sCnt;
                }
                var fr = Number(rec.firstReadAt || 0);
                if (fr > 0) {
                    firstReadAt = firstReadAt > 0 ? Math.min(firstReadAt, fr) : fr;
                }
                var lr = Number(rec.lastReadAt || 0);
                if (lr > 0) {
                    lastReadAt = Math.max(lastReadAt, lr);
                }
                var uid = normalizeUniqueId(rec.uniqueid || rec.bookuniqueid);
                if (!pickedUniqueId && uid) {
                    pickedUniqueId = uid;
                }
                dailyDurations = mergeDailyDurations(dailyDurations, rec.dailyDurations || {});
                hourlyDurations = mergeHourlyDurations(hourlyDurations, rec.hourlyDurations || {});
                mergedEntries = mergeReadingEntries(mergedEntries, rec.entries || []);
            }

            var merged = {
                id: buildReadingTimeId(bookKey),
                schemaVersion: READING_TIME_SCHEMA_VERSION,
                cururl: latest.cururl || '',
                cururlKey: bookKey,
                rTitle: latest.rTitle || '',
                uniqueid: pickedUniqueId,
                bookuniqueid: pickedUniqueId,
                totalReadingMs: totalMs,
                totalReadingSec: Math.floor(totalMs / 1000),
                sessionCount: sessionCount,
                dailyDurations: dailyDurations,
                hourlyDurations: hourlyDurations,
                entries: mergedEntries,
                firstReadAt: firstReadAt,
                lastReadAt: lastReadAt || (latest.updatedAt || Date.now()),
                updatedAt: latest.updatedAt || Date.now(),
                lastMergeSource: 'compact_by_book'
            };

            await txRequestToPromise(store.put(merged));
            for (var d = 0; d < list.length; d++) {
                var old = list[d];
                if (!old || old.id === merged.id) {
                    continue;
                }
                await txRequestToPromise(store.delete(old.id));
            }
        }
    } finally {
        db.close();
    }
}

async function listBookmarkRecords() {
    var db = await openRabbookDb();
    try {
        var tx = db.transaction(RABBOOK_STACK_STORE, 'readonly');
        var store = tx.objectStore(RABBOOK_STACK_STORE);
        var all = await txRequestToPromise(store.getAll());
        all.sort(function (a, b) {
            return (b.updatedAt || 0) - (a.updatedAt || 0);
        });
        return all;
    } finally {
        db.close();
    }
}

async function exportBookData(bookmarkId) {
    if (!bookmarkId) {
        return { ok: false, error: 'missing_bookmark_id' };
    }
    var db = await openRabbookDb();
    try {
        var tx = db.transaction([RABBOOK_STACK_STORE, RABBOOK_TIME_STORE], 'readonly');
        var stackStore = tx.objectStore(RABBOOK_STACK_STORE);
        var timeStore = tx.objectStore(RABBOOK_TIME_STORE);
        
        var bookmark = await txRequestToPromise(stackStore.get(bookmarkId));
        if (!bookmark) {
            return { ok: false, error: 'bookmark_not_found' };
        }
        
        var cururlKey = bookmark.cururlKey || getBookIdentityKey(bookmark.cururl || '');
        if (!cururlKey && bookmarkId.indexOf('book::') === 0) {
            cururlKey = bookmarkId.slice('book::'.length);
        }
        
        var readingRecords = [];
        if (cururlKey) {
            var mainReadingId = buildReadingTimeId(cururlKey);
            var mainRecord = await txRequestToPromise(timeStore.get(mainReadingId));
            if (mainRecord) {
                readingRecords.push(mainRecord);
            }
            
            var allRecords = await txRequestToPromise(timeStore.getAll());
            for (var i = 0; i < allRecords.length; i++) {
                var record = allRecords[i];
                if (!record || record.id === mainReadingId) {
                    continue;
                }
                var recordKey = record.cururlKey || getBookIdentityKey(record.cururl || '');
                if (recordKey === cururlKey) {
                    readingRecords.push(record);
                }
            }
        }
        
        return {
            ok: true,
            bookmark: bookmark,
            readingRecords: readingRecords
        };
    } finally {
        db.close();
    }
}

async function deleteBookmarkById(bookmarkId) {
    if (!bookmarkId) {
        return { ok: false, error: 'missing_bookmark_id' };
    }
    var readingRecordDeleted = 0;
    var entryDeletedCount = 0;
    var db = await openRabbookDb();
    try {
        var tx = db.transaction([RABBOOK_STACK_STORE, RABBOOK_TIME_STORE], 'readwrite');
        var stackStore = tx.objectStore(RABBOOK_STACK_STORE);
        var timeStore = tx.objectStore(RABBOOK_TIME_STORE);
        var existing = await txRequestToPromise(stackStore.get(bookmarkId));
        await txRequestToPromise(stackStore.delete(bookmarkId));

        var cururlKey = '';
        if (existing) {
            cururlKey = existing.cururlKey || getBookIdentityKey(existing.cururl || '');
        }
        if (!cururlKey && bookmarkId.indexOf('book::') === 0) {
            cururlKey = bookmarkId.slice('book::'.length);
        }

        if (cururlKey) {
            var mainReadingId = buildReadingTimeId(cururlKey);
            var mainRecord = await txRequestToPromise(timeStore.get(mainReadingId));
            if (mainRecord) {
                readingRecordDeleted += 1;
                entryDeletedCount += Array.isArray(mainRecord.entries) ? mainRecord.entries.length : 0;
            }
            await txRequestToPromise(timeStore.delete(mainReadingId));

            // 兼容旧数据：若历史记录 id 未按 time::cururlKey 生成，则按 cururlKey 再扫一遍清理。
            var rows = await txRequestToPromise(timeStore.getAll());
            for (var i = 0; i < rows.length; i++) {
                var row = rows[i];
                if (!row) {
                    continue;
                }
                var rowKey = row.cururlKey || getBookIdentityKey(row.cururl || '');
                if (rowKey === cururlKey) {
                    if (row.id !== mainReadingId) {
                        readingRecordDeleted += 1;
                        entryDeletedCount += Array.isArray(row.entries) ? row.entries.length : 0;
                    }
                    await txRequestToPromise(timeStore.delete(row.id));
                }
            }
        }
        return { ok: true, readingRecordDeleted: readingRecordDeleted, entryDeletedCount: entryDeletedCount };
    } finally {
        db.close();
    }
}

async function updateBookmarkUniqueId(bookmarkId, bookuniqueid) {
    if (!bookmarkId) {
        return { ok: false, error: 'missing_bookmark_id' };
    }
    var updatedRecord = null;
    var db = await openRabbookDb();
    try {
        var tx = db.transaction(RABBOOK_STACK_STORE, 'readwrite');
        var store = tx.objectStore(RABBOOK_STACK_STORE);
        var existing = await txRequestToPromise(store.get(bookmarkId));
        if (!existing) {
            return { ok: false, error: 'bookmark_not_found' };
        }
        existing.bookuniqueid = (typeof bookuniqueid === 'string' ? bookuniqueid.trim() : '');
        existing.updatedAt = Date.now();
        await txRequestToPromise(store.put(existing));
        updatedRecord = existing;
    } finally {
        db.close();
    }

    if (updatedRecord) {
        await syncReadingTimeUniqueIdByBookmarkId(bookmarkId, updatedRecord.bookuniqueid);
        return { ok: true, record: updatedRecord };
    }
    return { ok: false, error: 'bookmark_update_failed' };
}

async function updateBookmarkUniqueIdByCururlKey(cururlKey, bookuniqueid) {
    var key = String(cururlKey || '').trim();
    if (!key) {
        return { ok: false, error: 'missing_cururl_key' };
    }
    var bookmarkId = 'book::' + key;
    return updateBookmarkUniqueId(bookmarkId, bookuniqueid);
}

function notifyDetailsRefresh() {
    if (detport != null) {
        detport.postMessage({ "type": "action", "content": "refresh" });
    }
}

function migrateLegacyBookmarksIfNeeded() {
    return new Promise(function (resolve) {
        chrome.storage.local.get({ bookmarks: [], bookmarks_db_migrated: false }, async function (data) {
            if (data.bookmarks_db_migrated) {
                resolve();
                return;
            }

            var oldList = data.bookmarks || [];
            try {
                for (var i = 0; i < oldList.length; i++) {
                    await upsertBookmarkRecord(oldList[i]);
                }
                var setObj = {};
                setObj[LEGACY_BOOKMARKS_MIGRATED_FLAG] = true;
                chrome.storage.local.set(setObj, function () {
                    console.info('Legacy bookmarks migrated to IndexedDB:', oldList.length);
                    resolve();
                });
            } catch (err) {
                console.warn('migrateLegacyBookmarksIfNeeded failed:', err && err.message ? err.message : err);
                resolve();
            }
        });
    });
}

function getLatestConfig(callback) {
    chrome.storage.local.get(DEFAULT_CONFIG, function (r) {
        config = r;
        callback(r);
    });
}

// 读取配置，一旦就绪开始处理连接
function initConfigAndListener() {
    getLatestConfig(function (r) {
        /* 配置说明 */
        /*
        "clist": [], 自定义内容选择符列表
         "flist": [], 自定义正文内容过滤列表
         "plist":[], 自定义上一页翻页选择符列表
        "nlist": [],  自定义下一页翻页选择符列表
        "tlist": [], 自定义标题选择符列表
         "dir": false, 翻页方向，即纵向或者横向
         "twocolumn":false,  双页阅读模式
         "css": null, 自定义css样式
         "js": null , 自定义脚本
        */
        configReady = true;
        migrateLegacyBookmarksIfNeeded().finally(function () {
            Promise.allSettled([compactBookmarkStoreByBook(), compactReadingTimeStoreByBook()]).finally(function () {
            // 处理队列中等待的连接
                flushPendingConnections();
            });
        });
    });
}

// 缓存等待连接的队列（在配置就绪前收到的连接）
var pendingConnections = [];

function flushPendingConnections() {
    while (pendingConnections.length > 0) {
        var port = pendingConnections.shift();
        handlePort(port);
    }
}

// 监听来自其他部分（如content script）的连接请求
// 注意：必须在顶层立即注册，否则service worker被唤醒时可能错过连接事件
chrome.runtime.onConnect.addListener(function (port) {
    console.log("Connected with port:", port);
    if (configReady) {
        handlePort(port);
    } else {
        // 配置尚未就绪，先放入队列
        pendingConnections.push(port);
    }
});

function isAllowedExternalSender(sender) {
    return !!(sender && sender.id && ALLOWED_EXTERNAL_IDS[sender.id]);
}

function getExternalConfigPayload() {
    var payload = config || DEFAULT_CONFIG;
    return {
        clist: payload.clist,
        flist: payload.flist,
        plist: payload.plist,
        nlist: payload.nlist,
        tlist: payload.tlist,
        dir: payload.dir,
        twocolumn: payload.twocolumn,
        css: payload.css,
        js: payload.js,
        innight: payload.innight,
        fontsize: payload.fontsize,
        linespacing: payload.linespacing,
        contentwidth: payload.contentwidth,
        fontfamily: payload.fontfamily
    };
}

function normalizeXmnoteEndpoint(rawEndpoint) {
    var endpoint = String(rawEndpoint || '').trim();
    if (!endpoint) {
        endpoint = '127.0.0.1:8080';
    }
    if (/^https?:\/\//i.test(endpoint)) {
        try {
            var parsed = new URL(endpoint);
            var pathname = parsed.pathname || '/';
            if (pathname === '/' || pathname === '') {
                parsed.pathname = '/send';
            }
            return parsed.toString();
        } catch (e) {
            return endpoint;
        }
    }
    var normalized = endpoint.replace(/\/+$/, '');
    if (/\/send$/i.test(normalized)) {
        return 'http://' + normalized;
    }
    return 'http://' + normalized + '/send';
}

function normalizeXmnoteImportRecord(rec) {
    var row = rec || {};
    var uniqueid = normalizeUniqueId(row.uniqueid || row.bookuniqueid);
    var hourly = row.hourlyDurations && typeof row.hourlyDurations === 'object' ? row.hourlyDurations : {};
    var hourKeys = Object.keys(hourly);
    var fuzzy = [];
    for (var i = 0; i < hourKeys.length; i++) {
        var hourKey = hourKeys[i];
        var seconds = Math.floor(Number(hourly[hourKey] || 0) / 1000);
        if (!Number.isFinite(seconds) || seconds <= 0) {
            continue;
        }
        var hourTs = Math.floor(new Date(hourKey.replace(' ', 'T') + ':00:00').getTime() / 1000);
        if (!Number.isFinite(hourTs) || hourTs <= 0) {
            continue;
        }
        fuzzy.push({
            date: hourTs,
            durationSeconds: seconds
        });
    }

    // 兼容旧数据：无小时桶时回落到天桶（按每天 00:00 作为时间点）。
    if (fuzzy.length === 0) {
        var daily = row.dailyDurations && typeof row.dailyDurations === 'object' ? row.dailyDurations : {};
        var dateKeys = Object.keys(daily);
        for (var d = 0; d < dateKeys.length; d++) {
            var dateKey = dateKeys[d];
            var daySeconds = Math.floor(Number(daily[dateKey] || 0) / 1000);
            if (!Number.isFinite(daySeconds) || daySeconds <= 0) {
                continue;
            }
            var dayTs = Math.floor(new Date(dateKey + 'T00:00:00').getTime() / 1000);
            if (!Number.isFinite(dayTs) || dayTs <= 0) {
                continue;
            }
            fuzzy.push({ date: dayTs, durationSeconds: daySeconds });
        }
    }
    fuzzy.sort(function (a, b) { return a.date - b.date; });

    var totalSeconds = Number(row.totalReadingSec || Math.floor(Number(row.totalReadingMs || 0) / 1000) || 0);
    if ((!fuzzy || fuzzy.length === 0) && totalSeconds > 0) {
        var fallbackDay = Math.floor(new Date().setHours(0, 0, 0, 0) / 1000);
        fuzzy.push({ date: fallbackDay, durationSeconds: totalSeconds });
    }

    var lastReadAtSec = Math.floor(Number(row.lastReadAt || row.updatedAt || Date.now()) / 1000);
    var rangeNote = '';
    if (fuzzy.length > 0) {
        var firstBucket = fuzzy[0];
        var lastBucket = fuzzy[fuzzy.length - 1];
        var rangeStart = new Date(firstBucket.date * 1000).toISOString();
        var rangeEnd = new Date((lastBucket.date + 3600) * 1000).toISOString();
        rangeNote = '\n小时范围: ' + rangeStart + ' ~ ' + rangeEnd;
    }
    var rawEntries = Array.isArray(row.entries) ? row.entries : [];
    var mappedEntries = [];
    for (var ei = 0; ei < rawEntries.length; ei++) {
        var item = rawEntries[ei] || {};
        var entryText = String(item.text || '').trim();
        if (!entryText) {
            continue;
        }
        var entryTs = Number(item.time || 0);
        if (!Number.isFinite(entryTs) || entryTs <= 0) {
            entryTs = lastReadAtSec;
        }
        if (entryTs > 1000000000000) {
            entryTs = Math.floor(entryTs / 1000);
        }
        mappedEntries.push({
            text: entryText,
            note: String(item.note || '').trim(),
            chapter: String(item.chapter || '').trim(),
            time: Math.floor(entryTs)
        });
    }
    return {
        uniqueid: uniqueid,
        title: String(row.title || row.rTitle || ''),
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

async function importReadingTimeToXmnote(endpoint, records) {
    var list = Array.isArray(records) ? records : [];
    if (list.length === 0) {
        return { ok: false, error: 'empty_records', message: 'no records to import' };
    }
    var normalized = [];
    for (var i = 0; i < list.length; i++) {
        var item = normalizeXmnoteImportRecord(list[i]);
        if (!item.uniqueid) {
            continue;
        }
        normalized.push(item);
    }
    if (normalized.length === 0) {
        return { ok: false, error: 'missing_uniqueid', message: 'all selected books missing uniqueid' };
    }

    var url = normalizeXmnoteEndpoint(endpoint);
    var importedCount = 0;

    function fetchWithTimeout(targetUrl, options, timeoutMs) {
        var controller = new AbortController();
        var timer = setTimeout(function () {
            controller.abort();
        }, timeoutMs);

        var opts = Object.assign({}, options, { signal: controller.signal });
        return fetch(targetUrl, opts).finally(function () {
            clearTimeout(timer);
        });
    }

    for (var j = 0; j < normalized.length; j++) {
        var payload = normalized[j];
        var resp;
        try {
            resp = await fetchWithTimeout(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            }, 12000);
        } catch (err) {
            var isAbort = !!(err && (err.name === 'AbortError' || String(err.message || '').indexOf('aborted') >= 0));
            return {
                ok: false,
                error: isAbort ? 'network_timeout' : 'network_error',
                message: isAbort ? '请求超时（12s），请检查 xmnote 地址、手机与电脑网络、以及 App 是否停留在 API 导入页' : (err && err.message ? err.message : String(err)),
                requestUrl: url
            };
        }

        var body = null;
        try {
            body = await resp.json();
        } catch (e) {
            body = null;
        }

        if (!resp.ok) {
            return {
                ok: false,
                error: 'remote_http_error',
                message: body && (body.message || body.error) ? String(body.message || body.error) : ('HTTP ' + resp.status),
                status: resp.status,
                requestUrl: url
            };
        }

        // xmnote 文档：真正状态码在响应体 code 字段。
        if (body && typeof body.code !== 'undefined' && Number(body.code) !== 200) {
            return {
                ok: false,
                error: 'remote_business_error',
                message: String(body.message || ('code=' + body.code)),
                status: resp.status,
                requestUrl: url
            };
        }
        importedCount += 1;
    }

    return {
        ok: true,
        importedCount: importedCount,
        requestUrl: url
    };
}

function openDetailsPage(openSection, callback) {
    var detailsBaseUrl = chrome.runtime.getURL('src/details.html');
    var targetUrl = detailsBaseUrl;
    if (openSection) {
        targetUrl += '?openSection=' + encodeURIComponent(openSection);
    }

    chrome.tabs.query({}, function (tabs) {
        var existingTab = (tabs || []).find(function (tab) {
            return tab && typeof tab.url === 'string' && tab.url.indexOf(detailsBaseUrl) === 0;
        });

        if (existingTab) {
            chrome.tabs.update(existingTab.id, { active: true, url: targetUrl }, function () {
                if (chrome.runtime.lastError) {
                    callback({ ok: false, error: 'open_details_failed', message: chrome.runtime.lastError.message });
                    return;
                }
                callback({ ok: true, type: 'readpaperutils', content: 'open', action: 'details_opened' });
            });
            return;
        }

        chrome.tabs.create({ url: targetUrl, active: true }, function () {
            if (chrome.runtime.lastError) {
                callback({ ok: false, error: 'open_details_failed', message: chrome.runtime.lastError.message });
                return;
            }
            callback({ ok: true, type: 'readpaperutils', content: 'open', action: 'details_opened' });
        });
    });
}

function handleExternalRequest(message, respond) {
    var msg = message || {};

    // 兼容约定：任何 content=init 的输入都返回 { ok: true }
    if (msg.content === 'init') {
        respond({ ok: true });
        return false;
    }

    if (msg.type === 'readpaperutils' && msg.content === 'heartbeat') {
        respond({ ok: true, type: 'rabbook', content: 'ack' });
        return false;
    }

    // 新协议：{ type: 'readpaperutils', content: 'open' }
    if (msg.type === 'readpaperutils' && msg.content === 'open') {
        openDetailsPage('aboutdetails', function (result) {
            respond(result);
        });
        return true;
    }

    // 兼容已有简化协议
    if (msg.type === 'ping') {
        respond({ ok: true, type: 'pong', extension: 'LeanRabbook' });
        return false;
    }

    if (msg.type === 'getConfig') {
        getLatestConfig(function () {
            respond({ ok: true, type: 'config', config: getExternalConfigPayload() });
        });
        return true;
    }

    if (msg.type === 'injectActiveTab') {
        getLatestConfig(function (latest) {
            readPage(latest, null);
            respond({ ok: true, type: 'inject_started' });
        });
        return true;
    }

    respond({ ok: false, error: 'unsupported_type', type: msg.type || null, content: msg.content || null });
    return false;
}

// 外部一次性消息接口
chrome.runtime.onMessageExternal.addListener(function (message, sender, sendResponse) {
    if (!isAllowedExternalSender(sender)) {
        sendResponse({ ok: false, error: 'forbidden_sender' });
        return false;
    }

    return handleExternalRequest(message, sendResponse);
});

// 外部长连接接口
chrome.runtime.onConnectExternal.addListener(function (port) {
    if (!isAllowedExternalSender(port && port.sender)) {
        try {
            port.disconnect();
        } catch (e) {
            console.warn('external port disconnect failed:', e.message);
        }
        return;
    }

    // 外部扩展连入时，主动发送初始化握手消息
    port.postMessage({ ok: true, type: 'rabbook', content: 'init' });

    port.onMessage.addListener(function (msg) {
        handleExternalRequest(msg, function (payload) {
            port.postMessage(payload);
        });
    });
});

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
    if (!sender || sender.id !== chrome.runtime.id) {
        return false;
    }
    var msg = message || {};
    if (msg.type === 'bookmarksGetAll') {
        listBookmarkRecords().then(function (rows) {
            sendResponse({ ok: true, bookmarks: rows });
        }).catch(function (err) {
            sendResponse({ ok: false, error: 'bookmarks_get_failed', message: err && err.message ? err.message : String(err) });
        });
        return true;
    }

    if (msg.type === 'bookmarkDeleteById') {
        deleteBookmarkById(msg.id).then(function (ret) {
            if (ret.ok) {
                notifyDetailsRefresh();
            }
            sendResponse(ret);
        }).catch(function (err) {
            sendResponse({ ok: false, error: 'bookmark_delete_failed', message: err && err.message ? err.message : String(err) });
        });
        return true;
    }

    if (msg.type === 'bookmarkSetUniqueId') {
        updateBookmarkUniqueId(msg.id, msg.bookuniqueid).then(function (ret) {
            if (ret.ok) {
                notifyDetailsRefresh();
            }
            sendResponse(ret);
        }).catch(function (err) {
            sendResponse({ ok: false, error: 'bookmark_set_uniqueid_failed', message: err && err.message ? err.message : String(err) });
        });
        return true;
    }

    if (msg.type === 'bookmarkSetUniqueIdByCururlKey') {
        updateBookmarkUniqueIdByCururlKey(msg.cururlKey, msg.bookuniqueid).then(function (ret) {
            if (ret.ok) {
                notifyDetailsRefresh();
            }
            sendResponse(ret);
        }).catch(function (err) {
            sendResponse({ ok: false, error: 'bookmark_set_uniqueid_by_key_failed', message: err && err.message ? err.message : String(err) });
        });
        return true;
    }

    if (msg.type === 'bookmarkGetByCururlKey') {
        getBookmarkByCururlKey(msg.cururlKey).then(function (record) {
            sendResponse({ ok: true, record: record || null });
        }).catch(function (err) {
            sendResponse({ ok: false, error: 'bookmark_get_by_key_failed', message: err && err.message ? err.message : String(err) });
        });
        return true;
    }

    if (msg.type === 'bookmarkEnsureUniqueId') {
        ensureBookmarkUniqueIdByInput(msg).then(function (ret) {
            if (ret && ret.ok) {
                notifyDetailsRefresh();
            }
            sendResponse(ret);
        }).catch(function (err) {
            sendResponse({ ok: false, error: 'bookmark_ensure_uniqueid_failed', message: err && err.message ? err.message : String(err) });
        });
        return true;
    }

    if (msg.type === 'readingTimeGetAll') {
        listReadingTimeRecords().then(function (rows) {
            sendResponse({ ok: true, readingTime: rows });
        }).catch(function (err) {
            sendResponse({ ok: false, error: 'readingtime_get_failed', message: err && err.message ? err.message : String(err) });
        });
        return true;
    }

    if (msg.type === 'readingTimeCleanupOrphans') {
        cleanupOrphanReadingTimeRecords().then(function (ret) {
            if (ret && ret.ok) {
                notifyDetailsRefresh();
            }
            sendResponse(ret);
        }).catch(function (err) {
            sendResponse({ ok: false, error: 'readingtime_cleanup_failed', message: err && err.message ? err.message : String(err) });
        });
        return true;
    }

    if (msg.type === 'readingEntryAdd') {
        appendReadingEntryByBookmark(msg, msg.entry).then(function (ret) {
            if (ret && ret.ok) {
                notifyDetailsRefresh();
            }
            sendResponse(ret);
        }).catch(function (err) {
            sendResponse({ ok: false, error: 'reading_entry_add_failed', message: err && err.message ? err.message : String(err) });
        });
        return true;
    }

    if (msg.type === 'xmnoteImportReadingTime') {
        importReadingTimeToXmnote(msg.endpoint, msg.records).then(function (ret) {
            sendResponse(ret);
        }).catch(function (err) {
            sendResponse({ ok: false, error: 'xmnote_import_failed', message: err && err.message ? err.message : String(err) });
        });
        return true;
    }

    if (msg.type === 'readingEntriesGetAll') {
        listReadingTimeRecords().then(function (rows) {
            var allEntries = [];
            rows.forEach(function (row) {
                var normalizedUniqueId = normalizeUniqueId((row && (row.bookuniqueid || row.uniqueid)) || '');
                var entries = Array.isArray(row.entries) ? row.entries : [];
                entries.forEach(function (entry) {
                    if (!entry || String(entry.chapter || '') === '阅读时间同步') {
                        return;
                    }
                    allEntries.push({
                        bookmarkId: row.bookmarkId,
                        uniqueid: normalizedUniqueId,
                        rTitle: row.rTitle,
                        cururlKey: row.cururlKey,
                        text: entry.text,
                        note: entry.note,
                        chapter: entry.chapter,
                        time: entry.time
                    });
                });
            });
            sendResponse({ ok: true, entries: allEntries });
        }).catch(function (err) {
            sendResponse({ ok: false, error: 'reading_entries_get_failed', message: err && err.message ? err.message : String(err) });
        });
        return true;
    }

    if (msg.type === 'readingEntryDelete') {
        deleteReadingEntryByMessage(msg).then(function (ret) {
            sendResponse(ret);
        }).catch(function (err) {
            sendResponse({ ok: false, error: 'delete_failed', message: err && err.message ? err.message : String(err) });
        });
        return true;
    }

    if (msg.type === 'readingEntryUpdate') {
        updateReadingEntryByMessage(msg).then(function (ret) {
            sendResponse(ret);
        }).catch(function (err) {
            sendResponse({ ok: false, error: 'update_failed', message: err && err.message ? err.message : String(err) });
        });
        return true;
    }

    return false;
});

// 初始化配置读取
initConfigAndListener();

chrome.storage.onChanged.addListener(function (changes, areaName) {
    if (areaName !== 'local') {
        return;
    }
    // 配置变更后同步更新 SW 内存缓存，避免下一次注入读取旧值。
    getLatestConfig(function () {});
});

function handlePort(port) {
    // Initialize the connection action:
    // Action for ' Pop Page Port"
    if (port.name == 'popup') {
        // 可选：处理断开连接
        port.onDisconnect.addListener(function () {
            popport = null;
            console.log("Pop Port disconnected");
        });
        popport = port;
        popport.onMessage.addListener(function (msg) {
            console.log("Message received in Service Worker:", msg);
            if (msg.type == "Inject") {
                fromDetails = false; // 覆盖掉可能存在的从书签引发的注入请求 
                // To Inject from serviced worker
                readPage(config, msg.content);
            }
        });
    }

    function tryInjectScript(config, allowedurl) {
        // 延时检查是否加载成功
        const checkInterval = 2000; // 2秒
        chrome.tabs.query({}, function (tabs) {
            // 检查是否已经存在目标页面
            const existingTab = tabs.find(tab => tab.url.includes(allowedurl));
            if (existingTab) {
                console.log("Got Page Existed");
                // 如果找到已有页面，则切换到该页面
                chrome.tabs.update(existingTab.id, { active: true }, function () {
                    // 然后试图获取当前window开始注入
                    chrome.tabs.query({ active: true, currentWindow: true }, function (activeTabs) {
                        const curtab = activeTabs[0];
                        console.log(curtab);
                        if (curtab) {
                            readPage(config, curtab); // 调用注入脚本的函数
                        } else {
                            console.error("Failed to get the active tab.");
                        }
                    });
                });
            } else {
                console.log("Page not yet loaded.");
                if (fromDetails) {
                    // 如果指定了循环检查，则继续尝试
                    setTimeout(() => tryInjectScript(config, allowedurl), checkInterval);
                }
            }
        });
    }

    // Action for ' Details Page Port"
    // Mul-port supported
    if (port.name == 'detailspage') {
        // 每次连接配置页面，重新load一次配置
        getLatestConfig(function (r) {
            // 可选：处理断开连接
            port.onDisconnect.addListener(function () {
                //detport = detport.filter(p => p.sender.id !== port.sender.id);
                detport = null;
                console.log("Detail Port disconnected");
            });
            //detport.push(port);
            detport = port;
            detport.onMessage.addListener(function (msg) {
                console.log("Message received in Service Worker:", msg);
                if (msg.type == "register") {
                    fromDetails = true;
                    allowedurl = msg.url; //注册网址，等待注入
                    tryInjectScript(r, allowedurl);
                }
            });
        });
    }

    // Actions for 'Content Script Page Port'
    if (port.name == 'contpage') {
        cntport = port;
        cntport.postMessage({ "type": "cfg", "clist": config.clist, "flist": config.flist, "plist": config.plist, "nlist": config.nlist, "dir": config.dir, "twocolumn": config.twocolumn, "tlist": config.tlist, "css": config.css, "js": config.js,"innight":config.innight, "fontsize": config.fontsize, "linespacing": config.linespacing, "contentwidth": config.contentwidth, "fontfamily": config.fontfamily });
        // 发送完配置后恢复当前 tab 的阅读进度，避免重连后回到第一页。
        var senderUrl = port && port.sender && port.sender.tab ? port.sender.tab.url : '';
        var restoredProgress = findBookmarkProgressForUrl(senderUrl, config && config.bookmarks ? config.bookmarks : []);
        cntport.postMessage({ "type": "go", "progress": restoredProgress });
        // 监听从这个 cntport 收到的消息
        //  用来更新书签
        cntport.onMessage.addListener(function (msg) {
            console.log("Message received in Service Worker:", msg);
            if (msg.type == "configupdate") {
                chrome.storage.local.set({ 'innight': msg.innight}, function () {
                    console.log("Refresh config updated from content page");
                });
            };
            if (msg.type == "updatebk") {
                // 主链路写入 IndexedDB；同时维护内存与 legacy storage 兼容恢复逻辑。
                bklist = Array.isArray(config && config.bookmarks) ? config.bookmarks : [];
                var incomingProgress = clampProgress(msg.progress);
                if (incomingProgress === null) {
                    incomingProgress = clampProgress(msg.curprog);
                }
                if (incomingProgress === null) {
                    incomingProgress = 0;
                }
                var incomingUrl = String(msg.cururl || '').trim();
                if (!incomingUrl) {
                    return;
                }
                // Update bookmark
                for (var i = 0; i < bklist.length; i++) {
                    if (sameNovel(bklist[i].cururl, incomingUrl)) {
                        bklist = bklist.slice(0, i).concat(bklist.slice(i + 1, bklist.length));
                        break;
                    }
                };
                var incomingBookmark = { rTitle: String(msg.rTitle || ''), cururl: incomingUrl, curprog: incomingProgress };
                bklist.push(incomingBookmark);

                upsertBookmarkRecord(incomingBookmark).then(function () {
                    return mergeReadingTimeByBookmark(incomingBookmark, 'updatebk');
                }).then(function () {
                    config.bookmarks = bklist;
                    chrome.storage.local.set({ 'bookmarks': bklist }, function () {
                        console.info("Bookmarks Updated Done");
                        notifyDetailsRefresh();
                    });
                }).catch(function (err) {
                    console.warn('updatebk persist failed:', err && err.message ? err.message : String(err));
                });
            }
        });

        // 可选：处理断开连接
        cntport.onDisconnect.addListener(function () {
            cntport = null;
            console.log("Cont cntport disconnected");
        });
    }
};


//Judge the page url?
// If its in same novel then Replace
function sameNovel(u1, u2) {
    var su1 = u1.split("/");
    var su2 = u2.split("/");
    // avoid last char is /
    if (su1[su1.length - 1] == "") su1.pop();
    if (su2[su2.length - 1] == "") su2.pop();
    //length:
    if (su1.length != su2.length) {
        return false;
    } else {
        var cr = true;
        for (var i = 0; i < su1.length - 1; i++) {
            if (su1[i] != su2[i]) {
                cr = false;
                break;
            }
        }
        return cr;
    }
};

function normalizeBookmarkUrl(url) {
    if (!url || typeof url !== 'string') {
        return '';
    }
    try {
        var parsed = new URL(url);
        var normalizedPath = (parsed.pathname || '/').replace(/\/+$/, '') || '/';
        return parsed.origin + normalizedPath;
    } catch (e) {
        return String(url).split('#')[0].split('?')[0].replace(/\/+$/, '');
    }
}

function clampProgress(raw) {
    var n = Number(raw);
    if (!isFinite(n)) {
        return null;
    }
    if (n < 0) {
        return 0;
    }
    if (n > 1) {
        return 1;
    }
    return n;
}

function findBookmarkProgressForUrl(tabUrl, bookmarks) {
    var list = Array.isArray(bookmarks) ? bookmarks : [];
    if (list.length === 0) {
        return null;
    }

    var normalizedTabUrl = normalizeBookmarkUrl(tabUrl);

    // 优先精确匹配章节 URL。
    for (var i = list.length - 1; i >= 0; i--) {
        var bm = list[i] || {};
        if (normalizeBookmarkUrl(bm.cururl) === normalizedTabUrl) {
            var exactProgress = clampProgress(bm.curprog);
            if (exactProgress !== null) {
                return exactProgress;
            }
        }
    }

    // 兼容旧数据：章节 URL 不一致时，退化为同书匹配的最近记录。
    for (var j = list.length - 1; j >= 0; j--) {
        var fallbackBm = list[j] || {};
        if (sameNovel(fallbackBm.cururl || '', tabUrl || '')) {
            var fallbackProgress = clampProgress(fallbackBm.curprog);
            if (fallbackProgress !== null) {
                return fallbackProgress;
            }
        }
    }

    return null;
}

// 检查 URL 是否可注入（排除 about:blank、chrome://、edge:// 等不可注入页面）
function isInjectionAllowed(tabUrl) {
    if (!tabUrl) return false;
    // 不允许的协议前缀
    const deniedPrefixes = ['about:', 'chrome:', 'chrome-error:', 'edge:', 'edge-error:', 'chrome-extension:', 'chrome-search:', 'devtools:'];
    for (const prefix of deniedPrefixes) {
        if (tabUrl.startsWith(prefix)) return false;
    }
    // 允许 http(s)://, ftp://, file:// 等
    return true;
}

// 带安全检查的连接函数，避免 Unchecked runtime.lastError
function safeConnect(name) {
    try {
        var p = chrome.runtime.connect({ name: name });
        // 检查连接是否成功
        if (chrome.runtime.lastError) {
            console.warn('safeConnect(' + name + ') failed:', chrome.runtime.lastError.message);
            return null;
        }
        return p;
    } catch (e) {
        console.warn('safeConnect(' + name + ') threw:', e.message);
        return null;
    }
}

// 注入解析
function readPage(conf = null, targetTab = null) {
    var curtab = targetTab;
    function tabInjection(tabIn) {
        // 安全检查：确保 tab 的 URL 允许注入
        chrome.tabs.get(tabIn.id, function(tb) {
            if (chrome.runtime.lastError) {
                console.error('tabInjection: tab not found', chrome.runtime.lastError.message);
                return;
            }
            if (!isInjectionAllowed(tb.url)) {
                console.warn('tabInjection: injection not allowed on URL:', tb.url);
                return;
            }
            curtab = tb;
            const rTitle = curtab.title;
            delayStop(function () {
                getLatestConfig(function (latestConf) {
                    var injectedConf = latestConf || conf || DEFAULT_CONFIG;
                    // 插入 CSS 文件
                    chrome.scripting.insertCSS({
                        target: { tabId: tabIn.id },
                        files: ["src/design-tokens.css", "src/main.css", "src/font/style.css"]
                    }).catch(function (err) {
                        console.warn('insertCSS(files) failed:', err && err.message ? err.message : String(err));
                    });

                    // 如果 css 变量有值，插入 CSS 代码
                    if (injectedConf.css == null || injectedConf.css == "") {
                        console.log('no css');
                    } else {
                        chrome.scripting.insertCSS({
                            target: { tabId: tabIn.id },
                            css: injectedConf.css
                        }).catch(function (err) {
                            console.warn('insertCSS(text) failed:', err && err.message ? err.message : String(err));
                        });
                    }
                    // 执行 JavaScript 文件
                    chrome.scripting.executeScript({
                        target: { tabId: tabIn.id },
                        files: ["src/pre-main.js", "src/html-handling.js", "src/pageRewrite.js", "src/main.js"]
                    }).catch(function (err) {
                        console.warn('executeScript failed:', err && err.message ? err.message : String(err));
                    });
                });
            });
        });
    }

    if (curtab == null) {// 对当前tab注入
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
            if (tabs && tabs.length > 0) {
                curtab = tabs[0];
                tabInjection(curtab);
            } else {
                console.warn('readPage: no active tab found');
            }
        });
    } else { //对指定的tab注入
        tabInjection(curtab);
    }

    function delayStop(func) {
        chrome.tabs.get(curtab.id, function (tb) {
            if (chrome.runtime.lastError) {
                console.error('delayStop: tab not found', chrome.runtime.lastError.message);
                return;
            }
            if (tb.status != "complete") {
                setTimeout(function () {
                    delayStop(func);
                }, 1000);
            } else {
                func();
            }
        });
    };
};
