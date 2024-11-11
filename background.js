// service_worker.js

// 监听来自其他部分（如content script）的连接请求
chrome.runtime.onConnect.addListener(function (port) {
    console.log("Connected with port:", port);
    // Initialize the connection action:
    // Actions for 'Content Script Page Port'
    if (port.name == 'contpage') {
        chrome.storage.local.get({ "clist": [], "flist": [], "nlist": [], "tlist": [], "dir": false, "css": null, "js": null }, function (r) {
            port.postMessage({ "type": "cfg", "clist": r.clist, "flist": r.flist, "nlist": r.nlist, "dir": r.dir, "tlist": r.tlist, "css": r.css, "js": r.js });
            // 发送完配置后，理论上就Go了
            // TODO: Progress passing
            port.postMessage({ "type": "go", "progress": null });
        });
        // 监听从这个 port 收到的消息
        //  用来更新书签
        port.onMessage.addListener(function (msg) {
            console.log("Message received in Service Worker:", msg);
            if (msg.type == "updatebk") {
                // To update bookmark in serviced worker
                updateBookmarks(msg);
            }
        });
    }

    // 可选：处理断开连接
    port.onDisconnect.addListener(function () {
        console.log("Port disconnected");
    });
});


function updateBookmarks(msg) {
    let cururl = msg.cururl;
    let rTitle = msg.rTitle;
    let curprog = msg.progress;

    //Judge the page url?
    // If its in same novel then Replace
    function sameNovel(u1, u2) {
        var su1 = u1.split("/");
        var su2 = u2.split("/");
        // avoid last char is /
        if (su1[su1.length - 1] == "") su1.pop();
        if (su2[su2.length - 1] == "") su2.pop();
        //length:
        if (su1.length != su2.length) {
            return false;
        } else {
            var cr = true;
            for (var i = 0; i < su1.length - 1; i++) {
                if (su1[i] != su2[i]) {
                    cr = false;
                    break;
                }
            }
            return cr;
        }
    };


    chrome.storage.local.get({ 'bookmarks': [] }, function (result) {
        bklist = result.bookmarks;
        // Update bookmark
        for (var i = 0; i < bklist.length; i++) {
            if (sameNovel(bklist[i].cururl, cururl)) {
                bklist = bklist.slice(0, i).concat(bklist.slice(i + 1, bklist.length));
                break;
            }
        };
        bklist.push({ rTitle: rTitle, cururl: cururl, curprog: curprog });
        chrome.storage.local.set({ 'bookmarks': bklist }, function () {
            console.info("Bookmarks Updated Done");
        });
    });
};