document.write("<script src=\"/src/js/lr2815.js?v=d820b1042c41\" defer></script><script src=\"/src/js/wz6714.js?v=d42d663d8a96\" defer></script>");

(function(){
  function gb(mb){return (mb/1024).toFixed(1)}
  function esc(s){return String(s==null?"":s).replace(/[&<>"]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]})}
  function load(){
    fetch("/api/boxes/mine",{credentials:"same-origin",cache:"no-store"}).then(function(r){return r.ok?r.json():{boxes:[]}}).then(function(d){
      var boxes=d.boxes||[],wrap=document.getElementById("boxWrap"),list=document.getElementById("boxList");
      if(!wrap||!boxes.length){if(wrap)wrap.style.display="none";return}
      wrap.style.display="block";
      list.innerHTML=boxes.map(function(b){return '<div class="vm-box"><div class="vm-box-main"><div class="vm-box-name">'+esc(b.name)+'<span>Ubuntu 26.04 · '+b.cpus+'c / '+gb(b.memoryMb)+'GB</span></div><div class="vm-box-state'+(b.up?" up":"")+'">'+(b.up?"Running":"Stopped")+'</div></div><button class="vm-btn" data-bt="'+b.id+'">Connect</button><button class="vm-btn danger" data-br="'+b.id+'">Reset</button></div>'}).join("");
    }).catch(function(){});
  }
  document.addEventListener("click",function(e){
    var t=e.target.closest("[data-bt]");if(t){window.open("/box-term.html?id="+t.dataset.bt,"_blank");return}
    var r=e.target.closest("[data-br]");if(r){if(!confirm("Reset this box? Everything inside it is wiped."))return;fetch("/api/boxes/reset/"+r.dataset.br,{method:"POST",credentials:"same-origin"}).then(function(){load()}).catch(function(){});}
  });
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",load);else load();
})();

;

(function () {
    "use strict";
    // The server sends maxMinutes = null when a session has no time limit, which is
    // the default. timeLeft stays null in that case and no countdown ever runs.
    var DEFAULT_SECONDS = null;

    var homeEl   = document.getElementById("vmHome");
    var activeEl = document.getElementById("vmActive");
    var frameEl  = document.getElementById("vmFrame");
    var launchBtn = document.getElementById("vmLaunch");
    var statusEl = document.getElementById("vmStatus");
    var queueEl  = document.getElementById("vmQueue");
    var timeEl   = document.getElementById("vmTime");

    var slotId = null, userId = null, timer = null, timeLeft = DEFAULT_SECONDS, requesting = false;
    var queued = false, queuePollTimer = null;
    var currentVmUrl = null, overlayWatch = null, loadWatch = null, timerStarted = false;
    // Set while an end/cancel is in flight so the status poll cannot re-attach the
    // session the user just asked to close.
    var ending = false;
    // The waitlist polls until a machine frees up or the user cancels. There is no
    // attempt cap: giving up on someone's behalf after N tries just loses their place.
    var queuePolls = 0;
    var heartbeatTimer = null, minimized = false;
    var tabEl = document.getElementById("vmTab");
    var tabTimeEl = document.getElementById("vmTabTime");
    var spinEl = document.getElementById("vmSpin");
    var resumeBtn = document.getElementById("vmResume");
    var retryBtn = document.getElementById("vmRetry");
    var enterBtn = document.getElementById("vmEnter");
    var restartBtn = document.getElementById("vmRestart");
    var newBtn = document.getElementById("vmNew");

    // The server suspends a VM after a few minutes "away". Away means the tab is
    // hidden or the desktop is minimised inside the app — anything where the user
    // is demonstrably not looking at the screen.
    function isAway() { return !!(document.hidden || minimized); }

    function beat() {
        fetch("/api/vms/heartbeat", {
            method: "POST", headers: { "Content-Type": "application/json" },
            credentials: "same-origin", body: JSON.stringify({ away: isAway() })
        }).then(function (r) { return r.ok ? r.json() : null; })
          .then(function (d) { if (d && d.state === "stopped") showPaused(); })
          .catch(function () {});
        // A suspended machine has no web endpoint to poll, and polling it would
        // just produce the 404 that used to end the session.
        if (currentVmUrl && !paused) {
            fetch(currentVmUrl, { method: "GET", credentials: "same-origin", cache: "no-store" })
                .then(function (r) { if (r.status === 404) return confirmEnded(); })
                .catch(function () {});
        }
    }
    function confirmEnded() {
        return fetch("/api/vms/status", { credentials: "same-origin", cache: "no-store" })
            .then(function (r) { return r.json(); })
            .then(function (d) {
                if (!d) return;
                // Suspended is not ended: the machine is still theirs, it is just
                // stopped. Show the paused screen instead of tearing the session down.
                if (d.state === "stopped") return showPaused();
                if (d.state === "running") return reconnectFrame("The desktop dropped. Reconnecting.");
                vmEnded();
            })
            .catch(function () {});
    }
    function startHeartbeat() { stopHeartbeat(); beat(); heartbeatTimer = setInterval(beat, 30000); }
    function stopHeartbeat() { if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; } }

    function vmEnded() {
        if (!currentVmUrl && !slotId && !paused) return;
        ending = true;
        clearPaused();
        stopHeartbeat(); stopTimer(); clearWatch(); hideOverlay();
        try { frameEl.src = "about:blank"; } catch (e) {}
        var id = slotId; currentVmUrl = null; slotId = null; minimized = false; showTab(false);
        activeEl.classList.remove("show"); homeEl.style.display = "flex";
        requesting = false; launchBtn.disabled = false;
        setStatus("Your VM ended. Launch another whenever you like.");
        try {
            fetch("/api/vms/end", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: "{}" })
                .catch(function () {}).then(function () { ending = false; });
        } catch (e) { ending = false; }
    }

    function showTab(show) {
        if (!tabEl) return;
        if (show) tabEl.classList.add("show"); else tabEl.classList.remove("show");
    }
    function minimizeVm() {
        if (!currentVmUrl) return;
        minimized = true;
        activeEl.classList.remove("show");
        homeEl.style.display = "flex";
        if (tabTimeEl) tabTimeEl.textContent = (timeLeft == null) ? "running" : ((timeEl ? timeEl.textContent : "") + " left");
        showTab(true);
        beat();
    }
    function restoreVm() {
        minimized = false;
        showTab(false);
        homeEl.style.display = "none";
        activeEl.classList.add("show");
        beat();
    }

    function formatEta(sec) {
        if (!sec || sec < 60) return "under a minute";
        var m = Math.round(sec / 60);
        return "~" + m + " min";
    }

    function showOverlay(title, sub, showActions) {
        var ov = document.getElementById("vmOverlay");
        if (!ov) return;
        ov.classList.remove("hide");
        var t = document.getElementById("vmOverlayTitle");
        var s = document.getElementById("vmOverlaySub");
        var a = document.getElementById("vmOverlayActions");
        if (title != null && t) t.textContent = title;
        if (sub != null && s) s.textContent = sub;
        if (a) a.hidden = !showActions;
    }
    function hideOverlay() {
        var ov = document.getElementById("vmOverlay");
        if (ov) ov.classList.add("hide");
        if (overlayWatch) { clearTimeout(overlayWatch); overlayWatch = null; }
    }
    function clearWatch() {
        if (loadWatch) { clearTimeout(loadWatch); loadWatch = null; }
        if (overlayWatch) { clearTimeout(overlayWatch); overlayWatch = null; }
        if (typeof reconnectTimer !== "undefined" && reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    }

    function uid() {
        if (!userId) userId = Math.random().toString(36).slice(2) + Date.now().toString(36);
        return userId;
    }
    function setStatus(html) { if (statusEl) statusEl.innerHTML = html || ""; }
    function setQueue(html) { if (queueEl) queueEl.innerHTML = html || ""; }

    function resetIdle() {
        queued = false; requesting = false;
        launchBtn.disabled = false;
        if (queuePollTimer) { clearTimeout(queuePollTimer); queuePollTimer = null; }
    }

    function cancelQueue() {
        resetIdle();
        setStatus(""); setQueue("");
        ending = true;
        try {
            fetch("/api/vms/end", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: "{}" })
                .catch(function () {}).then(function () { ending = false; });
        } catch (e) { ending = false; }
    }

    async function requestVM() {
        if (requesting) return;
        requesting = true;
        queued = true;
        launchBtn.disabled = true;
        if (!queuePollTimer) setStatus("<span class=\"vm-spin\"></span>Starting your machine...");
        try {
            var res = await fetch("/api/vms/create", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "same-origin",
                body: "{}"
            });
            var data = await res.json().catch(function () { return {}; });
            requesting = false;

            if (res.status === 401) {
                setStatus("");
                setQueue("Please <a href=\"/account.html\" style=\"color:var(--accent)\">sign in</a> to launch a VM.");
                resetIdle();
                return;
            }
            if (data.paused || data.state === "stopped") {
                queued = false;
                if (queuePollTimer) { clearTimeout(queuePollTimer); queuePollTimer = null; }
                requesting = false;
                launchBtn.disabled = false;
                showPaused();
                return;
            }
            if (data.queued) {
                setStatus("");
                if (data.rateLimited) {
                    var rlMin = Math.max(1, Math.ceil((data.etaSeconds || 60) / 60));
                    setQueue("<span class=\"vm-spin\"></span>All machines are at the provider's hourly limit right now. Retrying in about " + rlMin + " min… <a href=\"#\" data-cancel style=\"color:var(--fg-3);margin-left:4px\">Cancel</a>");
                    queuePollTimer = setTimeout(requestVM, data.retryMs || 20000);
                    return;
                }
                queuePolls++;
                var cancel = " <a href=\"#\" data-cancel style=\"color:var(--fg-3);margin-left:4px\">Cancel</a>";
                if (data.starting) {
                    setQueue("<span class=\"vm-spin\"></span>You're next — spinning up your machine..." + cancel);
                } else {
                    var eta = "";
                    if (data.etaSeconds) {
                        eta = "<div class=\"vm-eta\"><span class=\"d\"></span>Roughly " + formatEta(data.etaSeconds) +
                            " — just an estimate, waits are usually shorter.</div>";
                    }
                    setQueue("Waitlist: you're #" + data.position + (data.total ? " of " + data.total : "") +
                        ". All machines are busy — holding your spot..." + cancel + eta);
                }
                queuePollTimer = setTimeout(requestVM, data.retryMs || 7000);
                return;
            }
            if (!res.ok || !data.url) throw new Error(data.error || ("HTTP " + res.status));

            queued = false;
            if (queuePollTimer) { clearTimeout(queuePollTimer); queuePollTimer = null; }
            slotId = data.sessionId || null;
            timeLeft = (typeof data.maxMinutes === "number" && data.maxMinutes > 0) ? data.maxMinutes * 60 : null;
            connect(data.url);
        } catch (e) {
            setStatus("Couldn't start a VM (" + (e && e.message ? e.message : e) + "). Try again in a moment.");
            setQueue("");
            resetIdle();
        }
    }

    // Reload the desktop frame in place. Used by the Reload button and by the
    // automatic retry below. There is no attempt limit: as long as the session is
    // alive on the server, the page keeps trying to get a picture back.
    var reconnects = 0, reconnectTimer = null;
    function reconnectFrame(reason) {
        if (!currentVmUrl) return;
        reconnects++;
        hideSlowOptions();
        showOverlay("Reconnecting…", reason || "Reloading the desktop.", false);
        clearWatch();
        armLoadWatch();
        try { frameEl.src = "about:blank"; } catch (e) {}
        setTimeout(function () { if (currentVmUrl) frameEl.src = currentVmUrl; }, 60);
    }

    // A slow desktop is NOT a broken one. Reloading the frame on a timer used to
    // throw away a KasmVNC session that was still coming up, which reset the VM the
    // user was already halfway into. So nothing reloads by itself any more: if it
    // takes a while, say so and let the user decide.
    function showSlowOptions() {
        if (spinEl) spinEl.hidden = true;
        if (resumeBtn) resumeBtn.hidden = true;
        if (retryBtn) retryBtn.hidden = true;
        if (enterBtn) enterBtn.hidden = false;
        if (restartBtn) restartBtn.hidden = false;
        if (newBtn) newBtn.hidden = false;
        showOverlay("This is taking a while",
            "The desktop may still be coming up. Go on in and watch it finish, restart the machine, or ask for a different one.", true);
    }

    function hideSlowOptions() {
        if (spinEl) spinEl.hidden = false;
        if (enterBtn) enterBtn.hidden = true;
        if (restartBtn) restartBtn.hidden = true;
        if (newBtn) newBtn.hidden = true;
        if (retryBtn) retryBtn.hidden = false;
    }

    function armLoadWatch() {
        if (loadWatch) { clearTimeout(loadWatch); loadWatch = null; }
        loadWatch = setTimeout(showSlowOptions, 18000);
    }

    // ---- suspended state -------------------------------------------------
    // The server stops the container after a few minutes away and keeps the
    // session. The desktop is still theirs; it just has no picture until they
    // start it again, which they can do whenever they want.
    var paused = false, resuming = false;

    function showPaused() {
        if (paused) return;
        paused = true;
        clearWatch();
        stopTimer();
        // Drop the frame URL so nothing tries to reconnect to a stopped container.
        currentVmUrl = null;
        homeEl.style.display = "none";
        activeEl.classList.add("show");
        minimized = false; showTab(false);
        try { frameEl.src = "about:blank"; } catch (e) {}
        if (spinEl) spinEl.hidden = true;
        if (resumeBtn) resumeBtn.hidden = false;
        if (retryBtn) retryBtn.hidden = true;
        showPausedButtons();
        showOverlay("Paused to save resources",
            "You were away, so this machine was stopped. Start it again within a couple of minutes and you get the same desktop back; after that a fresh one starts instead.", true);
    }

    function clearPaused() {
        paused = false;
        if (spinEl) spinEl.hidden = false;
        if (resumeBtn) resumeBtn.hidden = true;
        if (retryBtn) retryBtn.hidden = false;
    }

    function showPausedButtons() {
        if (enterBtn) enterBtn.hidden = true;
        if (restartBtn) restartBtn.hidden = true;
        if (newBtn) newBtn.hidden = false;   // a reaped machine still needs this way out
    }

    // "Enter VM": the desktop is probably fine, just slow. Get the overlay out of
    // the way and stop watching the clock so it cannot reappear over their session.
    function enterVm() {
        clearWatch();
        hideSlowOptions();
        hideOverlay();
    }

    // "Restart VM": same machine, restarted at the provider.
    async function restartVm() {
        if (restarting) return;
        restarting = true;
        hideSlowOptions();
        showOverlay("Restarting your machine…", "Rebooting the desktop. This takes a few seconds.", false);
        try {
            var r = await fetch("/api/vms/restart", {
                method: "POST", headers: { "Content-Type": "application/json" },
                credentials: "same-origin", body: "{}"
            });
            var d = await r.json().catch(function () { return {}; });
            if (r.ok && d.url) {
                reconnects = 0;
                connect(d.url);
            } else if (d.relaunch || d.gone) {
                newVm(true);
            } else {
                showSlowOptions();
                showOverlay("Couldn't restart it", (d.error || "The provider didn't respond.") + " You can try again or ask for a different machine.", true);
            }
        } catch (e) {
            showSlowOptions();
            showOverlay("Couldn't restart it", "Network error. Try again.", true);
        }
        restarting = false;
    }

    // "Request a new VM": let this one go and start a fresh one.
    async function newVm(skipEnd) {
        hideSlowOptions();
        clearWatch();
        showOverlay("Getting you a new machine…", "Releasing this one and starting another.", false);
        currentVmUrl = null;
        try { frameEl.src = "about:blank"; } catch (e) {}
        if (!skipEnd) {
            try {
                await fetch("/api/vms/end", {
                    method: "POST", headers: { "Content-Type": "application/json" },
                    credentials: "same-origin", body: "{}"
                });
            } catch (e) {}
        }
        slotId = null;
        paused = false;
        stopTimer();
        stopHeartbeat();
        hideOverlay();
        activeEl.classList.remove("show");
        homeEl.style.display = "flex";
        requesting = false;
        queuePolls = 0;
        launchBtn.disabled = false;
        setStatus("<span class=\"vm-spin\"></span>Starting a new machine…");
        requestVM();
    }

    var restarting = false;

    async function resumeVm() {
        if (resuming) return;
        resuming = true;
        if (resumeBtn) { resumeBtn.disabled = true; resumeBtn.textContent = "Starting…"; }
        if (spinEl) spinEl.hidden = false;
        showOverlay("Starting your machine…", "Bringing the desktop back up. This takes a few seconds.", false);
        try {
            var r = await fetch("/api/vms/resume", {
                method: "POST", headers: { "Content-Type": "application/json" },
                credentials: "same-origin", body: "{}"
            });
            var d = await r.json().catch(function () { return {}; });
            if (r.ok && d.url) {
                clearPaused();
                connect(d.url);
            } else if (d.gone) {
                // The provider reaps a stopped container after a couple of minutes and
                // there is no way to hold it open, so past that window "start it again"
                // means starting a fresh machine. Do it for them rather than dead-ending.
                clearPaused();
                currentVmUrl = null; slotId = null;
                activeEl.classList.remove("show");
                homeEl.style.display = "flex";
                hideOverlay();
                setStatus("<span class=\"vm-spin\"></span>Your last machine had been cleaned up. Starting a fresh one…");
                requesting = false;
                queuePolls = 0;
                requestVM();
            } else {
                showOverlay("Couldn't start it", (d.error || "The provider didn't respond.") + " You can try again or end the session.", true);
                if (spinEl) spinEl.hidden = true;
            }
        } catch (e) {
            showOverlay("Couldn't start it", "Network error. Try again.", true);
            if (spinEl) spinEl.hidden = true;
        }
        resuming = false;
        if (resumeBtn) { resumeBtn.disabled = false; resumeBtn.textContent = "Start it again"; }
    }

    function connect(url) {
        requesting = false;
        clearPaused();
        hideSlowOptions();
        currentVmUrl = url;
        setStatus(""); setQueue("");
        showOverlay("Connecting to your machine…", "This can take a few seconds while the desktop boots.", false);
        clearWatch();
        armLoadWatch();
        timerStarted = false;
        minimized = false; showTab(false);
        renderTime();
        frameEl.src = url;
        homeEl.style.display = "none";
        activeEl.classList.add("show");
        startHeartbeat();
    }

    frameEl.addEventListener("load", function () {
        if (!activeEl.classList.contains("show")) return;
        if (!frameEl.src || frameEl.src === "about:blank") return;
        if (loadWatch) { clearTimeout(loadWatch); loadWatch = null; }
        if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
        reconnects = 0;
        hideSlowOptions();
        if (overlayWatch) clearTimeout(overlayWatch);
        overlayWatch = setTimeout(hideOverlay, 1800);
        if (!timerStarted) { timerStarted = true; startTimer(); }
    });

    function startTimer() {
        stopTimer();
        renderTime();
        if (timeLeft == null) return;   // no limit, so nothing to count
        timer = setInterval(function () {
            timeLeft--;
            renderTime();
            if (timeLeft <= 0) endSession();
        }, 1000);
    }
    function stopTimer() { if (timer) { clearInterval(timer); timer = null; } }
    function renderTime() {
        if (!timeEl) return;
        // No limit: show how long it has been up rather than a clock running out.
        if (timeLeft == null) {
            timeEl.textContent = "No time limit";
            timeEl.classList.remove("warn", "danger");
            if (minimized && tabTimeEl) tabTimeEl.textContent = "running";
            return;
        }
        // Show the real remaining time. This used to subtract an hour, so the
        // clock read 00:00 with an hour still on the session.
        var shown = Math.max(0, timeLeft);
        var m = Math.max(0, Math.floor(shown / 60)).toString();
        var s = Math.max(0, shown % 60).toString();
        if (m.length < 2) m = "0" + m;
        if (s.length < 2) s = "0" + s;
        timeEl.textContent = m + ":" + s;
        timeEl.classList.toggle("warn", shown <= 120 && shown > 30);
        timeEl.classList.toggle("danger", shown <= 30);
        if (minimized && tabTimeEl) tabTimeEl.textContent = m + ":" + s + " left";
    }

    async function endSession() {
        ending = true;
        clearPaused();
        stopTimer();
        stopHeartbeat();
        clearWatch();
        hideOverlay();
        minimized = false; showTab(false);
        currentVmUrl = null;
        var id = slotId;
        slotId = null;
        try { frameEl.src = "about:blank"; } catch (e) {}
        activeEl.classList.remove("show");
        homeEl.style.display = "flex";
        setStatus(""); setQueue("");
        requesting = false;
        launchBtn.disabled = false;
        try {
            await fetch("/api/vms/end", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "same-origin",
                body: "{}"
            });
        } catch (e) {}
        finally { ending = false; }
    }

    function toggleFs() {
        if (document.fullscreenElement) { document.exitFullscreen(); return; }
        if (frameEl.requestFullscreen) frameEl.requestFullscreen();
        else if (activeEl.requestFullscreen) activeEl.requestFullscreen();
    }

    var vmAccepted = false;
    try { vmAccepted = localStorage.getItem("vm_guidelines_accepted") === "1"; } catch(e) {}

    function showWelcome() {
        var w = document.getElementById("vmWelcome");
        if (!w) return;
        w.style.display = "flex";
        var cb = document.getElementById("vmAgree");
        var btn = document.getElementById("vmAgreeBtn");
        if (cb && btn) {
            cb.checked = false; btn.disabled = true;
            cb.onchange = function() { btn.disabled = !cb.checked; };
            btn.onclick = function() {
                vmAccepted = true;
                try { localStorage.setItem("vm_guidelines_accepted", "1"); } catch(e) {}
                w.style.display = "none";
                queuePolls = 0; requestVM();
            };
        }
    }

    if (launchBtn) launchBtn.addEventListener("click", function () {
        if (!vmAccepted) { showWelcome(); return; }
        queuePolls = 0; requestVM();
    });
    var endBtn = document.getElementById("vmEnd");
    var fsBtn = document.getElementById("vmFs");
    if (endBtn) endBtn.addEventListener("click", endSession);
    if (fsBtn) fsBtn.addEventListener("click", toggleFs);
    var minBtn = document.getElementById("vmMin");
    if (minBtn) minBtn.addEventListener("click", minimizeVm);
    if (tabEl) tabEl.addEventListener("click", restoreVm);
    var giveUpBtn = document.getElementById("vmGiveUp");
    if (retryBtn) retryBtn.addEventListener("click", function () {
        reconnects = 0;   // a deliberate reload restarts the backoff
        reconnectFrame("Reloading the desktop.");
    });
    if (giveUpBtn) giveUpBtn.addEventListener("click", endSession);
    if (resumeBtn) resumeBtn.addEventListener("click", resumeVm);
    if (enterBtn) enterBtn.addEventListener("click", enterVm);
    if (restartBtn) restartBtn.addEventListener("click", restartVm);
    if (newBtn) newBtn.addEventListener("click", function () { newVm(false); });

    // Tell the server the moment presence changes rather than waiting up to 30s
    // for the next beat, so coming back from a hidden tab counts immediately.
    document.addEventListener("visibilitychange", function () { if (currentVmUrl || paused) beat(); });

    window.addEventListener("message", function (event) {
        var d = event && event.data;
        if (!d || d.source !== "jitter-vm") return;
        if (d.vmState === "stopped") confirmEnded();
        // The placeholder gave up waiting for the container to answer.
        else if (d.vmState === "slow") showSlowOptions();
        // "booting" needs nothing: that page retries itself for a bounded while.
    });
    if (queueEl) queueEl.addEventListener("click", function (e) {
        var a = e.target.closest ? e.target.closest("[data-cancel]") : null;
        if (a) { e.preventDefault(); cancelQueue(); }
    });

    window.addEventListener("pagehide", function () {
        if (queued && !slotId && navigator.sendBeacon) {
            try { navigator.sendBeacon("/api/vms/end", new Blob(["{}"], { type: "application/json" })); } catch (e) {}
        }
    });

    function applyLive(data) {
        var box = document.getElementById("vmLive");
        var txt = document.getElementById("vmLiveText");
        if (!txt || !data) return;
        if (data.available === false) {
            if (box) box.classList.add("off");
            txt.textContent = "VMs offline";
            return;
        }
        if (box) box.classList.remove("off");
        var n = (typeof data.inUse === "number") ? data.inUse : 0;
        var html = "<b>" + n + "</b> VM" + (n === 1 ? "" : "s") + " online";
        if (data.waiting) html += " · " + data.waiting + " waiting";
        if (data.rateLimited) {
            var m = Math.max(1, Math.ceil((data.rateLimitSeconds || 60) / 60));
            html += " · hourly limit, ~" + m + " min";
        }
        txt.innerHTML = html;
    }
    async function pollLive(handleReconnect) {
        try {
            var res = await fetch("/api/vms/status", { credentials: "same-origin" });
            var data = await res.json().catch(function () { return {}; });
            applyLive(data);
            // Re-attach whenever the server still has a live VM for this user but
            // this page is not showing one: a refresh, a dropped tab, a second
            // window. Runs every tick, so reconnecting is never capped.
            if (!data || ending) return;
            // Suspended: show the paused screen wherever the user is, including
            // after a refresh, so their machine is obviously still there.
            if (data.state === "stopped") { showPaused(); return; }
            // The server checked with the provider and the machine is genuinely
            // gone. Stop retrying and offer a fresh one instead of looping on a
            // container that no longer exists.
            if (data.state === null && (currentVmUrl || paused || slotId)) {
                var wasPaused = paused;
                clearPaused();
                vmEnded();
                setStatus(wasPaused
                    ? "Your machine was cleaned up after being idle. Launch another whenever you like."
                    : "That machine is no longer available. Launch a new one whenever you like.");
                return;
            }
            if (paused && data.state === "running") clearPaused();
            if (handleReconnect && data.active && data.url && !currentVmUrl && !requesting) {
                slotId = data.sessionId || slotId;
                timeLeft = (typeof data.secondsLeft === "number" && data.secondsLeft > 0) ? data.secondsLeft : null;
                connect(data.url);
            }
        } catch (e) {}
    }
    pollLive(true);
    setInterval(function () { pollLive(true); }, 5000);
})();

;
document.write("<script src=\"/src/js/pu3927.js?v=20260929-2\" defer></script><script src=\"/src/js/gd4170.js?v=679513e5c4c4\" defer></script><script src=\"/src/js/email-nudge.js?v=1\" defer></script>");