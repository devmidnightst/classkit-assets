// Blocks common ad hosts inside proxied pages. First-party app requests are ignored.
var __NOC_AD_HOSTS = [
    "doubleclick.net", "googlesyndication.com", "googleadservices.com", "googleads.g.doubleclick.net",
    "adservice.google.com", "pagead2.googlesyndication.com", "adnxs.com", "adsrvr.org",
    "rubiconproject.com", "pubmatic.com", "openx.net", "casalemedia.com", "criteo.com", "criteo.net",
    "taboola.com", "outbrain.com", "moatads.com", "amazon-adsystem.com", "serving-sys.com",
    "2mdn.net", "adform.net", "smartadserver.com", "media.net", "popads.net", "popcash.net",
    "propellerads.com", "adcolony.com", "applovin.com", "unity3d.com", "chartboost.com",
    "scorecardresearch.com", "quantserve.com", "bluekai.com", "exelator.com", "demdex.net",
    "ads.yahoo.com", "ad.doubleclick.net", "securepubads.g.doubleclick.net",
    // ad exchanges and bidders
    "advertising.com", "adroll.com", "bidswitch.net", "indexww.com", "3lift.com", "triplelift.com",
    "sharethrough.com", "teads.tv", "yieldmo.com", "smaato.net", "lijit.com", "sovrn.com",
    "gumgum.com", "33across.com", "contextweb.com", "spotxchange.com", "springserve.com",
    "onetag-sys.com", "mathtag.com", "turn.com", "adsymptotic.com", "everesttech.net",
    "revcontent.com", "mgid.com", "adskeeper.com", "zedo.com", "exoclick.com", "exosrv.com",
    "juicyads.com", "trafficjunky.net", "hilltopads.net", "adsafeprotected.com", "doubleverify.com",
    "googletagservices.com", "amazon-adsystem.com", "ads-twitter.com", "ads.linkedin.com",
    "bat.bing.com", "ads.pubmatic.com", "pixel.rubiconproject.com",
    // trackers and session recorders
    "google-analytics.com", "analytics.google.com", "rlcdn.com", "tapad.com", "crwdcntrl.net",
    "agkn.com", "krxd.net", "chartbeat.com", "chartbeat.net", "nr-data.net", "hotjar.com",
    "clarity.ms", "fullstory.com", "mouseflow.com", "crazyegg.com", "analytics.twitter.com",
    "analytics.tiktok.com", "px.ads.linkedin.com", "stats.wp.com", "pixel.wp.com",
    "sb.scorecardresearch.com", "mc.yandex.ru", "pixel.quantserve.com"
];
self.__nocAdblock = true;
self.addEventListener("message", function (event) {
    var data = event.data || {};
    if (data.type === "nocturne-adblock") self.__nocAdblock = !!data.on;
});

function __nocXorAlt(str) {
    var out = "";
    for (var i = 0; i < str.length; i++) out += i % 2 ? String.fromCharCode(str.charCodeAt(i) ^ 2) : str[i];
    return out;
}

var __NOC_AD_SET = Object.create(null);
for (var __nocAdI = 0; __nocAdI < __NOC_AD_HOSTS.length; __nocAdI++) __NOC_AD_SET[__NOC_AD_HOSTS[__nocAdI]] = 1;

function __nocAdHost(hostname) {
    var host = String(hostname || "").toLowerCase().replace(/\.+$/, "");
    while (host) {
        if (__NOC_AD_SET[host]) return true;
        var dot = host.indexOf(".");
        if (dot < 0) return false;
        host = host.slice(dot + 1);
    }
    return false;
}

function __nocProxiedHost(requestUrl) {
    var url;
    try { url = new URL(requestUrl); } catch (e) { return ""; }
    var hit = self.__nocDecodeProxyPath && self.__nocDecodeProxyPath(url.pathname);
    if (hit && hit.url) {
        try { return new URL(hit.url).hostname; } catch (e) { return ""; }
    }
    var path = url.pathname;
    var encoded = "";
    if (path.indexOf("/view/") === 0) encoded = path.slice(6);
    else return "";
    if (!encoded || encoded === "undefined") return "";
    var decoded = "";
    try {
        var cfg = self[atob("X19uZSRjb25maWc=")];
        if (cfg && typeof cfg.decodeUrl === "function") decoded = cfg.decodeUrl(encoded);
    } catch (e) {}
    if (!decoded || decoded === "undefined") {
        try { decoded = __nocXorAlt(decodeURIComponent(encoded)); } catch (e) { return ""; }
    }
    try { return new URL(decoded).hostname; } catch (e) { return ""; }
}

function __nocBlockedResponse() {
    return new Response("", { status: 202, statusText: "Blocked", headers: { "Content-Type": "text/plain", "Cache-Control": "no-store", "X-Nocturne-Adblock": "1" } });
}

