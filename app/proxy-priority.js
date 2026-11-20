// Priority queue for proxied requests (experimental engine service worker).
//
// Every file a proxied page loads goes through one tunnel socket and is fetched,
// decrypted and rewritten on the page's main thread. Nothing orders that work, so
// on a slow link a page's images, video and fonts split the bandwidth evenly with
// the html/css/js/api calls the page needs before it can draw anything.
//
// This holds back low-priority requests while render-critical ones are running:
//   high  (never held): pages, frames, scripts, styles, workers, fetch/xhr
//   mid   (lightly held): fonts
//   low   (held): images, audio, video, tracks, embeds, everything else
// A held request still goes out after a short wait, so nothing starves, and the
// limits are tighter when the visitor's connection reports as slow.
// Cache hits and blocked requests never reach this (they answer before route()).
(function (g) {
    var HIGH = { "": 1, document: 1, iframe: 1, frame: 1, style: 1, script: 1, worker: 1, sharedworker: 1, serviceworker: 1, manifest: 1, xslt: 1, json: 1 };
    var MID = { font: 1 };
    var HOLD_MS = 20000;       // a slot is never kept longer than this (long media streams)
    var GRACE_MS = 150;        // pages discover the next script right after one finishes

    if (typeof g.__nocPriority !== "boolean") g.__nocPriority = true;
    var stats = { high: 0, mid: 0, low: 0, held: 0, forced: 0, aborted: 0, waitMs: 0, maxWaitMs: 0, slow: false };
    var active = [0, 0, 0];
    var queue = [];
    var lastHigh = 0;
    var timer = null;

    function classOf(req) {
        if (req.mode === "navigate") return 0;
        var d = req.destination || "";
        if (HIGH[d]) return 0;
        if (MID[d]) return 1;
        return 2;
    }

    // navigator.connection is the visitor's own link; saveData counts as slow.
    function isSlow() {
        var c = g.navigator && g.navigator.connection;
        if (!c) return false;
        if (c.saveData) return true;
        if (/2g|3g/.test(c.effectiveType || "")) return true;
        return typeof c.downlink === "number" && c.downlink > 0 && c.downlink < 5;
    }

    // [unused, mid cap, low cap, max wait]
    function limits(now) {
        var slow = isSlow();
        stats.slow = slow;
        var busy = active[0] > 0 || now - lastHigh < GRACE_MS;
        if (busy) return slow ? [0, 2, 1, 8000] : [0, 4, 4, 3000];
        return slow ? [0, 6, 4, 8000] : [0, Infinity, Infinity, 3000];
    }

    function schedule(ms) {
        if (timer) return;
        timer = setTimeout(function () { timer = null; pump(); }, Math.max(10, ms));
    }

    function pump() {
        if (!queue.length) return;
        var now = Date.now();
        var lim = limits(now);
        var next = Infinity;
        for (var i = 0; i < queue.length; i++) {
            var it = queue[i];
            var waited = now - it.at;
            var forced = waited >= lim[3];
            if (active[it.cls] < lim[it.cls] || forced) {
                queue.splice(i--, 1);
                if (forced) stats.forced++;
                stats.waitMs += waited;
                if (waited > stats.maxWaitMs) stats.maxWaitMs = waited;
                start(it);
            } else {
                next = Math.min(next, lim[3] - waited);
            }
        }
        if (queue.length) {
            // Re-check after the grace window (high work may have finished) or the next deadline.
            schedule(active[0] === 0 ? Math.min(next, GRACE_MS) : next);
        }
    }

    // Keeps the slot until the body has been read (or cancelled), so a held
    // request really waits for the bandwidth, not just for the headers.
    function hold(res, done) {
        var released = false;
        var cap = setTimeout(rel, HOLD_MS);
        function rel() { if (released) return; released = true; clearTimeout(cap); done(); }
        // Null-body statuses (and non-constructible ones like 0) cannot be re-wrapped.
        if (!res || !res.body || res.status < 200 || res.status === 204 || res.status === 205 || res.status === 304 || typeof ReadableStream !== "function") { rel(); return res; }
        var reader = res.body.getReader();
        var body = new ReadableStream({
            pull: function (c) {
                return reader.read().then(function (r) {
                    if (r.done) { rel(); c.close(); } else c.enqueue(r.value);
                }, function (e) { rel(); c.error(e); });
            },
            cancel: function (why) { rel(); return reader.cancel(why); },
        });
        return new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers });
    }

    function start(it) {
        var aborted = it.signal && it.signal.aborted;
        if (aborted) { stats.aborted++; it.resolve(Response.error()); pump(); return; }
        active[it.cls]++;
        var done = function () {
            active[it.cls]--;
            if (it.cls === 0) lastHigh = Date.now();
            pump();
        };
        var p;
        try { p = Promise.resolve(it.run()); } catch (e) { p = Promise.reject(e); }
        p.then(function (res) { it.resolve(hold(res, done)); }, function (e) { done(); it.reject(e); });
    }

    // Drop-in around $_rc.route(event): __nocPrioritize(event, () => $_rc.route(event)).
    g.__nocPrioritize = function (event, run) {
        var req = event.request || {};
        var cls = classOf(req);
        stats[cls === 0 ? "high" : cls === 1 ? "mid" : "low"]++;
        if (!g.__nocPriority) return run();
        return new Promise(function (resolve, reject) {
            var it = { cls: cls, at: Date.now(), run: run, resolve: resolve, reject: reject, signal: req.signal };
            if (cls === 0) { start(it); return; }
            var lim = limits(it.at);
            if (!queue.length && active[cls] < lim[cls]) { start(it); return; }
            stats.held++;
            queue.push(it);
            pump();
        });
    };

    g.__nocPriorityState = function () { return { active: active.slice(), queued: queue.length, stats: stats }; };

    if (g.addEventListener) g.addEventListener("message", function (event) {
        var data = event.data || {};
        if (data.type === "nocturne-priority") {
            g.__nocPriority = !!data.on;
            if (!g.__nocPriority) { var q = queue.splice(0); for (var i = 0; i < q.length; i++) start(q[i]); }
        } else if (data.type === "nocturne-priority-stats") {
            try { event.source && event.source.postMessage({ type: "nocturne-priority-stats", stats: stats, active: active.slice(), queued: queue.length, on: !!g.__nocPriority }); } catch (e) {}
        }
    });
})(self);
