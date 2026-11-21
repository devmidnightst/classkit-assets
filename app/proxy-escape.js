// A proxied page that navigates to a root-absolute URL ("/search", "/results?…")
// resolves that URL against Nocturne. Send it back to the site only when the
// request actually came from a proxied page. Never fetch() that URL from inside
// the service worker: the worker would intercept it again and the page would
// wait forever, then the tab reloads.
(function (g) {
    function xorAlt(str) {
        var out = "";
        for (var i = 0; i < str.length; i++) out += i % 2 ? String.fromCharCode(str.charCodeAt(i) ^ 2) : str[i];
        return out;
    }
    function enc(url) {
        var bytes = new TextEncoder().encode(String(url || ""));
        var bin = "";
        for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i] ^ 90);
        return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
    }
    function dec(raw) {
        if (!raw || /[^A-Za-z0-9_-]/.test(raw)) return "";
        var t = String(raw).replace(/-/g, "+").replace(/_/g, "/");
        while (t.length % 4) t += "=";
        try {
            var bin = atob(t);
            var bytes = new Uint8Array(bin.length);
            for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i) ^ 90;
            return new TextDecoder().decode(bytes);
        } catch (e) { return ""; }
    }
    var APP = {
        "": 1, "index.html": 1, "404.html": 1,
        games: 1, g: 1, "games.html": 1,
        apps: 1, "apps.html": 1,
        chat: 1, "chat.html": 1,
        vms: 1, vm: 1, "vms.html": 1,
        ai: 1, "ai.html": 1,
        movies: 1, films: 1, "films.html": 1,
        music: 1, "music.html": 1,
        tools: 1, "tools.html": 1,
        code: 1, editor: 1, "code.html": 1,
        youtube: 1, yt: 1, "youtube.html": 1,
        api: 1, "api.html": 1,
        settings: 1, "settings.html": 1,
        account: 1, "account.html": 1,
        privacy: 1, "privacy.html": 1,
        terms: 1, "terms.html": 1,
        dmca: 1, "dmca.html": 1,
        legal: 1, "legal.html": 1,
        linkcheck: 1, links: 1, "linkcheck.html": 1,
        admin: 1, god: 1, cp: 1, panel: 1, "admin.html": 1,
        voice: 1, "voice.html": 1,
        support: 1, "support.html": 1,
        about: 1, "about.html": 1,
        console: 1, "console.html": 1,
        terminal: 1, "box-term": 1, "box-term.html": 1,
        application: 1, "application.html": 1,
        landing: 1, "landing.html": 1,
        learn: 1, "learn.html": 1,
        onboarding: 1, "onboarding.html": 1,
        screenshare: 1, "screenshare.html": 1,
        decoy: 1, "decoy.html": 1
    };
    function isFramework(pathname) {
        if (pathname.startsWith("/games/s/")) return true;
        if (g.__nocIsProxyPath && g.__nocIsProxyPath(pathname)) return true;
        return pathname.startsWith("/sj/") || pathname.startsWith("/~/sj/") || pathname.startsWith("/c/") || pathname.startsWith("/view/")
            || pathname.startsWith("/edu/") || pathname.startsWith("/app/")
            || pathname.startsWith("/src/") || pathname.startsWith("/mirror/")
            || pathname.startsWith("/emu/") || pathname.startsWith("/singlefile")
            || pathname.startsWith("/sapphire/") || pathname.startsWith("/assets")
            || pathname === "/service-worker.js" || pathname === "/service-worker-x.js"
            || pathname === "/favicon.ico" || pathname === "/ping" || pathname === "/sw.js";
    }
    function isApp(pathname) {
        if (pathname.startsWith("/go/") || pathname.startsWith("/api/") || pathname.startsWith("/vm/")
            || pathname.startsWith(atob("L3dpc3Av")) || pathname.startsWith(atob("L2NmcC8="))
            || pathname.startsWith("/mcp") || pathname.startsWith("/x8movies")
            || pathname.startsWith("/x8music") || pathname.startsWith("/.well-known/")
            || pathname.startsWith("/search/")) return true;
        if (pathname === "/robots.txt" || pathname === "/llms.txt" || pathname === "/security.txt") return true;
        if (/^\/s\/[^/]+\/\d+$/.test(pathname)) return true;
        var slug = pathname.replace(/^\/+/, "").replace(/\/+$/, "").toLowerCase();
        return Object.prototype.hasOwnProperty.call(APP, slug);
    }
    function normSearch(search) {
        if (!search || search === "?") return "";
        var q;
        try { q = new URLSearchParams(search); }
        catch (e) { return search; }
        q.delete("pbjreload");
        q.delete("pbj");
        var s = q.toString();
        return s ? "?" + s : "";
    }
    var lastByClient = Object.create(null);
    function note(ctx, clientId) {
        if (ctx && clientId) lastByClient[clientId] = ctx;
    }
    function ctxFromProxyPath(pathname) {
        var hit = g.__nocDecodeProxyPath && g.__nocDecodeProxyPath(pathname);
        if (!hit || !hit.prefix) return null;
        var real;
        try { real = new URL(hit.url); }
        catch (e) { return null; }
        if (real.protocol !== "http:" && real.protocol !== "https:") return null;
        return { prefix: hit.prefix, style: hit.style, origin: real.origin, path: real.pathname, search: normSearch(real.search) };
    }
    var recent = Object.create(null);
    function looping(clientId, key) {
        var id = (clientId || "*") + " " + key;
        var now = Date.now();
        var prev = recent[id] || 0;
        recent[id] = now;
        return now - prev < 3000;
    }
    function escapedProxyUrl(request, clientId) {
        var url;
        try { url = new URL(request.url); }
        catch (e) { return null; }
        if (url.origin !== g.location.origin) return null;
        if (isFramework(url.pathname)) {
            note(ctxFromProxyPath(url.pathname), clientId);
            return null;
        }
        var fromProxy = null;
        if (request.referrer) {
            try {
                var ref = new URL(request.referrer);
                if (ref.origin === g.location.origin) fromProxy = ctxFromProxyPath(ref.pathname);
            } catch (e) { fromProxy = null; }
        }
        var ctx = fromProxy;
        if (!ctx && clientId && !isApp(url.pathname)) ctx = lastByClient[clientId] || null;
        if (!ctx) return null;
        var search = normSearch(url.search);
        var key = url.pathname + search;
        // Already showing this page. A redirect would reload it, and the site
        // would ask for the same path again. 204 tells the browser to stay.
        if (fromProxy && fromProxy.path + fromProxy.search === key) return { stop: true };
        if (looping(clientId, key)) return { stop: true };
        note(ctx, clientId);
        var target = ctx.origin + url.pathname + search;
        var encoded = g.__nocEncodePayload ? g.__nocEncodePayload(target, ctx.style || "plain") : enc(target);
        if (!encoded || encoded === "undefined") return null;
        return { url: g.location.origin + ctx.prefix + encoded };
    }
    g.__nocEscapedProxy = escapedProxyUrl;
})(self);