// ---------------------------------------------------------------------------
// ublock-style engine. /app/adblock-engine.js (imported before this file) puts
// the Ghostery matcher on self.__nocAB; the compiled lists come from
// /app/adblock-rules.bin and are kept in Cache storage. Until they are loaded
// the short host list above is used, so nothing waits on the download.
var __nocAbState = { engine: null, v: "", loading: null, scriptlets: true, stats: { blocked: 0, redirected: 0, styled: 0, scripts: 0 }, hosts: Object.create(null) };
function __nocAbCount(url) {
    var h = "";
    try { h = new URL(url).hostname; } catch (e) { return; }
    var m = __nocAbState.hosts;
    if (m[h]) m[h]++;
    else if (Object.keys(m).length < 60) m[h] = 1;
}
var __NOC_AB_STORE = "nc-adblock-v1";
var __NOC_AB_KEY = self.location.origin + "/__nc/adblock/rules";
var __NOC_AB_CHECKED = self.location.origin + "/__nc/adblock/checked";
var __NOC_AB_RECHECK = 12 * 60 * 60 * 1000;   // look for new rules at most twice a day
var __NOC_AB_MIN_AGE = 3 * 24 * 60 * 60 * 1000; // and only download them when ours are 3+ days old

function __nocAbLoad() {
    if (__nocAbState.loading) return __nocAbState.loading;
    var AB = self.__nocAB;
    if (!AB || !AB.FiltersEngine) return (__nocAbState.loading = Promise.resolve(null));
    __nocAbState.loading = (async function () {
        var cache = await caches.open(__NOC_AB_STORE);
        var have = await cache.match(__NOC_AB_KEY);
        var at = 0;
        if (have) {
            try {
                __nocAbState.engine = AB.FiltersEngine.deserialize(new Uint8Array(await have.clone().arrayBuffer()));
                __nocAbState.v = have.headers.get("x-nc-v") || "";
                __nocAbState.scriptlets = have.headers.get("x-nc-scriptlets") !== "0";
                at = Number(have.headers.get("x-nc-at")) || 0;
            } catch (e) { __nocAbState.engine = null; }   // runtime upgraded: fetch a matching copy below
        }
        var checked = await cache.match(__NOC_AB_CHECKED);
        var lastCheck = checked ? Number(await checked.text()) || 0 : 0;
        var now = Date.now();
        if (__nocAbState.engine && now - lastCheck < __NOC_AB_RECHECK) return __nocAbState.engine;
        await cache.put(__NOC_AB_CHECKED, new Response(String(now)));
        var meta = await fetch("/app/adblock-rules.json", { cache: "no-cache" }).then(function (r) { return r.ok ? r.json() : null; });
        if (!meta || !meta.v) return __nocAbState.engine;
        __nocAbState.scriptlets = meta.scriptlets !== false;
        if (__nocAbState.engine && (meta.v === __nocAbState.v || now - at < __NOC_AB_MIN_AGE)) return __nocAbState.engine;
        var res = await fetch("/app/adblock-rules.bin?v=" + encodeURIComponent(meta.v));
        if (!res.ok) return __nocAbState.engine;
        var buf = new Uint8Array(await res.arrayBuffer());
        var fresh = AB.FiltersEngine.deserialize(buf);
        __nocAbState.engine = fresh;
        __nocAbState.v = meta.v;
        await cache.put(__NOC_AB_KEY, new Response(buf, { headers: {
            "content-type": "application/octet-stream", "x-nc-v": meta.v, "x-nc-at": String(now),
            "x-nc-scriptlets": __nocAbState.scriptlets ? "1" : "0"
        } }));
        return fresh;
    })().catch(function () { return __nocAbState.engine; });
    // A failed or finished load may be retried on a later worker start only.
    return __nocAbState.loading;
}
// Start loading as soon as the worker boots, not on the first proxied request.
try { setTimeout(__nocAbLoad, 0); } catch (e) {}

var __NOC_AB_TYPES = {
    script: "script", style: "stylesheet", image: "image", font: "font", iframe: "sub_frame", frame: "sub_frame",
    document: "sub_frame", audio: "media", video: "media", track: "media", object: "object", embed: "object",
    worker: "script", sharedworker: "script", serviceworker: "script", manifest: "other", report: "ping", "": "xmlhttprequest"
};

function __nocTargetOf(rawUrl) {
    if (!rawUrl) return "";
    try {
        var hit = self.__nocDecodeProxyPath && self.__nocDecodeProxyPath(new URL(rawUrl).pathname);
        return hit && hit.url ? hit.url : "";
    } catch (e) { return ""; }
}

