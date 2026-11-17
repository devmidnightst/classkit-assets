document.write("<script src=\"/src/js/lr2815.js?v=d820b1042c41\" defer></script><script src=\"/src/js/qt3674.js?v=a49a6f83ef18\" defer></script><script src=\"/src/js/wz6714.js?v=d42d663d8a96\" defer></script><script src=\"/src/js/ie7331.js?v=9ab35ff3c03e\" defer></script>");

(function () {
    var adToggle = document.getElementById("adblockToggle");
    try { adToggle.checked = localStorage.getItem("nocturne-adblock") !== "0"; } catch (e) { adToggle.checked = true; }
    adToggle.addEventListener("change", function () {
        try { localStorage.setItem("nocturne-adblock", adToggle.checked ? "1" : "0"); } catch (e) {}
        try {
            if (navigator.serviceWorker && navigator.serviceWorker.controller) {
                navigator.serviceWorker.controller.postMessage({ type: "nocturne-adblock", on: adToggle.checked });
            }
        } catch (e) {}
    });

    var pcToggle = document.getElementById("proxyCacheToggle");
    if (pcToggle) {
        try { pcToggle.checked = localStorage.getItem("nocturne-proxy-cache") !== "0"; } catch (e) { pcToggle.checked = true; }
        pcToggle.addEventListener("change", function () {
            try { localStorage.setItem("nocturne-proxy-cache", pcToggle.checked ? "1" : "0"); } catch (e) {}
            try {
                if (navigator.serviceWorker && navigator.serviceWorker.controller) {
                    navigator.serviceWorker.controller.postMessage({ type: "nocturne-proxy-cache", on: pcToggle.checked });
                }
            } catch (e) {}
        });
    }

    var pillar = document.getElementById("pillarMode");
    function pillarNow() {
        var m = "full";
        try { m = localStorage.getItem("nocturne-pillar") || (localStorage.getItem("nocturne-bgfx") === "0" ? "off" : "full"); } catch (e) {}
        if (m !== "full" && m !== "reduced" && m !== "mesh" && m !== "off") m = "full";
        return m;
    }
    pillar.value = pillarNow();
    pillar.addEventListener("change", function () {
        var m = pillar.value;
        try {
            localStorage.setItem("nocturne-pillar", m);
            localStorage.setItem("nocturne-bgfx", m === "off" ? "0" : "1");
        } catch (e) {}
        var fx = document.getElementById("fxToggle");
        if (fx) fx.checked = m !== "off";
        location.reload();
    });
})();

