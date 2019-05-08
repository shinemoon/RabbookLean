 var cururl = null;
 var rTitle = null;
 var bklist =[];
 var clist = [];
 var tlist = [];
 var nlist = [];
 var flist = [];
 var dir = false;
 var css = null;
 var js = null;
 var indport = null;

var curpage = null;
var curprog = null;

chrome.storage.local.get({'bookmarks':[]}, function (result) {
    bklist = result.bookmarks;
});




$( document ).ready(function(){
    chrome.tabs.onUpdated.addListener(function(tid, cinfo, ctab) {
        //Check if it's current tab 
        if(curpage ==  ctab['url']) {
            curpage = null;
            rTitle = ctab['title'];
            console.log(rTitle);
            function delayStop(func){
                chrome.tabs.get(tid, function(tb){
                    if(tb.status!="complete") {
                        chrome.tabs.executeScript(tb.id, {code:"window.stop();"},function(){});
                        $('#readpage').html("Waiting");
                        setTimeout(function(){
                            delayStop(func);
                        }, 1000);
                    } else {
                        $('#readpage').html("OK");
                        func();
                    }
                });
            };
    
            delayStop(function(){
                chrome.tabs.insertCSS(tid, {file:"main.css"}, function(){});
                if(css==null || css==""){
                    console.log('no css');
                } else {
                    chrome.tabs.insertCSS(tid, {code:css}, function(){});
                }
    
                chrome.tabs.executeScript(tid,  {file:"main.js"}, function(){});
            });
        }
   });
});

chrome.runtime.onConnect.addListener(function(port){
    console.info("Port Connect");
    if(port.name=='contpage'){
        indport = port;
        chrome.storage.local.get({"clist":[],"flist":[], "nlist":[], "tlist":[], "dir":false, "css":null, "js":null}, function (r) {
            clist = r.clist;    
            tlist = r.tlist;    
            nlist = r.nlist;    
            flist = r.flist;    
            dir = r.dir;    
            css = r.css;    
            js = r.js;    
            indport.postMessage({"type":"cfg", "clist":clist, "flist":flist, "nlist":nlist, "dir":dir, "tlist":tlist, "css":css, "js":js});
            indport.postMessage({"type":"go", "progress":curprog});
            curprog = null;
        });
        indport.onMessage.addListener(function(msg){
            console.log(msg);
            if(msg.type=="updatebk"){
                cururl = msg.cururl;
                rTitle = msg.rTitle;
                curprog= msg.progress;
                indport.postMessage({"type":"cfg", "clist":clist, "flist":flist, "dir":dir, "nlist":nlist, "tlist":tlist, "css":css, "js":js});
                updateBookmarks();
            }
        });

/*
        indport.onDisconnect.addListener(function(){
            indport = null;
            // Judge how similar the link will be
            bklist.push({rTitle:rTitle, cururl:cururl});
            chrome.storage.local.set({'bookmarks':bklist}, function () {
                console.info("Bookmarks Updated Done");
            });
            indport.postMessage({"type":"cfg", "clist":clist, "flist":flist});
        });
*/
    }
});


function updateBookmarks(){
    //Judge the page url?
    // If its in same novel then Replace
    function sameNovel(u1,u2){
        var su1 = u1.split("/");
        var su2 = u2.split("/");
        // avoid last char is /
        if(su1[su1.length-1] == "") su1.pop();
        if(su2[su2.length-1] == "") su2.pop();
        //length:
        if(su1.length!=su2.length){
            return false;
        } else {
           var cr = true; 
           for(var i=0; i<su1.length-1; i++){
            if(su1[i] != su2[i]){
                cr = false;
                break;
            }
           }
           return cr;
        }
    };

    //
    for(var i=0;i<bklist.length;i++){
       if(sameNovel(bklist[i].cururl, cururl)){
            bklist = bklist.slice(0,i).concat(bklist.slice(i+1, bklist.length));
            break;
       }
    };

    bklist.push({rTitle:rTitle, cururl:cururl, curprog:curprog});
    chrome.storage.local.set({'bookmarks':bklist}, function () {
        console.info("Bookmarks Updated Done");
    });
};


