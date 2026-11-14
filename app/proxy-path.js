// Decode and re-encode the proxy paths the service worker sees.
// /sj/<controller>/<frame>/<payload> and the older /~/sj/ form, plus /view/.
(function (g) {
    function xorAlt(str) {
        var out = "";
        for (var i = 0; i < str.length; i++) out += i % 2 ? String.fromCharCode(str.charCodeAt(i) ^ 2) : str[i];
        return out;
    }
    // Same transform as the page codec in public/app/runtime/engine.mjs.
    function b64urlEncode(s) {
        var bytes = new TextEncoder().encode(s);
        var bin = "";
        for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i] ^ 90);
        return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
    }
    function b64urlDecode(raw) {
        if (!raw || /[^A-Za-z0-9_-]/.test(raw)) return "";
        var t = raw.replace(/-/g, "+").replace(/_/g, "/");
        while (t.length % 4) t += "=";
        try {
            var bin = atob(t);
            var bytes = new Uint8Array(bin.length);
            for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i) ^ 90;
            return new TextDecoder().decode(bytes);
        } catch (e) { return ""; }
    }
    function looksHttp(value) {
        return typeof value === "string" && /^https?:\/\//i.test(value);
    }
    function badUrl(value) {
        if (!value || value === "undefined") return true;
        return /^\/undefined(?:[A-Za-z0-9]+)?\/?$/.test(value);
    }
    function decodePayload(raw) {
        if (!raw || raw === "undefined") return null;
        var opaque = b64urlDecode(raw);
        if (looksHttp(opaque) && !badUrl(opaque)) return { url: opaque, style: "b64" };
        var plain = "";
        try { plain = decodeURIComponent(raw); } catch (e) { plain = ""; }
        if (looksHttp(plain) && !badUrl(plain)) return { url: plain, style: "plain" };
        var xor = "";
        try { xor = xorAlt(plain || ""); } catch (e) { xor = ""; }
        if (!xor) {
            try { xor = xorAlt(decodeURIComponent(raw)); } catch (e2) { xor = ""; }
        }
        if (looksHttp(xor) && !badUrl(xor)) return { url: xor, style: "xor" };
        return null;
    }
    function decodeProxyPath(pathname) {
        var path = String(pathname || "");
        var cut = path.indexOf("?");
        if (cut !== -1) path = path.slice(0, cut);
        var m = path.match(/^(\/(?:(?:~\/)?sj|c)\/[^/]+\/[^/]+\/)(.+)$/);
        if (!m) m = path.match(/^(\/view\/)(.+)$/);
        if (m) {
            var hit = decodePayload(m[2]);
            if (!hit) return null;
            return { url: hit.url, prefix: m[1], style: hit.style };
        }
        var legacy = path.match(/\/(https?(?:%3A|:)(?:%2F|\/)(?:%2F|\/).*)$/i);
        if (!legacy) return null;
        var old = decodePayload(legacy[1]);
        if (!old) return null;
        return { url: old.url, prefix: path.slice(0, path.length - legacy[1].length), style: old.style };
    }
    function encodePayload(url) {
        var s = url == null ? "" : String(url);
        if (!s || s === "undefined") return "";
        return b64urlEncode(s);
    }
    function isProxyPath(pathname) {
        var p = String(pathname || "");
        return p.indexOf("/sj/") === 0 || p.indexOf("/~/sj/") === 0 || p.indexOf("/c/") === 0 || p.indexOf("/view/") === 0;
    }
    g.__nocXorAlt = xorAlt;
    g.__nocDecodeProxyPath = decodeProxyPath;
    g.__nocEncodePayload = encodePayload;
    g.__nocIsProxyPath = isProxyPath;
})(typeof self !== "undefined" ? self : globalThis);
