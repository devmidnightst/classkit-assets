// Keeps proxied site files in Cache storage so a repeat visit skips work:
//  - images and fonts: the raw bytes, so they are not pulled through the tunnel again
//  - scripts and styles: the already-rewritten output, so the page (which does the
//    fetching, TLS and rewriting on its main thread) skips all of that on a hit.
//    Rewritten output that mentions this session's proxy prefix is stored with the
//    prefix swapped for a placeholder and swapped back on the way out; anything
//    that still carries session ids after that is not stored at all.
//    The store name carries the rewriter version, so upgrades start clean.
// Pages (html) are never stored. Stale entries with an ETag/Last-Modified are
// revalidated with a conditional request instead of being fetched again.
// Also remembers the on/off switches (this one and the ad blocker) across
// worker restarts, which a worker cannot read from localStorage.
(function (g) {
    var STORE = "nc-site-files-v1";
    var PREFS = "nc-prefs-v1";
    var PREF_URL = g.location.origin + "/__nc/prefs";
    var MAX_ENTRIES = 1500;
    var MAX_BYTES = 4 * 1024 * 1024;
    var MAX_TTL = 7 * 24 * 60 * 60;
    var HEURISTIC_TTL = 60 * 60;
    var KINDS = { image: 1, font: 1 };
    var RW_KINDS = { script: 1, style: 1 };
    var RW_STORE = "nc-rw-" + (g.__nocRwV || "0");
    var RW_MAX_ENTRIES = 4000;   // discord alone is ~1100 files; a smaller cap thrashed (FIFO trim)
    // discord's main bundle (web.*.js) is ~12.8MB raw and larger once rewritten.
    // At 8MB it was never kept, so every visit re-downloaded and re-rewrote it
    // on the page's main thread before discord could draw (the white page).
    var RW_MAX_BYTES = 48 * 1024 * 1024;
    var P_ORIGIN = "__nc_pfx_o_7f3a__";
    var P_PATH = "__nc_pfx_p_7f3a__";

    g.__nocCache = true;
    var stats = { hit: 0, miss: 0, stored: 0, rwHit: 0, rwMiss: 0, rwStored: 0, rwRevalidated: 0, rwSkipped: 0 };
    var puts = 0, rwPuts = 0;
    var storeP = null, rwP = null;
    function open() { return storeP || (storeP = caches.open(STORE).catch(function (e) { storeP = null; throw e; })); }
    function openRw() {
        if (rwP) return rwP;
        rwP = caches.keys().then(function (names) {
            // Drop rewritten copies made by an older rewriter.
            return Promise.all(names.filter(function (n) { return n.indexOf("nc-rw-") === 0 && n !== RW_STORE; }).map(function (n) { return caches.delete(n); }));
        }).catch(function () {}).then(function () { return caches.open(RW_STORE); });
        rwP.catch(function () { rwP = null; });
        return rwP;
    }

    function savePrefs() {
        var body = JSON.stringify({ adblock: g.__nocAdblock !== false, cache: !!g.__nocCache });
        return caches.open(PREFS).then(function (c) {
            return c.put(PREF_URL, new Response(body, { headers: { "content-type": "application/json" } }));
        }).catch(function () {});
    }
    var prefsReady = caches.open(PREFS).then(function (c) { return c.match(PREF_URL); }).then(function (r) {
        return r ? r.json() : null;
    }).then(function (p) {
        if (!p) return;
        if (typeof p.adblock === "boolean") g.__nocAdblock = p.adblock;
        if (typeof p.cache === "boolean") g.__nocCache = p.cache;
    }).catch(function () {});

    g.addEventListener("message", function (event) {
        var data = event.data || {};
        var work = null;
        if (data.type === "nocturne-proxy-cache") {
            g.__nocCache = !!data.on;
            work = savePrefs();
            if (!g.__nocCache) { storeP = null; rwP = null; work = work.then(function () { return Promise.all([caches.delete(STORE), caches.delete(RW_STORE)]); }); }
        } else if (data.type === "nocturne-adblock") {
            // adblock.js has already flipped the flag; this only persists it.
            g.__nocAdblock = !!data.on;
            work = savePrefs();
        } else if (data.type === "nocturne-proxy-cache-clear") {
            storeP = null; rwP = null;
            work = Promise.all([caches.delete(STORE), caches.delete(RW_STORE)]);
        } else if (data.type === "nocturne-proxy-cache-stats") {
            try { event.source && event.source.postMessage({ type: "nocturne-proxy-cache-stats", stats: stats, on: !!g.__nocCache }); } catch (e) {}
        }
        if (work && event.waitUntil) event.waitUntil(work.catch(function () {}));
    });

    // Returns { key, rw, prefix } for a cacheable request, or null.
    function keyFor(request) {
        if (request.method !== "GET") return null;
        var rw = !!RW_KINDS[request.destination];
        if (!rw && !KINDS[request.destination]) return null;
        if (request.headers.get("range")) return null;
        if (request.cache === "no-store" || request.cache === "reload") return null;
        var hit;
        try { hit = g.__nocDecodeProxyPath && g.__nocDecodeProxyPath(new URL(request.url).pathname); } catch (e) { return null; }
        if (!hit || !hit.url || !/^https?:\/\//i.test(hit.url)) return null;
        // The key is the target address in the same opaque form the proxy path uses.
        var key = g.location.origin + (rw ? "/__nc/rw/" + request.destination + "/" : "/__nc/f/") + g.__nocEncodePayload(hit.url);
        return { key: key, rw: rw, prefix: hit.prefix || "" };
    }

    // Seconds this response may be reused, or 0 when it should not be stored.
    // For rewritten files (rw) a response that may not be reused fresh but has a
    // validator is still stored, with lifetime -1 (= revalidate before use).
    function lifetime(res, rw) {
        if (res.status !== 200 || res.type === "opaque" || res.type === "error") return 0;
        var h = res.headers;
        var cc = (h.get("cache-control") || "").toLowerCase();
        if (/no-store/.test(cc)) return 0;
        if ((h.get("vary") || "").indexOf("*") !== -1) return 0;
        var validator = !!(h.get("etag") || h.get("last-modified"));
        if (rw) {
            if (/no-cache/.test(cc)) return validator ? -1 : 0;
        } else if (/no-cache|private/.test(cc)) return 0;
        if ((h.get("vary") || "").indexOf("*") !== -1) return 0;
        var ttl = 0;
        var m = /(?:^|[\s,])max-age\s*=\s*(\d+)/.exec(cc);
        if (m) ttl = Number(m[1]);
        else if (h.get("expires")) ttl = Math.floor((Date.parse(h.get("expires")) - Date.now()) / 1000) || 0;
        else if (h.get("etag") || h.get("last-modified")) ttl = HEURISTIC_TTL;
        ttl -= Number(h.get("age")) || 0;
        if (!(ttl >= 60)) return rw && validator ? -1 : 0;
        if (!rw) {
            var len = Number(h.get("content-length")) || 0;
            if (len > MAX_BYTES) return 0;
        }
        return Math.min(ttl, MAX_TTL);
    }

    // Reads the copy with a hard cap, so an unlabelled huge body is dropped, not buffered.
    function readCapped(res, cap) {
        cap = cap || MAX_BYTES;
        if (!res.body) return res.arrayBuffer();
        var reader = res.body.getReader();
        var parts = [];
        var total = 0;
        function step() {
            return reader.read().then(function (r) {
                if (r.done) {
                    var out = new Uint8Array(total);
                    var at = 0;
                    for (var i = 0; i < parts.length; i++) { out.set(parts[i], at); at += parts[i].length; }
                    return out.buffer;
                }
                total += r.value.length;
                if (total > cap) { try { reader.cancel(); } catch (e) {} return null; }
                parts.push(r.value);
                return step();
            });
        }
        return step();
    }

    function trim(cache, max) {
        max = max || MAX_ENTRIES;
        return cache.keys().then(function (keys) {
            var extra = keys.length - max;
            if (extra <= 0) return;
            var drop = keys.slice(0, extra + 100);   // keys() is oldest first
            return Promise.all(drop.map(function (k) { return cache.delete(k); }));
        });
    }

    function store(cache, key, res, ttl) {
        var copy = res.clone();
        return readCapped(copy).then(function (buf) {
            if (!buf || !buf.byteLength) return;
            var headers = new Headers(copy.headers);
            headers.set("x-nc-exp", String(Date.now() + ttl * 1000));
            return cache.put(key, new Response(buf, { status: 200, statusText: copy.statusText || "OK", headers: headers })).then(function () {
                stats.stored++;
                if (++puts % 50 === 0) return trim(cache);
            });
        }).catch(function () {});
    }

    function split(s, part) { return s.split(part).join(""); }
    function sessionIds(prefix) {
        // "/c/<controller>/<frame>/" -> ["<controller>", "<frame>"]
        return String(prefix || "").split("/").filter(function (x, i) { return x && i >= 2; });
    }

    // Rewritten bodies are text. The session prefix is swapped for placeholders;
    // if a session id is still in there afterwards, the copy is not kept.
    function storeRw(cache, key, res, ttl, prefix) {
        var copy = res.clone();
        return readCapped(copy, RW_MAX_BYTES).then(function (buf) {
            if (!buf || !buf.byteLength) { stats.rwSkipped++; return; }
            var text = new TextDecoder().decode(buf);
            var sub = false;
            if (prefix) {
                var ids = sessionIds(prefix);
                var full = g.location.origin + prefix;
                if (text.indexOf(full) !== -1) { text = text.split(full).join(P_ORIGIN); sub = true; }
                if (text.indexOf(prefix) !== -1) { text = text.split(prefix).join(P_PATH); sub = true; }
                for (var i = 0; i < ids.length; i++) if (ids[i].length >= 6 && text.indexOf(ids[i]) !== -1) { stats.rwSkipped++; return; }
            }
            var headers = new Headers(copy.headers);
            headers.delete("content-length");
            headers.delete("content-encoding");
            headers.set("x-nc-exp", String(ttl > 0 ? Date.now() + ttl * 1000 : 0));
            headers.set("x-nc-sub", sub ? "1" : "0");
            return cache.put(key, new Response(sub ? text : buf, { status: 200, statusText: copy.statusText || "OK", headers: headers })).then(function () {
                stats.rwStored++;
                if (++rwPuts % 40 === 0) return trim(cache, RW_MAX_ENTRIES);
            });
        }).catch(function () {});
    }

    // Builds the response handed to the page from a stored rewritten copy.
    function replayRw(hit, prefix) {
        var headers = new Headers(hit.headers);
        headers.delete("x-nc-exp"); headers.delete("x-nc-sub");
        if (hit.headers.get("x-nc-sub") !== "1") return new Response(hit.body, { status: 200, statusText: hit.statusText || "OK", headers: headers });
        return hit.text().then(function (text) {
            text = text.split(P_ORIGIN).join(g.location.origin + prefix).split(P_PATH).join(prefix);
            return new Response(text, { status: 200, statusText: hit.statusText || "OK", headers: headers });
        });
    }

    // The same request with If-None-Match / If-Modified-Since added. route() only
    // reads these fields, and a real Request in no-cors mode would drop the headers.
    function conditional(event, hit) {
        var req = event.request;
        var headers = new Headers(req.headers);
        var etag = hit.headers.get("etag"), lm = hit.headers.get("last-modified");
        if (etag) headers.set("if-none-match", etag);
        if (lm) headers.set("if-modified-since", lm);
        return {
            request: { url: req.url, referrer: req.referrer, destination: req.destination, mode: req.mode, method: req.method, body: null, cache: req.cache, headers: headers },
            clientId: event.clientId, resultingClientId: event.resultingClientId,
            waitUntil: function (p) { try { event.waitUntil(p); } catch (e) {} }
        };
    }

    function routeRw(event, route, k) {
        return openRw().then(function (cache) {
            return cache.match(k.key).then(function (hit) {
                if (hit && Number(hit.headers.get("x-nc-exp")) > Date.now()) { stats.rwHit++; return replayRw(hit, k.prefix); }
                var revalidate = hit && (hit.headers.get("etag") || hit.headers.get("last-modified"));
                return route(revalidate ? conditional(event, hit) : event).then(function (res) {
                    if (revalidate && res.status === 304) {
                        stats.rwRevalidated++;
                        var ttl = 0;
                        try { ttl = lifetime(new Response(null, { status: 200, headers: res.headers }), true); } catch (e) {}
                        var fresh = new Headers(hit.headers);
                        fresh.set("x-nc-exp", String(ttl > 0 ? Date.now() + ttl * 1000 : 0));
                        var keep = hit.clone();
                        var job = keep.arrayBuffer().then(function (b) { return cache.put(k.key, new Response(b, { status: 200, statusText: keep.statusText || "OK", headers: fresh })); }).catch(function () {});
                        try { event.waitUntil(job); } catch (e) {}
                        return replayRw(hit, k.prefix);
                    }
                    stats.rwMiss++;
                    var life = 0;
                    try { life = lifetime(res, true); } catch (e) {}
                    if (life) {
                        var job2 = storeRw(cache, k.key, res, life, k.prefix);
                        try { event.waitUntil(job2); } catch (e) {}
                    } else if (hit) cache.delete(k.key);
                    return res;
                });
            });
        }, function () { return route(event); });
    }

    // Drop-in for $_rc.route(event).
    g.__nocCachedRoute = function (event, route) {
        return prefsReady.then(function () {
            var k = g.__nocCache ? keyFor(event.request) : null;
            if (!k) return route(event);
            if (k.rw) return routeRw(event, route, k);
            return open().then(function (cache) {
                return cache.match(k.key).then(function (hit) {
                    if (hit) {
                        if (Number(hit.headers.get("x-nc-exp")) > Date.now()) { stats.hit++; return hit; }
                        cache.delete(k.key);
                    }
                    return route(event).then(function (res) {
                        stats.miss++;
                        var ttl = 0;
                        try { ttl = lifetime(res, false); } catch (e) {}
                        if (ttl > 0) {
                            var job = store(cache, k.key, res, ttl);
                            try { event.waitUntil(job); } catch (e) {}
                        }
                        return res;
                    });
                });
            }, function () { return route(event); });
        });
    };
})(self);
