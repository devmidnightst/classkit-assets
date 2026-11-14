// Virtual origin. The bucket holds three tiny files; this makes the page's own
// origin answer for every other path by fetching it from the CDN copy.
// Runs first inside both service workers. self.__VO is set by sw/x.js or sw/s.js.
(function () {
    "use strict";
    if (self.__voOn) return;
    self.__voOn = true;
    var C = self.__VO;
    var ORIGIN = self.location.origin;
    var FILES = new Set(["/404.html","/about.html","/account.html","/ai.html","/api.html","/app/adblock.js","/app/main.mjs","/app/modules/core/c.js","/app/modules/core/core.js","/app/modules/core/h.js","/app/modules/core/s.js","/app/modules/io/index.js","/app/modules/io/index.mjs","/app/modules/net/index.js","/app/modules/net/index.mjs","/app/modules/net/worker.js","/app/proxy-escape.js","/app/proxy-path.js","/app/runtime/engine.mjs","/app/settings.js","/app/worker.js","/application.html","/apps.html","/assets/index-0MGrXxcl.js","/assets/index-1tfGxnI3.js","/assets/index-2mlHuxf4.js","/assets/index-2pPRoVCm.js","/assets/index-58BrKSFO.js","/assets/index-7xpLHtIN.js","/assets/index-CkT9PXVs.js","/assets/index-Dwht3jpt.js","/assets/index-FdDrs8vC.js","/assets/index-HrRa8ikD.js","/assets/index-IDAH98Nl.js","/assets/index-JpxRdJg4.js","/assets/index-JxFX9h7R.js","/assets/index-Laxqs4FG.js","/assets/index-M9xhFQSx.js","/assets/index-NYElqyFL.js","/assets/index-OxnOad4v.js","/assets/index-PFI8TpzN.js","/assets/index-PWOh7lLM.js","/assets/index-Pdn3VY4J.js","/assets/index-RA4MGx1Z.js","/assets/index-SltgEEux.js","/assets/index-V1vHeeTx.js","/assets/index-YG6Uex7R.js","/assets/index-YP5eBfhw.js","/assets/index-ZeR34VXQ.js","/assets/index-axj6PLQD.js","/assets/index-bF9NBxgo.js","/assets/index-bLs2kKHH.js","/assets/index-bOjgtExo.js","/assets/index-buODF4E2.js","/assets/index-dJRdNNVp.js","/assets/index-efoxdo7l.js","/assets/index-faqxV6Dk.js","/assets/index-h1uhN1HB.js","/assets/index-hpgysCEF.js","/assets/index-jESfYM2D.js","/assets/index-jK7Dk1B8.js","/assets/index-kt3GRQ6P.js","/assets/index-lPGs8OUB.js","/assets/index-mAdLfzl1.js","/assets/index-moqzxfaj.js","/assets/index-mxyhzlNa.js","/assets/index-nFcv3TQe.js","/assets/index-rT9025OZ.js","/assets/index-rqmnhM1X.js","/assets/index-txuxlDcJ.js","/assets/index-vaWPQsLy.js","/assets/index-wcm5Kxlz.js","/assets/index-xMZgIrGx.js","/assets/index-xOIFfhq6.js","/assets/index-xTU1xiKQ.js","/assets/index-xtCBhulS.js","/assets/index-zeNrbLjF.js","/box-term.html","/chat.html","/code.html","/console.html","/decoy.html","/dmca.html","/edu/core/controller-external.mjs","/edu/core/controller.api.js","/edu/core/controller.inject.js","/edu/core/controller.sw.js","/edu/res/rt.js","/edu/res/rt.mjs","/edu/res/rt.wasm","/edu/res/scramjet-external.mjs","/edu/res/scramjet.js","/edu/res/scramjet.mjs","/edu/res/scramjet.wasm","/edu/res/scramjet_bundled.js","/edu/res/scramjet_bundled.mjs","/emu/bzImage","/emu/libv86.js","/emu/seabios.bin","/emu/v86-LICENSE.txt","/emu/v86.wasm","/emu/vgabios.bin","/films.html","/games.html","/index.html","/landing.html","/learn.html","/legal.html","/legal/dmca.md","/legal/privacy.md","/linkcheck.html","/mirror/boot.js","/mirror/session.js","/music.html","/onboarding.html","/privacy.html","/sapphire/sapphire.bundle.mjs","/screenshare.html","/settings.html","/src/css/account.css","/src/css/admin.css","/src/css/ai-page.css","/src/css/ai.css","/src/css/atmosphere.css","/src/css/cai.css","/src/css/chat.css","/src/css/code.css","/src/css/dock.css","/src/css/error.css","/src/css/flux-lines.css","/src/css/frame.css","/src/css/games.css","/src/css/global.css","/src/css/home.css","/src/css/island.css","/src/css/legal.css","/src/css/loader.css","/src/css/music.css","/src/css/nocturne-glide.css","/src/css/nocturne-select.css","/src/css/notice.css","/src/css/onboarding.css","/src/css/screenshare.css","/src/css/settings-page.css","/src/css/settings.css","/src/css/sidebar.css","/src/css/support.css","/src/css/thought-line.css","/src/css/toolbar.css","/src/css/voice.css","/src/css/weather.css","/src/img/mai-avatar.png","/src/img/miku-plush.png","/src/img/miku-plush.svg","/src/img/teto-plush.png","/src/img/teto-plush.svg","/src/js/admin-analytics.js","/src/js/ao2588.js","/src/js/az4417.js","/src/js/be9460.js","/src/js/branched-menu.js","/src/js/call-chip.js","/src/js/computer-terminal.js","/src/js/cw1386.js","/src/js/df5162.js","/src/js/dm5108.js","/src/js/dq9182.js","/src/js/ec5296.js","/src/js/email-nudge.js","/src/js/fo7942.js","/src/js/gd4170.js","/src/js/gs9147.js","/src/js/hb6185.js","/src/js/hq3852.js","/src/js/hv3806.js","/src/js/ie7331.js","/src/js/jd7108.js","/src/js/kf2093.js","/src/js/li2749.js","/src/js/lr2815.js","/src/js/mo3318.js","/src/js/mp4275.js","/src/js/nk1873.js","/src/js/nx8924.js","/src/js/ph4529.js","/src/js/pu3927.js","/src/js/qt3674.js","/src/js/rb8350.js","/src/js/rw8034.js","/src/js/status-mark.js","/src/js/sv3641.js","/src/js/tb7316.js","/src/js/tj6402.js","/src/js/tn5521.js","/src/js/ug5237.js","/src/js/vm-agent.js","/src/js/vy4960.js","/src/js/wz6714.js","/src/js/xk6073.js","/src/js/xr4817.js","/src/js/yc1962.js","/src/js/zb8215.js","/src/lib/an4426.js","/support.html","/terms.html","/tools.html","/vms.html","/voice.html","/youtube.html"]);
    var PAGES = new Set(["404.html","about.html","account.html","ai.html","api.html","application.html","apps.html","box-term.html","chat.html","code.html","console.html","decoy.html","dmca.html","films.html","games.html","index.html","landing.html","learn.html","legal.html","linkcheck.html","music.html","onboarding.html","privacy.html","screenshare.html","settings.html","support.html","terms.html","tools.html","vms.html","voice.html","youtube.html"]);
    var TABS = new Set(["games.html","apps.html","chat.html","ai.html","films.html","music.html","tools.html","code.html","youtube.html","settings.html","account.html","privacy.html","terms.html","dmca.html","legal.html","linkcheck.html","vms.html","voice.html","support.html","about.html","api.html","admin.html","console.html","box-term.html"]);
    var SLUGS = {"games":"games.html","g":"games.html","apps":"apps.html","chat":"chat.html","vms":"vms.html","vm":"vms.html","ai":"ai.html","movies":"films.html","films":"films.html","music":"music.html","tools":"tools.html","code":"code.html","editor":"code.html","youtube":"youtube.html","yt":"youtube.html","api":"api.html","settings":"settings.html","account":"account.html","privacy":"privacy.html","terms":"terms.html","dmca":"dmca.html","legal":"legal.html","linkcheck":"linkcheck.html","links":"linkcheck.html","admin":"admin.html","god":"admin.html","cp":"admin.html","panel":"admin.html","voice":"voice.html","support":"support.html","about":"about.html","console":"console.html","terminal":"box-term.html","box-term":"box-term.html"};
    // What the home page needs to paint and start. The loader page has the
    // worker fetch these before it swaps the page in.
    var CORE = ["/index.html","/app/main.mjs","/app/runtime/engine.mjs","/assets/index-dJRdNNVp.js","/assets/index-lPGs8OUB.js","/src/js/lr2815.js","/src/js/qt3674.js","/src/js/wz6714.js","/src/js/ie7331.js","/src/js/be9460.js","/src/js/kf2093.js","/src/js/rw8034.js","/src/js/hq3852.js","/src/js/pu3927.js","/src/js/gd4170.js","/src/js/email-nudge.js","/src/css/global.css","/src/css/atmosphere.css","/src/css/home.css","/src/css/toolbar.css","/src/css/sidebar.css","/src/css/loader.css","/src/css/nocturne-select.css","/src/css/frame.css","/src/css/error.css","/src/css/dock.css","/src/css/settings.css","/src/css/notice.css","/src/css/weather.css","/src/js/xr4817.js","/src/lib/an4426.js","/src/js/mo3318.js","/src/js/tb7316.js","/src/js/df5162.js","/src/css/nocturne-glide.css","/src/css/island.css","/src/js/ph4529.js"];
    var CACHE = "vo-" + C.v;
    var JS = "application/javascript; charset=utf-8";
    var TYPES = {
        js: JS, mjs: JS, cjs: JS, css: "text/css; charset=utf-8", html: "text/html; charset=utf-8",
        json: "application/json; charset=utf-8", wasm: "application/wasm", svg: "image/svg+xml",
        png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp",
        avif: "image/avif", ico: "image/x-icon", md: "text/markdown; charset=utf-8",
        txt: "text/plain; charset=utf-8", xml: "application/xml; charset=utf-8",
        woff: "font/woff", woff2: "font/woff2", ttf: "font/ttf", otf: "font/otf",
        mp3: "audio/mpeg", ogg: "audio/ogg", wav: "audio/wav", mp4: "video/mp4", webm: "video/webm"
    };

    function typeOf(path) {
        var m = /\.([a-z0-9]+)$/i.exec(path);
        return (m && TYPES[m[1].toLowerCase()]) || "application/octet-stream";
    }

    function staticPath(url) {
        var p = url.pathname;
        if (FILES.has(p)) return p;
        try { p = decodeURIComponent(p); } catch (e) { return null; }
        return FILES.has(p) ? p : null;
    }

    function isProxyPath(p) {
        if (p.indexOf("/c/") === 0 || p.indexOf("/view/") === 0) return true;
        try { return !!(self.__nocIsProxyPath && self.__nocIsProxyPath(p)); } catch (e) { return false; }
    }

    // Same rules the origin server applies to a document request.
    function pagePath(url, dest) {
        var p = url.pathname;
        if (p === "/" || p === "/index.html" || p.indexOf("/search/") === 0 || p.indexOf("/go/") === 0) return "/index.html";
        if (/^\/s\/[^\/]+\/\d+$/.test(p)) return dest === "document" ? "/index.html" : "/code.html";
        if (p.indexOf(".") === -1) {
            var slug = p.replace(/^\/+/, "").replace(/\/+$/, "").toLowerCase();
            if (!Object.prototype.hasOwnProperty.call(SLUGS, slug)) return null;
            p = "/" + SLUGS[slug];
        }
        if (!/\.html$/i.test(p)) return null;
        var base = p.slice(1).toLowerCase();
        if (!PAGES.has(base)) return null;
        if (dest === "document" && TABS.has(base)) return "/index.html";
        return "/" + base;
    }

    var nativeFetch = self.fetch.bind(self);

    async function pull(path) {
        var last = null;
        for (var i = 0; i < C.cdn.length; i++) {
            try {
                var r = await nativeFetch(C.cdn[i] + path, { mode: "cors", credentials: "omit" });
                if (r.ok) return r;
                last = new Error("status " + r.status);
            } catch (e) { last = e; }
        }
        throw last || new Error("cdn");
    }

    async function fromCdn(path) {
        var key = ORIGIN + "/__vo" + path;
        var cache = null;
        try {
            cache = await caches.open(CACHE);
            var hit = await cache.match(key);
            if (hit) return hit;
        } catch (e) { cache = null; }
        var r;
        try { r = await pull(path); }
        catch (e) {
            return new Response("Could not load " + path, { status: 504, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
        }
        var out = new Response(r.body, { status: 200, headers: { "content-type": typeOf(path), "cache-control": "no-cache" } });
        if (cache) {
            try { cache.put(key, out.clone()).catch(function () {}); } catch (e) {}
        }
        return out;
    }

    function fromProxiedPage(req) {
        if (!req.referrer) return false;
        try {
            var ref = new URL(req.referrer);
            return ref.origin === ORIGIN && isProxyPath(ref.pathname);
        } catch (e) { return false; }
    }

    function plan(e) {
        var req = e.request;
        if (req.method !== "GET" && req.method !== "HEAD") return null;
        var url;
        try { url = new URL(req.url); } catch (err) { return null; }
        if (url.origin !== ORIGIN) return null;
        var p = url.pathname;
        if (isProxyPath(p)) return null;
        if (p === "/service-worker.js" || p === "/service-worker-x.js") return null;
        var sp = staticPath(url);
        var html = sp && /\.html$/i.test(sp);
        if (sp && !html) return function () { return fromCdn(sp); };
        // Everything below is an app route. A proxied site that asks for the
        // same path belongs to the engine's own escape handling, not to us.
        if (fromProxiedPage(req)) return null;
        if (req.mode === "navigate") {
            var page = pagePath(url, req.destination || "document");
            if (page) return function () { return fromCdn(page); };
        } else if (html) {
            return function () { return fromCdn(sp); };
        }
        if (p.indexOf("/api/") === 0) {
            var target = C.api + p + url.search;
            if (req.mode === "navigate") return function () { return Response.redirect(target, 302); };
            return function () {
                return nativeFetch(target, { mode: req.mode === "no-cors" ? "no-cors" : "cors", credentials: "omit", headers: req.mode === "no-cors" ? undefined : req.headers });
            };
        }
        return null;
    }

    // Once this layer answers a request, the engine's own fetch listeners must
    // not see it: they would call respondWith a second time and throw.
    var add = self.addEventListener.bind(self);
    add("fetch", function (e) {
        var run = null;
        try { run = plan(e); } catch (err) { run = null; }
        if (!run) return;
        e.__vo = true;
        e.respondWith(Promise.resolve().then(run));
    });
    self.addEventListener = function (type, fn, opts) {
        if (type !== "fetch" || typeof fn !== "function") return add(type, fn, opts);
        return add("fetch", function (e) { if (e.__vo) return; return fn.call(self, e); }, opts);
    };

    // Requests made from inside the worker never reach its own fetch event, so
    // send those to the CDN here.
    self.fetch = function (input, init) {
        try {
            var u = new URL(typeof input === "string" ? input : input.url, ORIGIN);
            if (u.origin === ORIGIN) {
                var sp = staticPath(u);
                if (sp) return fromCdn(sp);
            }
        } catch (e) {}
        return nativeFetch(input, init);
    };
    var nativeImport = self.importScripts.bind(self);
    self.importScripts = function () {
        var list = Array.prototype.map.call(arguments, function (src) {
            try {
                var u = new URL(String(src), ORIGIN);
                if (u.origin === ORIGIN) {
                    var sp = staticPath(u);
                    if (sp) return C.cdn[0] + sp;
                }
            } catch (e) {}
            return src;
        });
        try { return nativeImport.apply(self, list); }
        catch (err) {
            if (C.cdn.length < 2) throw err;
            return nativeImport.apply(self, list.map(function (s) {
                return String(s).indexOf(C.cdn[0]) === 0 ? C.cdn[1] + String(s).slice(C.cdn[0].length) : s;
            }));
        }
    };

    add("activate", function (e) {
        e.waitUntil(caches.keys().then(function (keys) {
            return Promise.all(keys.map(function (k) {
                return k.indexOf("vo-") === 0 && k !== CACHE ? caches.delete(k) : null;
            }));
        }).catch(function () {}));
    });
    add("message", function (e) {
        if (!e.data || e.data.type !== "vo-warm" || !e.ports || !e.ports[0]) return;
        var port = e.ports[0], total = CORE.length, done = 0, next = 0;
        function say(extra) {
            var msg = { done: done, total: total };
            if (extra) msg.ready = true;
            try { port.postMessage(msg); } catch (err) {}
        }
        function lane() {
            if (next >= total) return Promise.resolve();
            var path = CORE[next++];
            // Reading the body is what makes the copy land in the cache.
            return fromCdn(path).then(function (r) { return r.arrayBuffer(); }).catch(function () {}).then(function () {
                done++; say(false);
                return lane();
            });
        }
        say(false);
        var lanes = [];
        for (var i = 0; i < 6; i++) lanes.push(lane());
        var all = Promise.all(lanes).then(function () { say(true); });
        if (e.waitUntil) e.waitUntil(all);
    });
    add("message", function (e) {
        if (e.data && e.data.type === "vo-version" && e.ports && e.ports[0]) e.ports[0].postMessage({ v: C.v });
    });
})();
