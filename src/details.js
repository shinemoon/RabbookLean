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
var fontfamily = '';
var detectedSystemFontMap = {};
var confirmResolver = null;
var READER_FONT_DEFAULT_VALUE = '__embedded__';
var READER_FONT_CUSTOM_VALUE = '__custom__';

var FONT_CANDIDATES = [
    { label: '默认（内嵌字体）', value: READER_FONT_DEFAULT_VALUE },
    { label: '自定义输入', value: READER_FONT_CUSTOM_VALUE },
    { label: '微软雅黑 (Microsoft YaHei)', value: 'Microsoft YaHei, 微软雅黑', probes: ['Microsoft YaHei', '微软雅黑'] },
    { label: '宋体 (SimSun)', value: 'SimSun, 宋体', probes: ['SimSun', '宋体'] },
    { label: '黑体 (SimHei)', value: 'SimHei, 黑体', probes: ['SimHei', '黑体'] },
    { label: '楷体 (KaiTi)', value: 'KaiTi, 楷体', probes: ['KaiTi', '楷体'] },
    { label: '仿宋 (FangSong)', value: 'FangSong, 仿宋', probes: ['FangSong', '仿宋'] },
    { label: '等线 (DengXian)', value: 'DengXian, 等线', probes: ['DengXian', '等线'] },
    { label: '苹方 (PingFang SC)', value: 'PingFang SC, 苹方', probes: ['PingFang SC', '苹方'] },
    { label: '华文宋体 (STSong)', value: 'STSong, 华文宋体', probes: ['STSong', '华文宋体'] },
    { label: '华文仿宋 (STFangsong)', value: 'STFangsong, 华文仿宋', probes: ['STFangsong', '华文仿宋'] },
    { label: '华文楷体 (STKaiti)', value: 'STKaiti, 华文楷体', probes: ['STKaiti', '华文楷体'] },
    { label: '思源黑体 (Source Han Sans SC)', value: 'Source Han Sans SC, Noto Sans CJK SC', probes: ['Source Han Sans SC', 'Noto Sans CJK SC'] },
    { label: '思源宋体 (Source Han Serif SC)', value: 'Source Han Serif SC, Noto Serif CJK SC', probes: ['Source Han Serif SC', 'Noto Serif CJK SC'] },
    { label: '文泉驿微米黑', value: 'WenQuanYi Micro Hei', probes: ['WenQuanYi Micro Hei'] },
    { label: 'Segoe UI', value: 'Segoe UI', probes: ['Segoe UI'] },
    { label: 'Arial', value: 'Arial', probes: ['Arial'] },
    { label: 'Helvetica Neue', value: 'Helvetica Neue, Helvetica', probes: ['Helvetica Neue', 'Helvetica'] },
    { label: 'Verdana', value: 'Verdana', probes: ['Verdana'] },
    { label: 'Tahoma', value: 'Tahoma', probes: ['Tahoma'] },
    { label: 'Georgia', value: 'Georgia', probes: ['Georgia'] },
    { label: 'Times New Roman', value: 'Times New Roman', probes: ['Times New Roman'] },
    { label: 'Cambria', value: 'Cambria', probes: ['Cambria'] },
    { label: 'Garamond', value: 'Garamond', probes: ['Garamond'] },
    { label: 'Palatino', value: 'Palatino', probes: ['Palatino'] },
    { label: 'Baskerville', value: 'Baskerville', probes: ['Baskerville'] }
];

function isSystemFontAvailable(fontName) {
    var baseFonts = ['monospace', 'sans-serif', 'serif'];
    var testStrings = ['mmmmmmmmmwwwwwiiiiii@@##', '汉字测试閱讀排版字体'];
    var testSize = '72px';
    var canvas = document.createElement('canvas');
    var context = canvas.getContext('2d');
    if (!context) {
        return false;
    }

    var baseline = {};
    for (var i = 0; i < baseFonts.length; i++) {
        baseline[baseFonts[i]] = [];
        for (var t = 0; t < testStrings.length; t++) {
            context.font = testSize + ' ' + baseFonts[i];
            baseline[baseFonts[i]].push(context.measureText(testStrings[t]).width);
        }
    }

    for (var j = 0; j < baseFonts.length; j++) {
        var base = baseFonts[j];
        for (var k = 0; k < testStrings.length; k++) {
            context.font = testSize + ' "' + fontName + '",' + base;
            var width = context.measureText(testStrings[k]).width;
            if (Math.abs(width - baseline[base][k]) > 0.1) {
                return true;
            }
        }
    }
    return false;
}

