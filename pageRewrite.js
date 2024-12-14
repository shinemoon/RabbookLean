
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

    if (rjs != null && rjs != "") {
        eval(rjs);
    }
    $('body').empty();
    //    $('body').attr('style','');
    $('body').attr('style', '');
    var fontpath = chrome.runtime.getURL('/font');
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

    $('body').find('[style]').removeAttr('style');
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



    // Refine the text
    var wwidth = $(window).width();
    //var wheight = $(window).height() - 120;
    // To make more wise calculation
    var wheight = $(window).height() - 120;

    var expectwidth = rtwocolumn ? 1280 : 960; // Default central colume = 960px;
    // Calculate the padding ;
    if (wwidth <= expectwidth) expectwidth = wwidth;
    var sidepadding = (wwidth - expectwidth) / 2;

    //var curContent = $('#gnContent').html();
    var curContent = loadedContent[4];


    $('#gnContent').hide();
    var linerized = Convert(curContent);
    $('#gnContent').html(linerized.join(''));


    var lheight = parseInt($('p').outerHeight(true)) + 1;
    var fwidth = parseInt($('p').css('font-size'));
    //console.info("Line Height:" + $('p').outerHeight(true));

    //容纳行数
    //每行字数
    var chcnt;
    if (rtwocolumn) {
        chcnt = parseInt((expectwidth - 400) / fwidth);
        chcnt = parseInt(chcnt / 2);
    } else {
        chcnt = parseInt((expectwidth - 20) / fwidth);
    }

    // 输入行数
    var newlines = linerized;
    // 需要预先算出究竟要分几页，每页分到几个<p>!

    // 要用字数优先！
    var linecnt;
    if (rtwocolumn) {
        linecnt = parseInt((wheight - 80) / lheight);
        linecnt = linecnt * 2;
    } else {
        linecnt = parseInt((wheight - 80) / lheight);
    }

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
    for (var i = 0; inPaging; i++) {
        pages++;
        pagedinfo.append($("<div class='bb-item' index=" + i + "></div>"));
        // Set padding
        if (i % 2 == 0) pagedinfo.find('.bb-item').last().addClass('odd-page');
        /* Define the direction */
        /* Claud */
        if (rdir) {
            directionarray.push([0, i]);
        } else {
            directionarray.push([i, 0]);
        }
        // for 2 column, always sent them into 2 block, but control the css style .
        pagedinfo.find('.bb-item').last().append("<div class='left-page column'></div>");
        pagedinfo.find('.bb-item').last().append("<div class='right-page column'></div>");
        for (var j = 0; j < linecnt; j++) {
            if (rtwocolumn) {
                pagedinfo.find('.bb-item').last().addClass('two-column-item');
            }
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

