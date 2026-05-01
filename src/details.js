import './jquery.js';

var cururl = null;

var target = null;
var port = null;
var progress = 0; //the reading progress in one chapter
var reconnected = false;
var rTitle = null;
var flist = [];
var clist = [];
var tlist = [];
var plist = [];
var nlist = [];
var dir = true;
var twocolumn = false;
var rjs = null;
var lastY = 0;
var sumDelta = 0;
var scrollCnt = 0;

var bklist = [];
var css = null;

function connectToBackground() {
    try {
        port = chrome.runtime.connect({ name: "detailspage" });
        if (chrome.runtime.lastError) {
            console.warn("details connectToBackground: runtime.lastError", chrome.runtime.lastError.message);
            port = null;
        }
    } catch (error) {
        console.warn("details connectToBackground: connect failed", error.message);
        port = null;
    }

    if (!port) {
        console.info("details connectToBackground: port null, retrying in 100ms...");
        setTimeout(connectToBackground, 100);
        return;
    }

    // Main function (Should be used recursively)
    port.onMessage.addListener(function (msg) {
        console.log(msg);
        //Log Print
        if (msg.type == 'cfg') {
            flist = msg.flist;
            clist = msg.clist;
            tlist = msg.tlist;
            plist = msg.plist;
            nlist = msg.nlist;
            dir = msg.dir;
            twocolumn = msg.twocolumn;
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
        if (msg.type == "action") {
            if (msg.content == 'refresh')
                refreshDetailsPage();
        };
    });

    // 监听断开连接事件
    port.onDisconnect.addListener(() => {
        console.info("Disconnected from background script. Reconnecting...");
        // 尝试重新连接
        reconnected = true;
        setTimeout(connectToBackground, 10); // 等待 0.01 秒后重连
    });
}

//Connect port
connectToBackground();

$(document).ready(function () {
    refreshDetailsPage();
    // Version Update
    // Get the manifest object
    const manifest = chrome.runtime.getManifest();

    // Access the manifest version
    const manifestVersion = manifest.version;
    $('#verid').html(manifestVersion);
});

function refreshDetailsPage() {
    chrome.storage.local.get({
        'clist': [], 'flist': [], 'tlist': [], 'plist': [], 'nlist': [],
        'dir': false, 'css': null, 'js': null, 'bookmarks': [], 'twocolumn': true,
        'fontsize': 16, 'linespacing': 1.6, 'contentwidth': 960
    }, function (result) {
        clist = result.clist;
        tlist = result.tlist;
        plist = result.plist;
        nlist = result.nlist;
        flist = result.flist;
        css = result.css;
        rjs = result.js;
        dir = result.dir;
        twocolumn = result.twocolumn;
        bklist = result.bookmarks;
        $('#text-selector').val(JSON.stringify(clist));
        $('#text-filter').val(JSON.stringify(flist));
        $('#reader-dir').prop("checked", dir);
        $('#two-column').prop("checked", twocolumn);
        $('#title-selector').val(JSON.stringify(tlist));
        $('#nav-p-selector').val(JSON.stringify(plist));
        $('#nav-selector').val(JSON.stringify(nlist));
        $('#cssinput').val(css);
        $('#jsinput').val(rjs);
        // Layout settings
        $('#fontsize').val(result.fontsize);
        $('#fontsize-val').text(result.fontsize + 'px');
        $('#linespacing').val(result.linespacing);
        $('#linespacing-val').text(result.linespacing.toFixed(1));
        $('#contentwidth').val(result.contentwidth);
        $('#contentwidth-val').text(result.contentwidth + 'px');
        // Load show
        displayPage();
    });
};





function displayPage() {
    //Refresh the bookmark
    //Insert current bkmarks

    //Display the bkmarks
    if (rTitle != null) {
    }

    //Show:
    $('.bookmarks-list').empty();

    for (var i = 0; i < bklist.length; i++) {
        var cstr = "<li><span class='spanbut del'>删</span><span class='linka' ind='" + i + "' progress='" + bklist[i].curprog + "' href='" + bklist[i].cururl + "'>" + bklist[i].rTitle + "</span></li>";
        $('.bookmarks-list').append(cstr);
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
        // Let's register this one and try to inject?
        port.postMessage({ type: "register", url: $(this).attr('href') });
        window.location = $(this).attr('href');
    });

    // Card-based section toggling (accordion mode - only one open at a time)
    // Ignore clicks while animation is in progress to prevent rapid toggling
    $('.section-header').click(function () {
        var $this = $(this);
        var $parent = $this.parent('.section-card');
        var $body = $this.next('.section-body');
        var $arrow = $this.find('.section-arrow');

        // Ignore click if section body is currently animating
        if ($body.is(':animated')) {
            return;
        }

        // Check if this section is already open
        var isOpening = !$body.is(':visible');

        if (isOpening) {
            // Close all other open sections first
            var $otherCards = $('.section-card').not($parent);
            $otherCards.each(function () {
                var $otherBody = $(this).find('.section-body');
                var $otherHeader = $(this).find('.section-header');
                var $otherArrow = $(this).find('.section-arrow');
                
                if ($otherBody.is(':visible')) {
                    $otherBody.stop(true, true).slideUp(200);
                    $otherHeader.removeClass('is-open');
                    $otherArrow.removeClass('is-open');
                    $otherBody.removeClass('is-open');
                }
            });
            
            // Open this section
            $body.stop(true, true).slideDown(200, function () {
                $this.addClass('is-open');
                $arrow.addClass('is-open');
            });
            $this.addClass('is-open');
            $arrow.addClass('is-open');
            $body.addClass('is-open');
        } else {
            // Close this section
            $body.stop(true, true).slideUp(200, function () {
                $this.removeClass('is-open');
                $arrow.removeClass('is-open');
            });
            $this.removeClass('is-open');
            $arrow.removeClass('is-open');
            $body.removeClass('is-open');
        }
    });

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
        var ptxt = $("#nav-p-selector").val();
        if (ptxt != "") {
            try {
                var cps = JSON.parse(ptxt);
                if (Object.prototype.toString.call(cps) === '[object Array]') {
                    plist = cps;
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

        var stwocolumn = $("#two-column").prop("checked");
        try {
            twocolumn = stwocolumn;
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
            chrome.storage.local.set({ "clist": clist, "flist": flist, "plist": plist, "nlist": nlist, "tlist": tlist, "dir": dir, "twocolumn": twocolumn }, function () {
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
        twocolumn = false;
        chrome.storage.local.set({ "clist": clist, "flist": flist, "plist": plist, "nlist": nlist, "tlist": tlist, "dir": dir, "twocolumn": twocolumn }, function () { });
        alert("重置完成");
        window.location.reload();
    });

    // Layout save/reset
    $('.layoutsave').click(function () {
        var fontsize = parseInt($('#fontsize').val());
        var linespacing = parseFloat($('#linespacing').val());
        var contentwidth = parseInt($('#contentwidth').val());
        chrome.storage.local.set({ "fontsize": fontsize, "linespacing": linespacing, "contentwidth": contentwidth }, function () {
            alert("排版设置保存完毕");
            window.location.reload();
        });
    });
    $('.layoutreset').click(function () {
        chrome.storage.local.set({ "fontsize": 16, "linespacing": 1.6, "contentwidth": 960 }, function () {
            alert("排版已重置为默认值");
            window.location.reload();
        });
    });

    // Live value display for range sliders
    $('#fontsize').on('input', function () {
        $('#fontsize-val').text($(this).val() + 'px');
    });
    $('#linespacing').on('input', function () {
        $('#linespacing-val').text(parseFloat($(this).val()).toFixed(1));
    });
    $('#contentwidth').on('input', function () {
        $('#contentwidth-val').text($(this).val() + 'px');
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
    var jsplc = "当有内容时，将会在处理解析页面内容时执行这段代码。\n\n注意： 强烈不建议普通用户修改增加这部分配置，如果是没有基础的用户，与其学习脚本编写，不如换个普通一点的网站。\n\n待处理的数据放在 loadedContent（对象）中，当前结构如下：\n\n\tloadedContent.title: 标题文本；\n\n\tloadedContent.prevHref: 上一页链接（字符串，可能为空）；\n\n\tloadedContent.nextHref: 下一页链接（字符串，可能为空）；\n\n\tloadedContent.contentHtml: 正文 HTML 字符串。\n\n你可以直接修改 loadedContent 里的字段，也可以 return 一个新的 loadedContent 对象。\n\n处理完毕后，必须把结果以 loadedContent 结构返回；需要更多信息，建议先通过 console.log(loadedContent) 打印理解。";


    $('#jsinput').attr('placeholder', jsplc);

    var cssplc = "留空使用系统内置主题,当有内容时，将会用此内容覆盖。\n\n涉及关键字：#gnContent（正文）， #lrbk_title（标题，根据原始页面的标记可能有h1-h4等各级），#nav （翻页按钮）\n\n 需要更多信息，请通过检视页面来获取。"
    $('#cssinput').attr('placeholder', cssplc);

}; // End of displayPage
