/* 
    Text Handling Functions
*/

// ============================================================
// 守卫：在受限页面（about:blank, data:, chrome:// 等）提前退出
// 这些页面无法正常连接 chrome.runtime，会导致控制台报错
// 同时也禁止在 iframe 中运行（扩展内容脚本只应在顶层窗口运行）
// ============================================================
(function () {
    var url = window.location.href;
    var deniedProtocols = ['about:', 'data:', 'chrome:', 'edge:', 'chrome-extension:', 'chrome-search:', 'devtools:', 'file:'];
    for (var i = 0; i < deniedProtocols.length; i++) {
        if (url.startsWith(deniedProtocols[i])) {
            console.info('main.js: early exit on restricted page:', url);
            return; // 立即终止当前脚本
        }
    }
    // 禁止在 iframe 中执行
    if (window.self !== window.top) {
        console.info('main.js: early exit on iframe (all_frames guard)');
        return; // 立即终止当前脚本
    }
})();

// Page Parameter
var readerEngineInstance;   // Access instance
var notinpaging = true; // Avoid wheel paging to fast
var pgtimer = null;
var PGTIME = 800;

var reconnected = false;


// 全局变量
var buffers = [null, null, null, null, null];


var target = null;
var port;



// 检查当前页面 URL 是否允许注入操作
function isValidPageForInjection() {
    var url = window.location.href;
    if (!url) return false;
    // 拒绝 about:、chrome://、edge://、chrome-extension:// 等不可注入页面
    var deniedPrefixes = ['about:', 'chrome:', 'edge:', 'chrome-extension:', 'chrome-search:', 'devtools:', 'data:'];
    for (var i = 0; i < deniedPrefixes.length; i++) {
        if (url.startsWith(deniedPrefixes[i])) {
            console.warn("isValidPageForInjection: injection not allowed on URL:", url);
            return false;
        }
    }
    return true;
}

