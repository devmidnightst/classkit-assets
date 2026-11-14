// Attach the saved login to every same-origin API call. The cookie is httpOnly
// and is not sent from a framed page, so chat, AI, admin, music, films, code,
// VMs, and the rest would otherwise treat a signed-in user as logged out.
(function () {
    "use strict";
    if (window.__nocSessionShim) return;
    window.__nocSessionShim = true;
    function tellAdblock() {
        try {
            var on = localStorage.getItem("nocturne-adblock") !== "0";
            var sw = navigator.serviceWorker;
            if (!sw) return;
            if (sw.controller) sw.controller.postMessage({ type: "nocturne-adblock", on: on });
        } catch (e) {}
    }
    tellAdblock();
    try {
        navigator.serviceWorker && navigator.serviceWorker.addEventListener("controllerchange", tellAdblock);
    } catch (e) {}
    var KEY = "noc-session";
    var SKIP = ["/api/sync/", "/api/v1/sync/", "/api/v2/connect/", "/api/realtime/", "/api/notifications/", "/api/feed/", "/api/channel/", "/api/stream/"];

    function tok() {
        try {
            var t = localStorage.getItem(KEY) || "";
            return /^[a-f0-9]{64}$/i.test(t) ? t : "";
        } catch (e) { return ""; }
    }
    function save(t) {
        if (t && /^[a-f0-9]{64}$/i.test(t)) { try { localStorage.setItem(KEY, t); } catch (e) {} }
    }
    function apiUrl(raw) {
        try {
            var u = new URL(raw, location.href);
            if (u.host !== location.host) return null;
            var p = u.protocol;
            if (p !== "https:" && p !== "http:" && p !== "wss:" && p !== "ws:") return null;
            if (u.pathname.indexOf("/api/") !== 0 && u.pathname.indexOf("/vm/") !== 0) return null;
            for (var i = 0; i < SKIP.length; i++) if (u.pathname.indexOf(SKIP[i]) === 0) return null;
            return u;
        } catch (e) { return null; }
    }
    function stampAsset(value) {
        if (typeof value !== "string" || value.indexOf("/api/") === -1 && value.indexOf("/vm/") === -1) return value;
        var t = tok();
        if (!t) return value;
        function one(raw) {
            var u = apiUrl(raw);
            if (!u || u.searchParams.has("_noc_session") || u.searchParams.has("sid")) return raw;
            u.searchParams.set("_noc_session", t);
            return /^https?:|^wss?:/i.test(raw) ? u.href : (u.pathname + u.search + u.hash);
        }
        if (/url\(/i.test(value)) {
            return value.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, function (_m, q, inner) {
                var n = one(inner.trim());
                var quote = q || '"';
                return "url(" + quote + n + quote + ")";
            });
        }
        return one(value);
    }
    function withToken(url, absolute) {
        var u = apiUrl(url);
        var t = tok();
        if (!u || !t || u.searchParams.has("_noc_session") || u.searchParams.has("sid")) return url;
        u.searchParams.set("_noc_session", t);
        return absolute ? u.href : (u.pathname + u.search + u.hash);
    }

    // The top document already sends the httpOnly cookie. Wrapping fetch and
    // XHR there is only needed inside framed app pages, which do not.
    var framed = false;
    try { framed = window.top !== window; } catch (e) { framed = true; }

    if (framed && window.fetch) {
        var origFetch = window.fetch.bind(window);
        window.fetch = function (input, init) {
            var raw = typeof input === "string" ? input : (input && input.url) || "";
            var u = apiUrl(raw);
            var next = init;
            var t = u ? tok() : "";
            if (u && t) {
                next = Object.assign({}, init || {});
                var h = new Headers((init && init.headers) || (typeof input !== "string" && input && input.headers) || {});
                if (!h.has("X-Noc-Session")) h.set("X-Noc-Session", t);
                next.headers = h;
            }
            return origFetch(input, next).then(function (res) {
                if (!u) return res;
                if (u.pathname === "/api/auth/login" || u.pathname === "/api/auth/signup") {
                    res.clone().json().then(function (b) { if (b && b.sessionToken) save(b.sessionToken); }).catch(function () {});
                } else if (u.pathname === "/api/auth/logout") {
                    try { localStorage.removeItem(KEY); } catch (e) {}
                }
                return res;
            });
        };
    }

    if (framed && window.XMLHttpRequest) {
        var open = XMLHttpRequest.prototype.open;
        var send = XMLHttpRequest.prototype.send;
        var setHeader = XMLHttpRequest.prototype.setRequestHeader;
        XMLHttpRequest.prototype.open = function (method, url) {
            var args = Array.prototype.slice.call(arguments);
            var u = apiUrl(String(url || ""));
            this.__nocApi = !!u;
            if (u && tok() && !u.searchParams.has("_noc_session")) {
                u.searchParams.set("_noc_session", tok());
                args[1] = u.pathname + u.search + u.hash;
            }
            return open.apply(this, args);
        };
        XMLHttpRequest.prototype.setRequestHeader = function (name) {
            if (String(name).toLowerCase() === "x-noc-session") this.__nocSet = true;
            return setHeader.apply(this, arguments);
        };
        XMLHttpRequest.prototype.send = function () {
            if (this.__nocApi && !this.__nocSet && tok()) setHeader.call(this, "X-Noc-Session", tok());
            return send.apply(this, arguments);
        };
    }

    if (framed && window.EventSource) {
        var ES = window.EventSource;
        function WrappedES(url, opts) {
            return new ES(withToken(url), opts);
        }
        WrappedES.prototype = ES.prototype;
        WrappedES.CONNECTING = ES.CONNECTING;
        WrappedES.OPEN = ES.OPEN;
        WrappedES.CLOSED = ES.CLOSED;
        window.EventSource = WrappedES;
    }

    if (framed && window.WebSocket) {
        var WS = window.WebSocket;
        function WrappedWS(url, protocols) {
            var next = url;
            try {
                var u = new URL(String(url), location.href);
                if ((u.protocol === "ws:" || u.protocol === "wss:") && u.host === location.host) next = withToken(u.href, true);
            } catch (e) {}
            return protocols === undefined ? new WS(next) : new WS(next, protocols);
        }
        WrappedWS.prototype = WS.prototype;
        WrappedWS.CONNECTING = WS.CONNECTING;
        WrappedWS.OPEN = WS.OPEN;
        WrappedWS.CLOSING = WS.CLOSING;
        WrappedWS.CLOSED = WS.CLOSED;
        window.WebSocket = WrappedWS;
    }

    if (framed) try {
        var imgSrc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "src");
        if (imgSrc && imgSrc.set) {
            Object.defineProperty(HTMLImageElement.prototype, "src", {
                configurable: true,
                enumerable: imgSrc.enumerable,
                get: imgSrc.get,
                set: function (v) { imgSrc.set.call(this, stampAsset(v)); }
            });
        }
    } catch (e) {}
    if (framed) try {
        var setProp = CSSStyleDeclaration.prototype.setProperty;
        CSSStyleDeclaration.prototype.setProperty = function (name, value, priority) {
            if (typeof value === "string" && (name === "background" || name === "background-image" || name === "--pc-bg")) value = stampAsset(value);
            return setProp.call(this, name, value, priority);
        };
        ["background", "backgroundImage"].forEach(function (prop) {
            var d = Object.getOwnPropertyDescriptor(CSSStyleDeclaration.prototype, prop);
            if (!d || !d.set) return;
            Object.defineProperty(CSSStyleDeclaration.prototype, prop, {
                configurable: true,
                enumerable: d.enumerable,
                get: d.get,
                set: function (v) { d.set.call(this, stampAsset(v)); }
            });
        });
    } catch (e) {}
})();

