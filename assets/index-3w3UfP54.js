document.write("<script src=\"/cap.js\" defer></script><script src=\"/src/js/lr2815.js?v=d820b1042c41\" defer></script><script src=\"/src/js/az4417.js?v=7\"></script>");

(function () {
    var card = document.getElementById("upgradeCard");
    var view = document.getElementById("accountView");
    var form = document.getElementById("upgradeForm");
    var msg = document.getElementById("upgradeMsg");
    if (!card || !view) return;
    function headers() {
        var h = { Accept: "application/json" };
        try {
            var t = localStorage.getItem("noc-session") || "";
            if (t) h["X-Noc-Session"] = t;
        } catch (e) {}
        return h;
    }
    function paint(user) {
        if (!user) { card.classList.add("hidden"); return; }
        card.classList.remove("hidden");
        var input = document.getElementById("upgradeName");
        input.value = user.username || "";
        if (user.paid) {
            card.classList.add("is-on");
            document.getElementById("upgradeKicker").textContent = "Lifetime";
            document.getElementById("upgradeTitle").textContent = "Upgrade is on";
            document.getElementById("upgradeBlurb").textContent = "This account has the lifetime upgrade.";
            return;
        }
        card.classList.remove("is-on");
        document.getElementById("upgradeTitle").textContent = "Upgrade for $5";
        document.getElementById("upgradeBlurb").textContent = "One payment. It stays on the account.";
        if (user.upgrade === "pending") {
            form.classList.add("hidden");
            msg.textContent = "Submitted. It is in review, then the upgrade is turned on for this account.";
        } else {
            form.classList.remove("hidden");
            msg.textContent = "";
        }
    }
    function tick() {
        if (view.classList.contains("hidden")) return;
        fetch("/api/auth/me", { credentials: "same-origin", cache: "no-store", headers: headers() })
            .then(function (r) { return r.json(); })
            .then(function (d) { if (d && d.authenticated) paint(d.user); })
            .catch(function () {});
    }
    new MutationObserver(tick).observe(view, { attributes: true, attributeFilter: ["class"] });
    tick();
    form.addEventListener("submit", function (ev) {
        ev.preventDefault();
        msg.textContent = "Sending…";
        var h = headers();
        h["Content-Type"] = "application/json";
        fetch("/api/upgrade/request", {
            method: "POST",
            credentials: "same-origin",
            cache: "no-store",
            headers: h,
            body: JSON.stringify({ username: document.getElementById("upgradeName").value })
        }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
            .then(function (res) {
                if (!res.ok) { msg.textContent = (res.d && res.d.error) || "Could not submit."; return; }
                if (res.d.status === "active" || res.d.status === "approved") {
                    msg.textContent = "This account already has the upgrade.";
                    tick();
                    return;
                }
                form.classList.add("hidden");
                msg.textContent = "Submitted. It is in review, then the upgrade is turned on for this account.";
            }).catch(function () { msg.textContent = "Could not submit."; });
    });
})();

;
document.write("<script src=\"/src/js/pu3927.js?v=20260929-2\" defer></script><script src=\"/src/js/gd4170.js?v=679513e5c4c4\" defer></script><script src=\"/src/js/wz6714.js?v=d42d663d8a96\" defer></script>");