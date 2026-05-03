// 守卫检查：如果当前页面是 about:blank 或 chrome:// 等受限页面，直接返回
(function() {
    var protocol = window.location.protocol;
    if (protocol === 'about:' || protocol === 'chrome:' || protocol === 'edge:' || protocol === 'chrome-extension:' || protocol === 'data:' || protocol === 'devtools:') {
        console.warn('pageRewrite: cannot run on restricted page:', window.location.href);
        // 抛出一个可被 catch 的错误，让调用方知道执行被阻止
        throw new Error('pageRewrite blocked on restricted page');
    }
})();

// 分页纵向缓冲参数（可直接调节）
var PAGINATION_VERTICAL_BUFFER_BASE_PX = 6;
var PAGINATION_VERTICAL_BUFFER_LINE_RATIO = 0.35;
var PAGINATION_VERTICAL_BUFFER_COMPENSATION_PX = 4;
var PAGINATION_VERTICAL_BUFFER_REFERENCE_FONT_PX = 30;
var PAGINATION_VERTICAL_BUFFER_MIN_SCALE = 0.4;

function lastpage() {
    return $("#currentindex").text() == $("#totalindex").text();
}

function showGotoPageDialog(pages, onConfirm) {
    var existing = document.getElementById('rbGotoDialog');
    if (existing) existing.remove();

    var overlay = document.createElement('div');
    overlay.id = 'rbGotoDialog';
    overlay.innerHTML =
        '<div class="rb-goto-box">' +
        '  <div class="rb-goto-title">跳转到页码</div>' +
        '  <div class="rb-goto-hint">共 ' + pages + ' 页</div>' +
        '  <input class="rb-goto-input" type="number" min="1" max="' + pages + '" placeholder="输入页码" />' +
        '  <div class="rb-goto-actions">' +
        '    <button class="rb-goto-cancel">取消</button>' +
        '    <button class="rb-goto-confirm">跳转</button>' +
        '  </div>' +
        '</div>';
    document.body.appendChild(overlay);

    var input = overlay.querySelector('.rb-goto-input');
    var confirmBtn = overlay.querySelector('.rb-goto-confirm');
    var cancelBtn = overlay.querySelector('.rb-goto-cancel');

    function closeDialog() { overlay.remove(); }
    function doConfirm() {
        var val = parseInt(input.value, 10);
        closeDialog();
        onConfirm(val);
    }

    input.addEventListener('keydown', function(e) {
        e.stopPropagation();
        e.stopImmediatePropagation();
        if (e.key === 'Enter') doConfirm();
        else if (e.key === 'Escape') closeDialog();
    });
    confirmBtn.addEventListener('click', doConfirm);
    cancelBtn.addEventListener('click', closeDialog);
    overlay.addEventListener('click', function(e) {
        if (e.target === overlay) closeDialog();
    });

    setTimeout(function() { input.focus(); }, 30);
}

function createReaderEngine($container, options) {
    options = options || {};
    var $floors = $container.find('.bb-item');
    var state = {
        floor: 0,
        floorCount: $floors.length,
        loop: !!options.loop,
    };
    var listeners = {
        scrollStart: [],
        scrollEnd: [],
    };

    function emit(type, payload) {
        var cbs = listeners[type] || [];
        for (var i = 0; i < cbs.length; i++) {
            cbs[i](null, payload);
        }
    }

    function clampFloor(floor) {
        if (state.floorCount <= 0) {
            return 0;
        }
        if (state.loop) {
            return (floor + state.floorCount) % state.floorCount;
        }
        if (floor < 0) {
            return 0;
        }
        if (floor >= state.floorCount) {
            return state.floorCount - 1;
        }
        return floor;
    }

    function renderFloor(floor) {
        if (state.floorCount <= 0) {
            return;
        }
        var from = state.floor;
        var to = clampFloor(floor);
        emit('scrollStart', { from: from, to: to });

        state.floor = to;
        $floors.hide().attr('aria-hidden', 'true');
        $floors.eq(to).show().attr('aria-hidden', 'false');

        emit('scrollEnd', { from: from, to: to });
    }

    function refresh() {
        $floors = $container.find('.bb-item');
        state.floorCount = $floors.length;
        renderFloor(state.floor);
    }

    refresh();

    return {
        on: function (type, cb) {
            if (!listeners[type]) {
                listeners[type] = [];
            }
            listeners[type].push(cb);
        },
        next: function () {
            renderFloor(state.floor + 1);
        },
        prev: function () {
            renderFloor(state.floor - 1);
        },
        scrollToFloor: function (floor) {
            renderFloor(parseInt(floor, 10) || 0);
        },
        getFloor: function () {
            return state.floor;
        },
        getFloorCount: function () {
            return state.floorCount;
        },
        refresh: refresh,
    };
}

var RB_READER_STYLE_ATTR = 'data-rb-reader-style';

function isReaderStyleNode(node) {
    if (!node || !node.getAttribute) {
        return false;
    }
    if (String(node.getAttribute(RB_READER_STYLE_ATTR) || '') === '1') {
        return true;
    }
    if (node.tagName && node.tagName.toUpperCase() === 'LINK') {
        try {
            var href = String(node.getAttribute('href') || '');
            var extRoot = chrome && chrome.runtime ? chrome.runtime.getURL('') : '';
            if (extRoot && href.indexOf(extRoot) === 0) {
                return true;
            }
        } catch (e) {}
    }
    return false;
}

