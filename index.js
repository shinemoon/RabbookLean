var cururl = null;
var root = null;

chrome.runtime.getBackgroundPage(function(pg){
    //Don't do callback for below part, as I am lazy... should be safe enough
    root = pg;
});

$( document ).ready(function(){
    $('#readpage').click(function(){
        readPage();
    });
    $('#bookmarktree').click(function(){
        chrome.tabs.create({url:"details.html"});
    });

});

function readPage(){
    var curtab = null;
    chrome.tabs.query({active:true},function(tab){
        curtab = tab[0];
        console.log(curtab);
        root.rTitle = curtab.title;
        delayStop(function(){
            chrome.tabs.insertCSS(tab[0].id, {file:"main.css"}, function(){});
            if(root.css==null || root.css==""){
                console.log('no css');
            } else {
                chrome.tabs.insertCSS(tab[0].id, {code:root.css}, function(){});
            }

            chrome.tabs.executeScript(tab[0].id,  {file:"main.js"}, function(){});

            window.close();
        });
    });

    function delayStop(func){
        chrome.tabs.get(curtab.id, function(tb){
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
};
