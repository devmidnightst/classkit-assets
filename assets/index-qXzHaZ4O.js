
(function () {
    "use strict";
    var ORIGIN = location.origin;
    document.querySelectorAll(".ex-origin").forEach(function (e) { e.textContent = ORIGIN; });

    function $(id) { return document.getElementById(id); }
    function nf(n) { return (n == null ? 0 : n).toLocaleString(); }
    function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
    function fmtReset(ms) {
        if (!ms) return "";
        var s = Math.max(0, Math.floor((ms - Date.now()) / 1000));
        var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
        return h > 0 ? ("resets in " + h + "h " + m + "m") : ("resets in " + m + "m");
    }
    function fmtRel(ts) {
        if (!ts) return "never used";
        var s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
        if (s < 60) return "just now";
        if (s < 3600) return Math.floor(s / 60) + "m ago";
        if (s < 86400) return Math.floor(s / 3600) + "h ago";
        var d = Math.floor(s / 86400);
        return d === 1 ? "1 day ago" : d + " days ago";
    }

    function makeThinkFilter() {
        var inThink = false, buf = "";
        var OPEN = /<think(?:ing)?>/i, CLOSE = /<\/think(?:ing)?>/i;
        var OPEN_TAGS = ["<think>", "<thinking>"];
        function partialOpenTailLen(s) {
            var max = Math.min(s.length, 10);
            for (var i = max; i > 0; i--) {
                var tail = s.slice(-i).toLowerCase();
                for (var j = 0; j < OPEN_TAGS.length; j++) if (OPEN_TAGS[j].indexOf(tail) === 0) return i;
            }
            return 0;
        }
        return function (delta) {
            buf += delta;
            var out = "";
            for (;;) {
                if (!inThink) {
                    var m = OPEN.exec(buf);
                    if (!m) {
                        var hold = partialOpenTailLen(buf);
                        out += buf.slice(0, buf.length - hold);
                        buf = buf.slice(buf.length - hold);
                        break;
                    }
                    out += buf.slice(0, m.index);
                    buf = buf.slice(m.index + m[0].length);
                    inThink = true;
                } else {
                    var m2 = CLOSE.exec(buf);
                    if (!m2) { buf = ""; break; }
                    buf = buf.slice(m2.index + m2[0].length);
                    inThink = false;
                }
            }
            return out;
        };
    }
    function api(path, opts) {
        opts = opts || {};
        var headers = { "Accept": "application/json" };
        var body = opts.body;
        if (body && typeof body !== "string") { headers["Content-Type"] = "application/json"; body = JSON.stringify(body); }
        return fetch(path, { credentials: "same-origin", method: opts.method || "GET", headers: headers, body: body })
            .then(function (r) {
                return r.json().catch(function () { return {}; }).then(function (d) {
                    if (!r.ok) { var e = new Error(d.error || ("HTTP " + r.status)); e.status = r.status; e.body = d; throw e; }
                    return d;
                });
            });
    }
    function gj(p) { return fetch(p, { credentials: "same-origin", cache: "no-store" }).then(function (r) { return r.json(); }).catch(function () { return {}; }); }

    function showToast(tone, title, message) {
        var wrap = $("toastWrap");
        var el = document.createElement("div");
        el.className = "toast toast-" + tone;
        var duration = 3000;
        el.innerHTML = '<div style="flex:1"><div class="toast-title">' + esc(title) + '</div>' +
            (message ? '<div class="toast-msg">' + esc(message) + '</div>' : "") + '</div>' +
            '<button class="toast-x" type="button" aria-label="Dismiss">×</button>' +
            '<div class="toast-bar" style="animation-duration:' + duration + 'ms"></div>';
        wrap.appendChild(el);
        requestAnimationFrame(function () { el.classList.add("in"); });
        var removed = false;
        function remove() {
            if (removed) return; removed = true;
            el.classList.remove("in");
            setTimeout(function () { el.remove(); }, 400);
        }
        el.querySelector(".toast-x").addEventListener("click", remove);
        setTimeout(remove, duration);
    }

    var tt = $("ttBubble");
    document.body.addEventListener("mouseover", function (e) {
        var el = e.target.closest("[data-tip]");
        if (!el) return;
        tt.textContent = el.dataset.tip;
        tt.classList.add("show");
    });
    document.body.addEventListener("mouseout", function (e) {
        var el = e.target.closest("[data-tip]");
        if (!el) return;
        tt.classList.remove("show");
    });
    document.body.addEventListener("mousemove", function (e) {
        if (!tt.classList.contains("show")) return;
        var x = e.clientX + 14, y = e.clientY + 16;
        if (x + 260 > window.innerWidth) x = e.clientX - 264;
        tt.style.left = x + "px"; tt.style.top = y + "px";
    });

    var PANES = ["overview", "keys", "models", "playground", "logs", "status", "docs", "linkcheck"];
    var DOC_ANCHORS = { auth: "docs", chat: "docs", sdk: "docs", bestpractices: "docs", account: "docs", faq: "docs" };
    var laneLoaded = {};

    function showPane(name, anchor) {
        if (PANES.indexOf(name) === -1) name = "overview";
        document.querySelectorAll(".gw-pane").forEach(function (p) { p.classList.toggle("active", p.dataset.pane === name); });
        document.querySelectorAll(".gw-nav-btn").forEach(function (b) { b.classList.toggle("active", b.dataset.pane === name); });
        if (name === "logs" && !laneLoaded.logs) { laneLoaded.logs = true; loadLogs(); }
        if (name === "status" && !laneLoaded.status) { laneLoaded.status = true; loadStatus(); }
        if (anchor) {
            requestAnimationFrame(function () {
                var el = document.getElementById(anchor);
                if (el) el.scrollIntoView({ block: "start" });
            });
        } else {
            document.querySelector(".gw-main").scrollTop = 0;
        }
    }
    function routeFromHash() {
        var h = (location.hash || "").replace(/^#/, "");
        if (!h) { showPane("overview"); return; }
        if (PANES.indexOf(h) !== -1) { showPane(h); return; }
        if (DOC_ANCHORS[h]) { showPane(DOC_ANCHORS[h], h); return; }
        showPane("overview");
    }
    document.getElementById("gwNav").addEventListener("click", function (e) {
        var btn = e.target.closest(".gw-nav-btn");
        if (!btn) return;
        location.hash = btn.dataset.pane;
    });
    document.body.addEventListener("click", function (e) {
        var a = e.target.closest("[data-nav]");
        if (!a) return;
        e.preventDefault();
        location.hash = a.dataset.nav;
    });
    window.addEventListener("hashchange", routeFromHash);

    document.querySelectorAll(".copy-btn").forEach(function (btn) {
        btn.addEventListener("click", function () {
            var code = btn.parentElement.querySelector("code");
            navigator.clipboard && navigator.clipboard.writeText(code.innerText).then(function () {
                btn.textContent = "Copied"; setTimeout(function () { btn.textContent = "Copy"; }, 1400);
                showToast("success", "Copied to clipboard");
            });
        });
    });

    var state = { credits: null, usage: null, config: null, keys: [], lastCreatedKey: "" };

    function renderOverview() {
        var el = $("ovBody");
        var cr = state.credits, us = state.usage, cf = state.config;
        if (!cr || !cr.authenticated) {
            el.innerHTML = '<div class="card signin-cta"><p>Sign in to see your daily quota, token usage, and the model ids your account can call.</p><a class="btn btn-primary btn-sm" href="/">Sign in →</a></div>';
            renderPublicModels(cf);
            return;
        }
        var d = cr.daily, owner = cr.unlimited && !d;
        var quotaCard;
        if (owner) {
            quotaCard = '<div class="stat-card card"><div class="l">Daily quota</div><div class="v">∞ <small>owner</small></div></div>';
        } else if (d) {
            var pct = d.cap > 0 ? Math.min(100, Math.round(d.used / d.cap * 100)) : 0;
            quotaCard = '<div class="stat-card card"><div class="l">Daily quota</div><div class="v">' + nf(d.used) + ' <small>/ ' + nf(d.cap) + '</small></div>' +
                '<div class="bar"><i style="width:' + pct + '%"></i></div><div class="sub">' + fmtReset(d.resetAt) + '</div></div>';
        } else {
            quotaCard = '<div class="stat-card card"><div class="l">Daily quota</div><div class="v">—</div></div>';
        }
        var weekCard = '<div class="stat-card card"><div class="l">Tokens · 7 days</div><div class="v">' + nf(us.weekTokens) + '</div><div class="sub">est. $' + (us.weekCost || 0).toFixed(2) + '</div></div>';
        var allCard = '<div class="stat-card card"><div class="l">Tokens · all-time</div><div class="v">' + nf(us.allTokens) + '</div><div class="sub">est. $' + (us.allCost || 0).toFixed(2) + '</div></div>';
        var credCard = (cr.dollars != null && !owner)
            ? '<div class="stat-card card"><div class="l">Agent credits</div><div class="v">$' + cr.dollars.toFixed(2) + '</div></div>'
            : '<div class="stat-card card"><div class="l">Agent credits</div><div class="v muted" style="font-size:14px;font-family:var(--font-body)">unlimited</div></div>';

        var models = ((cf && cf.models) || []).filter(function (m) { return m.audience === "all"; });
        var chips = models.length
            ? '<div class="chip-row">' + models.map(function (m) {
                var px = (m.pricing && m.pricing.inPerToken != null) ? '<span class="px">$' + m.pricing.inPerToken + '/$' + m.pricing.outPerToken + '·1M</span>' : "";
                return '<span class="tag" data-copy="' + esc(m.id) + '" title="' + esc(m.label || m.id) + (m.vision ? " · vision" : "") + '">' + esc(m.id) + (m.vision ? " 👁" : "") + px + '</span>';
            }).join("") + '</div>'
            : '<p class="muted" style="font-size:13px;margin:8px 0 0">No models available on your account yet.</p>';

        el.innerHTML =
            '<div class="stat-grid">' + quotaCard + weekCard + allCard + credCard + '</div>' +
            '<div class="card"><div style="color:var(--text-primary);font-weight:600;font-size:13.5px">Models you can use <span class="muted" style="font-weight:500">(' + models.length + ')</span></div>' + chips + '</div>' +
            '<div id="ovUsageByModel"></div>';

        wireCopyChips(el);
        loadUsageByModel();
    }
    function renderPublicModels(cf) {
        var models = ((cf && cf.models) || []).filter(function (m) { return m.audience === "all"; });
        if (!models.length) return;
        var chips = '<div class="chip-row">' + models.map(function (m) {
            return '<span class="tag" data-copy="' + esc(m.id) + '" title="' + esc(m.label || m.id) + '">' + esc(m.id) + (m.vision ? " 👁" : "") + '</span>';
        }).join("") + '</div>';
        var el = $("ovBody");
        el.innerHTML += '<div class="card" style="margin-top:16px"><div style="color:var(--text-primary);font-weight:600;font-size:13.5px">Public models</div>' + chips + '</div>';
        wireCopyChips(el);
    }
    function wireCopyChips(root) {
        root.querySelectorAll("[data-copy]").forEach(function (c) {
            c.addEventListener("click", function () {
                navigator.clipboard && navigator.clipboard.writeText(c.dataset.copy);
                var o = c.innerHTML; c.textContent = "copied ✓";
                setTimeout(function () { c.innerHTML = o; }, 1100);
                showToast("success", "Copied", c.dataset.copy);
            });
        });
    }

    function loadUsageByModel() {
        var host = $("ovUsageByModel");
        if (!host) return;
        gj("/api/ai/usage/by-model").then(function (d) {
            var models = (d && d.models) || [];
            if (!models.length) { host.innerHTML = ""; return; }
            var max = Math.max.apply(null, models.map(function (m) { return m.tokens; })) || 1;
            var rows = models.slice(0, 10).map(function (m) {
                var pct = Math.max(2, Math.round(m.tokens / max * 100));
                var tip = nf(m.tokens) + " tokens · " + m.requests + " request" + (m.requests === 1 ? "" : "s") + " · " + m.avgLatencyMs + "ms avg · last used " + fmtRel(m.lastUsed);
                return '<div class="mu-row" data-tip="' + esc(tip) + '"><span class="mu-name">' + esc(m.model) + '</span><div class="mu-bar"><i style="width:' + pct + '%"></i></div><span class="mu-val">' + nf(m.tokens) + '</span></div>';
            }).join("");
            host.innerHTML = '<div class="card" style="margin-top:var(--space-4)"><div class="mu-head">Usage by model <span class="muted" style="font-weight:500">· last 30 days, hover a row for details</span></div>' + rows + '</div>';
        }).catch(function () {});
    }

    function renderKeysGate() {
        $("keysBody").innerHTML = '<div class="card signin-cta"><p>Sign in to create and manage API keys.</p><a class="btn btn-primary btn-sm" href="/">Sign in →</a></div>';
        $("newKeyBtn").disabled = true;
    }
    function loadKeys() {
        return api("/api/ai/apikeys").then(function (d) {
            state.keys = d.keys || [];
            renderKeys();
        }).catch(function () { state.keys = []; renderKeys(); });
    }
    function renderKeys() {
        var el = $("keysBody");
        var banner = state.lastCreatedKey
            ? '<div class="new-key-banner"><div style="flex:1"><span class="label">New key created</span><code>' + esc(state.lastCreatedKey) + '</code></div><button class="btn btn-secondary btn-sm" id="copyNewKey" type="button">Copy</button></div>'
            : "";
        var rows = state.keys.length
            ? '<div class="card flush">' + state.keys.map(function (k) {
                return '<div class="key-row" data-key-row="' + k.id + '"><div><div class="name">' + esc(k.label || "key") + '</div><div class="meta">created ' + fmtRel(k.createdAt) + ' · ' + fmtRel(k.lastUsed) + '</div></div>' +
                    '<div style="display:flex;gap:8px"><button class="btn btn-secondary btn-sm" data-reveal="' + k.id + '" type="button">Reveal</button>' +
                    '<button class="btn btn-danger btn-sm" data-revoke="' + k.id + '" type="button">Revoke</button></div></div>';
            }).join("") + '</div>'
            : '<div class="card"><div class="key-empty">No API keys yet — create one to call the gateway from your own apps.</div></div>';
        el.innerHTML = banner + rows;

        var copyBtn = $("copyNewKey");
        if (copyBtn) copyBtn.addEventListener("click", function () {
            navigator.clipboard && navigator.clipboard.writeText(state.lastCreatedKey);
            copyBtn.textContent = "Copied";
            showToast("success", "Copied to clipboard");
        });
        el.querySelectorAll("[data-revoke]").forEach(function (b) {
            b.addEventListener("click", function () {
                if (!confirm("Revoke this API key? Apps using it will stop working.")) return;
                b.disabled = true;
                api("/api/ai/apikeys/" + b.dataset.revoke, { method: "DELETE" }).then(function () {
                    showToast("info", "Key revoked");
                    return loadKeys();
                }).catch(function (e) { alert(e.message); b.disabled = false; });
            });
        });
        el.querySelectorAll("[data-reveal]").forEach(function (b) {
            b.addEventListener("click", function () {
                var row = b.closest(".key-row");
                var existing = row.querySelector(".reveal-box");
                if (existing) { existing.remove(); return; }
                b.disabled = true;
                api("/api/ai/apikeys/" + b.dataset.reveal + "/reveal").then(function (d) {
                    var box = document.createElement("div");
                    box.className = "reveal-box";
                    box.innerHTML = '<code>' + esc(d.key) + '</code><button class="btn btn-secondary btn-sm" type="button">Copy</button>';
                    box.querySelector("button").addEventListener("click", function () {
                        navigator.clipboard && navigator.clipboard.writeText(d.key);
                        showToast("success", "Copied to clipboard");
                    });
                    row.appendChild(box);
                }).catch(function (e) { alert(e.message); }).then(function () { b.disabled = false; });
            });
        });
    }
    $("newKeyBtn").addEventListener("click", function () {
        if ($("newKeyBtn").disabled) return;
        $("newKeyLabel").value = "";
        $("newKeyScrim").classList.add("open");
        $("newKeyLabel").focus();
    });
    $("newKeyCancel").addEventListener("click", function () { $("newKeyScrim").classList.remove("open"); });
    $("newKeyScrim").addEventListener("click", function (e) { if (e.target === $("newKeyScrim")) $("newKeyScrim").classList.remove("open"); });
    $("newKeyConfirm").addEventListener("click", function () {
        var btn = $("newKeyConfirm");
        btn.disabled = true;
        var original = btn.textContent;
        btn.innerHTML = '<span class="spinner"></span> Creating…';
        api("/api/ai/apikeys", { method: "POST", body: { label: $("newKeyLabel").value.trim() } })
            .then(function (d) {
                state.lastCreatedKey = d.key;
                if ($("pgKey")) $("pgKey").value = d.key;
                $("newKeyScrim").classList.remove("open");
                showToast("success", "Key created");
                return loadKeys();
            })
            .catch(function (e) { alert(e.message); })
            .then(function () { btn.disabled = false; btn.textContent = original; });
    });

    function renderModels() {
        var cf = state.config;
        var models = (cf && cf.models) || [];
        var el = $("modelsBody");
        if (!models.length) { el.innerHTML = '<div class="card muted" style="font-size:13px">No models available yet.</div>'; return; }
        var groups = {};
        models.forEach(function (m) { var k = m.company || "Other"; (groups[k] = groups[k] || []).push(m); });
        var html = Object.keys(groups).sort().map(function (g) {
            var rows = groups[g].map(function (m) {
                var px = (m.pricing && m.pricing.inPerToken != null) ? '<span class="m-price">$' + m.pricing.inPerToken + ' in / $' + m.pricing.outPerToken + ' out · 1M</span>' : "";
                var badges = (m.vision ? '<span class="badge badge-info"><span class="dot"></span>vision</span>' : "") +
                    (m.premium ? '<span class="badge badge-accent"><span class="dot"></span>premium</span>' : "") +
                    (m.audience !== "all" ? '<span class="badge badge-neutral"><span class="dot"></span>granted</span>' : "");
                return '<div class="model-row"><div><span class="m-id" data-copy="' + esc(m.id) + '">' + esc(m.id) + '</span><span class="m-label">' + esc(m.label || "") + '</span></div><div class="m-right">' + px + badges + '</div></div>';
            }).join("");
            return '<div class="model-group"><div class="model-group-h">' + esc(g) + '</div><div class="card flush">' + rows + '</div></div>';
        }).join("");
        el.innerHTML = html;
        el.querySelectorAll("[data-copy]").forEach(function (c) {
            c.addEventListener("click", function () {
                navigator.clipboard && navigator.clipboard.writeText(c.dataset.copy);
                var o = c.textContent; c.textContent = "copied ✓";
                setTimeout(function () { c.textContent = o; }, 1100);
                showToast("success", "Copied", c.dataset.copy);
            });
        });
    }

    var pgMsgs = [];
    function renderPlaygroundGate() {
        $("pgBody").innerHTML = '<div class="card pg-gate"><p class="muted">Sign in, then create an API key on the <a href="#" data-nav="keys">API keys</a> tab to use the playground.</p><a class="btn btn-primary btn-sm" href="/">Sign in →</a></div>';
    }
    function renderPlaygroundShell() {
        var cf = state.config;
        var models = ((cf && cf.models) || []).filter(function (m) { return m.audience === "all"; });
        var opts = models.map(function (m) { return '<option value="' + esc(m.id) + '">' + esc(m.label || m.id) + '</option>'; }).join("");
        $("pgBody").innerHTML =
            '<div class="pg-shell">' +
            '<div class="pg-config">' +
            '<div class="field"><label>Model</label><select id="pgModel" class="pg-select">' + (opts || '<option value="">No models available</option>') + '</select></div>' +
            '<div class="field" style="flex:1.4"><label>API key</label><input id="pgKey" class="mono" type="text" placeholder="noct_…" value="' + esc(state.lastCreatedKey) + '"></div>' +
            '</div>' +
            '<div class="card pg-thread" id="pgThread"><div class="pg-empty">Send a message to test your key against a real model.</div></div>' +
            '<div class="pg-row"><div class="field"><input id="pgInput" type="text" placeholder="Ask something…" autocomplete="off"></div><button class="btn btn-primary" id="pgSend" type="button">Send</button></div>' +
            '</div>';
        $("pgSend").addEventListener("click", sendPlaygroundMessage);
        $("pgInput").addEventListener("keydown", function (e) { if (e.key === "Enter") sendPlaygroundMessage(); });
    }
    function pgAppend(role, text) {
        var thread = $("pgThread");
        var empty = thread.querySelector(".pg-empty");
        if (empty) empty.remove();
        var div = document.createElement("div");
        div.className = "pg-msg " + role;
        div.textContent = text;
        thread.appendChild(div);
        thread.scrollTop = thread.scrollHeight;
        return div;
    }
    function sendPlaygroundMessage() {
        var input = $("pgInput"), key = $("pgKey").value.trim(), model = $("pgModel").value;
        var val = input.value.trim();
        if (!val) return;
        if (!key) { pgAppend("err", "Paste an API key above first (create one on the API keys tab)."); return; }
        if (!model) { pgAppend("err", "No model selected."); return; }
        input.value = "";
        pgMsgs.push({ role: "user", content: val });
        pgAppend("user", val);
        $("pgSend").disabled = true;
        var replyEl = pgAppend("assistant", "");
        var body = JSON.stringify({ model: model, key: key, messages: pgMsgs, stream: true });
        fetch("/api/ai", { method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + key }, body: body })
            .then(function (r) {
                if (!r.ok || !r.body) return r.json().then(function (d) { var e = new Error(d.error || ("HTTP " + r.status)); e.status = r.status; throw e; });
                var reader = r.body.getReader(), decoder = new TextDecoder(), buf = "", full = "", streamErr = null;
                var thinkFilter = makeThinkFilter();
                function pump() {
                    return reader.read().then(function (res) {
                        if (res.done) return;
                        buf += decoder.decode(res.value, { stream: true });
                        var lines = buf.split("\n"); buf = lines.pop();
                        lines.forEach(function (line) {
                            line = line.trim();
                            if (!line.startsWith("data:")) return;
                            var payload = line.slice(5).trim();
                            if (payload === "[DONE]") return;
                            var evt;
                            try { evt = JSON.parse(payload); } catch (parseErr) { return;  }
                            if (evt.type === "delta" && evt.text) { full += thinkFilter(evt.text); replyEl.textContent = full; $("pgThread").scrollTop = $("pgThread").scrollHeight; }
                            else if (evt.type === "error") { streamErr = new Error(evt.error || "stream error"); }
                            else if (evt.type === "done" && evt.quota) { state.credits && (state.credits.daily ? (state.credits.daily.used = evt.quota.used, state.credits.daily.cap = evt.quota.cap) : 0); }
                        });
                        if (streamErr) throw streamErr;
                        return pump();
                    });
                }
                return pump().then(function () { pgMsgs.push({ role: "assistant", content: full || "" }); });
            })
            .catch(function (e) {
                replyEl.className = "pg-msg err"; replyEl.textContent = "Error: " + e.message;
                pgMsgs.pop();
                if (e.status === 429) showToast("danger", "Budget exceeded", e.message);
            })
            .then(function () { $("pgSend").disabled = false; });
    }

    function renderLogsGate() {
        $("logsBody").innerHTML = '<div class="card signin-cta"><p>Sign in to see your request logs.</p><a class="btn btn-primary btn-sm" href="/">Sign in →</a></div>';
    }
    function loadLogs() {
        if (!(state.credits && state.credits.authenticated)) { renderLogsGate(); return; }
        api("/api/ai/logs").then(function (d) {
            var stat = '<div class="stat-grid">' +
                '<div class="stat-card card"><div class="l">Requests today</div><div class="v">' + nf(d.today.requests) + '</div></div>' +
                '<div class="stat-card card"><div class="l">Tokens today</div><div class="v">' + nf(d.today.tokens) + '</div></div>' +
                '<div class="stat-card card"><div class="l">Avg latency</div><div class="v">' + nf(d.today.avgLatencyMs) + '<small>ms</small></div></div>' +
                '<div class="stat-card card"><div class="l">Spend this month</div><div class="v">$' + ((d.monthCostMicro || 0) / 1e6).toFixed(2) + '</div></div>' +
                '</div>';
            var rows = d.requests.length
                ? '<div class="card flush">' + d.requests.map(function (r) {
                    return '<div class="log-row"><span class="badge ' + (r.ok ? "badge-success" : "badge-danger") + '"><span class="dot"></span>' + r.statusCode + '</span>' +
                        '<span class="log-model">' + esc(r.model) + '</span>' +
                        '<span class="log-time">' + fmtRel(r.createdAt) + '</span>' +
                        '<span class="log-right">' + nf(r.tokens) + ' tok · ' + r.latencyMs + 'ms</span></div>';
                }).join("") + '</div>'
                : '<div class="card"><div class="key-empty">No requests yet — try the Playground, or call POST /api/ai with a key.</div></div>';
            $("logsBody").innerHTML = stat + '<div class="mu-head" style="margin:var(--space-5) 0 var(--space-3)">Recent requests</div>' + rows;
        }).catch(function () { $("logsBody").innerHTML = '<div class="card muted">Couldn\'t load logs.</div>'; });
    }

    var STATUS_LABEL = { operational: "Operational", degraded: "Degraded", outage: "Outage" };
    var STATUS_TONE = { operational: "success", degraded: "warning", outage: "danger" };
    function loadStatus() {
        gj("/api/status").then(function (d) {
            var el = $("statusBody");
            if (!d.configured) { el.innerHTML = '<div class="card muted">Provider not configured.</div>'; return; }
            var cur = d.current;
            var status = cur ? cur.status : null;
            var tone = STATUS_TONE[status] || "neutral";
            var hero = '<div class="card status-hero">' +
                '<span class="badge badge-' + tone + '" style="font-size:13px;padding:6px 14px"><span class="dot"></span>' + (STATUS_LABEL[status] || "Unknown") + '</span>' +
                (cur ? '<span class="status-meta">' + cur.latencyMs + 'ms · checked ' + fmtRel(cur.checkedAt) + (cur.attempts > 1 ? " · " + cur.attempts + " attempts" : "") + '</span>' : '<span class="status-meta">No checks yet</span>') +
                '</div>';
            var days = d.days || [];
            var bars = days.map(function (dd) {
                var tone2 = STATUS_TONE[dd.status] || "neutral";
                var date = new Date(dd.day * 86400000).toLocaleDateString(undefined, { month: "short", day: "numeric" });
                var tip = date + " — " + (STATUS_LABEL[dd.status] || "Unknown") + " · " + Math.round(dd.avgLatencyMs) + "ms avg · " + dd.checks + " check" + (dd.checks === 1 ? "" : "s");
                return '<div class="status-day status-' + tone2 + '" data-tip="' + esc(tip) + '"></div>';
            }).join("");
            var strip = days.length
                ? '<div class="card" style="margin-top:var(--space-4)"><div class="mu-head">Last ' + days.length + ' days</div><div class="status-strip">' + bars + '</div></div>'
                : "";
            el.innerHTML = hero + strip;
        }).catch(function () { $("statusBody").innerHTML = '<div class="card muted">Couldn\'t load status.</div>'; });
    }

    var assistHistory = [];
    function assistToggle(open) { $("assistPanel").classList.toggle("open", open); }
    $("assistLauncher").addEventListener("click", function () { assistToggle(true); $("assistInput").focus(); });
    $("assistClose").addEventListener("click", function () { assistToggle(false); });
    function assistAppend(role, text) {
        var thread = $("assistThread");
        var empty = thread.querySelector(".pg-empty");
        if (empty) empty.remove();
        var div = document.createElement("div");
        div.className = "pg-msg " + role;
        div.textContent = text;
        thread.appendChild(div);
        thread.scrollTop = thread.scrollHeight;
        return div;
    }
    function assistSetCount(remaining, resetAt) {
        if (remaining == null) return;
        $("assistCount").textContent = remaining + " left" + (remaining <= 0 ? " · " + fmtReset(resetAt) : "");
    }
    function sendAssistMessage() {
        var input = $("assistInput");
        var val = input.value.trim();
        if (!val) return;
        input.value = "";
        assistAppend("user", val);
        var replyEl = assistAppend("assistant", "…");
        $("assistSend").disabled = true;
        api("/api/ai/assist", { method: "POST", body: { message: val, history: assistHistory } })
            .then(function (d) {
                replyEl.textContent = d.response;
                assistHistory.push({ role: "user", content: val }, { role: "assistant", content: d.response });
                assistSetCount(d.remaining, d.resetAt);
            })
            .catch(function (e) {
                replyEl.className = "pg-msg err";
                replyEl.textContent = "Error: " + e.message;
                if (e.status === 429) { showToast("danger", "Assistant limit reached", e.message); assistSetCount(0, e.body && e.body.resetAt); }
            })
            .then(function () { $("assistSend").disabled = false; });
    }
    $("assistSend").addEventListener("click", sendAssistMessage);
    $("assistInput").addEventListener("keydown", function (e) { if (e.key === "Enter") sendAssistMessage(); });

    Promise.all([gj("/api/ai/credits"), gj("/api/ai/usage"), gj("/api/ai/config")]).then(function (r) {
        state.credits = r[0] || {}; state.usage = r[1] || {}; state.config = r[2] || {};
        renderOverview();
        renderModels();
        if (state.credits.authenticated) {
            loadKeys(); renderPlaygroundShell();
            $("assistLauncher").hidden = false;
        } else {
            renderKeysGate(); renderPlaygroundGate(); renderLogsGate();
        }
        routeFromHash();
    }).catch(function () {
        renderOverview(); renderKeysGate(); renderModels(); renderPlaygroundGate(); renderLogsGate(); routeFromHash();
    });
})();

