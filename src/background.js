// service_worker.js
var popport = null;
var cntport = null;
//var detport = [];
var detport = null;
var config = null;

// Allowd url , only from bookmark page!
var allowedurl = null;

// From Details page injection
var fromDetails = false;

// Bookmark list variable
var bklist = [];

// 标志：配置是否已就绪
var configReady = false;

// 读取配置，一旦就绪开始处理连接
function initConfigAndListener() {
    chrome.storage.local.get({ 'bookmarks': [], "clist": [], "flist": [], "plist": [], "nlist": [], "tlist": [], "dir": false, "twocolumn": true, "css": null, "innight":false, "js": null }, function (r) {
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
        config = r;
        configReady = true;
        // 处理队列中等待的连接
        flushPendingConnections();
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

// 初始化配置读取
initConfigAndListener();

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
        chrome.storage.local.get({ 'bookmarks': [], "clist": [], "flist": [], "plist": [], "nlist": [], "tlist": [], "dir": false, "twocolumn": true, "css": null, "innight":false, "js": null }, function (r) {
            config = r;
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
                    tryInjectScript(config, allowedurl);
                }
            });
        });
    }

    // Actions for 'Content Script Page Port'
    if (port.name == 'contpage') {
        cntport = port;
        cntport.postMessage({ "type": "cfg", "clist": config.clist, "flist": config.flist, "plist": config.plist, "nlist": config.nlist, "dir": config.dir, "twocolumn": config.twocolumn, "tlist": config.tlist, "css": config.css, "js": config.js,"innight":config.innight, "fontsize": config.fontsize, "linespacing": config.linespacing, "contentwidth": config.contentwidth });
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
                // To update bookmark in serviced worker
                bklist = config.bookmarks;
                // Update bookmark
                for (var i = 0; i < bklist.length; i++) {
                    if (sameNovel(bklist[i].cururl, msg.cururl)) {
                        bklist = bklist.slice(0, i).concat(bklist.slice(i + 1, bklist.length));
                        break;
                    }
                };
                bklist.push({ rTitle: msg.rTitle, cururl: msg.cururl, curprog: msg.curprog });
                chrome.storage.local.set({ 'bookmarks': bklist }, function () {
                    console.info("Bookmarks Updated Done");
                    if (detport != null)
                        detport.postMessage({ "type": "action", "content": "refresh" });
                    /*
                    detport.forEach(port => {
                        port.postMessage({ "type": "action", "content": "refresh" });
                    });
                    */
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
                // 插入 CSS 文件
                chrome.scripting.insertCSS({
                    target: { tabId: tabIn.id },
                    files: ["src/main.css", "src/font/style.css"]
                });

                // 如果 css 变量有值，插入 CSS 代码
                if (conf.css == null || conf.css == "") {
                    console.log('no css');
                } else {
                    chrome.scripting.insertCSS({
                        target: { tabId: tabIn.id },
                        css: conf.css
                    });
                }
                // 执行 JavaScript 文件
                chrome.scripting.executeScript({
                    target: { tabId: tabIn.id },
                    files: ["src/pre-main.js", "src/html-handling.js", "src/pageRewrite.js", "src/main.js"]
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
