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