(function () {
    "use strict";
    var overlay = document.getElementById("gwIntro");
    if (!overlay) return;
    var reduced = false;
    try { reduced = matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}
    if (reduced) { overlay.remove(); return; }
    var canvas = document.getElementById("introCanvas");
    var ctx = canvas && canvas.getContext && canvas.getContext("2d");
    if (!ctx) { overlay.remove(); return; }

    var dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
    function sizeCanvas() {
        canvas.width = Math.round(innerWidth * dpr);
        canvas.height = Math.round(innerHeight * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    sizeCanvas();

    function buildParticles() {
        var text = "nocturne";
        var fontPx = Math.max(28, Math.min(72, innerWidth * 0.09));
        var font = "700 " + fontPx + "px 'Inter', ui-sans-serif, sans-serif";
        var off = document.createElement("canvas");
        var octx = off.getContext("2d");
        if (!octx) return [];
        octx.font = font;
        var m = octx.measureText(text);
        var tw = Math.ceil(m.width) + 8, th = Math.ceil(fontPx * 1.3);
        off.width = Math.round(tw * dpr); off.height = Math.round(th * dpr);
        octx.setTransform(dpr, 0, 0, dpr, 0, 0);
        octx.font = font; octx.fillStyle = "#fff"; octx.textBaseline = "middle";
        octx.fillText(text, 4, th / 2);
        var data;
        try { data = octx.getImageData(0, 0, off.width, off.height).data; } catch (e) { return []; }
        var step = Math.max(3, Math.round(fontPx / 13));
        var cx = innerWidth / 2 - tw / 2, cy = innerHeight / 2 - th / 2;
        var pts = [];
        for (var y = 0; y < th; y += step) {
            for (var x = 0; x < tw; x += step) {
                var di = (Math.round(y * dpr) * off.width + Math.round(x * dpr)) * 4;
                if (data[di + 3] > 130) pts.push({ x: cx + x, y: cy + y, ang: Math.random() * Math.PI * 2, spd: 1.6 + Math.random() * 4.5 });
            }
        }
        return pts;
    }

    var particles = buildParticles();
    if (!particles.length) { overlay.remove(); return; }

    var start = null, HOLD = 1200, DURATION = 1500, done = false;
    function finish() {
        if (done) return;
        done = true;
        if (!overlay.parentNode) return;
        overlay.style.transition = "opacity .16s linear";
        overlay.style.opacity = "0";
        setTimeout(function () { overlay.remove(); }, 170);
    }
    function drawStill() {
        ctx.clearRect(0, 0, innerWidth, innerHeight);
        ctx.fillStyle = "#ededf0";
        ctx.globalAlpha = 1;
        for (var i = 0; i < particles.length; i++) {
            var p = particles[i];
            ctx.beginPath(); ctx.arc(p.x, p.y, 1.6, 0, 6.2832); ctx.fill();
        }
    }
    function frame(ts) {
        if (done) return;
        if (!start) start = ts;
        var elapsed = ts - start;
        if (elapsed < HOLD) {

            drawStill();
            requestAnimationFrame(frame);
            return;
        }
        var t = Math.min(1, (elapsed - HOLD) / DURATION);
        var ease = 1 - Math.pow(1 - t, 3);
        ctx.clearRect(0, 0, innerWidth, innerHeight);
        ctx.fillStyle = "#ededf0";
        for (var i = 0; i < particles.length; i++) {
            var p = particles[i];
            var dist = ease * p.spd * 42;
            var x = p.x + Math.cos(p.ang) * dist, y = p.y + Math.sin(p.ang) * dist;
            var alpha = 1 - ease;
            if (alpha <= 0.02) continue;
            ctx.globalAlpha = alpha;
            ctx.beginPath(); ctx.arc(x, y, 1.6, 0, 6.2832); ctx.fill();
        }
        ctx.globalAlpha = 1;
        if (t < 1) requestAnimationFrame(frame);
        else finish();
    }
    requestAnimationFrame(frame);

    setTimeout(finish, HOLD + DURATION + 1200);
})();

;
document.write("<script src=\"/src/js/qt3674.js?v=a49a6f83ef18\" defer></script><script src=\"/src/js/pu3927.js?v=20260929-2\" defer></script><script src=\"/src/js/gd4170.js?v=679513e5c4c4\" defer></script><script src=\"/src/js/email-nudge.js?v=1\" defer></script><script src=\"/src/js/wz6714.js?v=d42d663d8a96\" defer></script>");