// Layout: scroll-spy nav with a sliding indicator, eased jumps, sections that rise in
// as they scroll into view, and a filter box. Everything still works without motion.
(function () {
    var scroller = document.getElementById("stScroll");
    var topbar = document.getElementById("stTopbar");
    var list = document.querySelector(".st-nav-list");
    var ind = document.getElementById("stNavInd");
    var crumb = document.getElementById("stCrumb");
    var progress = document.getElementById("stProgress");
    var links = [].slice.call(document.querySelectorAll(".st-nav-link"));
    var sections = [].slice.call(document.querySelectorAll(".st-section"));
    var root = document.documentElement;

    function reduced() {
        if (root.classList.contains("reduce-motion") || root.classList.contains("perf-min")) return true;
        try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { return false; }
    }

    document.body.classList.add("st-js");

    // reveal on scroll
    if (reduced() || !("IntersectionObserver" in window)) {
        sections.forEach(function (s) { s.classList.add("in"); });
    } else {
        var io = new IntersectionObserver(function (entries) {
            entries.forEach(function (en) {
                if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); }
            });
        }, { root: scroller, rootMargin: "0px 0px -8% 0px", threshold: 0.04 });
        sections.forEach(function (s, i) { s.style.setProperty("--st-i", i); io.observe(s); });
    }

    // pinned: the section a nav click asked for. It stays highlighted even when the
    // page bottoms out before that section reaches the top, until the user scrolls.
    var current = null, lockUntil = 0, pinned = null;
    function placeIndicator(link) {
        if (!link || !ind) return;
        ind.style.setProperty("--x", link.offsetLeft + "px");
        ind.style.setProperty("--y", link.offsetTop + "px");
        ind.style.setProperty("--w", link.offsetWidth + "px");
        ind.style.setProperty("--h", link.offsetHeight + "px");
        ind.classList.add("on");
    }
    function setActive(id) {
        if (id === current) return;
        current = id;
        var link = null;
        links.forEach(function (l) {
            var on = l.getAttribute("data-target") === id;
            l.classList.toggle("active", on);
            if (on) { l.setAttribute("aria-current", "true"); link = l; } else l.removeAttribute("aria-current");
        });
        placeIndicator(link);
        var sec = document.getElementById(id);
        if (crumb && sec) crumb.textContent = sec.getAttribute("data-title") || "";
        // phones: keep the active tab visible in the horizontal strip
        if (link && list.scrollWidth > list.clientWidth + 1) {
            var left = link.offsetLeft - (list.clientWidth - link.offsetWidth) / 2;
            try { list.scrollTo({ left: left, behavior: reduced() ? "auto" : "smooth" }); } catch (e) { list.scrollLeft = left; }
        }
    }

    function offset() { return topbar.offsetHeight + 18; }
    function visibleSections() { return sections.filter(function (s) { return !s.hidden; }); }

    function spy() {
        var top = scroller.scrollTop, max = scroller.scrollHeight - scroller.clientHeight;
        if (progress) progress.style.transform = "scaleX(" + (max > 0 ? Math.min(1, top / max) : 0) + ")";
        topbar.classList.toggle("scrolled", top > 4);
        if (Date.now() < lockUntil) return;
        if (pinned) { setActive(pinned); return; }
        var vis = visibleSections();
        if (!vis.length) return;
        var pick = vis[0];
        if (max > 0 && top >= max - 2) pick = vis[vis.length - 1];
        else {
            var line = top + offset() + scroller.clientHeight * 0.25;
            vis.forEach(function (s) { if (s.offsetTop <= line) pick = s; });
        }
        setActive(pick.id);
    }
    var ticking = false;
    scroller.addEventListener("scroll", function () {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(function () { ticking = false; spy(); });
    }, { passive: true });

    var anim = 0;
    function ease(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
    function scrollToSection(sec) {
        var max = scroller.scrollHeight - scroller.clientHeight;
        var first = visibleSections()[0] === sec;
        var to = first ? 0 : Math.max(0, Math.min(max, sec.offsetTop - offset()));
        var from = scroller.scrollTop, dist = to - from;
        cancelAnimationFrame(anim);
        pinned = sec.id;
        setActive(sec.id);
        if (reduced() || Math.abs(dist) < 2) { scroller.scrollTop = to; return; }
        var dur = Math.min(720, Math.max(320, Math.abs(dist) * 0.45)), t0 = performance.now();
        lockUntil = Date.now() + dur + 80;
        (function step(now) {
            var t = Math.min(1, (now - t0) / dur);
            scroller.scrollTop = from + dist * ease(t);
            if (t < 1) anim = requestAnimationFrame(step);
        })(t0);
    }
    // a wheel or touch takes over from a running jump
    function release() { cancelAnimationFrame(anim); lockUntil = 0; pinned = null; }
    ["wheel", "touchstart"].forEach(function (ev) { scroller.addEventListener(ev, release, { passive: true }); });
    // dragging the scrollbar itself
    scroller.addEventListener("mousedown", function (e) { if (e.target === scroller) release(); });
    document.addEventListener("keydown", function (e) {
        if (/^(Arrow(Up|Down)|Page(Up|Down)|Home|End| )$/.test(e.key) && !/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) release();
    });

    links.forEach(function (l) {
        l.addEventListener("click", function (e) {
            e.preventDefault();
            var sec = document.getElementById(l.getAttribute("data-target"));
            if (sec && !sec.hidden) scrollToSection(sec);
        });
    });

    // filter
    var search = document.getElementById("stSearch");
    var empty = document.getElementById("stEmpty");
    var emptyQ = document.getElementById("stEmptyQ");
    var rows = [].slice.call(document.querySelectorAll(".st-row"));
    rows.forEach(function (r) {
        r._hay = (r.textContent + " " + (r.getAttribute("data-keys") || "")).toLowerCase().replace(/\s+/g, " ");
    });
    function filter() {
        var q = search.value.trim().toLowerCase();
        var words = q ? q.split(/\s+/) : [];
        var any = false;
        rows.forEach(function (r) {
            var hit = words.every(function (w) { return r._hay.indexOf(w) !== -1; });
            r.hidden = !hit;
        });
        sections.forEach(function (s) {
            var has = !!s.querySelector(".st-row:not([hidden])");
            s.hidden = !has;
            if (has) { any = true; s.classList.add("in"); }
            var link = document.querySelector('.st-nav-link[data-target="' + s.id + '"]');
            if (link) link.classList.toggle("dim", !has);
        });
        document.body.classList.toggle("st-filtering", !!q);
        empty.hidden = any;
        emptyQ.textContent = q;
        current = null;
        pinned = null;
        scroller.scrollTop = 0;
        spy();
    }
    search.addEventListener("input", filter);
    search.addEventListener("keydown", function (e) {
        if (e.key === "Escape" && search.value) { e.stopPropagation(); search.value = ""; filter(); }
    });
    document.addEventListener("keydown", function (e) {
        if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey) return;
        var t = e.target, tag = t && t.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (t && t.isContentEditable)) return;
        e.preventDefault();
        search.focus();
    });

    window.addEventListener("resize", function () {
        var link = document.querySelector(".st-nav-link.active");
        placeIndicator(link);
    });
    setActive(sections[0].id);
    spy();
    // let the indicator glide only after its first placement
    requestAnimationFrame(function () { requestAnimationFrame(function () { list.classList.add("ready"); }); });
    // fonts can shift link sizes after first paint
    try { document.fonts && document.fonts.ready.then(function () { placeIndicator(document.querySelector(".st-nav-link.active")); }); } catch (e) {}
})();

;
document.write("<script src=\"/src/js/nk1873.js?v=3de25f4af19a\" defer></script><script src=\"/src/js/pu3927.js?v=20260929-2\" defer></script><script src=\"/src/js/gd4170.js?v=679513e5c4c4\" defer></script><script src=\"/src/js/email-nudge.js?v=1\" defer></script>");