// service_worker.js
var popport = null;
var cntport = null;
//var detport = [];
var detport = null;
var config = null;

// Allowd url , only from bookmark page!
var allowedurl = null;

// Step1 Fetch the config!
// Step2 Config the Port!
// Step3 Config the background monitor action!
chrome.storage.local.get({ 'bookmarks': [], "clist": [], "flist": [], "plist": [], "nlist": [], "tlist": [], "dir": false, "twocolumn": false, "css": null, "js": null }, function (r) {
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
    // 监听来自其他部分（如content script）的连接请求
    chrome.runtime.onConnect.addListener(function (port) {
        console.log("Connected with port:", port);
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
                    // To Inject from serviced worker
                    readPage(config, msg.content);
                }
            });
        }


        // Action for ' Details Page Port"
        // Mul-port supported
        if (port.name == 'detailspage') {
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
                    allowedurl = msg.url; //注册网址，等待注入
                    setTimeout(function () {
                        chrome.tabs.query({}, function (tabs) {
                            // 检查是否已经存在目标页面
                            const existingTab = tabs.find(tab => tab.url.includes(allowedurl));
                            if (existingTab) {
                                // 如果找到已有页面，则切换到该页面
                                chrome.tabs.update(existingTab.id, { active: true });
                                // 然后试图获取当前window开始注入
                                chrome.tabs.query({ active: true}, function (tabs) {
                                    curtab = tabs[0];
                                    console.log(curtab);
                                    readPage(config, curtab);
                                });
                            } else {
                                //chrome.tabs.create({ url: targetUrl });
                            }
                        });
                    }, 100);
                }
            });
        }

        // Actions for 'Content Script Page Port'
        if (port.name == 'contpage') {
            cntport = port;
            cntport.postMessage({ "type": "cfg", "clist": config.clist, "flist": config.flist, "plist": config.plist, "nlist": config.nlist, "dir": config.dir, "twocolumn": config.twocolumn, "tlist": config.tlist, "css": config.css, "js": config.js });
            // 发送完配置后，理论上就Go了
            // TODO: Progress passing
            cntport.postMessage({ "type": "go", "progress": null });
            // 监听从这个 cntport 收到的消息
            //  用来更新书签
            cntport.onMessage.addListener(function (msg) {
                console.log("Message received in Service Worker:", msg);
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

    });
});


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

// 注入解析
function readPage(conf = null, targetTab = null) {
    var curtab = targetTab;
    function tabInjection(tabIn) {
        const rTitle = curtab.title;
        delayStop(function () {
            // 插入 CSS 文件
            chrome.scripting.insertCSS({
                target: { tabId: tabIn.id },
                files: ["main.css"]
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
                files: ["pre-main.js", "html-handling.js", "pageRewrite.js", "main.js"]
            });
        });
    }

    if (curtab == null) {// 对当前tab注入
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
            curtab = tabs[0];
            tabInjection(curtab);
        });
    } else { //对指定的tab注入
        tabInjection(curtab);
    }

    function delayStop(func) {
        chrome.tabs.get(curtab.id, function (tb) {
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