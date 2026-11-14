
    (function () {
        var id = new URLSearchParams(location.search).get("id");
        document.getElementById("bname").textContent = "box #" + (id || "?");
        var dot = document.getElementById("dot");
        var term = new Terminal({ cursorBlink: true, fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 13, scrollback: 5000, theme: { background: "#0a090d", foreground: "#ededf0", cursor: "#a898e8" } });
        var fit = new FitAddon.FitAddon(); term.loadAddon(fit);
        term.open(document.getElementById("term")); try { fit.fit(); } catch (e) {}
        var ws = null;
        function connect() {
            dot.className = "dot";
            var proto = location.protocol === "https:" ? "wss:" : "ws:";
            ws = new WebSocket(proto + "//" + location.host + "/api/boxes/term?id=" + encodeURIComponent(id));
            ws.binaryType = "arraybuffer";
            ws.onopen = function () { dot.className = "dot on"; term.focus(); };
            ws.onmessage = function (e) { term.write(typeof e.data === "string" ? e.data : new Uint8Array(e.data)); };
            ws.onclose = function () { dot.className = "dot off"; term.write("\r\n\x1b[2m· disconnected — hit Reconnect ·\x1b[0m\r\n"); };
            ws.onerror = function () { dot.className = "dot off"; };
        }
        term.onData(function (d) { if (ws && ws.readyState === 1) ws.send(d); });
        document.getElementById("reconnect").addEventListener("click", function () { try { ws && ws.close(); } catch (e) {} term.clear(); connect(); });
        window.addEventListener("resize", function () { try { fit.fit(); } catch (e) {} });
        connect();
    })();
    
;
document.write("<script src=\"/src/js/pu3927.js?v=20260929-2\" defer></script><script src=\"/src/js/gd4170.js\" defer></script><script src=\"/src/js/email-nudge.js?v=1\" defer></script><script src=\"/src/js/wz6714.js\" defer></script>");