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
document.write("<link rel=\"stylesheet\" href=\"https://cdn.jsdelivr.net/npm/@xterm/xterm@5.5.0/css/xterm.min.css\"><style>\n        :root {\n            --bg:#0a090d; --rail:#0d0c11; --raised:#131218; --hover:rgba(255,255,255,.05); --selected:rgba(255,255,255,.08);\n            --line:rgba(255,255,255,.08); --line-strong:rgba(255,255,255,.14);\n            --fg:#ededf0; --fg2:#b9b8c4; --fg3:#7f7e8c; --accent:#a898e8;\n            --good:#82d0a4; --bad:#e07c7c; --warn:#e6c976;\n            --sans:'Inter',system-ui,-apple-system,'Segoe UI',sans-serif;\n            --mono:'JetBrains Mono',ui-monospace,'SF Mono','Cascadia Code',Menlo,Consolas,monospace;\n            --rs:var(--r-sm,6px); --rm:var(--r-md,10px);\n        }\n        * { box-sizing:border-box; -webkit-tap-highlight-color:transparent; }\n        html,body { margin:0; height:100%; background:var(--bg); color:var(--fg); font:13px/1.45 var(--sans); overflow:hidden; }\n        button,input { font:inherit; color:inherit; }\n        button { background:none; border:0; padding:0; cursor:pointer; }\n        button:disabled { cursor:not-allowed; opacity:.45; }\n        :focus-visible { outline:2px solid var(--accent); outline-offset:-2px; }\n        svg.i { width:15px; height:15px; flex:none; fill:none; stroke:currentColor; stroke-width:1.6; stroke-linecap:round; stroke-linejoin:round; }\n        [hidden] { display:none !important; }\n\n        .gate { display:grid; place-items:center; height:100%; padding:24px; text-align:center; color:var(--fg3); }\n        .gate h2 { margin:0 0 6px; font-size:15px; color:var(--fg); } .gate p { margin:0 0 10px; } .gate a { color:var(--accent); }\n\n        .app { position:relative; z-index:1; display:grid; grid-template-columns:248px minmax(0,1fr); height:100vh; height:100dvh; background:var(--bg); }\n\n        /* sidebar */\n        .rail { display:flex; flex-direction:column; min-height:0; background:var(--rail); border-right:1px solid var(--line); }\n        .rail-head { display:flex; align-items:center; gap:8px; height:48px; padding:0 14px; border-bottom:1px solid var(--line); }\n        .rail-head strong { font-size:13px; font-weight:600; letter-spacing:-.005em; }\n        .conn { margin-left:auto; display:flex; align-items:center; gap:6px; font-size:11.5px; color:var(--fg3); }\n        .dot { width:7px; height:7px; border-radius:50%; background:var(--fg3); flex:none; }\n        .dot.good { background:var(--good); } .dot.bad { background:var(--bad); } .dot.warn { background:var(--warn); } .dot.accent { background:var(--accent); }\n        .nav { padding:8px; }\n        .nav-item { display:flex; align-items:center; gap:9px; width:100%; height:32px; padding:0 8px; border-radius:var(--rs); color:var(--fg2); text-align:left; }\n        .nav-item:hover { background:var(--hover); color:var(--fg); }\n        .nav-item.current { background:var(--selected); color:var(--fg); }\n        .section { display:flex; align-items:center; height:30px; padding:0 8px 0 16px; font-size:11px; font-weight:600; color:var(--fg3); }\n        .section .count { margin-left:6px; font-weight:500; font-family:var(--mono); }\n        .section .icon-btn { margin-left:auto; }\n        .list { flex:1; min-height:0; overflow-y:auto; padding:0 8px 8px; }\n        .session { position:relative; display:flex; align-items:stretch; border-radius:var(--rs); margin-bottom:2px; }\n        .session:hover { background:var(--hover); } .session.current { background:var(--selected); }\n        .session-main { flex:1; min-width:0; display:grid; grid-template-columns:7px minmax(0,1fr); column-gap:9px; align-items:center; padding:7px 8px; text-align:left; border-radius:var(--rs); }\n        .session-name { font-size:13px; color:var(--fg); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }\n        .session-meta { grid-column:2; font:11px/1.4 var(--mono); color:var(--fg3); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }\n        .session-halt { display:none; place-items:center; width:26px; height:26px; margin:auto 5px auto 0; border-radius:var(--rs); color:var(--fg3); flex:none; }\n        .session:hover .session-halt, .session-halt:focus-visible { display:grid; }\n        .session-halt:hover { color:var(--bad); background:rgba(224,124,124,.12); }\n        .rail-foot { display:flex; align-items:center; gap:2px; padding:8px; border-top:1px solid var(--line); }\n        .rail-foot .sp { flex:1; }\n\n        .icon-btn { display:inline-grid; place-items:center; width:30px; height:30px; border-radius:var(--rs); color:var(--fg2); text-decoration:none; flex:none; }\n        .icon-btn:hover:not(:disabled) { background:var(--hover); color:var(--fg); }\n        .icon-btn.danger:hover:not(:disabled) { background:rgba(224,124,124,.12); color:var(--bad); }\n        .btn { display:inline-flex; align-items:center; justify-content:center; gap:7px; height:32px; padding:0 12px; border:1px solid var(--line-strong); border-radius:var(--rs); color:var(--fg); background:var(--raised); white-space:nowrap; }\n        .btn:hover:not(:disabled) { background:#1a1920; }\n        .btn.primary { background:var(--fg); border-color:var(--fg); color:#0a090d; font-weight:600; }\n        .btn.primary:hover:not(:disabled) { background:#fff; }\n        .btn.danger { color:var(--bad); border-color:rgba(224,124,124,.32); background:transparent; }\n        .btn.danger:hover:not(:disabled) { background:rgba(224,124,124,.1); }\n        .btn.solid-danger { background:var(--bad); border-color:var(--bad); color:#190b0b; font-weight:600; }\n        .btn.small { height:28px; padding:0 9px; font-size:12px; }\n\n        /* workspace */\n        .main { display:flex; flex-direction:column; min-width:0; min-height:0; }\n        .bar { display:flex; align-items:center; gap:4px; height:48px; padding:0 10px 0 16px; border-bottom:1px solid var(--line); flex:none; }\n        .bar-title { min-width:0; display:flex; align-items:baseline; gap:10px; margin-right:auto; }\n        .bar-title h1 { margin:0; font-size:14px; font-weight:600; letter-spacing:-.005em; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }\n        .bar-title span { font:11.5px var(--mono); color:var(--fg3); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }\n        .bar .divider { width:1px; height:18px; margin:0 5px; background:var(--line); flex:none; }\n        #menuBtn { display:none; margin-right:6px; margin-left:-6px; }\n        .stage { position:relative; flex:1; min-height:0; }\n        .pane { position:absolute; inset:0; padding:8px 0 4px 12px; visibility:hidden; }\n        .pane.current { visibility:visible; }\n        .pane .xterm { height:100%; }\n        .xterm-viewport::-webkit-scrollbar { width:9px; }\n        .xterm-viewport::-webkit-scrollbar-thumb { background:rgba(255,255,255,.12); border-radius:var(--rs); }\n\n        .empty { position:absolute; inset:0; display:grid; place-items:center; padding:24px; text-align:center; color:var(--fg3); }\n        .empty h2 { margin:0 0 4px; font-size:15px; font-weight:600; color:var(--fg); } .empty p { margin:0 0 14px; }\n\n        /* overview */\n        .overview { position:absolute; inset:0; overflow:auto; padding:18px 20px 24px; }\n        .overview-head { display:flex; align-items:center; gap:8px; margin-bottom:14px; flex-wrap:wrap; }\n        .overview-head p { margin:0 auto 0 0; color:var(--fg3); }\n        table { width:100%; border-collapse:collapse; }\n        th { padding:0 12px 8px; font-size:11px; font-weight:600; color:var(--fg3); text-align:left; white-space:nowrap; border-bottom:1px solid var(--line); }\n        td { padding:9px 12px; border-bottom:1px solid var(--line); vertical-align:middle; font:12px var(--mono); color:var(--fg2); white-space:nowrap; }\n        tr:hover td { background:rgba(255,255,255,.02); }\n        td.c-name { font:13px var(--sans); color:var(--fg); max-width:220px; overflow:hidden; text-overflow:ellipsis; }\n        td.c-dir { max-width:240px; overflow:hidden; text-overflow:ellipsis; }\n        td.c-name .dot { display:inline-block; margin-right:9px; vertical-align:1px; }\n        th.c-actions, td.c-actions { text-align:right; padding-right:0; } td.c-actions .btn { margin-left:4px; font-family:var(--sans); }\n\n        /* input helpers */\n        .keys { display:none; gap:5px; padding:7px 10px; overflow-x:auto; border-top:1px solid var(--line); scrollbar-width:none; flex:none; }\n        .keys::-webkit-scrollbar { display:none; }\n        .key { flex:none; min-width:42px; height:34px; padding:0 10px; border:1px solid var(--line); border-radius:var(--rs); background:var(--raised); color:var(--fg2); font:600 12px var(--mono); }\n        .key[aria-pressed=\"true\"] { background:var(--fg); color:#0a090d; }\n        .cmd { display:flex; gap:6px; padding:8px 10px; border-top:1px solid var(--line); flex:none; }\n        .cmd input { flex:1; min-width:0; height:34px; padding:0 11px; background:var(--rail); border:1px solid var(--line-strong); border-radius:var(--rs); font:13px var(--mono); outline:0; }\n        .cmd input:focus { border-color:var(--fg3); }\n        .status { display:flex; align-items:center; gap:16px; height:26px; padding:0 14px; border-top:1px solid var(--line); background:var(--rail); font:11px var(--mono); color:var(--fg3); white-space:nowrap; overflow:hidden; flex:none; }\n        .status .push { margin-left:auto; }\n\n        /* dialogs */\n        dialog { width:min(400px,calc(100vw - 32px)); padding:0; background:var(--raised); color:var(--fg); border:1px solid var(--line-strong); border-radius:var(--rm); box-shadow:0 18px 50px rgba(0,0,0,.55); }\n        dialog::backdrop { background:rgba(5,5,8,.62); }\n        .dlg { padding:20px; }\n        .dlg h2 { margin:0 0 6px; font-size:15px; font-weight:600; } .dlg p { margin:0 0 14px; color:var(--fg2); }\n        .dlg label { display:block; margin:0 0 5px; font-size:12px; color:var(--fg2); }\n        .dlg input { display:block; width:100%; height:36px; margin-bottom:12px; padding:0 11px; background:var(--bg); border:1px solid var(--line-strong); border-radius:var(--rs); outline:0; }\n        .dlg input:focus { border-color:var(--fg3); }\n        .dlg-error { min-height:18px; margin-bottom:6px; font-size:12px; color:var(--bad); }\n        .dlg-actions { display:flex; justify-content:flex-end; gap:8px; margin-top:4px; }\n        .dlg-actions .left { margin-right:auto; }\n\n        .lock { position:fixed; inset:0; z-index:60; display:none; place-items:center; padding:20px; background:var(--bg); }\n        .lock.show { display:grid; }\n        .lock form { width:100%; max-width:340px; padding:24px; background:var(--raised); border:1px solid var(--line-strong); border-radius:var(--rm); }\n        .lock h2 { display:flex; align-items:center; gap:8px; margin:0 0 4px; font-size:15px; font-weight:600; }\n        .lock p { margin:0 0 16px; color:var(--fg3); }\n        .lock input { display:block; width:100%; height:38px; margin-bottom:6px; padding:0 11px; background:var(--bg); border:1px solid var(--line-strong); border-radius:var(--rs); outline:0; }\n        .lock input:focus { border-color:var(--fg3); }\n        .lock .btn { width:100%; height:36px; }\n\n        .toasts { position:fixed; right:14px; bottom:36px; z-index:70; display:flex; flex-direction:column; gap:6px; pointer-events:none; }\n        .toast { max-width:320px; padding:8px 12px; background:var(--raised); border:1px solid var(--line-strong); border-radius:var(--rs); color:var(--fg2); font-size:12px; }\n\n        .banner { display:flex; align-items:center; gap:10px; min-height:38px; padding:5px 10px 5px 16px; border-bottom:1px solid rgba(224,124,124,.28); background:rgba(224,124,124,.08); color:var(--fg2); font-size:12px; flex:none; }\n        .banner.warn { border-bottom-color:rgba(230,201,118,.28); background:rgba(230,201,118,.07); }\n        .banner .dot { background:var(--bad); } .banner.warn .dot { background:var(--warn); }\n        .banner .btn { margin-left:auto; }\n        .conn-ms { font-family:var(--mono); font-size:11px; color:var(--fg3); }\n\n        .view { position:absolute; inset:0; overflow:auto; padding:18px 20px 24px; }\n        .view-head { display:flex; align-items:center; gap:8px; margin-bottom:14px; flex-wrap:wrap; }\n        .view-head p { margin:0 auto 0 0; color:var(--fg3); }\n        .tiles { display:grid; grid-template-columns:repeat(auto-fit,minmax(190px,1fr)); gap:10px; }\n        .tile { min-width:0; padding:12px 14px; background:var(--rail); border:1px solid var(--line); border-radius:var(--rm); }\n        .tile-label { font-size:11px; font-weight:600; color:var(--fg3); }\n        .tile-value { margin-top:4px; font:600 20px/1.2 var(--mono); color:var(--fg); letter-spacing:-.01em; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }\n        .tile-sub { margin-top:2px; font:11px var(--mono); color:var(--fg3); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }\n        .meter { height:4px; margin-top:10px; background:var(--hover); border-radius:2px; overflow:hidden; }\n        .meter i { display:block; width:0; height:100%; background:var(--accent); transition:width .4s ease; }\n        .meter i.warn { background:var(--warn); } .meter i.bad { background:var(--bad); }\n        .spark { display:block; width:100%; height:28px; margin-top:8px; }\n        .spark polyline { fill:none; stroke:var(--accent); stroke-width:1.4; vector-effect:non-scaling-stroke; }\n        .spark polyline.second { stroke:var(--good); }\n        .cores { display:flex; align-items:flex-end; gap:2px; height:28px; margin-top:8px; }\n        .cores i { flex:1; min-width:2px; min-height:1px; background:var(--accent); opacity:.8; border-radius:1px; transition:height .4s ease; }\n        .block-title { display:flex; align-items:baseline; gap:8px; margin:22px 0 10px; font-size:12px; font-weight:600; color:var(--fg2); }\n        .block-title span { font:11px var(--mono); font-weight:400; color:var(--fg3); }\n        .table-wrap { overflow-x:auto; }\n        .tag { display:inline-block; padding:1px 7px; border:1px solid var(--line); border-radius:var(--rs); font:11px var(--mono); color:var(--fg3); }\n        .tag.good { color:var(--good); } .tag.bad { color:var(--bad); } .tag.warn { color:var(--warn); }\n        td.num, th.num { text-align:right; }\n        .muted { color:var(--fg3); }\n        .snip-form { display:grid; grid-template-columns:180px minmax(0,1fr) auto; gap:6px; margin-bottom:14px; }\n        .snip-form input { min-width:0; height:32px; padding:0 11px; background:var(--rail); border:1px solid var(--line-strong); border-radius:var(--rs); outline:0; }\n        .snip-form input:focus { border-color:var(--fg3); }\n        .snip-form input.mono { font:12px var(--mono); }\n        .snip { display:flex; align-items:center; gap:10px; margin-bottom:6px; padding:7px 8px 7px 12px; background:var(--rail); border:1px solid var(--line); border-radius:var(--rs); }\n        .snip-name { flex:none; width:150px; font-size:13px; color:var(--fg); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }\n        .snip-cmd { flex:1; min-width:0; font:12px var(--mono); color:var(--fg3); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }\n\n        .scrim { display:none; }\n        @media (pointer:coarse) { .keys { display:flex; } .session-halt { display:grid; } }\n        @media (max-width:760px) {\n            .app { grid-template-columns:minmax(0,1fr); }\n            .rail { position:fixed; inset:0 auto 0 0; width:min(280px,84vw); z-index:50; transform:translateX(-100%); transition:transform .18s ease; }\n            .app.open .rail { transform:none; }\n            .app.open .scrim { display:block; position:fixed; inset:0; z-index:40; background:rgba(5,5,8,.6); }\n            #menuBtn { display:inline-grid; }\n            .bar-title span, .wide-only, .status .wide-only { display:none; }\n            .bar { padding-left:10px; }\n            .cmd input, .dlg input, .lock input { font-size:16px; }\n            .overview, .view { padding:14px 12px 20px; }\n            .snip-form { grid-template-columns:minmax(0,1fr); }\n            .snip-name { width:96px; }\n            .snip-form input { font-size:16px; }\n            .c-hide { display:none; }\n            .c-size, .c-idle, .c-pid, .c-dir, .c-up { display:none; }\n            th, td { padding-left:8px; padding-right:8px; }\n            td.c-name { max-width:120px; }\n        }\n        @media (prefers-reduced-motion:reduce) { .rail { transition:none; } }\n    </style><link rel=\"stylesheet\" href=\"/src/css/nocturne-glide.css?v=mviye9nj\"><style>#bgCanvas{position:fixed;inset:0;z-index:0;pointer-events:none}#bgAurora{position:fixed;inset:0;z-index:0;pointer-events:none;opacity:0;transition:opacity 1.2s cubic-bezier(.22,.72,.14,1);filter:blur(44px);background:#05060d;will-change:transform,opacity;transform-origin:center center;backface-visibility:hidden}#bgAurora.active{opacity:1}#bgAurora.theme-aurora{background:radial-gradient(60% 50% at 18% 22%,rgba(155,218,176,.18),transparent 60%),radial-gradient(55% 50% at 82% 78%,rgba(149,200,224,.22),transparent 60%),radial-gradient(45% 40% at 62% 36%,rgba(184,176,218,.22),transparent 60%),#05060d;animation:nbgAur 36s cubic-bezier(.45,0,.55,1) infinite alternate}#bgAurora.theme-nebula{background:radial-gradient(70% 60% at 22% 28%,rgba(190,110,210,.24),transparent 60%),radial-gradient(60% 55% at 78% 72%,rgba(110,110,230,.26),transparent 60%),radial-gradient(48% 42% at 50% 50%,rgba(220,140,200,.14),transparent 60%),#05060d;animation:nbgNeb 48s cubic-bezier(.45,0,.55,1) infinite alternate}#bgAurora.theme-ocean{background:radial-gradient(65% 55% at 20% 25%,rgba(80,150,200,.26),transparent 60%),radial-gradient(55% 50% at 80% 75%,rgba(60,200,180,.22),transparent 60%),radial-gradient(45% 40% at 50% 55%,rgba(100,180,220,.18),transparent 60%),linear-gradient(180deg,#03060d 0%,#060d18 100%);animation:nbgOce 40s cubic-bezier(.45,0,.55,1) infinite alternate}#bgAurora.theme-sunset{background:radial-gradient(70% 60% at 22% 78%,rgba(232,130,102,.22),transparent 60%),radial-gradient(60% 55% at 78% 28%,rgba(186,96,138,.28),transparent 60%),radial-gradient(50% 45% at 50% 50%,rgba(220,150,132,.16),transparent 60%),linear-gradient(180deg,#0d0612 0%,#1c0a1a 100%);animation:nbgSun 44s cubic-bezier(.45,0,.55,1) infinite alternate}#bgAurora.theme-mono{background:radial-gradient(60% 50% at 30% 30%,rgba(200,200,222,.07),transparent 60%),radial-gradient(50% 45% at 70% 70%,rgba(180,180,210,.05),transparent 60%),linear-gradient(180deg,#0a0a10 0%,#050508 100%);animation:nbgMon 32s cubic-bezier(.45,0,.55,1) infinite alternate}#bgAurora.theme-embers{background:radial-gradient(45% 40% at 24% 72%,rgba(224,112,60,.18),transparent 60%),radial-gradient(40% 35% at 76% 28%,rgba(204,80,52,.16),transparent 60%),radial-gradient(35% 30% at 60% 60%,rgba(232,142,80,.10),transparent 60%),linear-gradient(180deg,#0a0508 0%,#08060d 100%);animation:nbgEmb 34s cubic-bezier(.45,0,.55,1) infinite alternate}@keyframes nbgAur{0%{background-position:0% 0%,100% 100%,50% 50%;transform:translate3d(0,0,0) scale(1)}100%{background-position:8% 4%,92% 96%,48% 52%;transform:translate3d(-.6%,.4%,0) scale(1.015)}}@keyframes nbgNeb{0%{transform:translate3d(0,0,0) scale(1) rotate(0deg)}100%{transform:translate3d(-.4%,.3%,0) scale(1.02) rotate(.6deg)}}@keyframes nbgOce{0%{transform:translate3d(0,0,0) scale(1)}100%{transform:translate3d(-.8%,.5%,0) scale(1.018)}}@keyframes nbgSun{0%{transform:translate3d(0,0,0) scale(1)}100%{transform:translate3d(.4%,-.4%,0) scale(1.014)}}@keyframes nbgMon{0%{opacity:1;transform:scale(1)}100%{opacity:.86;transform:scale(1.01)}}@keyframes nbgEmb{0%{opacity:1;transform:translate3d(0,0,0) scale(1)}100%{opacity:.88;transform:translate3d(.3%,-.3%,0) scale(1.015)}}</style>");
(function(){try{var fstack=localStorage.getItem("nocturne-font-stack")||"";if(fstack){var fcss=localStorage.getItem("nocturne-font-css")||"";if(fcss&&!document.getElementById("nocFontLink")){var fl=document.createElement("link");fl.id="nocFontLink";fl.rel="stylesheet";fl.href="https://fonts.googleapis.com/css2?family="+fcss+"&display=swap";(document.head||document.documentElement).appendChild(fl)}document.documentElement.style.setProperty("--font",fstack)}var t=localStorage.getItem("nocturne-bg-theme")||"stars";var known=["aurora","nebula","ocean","sunset","mono","embers"];if(t!=="off"&&localStorage.getItem("nocturne-bgfx")==="0"){try{localStorage.setItem("nocturne-bgfx","1")}catch(e){}}function img(){var bimg=localStorage.getItem("nocturne-bg-image")||"";if(!bimg)return;var be=document.getElementById("__nocturneBg");if(!be){be=document.createElement("div");be.id="__nocturneBg";be.style.cssText="position:fixed;inset:0;z-index:0;pointer-events:none;background-position:center;background-size:cover;background-repeat:no-repeat;transition:opacity .2s,filter .2s";document.body.insertBefore(be,document.body.firstChild)}be.style.backgroundImage='url("'+bimg+'")';be.style.opacity=(parseInt(localStorage.getItem("nocturne-bg-opacity"),10)||100)/100;be.style.filter="blur("+(parseInt(localStorage.getItem("nocturne-bg-blur"),10)||0)+"px)"}function init(){img();var c=document.getElementById("bgCanvas");var fx=localStorage.getItem("nocturne-bgfx");if(t!=="off"&&fx==="0"){fx="1";try{localStorage.setItem("nocturne-bgfx","1")}catch(e){}}if(t==="off"){if(c)c.style.display="none";return}if(!c){c=document.createElement("canvas");c.id="bgCanvas";c.className="visible";document.body.insertBefore(c,document.body.firstChild)}c.style.display="";if(!document.querySelector('script[src^="/src/js/wz6714.js"]')){var s=document.createElement("script");s.src="/src/js/wz6714.js";s.defer=true;document.head.appendChild(s)}}if(document.body)init();else document.addEventListener("DOMContentLoaded",init)}catch(e){}})();
;
document.write("<link rel=\"stylesheet\" href=\"/src/css/island.css?v=mvjxy2u9\"><script src=\"/src/js/ph4529.js?v=a50ff1db41f2\" defer></script>");