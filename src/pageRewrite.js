// 守卫检查：如果当前页面是 about:blank 或 chrome:// 等受限页面，直接返回
(function() {
    var protocol = window.location.protocol;
    if (protocol === 'about:' || protocol === 'chrome:' || protocol === 'edge:' || protocol === 'chrome-extension:' || protocol === 'data:' || protocol === 'devtools:') {
        console.warn('pageRewrite: cannot run on restricted page:', window.location.href);
        // 抛出一个可被 catch 的错误，让调用方知道执行被阻止
        throw new Error('pageRewrite blocked on restricted page');
    }
})();

function lastpage() {
    return $("#currentindex").text() == $("#totalindex").text();
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
    //    $('body').attr('style','');
    $('body').attr('style', '');
    var fontpath = chrome.runtime.getURL('src/font');
    var fontstr = "@font-face {font-family: 'Kesong';src: url('" + fontpath + "/font.ttf') format('truetype');}";
    $('body').append('<style>' + fontstr + '</style>');

    fontpath = fontpath + "/fonts"; // 定义字体文件路径
    fontstr = `
@font-face {
    font-family: 'icomoon';
    src: url('${fontpath}/icomoon.eot?cmcz0s');
    src: url('${fontpath}/icomoon.eot?cmcz0s#iefix') format('embedded-opentype'),
         url('${fontpath}/icomoon.ttf?cmcz0s') format('truetype'),
         url('${fontpath}/icomoon.woff?cmcz0s') format('woff'),
         url('${fontpath}/icomoon.svg?cmcz0s#icomoon') format('svg');
    font-weight: normal;
    font-style: normal;
    font-display: block;
}`;


    $('body').append('<style>' + fontstr + '</style>');

    //Title
    $('body').append('<div id="lrbk_title"></div>');
    $('body').append('<div id="indexinfo"><span id="currentindex"></span> / <span id="totalindex"></span></div>');
    $('#lrbk_title').append(loadedContent[0]);

    $('#lrbk_title').click(function () {
        window.location.href = cururl;
    });


    //Content
    $('body').append($(loadedContent[4]));
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
    // 清除所有定时器
    var highestTimerId = window.setTimeout(function(){}, 0);
    for (var i = 0; i <= highestTimerId; i++) {
        window.clearTimeout(i);
        window.clearInterval(i);
    }
    // 移除 head 中残留的 link/style/script 标签（保留扩展自身注入的）
    $('head').find('link, style, script').not('[src*="main.css"], [src*="main.js"], [src*="pageRewrite"]').remove();
    // 移除 body 中可能残留的 link/script/style/iframe（排除 ppage/npage）
    $('body').find('link, script, style, noscript, iframe:not(#ppage, #npage)').remove();
    // 重新确保 ppage/npage iframe 隐藏（上述清理可能间接影响其 display:none）
    $('#ppage').css('display', 'none');
    $('#npage').css('display', 'none');
    // 清除所有内联事件属性，防止残留 JS 干扰
    // jQuery removeAttr() 一次只接受一个属性名，需逐个清理
    var inlineAttrs = ['onclick','onmouseover','onmouseout','onkeydown','onkeyup','onsubmit','onchange','onfocus','onblur','onload','onerror','onmousedown','onmouseup','ondblclick','oncontextmenu','onwheel','ontouchstart','ontouchend','ontouchmove','onpointerdown','onpointermove','onpointerup'];
    $('body').find('*').each(function() {
        var $el = $(this);
        for (var a = 0; a < inlineAttrs.length; a++) {
            $el.removeAttr(inlineAttrs[a]);
        }
    });

    // 清除全局绑定的键盘事件监听器
    const eventTypes = ["keydown", "keypress", "keyup"];
    const allowedKeys = new Set(["j", "k", "q", "l", "h", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "PageUp", "PageDown", "Space", " "]); // 允许的按键

    // 阻止所有按键事件的回调仅允许特定：
    const preventEvent = (event) => {
        if (allowedKeys.has(event.key) && event.type === "keydown") {
            console.info("Allow:" + event.type);
            bindScrollAction();
            // Next Page
            if (event.key === "j" || event.key === "Space" || event.key === " " || event.key === "ArrowRight" || event.key === "PageDown") {
                if (lastpage())
                    detectBottom();
                else
                    ascensorInstance.next();
            } else if (event.key === "k" || event.key === "ArrowLeft" || event.key === "PageUp") {
                ascensorInstance.prev();
            } else if (event.key === "l" || event.key === "ArrowDown") {
                rTitle = document.getElementById('npage').contentWindow.document.head.getElementsByTagName("title")[0].innerHTML;
                $('.fetchnext').click();
            } else if (event.key === "h" || event.key === "ArrowUp") {
                rTitle = document.getElementById('ppage').contentWindow.document.head.getElementsByTagName("title")[0].innerHTML;
                $('.fetchprev').click();
            } else if (event.key === "q") {
                // Go to floor
                var tofloor = prompt("请输入跳转页数", "");
                if (tofloor < 1 || tofloor > pages) {
                    if (tofloor < 1) {
                        ascensorInstance.scrollToFloor(0);
                    }
                    if (tofloor > pages) {
                        ascensorInstance.scrollToFloor(pages - 1);
                    }
                } else {
                    ascensorInstance.scrollToFloor(parseInt(tofloor) - 1);
                }
            }
        }
        event.stopPropagation(); // 阻止事件冒泡
        event.preventDefault(); // 阻止默认行为（如键盘快捷键）
        event.stopImmediatePropagation(); // 阻止后续事件触发
    };

    // 为所有按键事件添加覆盖处理
    eventTypes.forEach(type => {
        // 移除之前添加的监听器（如果有）
        window.removeEventListener(type, preventEvent, true);
        // 捕获阶段阻止事件
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
        const body = document.body;
        if (enable) {
            body.style.filter = "invert(0.8) hue-rotate(180deg)";
            $('#switch').removeClass("icon-toggle-on").addClass("icon-toggle-off");
        } else {
            body.style.filter = "none";
            $('#switch').removeClass("icon-toggle-off").addClass("icon-toggle-on");
        }
        // Send update
        port.postMessage({ type: "configupdate", innight:inNight});

    }

    // Switch day/night
    $('#switch').unbind('click').bind('click', function () {
        if ($(this).hasClass("icon-toggle-on")) {
            inNight = true;
        } else {
            inNight = false;
        }
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

    function bindScrollAction(tout = false) {
        /*
        //Bind the scrollevent
        */
        ascensor.on("scrollEnd", function (e, floor) {
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
        ascensor.on("scrollStart", function (e, floor) {
            if (tout)
                notinpaging = false;
        });

    }

    function bindClickPress(e) {
        bindScrollAction();
        // Page Turn Navigator Click
        //
        $('#pup').unbind('click').bind('click', function () {
            ascensorInstance.prev();
        });

        $('#pdown').unbind('click').bind('click', function () {
            if (lastpage())
                detectBottom();
            else
                ascensorInstance.next();
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
                        ascensorInstance.next();

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
                    ascensorInstance.prev();
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
    var gnContentHeight = $('#gnContent').height();

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
    var wwidth = $(window).width();

    var expectwidth = rtwocolumn ? (rcontentwidth * 2) : rcontentwidth; // Use configured content width
    // Calculate the padding ;
    if (wwidth <= expectwidth) expectwidth = wwidth;
    var sidepadding = (wwidth - expectwidth) / 2;

    //var curContent = $('#gnContent').html();
    var curContent = loadedContent[4];


    // 测量行高：相邻两个 <p> 的 offsetTop 差 = lineHeight + 折叠后的 margin
    // outerHeight(true) 会将上下边距重复累加（16+16=32px），但实际渲染中 margin 会折叠（仅保留 16px），
    // 因此用 offsetTop 差才能反映真实的每行占用高度
    var $tempWrapper = $('<div class="bb-item" style="position:absolute;visibility:hidden;left:-9999px;overflow:hidden;"></div>').appendTo('body');
    var $tempP1 = $('<p class="fake-p">测</p>').appendTo($tempWrapper);
    var $tempP2 = $('<p class="fake-p">测</p>').appendTo($tempWrapper);
    var lheight = $tempP2[0].offsetTop - $tempP1[0].offsetTop + 1; // +1 防止最后一行被 overflow:hidden 截断
    var fwidth = parseInt($tempP1.css('font-size'));
    $tempWrapper.remove();

    $('#gnContent').hide();
    var linerized = Convert(curContent);
    $('#gnContent').html(linerized.join(''));

    // 精确计算可用高度：使用 hide() 前保存的 gnContentHeight (CSS: calc(100% - 60px) box-sizing:border-box)
    // 减去 4px 余量防止最后一行被 overflow:hidden 截断
    var availHeight = gnContentHeight - 4;

    //容纳行数
    //每行字数
    var chcnt;
    if (rtwocolumn) {
        chcnt = parseInt((expectwidth - 400) / fwidth);
        chcnt = parseInt(chcnt / 2);
    } else {
        chcnt = parseInt((rcontentwidth - 20) / fwidth);
    }

    // 输入行数
    var newlines = linerized;
    // 需要预先算出究竟要分几页，每页分到几个<p>!

    // 要用字数优先！
    var linecnt = Math.floor(availHeight / lheight);

    //应当以字数来精确计算
    var pagedinfo = $("<div></div>");
    var directionarray = [];

    // 重新生成以及打断字符段落
    // 定义存储结果的新数组
    var sortedlines = [];
    console.debug("Line Count: " + linecnt + "; Every Line: " + chcnt);

    // 遍历每一段内容
    newlines.forEach(line => {
        // 移除段落标签，提取纯文本
        var text = line.replace(/<p[^>]*>|<\/p>/g, "");
        // 分段
        while (text.length > 0) {
            // 提取当前段落的一部分，不超过chcnt
            var part = text.substring(0, chcnt);
            // 将当前部分重新包装成段落并推入新数组
            sortedlines.push(`<p class='fake-p'>${part}</p>`);
            // 移除已处理的部分
            text = text.substring(chcnt);
        }
        // 在每个原始的段落后面插入一个空段落 (暂时不做，太空了)
        //sortedlines.push("<p class='true-p'>&nbsp</p>");
    });


    //接下来是把sortedllines分成N页，每页linecnt行

    //计算页数
    var inPaging = true;
    var lineptr = 0;
    var pages = 0;
    if (rtwocolumn) {
        // 双栏模式：每屏（bb-item）显示两页（左栏=第N页，右栏=第N+1页）
        // 先将 sortedlines 按 linecnt 行一组切分成单页
        var pageBlocks = [];
        var pagePtr = 0;
        while (pagePtr < sortedlines.length) {
            pageBlocks.push(sortedlines.slice(pagePtr, pagePtr + linecnt));
            pagePtr += linecnt;
        }
        var totalPages = pageBlocks.length;
        // 每两页一组放入一个 bb-item
        for (var i = 0; i < totalPages; i += 2) {
            pages++;
            pagedinfo.append($("<div class='bb-item two-column-item' index=" + i + "></div>"));
            if (pages % 2 == 1) pagedinfo.find('.bb-item').last().addClass('odd-page');
            if (rdir) {
                directionarray.push([0, i]);
            } else {
                directionarray.push([i, 0]);
            }
            pagedinfo.find('.bb-item').last().append("<div class='left-page column'></div>");
            pagedinfo.find('.bb-item').last().append("<div class='right-page column'></div>");
            // 左栏 = 第i页
            pagedinfo.find('.bb-item .left-page').last().append(pageBlocks[i]);
            // 右栏 = 第i+1页（如果存在）
            if (i + 1 < totalPages) {
                pagedinfo.find('.bb-item .right-page').last().append(pageBlocks[i + 1]);
            }
        }
    } else {
        for (var i = 0; inPaging; i++) {
            pages++;
            pagedinfo.append($("<div class='bb-item' index=" + i + "></div>"));
            if (i % 2 == 0) pagedinfo.find('.bb-item').last().addClass('odd-page');
            if (rdir) {
                directionarray.push([0, i]);
            } else {
                directionarray.push([i, 0]);
            }
            pagedinfo.find('.bb-item').last().append("<div class='left-page column'></div>");
            pagedinfo.find('.bb-item').last().append("<div class='right-page column'></div>");
            for (var j = 0; j < linecnt; j++) {
                if (j < linecnt / 2)
                    pagedinfo.find('.bb-item .left-page').last().append(sortedlines[lineptr]);
                else
                    pagedinfo.find('.bb-item .right-page').last().append(sortedlines[lineptr]);
                if (lineptr++ == sortedlines.length) {
                    inPaging = false;
                    break;
                }
            }
        }
    }


    $('#gnContent').empty().append(pagedinfo.html());
    $('#gnContent').find('.bb-item').css('width', expectwidth + "px");
    $('#gnContent').find('.bb-item').css('padding-right', sidepadding);
    $('#gnContent').find('.bb-item').css('padding-left', sidepadding);


    $('#gnContent').attr('pages', pages);

    //var ascensor = $('#gnContent').ascensor();
    var ascensor = $('#gnContent').ascensor({ time: 200, easing: 'easeInOutCirc', height: '100%', wheelNavigation: false, direction: directionarray });
    ascensorInstance = ascensor.data('ascensor');   // Access instance

    $('#currentindex').text('1');
    $('#totalindex').text(pages);

    // Calculate the progress pages.

    if (startp != 0) {
        var curfloor = parseInt(startp * pages);
        ascensorInstance.scrollToFloor(curfloor);
        $('#currentindex').text(parseInt(curfloor) + 1);
    }
    $('#gnContent').show();


    $('body').append("<div id='hint'> 'q':跳转页面 </div>");
    setTimeout(function () {
        $('#hint').hide();
    }, 2000);


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