;
window.__NOC_API_BASE="https://ao.soccer";
;
// Mirror boot.
//
// Loaded on the canonical origin it does nothing: cookies, same-origin fetches,
// and the service-worker proxy stay exactly as they are.
//
// Loaded on a dedicated mirror origin (a host you control, not a shared CDN) it
// sends /api calls to the canonical HTTPS origin, then to the configured
// fallbacks, and attaches the existing X-Noc-Session header. It does not read
// or write that token on a shared CDN origin. It does not open the WISP
// sockets; those are handshake-monitored by the origin (GET /api/transport)
// because a browser cannot speak HTTPS over a raw WISP TCP tunnel, and those
// sockets are not an HTTP reverse proxy.
//
// Static mirror pages opt in by including this file and leaving
// window.__NOC_HOST_ROLE unset:
//   <script src="https://olive-fun.com/mirror/boot.js"></script>
(function (root) {
    "use strict";

    var SHARED = [".jsdelivr.net", ".statically.io", ".githubusercontent.com"];
    var PRIMARY = {
        "olive-fun.com": 1, "www.olive-fun.com": 1,
        "ao.soccer": 1, "www.ao.soccer": 1,
        "localhost": 1, "127.0.0.1": 1
    };
    var APP_ORIGIN = "https://olive-fun.com";
    var FALLBACKS = ["https://ao.soccer"];
    var SESSION_HEADER = "X-Noc-Session";
    var STORAGE_KEY = "noc-api-base";

    function hostnameOf(value) {
        try { return new URL(value).hostname.toLowerCase(); } catch (e) { return ""; }
    }

    function isSharedHost(hostname) {
        var host = String(hostname || "").toLowerCase().replace(/\.+$/, "");
        if (!host) return true;
        for (var i = 0; i < SHARED.length; i++) {
            var suffix = SHARED[i].slice(1);
            if (host === suffix || host.endsWith(SHARED[i])) return true;
        }
        return false;
    }

    function originOf(value) {
        try {
            var url = new URL(value);
            if (url.protocol !== "https:" && url.protocol !== "http:") return "";
            if (isSharedHost(url.hostname)) return "";
            return url.origin;
        } catch (e) { return ""; }
    }

    function createMirrorController(opts) {
        opts = opts || {};
        var pageOrigin = originOf(opts.pageOrigin || "");
        var pageHost = hostnameOf(pageOrigin);
        var shared = !pageOrigin || isSharedHost(pageHost) || opts.protocol === "blob:";
        var role = opts.role === "origin" ? "origin" : "static";
        var mode = (role === "origin" || PRIMARY[pageHost]) && !shared ? "origin" : (shared ? "blocked" : "static");
        var storage = opts.storage || null;
        var selected = "";
        var bases = [];

        function retired(value) {
            return hostnameOf(value).replace(/^www\./, "") === "nocturne.lol";
        }
        function pushBase(value) {
            var origin = originOf(value);
            if (!origin || retired(origin) || bases.indexOf(origin) !== -1) return;
            bases.push(origin);
        }
        pushBase(opts.apiBase || APP_ORIGIN);
        var extras = opts.fallbacks || FALLBACKS;
        for (var i = 0; i < extras.length; i++) pushBase(extras[i]);
        if (opts.extraFallbacks) {
            for (var j = 0; j < opts.extraFallbacks.length; j++) pushBase(opts.extraFallbacks[j]);
        }

        function readCached() {
            if (!storage) return "";
            try {
                var cached = originOf(storage.getItem(STORAGE_KEY) || "");
                return cached && !retired(cached) ? cached : "";
            } catch (e) { return ""; }
        }
        function writeCached(value) {
            if (!storage) return;
            try { storage.setItem(STORAGE_KEY, value); } catch (e) {}
        }

        function current() {
            return mode === "static" ? (selected || readCached() || bases[0] || "") : pageOrigin;
        }

        function owns(url) {
            if (pageHost && url.host === pageHost) return true;
            for (var i = 0; i < bases.length; i++) {
                if (hostnameOf(bases[i]) === url.hostname) return true;
            }
            return false;
        }

        function isApiUrl(value) {
            try {
                var url = new URL(value, pageOrigin || APP_ORIGIN);
                return (url.protocol === "https:" || url.protocol === "http:") && url.pathname.indexOf("/api/") === 0 && owns(url);
            } catch (e) { return false; }
        }

        function rewrite(value) {
            var raw = typeof value === "string" ? value : (value && value.url) || "";
            if (!raw) return { url: raw, api: false, block: false };
            var absolute;
            try { absolute = new URL(raw, pageOrigin || APP_ORIGIN); }
            catch (e) { return { url: raw, api: false, block: false }; }
            var api = (absolute.protocol === "https:" || absolute.protocol === "http:" || absolute.protocol === "ws:" || absolute.protocol === "wss:")
                && absolute.pathname.indexOf("/api/") === 0 && owns(absolute);
            if (!api) return { url: raw, api: false, block: false };
            if (mode === "blocked") return { url: raw, api: true, block: true };
            if (mode !== "static") return { url: raw, api: true, block: false };
            var base = current();
            if (!base) return { url: absolute.href, api: true, block: false };
            var target = new URL(base);
            var next = new URL(absolute.href);
            if (next.protocol === "ws:") next.protocol = target.protocol === "https:" ? "wss:" : "ws:";
            else if (next.protocol === "wss:") next.protocol = target.protocol === "https:" ? "wss:" : "ws:";
            else next.protocol = target.protocol;
            next.host = target.host;
            return { url: next.href, api: true, block: false };
        }

        function sessionToken() {
            if (mode === "blocked") return "";
            if (typeof opts.sessionToken === "string") return opts.sessionToken;
            return "";
        }

        function noteSuccess(base) {
            var origin = originOf(base);
            if (!origin) return;
            selected = origin;
            writeCached(origin);
        }

        function noteFailure(base) {
            var origin = originOf(base);
            if (selected === origin) selected = "";
            var cached = readCached();
            if (cached && cached === origin && storage) {
                try { storage.removeItem ? storage.removeItem(STORAGE_KEY) : storage.setItem(STORAGE_KEY, ""); } catch (e) {}
            }
        }

        function orderedBases() {
            var list = [];
            var cached = current();
            if (cached) list.push(cached);
            for (var i = 0; i < bases.length; i++) if (list.indexOf(bases[i]) === -1) list.push(bases[i]);
            return list;
        }

        return {
            mode: function () { return mode; },
            bases: function () { return bases.slice(); },
            current: current,
            isApiUrl: isApiUrl,
            rewrite: rewrite,
            sessionToken: sessionToken,
            noteSuccess: noteSuccess,
            noteFailure: noteFailure,
            orderedBases: orderedBases,
        };
    }

    root.NocturneMirror = { createMirrorController: createMirrorController, isSharedHost: isSharedHost };

    if (!root.document || !root.window) return;
    if (root.__nocMirrorInstalled) return;
    root.__nocMirrorInstalled = true;

    try {
        var pageProtocol = root.location.protocol === "blob:" ? "blob:" : root.location.protocol;
        var storage = null;
        try { storage = root.sessionStorage; } catch (e) { storage = null; }
        var controller = createMirrorController({
            role: root.__NOC_HOST_ROLE,
            pageOrigin: root.location.origin,
            protocol: pageProtocol,
            apiBase: root.__NOC_API_BASE || APP_ORIGIN,
            fallbacks: FALLBACKS.concat(Array.isArray(root.__NOC_API_FALLBACKS) ? root.__NOC_API_FALLBACKS : []),
            storage: storage,
        });
        if (controller.mode() !== "blocked") {
            controller.sessionToken = function () {
                try { return root.localStorage.getItem("noc-session") || ""; } catch (e) { return ""; }
            };
        }
        var origFetch = root.fetch ? root.fetch.bind(root) : null;
        if (controller.mode() === "blocked" && origFetch) {
            root.fetch = function (input, init) {
                var raw = typeof input === "string" ? input : (input && input.url) || "";
                if (controller.isApiUrl(raw)) return Promise.reject(new Error("cdn origin cannot host the app"));
                return origFetch(input, init);
            };
            return;
        }
        if (controller.mode() !== "static" || !origFetch) return;

        var pending = selectBase(controller, origFetch);

        root.fetch = function (input, init) {
            var raw = typeof input === "string" ? input : (input && input.url) || "";
            if (!controller.isApiUrl(raw)) return origFetch(input, init);
            return pending.then(function () { return send(controller, origFetch, input, init); });
        };

        if (root.EventSource) {
            var OrigES = root.EventSource;
            var WrappedES = function (url, options) {
                var next = controller.rewrite(url);
                if (next.block) throw new Error("cdn origin cannot host the app");
                return new OrigES(next.url, options);
            };
            WrappedES.prototype = OrigES.prototype;
            root.EventSource = WrappedES;
        }

        if (root.WebSocket) {
            var OrigWS = root.WebSocket;
            var WrappedWS = function (url, protocols) {
                var next = controller.rewrite(String(url));
                if (next.block) throw new Error("cdn origin cannot host the app");
                if (!next.api) return protocols === undefined ? new OrigWS(url) : new OrigWS(url, protocols);
                return protocols === undefined ? new OrigWS(next.url) : new OrigWS(next.url, protocols);
            };
            WrappedWS.prototype = OrigWS.prototype;
            WrappedWS.CONNECTING = OrigWS.CONNECTING;
            WrappedWS.OPEN = OrigWS.OPEN;
            WrappedWS.CLOSING = OrigWS.CLOSING;
            WrappedWS.CLOSED = OrigWS.CLOSED;
            root.WebSocket = WrappedWS;
        }

        if (root.XMLHttpRequest) {
            var xhrOpen = root.XMLHttpRequest.prototype.open;
            var xhrSend = root.XMLHttpRequest.prototype.send;
            var xhrSet = root.XMLHttpRequest.prototype.setRequestHeader;
            root.XMLHttpRequest.prototype.setRequestHeader = function (name) {
                if (String(name).toLowerCase() === "x-noc-session") this.__nocSessionSet = true;
                return xhrSet.apply(this, arguments);
            };
            root.XMLHttpRequest.prototype.open = function (method, url) {
                var args = Array.prototype.slice.call(arguments);
                var next = controller.rewrite(String(url));
                this.__nocBlock = next.block;
                this.__nocApi = next.api && !next.block;
                if (next.api && !next.block) args[1] = next.url;
                return xhrOpen.apply(this, args);
            };
            root.XMLHttpRequest.prototype.send = function () {
                if (this.__nocBlock) throw new Error("cdn origin cannot host the app");
                if (this.__nocApi) {
                    var tok = controller.sessionToken();
                    if (tok && !this.__nocSessionSet) xhrSet.call(this, SESSION_HEADER, tok);
                }
                return xhrSend.apply(this, arguments);
            };
        }
    } catch (e) {}

    function withSession(init, token, crossOrigin) {
        var next = {};
        if (init) {
            for (var key in init) if (Object.prototype.hasOwnProperty.call(init, key)) next[key] = init[key];
        }
        var headers = new root.Headers(next.headers || {});
        if (token && !headers.has(SESSION_HEADER)) headers.set(SESSION_HEADER, token);
        next.headers = headers;
        if (crossOrigin && (next.credentials === "include" || next.credentials === "same-origin" || !next.credentials)) {
            next.credentials = "omit";
        }
        return next;
    }

    function send(controller, origFetch, input, init) {
        var raw = typeof input === "string" ? input : (input && input.url) || "";
        var plan = controller.rewrite(raw);
        if (plan.block) return Promise.reject(new Error("cdn origin cannot host the app"));
        if (!plan.api) return origFetch(input, init);
        if (typeof input !== "string") {
            var token = controller.sessionToken();
            var headers = new root.Headers(input.headers || undefined);
            if (init && init.headers) new root.Headers(init.headers).forEach(function (value, key) { headers.set(key, value); });
            if (token && !headers.has(SESSION_HEADER)) headers.set(SESSION_HEADER, token);
            var method = (init && init.method) || input.method || "GET";
            var body = init && Object.prototype.hasOwnProperty.call(init, "body") ? init.body : input.body;
            if (method === "GET" || method === "HEAD") body = undefined;
            return origFetch(plan.url, {
                method: method,
                headers: headers,
                body: body,
                credentials: "omit",
                cache: (init && init.cache) || input.cache,
                signal: (init && init.signal) || input.signal,
            }).then(function (response) {
                try { controller.noteSuccess(new root.URL(plan.url).origin); } catch (e) {}
                return response;
            });
        }
        var bases = controller.orderedBases();
        var body = init && init.body;
        var retryable = typeof input === "string" && (body == null || typeof body === "string" || (root.URLSearchParams && body instanceof root.URLSearchParams));
        function attempt(index) {
            var rewritten = controller.rewrite(raw);
            var target = new root.URL(rewritten.url);
            var cross = target.origin !== root.location.origin;
            var options = withSession(init, controller.sessionToken(), cross);
            return origFetch(target.href, options).then(function (response) {
                controller.noteSuccess(target.origin);
                return response;
            }, function (error) {
                controller.noteFailure(target.origin);
                if (!retryable || index + 1 >= bases.length) throw error;
                if (error && error.name === "AbortError") throw error;
                var failed = bases[index];
                controller.noteFailure(failed);
                var rest = bases.slice(index + 1);
                if (!rest.length) throw error;
                controller.noteSuccess(rest[0]);
                return attempt(index + 1);
            });
        }
        return attempt(0);
    }

    function selectBase(controller, fetchImpl) {
        var list = controller.orderedBases();
        var index = 0;
        function ping(base) {
            var ctrl = new root.AbortController();
            var timer = root.setTimeout(function () { ctrl.abort(); }, 2500);
            return fetchImpl(base + "/api/transport", { credentials: "omit", cache: "no-store", signal: ctrl.signal })
                .then(function (response) {
                    root.clearTimeout(timer);
                    if (!response.ok) throw new Error("status " + response.status);
                    return response.json();
                }, function (error) {
                    root.clearTimeout(timer);
                    throw error;
                })
                .then(function (body) {
                    if (!body || body.ok !== true || body.role !== "origin") throw new Error("not-origin");
                    controller.noteSuccess(base);
                });
        }
        function next() {
            if (index >= list.length) {
                if (list[0]) controller.noteSuccess(list[0]);
                return Promise.resolve();
            }
            var base = list[index++];
            return ping(base).catch(function () {
                controller.noteFailure(base);
                return next();
            });
        }
        return next();
    }
})(typeof globalThis !== "undefined" ? globalThis : this);

