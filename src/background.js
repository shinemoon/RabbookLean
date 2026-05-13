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
var RABBOOK_DB_VERSION = 1;
var RABBOOK_STACK_STORE = 'reading_stack';
var LEGACY_BOOKMARKS_MIGRATED_FLAG = 'bookmarks_db_migrated';

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

function getUrlIdentityKey(rawUrl) {
    if (!rawUrl || typeof rawUrl !== 'string') {
        return '';
    }
    try {
        var parsed = new URL(rawUrl);
        var path = parsed.pathname || '/';
        if (path.length > 1 && path[path.length - 1] === '/') {
            path = path.slice(0, -1);
        }
        return parsed.origin + path + (parsed.search || '');
    } catch (e) {
        var normalized = rawUrl.split('#')[0];
        if (normalized.length > 1 && normalized[normalized.length - 1] === '/') {
            normalized = normalized.slice(0, -1);
        }
        return normalized;
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
    var cururlKey = getUrlIdentityKey(cururl);
    return {
        id: 'url::' + cururlKey,
        cururlKey: cururlKey,
        rTitle: (input && input.rTitle) || '',
        cururl: cururl,
        curprog: curprog,
        bookuniqueid: (input && typeof input.bookuniqueid === 'string') ? input.bookuniqueid.trim() : '',
        updatedAt: Date.now()
    };
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
            var rowUrlKey = row.cururlKey || getUrlIdentityKey(row.cururl || '');
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

async function deleteBookmarkById(bookmarkId) {
    if (!bookmarkId) {
        return { ok: false, error: 'missing_bookmark_id' };
    }
    var db = await openRabbookDb();
    try {
        var tx = db.transaction(RABBOOK_STACK_STORE, 'readwrite');
        var store = tx.objectStore(RABBOOK_STACK_STORE);
        await txRequestToPromise(store.delete(bookmarkId));
        return { ok: true };
    } finally {
        db.close();
    }
}

async function updateBookmarkUniqueId(bookmarkId, bookuniqueid) {
    if (!bookmarkId) {
        return { ok: false, error: 'missing_bookmark_id' };
    }
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
        return { ok: true, record: existing };
    } finally {
        db.close();
    }
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
            // 处理队列中等待的连接
            flushPendingConnections();
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
        // 发送完配置后，理论上就Go了
        // TODO: Progress passing
        cntport.postMessage({ "type": "go", "progress": null });
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
                upsertBookmarkRecord(msg).then(function (ret) {
                    if (ret.ok) {
                        console.info("Bookmarks Updated Done (IndexedDB)");
                        notifyDetailsRefresh();
                        return;
                    }
                    console.warn('updatebk failed:', ret.error || 'unknown');
                }).catch(function (err) {
                    console.error('updatebk exception:', err && err.message ? err.message : err);
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

// 检查 URL 是否可注入（排除 about:blank、chrome://、edge:// 等不可注入页面）
function isInjectionAllowed(tabUrl) {
    if (!tabUrl) return false;
    // 不允许的协议前缀
    const deniedPrefixes = ['about:', 'chrome:', 'edge:', 'chrome-extension:', 'chrome-search:', 'devtools:'];
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
                    });

                    // 如果 css 变量有值，插入 CSS 代码
                    if (injectedConf.css == null || injectedConf.css == "") {
                        console.log('no css');
                    } else {
                        chrome.scripting.insertCSS({
                            target: { tabId: tabIn.id },
                            css: injectedConf.css
                        });
                    }
                    // 执行 JavaScript 文件
                    chrome.scripting.executeScript({
                        target: { tabId: tabIn.id },
                        files: ["src/pre-main.js", "src/html-handling.js", "src/pageRewrite.js", "src/main.js"]
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
