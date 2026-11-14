document.write("<script src=\"/src/js/lr2815.js\" defer></script><script src=\"/src/js/rb8350.js?v=20261020-1\"></script>");

(function () {
    var h = { Accept: "application/json" };
    try { var t = localStorage.getItem("noc-session") || ""; if (t) h["X-Noc-Session"] = t; } catch (e) {}
    fetch("/api/auth/me", { credentials: "same-origin", cache: "no-store", headers: h })
        .then(function (r) { return r.json(); })
        .then(function (d) {
            if (!d || !d.user || !d.user.paid) return;
            var b = document.getElementById("gifBtn");
            if (b) b.hidden = false;
        }).catch(function () {});
})();

;
document.write("<script src=\"/src/js/qt3674.js\" defer></script><script src=\"/src/js/pu3927.js?v=20260929-2\" defer></script><script src=\"/src/js/gd4170.js\" defer></script><script src=\"/src/js/email-nudge.js?v=1\" defer></script><script src=\"/src/js/wz6714.js\" defer></script>");