function detectSystemFonts() {
    var map = {};
    for (var i = 0; i < FONT_CANDIDATES.length; i++) {
        var candidate = FONT_CANDIDATES[i];
        if (candidate.value === READER_FONT_DEFAULT_VALUE) {
            map[candidate.value] = true;
            continue;
        }
        if (candidate.value === READER_FONT_CUSTOM_VALUE) {
            map[candidate.value] = true;
            continue;
        }
        var probes = candidate.probes || [candidate.value.split(',')[0].trim()];
        var available = false;
        for (var p = 0; p < probes.length; p++) {
            if (isSystemFontAvailable(probes[p])) {
                available = true;
                break;
            }
        }
        map[candidate.value] = available;
    }
    return map;
}

function renderFontFamilyOptions(selectedFontFamily) {
    var $select = $('#fontfamily');
    if ($select.length === 0) {
        return;
    }

    var list = FONT_CANDIDATES.slice().sort(function (a, b) {
        var ad = detectedSystemFontMap[a.value] ? 1 : 0;
        var bd = detectedSystemFontMap[b.value] ? 1 : 0;
        return bd - ad;
    });

    var isPreset = list.some(function (it) { return it.value === selectedFontFamily; });
    var isCustomValue = !!selectedFontFamily && !isPreset;
    if (isCustomValue) {
        list.unshift({ label: '自定义: ' + selectedFontFamily, value: READER_FONT_CUSTOM_VALUE, probes: [selectedFontFamily] });
    }

    var options = [];
    for (var i = 0; i < list.length; i++) {
        var item = list[i];
        var available = !!detectedSystemFontMap[item.value];
        var isSpecial = item.value === READER_FONT_DEFAULT_VALUE || item.value === READER_FONT_CUSTOM_VALUE;
        var suffix = (!isSpecial && item.value && !available) ? '（未检测到）' : '';
        var escapedValue = (item.value || '').replace(/"/g, '&quot;');
        var escapedLabel = (item.label || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        options.push('<option value="' + escapedValue + '">' + escapedLabel + suffix + '</option>');
    }
    $select.html(options.join(''));

    if (isCustomValue) {
        $select.val(READER_FONT_CUSTOM_VALUE);
        $('#fontfamily-custom').val(selectedFontFamily);
    } else {
        $select.val(selectedFontFamily || READER_FONT_DEFAULT_VALUE);
        $('#fontfamily-custom').val('');
    }
}

function ensureFeedbackUi() {
    if ($('#ui-toast-host').length === 0) {
        $('body').append('<div id="ui-toast-host" class="ui-toast-host" aria-live="polite" aria-atomic="true"></div>');
    }

    if ($('#ui-dialog-backdrop').length === 0) {
        var dialogHtml = '' +
            '<div id="ui-dialog-backdrop" class="ui-dialog-backdrop" aria-hidden="true">' +
            '  <div class="ui-dialog" role="dialog" aria-modal="true" aria-labelledby="ui-dialog-title">' +
            '    <div class="ui-dialog-title" id="ui-dialog-title">请确认</div>' +
            '    <div class="ui-dialog-message" id="ui-dialog-message"></div>' +
            '    <div class="ui-dialog-actions">' +
            '      <button type="button" id="ui-dialog-cancel" class="btn btn-ghost">取消</button>' +
            '      <button type="button" id="ui-dialog-ok" class="btn btn-primary">确认</button>' +
            '    </div>' +
            '  </div>' +
            '</div>';
        $('body').append(dialogHtml);
    }

    $('#ui-dialog-cancel').off('click.ui').on('click.ui', function () {
        closeConfirmDialog(false);
    });
    $('#ui-dialog-ok').off('click.ui').on('click.ui', function () {
        closeConfirmDialog(true);
    });
    $('#ui-dialog-backdrop').off('click.ui').on('click.ui', function (e) {
        if (e.target.id === 'ui-dialog-backdrop') {
            closeConfirmDialog(false);
        }
    });
}

function showToast(message, type = 'success', duration = 3000) {
    ensureFeedbackUi();
    var $host = $('#ui-toast-host');
    var $toast = $('<div class="ui-toast"></div>');
    $toast.addClass('ui-toast-' + type).text(message);
    $host.append($toast);

    requestAnimationFrame(function () {
        $toast.addClass('show');
    });

    setTimeout(function () {
        $toast.removeClass('show');
        setTimeout(function () {
            $toast.remove();
        }, 200);
    }, duration);
}

function closeConfirmDialog(result) {
    var $backdrop = $('#ui-dialog-backdrop');
    $backdrop.removeClass('show').attr('aria-hidden', 'true');
    if (confirmResolver) {
        var resolver = confirmResolver;
        confirmResolver = null;
        resolver(result);
    }
}

function showConfirmDialog(message, title = '请确认') {
    ensureFeedbackUi();

    if (confirmResolver) {
        closeConfirmDialog(false);
    }

    $('#ui-dialog-title').text(title);
    $('#ui-dialog-message').text(message);
    $('#ui-dialog-backdrop').addClass('show').attr('aria-hidden', 'false');

    return new Promise(function (resolve) {
        confirmResolver = resolve;
        setTimeout(function () {
            $('#ui-dialog-ok').trigger('focus');
        }, 0);
    });
}

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
    detectedSystemFontMap = detectSystemFonts();
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
        'fontsize': 16, 'linespacing': 1.6, 'contentwidth': 960, 'fontfamily': READER_FONT_DEFAULT_VALUE
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
        fontfamily = result.fontfamily || READER_FONT_DEFAULT_VALUE;
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
        renderFontFamilyOptions(fontfamily);
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

    $('.del.spanbut').off('click').on('click', async function () {
        var ok = await showConfirmDialog('确定要删除这条阅读记录吗？', '删除确认');
        if (!ok) {
            return;
        }
        var ind = $(this).parent().find('.linka').eq(0).attr('ind');
        var tmplist = bklist.slice(0, Number(ind));
        tmplist = tmplist.concat(bklist.slice(Number(ind) + 1, bklist.length));
        bklist = tmplist;
        chrome.storage.local.set({ 'bookmarks': bklist }, function () {
            console.info("Bookmarks Updated Done");
            showToast('已删除阅读记录');
            setTimeout(function () {
                window.location.reload();
            }, 280);
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

    $('.save').off('click').on('click', function () {
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
            chrome.storage.local.set({ "clist": clist, "flist": flist, "plist": plist, "nlist": nlist, "tlist": tlist }, function () {
                showToast("设置完成");
            });
        } else {
            showToast("配置无效，请检查格式。", 'danger', 2400);
        }
    });

    $('.reset').off('click').on('click', async function () {
        var ok = await showConfirmDialog('将恢复高级配置到默认值，是否继续？', '重置确认');
        if (!ok) {
            return;
        }
        clist = [];
        flist = [];
        dir = false;
        twocolumn = false;
        chrome.storage.local.set({ "clist": clist, "flist": flist, "plist": plist, "nlist": nlist, "tlist": tlist, "dir": dir, "twocolumn": twocolumn }, function () { });
        showToast("重置完成");
        setTimeout(function () {
            window.location.reload();
        }, 280);
    });

    // Layout save/reset
    $('.layoutsave').off('click').on('click', function () {
        var fontsize = parseInt($('#fontsize').val());
        var linespacing = parseFloat($('#linespacing').val());
        var contentwidth = parseInt($('#contentwidth').val());
        var fontfamilySelectValue = ($('#fontfamily').val() || READER_FONT_DEFAULT_VALUE).trim();
        var fontfamilyCustomValue = ($('#fontfamily-custom').val() || '').trim();
        var fontfamilyInput = fontfamilySelectValue;
        if (fontfamilyCustomValue) {
            fontfamilyInput = fontfamilyCustomValue;
        } else if (fontfamilySelectValue === READER_FONT_CUSTOM_VALUE) {
            fontfamilyInput = READER_FONT_DEFAULT_VALUE;
        }
        var sdir = false; // 横向翻页已禁用，固定为纵向
        var stwocolumn = !!$('#two-column').prop('checked');

        if (!Number.isFinite(fontsize) || !Number.isFinite(linespacing) || !Number.isFinite(contentwidth)) {
            showToast("排版参数无效，请检查后重试。", 'danger', 2400);
            return;
        }

        dir = sdir;
        twocolumn = stwocolumn;
        fontfamily = fontfamilyInput || READER_FONT_DEFAULT_VALUE;
        chrome.storage.local.set({
            "fontsize": fontsize,
            "linespacing": linespacing,
            "contentwidth": contentwidth,
            "fontfamily": fontfamily,
            "dir": dir,
            "twocolumn": twocolumn
        }, function () {
            showToast("排版设置保存完毕");
        });
    });
    $('.layoutreset').off('click').on('click', async function () {
        var ok = await showConfirmDialog('将恢复排版参数到默认值，是否继续？', '重置确认');
        if (!ok) {
            return;
        }
        dir = false;
        twocolumn = true;
        fontfamily = READER_FONT_DEFAULT_VALUE;
        $('#reader-dir').prop('checked', dir);
        $('#two-column').prop('checked', twocolumn);
        $('#fontfamily').val(READER_FONT_DEFAULT_VALUE);
        $('#fontfamily-custom').val('');
        chrome.storage.local.set({ "fontsize": 16, "linespacing": 1.6, "contentwidth": 960, "fontfamily": fontfamily, "dir": dir, "twocolumn": twocolumn }, function () {
            showToast("排版已重置为默认值");
            setTimeout(function () {
                window.location.reload();
            }, 280);
        });
    });

    $('#fontfamily').off('change').on('change', function () {
        if ($(this).val() !== READER_FONT_CUSTOM_VALUE) {
            $('#fontfamily-custom').val('');
        }
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

    $('.csssave').off('click').on('click', function () {
        css = $('#cssinput').val();
        chrome.storage.local.set({ "css": css }, function () {
            showToast("样式保存完毕");
        });
    });
    $('.cssclean').off('click').on('click', async function () {
        var ok = await showConfirmDialog('将清空当前自定义主题，是否继续？', '清空确认');
        if (!ok) {
            return;
        }
        $('#cssinput').val("");
        css = '';
        chrome.storage.local.set({ "css": css }, function () {
            showToast("主题已清空");
        });
    });

    $('.jssave').off('click').on('click', function () {
        rjs = $('#jsinput').val();
        chrome.storage.local.set({ "js": rjs }, function () {
            showToast("脚本保存完毕");
        });
    });
    $('.jsclean').off('click').on('click', async function () {
        var ok = await showConfirmDialog('将清空当前附加脚本，是否继续？', '清空确认');
        if (!ok) {
            return;
        }
        $('#jsinput').val("");
        rjs = '';
        chrome.storage.local.set({ "js": rjs }, function () {
            showToast("脚本已清空");
        });
    });



    //Some patch
    var jsplc = "当有内容时，将会在处理解析页面内容时执行这段代码。\n\n注意： 强烈不建议普通用户修改增加这部分配置，如果是没有基础的用户，与其学习脚本编写，不如换个普通一点的网站。\n\n待处理的数据放在 loadedContent（对象）中，当前结构如下：\n\n\tloadedContent.title: 标题文本；\n\n\tloadedContent.prevHref: 上一页链接（字符串，可能为空）；\n\n\tloadedContent.nextHref: 下一页链接（字符串，可能为空）；\n\n\tloadedContent.contentHtml: 正文 HTML 字符串。\n\n你可以直接修改 loadedContent 里的字段，也可以 return 一个新的 loadedContent 对象。\n\n处理完毕后，必须把结果以 loadedContent 结构返回；需要更多信息，建议先通过 console.log(loadedContent) 打印理解。";


    $('#jsinput').attr('placeholder', jsplc);

    var cssplc = "留空使用系统内置主题,当有内容时，将会用此内容覆盖。\n\n涉及关键字：#gnContent（正文）， #lrbk_title（标题，根据原始页面的标记可能有h1-h4等各级），#nav （翻页按钮）\n\n 需要更多信息，请通过检视页面来获取。"
    $('#cssinput').attr('placeholder', cssplc);

}; // End of displayPage
