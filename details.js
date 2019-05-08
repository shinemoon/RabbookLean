var cururl = null;

var root = null;

$( document ).ready(function(){
    chrome.runtime.getBackgroundPage(function(pg){
        //Don't do callback for below part, as I am lazy... should be safe enough
        root = pg;

        chrome.storage.local.get({'clist':[],  'flist':[], 'tlist':[], 'nlist':[], 'dir':false, 'css':null, 'js':null}, function (result) {
            root.clist=result.clist;
            root.tlist=result.tlist;
            root.nlist=result.nlist;
            root.flist=result.flist;
            root.css=result.css;
            root.js=result.js;
            root.dir=result.dir;
            $('#text-selector').val(JSON.stringify(root.clist));
            $('#text-filter').val(JSON.stringify(root.flist));
            $('#reader-dir').prop("checked",root.dir);
            $('#title-selector').val(JSON.stringify(root.tlist));
            $('#nav-selector').val(JSON.stringify(root.nlist));
            $('#cssinput').val(root.css);
            $('#jsinput').val(root.js);
        });

        //Refresh the bookmark
        //Insert current bkmarks
    
        //Display the bkmarks
        if(root.rTitle!=null) {
            // 1. to insert now
            //root.bklist.push({rTitle:root.rTitle, cururl:root.cururl});
            // 2. Or,to insert later
            //var cstr = "<li><a href='"+root.cururl+"'>"+root.rTitle+"</a><span class='spanbut pin'>顶</span> <span class='spanbut del'>删</span></li>";
            //$('#bkmarks .bookmarks ul').append(cstr);
            // 3. Or, don't do any thing
        }

        //Show:
    
        for(var i = 0; i< root.bklist.length; i++){
            var cstr = "<li><span class='spanbut del'>删</span><span class='linka' ind='"+i+"' progress='"+root.bklist[i].curprog+"' href='"+root.bklist[i].cururl+"'>"+root.bklist[i].rTitle+"</span></li>";
            $('#bkmarks .bookmarks ul').append(cstr);
        }

        $('.del.spanbut').click(function(){
            var ind = $(this).parent().find('.linka').eq(0).attr('ind');
            var tmplist = root.bklist.slice(0, Number(ind));
            tmplist = tmplist.concat(root.bklist.slice(Number(ind)+1, root.bklist.length));
            root.bklist = tmplist;
            chrome.storage.local.set({'bookmarks':root.bklist}, function () {
                console.info("Bookmarks Updated Done");
                window.location.reload(); 
            });
        });



        $('.linka').click(function(){
            var ind = $(this).attr('ind');
            console.log($(this).attr('ind')); 
//            var tmplist = root.bklist.slice(0, Number(ind));
//            tmplist = tmplist.concat(root.bklist.slice(Number(ind)+1, root.bklist.length));
//            root.bklist = tmplist;
            chrome.storage.local.set({'bookmarks':root.bklist}, function () {
                console.info("Bookmarks Updated Done");
            });
            //Open and injection
            root.curpage = $(this).attr('href');
            root.curprog = $(this).attr('progress');
            window.location = $(this).attr('href'); 
        });
    });

    $('.hidetgt').hide();
    $('.hidetgt.bookmarks').show();
    $('.save').click(function(){
        var sok = true;
        var ttxt = $("#title-selector").val();
        if(ttxt!="") {
            try{
                var cps = JSON.parse(ttxt);    
                if(Object.prototype.toString.call(cps)=== '[object Array]'){
                   root.tlist = cps; 
                }
            } catch(err) {
                sok = false;
            };
        }
        var ntxt = $("#nav-selector").val();
        if(ntxt!="") {
            try{
                var cps = JSON.parse(ntxt);    
                if(Object.prototype.toString.call(cps)=== '[object Array]'){
                   root.nlist = cps; 
                }
            } catch(err) {
                sok = false;
            };
        }

        var ftxt = $("#text-filter").val();
        if(ftxt!="") {
            try{
                var fps = JSON.parse(ftxt);    
                console.log(fps);
                if(Object.prototype.toString.call(fps)=== '[object Array]'){
                   root.flist = fps; 
                }
            } catch(err) {
                sok = false;
            };
        }

        var dir = $("#reader-dir").prop("checked");
        try{
            root.dir= dir; 
        } catch(err) {
            sok = false;
        };

        var ctxt = $("#text-selector").val();
        if(ctxt!="") {
            try{
                var cps = JSON.parse(ctxt);    
                console.log(cps);
                if(Object.prototype.toString.call(cps)=== '[object Array]'){
                   root.clist = cps; 
                }
            } catch(err) {
                sok = false;
            };
        }

        if(sok){
            chrome.storage.local.set({"clist":root.clist,"flist":root.flist, "nlist":root.nlist,"tlist":root.tlist, "dir":root.dir},function(){
                alert("设置完成");
                window.location.reload(); 
            });
        } else {
                alert("配置无效，请检查格式。");
        }
    });

    $('.reset').click(function(){
        root.clist = [];
        root.flist = []; 
        root.dir= false; 
        chrome.storage.local.set({"clist":root.clist,"flist":root.flist, "nlist":root.nlist,"tlist":root.tlist, "dir":root.dir},function(){});
        alert("重置完成");
        window.location.reload(); 
    });

    //Load the config
    chrome.storage.local.get({"clist":[], "flist":[], "nlist":[], "tlist":[], "dir":false },function(r){
        root.clist = r.clist;
        root.tlist = r.tlist;
        root.nlist = r.nlist;
        root.flist = r.flist;
        root.dir= r.dir;
        //Refresh input field
    });


    $('.csssave').click(function(){
        root.css = $('#cssinput').val();
        chrome.storage.local.set({"css":root.css},function(){
            alert("样式保存完毕");
            window.location.reload(); 
        });
    });
    $('.cssclean').click(function(){
        $('#cssinput').val("");
        $('.csssave').click();
    });

    $('.jssave').click(function(){
        root.js= $('#jsinput').val();
        chrome.storage.local.set({"js":root.js},function(){
            alert("脚本保存完毕");
            window.location.reload(); 
        });
    });
    $('.jsclean').click(function(){
        $('#jsinput').val("");
        $('.jssave').click();
    });



    //Some patch
    var jsplc = "当有内容时，将会在处理解析页面内容时执行这段代码。\n\n注意： 强烈不建议普通用户修改增加这部分配置，如果是没有基础的用户，与其学习脚本编写，不如换个普通一点的网站。 \n\n而待处理的页面内容，此时已经被放置在名为targets的全局数组中，目前有意义的部分是：\n\n\ttargets[0]: 标题名; \n\n\ttargets[3][0]: 包含有翻页内容的页面元素（即通过前面的翻页选择所选定的内容）; \n\n\ttargets[4][0]: 包含有正文信息的页面元素（即通过前面的正文选择所选定的内容)。\n\n处理完毕后，需要原样传递回targets参数内,需要更多信息，建议先通过console.log打印targets来理解。";


    $('#jsinput').attr('placeholder', jsplc);

    var cssplc = "留空使用系统内置主题,当有内容时，将会用此内容覆盖。\n\n涉及关键字：#gnContent（正文）， #lrbk_title（标题，根据原始页面的标记可能有h1-h4等各级），#nav （翻页按钮）\n\n 需要更多信息，请通过检视页面来获取。"
    $('#cssinput').attr('placeholder', cssplc);





});


$('.topline').click(function(){
    console.log($(this).attr('toggle_target'));
    if($(this).hasClass('hide')) {
        $('.topline').addClass('hide');
        $(this).removeClass('hide');
        //Hide sub
        $('.hidetgt').hide();
        $("."+$(this).attr('toggle_target')).show();
    } else {
//        $('.topline').removeClass('hide');
 //       $(this).addClass('hide');
  //      $("."+$(this).attr('toggle_target')).hide();
    }
});


