import './jquery.js';

var cururl = null;
var curtab = null;
var css = null;
var port = null;
var reconnected = false;


function connectToBackground() {
    try {
        port = chrome.runtime.connect({ name: "popup" });
        if (chrome.runtime.lastError) {
            console.warn("index connectToBackground: runtime.lastError", chrome.runtime.lastError.message);
            port = null;
        }
    } catch (error) {
        console.warn("index connectToBackground: connect failed", error.message);
        port = null;
    }

    if (!port) {
        console.info("index connectToBackground: port null, retrying in 100ms...");
        setTimeout(connectToBackground, 100);
        return;
    }

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
    // Display version
    const manifest = chrome.runtime.getManifest();
    const manifestVersion = manifest.version;
    $('#version-label').text('v' + manifestVersion);

    $('#readpage').click(function () {
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
            curtab = tabs[0];
            console.log(curtab);
            if (port) {
                port.postMessage({ 'type': 'Inject', 'content': curtab});
            } else {
                // try reconnect and retry shortly
                connectToBackground();
                setTimeout(function () {
                    if (port) port.postMessage({ 'type': 'Inject', 'content': curtab});
                    else console.error('No background port available to post Inject message');
                }, 100);
            }
            window.close();
        });

    });

    $('#bookmarktree').click(function () {
        const targetUrl = "src/details.html";

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