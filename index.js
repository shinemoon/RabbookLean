var cururl = null;
var css = null;

$(document).ready(function () {
    $('#readpage').click(function () {
        readPage();
    });
    $('#bookmarktree').click(function () {
        chrome.tabs.create({ url: "details.html" });
    });

});

function readPage() {
    var curtab=null;
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        curtab = tabs[0];
        console.log(curtab);
        const rTitle = curtab.title;

        delayStop(function () {
            // 插入 CSS 文件
            chrome.scripting.insertCSS({
                target: { tabId: curtab.id },
                files: ["main.css"]
            });

            // 如果 css 变量有值，插入 CSS 代码
            if (css == null || css == "") {
                console.log('no css');
            } else {
                chrome.scripting.insertCSS({
                    target: { tabId: curtab.id },
                    css: css
                });
            }

            // 执行 JavaScript 文件
            chrome.scripting.executeScript({
                target: { tabId: curtab.id },
                files: ["main.js"]
            });

            // 关闭窗口
            window.close();
        });
    });

    function delayStop(func) {
        chrome.tabs.get(curtab.id, function (tb) {
            if (tb.status != "complete") {
                chrome.tabs.executeScript(tb.id, { code: "window.stop();" }, function () { });
                $('#readpage').html("Waiting");
                setTimeout(function () {
                    delayStop(func);
                }, 1000);
            } else {
                $('#readpage').html("OK");
                func();
            }
        });
    };
};
