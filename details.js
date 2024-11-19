var cururl = null;

var target = null;
var port = chrome.runtime.connect({ name: "detailspage" });
var progress = 0; //the reading progress in one chapter
var rTitle = null;
var flist = [];
var clist = [];
var tlist = [];
var nlist = [];
var dir = true;
var twocolumn= false;
var rjs = null;
var lastY = 0;
var sumDelta = 0;
var scrollCnt = 0;

var bklist = [];



$(document).ready(function () {
    chrome.storage.local.get({ 'clist': [], 'flist': [], 'tlist': [], 'nlist': [], 'dir': false, 'css': null, 'js': null, 'bookmarks': [],'twocolumn':false }, function (result) {
        clist = result.clist;
        tlist = result.tlist;
        nlist = result.nlist;
        flist = result.flist;
        css = result.css;
        rjs = result.js;
        dir = result.dir;
        twocolumn=result.twocolumn;
        bklist = result.bookmarks;
        $('#text-selector').val(JSON.stringify(clist));
        $('#text-filter').val(JSON.stringify(flist));
        $('#reader-dir').prop("checked", dir);
        $('#two-column').prop("checked", twocolumn);
        $('#title-selector').val(JSON.stringify(tlist));
        $('#nav-selector').val(JSON.stringify(nlist));
        $('#cssinput').val(css);
        $('#jsinput').val(rjs);


        // Load show
        displayPage();
    });


    // Main function (Should be used recursively)

    port.onMessage.addListener(function (msg) {
        //Log Print
        if (msg.type == 'cfg') {
            flist = msg.flist;
            clist = msg.clist;
            tlist = msg.tlist;
            nlist = msg.nlist;
            dir = msg.dir;
            twocolumn= msg.twocolumn;
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
    });
});




function displayPage() {
    //Refresh the bookmark
    //Insert current bkmarks

    //Display the bkmarks
    if (rTitle != null) {
    }

    //Show:

    for (var i = 0; i < bklist.length; i++) {
        var cstr = "<li><span class='spanbut del'>删</span><span class='linka' ind='" + i + "' progress='" + bklist[i].curprog + "' href='" + bklist[i].cururl + "'>" + bklist[i].rTitle + "</span></li>";
        $('#bkmarks .bookmarks ul').append(cstr);
    }

    $('.del.spanbut').click(function () {
        var ind = $(this).parent().find('.linka').eq(0).attr('ind');
        var tmplist = bklist.slice(0, Number(ind));
        tmplist = tmplist.concat(bklist.slice(Number(ind) + 1, bklist.length));
        bklist = tmplist;
        chrome.storage.local.set({ 'bookmarks': bklist }, function () {
            console.info("Bookmarks Updated Done");
            window.location.reload();
        });
    });



    $('.linka').click(function () {
        var ind = $(this).attr('ind');
        console.log($(this).attr('ind'));
        chrome.storage.local.set({ 'bookmarks': bklist }, function () {
            console.info("Bookmarks Updated Done");
        });
        //Open and injection
        window.location = $(this).attr('href');
    });

    $('.hidetgt').hide();
    $('.hidetgt.bookmarks').show();
    $('.save').click(function () {
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

        var sdir = $("#reader-dir").prop("checked");
        try {
            dir = sdir;
        } catch (err) {
            sok = false;
        };

        var stwocolumn= $("#two-column").prop("checked");
        try {
            twocolumn= stwocolumn;
        } catch (err) {
            sok = false;
        };


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
            chrome.storage.local.set({ "clist": clist, "flist": flist, "nlist": nlist, "tlist": tlist, "dir": dir , "twocolumn":twocolumn}, function () {
                alert("设置完成");
                window.location.reload();
            });
        } else {
            alert("配置无效，请检查格式。");
        }
    });

    $('.reset').click(function () {
        clist = [];
        flist = [];
        dir = false;
        twocolumn= false;
        chrome.storage.local.set({ "clist": clist, "flist": flist, "nlist": nlist, "tlist": tlist, "dir": dir,"twocolumn":twocolumn }, function () { });
        alert("重置完成");
        window.location.reload();
    });

    $('.csssave').click(function () {
        css = $('#cssinput').val();
        chrome.storage.local.set({ "css": css }, function () {
            alert("样式保存完毕");
            window.location.reload();
        });
    });
    $('.cssclean').click(function () {
        $('#cssinput').val("");
        $('.csssave').click();
    });

    $('.jssave').click(function () {
        rjs = $('#jsinput').val();
        chrome.storage.local.set({ "js": rjs }, function () {
            alert("脚本保存完毕");
            window.location.reload();
        });
    });
    $('.jsclean').click(function () {
        $('#jsinput').val("");
        $('.jssave').click();
    });



    //Some patch
    var jsplc = "当有内容时，将会在处理解析页面内容时执行这段代码。\n\n注意： 强烈不建议普通用户修改增加这部分配置，如果是没有基础的用户，与其学习脚本编写，不如换个普通一点的网站。 \n\n而待处理的页面内容，此时已经被放置在名为target的全局数组中，目前有意义的部分是：\n\n\ttarget[0]: 标题名; \n\n\ttarget[3][0]: 包含有翻页内容的页面元素（即通过前面的翻页选择所选定的内容）; \n\n\ttarget[4][0]: 包含有正文信息的页面元素（即通过前面的正文选择所选定的内容)。\n\n处理完毕后，需要原样传递回target参数内,需要更多信息，建议先通过console.log打印target来理解。";


    $('#jsinput').attr('placeholder', jsplc);

    var cssplc = "留空使用系统内置主题,当有内容时，将会用此内容覆盖。\n\n涉及关键字：#gnContent（正文）， #lrbk_title（标题，根据原始页面的标记可能有h1-h4等各级），#nav （翻页按钮）\n\n 需要更多信息，请通过检视页面来获取。"
    $('#cssinput').attr('placeholder', cssplc);

    $('.topline').click(function () {
        console.log($(this).attr('toggle_target'));
        if ($(this).hasClass('hide')) {
            $('.topline').addClass('hide');
            $(this).removeClass('hide');
            //Hide sub
            $('.hidetgt').hide();
            $("." + $(this).attr('toggle_target')).show();
        } else {
            //        $('.topline').removeClass('hide');
            //       $(this).addClass('hide');
            //      $("."+$(this).attr('toggle_target')).hide();
        }
    });
}; // End of displayPage

