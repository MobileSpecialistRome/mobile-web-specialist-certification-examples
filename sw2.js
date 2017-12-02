
/*
* Service worker con Cache API
*   + Resource List Management
*   + Versions
*   + Automatic Load of any resource needed
* List todo:
* check version
* load resources
* isonLine
* self.clients.claim(); When a service worker is initially registered, pages won't use it until they next load. The claim() method causes those pages to be controlled immediately.
* Data Management (out of Service Workers ....localforage)
*
*
*
* */


/* Cache Service ... Why a Service ????*/
var Services={ cache: {
        cache: null
        , getCache: function () {
            var me = this;

            return (me.cache) ? new Promise(function (resolve, reject) {
                    resolve(me.cache);
                })
                : caches.open(appConfig.appName + "_cache").then(function (cache) {
                    me.cache = cache;
                    return cache;
                });
        }
        , set: function (request, response) {
            return self.Services.cache.getCache().then(function (cache) {
                if (request.method==="GET") cache.put(request, response.clone());
                return response;
            });
        }

        , get: function (request) {
            return self.Services.cache.getCache().then(function (cache) {
                return cache.match(request).then(function(response) {
                    return response || fetch(request);
                });
            });
        }

        , getKeys: function () {
           return self.Services.cache.getCache().then(function (cache) {
            return cache.keys();
        });
       }

        , del: function (request) { //request.url
           return self.Services.cache.getCache().then(function (cache) {
                cache.delete(request);
            });
        }

        /* Config and initial Setup */
        , conf: function (event) {
            var me = this;
            event.waitUntil(
                self.Services.cache.getCache().then(function (cache) {
                    console.log('[ServiceWorker] Cache Opened');
                    cache.match(new Request(appConfig.appName+"resourcesList")).then(function(response) {
                        if (!response) return null;
                        response.text().then(function(mylist) {
                            mylist=JSON.parse(mylist);
                            appConfig.resourcesList=mylist;
                            return mylist;
                        });
                    });

                })
            );
        }

/* currently not used not tested */
        , clean: function () {
            this.getCache().then(function (cache) {
                cache.keys().then(function (keyList) {
                    return Promise.all(keyList.map(function (key) {
                        if (key !== appConfig.appName + "_cache") {
                            console.log('[ServiceWorker] Removing old cache', key);
                            return caches.delete(key);
                        }
                    }));
                });
            });
        }
    }

};


var appConfig={test:false
    , cacheServ: Services.cache //lforage
    ,appName:"d2"
    ,libsvil:[]
    ,resourcesList:{} // url + ver
    ,resources2Load:[]
    ,Startresources2Load:[]  // to be used yet
    ,nocache: "/api/v1/"     // ***** tobe changed
    ,isonLine: navigator.onLine // check if the network is avaiable
    ,pipef:{}
    ,delay : 1000 // wait to reload staff in cache
    ,ver: 0.1 // version of the application - if changes and network .. reload everything
};

var _f={
    /* Simple Extend  https://plainjs.com/ :) */
    extend :function (obj, src) {
    for (var key in src) {
        if (src.hasOwnProperty(key)) obj[key] = src[key];
    }
    return obj;
     }
    ,pipef: function(code, funct, time) {
        if (appConfig.pipef[code]) return;
        setTimeout(function() {
            delete appConfig.pipef[code]; funct();}, time);
        appConfig.pipef[code]=true;
    }
    , loadCache : function() { var me=this;
        debugger; return;
        if (appConfig.resources2Load.length==0) return null;
        return Promise.all(appConfig.resources2Load.map(function(url,indx) {
            var mime=null;
            if (url.includes(appConfig.nocache)) {
                delete appConfig.resourcesList[url]; return "OK";}
            return fetch(url)
                .then(
                    function(response) {
                        mime=response.headers.get("content-type");
                        // todo image/svg+xml multipart/form-data https://developer.mozilla.org/en-US/docs/Web/HTTP/Basics_of_HTTP/MIME_types
                        Objtype=(mime.includes("json")) ? "json"
                            : (mime.includes("form-data"))  ? "form"
                            : (mime.includes("image"))  ? "blob" : (mime.includes("audio"))  ? "blob" : (mime.includes("video"))  ? "blob"
                            :  "text";
                        //https://developer.mozilla.org/en-US/docs/Web/API/Response
                        return ((response.status !== 200)) ? "ERROR: http status "+response.status+" "+url
                            : (Objtype=="blob") ? response.blob()
                            : (Objtype=="json") ? response.json()
                            : (Objtype=="form") ? response.formData()
                            :  response.text()
                            .then(function(data) {
                              appConfig.resourcesList[url] = {date: new Date(), mime:mime, ver: appConfig.ver};
                              return appConfig.cacheServ.set(url, data); // not the all response, but just the data
                            });
                    })
                .then(function(rc) {
                appConfig.resources2Load.splice(indx, 1);
                console.log(url+" set in cache - rc: "+rc);
                    return 'OK';
                });
        })).then(function(res) {
            console.log("all loaded ...check variables", appConfig.resourcesList);
            /* save updated list*/
            return appConfig.cacheServ.set("resourcesList",appConfig.resourcesList) ;
        })

     }

};





self.addEventListener('install', function(e) {
    console.log('[ServiceWorker] Install');
    /* Open the cache */
    appConfig.cacheServ.conf(e);

});

self.addEventListener('activate', function(e) {
    console.log('[ServiceWorker] Activate');

    /* use immediately */
    return self.clients.claim();
});

self.addEventListener('fetch', function(e) {
    var curl = e.request.url
        , maycache = (!curl.includes(appConfig.nocache) && e.request.method=="GET");
        // is it eligible fot cache????
    console.log('[ServiceWorker] Fetch', e.request.url + (maycache) ? "Ok cache" : "niente cache"); //appConfig.cacheServ

    if (!maycache) {e.respondWith( fetch(e.request) );
                   return; }


    e.respondWith(
        appConfig.cacheServ.get(e.request).then(function (response) {
            /*  Descriptor */
                appConfig.resourcesList[curl] = {date: new Date(), mime: response.headers.get("content-type")||"", ver: appConfig.ver};
                _f.pipef("mylist", function () {
                    appConfig.cacheServ.set(new Request(appConfig.appName+"resourcesList"),new Response(JSON.stringify(appConfig.resourcesList)));
                }, 3000);
                appConfig.cacheServ.set(e.request, response);
            return response;
        }));
});