// 将排版配置作为 CSS 自定义属性应用到根元素
// 这样 main.css 中的 var(--reader-font-size) 等变量就能生效
function normalizeFontFamily(fontfamily) {
    if (typeof fontfamily !== 'string') {
        return '';
    }
    var cleaned = fontfamily.replace(/[\n\r;{}]/g, '').trim();
    if (!cleaned || cleaned.length > 160) {
        return '';
    }
    var segments = cleaned.split(',').map(function (s) {
        return s.replace(/["']/g, '').trim();
    }).filter(function (s) {
        return !!s;
    });
    if (segments.length === 0) {
        return '';
    }

    var safeSegments = [];
    var genericFamilies = {
        'serif': true,
        'sans-serif': true,
        'monospace': true,
        'cursive': true,
        'fantasy': true,
        'system-ui': true,
        'ui-serif': true,
        'ui-sans-serif': true,
        'ui-monospace': true,
        'ui-rounded': true,
    };

    for (var i = 0; i < segments.length; i++) {
        var seg = segments[i].replace(/[^\w\u4e00-\u9fa5\s\-]/g, '').trim();
        if (!seg) {
            continue;
        }
        if (genericFamilies[seg]) {
            safeSegments.push(seg);
        } else {
            safeSegments.push('"' + seg + '"');
        }
    }
    return safeSegments.join(', ');
}

function isEmbeddedFontSelection(fontfamily) {
    if (typeof fontfamily !== 'string') {
        return true;
    }
    var trimmed = fontfamily.trim();
    return trimmed === '' || trimmed === '__embedded__';
}

function applyReaderConfig(fontsize, linespacing, contentwidth, fontfamily) {
    var root = document.documentElement;
    root.style.setProperty('--reader-font-size', (fontsize || 16) + 'px');
    root.style.setProperty('--reader-line-height', linespacing || 1.6);
    root.style.setProperty('--reader-content-width', (contentwidth || 960) + 'px');

    if (isEmbeddedFontSelection(fontfamily)) {
        root.style.setProperty('--reader-font-family', 'var(--font-reader-embedded)');
        return;
    }

    var normalizedFontFamily = normalizeFontFamily(fontfamily);
    if (normalizedFontFamily) {
        root.style.setProperty('--reader-font-family', normalizedFontFamily + ', var(--font-serif)');
    } else {
        root.style.setProperty('--reader-font-family', 'var(--font-reader-embedded)');
    }
}

function applyReaderConfigFromStorageOrFallback(fallbackMsg) {
    var defaults = {
        fontsize: 16,
        linespacing: 1.6,
        contentwidth: 960,
        fontfamily: '__embedded__',
        dir: false,
        twocolumn: true,
    };

    chrome.storage.local.get(defaults, function (stored) {
        var fs = Number(stored.fontsize);
        var lh = Number(stored.linespacing);
        var cw = Number(stored.contentwidth);
        var ff = typeof stored.fontfamily === 'string' ? stored.fontfamily : defaults.fontfamily;
        var dir = typeof stored.dir === 'boolean' ? stored.dir : defaults.dir;
        var twocol = typeof stored.twocolumn === 'boolean' ? stored.twocolumn : defaults.twocolumn;

        if (!Number.isFinite(fs) || fs <= 0) {
            fs = Number(fallbackMsg && fallbackMsg.fontsize);
            if (!Number.isFinite(fs) || fs <= 0) {
                fs = defaults.fontsize;
            }
        }
        if (!Number.isFinite(lh) || lh <= 0) {
            lh = Number(fallbackMsg && fallbackMsg.linespacing);
            if (!Number.isFinite(lh) || lh <= 0) {
                lh = defaults.linespacing;
            }
        }
        if (!Number.isFinite(cw) || cw <= 0) {
            cw = Number(fallbackMsg && fallbackMsg.contentwidth);
            if (!Number.isFinite(cw) || cw <= 0) {
                cw = defaults.contentwidth;
            }
        }
        if (!ff || !ff.trim()) {
            ff = (fallbackMsg && typeof fallbackMsg.fontfamily === 'string' && fallbackMsg.fontfamily.trim())
                ? fallbackMsg.fontfamily
                : defaults.fontfamily;
        }
        if (typeof dir !== 'boolean') {
            dir = fallbackMsg && typeof fallbackMsg.dir === 'boolean' ? fallbackMsg.dir : defaults.dir;
        }
        if (typeof twocol !== 'boolean') {
            twocol = fallbackMsg && typeof fallbackMsg.twocolumn === 'boolean' ? fallbackMsg.twocolumn : defaults.twocolumn;
        }

        rfontsize = fs;
        rlinespacing = lh;
        rcontentwidth = cw;
        rfontfamily = ff;
        rdir = dir;
        rtwocolumn = twocol;
        applyReaderConfig(rfontsize, rlinespacing, rcontentwidth, rfontfamily);

        readerLayoutConfigReady = true;
        if (pendingGoProgress !== null) {
            var startProgress = pendingGoProgress;
            pendingGoProgress = null;
            handlePage(startProgress);
        }
    });
}

// 建立与 Service Worker 的连接
function connectToBackground() {
    // 页面 URL 无效时跳过连接，避免无效连接导致的 runtime.lastError
    if (!isValidPageForInjection()) {
        console.info("connectToBackground: invalid page, skipping connection.");
        return;
    }

    try {
        port = chrome.runtime.connect({ name: "contpage" });
        // 检查连接是否出错
        if (chrome.runtime.lastError) {
            console.warn("connectToBackground: runtime.lastError", chrome.runtime.lastError.message);
            port = null;
        }
    } catch (error) {
        console.warn("connectToBackground: connect failed", error.message);
        port = null;
    }

    // 连接失败，稍后重试
    if (!port) {
        console.info("connectToBackground: port null, retrying in 100ms...");
        reconnected = true;
        setTimeout(connectToBackground, 100);
        return;
    }

    // 连接成功，重置重连标志（允许处理后续 "go" 消息）
    reconnected = false;

    // 监听来自背景脚本的消息
    port.onMessage.addListener(function (msg) {
        console.debug("Received message from background:", msg);
        if (msg.type == 'cfg') {
            readerLayoutConfigReady = false;
            rflist = msg.flist;
            rclist = msg.clist;
            rtlist = msg.tlist;
            rplist = msg.plist;
            rnlist = msg.nlist;
            rdir = msg.dir;
            rtwocolumn = msg.twocolumn;
            rjs = msg.js;
            inNight = msg.innight;
            // 字体和排版优先读取 storage 最新值，避免端口消息缓存导致字体不切换。
            applyReaderConfigFromStorageOrFallback(msg);
        };
        if (msg.type == "go") {
            var startProgress = msg.progress != null ? msg.progress : 0;
            if (!readerLayoutConfigReady) {
                pendingGoProgress = startProgress;
                return;
            }
            progress = startProgress;
            handlePage(progress);
        };
    });
    // 监听断开连接事件
    port.onDisconnect.addListener(() => {
        console.info("Disconnected from background script. Reconnecting...");
        // 尝试重新连接
        reconnected = true;
        setTimeout(connectToBackground, 10);
    });
}

// 初始化连接
connectToBackground();

var cururl = window.location.href;
var progress = 0; //the reading progress in one chapter
var rTitle = null;
var rflist = [];
var rclist = [];
var rtlist = [];
var rplist = [];
var rnlist = [];
var rdir = true;
var rtwocolumn = false;
var rjs = null;
var rfontfamily = '';
var readerLayoutConfigReady = false;
var pendingGoProgress = null;
var lastY = 0;
var sumDelta = 0;
var scrollCnt = 0;


var inNight = false;
var contentProcessSeq = 0;
var pendingContentProcess = {};
var sandboxIframe = null;
var sandboxReady = false;
var sandboxInitStarted = false;
var sandboxInitFailed = false;
var sandboxReadyCallbacks = [];
var sandboxBridgeReady = false;

// Page elements
//To detect bottom reach event
var reachBottom = false;
var toBottom = 200;
var toBottom_d = 0;
var bktitle = "N.N";





$(document).ready(function () {
    //Show the notification
    var lastScrollTop = 0;

    // Refine page after resize
    $(window).resize(function () {
        console.log("Re-sized");
        //handlePage(progress);
        rewritePage(cururl, progress);
        if ($('#lrbk_title').text() == "") {
            $('#lrbk_title').html(bktitle.html());
        }
    });
    // Scroll behavior
    $(window).scroll(function (event) {
        var st = $(this).scrollTop();
        if (st >= lastScrollTop) {
            //$('#lrbk_title').hide();
        } else {
            $('#lrbk_title').show();
        }
        lastScrollTop = st;
    });

});


function handlePage(startp) {
    bktitle = $('#lrbk_title').clone();
    $('#lrbk_title').remove();
    var r = $('body').html();
    //If current url is also handled then r is different

    handleContent(r, cururl, function () {
        rewritePage(cururl, startp);
    });
};

function extractNavHref(navData) {
    if (!navData) {
        return '';
    }
    if (navData.length > 0 && navData[0]) {
        if (typeof navData[0].getAttribute === 'function') {
            return navData[0].getAttribute('href') || '';
        }
        if (navData[0].href) {
            return navData[0].href;
        }
    }
    return '';
}

function serializeLoadedContentForSandbox(loaded) {
    return {
        title: loaded[0] || '',
        prevHref: extractNavHref(loaded[2]),
        nextHref: extractNavHref(loaded[3]),
        contentHtml: loaded[4] || ''
    };
}

function deserializeLoadedContentFromSandbox(payload, fallbackLoaded) {
    var out = payload || {};
    var prev = [];
    var next = [];

    if (out.prevHref) {
        var prevA = document.createElement('a');
        prevA.setAttribute('href', out.prevHref);
        prev.push(prevA);
    }
    if (out.nextHref) {
        var nextA = document.createElement('a');
        nextA.setAttribute('href', out.nextHref);
        next.push(nextA);
    }

    return [
        out.title != null ? out.title : fallbackLoaded[0],
        null,
        prev,
        next,
        out.contentHtml != null ? out.contentHtml : fallbackLoaded[4]
    ];
}

function initSandboxBridge() {
    if (sandboxBridgeReady) {
        return;
    }
    sandboxBridgeReady = true;
    window.addEventListener('message', function (event) {
        if (!sandboxIframe || event.source !== sandboxIframe.contentWindow) {
            return;
        }
        var msg = event.data || {};
        if (msg.channel !== 'rabbook-sandbox') {
            return;
        }
        if (msg.type === 'ready') {
            sandboxReady = true;
            sandboxInitFailed = false;
            while (sandboxReadyCallbacks.length > 0) {
                var cbReady = sandboxReadyCallbacks.shift();
                cbReady(true);
            }
            return;
        }
        if (msg.type === 'result') {
            var cb = pendingContentProcess[msg.requestId];
            if (cb) {
                delete pendingContentProcess[msg.requestId];
                cb(msg);
            }
        }
    });
}

function ensureSandboxReady(onReady) {
    initSandboxBridge();

    if (sandboxReady && sandboxIframe && sandboxIframe.contentWindow) {
        onReady(true);
        return;
    }
    if (sandboxInitFailed) {
        onReady(false);
        return;
    }

    sandboxReadyCallbacks.push(onReady);
    if (sandboxInitStarted) {
        return;
    }

    sandboxInitStarted = true;
    try {
        sandboxIframe = document.createElement('iframe');
        sandboxIframe.id = 'lrbk-js-sandbox';
        sandboxIframe.style.display = 'none';
        sandboxIframe.setAttribute('aria-hidden', 'true');
        sandboxIframe.src = chrome.runtime.getURL('src/sandbox.html');
        (document.documentElement || document.body).appendChild(sandboxIframe);
    } catch (e) {
        sandboxInitFailed = true;
        while (sandboxReadyCallbacks.length > 0) {
            var cbFail = sandboxReadyCallbacks.shift();
            cbFail(false);
        }
        return;
    }

    setTimeout(function () {
        if (!sandboxReady) {
            sandboxInitFailed = true;
            while (sandboxReadyCallbacks.length > 0) {
                var cbTimeout = sandboxReadyCallbacks.shift();
                cbTimeout(false);
            }
        }
    }, 1200);
}

function processLoadedContentViaSandbox(url, loaded, onDone) {
    if (!rjs) {
        onDone(loaded);
        return;
    }

    ensureSandboxReady(function (ok) {
        if (!ok || !sandboxIframe || !sandboxIframe.contentWindow) {
            console.warn('Sandbox unavailable, using original loadedContent');
            onDone(loaded);
            return;
        }

        var requestId = generateShortHash(url + ':sandbox:' + (++contentProcessSeq));
        var settled = false;
        pendingContentProcess[requestId] = function (msg) {
            if (settled) {
                return;
            }
            settled = true;
            if (msg.ok && msg.payload) {
                onDone(deserializeLoadedContentFromSandbox(msg.payload, loaded));
                return;
            }
            if (msg.error) {
                console.warn('Sandbox custom script skipped:', msg.error);
            }
            onDone(loaded);
        };

        setTimeout(function () {
            if (!settled && pendingContentProcess[requestId]) {
                settled = true;
                delete pendingContentProcess[requestId];
                console.warn('Sandbox custom script timeout, using original loadedContent');
                onDone(loaded);
            }
        }, 1200);

        try {
            sandboxIframe.contentWindow.postMessage({
                channel: 'rabbook-sandbox',
                type: 'run',
                requestId: requestId,
                payload: serializeLoadedContentForSandbox(loaded),
                script: rjs
            }, '*');
        } catch (e) {
            delete pendingContentProcess[requestId];
            console.warn('processLoadedContentViaSandbox failed:', e.message);
            onDone(loaded);
        }
        });
}


// Handle the page content;
function handleContent(bodytxt, url = null, onReady = null) {
    // 先查找buffers有没有存好的! 如果已经解析过了，就不用去反复解析了 
    let buf = fetchBuf(generateShortHash(url));
    if (buf != null) {
        console.log('hit url');
        //        target = buf.content;
        if (typeof onReady === 'function') onReady();
        return;
    }

    // 在交给 jQuery 之前先做字符串级别的脚本剥离：
    // jQuery 的 append(htmlString) 会立即执行 <script>，所以必须在 append 前清除，
    // 而不是 append 之后再 find('script').remove()（那时脚本已经跑过了）。
    bodytxt = bodytxt.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script\s*>/gi, '');
    // 同时预清理内联事件属性，防止 jQuery 解析时触发
    bodytxt = bodytxt.replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, '');

    dummy = $("<div id='dummy'></div>");
    dummy.append(bodytxt);

    //Remove all script elements and inline event handlers（二次保险）
    dummy.find('script').remove();
    dummy.find('[onload]').removeAttr('onload');
    dummy.find('[onerror]').removeAttr('onerror');
    dummy.find('[onclick]').removeAttr('onclick');
    dummy.find('[onmouseover]').removeAttr('onmouseover');
    dummy.find('[onmouseout]').removeAttr('onmouseout');
    dummy.find('[onkeydown]').removeAttr('onkeydown');
    dummy.find('[onkeyup]').removeAttr('onkeyup');
    dummy.find('[onsubmit]').removeAttr('onsubmit');
    dummy.find('[onchange]').removeAttr('onchange');
    dummy.find('[onfocus]').removeAttr('onfocus');
    dummy.find('[onblur]').removeAttr('onblur');
    dummy.find('[onmousedown]').removeAttr('onmousedown');
    dummy.find('[onmouseup]').removeAttr('onmouseup');
    dummy.find('[ondblclick]').removeAttr('ondblclick');
    dummy.find('[oncontextmenu]').removeAttr('oncontextmenu');
    dummy.find('[onwheel]').removeAttr('onwheel');
    //Remove redundancy
    dummy.find('link').remove();
    dummy.find('ins').remove();
    // 清除导航相关表格时限定在 dummy 范围内，不污染全局 DOM
    dummy.find('table, tr, td').filter(function (index) {
        if ($(this).text().match('.*[下|后]\s*一*\s*[章|回|页|节].*')) {
            return false;
        } else {
            return true;
        }
    }).remove();
    // 移除所有带 javascript: 伪协议的 href/src
    dummy.find('[href*="javascript:"]').attr('href', '#');
    dummy.find('[src*="javascript:"]').attr('src', '');

    var cbody = dummy;
    var jres = judgePage(cbody);
    //if (jres[0]) {    // Comment this to enable even single page action => For future read-it-later usage.
    if (true) {
        cbody.find('iframe').remove();
        cbody.find('iframe').css('display', 'none!important');
        //To extract the content and navigations
        let loaded = parseContent(cbody);
        processLoadedContentViaSandbox(url, loaded, function (processedLoaded) {
            //And update the bufarray
            pushBuf({ 'key': generateShortHash(url), 'content': processedLoaded });
            if (typeof onReady === 'function') onReady();
        });
    }
};



