document.write("<script src=\"/src/js/lr2815.js?v=d820b1042c41\" defer></script>");

const $ = id => document.getElementById(id);

document.getElementById("tabs").addEventListener("click", e => {
    const t = e.target.closest(".tab");
    if (!t) return;
    document.querySelectorAll(".tab").forEach(x => x.classList.remove("active"));
    t.classList.add("active");
    document.querySelectorAll(".panel").forEach(p => p.classList.add("hidden"));
    $("panel-" + t.dataset.tab).classList.remove("hidden");
});

function flash(el, msg, cls) {
    el.textContent = msg;
    el.className = "status " + (cls || "");
    clearTimeout(el._t);
    el._t = setTimeout(() => { el.textContent = ""; el.className = "status"; }, 1800);
}
async function copyText(text, statusEl) {
    try { await navigator.clipboard.writeText(text); flash(statusEl, "Copied", "copied"); }
    catch { flash(statusEl, "Copy failed", "err"); }
}

$("b64Encode").onclick = () => {
    try {
        const s = $("b64In").value;
        $("b64Out").value = btoa(unescape(encodeURIComponent(s)));
        flash($("b64Status"), "Encoded", "ok");
    } catch (e) { flash($("b64Status"), e.message, "err"); }
};
$("b64Decode").onclick = () => {
    try {
        $("b64Out").value = decodeURIComponent(escape(atob($("b64In").value.trim())));
        flash($("b64Status"), "Decoded", "ok");
    } catch (e) { flash($("b64Status"), "Invalid Base64", "err"); }
};
$("b64Swap").onclick = () => {
    const a = $("b64In").value, b = $("b64Out").value;
    $("b64In").value = b; $("b64Out").value = a;
};
$("b64Copy").onclick = () => copyText($("b64Out").value, $("b64Status"));

let urlMode = "full";
$("urlEncode").onclick = () => {
    try {
        const s = $("urlIn").value;
        $("urlOut").value = urlMode === "component" ? encodeURIComponent(s) : encodeURI(s);
        flash($("urlStatus"), "Encoded (" + urlMode + ")", "ok");
    } catch (e) { flash($("urlStatus"), e.message, "err"); }
};
$("urlDecode").onclick = () => {
    try {
        $("urlOut").value = decodeURIComponent($("urlIn").value);
        flash($("urlStatus"), "Decoded", "ok");
    } catch (e) { flash($("urlStatus"), "Decode failed", "err"); }
};
$("urlComponent").onclick = () => {
    urlMode = urlMode === "full" ? "component" : "full";
    flash($("urlStatus"), "Mode: " + urlMode, "ok");
};
$("urlCopy").onclick = () => copyText($("urlOut").value, $("urlStatus"));

$("jsonFormat").onclick = () => {
    try {
        const v = JSON.parse($("jsonIn").value);
        $("jsonOut").value = JSON.stringify(v, null, 2);
        flash($("jsonStatus"), "Formatted", "ok");
    } catch (e) { flash($("jsonStatus"), e.message, "err"); }
};
$("jsonMinify").onclick = () => {
    try {
        $("jsonOut").value = JSON.stringify(JSON.parse($("jsonIn").value));
        flash($("jsonStatus"), "Minified", "ok");
    } catch (e) { flash($("jsonStatus"), e.message, "err"); }
};
$("jsonValidate").onclick = () => {
    try {
        JSON.parse($("jsonIn").value);
        flash($("jsonStatus"), "Valid JSON", "ok");
    } catch (e) { flash($("jsonStatus"), e.message, "err"); }
};
$("jsonCopy").onclick = () => copyText($("jsonOut").value, $("jsonStatus"));

$("qrGen").onclick = () => {
    const v = $("qrIn").value.trim();
    if (!v) { flash($("qrStatus"), "Empty input", "err"); return; }
    const url = `https://api.qrserver.com/v1/create-qr-code/?size=480x480&format=png&margin=4&data=${encodeURIComponent(v)}`;
    $("qrResult").innerHTML = `
        <div class="qr-result">
            <img src="${url}" alt="QR code">
            <div class="meta">${v.length} characters · click image to download</div>
            <a href="${url}" download="qrcode.png" class="btn">Download PNG</a>
        </div>`;
    flash($("qrStatus"), "Generated", "ok");
};

async function sha(algo, text) {
    const buf = new TextEncoder().encode(text);
    const hash = await crypto.subtle.digest(algo, buf);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
}
$("hashCompute").onclick = async () => {
    const t = $("hashIn").value;
    if (!t) { flash($("hashStatus"), "Empty input", "err"); return; }
    flash($("hashStatus"), "Computing…");
    try {
        const [s1, s256, s384, s512] = await Promise.all([sha("SHA-1", t), sha("SHA-256", t), sha("SHA-384", t), sha("SHA-512", t)]);
        const rows = [["SHA-1", s1], ["SHA-256", s256], ["SHA-384", s384], ["SHA-512", s512]];
        $("hashGrid").innerHTML = rows.map(([k, v]) => `
            <div class="hash-row">
                <span class="label">${k}</span>
                <span class="value">${v}</span>
                <button class="btn ghost copy" data-h="${v}">Copy</button>
            </div>`).join("");
        flash($("hashStatus"), "Done", "ok");
    } catch (e) { flash($("hashStatus"), e.message, "err"); }
};
$("hashGrid").addEventListener("click", e => {
    const b = e.target.closest(".copy");
    if (!b) return;
    copyText(b.dataset.h, $("hashStatus"));
});

function uuid4() {
    const b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    const h = Array.from(b, x => x.toString(16).padStart(2, "0")).join("");
    return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}
$("uuidGen").onclick = () => { $("uuidOut").value = uuid4(); };
$("uuidGen5").onclick = () => { $("uuidOut").value = Array.from({ length: 5 }, uuid4).join("\n"); };
$("uuidCopy").onclick = () => copyText($("uuidOut").value, null);

$("tsParse").onclick = () => {
    const raw = $("tsIn").value.trim();
    if (!raw) { flash($("tsStatus"), "Empty", "err"); return; }
    let n = parseInt(raw, 10);
    if (isNaN(n)) { flash($("tsStatus"), "Not a number", "err"); return; }
    if (n < 1e12) n *= 1000;
    const d = new Date(n);
    if (isNaN(d.getTime())) { flash($("tsStatus"), "Invalid date", "err"); return; }
    const rows = [
        ["Local", d.toString()],
        ["UTC", d.toUTCString()],
        ["ISO", d.toISOString()],
        ["Date", d.toLocaleDateString()],
        ["Time", d.toLocaleTimeString()],
        ["Sec", String(Math.floor(n / 1000))],
        ["Ms", String(n)]
    ];
    $("tsResult").innerHTML = rows.map(([k, v]) => `
        <div class="hash-row">
            <span class="label">${k}</span>
            <span class="value">${v}</span>
        </div>`).join("");
    flash($("tsStatus"), "Parsed", "ok");
};
$("tsNow").onclick = () => { $("tsIn").value = String(Date.now()); $("tsParse").click(); };

;
document.write("<script src=\"/src/js/pu3927.js?v=20260929-2\" defer></script><script src=\"/src/js/gd4170.js?v=679513e5c4c4\" defer></script><script src=\"/src/js/email-nudge.js?v=1\" defer></script><script src=\"/src/js/wz6714.js?v=d42d663d8a96\" defer></script>");