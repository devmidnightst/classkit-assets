
(async function () {
    const $ = id => document.getElementById(id);

    // ── owner gate (UX only; real checks are server-side) ──
    try {
        const me = await fetch("/api/auth/me", { credentials: "same-origin", cache: "no-store" }).then(r => r.json());
        if (!(me && me.authenticated && me.user && String(me.user.username || "").toLowerCase() === "midnightsweat")) {
            $("gate").innerHTML = '<div><h2>Owner only</h2><p>Sign in as the owner account to use the console.</p><a href="/account">Sign in</a></div>';
            return;
        }
    } catch {
        $("gate").innerHTML = "<div>Couldn't verify your session.</div>"; return;
    }
    $("gate").hidden = true;
    $("app").hidden = false;

    const FONT_MIN = 9, FONT_MAX = 22;
    const THEME = { background: "#0a090d", foreground: "#ededf0", cursor: "#a898e8", cursorAccent: "#0a090d", selectionBackground: "rgba(168, 152, 232, 0.28)",
        black: "#0a090d", brightBlack: "#5a5870", red: "#e07c7c", brightRed: "#ec9a9a", green: "#82d0a4", brightGreen: "#a0e0bc", yellow: "#e6c976", brightYellow: "#f0dc9c",
        blue: "#88b8e0", brightBlue: "#a8cdec", magenta: "#c188e0", brightMagenta: "#d4a8ec", cyan: "#7ad0d0", brightCyan: "#9ce0e0", white: "#d6d5de", brightWhite: "#ededf0" };
    const storedFont = () => { try { return parseInt(localStorage.getItem("noc-term-font") || "13", 10) || 13; } catch { return 13; } };
    let fontSize = Math.max(FONT_MIN, Math.min(FONT_MAX, storedFont()));

    const sessions = new Map();   // id -> { info, term, fit, pane, opened, unread, row, tr }
    let ws = null, activeId = null, view = "term", maxSessions = 8, viewers = 1;
    let online = false, replaying = false, wantActive = null, ctrlArmed = false;
    let retryTimer = null, retries = 0, holdRetry = false, passwordSet = false;
    let lastSeen = 0, pingSeq = 0, pingAt = 0, latency = null, wasLost = false, retryAt = 0, openTimer = null, pendingCommand = null;
    const VIEW_TITLES = { overview: "Overview", insights: "Server insights", snippets: "Quick commands" };

    const age = ms => {
        const s = Math.max(0, Math.floor(ms / 1000));
        if (s < 60) return s + "s";
        if (s < 3600) return Math.floor(s / 60) + "m";
        if (s < 86400) return Math.floor(s / 3600) + "h " + Math.floor(s % 3600 / 60) + "m";
        return Math.floor(s / 86400) + "d " + Math.floor(s % 86400 / 3600) + "h";
    };
    const icon = name => `<svg class="i"><use href="#i-${name}"/></svg>`;
    function toast(text) {
        const el = document.createElement("div");
        el.className = "toast"; el.textContent = text;
        $("toasts").appendChild(el);
        setTimeout(() => el.remove(), 3500);
    }

    // ── dialogs ──
    function ask({ title, body = "", confirm = "OK", danger = false, field = null, value = "" }) {
        const dlg = $("askDlg");
        $("askTitle").textContent = title; $("askBody").textContent = body; $("askBody").hidden = !body;
        $("askOk").textContent = confirm; $("askOk").className = "btn " + (danger ? "solid-danger" : "primary");
        $("askField").hidden = !field; $("askLabel").textContent = field || ""; $("askInput").value = value;
        return new Promise(resolve => {
            dlg.returnValue = "cancel";
            dlg.addEventListener("close", () => {
                refocus();
                resolve(dlg.returnValue === "ok" ? (field ? $("askInput").value : true) : null);
            }, { once: true });
            dlg.showModal();
            if (field) { $("askInput").focus(); $("askInput").select(); }
        });
    }

    // ── wire protocol ──
    const encoder = new TextEncoder();
    const isOpen = () => ws && ws.readyState === 1;
    const sendControl = message => { if (online && isOpen()) ws.send(JSON.stringify(message)); };
    function sendBytes(id, bytes) {
        if (!online || !isOpen()) return false;
        const out = new Uint8Array(4 + bytes.length);
        new DataView(out.buffer).setUint32(0, id);
        out.set(bytes, 4);
        ws.send(out);
        return true;
    }
    const sendText = (id, text) => sendBytes(id, encoder.encode(text));

    // ── terminals ──
    function typed(id, data) {
        if (ctrlArmed && data.length === 1) {
            const code = data.toUpperCase().charCodeAt(0);
            if (code >= 64 && code <= 95) data = String.fromCharCode(code - 64);
            setCtrl(false);
        }
        sendText(id, data);
    }
    function addSession(info) {
        const term = new Terminal({
            cols: info.cols, rows: info.rows, cursorBlink: true, fontSize, fontFamily: getComputedStyle(document.documentElement).getPropertyValue("--mono").trim(),
            lineHeight: 1.15, scrollback: 10000, allowProposedApi: true, theme: THEME,
        });
        const fit = new FitAddon.FitAddon();
        term.loadAddon(fit);
        try { term.loadAddon(new WebLinksAddon.WebLinksAddon()); } catch {}
        const pane = document.createElement("div");
        pane.className = "pane";
        $("stage").appendChild(pane);
        const session = { info, term, fit, pane, opened: false, unread: false };
        term.onData(data => typed(info.id, data));
        term.onBinary(data => sendBytes(info.id, Uint8Array.from(data, c => c.charCodeAt(0) & 255)));
        sessions.set(info.id, session);
        buildRow(session);
        return session;
    }
    function dropSession(id) {
        const session = sessions.get(id);
        if (!session) return;
        sessions.delete(id);
        session.term.dispose(); session.pane.remove(); session.row.remove(); session.tr.remove();
        if (activeId === id) {
            activeId = null;
            const next = [...sessions.keys()].pop();
            if (next != null && view === "term") activate(next);
        }
        render();
    }
    function fitActive() {
        const session = sessions.get(activeId);
        if (!session || !session.opened || view !== "term") return;
        const stage = $("stage");
        if (stage.clientHeight <= 8 || stage.clientWidth <= 8) return;   // never fit to a collapsed box
        try { session.fit.fit(); } catch { return; }
        const { cols, rows } = session.term;
        if (cols !== session.info.cols || rows !== session.info.rows) {
            session.info.cols = cols; session.info.rows = rows;
            sendControl({ t: "resize", id: activeId, cols, rows });
            renderStatus();
        }
    }
    function refocus() {
        const session = sessions.get(activeId);
        if (session && view === "term" && session.opened && !matchMedia("(pointer:coarse)").matches) session.term.focus();
    }
    function activate(id) {
        const session = sessions.get(id);
        if (!session) return;
        activeId = id; view = "term"; session.unread = false;
        if (!session.opened) { session.opened = true; session.pane.style.visibility = "visible"; session.term.open(session.pane); session.pane.style.visibility = ""; }
        render();
        fitActive();
        refocus();
        $("app").classList.remove("open");
    }
    function showView(name) { view = name; render(); $("app").classList.remove("open"); if (name === "insights") pollInsights(true); }
    const showOverview = () => showView("overview");

    // ── session actions ──
    const createSession = () => {
        const session = sessions.get(activeId);
        sendControl({ t: "create", cols: session ? session.term.cols : 120, rows: session ? session.term.rows : 32 });
    };
    async function haltSession(id) {
        const session = sessions.get(id);
        if (!session) return;
        const { name, running } = session.info;
        const ok = await ask({ title: `Halt ${name}?`, confirm: "Halt session", danger: true,
            body: running ? `This ends the shell and stops ${running}, which is still running.` : "This ends the shell. Its output can't be recovered." });
        if (ok) sendControl({ t: "halt", id });
    }
    async function haltAll() {
        const ok = await ask({ title: `Halt all ${sessions.size} sessions?`, confirm: "Halt all", danger: true,
            body: "Every shell and anything running in it stops." });
        if (ok) sendControl({ t: "haltAll" });
    }
    async function renameSession(id) {
        const session = sessions.get(id);
        if (!session) return;
        const name = await ask({ title: "Rename session", field: "Name", value: session.info.name, confirm: "Rename" });
        if (name && name.trim()) sendControl({ t: "rename", id, name });
    }

    // ── rendering ──
    function buildRow(session) {
        const id = session.info.id;
        const row = document.createElement("div");
        row.className = "session";
        row.innerHTML = `<button class="session-main"><span class="dot good"></span><span class="session-name"></span><span class="session-meta"></span></button><button class="session-halt" title="Halt session" aria-label="Halt session">${icon("stop")}</button>`;
        row.querySelector(".session-main").addEventListener("click", () => activate(id));
        row.querySelector(".session-halt").addEventListener("click", () => haltSession(id));
        $("list").appendChild(row);
        session.row = row;

        const tr = document.createElement("tr");
        tr.innerHTML = `<td class="c-name"><span class="dot good"></span><span class="n"></span></td><td class="c-run"></td><td class="c-dir"></td><td class="c-pid"></td><td class="c-size"></td><td class="c-idle"></td><td class="c-up"></td>
            <td class="c-actions"><button class="btn small" data-a="open">Open</button><button class="btn small wide-only" data-a="rename">Rename</button><button class="btn small danger" data-a="halt">Halt</button></td>`;
        tr.querySelector('[data-a="open"]').addEventListener("click", () => activate(id));
        tr.querySelector('[data-a="rename"]').addEventListener("click", () => renameSession(id));
        tr.querySelector('[data-a="halt"]').addEventListener("click", () => haltSession(id));
        $("rows").appendChild(tr);
        session.tr = tr;
    }
    function renderRows() {
        const now = Date.now();
        for (const session of sessions.values()) {
            const { info, row, tr } = session;
            const current = view === "term" && info.id === activeId;
            row.classList.toggle("current", current);
            row.querySelector(".dot").className = "dot " + (!online ? "" : session.unread ? "accent" : "good");
            row.querySelector(".session-name").textContent = info.name;
            const meta = [info.cwd, info.running].filter(Boolean).join(" · ");
            row.querySelector(".session-meta").textContent = meta || "starting";
            row.querySelector(".session-main").title = meta;
            tr.querySelector(".dot").className = "dot " + (online ? "good" : "");
            tr.querySelector(".n").textContent = info.name;
            tr.querySelector(".c-run").textContent = info.running || "idle";
            tr.querySelector(".c-dir").textContent = info.cwd || "-";
            tr.querySelector(".c-pid").textContent = info.pid || "-";
            tr.querySelector(".c-size").textContent = info.cols + "×" + info.rows;
            tr.querySelector(".c-idle").textContent = age(now - info.lastActive) + " ago";
            tr.querySelector(".c-up").textContent = age(now - info.createdAt);
        }
    }
    function renderStatus() {
        const session = view === "term" ? sessions.get(activeId) : null;
        $("stRun").textContent = session ? (session.info.running ? "running " + session.info.running : "idle") : "";
        $("stDir").textContent = session ? session.info.cwd : "";
        $("stSize").textContent = session ? session.term.cols + "×" + session.term.rows : "";
        $("stUp").textContent = session ? "pid " + (session.info.pid || "-") + "  ·  up " + age(Date.now() - session.info.createdAt) : (viewers > 1 && online ? viewers + " consoles connected" : "");
    }
    function renderConnection(state, text) {
        $("connDot").className = "dot " + state;
        $("connText").textContent = text;
    }
    function render() {
        const count = sessions.size, full = count >= maxSessions;
        const active = sessions.get(activeId);
        const showTerm = view === "term" && !!active;
        for (const session of sessions.values()) session.pane.classList.toggle("current", showTerm && session === active);
        $("overview").hidden = view !== "overview";
        $("insights").hidden = view !== "insights";
        $("snippets").hidden = view !== "snippets";
        $("empty").hidden = view !== "term" || count > 0 || !online;
        $("sessionTools").style.display = showTerm ? "contents" : "none";
        $("keys").style.visibility = showTerm ? "" : "hidden";
        $("overviewBtn").classList.toggle("current", view === "overview");
        $("insightsBtn").classList.toggle("current", view === "insights");
        $("snippetsBtn").classList.toggle("current", view === "snippets");
        $("sessionCount").textContent = count + "/" + maxSessions;
        $("title").textContent = showTerm ? active.info.name : VIEW_TITLES[view] || "Console";
        $("subtitle").textContent = showTerm ? active.info.cwd : "";
        $("overviewSummary").textContent = count ? `${count} of ${maxSessions} sessions running on this server` : "No sessions running";
        $("haltAllBtn").disabled = !count || !online;
        for (const id of ["newBtn", "newBtn2", "newBtn3"]) { $(id).disabled = full || !online; $(id).title = full ? `Session limit reached (${maxSessions})` : "New session"; }
        renderRows();
        renderStatus();
    }

    // ── connection ──
    function applyList(list) {
        const seen = new Set(list.map(info => info.id));
        for (const id of [...sessions.keys()]) if (!seen.has(id)) dropSession(id);
        for (const info of list) {
            const session = sessions.get(info.id);
            if (session) session.info = info; else addSession(info);
        }
    }
    function onControl(m) {
        switch (m.t) {
            case "sync":
                maxSessions = m.max; viewers = m.viewers; online = true; replaying = true; retries = 0;
                $("lock").classList.remove("show"); $("lockErr").textContent = ""; $("lockPw").value = "";
                renderConnection("good", "Online");
                clearTimeout(openTimer);
                setBanner(null);
                if (wasLost) { wasLost = false; toast("Reconnected. Your sessions are still running."); }
                for (const session of sessions.values()) session.term.reset();
                applyList(m.list);
                break;
            case "synced":
                replaying = false;
                if (view === "term") activate(sessions.has(activeId) ? activeId : [...sessions.keys()][0]);
                render();
                break;
            case "sessions":
                maxSessions = m.max; viewers = m.viewers;
                applyList(m.list);
                render();
                break;
            case "created": {
                activate(m.id);
                const command = pendingCommand;
                pendingCommand = null;
                if (command) setTimeout(() => sendText(m.id, command + "\r"), 450);
                break;
            }
            case "pong":
                if (m.n === pingSeq) { latency = Math.max(0, Math.round(performance.now() - pingAt)); $("connMs").textContent = latency + " ms"; }
                break;
            case "ended":
                dropSession(m.id);
                toast(`${m.name} ended`);
                break;
            case "error": toast(m.message); break;
        }
    }
    function onAuth(m) {
        if (m.__auth === "password-required") {
            holdRetry = true;
            renderConnection("warn", "Locked");
            $("lock").classList.add("show"); $("lockPw").focus();
        } else if (m.__auth === "denied") {
            $("lockErr").textContent = "Wrong password." + (m.remaining != null ? ` ${m.remaining} ${m.remaining === 1 ? "try" : "tries"} left.` : "");
            $("lockPw").value = ""; $("lockPw").focus();
        } else if (m.__auth === "locked") {
            holdRetry = true;
            renderConnection("warn", "Locked");
            startLockCountdown(Number(m.seconds) || 120);
        }
    }
    function setBanner(text, tone) {
        $("banner").hidden = !text;
        $("banner").className = "banner" + (tone === "warn" ? " warn" : "");
        $("bannerText").textContent = text || "";
    }
    function renderRetry() {
        if (online || holdRetry || !retryAt) return;
        const left = Math.max(0, Math.ceil((retryAt - Date.now()) / 1000));
        if (navigator.onLine === false) setBanner("Your device is offline. The console reconnects as soon as the network returns.", "warn");
        else setBanner(left > 0 ? `Connection lost. Reconnecting in ${left}s (attempt ${retries}). Sessions keep running on the server.` : "Connection lost. Reconnecting now…");
    }
    function lost(sock) {
        if (ws !== sock) return;
        try { sock.onclose = null; sock.onmessage = null; sock.onerror = null; sock.close(); } catch {}
        ws = null;
        clearTimeout(openTimer);
        const hadLink = online;
        online = false; latency = null; $("connMs").textContent = "";
        render();
        if (holdRetry) return;
        if (hadLink || retries > 0) wasLost = true;
        retries++;
        const wait = navigator.onLine === false ? 30 : Math.min(15, 2 ** Math.min(retries - 1, 4));
        retryAt = Date.now() + wait * 1000;
        renderConnection("bad", "Reconnecting");
        renderRetry();
        clearTimeout(retryTimer);
        retryTimer = setTimeout(connect, wait * 1000);
    }
    function retryNow() {
        if (online || holdRetry) return;
        retries = Math.min(retries, 1);
        connect();
    }
    function connect() {
        clearTimeout(retryTimer); clearTimeout(openTimer);
        if (ws) { try { ws.onclose = null; ws.onmessage = null; ws.onerror = null; ws.close(); } catch {} }
        online = false; holdRetry = false; retryAt = 0;
        const proto = location.protocol === "https:" ? "wss" : "ws";
        let tok = "";
        try { tok = localStorage.getItem("noc-session") || ""; } catch {}
        const stage = $("stage");
        const cols = Math.max(20, Math.floor((stage.clientWidth - 24) / 8)), rows = Math.max(5, Math.floor((stage.clientHeight - 12) / 17));
        let sock;
        try { sock = new WebSocket(proto + "://" + location.host + "/api/admin/term?cols=" + cols + "&rows=" + rows + (tok ? "&_noc_session=" + encodeURIComponent(tok) : "")); }
        catch { ws = null; retries++; retryAt = Date.now() + 5000; renderRetry(); retryTimer = setTimeout(connect, 5000); return; }
        ws = sock;
        sock.binaryType = "arraybuffer";
        lastSeen = Date.now();
        renderConnection("warn", "Connecting");
        if (wasLost) setBanner("Connection lost. Reconnecting now…");
        render();
        openTimer = setTimeout(() => { if (ws === sock && !online && !holdRetry) lost(sock); }, 12000);
        sock.onmessage = e => {
            if (ws !== sock) return;
            lastSeen = Date.now();
            if (typeof e.data === "string") {
                let m = null;
                try { m = JSON.parse(e.data); } catch { return; }
                if (m && m.__auth) { clearTimeout(openTimer); setBanner(null); onAuth(m); } else if (m) onControl(m);
                return;
            }
            const session = sessions.get(new DataView(e.data).getUint32(0));
            if (!session) return;
            session.term.write(new Uint8Array(e.data, 4));
            if (!replaying && (session.info.id !== activeId || view !== "term") && !session.unread) { session.unread = true; renderRows(); }
        };
        sock.onclose = () => lost(sock);
    }
    function heartbeat() {
        if (!online || !isOpen()) return;
        if (Date.now() - lastSeen > 20000) { lost(ws); return; }
        pingSeq++; pingAt = performance.now();
        try { ws.send(JSON.stringify({ t: "ping", n: pingSeq })); } catch { lost(ws); }
    }
    setInterval(heartbeat, 7000);
    setInterval(renderRetry, 1000);
    window.addEventListener("online", () => { toast("Network is back."); retryNow(); });
    window.addEventListener("offline", () => { if (ws && online) lost(ws); else renderRetry(); });
    document.addEventListener("visibilitychange", () => {
        if (document.hidden) return;
        if (!online) retryNow(); else heartbeat();
        if (view === "insights") pollInsights(true);
    });
    window.addEventListener("pageshow", e => { if (e.persisted) retryNow(); });
    $("bannerRetry").addEventListener("click", retryNow);

    let lockTimer = null;
    function startLockCountdown(seconds) {
        $("lock").classList.add("show");
        $("lockPw").disabled = true; $("lockGo").disabled = true;
        clearInterval(lockTimer);
        let left = seconds;
        const tick = () => {
            if (left <= 0) {
                clearInterval(lockTimer);
                $("lockErr").textContent = ""; $("lockPw").disabled = false; $("lockGo").disabled = false;
                connect();
                return;
            }
            $("lockErr").textContent = `Too many attempts. Try again in ${left}s.`;
            left--;
        };
        tick(); lockTimer = setInterval(tick, 1000);
    }
    $("lockForm").addEventListener("submit", e => {
        e.preventDefault();
        if (isOpen()) ws.send(JSON.stringify({ type: "auth", password: $("lockPw").value }));
        else connect();
    });

    // ── touch keys ──
    function setCtrl(on) { ctrlArmed = on; $("ctrlKey").setAttribute("aria-pressed", String(on)); }
    const KEYS = [["Esc", "\x1b"], ["Tab", "\x09"], ["Ctrl", null], ["↑", "\x1b[A"], ["↓", "\x1b[B"], ["←", "\x1b[D"], ["→", "\x1b[C"],
        ["^C", "\x03"], ["^D", "\x04"], ["^Z", "\x1a"], ["^L", "\x0c"], ["|", "|"], ["~", "~"], ["/", "/"], ["-", "-"]];
    KEYS.forEach(([label, sequence]) => {
        const key = document.createElement("button");
        key.className = "key"; key.type = "button"; key.textContent = label;
        if (sequence === null) {
            key.id = "ctrlKey"; key.setAttribute("aria-pressed", "false");
            key.addEventListener("click", () => { setCtrl(!ctrlArmed); sessions.get(activeId)?.term.focus(); });
        } else {
            key.addEventListener("click", () => { if (activeId != null) sendText(activeId, sequence); sessions.get(activeId)?.term.focus(); });
        }
        $("keys").appendChild(key);
    });

    // ── toolbar ──
    $("overviewBtn").addEventListener("click", showOverview);
    $("insightsBtn").addEventListener("click", () => showView("insights"));
    $("snippetsBtn").addEventListener("click", () => showView("snippets"));
    for (const id of ["newBtn", "newBtn2", "newBtn3"]) $(id).addEventListener("click", createSession);
    $("haltBtn").addEventListener("click", () => haltSession(activeId));
    $("haltAllBtn").addEventListener("click", haltAll);
    $("renameBtn").addEventListener("click", () => renameSession(activeId));
    $("intBtn").addEventListener("click", () => { sendText(activeId, "\x03"); refocus(); });
    $("clearBtn").addEventListener("click", () => { sessions.get(activeId)?.term.clear(); refocus(); });
    $("menuBtn").addEventListener("click", () => $("app").classList.toggle("open"));
    $("scrim").addEventListener("click", () => $("app").classList.remove("open"));
    $("cmdBtn").addEventListener("click", () => {
        const bar = $("cmdBar");
        bar.hidden = !bar.hidden;
        if (!bar.hidden) $("cmdInput").focus(); else refocus();
    });
    $("cmdBar").addEventListener("submit", e => {
        e.preventDefault();
        const input = $("cmdInput");
        if (activeId == null || !sendText(activeId, input.value + "\r")) { toast("Not connected, so the command wasn't sent."); return; }
        input.value = ""; input.focus();
    });
    function applyFont(size) {
        fontSize = Math.max(FONT_MIN, Math.min(FONT_MAX, size));
        for (const session of sessions.values()) session.term.options.fontSize = fontSize;
        try { localStorage.setItem("noc-term-font", fontSize); } catch {}
        fitActive();
    }
    $("fontUp").addEventListener("click", () => applyFont(fontSize + 1));
    $("fontDown").addEventListener("click", () => applyFont(fontSize - 1));
    $("fullBtn").addEventListener("click", () => {
        if (document.fullscreenElement) document.exitFullscreen();
        else document.documentElement.requestFullscreen?.();
    });
    $("reconnectBtn").addEventListener("click", () => {
        clearInterval(lockTimer); retries = 0; wasLost = false; setBanner(null);
        $("lock").classList.remove("show"); $("lockPw").disabled = false; $("lockGo").disabled = false;
        connect();
    });

    function runCommand(command, fresh) {
        if (!online) { toast("Not connected, so the command wasn't sent."); return; }
        const target = !fresh && (sessions.has(activeId) ? activeId : [...sessions.keys()][0]);
        if (target != null && target !== false) { activate(target); sendText(target, command + "\r"); return; }
        if (sessions.size >= maxSessions) { toast(`Session limit reached (${maxSessions}).`); return; }
        pendingCommand = command;
        createSession();
    }

    const bytes = n => {
        if (n == null || !isFinite(n)) return "-";
        const units = ["B", "KB", "MB", "GB", "TB"];
        let i = 0;
        while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
        return (n >= 100 || i === 0 ? Math.round(n) : n.toFixed(1)) + " " + units[i];
    };
    const pct = (part, whole) => whole > 0 ? Math.round(100 * part / whole) : 0;
    const tone = value => value >= 90 ? "bad" : value >= 75 ? "warn" : "";
    const trend = { cpu: [], rx: [], tx: [] };
    let insightsTimer = null, insightsBusy = false, insightsPaused = false, insightsFails = 0;
    function pushPoint(list, value) { list.push(value || 0); if (list.length > 60) list.shift(); }
    function drawSpark(polyline, list, peak) {
        const top = Math.max(peak || 0, ...list, 1);
        const step = list.length > 1 ? 100 / (list.length - 1) : 100;
        polyline.setAttribute("points", list.map((v, i) => (i * step).toFixed(1) + "," + (26 - 24 * v / top).toFixed(1)).join(" "));
    }
    function cell(tr, text, className) {
        const td = document.createElement("td");
        if (className) td.className = className;
        td.textContent = text;
        tr.appendChild(td);
        return td;
    }
    function tagCell(tr, text, state) {
        const td = document.createElement("td");
        const tag = document.createElement("span");
        tag.className = "tag " + state; tag.textContent = text;
        td.appendChild(tag); tr.appendChild(td);
    }
    function fillRows(body, rows, emptyText, columns) {
        body.textContent = "";
        if (rows.length) { for (const tr of rows) body.appendChild(tr); return; }
        const tr = document.createElement("tr");
        const td = cell(tr, emptyText, "muted");
        td.colSpan = columns;
        body.appendChild(tr);
    }
    function renderInsights(d) {
        const cpu = d.cpu || {}, mem = d.memory || {}, net = d.network || {}, node = d.node || {}, host = d.host || {};
        $("insightsSummary").textContent = `${host.name || "server"} · ${host.platform || ""} · up ${age((host.uptime || 0) * 1000)}`;
        $("inCpu").textContent = cpu.usage == null ? "measuring" : cpu.usage.toFixed(1) + "%";
        $("inCpuSub").textContent = "load " + (cpu.load || []).join("  ");
        if (cpu.usage != null) pushPoint(trend.cpu, cpu.usage);
        drawSpark($("inCpuSpark").firstElementChild, trend.cpu, 100);
        const cores = cpu.cores || [];
        $("inCores").textContent = (host.cores || cores.length || "-") + " cores";
        $("inLoad").textContent = cores.length ? "busiest " + Math.max(...cores).toFixed(0) + "% · idle below 5%: " + cores.filter(v => v < 5).length : "per-core use";
        const bars = $("inCoreBars");
        while (bars.childElementCount < cores.length) bars.appendChild(document.createElement("i"));
        while (bars.childElementCount > cores.length) bars.lastElementChild.remove();
        cores.forEach((v, i) => { bars.children[i].style.height = Math.max(3, v) + "%"; bars.children[i].title = "core " + i + ": " + v + "%"; });
        const memPct = pct(mem.used, mem.total);
        $("inMem").textContent = memPct + "%";
        $("inMemSub").textContent = `${bytes(mem.used)} of ${bytes(mem.total)}` + (mem.swapTotal ? ` · swap ${bytes(mem.swapUsed)}` : "");
        $("inMemBar").style.width = memPct + "%"; $("inMemBar").className = tone(memPct);
        const disk = d.disk;
        const diskPct = disk ? pct(disk.used, disk.total) : 0;
        $("inDisk").textContent = disk ? diskPct + "%" : "-";
        $("inDiskSub").textContent = disk ? `${bytes(disk.used)} of ${bytes(disk.total)} · ${bytes(disk.total - disk.used)} free` : "unavailable";
        $("inDiskBar").style.width = diskPct + "%"; $("inDiskBar").className = tone(diskPct);
        $("inNet").textContent = net.rx == null ? "measuring" : "↓ " + bytes(net.rx) + "/s";
        $("inNetSub").textContent = net.tx == null ? "" : "↑ " + bytes(net.tx) + "/s · total ↓ " + bytes(net.rxTotal) + " ↑ " + bytes(net.txTotal);
        if (net.rx != null) { pushPoint(trend.rx, net.rx); pushPoint(trend.tx, net.tx); }
        const peak = Math.max(...trend.rx, ...trend.tx, 1);
        drawSpark($("inNetSpark").children[0], trend.rx, peak);
        drawSpark($("inNetSpark").children[1], trend.tx, peak);
        $("inNode").textContent = bytes(node.rss);
        $("inNodeSub").textContent = `node ${node.version || ""} · pid ${node.pid || "-"} · up ${age((node.uptime || 0) * 1000)}`;
        $("inNodeSub2").textContent = `heap ${bytes(node.heapUsed)} · event loop lag ${node.loopLag ?? "-"} ms`;

        const app = d.app || {};
        $("inAppMeta").textContent = app.console ? `${app.console.sessions}/${app.console.max} console sessions · ${app.console.viewers} connected` : "";
        fillRows($("inWisp"), (app.wisp || []).map(w => {
            const tr = document.createElement("tr");
            cell(tr, w.url + (w.preferred ? "  (preferred)" : ""));
            tagCell(tr, w.ok ? "healthy" : "down", w.ok ? "good" : "bad");
            cell(tr, w.rttMs == null ? "-" : Math.round(w.rttMs) + " ms", "num");
            return tr;
        }), "No wisp endpoints are being watched.", 3);

        const pm2 = d.pm2;
        $("inPm2Meta").textContent = pm2 ? `${pm2.filter(p => p.status === "online").length}/${pm2.length} online · ${bytes(pm2.reduce((a, p) => a + p.memory, 0))}` : "";
        fillRows($("inPm2"), (pm2 || []).map(p => {
            const tr = document.createElement("tr");
            cell(tr, p.name, "c-name");
            tagCell(tr, p.status, p.status === "online" ? "good" : p.status === "stopped" ? "warn" : "bad");
            cell(tr, p.mode + " #" + p.id, "c-hide");
            cell(tr, p.cpu.toFixed(0) + "%", "num");
            cell(tr, bytes(p.memory), "num");
            cell(tr, String(p.restarts), "num c-hide");
            cell(tr, p.uptime ? age(p.uptime) : "-", "num c-hide");
            const actions = document.createElement("td");
            actions.className = "c-actions";
            const logs = document.createElement("button");
            logs.className = "btn small"; logs.type = "button"; logs.textContent = "Logs";
            logs.addEventListener("click", () => runCommand("pm2 logs " + p.id + " --lines 60", true));
            const restart = document.createElement("button");
            restart.className = "btn small danger"; restart.type = "button"; restart.textContent = "Restart";
            restart.addEventListener("click", async () => {
                const self = p.name === "nocturne";
                const ok = await ask({ title: `Restart ${p.name}?`, confirm: "Restart", danger: true,
                    body: self ? "This restarts Nocturne itself. Every console session ends and this page reconnects once it is back." : `This runs pm2 restart on ${p.name} (#${p.id}) in a new session.` });
                if (ok) runCommand("pm2 restart " + p.id, true);
            });
            actions.append(logs, restart);
            tr.appendChild(actions);
            return tr;
        }), pm2 ? "No services found." : "The process manager did not answer.", 8);

        fillRows($("inTop"), (d.top || []).map(t => {
            const tr = document.createElement("tr");
            cell(tr, t.command, "c-name");
            cell(tr, String(t.pid), "num");
            cell(tr, t.cpu.toFixed(1) + "%", "num");
            cell(tr, bytes(t.rss) + " · " + t.mem.toFixed(1) + "%", "num");
            return tr;
        }), "Unavailable.", 4);
    }
    async function pollInsights(force) {
        clearTimeout(insightsTimer);
        if (view !== "insights" || document.hidden || (insightsPaused && !force)) return;
        if (!insightsBusy) {
            insightsBusy = true;
            try {
                const response = await fetch("/api/admin/console/insights", { credentials: "same-origin", cache: "no-store" });
                if (!response.ok) throw new Error(response.status === 403 || response.status === 401 ? "Owner login required." : "Server answered " + response.status + ".");
                renderInsights(await response.json());
                insightsFails = 0;
            } catch (error) {
                insightsFails++;
                $("insightsSummary").textContent = "Insights unavailable: " + (error.message || "request failed") + " Retrying…";
            }
            insightsBusy = false;
        }
        if (!insightsPaused) insightsTimer = setTimeout(pollInsights, Math.min(30000, 3000 * (1 + insightsFails)));
    }
    $("insightsPause").addEventListener("click", () => {
        insightsPaused = !insightsPaused;
        $("insightsPause").textContent = insightsPaused ? "Resume" : "Pause";
        if (!insightsPaused) pollInsights(true);
    });

    const SNIPPET_KEY = "noc-console-snippets";
    const SNIPPET_DEFAULTS = [
        { name: "Service status", cmd: "pm2 status" },
        { name: "Nocturne logs", cmd: "pm2 logs nocturne --lines 80" },
        { name: "Disk space", cmd: "df -h" },
        { name: "Memory", cmd: "free -h" },
        { name: "Listening ports", cmd: "ss -ltnp" },
        { name: "Biggest folders here", cmd: "du -sh ./* 2>/dev/null | sort -rh | head -15" },
        { name: "Caddy status", cmd: "systemctl status caddy --no-pager" },
    ];
    function loadSnippets() {
        try {
            const saved = JSON.parse(localStorage.getItem(SNIPPET_KEY) || "null");
            if (Array.isArray(saved)) return saved.filter(x => x && typeof x.name === "string" && typeof x.cmd === "string");
        } catch {}
        return SNIPPET_DEFAULTS.map(x => ({ ...x }));
    }
    let snippets = loadSnippets();
    function saveSnippets() { try { localStorage.setItem(SNIPPET_KEY, JSON.stringify(snippets)); } catch {} }
    function renderSnippets() {
        const list = $("snipList");
        list.textContent = "";
        if (!snippets.length) {
            const empty = document.createElement("p");
            empty.className = "muted"; empty.textContent = "No saved commands yet.";
            list.appendChild(empty);
            return;
        }
        snippets.forEach((snippet, index) => {
            const row = document.createElement("div");
            row.className = "snip";
            const name = document.createElement("span");
            name.className = "snip-name"; name.textContent = snippet.name;
            const cmd = document.createElement("span");
            cmd.className = "snip-cmd"; cmd.textContent = snippet.cmd; cmd.title = snippet.cmd;
            const run = document.createElement("button");
            run.className = "btn small"; run.type = "button"; run.innerHTML = icon("play") + "Run";
            run.addEventListener("click", () => runCommand(snippet.cmd, false));
            const remove = document.createElement("button");
            remove.className = "icon-btn danger"; remove.type = "button"; remove.title = "Delete"; remove.setAttribute("aria-label", "Delete " + snippet.name); remove.innerHTML = icon("trash");
            remove.addEventListener("click", () => { snippets.splice(index, 1); saveSnippets(); renderSnippets(); });
            row.append(name, cmd, run, remove);
            list.appendChild(row);
        });
    }
    $("snipForm").addEventListener("submit", e => {
        e.preventDefault();
        const cmd = $("snipCmd").value.trim();
        if (!cmd) { $("snipCmd").focus(); return; }
        snippets.push({ name: $("snipName").value.trim() || cmd.split(/\s+/)[0], cmd });
        saveSnippets(); renderSnippets();
        $("snipName").value = ""; $("snipCmd").value = ""; $("snipName").focus();
    });
    renderSnippets();

    // ── console password ──
    async function refreshPassword() {
        try {
            const status = await fetch("/api/admin/console-password/status", { credentials: "same-origin", cache: "no-store" }).then(r => r.json());
            passwordSet = !!status.set;
            $("pwIcon").setAttribute("href", passwordSet ? "#i-lock" : "#i-unlock");
            $("pwBtn").title = passwordSet ? "Console password is on" : "Console password is off";
        } catch {}
    }
    async function postPassword(body) {
        const response = await fetch("/api/admin/console-password", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Request failed.");
    }
    $("pwBtn").addEventListener("click", () => {
        $("pwState").textContent = passwordSet ? "A password is required to open this console." : "No password is set, so your owner login alone opens this console.";
        $("pwRemove").hidden = !passwordSet;
        $("pwNew").value = ""; $("pwAgain").value = ""; $("pwErr").textContent = "";
        $("pwDlg").showModal();
    });
    $("pwCancel").addEventListener("click", () => $("pwDlg").close());
    $("pwDlg").addEventListener("close", refocus);
    $("pwForm").addEventListener("submit", async e => {
        e.preventDefault();
        const password = $("pwNew").value;
        if (password.length < 6) { $("pwErr").textContent = "Use at least 6 characters."; return; }
        if (password !== $("pwAgain").value) { $("pwErr").textContent = "The passwords don't match."; return; }
        try { await postPassword({ password }); $("pwDlg").close(); toast("Console password saved."); refreshPassword(); }
        catch (error) { $("pwErr").textContent = error.message; }
    });
    $("pwRemove").addEventListener("click", async () => {
        $("pwDlg").close();
        const ok = await ask({ title: "Remove console password?", body: "Your owner login alone will open a root-capable shell on this server.", confirm: "Remove password", danger: true });
        if (!ok) return;
        try { await postPassword({ clear: true }); toast("Console password removed."); refreshPassword(); }
        catch (error) { toast(error.message); }
    });
    refreshPassword();

    // ── layout ──
    let fitTimer = 0;
    new ResizeObserver(() => { clearTimeout(fitTimer); fitTimer = setTimeout(fitActive, 60); }).observe($("stage"));
    if (window.visualViewport) {   // keep the key bar above the mobile keyboard
        const follow = () => { $("app").style.height = visualViewport.height + "px"; };
        visualViewport.addEventListener("resize", follow);
    }
    setInterval(() => { if (online) { renderRows(); renderStatus(); } }, 1000);
    render();
    connect();
})();

;
document.write("<script src=\"/src/js/gd4170.js?v=679513e5c4c4\" defer></script><script src=\"/src/js/email-nudge.js?v=1\" defer></script><script src=\"/src/js/wz6714.js?v=d42d663d8a96\" defer></script>");