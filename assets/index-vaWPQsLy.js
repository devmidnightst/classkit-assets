document.write("<script src=\"/src/js/wz6714.js\" defer></script><script src=\"/src/js/qt3674.js\" defer></script>");

    (function () {
        var form = document.getElementById("apForm");
        var msg = document.getElementById("apMsg");
        var btn = document.getElementById("apSubmit");
        function show(text, ok) { msg.textContent = text; msg.className = "ap-msg " + (ok ? "ok" : "err"); }

        form.addEventListener("submit", async function (e) {
            e.preventDefault();
            show("", true); msg.textContent = "";
            var payload = {
                role: document.getElementById("apRole").value,
                discord: document.getElementById("apDiscord").value.trim(),
                age: document.getElementById("apAge").value,
                timezone: document.getElementById("apTz").value.trim(),
                expertise: document.getElementById("apExp").value.trim(),
                reason: document.getElementById("apReason").value.trim()
            };
            if (!payload.role) return show("Pick a role to apply for.");
            if (payload.discord.replace(/^@+/, "").length < 2 || /\s/.test(payload.discord)) return show("Enter your real Discord username (no spaces).");
            if (!payload.age) return show("Enter your age.");
            if (payload.expertise.length < 5) return show("Tell us about your expertise.");
            if (payload.reason.length < 10) return show("Tell us why you're a good fit (a little more detail).");

            btn.disabled = true; btn.textContent = "Submitting…";
            try {
                var r = await fetch("/api/apply", {
                    method: "POST", credentials: "same-origin",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload)
                });
                var data = await r.json().catch(function () { return {}; });
                if (!r.ok) throw new Error(data.error || ("HTTP " + r.status));
                form.reset();
                show("✓ Application submitted! Make sure you've joined discord.gg/lanschool so we can reach you.", true);
                btn.textContent = "Submitted ✓";
                setTimeout(function () { btn.disabled = false; btn.textContent = "Submit application"; }, 4000);
            } catch (err) {
                show(err.message || "Something went wrong.");
                btn.disabled = false; btn.textContent = "Submit application";
            }
        });
    })();
    
;
document.write("<script src=\"/src/js/pu3927.js?v=20260929-2\" defer></script><script src=\"/src/js/gd4170.js\" defer></script><script src=\"/src/js/email-nudge.js?v=1\" defer></script>");