;
(function(){try{if(window.__nocFilt)return;window.__nocFilt=1;var BAD=new RegExp(atob("YmFyZVstXyBdP211eHxiYXJlbXV4fHNjcmFtamV0fHVsdHJhdmlvbGV0fFxiZXBveHlcYnxcYndpc3BcYnxVVlNlcnZpY2VXb3JrZXJ8QmFyZU11eHxVbHRyYXZpb2xldHxCYXJlQ2xpZW50fEJhcmVUcmFuc3BvcnR8XCRzY3JhbWpldHx1dlwuYnVuZGxlfHV2XC5zd3x1dlwuaGFuZGxlcnx1dlwuY2xpZW50fHV2LXdvcmtlcnx1di1jb25maWd8cGFnZS1pbml0fHBhZ2UtY29uZmlnfG5vY3R1cm5lOmluaXR8Y29udHJvbGxlcmNoYW5nZXx3aXNwWy0gXT9wYXRofHRpdGFuaXVtbmV0d29ya3xtZXJjdXJ5d29ya3Nob3B8c2V0IHRyYW5zcG9ydCB0b3xlcnJvciB3aGlsZSBwcm9jZXNzaW5nfG5vIGJhcmUgY2xpZW50c3x3b3JrZXJQYXRofE1lc3NhZ2VQb3J0"),"i");var O={};["log","warn","error","info","debug","trace"].forEach(function(k){var o=console[k];if(typeof o!=="function")return;O[k]=o;console[k]=function(){try{for(var i=0;i<arguments.length;i++){var v=arguments[i];var s=(typeof v==="string")?v:(v&&v.message)?v.message:"";if(s&&BAD.test(s))return;}}catch(e){}return o.apply(console,arguments);};});var B="\n _   _    ___     ____   _____   _   _   ____    _   _   _____      _        ___    _ \n| \\ | |  / _ \\   / ___| |_   _| | | | | |  _ \\  | \\ | | | ____|    | |      / _ \\  | |\n|  \\| | | | | | | |       | |   | | | | | |_) | |  \\| | |  _|      | |     | | | | | |\n| |\\  | | |_| | | |___    | |   | |_| | |  _ <  | |\\  | | |___  _  | |___  | |_| | |___\n|_| \\_|  \\___/   \\____|   |_|    \\___/  |_| \\_\\ |_| \\_| |_____|(_) |_____|  \\___/  |_____|\n\n              "+location.host+"\n";window.__nocBanner=function(){try{(O.log||function(){}).call(console,"%c"+B,"color:#b8b0da;font-family:ui-monospace,monospace;font-size:11px;line-height:1.2");}catch(e){}};if(window.self===window.top&&!window.__nocB1){window.__nocB1=1;window.__nocBanner();var L=O.log||function(){};try{var _vm=(new URLSearchParams(location.search).get("mode")||localStorage.getItem("view-mode")||"std").toLowerCase();L.call(console,"mode="+(_vm==="exp"?"6b":"6a"));}catch(e){}try{fetch("/api/auth/me",{credentials:"same-origin",cache:"no-store"}).then(function(r){return r.json();}).then(function(m){if(m&&m.authenticated&&m.user)L.call(console,"user logged in ("+m.user.id+")");}).catch(function(){});}catch(e){}}}catch(e){}})();
;
(function(){try{var noEmbed=false;try{noEmbed=location.search.indexOf("nocab=1")!==-1;}catch(e){}if(window.self!==window.top&&!noEmbed)document.documentElement.classList.add("noc-embedded");}catch(e){}})();
;
document.write("<style>html.noc-embedded a[href=\"/\"],html.noc-embedded a[href=\"/index.html\"],html.noc-embedded a.brand,html.noc-embedded #tabStrip,html.noc-embedded #toolbar,html.noc-embedded #dock,html.noc-embedded .discord-chip,html.noc-embedded #navRail{display:none!important}</style><style>#nocAdsNote{position:fixed;left:calc(var(--sb-w,0px) + 16px);bottom:52px;z-index:2147483600;box-sizing:border-box;width:min(304px,calc(100vw - var(--sb-w,0px) - 32px));padding:12px 14px 15px;overflow:hidden;background:#12101a;border:1px solid rgba(184,176,218,.3);border-radius:0;color:#eae6ff;box-shadow:0 14px 40px rgba(0,0,0,.5);font:500 13px/1.45 ui-sans-serif,system-ui,-apple-system,\"Segoe UI\",sans-serif;text-align:left;transform:translateY(18px);opacity:0;transition:transform .5s cubic-bezier(.16,1,.3,1),opacity .35s ease}#nocAdsNote.on{transform:none;opacity:1}#nocAdsNote.out{transform:translateY(12px);opacity:0;pointer-events:none;transition-duration:.35s,.28s}#nocAdsNote .top{display:flex;align-items:center;gap:9px}#nocAdsNote .price{flex:none;padding:3px 7px;border:1px solid rgba(184,176,218,.5);background:rgba(184,176,218,.1);font-weight:700;font-size:12px;line-height:1.2;color:#eae6ff}#nocAdsNote h2{flex:1;min-width:0;margin:0;font-size:13px;line-height:1.3;font-weight:600;letter-spacing:0;color:#eae6ff}#nocAdsNote .x{flex:none;width:22px;height:22px;margin:-2px -4px 0 0;padding:0!important;border:0!important;border-radius:0!important;background:transparent!important;color:#b7b3c7!important;font:400 17px/1 inherit;cursor:pointer}#nocAdsNote .x:hover{color:#eae6ff!important}#nocAdsNote .lead{margin:7px 0 0;color:#b7b3c7;font-size:12px}#nocAdsNote .actions{display:flex;gap:8px;margin-top:10px}#nocAdsNote .actions a,#nocAdsNote .actions button{flex:1;display:flex;align-items:center;justify-content:center;box-sizing:border-box;min-height:30px;padding:8px 10px!important;border-radius:0!important;text-decoration:none!important;font:600 12px/1 inherit;cursor:pointer}#nocAdsNote .actions a,#nocAdsNote .actions .ok{background:#b8b0da!important;color:#14121c!important;border:0!important}#nocAdsNote .actions a:hover,#nocAdsNote .actions .ok:hover{background:#cdc4ff!important}#nocAdsNote .ghost{background:transparent!important;color:#eae6ff!important;border:1px solid rgba(184,176,218,.45)!important}#nocAdsNote input{width:100%;box-sizing:border-box;margin-top:9px;border-radius:0;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.03);color:#eae6ff;padding:8px 10px;font:inherit}#nocAdsNote .msg{margin-top:7px;font-size:12px;color:#b7b3c7}#nocAdsNote .msg:empty{display:none}#nocAdsNote .bar{position:absolute;left:0;bottom:0;width:100%;height:2px;background:#b8b0da;opacity:.7;transform-origin:left center;transition:transform .25s linear}@media (prefers-reduced-motion:reduce){#nocAdsNote,#nocAdsNote .bar{transition:none}}html.reduce-motion #nocAdsNote,html.reduce-motion #nocAdsNote .bar{transition:none}</style>");
(function(){try{window.addEventListener("message",function(ev){var d=ev.data||{};if(d.type!=="noc-upgrade"||typeof d.username!=="string")return;var hd={"Accept":"application/json","Content-Type":"application/json"};try{var t=localStorage.getItem("noc-session")||"";if(t)hd["X-Noc-Session"]=t;}catch(e){}fetch(location.origin+"/api/upgrade/request",{method:"POST",credentials:"include",cache:"no-store",headers:hd,body:JSON.stringify({username:d.username})}).then(function(r){return r.json().then(function(j){return {ok:r.ok,d:j};});}).then(function(res){if(ev.source)ev.source.postMessage({type:"noc-upgrade-result",ok:res.ok,status:res.d&&res.d.status,error:res.d&&res.d.error},ev.origin);}).catch(function(){if(ev.source)ev.source.postMessage({type:"noc-upgrade-result",ok:false,error:"Could not submit."},ev.origin);});});if(/(?:^|; )noc_ads_ack=1(?:;|$)/.test(document.cookie))return;try{if(window.parent!==window&&window.parent.location.hostname===location.hostname)return;}catch(e){}try{if(window.parent!==window){void window.parent.location.href;}}catch(e){if(location.search.indexOf("nocab=1")!==-1)return;}try{if(sessionStorage.getItem("noc-ads-note")==="off")return;}catch(e){}function paint(){if(!document.body||document.getElementById("nocAdsNote"))return;var LIFE=30000,left=LIFE,held=false,review=false,timer=0,last=0;var box=document.createElement("div");box.id="nocAdsNote";box.setAttribute("role","status");box.setAttribute("aria-labelledby","nocAdsTitle");var view=document.createElement("div");view.className="view";box.appendChild(view);var bar=document.createElement("div");bar.className="bar";box.appendChild(bar);function close(keep){if(box.classList.contains("out"))return;clearInterval(timer);if(keep){var sec=location.protocol==="https:"?"; Secure":"";document.cookie="noc_ads_ack=1; Path=/; Max-Age=31536000; SameSite=Lax"+sec;}else{try{sessionStorage.setItem("noc-ads-note","off");}catch(e){}}box.classList.remove("on");box.classList.add("out");setTimeout(function(){if(box.parentNode)box.remove();},400);}function tick(){var now=Date.now();var dt=now-last;last=now;if(held||review||document.hidden)return;left-=dt;bar.style.transform="scaleX("+Math.max(0,left/LIFE)+")";if(left<=0)close(false);}function headers(){var h={"Accept":"application/json"};try{var t=localStorage.getItem("noc-session")||"";if(t)h["X-Noc-Session"]=t;}catch(e){}return h;}function clear(){while(view.firstChild)view.removeChild(view.firstChild);}function closer(){var x=document.createElement("button");x.type="button";x.className="x";x.setAttribute("aria-label","Dismiss");x.textContent="\u00d7";x.addEventListener("click",function(){close(true);});return x;}function showMain(){review=false;clear();var top=document.createElement("div");top.className="top";var price=document.createElement("span");price.className="price";price.textContent="$5";var h=document.createElement("h2");h.id="nocAdsTitle";h.textContent="Nocturne runs on ads";top.appendChild(price);top.appendChild(h);top.appendChild(closer());var lead=document.createElement("p");lead.className="lead";lead.textContent="A click can open an ad behind this tab. Five dollars, once: ad-free, +250k tokens, Premium chat role and image sending.";var actions=document.createElement("div");actions.className="actions";var a=document.createElement("a");a.href="https://ko-fi.com/midnightsweat";a.target="_blank";a.rel="noopener noreferrer";a.textContent="Donate on Ko-fi";var donated=document.createElement("button");donated.type="button";donated.className="ghost";donated.textContent="I donated";donated.addEventListener("click",showReview);actions.appendChild(a);actions.appendChild(donated);view.appendChild(top);view.appendChild(lead);view.appendChild(actions);}function showReview(){review=true;clear();var top=document.createElement("div");top.className="top";var h=document.createElement("h2");h.id="nocAdsTitle";h.textContent="Submit your username";top.appendChild(h);top.appendChild(closer());var lead=document.createElement("p");lead.className="lead";lead.textContent="After review the upgrade is turned on for that account.";var input=document.createElement("input");input.type="text";input.maxLength="32";input.placeholder="Username";input.autocomplete="username";input.spellcheck=false;var msg=document.createElement("div");msg.className="msg";var actions=document.createElement("div");actions.className="actions";var back=document.createElement("button");back.type="button";back.className="ghost";back.textContent="Back";back.addEventListener("click",showMain);var send=document.createElement("button");send.type="button";send.className="ok";send.textContent="Submit";send.addEventListener("click",function(){var name=(input.value||"").trim();if(name.length<3){msg.textContent="Enter the account username.";return;}send.disabled=true;msg.textContent="Sending\u2026";var hd=headers();hd["Content-Type"]="application/json";fetch(location.origin+"/api/upgrade/request",{method:"POST",credentials:"include",cache:"no-store",headers:hd,body:JSON.stringify({username:name})}).then(function(r){return r.json().then(function(d){return {ok:r.ok,d:d};});}).then(function(res){send.disabled=false;if(!res.ok){msg.textContent=(res.d&&res.d.error)||"Could not submit.";return;}if(res.d.status==="active"||res.d.status==="approved"){msg.textContent="That account already has the upgrade.";return;}msg.textContent="Submitted. It is in review.";input.disabled=true;send.disabled=true;}).catch(function(){send.disabled=false;msg.textContent="Could not submit.";});});actions.appendChild(back);actions.appendChild(send);view.appendChild(top);view.appendChild(lead);view.appendChild(input);view.appendChild(msg);view.appendChild(actions);var hd=headers();fetch(location.origin+"/api/auth/me",{credentials:"include",cache:"no-store",headers:hd}).then(function(r){return r.json();}).then(function(d){if(d&&d.user&&d.user.username){input.value=d.user.username;}}).catch(function(){});input.focus();}showMain();box.addEventListener("pointerenter",function(){held=true;});box.addEventListener("pointerleave",function(){held=false;});box.addEventListener("focusin",function(){held=true;});box.addEventListener("focusout",function(){held=false;});box.addEventListener("keydown",function(ev){if(ev.key==="Escape"){ev.preventDefault();close(true);}});document.body.appendChild(box);requestAnimationFrame(function(){requestAnimationFrame(function(){box.classList.add("on");last=Date.now();timer=setInterval(tick,250);});});}function go(){var h={"Accept":"application/json"};try{var t=localStorage.getItem("noc-session")||"";if(t)h["X-Noc-Session"]=t;}catch(e){}fetch(location.origin+"/api/ads/config",{credentials:"omit",cache:"no-store",headers:h}).then(function(r){return r.ok?r.json():{show:true};}).then(function(j){if(j&&j.show===false){try{sessionStorage.setItem("noc-ads-note","off");}catch(e){}return;}paint();}).catch(function(){paint();});}if(document.body)go();else document.addEventListener("DOMContentLoaded",go);}catch(e){}})();
;
(function(){var w=window,s={ps:History.prototype.pushState,rs:History.prototype.replaceState};w.__lcHs=s;var h=history,f=function(){try{Object.defineProperty(h,'pushState',{value:s.ps.bind(h),configurable:!0,writable:!0}),Object.defineProperty(h,'replaceState',{value:s.rs.bind(h),configurable:!0,writable:!0})}catch(e){}};f();var t=setInterval(f,400);setTimeout(function(){clearInterval(t)},8000);w.addEventListener('pageshow',f);w.addEventListener('focus',f)})();
;

        // This page must always be the real, top-level destination - never nested
        // inside the SPA's internal tab iframe. If something ever links here without
        // breaking out (target="_top"), force it to the real address bar ourselves.
        try {
            if (window.self !== window.top) window.top.location.href = "/api";
        } catch (e) {}
    