function ensureReaderStylesMounted() {
    var head = document.head || document.documentElement;
    if (!head) {
        return;
    }

    function ensureLink(id, href) {
        if (!href) {
            return;
        }
        var link = document.getElementById(id);
        if (!link) {
            link = document.createElement('link');
            link.id = id;
            link.rel = 'stylesheet';
            head.appendChild(link);
        }
        link.setAttribute(RB_READER_STYLE_ATTR, '1');
        if (link.getAttribute('href') !== href) {
            link.setAttribute('href', href);
        }
    }

    try {
        ensureLink('rb-style-design-tokens', chrome.runtime.getURL('src/design-tokens.css'));
        ensureLink('rb-style-main', chrome.runtime.getURL('src/main.css'));
        ensureLink('rb-style-font', chrome.runtime.getURL('src/font/style.css'));
    } catch (e) {}

    var customCss = (typeof rcss === 'string') ? rcss.trim() : '';
    var customStyleId = 'rb-style-custom';
    var customStyleEl = document.getElementById(customStyleId);
    if (customCss) {
        if (!customStyleEl) {
            customStyleEl = document.createElement('style');
            customStyleEl.id = customStyleId;
            head.appendChild(customStyleEl);
        }
        customStyleEl.setAttribute(RB_READER_STYLE_ATTR, '1');
        if (customStyleEl.textContent !== customCss) {
            customStyleEl.textContent = customCss;
        }
    } else if (customStyleEl) {
        customStyleEl.remove();
    }
}

function purgeHostStyleArtifacts() {
    try {
        document.documentElement.removeAttribute('style');
        document.documentElement.removeAttribute('class');
    } catch (e) {}
    try {
        document.body.removeAttribute('style');
        document.body.removeAttribute('class');
    } catch (e) {}

    var $head = $('head');
    $head.find('style, noscript').filter(function () {
        return !isReaderStyleNode(this);
    }).remove();
    $head.find('link').filter(function () {
        if (isReaderStyleNode(this)) {
            return false;
        }
        var rel = String(this.getAttribute('rel') || '').toLowerCase();
        var asAttr = String(this.getAttribute('as') || '').toLowerCase();
        var type = String(this.getAttribute('type') || '').toLowerCase();
        return rel.indexOf('stylesheet') !== -1 || asAttr === 'style' || type === 'text/css';
    }).remove();
    $('head').find('[style]').each(function () {
        if (!isReaderStyleNode(this)) {
            this.removeAttribute('style');
        }
    });
}

function stripDangerousInlineAttrs($root) {
    if (!$root || $root.length === 0) {
        return;
    }

    $root.find('style, link, script, noscript, iframe, object, embed').remove();
    $root.find('*').each(function () {
        var el = this;
        var $el = $(el);
        var idVal = $el.attr('id');

        $el.removeAttr('style');
        $el.removeAttr('class');
        $el.removeAttr('width');
        $el.removeAttr('height');
        $el.removeAttr('color');
        $el.removeAttr('bgcolor');
        $el.removeAttr('face');

        if (idVal && idVal !== 'gnContent') {
            $el.removeAttr('id');
        }

        if (el.attributes) {
            for (var i = el.attributes.length - 1; i >= 0; i--) {
                var attrName = el.attributes[i].name;
                if (/^on/i.test(attrName)) {
                    el.removeAttribute(attrName);
                }
            }
        }
    });
}

function sanitizeLoadedContentMarkup(markup) {
    var $wrap = $('<div></div>');
    if (typeof markup === 'string') {
        $wrap.html(markup);
    } else if (markup != null) {
        $wrap.append($(markup).clone(false, false));
    }

    stripDangerousInlineAttrs($wrap);
    return $wrap.html();
}

