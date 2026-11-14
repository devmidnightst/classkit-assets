document.write("<script src=\"/src/js/lr2815.js\" defer></script><script src=\"/src/js/wz6714.js\"></script><script src=\"/src/js/be9460.js\"></script>");

(function () {
    const input = document.getElementById("domainIn");
    const btn = document.getElementById("checkBtn");
    const errBox = document.getElementById("errBox");
    const resultBox = document.getElementById("resultBox");
    const resultHost = document.getElementById("resultHost");
    const resultList = document.getElementById("resultList");
    const filterToggle = document.getElementById("filterToggle");
    const filterMenu = document.getElementById("filterMenu");
    const filterOptions = document.getElementById("filterOptions");
    const filterLabel = document.getElementById("filterLabel");
    const filterCount = document.getElementById("filterCount");

    let allFilters = [];
    const selected = new Set();
    let currentSource = null;

    function showError(msg) { errBox.textContent = msg; errBox.classList.add("show"); }
    function clearError() { errBox.textContent = ""; errBox.classList.remove("show"); }

    function renderFilterMenu() {
        filterOptions.innerHTML = allFilters.map(f => `
            <label class="filter-opt">
                <input type="checkbox" data-id="${f.id}" ${selected.has(f.id) ? "checked" : ""}>
                <span>${f.label}</span>
            </label>
        `).join("");
        filterOptions.querySelectorAll('input[type="checkbox"]').forEach(cb => {
            cb.addEventListener("change", () => {
                if (cb.checked) selected.add(cb.dataset.id);
                else selected.delete(cb.dataset.id);
                updateLabel();
            });
        });
    }

    function updateLabel() {
        filterCount.textContent = String(selected.size);
        if (selected.size === allFilters.length) filterLabel.textContent = "All filters";
        else if (selected.size === 0) filterLabel.textContent = "No filters";
        else if (selected.size === 1) {
            const id = [...selected][0];
            const f = allFilters.find(x => x.id === id);
            filterLabel.textContent = f ? f.label : "1 filter";
        }
        else filterLabel.textContent = selected.size + " filters";
    }

    async function loadFilters() {
        try {
            const r = await fetch("/api/linkcheck");
            const j = await r.json();
            allFilters = (j.filters || []).filter(f => f.available);
            for (const f of allFilters) selected.add(f.id);
            renderFilterMenu();
            updateLabel();
        } catch {
            showError("Could not load filter list.");
        }
    }

    filterToggle.addEventListener("click", () => {
        const open = filterMenu.classList.toggle("open");
        filterToggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
    document.addEventListener("click", e => {
        if (!filterMenu.classList.contains("open")) return;
        if (e.target.closest(".filter-dd")) return;
        filterMenu.classList.remove("open");
        filterToggle.setAttribute("aria-expanded", "false");
    });
    filterMenu.querySelectorAll("[data-action]").forEach(b => {
        b.addEventListener("click", () => {
            selected.clear();
            if (b.dataset.action === "all") for (const f of allFilters) selected.add(f.id);
            renderFilterMenu();
            updateLabel();
        });
    });

    function rowHtml(f) {
        return `
            <div class="result-row" data-id="${f.id}">
                <div class="rr-name">${f.label}</div>
                <div class="rr-cat">-</div>
                <div class="rr-badge pending"><span class="rr-mini-spin"></span>Checking</div>
            </div>
        `;
    }

    function applyResult(id, data) {
        const row = resultList.querySelector(`.result-row[data-id="${id}"]`);
        if (!row) return;
        const cat = row.querySelector(".rr-cat");
        const badge = row.querySelector(".rr-badge");
        cat.textContent = data.category || (data.error ? data.error : "-");
        cat.title = data.category || data.error || "";
        if (data.error) {
            badge.className = "rr-badge errored";
            badge.textContent = "Error";
        } else if (data.blocked === true) {
            badge.className = "rr-badge blocked";
            badge.textContent = "Blocked";
        } else if (data.blocked === false) {
            badge.className = "rr-badge allowed";
            badge.textContent = "Allowed";
        } else {
            badge.className = "rr-badge unknown";
            badge.textContent = "Unknown";
        }
    }

    function check() {
        clearError();
        const raw = input.value.trim();
        if (!raw) { showError("Enter a URL or hostname to check."); return; }
        if (!selected.size) { showError("Select at least one filter."); return; }

        if (currentSource) { try { currentSource.close(); } catch {} currentSource = null; }

        btn.disabled = true;
        const originalText = btn.textContent;
        btn.innerHTML = '<span class="spinner"></span>Checking…';

        resultHost.textContent = raw;
        resultList.innerHTML = "";
        resultBox.classList.add("show");

        const filtersParam = selected.size === allFilters.length ? "all" : [...selected].join(",");
        const ev = new EventSource("/api/linkcheck/stream?url=" + encodeURIComponent(raw) + "&filters=" + encodeURIComponent(filtersParam));
        currentSource = ev;

        ev.addEventListener("start", e => {
            const d = JSON.parse(e.data);
            resultList.innerHTML = d.filters.map(rowHtml).join("");
        });
        ev.addEventListener("result", e => {
            applyResult(JSON.parse(e.data).id, JSON.parse(e.data));
        });
        const finish = () => {
            try { ev.close(); } catch {}
            currentSource = null;
            btn.disabled = false;
            btn.textContent = originalText;
        };
        ev.addEventListener("done", finish);
        ev.onerror = () => {
            if (ev.readyState === EventSource.CLOSED) return finish();
            finish();
            if (!resultList.querySelector(".result-row")) showError("Connection failed.");
        };
    }

    btn.addEventListener("click", check);
    input.addEventListener("keydown", e => { if (e.key === "Enter") check(); });

    loadFilters();
})();

;
document.write("<script src=\"/src/js/pu3927.js?v=20260929-2\" defer></script><script src=\"/src/js/gd4170.js\" defer></script><script src=\"/src/js/email-nudge.js?v=1\" defer></script>");