function loadPrevPage() {
    window.clearTimeout(pgtimer);
    notinpaging = false;
    // Get content from iframe
    cururl = $('#ppage').prop('src');
    handleContent(document.getElementById('ppage').contentWindow.document.body.innerHTML, cururl, function () {
        rewritePage(cururl, 0);
        pgtimer = window.setTimeout(function () {
            notinpaging = true;
        }, PGTIME);
    });
};
function loadNextPage() {
    window.clearTimeout(pgtimer);
    notinpaging = false;
    // Get content from iframe
    cururl = $('#npage').prop('src');
    handleContent(document.getElementById('npage').contentWindow.document.body.innerHTML, cururl, function () {
        rewritePage(cururl, 0);
        pgtimer = window.setTimeout(function () {
            notinpaging = true;
        }, PGTIME);
    });
}
/* 
Judge the current page's status, i.e. if any prev/next page there 
    Return: [pageInfoorNot, pageType]
        - HB:    Prev
        - MB:    Index     //Now ignored
        - LB:    End
*/

function judgePage(txt) {
    var btxt = txt;
    var ctype = 0b000;
    var res = false;
    //1. If index info there?
    // a. pre-index-next
    if (btxt.text().match('.*目\s*录.*') || btxt.text().match('.*列\s*表.*'))
        ctype = ctype | 0b010
    if (btxt.text().match('.*[上|前]一*[节|章|回|页].*'))
        ctype = ctype | 0b100
    if (btxt.text().match('.*[下|后]一*[节|章|回|页].*'))
        ctype = ctype | 0b001

    if ((ctype & 0b101) == 0b000) {
        res = false;
    } else {
        res = true;
    }
    return [res, ctype];
};