// Navigations the user started (address bar, home links) come from the
// nocturne page itself, not from a proxied page. Those are never blocked.
function __nocIsTopNav(request) {
    var d = request.destination;
    if (d !== "document" && d !== "iframe" && d !== "frame") return false;
    return !__nocTargetOf(request.referrer);
}

function __nocMaybeBlock(request) {
    if (!self.__nocAdblock || !request) return null;
    var engine = __nocAbState.engine;
    if (!engine) {
        var host = __nocProxiedHost(request.url);
        if (!host || !__nocAdHost(host)) return null;
        if (__nocIsTopNav(request)) return null;
        __nocAbState.stats.blocked++;
        return __nocBlockedResponse();
    }
    if (__nocIsTopNav(request)) return null;
    var target = __nocTargetOf(request.url);
    if (!target || !/^https?:/i.test(target)) return null;
    var source = __nocTargetOf(request.referrer);
    var result;
    try {
        result = engine.match(self.__nocAB.Request.fromRawDetails({
            url: target,
            sourceUrl: source || target,
            type: __NOC_AB_TYPES[request.destination] || "other"
        }));
    } catch (e) { return null; }
    if (!result || !result.match) return null;
    __nocAbCount(target);
    if (result.redirect && result.redirect.dataUrl) {
        __nocAbState.stats.redirected++;
        // Swap the resource for uBlock's harmless stand-in (noop script, blank gif...)
        // so pages that expect the ad script to exist keep working.
        return fetch(result.redirect.dataUrl).then(function (r) {
            return new Response(r.body, { status: 200, headers: { "Content-Type": result.redirect.contentType.split(";")[0], "Cache-Control": "no-store", "X-Nocturne-Adblock": "1" } });
        }, function () { return __nocBlockedResponse(); });
    }
    __nocAbState.stats.blocked++;
    // Some ad players retry a blocked request in a tight loop, which costs the
    // page real work. After 20 blocks of one host within 10s, answer slowly.
    var hot = __nocAbHot(target);
    // Like uBlock: the request fails outright (sites see a network error, not an
    // empty "success" they then try to parse). Frames get an empty page instead
    // of the browser's error screen inside the ad slot.
    var d = request.destination;
    var out = (d === "iframe" || d === "frame" || d === "document") ? __nocBlockedResponse() : Response.error();
    if (!hot) return out;
    __nocAbState.stats.slowed = (__nocAbState.stats.slowed || 0) + 1;
    return new Promise(function (resolve) { setTimeout(function () { resolve(out); }, 3000); });
}

var __nocAbRecent = Object.create(null);
function __nocAbHot(url) {
    var h = "";
    try { h = new URL(url).hostname; } catch (e) { return false; }
    var now = Date.now();
    var r = __nocAbRecent[h];
    if (!r || now - r.t > 10000) { r = __nocAbRecent[h] = { t: now, n: 0 }; }
    r.n++;
    if (Object.keys(__nocAbRecent).length > 200) __nocAbRecent = Object.create(null);
    return r.n > 20;
}

// --- element hiding + scriptlets for proxied html ---------------------------
function __nocAscii(str, js) {
    return str.replace(/[^\x00-\x7e]/g, function (c) {
        var h = c.charCodeAt(0).toString(16);
        return js ? "\\u" + ("0000" + h).slice(-4) : "\\" + h + " ";
    });
}

