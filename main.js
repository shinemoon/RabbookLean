
/* 
===============================
    Text Handling Functions
===============================
*/

// Page Parameter
var ascensorInstance;   // Access instance
var notinpaging = true; // Avoid wheel paging to fast
var pgtimer = null;
var PGTIME = 800;

var reconnected = false;


// 全局变量
var buffers = [null, null, null, null, null];


var target = null;
var port;


// 建立与 Service Worker 的连接
function connectToBackground() {
    port = chrome.runtime.connect({ name: "contpage" });

    console.log("Connected to background script");

    // 监听来自背景脚本的消息
    port.onMessage.addListener(function (msg) {
        console.log("Received message from background:", msg);
        //Log Print
        if (msg.type == 'cfg') {
            rflist = msg.flist;
            rclist = msg.clist;
            rtlist = msg.tlist;
            rplist = msg.plist;
            rnlist = msg.nlist;
            rdir = msg.dir;
            rtwocolumn = msg.twocolumn;
            rjs = msg.js;
        };
        if (msg.type == "go" && reconnected == false) {
            if (msg.progress != null) {
                progress = msg.progress;
                handlePage(progress);
            } else {
                handlePage(0);
            }
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
var twocolumn = false;
var rjs = null;
var lastY = 0;
var sumDelta = 0;
var scrollCnt = 0;

// Page elements
//To detect bottom reach event
var reachBottom = false;
var toBottom = 200;
var toBottom_d = 0;
var lastpage = false;
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

    handleContent(r, cururl);
    rewritePage(cururl, startp);
};


// Handle the page content;
function handleContent(bodytxt, url = null) {
    console.log("handle content");
    // 先查找buffers有没有存好的! 如果已经解析过了，就不用去反复解析了 
    console.log('url:'+url);
    let buf = fetchBuf(generateShortHash(url));
    if (buf != null) {
        console.log('hit url');
//        target = buf.content;
        return;
    }

    dummy = $("<div id='dummy'></div>");
    dummy.append(bodytxt);

    //Remove script
    dummy.find('script').remove();
    //Remove redundancy
    dummy.find('link').remove();
    dummy.find('ins').remove();
    $('table, tr, td').filter(function (index) {
        if ($(this).text().match('.*[下|后]\s*一*\s*[章|回|页|节].*')) {
            return false;
        } else {
            return true;
        }
    }).remove();

    var cbody = dummy;
    var jres = judgePage(cbody);
    // If there is still next page then let's load it.
    // This is actually one recurve one.
    if (jres[0]) {
        cbody.find('iframe').remove();
        cbody.find('iframe').css('display', 'none!important');

        //To extract the content and navigations
        let loaded = parseContent(cbody);

    //And update the bufarray
        pushBuf({ 'key': generateShortHash(url), 'content': loaded});


    
    }
};



function loadPrevPage() {
    lastpage = false;
    window.clearTimeout(pgtimer);
    notinpaging = false;
    // Get content from iframe
    cururl = $('#ppage').prop('src');
    handleContent(document.getElementById('ppage').contentWindow.document.body.innerHTML, cururl);
    rewritePage(cururl, 0);
    pgtimer = window.setTimeout(function () {
        notinpaging = true;
    }, PGTIME);
};
function loadNextPage() {
    lastpage = false;
    window.clearTimeout(pgtimer);
    notinpaging = false;
    // Get content from iframe
    cururl = $('#npage').prop('src');
    handleContent(document.getElementById('npage').contentWindow.document.body.innerHTML, cururl);
    rewritePage(cururl, 0);
    pgtimer = window.setTimeout(function () {
        notinpaging = true;
    }, PGTIME);
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



    //Clean further
    $('link').remove();
    $('script').remove();
    $('table').filter(function (index) {
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
    console.debug("Trying to push: " + inElem);
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
    console.debug(inElem.content);
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

//TODO: resize的动作响应处理 
