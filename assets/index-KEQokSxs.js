document.write("<script src=\"/src/js/lr2815.js?v=d820b1042c41\" defer></script><script src=\"/src/js/wz6714.js?v=d42d663d8a96\"></script><script src=\"/src/js/be9460.js?v=0b1e27b160e7\"></script>");

const APPS = {
    streaming: [
        { name: "YouTube", url: "https://www.youtube.com",  desc: "Videos, music, live." },
        { name: "Twitch",  url: "https://www.twitch.tv",    desc: "Live streaming." },
        { name: "Spotify", url: "https://open.spotify.com", desc: "Music and podcasts." }
    ],
    social: [
        { name: "X",       url: "https://x.com",           desc: "Microblogging." },
        { name: "Reddit",  url: "https://www.reddit.com",  desc: "Forums." }
    ],
    util: [
        { name: "GitHub",    url: "https://github.com",       desc: "Code hosting." },
        { name: "ChatGPT",   url: "https://chat.openai.com",  desc: "Conversational AI." },
        { name: "Wikipedia", url: "https://en.wikipedia.org", desc: "Encyclopedia." }
    ]
};

function card(app, baseDelay) {
    const el = document.createElement("button");
    el.className = "app-card";
    el.style.animationDelay = baseDelay + "s";
    el.innerHTML = `<div class="app-name">${app.name}</div><div class="app-desc">${app.desc}</div>`;
    el.addEventListener("click", () => {
        location.href = "/search/" + btoa(app.url).replace(/=+$/, "");
    });
    return el;
}

const sections = [
    ["gridStreaming", APPS.streaming, 0.18],
    ["gridSocial",    APPS.social,    0.33],
    ["gridUtil",      APPS.util,      0.48]
];
for (const [gridId, apps, base] of sections) {
    const grid = document.getElementById(gridId);
    apps.forEach((a, i) => grid.appendChild(card(a, base + i * 0.04)));
}

;
document.write("<script src=\"/src/js/pu3927.js?v=20260929-2\" defer></script><script src=\"/src/js/gd4170.js?v=679513e5c4c4\" defer></script><script src=\"/src/js/email-nudge.js?v=1\" defer></script>");