function parseContent(ctn) {
    /* Function to extract content input 
    input is the html input body 
    output: retarr is one array
    [0]: Title Text
    [1]:
    [2]:  Link for prev page nav
    [3]:  Link for next page nav
    [4]:  Artical Content
    */
    //1. current idea, to locate where is the title? where is the nav part? and then to grab the text between them
    var cTitle = [];

    // All possible title filter, With higher priority
    $.each(rtlist, function (i, v) {
        if (ctn.find(v).length > 0) {
            cTitle = ctn.find(v).eq(0);
        }
    });
    if (cTitle.length == 0)
        cTitle = ctn.find(":header").filter(function () { return $(this).text().match('.*章') != null; }).filter(':first');
    if (cTitle.length == 0)
        cTitle = ctn.find(":header").filter(function () { return $(this).text().match('.*节') != null; }).filter(':first');
    if (cTitle.length == 0)
        cTitle = ctn.find(":header").filter(function () { return $(this).text().match('.*回') != null; }).filter(':first');
    if (cTitle.length == 0)
        cTitle = ctn.find(":header").eq(0);
    if (cTitle.length == 0)
        cTitle = ctn.find("strong").eq(0);
    //b: Nav
    var cNavNext = [];
    var cNavPrev = [];
    // If customized
    // All possible title filter, With higher priority
    $.each(rplist, function (i, v) {
        if (ctn.find(v).length > 0) {
            cNavPrev = ctn.find(v).eq(0);
        }
    });
    if (cNavPrev.length == 0) {
        var cPrevReg = '.*[上|前]\s*一*\s*[章|回|页|节].*';
        cNavPrev = ctn.find("span, a, button").filter(function () { return ($(this).is('[href]') && ($(this).text().match(cPrevReg) != null)); }).filter(':last');
        if (cNavPrev.length == 0)
            cNavPrev = ctn.find("span, a, button").filter(function () { return ($(this).is('[href]') && $(this).text().match('.*[上|前]\s*一*\s*[章|回|页|节].*') != null); }).filter(':last');
    }

    // All possible title filter, With higher priority
    $.each(rnlist, function (i, v) {
        if (ctn.find(v).length > 0) {
            cNavNext = ctn.find(v).eq(0);
        }
    });
    if (cNavNext.length == 0) {
        var cNextReg = '.*[下|后]\s*一*\s*[章|回|页|节].*';
        cNavNext = ctn.find("span, a, button").filter(function () { return ($(this).is('[href]') && ($(this).text().match(cNextReg) != null)); }).filter(':last');
        if (cNavNext.length == 0)
            cNavNext = ctn.find("span, a, button").filter(function () { return ($(this).is('[href]') && $(this).text().match('.*[下|后]\s*一*\s*[章|回|页|节].*') != null); }).filter(':last');
    }
    //c: Content
    // Remove all items before title:
    // - remove all slibing in same parent
    var chdl = cTitle;
    while (chdl.length > 0) {
        chdl.prevAll().remove();
        chdl = chdl.parent();
    }

    chdl = cNavNext;
    while (chdl.length > 0) {
        chdl.nextAll().remove();
        chdl = chdl.parent();
    }

    chdl = cNavPrev;
    while (chdl.length > 0) {
        chdl.nextAll().remove();
        chdl = chdl.parent();
    }



    //Clean further — 限定在 ctn 上下文，不污染全局 DOM
    ctn.find('link').remove();
    ctn.find('script').remove();
    ctn.find('noscript').remove();
    ctn.find('[onload]').removeAttr('onload');
    ctn.find('[onerror]').removeAttr('onerror');
    ctn.find('[onclick]').removeAttr('onclick');
    ctn.find('[onmouseover]').removeAttr('onmouseover');
    ctn.find('[onmouseout]').removeAttr('onmouseout');
    ctn.find('[onkeydown]').removeAttr('onkeydown');
    ctn.find('[onkeyup]').removeAttr('onkeyup');
    ctn.find('[onsubmit]').removeAttr('onsubmit');
    ctn.find('[onchange]').removeAttr('onchange');
    ctn.find('[onfocus]').removeAttr('onfocus');
    ctn.find('[onblur]').removeAttr('onblur');
    ctn.find('[onmousedown]').removeAttr('onmousedown');
    ctn.find('[onmouseup]').removeAttr('onmouseup');
    ctn.find('[ondblclick]').removeAttr('ondblclick');
    ctn.find('[oncontextmenu]').removeAttr('oncontextmenu');
    ctn.find('[onwheel]').removeAttr('onwheel');
    ctn.find('[href*="javascript:"]').attr('href', '#');
    ctn.find('[src*="javascript:"]').attr('src', '');
    ctn.find('table').filter(function (index) {
        if ($(this).text().match('.*[下|后]\s*一*\s*[章|回|页].*')) {
            return false;
        } else {
            return true;
        }
    }).remove();

    var retarr = [cTitle.text(), null, cNavPrev.clone(), cNavNext.clone(), null];
    // To remove all other element
    cTitle.remove();
    cNavNext.remove();
    cNavPrev.remove();

    var cContent = $("<div id='nctn'></div>");

    //Grab the content part:
    // 1. take key words, and judge if length is enough, if yes, no any action , if not, then to take it directly
    // Key words
    //cContent.append(ctn.find('* ').clone());
    var cSec = null;
    //Customized clist + default hardcoding
    clist = ["#nctn", "#content", ".content", "#chaptercontent", "#readtxt", "#chapterContentWapper"];
    clist = clist.concat(rclist);
    // All possible key content
    cSec = ctn;
    $.each(clist, function (i, v) {
        if (ctn.find(v).length > 0) {
            cSec = ctn.find(v);
        }
    });
    if (cSec.text().length < 10) {
        cSec = ctn;
    };
    cContent.append(cSec.clone());

    var rtContent = $("<div id='gnContent' class='bb-bookblock'></div>");

    rtContent.append(cContent.html());
    // Clean work
    rtContent.find('script').remove();
    rtContent.find('*').prop('onclick', null).off('click');

    //flist
    flist = ["[id*=comment]", "[id*=info]", "[id*=thumb]", "[id*=meta]", "[class*=comment]", "[class*=info]", "[class*=thumb]", "[class*=meta]", "ul", "#readtop", ".top", "#readview", ".button", ".qrcode"];
    flist = flist.concat(rflist);
    // General 
    $.each(flist, function (i, v) {
        if (rtContent.text().replace(/\s+/g, "") != rtContent.find(v).text().replace(/\s+/g, "")) {
            if (rtContent.text().replace(/\s+/g, "").length - rtContent.find(v).text().replace(/\s+/g, "").length > 10) {
                rtContent.find(v).remove();
            }
        };
    });

    /* 
    --------
    Patch Area
    --------
    */

    // Zongheng-hard code...
    rtContent.find('[class*=pray_pc]').remove();


    // Patch Pre!
    rtContent.find('pre').replaceWith(function () {
        return $("<div />", { html: $(this).html().replace(/\n/g, "<br><br>") });
    });
    //retarr[4] = rtContent.clone();
    var htmlString = rtContent.prop('outerHTML'); // 获取完整的 HTML 字符串
    retarr[4] = htmlString;
    return retarr;
}

