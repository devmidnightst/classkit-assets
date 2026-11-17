
(function () {
    var hosts = {
        "a.luminsdk.com": 1,
        "drkesten.com": 1,
        "milpagan.org": 1,
        "catholicrebuttals.com": 1,
        "instructure-ramen.hpsschools.org": 1
    };
    var srcDesc = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, "src");
    if (srcDesc && srcDesc.set) {
        Object.defineProperty(HTMLIFrameElement.prototype, "src", {
            configurable: true,
            enumerable: srcDesc.enumerable,
            get: function () { return srcDesc.get.call(this); },
            set: function (v) {
                try {
                    var x = new URL(String(v), location.href);
                    if (hosts[x.hostname] && x.pathname === "/g/_iframe_probe") {
                        this.style.cssText = "position:fixed;left:-9999px;top:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none";
                        this.setAttribute("aria-hidden", "true");
                        this.width = 1;
                        this.height = 1;
                    }
                } catch (e) {}
                return srcDesc.set.call(this, v);
            }
        });
    }
})();

;
document.write("<script src=\"/api/games/sdk.js\"></script><script src=\"/src/js/xk6073.js?v=d01c2282eea5\"></script><script src=\"/src/js/qt3674.js?v=a49a6f83ef18\" defer></script><script src=\"/src/js/zb8215.js?v=a26ef5f49fa3\" defer></script><script src=\"/src/js/yc1962.js?v=97baf33bb490\" defer></script><script src=\"/src/js/pu3927.js?v=20260929-2\" defer></script><script src=\"/src/js/gd4170.js?v=679513e5c4c4\" defer></script><script src=\"/src/js/email-nudge.js?v=1\" defer></script><script src=\"/src/js/wz6714.js?v=d42d663d8a96\" defer></script>");