function rewritePage(url, startp) {
    let buf = fetchBuf(generateShortHash(url));
    if (buf == null) {
        console.error('Invalid Page : ' + url);
        //        target = buf.content;
        return;
    }

    console.log("Page Rewrite");
    loadedContent = buf.content;

    $('body').empty();
    purgeHostStyleArtifacts();
    ensureReaderStylesMounted();
    // 在追加任何内容前，彻底清理原始页面 head/body 中的脚本
    // 阻止任何原始页面的脚本被保留或执行
    try {
        document.head.innerHTML = document.head.innerHTML.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '');
        document.head.innerHTML = document.head.innerHTML.replace(/<script\b[^>]*\/?>/gi, '');
    } catch (e) {}
    // 清理 loadedContent[4] 中可能残留的 script/style 标签（字符串级别安全网）
    if (loadedContent[4] && typeof loadedContent[4] === 'string') {
        var scriptRe = /<script\b[^>]*>[\s\S]*?<\/script\s*>/gi;
        while (scriptRe.test(loadedContent[4])) {
            loadedContent[4] = loadedContent[4].replace(scriptRe, '');
        }
        loadedContent[4] = loadedContent[4].replace(/<script\b[^>]*\/?>/gi, '');
        loadedContent[4] = loadedContent[4].replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript\s*>/gi, '');
        loadedContent[4] = loadedContent[4].replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');
    }
    loadedContent[4] = sanitizeLoadedContentMarkup(loadedContent[4]);
    //    $('body').attr('style','');
    $('body').attr('style', '');

    //Title
    $('body').append('<div id="lrbk_title"></div>');
    $('body').append('<div id="indexinfo"><span id="currentindex"></span> / <span id="totalindex"></span></div>');
    $('#lrbk_title').append(loadedContent[0]);

    $('#lrbk_title').click(function () {
        window.location.href = cururl;
    });


    //Content
    $('body').append($(loadedContent[4]));
    if ($('#gnContent').length > 0) {
        stripDangerousInlineAttrs($('#gnContent'));
        $('#gnContent').wrap('<div id="rbNightLayer"></div>');
    }
    $('body').find('a').remove();

    //Navigation

    $('body').append('<div class="pnav" id="pup"></div>');
    $('body').append('<div class="pnav" id="pdown"></div>');
    var nv = $("<div id='nav'></div>");

    // Only put when there is 'valid' next/prev link
    if (loadedContent[2].length > 0) {
        $('body').append("<iframe id='ppage' style='display:none;' src='" + urlProceed(loadedContent[2][0].getAttribute('href')) + "'></iframe>")
        nv.append("<span class='fetchprev left' style='cursor:pointer;' href='" + urlProceed(loadedContent[2][0].getAttribute('href')) + "'>" + "上一章" + "</span>");
    }
    if (loadedContent[3].length > 0) {

        $('body').append("<iframe id='npage' style='display:none;' src='" + urlProceed(loadedContent[3][0].getAttribute('href')) + "'></iframe>")
        nv.append("<span class='fetchnext right' style='cursor:pointer;' href='" + urlProceed(loadedContent[3][0].getAttribute('href')) + "'>" + "下一章" + "</span>");

    }

    $('body').append(nv);
    $('body').append("<div id='tools'><span id ='switch' class='icon-toggle-on' > </span></div>");
    toggleNightMode(inNight);

    $('body').find('[style]').not('#ppage, #npage').removeAttr('style');

    // 自定义脚本改为由 sandbox 处理 loadedContent 后再回传，
    // 这里不再在页面上下文执行用户脚本，避免触发页面 CSP。

    // === 增强清理：清除原始页面的残留 ===

    // 1. 封堵 window 级弹窗/跳转 API（原脚本已注册的 window 级监听器即使 body 清空也会继续调用这些 API）
    window.open = function() { return null; };
    window.alert = function() {};
    window.confirm = function() { return false; };
    window.prompt = function() { return null; };
    // 封堵 beforeunload 弹窗（切章节时不应弹确认框）
    window.onbeforeunload = null;
    window.onunload = null;
    window.addEventListener('beforeunload', function(e) { e.stopImmediatePropagation(); e.preventDefault(); delete e['returnValue']; }, true);

    // 2. 封堵右键菜单（捕获阶段，优先级高于原页面任何 contextmenu 监听）
    window.addEventListener('contextmenu', function(e) { e.stopImmediatePropagation(); e.preventDefault(); }, true);

    // 3. 清除所有定时器（setTimeout / setInterval）
    var highestTimerId = window.setTimeout(function(){}, 0);
    for (var i = 0; i <= highestTimerId; i++) {
        window.clearTimeout(i);
        window.clearInterval(i);
    }

    // 4. 劫持 requestAnimationFrame，让原页面残留的 rAF 回调空转
    (function() {
        var _raf = window.requestAnimationFrame.bind(window);
        var _caf = window.cancelAnimationFrame.bind(window);
        var rbRafGuardActive = true;
        window.requestAnimationFrame = function(cb) {
            if (!rbRafGuardActive) return _raf(cb);
            // 立即注册但包一层空保护：rAF 仍能正常调度，但只允许扩展自身使用
            return _raf(function(ts) {
                // 延迟解锁后原脚本的 rAF 才可能漏进来，此处直接丢弃
            });
        };
        // 解锁：页面重建完成后恢复正常 rAF（给扩展自身动画使用）
        setTimeout(function() {
            window.requestAnimationFrame = _raf;
            window.cancelAnimationFrame = _caf;
        }, 400);
    })();

    // 5. MutationObserver 守卫：监听 DOM，立即移除任何新插入的 <script> / <iframe> 节点
    if (window._rbScriptGuard) { window._rbScriptGuard.disconnect(); }
    window._rbScriptGuard = new MutationObserver(function(mutations) {
        mutations.forEach(function(m) {
            m.addedNodes.forEach(function(node) {
                if (!node.tagName) return;
                var tag = node.tagName.toUpperCase();
                if (tag === 'SCRIPT') { node.parentNode && node.parentNode.removeChild(node); }
                if (tag === 'STYLE' && !isReaderStyleNode(node)) { node.parentNode && node.parentNode.removeChild(node); }
                if (tag === 'LINK' && node.rel && String(node.rel).toLowerCase().indexOf('stylesheet') !== -1) {
                    if (!isReaderStyleNode(node)) {
                        node.parentNode && node.parentNode.removeChild(node);
                    }
                }
                if (tag === 'IFRAME' && node.id !== 'ppage' && node.id !== 'npage' && node.id !== 'sandbox') {
                    node.parentNode && node.parentNode.removeChild(node);
                }
            });
        });
    });
    window._rbScriptGuard.observe(document.documentElement, { childList: true, subtree: true });

    // 6. 移除 head 中残留的 link/style/script 标签（保留扩展自身注入的）
    $('head').find('script, noscript').remove();
    $('head').find('style').filter(function () {
        return !isReaderStyleNode(this);
    }).remove();
    $('head').find('link').filter(function () {
        if (isReaderStyleNode(this)) {
            return false;
        }
        var rel = String(this.getAttribute('rel') || '').toLowerCase();
        var asAttr = String(this.getAttribute('as') || '').toLowerCase();
        var type = String(this.getAttribute('type') || '').toLowerCase();
        return rel.indexOf('stylesheet') !== -1 || asAttr === 'style' || type === 'text/css';
    }).remove();
    ensureReaderStylesMounted();
    // 移除 body 中可能残留的 link/script/style/iframe（排除 ppage/npage）
    $('body').find('link, script, style, noscript, iframe:not(#ppage, #npage)').remove();
    // 重新确保 ppage/npage iframe 隐藏（上述清理可能间接影响其 display:none）
    $('#ppage').css('display', 'none');
    $('#npage').css('display', 'none');
    // 7. 清除所有内联事件属性，防止残留 JS 干扰
    // jQuery removeAttr() 一次只接受一个属性名，需逐个清理
    var inlineAttrs = ['onclick','onmouseover','onmouseout','onkeydown','onkeyup','onsubmit','onchange','onfocus','onblur','onload','onerror','onmousedown','onmouseup','ondblclick','oncontextmenu','onwheel','ontouchstart','ontouchend','ontouchmove','onpointerdown','onpointermove','onpointerup','ondragstart','onselect','oncopy','onpaste','oncut','onselectstart'];
    $('body').find('*').each(function() {
        var $el = $(this);
        for (var a = 0; a < inlineAttrs.length; a++) {
            $el.removeAttr(inlineAttrs[a]);
        }
    });

    // 仅在 keydown 监听快捷键，并优先按 event.code 识别，避免输入法/大小写影响。
    const eventTypes = ["keydown"];
    const preventEvent = (event) => {
        // 若焦点在自定义弹窗输入框内，跳过快捷键处理
        if (event.target && event.target.tagName === 'INPUT') return;

        var code = event.code || '';
        var key = (event.key || '').toLowerCase();

        var action = '';
        // 固化基础快捷键：j 下一页，k 上一页
        if (code === 'KeyJ' || key === 'j') {
            action = 'prevPage';
        } else if (code === 'KeyK' || key === 'k') {
            action = 'nextPage';
        } else if (code === 'ArrowRight' || key === 'arrowright' || code === 'PageDown' || key === 'pagedown' || code === 'Space' || key === ' ') {
            action = 'nextPage';
        } else if (code === 'ArrowLeft' || key === 'arrowleft' || code === 'PageUp' || key === 'pageup') {
            action = 'prevPage';
        } else if (code === 'KeyL' || key === 'l' || code === 'ArrowDown' || key === 'arrowdown') {
            action = 'nextChapter';
        } else if (code === 'KeyH' || key === 'h' || code === 'ArrowUp' || key === 'arrowup') {
            action = 'prevChapter';
        } else if (code === 'KeyQ' || key === 'q') {
            action = 'gotoPage';
        }

        if (!action) {
            return;
        }

        bindScrollAction();
        if (action === 'nextPage') {
            if (lastpage())
                detectBottom();
            else
                readerEngineInstance.next();
        } else if (action === 'prevPage') {
            readerEngineInstance.prev();
        } else if (action === 'nextChapter') {
            rTitle = document.getElementById('npage').contentWindow.document.head.getElementsByTagName("title")[0].innerHTML;
            $('.fetchnext').click();
        } else if (action === 'prevChapter') {
            rTitle = document.getElementById('ppage').contentWindow.document.head.getElementsByTagName("title")[0].innerHTML;
            $('.fetchprev').click();
        } else if (action === 'gotoPage') {
            showGotoPageDialog(pages, function(tofloor) {
                if (!tofloor || isNaN(tofloor)) return;
                if (tofloor < 1) {
                    readerEngineInstance.scrollToFloor(0);
                } else if (tofloor > pages) {
                    readerEngineInstance.scrollToFloor(pages - 1);
                } else {
                    readerEngineInstance.scrollToFloor(tofloor - 1);
                }
            });
        }

        event.stopPropagation();
        event.preventDefault();
        event.stopImmediatePropagation();
    };

    eventTypes.forEach(type => {
        window.removeEventListener(type, preventEvent, true);
        window.addEventListener(type, preventEvent, true);
    });



    /* 
        Handle page actions : keyup/click
    */
    $(document).unbind('click').bind('click', function (e) {
        bindClickPress(e);
    });



    // Go to top
    window.scrollTo(0, 0);
    // 切换
    function toggleNightMode(enable) {
        var body = document.body;
        if (enable) {
            body.classList.add('rb-night-invert');
            $('#switch').removeClass("icon-toggle-on").addClass("icon-toggle-off");
        } else {
            body.classList.remove('rb-night-invert');
            $('#switch').removeClass("icon-toggle-off").addClass("icon-toggle-on");
        }
        // Send update
        inNight = !!enable;
        port.postMessage({ type: "configupdate", innight: inNight });

    }

    // Switch day/night
    $('#switch').unbind('click').bind('click', function () {
        inNight = !inNight;
        toggleNightMode(inNight);
    });

    //For next page's info
    $('.fetchnext').unbind('click').bind('click', function () {
        reachBottom = false;
        toBottom = 200;
        toBottom_d = 0;
        rTitle = document.getElementById('npage').contentWindow.document.head.getElementsByTagName("title")[0].innerHTML;
        progress = 0;
        loadNextPage();
    });

    //For next page's info
    $('.fetchprev').unbind('click').bind('click', function () {
        reachBottom = false;
        toBottom = 200;
        toBottom_d = 0;
        rTitle = document.getElementById('ppage').contentWindow.document.head.getElementsByTagName("title")[0].innerHTML;
        progress = 0;
        loadPrevPage();
    });

    var readerEngineHooked = false;
    function bindScrollAction(tout = false) {
        if (!readerEngineInstance || readerEngineHooked) {
            return;
        }
        readerEngineHooked = true;
        /*
        //Bind the scrollevent
        */
        readerEngineInstance.on("scrollEnd", function (e, floor) {
            $('#currentindex').text(parseInt(floor.to) + 1);
            $('#totalindex').text(pages);
            progress = (floor.to) / pages;
            try {
                port.postMessage({ type: "updatebk", rTitle: rTitle, cururl: cururl, progress: progress });
            } catch (error) {
                console.error("Port is disconnected", error);
            }
            if (tout)
                pgtimer = window.setTimeout(function () {
                    notinpaging = true;
                }, PGTIME);
        });
        readerEngineInstance.on("scrollStart", function (e, floor) {
            if (tout)
                notinpaging = false;
        });

    }

    function bindClickPress(e) {
        bindScrollAction();
        // Page Turn Navigator Click
        //
        $('#pup').unbind('click').bind('click', function () {
            readerEngineInstance.prev();
        });

        $('#pdown').unbind('click').bind('click', function () {
            if (lastpage())
                detectBottom();
            else
                readerEngineInstance.next();
        });

    };


    $(document).unbind('mousewheel').bind('mousewheel', function (e) {
        if (notinpaging == false)
            return 0;
        /*
        //Bind the scrollevent
        */
        bindScrollAction(true);

        var delta = e.offsetY - lastY;
        scrollCnt = scrollCnt + 1;
        sumDelta = sumDelta + delta;
        lastY = e.offsetY;
        if (e.originalEvent.deltaY > 0) {
            // To tune the sensitivity of wheels
            if (scrollCnt >= 1) {
                scrollCnt = 0;
                if (sumDelta < 4) {
                    sumDelta = 0;
                    if (lastpage())
                        detectBottom();
                    else
                        readerEngineInstance.next();

                    //pagedown
                }
                sumDelta = 0;
            }
        } else if (e.originalEvent.deltaY < 0) {
            if (scrollCnt >= 1) {
                scrollCnt = 0;
                if (sumDelta > -4) {
                    sumDelta = 0;
                    //$('.fetchnext').click();
                    readerEngineInstance.prev();
                    //pageup
                }
                sumDelta = 0;
            }
        } else {
            scrollCnt = 0;
            sumDelta = 0;
        }
        //detectBottom();
    });


    if (rTitle != null)
        $('title').text(rTitle);
    else
        rTitle = $('title').text();

    //cururl = window.location.href;
    try {
        port.postMessage({ type: "updatebk", rTitle: rTitle, cururl: cururl, progress: progress });
    } catch (error) {
        console.error("Port is disconnected", error);
    }



    // 在内容重置前保存容器高度（之后 #gnContent 会被 hide，height() 返回 0）
    // 这里不仅要看容器理论高度，还要看真实视口可见区域，避免 fixed 顶栏/底栏遮挡导致分页行数偏大。
    var gnContentHeight = $('#gnContent').height();
    function computeVisibleContentHeight() {
        var node = $('#gnContent')[0];
        if (!node) {
            return gnContentHeight || 0;
        }

        var rect = node.getBoundingClientRect();
        var visibleTop = Math.max(rect.top, 0);
        var visibleBottom = Math.min(rect.bottom, window.innerHeight);
        var visible = Math.max(0, visibleBottom - visibleTop);

        function overlapWithFixed(selector) {
            var el = $(selector)[0];
            if (!el) {
                return 0;
            }
            var st = window.getComputedStyle(el);
            if (st.display === 'none' || st.visibility === 'hidden' || st.position !== 'fixed') {
                return 0;
            }
            var r = el.getBoundingClientRect();
            var top = Math.max(rect.top, r.top);
            var bottom = Math.min(rect.bottom, r.bottom);
            return Math.max(0, bottom - top);
        }

        // fixed 叠层会遮住正文可见区域，需要扣除。
        visible -= overlapWithFixed('#lrbk_title');
        visible -= overlapWithFixed('#nav');

        return Math.max(0, visible);
    }
    var gnContentNode = $('#gnContent')[0];
    var gnComputedStyle = gnContentNode ? window.getComputedStyle(gnContentNode) : null;
    var inputFontSize = parseFloat(rfontsize);
    var inputLineSpacing = parseFloat(rlinespacing);

    // 分页参数以用户输入为最高优先级，避免“样式尚未落地”导致计算偏差。
    var resolvedFontSize = isFinite(inputFontSize) && inputFontSize > 0
        ? inputFontSize
        : (gnComputedStyle ? parseFloat(gnComputedStyle.fontSize) : 16);
    if (!isFinite(resolvedFontSize) || resolvedFontSize <= 0) {
        resolvedFontSize = 16;
    }

    var resolvedLineHeight;
    if (isFinite(inputLineSpacing) && inputLineSpacing > 0) {
        resolvedLineHeight = resolvedFontSize * inputLineSpacing;
    } else {
        resolvedLineHeight = gnComputedStyle ? parseFloat(gnComputedStyle.lineHeight) : NaN;
        if (!isFinite(resolvedLineHeight) || resolvedLineHeight <= 0) {
            resolvedLineHeight = resolvedFontSize * 1.6;
        }
    }
    var rootReaderWidth = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--reader-content-width'));
    var resolvedContentWidth = isFinite(rootReaderWidth) && rootReaderWidth > 0 ? rootReaderWidth : (rcontentwidth || 960);
    var layoutConfig = {
        fontSize: resolvedFontSize,
        lineHeight: resolvedLineHeight,
        contentWidth: resolvedContentWidth,
        twoColumn: !!rtwocolumn
    };

    // 从原始内容中剥离所有内联事件属性，防止残留 onclick 跳广告
    (function stripInlineEvents(htmlStr) {
        if (!htmlStr) return;
        for (var i = 0; i < htmlStr.length; i++) {
            if (typeof htmlStr[i] === 'string') {
                htmlStr[i] = htmlStr[i].replace(/ on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');
            }
        }
    })(loadedContent[4]);

    // Refine the text
    // #gnContent 已由 margin:auto 居中，避免再额外叠加窗口级 sidepadding。
    var targetMaxWidth = layoutConfig.twoColumn ? (layoutConfig.contentWidth * 2) : layoutConfig.contentWidth;
    $('#gnContent').css('max-width', targetMaxWidth + 'px');

    var expectwidth = parseFloat($('#gnContent').innerWidth());
    if (!isFinite(expectwidth) || expectwidth <= 0) {
        expectwidth = targetMaxWidth;
    }
    var sidepadding = 0;
    var twoColumnGap = 0;
    var columnWidth = expectwidth;
    var textMeasureWidth = expectwidth;
    var probedLineHeight = NaN;
    var measuredLetterSpacingPx = 0;
    var measuredWordSpacingPx = 0;
    if (layoutConfig.twoColumn) {
        var minColumnWidth = 280;
        var adaptiveGap = Math.round(expectwidth * 0.03);
        var maxGapByWidth = Math.max(0, expectwidth - (minColumnWidth * 2));
        twoColumnGap = Math.min(24, adaptiveGap, maxGapByWidth);
        if (!isFinite(twoColumnGap) || twoColumnGap < 0) {
            twoColumnGap = 0;
        }
        $('#gnContent').css('--reader-two-column-gap', twoColumnGap + 'px');
        columnWidth = (expectwidth - twoColumnGap) / 2;
        if (!isFinite(columnWidth) || columnWidth <= 0) {
            columnWidth = expectwidth / 2;
        }

        // 使用真实双栏样式探针获取“列内容宽度 + 行高”，避免 padding/border 导致每行估算过宽。
        var $layoutProbe = $('<div class="bb-item two-column-item" style="position:absolute;visibility:hidden;left:-9999px;top:0;overflow:hidden;"></div>').appendTo('#gnContent');
        $layoutProbe.css({
            width: expectwidth + 'px',
            fontSize: resolvedFontSize + 'px',
            lineHeight: resolvedLineHeight + 'px',
            fontFamily: gnComputedStyle ? gnComputedStyle.fontFamily : undefined,
            letterSpacing: gnComputedStyle ? gnComputedStyle.letterSpacing : undefined,
            wordSpacing: gnComputedStyle ? gnComputedStyle.wordSpacing : undefined,
        });
        $layoutProbe.append('<div class="left-page column"><p class="fake-p">测</p><p class="fake-p">测</p></div>');
        $layoutProbe.append('<div class="right-page column"><p class="fake-p">测</p><p class="fake-p">测</p></div>');

        var $probeLeftCol = $layoutProbe.find('.left-page').first();
        var $probeRightCol = $layoutProbe.find('.right-page').first();
        var probeLeftWidth = parseFloat($probeLeftCol.width());
        var probeRightWidth = parseFloat($probeRightCol.width());
        var probeWidth = Math.min(
            isFinite(probeLeftWidth) && probeLeftWidth > 0 ? probeLeftWidth : Number.POSITIVE_INFINITY,
            isFinite(probeRightWidth) && probeRightWidth > 0 ? probeRightWidth : Number.POSITIVE_INFINITY
        );
        if (isFinite(probeWidth) && probeWidth > 0 && probeWidth < Number.POSITIVE_INFINITY) {
            textMeasureWidth = probeWidth;
        } else {
            textMeasureWidth = columnWidth;
        }

        var $probeP1 = $probeLeftCol.find('p').eq(0);
        var $probeP2 = $probeLeftCol.find('p').eq(1);
        var $probeRightP = $probeRightCol.find('p').eq(0);
        if ($probeP1.length > 0 && $probeP2.length > 0) {
            var probeRect1 = $probeP1[0].getBoundingClientRect();
            var probeRect2 = $probeP2[0].getBoundingClientRect();
            var probeOffset = probeRect2.top - probeRect1.top;
            if (isFinite(probeOffset) && probeOffset > 0) {
                probedLineHeight = Math.ceil(probeOffset) + 2;
            }
        }
        if ($probeRightP.length > 0) {
            var rightPStyle = window.getComputedStyle($probeRightP[0]);
            var ls = parseFloat(rightPStyle.letterSpacing);
            var ws = parseFloat(rightPStyle.wordSpacing);
            measuredLetterSpacingPx = isFinite(ls) ? ls : 0;
            measuredWordSpacingPx = isFinite(ws) ? ws : 0;
        }
        $layoutProbe.remove();
    } else {
        $('#gnContent').css('--reader-two-column-gap', '0px');
        textMeasureWidth = expectwidth;
    }

    //var curContent = $('#gnContent').html();
    var curContent = loadedContent[4];


    // 测量行高：相邻两个 <p> 的 offsetTop 差 = lineHeight + 折叠后的 margin
    // outerHeight(true) 会将上下边距重复累加（16+16=32px），但实际渲染中 margin 会折叠（仅保留 16px），
    // 因此用 offsetTop 差才能反映真实的每行占用高度
    var $tempWrapper = $('<div class="bb-item" style="position:absolute;visibility:hidden;left:-9999px;overflow:hidden;"></div>').appendTo('#gnContent');
    $tempWrapper.css({
        fontSize: layoutConfig.fontSize + 'px',
        lineHeight: layoutConfig.lineHeight + 'px',
        width: (layoutConfig.twoColumn ? textMeasureWidth : expectwidth) + 'px',
        fontFamily: gnComputedStyle ? gnComputedStyle.fontFamily : undefined,
        letterSpacing: gnComputedStyle ? gnComputedStyle.letterSpacing : undefined,
        wordSpacing: gnComputedStyle ? gnComputedStyle.wordSpacing : undefined,
    });
    var $tempP1 = $('<p class="fake-p">测</p>').appendTo($tempWrapper);
    var $tempP2 = $('<p class="fake-p">测</p>').appendTo($tempWrapper);
    var lheight = Math.ceil($tempP2[0].getBoundingClientRect().top - $tempP1[0].getBoundingClientRect().top) + 2;
    var fwidth = parseFloat($tempP1.css('font-size'));
    $tempWrapper.remove();
    if (isFinite(probedLineHeight) && probedLineHeight > 0) {
        lheight = probedLineHeight;
    }
    if (!isFinite(fwidth) || fwidth <= 0) {
        fwidth = layoutConfig.fontSize;
    }

    $('#gnContent').hide();
    var linerized = Convert(curContent);
    $('#gnContent').html(linerized.join(''));

    // 用“随字体缩放的固定项 + 行高比例 + 手动补偿”动态计算纵向安全余量。
    // 以 30px 为当前基准保持现状，小字号按比例减少底部留白，尽量控制在接近一行空白。
    var verticalBufferFontScale = resolvedFontSize / PAGINATION_VERTICAL_BUFFER_REFERENCE_FONT_PX;
    if (!isFinite(verticalBufferFontScale) || verticalBufferFontScale <= 0) {
        verticalBufferFontScale = 1;
    }
    verticalBufferFontScale = Math.max(PAGINATION_VERTICAL_BUFFER_MIN_SCALE, verticalBufferFontScale);

    var verticalBufferFixedPart = (
        PAGINATION_VERTICAL_BUFFER_BASE_PX +
        PAGINATION_VERTICAL_BUFFER_COMPENSATION_PX
    ) * verticalBufferFontScale;

    var verticalSafetyBuffer = Math.ceil(
        verticalBufferFixedPart +
        (lheight * PAGINATION_VERTICAL_BUFFER_LINE_RATIO)
    );
    if (!isFinite(verticalSafetyBuffer) || verticalSafetyBuffer < 0) {
        verticalSafetyBuffer = 24;
    }

    // 用真实可见高度计算可分页区域，而不是仅使用容器理论高度。
    // 再减去动态安全余量，防止最后一行被 overflow:hidden 截断。
    var availHeight = computeVisibleContentHeight() - verticalSafetyBuffer;
    if (!isFinite(availHeight) || availHeight <= 0) {
        availHeight = gnContentHeight - verticalSafetyBuffer;
    }

    //容纳行数
    //每行字数
    var chcnt;
    if (layoutConfig.twoColumn) {
        chcnt = parseInt((textMeasureWidth - 12) / fwidth);
    } else {
        chcnt = parseInt((expectwidth - 20) / fwidth);
    }
    if (!isFinite(chcnt) || chcnt < 1) {
        chcnt = 1;
    }

    // 输入行数
    var newlines = linerized;
    // 需要预先算出究竟要分几页，每页分到几个<p>!

    // 要用字数优先！
    var linecnt = Math.floor(availHeight / lheight);

    //应当以字数来精确计算
    var pagedinfo = $("<div></div>");
    var directionarray = [];

    function splitLinesByCharCount(charCountToUse) {
        var out = [];
        var safeCharCount = Math.max(1, parseInt(charCountToUse, 10) || 1);
        var horizontalSafetyPx = layoutConfig.twoColumn ? 14 : 10;
        var safeLineWidth = Math.max(1, (layoutConfig.twoColumn ? textMeasureWidth : expectwidth) - horizontalSafetyPx);

        var measureCanvas = document.createElement('canvas');
        var measureCtx = measureCanvas.getContext('2d');
        var gnStyle = window.getComputedStyle(document.getElementById('gnContent'));
        var fontStyle = gnStyle.fontStyle || 'normal';
        var fontVariant = gnStyle.fontVariant || 'normal';
        var fontWeight = gnStyle.fontWeight || '400';
        var fontSize = (parseFloat(gnStyle.fontSize) || layoutConfig.fontSize || 16) + 'px';
        var fontFamily = gnStyle.fontFamily || 'serif';
        if (measureCtx) {
            measureCtx.font = fontStyle + ' ' + fontVariant + ' ' + fontWeight + ' ' + fontSize + ' ' + fontFamily;
        }

        function measuredWidth(s) {
            if (!measureCtx) {
                return s.length * fwidth;
            }
            var base = measureCtx.measureText(s).width;
            var letterExtra = Math.max(0, s.length - 1) * measuredLetterSpacingPx;
            var spaces = (s.match(/\s/g) || []).length;
            var wordExtra = spaces * measuredWordSpacingPx;
            return base + letterExtra + wordExtra + 1;
        }

        function splitTextToFit(text) {
            var result = [];
            var ptr = 0;
            while (ptr < text.length) {
                var remain = text.length - ptr;
                var take = Math.min(safeCharCount, remain);
                var candidate = text.substring(ptr, ptr + take);
                if (measuredWidth(candidate) <= safeLineWidth) {
                    result.push(candidate);
                    ptr += take;
                    continue;
                }

                var lo = 1;
                var hi = take;
                var best = 1;
                while (lo <= hi) {
                    var mid = Math.floor((lo + hi) / 2);
                    var midText = text.substring(ptr, ptr + mid);
                    if (measuredWidth(midText) <= safeLineWidth) {
                        best = mid;
                        lo = mid + 1;
                    } else {
                        hi = mid - 1;
                    }
                }
                result.push(text.substring(ptr, ptr + best));
                ptr += best;
            }
            return result;
        }

        newlines.forEach(line => {
            var text = line.replace(/<p[^>]*>|<\/p>/g, "");
            var parts = splitTextToFit(text);
            parts.forEach(function (part) {
                out.push("<p class='fake-p'>" + part + "</p>");
            });
        });
        return out;
    }

    var sortedlines = splitLinesByCharCount(chcnt);
    console.debug("Line Count: " + linecnt + "; Every Line: " + chcnt);


    function buildPagedInfoWithLineCount(lineCountToUse) {
        var paged = $("<div></div>");
        var direction = [];
        var totalPagesForBuild = 0;
        var inPagingLocal = true;
        var lineptrLocal = 0;

        if (layoutConfig.twoColumn) {
            var pageBlocks = [];
            var pagePtr = 0;
            while (pagePtr < sortedlines.length) {
                pageBlocks.push(sortedlines.slice(pagePtr, pagePtr + lineCountToUse));
                pagePtr += lineCountToUse;
            }
            var totalPages = pageBlocks.length;
            for (var idx = 0; idx < totalPages; idx += 2) {
                totalPagesForBuild++;
                paged.append($("<div class='bb-item two-column-item' index=" + idx + "></div>"));
                if (totalPagesForBuild % 2 == 1) paged.find('.bb-item').last().addClass('odd-page');
                if (rdir) {
                    direction.push([0, idx]);
                } else {
                    direction.push([idx, 0]);
                }
                paged.find('.bb-item').last().append("<div class='left-page column'></div>");
                paged.find('.bb-item').last().append("<div class='right-page column'></div>");
                paged.find('.bb-item .left-page').last().append(pageBlocks[idx]);
                if (idx + 1 < totalPages) {
                    paged.find('.bb-item .right-page').last().append(pageBlocks[idx + 1]);
                }
            }
        } else {
            for (var i = 0; inPagingLocal; i++) {
                totalPagesForBuild++;
                paged.append($("<div class='bb-item' index=" + i + "></div>"));
                if (i % 2 == 0) paged.find('.bb-item').last().addClass('odd-page');
                if (rdir) {
                    direction.push([0, i]);
                } else {
                    direction.push([i, 0]);
                }
                paged.find('.bb-item').last().append("<div class='left-page column'></div>");
                paged.find('.bb-item').last().append("<div class='right-page column'></div>");
                for (var j = 0; j < lineCountToUse; j++) {
                    if (j < lineCountToUse / 2)
                        paged.find('.bb-item .left-page').last().append(sortedlines[lineptrLocal]);
                    else
                        paged.find('.bb-item .right-page').last().append(sortedlines[lineptrLocal]);
                    if (lineptrLocal++ == sortedlines.length) {
                        inPagingLocal = false;
                        break;
                    }
                }
            }
        }

        return {
            pagedinfo: paged,
            directionarray: direction,
            pages: totalPagesForBuild,
        };
    }

    function applyPagedInfoToDom(buildOut) {
        $('#gnContent').empty().append(buildOut.pagedinfo.html());
        var runtimePageHeight = Math.max(1, Math.floor(availHeight));
        $('#gnContent').find('.bb-item').css('width', expectwidth + "px");
        $('#gnContent').find('.bb-item').css('height', runtimePageHeight + "px");
        $('#gnContent').find('.bb-item').css('padding-right', sidepadding);
        $('#gnContent').find('.bb-item').css('padding-left', sidepadding);
    }

    function detectRenderedOverflow() {
        var overflowFound = { vertical: false, horizontal: false };
        $('#gnContent').find('.bb-item').each(function () {
            if (this.scrollHeight > this.clientHeight + 1) {
                overflowFound.vertical = true;
                return false;
            }
            $(this).find('.column').each(function () {
                if (this.scrollHeight > this.clientHeight + 1) {
                    overflowFound.vertical = true;
                    return false;
                }

                var fakePs = $(this).find('p.fake-p');
                for (var i = 0; i < fakePs.length; i++) {
                    var p = fakePs[i];
                    if (p.scrollWidth > p.clientWidth + 1) {
                        overflowFound.horizontal = true;
                        break;
                    }
                }

                if (this.scrollWidth > this.clientWidth + 1) {
                    overflowFound.horizontal = true;
                }

                if (overflowFound.vertical || overflowFound.horizontal) {
                    return false;
                }
            });
            if (overflowFound.vertical || overflowFound.horizontal) {
                return false;
            }
        });
        return overflowFound;
    }

    var pagingTry = 0;
    var maxPagingTry = 40;
    var workingLineCnt = Math.max(1, linecnt);
    var workingCharCnt = Math.max(1, chcnt);
    var buildResult;
    do {
        sortedlines = splitLinesByCharCount(workingCharCnt);
        pagedinfo = $("<div></div>");
        directionarray = [];
        buildResult = buildPagedInfoWithLineCount(workingLineCnt);
        applyPagedInfoToDom(buildResult);

        var overflowState = detectRenderedOverflow();
        if (!overflowState.vertical && !overflowState.horizontal) {
            break;
        }

        var progressed = false;
        if (overflowState.horizontal && workingCharCnt > 1) {
            workingCharCnt = Math.max(1, workingCharCnt - 1);
            progressed = true;
        }
        if (overflowState.vertical && workingLineCnt > 1) {
            workingLineCnt = Math.max(1, workingLineCnt - 1);
            progressed = true;
        }
        if (!progressed) {
            break;
        }
        pagingTry++;
    } while (pagingTry < maxPagingTry && (workingLineCnt > 1 || workingCharCnt > 1));

    linecnt = workingLineCnt;
    chcnt = workingCharCnt;

    pages = buildResult.pages;
    directionarray = buildResult.directionarray;


    $('#gnContent').attr('pages', pages);

    var readerEngineOptions = { layoutConfig: layoutConfig, direction: directionarray, loop: false };
    readerEngineInstance = createReaderEngine($('#gnContent'), readerEngineOptions);

    $('#currentindex').text('1');
    $('#totalindex').text(pages);
    bindScrollAction();

    // Calculate the progress pages.

    if (startp != 0) {
        var curfloor = parseInt(startp * pages);
        readerEngineInstance.scrollToFloor(curfloor);
        $('#currentindex').text(parseInt(curfloor) + 1);
    }
    $('#gnContent').show();


}; //Rewrite Page Done

function urlProceed(u) {
    // in content_script version, don't need handling
    return u;

};

/* To check if it's in bottom, and to see whether to load next page */

function detectBottom(e) {
    toBottom = document.body.clientHeight - 140 - ($('body').height() - $('body').scrollTop());
    if (Math.abs(toBottom - toBottom_d) < 1) {
        reachBottom = true;
    } else {
        reachBottom = false;
        toBottom_d = toBottom;
    }
    //if(reachBottom){
    if (true) {
        $('.fetchnext').click();
        return;
    }

}