function generateShortHash(input) {
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
        const char = input.charCodeAt(i);
        hash = (hash << 5) - hash + char; // 位运算，快速计算hash
        hash |= 0; // 转为32位整数
    }
    // 转为更短的正整数或字符串
    return Math.abs(hash).toString(36); // 使用 base36（数字+字母）缩短输出
}


// pushBuf 函数
function pushBuf(inElem) {
    console.debug("Trying to push: " + inElem.key);
    if (!inElem || !inElem.key) {
        console.error("Invalid input: inElem must have a 'key' field.");
        return;
    }

    const key = inElem.key;
    const index = buffers.findIndex(el => el && el.key === key);

    // 如果已经存在相同 key 的元素，删除它
    if (index !== -1) {
        buffers[index] = null;
    }

    // 查找第一个 null 的位置
    const nullIndex = buffers.indexOf(null);

    if (nullIndex !== -1) {
        // 有空位，用 inElem 替换第一个 null
        buffers[nullIndex] = inElem;
    } else {
        // 没有空位，删除第一个元素，剩余元素前移，最后一个位置替换为 inElem
        buffers.shift(); // 删除第一个元素
        buffers.push(inElem); // 替换最后一个位置
    }
    // console.debug(inElem.content);
}


function fetchBuf(key) {
    console.debug("Trying to fetch: " + key);
    if (!key) {
        console.error("Invalid input: key is required.");
        return null;
    }

    // 查找 buffers 中 key 对应的元素
    const result = buffers.find(el => el && el.key === key);

    // 如果找到，返回元素；否则返回 null
    console.debug(result);
    return result || null;
}