function __nocCosmeticSnippet(target) {
    var engine = __nocAbState.engine;
    if (!engine || !self.__nocAdblock) return "";
    var req, out;
    try {
        req = self.__nocAB.Request.fromRawDetails({ url: target, type: "main_frame" });
        out = engine.getCosmeticsFilters({
            url: target, hostname: req.hostname, domain: req.domain || req.hostname,
            getBaseRules: true, getInjectionRules: __nocAbState.scriptlets, getExtendedRules: false,
            getRulesFromHostname: true, getRulesFromDOM: false
        });
    } catch (e) { return ""; }
    var style = "", script = "";
    if (out.styles) {
        __nocAbState.stats.styled++;
        style = "<style data-nc-ab>" + __nocAscii(out.styles.replace(/<\//g, "<\\/"), false) + "</style>";
    }
    if (out.scripts && out.scripts.length) {
        __nocAbState.stats.scripts += out.scripts.length;
        var code = out.scripts.map(function (s) { return "try{" + s + "\n}catch(e){}"; }).join("\n");
        script = "<script data-nc-ab>(function(){" + __nocAscii(code, true).replace(/<\/script/gi, "<\\/script") + "\n})();</script>";
    }
    return style || script ? { style: style, script: script } : null;
}

function __nocFind(buf, from, len, str) {
    outer: for (var i = from; i + str.length <= len; i++) {
        for (var j = 0; j < str.length; j++) if (buf[i + j] !== str.charCodeAt(j)) continue outer;
        return i;
    }
    return -1;
}

// The proxy's own startup scripts (marked _rt-injected) sit right after <head>;
// the last one carries a long data: url. Scriptlets must run after all of them,
// or the runtime is not set up yet. Returns the index just past the last one,
// or -1 when more of the page is needed to tell.
function __nocAfterRuntime(buf, from, len, final) {
    var at = from;
    while (true) {
        var i = at;
        while (i < len && (buf[i] === 32 || buf[i] === 9 || buf[i] === 10 || buf[i] === 13)) i++;
        if (i + 7 > len) return final ? at : -1;
        if (__nocFind(buf, i, i + 7, "<script") !== i) return at;
        var close = __nocFind(buf, i, len, ">");
        if (close < 0) return final ? at : -1;
        var marked = __nocFind(buf, i, close, "_rt-injected");
        if (marked < 0) return at;
        var end = __nocFind(buf, close, len, "</script>");
        if (end < 0) return final ? at : -1;
        at = end + 9;
    }
}

function __nocIndexOfTag(buf, len, tag) {
    // case-insensitive search for "<tag" followed by space, ">" or "/"; returns index after the closing ">"
    var n = tag.length;
    outer: for (var i = 0; i + n < len; i++) {
        if (buf[i] !== 60) continue;
        for (var j = 0; j < n; j++) {
            var c = buf[i + 1 + j];
            if (c >= 65 && c <= 90) c += 32;
            if (c !== tag.charCodeAt(j)) continue outer;
        }
        var after = buf[i + 1 + n];
        if (after !== 62 && after !== 32 && after !== 9 && after !== 10 && after !== 13 && after !== 47) continue;
        for (var k = i + 1 + n; k < len; k++) if (buf[k] === 62) return k + 1;
        return -1;
    }
    return -1;
}

// Takes the rewritten html response and adds the hiding styles (and scriptlets)
// right after <head>, without buffering the whole page.
function __nocCosmetic(request, response) {
    try {
        if (!self.__nocAdblock || !__nocAbState.engine || !response || !response.body) return response;
        var d = request.destination;
        if (d !== "document" && d !== "iframe" && d !== "frame") return response;
        if (response.status < 200 || response.status >= 300) return response;
        if (!/text\/html/i.test(response.headers.get("content-type") || "")) return response;
        var target = __nocTargetOf(request.url);
        if (!target) return response;
        var snippet = __nocCosmeticSnippet(target);
        if (!snippet) return response;
        var te = new TextEncoder();
        var addStyle = te.encode(snippet.style), addScript = te.encode(snippet.script);
        var pending = [], size = 0, done = false;
        var LIMIT = 262144;
        function join() {
            var all = new Uint8Array(size), at = 0;
            for (var i = 0; i < pending.length; i++) { all.set(pending[i], at); at += pending[i].length; }
            pending = [all];
            return all;
        }
        function emit(ctl, all, final) {
            var cut = __nocIndexOfTag(all, size, "head");
            if (cut < 0 && (size >= LIMIT || final)) cut = __nocIndexOfTag(all, size, "body");
            if (cut < 0 && (size >= LIMIT || final)) cut = __nocIndexOfTag(all, size, "html");
            if (cut < 0 && size < LIMIT && !final) return false;
            if (cut < 0) cut = 0;
            var after = addScript.length ? __nocAfterRuntime(all, cut, size, final || size >= LIMIT) : cut;
            if (after < 0) return false;
            done = true; pending = null;
            ctl.enqueue(all.subarray(0, cut));
            ctl.enqueue(addStyle);
            ctl.enqueue(all.subarray(cut, after));
            if (addScript.length) ctl.enqueue(addScript);
            ctl.enqueue(all.subarray(after));
            return true;
        }
        var ts = new TransformStream({
            transform: function (chunk, ctl) {
                if (done) return ctl.enqueue(chunk);
                pending.push(chunk); size += chunk.length;
                emit(ctl, join(), false);
            },
            flush: function (ctl) {
                if (done || !pending) return;
                emit(ctl, join(), true);
            }
        });
        var headers = new Headers(response.headers);
        headers.delete("content-length");
        return new Response(response.body.pipeThrough(ts), { status: response.status, statusText: response.statusText, headers: headers });
    } catch (e) { return response; }
}

self.addEventListener("message", function (event) {
    var data = event.data || {};
    if (data.type !== "nocturne-adblock-stats") return;
    try {
        event.source && event.source.postMessage({ type: "nocturne-adblock-stats", on: !!self.__nocAdblock, engine: !!__nocAbState.engine, v: __nocAbState.v, stats: __nocAbState.stats, hosts: __nocAbState.hosts });
    } catch (e) {}
});
