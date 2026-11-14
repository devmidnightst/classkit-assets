// Blocks common ad hosts inside proxied pages. First-party app requests are ignored.
var __NOC_AD_HOSTS = [
    "doubleclick.net", "googlesyndication.com", "googleadservices.com", "googleads.g.doubleclick.net",
    "adservice.google.com", "pagead2.googlesyndication.com", "adnxs.com", "adsrvr.org",
    "rubiconproject.com", "pubmatic.com", "openx.net", "casalemedia.com", "criteo.com", "criteo.net",
    "taboola.com", "outbrain.com", "moatads.com", "amazon-adsystem.com", "serving-sys.com",
    "2mdn.net", "adform.net", "smartadserver.com", "media.net", "popads.net", "popcash.net",
    "propellerads.com", "adcolony.com", "applovin.com", "unity3d.com", "chartboost.com",
    "scorecardresearch.com", "quantserve.com", "bluekai.com", "exelator.com", "demdex.net",
    "ads.yahoo.com", "ad.doubleclick.net", "securepubads.g.doubleclick.net"
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

function __nocMaybeBlock(request) {
    if (!self.__nocAdblock || !request) return null;
    var host = __nocProxiedHost(request.url);
    if (!host || !__nocAdHost(host)) return null;
    return __nocBlockedResponse();
}
