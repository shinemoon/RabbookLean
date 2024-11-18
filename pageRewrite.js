function rewritePage(wctn, startp) {

    if (rjs != null && rjs != "") {
        eval(rjs);
    }
    $('body').empty();
    //    $('body').attr('style','');
    $('body').attr('style', '');
    var fontpath = chrome.runtime.getURL('/font');
    var fontstr = "@font-face {font-family: 'Kesong';src: url('" + fontpath + "/font.ttf') format('truetype');}";
    $('body').append('<style>' + fontstr + '</style>');


    //Title
    $('body').append('<div id="lrbk_title"></div>');
    $('body').append('<div id="indexinfo"><span id="currentindex"></span> / <span id="totalindex"></span></div>');
    $('#lrbk_title').append(wctn[0]);

    $('#lrbk_title').click(function () {
        window.location.href = cururl;
    });


    //Content
    $('body').append(wctn[4]);
    $('body').find('a').remove();

    //Navigation
    $('body').append('<div class="pnav" id="pup"></div>');
    $('body').append('<div class="pnav" id="pdown"></div>');
    var nv = $("<div id='nav'></div>");
    nv.append("<tr><td><span class='fetchnext' style='cursor:pointer;' href='" + urlProceed(wctn[3][0].getAttribute('href')) + "'>" + "下一章" + "</span></td></tr>");
    $('body').append(nv);
    $('body').find('[style]').removeAttr('style');
    $('body').find('[onkeydown]').removeAttr('onkeydown');

    $('body').append("<iframe id='npage' style='display:none;' src='" + urlProceed(wctn[3][0].getAttribute('href')) + "'></iframe>")


    // Go to top
    window.scrollTo(0, 0);
    //For next page's info
    $('.fetchnext').unbind('click').bind('click', function () {
        reachBottom = false;
        toBottom = 200;
        toBottom_d = 0;
        rTitle = document.getElementById('npage').contentWindow.document.head.getElementsByTagName("title")[0].innerHTML;
        progress = 0;
        loadNextPage();
    });


    /* 
        Handle page actions : keyup/click
    */
    $(document).unbind('keyup').bind('keyup', function (e) {
        bindClickPress(e);
    });

    $(document).unbind('click').bind('click', function (e) {
        bindClickPress(e);
    });



    function bindClickPress(e) {
        /*
        //Bind the scrollevent
        */
        ascensor.on("scrollEnd", function (e, floor) {
            if (floor.to == $('.bb-item').length - 1) {
                lastpage = true;
            }
            $('#currentindex').text(parseInt(floor.to) + 1);
            $('#totalindex').text(pages);
            progress = (floor.to) / pages;
            try {
                port.postMessage({ type: "updatebk", rTitle: rTitle, cururl: cururl, progress: progress });
            } catch (error) {
                console.error("Port is disconnected", error);
            }
        });

        ascensor.on("scrollStart", function (e, floor) {
            lastpage = false;
        });


        // Page Turn Navigator Click
        //
        $('#pup').unbind('click').bind('click', function () {
            ascensorInstance.prev();
        });

        $('#pdown').unbind('click').bind('click', function () {
            if (lastpage)
                detectBottom();
            else
                ascensorInstance.next();
        });

        //;
        // Go to floor
        if (e.keyCode == 81) {
            var tofloor = prompt("请输入跳转页数", "")
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


        if (e.keyCode == 186) {
            rTitle = document.getElementById('npage').contentWindow.document.head.getElementsByTagName("title")[0].innerHTML;
            loadNextPage();
        }
        // pagedown;
        if (e.keyCode == 32 || e.keyCode == 34 || e.keyCode == 40) {
            //ascensorInstance.scrollToDirection('left');
            if (lastpage)
                detectBottom();
            else
                ascensorInstance.next();
        };

        // pageup;
        if (e.keyCode == 33) {
            //ascensorInstance.scrollToDirection('right');
            ascensorInstance.prev();
        };

    };


    $(document).unbind('mousewheel').bind('mousewheel', function (e) {
        if (notinpaging == false)
            return 0;
        /*
        //Bind the scrollevent
        */
        ascensor.on("scrollEnd", function (e, floor) {
            if (floor.to == $('.bb-item').length - 1) {
                lastpage = true;
            }
            $('#currentindex').text(parseInt(floor.to) + 1);
            $('#totalindex').text(pages);
            progress = (floor.to) / pages;
            try {
                port.postMessage({ type: "updatebk", rTitle: rTitle, cururl: cururl, progress: progress });
            } catch (error) {
                console.error("Port is disconnected", error);
            }

            pgtimer = window.setTimeout(function () {
                notinpaging = true;
            }, PGTIME);
        });

        ascensor.on("scrollStart", function (e, floor) {
            lastpage = false;
            notinpaging = false;
        });



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
                    if (lastpage)
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
    var wheight = $(window).height() - 120;

    var expectwidth = 960; // Default central colume = 960px;
    // Calculate the padding ;
    if (wwidth <= expectwidth) expectwidth = wwidth;
    var sidepadding = (wwidth - expectwidth) / 2;




    var curContent = $('#gnContent').html();


    $('#gnContent').hide();
    var linerized = Convert(curContent);
    $('#gnContent').html(linerized.join(''));


    var lheight = parseInt($('p').outerHeight(true));
    var fwidth = parseInt($('p').css('font-size'));
    //console.info("Line Height:" + $('p').outerHeight(true));

    //容纳行数
    //TODO: 重算！
    //每行字数
    var chcnt = parseInt((expectwidth - 20) / fwidth);

    // 输入行数
    var newlines = linerized;
    // TODO: 每页所谓的行数将是动态的，即，这里的行数会是<p>数量
    // 需要预先算出究竟要分几页，每页分到几个<p>!

    // 要用字数优先！
    var linecnt = parseInt((wheight) / lheight) - parseInt((80) / lheight);


    //应当以字数来精确计算
    var pagedinfo = $("<div></div>");
    var directionarray = [];

    // 重新生成以及打断字符段落
    // 定义存储结果的新数组
    var sortedlines = [];

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
        for (var j = 0; j < linecnt; j++) {
            pagedinfo.find('.bb-item').last().append(sortedlines[lineptr]);
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


    $('body').append("<div id='hint'>';':下一章  'q':跳转页面 </div>");
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