;
document.write("<link href=\"https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap\" rel=\"stylesheet\"><style>\n\n        :root{\n            --bg-0:#060509;--bg-1:#060509;--bg-2:#0d0c11;--bg-3:#131218;--bg-4:#1a1920;\n            --border-1:rgba(255,255,255,.06);--border-2:rgba(255,255,255,.1);--border-3:rgba(255,255,255,.16);\n            --fg-0:#ededf0;--fg-1:#b9b8c4;--fg-2:#8f8e9b;--fg-3:#6a6977;\n            --violet-3:#cfc6f3;--violet-5:#a898e8;--violet-6:#9585dc;\n            --cyan-3:#cfc6f3;--cyan-5:#a898e8;\n            --accent:var(--violet-5);--accent-hover:#b9acee;--accent-active:var(--violet-6);--accent-soft:rgba(168,152,232,.14);\n            --accent-2:var(--cyan-5);--accent-2-hover:#b9acee;--accent-2-soft:rgba(168,152,232,.14);\n            --success:#82d0a4;--success-soft:rgba(130,208,164,.14);\n            --warning:#e6c976;--warning-soft:rgba(230,201,118,.14);\n            --danger:#e07c7c;--danger-soft:rgba(224,124,124,.14);\n            --surface-app:var(--bg-1);--surface-raised:var(--bg-2);--surface-card:var(--bg-3);--surface-overlay:var(--bg-4);\n            --text-primary:var(--fg-0);--text-secondary:var(--fg-1);--text-muted:var(--fg-2);--text-disabled:var(--fg-3);\n            --text-on-accent:#0a090d;\n            --border-subtle:var(--border-1);--border-default:var(--border-2);--border-strong:var(--border-3);\n            --link:var(--accent-2);--link-hover:var(--accent-2-hover);\n            --font-display:'Inter',ui-sans-serif,system-ui,sans-serif;\n            --font-body:'Inter',ui-sans-serif,system-ui,sans-serif;\n            --font-mono:'JetBrains Mono',ui-monospace,'SF Mono',monospace;\n            --text-xs:12px;--text-sm:13px;--text-base:15px;--text-md:17px;--text-lg:20px;--text-xl:22px;--text-2xl:22px;\n            --space-1:4px;--space-2:8px;--space-3:12px;--space-4:16px;--space-5:20px;--space-6:24px;--space-8:32px;\n            --radius-sm:6px;--radius-md:10px;--radius-lg:10px;--radius-pill:999px;\n            --shadow-sm:0 1px 2px rgba(0,0,0,.4);\n            --shadow-md:0 4px 16px rgba(0,0,0,.45),0 1px 2px rgba(0,0,0,.5);\n            --shadow-lg:0 12px 40px rgba(0,0,0,.55),0 2px 8px rgba(0,0,0,.4);\n            --shadow-glow-violet:0 0 0 1px rgba(168,152,232,.4),0 0 24px rgba(168,152,232,.25);\n            --ease-standard:cubic-bezier(.4,0,.2,1);\n            --duration-fast:120ms;--duration-normal:200ms;--duration-slow:340ms;\n        }\n        *{box-sizing:border-box}\n        html,body{margin:0;padding:0;height:100%}\n        #bgCanvas{position:fixed;inset:0;z-index:0;pointer-events:none}\n        body{background:var(--surface-app);color:var(--text-primary);font-family:var(--font-body);font-size:var(--text-base);line-height:1.55;-webkit-font-smoothing:antialiased}\n        a{color:var(--link);text-decoration:none}\n        a:hover{color:var(--link-hover);text-decoration:underline}\n        code,pre,kbd{font-family:var(--font-mono)}\n        ::selection{background:var(--accent-soft);color:var(--text-primary)}\n        button{font-family:inherit}\n        details summary{cursor:pointer}\n\n        .gw-intro{position:fixed;inset:0;background:var(--bg-0);z-index:999;display:flex;align-items:center;justify-content:center;pointer-events:none}\n        .gw-intro canvas{position:absolute;inset:0;width:100%;height:100%}\n\n        .gw{display:flex;min-height:100vh}\n        .gw-side{width:216px;flex-shrink:0;border-right:1px solid var(--border-subtle);padding:20px 12px;display:flex;flex-direction:column;gap:2px;position:sticky;top:0;height:100vh;overflow-y:auto}\n        .gw-brand{display:flex;align-items:baseline;gap:6px;padding:4px 10px 18px;font-family:var(--font-display)}\n        .gw-brand b{font-size:16px;font-weight:700;color:var(--text-primary)}\n        .gw-brand span{font-size:12px;font-weight:500;color:var(--text-muted)}\n        .gw-nav{display:flex;flex-direction:column;gap:2px}\n        .gw-nav-btn{display:flex;align-items:center;gap:10px;text-align:left;background:transparent;border:none;border-radius: var(--r-sm, 6px);color:var(--text-muted);font-weight:600;font-size:var(--text-sm);padding:9px 10px;cursor:pointer;transition:background var(--duration-fast) var(--ease-standard),color var(--duration-fast) var(--ease-standard)}\n        .gw-nav-btn svg{flex-shrink:0;opacity:.85}\n        .gw-nav-btn:hover{background:var(--bg-2);color:var(--text-primary)}\n        .gw-nav-btn.active{background:var(--bg-3);color:var(--text-primary)}\n        .gw-side-foot{margin-top:auto;padding-top:16px;border-top:1px solid var(--border-subtle);display:flex;flex-direction:column;gap:8px}\n        .gw-back{display:flex;align-items:center;gap:6px;color:var(--text-muted);font-size:var(--text-sm);font-weight:500;padding:0 10px}\n        .gw-back:hover{color:var(--text-primary);text-decoration:none}\n        .gw-version{color:var(--text-disabled);font-size:11px;padding:0 10px;font-family:var(--font-mono)}\n\n        .gw-main{flex:1;min-width:0;overflow-y:auto;height:100vh}\n        .gw-pane{display:none;max-width:920px;margin:0 auto;padding:40px 32px 96px}\n        .gw-pane.active{display:block}\n        .gw-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:24px}\n        .gw-head h1{font-family:var(--font-display);font-weight:700;font-size:var(--text-2xl);letter-spacing:-.02em;margin:0 0 6px;color:var(--text-primary)}\n        .gw-head p{color:var(--text-muted);font-size:var(--text-base);margin:0;max-width:56ch}\n\n        .card{background:var(--surface-card);border:1px solid var(--border-default);border-radius: var(--r-md, 10px);padding:20px;box-shadow:var(--shadow-sm)}\n        .card.flush{padding:0}\n        .btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;font-weight:600;font-size:var(--text-sm);border-radius: var(--r-sm, 6px);padding:8px 15px;cursor:pointer;border:1px solid transparent;transition:background var(--duration-normal) var(--ease-standard),transform var(--duration-fast) var(--ease-standard),opacity var(--duration-normal) var(--ease-standard)}\n        .btn:active{transform:scale(.97)}\n        .btn:disabled{opacity:.5;cursor:not-allowed;transform:none}\n        .btn-primary{background:var(--accent);color:var(--text-on-accent)}\n        .btn-primary:hover:not(:disabled){background:var(--accent-hover)}\n        .btn-secondary{background:var(--surface-card);color:var(--text-primary);border-color:var(--border-default)}\n        .btn-secondary:hover:not(:disabled){background:var(--bg-4)}\n        .btn-ghost{background:transparent;color:var(--text-primary)}\n        .btn-ghost:hover:not(:disabled){background:var(--bg-3)}\n        .btn-danger{background:var(--danger-soft);color:var(--danger);border-color:rgba(248,113,113,.4)}\n        .btn-danger:hover:not(:disabled){background:rgba(248,113,113,.22)}\n        .btn-sm{padding:5px 11px;font-size:12.5px;border-radius: var(--r-sm, 6px)}\n        .spinner{width:12px;height:12px;border-radius:50%;border:2px solid currentColor;border-top-color:transparent;animation:ndsSpin .7s linear infinite;display:inline-block;flex-shrink:0}\n        @keyframes ndsSpin{to{transform:rotate(360deg)}}\n\n        .badge{display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:600;padding:3px 9px;border-radius: var(--r-sm, 6px);line-height:1.4;white-space:nowrap}\n        .badge .dot{width:6px;height:6px;border-radius:50%}\n        .badge-info{background:var(--accent-2-soft);color:var(--cyan-3)}.badge-info .dot{background:var(--accent-2)}\n        .badge-accent{background:var(--accent-soft);color:var(--violet-3)}.badge-accent .dot{background:var(--accent)}\n        .badge-success{background:var(--success-soft);color:var(--success)}.badge-success .dot{background:var(--success)}\n        .badge-warning{background:var(--warning-soft);color:var(--warning)}.badge-warning .dot{background:var(--warning)}\n        .badge-danger{background:var(--danger-soft);color:var(--danger)}.badge-danger .dot{background:var(--danger)}\n        .badge-neutral{background:var(--bg-4);color:var(--text-secondary)}.badge-neutral .dot{background:var(--fg-2)}\n\n        .tag{display:inline-flex;align-items:center;gap:6px;background:var(--surface-card);border:1px solid var(--border-default);color:var(--text-secondary);font-family:var(--font-mono);font-size:12px;padding:4px 10px;border-radius: var(--r-sm, 6px);cursor:pointer;transition:border-color var(--duration-fast) var(--ease-standard),color var(--duration-fast) var(--ease-standard)}\n        .tag:hover{border-color:var(--accent);color:var(--text-primary)}\n        .tag .px{color:var(--text-disabled);font-size:10.5px;margin-left:2px}\n\n        .field{display:flex;flex-direction:column;gap:6px}\n        .field label{font-size:var(--text-sm);color:var(--text-secondary);font-weight:500}\n        .field .noc-select{display:flex;width:100%}\n        .field input,.field select,.field .noc-select-trigger{background:var(--surface-raised);color:var(--text-primary);border:1px solid var(--border-default);border-radius: var(--r-sm, 6px);padding:9px 12px;font-size:var(--text-base);font-family:var(--font-body);outline:none;width:100%;transition:border-color var(--duration-fast) var(--ease-standard),box-shadow var(--duration-fast) var(--ease-standard)}\n        .field input:focus,.field select:focus,.field .noc-select-trigger:focus-visible,.field .noc-select.open .noc-select-trigger{border-color:var(--accent);box-shadow:var(--shadow-glow-violet)}\n        .field input.mono{font-family:var(--font-mono);font-size:13px}\n\n        code.inline{background:rgba(168,152,232,.1);padding:2px 6px;border-radius: var(--r-sm, 6px);font-family:var(--font-mono);font-size:12.5px;color:var(--violet-3)}\n        pre{background:var(--bg-0);border:1px solid var(--border-subtle);border-radius: var(--r-md, 10px);padding:14px 16px;overflow-x:auto;font-family:var(--font-mono);font-size:12.5px;line-height:1.6;color:var(--text-primary);position:relative;margin:12px 0}\n        pre code{color:var(--text-primary)}\n        .tok-key{color:var(--cyan-3)}.tok-str{color:#b0e8c0}.tok-com{color:var(--text-disabled);font-style:italic}\n        .copy-btn{position:absolute;top:8px;right:8px;background:var(--bg-3);border:1px solid var(--border-default);color:var(--text-muted);border-radius: var(--r-sm, 6px);padding:3px 9px;font-size:11px;cursor:pointer;font-family:var(--font-body)}\n        .copy-btn:hover{color:var(--text-primary);border-color:var(--accent-hover)}\n\n        table{width:100%;border-collapse:collapse;margin:10px 0;font-size:13.5px}\n        th,td{text-align:left;padding:9px 10px;border-bottom:1px solid var(--border-subtle);vertical-align:top}\n        th{color:var(--text-muted);font-weight:600;font-size:11.5px;text-transform:uppercase;letter-spacing:.04em}\n        td code{font-family:var(--font-mono);color:var(--violet-3);font-size:12.5px}\n        .req{color:var(--danger);font-size:11px;font-weight:600}\n        .opt{color:var(--text-disabled);font-size:11px}\n        .note{background:var(--accent-soft);border-left:2px solid var(--accent);border-radius: var(--r-sm, 6px);padding:10px 14px;margin:14px 0;font-size:13px;color:var(--text-secondary)}\n        .note b{color:var(--text-primary)}\n        .muted{color:var(--text-muted)}\n        h2.dh{font-family:var(--font-display);font-size:var(--text-lg);font-weight:600;margin:40px 0 6px;letter-spacing:-.01em;scroll-margin-top:24px;color:var(--text-primary)}\n        h3.dh{font-family:var(--font-body);font-size:var(--text-base);font-weight:600;margin:24px 0 8px;color:var(--violet-3)}\n        p.dp{color:var(--text-secondary);font-size:14.5px}\n        .doc-toc{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 24px}\n        .doc-toc a{background:var(--surface-card);border:1px solid var(--border-default);color:var(--text-secondary);font-size:12px;padding:5px 11px;border-radius: var(--r-sm, 6px)}\n        .doc-toc a:hover{color:var(--text-primary);border-color:var(--accent);text-decoration:none}\n        .bp-list{display:flex;flex-direction:column;gap:10px;margin:14px 0}\n        .bp-item{display:flex;gap:10px;align-items:flex-start;font-size:13.5px;color:var(--text-secondary)}\n        .bp-item svg{flex-shrink:0;color:var(--success);margin-top:2px}\n        details.faq{border-top:1px solid var(--border-subtle);padding:12px 0}\n        details.faq:first-of-type{border-top:none}\n        details.faq summary{color:var(--text-primary);font-weight:600;font-size:14px;list-style:none}\n        details.faq summary::-webkit-details-marker{display:none}\n        details.faq summary::before{content:\"+ \";color:var(--accent)}\n        details.faq[open] summary::before{content:\"– \"}\n        details.faq p{margin:8px 0 0;color:var(--text-secondary);font-size:13.5px}\n\n        .stat-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:20px}\n        .stat-card .l{color:var(--text-muted);font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.04em}\n        .stat-card .v{color:var(--text-primary);font-size:22px;font-family:var(--font-display);font-weight:700;margin-top:6px;line-height:1.2}\n        .stat-card .v small{font-size:12.5px;color:var(--text-muted);font-weight:500}\n        .stat-card .sub{color:var(--text-disabled);font-size:11.5px;margin-top:4px}\n        .bar{height:7px;border-radius: var(--r-sm, 6px);background:var(--bg-4);overflow:hidden;margin-top:9px}\n        .bar > i{display:block;height:100%;background:var(--accent);border-radius: var(--r-sm, 6px);transition:width .4s var(--ease-standard)}\n        .chip-row{display:flex;flex-wrap:wrap;gap:7px;margin-top:10px}\n        .signin-cta{padding:28px 24px;text-align:center}\n        .signin-cta p{color:var(--text-secondary);margin:0 0 14px}\n        .mu-head{color:var(--text-primary);font-weight:600;font-size:13.5px;margin-bottom:var(--space-3)}\n        .mu-row{display:flex;align-items:center;gap:var(--space-3);padding:var(--space-2) 0}\n        .mu-name{font-family:var(--font-mono);font-size:12px;color:var(--text-secondary);width:190px;flex-shrink:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}\n        .mu-bar{flex:1;height:6px;background:var(--bg-4);border-radius: var(--r-sm, 6px);overflow:hidden}\n        .mu-bar>i{display:block;height:100%;background:var(--accent-2);border-radius: var(--r-sm, 6px)}\n        .mu-val{font-family:var(--font-mono);font-size:11.5px;color:var(--text-muted);width:64px;text-align:right;flex-shrink:0}\n\n        .key-row{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:14px 20px;border-top:1px solid var(--border-subtle);flex-wrap:wrap}\n        .key-row:first-child{border-top:none}\n        .key-row .name{color:var(--text-primary);font-weight:600;font-size:14px}\n        .key-row .meta{color:var(--text-muted);font-size:12px;margin-top:2px}\n        .key-empty{padding:28px 20px;text-align:center;color:var(--text-muted);font-size:13.5px}\n        .new-key-banner{display:flex;align-items:center;gap:10px;background:var(--success-soft);border:1px solid rgba(52,211,153,.35);border-radius: var(--r-md, 10px);padding:12px 14px;margin-bottom:16px}\n        .new-key-banner code{flex:1;color:var(--text-primary);font-size:13px;word-break:break-all}\n        .new-key-banner .label{color:var(--success);font-size:11.5px;font-weight:600;text-transform:uppercase;letter-spacing:.03em;display:block;margin-bottom:4px}\n        .reveal-box{flex:1 0 100%;display:flex;align-items:center;gap:var(--space-2);background:var(--bg-0);border:1px solid var(--border-default);border-radius: var(--r-md, 10px);padding:var(--space-2) var(--space-3);margin-top:var(--space-2)}\n        .reveal-box code{flex:1;color:var(--text-primary);font-size:12.5px;word-break:break-all}\n\n        .model-group{margin-bottom:16px}\n        .model-group-h{color:var(--text-primary);font-weight:600;font-size:13.5px;margin-bottom:10px;display:flex;align-items:center;gap:8px}\n        .model-row{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:12px 18px;border-top:1px solid var(--border-subtle);flex-wrap:wrap}\n        .model-row:first-child{border-top:none}\n        .model-row .m-id{font-family:var(--font-mono);font-size:13px;color:var(--text-primary);cursor:pointer}\n        .model-row .m-id:hover{color:var(--accent-hover)}\n        .model-row .m-label{color:var(--text-muted);font-size:12px;margin-left:8px}\n        .model-row .m-right{display:flex;align-items:center;gap:8px;flex-wrap:wrap}\n        .m-price{color:var(--text-disabled);font-size:11.5px;font-family:var(--font-mono)}\n\n        .pg-shell{display:flex;flex-direction:column;height:calc(100vh - 140px);min-height:420px}\n        .pg-config{display:flex;gap:10px;margin-bottom:14px;flex-wrap:wrap}\n        .pg-config .field{flex:1;min-width:180px}\n        .pg-thread{flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:10px;padding:18px;margin-bottom:14px}\n        .pg-msg{max-width:78%;padding:10px 14px;border-radius: var(--r-md, 10px);font-size:14px;line-height:1.5;white-space:pre-wrap}\n        .pg-msg.user{align-self:flex-end;background:var(--accent-soft);color:var(--text-primary)}\n        .pg-msg.assistant{align-self:flex-start;background:var(--bg-3);color:var(--text-primary)}\n        .pg-msg.err{align-self:flex-start;background:var(--danger-soft);color:var(--danger);font-family:var(--font-mono);font-size:12.5px}\n        .pg-empty{margin:auto;text-align:center;color:var(--text-disabled);font-size:13.5px}\n        .pg-row{display:flex;gap:10px}\n        .pg-row .field{flex:1}\n        .pg-gate{padding:32px 24px;text-align:center}\n\n        .log-row{display:flex;align-items:center;gap:var(--space-3);padding:var(--space-3) var(--space-4);border-top:1px solid var(--border-subtle);font-size:12.5px;flex-wrap:wrap}\n        .log-row:first-child{border-top:none}\n        .log-model{font-family:var(--font-mono);color:var(--text-primary)}\n        .log-time{margin-left:auto;color:var(--text-muted)}\n        .log-right{color:var(--text-muted);font-family:var(--font-mono);font-size:11.5px;min-width:110px;text-align:right}\n\n        .status-hero{display:flex;align-items:center;gap:var(--space-4);padding:var(--space-6);flex-wrap:wrap}\n        .status-meta{color:var(--text-muted);font-size:13px;font-family:var(--font-mono)}\n        .status-strip{display:flex;gap:2px;align-items:flex-end;flex-wrap:wrap}\n        .status-day{width:8px;height:28px;border-radius: var(--r-sm, 6px);background:var(--bg-4)}\n        .status-day.status-success{background:var(--success)}\n        .status-day.status-warning{background:var(--warning)}\n        .status-day.status-danger{background:var(--danger)}\n\n        .dlg-scrim{position:fixed;inset:0;background:rgba(5,6,10,0.94);display:none;align-items:center;justify-content:center;z-index:100}\n        .dlg-scrim.open{display:flex}\n        .dlg{background:var(--surface-raised);border:1px solid var(--border-default);border-radius: var(--r-md, 10px);box-shadow:var(--shadow-lg);width:380px;max-width:calc(100vw - 32px);padding:24px}\n        .dlg-title{color:var(--text-primary);font-family:var(--font-display);font-weight:600;font-size:var(--text-lg);margin-bottom:14px}\n        .dlg-foot{display:flex;justify-content:flex-end;gap:10px;margin-top:20px}\n\n        .toast-wrap{position:fixed;top:var(--space-5);right:var(--space-5);z-index:800;display:flex;flex-direction:column;gap:var(--space-3);pointer-events:none}\n        .toast{pointer-events:auto;position:relative;overflow:hidden;display:flex;align-items:flex-start;gap:var(--space-3);background:var(--surface-raised);border:1px solid var(--border-default);border-left:4px solid var(--accent-2);border-radius: var(--r-md, 10px);padding:var(--space-4) var(--space-5);box-shadow:var(--shadow-lg);min-width:280px;max-width:380px;transform:translateX(130%) scale(.96);opacity:0;transition:transform .5s cubic-bezier(.16,1,.3,1),opacity .4s cubic-bezier(.16,1,.3,1)}\n        .toast.in{transform:translateX(0) scale(1);opacity:1}\n        .toast-success{border-left-color:var(--success)}\n        .toast-danger{border-left-color:var(--danger)}\n        .toast-info{border-left-color:var(--accent-2)}\n        .toast-title{color:var(--text-primary);font-weight:600;font-size:14.5px}\n        .toast-msg{color:var(--text-secondary);font-size:13px;margin-top:3px}\n        .toast-x{margin-left:auto;background:transparent;border:none;color:var(--text-muted);cursor:pointer;font-size:16px;line-height:1;flex-shrink:0}\n        .toast-bar{position:absolute;left:0;bottom:0;height:3px;width:100%;background:var(--accent-2);transform-origin:left;animation:toastShrink linear forwards}\n        .toast-success .toast-bar{background:var(--success)}\n        .toast-danger .toast-bar{background:var(--danger)}\n        @keyframes toastShrink{from{transform:scaleX(1)}to{transform:scaleX(0)}}\n\n        .tt-bubble{position:fixed;z-index:900;background:var(--bg-4);color:var(--text-primary);font-size:var(--text-xs);padding:var(--space-2) var(--space-3);border-radius: var(--r-md, 10px);border:1px solid var(--border-default);box-shadow:var(--shadow-md);pointer-events:none;white-space:nowrap;opacity:0;transition:opacity var(--duration-fast) var(--ease-standard)}\n        .tt-bubble.show{opacity:1}\n\n        .assist-launcher{position:fixed;bottom:var(--space-6);right:var(--space-6);z-index:400;display:flex;align-items:center;gap:8px;background:var(--accent);color:var(--text-on-accent);border:none;border-radius: var(--r-sm, 6px);padding:12px 18px;font-weight:600;font-size:13px;cursor:pointer;box-shadow:var(--shadow-lg);transition:background var(--duration-normal) var(--ease-standard),transform var(--duration-fast) var(--ease-standard)}\n        .assist-launcher:hover{background:var(--accent-hover)}\n        .assist-launcher:active{transform:scale(.97)}\n        .assist-panel{position:fixed;bottom:var(--space-6);right:var(--space-6);z-index:410;width:360px;max-width:calc(100vw - 32px);height:480px;max-height:calc(100vh - 100px);background:var(--surface-raised);border:1px solid var(--border-default);border-radius: var(--r-md, 10px);box-shadow:var(--shadow-lg);display:none;flex-direction:column;overflow:hidden}\n        .assist-panel.open{display:flex}\n        .assist-head{display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid var(--border-subtle);font-weight:600;font-size:13.5px;color:var(--text-primary)}\n        .assist-count{margin-left:auto;color:var(--text-muted);font-size:11.5px;font-weight:500}\n        .assist-close{background:transparent;border:none;color:var(--text-muted);cursor:pointer;font-size:16px}\n        .assist-thread{flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:10px;padding:14px}\n\n        footer.gw-foot{color:var(--text-disabled);font-size:12.5px;margin-top:56px;border-top:1px solid var(--border-subtle);padding-top:20px}\n\n        @media (max-width: 860px){\n            .gw{flex-direction:column}\n            .gw-side{position:sticky;top:0;width:100%;height:auto;flex-direction:row;overflow-x:auto;overflow-y:visible;border-right:none;border-bottom:1px solid var(--border-subtle);padding:10px 12px;z-index:5;background:var(--surface-app)}\n            .gw-brand{padding:4px 10px;flex-shrink:0}\n            .gw-nav{flex-direction:row}\n            .gw-nav-btn{white-space:nowrap}\n            .gw-side-foot{margin-top:0;padding-top:0;border-top:none;flex-direction:row;margin-left:auto;flex-shrink:0}\n            .gw-version{display:none}\n            .gw-main{height:auto}\n            .gw-pane{padding:28px 18px 64px}\n            .stat-grid{grid-template-columns:repeat(2,1fr)}\n            .pg-shell{height:auto;min-height:540px}\n            .assist-panel{right:12px;left:12px;width:auto;bottom:80px}\n            .assist-launcher{right:12px;bottom:12px}\n        }\n    </style><link rel=\"stylesheet\" href=\"/src/css/nocturne-select.css\"><link rel=\"stylesheet\" href=\"/src/css/nocturne-glide.css\"><style>#bgCanvas{position:fixed;inset:0;z-index:0;pointer-events:none}#bgAurora{position:fixed;inset:0;z-index:0;pointer-events:none;opacity:0;transition:opacity 1.2s cubic-bezier(.22,.72,.14,1);filter:blur(44px);background:#05060d;will-change:transform,opacity;transform-origin:center center;backface-visibility:hidden}#bgAurora.active{opacity:1}#bgAurora.theme-aurora{background:radial-gradient(60% 50% at 18% 22%,rgba(155,218,176,.18),transparent 60%),radial-gradient(55% 50% at 82% 78%,rgba(149,200,224,.22),transparent 60%),radial-gradient(45% 40% at 62% 36%,rgba(184,176,218,.22),transparent 60%),#05060d;animation:nbgAur 36s cubic-bezier(.45,0,.55,1) infinite alternate}#bgAurora.theme-nebula{background:radial-gradient(70% 60% at 22% 28%,rgba(190,110,210,.24),transparent 60%),radial-gradient(60% 55% at 78% 72%,rgba(110,110,230,.26),transparent 60%),radial-gradient(48% 42% at 50% 50%,rgba(220,140,200,.14),transparent 60%),#05060d;animation:nbgNeb 48s cubic-bezier(.45,0,.55,1) infinite alternate}#bgAurora.theme-ocean{background:radial-gradient(65% 55% at 20% 25%,rgba(80,150,200,.26),transparent 60%),radial-gradient(55% 50% at 80% 75%,rgba(60,200,180,.22),transparent 60%),radial-gradient(45% 40% at 50% 55%,rgba(100,180,220,.18),transparent 60%),linear-gradient(180deg,#03060d 0%,#060d18 100%);animation:nbgOce 40s cubic-bezier(.45,0,.55,1) infinite alternate}#bgAurora.theme-sunset{background:radial-gradient(70% 60% at 22% 78%,rgba(232,130,102,.22),transparent 60%),radial-gradient(60% 55% at 78% 28%,rgba(186,96,138,.28),transparent 60%),radial-gradient(50% 45% at 50% 50%,rgba(220,150,132,.16),transparent 60%),linear-gradient(180deg,#0d0612 0%,#1c0a1a 100%);animation:nbgSun 44s cubic-bezier(.45,0,.55,1) infinite alternate}#bgAurora.theme-mono{background:radial-gradient(60% 50% at 30% 30%,rgba(200,200,222,.07),transparent 60%),radial-gradient(50% 45% at 70% 70%,rgba(180,180,210,.05),transparent 60%),linear-gradient(180deg,#0a0a10 0%,#050508 100%);animation:nbgMon 32s cubic-bezier(.45,0,.55,1) infinite alternate}#bgAurora.theme-embers{background:radial-gradient(45% 40% at 24% 72%,rgba(224,112,60,.18),transparent 60%),radial-gradient(40% 35% at 76% 28%,rgba(204,80,52,.16),transparent 60%),radial-gradient(35% 30% at 60% 60%,rgba(232,142,80,.10),transparent 60%),linear-gradient(180deg,#0a0508 0%,#08060d 100%);animation:nbgEmb 34s cubic-bezier(.45,0,.55,1) infinite alternate}@keyframes nbgAur{0%{background-position:0% 0%,100% 100%,50% 50%;transform:translate3d(0,0,0) scale(1)}100%{background-position:8% 4%,92% 96%,48% 52%;transform:translate3d(-.6%,.4%,0) scale(1.015)}}@keyframes nbgNeb{0%{transform:translate3d(0,0,0) scale(1) rotate(0deg)}100%{transform:translate3d(-.4%,.3%,0) scale(1.02) rotate(.6deg)}}@keyframes nbgOce{0%{transform:translate3d(0,0,0) scale(1)}100%{transform:translate3d(-.8%,.5%,0) scale(1.018)}}@keyframes nbgSun{0%{transform:translate3d(0,0,0) scale(1)}100%{transform:translate3d(.4%,-.4%,0) scale(1.014)}}@keyframes nbgMon{0%{opacity:1;transform:scale(1)}100%{opacity:.86;transform:scale(1.01)}}@keyframes nbgEmb{0%{opacity:1;transform:translate3d(0,0,0) scale(1)}100%{opacity:.88;transform:translate3d(.3%,-.3%,0) scale(1.015)}}</style>");
(function(){try{var fstack=localStorage.getItem("nocturne-font-stack")||"";if(fstack){var fcss=localStorage.getItem("nocturne-font-css")||"";if(fcss&&!document.getElementById("nocFontLink")){var fl=document.createElement("link");fl.id="nocFontLink";fl.rel="stylesheet";fl.href="https://fonts.googleapis.com/css2?family="+fcss+"&display=swap";(document.head||document.documentElement).appendChild(fl)}document.documentElement.style.setProperty("--font",fstack)}var t=localStorage.getItem("nocturne-bg-theme")||"stars";var known=["aurora","nebula","ocean","sunset","mono","embers"];if(t!=="off"&&localStorage.getItem("nocturne-bgfx")==="0"){try{localStorage.setItem("nocturne-bgfx","1")}catch(e){}}function img(){var bimg=localStorage.getItem("nocturne-bg-image")||"";if(!bimg)return;var be=document.getElementById("__nocturneBg");if(!be){be=document.createElement("div");be.id="__nocturneBg";be.style.cssText="position:fixed;inset:0;z-index:0;pointer-events:none;background-position:center;background-size:cover;background-repeat:no-repeat;transition:opacity .2s,filter .2s";document.body.insertBefore(be,document.body.firstChild)}be.style.backgroundImage='url("'+bimg+'")';be.style.opacity=(parseInt(localStorage.getItem("nocturne-bg-opacity"),10)||100)/100;be.style.filter="blur("+(parseInt(localStorage.getItem("nocturne-bg-blur"),10)||0)+"px)"}function init(){img();var c=document.getElementById("bgCanvas");var fx=localStorage.getItem("nocturne-bgfx");if(t!=="off"&&fx==="0"){fx="1";try{localStorage.setItem("nocturne-bgfx","1")}catch(e){}}if(t==="off"){if(c)c.style.display="none";return}if(!c){c=document.createElement("canvas");c.id="bgCanvas";c.className="visible";document.body.insertBefore(c,document.body.firstChild)}c.style.display="";if(!document.querySelector('script[src^="/src/js/wz6714.js"]')){var s=document.createElement("script");s.src="/src/js/wz6714.js";s.defer=true;document.head.appendChild(s)}}if(document.body)init();else document.addEventListener("DOMContentLoaded",init)}catch(e){}})();
;
document.write("<link rel=\"stylesheet\" href=\"/src/css/island.css\"><script src=\"/src/js/ph4529.js\" defer></script>");