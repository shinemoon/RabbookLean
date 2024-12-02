var cururl = null;
var css = null;
var port = null;
var reconnected = false;


function connectToBackground() {
    port = chrome.runtime.connect({ name: "popup" });
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
    $('#readpage').click(function () {
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
            curtab = tabs[0];
            console.log(curtab);
            port.postMessage({ 'type': 'Inject', 'content': curtab});
            window.close();
        });

    });

    $('#bookmarktree').click(function () {
        const targetUrl = "details.html";

        chrome.tabs.query({}, function (tabs) {
            // 检查是否已经存在目标页面
            const existingTab = tabs.find(tab => tab.url.includes(targetUrl));

            if (existingTab) {
                // 如果找到已有页面，则切换到该页面
                chrome.tabs.update(existingTab.id, { active: true });
            } else {
                // 否则，创建新页面
                chrome.tabs.create({ url: targetUrl });
            }
            window.close();
        });
    });

});