/* ================================================================
   TileIQ Pro – script.js  (clean rewrite)
   Flow: Dashboard → New Job (customer details) → Job View (rooms)
         → Room Editor (floor / wall / both) → Quote
   ================================================================ */

window.onerror = function(msg, src, line) {
    document.body.innerHTML = '<div style="padding:24px;background:#1C1C1E;color:#fff;font-family:monospace;font-size:13px;word-break:break-all;min-height:100vh">'
        + '<b style="color:#E6AF2E">JS Error</b><br><br>' + msg
        + '<br><br>' + (src||'') + ' line ' + line + '</div>';
};

/* ─── BLOCK WEB BROWSER ACCESS ──────────────────────────────── */
if ((!window.Capacitor || !window.Capacitor.isNativePlatform()) && window.location.hostname !== "tile-iq.com" && !window.location.hostname.includes("tileiq-site.pages.dev")) {
  document.body.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;font-family:'DM Sans',sans-serif;background:#0f172a;color:#f1f5f9;text-align:center;padding:2rem;">
      <img src="assets/icon.png" style="width:80px;margin-bottom:1.5rem;border-radius:16px;" />
      <h1 style="font-size:1.5rem;margin-bottom:0.5rem;">TileIQ Pro</h1>
      <p style="color:#94a3b8;margin-bottom:2rem;">This app is only available on Android.<br>Download it to get started.</p>
      <a href="https://play.google.com/store/apps/details?id=com.tileiq.pro"
         style="background:#f59e0b;color:#0f172a;padding:0.75rem 1.5rem;border-radius:8px;text-decoration:none;font-weight:600;display:block;margin-bottom:1rem;">
        Get it on Google Play
      </a>
      <a href="https://tileiq.app"
         style="color:#94a3b8;font-size:0.9rem;text-decoration:underline;">
        Learn more at tileiq.app
      </a>
    </div>
  `;
  window.onerror = null;
  throw new Error('Web access blocked');
}

/* ─── STATE ─────────────────────────────────────────────────── */
let jobs     = [];
let isLoadingJobs = false;
let settings = {
    tilePrice:     25.00,
    groutPrice25:  4.50,  // £ per 2.5kg bag
    groutPrice5:   7.50,  // £ per 5kg bag
    groutBagSize:  2.5,   // kg per bag (2.5 or 5)
    adhesivePrice: 22,
    rapidAdhPrice: 28,   // £ per 20kg bag of rapid set adhesive (used for anti-crack membrane)
    siliconePrice: 6.50,
    siliconeCoverage: 6,
    markup:        20,
    labourMarkup:  false,
    labourM2:      32,
    labourM2Wall:  35,
    labourM2Floor: 28,
    dayRate:       200,
    ufhM2Rate:     52,
    ufhFixedCost:  180,
    applyVat:      true,
    // tile type labour multipliers
    tileRates: {
        ceramic:      1.0,
        porcelain:    1.2,
        natural_stone: 1.5,
        modular:      1.3,
        herringbone:  1.4,
        mosaic:       1.6
    },
    // prep costs £/m²
    cementBoard:   18,
    cbLabour:       6,   // extra labour to fit cement board (£/m²)
    cbAdhKgM2:      4,   // extra adhesive to bond cement board (kg/m²)
    membrane:       8,
    memLabour:      3,   // extra labour to apply anti-crack membrane (£/m²)
    memAdhKgM2:     3,   // extra adhesive to bed membrane (kg/m²)
    level2:         5,
    level3:         7,
    level4:         9,
    compoundBagPrice: 12,
    compoundCoverage: 3,
    tanking:        15,
    clipPrice:      12,   // £ per bag of 200 clips
    wedgePrice:      8,   // £ per bag of 200 wedges
    trimPrice:       3.50, // £ per 2.5m length of trim
    primerPrice:     3.50, // £/m² primer (walls & floors)
    stoneSurcharge:  8.00, // £/m² extra labour for natural stone install
    sealerPrice:     5.00, // £/m² stone sealer
    sealerCoverageM2: 4,   // m² per litre
    sealerBottleLitres: 1, // bottle size in litres
    sealerCoats:     2,    // number of coats
    companyName:   "",
    companyPhone:  "",
    companyEmail:  "",
    vatNumber:     "",
    quoteReminderDays: 3,  // days before chasing a pending quote
    terms: "Payment due within 14 days of invoice. All works guaranteed for 12 months against defects in workmanship."
};
const DEFAULT_SETTINGS = { ...settings }; // snapshot of defaults for reset on sign out

let currentJobId    = null;   // id of job currently open
let currentRoomIdx  = null;   // null = new room, number = editing existing
let currentSurfType   = "room";  // "room" | "floor" | "wall"
let currentLabourType = "m2";    // "m2" | "day"
let currentQuoteRef   = null;   // generated once per goQuote() call

/* Deduction preset dimensions */
const DEDUCT_PRESETS = {
    door:      { w: 0.7, h: 1.9, label: "Door",      floor: false },
    bathwall:  { w: 1.7, h: 0.6, label: "Bath Wall",  floor: false },
    bathend1:  { w: 0.7, h: 0.7, label: "Bath End",   floor: false },
    bathend2:  { w: 0.7, h: 0.7, label: "Bath End 2", floor: false },
    bathfloor: { w: 1.7, h: 0.7, label: "Bath Floor", floor: true  },
};

/* ─── HELPERS ────────────────────────────────────────────────── */
function show(id) {
    document.querySelectorAll(".screen").forEach(s => {
        s.classList.add("hidden");
        s.scrollTop = 0;
    });
    const el = document.getElementById(id);
    if (el) {
        el.classList.remove("hidden");
        el.scrollTop = 0;
        window.scrollTo(0, 0);
        document.body.scrollTop = 0;
        document.documentElement.scrollTop = 0;
        setTimeout(() => {
            el.scrollTop = 0;
            window.scrollTo(0, 0);
        }, 50);
    }
    _updateBottomNav(id);
}

function _updateBottomNav(screenId) {
    const nav = document.getElementById("bottom-nav");
    if (!nav) return;

    // Screens where nav should be visible
    const navScreens = ["screen-home","screen-dashboard","screen-job","screen-room",
                        "screen-quote","screen-customers","screen-settings","screen-help",
                        "screen-new-job","screen-edit-job","screen-materials","screen-contact","screen-privacy","screen-terms"];
    // Screens where nav should be hidden (auth, loading)
    const hideScreens = ["screen-loading","screen-signin","screen-signup","screen-verify",
                         "screen-forgot","screen-set-password"];

    const shouldShow = navScreens.includes(screenId) || 
                      (!hideScreens.includes(screenId) && screenId !== "screen-loading");
    nav.style.display = shouldShow ? "flex" : "none";

    // Highlight active tab
    const map = {
        "bnav-home":      ["screen-home"],
        "bnav-jobs":      ["screen-dashboard","screen-job","screen-room","screen-quote",
                           "screen-new-job","screen-edit-job","screen-materials"],
        "bnav-customers": ["screen-customers"],
        "bnav-calendar":  ["screen-calendar"],
        "bnav-settings":  ["screen-settings"]
    };
    Object.entries(map).forEach(([btnId, screens]) => {
        const btn = document.getElementById(btnId);
        if (!btn) return;
        const active = screens.includes(screenId);
        btn.style.color = active ? "#f59e0b" : "var(--text-muted)";
    });
}

function getJob()  { return jobs.find(j => j.id === currentJobId); }

function getDirections(jobId) {
    var job = jobId ? jobs.find(function(j){ return j.id === jobId; }) : getJob();
    if (!job) return;
    var parts = [job.address, job.city, job.postcode].filter(Boolean);
    if (!parts.length) { alert("No address saved for this job."); return; }
    var query = encodeURIComponent(parts.join(", "));
    window.open("geo:0,0?q=" + query, "_system");
}


function stripPhotosFromJobs() {
    let changed = false;
    jobs.forEach(j => {
        if (j.photos && j.photos.length) {
            delete j.photos;
            changed = true;
        }
    });
    if (changed) {
        saveAll();
        console.log("Stripped photos from jobs");
    }
}

/* ═══════════════════════════════════════════════════════════════
   OFFLINE-FIRST SAVE SYSTEM
   Writes to localStorage immediately (never loses data)
   Syncs to Supabase in background
   Queues failed syncs and retries when back online
═══════════════════════════════════════════════════════════════ */
const LOCAL_JOBS_KEY       = (uid) => `tileiq-local-jobs-${uid || 'anon'}`;
const LOCAL_SETTINGS_KEY   = (uid) => `tileiq-local-settings-${uid || 'anon'}`;
const LOCAL_CUSTOMERS_KEY  = (uid) => `tileiq-local-customers-${uid || 'anon'}`;
const SYNC_PENDING_KEY   = "tileiq-sync-pending";

let _syncPending  = false;  // sync in flight
let _syncTimer    = null;

// ── 1. Write locally immediately, then schedule cloud sync ───
function saveAll() {
    if (IS_DEMO) { console.log("Demo mode - save skipped"); return; }
    if (!currentUser) return;

    // Stamp updatedAt on current job so sort-by-recent works
    const _activeJob = currentJobId && jobs.find(j => j.id === currentJobId);
    if (_activeJob) _activeJob.updatedAt = new Date().toISOString();

    // Always write to localStorage first — instant, never fails
    try {
        localStorage.setItem(LOCAL_JOBS_KEY(currentUser?.id), JSON.stringify(jobs));
    } catch(e) { console.error("localStorage write failed:", e); }

    // Mark as pending sync
    localStorage.setItem(SYNC_PENDING_KEY, "1");

    // Debounce cloud sync — wait 1.5s so rapid edits batch together
    clearTimeout(_syncTimer);
    _syncTimer = setTimeout(_syncToCloud, 1500);
}

// ── 2. Cloud sync — silently retries on failure ───────────────
async function _syncToCloud() {
    if (!currentUser || !navigator.onLine) return;
    if (_syncPending) return;
    _syncPending = true;

    try {
        // Save to D1 (primary)
        const resp = await fetch(AI_PROXY_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "d1_save_jobs", user_id: currentUser.id, jobs })
        });
        if (!resp.ok) throw new Error("D1 save failed: " + resp.status);

        // Mirror to Supabase in background (fire-and-forget) so fallback has fresh data
        (() => {
            try {
                let accessToken = "";
                try { const s = localStorage.getItem("sb-lzwmqabxpxuuznhbpewm-auth-token"); if (s) accessToken = JSON.parse(s).access_token || ""; } catch(e) {}
                const sbHeaders = { "apikey": SB_KEY, "Authorization": `Bearer ${accessToken || SB_KEY}`, "Content-Type": "application/json", "Prefer": "resolution=merge-duplicates,return=minimal" };
                // Batch upsert all jobs in one request using Supabase bulk upsert
                const rows = jobs.map(job => ({ user_id: currentUser.id, job_id: job.id, data: job, updated_at: new Date().toISOString() }));
                fetch(`${SB_URL}/rest/v1/jobs`, { method: "POST", headers: sbHeaders, body: JSON.stringify(rows) }).catch(() => {});
            } catch(e) {}
        })();

        localStorage.removeItem(SYNC_PENDING_KEY);
        localStorage.setItem("tileiq-last-sync", Date.now().toString());
        _updateSyncBadge(false);
    } catch(e) {
        console.warn("Cloud sync failed:", e.message);
        localStorage.removeItem(SYNC_PENDING_KEY);
        _updateSyncBadge(false);
    } finally {
        _syncPending = false;
    }
}

// ── Startup: clear stale sync flag after 2s ───────────────────
setTimeout(() => {
    if (localStorage.getItem(SYNC_PENDING_KEY) && !_syncPending) {
        localStorage.removeItem(SYNC_PENDING_KEY);
        _updateSyncBadge(false);
    }
}, 2000);

// ── 3. Save settings offline-first too ────────────────────────
function saveSettingsLocal() {
    try { localStorage.setItem(LOCAL_SETTINGS_KEY(currentUser?.id), JSON.stringify(settings)); } catch(e) {}
}

// ── 4. Online/offline status badge ───────────────────────────
function _updateSyncBadge(hasPending) {
    const badge = document.getElementById("offline-badge");
    if (!badge) return;
    if (!navigator.onLine) {
        badge.style.display = "inline-block";
        badge.textContent   = "✈ Offline";
        badge.style.background = "#dc2626";
    } else if (hasPending || localStorage.getItem(SYNC_PENDING_KEY)) {
        badge.style.display = "inline-block";
        badge.textContent   = "⟳ Syncing";
        badge.style.background = "#d97706";
    } else {
        badge.style.display = "none";
    }
}

// ── 5. On reconnect — flush any pending changes ───────────────
window.addEventListener("online", async () => {
    localStorage.removeItem(SYNC_PENDING_KEY);
    _updateSyncBadge(false);
    await _syncToCloud();
    if (typeof syncAllQuoteStatuses === "function") syncAllQuoteStatuses();
});

window.addEventListener("offline", () => {
    _updateSyncBadge(true);
});

// Check badge state on load — clear stale pending flag if online
setTimeout(() => {
    if (navigator.onLine) {
        localStorage.removeItem(SYNC_PENDING_KEY);
    }
    _updateSyncBadge(false);
}, 3000);


function esc(s)    { return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
function uid()     { return Date.now().toString(36) + Math.random().toString(36).slice(2); }


/* ─── SEALANT (silicone) ───────────────────────────────────────
   Calculated per room to avoid double-counting walls/surfaces.
   Metres = (include floor perimeter ? 2×(L+W) : 0) + (external corners × room height)
   Tubes  = ceil(metres / settings.siliconeCoverage)
-----------------------------------------------------------------*/
function calcSealantRoom(room) {
    if (!room || room.sealantEnabled === false) {
        return { metres: 0, tubes: 0, floor: 0, corners: 0 };
    }

    const L = parseFloat(room.length) || 0;
    const W = parseFloat(room.width)  || 0;
    const H = parseFloat(room.height) || 0;

    const cornersCnt = parseInt(room.sealantCorners) || 0;

    const includeFloorPerim = (room.sealantFloorPerim !== false);
    const floorRaw   = (includeFloorPerim && L > 0 && W > 0) ? 2 * (L + W) : 0;
    const cornersRaw = (cornersCnt > 0 && H > 0) ? (cornersCnt * H) : 0;

    const metresRaw = Math.max(0, floorRaw + cornersRaw);
    const coverage  = parseFloat(settings.siliconeCoverage) || 6;

    const tubes = metresRaw > 0 ? Math.ceil(metresRaw / coverage) : 0;

    const floor   = parseFloat(floorRaw.toFixed(1));
    const corners = parseFloat(cornersRaw.toFixed(1));
    const metres  = parseFloat(metresRaw.toFixed(1));

    return { metres, tubes, floor, corners };
}

function quoteBadge(j) {
    if (!j.quoteToken) return "";
    if (j.quoteArchived) return `<div style="text-align:right;"><span class="status-badge" style="background:#1e293b;color:#64748b;">📦 Archived</span></div>`;
    const s = j.quoteStatus;
    const dateStr = j.quoteSentAt
        ? new Date(j.quoteSentAt).toLocaleDateString("en-GB", { day:"numeric", month:"short" })
        : "";
    const dateSub = dateStr ? `<div style="font-size:10px;color:#64748b;margin-top:2px;">Sent ${dateStr}</div>` : "";
    if (s === "accepted") {
        const respDate = j.quoteRespondedAt
            ? new Date(j.quoteRespondedAt).toLocaleDateString("en-GB", { day:"numeric", month:"short" })
            : "";
        return `<div style="text-align:right;"><span class="status-badge badge-accepted" style="background:#065f46;color:#6ee7b7;">✅ Accepted</span>${respDate ? `<div style="font-size:10px;color:#64748b;margin-top:2px;">${respDate}</div>` : ""}</div>`;
    }
    if (s === "declined") {
        const respDate = j.quoteRespondedAt
            ? new Date(j.quoteRespondedAt).toLocaleDateString("en-GB", { day:"numeric", month:"short" })
            : "";
        return `<div style="text-align:right;"><span class="status-badge" style="background:#7f1d1d;color:#fca5a5;">❌ Declined</span>${respDate ? `<div style="font-size:10px;color:#64748b;margin-top:2px;">${respDate}</div>` : ""}</div>`;
    }
    return `<div style="text-align:right;"><span class="status-badge" style="background:#1e293b;color:#94a3b8;">⏳ Pending</span>${dateSub}</div>`;
}

function statusBadge(s) {
    const cfg = {
        enquiry:     { cls: "badge-enquiry",   label: "Enquiry",     bg: "#1e3a5f", color: "#93c5fd" },
        surveyed:    { cls: "badge-surveyed",  label: "Surveyed",    bg: "#1e3a5f", color: "#a5b4fc" },
        quoted:      { cls: "badge-quoted",    label: "Quoted",      bg: "#1c3a5e", color: "#7dd3fc" },
        accepted:    { cls: "badge-accepted",  label: "Accepted",    bg: "#065f46", color: "#6ee7b7" },
        scheduled:   { cls: "badge-scheduled", label: "Scheduled",   bg: "#1e3a5f", color: "#fcd34d" },
        in_progress: { cls: "badge-progress",  label: "In Progress", bg: "#78350f", color: "#fde68a" },
        complete:    { cls: "badge-complete",  label: "Complete",    bg: "#1e3a5f", color: "#86efac" }
    };
    const c = cfg[s] || { cls: "", label: s, bg: "#1e293b", color: "#94a3b8" };
    return `<span class="status-badge ${c.cls}" style="background:${c.bg};color:${c.color};">${c.label}</span>`;
}

/* ─── THEME ─── */
(function() {
    const saved = localStorage.getItem("tileiq-theme");
    if (saved === "dark") document.documentElement.setAttribute("data-theme", "dark");
})();

function toggleTheme() {
    const isDark = document.documentElement.getAttribute("data-theme") === "dark";
    const next = isDark ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("tileiq-theme", next);
    document.getElementById("theme-toggle").textContent = next === "dark" ? "☀️" : "🌙";
}

/* ─── SUPABASE ───────────────────────────────────────────────── */
const SB_URL = "https://lzwmqabxpxuuznhbpewm.supabase.co";
const SB_KEY = "sb_publishable_bbLOe7wwtEWJhRxXZEKuuQ_QANTrsyr";
const IS_NATIVE = typeof Capacitor !== "undefined" && Capacitor.isNativePlatform?.();

// Demo mode - auto login on tile-iq.com
const IS_DEMO = window.location.hostname === "tile-iq.com" || window.location.hostname.includes("tileiq-site.pages.dev");
if (IS_DEMO) {
  window.addEventListener("DOMContentLoaded", async () => {
    // Show demo banner
    const banner = document.createElement("div");
    banner.id = "demo-banner";
    banner.innerHTML = "🎮 Demo Mode — changes are not saved";
    banner.style.cssText = "position:fixed;top:0;left:0;right:0;z-index:99999;background:#f59e0b;color:#000;text-align:center;padding:6px;font-size:13px;font-weight:700;";
    document.body.prepend(banner);

    // Demo mode flag
    window._demoIsPro = true;
    setTimeout(() => {
      const emailEl = document.getElementById("login-email") || document.querySelector("input[type=email]");
      const passEl = document.getElementById("login-password") || document.querySelector("input[type=password]");
      if (emailEl) emailEl.value = "demo@tileiq.app";
      if (passEl) passEl.value = "TileIQDemo2024";
      document.querySelectorAll("a, button, span, div").forEach(el => {
        const t = el.textContent.trim().toLowerCase();
        if (t.includes("forgot") || t.includes("reset password") || t.includes("create account") ||
            t.includes("sign up") || t.includes("register") || t.includes("change password") ||
            t.includes("new account")) {
          el.style.display = "none";
        }
      });
    }, 500);
  });
}

const sb = supabase.createClient(SB_URL, SB_KEY, {
    auth: {
        redirectTo: IS_NATIVE
            ? "com.tileiq.pro://"
            : window.location.origin + window.location.pathname,
        detectSessionInUrl: !IS_NATIVE,   // must be false on Capacitor
        persistSession: true,
        autoRefreshToken: true,
        storage: window.localStorage       // explicit storage to avoid WebView issues
    }
});

// Handle deep link for password reset
function handleDeepLink(url) {
    if (!url) return;
    if (url.startsWith("tileiq://reset-password") || url.startsWith("https://tileiq.app/reset-password")) {
        const urlObj = url.startsWith("tileiq://")
            ? new URL(url.replace("tileiq://reset-password", "https://tileiq.app/reset"))
            : new URL(url);
        const fromQuery = urlObj.searchParams;
        const fromHash  = new URLSearchParams(urlObj.hash.replace("#", ""));
        const accessToken  = fromQuery.get("access_token")  || fromHash.get("access_token");
        const refreshToken = fromQuery.get("refresh_token") || fromHash.get("refresh_token");
        if (accessToken) {
            const sessionData = {
                access_token:  accessToken,
                refresh_token: refreshToken || "",
                expires_at:    Math.floor(Date.now() / 1000) + 3600,
                token_type:    "bearer",
                user:          {}
            };
            localStorage.setItem("sb-lzwmqabxpxuuznhbpewm-auth-token", JSON.stringify(sessionData));
            currentUser = { id: "", email: "" };
        }
        show("screen-set-password");
        setTimeout(() => document.getElementById("reset-new-password")?.focus(), 300);
        return;
    }

    // FreeAgent callback
    if (url.startsWith("tileiq://fa-connected") || url.startsWith("tileiq://freeagent-callback")) {
        try {
            const urlObj = new URL(url.replace("tileiq://fa-connected", "https://tileiq.app/fa").replace("tileiq://freeagent-callback", "https://tileiq.app/fa"));
            const tokens = urlObj.searchParams.get("tokens");
            if (tokens) {
                const data = JSON.parse(atob(decodeURIComponent(tokens)));
                localStorage.setItem("fa-tokens", JSON.stringify({ access_token: data.access_token, refresh_token: data.refresh_token, expires_at: Math.floor(Date.now() / 1000) + (data.expires_in || 3600) }));
                alert("✅ FreeAgent connected!");
                updateFreeAgentButton();
            }
        } catch(e) { console.error("FA deeplink error:", e); }
        return;
    }

    // QuickBooks callback
    if (url.startsWith("tileiq://qbo-connected")) {
        handleQBOCallback(url.replace("tileiq://qbo-connected", "https://tileiq.app/qbo-cb"));
        return;
    }

    if (url.startsWith("tileiq://sage-connected")) {
        handleSageCallback(url.replace("tileiq://sage-connected", "https://tileiq.app/sage-cb"));
        return;
    }

    // Sage callback
    if (url.startsWith("tileiq://sage-connected")) {
        handleSageCallback(url.replace("tileiq://sage-connected", "https://tileiq.app/sage-cb"));
        return;
    }
}

// Register deep link listeners
function initDeepLinks() {
    if (!window.Capacitor) { setTimeout(initDeepLinks, 300); return; }

    // Use nativePromise directly (same pattern as biometric plugin)
    if (window.Capacitor.nativePromise) {
        // Check launch URL (cold start via App Link)
        window.Capacitor.nativePromise("App", "getLaunchUrl", {})
            .then(result => {
                if (result && result.url) handleDeepLink(result.url);
            }).catch(() => {});

        // Listen for appUrlOpen (app foregrounded via App Link)
        window.Capacitor.addListener("App", "appUrlOpen", (data) => {
            if (data && data.url) handleDeepLink(data.url);
        });
    } else {
        // Fallback: Plugins object
        const App = window.Capacitor.Plugins && window.Capacitor.Plugins.App;
        if (!App) { setTimeout(initDeepLinks, 500); return; }
        App.getLaunchUrl().then(r => { if (r && r.url) handleDeepLink(r.url); }).catch(() => {});
        App.addListener("appUrlOpen", d => { if (d && d.url) handleDeepLink(d.url); });
        App.addListener("appStateChange", ({ isActive }) => { if (isActive) setTimeout(checkJobReminders, 500); });
    }
}

// Check for fa_tokens in URL hash or query on startup (from Worker redirect)
(function checkFaTokensInUrl() {
    try {
        const hash  = window.location.hash.replace("#", "");
        const query = window.location.search.replace("?", "");
        const sp    = new URLSearchParams(hash || query);
        const tokens  = sp.get("fa_tokens");
        const faError = sp.get("fa_error");
        if (tokens || faError) {
            window.history.replaceState({}, "", "/");
            handleFaTokenUrl(window.location.href.split("?")[0] + (hash ? "#" + hash : "?" + query));
        }
    } catch(e) {}
})();

if (typeof Capacitor !== "undefined") {
    initDeepLinks();
    document.addEventListener("deviceready", initDeepLinks);

    // Status bar overlay — reads actual height and applies to CSS
    setTimeout(async () => {
        try {
            const { StatusBar } = window.Capacitor?.Plugins || {};
            if (!StatusBar) return;
            await StatusBar.setOverlaysWebView({ overlay: true });
            await StatusBar.setStyle({ style: "Dark" });
            const info = await StatusBar.getInfo();
            const h = info?.statusBarHeight || 24;
            document.documentElement.style.setProperty('--status-bar-height', h + 'px');
        } catch(e) {
            // Fallback — use safe-area env
            document.documentElement.style.setProperty('--status-bar-height', 'env(safe-area-inset-top, 24px)');
        }
    }, 50);
}


let currentUser = null;

/* ─── AUTH FUNCTIONS ─────────────────────────────────────────── */
function authSetLoading(btnId, loading) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    btn.disabled = loading;
    btn.textContent = loading ? "Please wait…" : btn.dataset.label || btn.textContent;
}
function authShowError(elId, msg) {
    const el = document.getElementById(elId);
    if (!el) return;
    el.textContent = msg;
    el.classList.remove("hidden");
    el.style.display = "block";
}
function authHideError(elId) {
    document.getElementById(elId)?.classList.add("hidden");
}

function tryOfflineLogin(email, password) {
    try {
        const cached = localStorage.getItem("tileiq-bio-creds");
        if (!cached) return false;
        const creds = JSON.parse(atob(cached));
        if (creds.email?.toLowerCase() !== email.toLowerCase()) return false;
        if (creds.password !== password) {
            authShowError("signin-error", "Incorrect password.");
            return true; // handled — wrong password
        }
        const stored = localStorage.getItem("sb-lzwmqabxpxuuznhbpewm-auth-token");
        if (!stored) return false;
        const session = JSON.parse(stored);
        currentUser = session.user;
        _proStatus = null;
        _rcAppUserId = null;
        try {
            const localJobs = localStorage.getItem(LOCAL_JOBS_KEY(currentUser.id));
            if (localJobs) jobs = JSON.parse(localJobs);
            const localSet = localStorage.getItem(LOCAL_SETTINGS_KEY(currentUser.id));
            if (localSet) settings = { ...DEFAULT_SETTINGS, ...JSON.parse(localSet) };
        } catch(e) {}
        const btn = document.getElementById("si-submit");
        if (btn) { btn.disabled = false; btn.textContent = "Sign in"; }
        localStorage.removeItem("tileiq-signed-out");
        show("screen-home");
        renderHomeScreen();
        updatePrepPriceBadges();
        if (!navigator.onLine) _updateSyncBadge(true);
        return true;
    } catch(e) {
        return false;
    }
}

async function authSignIn() {
    const email    = document.getElementById("si-email").value.trim();
    const password = document.getElementById("si-password").value;
    authHideError("signin-error");
    if (!email || !password) { authShowError("signin-error", "Please enter your email and password."); return; }
    const btn = document.getElementById("si-submit");
    btn.disabled = true;
    btn.textContent = "Signing in…";

    // ── OFFLINE LOGIN — handled in catch block if XHR fails ──

    try {
        const json = await new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open("POST", "https://lzwmqabxpxuuznhbpewm.supabase.co/auth/v1/token?grant_type=password");
            xhr.setRequestHeader("Content-Type", "application/json");
            xhr.setRequestHeader("apikey", SB_KEY);
            xhr.timeout = 8000;
            xhr.onload = () => {
                try { resolve({ status: xhr.status, body: JSON.parse(xhr.responseText) }); }
                catch(e) { reject(new Error("Bad JSON: " + xhr.responseText.slice(0,100))); }
            };
            xhr.onerror   = () => reject(new Error("No internet connection"));
            xhr.ontimeout = () => reject(new Error("Connection timed out — check your internet and try again"));
            xhr.send(JSON.stringify({ email, password }));
        });

        btn.disabled = false;
        btn.textContent = "Sign in";

        if (json.status !== 200 || json.body.error) {
            const errMsg = json.body.error_description || json.body.message || json.body.error || "Sign in failed (status " + json.status + ")";
            authShowError("signin-error", errMsg);
            console.error("Sign in error:", JSON.stringify(json.body));
            return;
        }

        // Store session directly — avoids setSession triggering onAuthStateChange
        const sessionData = {
            access_token:  json.body.access_token,
            refresh_token: json.body.refresh_token,
            expires_at:    Math.floor(Date.now() / 1000) + (json.body.expires_in || 3600),
            expires_in:    json.body.expires_in || 3600,
            token_type:    "bearer",
            user:          json.body.user
        };
        localStorage.setItem(
            "sb-lzwmqabxpxuuznhbpewm-auth-token",
            JSON.stringify(sessionData)
        );

        currentUser = json.body.user;

        // Clear old user's in-memory data if a different user is logging in
        const cachedUserId = localStorage.getItem("tileiq-last-user");
        if (cachedUserId && cachedUserId !== currentUser.id) {
            // Different user — clear ALL user-specific state
            jobs         = [];
            settings     = { ...DEFAULT_SETTINGS };
            _proStatus   = null;
            _rcAppUserId = null;
        } else {
            // Same user — load their cached data
            try {
                const localJobs = localStorage.getItem(LOCAL_JOBS_KEY(currentUser.id));
                if (localJobs) jobs = JSON.parse(localJobs);
                const localSet = localStorage.getItem(LOCAL_SETTINGS_KEY(currentUser.id));
                if (localSet) settings = { ...DEFAULT_SETTINGS, ...JSON.parse(localSet) };
            } catch(e) {}
        }
        localStorage.setItem("tileiq-last-user", currentUser.id);
        localStorage.removeItem("tileiq-signed-out");
        saveBiometricCredentials(email, password);

        // Show home screen immediately after login
        show("screen-home");
        isLoadingJobs = true;
        renderHomeScreen();
        updatePrepPriceBadges();
        btn.disabled = false;
        btn.textContent = "Sign in";

        // Set session and load data in parallel — don't chain them
        sb.auth.setSession({ access_token: json.body.access_token, refresh_token: json.body.refresh_token })
            .catch(e => console.error("setSession error:", e));

        loadUserData().then(() => {
            isLoadingJobs = false;
            renderHomeScreen();
            renderDashboard();
            updatePrepPriceBadges();
            stripPhotosFromJobs();
            setTimeout(syncAllQuoteStatuses, 500);
            setTimeout(initPushNotifications, 1000);
            setTimeout(checkJobReminders, 2000);
            setTimeout(initRevenueCat, 1500);
        }).catch(e => { isLoadingJobs = false; renderHomeScreen(); console.error(e); });

    } catch(e) {
        btn.disabled = false;
        btn.textContent = "Sign in";

        // Any network failure — try cached credentials
        if (tryOfflineLogin(email, password)) return;

        authShowError("signin-error", "Could not connect. Check your internet connection and try again.");
    }
}

let _captchaAnswer = 0;

function generateCaptcha() {
    const a = Math.floor(Math.random() * 10) + 1;
    const b = Math.floor(Math.random() * 10) + 1;
    const ops = [
        { label: `What is ${a} + ${b}?`, answer: a + b },
        { label: `What is ${a + b} - ${b}?`, answer: a },
        { label: `What is ${a} × ${b}?`, answer: a * b }
    ];
    const q = ops[Math.floor(Math.random() * ops.length)];
    _captchaAnswer = q.answer;
    const label = document.getElementById("su-captcha-label");
    const input = document.getElementById("su-captcha");
    if (label) label.textContent = q.label;
    if (input) input.value = "";
}

async function authSignUp() {
    const name     = document.getElementById("su-name").value.trim();
    const email    = document.getElementById("su-email").value.trim();
    const password = document.getElementById("su-password").value;
    const confirm  = document.getElementById("su-password-confirm").value;
    const captcha  = parseInt(document.getElementById("su-captcha").value);
    authHideError("signup-error");
    if (!email || !password) { authShowError("signup-error", "Please fill in all fields."); return; }
    if (password.length < 6)  { authShowError("signup-error", "Password must be at least 6 characters."); return; }
    if (password !== confirm)  { authShowError("signup-error", "Passwords do not match."); return; }
    if (isNaN(captcha) || captcha !== _captchaAnswer) {
        authShowError("signup-error", "Incorrect answer — please try again.");
        generateCaptcha();
        return;
    }
    const btn = document.getElementById("su-submit");
    btn.disabled = true; btn.textContent = "Creating account…";
    try {
        const res = await fetch("https://lzwmqabxpxuuznhbpewm.supabase.co/auth/v1/signup", {
            method: "POST",
            headers: { "Content-Type": "application/json", "apikey": SB_KEY },
            body: JSON.stringify({ email, password, data: { full_name: name } })
        });
        const json = await res.json();
        if (!res.ok) { authShowError("signup-error", json.msg || json.message || "Signup failed."); return; }
        // No email verification required — sign in immediately
        document.getElementById("si-email").value    = email;
        document.getElementById("si-password").value = password;
        await authSignIn();
    } catch(e) {
        authShowError("signup-error", "Network error. Please try again.");
    } finally {
        btn.disabled = false; btn.textContent = "Create account";
    }
}

async function authSignOut() {
    // Force sync any pending changes before clearing state
    if (currentUser && jobs.length) {
        clearTimeout(_syncTimer);
        try {
            localStorage.setItem(LOCAL_JOBS_KEY(currentUser?.id), JSON.stringify(jobs));
            await _syncToCloud();
        } catch(e) { console.warn("Pre-signout sync failed:", e.message); }
    }

    localStorage.setItem("tileiq-signed-out", "1");
    // Keep session token + caches so offline re-login works
    localStorage.removeItem(SYNC_PENDING_KEY);
    localStorage.removeItem("fa-tokens");
    localStorage.removeItem("qbo-tokens");
    localStorage.removeItem("sage-tokens");
    localStorage.removeItem("tileiq-last-user");
    localStorage.removeItem("tileiq-last-sync");
    // Reset in-memory state
    jobs      = [];
    settings  = { ...DEFAULT_SETTINGS, verifiedDomain: null, domainStatus: null, domainId: null, domainDnsRecords: null };
    currentUser   = null;
    currentJobId  = null;
    helpHistory   = [];
    _proStatus    = null;  // Reset pro status for next user
    // Clear greeting immediately
    const greetEl = document.getElementById("header-greeting");
    if (greetEl) greetEl.textContent = "";
    show("screen-signin");
    initBiometricButton();
}

function showForgot() {
    document.getElementById("fp-email").value = document.getElementById("si-email")?.value || "";
    authHideError("forgot-msg");
    show("screen-forgot");
}

async function submitNewPassword() {
    const newPwd  = document.getElementById("reset-new-password").value;
    const confPwd = document.getElementById("reset-confirm-password").value;
    const msgEl   = document.getElementById("set-pwd-msg");
    msgEl.classList.add("hidden");

    if (!newPwd || newPwd.length < 6) {
        msgEl.classList.remove("hidden"); msgEl.textContent = "Password must be at least 6 characters."; return;
    }
    if (newPwd !== confPwd) {
        msgEl.classList.remove("hidden"); msgEl.textContent = "Passwords don't match."; return;
    }

    const stored = localStorage.getItem("sb-lzwmqabxpxuuznhbpewm-auth-token");
    if (!stored) { msgEl.classList.remove("hidden"); msgEl.textContent = "Session expired. Please request a new reset link."; return; }
    const session     = JSON.parse(stored);
    const accessToken = session.access_token;

    const btn = document.querySelector("[onclick='submitNewPassword()']");
    if (btn) { btn.disabled = true; btn.textContent = "Saving…"; }

    try {
        const res = await fetch("https://lzwmqabxpxuuznhbpewm.supabase.co/auth/v1/user", {
            method: "PUT",
            headers: {
                "Content-Type":  "application/json",
                "apikey":        SB_KEY,
                "Authorization": "Bearer " + accessToken
            },
            body: JSON.stringify({ password: newPwd })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || data.error_description || "Failed");

        msgEl.classList.remove("hidden");
        msgEl.style.color = "#10b981";
        msgEl.textContent = "✅ Password updated! Signing you in…";
        if (btn) { btn.textContent = "✅ Done"; }

        // Sign in properly
        setTimeout(async () => {
            localStorage.removeItem("sb-lzwmqabxpxuuznhbpewm-auth-token");
            currentUser = null;
            show("screen-signin");
        }, 1500);
    } catch(e) {
        msgEl.classList.remove("hidden");
        msgEl.textContent = "Error: " + e.message;
        if (btn) { btn.disabled = false; btn.textContent = "Set New Password"; }
    }
}

async function changePassword() {
    const newPwd  = document.getElementById("set-new-password").value;
    const confPwd = document.getElementById("set-confirm-password").value;
    const msgEl   = document.getElementById("change-pwd-msg");
    msgEl.classList.add("hidden");

    if (!newPwd || newPwd.length < 6) {
        msgEl.classList.remove("hidden"); msgEl.textContent = "Password must be at least 6 characters."; return;
    }
    if (newPwd !== confPwd) {
        msgEl.classList.remove("hidden"); msgEl.textContent = "Passwords don't match."; return;
    }

    const stored = localStorage.getItem("sb-lzwmqabxpxuuznhbpewm-auth-token");
    if (!stored) { msgEl.classList.remove("hidden"); msgEl.textContent = "Not signed in."; return; }
    const session = JSON.parse(stored);
    const accessToken = session.access_token;

    const btn = document.querySelector("[onclick='changePassword()']");
    if (btn) { btn.disabled = true; btn.textContent = "Updating…"; }

    try {
        const res = await fetch("https://lzwmqabxpxuuznhbpewm.supabase.co/auth/v1/user", {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                "apikey": SB_KEY,
                "Authorization": "Bearer " + accessToken
            },
            body: JSON.stringify({ password: newPwd })
        });
        const json = await res.json();
        msgEl.classList.remove("hidden", "auth-error");
        if (!res.ok) {
            msgEl.classList.add("auth-error");
            msgEl.textContent = json.msg || json.message || "Failed to update password.";
        } else {
            msgEl.style.color = "var(--amber)";
            msgEl.textContent = "✅ Password updated successfully.";
            document.getElementById("set-new-password").value = "";
            document.getElementById("set-confirm-password").value = "";
        }
    } catch(e) {
        msgEl.classList.remove("hidden"); msgEl.classList.add("auth-error");
        msgEl.textContent = "Network error. Please try again.";
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = "Update Password"; }
    }
}

// ── Forgot password — OTP flow ────────────────────────────────
let fpMethod = "email";

async function fpSendCode() {
    const btn   = document.getElementById("fp-send-btn");
    const msgEl = document.getElementById("forgot-msg");
    msgEl.classList.add("hidden");

    let contact = document.getElementById("fp-email").value.trim();
    if (!contact) { authShowError("forgot-msg", "Please enter your email."); return; }

    btn.disabled = true; btn.textContent = "Sending\u2026";

    try {
        const res = await fetch(AI_PROXY_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "send_reset_code", method: fpMethod, contact })
        });
        const data = await res.json();
        if (!res.ok) {
            authShowError("forgot-msg", data.error || "Failed to send code.");
            btn.disabled = false; btn.textContent = "Send Code";
            return;
        }
        document.getElementById("fp-step1").style.display = "none";
        document.getElementById("fp-step2").style.display = "block";
        document.getElementById("fp-sent-msg").textContent = fpMethod === "email"
            ? "We emailed a 6-digit code to " + contact
            : "We texted a 6-digit code to " + contact;
        setTimeout(() => document.getElementById("fp-code").focus(), 300);
    } catch(e) {
        authShowError("forgot-msg", "Network error. Please try again.");
        btn.disabled = false; btn.textContent = "Send Code";
    }
}

async function fpVerifyAndReset() {
    const btn   = document.getElementById("fp-verify-btn");
    const msgEl = document.getElementById("fp-step2-msg");
    msgEl.classList.add("hidden");

    const code   = String(document.getElementById("fp-code").value).trim();
    const newPw  = document.getElementById("fp-newpw").value;
    const confPw = document.getElementById("fp-confirmpw").value;

    if (!code || code.length !== 6) { authShowError("fp-step2-msg", "Enter the 6-digit code."); return; }
    if (newPw.length < 6)         { authShowError("fp-step2-msg", "Password must be at least 6 characters."); return; }
    if (newPw !== confPw)         { authShowError("fp-step2-msg", "Passwords don't match."); return; }

    btn.disabled = true; btn.textContent = "Verifying\u2026";

    try {
        const contact = document.getElementById("fp-email").value.trim();

        const res = await fetch(AI_PROXY_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "verify_reset_code", method: fpMethod, contact, code, password: newPw })
        });
        const data = await res.json();

        if (!res.ok) {
            authShowError("fp-step2-msg", data.error || "Incorrect code. Please try again.");
            btn.disabled = false; btn.textContent = "Set New Password";
            return;
        }

        msgEl.classList.remove("hidden");
        msgEl.style.cssText = "background:#065f46;color:#6ee7b7;padding:12px;border-radius:8px;font-size:14px;margin-bottom:12px;";
        msgEl.textContent = "\u2705 Password updated! Sign in with your new password.";
        btn.textContent = "\u2705 Done";
        localStorage.removeItem("tileiq-bio-creds");
        setTimeout(() => { show("screen-signin"); fpBackToStep1(); }, 2000);

    } catch(e) {
        authShowError("fp-step2-msg", "Error: " + e.message);
        btn.disabled = false; btn.textContent = "Set New Password";
    }
}

function fpBackToStep1() {
    document.getElementById("fp-step1").style.display = "block";
    document.getElementById("fp-step2").style.display = "none";
    document.getElementById("fp-send-btn").disabled = false;
    document.getElementById("fp-send-btn").textContent = "Send Code";
    document.getElementById("fp-code").value = "";
    document.getElementById("fp-newpw").value = "";
    document.getElementById("fp-confirmpw").value = "";
    document.getElementById("fp-step2-msg").classList.add("hidden");
}

async function authForgot() { fpSendCode(); }


/* ─── BIOMETRIC AUTH ─────────────────────────────────────────── */
let BiometricAuth = null;

async function initBiometricPlugin() {
    try {
        if (BiometricAuth) return;
        if (!window.Capacitor) return;
        const P = window.Capacitor.Plugins;
        const native = (P && (P.BiometricAuthNative || P.BiometricAuth)) || null;
        if (native) {
            BiometricAuth = {
                checkBiometry: () => native.checkBiometry(),
                authenticate: (opts) => native.internalAuthenticate(opts || {})
            };
            return;
        }
        // Fallback via nativePromise
        if (window.Capacitor.nativePromise) {
            BiometricAuth = {
                checkBiometry: () => window.Capacitor.nativePromise('BiometricAuthNative', 'checkBiometry', {}),
                authenticate: (opts) => window.Capacitor.nativePromise('BiometricAuthNative', 'internalAuthenticate', opts || {})
            };
        }
    } catch(e) {}
}

async function initBiometricButton() {
    const btn = document.getElementById("si-biometric");
    if (!btn) return;
    const saved = localStorage.getItem("tileiq-bio-creds");
    if (!saved) {
        const dbg = document.getElementById("si-biometric-debug");
        if (dbg) dbg.textContent = "";
        return;
    }
    try {
        await initBiometricPlugin();
        if (BiometricAuth) {
            const result = await BiometricAuth.checkBiometry();
            // Show button if biometrics OR device credentials (PIN/pattern) available
            if (result.isAvailable || result.strongBiometricAvailable || result.deviceCredentialAvailable) {
                btn.classList.remove("hidden");
                const icon = document.getElementById("si-biometric-icon");
                const isFace = result.biometryType === 2 || result.biometryType === 5;
                const isFingerprint = result.biometryType === 1;
                if (icon) icon.textContent = isFace ? "😊" : isFingerprint ? "👆" : "🔒";
                // Update button label to match actual method
                const btnLabel = isFace ? "Sign in with Face" : isFingerprint ? "Sign in with Fingerprint" : "Sign in with Biometrics";
                if (btn) btn.innerHTML = `<span id="si-biometric-icon">${isFace ? "😊" : isFingerprint ? "👆" : "🔒"}</span> ${btnLabel}`;
            } else {
                // Force show anyway if creds exist — let authenticate decide
                btn.classList.remove("hidden");
                const dbg = document.getElementById("si-biometric-debug");
                if (dbg) dbg.textContent = "";
            }
        } else {
            // No plugin — still show if creds exist (web fallback path)
            btn.classList.remove("hidden");
        }
    } catch(e) {
        // Show button anyway — let the actual auth attempt handle failure
        btn.classList.remove("hidden");
    }
}

async function authBiometric() {
    const saved = localStorage.getItem("tileiq-bio-creds");
    if (!saved) return;
    const btn = document.getElementById("si-biometric");
    if (btn) { btn.disabled = true; btn.textContent = "Verifying…"; }
    authHideError("signin-error");
    try {
        await initBiometricPlugin();
        if (BiometricAuth) {
            await BiometricAuth.authenticate({
                reason:                   "Verify your identity to sign in",
                cancelTitle:              "Use password instead",
                allowDeviceCredential:    true,
                androidBiometricStrength: 0  // Class 1 — allows face unlock on Pixel devices
            });
        } else {
            throw new Error("Biometric not available");
        }
        const { email, password } = JSON.parse(atob(saved));
        document.getElementById("si-email").value = email;
        document.getElementById("si-password").value = password;
        if (btn) { btn.disabled = false; btn.textContent = "🔒 Sign in with Biometrics"; }
        await authSignIn();
    } catch(e) {
        if (btn) { btn.disabled = false; btn.textContent = "🔒 Sign in with Biometrics"; }
        if (e.code !== 10 && e.code !== 13 && e.message !== "Cancel") {
            authShowError("signin-error", "Biometric failed. Please sign in with password.");
        }
    }
}

function saveBiometricCredentials(email, password) {
    localStorage.setItem("tileiq-bio-creds", btoa(JSON.stringify({ email, password })));
    console.log("bio: creds saved for", email);
}

/* ─── BOOT ───────────────────────────────────────────────────── */
/* ================================================================
   DOMAIN VERIFICATION (Pro)
================================================================ */
function initDomainVerifyUI() {
    const card = document.getElementById("domain-verify-card");
    if (!card) return;
    // Only hide if we know for certain user is not Pro — not while still loading
    if (_proStatus === false && !checkAccessCodePro()) { card.style.display = "none"; return; }
    card.style.display = "block";

    const domainInput  = document.getElementById("set-custom-domain");
    const statusBadge  = document.getElementById("domain-status-badge");
    const verifiedInfo = document.getElementById("domain-verified-info");
    const dnsRecords   = document.getElementById("domain-dns-records");
    const checkRow     = document.getElementById("domain-check-row");
    const removeRow    = document.getElementById("domain-remove-row");

    if (settings.verifiedDomain) {
        if (domainInput) domainInput.value = settings.verifiedDomain;
        // If domainId is missing (lost after reinstall), show check button to recover
        if (!settings.domainId && settings.domainStatus !== "verified") {
            if (statusBadge) statusBadge.innerHTML = `<span style="background:#78350f;color:#fde68a;padding:3px 8px;border-radius:6px;">⚠️ Tap Check to restore</span>`;
            if (checkRow)  checkRow.style.display  = "block";
            if (removeRow) removeRow.style.display = "block";
        } else if (settings.domainStatus === "verified") {
            if (statusBadge) statusBadge.innerHTML = `<span style="background:#065f46;color:#6ee7b7;padding:3px 8px;border-radius:6px;">✅ Verified</span>`;
            if (verifiedInfo) { verifiedInfo.style.display = "block"; verifiedInfo.textContent = `✅ Quotes sent from: ${settings.companyEmail || "your company email"} via ${settings.verifiedDomain}`; }
            if (checkRow)  checkRow.style.display  = "none";
            if (removeRow) removeRow.style.display = "block";
            if (dnsRecords) dnsRecords.style.display = "none";
        } else {
            if (statusBadge) statusBadge.innerHTML = `<span style="background:#78350f;color:#fde68a;padding:3px 8px;border-radius:6px;">⏳ Pending DNS</span>`;
            if (verifiedInfo) verifiedInfo.style.display = "none";
            if (checkRow)  checkRow.style.display  = "block";
            if (removeRow) removeRow.style.display = "block";
            if (settings.domainDnsRecords) renderDnsRecords(settings.domainDnsRecords);
        }
    } else {
        if (statusBadge) statusBadge.innerHTML = "";
        if (verifiedInfo) verifiedInfo.style.display = "none";
        if (checkRow)  checkRow.style.display  = "none";
        if (removeRow) removeRow.style.display = "none";
        if (dnsRecords) dnsRecords.style.display = "none";
    }
}

function renderDnsRecords(records) {
    const el = document.getElementById("domain-dns-records");
    if (!el || !records?.length) return;
    el.style.display = "block";
    el.innerHTML = `
        <div style="font-size:12px;font-weight:700;color:#f59e0b;margin-bottom:8px;">Add these DNS records to your domain registrar:</div>
        ${records.map(r => `
        <div style="background:#0f172a;border-radius:8px;padding:10px;margin-bottom:6px;font-size:11px;font-family:monospace;">
            <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
                <span style="color:#64748b;">Type</span>
                <span style="color:#e2e8f0;font-weight:700;">${r.record_type || r.type || "?"}</span>
            </div>
            <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
                <span style="color:#64748b;">Name</span>
                <span style="color:#e2e8f0;word-break:break-all;text-align:right;max-width:70%;">${r.name}</span>
            </div>
            <div style="display:flex;justify-content:space-between;">
                <span style="color:#64748b;">Value</span>
                <span style="color:#e2e8f0;word-break:break-all;text-align:right;max-width:70%;">${r.value}</span>
            </div>
        </div>`).join("")}
        <div style="font-size:11px;color:#64748b;margin-top:6px;">DNS changes can take up to 48hrs. Tap "Check Verification Status" once added.</div>`;
}

async function startDomainVerification() {
    if (!isPro()) { showPaywall("domain_verify"); return; }
    const domainInput = document.getElementById("set-custom-domain");
    const domain = (domainInput?.value || "").trim().toLowerCase().replace(/^https?:\/\//,"").replace(/\//g,"");
    const msgEl  = document.getElementById("domain-verify-msg");
    const btn    = document.getElementById("btn-verify-domain");

    if (!domain || !domain.includes(".")) {
        if (msgEl) { msgEl.style.color = "#f87171"; msgEl.textContent = "Please enter a valid domain e.g. mycompany.co.uk"; }
        return;
    }
    if (btn) { btn.disabled = true; btn.textContent = "Verifying…"; }
    if (msgEl) { msgEl.style.color = "#94a3b8"; msgEl.textContent = "Registering domain with Resend…"; }

    try {
        const resp = await fetch(TILEIQ_WORKER_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "verify_domain", domain, userId: currentUser?.id })
        });
        const data = await resp.json();
        if (!resp.ok || data.error) {
            if (msgEl) { msgEl.style.color = "#f87171"; msgEl.textContent = data.error || "Failed to register domain."; }
            if (btn) { btn.disabled = false; btn.textContent = "Verify"; }
            return;
        }
        settings.verifiedDomain   = domain;
        settings.domainStatus     = data.status || "pending";
        settings.domainId         = data.domainId;
        settings.domainDnsRecords = data.records;
        saveSettingsLocal();
        if (settings.domainStatus === "verified") {
            if (msgEl) { msgEl.style.color = "#10b981"; msgEl.textContent = "✅ Domain already verified! Quotes will send from your domain."; }
        } else {
            if (msgEl) { msgEl.style.color = "#f59e0b"; msgEl.textContent = "DNS records generated — add them to your registrar, then tap Check Status."; }
        }
        if (btn) { btn.disabled = false; btn.textContent = "Verify"; }
        initDomainVerifyUI();
        if (data.records && data.records.length) renderDnsRecords(data.records);
    } catch(e) {
        if (msgEl) { msgEl.style.color = "#f87171"; msgEl.textContent = "Network error. Please try again."; }
        if (btn) { btn.disabled = false; btn.textContent = "Verify"; }
    }
}

async function checkDomainVerification() {
    const msgEl = document.getElementById("domain-verify-msg");
    if (msgEl) { msgEl.style.color = "#94a3b8"; msgEl.textContent = "Checking…"; }
    try {
        const resp = await fetch(TILEIQ_WORKER_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            // Pass both domainId (if we have it) and domain name (fallback lookup)
            body: JSON.stringify({ action: "check_domain", domainId: settings.domainId || null, domain: settings.verifiedDomain || null })
        });
        const data = await resp.json();

        // Always save back domainId and records in case they were lost (e.g. after reinstall)
        if (data.domainId) settings.domainId = data.domainId;
        if (data.records && data.records.length) settings.domainDnsRecords = data.records;

        if (data.status === "verified") {
            settings.domainStatus = "verified";
            saveSettingsLocal();
            if (msgEl) { msgEl.style.color = "#10b981"; msgEl.textContent = "✅ Domain verified! Quotes will now send from your domain."; }
            initDomainVerifyUI();
        } else {
            // Save recovered records even if not verified yet
            settings.domainStatus = data.status || "pending";
            saveSettingsLocal();
            if (msgEl) { msgEl.style.color = "#f59e0b"; msgEl.textContent = "Not verified yet — DNS can take up to 48hrs. Try again later."; }
            initDomainVerifyUI();
        }
    } catch(e) {
        if (msgEl) { msgEl.style.color = "#f87171"; msgEl.textContent = "Network error. Please try again."; }
    }
}

async function removeDomain() {
    if (!confirm("Remove domain verification? Quotes will revert to sending from quotes@tileiq.app.")) return;
    if (settings.domainId) {
        fetch(TILEIQ_WORKER_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "remove_domain", domainId: settings.domainId })
        }).catch(() => {});
    }
    settings.verifiedDomain = settings.domainStatus = settings.domainId = settings.domainDnsRecords = null;
    saveSettingsLocal();
    const domainInput = document.getElementById("set-custom-domain");
    const msgEl = document.getElementById("domain-verify-msg");
    if (domainInput) domainInput.value = "";
    if (msgEl) msgEl.textContent = "";
    initDomainVerifyUI();
}

/* ================================================================
   CONTACT SUPPORT FORM
================================================================ */
let _contactType = "problem";

function showContactForm() {
    const emailEl = document.getElementById("contact-email");
    if (emailEl) emailEl.value = settings.companyEmail || currentUser?.email || "";
    const successEl = document.getElementById("contact-success");
    const formEl    = document.getElementById("contact-form-body");
    const errEl     = document.getElementById("contact-error");
    const msgEl     = document.getElementById("contact-message");
    const btn       = document.getElementById("contact-submit-btn");
    if (successEl) successEl.style.display = "none";
    if (formEl)    formEl.style.display    = "block";
    if (errEl)     errEl.style.display     = "none";
    if (msgEl)     msgEl.value             = "";
    if (btn)       { btn.disabled = false; btn.textContent = "Send Message"; }
    setContactType("problem");
    show("screen-contact");
}

function closeContactForm() { show("screen-help"); }

function setContactType(type) {
    _contactType = type;
    const probBtn = document.getElementById("contact-type-problem");
    const suggBtn = document.getElementById("contact-type-suggestion");
    if (!probBtn || !suggBtn) return;
    const active   = "flex:1;padding:12px;border-radius:10px;border:2px solid #f59e0b;background:#f59e0b;color:#000;font-weight:700;font-size:14px;cursor:pointer;";
    const inactive = "flex:1;padding:12px;border-radius:10px;border:2px solid var(--border);background:none;color:var(--text-muted);font-weight:700;font-size:14px;cursor:pointer;";
    probBtn.style.cssText = type === "problem" ? active : inactive;
    suggBtn.style.cssText = type === "suggestion" ? active : inactive;
}

async function submitContactForm() {
    const email   = document.getElementById("contact-email")?.value.trim();
    const message = document.getElementById("contact-message")?.value.trim();
    const errEl   = document.getElementById("contact-error");
    const btn     = document.getElementById("contact-submit-btn");
    if (errEl) errEl.style.display = "none";
    if (!message) {
        if (errEl) { errEl.textContent = "Please enter a message."; errEl.style.display = "block"; }
        return;
    }
    if (btn) { btn.disabled = true; btn.textContent = "Sending…"; }
    try {
        const resp = await fetch(TILEIQ_WORKER_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                action: "contact_support", type: _contactType, message,
                fromEmail: email || currentUser?.email || "unknown",
                userName: settings.companyName || currentUser?.email || "Unknown user",
                appVersion: "TileIQ Pro"
            })
        });
        if (resp.ok) {
            const successEl = document.getElementById("contact-success");
            const formEl    = document.getElementById("contact-form-body");
            if (successEl) successEl.style.display = "block";
            if (formEl)    formEl.style.display    = "none";
            setTimeout(() => show("screen-help"), 2500);
        } else { throw new Error("Server error " + resp.status); }
    } catch(e) {
        if (errEl) { errEl.textContent = "Failed to send. Please try again."; errEl.style.display = "block"; }
        if (btn) { btn.disabled = false; btn.textContent = "Send Message"; }
    }
}

async function loadUserData() {
    // ── 0. Load from localStorage immediately (offline fallback) ─
    try {
        const localJobs2 = localStorage.getItem(LOCAL_JOBS_KEY(currentUser?.id));
        if (localJobs2) jobs = JSON.parse(localJobs2);
        const localSet2 = localStorage.getItem(LOCAL_SETTINGS_KEY(currentUser?.id));
        if (localSet2) settings = { ...settings, ...JSON.parse(localSet2) };
    } catch(e) {}

    if (!navigator.onLine) {
        console.log("Offline — using local data");
        _updateSyncBadge(true);
        setTimeout(syncAllQuoteStatuses, 0);
        return;
    }

    // Add a timeout so we never hang on slow/no network
    const fetchWithTimeout = (url, opts, ms = 15000) => {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), ms);
        return fetch(url, { ...opts, signal: ctrl.signal }).finally(() => clearTimeout(timer));
    };

    // Skip cloud fetch if cache is fresh (under 30 minutes old)
    const lastSync = parseInt(localStorage.getItem("tileiq-last-sync") || "0");
    const cacheAge = Date.now() - lastSync;
    if (cacheAge < 30 * 60 * 1000 && jobs.length > 0) {
        return; // Use cache
    }

    // ── Try D1 first, fall back to Supabase ───────────────────
    let loadedFromD1 = false;
    try {
        const d1Resp = await fetchWithTimeout(AI_PROXY_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "d1_load", user_id: currentUser.id })
        }, 6000);
        if (d1Resp.ok) {
            const d1Data = await d1Resp.json();
            if (d1Data.settings) {
                settings = { ...settings, ...d1Data.settings };
                localStorage.setItem(LOCAL_SETTINGS_KEY(currentUser?.id), JSON.stringify(settings));
            }
            // Load customers from Supabase
            if (currentUser) {
                try {
                    let custToken = '';
                    try { const s = localStorage.getItem(`sb-lzwmqabxpxuuznhbpewm-auth-token`); if (s) custToken = JSON.parse(s).access_token || ''; } catch(e) {}
                    const custResp = await fetch(`${SB_URL}/rest/v1/customers?user_id=eq.${currentUser.id}&select=data&limit=1`, {
                        headers: { 'apikey': SB_KEY, 'Authorization': `Bearer ${custToken || SB_KEY}` }
                    });
                    const custRows = await custResp.json();
                    if (Array.isArray(custRows) && custRows[0]?.data?.length) {
                        const sbCusts = custRows[0].data;
                        const localCusts = getSavedCustomers();
                        const merged = [...sbCusts];
                        for (const lc of localCusts) {
                            if (!merged.find(c => c.id === lc.id)) merged.push(lc);
                        }
                        localStorage.setItem(LOCAL_CUSTOMERS_KEY(currentUser?.id), JSON.stringify(merged));
                    }
                } catch(e) { console.warn('Customer load failed:', e.message); }
            }
            if (d1Data.jobs?.length) {
                // Merge D1 jobs with localStorage cache — keep newer version of each job
                const cached = localStorage.getItem(LOCAL_JOBS_KEY(currentUser?.id));
                const localJobs = cached ? JSON.parse(cached) : [];
                const merged = [...d1Data.jobs];
                for (const lj of localJobs) {
                    const idx = merged.findIndex(j => j.id === lj.id);
                    if (idx === -1) merged.push(lj); // local-only job, not in D1
                    else if ((lj.updatedAt || 0) > (merged[idx].updatedAt || 0)) merged[idx] = lj;
                }
                jobs = merged;
                localStorage.setItem(LOCAL_JOBS_KEY(currentUser?.id), JSON.stringify(jobs));
                localStorage.setItem("tileiq-last-sync", Date.now().toString());
                loadedFromD1 = true;
                // If merge added local-only jobs, push them up to D1
                if (merged.length > d1Data.jobs.length) {
                    fetch(AI_PROXY_URL, { method: "POST", headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ action: "d1_save_jobs", user_id: currentUser.id, jobs })
                    }).catch(e => console.warn("D1 merge-push failed:", e.message));
                }
            }
        }
    } catch(e) { console.warn("D1 load failed:", e.message); }

    if (!loadedFromD1) {
        // Fall back to Supabase and migrate to D1
        try {
            let accessToken = "";
            try {
                const s = localStorage.getItem("sb-lzwmqabxpxuuznhbpewm-auth-token");
                if (s) accessToken = JSON.parse(s).access_token || "";
            } catch(e) {}
            const headers = {
                "apikey":        SB_KEY,
                "Authorization": `Bearer ${accessToken || SB_KEY}`
            };
            const [sbJobs, sbSettings] = await Promise.all([
                fetch(`${SB_URL}/rest/v1/jobs?user_id=eq.${currentUser.id}&select=data&order=updated_at.desc`, { headers }).then(r => r.json()),
                fetch(`${SB_URL}/rest/v1/settings?user_id=eq.${currentUser.id}&select=data&limit=1`, { headers }).then(r => r.json())
            ]);
            if (Array.isArray(sbJobs) && sbJobs.length) {
                const sbParsed = sbJobs.map(r => r.data).filter(Boolean);
                // Merge with localStorage — never discard local jobs
                const localCached = localStorage.getItem(LOCAL_JOBS_KEY(currentUser?.id));
                const localParsed = localCached ? JSON.parse(localCached) : [];
                const merged = [...sbParsed];
                for (const lj of localParsed) {
                    const idx = merged.findIndex(j => j.id === lj.id);
                    if (idx === -1) merged.push(lj);
                    else if ((lj.updatedAt || 0) > (merged[idx].updatedAt || 0)) merged[idx] = lj;
                }
                jobs = merged;
                localStorage.setItem(LOCAL_JOBS_KEY(currentUser?.id), JSON.stringify(jobs));
                // Push merged set to D1
                fetch(AI_PROXY_URL, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action: "d1_save_jobs", user_id: currentUser.id, jobs })
                }).catch(e => console.warn("D1 migration failed:", e.message));
            }
            if (Array.isArray(sbSettings) && sbSettings[0]?.data) {
                settings = { ...settings, ...sbSettings[0].data };
                localStorage.setItem(LOCAL_SETTINGS_KEY(currentUser?.id), JSON.stringify(settings));
                fetch(AI_PROXY_URL, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action: "d1_save_settings", user_id: currentUser.id, settings })
                }).catch(() => {});
            }
            localStorage.setItem("tileiq-last-sync", Date.now().toString());
        } catch(e) { console.warn("Supabase fallback failed:", e.message); }
    }
    // Silently sync any pending quote statuses in the background
    setTimeout(syncAllQuoteStatuses, 1500);
    setTimeout(initPushNotifications, 2000);
    setTimeout(checkJobReminders, 3000);
    setTimeout(initRevenueCat, 2500);
}

// Auth state managed manually via localStorage — no onAuthStateChange needed

// Startup session check below handles all routing

// On startup — check localStorage for existing session directly
(async () => {
    const t0 = Date.now();

    if (localStorage.getItem("tileiq-signed-out")) {
        show("screen-signin");
        initBiometricButton();
        const offlineBanner = document.getElementById("signin-offline-banner");
        if (offlineBanner) offlineBanner.style.display = navigator.onLine ? "none" : "block";
        setTimeout(async () => { try { const App = window.Capacitor?.Plugins?.App; if (App) { const r = await App.getLaunchUrl(); if (r?.url) handleDeepLink(r.url); } } catch(e) {} }, 300);
        return;
    }

    // Check for valid session first, then load user-specific data
    const stored = localStorage.getItem("sb-lzwmqabxpxuuznhbpewm-auth-token");
    if (stored) {
        try {
            const session = JSON.parse(stored);
            const now = Math.floor(Date.now() / 1000);
            const tokenExpired = session.expires_at <= now;

            // Use navigator.onLine as quick check — loadUserData handles real failures gracefully
            const isOffline = !navigator.onLine;

            if (session.user && (!tokenExpired || isOffline)) {
                currentUser = session.user;

                // Reset pro state — will be re-evaluated for this user
                _proStatus   = null;
                _rcAppUserId = null;

                // Load user-specific cache AFTER we know who the user is
                try {
                    const localJobs = localStorage.getItem(LOCAL_JOBS_KEY(currentUser.id));
                    if (localJobs) jobs = JSON.parse(localJobs);
                    else jobs = [];  // New user — start fresh
                    const localSet = localStorage.getItem(LOCAL_SETTINGS_KEY(currentUser.id));
                    if (localSet) settings = { ...DEFAULT_SETTINGS, ...JSON.parse(localSet) };
                } catch(e) { jobs = []; }
                show("screen-home");
                isLoadingJobs = jobs.length === 0;
                renderHomeScreen();
                renderDashboard();
                updatePrepPriceBadges();
                initBiometricButton();

                if (isOffline) {
                    _updateSyncBadge(true);
                    isLoadingJobs = false;
                    renderHomeScreen();
                } else {
                    // Online — defer network calls so UI renders first
                    setTimeout(async () => {
                        try {
                            await Promise.all([
                                sb.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token }).catch(() => {}),
                                loadUserData()
                            ]);
                            isLoadingJobs = false;
                            renderHomeScreen();
                            renderDashboard();
                            updatePrepPriceBadges();
                            stripPhotosFromJobs();
                            setTimeout(syncAllQuoteStatuses, 500);
                            setTimeout(initPushNotifications, 1000);
                            setTimeout(initRevenueCat, 1500);
                        } catch(e) {
                            // Network failed — stay on home with cached data, don't redirect to login
                            isLoadingJobs = false;
                            if (!navigator.onLine) _updateSyncBadge(true);
                            renderHomeScreen();
                            console.error("Startup network error (using cache):", e);
                        }
                    }, 50);
                }

                // Deep links
                setTimeout(async () => {
                    try {
                        const App = window.Capacitor?.Plugins?.App;
                        if (App) { const r = await App.getLaunchUrl(); if (r?.url) handleDeepLink(r.url); }
                    } catch(e) {}
                }, 500);
                return;
            }
        } catch(e) {}
    }

    // No session — sign in screen
    show("screen-signin");
    initBiometricButton();
    const offlineBanner = document.getElementById("signin-offline-banner");
    if (offlineBanner) offlineBanner.style.display = navigator.onLine ? "none" : "block";
    setTimeout(async () => {
        try {
            const App = window.Capacitor?.Plugins?.App;
            if (App) { const r = await App.getLaunchUrl(); if (r?.url) handleDeepLink(r.url); }
        } catch(e) {}
    }, 300);
    // ── Leica Disto D2 BLE ───────────────────────────────────────────
    const DistoD2 = {
        SERVICE_UUID: '3ab10100-f831-4395-b29d-570977d5bf94',
        CHAR_UUID:    '3ab10101-f831-4395-b29d-570977d5bf94',
        _deviceId: null,
        _activeInput: null,
        _connected: false,
        init() {},
        isConnected() { return this._connected; },
        setActive(inputEl) { this._activeInput = inputEl; },
        async connect() {
            try {
                const ble = Capacitor.Plugins.BluetoothLe;
                await ble.initialize();
                const result = await ble.requestDevice({ services: [this.SERVICE_UUID], optionalServices: [] });
                this._deviceId = result.deviceId;
                await ble.connect({ deviceId: this._deviceId });
                this._connected = true;
                this._updateBtn();
                const notifyKey = `notification|${this._deviceId}|${this.SERVICE_UUID}|${this.CHAR_UUID}`;
                if (this._notifyListener) { await this._notifyListener.remove().catch(() => {}); }
                this._notifyListener = await ble.addListener(notifyKey, (event) => {
                    const raw = event?.value;
                    if (!raw) return;
                    let dataView;
                    if (raw instanceof DataView) {
                        dataView = raw;
                    } else if (typeof raw === 'string') {
                        // hex string fallback
                        const bytes = new Uint8Array(raw.match(/.{1,2}/g).map(b => parseInt(b, 16)));
                        dataView = new DataView(bytes.buffer);
                    } else { return; }
                    const metres = dataView.getFloat32(0, true);
                    if (isFinite(metres) && metres > 0 && this._activeInput) {
                        this._activeInput.value = metres.toFixed(3);
                        this._activeInput.dispatchEvent(new Event('input', { bubbles: true }));
                        // Advance to next data-disto input
                        const all = Array.from(document.querySelectorAll('input[data-disto]'));
                        const idx = all.indexOf(this._activeInput);
                        const next = all[idx + 1];
                        if (next) {
                            next.focus();
                            this._activeInput = next;
                        }
                    }
                });
                await ble.startNotifications({ deviceId: this._deviceId, service: this.SERVICE_UUID, characteristic: this.CHAR_UUID });
            } catch (err) {
                console.error('Disto connect error:', err);
                alert('Could not connect to Disto D2. Make sure Bluetooth is on and the device is nearby.');
                this._connected = false;
                this._updateBtn();
            }
        },
        async disconnect() {
            try {
                if (this._notifyListener) { await this._notifyListener.remove().catch(() => {}); this._notifyListener = null; }
                if (this._deviceId) await Capacitor.Plugins.BluetoothLe.disconnect({ deviceId: this._deviceId });
            } catch (_) {}
            this._connected = false;
            this._deviceId = null;
            this._updateBtn();
        },
        _updateBtn() {
            const btn = document.getElementById('disto-connect-btn');
            if (btn) btn.textContent = this._connected ? '🔵 Disto Connected' : '⚪ Connect Disto';
        }
    };
    window.Disto = DistoD2;
    // ────────────────────────────────────────────────────────────────

    // Disto D2
    if (window.Disto) {
        window.Disto.init();
        document.getElementById("disto-connect-btn")?.addEventListener("click", async () => {
            if (window.Disto.isConnected()) { await window.Disto.disconnect(); }
            else { await window.Disto.connect(); }
        });
        // Set active input on focus for any data-disto field
        document.addEventListener('focusin', (e) => {
            if (e.target?.matches('input[data-disto]')) {
                window.Disto.setActive(e.target);
            }
        });
    }
})();


/* Fill in the £/m² cost hints on all prep option labels */
function updatePrepPriceBadges() {
    const S = settings;
    document.querySelectorAll(".pc-cb").forEach(el   => el.textContent = S.cementBoard);
    document.querySelectorAll(".pc-mem").forEach(el  => el.textContent = S.membrane);
    document.querySelectorAll(".pc-tank-r, .pc-tank-w, .pc-tank-f").forEach(el => el.textContent = S.tanking);
    document.querySelectorAll(".pc-clips").forEach(el => el.textContent = S.clipPrice || 12);
    document.querySelectorAll(".pc-trim").forEach(el => el.textContent = `£${(S.trimPrice || 3.50).toFixed(2)}`);
    document.querySelectorAll(".pc-primer").forEach(el => el.textContent = S.primerPrice || 3.50);
    document.querySelectorAll(".pc-stone").forEach(el => el.textContent = S.stoneSurcharge || 8.00);
    document.querySelectorAll(".pc-sealer").forEach(el => el.textContent = S.sealerPrice || 5.00);
    updateLevelBadge("rm-r-leveldepth", ".pc-lev-r");
    updateLevelBadge("rm-f-leveldepth", ".pc-lev-f");
}

function updateLevelBadge(selectId, cls) {
    const el = document.getElementById(selectId);
    const depth = el ? el.value : "2";
    const cost  = depth === "2" ? settings.level2 : depth === "3" ? settings.level3 : settings.level4;
    document.querySelectorAll(cls).forEach(el => el.textContent = cost);
}

function rmToggleLevelR() {
    const checked = document.getElementById("rm-r-levelling").checked;
    document.getElementById("rm-r-level-depth").classList.toggle("hidden", !checked);
    rmCalc();
}
function rmToggleLevelF() {
    const checked = document.getElementById("rm-f-levelling").checked;
    document.getElementById("rm-f-level-depth").classList.toggle("hidden", !checked);
    rmCalc();
}
// Stone reveal sealer row
function rmToggleStoneR()  { const c = document.getElementById("rm-r-stone").checked;  document.getElementById("rm-r-sealer-row").classList.toggle("hidden", !c);  if (!c) document.getElementById("rm-r-sealer").checked = false;  rmCalc(); }
function rmToggleWStoneR() { const c = document.getElementById("rm-r-wstone").checked; document.getElementById("rm-r-wsealer-row").classList.toggle("hidden", !c); if (!c) document.getElementById("rm-r-wsealer").checked = false; rmCalc(); }
function rmToggleStoneF()  { const c = document.getElementById("rm-f-stone").checked;  document.getElementById("rm-f-sealer-row").classList.toggle("hidden", !c);  if (!c) document.getElementById("rm-f-sealer").checked = false;  rmCalc(); }
function rmToggleStoneW()  { const c = document.getElementById("rm-w-stone").checked;  document.getElementById("rm-w-sealer-row").classList.toggle("hidden", !c);  if (!c) document.getElementById("rm-w-sealer").checked = false;  rmCalc(); }

/* ================================================================
   DASHBOARD
================================================================ */
function goCustomers() {
    show('screen-customers');
    renderCustomersScreen('');
    setTimeout(() => { const el = document.getElementById('customers-search'); if (el) el.value = ''; }, 50);
}

function goAddCustomer(id = null) {
    const titleEl = document.getElementById('add-customer-title');
    if (id) {
        const c = getSavedCustomers().find(x => String(x.id) === String(id));
        if (!c) return;
        document.getElementById('ac-id').value = c.id;
        document.getElementById('ac-name').value = c.name || '';
        document.getElementById('ac-phone').value = c.phone || '';
        document.getElementById('ac-email').value = c.email || '';
        document.getElementById('ac-address').value = c.addr || '';
        document.getElementById('ac-city').value = c.city || '';
        document.getElementById('ac-postcode').value = c.postcode || '';
        document.getElementById('ac-notes').value = c.notes || '';
        if (titleEl) titleEl.textContent = 'Edit Customer';
    } else {
        ['ac-id','ac-name','ac-phone','ac-email','ac-address','ac-city','ac-postcode','ac-notes'].forEach(id => {
            const el = document.getElementById(id); if (el) el.value = '';
        });
        if (titleEl) titleEl.textContent = 'Add Customer';
    }
    show('screen-add-customer');
}

function saveCustomerRecord() {
    const name = document.getElementById('ac-name')?.value.trim();
    if (!name) { alert('Please enter a customer name.'); return; }

    const customers = getSavedCustomers();
    const existingId = document.getElementById('ac-id')?.value;
    const idx = existingId ? customers.findIndex(c => String(c.id) === String(existingId)) : -1;

    const customer = {
        id:       idx >= 0 ? customers[idx].id : Date.now(),
        name,
        phone:    document.getElementById('ac-phone')?.value.trim() || '',
        email:    document.getElementById('ac-email')?.value.trim() || '',
        addr:     document.getElementById('ac-address')?.value.trim() || '',
        city:     document.getElementById('ac-city')?.value.trim() || '',
        postcode: document.getElementById('ac-postcode')?.value.trim() || '',
        notes:    document.getElementById('ac-notes')?.value.trim() || '',
    };

    if (idx >= 0) customers[idx] = customer;
    else customers.unshift(customer);

    saveCustomers(customers);
    goCustomers();
}

function renderCustomersScreen(query = '') {
    const list = document.getElementById('customers-list');
    if (!list) return;
    const q = query.toLowerCase();
    const all = getSavedCustomers();
    const filtered = q ? all.filter(c =>
        c.name?.toLowerCase().includes(q) ||
        c.phone?.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q) ||
        c.addr?.toLowerCase().includes(q) ||
        c.city?.toLowerCase().includes(q)
    ) : all;

    if (filtered.length === 0) {
        list.innerHTML = `<div style="text-align:center;color:var(--muted);padding:40px 20px;font-size:14px;">
            ${q ? 'No customers match "' + esc(q) + '"' : 'No saved customers yet.<br>Tap <strong>+ Add</strong> to add your first customer.'}
        </div>`;
        return;
    }

    list.innerHTML = filtered.map(c => `
        <div class="form-card" style="margin-bottom:10px;cursor:pointer;" onclick="goAddCustomer('${c.id}')">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;">
                <div style="flex:1;">
                    <div style="font-size:16px;font-weight:700;color:var(--text);">${esc(c.name)}</div>
                    ${c.addr ? `<div style="font-size:13px;color:var(--muted);margin-top:3px;">📍 ${esc(c.addr)}${c.city ? ', ' + esc(c.city) : ''}${c.postcode ? ' ' + esc(c.postcode) : ''}</div>` : ''}
                    ${c.phone ? `<div style="font-size:13px;color:var(--muted);margin-top:2px;">📞 ${esc(c.phone)}</div>` : ''}
                    ${c.email ? `<div style="font-size:13px;color:var(--muted);margin-top:2px;">✉️ ${esc(c.email)}</div>` : ''}
                    ${c.notes ? `<div style="font-size:12px;color:var(--muted);margin-top:4px;font-style:italic;">${esc(c.notes)}</div>` : ''}
                </div>
                <div style="display:flex;flex-direction:column;gap:6px;margin-left:10px;">
                    <button onclick="event.stopPropagation();newJobFromCustomer('${c.id}')" 
                        style="background:var(--accent);color:#000;border:none;border-radius:8px;padding:6px 10px;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap;">
                        + Job
                    </button>
                    <button onclick="event.stopPropagation();deleteCustomer('${c.id}')" 
                        style="background:none;border:1px solid var(--border);color:var(--muted);border-radius:8px;padding:6px 10px;font-size:12px;cursor:pointer;">
                        🗑
                    </button>
                </div>
            </div>
        </div>`).join('');
}

function newJobFromCustomer(id) {
    const c = getSavedCustomers().find(x => String(x.id) === String(id));
    if (!c) return;
    goNewJob();
    setTimeout(() => {
        const set = (field, val) => { const el = document.getElementById('nj-' + field); if (el && val) el.value = val; };
        set('name', c.name);
        set('phone', c.phone);
        set('email', c.email);
        set('address', c.addr);
        set('city', c.city);
    }, 100);
}

function deleteCustomer(id) {
    if (!confirm('Delete this saved customer?')) return;
    const customers = getSavedCustomers().filter(c => String(c.id) !== String(id));
    saveCustomers(customers);
    renderCustomersScreen(document.getElementById('customers-search')?.value || '');
    // Also close modal if open
    document.getElementById('saved-customers-modal')?.remove();
}

function goHome() {
    show("screen-home");
    renderHomeScreen();
}

function renderHomeScreen() {
    // Greeting
    const greetEl = document.getElementById("home-greeting");
    if (greetEl) {
        try {
            const stored = localStorage.getItem("sb-lzwmqabxpxuuznhbpewm-auth-token");
            const sessionUser = stored ? JSON.parse(stored).user : currentUser;
            const name = sessionUser?.user_metadata?.full_name || sessionUser?.email?.split("@")[0] || "there";
            const hr = new Date().getHours();
            const timeOfDay = hr < 12 ? "Good morning" : hr < 18 ? "Good afternoon" : "Good evening";
            const firstName = name.charAt(0).toUpperCase() + name.slice(1);
            greetEl.textContent = `${timeOfDay}, ${firstName} 👋`;
        } catch(e) {}
    }
    // Tier badge
    const tierEl = document.getElementById("home-tier-badge");
    if (tierEl) {
        const pro  = _proStatus === true || checkAccessCodePro();
        const loading = _proStatus === null;
        if (loading) {
            tierEl.innerHTML = "";
        } else if (pro) {
            const isAccessCode = !(_proStatus === true) && checkAccessCodePro();
            tierEl.innerHTML = isAccessCode
                ? `<span style="background:#7c3aed;color:#fff;font-size:11px;font-weight:800;padding:4px 12px;border-radius:99px;letter-spacing:0.05em;">✨ PRO (Access Code)</span>`
                : `<span style="background:#f59e0b;color:#000;font-size:11px;font-weight:800;padding:4px 12px;border-radius:99px;letter-spacing:0.05em;">⭐ PRO</span>`;
        } else {
            tierEl.innerHTML = `<span style="background:#1e293b;color:#94a3b8;font-size:11px;font-weight:700;padding:4px 12px;border-radius:99px;letter-spacing:0.05em;">Free Plan</span>`;
        }
    }

    // Job count
    const countEl = document.getElementById("home-job-count");
    if (countEl) {
        if (isLoadingJobs) {
            countEl.textContent = "Loading…";
        } else {
            const n = jobs.length;
            countEl.textContent = n === 0 ? "No jobs yet" : `${n} job${n !== 1 ? "s" : ""}`;
        }
    }
    // Sync offline badge
    const badge = document.getElementById("offline-badge-home");
    const mainBadge = document.getElementById("offline-badge");
    if (badge && mainBadge) badge.style.display = mainBadge.style.display;
}

function goDashboard() {
    show("screen-dashboard");
    renderDashboard();
    // If FreeAgent just connected via URL redirect, show confirmation
    if (window._faJustConnected) {
        window._faJustConnected = false;
        setTimeout(() => alert("✅ FreeAgent connected successfully!"), 500);
    }
    // Greeting — always read from session token to avoid stale user data
    const greetEl = document.getElementById("header-greeting");
    if (greetEl) {
        try {
            const stored = localStorage.getItem("sb-lzwmqabxpxuuznhbpewm-auth-token");
            const sessionUser = stored ? JSON.parse(stored).user : currentUser;
            const name = sessionUser?.user_metadata?.full_name || sessionUser?.email?.split("@")[0] || "there";
            const hr = new Date().getHours();
            const timeOfDay = hr < 12 ? "Good morning" : hr < 18 ? "Good afternoon" : "Good evening";
            const firstName = name.charAt(0).toUpperCase() + name.slice(1);
            greetEl.textContent = `${timeOfDay}, ${firstName} 👋`;
        } catch(e) {
            if (currentUser) {
                const name = currentUser.email?.split("@")[0] || "there";
                greetEl.textContent = `Hello, ${name} 👋`;
            }
        }
    }
}

function togglePwdVisibility() {
    const input = document.getElementById("si-password");
    const btn = document.getElementById("si-pwd-toggle");
    if (input.type === "password") {
        input.type = "text";
        btn.textContent = "🙈";
    } else {
        input.type = "password";
        btn.textContent = "👁";
    }
}

function renderQuoteTotals() {
    const bar = document.getElementById("quote-totals-bar");
    if (!bar) return;

    let acceptedTotal = 0, pendingTotal = 0;

    jobs.forEach(j => {
        let grand = 0;
        (j.rooms || []).forEach(room => {
            (room.surfaces || []).forEach(s => { grand += parseFloat(s.total || 0); });
        });
        if (j.quoteStatus === "accepted") acceptedTotal += grand;
        else if (j.quoteToken && (!j.quoteStatus || j.quoteStatus === "pending")) pendingTotal += grand;
    });

    if (acceptedTotal === 0 && pendingTotal === 0) { bar.style.display = "none"; return; }

    bar.style.display = "flex";
    bar.innerHTML = `
        ${acceptedTotal > 0 ? `
        <div onclick="document.getElementById('jobs-quote-filter').value='accepted';renderDashboard();"
             style="flex:1;background:#065f46;border-radius:10px;padding:10px 12px;cursor:pointer;">
            <div style="font-size:11px;color:#6ee7b7;font-weight:600;margin-bottom:2px;">✅ ACCEPTED</div>
            <div style="font-size:18px;font-weight:800;color:#fff;">£${acceptedTotal.toLocaleString("en-GB", {minimumFractionDigits:0, maximumFractionDigits:0})}</div>
        </div>` : ""}
        ${pendingTotal > 0 ? `
        <div onclick="document.getElementById('jobs-quote-filter').value='pending';renderDashboard();"
             style="flex:1;background:#1e3a5f;border-radius:10px;padding:10px 12px;cursor:pointer;">
            <div style="font-size:11px;color:#93c5fd;font-weight:600;margin-bottom:2px;">⏳ PENDING</div>
            <div style="font-size:18px;font-weight:800;color:#fff;">£${pendingTotal.toLocaleString("en-GB", {minimumFractionDigits:0, maximumFractionDigits:0})}</div>
        </div>` : ""}`;
}

function renderReminders() {
    const banner = document.getElementById("reminder-banner");
    if (!banner) return;

    const days = parseInt(settings.quoteReminderDays) || 0;
    if (!days) { banner.style.display = "none"; return; }

    const now      = Date.now();
    const cutoff   = days * 24 * 60 * 60 * 1000;
    const overdue  = jobs.filter(j => {
        if (!j.quoteToken || j.quoteStatus) return false; // no quote sent, or already responded
        const sentAt = j.quoteSentAt ? new Date(j.quoteSentAt).getTime() : null;
        if (!sentAt) return false;
        return (now - sentAt) >= cutoff;
    });

    if (!overdue.length) { banner.style.display = "none"; return; }

    banner.style.display = "block";
    banner.innerHTML = `
        <div style="background:#78350f;border-radius:10px;padding:12px 14px;">
            <div style="font-weight:700;color:#fde68a;font-size:14px;margin-bottom:8px;">
                ⏰ ${overdue.length} quote${overdue.length !== 1 ? "s" : ""} awaiting response
            </div>
            ${overdue.map(j => {
                const sentAt  = new Date(j.quoteSentAt);
                const daysAgo = Math.floor((now - sentAt.getTime()) / 86400000);
                return `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                    <div>
                        <span style="color:#fef3c7;font-size:13px;font-weight:600;">${esc(j.customerName)}</span>
                        <span style="color:#d97706;font-size:12px;margin-left:8px;">${daysAgo} day${daysAgo !== 1 ? "s" : ""} ago</span>
                    </div>
                    <button onclick="goJob('${j.id}')" style="background:#d97706;color:#000;border:none;border-radius:6px;padding:5px 10px;font-size:12px;font-weight:700;cursor:pointer;">
                        View →
                    </button>
                </div>`;
            }).join("")}
        </div>`;
}

function renderDashboard() {
    const list  = document.getElementById("jobs-list");
    const empty = document.getElementById("jobs-empty");
    const countEl = document.getElementById("job-count");
    if (!list || !empty) return;

    renderQuoteTotals();
    renderReminders();

    // Show loading spinner if fetching
    if (isLoadingJobs && jobs.length === 0) {
        list.innerHTML = `<div style="text-align:center;padding:40px 20px;color:#475569;">
            <div style="font-size:32px;margin-bottom:12px;animation:spin 1s linear infinite;display:inline-block;">⟳</div>
            <div style="font-size:14px;">Loading jobs…</div>
        </div>`;
        empty.style.display = "none";
        if (countEl) countEl.textContent = "";
        return;
    }
    const query = (document.getElementById("jobs-search")?.value || "").toLowerCase().trim();
    const quoteFilter = document.getElementById("jobs-quote-filter")?.value || "";
    const showingArchived = quoteFilter === "archived";

    let filtered = query ? jobs.filter(j =>
        (j.customerName || "").toLowerCase().includes(query) ||
        (j.address || "").toLowerCase().includes(query) ||
        (j.city || "").toLowerCase().includes(query) ||
        (j.postcode || "").toLowerCase().includes(query) ||
        (j.description || "").toLowerCase().includes(query) ||
        (j.phone || "").toLowerCase().includes(query) ||
        (j.email || "").toLowerCase().includes(query) ||
        (j.quoteStatus === "accepted" && ["accepted","accept"].some(w => query.includes(w))) ||
        (j.quoteStatus === "declined" && ["declined","decline"].some(w => query.includes(w))) ||
        (j.quoteToken && !j.quoteStatus && "pending".includes(query))
    ) : [...jobs];

    // Hide archived jobs unless explicitly viewing the archive
    filtered = filtered.filter(j => showingArchived ? j.jobArchived : !j.jobArchived);

    if (quoteFilter === "pending")  filtered = filtered.filter(j => j.quoteToken && (!j.quoteStatus || j.quoteStatus === "pending"));
    if (quoteFilter === "accepted") filtered = filtered.filter(j => j.quoteStatus === "accepted");
    if (quoteFilter === "declined") filtered = filtered.filter(j => j.quoteStatus === "declined");
    if (quoteFilter === "none")     filtered = filtered.filter(j => !j.quoteToken);

    const sort = document.getElementById("jobs-sort")?.value || "updated";
    const jobTotal = j => (j.rooms || []).reduce((a, r) => a + (r.surfaces || []).reduce((b, s) => b + parseFloat(s.total || 0), 0), 0);
    const quoteOrder = { accepted: 0, pending: 1, declined: 2, archived: 3 };
    if (sort === "updated")         filtered.sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0));
    else if (sort === "value-desc") filtered.sort((a, b) => jobTotal(b) - jobTotal(a));
    else if (sort === "value-asc")  filtered.sort((a, b) => jobTotal(a) - jobTotal(b));
    else if (sort === "accepted")   filtered.sort((a, b) => (quoteOrder[a.quoteStatus] ?? 3) - (quoteOrder[b.quoteStatus] ?? 3));
    else if (sort === "pending")    filtered.sort((a, b) => ((a.quoteToken && !a.quoteStatus) ? 0 : 1) - ((b.quoteToken && !b.quoteStatus) ? 0 : 1));
    else if (sort === "name")       filtered.sort((a, b) => (a.customerName || "").localeCompare(b.customerName || ""));
    if (quoteFilter !== "archived") filtered = filtered.filter(j => !j.quoteArchived);

    if (countEl) countEl.textContent = filtered.length;

    if (!filtered.length) {
        list.innerHTML = query ? `<div class="empty-state"><div class="empty-icon">🔍</div><p>No results for "${query}"</p></div>` : "";
        empty.classList.toggle("hidden", !!query || !jobs.length);
        if (!query && !jobs.length) empty.classList.remove("hidden");
        return;
    }
    empty.classList.add("hidden");

    list.innerHTML = filtered.map(j => {
        const total  = (j.rooms || []).reduce((a, r) => a + parseFloat(r.total || 0), 0);
        const count  = (j.rooms || []).length;
        const addr   = [j.address, j.city].filter(Boolean).join(", ");
        const hasQuote = !!j.quoteToken;

        const STAGE_ORDER = ["enquiry","surveyed","quoted","accepted","scheduled","in_progress","complete"];
        const stageIdx = STAGE_ORDER.indexOf(j.status || "enquiry");
        const steps = [
            { done: count > 0,                                  label: "Rooms" },
            { done: hasQuote,                                   label: "Quoted" },
            { done: j.quoteStatus === "accepted",              label: "Accepted" },
            { done: stageIdx >= STAGE_ORDER.indexOf("scheduled"),   label: "Scheduled" },
            { done: stageIdx >= STAGE_ORDER.indexOf("in_progress"),  label: "In Progress" },
            { done: stageIdx >= STAGE_ORDER.indexOf("complete"),     label: "Complete" }
        ];
        const progressHtml = `<div style="display:flex;align-items:center;gap:0;width:100%;margin-bottom:10px;">` +
            steps.map((s, i) => {
                const dot = `<div style="display:flex;flex-direction:column;align-items:center;gap:2px;flex-shrink:0;"><div style="width:18px;height:18px;border-radius:50%;background:${s.done ? "#10b981" : "#1e293b"};border:2px solid ${s.done ? "#10b981" : "#334155"};display:flex;align-items:center;justify-content:center;font-size:9px;color:#fff;">${s.done ? "✓" : ""}</div><div style="font-size:10px;font-weight:600;color:${s.done ? "#10b981" : "#475569"};white-space:nowrap;">${s.label}</div></div>`;
                const line = i < steps.length - 1 ? `<div style="flex:1;height:2px;background:${s.done ? "#10b981" : "#1e293b"};margin:0 2px;margin-bottom:14px;"></div>` : "";
                return dot + line;
            }).join("") + `</div>`;

        return `
        <div class="job-card" onclick="goJob(\'${j.id}\')" style="${j.jobArchived ? "opacity:0.6;" : ""}">
            ${j.jobArchived ? `<div style="font-size:11px;font-weight:700;color:#64748b;letter-spacing:0.05em;margin-bottom:8px;">📦 ARCHIVED</div>` : ""}
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;">
                <div style="flex:1;min-width:0;">
                    <div class="job-card-name">${j.customerName ? j.customerName.replace(/&/g,"&amp;").replace(/</g,"&lt;") : ""}</div>
                    ${addr ? `<div style="font-size:12px;color:var(--text-muted);margin-top:3px;">📍 ${addr.replace(/&/g,"&amp;").replace(/</g,"&lt;")}</div>` : ""}
                    ${j.phone ? `<div style="font-size:12px;color:var(--text-muted);margin-top:2px;">📞 ${j.phone.replace(/&/g,"&amp;").replace(/</g,"&lt;")}</div>` : ""}
                </div>
                <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;margin-left:8px;flex-shrink:0;">
                    ${statusBadge(j.status)}
                    ${quoteBadge(j)}
                </div>
            </div>
            ${progressHtml}
            <div style="display:flex;gap:8px;" onclick="event.stopPropagation()">
                <button onclick="currentJobId=\'${j.id}\';goEditJob()" class="btn-secondary btn-sm" style="flex:1;">✏ Edit</button>
                <button onclick="event.stopPropagation();currentJobId=\'${j.id}\';toggleArchiveJob()" class="btn-secondary btn-sm" style="flex:1;color:#94a3b8;border-color:#334155;">${j.jobArchived ? "↩ Unarchive" : "📦 Archive"}</button>
                <button onclick="currentJobId=\'${j.id}\';deleteJob()" class="btn-secondary btn-sm" style="flex:1;color:#f87171;border-color:#f87171;">🗑 Delete</button>
            </div>
        </div>`;
    }).join("");
}


/* ================================================================
   NEW JOB
================================================================ */
/* ── SAVED CUSTOMERS ─────────────────────────────────────────── */
function getSavedCustomers() {
    try {
        const key = LOCAL_CUSTOMERS_KEY(currentUser?.id);
        const data = localStorage.getItem(key);
        if (data) return JSON.parse(data);
        // Migrate from old global key
        const legacy = localStorage.getItem('tileiq_customers');
        if (legacy) {
            const parsed = JSON.parse(legacy);
            if (parsed.length) localStorage.setItem(key, legacy);
            return parsed;
        }
        return [];
    } catch(e) { return []; }
}

function saveCustomers(list) {
    localStorage.setItem(LOCAL_CUSTOMERS_KEY(currentUser?.id), JSON.stringify(list));
    // Sync to Supabase
    if (currentUser && navigator.onLine) {
        let accessToken = '';
        try { const s = localStorage.getItem(`sb-lzwmqabxpxuuznhbpewm-auth-token`); if (s) accessToken = JSON.parse(s).access_token || ''; } catch(e) {}
        fetch(`${SB_URL}/rest/v1/customers?user_id=eq.${currentUser.id}`, {
            method: 'GET',
            headers: { 'apikey': SB_KEY, 'Authorization': `Bearer ${accessToken || SB_KEY}` }
        }).then(r => r.json()).then(rows => {
            const method = rows?.length ? 'PATCH' : 'POST';
            const url = rows?.length
                ? `${SB_URL}/rest/v1/customers?user_id=eq.${currentUser.id}`
                : `${SB_URL}/rest/v1/customers`;
            return fetch(url, {
                method,
                headers: { 'apikey': SB_KEY, 'Authorization': `Bearer ${accessToken || SB_KEY}`,
                    'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
                body: JSON.stringify(rows?.length
                    ? { data: list, updated_at: new Date().toISOString() }
                    : { user_id: currentUser.id, data: list, updated_at: new Date().toISOString() })
            });
        }).catch(e => console.warn('Customer Supabase sync failed:', e.message));
    }
}

function saveCustomerFromForm(prefix) {
    const name  = document.getElementById(prefix + '-name')?.value.trim();
    const phone = document.getElementById(prefix + '-phone')?.value.trim();
    const email = document.getElementById(prefix + '-email')?.value.trim();
    const addr  = document.getElementById(prefix + '-address')?.value.trim();
    const city  = document.getElementById(prefix + '-city')?.value.trim();

    if (!name) { alert('Please enter a customer name first.'); return; }

    const customers = getSavedCustomers();
    const existing = customers.findIndex(c => c.name.toLowerCase() === name.toLowerCase());

    const customer = { id: existing >= 0 ? customers[existing].id : Date.now(), name, phone, email, addr, city };

    if (existing >= 0) {
        if (!confirm(`Update saved details for "${name}"?`)) return;
        customers[existing] = customer;
    } else {
        customers.unshift(customer);
    }

    saveCustomers(customers);
    alert(`✅ "${name}" saved!`);
}

function customerInlineSearch(query, prefix) {
    const sugEl = document.getElementById(prefix + '-customer-suggestions');
    if (!sugEl) return;

    if (!query || query.length < 1) {
        sugEl.style.display = 'none';
        sugEl.innerHTML = '';
        return;
    }

    const q = query.toLowerCase();
    const matches = getSavedCustomers().filter(c =>
        c.name?.toLowerCase().includes(q) ||
        c.phone?.toLowerCase().includes(q) ||
        c.addr?.toLowerCase().includes(q) ||
        c.city?.toLowerCase().includes(q)
    ).slice(0, 6);

    if (matches.length === 0) {
        sugEl.style.display = 'none';
        return;
    }

    sugEl.style.display = 'block';
    sugEl.innerHTML = matches.map(c => `
        <div onclick="loadCustomer('${c.id}','${prefix}')" 
             style="padding:10px 14px;cursor:pointer;border-bottom:1px solid #334155;display:flex;justify-content:space-between;align-items:center;"
             onmousedown="event.preventDefault()">
            <div>
                <div style="font-size:14px;font-weight:600;color:#e2e8f0;">${esc(c.name)}</div>
                <div style="font-size:12px;color:#64748b;">${[c.addr, c.city, c.phone].filter(Boolean).join(' · ')}</div>
            </div>
            <span style="color:#f59e0b;font-size:12px;">↵</span>
        </div>`).join('');
}

function renderCustomerList(customers, prefix) {
    if (customers.length === 0)
        return '<div style="color:#64748b;text-align:center;padding:20px;font-size:14px;">No saved customers yet.<br>Fill in customer details and tap 💾 Save Customer.</div>';
    return customers.map(c => `
        <div style="background:#0f172a;border:1px solid #334155;border-radius:12px;padding:12px 14px;margin-bottom:8px;cursor:pointer;" onclick="loadCustomer('${c.id}','${prefix}')">
            <div style="display:flex;justify-content:space-between;align-items:center;">
                <div>
                    <div style="font-size:15px;font-weight:700;color:#e2e8f0;">${esc(c.name)}</div>
                    ${c.addr ? `<div style="font-size:12px;color:#64748b;margin-top:2px;">${esc(c.addr)}${c.city ? ', ' + esc(c.city) : ''}</div>` : ''}
                    ${c.phone ? `<div style="font-size:12px;color:#64748b;">${esc(c.phone)}</div>` : ''}
                </div>
                <button onclick="event.stopPropagation();deleteCustomer('${c.id}')" style="background:none;border:none;color:#ef4444;font-size:16px;cursor:pointer;padding:4px;">🗑</button>
            </div>
        </div>`).join('');
}

function filterCustomers(query, prefix) {
    const all = getSavedCustomers();
    const q = query.toLowerCase();
    const filtered = q ? all.filter(c =>
        c.name?.toLowerCase().includes(q) ||
        c.phone?.toLowerCase().includes(q) ||
        c.addr?.toLowerCase().includes(q) ||
        c.city?.toLowerCase().includes(q)
    ) : all;
    const list = document.getElementById('customer-list');
    if (list) list.innerHTML = renderCustomerList(filtered, prefix);
}

function showSavedCustomers(prefix) {
    const customers = getSavedCustomers();
    const existing = document.getElementById('saved-customers-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'saved-customers-modal';
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px;box-sizing:border-box;background:rgba(0,0,0,0.7);';

    const box = document.createElement('div');
    box.style.cssText = 'background:#1e293b;border-radius:20px;padding:20px;width:100%;max-width:360px;max-height:70vh;display:flex;flex-direction:column;';

    box.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
            <div style="font-size:16px;font-weight:800;color:#e2e8f0;">👤 Saved Customers</div>
            <button onclick="document.getElementById('saved-customers-modal').remove()" style="background:none;border:none;color:#64748b;font-size:20px;cursor:pointer;">✕</button>
        </div>
        <input id="customer-search" type="text" placeholder="🔍 Search customers..." 
            oninput="filterCustomers(this.value,'${prefix}')"
            style="width:100%;background:#0f172a;border:1px solid #334155;border-radius:10px;color:#e2e8f0;padding:10px 14px;font-size:14px;margin-bottom:12px;box-sizing:border-box;outline:none;">
        <div id="customer-list" style="overflow-y:auto;flex:1;">
            ${renderCustomerList(customers, prefix)}
        </div>`;

    modal.appendChild(box);
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
    document.documentElement.appendChild(modal);
}

function loadCustomer(id, prefix) {
    const customers = getSavedCustomers();
    const c = customers.find(x => String(x.id) === String(id));
    if (!c) return;

    const set = (field, val) => { const el = document.getElementById(prefix + '-' + field); if (el && val) el.value = val; };
    set('name', c.name);
    set('phone', c.phone);
    set('email', c.email);
    set('address', c.addr);
    set('city', c.city);

    // Hide inline suggestions
    const sug = document.getElementById(prefix + '-customer-suggestions');
    if (sug) { sug.style.display = 'none'; sug.innerHTML = ''; }

    document.getElementById('saved-customers-modal')?.remove();
}


/* ── Paste & Extract customer details ──────────────────────────── */
function showPasteExtract() {
    const existing = document.getElementById('paste-extract-modal');
    if (existing) existing.remove();
    const modal = document.createElement('div');
    modal.id = 'paste-extract-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:9999;display:flex;align-items:flex-end;justify-content:center;';
    modal.innerHTML = `
      <div style="background:#ffffff;border-radius:20px 20px 0 0;padding:24px;width:100%;max-width:600px;max-height:80vh;overflow-y:auto;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
          <div style="font-size:16px;font-weight:700;color:#1e293b;">📋 Paste from Message</div>
          <button onclick="document.getElementById('paste-extract-modal').remove()" style="background:none;border:none;color:var(--muted,#64748b);font-size:22px;cursor:pointer;line-height:1;">×</button>
        </div>
        <p style="font-size:13px;color:#64748b;margin-bottom:12px;">Paste a WhatsApp message, email, or any text — AI will extract the customer details.</p>
        <textarea id="paste-extract-text" placeholder="e.g. Hi, I'm John Smith, 07712 345678, 14 Oak Road, Swindon SN1 2AB..." rows="6" style="width:100%;background:#f1f5f9;border:1px solid #cbd5e1;border-radius:10px;color:#1e293b;padding:12px;font-size:14px;font-family:inherit;resize:none;box-sizing:border-box;"></textarea>
        <div id="paste-extract-error" style="color:#f87171;font-size:13px;margin-top:8px;display:none;"></div>
        <button id="paste-extract-btn" onclick="extractCustomerFromText()" style="width:100%;margin-top:12px;padding:14px;background:var(--amber,#E07A2F);color:#fff;border:none;border-radius:10px;font-size:15px;font-weight:700;cursor:pointer;">✨ Extract Details</button>
      </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    setTimeout(() => document.getElementById('paste-extract-text')?.focus(), 100);
}

async function extractCustomerFromText() {
    const text = document.getElementById('paste-extract-text')?.value.trim();
    if (!text) return;
    const btn = document.getElementById('paste-extract-btn');
    const errEl = document.getElementById('paste-extract-error');
    btn.disabled = true;
    btn.textContent = '⏳ Extracting...';
    errEl.style.display = 'none';
    try {
        const resp = await fetch('https://damp-bread-e0f9.kevin-woodley.workers.dev', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'extract_customer', text })
        });
        const data = await resp.json();
        if (!resp.ok || !data.customer) throw new Error(data.error || 'Extraction failed');
        const c = data.customer;
        if (c.name)     document.getElementById('nj-name').value     = c.name;
        if (c.phone)    document.getElementById('nj-phone').value    = c.phone;
        if (c.email)    document.getElementById('nj-email').value    = c.email;
        if (c.address)  document.getElementById('nj-address').value  = c.address;
        if (c.city)     document.getElementById('nj-city').value     = c.city;
        if (c.postcode) document.getElementById('nj-postcode').value = c.postcode;
        if (c.notes)    document.getElementById('nj-desc').value     = c.notes;
        document.getElementById('paste-extract-modal')?.remove();
    } catch(e) {
        errEl.textContent = e.message || 'Something went wrong. Please try again.';
        errEl.style.display = 'block';
        btn.disabled = false;
        btn.textContent = '✨ Extract Details';
    }
}

function goNewJob() {
    if (!checkJobLimit()) return;
    ["nj-name","nj-phone","nj-email","nj-address","nj-city","nj-postcode","nj-desc"]
        .forEach(id => document.getElementById(id).value = "");
    document.getElementById("nj-status").value = "enquiry";
    document.getElementById("nj-supply").value = "contractor";
    show("screen-new-job");
    // Inject "Paste from message" button if not already present
    const njName = document.getElementById("nj-name");
    if (njName && !document.getElementById("paste-from-msg-btn")) {
        const pasteBtn = document.createElement("button");
        pasteBtn.id = "paste-from-msg-btn";
        pasteBtn.type = "button";
        pasteBtn.textContent = "📋 Paste from message";
        pasteBtn.style.cssText = "width:100%;padding:11px;margin-bottom:14px;background:transparent;border:1px dashed var(--amber,#E07A2F);color:var(--amber,#E07A2F);border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;";
        pasteBtn.onclick = showPasteExtract;
        njName.closest(".form-card, .field-group")?.parentElement?.insertBefore(pasteBtn, njName.closest(".form-card, .field-group")) ||
        njName.parentElement?.insertBefore(pasteBtn, njName);
    }
    setTimeout(() => document.getElementById("nj-name").focus(), 100);
}

function createJob() {
    const name = document.getElementById("nj-name").value.trim();
    if (!name) { alert("Please enter the customer name."); return; }

    const job = {
        id:           uid(),
        customerName: name,
        phone:        document.getElementById("nj-phone").value.trim(),
        email:        document.getElementById("nj-email").value.trim(),
        address:      document.getElementById("nj-address").value.trim(),
        city:         document.getElementById("nj-city").value.trim(),
        postcode:     document.getElementById("nj-postcode").value.trim(),
        description:  document.getElementById("nj-desc").value.trim(),
        status:       document.getElementById("nj-status").value,
        tileSupply:   document.getElementById("nj-supply").value,
        rooms:        [],
        createdAt:    new Date().toISOString(),
        updatedAt:    new Date().toISOString()
    };

    jobs.unshift(job);
    saveAll();
    currentJobId = job.id;
    renderJobView();
    goAddRoom();
}

/* ================================================================
   JOB VIEW
================================================================ */
function showScheduleSheet() {
    const existing = document.getElementById("schedule-sheet");
    if (existing) existing.remove();
    const j = getJob();
    if (!j) return;

    const today     = new Date().toISOString().split("T")[0];
    const startVal  = j.jobStartDate ? j.jobStartDate.split("T")[0] : today;
    const endVal    = j.jobEndDate   ? j.jobEndDate.split("T")[0]   : startVal;

    const sheet = document.createElement("div");
    sheet.id    = "schedule-sheet";
    sheet.style.cssText = "position:fixed;inset:0;z-index:9999;display:flex;flex-direction:column;justify-content:flex-end;";
    sheet.innerHTML = `
        <div onclick="document.getElementById('schedule-sheet').remove()" style="flex:1;background:rgba(0,0,0,0.5);"></div>
        <div style="background:#1e293b;border-radius:20px 20px 0 0;padding:20px;padding-bottom:calc(20px + env(safe-area-inset-bottom));">
            <div style="width:40px;height:4px;background:#334155;border-radius:2px;margin:0 auto 20px;"></div>
            <div style="font-size:16px;font-weight:700;color:#e2e8f0;margin-bottom:16px;">📅 Schedule Job — ${esc(j.customerName)}</div>

            <div style="display:flex;gap:10px;margin-bottom:14px;">
                <div style="flex:1;">
                    <label style="font-size:12px;color:#64748b;display:block;margin-bottom:4px;">Start Date</label>
                    <input type="date" id="sched-start" value="${startVal}"
                        style="width:100%;background:#0f172a;border:1px solid #334155;border-radius:8px;color:#e2e8f0;padding:10px;font-size:15px;">
                </div>
                <div style="flex:1;">
                    <label style="font-size:12px;color:#64748b;display:block;margin-bottom:4px;">End Date</label>
                    <input type="date" id="sched-end" value="${endVal}"
                        style="width:100%;background:#0f172a;border:1px solid #334155;border-radius:8px;color:#e2e8f0;padding:10px;font-size:15px;">
                </div>
            </div>

            <div style="font-size:12px;color:#64748b;margin-bottom:14px;" id="sched-note"></div>

            <button onclick="saveAndSendSchedule()" id="sched-send-btn" style="width:100%;background:#0ea5e9;color:#fff;border:none;border-radius:12px;padding:14px;font-size:15px;font-weight:700;margin-bottom:10px;cursor:pointer;">
                ${j.email ? "💾 Save & Send to Customer" : "💾 Save Dates"}
            </button>
            <button onclick="addToCalendar()" style="width:100%;background:#334155;color:#e2e8f0;border:none;border-radius:12px;padding:14px;font-size:15px;font-weight:700;margin-bottom:16px;cursor:pointer;">
                📱 Add to My Calendar
            </button>
            ${!j.email ? `<div style="font-size:12px;color:#64748b;text-align:center;margin-bottom:10px;">Add customer email to also send them an invite</div>` : ""}
            <button onclick="document.getElementById('schedule-sheet').remove()" style="width:100%;background:transparent;color:#64748b;border:none;padding:10px;font-size:15px;cursor:pointer;">Cancel</button>
        </div>`;

    // Live note showing number of working days
    sheet.querySelector("#sched-start").addEventListener("change", updateSchedNote);
    sheet.querySelector("#sched-end").addEventListener("change", updateSchedNote);
    document.body.appendChild(sheet);
    updateSchedNote();
}

function updateSchedNote() {
    const start = document.getElementById("sched-start")?.value;
    const end   = document.getElementById("sched-end")?.value;
    const note  = document.getElementById("sched-note");
    if (!start || !end || !note) return;
    const s = new Date(start), e = new Date(end);
    if (e < s) { note.textContent = "⚠️ End date is before start date"; return; }
    const days = Math.round((e - s) / 86400000) + 1;
    note.textContent = `${days} day${days !== 1 ? "s" : ""}`;
}

function saveSchedule() {
    const j     = getJob();
    const start = document.getElementById("sched-start")?.value;
    const end   = document.getElementById("sched-end")?.value;
    if (!j || !start) return;
    if (new Date(end) < new Date(start)) { alert("End date can't be before start date."); return; }
    j.jobStartDate = start;
    j.jobEndDate   = end || start;
    saveAll();
    renderJobQuoteStatusBar();
    autoAddToDeviceCalendar(j);
}

async function saveAndSendSchedule() {
    const j     = getJob();
    const start = document.getElementById("sched-start")?.value;
    const end   = document.getElementById("sched-end")?.value;
    if (!j || !start) return;
    if (new Date(end) < new Date(start)) { alert("End date can't be before start date."); return; }

    // Save first
    j.jobStartDate = start;
    j.jobEndDate   = end || start;
    saveAll();
    renderJobQuoteStatusBar();
    autoAddToDeviceCalendar(j);

    // If no email just close
    if (!j.email) {
        document.getElementById("schedule-sheet")?.remove();
        return;
    }

    // Send invite
    const btn = document.getElementById("sched-send-btn");
    if (btn) { btn.disabled = true; btn.textContent = "Sending…"; }

    const ics = buildICS(j);
    try {
        const resp = await fetch(AI_PROXY_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                action:       "send_calendar_invite",
                to:           j.email,
                customerName: j.customerName,
                companyName:  settings.companyName || "",
                companyPhone: settings.companyPhone || "",
                startDate:    j.jobStartDate,
                endDate:      j.jobEndDate || j.jobStartDate,
                location:     [j.address, j.city, j.postcode].filter(Boolean).join(", "),
                icsBase64:    safeBase64(ics),
                quoteToken:   j.quoteToken || null
            })
        });
        if (resp.ok) {
            document.getElementById("schedule-sheet")?.remove();
            alert("✅ Dates saved and invite sent to " + j.email);
        } else {
            const err = await resp.json().catch(() => ({}));
            if (btn) { btn.disabled = false; btn.textContent = "💾 Save & Send to Customer"; }
            alert("Dates saved, but email failed: " + (err.error || "unknown error"));
        }
    } catch(e) {
        if (btn) { btn.disabled = false; btn.textContent = "💾 Save & Send to Customer"; }
        alert("Dates saved, but network error: " + e.message);
    }
}

function safeBase64(str) {
    return btoa(unescape(encodeURIComponent(str)));
}

function buildICS(j) {
    const start    = (j.jobStartDate || "").replace(/-/g, "");
    const end      = j.jobEndDate ? j.jobEndDate.replace(/-/g, "") : start;
    // Add 1 day to end for all-day events (iCal convention)
    const endDate  = new Date(j.jobEndDate || j.jobStartDate);
    endDate.setDate(endDate.getDate() + 1);
    const endStr   = endDate.toISOString().split("T")[0].replace(/-/g, "");
    const icsUid   = `${j.quoteToken || j.id}@tileiq.app`;
    const summary  = `Tiling Job — ${j.customerName}`;
    const location = [j.address, j.city, j.postcode].filter(Boolean).join(", ");
    const desc     = j.description ? j.description.replace(/\n/g, "\\n") : "";

    return [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//TileIQ Pro//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:REQUEST",
        "BEGIN:VEVENT",
        `UID:${icsUid}`,
        `DTSTART;VALUE=DATE:${start}`,
        `DTEND;VALUE=DATE:${endStr}`,
        `SUMMARY:${summary}`,
        location ? `LOCATION:${location}` : "",
        desc ? `DESCRIPTION:${desc}` : "",
        `STATUS:CONFIRMED`,
        "END:VEVENT",
        "END:VCALENDAR"
    ].filter(Boolean).join("\r\n");
}

async function addToCalendar() {
    const j = getJob();
    if (!j?.jobStartDate) { alert("Save dates first."); return; }

    const endDate = new Date(j.jobEndDate || j.jobStartDate);
    endDate.setDate(endDate.getDate() + 1);
    const start  = j.jobStartDate.replace(/-/g, "");
    const endStr = endDate.toISOString().split("T")[0].replace(/-/g, "");

    const url = "https://calendar.google.com/calendar/render?action=TEMPLATE"
        + "&text="     + encodeURIComponent("Tiling Job \u2014 " + j.customerName)
        + "&dates="    + start + "/" + endStr
        + "&location=" + encodeURIComponent([j.address, j.city, j.postcode].filter(Boolean).join(", "))
        + "&details="  + encodeURIComponent(j.description || "");

    try { window.open(url, "_system"); } catch(e) { window.location.href = url; }
}

async function emailCalendarInvite() {
    const j = getJob();
    if (!j?.jobStartDate) { alert("Save dates first."); return; }
    if (!j.email)         { alert("No customer email saved on this job."); return; }

    const btn = document.querySelector("[onclick='emailCalendarInvite()']");
    if (btn) { btn.disabled = true; btn.textContent = "Sending…"; }

    const ics = buildICS(j);
    // Safe base64 encode that handles unicode
    const icsBase64 = safeBase64(ics);

    try {
        const resp = await fetch(AI_PROXY_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                action:       "send_calendar_invite",
                to:           j.email,
                customerName: j.customerName,
                companyName:  settings.companyName || "",
                companyPhone: settings.companyPhone || "",
                startDate:    j.jobStartDate,
                endDate:      j.jobEndDate || j.jobStartDate,
                location:     [j.address, j.city, j.postcode].filter(Boolean).join(", "),
                icsBase64:    safeBase64(ics)
            })
        });
        if (resp.ok) {
            if (btn) { btn.textContent = "✅ Invite Sent!"; setTimeout(() => { btn.disabled = false; btn.textContent = "✉️ Email Invite to Customer"; }, 3000); }
        } else {
            const err = await resp.json().catch(() => ({}));
            alert("Failed to send invite: " + (err.error || "unknown error"));
            if (btn) { btn.disabled = false; btn.textContent = "✉️ Email Invite to Customer"; }
        }
    } catch(e) {
        alert("Network error: " + e.message);
        if (btn) { btn.disabled = false; btn.textContent = "✉️ Email Invite to Customer"; }
    }
}


async function loadMessagesBadge(quoteToken) {
    try {
        const [msgResp, dateResp] = await Promise.all([
            fetch(AI_PROXY_URL, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({action:"get_customer_messages",token:quoteToken}) }),
            fetch(AI_PROXY_URL, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({action:"get_date_suggestions",token:quoteToken}) })
        ]);
        const msgData = await msgResp.json().catch(()=>({}));
        const dateData = await dateResp.json().catch(()=>({}));
        const total = (msgData.messages?.length||0) + (dateData.suggestions?.length||0);
        const badge = document.getElementById("job-messages-badge");
        if (badge) { if (total>0){badge.textContent=total;badge.style.display="flex";}else{badge.style.display="none";} }
    } catch(e) {}
}

async function goMessages() {
    show("screen-messages");
    const loading = document.getElementById("messages-loading");
    const list    = document.getElementById("messages-list");
    const empty   = document.getElementById("messages-empty");
    if (loading) loading.style.display = "block";
    if (list)    list.style.display    = "none";
    if (empty)   empty.style.display   = "none";
    const j = getJob();
    if (!j || !j.quoteToken) {
        if (loading) loading.style.display = "none";
        if (empty)   empty.style.display   = "block";
        return;
    }
    try {
        const [msgResp, dateResp, replyResp] = await Promise.all([
            fetch(AI_PROXY_URL, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({action:"get_customer_messages",token:j.quoteToken}) }),
            fetch(AI_PROXY_URL, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({action:"get_date_suggestions",token:j.quoteToken}) }),
            fetch(AI_PROXY_URL, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({action:"get_tiler_replies",token:j.quoteToken}) })
        ]);
        const msgData    = await msgResp.json().catch(()=>({}));
        const dateData   = await dateResp.json().catch(()=>({}));
        const replyData  = await replyResp.json().catch(()=>({}));
        const messages   = msgData.messages    || [];
        const suggestions= dateData.suggestions || [];
        const tilerReplies = replyData.replies  || [];
        if (loading) loading.style.display = "none";
        if (!messages.length && !suggestions.length) {
            if (empty) empty.style.display = "block";
            return;
        }
        const combined = [
            ...messages.map(m=>({...m,_type:"question"})),
            ...suggestions.map(s=>({...s,_type:"date_suggestion"}))
        ].sort((a,b)=>new Date(a.created_at)-new Date(b.created_at));
        list.innerHTML = combined.map(item => {
            const date = new Date(item.created_at).toLocaleDateString("en-GB",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"});
            if (item._type === "question") {
                const replies = tilerReplies.filter(r=>r.message_id===item.id);
                const replyHtml = replies.map(r=>`
                    <div style="background:#1e293b;border-left:3px solid #f59e0b;padding:10px 12px;margin-top:8px;border-radius:0 8px 8px 0;">
                        <div style="font-size:11px;color:#64748b;">Your reply</div>
                        <div style="font-size:14px;color:#e2e8f0;">${esc(r.reply)}</div>
                    </div>`).join("");
                return `
                    <div class="form-card" style="margin-bottom:12px;">
                        <div style="font-size:11px;color:#64748b;margin-bottom:6px;">\u{1F4AC} Customer question \u00B7 ${date}</div>
                        <div style="font-size:15px;color:#e2e8f0;line-height:1.6;margin-bottom:10px;">"${esc(item.message)}"</div>
                        ${replyHtml}
                        <div style="margin-top:10px;">
                            <textarea id="reply-input-${item.id}" rows="2" placeholder="Type your reply\u2026"
                                style="width:100%;box-sizing:border-box;background:#0f172a;border:1px solid var(--border);border-radius:8px;color:#e2e8f0;padding:10px;font-size:14px;resize:none;margin-bottom:8px;"></textarea>
                            <button onclick="sendTilerReply('${item.id}','${j.quoteToken}')" class="btn-primary" style="width:100%;padding:11px;">Send Reply</button>
                        </div>
                    </div>`;
            } else {
                const start = new Date(item.start_date+"T12:00:00").toLocaleDateString("en-GB",{weekday:"short",day:"numeric",month:"long"});
                const end   = item.end_date && item.end_date!==item.start_date
                    ? " \u2013 "+new Date(item.end_date+"T12:00:00").toLocaleDateString("en-GB",{weekday:"short",day:"numeric",month:"long"})
                    : "";
                const sb = item.status==="accepted"
                    ? '<span style="background:#065f46;color:#6ee7b7;border-radius:6px;padding:2px 8px;font-size:11px;font-weight:700;">\u2713 Accepted</span>'
                    : item.status==="declined"
                    ? '<span style="background:#7f1d1d;color:#fca5a5;border-radius:6px;padding:2px 8px;font-size:11px;font-weight:700;">\u2717 Declined</span>'
                    : "";
                const ab = item.status==="pending" ? `
                    <div style="display:flex;gap:8px;margin-top:10px;">
                        <button onclick="respondDateSuggestion('${item.id}','accepted','${j.quoteToken}')" style="flex:1;background:#10b981;color:#fff;border:none;border-radius:8px;padding:10px;font-size:13px;font-weight:700;cursor:pointer;">\u2713 Accept</button>
                        <button onclick="respondDateSuggestion('${item.id}','declined','${j.quoteToken}')" style="flex:1;background:#374151;color:#9ca3af;border:none;border-radius:8px;padding:10px;font-size:13px;font-weight:700;cursor:pointer;">\u2717 Decline</button>
                    </div>` : "";
                return `
                    <div class="form-card" style="margin-bottom:12px;">
                        <div style="font-size:11px;color:#64748b;margin-bottom:6px;">\u{1F4C5} Date suggestion \u00B7 ${date} ${sb}</div>
                        <div style="font-size:15px;font-weight:700;color:#e2e8f0;">${start}${end}</div>
                        ${item.notes ? `<div style="font-size:13px;color:#94a3b8;margin-top:4px;">${esc(item.notes)}</div>` : ""}
                        ${ab}
                    </div>`;
            }
        }).join("");
        list.style.display = "block";
    } catch(e) {
        if (loading) loading.style.display = "none";
        if (list) { list.innerHTML = '<div style="padding:20px;color:#ef4444;text-align:center;">Failed to load messages.</div>'; list.style.display = "block"; }
    }
}

async function sendTilerReply(messageId, quoteToken) {
    const input = document.getElementById("reply-input-"+messageId);
    const reply = input?.value.trim();
    if (!reply) return;
    const btn = input.nextElementSibling;
    if (btn) { btn.disabled = true; btn.textContent = "Sending\u2026"; }
    try {
        const resp = await fetch(AI_PROXY_URL, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({action:"send_tiler_reply",message_id:messageId,token:quoteToken,reply}) });
        if (!resp.ok) throw new Error();
        await goMessages();
    } catch(e) { if (btn) { btn.disabled = false; btn.textContent = "Send Reply"; } }
}

async function respondDateSuggestion(sid, status, quoteToken) {
    try {
        await fetch(AI_PROXY_URL, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({action:"respond_date_suggestion",suggestion_id:sid,status,token:quoteToken}) });
        await goMessages();
    } catch(e) {}
}

function renderJobQuoteStatusBar() {
    const bar = document.getElementById("job-quote-status-bar");
    if (!bar) return;
    const j = getJob();
    if (!j || !j.quoteToken) { bar.style.display = "none"; return; }

    const status = j.quoteStatus;
    bar.style.display = "block";

    if (status === "accepted") {
        const scheduled = j.jobStartDate ? `📅 Scheduled: ${new Date(j.jobStartDate).toLocaleDateString("en-GB")}${j.jobEndDate ? " – " + new Date(j.jobEndDate).toLocaleDateString("en-GB") : ""}` : "";
        bar.innerHTML = `
            <div style="background:#065f46;color:#6ee7b7;border-radius:10px;padding:12px 14px;margin-bottom:6px;font-weight:700;">
                ✅ Quote Accepted${j.quoteRespondedAt ? " · " + new Date(j.quoteRespondedAt).toLocaleDateString("en-GB") : ""}
                ${j.quoteMessage ? `<div style="font-size:12px;font-weight:400;margin-top:4px;color:#a7f3d0;">"${j.quoteMessage}"</div>` : ""}
                ${scheduled ? `<div style="font-size:12px;font-weight:600;margin-top:4px;color:#6ee7b7;">${scheduled}</div>` : ""}
            </div>
            <div style="display:flex;gap:8px;margin-bottom:6px;">
                <button onclick="showScheduleSheet()" style="flex:1;background:#0ea5e9;color:#fff;border:none;border-radius:10px;padding:12px;font-size:14px;font-weight:700;cursor:pointer;">
                    📅 ${j.jobStartDate ? "Edit Schedule" : "Schedule Job"}
                </button>
                <button onclick="goQuote();setTimeout(exportFreeAgent,300);" style="flex:1;background:#f59e0b;color:#000;border:none;border-radius:10px;padding:12px;font-size:14px;font-weight:700;cursor:pointer;">
                    📤 FreeAgent
                </button>
            </div>`;
    } else if (status === "declined") {
        bar.innerHTML = `
            <div style="background:#7f1d1d;color:#fca5a5;border-radius:10px;padding:12px 14px;font-weight:700;">
                ❌ Quote Declined${j.quoteRespondedAt ? " · " + new Date(j.quoteRespondedAt).toLocaleDateString("en-GB") : ""}
                ${j.quoteMessage ? `<div style="font-size:12px;font-weight:400;margin-top:4px;color:#fecaca;">"${j.quoteMessage}"</div>` : ""}
            </div>
            <button onclick="archiveQuote()" style="width:100%;margin-top:8px;background:#1e293b;color:#64748b;border:1px solid #334155;border-radius:10px;padding:10px;font-size:13px;font-weight:700;cursor:pointer;">📦 Archive Quote</button>`;
    } else if (j.quoteArchived) {
        bar.innerHTML = `
            <div style="background:#1e293b;color:#64748b;border-radius:10px;padding:12px 14px;font-weight:700;">📦 Quote Archived</div>
            <button onclick="archiveQuote()" style="width:100%;margin-top:8px;background:#1e293b;color:#94a3b8;border:1px solid #334155;border-radius:10px;padding:10px;font-size:13px;font-weight:700;cursor:pointer;">↩ Unarchive</button>`;
    } else {
        bar.innerHTML = `
            <div style="background:#1e293b;color:#94a3b8;border-radius:10px;padding:12px 14px;font-weight:700;font-size:13px;">
                ⏳ Quote sent — awaiting response
            </div>`;
    }
}

function goJob(id) {
    if (id) currentJobId = id;
    renderJobView();
    renderJobQuoteStatusBar();
    show("screen-job");
    const j = getJob();
    const wrap = document.getElementById("job-messages-btn-wrap");
    if (wrap) wrap.style.display = (j && j.quoteToken) ? "block" : "none";
    if (j && j.quoteToken) loadMessagesBadge(j.quoteToken);
}

function renderJobView() {
    const job = getJob();
    if (!job) { goDashboard(); return; }

    document.getElementById("job-header-title").textContent = job.customerName;

    const PIPELINE = [
        { key: "enquiry",     label: "Enquiry" },
        { key: "surveyed",    label: "Surveyed" },
        { key: "quoted",      label: "Quoted" },
        { key: "accepted",    label: "Accepted" },
        { key: "scheduled",   label: "Scheduled" },
        { key: "in_progress", label: "In Progress" },
        { key: "complete",    label: "Complete" }
    ];
    const currentIdx = PIPELINE.findIndex(p => p.key === job.status);
    const nextStage  = PIPELINE[currentIdx + 1];

    // Pipeline stepper
    const stepperHtml = `<div style="display:flex;align-items:center;overflow-x:auto;padding:10px 16px 6px;gap:0;background:#0f172a;border-bottom:1px solid #1e293b;">
        ${PIPELINE.map((p, i) => {
            const done    = i < currentIdx;
            const current = i === currentIdx;
            const dot = `<div data-setstatus="${p.key}" style="display:flex;flex-direction:column;align-items:center;gap:3px;cursor:pointer;flex-shrink:0;touch-action:manipulation;-webkit-tap-highlight-color:transparent;padding:4px 2px;">
                <div style="width:28px;height:28px;border-radius:50%;background:${done ? "#10b981" : current ? "#f59e0b" : "#1e293b"};border:2px solid ${done ? "#10b981" : current ? "#f59e0b" : "#334155"};display:flex;align-items:center;justify-content:center;font-size:9px;color:#fff;">${done ? "✓" : current ? "●" : ""}</div>
                <div style="font-size:9px;font-weight:${current ? "700" : "400"};color:${done ? "#10b981" : current ? "#f59e0b" : "#475569"};white-space:nowrap;">${p.label}</div>
            </div>`;
            const line = i < PIPELINE.length - 1 ? `<div style="flex:1;min-width:8px;height:2px;background:${done ? "#10b981" : "#1e293b"};margin-bottom:14px;"></div>` : "";
            return dot + line;
        }).join("")}
    </div>`;

    // Customer bar
    const parts = [job.address, job.city, job.postcode].filter(Boolean).join(", ");
    const _custBar = document.getElementById("job-customer-bar");
    _custBar.innerHTML = stepperHtml + `
        <div style="padding:10px 16px 4px;">
            <div class="cbar-name">${esc(job.customerName)}${nextStage ? ` <button data-advance="1" style="background:#f59e0b;color:#000;border:none;border-radius:6px;padding:3px 8px;font-size:11px;font-weight:700;cursor:pointer;margin-left:8px;touch-action:manipulation;">→ ${nextStage.label}</button>` : " ✅"}</div>
            ${parts ? `<div class="cbar-address">${esc(parts)}</div>` : ""}
            ${job.phone ? `<span class="cbar-contact">📞 ${esc(job.phone)}</span>` : ""}
            ${job.email ? `<span class="cbar-contact">✉ ${esc(job.email)}</span>` : ""}
            ${job.tileSupply === "customer" ? `<span class="cbar-badge">👤 Customer tiles</span>` : ""}
            ${parts ? `<button onclick="getDirections('${job.id}')" style="background:#E07A2F;color:#fff;border:none;border-radius:8px;padding:6px 14px;font-size:13px;font-weight:600;cursor:pointer;margin-top:6px;display:inline-block;">🗺️ Directions</button>` : ""}
        </div>
    `;
    // Attach touch/click listeners via delegation — more reliable in Android WebView
    _custBar.addEventListener("click", function _stepperClick(e) {
        const dot = e.target.closest("[data-setstatus]");
        if (dot) { setJobStatus(dot.dataset.setstatus); return; }
        const adv = e.target.closest("[data-advance]");
        if (adv) advanceStatus();
    }, { once: false });

    // Rooms
    const roomsEl  = document.getElementById("job-rooms-list");
    const emptyEl  = document.getElementById("job-rooms-empty");
    const totalEl  = document.getElementById("job-running-total");
    const rooms    = job.rooms || [];

    if (!rooms.length) {
        roomsEl.innerHTML = "";
        emptyEl.style.display = "";
        totalEl.classList.add("hidden");
        return;
    }

    emptyEl.style.display = "none";

    // Sealant totals (used for display; avoids double-counting walls)
    let grandSiliconeTubes = 0, grandSiliconeMetres = 0, grandSiliconeFloor = 0;

    roomsEl.innerHTML = rooms.map((r, i) => {
        const surfaces = r.surfaces || [];

        // Recalc so materialSell/labour/prepCost are always fresh
        const rCt = r.tileSupply === "customer";
        const rArea = surfaces.reduce((a, s) => a + (s.area || 0), 0);
        let rLabOpts = null;
        if (r.labourType === "day") rLabOpts = { type:"day", days: r.days||1, dayRate: r.dayRate||settings.dayRate||200, totalArea:rArea };
        surfaces.forEach(s => { s.tileType = s.tileType || r.tileType || "ceramic"; calcSurface(s, rCt, rLabOpts); });

        const wallM2  = surfaces.filter(s => s.type === "wall").reduce((a, s) => a + (s.area || 0), 0);
        const floorM2 = surfaces.filter(s => s.type === "floor").reduce((a, s) => a + (s.area || 0), 0);
        const areaParts = [];
        if (wallM2  > 0) areaParts.push(`🧱 ${wallM2.toFixed(2)} m²`);
        if (floorM2 > 0) areaParts.push(`⬜ ${floorM2.toFixed(2)} m²`);
        const areaStr = areaParts.join(" · ") || `${(r.area||0).toFixed(2)} m²`;

        const surfLines = surfaces.map(s => {
            const icon = s.type === "floor" ? "⬜" : "🧱";
            const dim  = s.type === "floor"
                ? `${s.length}×${s.width}m`
                : `${s.width}×${s.height}m`;
            return `<span class="surf-chip">${icon} ${esc(s.label)} ${dim} · £${s.total}</span>`;
        }).join("");

        const mats       = surfaces.reduce((a, s) => a + (s.materialSell  || 0), 0);
        const lab        = surfaces.reduce((a, s) => a + (s.labour        || 0), 0);
        const prep       = surfaces.reduce((a, s) => a + (s.prepCost      || 0), 0);
        const ufh        = surfaces.reduce((a, s) => a + (s.ufhCost       || 0), 0);
        const adhKg      = surfaces.reduce((a, s) => a + (s.adhKg         || 0), 0);
        const adhBags    = Math.ceil(adhKg / 20);
        const groutKg    = surfaces.reduce((a, s) => a + (s.groutKg       || 0), 0);
        const groutBags  = Math.ceil(groutKg / (parseFloat(settings.groutBagSize) || 2.5));
        const cbBoards   = surfaces.reduce((a, s) => a + (s.cementBoards  || 0), 0);
        const levelBags  = surfaces.reduce((a, s) => a + (s.levelBags     || 0), 0);
        const clips      = surfaces.reduce((a, s) => a + (s.clips ? (s.levelClips  || 0) : 0), 0);
        const wedges     = surfaces.reduce((a, s) => a + (s.clips ? (s.levelWedges || 0) : 0), 0);
        const clipCost   = surfaces.reduce((a, s) => a + (s.clipCost      || 0), 0);

        const matSchedule = [
            adhBags  > 0 ? `Adhesive: ${adhBags} × 20kg`                                       : "",
            groutBags> 0 ? `Grout: ${groutBags} × ${parseFloat(settings.groutBagSize)||2.5}kg bag${groutBags !== 1 ? "s" : ""}` : "",
            cbBoards > 0 ? `Cement Board: ${cbBoards} board${cbBoards !== 1 ? "s" : ""}`       : "",
            levelBags> 0 ? `Levelling: ${levelBags} × 20kg`                                    : "",
            clips    > 0 ? `Clips: ${clips}  ·  Wedges: ${wedges}${clipCost > 0 ? `  ·  £${clipCost.toFixed(2)}` : ""}` : "",
        ].filter(Boolean).join("  ·  ");

        const seal = calcSealantRoom(r);
        grandSiliconeTubes  += seal.tubes;
        grandSiliconeMetres += seal.metres;
        grandSiliconeFloor  += (seal.floor || 0);
        const sealLine = seal.tubes > 0 ? `<div style="margin-top:4px;font-size:12px;color:#555;">Sealant: <strong>${seal.tubes}</strong> tube${seal.tubes!==1?"s":""} <span style="color:#6b7280">· ${seal.metres}m</span> <span style="color:#6b7280">· Floor perimeter bead ${seal.floor}m</span></div>` : "";

        return `
        <div class="room-card">
            <div class="room-card-header">
                <div>
                    <div class="room-card-name">${esc(r.name)}</div>
                    <div class="room-card-meta">${areaStr}${r.tileType ? ` · <span style="color:var(--accent);font-weight:600;">${TILE_TYPE_LABELS[r.tileType] || r.tileType}</span>` : ""}</div>
                </div>
                <div class="room-card-total">£${r.total}</div>
            </div>
            <div class="room-cost-breakdown">
                <span class="rcb-item"><span class="rcb-label">Materials</span><span class="rcb-value">£${mats.toFixed(2)}</span></span>
                <span class="rcb-sep">|</span>
                <span class="rcb-item"><span class="rcb-label">Labour</span><span class="rcb-value">£${lab.toFixed(2)}</span></span>
                ${prep > 0 ? `<span class="rcb-sep">|</span><span class="rcb-item"><span class="rcb-label">Prep</span><span class="rcb-value">£${prep.toFixed(2)}</span></span>` : ""}
                ${ufh  > 0 ? `<span class="rcb-sep">|</span><span class="rcb-item"><span class="rcb-label">UFH</span><span class="rcb-value">£${ufh.toFixed(2)}</span></span>` : ""}
            </div>
            ${matSchedule ? `<div class="room-mat-schedule">${matSchedule}</div>` : ""}
            ${surfLines ? `<div class="surf-chips">${surfLines}</div>` : ""}
            <div class="room-card-actions">
                <button onclick="goEditRoom(${i})" class="btn-secondary btn-sm">✏ Edit</button>
                <button onclick="deleteRoom(${i})" class="btn-secondary btn-sm">🗑 Delete</button>
            </div>
        </div>`;
    }).join("");

    const grandTotal = rooms.reduce((a, r) => a + parseFloat(r.total || 0), 0);
    totalEl.classList.remove("hidden");
    totalEl.innerHTML = `<span>Job Total</span><strong>£${grandTotal.toFixed(2)}</strong>`;
}

function setJobStatus(status) {
    const job = getJob();
    if (!job) return;
    job.status = status;
    saveAll();
    renderJobView();
    renderDashboard();
}

function advanceStatus() {
    const PIPELINE = ["enquiry","surveyed","quoted","accepted","scheduled","in_progress","complete"];
    const job = getJob();
    if (!job) return;
    const idx = PIPELINE.indexOf(job.status);
    if (idx < PIPELINE.length - 1) {
        job.status = PIPELINE[idx + 1];
        saveAll();
        renderJobView();
        renderDashboard();
    }
}

function deleteRoom(idx) {
    if (!confirm("Delete this room?")) return;
    getJob().rooms.splice(idx, 1);
    saveAll();
    renderJobView();
}

function deleteJob() {
    const job = getJob();
    if (!job) return;
    if (!confirm(`Delete job for ${job.customerName}? This cannot be undone.`)) return;
    const deletedId = currentJobId;
    jobs = jobs.filter(j => j.id !== deletedId);
    currentJobId = null;
    saveAll(); // update localStorage immediately so totals recalculate correctly
    if (currentUser) {
        fetch(AI_PROXY_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "d1_delete_job", user_id: currentUser.id, job_id: deletedId })
        }).catch(e => console.error("deleteJob D1 error:", e));
    }
    goDashboard();
}

/* ================================================================
   EDIT JOB
================================================================ */
function toggleArchiveJob() {
    const job = getJob();
    if (!job) return;
    job.jobArchived = !job.jobArchived;
    saveAll();
    renderDashboard();
}

function goEditJob() {
    const j = getJob();
    document.getElementById("ej-name").value    = j.customerName || "";
    document.getElementById("ej-phone").value   = j.phone        || "";
    document.getElementById("ej-email").value   = j.email        || "";
    document.getElementById("ej-address").value = j.address      || "";
    document.getElementById("ej-city").value    = j.city         || "";
    document.getElementById("ej-postcode").value= j.postcode     || "";
    document.getElementById("ej-desc").value    = j.description  || "";
    document.getElementById("ej-status").value  = j.status       || "enquiry";
    document.getElementById("ej-supply").value  = j.tileSupply   || "contractor";
    show("screen-edit-job");
}

function saveEditJob() {
    const name = document.getElementById("ej-name").value.trim();
    if (!name) { alert("Customer name is required."); return; }
    const j = getJob();
    j.customerName = name;
    j.phone        = document.getElementById("ej-phone").value.trim();
    j.email        = document.getElementById("ej-email").value.trim();
    j.address      = document.getElementById("ej-address").value.trim();
    j.city         = document.getElementById("ej-city").value.trim();
    j.postcode     = document.getElementById("ej-postcode").value.trim();
    j.description  = document.getElementById("ej-desc").value.trim();
    j.status       = document.getElementById("ej-status").value;
    j.tileSupply   = document.getElementById("ej-supply").value;
    saveAll();
    goJob();
}

/* ================================================================
   ROOM EDITOR
================================================================ */
function setLabourType(type) {
    currentLabourType = type;
    document.getElementById("ltbtn-m2").classList.toggle("ltbtn-active",  type === "m2");
    document.getElementById("ltbtn-day").classList.toggle("ltbtn-active", type === "day");
    document.getElementById("labour-day-opts").classList.toggle("hidden", type !== "day");
    rmCalc();
}

const TILE_TYPE_LABELS = {
    ceramic:      "Ceramic",
    porcelain:    "Porcelain",
    natural_stone: "Natural Stone",
    modular:      "Modular Pattern",
    herringbone:  "Herringbone",
    mosaic:       "Mosaic"
};

function updateTileTypeNote() {
    const el   = document.getElementById("rm-tile-type-rate-note");
    const type = document.getElementById("rm-tile-type")?.value || "ceramic";
    const mult = (settings.tileRates || {})[type] || 1.0;
    const baseFloor = settings.labourM2Floor || 28;
    const baseWall  = settings.labourM2Wall  || 35;
    const isStone = type === "natural_stone";

    // Auto-apply stone install + sealer for all relevant surfaces
    const stoneIds = [
        { stone: "rm-r-stone",  sealer: "rm-r-sealer",  sealerRow: "rm-r-sealer-row",  toggle: rmToggleStoneR  },
        { stone: "rm-r-wstone", sealer: "rm-r-wsealer", sealerRow: "rm-r-wsealer-row", toggle: () => {
            const c = document.getElementById("rm-r-wstone")?.checked;
            const row = document.getElementById("rm-r-wsealer-row");
            if (row) row.classList.toggle("hidden", !c);
            if (!c && document.getElementById("rm-r-wsealer")) document.getElementById("rm-r-wsealer").checked = false;
        }},
        { stone: "rm-f-stone",  sealer: "rm-f-sealer",  sealerRow: "rm-f-sealer-row",  toggle: rmToggleStoneF  },
        { stone: "rm-w-stone",  sealer: "rm-w-sealer",  sealerRow: "rm-w-sealer-row",  toggle: rmToggleStoneW  },
    ];

    let appliedStone = false, appliedSealer = false;
    stoneIds.forEach(({ stone, sealer, sealerRow, toggle }) => {
        const stoneEl  = document.getElementById(stone);
        const sealerEl = document.getElementById(sealer);
        const rowEl    = document.getElementById(sealerRow);
        if (!stoneEl) return;
        if (isStone) {
            if (!stoneEl.checked) { stoneEl.checked = true; toggle(); }
            appliedStone = true;
            if (rowEl) rowEl.classList.remove("hidden");
            if (sealerEl) { sealerEl.checked = true; appliedSealer = true; }
        }
    });

    if (el) {
        if (isStone) {
            const stoneRate  = parseFloat(settings.stoneSurcharge) || 8.00;
            const sealerRate = parseFloat(settings.sealerPrice)    || 5.00;
            el.innerHTML =
                `<span style="color:var(--accent);font-weight:600;">🪨 Natural Stone selected</span><br>` +
                `<span style="color:#059669;font-size:12px;font-weight:600;">` +
                `✓ Natural Stone Install labour added — £${stoneRate.toFixed(2)}/m²<br>` +
                `✓ Stone Sealer added — £${sealerRate.toFixed(2)}/m²` +
                `</span><br>` +
                `<span style="font-size:11px;color:var(--text-muted);">${mult}× labour multiplier · floor: £${(baseFloor * mult).toFixed(2)}/m² · wall: £${(baseWall * mult).toFixed(2)}/m²</span>`;
        } else {
            el.textContent = mult === 1.0
                ? `${TILE_TYPE_LABELS[type]} — standard rate`
                : `${TILE_TYPE_LABELS[type]} — ${mult}× multiplier (floor: £${(baseFloor * mult).toFixed(2)}/m², wall: £${(baseWall * mult).toFixed(2)}/m²)`;
        }
    }
    rmCalc();
}

function goAddRoom() {
    currentRoomIdx    = null;
    currentSurfType   = "room";
    currentLabourType = "m2";
    document.getElementById("room-screen-title").textContent = "Add Room";
    document.getElementById("rm-name").value = "";
    const job = getJob();
    document.getElementById("rm-customer-tiles").checked = (job?.tileSupply === "customer");
    document.getElementById("rm-dayrate").value = settings.dayRate || 200;
    document.getElementById("rm-tile-type").value = "ceramic";
    updateTileTypeNote();
    document.getElementById("rm-days").value = "";
    clearRoomInputs();
    setLabourType("m2");
    rmSelectType("room");
    show("screen-room");
    setTimeout(() => document.getElementById("rm-name").focus(), 100);
}

function goEditRoom(idx) {
    const room = getJob().rooms[idx];
    currentRoomIdx    = idx;
    currentSurfType   = room.savedType || "room";
    currentLabourType = room.labourType || "m2";

    document.getElementById("room-screen-title").textContent = "Edit Room";
    document.getElementById("rm-name").value = room.name;
    document.getElementById("rm-customer-tiles").checked = room.tileSupply === "customer";
    document.getElementById("rm-dayrate").value = room.dayRate || settings.dayRate || 200;
    document.getElementById("rm-days").value    = room.days || "";
    document.getElementById("rm-tile-type").value = room.tileType || "ceramic";
    updateTileTypeNote();

    clearRoomInputs();
    setLabourType(currentLabourType);
    rmSelectType(currentSurfType);
    restoreRoomInputs(room);
    // Restore saved deductions
    wallDeducts  = (room.wallDeducts  || []).slice();
    floorDeducts = (room.floorDeducts || []).slice();
    renderDeducts();
    rmCalc();
    show("screen-room");
}

/* Show the right measurement form, highlight the right button */
function rmSelectType(type) {
    currentSurfType = type;
    ["room","floor","wall"].forEach(t => {
        document.getElementById("rm-form-" + t).classList.toggle("hidden", t !== type);
        document.getElementById("stype-btn-" + t).classList.toggle("stype-active", t === type);
    });
    // Wall tiles panel only relevant in full-room mode
    if (type === "room") { openCollapse("walltiles"); updateWallTilesBadge(); }
    else closeCollapse("walltiles");
    rmCalc();
}

function rmToggleFloor() {
    const show = document.getElementById("rm-r-inclfloor").checked;
    document.getElementById("rm-r-floor-opts").style.display = show ? "" : "none";
    rmCalc();
}

/* Wipe all measurement fields */
function clearRoomInputs() {
    clearDeducts();
    const ids = [
        "rm-r-length","rm-r-width","rm-r-height","rm-r-deduct",
        "rm-f-length","rm-f-width",
        "rm-w-width","rm-w-height"
    ];
    ids.forEach(id => document.getElementById(id).value = "");
    document.getElementById("rm-r-inclfloor").checked = true;
    document.getElementById("rm-r-ufh").checked       = false;
    const se = document.getElementById("rm-sealant-enabled"); if (se) se.value = "true";
    const sf = document.getElementById("rm-sealant-floorperim"); if (sf) sf.checked = true;
    const sc = document.getElementById("rm-sealant-corners"); if (sc) sc.value = "";
    const exd = document.getElementById("rm-extra-desc"); if (exd) exd.value = "";
    const exc = document.getElementById("rm-extra-cost"); if (exc) exc.value = "";
    const fexd = document.getElementById("rm-f-extra-desc"); if (fexd) fexd.value = "";
    const fexc = document.getElementById("rm-f-extra-cost"); if (fexc) fexc.value = "";
    const wexd = document.getElementById("rm-w-extra-desc"); if (wexd) wexd.value = "";
    const wexc = document.getElementById("rm-w-extra-cost"); if (wexc) wexc.value = "";
    ["rm-trim-lengths","rm-trim-price","rm-f-trim-lengths","rm-f-trim-price","rm-w-trim-lengths","rm-w-trim-price"]
        .forEach(id => { const el = document.getElementById(id); if (el) el.value = ""; });
    ["trim-r-badge","trim-f-badge","trim-w-badge"].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = ""; });
    document.getElementById("rm-f-ufh").checked       = false;
    document.getElementById("rm-r-floor-opts").style.display = "";
    // reset prep checkboxes
    ["rm-r-cementboard","rm-r-membrane","rm-r-levelling","rm-r-tanking","rm-r-clips",
     "rm-r-primer","rm-r-stone","rm-r-sealer","rm-r-wprimer","rm-r-wstone","rm-r-wsealer",
     "rm-f-cementboard","rm-f-membrane","rm-f-levelling","rm-f-clips","rm-f-tanking",
     "rm-f-primer","rm-f-stone","rm-f-sealer",
     "rm-w-tanking","rm-w-primer","rm-w-stone","rm-w-sealer"].forEach(id => {
        const el = document.getElementById(id); if (el) el.checked = false;
    });
    ["rm-r-sealer-row","rm-r-wsealer-row","rm-f-sealer-row","rm-w-sealer-row"].forEach(id => {
        document.getElementById(id)?.classList.add("hidden");
    });
    document.getElementById("rm-r-level-depth").classList.add("hidden");
    document.getElementById("rm-f-level-depth").classList.add("hidden");
    // reset tile defaults
    document.getElementById("rm-r-wtilew").value = 300;
    document.getElementById("rm-r-wtileh").value = 600;
    document.getElementById("rm-r-wtilethick").value = 8;
    document.getElementById("rm-r-wgrout").value = 2;
    document.getElementById("rm-r-ftilew").value = 600;
    document.getElementById("rm-r-ftileh").value = 600;
    document.getElementById("rm-r-ftilethick").value = 10;
    document.getElementById("rm-r-fgrout").value = 2;
    document.getElementById("rm-r-deduct").value = 0;
    document.getElementById("rm-f-tilew").value  = 600;
    document.getElementById("rm-f-tileh").value  = 600;
    document.getElementById("rm-f-tilethick").value = 10;
    document.getElementById("rm-f-grout").value  = 2;
    document.getElementById("rm-w-tilew").value  = 300;
    document.getElementById("rm-w-tilethick").value = 8;
    document.getElementById("rm-w-tileh").value  = 600;
    document.getElementById("rm-w-grout").value  = 2;
    // Uncheck all preset deduction chips
    document.querySelectorAll(".deduct-chip input[type=checkbox]").forEach(cb => cb.checked = false);
    // Clear extra surfaces
    extraSurfaces = [];
    renderExtraSurfaces();
    // Close all collapsible panels
    ["sealant","extrawork","walltiles","extrawork-f","extrawork-w","trim","trim-f","trim-w"].forEach(closeCollapse);
}

/* Restore fields when editing an existing room */
function restoreRoomInputs(room) {
    const surfaces = room.surfaces || [];
    const walls    = surfaces.filter(s => s.type === "wall");
    const floors   = surfaces.filter(s => s.type === "floor");
    const set   = (id, v) => { if (v !== undefined && v !== null) document.getElementById(id).value = v; };
    const setCb = (id, v) => { const el = document.getElementById(id); if (el) el.checked = !!v; };

    // Sealant fields
    set("rm-sealant-enabled", (room.sealantEnabled === false) ? "false" : "true");
    set("rm-sealant-corners", room.sealantCorners || "");
    const sf = document.getElementById("rm-sealant-floorperim"); if (sf) sf.checked = (room.sealantFloorPerim !== false);

    // Extra work
    set("rm-extra-desc", room.extraWorkDesc || "");
    set("rm-extra-cost", (room.extraWorkCost || room.extraWorkCost === 0) ? room.extraWorkCost : "");
    // floor/wall extra work — same value stored in room, applied to the right form on restore
    if (room.savedType === "floor") {
        set("rm-f-extra-desc", room.extraWorkDesc || "");
        set("rm-f-extra-cost", room.extraWorkCost || "");
    } else if (room.savedType === "wall") {
        set("rm-w-extra-desc", room.extraWorkDesc || "");
        set("rm-w-extra-cost", room.extraWorkCost || "");
    }

    if (currentSurfType === "room") {
        if ((room.length||0) > 0 && (room.width||0) > 0 && (room.height||0) > 0) {
            set("rm-r-length", room.length);
            set("rm-r-width",  room.width);
            set("rm-r-height", room.height);
        } else if (walls.length >= 4) {
            set("rm-r-length", walls[0].width);
            set("rm-r-width",  walls[2].width);
            set("rm-r-height", walls[0].height);
            set("rm-r-wtilew", walls[0].tileW);
            set("rm-r-wtileh", walls[0].tileH);
            set("rm-r-wtilethick", walls[0].tileThick || 8);
            set("rm-r-wgrout", walls[0].grout);
            setCb("rm-r-tanking", walls[0].tanking);
            setCb("rm-r-wprimer", walls[0].primer);
            setCb("rm-r-wstone",  walls[0].stone);
            setCb("rm-r-wsealer", walls[0].sealer);
            if (walls[0].stone) document.getElementById("rm-r-wsealer-row").classList.remove("hidden");
        }
        if (floors.length) {
            setCb("rm-r-inclfloor", true);
            set("rm-r-ftilew", floors[0].tileW);
            set("rm-r-ftileh", floors[0].tileH);
            set("rm-r-ftilethick", floors[0].tileThick || 10);
            set("rm-r-fgrout", floors[0].grout);
            setCb("rm-r-ufh", floors[0].ufh);
            setCb("rm-r-cementboard", floors[0].cementBoard);
            setCb("rm-r-membrane",    floors[0].membrane);
            setCb("rm-r-levelling",   floors[0].levelling);
            setCb("rm-r-clips",       floors[0].clips);
            setCb("rm-r-primer",      floors[0].primer);
            setCb("rm-r-stone",       floors[0].stone);
            setCb("rm-r-sealer",      floors[0].sealer);
            if (floors[0].stone) document.getElementById("rm-r-sealer-row").classList.remove("hidden");
            if (floors[0].levelling) {
                set("rm-r-leveldepth", floors[0].levelDepth || 2);
                document.getElementById("rm-r-level-depth").classList.remove("hidden");
            }
            document.getElementById("rm-r-floor-opts").style.display = "";
        } else {
            setCb("rm-r-inclfloor", false);
            document.getElementById("rm-r-floor-opts").style.display = "none";
        }
    } else if (currentSurfType === "floor" && floors.length) {
        set("rm-f-length", floors[0].length);
        set("rm-f-width",  floors[0].width);
        if (floors[0].wastage !== undefined) set("rm-f-wastage", floors[0].wastage);
        set("rm-f-tilew",  floors[0].tileW);
        set("rm-f-tileh",  floors[0].tileH);
        set("rm-f-tilethick", floors[0].tileThick || 10);
        set("rm-f-grout",  floors[0].grout);
        setCb("rm-f-ufh",         floors[0].ufh);
        setCb("rm-f-cementboard", floors[0].cementBoard);
        setCb("rm-f-membrane",    floors[0].membrane);
        setCb("rm-f-levelling",   floors[0].levelling);
        setCb("rm-f-clips",       floors[0].clips);
        setCb("rm-f-tanking",     floors[0].tanking);
        setCb("rm-f-primer",      floors[0].primer);
        setCb("rm-f-stone",       floors[0].stone);
        setCb("rm-f-sealer",      floors[0].sealer);
        if (floors[0].stone) document.getElementById("rm-f-sealer-row").classList.remove("hidden");
        if (floors[0].levelling) {
            set("rm-f-leveldepth", floors[0].levelDepth || 2);
            document.getElementById("rm-f-level-depth").classList.remove("hidden");
        }
    } else if (currentSurfType === "wall" && walls.length) {
        set("rm-w-width",  walls[0].width);
        set("rm-w-height", walls[0].height);
        set("rm-w-tilew",  walls[0].tileW);
        set("rm-w-tileh",  walls[0].tileH);
        set("rm-w-tilethick", walls[0].tileThick || 8);
        set("rm-w-grout",  walls[0].grout);
        setCb("rm-w-tanking", walls[0].tanking);
        setCb("rm-w-primer",  walls[0].primer);
        setCb("rm-w-stone",   walls[0].stone);
        setCb("rm-w-sealer",  walls[0].sealer);
        if (walls[0].stone) document.getElementById("rm-w-sealer-row").classList.remove("hidden");
    }

    // Restore extra surfaces (all beyond the primary one)
    extraSurfaces = [];
    if (currentSurfType === "floor" && floors.length > 1) {
        extraSurfaces = floors.slice(1).map(s => ({ ...s, type:"floor" }));
    } else if (currentSurfType === "wall" && walls.length > 1) {
        extraSurfaces = walls.slice(1).map(s => ({ ...s, type:"wall" }));
    }
    renderExtraSurfaces();
    // Restore trim
    if (room.trimLengths) {
        const lenId   = room.savedType === "floor" ? "rm-f-trim-lengths" : room.savedType === "wall" ? "rm-w-trim-lengths" : "rm-trim-lengths";
        set(lenId, room.trimLengths);
    }
    setTimeout(() => {
        const hasWallDeduct = parseFloat(document.getElementById("rm-r-deduct")?.value) > 0;
        const hasFloorDeduct = parseFloat(document.getElementById("rm-r-fdeduct")?.value) > 0 ||
                               parseFloat(document.getElementById("rm-f-deduct")?.value)  > 0;
        const hasWallDeductW = parseFloat(document.getElementById("rm-w-deduct")?.value) > 0;
        if (hasWallDeduct || hasFloorDeduct) openDeductPanel("r");
        if (hasFloorDeduct && currentSurfType === "floor") openDeductPanel("f");
        if (hasWallDeductW) openDeductPanel("w");
        // Auto-open collapsible panels if they have values
        const hasSealant = (room.sealantEnabled !== false && room.sealantEnabled !== "false") ||
                           (parseFloat(room.sealantCorners) > 0);
        const hasExtraWork = room.extraWorkDesc || parseFloat(room.extraWorkCost) > 0;
        if (hasSealant) openCollapse("sealant");
        if (hasExtraWork) {
            if (currentSurfType === "floor") openCollapse("extrawork-f");
            else if (currentSurfType === "wall") openCollapse("extrawork-w");
            else openCollapse("extrawork");
        }
        const hasTrim = room.trimLengths > 0;
        if (hasTrim) {
            const trimPanelKey = currentSurfType === "floor" ? "trim-f" : currentSurfType === "wall" ? "trim-w" : "trim";
            openCollapse(trimPanelKey);
            updateTrimBadge(currentSurfType === "floor" ? "f" : currentSurfType === "wall" ? "w" : "r");
        }
        if (currentSurfType === "room") { openCollapse("walltiles"); updateWallTilesBadge(); }
    }, 50);
}

/* ─── EXTRA SURFACES (additional floors / walls) ─── */
let extraSurfaces = [];   // [{type, label, ...fields}, ...]

function addExtraSurface(type) {
    const i = extraSurfaces.length;
    const isFloor = type === "floor";
    extraSurfaces.push({
        type,
        label: isFloor ? `Floor ${i + 2}` : `Wall ${i + 2}`,
        // floor fields
        length: "", width: "",
        tileW: isFloor ? 600 : 300, tileH: isFloor ? 600 : 600,
        tileThick: isFloor ? 10 : 8, grout: 2, deduct: 0,
        ufh: false, cementBoard: false, membrane: false, levelling: false,
        levelDepth: 2, clips: false,
        // wall fields
        height: "", tanking: false,
    });
    renderExtraSurfaces();
    // focus the first input of the new card
    const cards = document.querySelectorAll(".extra-surface-card");
    if (cards.length) cards[cards.length - 1].querySelector("input")?.focus();
    rmCalc();
}

function removeExtraSurface(i) {
    extraSurfaces.splice(i, 1);
    renderExtraSurfaces();
    rmCalc();
}

function updateExtra(i, field, value) {
    if (!extraSurfaces[i]) return;
    const numFields = ["length","width","height","tileW","tileH","tileThick","grout","deduct","levelDepth"];
    extraSurfaces[i][field] = numFields.includes(field) ? (parseFloat(value) || 0) : value;
    // show/hide level depth row
    if (field === "levelling") {
        const depthRow = document.getElementById(`extra-depth-${i}`);
        if (depthRow) depthRow.style.display = value ? "" : "none";
    }
}

function updateExtraCb(i, field, checked) {
    if (!extraSurfaces[i]) return;
    extraSurfaces[i][field] = checked;
    if (field === "levelling") {
        const depthRow = document.getElementById(`extra-depth-${i}`);
        if (depthRow) depthRow.style.display = checked ? "" : "none";
    }
    rmCalc();
}

function renderExtraSurfaces() {
    const floorContainer = document.getElementById("extra-floors-list");
    const wallContainer  = document.getElementById("extra-walls-list");
    if (floorContainer) floorContainer.innerHTML = "";
    if (wallContainer)  wallContainer.innerHTML  = "";

    extraSurfaces.forEach((s, i) => {
        const isFloor = s.type === "floor";
        const container = isFloor ? floorContainer : wallContainer;
        if (!container) return;

        const showClips = isFloor && Math.max(s.tileW || 0, s.tileH || 0) >= 300;

        const html = isFloor ? `
<div class="extra-surface-card" id="extra-card-${i}">
  <div class="extra-surface-header">
    <span class="extra-surface-title">
      <input type="text" value="${s.label}" style="background:transparent;border:none;border-bottom:1px solid var(--amber);color:var(--amber);font-size:13px;font-weight:700;width:110px;padding:0;"
        oninput="updateExtra(${i},'label',this.value)">
    </span>
    <button class="btn-remove-surface" onclick="removeExtraSurface(${i})" title="Remove">✕</button>
  </div>
  <div class="field-row">
    <div class="field-group"><label>Length (m)</label>
      <input type="number" step="0.01" value="${s.length||""}" placeholder="e.g. 2.4" data-disto
        oninput="updateExtra(${i},'length',this.value);rmCalc()"></div>
    <div class="field-group"><label>Width (m)</label>
      <input type="number" step="0.01" value="${s.width||""}" placeholder="e.g. 1.8" data-disto
        oninput="updateExtra(${i},'width',this.value);rmCalc()"></div>
  </div>
  <div class="field-row">
    <div class="field-group"><label>Tile W (mm)</label>
      <input type="number" value="${s.tileW}" id="extra-tilew-${i}"
        oninput="updateExtra(${i},'tileW',this.value);rmCalc()"></div>
    <div class="field-group"><label>Tile H (mm)</label>
      <input type="number" value="${s.tileH}" id="extra-tileh-${i}"
        oninput="updateExtra(${i},'tileH',this.value);rmCalc()"></div>
    <div class="field-group"><label>Thick (mm)</label>
      <input type="number" value="${s.tileThick}"
        oninput="updateExtra(${i},'tileThick',this.value);rmCalc()"></div>
  </div>
  <div class="field-row">
    <div class="field-group"><label>Grout Joint (mm)</label>
      <input type="number" value="${s.grout}" oninput="updateExtra(${i},'grout',this.value);rmCalc()"></div>
  </div>
  <div class="extra-deduct-toggle" onclick="toggleExtraDeduct(${i})" id="extra-deduct-toggle-${i}"
    style="font-size:12px;font-weight:600;color:var(--muted);cursor:pointer;padding:4px 0;user-select:none;">
    Deductions <span id="extra-deduct-arrow-${i}">▸</span>${s.deduct > 0 ? ` <span style="color:var(--red);margin-left:4px;">−${s.deduct}m²</span>` : ""}
  </div>
  <div id="extra-deduct-panel-${i}" style="display:${s.deduct>0?"":"none"};padding:4px 0 6px 0;">
    <div class="field-group"><label>Deduction (m²)</label>
      <input type="number" step="0.01" value="${s.deduct||""}" placeholder="0"
        oninput="updateExtra(${i},'deduct',this.value);rmCalc()"></div>
  </div>
  <label class="checkbox-label" style="margin-bottom:6px;">
    <input type="checkbox" ${s.ufh?"checked":""} onchange="updateExtraCb(${i},'ufh',this.checked)"> UFH
  </label>
  <div class="prep-options">
    <label class="prep-option">
      <input type="checkbox" ${s.cementBoard?"checked":""} onchange="updateExtraCb(${i},'cementBoard',this.checked)">
      <div class="prep-text"><span>Cement Board</span></div></label>
    <label class="prep-option">
      <input type="checkbox" ${s.membrane?"checked":""} onchange="updateExtraCb(${i},'membrane',this.checked)">
      <div class="prep-text"><span>Anti-Crack Membrane</span></div></label>
    <label class="prep-option">
      <input type="checkbox" ${s.levelling?"checked":""} onchange="updateExtraCb(${i},'levelling',this.checked)">
      <div class="prep-text"><span>Levelling Compound</span></div></label>
    <div id="extra-depth-${i}" style="display:${s.levelling?"":"none"};padding:6px 0 0 8px;">
      <label style="font-size:11px;font-weight:600;color:var(--muted);">Depth</label>
      <select onchange="updateExtra(${i},'levelDepth',this.value);rmCalc()">
        <option value="2" ${s.levelDepth==2?"selected":""}>2 mm</option>
        <option value="3" ${s.levelDepth==3?"selected":""}>3 mm</option>
        <option value="4" ${s.levelDepth==4?"selected":""}>4 mm</option>
      </select>
    </div>
    <div id="extra-clips-row-${i}" style="display:${showClips?"":"none"}">
      <label class="prep-option">
        <input type="checkbox" ${s.clips?"checked":""} onchange="updateExtraCb(${i},'clips',this.checked)">
        <div class="prep-text"><span>Levelling Clips &amp; Wedges</span></div></label>
    </div>
  </div>
</div>` : `
<div class="extra-surface-card" id="extra-card-${i}">
  <div class="extra-surface-header">
    <span class="extra-surface-title">
      <input type="text" value="${s.label}" style="background:transparent;border:none;border-bottom:1px solid var(--amber);color:var(--amber);font-size:13px;font-weight:700;width:110px;padding:0;"
        oninput="updateExtra(${i},'label',this.value)">
    </span>
    <button class="btn-remove-surface" onclick="removeExtraSurface(${i})" title="Remove">✕</button>
  </div>
  <div class="field-row">
    <div class="field-group"><label>Width (m)</label>
      <input type="number" step="0.01" value="${s.width||""}" placeholder="e.g. 3.5" data-disto
        oninput="updateExtra(${i},'width',this.value);rmCalc()"></div>
    <div class="field-group"><label>Height (m)</label>
      <input type="number" step="0.01" value="${s.height||""}" placeholder="e.g. 2.4" data-disto
        oninput="updateExtra(${i},'height',this.value);rmCalc()"></div>
  </div>
  <div class="field-row">
    <div class="field-group"><label>Tile W (mm)</label>
      <input type="number" value="${s.tileW}" oninput="updateExtra(${i},'tileW',this.value);rmCalc()"></div>
    <div class="field-group"><label>Tile H (mm)</label>
      <input type="number" value="${s.tileH}" oninput="updateExtra(${i},'tileH',this.value);rmCalc()"></div>
    <div class="field-group"><label>Thick (mm)</label>
      <input type="number" value="${s.tileThick}" oninput="updateExtra(${i},'tileThick',this.value);rmCalc()"></div>
  </div>
  <div class="field-row">
    <div class="field-group"><label>Grout Joint (mm)</label>
      <input type="number" value="${s.grout}" oninput="updateExtra(${i},'grout',this.value);rmCalc()"></div>
  </div>
  <div class="extra-deduct-toggle" onclick="toggleExtraDeduct(${i})" id="extra-deduct-toggle-${i}"
    style="font-size:12px;font-weight:600;color:var(--muted);cursor:pointer;padding:4px 0;user-select:none;">
    Deductions <span id="extra-deduct-arrow-${i}">▸</span>${s.deduct > 0 ? ` <span style="color:var(--red);margin-left:4px;">−${s.deduct}m²</span>` : ""}
  </div>
  <div id="extra-deduct-panel-${i}" style="display:${s.deduct>0?"":"none"};padding:4px 0 6px 0;">
    <div class="field-group"><label>Deduction (m²)</label>
      <input type="number" step="0.01" value="${s.deduct||""}" placeholder="0"
        oninput="updateExtra(${i},'deduct',this.value);rmCalc()"></div>
  </div>
  <div class="prep-options">
    <label class="prep-option">
      <input type="checkbox" ${s.tanking?"checked":""} onchange="updateExtraCb(${i},'tanking',this.checked)">
      <div class="prep-text"><span>Tanking (Waterproofing)</span></div></label>
  </div>
</div>`;
        container.insertAdjacentHTML("beforeend", html);
    });
    // Auto-focus first empty data-disto input in last added card
    setTimeout(() => {
        const cards = document.querySelectorAll(".extra-surface-card");
        if (!cards.length) return;
        const lastCard = cards[cards.length - 1];
        const firstInput = lastCard.querySelector("input[data-disto]");
        if (firstInput && !firstInput.value) {
            firstInput.focus();
            if (window.Disto) window.Disto.setActive(firstInput);
        }
    }, 50);
}

function toggleExtraDeduct(i) {
    const panel = document.getElementById(`extra-deduct-panel-${i}`);
    const arrow = document.getElementById(`extra-deduct-arrow-${i}`);
    if (!panel) return;
    const isHidden = panel.style.display === "none";
    panel.style.display = isHidden ? "" : "none";
    if (arrow) arrow.textContent = isHidden ? "▾" : "▸";
}

function updateExtraClipsVisibility(surfaces) {
    extraSurfaces.forEach((s, i) => {
        if (s.type !== "floor") return;
        const row = document.getElementById(`extra-clips-row-${i}`);
        if (!row) return;
        const maxDim = Math.max(s.tileW || 0, s.tileH || 0);
        const show   = maxDim >= 300;
        row.style.display = show ? "" : "none";
        if (!show) {
            const cb = row.querySelector("input[type=checkbox]");
            if (cb) cb.checked = false;
            extraSurfaces[i].clips = false;
        }
    });
}

function buildExtraSurfaces() {
    return extraSurfaces
        .map(s => {
            if (s.type === "floor") {
                const L = parseFloat(s.length) || 0;
                const W = parseFloat(s.width)  || 0;
                if (!L || !W) return null;
                return {
                    type:"floor", label: s.label || "Floor",
                    length:L, width:W,
                    tileW:s.tileW||600, tileH:s.tileH||600, tileThick:s.tileThick||10,
                    grout:s.grout||2, deduct:s.deduct||0,
                    ufh:!!s.ufh, cementBoard:!!s.cementBoard, membrane:!!s.membrane,
                    levelling:!!s.levelling, levelDepth:s.levelDepth||2, clips:!!s.clips,
                    primer:!!s.primer, stone:!!s.stone, sealer:!!s.sealer,
                    area: Math.max(0, L * W - (parseFloat(s.deduct)||0))
                };
            } else {
                const W = parseFloat(s.width)  || 0;
                const H = parseFloat(s.height) || 0;
                if (!W || !H) return null;
                return {
                    type:"wall", label: s.label || "Wall",
                    width:W, height:H,
                    tileW:s.tileW||300, tileH:s.tileH||600, tileThick:s.tileThick||8,
                    grout:s.grout||2, tanking:!!s.tanking,
                    primer:!!s.primer, stone:!!s.stone, sealer:!!s.sealer,
                    area: Math.max(0, W * H - (parseFloat(s.deduct)||0))
                };
            }
        })
        .filter(Boolean);
}

/* ─── BUILD SURFACES from current form fields ─── */
function buildSurfaces() {
    const g  = id => { const el = document.getElementById(id); return el ? parseFloat(el.value) : NaN; };
    const cb = id => document.getElementById(id)?.checked || false;
    const sv = id => document.getElementById(id)?.value   || "2";

    if (currentSurfType === "room") {
        const L = g("rm-r-length"), W = g("rm-r-width"), H = g("rm-r-height");
        if (!L || !W || !H || L <= 0 || W <= 0 || H <= 0) return null;

        const deduct      = parseFloat(document.getElementById("rm-r-deduct")?.value) || 0;
        const floorDeduct = parseFloat(document.getElementById("rm-r-fdeduct")?.value) || 0;
        const wallTileW     = g("rm-r-wtilew")     || 300;
        const wallTileH     = g("rm-r-wtileh")     || 600;
        const wallTileThick = g("rm-r-wtilethick") || 8;
        const wallGrout     = g("rm-r-wgrout")     || 2;
        const totalWallArea = 2 * (L + W) * H;
        const tanking = cb("rm-r-tanking");
        const wPrimer = cb("rm-r-wprimer");
        const wStone  = cb("rm-r-wstone");
        const wSealer = cb("rm-r-wsealer");
        const rWWastage = parseFloat(document.getElementById("rm-r-wwastage")?.value);
        const rFWastage = parseFloat(document.getElementById("rm-r-fwastage")?.value);
        const wallWastage  = isNaN(rWWastage) ? 12 : rWWastage;
        const floorWastage = isNaN(rFWastage) ? 10 : rFWastage;

        const surfaces = [
            { label:"Wall A (front)", width:L, height:H },
            { label:"Wall B (back)",  width:L, height:H },
            { label:"Wall C (left)",  width:W, height:H },
            { label:"Wall D (right)", width:W, height:H },
        ].map(w => ({
            type:"wall", label:w.label, width:w.width, height:w.height,
            wastage: wallWastage,
            tileW:wallTileW, tileH:wallTileH, tileThick:wallTileThick, grout:wallGrout,
            tanking, primer:wPrimer, stone:wStone, sealer:wSealer,
            area: Math.max(0, w.width * w.height - deduct * (w.width * w.height / totalWallArea))
        }));

        if (cb("rm-r-inclfloor")) {
            surfaces.push({
                type:"floor", label:"Floor", length:L, width:W,
                wastage: floorWastage,
                tileW:   g("rm-r-ftilew") || 600,
                tileH:   g("rm-r-ftileh") || 600,
                tileThick: g("rm-r-ftilethick") || 10,
                grout:   g("rm-r-fgrout") || 2,
                ufh:     cb("rm-r-ufh"),
                cementBoard: cb("rm-r-cementboard"),
                membrane:    cb("rm-r-membrane"),
                levelling:   cb("rm-r-levelling"),
                levelDepth:  parseInt(sv("rm-r-leveldepth")) || 2,
                clips:       cb("rm-r-clips"),
                primer:      cb("rm-r-primer"),
                stone:       cb("rm-r-stone"),
                sealer:      cb("rm-r-sealer"),
                area: Math.max(0, L * W - floorDeduct)
            });
        }
        return [...surfaces, ...buildExtraSurfaces()];
    }

    if (currentSurfType === "floor") {
        const L = g("rm-f-length"), W = g("rm-f-width");
        if (!L || !W || L <= 0 || W <= 0) return null;
        const fDed    = parseFloat(document.getElementById("rm-f-deduct")?.value) || 0;
        const fWastage = parseFloat(document.getElementById("rm-f-wastage")?.value);
        return [{ type:"floor", label:"Floor", length:L, width:W,
            wastage: isNaN(fWastage) ? 10 : fWastage,
            tileW:   g("rm-f-tilew") || 600,
            tileH:   g("rm-f-tileh") || 600,
            tileThick: g("rm-f-tilethick") || 10,
            grout:   g("rm-f-grout") || 2,
            ufh:     cb("rm-f-ufh"),
            cementBoard: cb("rm-f-cementboard"),
            membrane:    cb("rm-f-membrane"),
            levelling:   cb("rm-f-levelling"),
            levelDepth:  parseInt(sv("rm-f-leveldepth")) || 2,
            clips:       cb("rm-f-clips"),
            tanking:     cb("rm-f-tanking"),
            primer:      cb("rm-f-primer"),
            stone:       cb("rm-f-stone"),
            sealer:      cb("rm-f-sealer"),
            area: Math.max(0, L * W - fDed)
        }, ...buildExtraSurfaces()];
    }

    if (currentSurfType === "wall") {
        const W = g("rm-w-width"), H = g("rm-w-height");
        if (!W || !H || W <= 0 || H <= 0) return null;
        const wDed     = parseFloat(document.getElementById("rm-w-deduct")?.value) || 0;
        const wWastage = parseFloat(document.getElementById("rm-w-wastage")?.value);
        return [{ type:"wall", label:"Wall",
            width:W, height:H,
            wastage: isNaN(wWastage) ? 12 : wWastage,
            tileW:   g("rm-w-tilew") || 300,
            tileH:   g("rm-w-tileh") || 600,
            tileThick: g("rm-w-tilethick") || 8,
            grout:   g("rm-w-grout") || 2,
            tanking: cb("rm-w-tanking"),
            primer:  cb("rm-w-primer"),
            stone:   cb("rm-w-stone"),
            sealer:  cb("rm-w-sealer"),
            area:    Math.max(0, W * H - wDed)
        }, ...buildExtraSurfaces()];
    }

    return null;
}

/* ─── COST CALCULATION for a single surface ─── */
function calcSurface(s, customerTiles, labourOpts) {
    const S = settings;

    // Ensure area is always a number (guards against string values from localStorage)
    s.area = parseFloat(s.area) || 0;

    const tileArea = (s.tileW / 1000) * (s.tileH / 1000);

    // Waste factor: use custom % if set, otherwise default walls 12%, floors 10%
    const wasteDefault  = s.type === "wall" ? 12 : 10;
    const wastePct      = (s.wastage !== undefined && s.wastage !== null) ? parseFloat(s.wastage) : wasteDefault;
    const wasteFactor   = 1 + (wastePct / 100);
    s.tiles = Math.ceil((s.area / tileArea) * wasteFactor);

    // Adhesive: based on tile size category (from BAL/Weber data sheets)
    const maxDim = Math.max(s.tileW, s.tileH);
    let adhKgM2;
    // Midpoint of published usage ranges (Topps Tiles / BAL)
    // Large format gets +17.5% for mandatory back buttering
    if      (maxDim < 100)  { adhKgM2 = 3.0; s.adhNotch = "4mm";    s.adhCat = "Mosaic / Small (<100mm)";        s.backButter = false; }
    else if (maxDim <= 300) { adhKgM2 = 4.0; s.adhNotch = "6mm";    s.adhCat = "Standard Wall (up to 300mm)";    s.backButter = false; }
    else if (maxDim <= 600) { adhKgM2 = 5.75; s.adhNotch = "10mm";  s.adhCat = "Standard Floor (300–600mm)";     s.backButter = false; }
    else                    { adhKgM2 = 7.0 * 1.175; s.adhNotch = "12mm+"; s.adhCat = "Large Format (>600mm) inc. back-butter"; s.backButter = true; }
    s.adhKgM2 = adhKgM2;
    s.adhKg   = (s.area * adhKgM2);
    s.adhBags = Math.max(0, Math.ceil(s.adhKg / 20)); // per-surface display only
    s.adhBagsExact = (s.adhKg / 20); // for pro-rata costing
// Grout formula:
    // A = tileW + tileH
    // B = jointWidth × tileThickness
    // C = A × B × 1.2
    // D = tileW × tileH
    // Rate (kg/m²) = C / D
    // Total = Rate × area
    const groutMm   = s.grout     || 2;
    const tileThick = s.tileThick || (s.type === "floor" ? 10 : 8);

    // Real grout consumption (kg per m²)
    // kg/m² = ((L+W)/(L*W)) * jointWidth * thickness * 1.6
    const groutKgM2 = ((s.tileW + s.tileH) / (s.tileW * s.tileH)) * groutMm * tileThick * 1.6;

    // Total kg for this surface (kept for internal reference only)
    const totalGroutKg = groutKgM2 * s.area;
    s.groutKg   = parseFloat(totalGroutKg.toFixed(2));

    // Grout bags — size configurable in settings (2.5kg or 5kg)
    const bagSize   = parseFloat(S.groutBagSize) || 2.5;
    const bagPrice  = bagSize >= 5 ? (parseFloat(S.groutPrice5) || 7.50) : (parseFloat(S.groutPrice25) || 4.50);
    s.groutBags = Math.ceil(totalGroutKg / bagSize);

    // Levelling clips & wedges quantities (always computed; cost only if s.clips is ticked)
    const clipsPerTile = maxDim >= 1200 ? 6 : maxDim > 600 ? 5 : 4;
    s.levelClips  = s.tiles * clipsPerTile;
    s.levelWedges = Math.ceil(s.levelClips * 0.25);

const tileCost = customerTiles ? 0 : s.area * S.tilePrice;
    // Price adhesive/grout pro-rata by kg
    const groutCost = (totalGroutKg / bagSize) * bagPrice;
    const adhCost   = (s.adhKg / 20) * S.adhesivePrice;
    const matRaw    = tileCost + groutCost + adhCost;
    const mult     = 1 + S.markup / 100;
    s.materialSell = matRaw * mult;

    // Labour: separate wall/floor rates + tile type multiplier
    const tileTypeMult = S.tileRates ? (S.tileRates[s.tileType || "ceramic"] || 1.0) : 1.0;
    const labourRate = (s.type === "wall"
        ? (S.labourM2Wall || S.labourM2 || 35)
        : (S.labourM2Floor || S.labourM2 || 28)) * tileTypeMult;

    if (labourOpts && labourOpts.type === "day") {
        const totalArea  = labourOpts.totalArea || 1;
        const proportion = totalArea > 0 ? s.area / totalArea : 0;
        const labRaw     = labourOpts.days * labourOpts.dayRate * proportion;
        s.labour = S.labourMarkup ? labRaw * mult : labRaw;
    } else {
        const labRaw = s.area * labourRate;
        s.labour = S.labourMarkup ? labRaw * mult : labRaw;
    }

    s.ufhCost = (s.ufh && s.type === "floor") ? s.area * (parseFloat(S.ufhM2Rate) || 52) + (parseFloat(S.ufhFixedCost) || 180) : 0;

    // Prep costs — all rates are £/m², multiplied by surface area
    s.prepCost = 0;
    s.prepLines = [];
    s.prepAdhKg  = 0;   // extra standard adhesive kg from prep (cement board bonding)
    s.rapidAdhKg = 0;   // rapid set adhesive kg for anti-crack membrane bed
    if (s.type === "floor") {
        if (s.cementBoard) {
            const matRate  = parseFloat(S.cementBoard) || 18;
            const labRate  = parseFloat(S.cbLabour)    || 6;
            const adhRate  = parseFloat(S.cbAdhKgM2)   || 4;
            const boards   = Math.ceil(s.area / 0.96);
            const matCost  = s.area * matRate;
            const labCost  = s.area * labRate;
            const adhKg    = s.area * adhRate;
            s.cementBoards  = boards;
            s.prepAdhKg    += adhKg;
            s.prepCost     += matCost + labCost;
            s.prepLines.push(`Cement Board: ${boards} board${boards !== 1 ? "s" : ""} · material £${matCost.toFixed(2)} · fitting labour £${labCost.toFixed(2)} · +${adhKg.toFixed(1)}kg adhesive`);
        }
        if (s.membrane) {
            const matRate     = parseFloat(S.membrane)      || 8;
            const labRate     = parseFloat(S.memLabour)     || 3;
            const adhRate     = parseFloat(S.memAdhKgM2)    || 3;
            const rapidPrice  = parseFloat(S.rapidAdhPrice) || 28;
            const matCost     = s.area * matRate;
            const labCost     = s.area * labRate;
            const adhKg       = s.area * adhRate;
            const rapidBags   = Math.ceil(adhKg / 20);
            const rapidCost   = rapidBags * rapidPrice * (1 + (parseFloat(S.markup) || 0) / 100);
            s.rapidAdhKg     += adhKg;
            s.prepCost       += matCost + labCost + rapidCost;
            s.prepLines.push(`Anti-Crack Membrane: material £${matCost.toFixed(2)} · fitting labour £${labCost.toFixed(2)} · rapid set adhesive ${rapidBags} bag${rapidBags!==1?"s":""} (${adhKg.toFixed(1)}kg) £${rapidCost.toFixed(2)}`);
        }
        if (s.levelling) {
            const depth    = s.levelDepth || 2;
            const labRate  = depth === 3 ? (parseFloat(S.level3) || 7)
                           : depth === 4 ? (parseFloat(S.level4) || 9)
                           :               (parseFloat(S.level2) || 5);
            // Material cost — bags
            const coverage = parseFloat(S.compoundCoverage) || 3;  // m² per bag at 3mm
            const bagCov   = coverage * (3 / depth);  // adjust coverage for depth
            const bags     = Math.ceil(s.area / bagCov);
            const bagPrice = parseFloat(S.compoundBagPrice) || 12;
            const matCost  = bags * bagPrice;
            const labCost  = s.area * labRate;
            const totalCost = matCost + labCost;
            s.levelBags  = bags;
            s.prepCost += totalCost;
            s.prepLines.push(`Levelling Compound ${depth}mm: ${bags} bag${bags !== 1 ? "s" : ""} (£${bagPrice.toFixed(2)}/bag) + labour = £${totalCost.toFixed(2)}`);
        }
    }
    if (s.type === "wall" && s.tanking) {
        const rate = parseFloat(S.tanking) || 15;
        const c    = s.area * rate;
        s.prepCost += c; s.prepLines.push(`Tanking: ${s.area.toFixed(2)}m² × £${rate}/m² = £${c.toFixed(2)}`);
    }
    // Primer (floors and walls)
    if (s.primer) {
        const rate = parseFloat(S.primerPrice) || 3.50;
        const c    = s.area * rate;
        s.prepCost += c; s.prepLines.push(`Primer: ${s.area.toFixed(2)}m² × £${rate}/m² = £${c.toFixed(2)}`);
    }
    // Natural stone install surcharge
    if (s.stone) {
        const rate = parseFloat(S.stoneSurcharge) || 8.00;
        const c    = s.area * rate;
        s.stoneInstallCost = c;
        s.prepCost += c; s.prepLines.push(`Natural Stone Install: ${s.area.toFixed(2)}m² × £${rate}/m² = £${c.toFixed(2)}`);
    }
    // Stone sealer (only available when stone is selected)
    if (s.stone && s.sealer) {
        const rate = parseFloat(S.sealerPrice) || 5.00;
        const c    = s.area * rate;
        s.stoneSealerCost = c;
        s.prepCost += c; s.prepLines.push(`Stone Sealer: ${s.area.toFixed(2)}m² × £${rate}/m² = £${c.toFixed(2)}`);
    }

    // Clip/wedge cost — only when opted in via s.clips flag
    s.clipCost = 0;
    if (s.clips) {
        const clipBags  = Math.ceil(s.levelClips  / 200);
        const wedgeBags = Math.ceil(s.levelWedges / 200);
        const clipRate  = parseFloat(S.clipPrice)  || 12;
        const wedgeRate = parseFloat(S.wedgePrice) || 8;
        s.clipCost = (clipBags * clipRate + wedgeBags * wedgeRate) * (1 + S.markup / 100);
        s.prepCost += s.clipCost;
        s.prepLines.push(`Levelling Clips: ${s.levelClips} (${clipBags} × 200 bag${clipBags!==1?"s":""}) + Wedges: ${s.levelWedges} (${wedgeBags} × 200 bag${wedgeBags!==1?"s":""}) = £${s.clipCost.toFixed(2)}`);
    }

    s.total = (s.materialSell + s.labour + s.ufhCost + s.prepCost).toFixed(2);

    // Fold standard prep adhesive (cement board bond) into the surface adhKg total
    if (s.prepAdhKg > 0) {
        s.adhKg   += s.prepAdhKg;
        s.adhBags  = Math.ceil(s.adhKg / 20);
    }
    // Rapid set adhesive bags (membrane) tracked separately — cost already in prepCost
    if (s.rapidAdhKg > 0) {
        s.rapidAdhBags = Math.ceil(s.rapidAdhKg / 20);
    }
}

/* ─── DEDUCTION PRESETS ─── */
// Each deduction: { label, w, h, m2 }
let wallDeducts  = [];
let floorDeducts = [];

/* Called by preset chip checkboxes in full-room mode */
function toggleDeductChip(cb) {
    const p = DEDUCT_PRESETS[cb.value];
    if (!p) return;
    const arr = p.floor ? floorDeducts : wallDeducts;
    if (cb.checked) {
        arr.push({ label: p.label, w: p.w, h: p.h, m2: parseFloat((p.w * p.h).toFixed(3)) });
    } else {
        const i = arr.findIndex(d => d.label === p.label && d.w === p.w && d.h === p.h);
        if (i !== -1) arr.splice(i, 1);
    }
    renderDeducts();
    rmCalc();
}

/* Called by preset chip checkboxes in floor-only / wall-only modes */
function updateDeductTotals() {
    const presetEntries = Object.values(DEDUCT_PRESETS);

    if (currentSurfType === "floor") {
        const manuals = floorDeducts.filter(d => !presetEntries.some(p => p.label === d.label && p.w === d.w && p.h === d.h));
        const newPresets = [];
        document.querySelectorAll("#rm-form-floor input[type=checkbox][value]").forEach(cb => {
            const p = DEDUCT_PRESETS[cb.value];
            if (p && cb.checked) newPresets.push({ label: p.label, w: p.w, h: p.h, m2: parseFloat((p.w * p.h).toFixed(3)) });
        });
        floorDeducts = [...newPresets, ...manuals];
    } else if (currentSurfType === "wall") {
        const manuals = wallDeducts.filter(d => !presetEntries.some(p => p.label === d.label && p.w === d.w && p.h === d.h));
        const newPresets = [];
        document.querySelectorAll("#rm-form-wall input[type=checkbox][value]").forEach(cb => {
            const p = DEDUCT_PRESETS[cb.value];
            if (p && cb.checked) newPresets.push({ label: p.label, w: p.w, h: p.h, m2: parseFloat((p.w * p.h).toFixed(3)) });
        });
        wallDeducts = [...newPresets, ...manuals];
    }
    renderDeducts();
    rmCalc();
}

/* Called by the ✏ Custom chip in any mode */
function addManualDeduct(event) {
    event.preventDefault();
    const panelId = currentSurfType === "floor" ? "deduct-panel-f" : (currentSurfType === "wall" ? "deduct-panel-w" : "deduct-panel-r");
    if (document.getElementById("deduct-inline-form")) { document.getElementById("deduct-inline-w")?.focus(); return; }
    const form = document.createElement("div");
    form.id = "deduct-inline-form";
    form.style.cssText = "display:flex;flex-wrap:wrap;gap:8px;align-items:flex-end;margin:8px 0;padding:10px;background:var(--card-bg);border-radius:10px;border:1px solid var(--border);";
    form.innerHTML = `
        <div class="field-group" style="margin:0;flex:1;min-width:80px;">
            <label style="font-size:11px;">Width (m)</label>
            <input id="deduct-inline-w" type="number" step="0.01" placeholder="e.g. 0.9" data-disto style="width:100%;box-sizing:border-box;">
        </div>
        <div class="field-group" style="margin:0;flex:1;min-width:80px;">
            <label style="font-size:11px;">Height (m)</label>
            <input id="deduct-inline-h" type="number" step="0.01" placeholder="e.g. 2.1" data-disto style="width:100%;box-sizing:border-box;">
        </div>
        <div class="field-group" style="margin:0;flex:2;min-width:100px;">
            <label style="font-size:11px;">Label</label>
            <input id="deduct-inline-label" type="text" placeholder="e.g. Door" style="width:100%;box-sizing:border-box;">
        </div>
        <button onclick="confirmManualDeduct()" style="padding:10px 14px;background:var(--amber);color:#000;border:none;border-radius:8px;font-weight:700;cursor:pointer;">Add</button>
        <button onclick="cancelManualDeduct()" style="padding:10px 10px;background:var(--card-bg);border:1px solid var(--border);border-radius:8px;cursor:pointer;">✕</button>
    `;
    const panel = document.getElementById(panelId);
    if (panel) panel.appendChild(form);
    setTimeout(() => {
        const w = document.getElementById("deduct-inline-w");
        if (w) { w.focus(); if (window.Disto) window.Disto.setActive(w); }
    }, 50);
}

function confirmManualDeduct() {
    const w = parseFloat(document.getElementById("deduct-inline-w")?.value);
    const h = parseFloat(document.getElementById("deduct-inline-h")?.value);
    const label = document.getElementById("deduct-inline-label")?.value.trim() || "Opening";
    if (!w || !h || w <= 0 || h <= 0) { alert("Enter valid width and height."); return; }
    const m2 = parseFloat((w * h).toFixed(3));
    if (currentSurfType === "floor") floorDeducts.push({ label, w, h, m2 });
    else wallDeducts.push({ label, w, h, m2 });
    cancelManualDeduct();
    renderDeducts();
    rmCalc();
}

function cancelManualDeduct() {
    document.getElementById("deduct-inline-form")?.remove();
}

function removeDeduct(idx, isFloor) {
    if (isFloor) floorDeducts.splice(idx, 1);
    else         wallDeducts.splice(idx, 1);
    renderDeducts();
    rmCalc();
}

function renderDeducts() {
    const wallTotal  = wallDeducts.reduce((a, d) => a + d.m2, 0);
    const floorTotal = floorDeducts.reduce((a, d) => a + d.m2, 0);

    const wallTag  = (d, i) => `<div class="deduct-tag"><span>${d.label} (${d.w}×${d.h}m = ${d.m2}m²)</span><button onclick="removeDeduct(${i}, false)" class="deduct-remove">×</button></div>`;
    const floorTag = (d, i) => `<div class="deduct-tag"><span>${d.label} (${d.w}×${d.h}m = ${d.m2}m²)</span><button onclick="removeDeduct(${i}, true)" class="deduct-remove">×</button></div>`;

    // Full-room: manual wall deducts list
    const manualEl = document.getElementById("deduct-manual-items");
    if (manualEl) manualEl.innerHTML = wallDeducts.map(wallTag).join("");

    // Full-room: wall total badge & line
    const totalBadge = document.getElementById("deduct-total-badge");
    const totalLine  = document.getElementById("deduct-total-line");
    if (totalBadge) {
        totalBadge.style.display = wallTotal > 0 ? "" : "none";
        totalBadge.textContent = `-${wallTotal.toFixed(2)}m²`;
    }
    if (totalLine) {
        totalLine.style.display = wallTotal > 0 ? "" : "none";
        totalLine.textContent = `Wall deductions total: ${wallTotal.toFixed(2)} m²`;
    }

    // Floor-only: manual floor deducts list + total
    const fManualEl = document.getElementById("deduct-f-manual");
    if (fManualEl) fManualEl.innerHTML = floorDeducts.map(floorTag).join("");
    const fTotalEl = document.getElementById("deduct-f-total");
    if (fTotalEl) {
        fTotalEl.style.display = floorTotal > 0 ? "" : "none";
        fTotalEl.textContent = `Floor deductions total: ${floorTotal.toFixed(2)} m²`;
    }

    // Wall-only: manual wall deducts list
    const wManualEl = document.getElementById("deduct-w-manual");
    if (wManualEl) wManualEl.innerHTML = wallDeducts.map(wallTag).join("");

    // Sync hidden inputs
    ["rm-r-deduct", "rm-w-deduct"].forEach(id => { const el = document.getElementById(id); if (el) el.value = wallTotal; });
    ["rm-r-fdeduct", "rm-f-deduct"].forEach(id => { const el = document.getElementById(id); if (el) el.value = floorTotal; });
}

function clearDeducts() {
    wallDeducts  = [];
    floorDeducts = [];
    renderDeducts();
    // close all deduct panels
    ["r","f","w"].forEach(k => {
        const p = document.getElementById("deduct-panel-"+k);
        const t = document.getElementById("deduct-toggle-"+k);
        if (p) p.classList.add("hidden");
        if (t) { const a = t.querySelector(".deduct-toggle-arrow"); if (a) a.textContent = "▸"; }
    });
}

function toggleCollapse(key) {
    const panel = document.getElementById("collapse-panel-" + key);
    const arrow = document.getElementById("collapse-arrow-" + key);
    if (!panel) return;
    const open = panel.classList.toggle("hidden") === false;
    if (arrow) arrow.textContent = open ? "▾" : "▸";
}

function openCollapse(key) {
    const panel = document.getElementById("collapse-panel-" + key);
    const arrow = document.getElementById("collapse-arrow-" + key);
    if (!panel || !panel.classList.contains("hidden")) return;
    panel.classList.remove("hidden");
    if (arrow) arrow.textContent = "▾";
}

function closeCollapse(key) {
    const panel = document.getElementById("collapse-panel-" + key);
    const arrow = document.getElementById("collapse-arrow-" + key);
    if (!panel) return;
    panel.classList.add("hidden");
    if (arrow) arrow.textContent = "▸";
}

function updateTrimBadge(key) {
    const badge = document.getElementById("trim-" + key + "-badge");
    if (!badge) return;
    const lenId   = key === "r" ? "rm-trim-lengths" : key === "f" ? "rm-f-trim-lengths" : "rm-w-trim-lengths";
    const lengths = parseInt(document.getElementById(lenId)?.value) || 0;
    badge.textContent = lengths > 0 ? `${lengths} × 2.5m` : "";
}

function readTrimCost(key) {
    const lenId   = key === "r" ? "rm-trim-lengths"   : key === "f" ? "rm-f-trim-lengths"   : "rm-w-trim-lengths";
    const priceId = key === "r" ? "rm-trim-price"     : key === "f" ? "rm-f-trim-price"     : "rm-w-trim-price";
    const lengths = parseInt(document.getElementById(lenId)?.value)   || 0;
    const price   = parseFloat(document.getElementById(priceId)?.value) || parseFloat(settings.trimPrice) || 3.50;
    return { lengths, price, cost: lengths * price };
}


function updateWallTilesBadge() {
    const badge = document.getElementById("walltiles-badge");
    if (!badge) return;
    const w = document.getElementById("rm-r-wtilew")?.value;
    const h = document.getElementById("rm-r-wtileh")?.value;
    badge.textContent = (w && h) ? `${w}×${h}mm` : "";
}


function toggleDeductPanel(key) {
    const panel  = document.getElementById("deduct-panel-" + key);
    const toggle = document.getElementById("deduct-toggle-" + key);
    if (!panel) return;
    const open = panel.classList.toggle("hidden") === false;
    const arrow = toggle?.querySelector(".deduct-toggle-arrow");
    if (arrow) arrow.textContent = open ? "▾" : "▸";
}

function openDeductPanel(key) {
    const panel  = document.getElementById("deduct-panel-" + key);
    const toggle = document.getElementById("deduct-toggle-" + key);
    if (!panel || !panel.classList.contains("hidden")) return;
    panel.classList.remove("hidden");
    const arrow = toggle?.querySelector(".deduct-toggle-arrow");
    if (arrow) arrow.textContent = "▾";
}

/* ─── SEALANT COST (with markup) for a room or form-state object ─── */
function calcSealantCost(roomOrForm) {
    const seal = calcSealantRoom(roomOrForm);
    if (!seal || seal.tubes === 0) return 0;
    const base = seal.tubes * (parseFloat(settings.siliconePrice) || 0);
    return base * (1 + (parseFloat(settings.markup) || 0) / 100);
}

/* Build a minimal room-like object from the current sealant form fields */
function readSealantFromForm() {
    if (currentSurfType !== "room") return null; // sealant only on full-room mode
    return {
        sealantEnabled:   (document.getElementById("rm-sealant-enabled")?.value || "true") !== "false",
        sealantFloorPerim: document.getElementById("rm-sealant-floorperim")?.checked !== false,
        sealantCorners:   parseInt(document.getElementById("rm-sealant-corners")?.value)   || 0,
        length: parseFloat(document.getElementById("rm-r-length")?.value) || 0,
        width:  parseFloat(document.getElementById("rm-r-width")?.value)  || 0,
        height: parseFloat(document.getElementById("rm-r-height")?.value) || 0,
    };
}

/* ─── LIVE CALCULATION ─── */
function rmCalc() {
    updatePrepPriceBadges();
    const surfaces = buildSurfaces();
    const ct = document.getElementById("rm-customer-tiles")?.checked || false;

    // Update wastage notes
    ["f","w"].forEach(p => {
        const note = document.getElementById(`rm-${p}-wastage-note`);
        if (!note) return;
        const areaEl = p === "f"
            ? (parseFloat(document.getElementById("rm-f-length")?.value)||0) * (parseFloat(document.getElementById("rm-f-width")?.value)||0)
            : (parseFloat(document.getElementById("rm-w-width")?.value)||0) * (parseFloat(document.getElementById("rm-w-height")?.value)||0);
        const wastePct = parseFloat(document.getElementById(`rm-${p}-wastage`)?.value) || 0;
        const extra = areaEl * (wastePct / 100);
        note.textContent = areaEl > 0 ? `+${extra.toFixed(2)} m² extra tiles ordered` : "";
    });

    if (!surfaces) {
        document.getElementById("rm-total").textContent = "0.00";
        document.getElementById("rm-breakdown").innerHTML = "";
        ["rm-r-clips-row","rm-f-clips-row"].forEach(id => {
            const el = document.getElementById(id);
            if (el) { el.classList.add("hidden"); const cb = el.querySelector("input[type=checkbox]"); if (cb) cb.checked = false; }
        });
        return;
    }

    // Show clips option only when floor tile max dim ≥ 300mm
    const floorSurfs = surfaces.filter(s => s.type === "floor");
    const showClips = floorSurfs.some(s => Math.max(s.tileW || 0, s.tileH || 0) >= 300);
    ["rm-r-clips-row","rm-f-clips-row"].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.toggle("hidden", !showClips);
        if (!showClips) {
            const cb = el?.querySelector("input[type=checkbox]");
            if (cb) cb.checked = false;
        }
    });
    updateExtraClipsVisibility(surfaces);

    const totalArea = surfaces.reduce((a, s) => a + s.area, 0);
    let labourOpts = null;
    if (currentLabourType === "day") {
        const days    = parseFloat(document.getElementById("rm-days").value) || 0;
        const dayRate = parseFloat(document.getElementById("rm-dayrate").value) || settings.dayRate || 200;
        labourOpts = { type:"day", days, dayRate, totalArea };
    }

    const tileTypeVal = document.getElementById("rm-tile-type")?.value || "ceramic";
    surfaces.forEach(s => { s.tileType = tileTypeVal; calcSurface(s, ct, labourOpts); });

    const extraCostId = currentSurfType === "floor" ? "rm-f-extra-cost"
                      : currentSurfType === "wall"  ? "rm-w-extra-cost"
                      :                               "rm-extra-cost";
    const extraCost  = parseFloat(document.getElementById(extraCostId)?.value) || 0;
    const trimKey    = currentSurfType === "floor" ? "f" : currentSurfType === "wall" ? "w" : "r";
    const trimData   = readTrimCost(trimKey);
    const trimCost   = trimData.cost;
    const trimLengthsLive = trimData.lengths;
    const sealForm   = readSealantFromForm();
    const sealCost   = sealForm ? calcSealantCost(sealForm) : 0;
    const sealTubes  = sealForm ? calcSealantRoom(sealForm).tubes : 0;
    const total = surfaces.reduce((a, s) => a + parseFloat(s.total), 0) + extraCost + trimCost + sealCost;
    const mats  = surfaces.reduce((a, s) => a + (s.materialSell || 0), 0);
    const lab   = surfaces.reduce((a, s) => a + (s.labour || 0), 0);
    const ufh   = surfaces.reduce((a, s) => a + (s.ufhCost || 0), 0);
    const prep  = surfaces.reduce((a, s) => a + (s.prepCost || 0), 0);

    document.getElementById("rm-total").textContent = total.toFixed(2);

    const wallM2  = surfaces.filter(s => s.type === "wall").reduce((a, s) => a + (s.area || 0), 0);
    const floorM2 = surfaces.filter(s => s.type === "floor").reduce((a, s) => a + (s.area || 0), 0);
    const areaParts = [];
    if (wallM2  > 0) areaParts.push(`🧱 ${wallM2.toFixed(2)} m²`);
    if (floorM2 > 0) areaParts.push(`⬜ ${floorM2.toFixed(2)} m²`);
    const areaEl = document.getElementById("rm-area");
    if (areaEl) areaEl.textContent = areaParts.join("  ");
    // Aggregate bag/board quantities across all surfaces
    const totalAdhKg      = surfaces.reduce((a, s) => a + (s.adhKg       || 0), 0);
    const totalAdhBags    = Math.ceil(totalAdhKg / 20);
    const totalRapidKg    = surfaces.reduce((a, s) => a + (s.rapidAdhKg  || 0), 0);
    const totalRapidBags  = Math.ceil(totalRapidKg / 20);
    const totalGroutKg    = surfaces.reduce((a, s) => a + (s.groutKg     || 0), 0);
    const totalGroutBags  = Math.ceil(totalGroutKg / (parseFloat(settings.groutBagSize) || 2.5));
    const totalCBBoards   = surfaces.reduce((a, s) => a + (s.cementBoards|| 0), 0);
    const totalLevelBags  = surfaces.reduce((a, s) => a + (s.levelBags   || 0), 0);
    const totalClips      = surfaces.reduce((a, s) => a + (s.clips ? (s.levelClips  || 0) : 0), 0);
    const totalWedges     = surfaces.reduce((a, s) => a + (s.clips ? (s.levelWedges || 0) : 0), 0);
    const totalClipCost   = surfaces.reduce((a, s) => a + (s.clipCost    || 0), 0);

    const parts = [];
    const tileTypeVal2 = document.getElementById("rm-tile-type")?.value || "ceramic";
    const tileTypeMult2 = (settings.tileRates || {})[tileTypeVal2] || 1.0;
    const tileTypeDisplay = TILE_TYPE_LABELS[tileTypeVal2] || tileTypeVal2;
    parts.push(`${tileTypeDisplay}${tileTypeMult2 !== 1.0 ? ` (${tileTypeMult2}×)` : ""}`);

    // Show tiles ordered with wastage breakdown per surface type
    surfaces.forEach(s => {
        const wasteDefault = s.type === "wall" ? 12 : 10;
        const wastePct     = (s.wastage !== undefined) ? parseFloat(s.wastage) : wasteDefault;
        const baseArea     = s.area;
        const totalArea2   = +(baseArea * (1 + wastePct / 100)).toFixed(2);
        const extraArea    = +(baseArea * (wastePct / 100)).toFixed(2);
        const icon         = s.type === "wall" ? "🧱" : "⬜";
        if (baseArea > 0) parts.push(`${icon} ${totalArea2}m² tiles (${baseArea.toFixed(2)}m² + ${extraArea}m² ${wastePct}% wastage)`);
    });
    if (mats > 0) parts.push(`Materials £${mats.toFixed(2)}`);
    if (lab  > 0) {
        const labLabel = currentLabourType === "day"
            ? `Labour £${lab.toFixed(2)} (${document.getElementById("rm-days").value||0} days)`
            : `Labour £${lab.toFixed(2)}`;
        parts.push(labLabel);
    }
    if (ufh  > 0) parts.push(`UFH £${ufh.toFixed(2)}`);
    if (totalAdhBags   > 0) parts.push(`Adhesive: ${totalAdhBags} × 20kg bag${totalAdhBags !== 1 ? "s" : ""}`);
    if (totalRapidBags > 0) parts.push(`Rapid Set: ${totalRapidBags} × 20kg bag${totalRapidBags !== 1 ? "s" : ""}`);
    if (totalGroutBags > 0) parts.push(`Grout: ${totalGroutBags} × ${(parseFloat(settings.groutBagSize)||2.5)}kg bag${totalGroutBags !== 1 ? "s" : ""}`);
    if (totalCBBoards  > 0) parts.push(`Cement Board: ${totalCBBoards} board${totalCBBoards !== 1 ? "s" : ""}`);
    if (totalLevelBags > 0) parts.push(`Levelling: ${totalLevelBags} × 20kg bag${totalLevelBags !== 1 ? "s" : ""}`);
    if (totalClips > 0) parts.push(`Clips: ${totalClips} / Wedges: ${totalWedges}${totalClipCost > 0 ? ` £${totalClipCost.toFixed(2)}` : ""}`);

    // Stone install & sealer — show individually so they're clearly visible
    const stoneInstallCost = surfaces.reduce((a, s) => a + (s.stoneInstallCost || 0), 0);
    const stoneSealerCost  = surfaces.reduce((a, s) => a + (s.stoneSealerCost  || 0), 0);
    if (stoneInstallCost > 0) parts.push(`🪨 Stone Install £${stoneInstallCost.toFixed(2)}`);
    if (stoneSealerCost  > 0) parts.push(`🪨 Stone Sealer £${stoneSealerCost.toFixed(2)}`);

    const otherPrep = prep - stoneInstallCost - stoneSealerCost;
    if (otherPrep > 0 && totalCBBoards === 0 && totalLevelBags === 0) parts.push(`Prep £${otherPrep.toFixed(2)}`);
    if (sealTubes  > 0) parts.push(`Sealant: ${sealTubes} tube${sealTubes !== 1 ? "s" : ""} £${sealCost.toFixed(2)}`);
    if (trimCost   > 0) parts.push(`Trim: ${trimLengthsLive} length${trimLengthsLive !== 1 ? "s" : ""} £${trimCost.toFixed(2)}`);
    if (extraCost  > 0) parts.push(`Extra work £${extraCost.toFixed(2)}`);
    document.getElementById("rm-breakdown").innerHTML =
        parts.map(p => `<span class="breakdown-item">${p}</span>`).join(" · ");
}

/* ─── SAVE ROOM ─── */
function saveRoom() {
    const name = document.getElementById("rm-name").value.trim();
    if (!name) { alert("Please enter a room name."); return; }

    const surfaces = buildSurfaces();
    if (!surfaces) { alert("Please fill in the measurements."); return; }

    const ct       = document.getElementById("rm-customer-tiles").checked;
    const totalArea = surfaces.reduce((a, s) => a + s.area, 0);

    let labourOpts = null;
    let days = 0, dayRate = settings.dayRate || 200;
    if (currentLabourType === "day") {
        days    = parseFloat(document.getElementById("rm-days").value) || 0;
        dayRate = parseFloat(document.getElementById("rm-dayrate").value) || settings.dayRate || 200;
        labourOpts = { type:"day", days, dayRate, totalArea };
    }

    const tileType = document.getElementById("rm-tile-type").value || "ceramic";
    surfaces.forEach(s => { s.tileType = tileType; calcSurface(s, ct, labourOpts); });

    const extraDescId = currentSurfType === "floor" ? "rm-f-extra-desc"
                      : currentSurfType === "wall"  ? "rm-w-extra-desc"
                      :                               "rm-extra-desc";
    const extraCostId2 = currentSurfType === "floor" ? "rm-f-extra-cost"
                       : currentSurfType === "wall"  ? "rm-w-extra-cost"
                       :                               "rm-extra-cost";
    const extraWorkDesc = (document.getElementById(extraDescId)?.value || "").trim();
    const extraWorkCost = parseFloat(document.getElementById(extraCostId2)?.value) || 0;
    const trimKey2  = currentSurfType === "floor" ? "f" : currentSurfType === "wall" ? "w" : "r";
    const trimData  = readTrimCost(trimKey2);
    const trimLengths = trimData.lengths;
    const trimCostSave = trimData.cost;

    const area       = parseFloat(totalArea.toFixed(2));
    const sealantEnabled = (document.getElementById("rm-sealant-enabled")?.value || "true") !== "false";
    const sealantFloorPerim = document.getElementById("rm-sealant-floorperim")?.checked !== false;
    const sealantCorners   = parseInt(document.getElementById("rm-sealant-corners")?.value) || 0;

    const roomLen = parseFloat(document.getElementById("rm-r-length")?.value) || 0;
    const roomWid = parseFloat(document.getElementById("rm-r-width")?.value)  || 0;
    const roomHei = parseFloat(document.getElementById("rm-r-height")?.value) || 0;

    // Compute sealant cost now so it flows into room.total
    const sealFormObj = currentSurfType === "room" ? {
        sealantEnabled, sealantFloorPerim, sealantCorners,
        length: roomLen, width: roomWid, height: roomHei
    } : null;
    const roomSealCost = sealFormObj ? calcSealantCost(sealFormObj) : 0;

    const total = surfaces.reduce((a, s) => a + parseFloat(s.total), 0) + extraWorkCost + trimCostSave + roomSealCost;

    const floorCount = surfaces.filter(s => s.type === "floor").length;
    const wallCount  = surfaces.filter(s => s.type === "wall").length;
    const type = floorCount && wallCount ? "floor + walls" : wallCount ? "wall" : "floor";

    const room = {
        name,
        length: roomLen || undefined,
        width:  roomWid || undefined,
        height: roomHei || undefined,
        sealantEnabled,
        sealantFloorPerim,
        sealantCorners,
        extraWorkDesc: extraWorkDesc || undefined,
        extraWorkCost: extraWorkCost || 0,
        trimLengths:   trimLengths  || undefined,
        trimCost:      trimCostSave || 0,
        wallDeducts: wallDeducts.slice(),
        floorDeducts: floorDeducts.slice(),
        savedType:   currentSurfType,
        labourType:  currentLabourType,
        days:        currentLabourType === "day" ? days : undefined,
        dayRate:     currentLabourType === "day" ? dayRate : undefined,
        tileType:    document.getElementById("rm-tile-type").value || "ceramic",
        type,
        tileSupply:  ct ? "customer" : "contractor",
        surfaces,
        area,
        total:       total.toFixed(2),
        ufh:         surfaces.some(s => s.ufh),
        tiles:       surfaces.reduce((a, s) => a + (s.tiles || 0), 0),
        adhBags:     Math.ceil(surfaces.reduce((a, s) => a + (s.adhKg || 0), 0) / 20),
        groutKg:     parseFloat(surfaces.reduce((a, s) => a + (s.groutKg || 0), 0).toFixed(1))
    };

    const j = getJob();
    if (currentRoomIdx === null) { j.rooms.push(room); }
    else                         { j.rooms[currentRoomIdx] = room; }

    saveAll();
    renderJobView();
    goJob();
}

/* ================================================================
   SETTINGS
================================================================ */
function settingsTab(tab) {
    ["profile","materials","pricing"].forEach(t => {
        const panel = document.getElementById(`stab-panel-${t}`);
        const btn   = document.getElementById(`stab-${t}`);
        if (!panel || !btn) return;
        const active = t === tab;
        if (active) {
            panel.classList.remove("hidden-panel");
            panel.style.display = "block";
        } else {
            panel.classList.add("hidden-panel");
            panel.style.display = "none";
        }
        btn.style.color        = active ? "#f59e0b" : "var(--text-muted)";
        btn.style.borderBottom = active ? "2px solid #f59e0b" : "2px solid transparent";
    });
    // Reset scroll to top when switching tabs
    const screen = document.getElementById("screen-settings");
    if (screen) {
        screen.scrollTop = 0;
        screen.scrollTo(0, 0);
    }
}

/* ═══════════════════════════════════════════════════════════════
   FULL DATA EXPORT
═══════════════════════════════════════════════════════════════ */
async function exportAllData() {
    const btn = document.querySelector('[onclick="exportAllData()"]');
    if (btn) { btn.textContent = "⏳"; btn.disabled = true; }

    try {
        const now     = new Date().toLocaleDateString("en-GB").replace(/\//g, "-");
        const csvRows = [];

        // Header row
        csvRows.push([
            "Customer Name", "Phone", "Email",
            "Address", "City", "Postcode",
            "Job Status", "Job Description",
            "Quote Ref", "Quote Status", "Quote Sent", "Quote Responded",
            "Rooms", "Total Area (m²)",
            "Materials (£)", "Labour (£)", "Prep (£)",
            "Subtotal (£)", "VAT (£)", "Grand Total (£)",
            "Start Date", "End Date", "Notes"
        ]);

        jobs.forEach(j => {
            const rooms   = j.rooms || [];
            const area    = rooms.reduce((a, r) => a + (r.surfaces || []).reduce((b, s) => b + (s.area || 0), 0), 0);
            let totalMats = 0, totalLab = 0, totalPrep = 0;

            rooms.forEach(room => {
                const surfaces = room.surfaces || [];
                const ct = room.tileSupply === "customer";
                const rArea = surfaces.reduce((a, s) => a + (s.area || 0), 0);
                let labOpts = null;
                if (room.labourType === "day") labOpts = { type:"day", days: room.days||1, dayRate: room.dayRate||settings.dayRate||200, totalArea: rArea };
                surfaces.forEach(s => { s.tileType = s.tileType || room.tileType || "ceramic"; calcSurface(s, ct, labOpts); });
                totalMats  += surfaces.reduce((a, s) => a + (s.materialSell || 0), 0);
                totalLab   += surfaces.reduce((a, s) => a + (s.labour || 0) + (s.ufhCost || 0), 0);
                totalPrep  += surfaces.reduce((a, s) => a + (s.prepCost || 0), 0);
            });

            const subtotal = totalMats + totalLab + totalPrep;
            const vat      = (settings.applyVat !== false) ? subtotal * 0.2 : 0;
            const grand    = subtotal + vat;

            const fmtDate = d => d ? new Date(d).toLocaleDateString("en-GB") : "";

            csvRows.push([
                j.customerName || "",
                j.phone        || "",
                j.email        || "",
                j.address      || "",
                j.city         || "",
                j.postcode     || "",
                j.status       || "",
                j.description  || "",
                j.quoteToken   ? (currentQuoteRef || j.quoteToken.slice(0,8).toUpperCase()) : "",
                j.quoteStatus  || (j.quoteToken ? "pending" : ""),
                fmtDate(j.quoteSentAt),
                fmtDate(j.quoteRespondedAt),
                rooms.length,
                area.toFixed(2),
                totalMats.toFixed(2),
                totalLab.toFixed(2),
                totalPrep.toFixed(2),
                subtotal.toFixed(2),
                vat.toFixed(2),
                grand.toFixed(2),
                fmtDate(j.jobStartDate),
                fmtDate(j.jobEndDate),
                j.notes || ""
            ]);
        });

        // Convert to CSV string
        const csv         = csvRows.map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
        const csvContent  = "\uFEFF" + csv;
        const fileName    = `TileIQ-Export-${now}.csv`;

        const { Filesystem, Share } = window.Capacitor?.Plugins || {};
        if (Filesystem && Share) {
            // Native Android — write to cache then share
            const encoded = btoa(unescape(encodeURIComponent(csvContent)));
            await Filesystem.writeFile({ path: fileName, data: encoded, directory: "CACHE" });
            const { uri } = await Filesystem.getUri({ path: fileName, directory: "CACHE" });
            await Share.share({ title: "TileIQ Export", files: [uri], dialogTitle: "Export Data" });
        } else {
            // Web fallback
            const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8" });
            const url  = URL.createObjectURL(blob);
            const a    = document.createElement("a");
            a.href = url; a.download = fileName;
            document.body.appendChild(a); a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }

    } catch(e) {
        alert("Export failed: " + e.message);
    } finally {
        if (btn) { btn.textContent = "📤"; btn.disabled = false; }
    }
}

/* ═══════════════════════════════════════════════════════════════
   HELP / AI ASSISTANT
═══════════════════════════════════════════════════════════════ */
const HELP_SYSTEM_PROMPT = `You are TileIQ Pro's in-app assistant. TileIQ Pro is a native Android app for professional tilers in the UK. You help users understand how to use the app.

Key features of TileIQ Pro:
- Jobs: Create and manage tiling jobs with customer details (name, address, phone, email)
- Rooms: Add rooms/areas to each job. Supports Full Room, Floor Only, or Wall Only modes
- Calculations: Calculates tiles, adhesive, grout, cement board, membranes, levelling, silicone, clips/wedges, trims
- Wastage: Configurable wastage % per surface (default 10% floor, 12% wall)
- Tile Types: Ceramic, Porcelain, Natural Stone, Modular, Herringbone, Mosaic — each with a labour rate multiplier
- Labour: Price by m² rate or day rate
- Materials: Cost breakdown including prep work (cement board, membrane, levelling, tanking, primer, stone sealer)
- Quotes: Professional PDF quotes with company branding. Send by email (with PDF attached) or share sheet
- Quote acceptance: Customers get a link to accept/decline quotes online. Status syncs back to the app
- FreeAgent: Export accepted quotes as invoices to FreeAgent accounting
- Calendar: Schedule jobs and email calendar invites to customers (.ics files)
- Photos: Capture before/after job photos
- Settings: Three tabs — Profile (company details, VAT number, terms), Materials (costs), Pricing (labour rates, markup, tile type multipliers)
- Offline: Works offline, syncs when back online. Offline badge shows in header
- Password reset: Uses 6-digit code sent by email (no magic links)
- Address finder: Type address for suggestions, or tap GPS button 📍 to auto-fill from location

Answer questions clearly and concisely. If asked how to do something, give step-by-step instructions. Keep answers brief — this is a mobile app assistant. Use bullet points where helpful. Don't mention features that don't exist.`;

let helpHistory = [];

function goPrivacy(from) {
    window._legalFrom = from || "settings";
    show("screen-privacy");
}

function openPrivacyWeb() {
    const url = "https://tileiq.com/privacy";
    try { window.open(url, "_system"); } catch(e) { window.location.href = url; }
}

function goTerms(from) {
    window._legalFrom = from || "settings";
    show("screen-privacy");
    setTimeout(() => {
        const el = document.getElementById("screen-privacy");
        const terms = el ? el.querySelector(".terms-anchor") : null;
        if (terms) terms.scrollIntoView({ behavior: "smooth" });
    }, 100);
}

function openTermsWeb() {
    const url = "https://tileiq.com/terms";
    try { window.open(url, "_system"); } catch(e) { window.location.href = url; }
}

function goBack() {
    const from = window._legalFrom || "settings";
    if (from === "signup") {
        show("screen-signup");
    } else {
        goSettings();
    }
}

function goHelp() {
    show("screen-help");
    document.getElementById("help-input")?.focus();
}

function helpAsk(question) {
    document.getElementById("help-input").value = question;
    helpSend();
}

async function helpSend() {
    const input = document.getElementById("help-input");
    const text  = (input?.value || "").trim();
    if (!text) return;

    input.value = "";
    input.style.height = "auto";

    // Add user message
    helpAddMsg(text, "user");
    helpHistory.push({ role: "user", content: text });

    // Hide suggestions after first message
    document.getElementById("help-suggestions").style.display = "none";

    // Typing indicator
    const typingId = "help-typing-" + Date.now();
    const messagesEl = document.getElementById("help-messages");
    const typingEl = document.createElement("div");
    typingEl.id = typingId;
    typingEl.className = "help-msg help-msg-bot";
    typingEl.innerHTML = `<div class="help-msg-bubble help-typing"><span></span><span></span><span></span></div>`;
    messagesEl.appendChild(typingEl);
    messagesEl.scrollTop = messagesEl.scrollHeight;

    // Disable send button
    const btn = document.getElementById("help-send-btn");
    if (btn) { btn.disabled = true; btn.style.opacity = "0.5"; }

    try {
        const res = await fetch(AI_PROXY_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                action:   "help",
                system:   HELP_SYSTEM_PROMPT,
                messages: helpHistory
            })
        });
        const data = await res.json();
        const reply = data.text || data.content?.[0]?.text || "Sorry, I couldn't get a response. Please try again.";

        typingEl.remove();
        helpAddMsg(reply, "bot");
        helpHistory.push({ role: "assistant", content: reply });

        // Keep history to last 10 exchanges
        if (helpHistory.length > 20) helpHistory = helpHistory.slice(-20);

    } catch(e) {
        typingEl.remove();
        helpAddMsg("Network error — please check your connection and try again.", "bot");
    } finally {
        if (btn) { btn.disabled = false; btn.style.opacity = "1"; }
    }
}

function helpAddMsg(text, role) {
    const messagesEl = document.getElementById("help-messages");
    if (!messagesEl) return;
    const div = document.createElement("div");
    div.className = `help-msg help-msg-${role}`;
    div.innerHTML = `<div class="help-msg-bubble">${text.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\n/g,"<br>").replace(/\*\*(.+?)\*\*/g,"<strong>$1</strong>")}</div>`;
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
}



/* ─── DEVICE CALENDAR AUTO-ADD ────────────────────────────────── */
function autoAddToDeviceCalendar(j) {
    if (!j?.jobStartDate) return;
    try {
        const ics = buildICS(j);
        const b64 = safeBase64(ics);
        const { Filesystem, FileOpener } = window.Capacitor?.Plugins || {};
        if (!Filesystem) return;
        const fname = "tileiq-job-" + (j.id || Date.now()) + ".ics";
        Filesystem.writeFile({
            path: fname,
            data: b64,
            directory: "CACHE"
        }).then(res => {
            if (FileOpener) {
                FileOpener.open({ filePath: res.uri, contentType: "text/calendar" }).catch(() => {});
            }
        }).catch(() => {});
    } catch(e) { console.warn("autoAddToDeviceCalendar:", e.message); }
}
/* ─── END DEVICE CALENDAR AUTO-ADD ────────────────────────────── */

/* ─── JOB REMINDER BANNERS ─────────────────────────────────────── */
const REMINDER_KEY = "tileiq-reminders-shown";

function checkJobReminders() {
    try {
        const todayStr    = toDateStr(new Date());
        const tomorrowStr = toDateStr(new Date(Date.now() + 86400000));
        const shownRaw    = localStorage.getItem(REMINDER_KEY);
        const shown       = shownRaw ? JSON.parse(shownRaw) : {};

        // Clean up entries older than 2 days
        Object.keys(shown).forEach(k => { if (k < todayStr) delete shown[k]; });

        const reminders = [];

        jobs.forEach(j => {
            if (!j.jobStartDate || j.jobArchived) return;
            const start = j.jobStartDate.split("T")[0];
            const name  = j.customerName || "Job";
            const type  = j.jobType ? ` – ${j.jobType}` : "";

            if (start === tomorrowStr && !shown[`tomorrow-${j.id}`]) {
                reminders.push({ key: `tomorrow-${j.id}`, title: "📅 Tomorrow", body: `${name}${type}`, jobId: j.id, delay: 0 });
                shown[`tomorrow-${j.id}`] = todayStr;
            }
            if (start === todayStr && !shown[`today-${j.id}`]) {
                reminders.push({ key: `today-${j.id}`, title: "🔨 Starting today", body: `${name}${type}`, jobId: j.id, delay: 500 });
                shown[`today-${j.id}`] = todayStr;
            }
        });

        localStorage.setItem(REMINDER_KEY, JSON.stringify(shown));

        reminders.forEach((r, i) => {
            setTimeout(() => showPushBanner(r.title, r.body, { jobId: r.jobId }), r.delay + i * 3500);
        });
    } catch(e) { console.warn("checkJobReminders:", e.message); }
}
/* ─── END JOB REMINDER BANNERS ─────────────────────────────────── */

/* ─── CALENDAR ─────────────────────────────────────────────────── */
let calYear  = new Date().getFullYear();
let calMonth = new Date().getMonth(); // 0-indexed
let calSelectedDate = null; // "YYYY-MM-DD"

function goCalendar() {
    show("screen-calendar");
    renderCalendar();
}

function calToday() {
    const now = new Date();
    calYear  = now.getFullYear();
    calMonth = now.getMonth();
    calSelectedDate = toDateStr(now);
    renderCalendar();
}

function calPrevMonth() {
    calMonth--;
    if (calMonth < 0) { calMonth = 11; calYear--; }
    calSelectedDate = null;
    renderCalendar();
}

function calNextMonth() {
    calMonth++;
    if (calMonth > 11) { calMonth = 0; calYear++; }
    calSelectedDate = null;
    renderCalendar();
}

function toDateStr(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth()+1).padStart(2,"0");
    const day = String(d.getDate()).padStart(2,"0");
    return `${y}-${m}-${day}`;
}

function getJobsForDate(dateStr) {
    return jobs.filter(j => {
        if (!j.jobStartDate) return false;
        const start = j.jobStartDate.split("T")[0];
        const end   = (j.jobEndDate || j.jobStartDate).split("T")[0];
        return dateStr >= start && dateStr <= end;
    });
}

function renderCalendar() {
    const MONTHS = ["January","February","March","April","May","June",
                    "July","August","September","October","November","December"];
    document.getElementById("cal-month-label").textContent = `${MONTHS[calMonth]} ${calYear}`;

    const grid = document.getElementById("cal-grid");
    grid.innerHTML = "";

    // First day of month — Monday=0 offset
    const firstDay = new Date(calYear, calMonth, 1);
    let offset = firstDay.getDay(); // 0=Sun
    offset = offset === 0 ? 6 : offset - 1; // convert to Mon=0

    const daysInMonth = new Date(calYear, calMonth+1, 0).getDate();
    const todayStr = toDateStr(new Date());

    // Blanks
    for (let i = 0; i < offset; i++) {
        grid.insertAdjacentHTML("beforeend", `<div></div>`);
    }

    for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${calYear}-${String(calMonth+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
        const dayJobs = getJobsForDate(dateStr);
        const isToday    = dateStr === todayStr;
        const isSelected = dateStr === calSelectedDate;
        const hasJobs    = dayJobs.length > 0;

        // Day-of-week for weekend colouring (Mon=0, Sat=5, Sun=6)
        const dow = (offset + d - 1) % 7;
        const isWeekend = dow >= 5;

        const bg      = isSelected ? "#f59e0b" : isToday ? "#1e3a5f" : "transparent";
        const color   = isSelected ? "#0f172a" : isWeekend ? "#94a3b8" : "var(--text-primary)";
        const border  = isToday && !isSelected ? "1px solid #f59e0b" : "1px solid transparent";
        const radius  = "8px";

        // Dot colours for first 3 jobs
        const dots = dayJobs.slice(0,3).map(j => {
            const cfg = {
                enquiry:"#93c5fd",surveyed:"#a5b4fc",quoted:"#7dd3fc",
                accepted:"#6ee7b7",scheduled:"#fcd34d",in_progress:"#fde68a",complete:"#86efac"
            };
            return `<span style="width:5px;height:5px;border-radius:50%;background:${cfg[j.status]||"#64748b"};display:inline-block;"></span>`;
        }).join("");

        grid.insertAdjacentHTML("beforeend", `
            <div onclick="calSelectDay('${dateStr}')" style="
                background:${bg};border:${border};border-radius:${radius};
                padding:4px 2px;min-height:48px;cursor:pointer;text-align:center;
                display:flex;flex-direction:column;align-items:center;gap:2px;
            ">
                <span style="font-size:13px;font-weight:${isToday||isSelected?700:500};color:${color};line-height:1.4;">${d}</span>
                <div style="display:flex;gap:2px;flex-wrap:wrap;justify-content:center;">${dots}</div>
            </div>
        `);
    }

    // Show jobs for selected date or empty state
    if (calSelectedDate) {
        renderCalDayPanel(calSelectedDate);
    } else {
        document.getElementById("cal-day-label").textContent = "Tap a day to see jobs";
        document.getElementById("cal-day-jobs").innerHTML = "";
    }
}

function calSelectDay(dateStr) {
    calSelectedDate = dateStr;
    renderCalendar();
}

function renderCalDayPanel(dateStr) {
    const d = new Date(dateStr + "T00:00:00");
    const DAYS  = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
    const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const label = `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
    document.getElementById("cal-day-label").textContent = label;

    const dayJobs = getJobsForDate(dateStr);
    const container = document.getElementById("cal-day-jobs");

    if (!dayJobs.length) {
        container.innerHTML = `<p style="color:#64748b;font-size:14px;text-align:center;margin-top:20px;">No jobs scheduled</p>`;
        return;
    }

    container.innerHTML = dayJobs.map(j => {
        const name      = j.customerName || "No customer";
        const type      = j.jobType || "";
        const start     = j.jobStartDate ? j.jobStartDate.split("T")[0] : "";
        const end       = j.jobEndDate   ? j.jobEndDate.split("T")[0]   : start;
        const dateRange = start === end ? start : `${start} → ${end}`;
        const addr      = [j.address, j.city, j.postcode].filter(Boolean).join(", ");
        const phone     = j.phone  || "";
        const email     = j.email  || "";
        const notes     = j.notes  || "";

        // Count working days
        let dayCount = "";
        if (start && end) {
            let s = new Date(start), e = new Date(end), days = 0;
            while (s <= e) { const dow = s.getDay(); if (dow !== 0 && dow !== 6) days++; s.setDate(s.getDate()+1); }
            dayCount = days > 0 ? `${days} working day${days !== 1 ? "s" : ""}` : "";
        }

        return `
        <div onclick="openJobFromCal('${j.id}')" style="
            background:#1e293b;border-radius:12px;padding:14px 16px;margin-bottom:10px;
            cursor:pointer;border-left:3px solid #f59e0b;
        ">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:10px;">
                <div style="font-weight:700;font-size:16px;color:var(--text-primary);">${name}</div>
                ${statusBadge(j.status)}
            </div>
            ${type ? `<div style="font-size:13px;color:#94a3b8;margin-bottom:6px;">🪣 ${type}</div>` : ""}
            ${addr ? `<div style="font-size:12px;color:#94a3b8;margin-bottom:4px;">📍 ${addr}</div>` : ""}
            ${phone ? `<div style="font-size:12px;color:#94a3b8;margin-bottom:4px;">📞 ${phone}</div>` : ""}
            ${email ? `<div style="font-size:12px;color:#94a3b8;margin-bottom:4px;">✉️ ${email}</div>` : ""}
            ${dateRange ? `<div style="font-size:12px;color:#64748b;margin-bottom:2px;">📅 ${dateRange}${dayCount ? ` · ${dayCount}` : ""}</div>` : ""}
            ${notes ? `<div style="font-size:12px;color:#64748b;margin-top:6px;padding-top:6px;border-top:1px solid #334155;font-style:italic;">${notes}</div>` : ""}
            <div style="text-align:right;margin-top:8px;font-size:11px;color:#f59e0b;font-weight:600;">Tap to open job →</div>
        </div>`;
    }).join("");
}

function openJobFromCal(jobId) {
    goJob(jobId);
}
/* ─── END CALENDAR ─────────────────────────────────────────────── */


function goSettings() {
    settingsTab("profile"); // always open on profile tab
    const s = settings;
    document.getElementById("set-tile-price").value     = s.tilePrice;
    document.getElementById("set-grout-price-25").value  = s.groutPrice25 || 4.50;
    document.getElementById("set-grout-price-5").value   = s.groutPrice5  || 7.50;
    document.getElementById("set-grout-bag-size").value  = s.groutBagSize || 2.5;
    document.getElementById("set-adhesive-price").value = s.adhesivePrice;
    document.getElementById("set-rapid-adh-price").value = s.rapidAdhPrice || 28;
    document.getElementById("set-silicone-price").value = s.siliconePrice || 6.50;
    document.getElementById("set-silicone-coverage").value = s.siliconeCoverage || 6;
    document.getElementById("set-markup").value         = s.markup;
    document.getElementById("set-labour-markup").value  = s.labourMarkup ? "true" : "false";
    document.getElementById("set-labour-m2").value      = s.labourM2;
    document.getElementById("set-day-rate").value       = s.dayRate;
    // Tile type rate multipliers
    const tr = s.tileRates || {};
    document.getElementById("set-rate-ceramic").value       = tr.ceramic       || 1.0;
    document.getElementById("set-rate-porcelain").value     = tr.porcelain     || 1.2;
    document.getElementById("set-rate-natural_stone").value = tr.natural_stone || 1.5;
    document.getElementById("set-rate-modular").value       = tr.modular       || 1.3;
    document.getElementById("set-rate-herringbone").value   = tr.herringbone   || 1.4;
    document.getElementById("set-rate-mosaic").value        = tr.mosaic        || 1.6;
    document.getElementById("set-ufh-m2").value         = s.ufhM2Rate   || 52;
    document.getElementById("set-ufh-fixed").value      = s.ufhFixedCost || 180;
    document.getElementById("set-cementboard").value    = s.cementBoard  || 18;
    document.getElementById("set-cb-labour").value      = s.cbLabour     || 6;
    document.getElementById("set-cb-adh").value         = s.cbAdhKgM2    || 4;
    document.getElementById("set-membrane").value       = s.membrane     || 8;
    document.getElementById("set-mem-labour").value     = s.memLabour    || 3;
    document.getElementById("set-mem-adh").value        = s.memAdhKgM2   || 3;
    document.getElementById("set-level2").value         = s.level2       || 5;
    document.getElementById("set-level3").value         = s.level3       || 7;
    document.getElementById("set-level4").value         = s.level4       || 9;
    if (document.getElementById("set-compound-bag-price"))  document.getElementById("set-compound-bag-price").value  = s.compoundBagPrice  || 12;
    if (document.getElementById("set-compound-coverage"))   document.getElementById("set-compound-coverage").value   = s.compoundCoverage   || 3;
    document.getElementById("set-tanking").value        = s.tanking      || 15;
    document.getElementById("set-clip-price").value     = s.clipPrice    || 12;
    document.getElementById("set-wedge-price").value    = s.wedgePrice   || 8;
    document.getElementById("set-trim-price").value     = s.trimPrice      || 3.50;
    document.getElementById("set-primer-price").value   = s.primerPrice    || 3.50;
    document.getElementById("set-stone-surcharge").value= s.stoneSurcharge || 8.00;
    document.getElementById("set-sealer-price").value   = s.sealerPrice    || 5.00;
    document.getElementById("set-sealer-coverage").value = s.sealerCoverageM2    || 4;
    document.getElementById("set-sealer-bottle").value   = s.sealerBottleLitres  || 1;
    document.getElementById("set-sealer-coats").value    = s.sealerCoats         || 2;
    document.getElementById("set-vat").value            = s.applyVat !== false ? "true" : "false";
    document.getElementById("set-company-name").value   = s.companyName    || "";
    if (document.getElementById("set-voicemail-name")) document.getElementById("set-voicemail-name").value = s.voicemailName || "";
    if (document.getElementById("set-twilio-number")) document.getElementById("set-twilio-number").value = s.twilioNumber || "";
    const addrEl = document.getElementById("set-company-address");
    if (addrEl) addrEl.value = s.companyAddress || "";
    document.getElementById("set-company-phone").value  = s.companyPhone || "";
    document.getElementById("set-company-email").value  = s.companyEmail || "";
    document.getElementById("set-vat-number").value     = s.vatNumber    || "";
    document.getElementById("set-terms").value          = s.terms || "";
    document.getElementById("set-reminder-days").value  = s.quoteReminderDays ?? 3;
    const docTypeEl = document.getElementById("set-doc-type");
    if (docTypeEl) docTypeEl.value = s.docType || "quote";
    document.getElementById("set-bank-name")?.setAttribute("value", s.bankName || "");
    if (document.getElementById("set-bank-name")) document.getElementById("set-bank-name").value = s.bankName || "";
    if (document.getElementById("set-bank-account-name")) document.getElementById("set-bank-account-name").value = s.bankAccountName || "";
    if (document.getElementById("set-bank-sort-code")) document.getElementById("set-bank-sort-code").value = s.bankSortCode || "";
    if (document.getElementById("set-bank-account-number")) document.getElementById("set-bank-account-number").value = s.bankAccountNumber || "";
    if (document.getElementById("set-bank-reference")) document.getElementById("set-bank-reference").value = s.bankReference || "";
    const acctEl = document.getElementById("set-accounting-software");
    if (acctEl) acctEl.value = s.accountingSoftware || "none";
    show("screen-settings");
    setTimeout(initDomainVerifyUI, 100);
    // Re-run after RevenueCat has had time to load Pro status
    setTimeout(initDomainVerifyUI, 3000);
}

function saveSettings() {
    settings = {
        tilePrice:     parseFloat(document.getElementById("set-tile-price").value)     || 25.00,
        groutPrice25:  parseFloat(document.getElementById("set-grout-price-25").value)  || 4.50,
        groutPrice5:   parseFloat(document.getElementById("set-grout-price-5").value)   || 7.50,
        groutBagSize:  parseFloat(document.getElementById("set-grout-bag-size").value)  || 2.5,
        adhesivePrice: parseFloat(document.getElementById("set-adhesive-price").value) || 22,
        rapidAdhPrice: parseFloat(document.getElementById("set-rapid-adh-price").value) || 28,
        siliconePrice: parseFloat(document.getElementById("set-silicone-price").value) || 6.50,
        siliconeCoverage: parseFloat(document.getElementById("set-silicone-coverage").value) || 6,
        markup:        parseFloat(document.getElementById("set-markup").value)         || 20,
        labourMarkup:  document.getElementById("set-labour-markup").value === "true",
        labourM2:      parseFloat(document.getElementById("set-labour-m2").value)      || 32,
        labourM2Wall:  35,
        labourM2Floor: 28,
        dayRate:       parseFloat(document.getElementById("set-day-rate").value)       || 200,
        tileRates: {
            ceramic:       parseFloat(document.getElementById("set-rate-ceramic").value)       || 1.0,
            porcelain:     parseFloat(document.getElementById("set-rate-porcelain").value)     || 1.2,
            natural_stone: parseFloat(document.getElementById("set-rate-natural_stone").value) || 1.5,
            modular:       parseFloat(document.getElementById("set-rate-modular").value)       || 1.3,
            herringbone:   parseFloat(document.getElementById("set-rate-herringbone").value)   || 1.4,
            mosaic:        parseFloat(document.getElementById("set-rate-mosaic").value)        || 1.6
        },
        ufhM2Rate:     parseFloat(document.getElementById("set-ufh-m2").value)         || 52,
        ufhFixedCost:  parseFloat(document.getElementById("set-ufh-fixed").value)      || 180,
        cementBoard:   parseFloat(document.getElementById("set-cementboard").value)    || 18,
        cbLabour:      parseFloat(document.getElementById("set-cb-labour").value)      || 6,
        cbAdhKgM2:     parseFloat(document.getElementById("set-cb-adh").value)         || 4,
        membrane:      parseFloat(document.getElementById("set-membrane").value)       || 8,
        memLabour:     parseFloat(document.getElementById("set-mem-labour").value)     || 3,
        memAdhKgM2:    parseFloat(document.getElementById("set-mem-adh").value)        || 3,
        level2:        parseFloat(document.getElementById("set-level2").value)         || 5,
        level3:        parseFloat(document.getElementById("set-level3").value)         || 7,
        level4:        parseFloat(document.getElementById("set-level4").value)         || 9,
        compoundBagPrice:  parseFloat(document.getElementById("set-compound-bag-price")?.value) || 12,
        compoundCoverage:  parseFloat(document.getElementById("set-compound-coverage")?.value)  || 3,
        tanking:       parseFloat(document.getElementById("set-tanking").value)        || 15,
        clipPrice:     parseFloat(document.getElementById("set-clip-price").value)     || 12,
        wedgePrice:    parseFloat(document.getElementById("set-wedge-price").value)    || 8,
        trimPrice:     parseFloat(document.getElementById("set-trim-price").value)     || 3.50,
        primerPrice:   parseFloat(document.getElementById("set-primer-price").value)   || 3.50,
        stoneSurcharge:parseFloat(document.getElementById("set-stone-surcharge").value)|| 8.00,
        sealerPrice:   parseFloat(document.getElementById("set-sealer-price").value)   || 5.00,
        sealerCoverageM2:    parseFloat(document.getElementById("set-sealer-coverage").value) || 4,
        sealerBottleLitres:  parseFloat(document.getElementById("set-sealer-bottle").value)   || 1,
        sealerCoats:         parseInt(document.getElementById("set-sealer-coats").value)       || 2,
        applyVat:      document.getElementById("set-vat").value === "true",
        companyName:    document.getElementById("set-company-name").value.trim(),
        voicemailName:  (document.getElementById("set-voicemail-name")?.value || "").trim(),
        twilioNumber:   (document.getElementById("set-twilio-number")?.value || "").trim().replace(/\s/g, ""),
        mobileNumber:   (document.getElementById("set-mobile-number")?.value || "").trim().replace(/\s/g, ""),
        companyAddress: (document.getElementById("set-company-address")?.value || "").trim(),
        companyPhone:  document.getElementById("set-company-phone").value.trim(),
        companyEmail:  document.getElementById("set-company-email").value.trim(),
        vatNumber:     document.getElementById("set-vat-number").value.trim(),
        terms:         document.getElementById("set-terms").value.trim(),
        quoteReminderDays: parseInt(document.getElementById("set-reminder-days").value) || 0,
        docType:       document.getElementById("set-doc-type")?.value || "quote",
        bankName:          (document.getElementById("set-bank-name")?.value || "").trim(),
        bankAccountName:   (document.getElementById("set-bank-account-name")?.value || "").trim(),
        bankSortCode:      (document.getElementById("set-bank-sort-code")?.value || "").trim(),
        bankAccountNumber: (document.getElementById("set-bank-account-number")?.value || "").trim(),
        bankReference:     (document.getElementById("set-bank-reference")?.value || "").trim(),
        accountingSoftware: document.getElementById("set-accounting-software")?.value || "none",
        verifiedDomain:   settings.verifiedDomain   || null,
        domainStatus:     settings.domainStatus     || null,
        domainId:         settings.domainId         || null,
        domainDnsRecords: settings.domainDnsRecords || null,
    };
    if (currentUser) {
        // Save locally immediately
        saveSettingsLocal();
        // Sync to D1
        fetch(AI_PROXY_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "d1_save_settings", user_id: currentUser.id, settings })
        }).catch(e => console.error("saveSettings D1 error:", e));
        const vmName = (document.getElementById("set-voicemail-name")?.value || "").trim();
        const vmNumber = (document.getElementById("set-twilio-number")?.value || "").trim().replace(/\s/g, "");
        if ((vmName || vmNumber) && currentUser) {
            const tok = JSON.parse(localStorage.getItem("sb-lzwmqabxpxuuznhbpewm-auth-token") || "{}").access_token;
            const hdrs = { "apikey": SB_KEY, "Authorization": "Bearer " + (tok || SB_KEY), "Content-Type": "application/json" };
            fetch(SB_URL + "/rest/v1/settings?user_id=eq." + currentUser.id + "&select=data&limit=1", { headers: hdrs })
            .then(r => r.json())
            .then(rows => {
                const existing = (rows && rows[0] && rows[0].data) ? rows[0].data : {};
                const merged = Object.assign({}, existing, { voicemailName: vmName, twilioNumber: vmNumber });
                return fetch(SB_URL + "/rest/v1/settings?user_id=eq." + currentUser.id, {
                    method: "PATCH",
                    headers: Object.assign({}, hdrs, { "Prefer": "return=minimal" }),
                    body: JSON.stringify({ data: merged })
                });
            }).catch(e => console.error("voicemail settings save error:", e));
        }
    }
    goDashboard();
}

/* ================================================================
   QUOTE PREVIEW
================================================================ */
function goQuote() {
    const j = getJob();
    if (!j || !j.rooms || !j.rooms.length) {
        alert("Add at least one room before generating a quote.");
        return;
    }
    currentQuoteRef = "Q" + Date.now().toString().slice(-6);
    const vatEl = document.getElementById("q-vat");
    const expiryEl = document.getElementById("q-expiry");
    const aiBox = document.getElementById("ai-box");
    const quoteOutput = document.getElementById("quote-output");
    if (!vatEl || !expiryEl || !aiBox || !quoteOutput) {
        alert("Quote page elements are missing from the DOM.");
        return;
    }
    vatEl.value = settings.applyVat !== false ? "true" : "false";
    expiryEl.value = 30;
    aiBox.innerHTML = "";
    const ta = document.getElementById("quote-desc-edit");
    if (ta) ta.value = j.description || "";
    show("screen-quote");
    try {
        renderQuote();
    } catch (err) {
        console.error("renderQuote failed:", err);
        quoteOutput.innerHTML = `<div class="form-card"><strong>Quote preview failed to load.</strong><br><br>Error: ${err.message}</div>`;
    }
    updateAccountingSection();
    renderJobQuoteStatusBar();
    const j2 = getJob();
    if (j2?.quoteToken) setTimeout(() => fetchQuoteResponse(j2.quoteToken).then(r => { if (r && r.status !== j2.quoteStatus) { j2.quoteStatus = r.status; j2.quoteRespondedAt = r.responded_at; saveAll(); renderJobQuoteStatusBar(); renderDashboard(); } }), 500);
}

/* ─── MATERIALS BREAKDOWN ─── */
function goMaterials() {
    renderMaterials();
    show("screen-materials");
}

function renderMaterials() {
    let grandSiliconeTubes = 0, grandSiliconeMetres = 0, grandSiliconeFloor = 0;
    const j = getJob();
    const rooms = j.rooms || [];
    if (!rooms.length) {
        document.getElementById("materials-output").innerHTML = '<p style="color:#888;text-align:center;padding:24px;">No rooms added yet.</p>';
        return;
    }

    // Recalculate all surfaces fresh
    let grandTiles = 0, grandAdhKg = 0, grandRapidAdhKg = 0;
    let grandWallGroutKg = 0;
    let grandFloorGroutKg = 0;
    let grandCBBoards = 0, grandLevelBags = 0;
    let grandClips = 0, grandWedges = 0;
    let grandPrimerM2 = 0, grandSealerM2 = 0;
    let grandTrimLengths = 0;
    let hasUFH = false;

    const roomBlocks = rooms.map(room => {
        const surfaces = room.surfaces || [];
        if (!surfaces.length) return "";

        const ct        = room.tileSupply === "customer";
        const totalArea = surfaces.reduce((a, s) => a + (s.area || 0), 0);
        let labourOpts  = null;
        if (room.labourType === "day") {
            labourOpts = { type:"day", days: room.days||1, dayRate: room.dayRate||settings.dayRate||200, totalArea };
        }
        surfaces.forEach(s => { s.tileType = s.tileType || room.tileType || "ceramic"; calcSurface(s, ct, labourOpts); });

        const wallM2  = surfaces.filter(s => s.type==="wall").reduce((a,s)=>a+(s.area||0),0);
        const floorM2 = surfaces.filter(s => s.type==="floor").reduce((a,s)=>a+(s.area||0),0);

        const rows = surfaces.map(s => {
            const icon      = s.type === "floor" ? "⬜" : "🧱";
            const tileDesc  = `${s.tileW}×${s.tileH}mm`;
            const adhKg     = (s.adhKg || 0).toFixed(0);
            const wasteDefault2 = s.type === "wall" ? 12 : 10;
            const wastePct2     = (s.wastage !== undefined) ? parseFloat(s.wastage) : wasteDefault2;
            const tilesM2       = +(s.area * (1 + wastePct2 / 100)).toFixed(2);
            grandTiles         += tilesM2;
            grandAdhKg     += (s.adhKg || 0);
            grandRapidAdhKg += (s.rapidAdhKg || 0);
            if (s.type === "wall") {
                grandWallGroutKg   += s.groutKg   || 0;
            } else {
                grandFloorGroutKg   += s.groutKg   || 0;
            }
            if (s.cementBoards) grandCBBoards  += s.cementBoards;
            if (s.levelBags)    grandLevelBags += s.levelBags;
            grandClips    += s.clips ? (s.levelClips  || 0) : 0;
            grandWedges   += s.clips ? (s.levelWedges || 0) : 0;
            if (s.primer)       grandPrimerM2  += s.area || 0;
            if (s.stone && s.sealer) grandSealerM2 += s.area || 0;
            if (s.ufh)          hasUFH = true;

            const prepItems = [];
            if (s.cementBoards) prepItems.push(`${s.cementBoards} cement board${s.cementBoards!==1?"s":""}`);
            if (s.levelBags)    prepItems.push(`${s.levelBags} × 20kg levelling bag${s.levelBags!==1?"s":""}`);
            if (s.tanking)      prepItems.push("tanking applied");

            return `
            <tr class="mat-surf-row">
                <td>${icon} ${esc(s.label)}</td>
                <td style="text-align:right">${s.area.toFixed(2)} m²</td>
                <td style="text-align:right">${tilesM2} m²<br><span class="mat-sub">${tileDesc}</span></td>
                <td style="text-align:right">${s.adhBags} bag${s.adhBags!==1?"s":""}<br><span class="mat-sub">${adhKg}kg · ${s.adhCat.split(" ")[0]+' '+s.adhCat.split(" ")[1]||""}</span></td>
                <td style="text-align:right">${s.groutBags} bag${s.groutBags!==1?"s":""}</td>
                ${prepItems.length ? `<td style="text-align:right;font-size:11px;color:#666;">${prepItems.join("<br>")}</td>` : "<td></td>"}
            </tr>`;
        }).join("");

        const areaSummary = [
            wallM2  > 0 ? `🧱 ${wallM2.toFixed(2)} m²` : "",
            floorM2 > 0 ? `⬜ ${floorM2.toFixed(2)} m²` : "",
        ].filter(Boolean).join("  ·  ");

        const seal = calcSealantRoom(room);
        grandSiliconeTubes  += seal.tubes;
        grandSiliconeMetres += seal.metres;
        const sealLine = seal.tubes > 0 ? `<div style="margin-top:4px;font-size:12px;color:#555;">Sealant: <strong>${seal.tubes}</strong> tube${seal.tubes!==1?"s":""} <span style="color:#6b7280">· ${seal.metres}m</span> <span style="color:#6b7280">· Floor perimeter bead ${seal.floor}m</span></div>` : "";

        const trimLengths = room.trimLengths || 0;
        grandTrimLengths += trimLengths;
        const trimLine = trimLengths > 0
            ? `<div style="margin-top:4px;font-size:12px;color:#555;">Tile Trim: <strong>${trimLengths}</strong> length${trimLengths!==1?"s":""} <span style="color:#6b7280">· ${(trimLengths * 2.5).toFixed(1)}m (@ 2.5m each)</span></div>`
            : "";

        const roomSealerM2 = surfaces.reduce((a, s) => a + (s.stone && s.sealer ? (s.area || 0) : 0), 0);
        const sealerLine = (() => {
            if (roomSealerM2 <= 0) return "";
            const coats    = settings.sealerCoats        || 2;
            const coverage = settings.sealerCoverageM2   || 4;
            const bottleSz = settings.sealerBottleLitres || 1;
            const litres   = (roomSealerM2 * coats) / coverage;
            const bottles  = Math.ceil(litres / bottleSz);
            return `<div style="margin-top:4px;font-size:12px;color:#555;">🪨 Stone Sealer: <strong>${bottles}</strong> bottle${bottles!==1?"s":""} × ${bottleSz}L <span style="color:#6b7280">· ${litres.toFixed(1)}L · ${coats} coats · ${roomSealerM2.toFixed(2)}m²</span></div>`;
        })();

        return `
        <div class="mat-room-block">
            <div class="mat-room-title">${esc(room.name)} <span class="mat-room-area">${areaSummary}</span></div>
            ${sealLine}
            ${trimLine}
            ${sealerLine}
            <table class="mat-table">
                <thead>
                    <tr>
                        <th>Surface</th>
                        <th style="text-align:right">Area</th>
                        <th style="text-align:right">Tiles</th>
                        <th style="text-align:right">Adhesive<br><span style="font-weight:400;font-size:10px">20kg bags</span></th>
                        <th style="text-align:right">Grout<br><span style="font-weight:400;font-size:10px">${(parseFloat(settings.groutBagSize)||2.5)}kg bags</span></th>
                        <th style="text-align:right">Prep</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        </div>`;
    }).join("");

    // Grand totals

    // Round bags ONCE at job level (prevents 5 small surfaces becoming 5 bags)
    const grandAdhBags        = Math.ceil(grandAdhKg / 20);
    const grandRapidAdhBags   = Math.ceil(grandRapidAdhKg / 20);
    const grandWallGroutBags  = Math.ceil(grandWallGroutKg / (parseFloat(settings.groutBagSize) || 2.5));
    const grandFloorGroutBags = Math.ceil(grandFloorGroutKg / (parseFloat(settings.groutBagSize) || 2.5));

    const totalsHtml = `
    <div class="mat-totals-card">
        <div class="mat-totals-title">Job Totals</div>
        <div class="mat-totals-grid">
            <div class="mat-total-item"><span class="mat-total-label">Tiles</span><span class="mat-total-value">${grandTiles.toFixed(2)} m²</span></div>
            <div class="mat-total-item"><span class="mat-total-label">Adhesive</span><span class="mat-total-value">${grandAdhBags} × 20kg<br><span style="font-size:11px;font-weight:400;">${grandAdhKg.toFixed(0)}kg total</span></span></div>
            ${grandRapidAdhBags > 0 ? `<div class="mat-total-item"><span class="mat-total-label">Rapid Set Adhesive</span><span class="mat-total-value">${grandRapidAdhBags} × 20kg<br><span style="font-size:11px;font-weight:400;">${grandRapidAdhKg.toFixed(0)}kg total</span></span></div>` : ""}
            <div class="mat-total-item"><span class="mat-total-label">Grout</span><span class="mat-total-value">Wall: ${grandWallGroutBags} × ${(parseFloat(settings.groutBagSize)||2.5)}kg<br>Floor: ${grandFloorGroutBags} × ${(parseFloat(settings.groutBagSize)||2.5)}kg<br><span style="font-size:11px;font-weight:600;">Total: ${grandWallGroutBags + grandFloorGroutBags} bag${(grandWallGroutBags + grandFloorGroutBags)!==1?"s":""}</span></span></div>
            ${grandSiliconeTubes > 0 ? `<div class="mat-total-item"><span class="mat-total-label">Sealant</span><span class="mat-total-value">${grandSiliconeTubes} tube${grandSiliconeTubes!==1?"s":""}<br><span style="font-size:11px;font-weight:400;">${grandSiliconeMetres.toFixed(1)}m total</span><br><span style="font-size:11px;font-weight:400;">Floor perimeter bead: ${grandSiliconeFloor.toFixed(1)}m</span></span></div>` : ""}
            ${grandCBBoards  > 0 ? `<div class="mat-total-item"><span class="mat-total-label">Cement Board</span><span class="mat-total-value">${grandCBBoards} board${grandCBBoards!==1?"s":""}</span></div>` : ""}
            ${grandLevelBags > 0 ? `<div class="mat-total-item"><span class="mat-total-label">Levelling</span><span class="mat-total-value">${grandLevelBags} × 20kg bag${grandLevelBags!==1?"s":""}</span></div>` : ""}
            ${grandClips     > 0 ? `<div class="mat-total-item"><span class="mat-total-label">Levelling Clips</span><span class="mat-total-value">${grandClips}</span></div>` : ""}
            ${grandWedges    > 0 ? `<div class="mat-total-item"><span class="mat-total-label">Wedges</span><span class="mat-total-value">${grandWedges}</span></div>` : ""}
            ${grandPrimerM2  > 0 ? `<div class="mat-total-item"><span class="mat-total-label">Primer</span><span class="mat-total-value">${grandPrimerM2.toFixed(2)} m²</span></div>` : ""}
            ${grandSealerM2  > 0 ? (() => {
                const coats      = settings.sealerCoats        || 2;
                const coverage   = settings.sealerCoverageM2   || 4;
                const bottleSz   = settings.sealerBottleLitres || 1;
                const litres     = (grandSealerM2 * coats) / coverage;
                const bottles    = Math.ceil(litres / bottleSz);
                return `<div class="mat-total-item"><span class="mat-total-label">Stone Sealer</span><span class="mat-total-value">${bottles} bottle${bottles!==1?"s":""} × ${bottleSz}L<br><span style="font-size:11px;font-weight:400;">${litres.toFixed(1)}L needed · ${coats} coat${coats!==1?"s":""} · ${grandSealerM2.toFixed(2)}m²</span></span></div>`;
            })() : ""}
            ${grandTrimLengths > 0 ? `<div class="mat-total-item"><span class="mat-total-label">Tile Trim</span><span class="mat-total-value">${grandTrimLengths} length${grandTrimLengths!==1?"s":""}<br><span style="font-size:11px;font-weight:400;">${(grandTrimLengths * 2.5).toFixed(1)}m total</span></span></div>` : ""}
        </div>
    </div>`;

    document.getElementById("materials-output").innerHTML = totalsHtml + roomBlocks;
}

function renderQuote() {
    try {
    const j = getJob();
    if (!j) {
        const el = document.getElementById("quote-output");
        if (el) el.innerHTML = '<div style="padding:20px;color:red;">Error: No job selected</div>';
        return;
    }
    const applyVat = document.getElementById("q-vat").value === "true";
    const expDays  = parseInt(document.getElementById("q-expiry").value) || 30;
    const today    = new Date();
    const expiry   = new Date(today); expiry.setDate(expiry.getDate() + expDays);
    const fmt      = d => d.toLocaleDateString("en-GB", { day:"numeric", month:"long", year:"numeric" });

    const co      = settings.companyName  || "Your Tiling Company";
    const phone   = settings.companyPhone || "";
    const email   = settings.companyEmail || "";
    const quoteRef = currentQuoteRef || ("Q" + Date.now().toString().slice(-6));

    const addr = [j.address, j.city, j.postcode].filter(Boolean).join(", ");

    let totalMats = 0, totalLabour = 0, totalPrep = 0, totalExtras = 0;
    let totalAdhKg = 0,
        totalRapidAdhKg = 0,
        totalWallGroutKg = 0,
        totalFloorGroutKg = 0,
        totalCBBoards = 0, totalLevelBags = 0,
        totalClips = 0, totalWedges = 0,
        totalSiliconeTubes = 0, totalSiliconeMetres = 0, totalSiliconeFloor = 0;

    // Per-room breakdown + per-room material schedule
    const roomBreakdownRows = (j.rooms || []).map(room => {
        const surfaces = room.surfaces || [];
        if (!surfaces.length) return "";

        const ct        = room.tileSupply === "customer";
        const totalArea = surfaces.reduce((a, s) => a + (s.area || 0), 0);

        let labourOpts = null;
        if (room.labourType === "day") {
            labourOpts = { type:"day", days: room.days || 1, dayRate: room.dayRate || settings.dayRate || 200, totalArea };
        }

        // Ensure all quantities/prices are up to date
        surfaces.forEach(s => { s.tileType = s.tileType || room.tileType || "ceramic"; calcSurface(s, ct, labourOpts); });

        // Totals for overall summary
        totalMats      += surfaces.reduce((a, s) => a + (s.materialSell || 0), 0);
        totalLabour    += surfaces.reduce((a, s) => a + (s.labour || 0) + (s.ufhCost || 0), 0);
        totalPrep      += surfaces.reduce((a, s) => a + (s.prepCost || 0), 0);
        totalExtras    += parseFloat(room.extraWorkCost || 0);
        totalAdhKg        += surfaces.reduce((a, s) => a + (s.adhKg || 0), 0);
        totalRapidAdhKg   += surfaces.reduce((a, s) => a + (s.rapidAdhKg || 0), 0);
        // Split grout totals wall vs floor (kg sums; bags rounded once below)
        totalWallGroutKg   += surfaces.filter(s=>s.type==='wall').reduce((a,s)=>a+(s.groutKg||0),0);
        totalFloorGroutKg  += surfaces.filter(s=>s.type==='floor').reduce((a,s)=>a+(s.groutKg||0),0);
        totalCBBoards  += surfaces.reduce((a, s) => a + (s.cementBoards || 0), 0);
        totalLevelBags += surfaces.reduce((a, s) => a + (s.levelBags || 0), 0);
        totalClips     += surfaces.reduce((a, s) => a + (s.clips ? (s.levelClips  || 0) : 0), 0);
        totalWedges    += surfaces.reduce((a, s) => a + (s.clips ? (s.levelWedges || 0) : 0), 0);

        // Sealant (per room, perimeter-based; no wall double-counting)
        const seal = calcSealantRoom(room);
        totalSiliconeTubes  += seal.tubes;
        totalSiliconeMetres += seal.metres;
        totalSiliconeFloor  += (seal.floor || 0);

        // Per-room quantities
        const adhKg      = surfaces.reduce((a, s) => a + (s.adhKg || 0), 0);
        const adhBags    = Math.ceil(adhKg / 20);
        const groutKg    = surfaces.reduce((a, s) => a + (s.groutKg || 0), 0);
        const groutBags  = Math.ceil(groutKg / (parseFloat(settings.groutBagSize) || 2.5));
        const cbBoards   = surfaces.reduce((a, s) => a + (s.cementBoards || 0), 0);
        const levelBags  = surfaces.reduce((a, s) => a + (s.levelBags || 0), 0);

                const mult = 1 + (parseFloat(settings.markup) || 0) / 100;

        // Per-item sell values (kept simple: uses current unit assumptions in settings)
        const adhSell   = adhBags   * (parseFloat(settings.adhesivePrice) || 0) * mult;
        const groutSell = groutBags * (settings.groutBagSize >= 5 ? (parseFloat(settings.groutPrice5)||7.50) : (parseFloat(settings.groutPrice25)||4.50)) * mult;

        // Prep-related items use existing £/m² rates (matches current prep model)
        const cbSell = surfaces.reduce((a, s) => {
            if (s.type !== "floor" || !s.cementBoard) return a;
            const rate = parseFloat(settings.cementBoard) || 18;
            return a + (parseFloat(s.area) || 0) * rate;
        }, 0);

        const levelSell = surfaces.reduce((a, s) => {
            if (s.type !== "floor" || !s.levelling) return a;
            const depth = s.levelDepth || 2;
            const rate  = depth === 3 ? (parseFloat(settings.level3) || 7)
                        : depth === 4 ? (parseFloat(settings.level4) || 9)
                        :               (parseFloat(settings.level2) || 5);
            return a + (parseFloat(s.area) || 0) * rate;
        }, 0);

        const inlineParts = [];
if (cbBoards  > 0) inlineParts.push(`Cement board ${cbBoards} board${cbBoards !== 1 ? "s" : ""} (£${cbSell.toFixed(2)})`);
        if (levelBags > 0) inlineParts.push(`Levelling ${levelBags} bag${levelBags !== 1 ? "s" : ""} (£${levelSell.toFixed(2)})`);

        const extraDesc = (room.extraWorkDesc || "").trim();
        const extraCost = parseFloat(room.extraWorkCost || 0);
        const inline = inlineParts.length ? inlineParts.join(" · ") : "—";
const roomTotal = parseFloat(room.total || 0);
        return `
            <tr class="qt-room-header">
                <td>${esc(room.name)}<span class="qt-area-note">${totalArea.toFixed(2)}m²</span>${room.tileType ? ` <span style="font-size:10px;font-weight:600;color:var(--accent);text-transform:uppercase;margin-left:4px;">${TILE_TYPE_LABELS[room.tileType] || room.tileType}</span>` : ""}</td>
                <td style="text-align:right">£${roomTotal.toFixed(2)}</td>
            </tr>
            <tr class="qt-mat-row">
                <td class="qt-indent">Materials<span class="qt-detail">${esc(inline)}</span></td>
                <td></td>
            </tr>
            ${extraCost > 0 ? `
            <tr class="qt-mat-row">
                <td class="qt-indent">Extra work<span class="qt-detail">${esc(extraDesc || "Extra work")}</span></td>
                <td style="text-align:right">£${extraCost.toFixed(2)}</td>
            </tr>
            ` : ""}
        `;
    }).join("");

    const roomScheduleHtml = (j.rooms || []).map(room => {
        const surfaces = room.surfaces || [];
        if (!surfaces.length) return "";

        const ct        = room.tileSupply === "customer";
        const totalArea = surfaces.reduce((a, s) => a + (s.area || 0), 0);

        let labourOpts = null;
        if (room.labourType === "day") {
            labourOpts = { type:"day", days: room.days || 1, dayRate: room.dayRate || settings.dayRate || 200, totalArea };
        }

        // Surface calcs already run above in roomBreakdownRows, but run again defensively
        surfaces.forEach(s => { s.tileType = s.tileType || room.tileType || "ceramic"; calcSurface(s, ct, labourOpts); });

        const cbBoards   = surfaces.reduce((a, s) => a + (s.cementBoards || 0), 0);
        const levelBags  = surfaces.reduce((a, s) => a + (s.levelBags || 0), 0);

        // Prep-related sell values use existing £/m² rates (matches current prep model)
        const cbSell = surfaces.reduce((a, s) => {
            if (s.type !== "floor" || !s.cementBoard) return a;
            const rate = parseFloat(settings.cementBoard) || 18;
            return a + (parseFloat(s.area) || 0) * rate;
        }, 0);

        const levelSell = surfaces.reduce((a, s) => {
            if (s.type !== "floor" || !s.levelling) return a;
            const depth = s.levelDepth || 2;
            const rate  = depth === 3 ? (parseFloat(settings.level3) || 7)
                        : depth === 4 ? (parseFloat(settings.level4) || 9)
                        :               (parseFloat(settings.level2) || 5);
            return a + (parseFloat(s.area) || 0) * rate;
        }, 0);

        const lines = [];
        if (cbBoards  > 0) lines.push(`<div class="qms-row"><span>Cement Board</span><span>${cbBoards} board${cbBoards !== 1 ? "s" : ""} (0.96m² each) <span style="color:#6b7280">· £${cbSell.toFixed(2)}</span></span></div>`);
        if (levelBags > 0) lines.push(`<div class="qms-row"><span>Levelling Compound</span><span>${levelBags} × 20kg bag${levelBags !== 1 ? "s" : ""} <span style="color:#6b7280">· £${levelSell.toFixed(2)}</span></span></div>`);

        if (!lines.length) return "";

        return `
          <div style="margin-top:10px;">
            <div class="qms-title" style="margin-bottom:6px;">${esc(room.name)}</div>
            ${lines.join("")}
          </div>
        `;
    }).join("");


    
    // Whole-job adhesive & grout (kg summed across all rooms; bags rounded ONCE)
    const multJob = 1 + (parseFloat(settings.markup) || 0) / 100;

    const totalAdhBags        = Math.ceil(totalAdhKg / 20);
    const totalRapidAdhBags   = Math.ceil(totalRapidAdhKg / 20);
    const totalWallGroutBags  = Math.ceil(totalWallGroutKg / (parseFloat(settings.groutBagSize) || 2.5));
    const totalFloorGroutBags = Math.ceil(totalFloorGroutKg / (parseFloat(settings.groutBagSize) || 2.5));

    const jobAdhSell        = totalAdhBags * (parseFloat(settings.adhesivePrice) || 0) * multJob;
    const jobWallGroutSell  = totalWallGroutBags * (settings.groutBagSize >= 5 ? (parseFloat(settings.groutPrice5)||7.50) : (parseFloat(settings.groutPrice25)||4.50)) * multJob;
    const jobFloorGroutSell = totalFloorGroutBags * (settings.groutBagSize >= 5 ? (parseFloat(settings.groutPrice5)||7.50) : (parseFloat(settings.groutPrice25)||4.50)) * multJob;

    const totalGroutBags = totalWallGroutBags + totalFloorGroutBags;
    const totalGroutKg   = totalWallGroutKg   + totalFloorGroutKg;

    const jobScheduleLines = [];
    if (totalAdhBags   > 0) jobScheduleLines.push(`<div class="qms-row"><span>Tile Adhesive (whole job)</span><span>${totalAdhBags} × 20kg bag${totalAdhBags !== 1 ? "s" : ""} <span style="color:#6b7280">· £${jobAdhSell.toFixed(2)}</span></span></div>`);
    if (totalRapidAdhBags > 0) {
        const jobRapidSell = totalRapidAdhBags * (parseFloat(settings.rapidAdhPrice) || 28) * multJob;
        jobScheduleLines.push(`<div class="qms-row"><span>Rapid Set Adhesive (whole job)</span><span>${totalRapidAdhBags} × 20kg bag${totalRapidAdhBags !== 1 ? "s" : ""} <span style="color:#6b7280">· £${jobRapidSell.toFixed(2)}</span></span></div>`);
    }
        if (totalWallGroutBags > 0) jobScheduleLines.push(`<div class="qms-row"><span>Wall Grout (whole job)</span><span>${totalWallGroutBags} × ${(parseFloat(settings.groutBagSize)||2.5)}kg bag${totalWallGroutBags !== 1 ? "s" : ""} <span style="color:#6b7280">· £${jobWallGroutSell.toFixed(2)}</span></span></div>`);
    if (totalFloorGroutBags > 0) jobScheduleLines.push(`<div class="qms-row"><span>Floor Grout (whole job)</span><span>${totalFloorGroutBags} × ${(parseFloat(settings.groutBagSize)||2.5)}kg bag${totalFloorGroutBags !== 1 ? "s" : ""} <span style="color:#6b7280">· £${jobFloorGroutSell.toFixed(2)}</span></span></div>`);
    
    const jobSilBase = totalSiliconeTubes * (parseFloat(settings.siliconePrice) || 0);
    const jobSilSell = jobSilBase * (1 + (parseFloat(settings.markup) || 0) / 100);
    if (totalSiliconeTubes > 0) jobScheduleLines.push(`<div class="qms-row"><span>Sealant (whole job)</span><span>${totalSiliconeTubes} tube${totalSiliconeTubes !== 1 ? "s" : ""} <span style="color:#6b7280">· Floor perimeter bead ${totalSiliconeFloor.toFixed(1)}m</span> <span style="color:#6b7280">· £${jobSilSell.toFixed(2)}</span></span></div>`);
    if (totalClips  > 0) jobScheduleLines.push(`<div class="qms-row"><span>Levelling Clips (whole job)</span><span>${totalClips}</span></div>`);
    if (totalWedges > 0) jobScheduleLines.push(`<div class="qms-row"><span>Levelling Wedges (whole job)</span><span>${totalWedges} <span style="color:#6b7280">· 25% of clips</span></span></div>`);
    const jobScheduleHtml = jobScheduleLines.length ? `
      <div style="margin-top:10px;">
        <div class="qms-title" style="margin-bottom:6px;">Whole job</div>
        ${jobScheduleLines.join("")}
      </div>
    ` : "";

    const subtotal = totalMats + totalLabour + totalPrep + totalExtras + jobSilSell;
    const vatAmt   = applyVat ? subtotal * 0.2 : 0;
    const grand    = subtotal + vatAmt;

    document.getElementById("quote-output").innerHTML = `
    <div class="quote-doc">
        <div class="quote-header">
            <div class="quote-company">
                <div class="quote-company-name">${esc(co)}</div>
                ${phone ? `<div>${esc(phone)}</div>` : ""}
                ${email ? `<div>${esc(email)}</div>` : ""}
            </div>
            <div class="quote-meta">
                <div class="quote-ref">${settings.docType === "estimate" ? "ESTIMATE" : settings.docType === "invoice" ? "INVOICE" : "QUOTATION"} ${quoteRef}</div>
                <div>Issued: ${fmt(today)}</div>
                <div>Expires: ${fmt(expiry)}</div>
            </div>
        </div>

        <div class="quote-customer">
            <strong>${esc(j.customerName)}</strong>
            ${addr ? `<br>${esc(addr)}` : ""}
            ${j.email ? `<br>${esc(j.email)}` : ""}
        </div>

        ${j.description ? `<div class="quote-description">${esc(j.description)}</div>` : `<div class="quote-description" style="color:#64748b;font-style:italic;">No description — add one below.</div>`}

        ${roomBreakdownRows ? `
        <table class="quote-table">
            <tbody>
                ${roomBreakdownRows}
            </tbody>
        </table>` : ""}

        <table class="quote-table">
            <tbody>
                <tr><td>Materials</td><td style="text-align:right">£${totalMats.toFixed(2)}</td></tr>
                <tr><td>Labour</td><td style="text-align:right">£${totalLabour.toFixed(2)}</td></tr>
                ${totalPrep > 0 ? `<tr><td>Preparation</td><td style="text-align:right">£${totalPrep.toFixed(2)}</td></tr>` : ""}
                ${jobSilSell > 0 ? `<tr><td>Sealant (${totalSiliconeTubes} tube${totalSiliconeTubes !== 1 ? "s" : ""})</td><td style="text-align:right">£${jobSilSell.toFixed(2)}</td></tr>` : ""}
            </tbody>
        </table>

        <div class="quote-mat-schedule">
            <div class="qms-title">Materials Schedule</div>
            ${(jobScheduleHtml + roomScheduleHtml) || `<div style="color:#777;font-size:12px;">No material quantities to schedule.</div>`}
        </div>

        <div class="quote-totals">
            <div class="quote-total-row"><span>Subtotal</span><span>£${subtotal.toFixed(2)}</span></div>
            ${applyVat ? `<div class="quote-total-row"><span>VAT (20%)</span><span>£${vatAmt.toFixed(2)}</span></div>` : ""}
            <div class="quote-total-row quote-grand"><span>Total</span><span>£${grand.toFixed(2)}</span></div>
        </div>

        ${settings.terms ? `<div class="quote-terms">${esc(settings.terms)}</div>` : ""}
        ${(settings.bankAccountNumber || settings.bankSortCode) ? `
        <div class="quote-terms" style="border-top:1px solid var(--border);padding-top:12px;margin-top:12px;">
            <div style="font-weight:700;font-size:12px;color:var(--text-muted);margin-bottom:8px;letter-spacing:0.05em;">BANK DETAILS</div>
            ${settings.bankName ? `<div><strong>Bank:</strong> ${esc(settings.bankName)}</div>` : ""}
            ${settings.bankAccountName ? `<div><strong>Account Name:</strong> ${esc(settings.bankAccountName)}</div>` : ""}
            ${settings.bankSortCode ? `<div><strong>Sort Code:</strong> ${esc(settings.bankSortCode)}</div>` : ""}
            ${settings.bankAccountNumber ? `<div><strong>Account Number:</strong> ${esc(settings.bankAccountNumber)}</div>` : ""}
            ${settings.bankReference ? `<div><strong>Reference:</strong> ${esc(settings.bankReference)}</div>` : ""}
        </div>` : ""}
    </div>`;
    } catch(e) {
        const el = document.getElementById("quote-output");
        if (el) el.innerHTML = `<div style="padding:20px;color:red;font-size:13px;">Quote error: ${e.message}</div>`;
        console.error("renderQuote error:", e);
    }
}

/* ─── AI CORE ─── */

const AI_PROXY_URL = "https://damp-bread-e0f9.kevin-woodley.workers.dev";
const TILEIQ_WORKER_URL = "https://tileiq-worker.kevin-woodley.workers.dev";

/* ═══════════════════════════════════════════════════════════════
   PUSH NOTIFICATIONS (FCM via @capacitor-firebase/messaging)
═══════════════════════════════════════════════════════════════ */
async function initPushNotifications() {
    try {
        const { FirebaseMessaging } = window.Capacitor?.Plugins || {};
        if (!FirebaseMessaging) { console.warn("FirebaseMessaging plugin not found"); return; }

        // Create notification channel (Android 8+) — must exist before any notification arrives
        try {
            await FirebaseMessaging.createChannel({
                id:          "tileiq_quotes",
                name:        "TileIQ Pro Quotes",
                description: "Quote accepted, declined and viewed notifications",
                importance:  4,   // IMPORTANCE_HIGH — shows heads-up
                visibility:  1,   // VISIBILITY_PUBLIC
                sound:       "default",
                vibration:   true,
                lights:      true
            });
            console.log("Notification channel created");
        } catch(e) { console.warn("Channel creation:", e.message); }

        const { receive } = await FirebaseMessaging.requestPermissions();
        if (receive !== "granted") { console.warn("Push permission denied:", receive); return; }

        const { token } = await FirebaseMessaging.getToken({ vapidKey: "" });
        if (!token || !currentUser) { console.warn("No FCM token or user"); return; }

        console.log("FCM token obtained, saving...");

        const { error } = await sb.from("device_tokens").upsert(
            { user_id: currentUser.id, token, platform: "android", updated_at: new Date().toISOString() },
            { onConflict: "token" }
        );
        if (error) { console.error("device_tokens save error:", error.message); return; }
        console.log("FCM token saved successfully");

        // Listen for foreground notifications
        FirebaseMessaging.addListener("notificationReceived", (event) => {
            const n = event.notification;
            const title = n?.title || "TileIQ Pro";
            const body  = n?.body  || "";
            // Show in-app banner
            showPushBanner(title, body, n?.data);
        });

        // Listen for notification tap (app in background)
        FirebaseMessaging.addListener("notificationActionPerformed", (event) => {
            const data = event.notification?.data;
            if (data?.jobId) {
                currentJobId = data.jobId;
                goJob(data.jobId);
            } else {
                goDashboard();
                syncAllQuoteStatuses();
            }
        });

    } catch(e) { console.warn("Push notifications unavailable:", e.message); }
}

function showPushBanner(title, body, data) {
    const existing = document.getElementById("push-banner");
    if (existing) existing.remove();

    const banner = document.createElement("div");
    banner.id = "push-banner";
    banner.style.cssText = "position:fixed;top:env(safe-area-inset-top,0);left:0;right:0;z-index:99999;padding:12px 16px;background:#1e293b;border-bottom:2px solid #f59e0b;cursor:pointer;animation:slideDown 0.3s ease;";
    banner.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:flex-start;">
            <div style="flex:1;">
                <div style="font-weight:700;color:#f59e0b;font-size:14px;">${esc(title)}</div>
                <div style="color:#e2e8f0;font-size:13px;margin-top:2px;">${esc(body)}</div>
            </div>
            <button onclick="document.getElementById('push-banner').remove()" style="background:none;border:none;color:#64748b;font-size:18px;padding:0;margin-left:12px;cursor:pointer;">✕</button>
        </div>`;
    banner.addEventListener("click", (e) => {
        if (e.target.tagName === "BUTTON") return;
        banner.remove();
        if (data?.jobId) { currentJobId = data.jobId; goJob(data.jobId); }
        else { goDashboard(); syncAllQuoteStatuses(); }
    });
    document.body.appendChild(banner);

    // Add slide-down animation
    if (!document.getElementById("push-banner-style")) {
        const style = document.createElement("style");
        style.id = "push-banner-style";
        style.textContent = "@keyframes slideDown{from{transform:translateY(-100%)}to{transform:translateY(0)}}";
        document.head.appendChild(style);
    }

    // Auto-dismiss after 5 seconds
    setTimeout(() => banner.remove(), 5000);
}



async function callAnthropicAI(prompt) {
    if (!checkProFeature("ai")) throw new Error("AI descriptions require TileIQ Pro");
    // Get the stored session token to authenticate with the Worker
    let token = "";
    try {
        const stored = localStorage.getItem("sb-lzwmqabxpxuuznhbpewm-auth-token");
        if (stored) token = JSON.parse(stored).access_token || "";
    } catch(e) {}

    if (!token) throw new Error("Please sign in to use AI features.");

    const resp = await fetch(AI_PROXY_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + token
        },
        body: JSON.stringify({ prompt, max_tokens: 400 })
    });

    const data = await resp.json();
    if (!resp.ok) throw new Error(data?.error || "AI error " + resp.status);
    return data.text || "";
}

/* ─── Quote AI Description ─── */
async function generateAI() {
    const j     = getJob();
    const style = document.getElementById("ai-style").value;
    const box   = document.getElementById("ai-box");

    const styleGuides = {
        professional: "Write a concise, professional scope-of-works paragraph suitable for a formal quote document.",
        labour:       "Focus on the skill and craftsmanship involved: surface prep, setting out, fixing methods, grouting, finishing.",
        materials:    "Focus on the materials being used: tile specifications, adhesive type, grout, prep materials.",
        fixing:       "Describe the fixing method in detail: adhesive type, notch trowel size, back-buttering where required, joint size.",
        subfloor:     "Focus on subfloor preparation: levelling, cement board, membrane, any structural concerns.",
        sales:        "Write in a friendly, reassuring tone for a homeowner — avoid jargon, emphasise quality and tidiness."
    };

    const roomSummary = (j.rooms || []).map(r => {
        const tileType = TILE_TYPE_LABELS[r.tileType] || r.tileType || "Ceramic";
        const surfaces = (r.surfaces || []).map(s =>
            `${s.label} (${s.area.toFixed(2)}m², ${s.tileW}×${s.tileH}mm ${tileType.toLowerCase()} tile)`
        ).join(", ");
        return `${r.name}: ${surfaces}`;
    }).join("\n");

    const prompt = `You are writing a description for a professional tiling quote.
Customer: ${j.customerName || "Customer"}${j.address ? `\nAddress: ${j.address}${j.city ? ", " + j.city : ""}` : ""}
Rooms:\n${roomSummary}

${styleGuides[style] || styleGuides.professional}
Write 2–4 sentences. No bullet points. Do not mention prices.
IMPORTANT: Always refer to the tile type correctly as given (e.g. porcelain, natural stone, mosaic) — never just say "ceramic tiles" unless the tile type is actually ceramic.`;

    box.innerHTML = `<div class="ai-loading">✨ Generating…</div>`;

    try {
        const text = await callAnthropicAI(prompt);
        box.innerHTML = "";
        // Put generated text into the editable textarea
        const ta = document.getElementById("quote-desc-edit");
        if (ta) { ta.value = text; }
        const j2 = getJob();
        if (j2) { j2.description = text; saveAll(); renderQuote(); }
    } catch (e) {
        box.innerHTML = `<div class="ai-result" style="color:var(--red);">Error: ${esc(e.message)}</div>`;
    }
}

function saveQuoteDesc() {
    const j  = getJob();
    const ta = document.getElementById("quote-desc-edit");
    if (!j || !ta) return;
    j.description = ta.value;
    saveAll();
    renderQuote();
}

function clearQuoteDesc() {
    const j  = getJob();
    const ta = document.getElementById("quote-desc-edit");
    if (!j || !ta) return;
    ta.value = "";
    j.description = "";
    saveAll();
    renderQuote();
}

function copyAIText(btn) {
    const text = btn.closest(".ai-section").querySelector(".ai-result")?.textContent || "";
    navigator.clipboard.writeText(text).then(() => {
        btn.textContent = "✅ Copied";
        setTimeout(() => btn.textContent = "📋 Copy", 1800);
    });
}

function applyAIToJobDesc(btn) {
    const text = btn.closest(".ai-section").querySelector(".ai-result")?.textContent || "";
    const j = getJob();
    if (j) { j.description = text; saveAll(); }
    btn.textContent = "✅ Saved";
    setTimeout(() => btn.textContent = "📝 Save to Job Description", 1800);
}

/* ─── Job Description AI (New Job / Edit Job screens) ─── */
async function generateJobDesc(descId, nameId, addressId, cityId) {
    const nameEl = document.getElementById(nameId);
    const name   = nameEl ? nameEl.value.trim() : "";
    const addr   = document.getElementById(addressId)?.value.trim() || "";
    const city   = document.getElementById(cityId)?.value.trim()    || "";
    const descEl = document.getElementById(descId);

    // If we're on the edit screen and the job has rooms, include them
    const j = currentJobId ? getJob() : null;
    let roomHint = "";
    if (j && (j.rooms || []).length) {
        roomHint = "Rooms already logged: " + j.rooms.map(r => `${r.name} (${r.type})`).join(", ") + ".";
    }

    const prompt = `You are writing a short internal job description for a professional tiling contractor's job record.
Customer: ${name || "New customer"}${addr ? `\nAddress: ${addr}${city ? ", " + city : ""}` : ""}
${roomHint}
Write a single concise sentence (max 12 words) summarising the tiling job scope. Examples: "Kitchen floor and bathroom wall tiling.", "Full bathroom tiling including floor and walls.", "Kitchen splashback and utility room floor tiles."
Reply with only the sentence, no extra text.`;

    const origText  = descEl ? descEl.value : "";
    const origTitle = nameEl ? nameEl.closest(".form-card")?.querySelector(".btn-primary")?.textContent : "";
    if (descEl) descEl.placeholder = "✨ Generating…";

    try {
        const text = await callAnthropicAI(prompt);
        if (descEl) { descEl.value = text.replace(/^["']|["']$/g, "").trim(); descEl.placeholder = "e.g. Kitchen floor + bathroom walls"; }
    } catch (e) {
        if (descEl) descEl.placeholder = "e.g. Kitchen floor + bathroom walls";
        alert("AI error: " + e.message);
    }
}



/* ─── CSV Export ─── */
function exportCSV() {
    const j = getJob();
    const rows = [["Quote ID","Customer","Room","Surface","Type","Area (m²)","Total (ex VAT)"]];
    const qid  = "Q" + Date.now().toString().slice(-6);
    (j.rooms || []).forEach(room => {
        (room.surfaces || []).forEach(s => {
            rows.push([qid, j.customerName, room.name, s.label, s.type, s.area.toFixed(2), s.total]);
        });
    });
    const csv  = rows.map(r => r.map(v => `"${v}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type:"text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = `${j.customerName.replace(/\s+/g,"-")}-quote.csv`;
    a.click(); URL.revokeObjectURL(url);
}

/* ═══════════════════════════════════════════════════════════════
   PDF GENERATION  — shared core + download/base64 wrappers
═══════════════════════════════════════════════════════════════ */
function buildPDFDoc() {
    if (!window.jspdf || !window.jspdf.jsPDF) return null;
    const { jsPDF } = window.jspdf;
    const j = getJob();
    if (!j) return null;
    const applyVat = document.getElementById("q-vat")?.value === "true";
    let doc;
    try { doc = new jsPDF({ unit:"mm", format:"a4" }); } catch(e) { return null; }

    // ── Palette ──────────────────────────────────────────────────
    const W       = 210;
    const AMBER   = [230, 175, 46];
    const DARK    = [22, 27, 34];
    const DARK2   = [36, 42, 50];
    const SLATE   = [71, 85, 105];
    const LIGHT   = [248, 250, 252];
    const WHITE   = [255, 255, 255];
    const BORDER  = [226, 232, 240];
    const GREEN   = [16, 185, 129];

    const fmt = d => d.toLocaleDateString("en-GB");
    const today  = new Date();
    const expiry = new Date();
    expiry.setDate(today.getDate() + parseInt(document.getElementById("q-expiry")?.value || 30));
    const quoteRef = currentQuoteRef || ("Q" + Date.now().toString().slice(-6));

    // ── Full-bleed header ────────────────────────────────────────
    doc.setFillColor(...DARK);
    doc.rect(0, 0, W, settings.vatNumber ? 48 : 42, "F");

    // Amber left accent bar
    doc.setFillColor(...AMBER);
    doc.rect(0, 0, 4, 42, "F");

    // Company name
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor(...AMBER);
    doc.text(settings.companyName || "Your Tiling Company", 12, 16);

    // Company contact details
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(180, 190, 200);
    let cx = 12;
    if (settings.companyPhone) { doc.text(settings.companyPhone, cx, 24); cx += doc.getTextWidth(settings.companyPhone) + 8; }
    if (settings.companyEmail) { doc.text(settings.companyEmail, cx, 24); }
    if (settings.companyAddress) { doc.text(settings.companyAddress, 12, 30); }
    if (settings.vatNumber)    { doc.text("VAT Reg No: " + settings.vatNumber, 12, 36); }

    // QUOTATION label (right side)
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.setTextColor(...WHITE);
    doc.text((settings.docType === "estimate" ? "ESTIMATE" : settings.docType === "invoice" ? "INVOICE" : "QUOTATION"), W - 12, 16, { align:"right" });

    // Ref / dates (right side)
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...AMBER);
    doc.text(quoteRef, W - 12, 24, { align:"right" });
    doc.setTextColor(160, 170, 180);
    doc.text(`Issued: ${fmt(today)}   Expires: ${fmt(expiry)}`, W - 12, 30, { align:"right" });

    // ── Two-column info band ─────────────────────────────────────
    let y = settings.vatNumber ? 48 : 42;
    doc.setFillColor(...LIGHT);
    doc.rect(0, y, W, 28, "F");
    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.3);
    doc.line(0, y + 28, W, y + 28);

    // Bill To
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...SLATE);
    doc.text("BILL TO", 12, y + 7);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...DARK);
    doc.text(j.customerName || "", 12, y + 14);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...SLATE);
    const addr = [j.address, j.city, j.postcode].filter(Boolean).join(", ");
    if (addr) doc.text(addr, 12, y + 20);
    if (j.phone) doc.text(j.phone, 12, y + 26);

    // Right column — totals preview
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...SLATE);
    doc.text("PAYMENT DUE", W - 60, y + 7);

    // Calculate grand total for preview
    let previewTotal = 0;
    (j.rooms || []).forEach(room => {
        const surfaces = room.surfaces || [];
        const ct = room.tileSupply === "customer";
        const totalArea = surfaces.reduce((a,s) => a + (s.area||0), 0);
        let labourOpts = null;
        if (room.labourType === "day") labourOpts = { type:"day", days: room.days||1, dayRate: room.dayRate||settings.dayRate||200, totalArea };
        surfaces.forEach(s => { s.tileType = s.tileType || room.tileType || "ceramic"; calcSurface(s, ct, labourOpts); });
        previewTotal += surfaces.reduce((a,s) => a + parseFloat(s.total||0), 0);
        previewTotal += parseFloat(room.extraWorkCost||0) + calcSealantCost(room);
    });
    const grandPreview = applyVat ? previewTotal * 1.2 : previewTotal;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(...DARK);
    doc.text(`£${grandPreview.toFixed(2)}`, W - 12, y + 17, { align:"right" });
    if (applyVat) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7);
        doc.setTextColor(...SLATE);
        doc.text("inc. VAT (20%)", W - 12, y + 23, { align:"right" });
    }

    y += 32;

    // ── Description block ────────────────────────────────────────
    if (j.description) {
        doc.setFillColor(255, 251, 235);
        const descLines = doc.splitTextToSize(j.description, W - 36);
        const blockH = descLines.length * 4.5 + 8;
        doc.rect(12, y, W - 24, blockH, "F");
        doc.setDrawColor(...AMBER);
        doc.setLineWidth(1);
        doc.rect(12, y, 3, blockH, "F");
        doc.setLineWidth(0.3);
        doc.setFont("helvetica", "italic");
        doc.setFontSize(8);
        doc.setTextColor(...SLATE);
        doc.text(descLines, 18, y + 6);
        y += blockH + 6;
    }

    // ── Line items table ─────────────────────────────────────────
    y += 4;
    // Table header
    doc.setFillColor(...DARK2);
    doc.rect(12, y, W - 24, 8, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...AMBER);
    doc.text("ROOM / AREA", 16, y + 5.5);
    doc.text("M²", 130, y + 5.5, { align:"right" });
    doc.text("MATERIALS", 158, y + 5.5, { align:"right" });
    doc.text("LABOUR", 178, y + 5.5, { align:"right" });
    doc.text("TOTAL", W - 14, y + 5.5, { align:"right" });
    y += 10;

    let subtotal = 0, grandLabour = 0, grandMaterials = 0;
    let rowAlt = false;

    (j.rooms || []).forEach(room => {
        const surfaces = room.surfaces || [];
        const ct = room.tileSupply === "customer";
        const totalArea = surfaces.reduce((a,s) => a + (s.area||0), 0);
        let labourOpts = null;
        if (room.labourType === "day") labourOpts = { type:"day", days: room.days||1, dayRate: room.dayRate||settings.dayRate||200, totalArea };
        surfaces.forEach(s => { s.tileType = s.tileType || room.tileType || "ceramic"; calcSurface(s, ct, labourOpts); });

        const roomMats   = surfaces.reduce((a,s) => a + (s.materialSell||0), 0);
        const roomLabour = surfaces.reduce((a,s) => a + (s.labour||0) + (s.ufhCost||0), 0);
        const roomPrep   = surfaces.reduce((a,s) => a + (s.prepCost||0), 0);
        const extraCost  = parseFloat(room.extraWorkCost||0);
        const sealCost   = calcSealantCost(room);
        const roomTotal  = roomMats + roomLabour + roomPrep + extraCost + sealCost;

        grandMaterials += roomMats + roomPrep + sealCost;
        grandLabour    += roomLabour;
        subtotal       += roomTotal;

        // Alternating row background
        if (rowAlt) { doc.setFillColor(248, 250, 252); doc.rect(12, y - 1, W - 24, 7, "F"); }
        rowAlt = !rowAlt;

        doc.setFont("helvetica", "bold");
        doc.setFontSize(8.5);
        doc.setTextColor(...DARK);
        doc.text(room.name || "Room", 16, y + 4);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(...SLATE);
        doc.text(`${totalArea.toFixed(2)}`, 130, y + 4, { align:"right" });
        doc.text(`£${(roomMats + roomPrep + sealCost).toFixed(2)}`, 158, y + 4, { align:"right" });
        doc.text(`£${roomLabour.toFixed(2)}`, 178, y + 4, { align:"right" });
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...DARK);
        doc.text(`£${roomTotal.toFixed(2)}`, W - 14, y + 4, { align:"right" });
        y += 7;

        if (extraCost > 0) {
            doc.setFont("helvetica", "normal");
            doc.setFontSize(7.5);
            doc.setTextColor(...SLATE);
            doc.text(`  + ${room.extraWorkDesc || "Extra work"}`, 16, y + 4);
            doc.text(`£${extraCost.toFixed(2)}`, W - 14, y + 4, { align:"right" });
            y += 6;
        }
    });

    // ── Totals box ───────────────────────────────────────────────
    y += 6;
    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.4);
    doc.line(12, y, W - 12, y);
    y += 6;

    const totalsX = 130;
    const valX    = W - 14;

    const totRow = (label, val, bold = false, color = DARK) => {
        if (bold) {
            doc.setFont("helvetica", "bold");
            doc.setFontSize(9);
        } else {
            doc.setFont("helvetica", "normal");
            doc.setFontSize(8.5);
        }
        doc.setTextColor(...color);
        doc.text(label, totalsX, y);
        doc.text(val, valX, y, { align:"right" });
        y += 6;
    };

    totRow("Materials & Prep", `£${grandMaterials.toFixed(2)}`);
    totRow("Labour", `£${grandLabour.toFixed(2)}`);

    y += 1;
    doc.setDrawColor(...BORDER);
    doc.line(totalsX, y, valX, y);
    y += 5;

    totRow("Subtotal", `£${subtotal.toFixed(2)}`);
    if (applyVat) totRow("VAT (20%)", `£${(subtotal * 0.2).toFixed(2)}`);

    y += 2;
    // Grand total highlight box
    const grand = applyVat ? subtotal * 1.2 : subtotal;
    doc.setFillColor(...DARK2);
    doc.roundedRect(totalsX - 4, y - 4, valX - totalsX + 8, 10, 2, 2, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...AMBER);
    doc.text("TOTAL DUE", totalsX, y + 3);
    doc.text(`£${grand.toFixed(2)}`, valX, y + 3, { align:"right" });
    y += 14;

    // ── Terms ────────────────────────────────────────────────────
    if (settings.terms) {
        doc.setDrawColor(...BORDER);
        doc.setLineWidth(0.3);
        doc.line(12, y, W - 12, y);
        y += 5;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7);
        doc.setTextColor(...SLATE);
        doc.text("TERMS & CONDITIONS", 12, y);
        y += 4;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7);
        doc.setTextColor(150, 160, 170);
        const termLines = doc.splitTextToSize(settings.terms, W - 24);
        doc.text(termLines, 12, y);
        y += termLines.length * 3.5 + 4;
    }

    // ── Bank details ──────────────────────────────────────────────
    if (settings.bankAccountNumber || settings.bankSortCode) {
        doc.setDrawColor(...BORDER);
        doc.setLineWidth(0.3);
        doc.line(12, y, W - 12, y);
        y += 5;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7);
        doc.setTextColor(...SLATE);
        doc.text("BANK DETAILS", 12, y);
        y += 4;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(...DARK);
        const bankLines = [];
        if (settings.bankName)          bankLines.push(`Bank: ${settings.bankName}`);
        if (settings.bankAccountName)   bankLines.push(`Account Name: ${settings.bankAccountName}`);
        if (settings.bankSortCode)      bankLines.push(`Sort Code: ${settings.bankSortCode}`);
        if (settings.bankAccountNumber) bankLines.push(`Account Number: ${settings.bankAccountNumber}`);
        if (settings.bankReference)     bankLines.push(`Reference: ${settings.bankReference}`);
        bankLines.forEach(line => {
            doc.text(line, 12, y);
            y += 5;
        });
        y += 2;
    }

    // ── Footer band ──────────────────────────────────────────────
    const pageH = 297;
    doc.setFillColor(...DARK);
    doc.rect(0, pageH - 12, W, 12, "F");
    doc.setFillColor(...AMBER);
    doc.rect(0, pageH - 12, 4, 12, "F");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(140, 150, 160);
    doc.text("Thank you for your business", 12, pageH - 5);
    doc.text(`${settings.companyName || ""} · Powered by TileIQ Pro`, W - 12, pageH - 5, { align:"right" });

    const safeName = (j.customerName || "quote").replace(/[^a-z0-9]+/gi,"-").replace(/(^-|-$)/g,"");
    return { doc, safeName, customerName: j.customerName, email: j.email };
}

function downloadPDF() {
    if (!window.jspdf || !window.jspdf.jsPDF) {
        alert("PDF generator not loaded. Check your connection and refresh.");
        return;
    }
    const result = buildPDFDoc();
    if (!result) { alert("Could not generate PDF."); return; }
    try { result.doc.save(`${result.safeName}-quote.pdf`); }
    catch(e) { console.error("PDF save failed", e); alert("PDF save failed: " + e.message); }
}

function buildPDFBase64() {
    const result = buildPDFDoc();
    if (!result) return null;
    try {
        return {
            base64:       result.doc.output("datauristring").split(",")[1],
            fileName:     result.safeName + "-quote.pdf",
            customerName: result.customerName,
            email:        result.email
        };
    } catch(e) { return null; }
}


/* ─── Share via native share sheet ─── */
async function shareQuote() {
    const pdf = buildPDFBase64();
    if (!pdf) { alert("PDF generator not loaded."); return; }
    try {
        const { Filesystem, Share } = window.Capacitor?.Plugins || {};
        if (Filesystem && Share) {
            await Filesystem.writeFile({ path: pdf.fileName, data: pdf.base64, directory: "CACHE" });
            const { uri } = await Filesystem.getUri({ path: pdf.fileName, directory: "CACHE" });
            await Share.share({ title: `Quote – ${pdf.customerName}`, text: `Please find your quote attached.`, files: [uri], dialogTitle: "Share Quote" });
        } else {
            // Fallback for web/browser
            downloadPDF();
        }
    } catch(e) {
        console.error("Share failed", e);
        downloadPDF();
    }
}

/* ─── Share via WhatsApp ─── */
async function shareViaWhatsApp() {
    const j = getJob();
    const pdf = buildPDFBase64();
    if (!pdf) { alert("PDF generator not loaded."); return; }

    // Format phone number: strip spaces/dashes, convert 07xxx to +447xxx
    let phone = (j.phone || "").replace(/[\s\-\(\)]/g, "");
    if (phone.startsWith("0")) phone = "+44" + phone.slice(1);

    try {
        const { Filesystem } = window.Capacitor?.Plugins || {};
        if (Filesystem) {
            await Filesystem.writeFile({ path: pdf.fileName, data: pdf.base64, directory: "CACHE" });
            const { uri } = await Filesystem.getUri({ path: pdf.fileName, directory: "CACHE" });

            if (phone) {
                // Open WhatsApp directly to customer's number with message
                const msg = encodeURIComponent(`Hi ${j.customerName}, please find your tiling quote attached.`);
                const waUrl = `whatsapp://send?phone=${phone}&text=${msg}`;
                // Share the PDF file first, then open WhatsApp
                const { Share } = window.Capacitor?.Plugins || {};
                if (Share) {
                    await Share.share({
                        title: `Quote – ${pdf.customerName}`,
                        text: `Hi ${j.customerName}, please find your tiling quote attached.`,
                        files: [uri],
                        dialogTitle: "Send via WhatsApp"
                    });
                }
            } else {
                // No phone number — open share sheet
                const { Share } = window.Capacitor?.Plugins || {};
                if (Share) await Share.share({ title: `Quote – ${pdf.customerName}`, text: `Hi ${j.customerName}, please find your tiling quote attached.`, files: [uri], dialogTitle: "Share via WhatsApp" });
            }
        } else {
            if (phone) {
                const msg = encodeURIComponent(`Hi ${j.customerName}, please find your tiling quote attached.`);
                window.open(`https://wa.me/${phone.replace("+","")}?text=${msg}`);
            } else {
                downloadPDF();
            }
        }
    } catch(e) {
        console.error("WhatsApp share failed", e);
        // Fallback: open WhatsApp with just text if phone exists
        if (j.phone) {
            let phone = (j.phone || "").replace(/[\s\-\(\)]/g, "");
            if (phone.startsWith("0")) phone = "+44" + phone.slice(1);
            const msg = encodeURIComponent(`Hi ${j.customerName}, please find your tiling quote attached.`);
            window.open(`https://wa.me/${phone.replace("+","")}?text=${msg}`);
        }
    }
}

/* ─── Share via Email ─── */
async function shareViaEmail() {
    const j = getJob();
    const pdf = buildPDFBase64();
    if (!pdf) { alert("PDF generator not loaded."); return; }
    try {
        const { Filesystem, Share } = window.Capacitor?.Plugins || {};
        if (Filesystem && Share) {
            await Filesystem.writeFile({ path: pdf.fileName, data: pdf.base64, directory: "CACHE" });
            const { uri } = await Filesystem.getUri({ path: pdf.fileName, directory: "CACHE" });
            await Share.share({ title: `Quote – ${pdf.customerName}`, text: `Hi ${j.customerName},\n\nPlease find your tiling quote attached.\n\nKind regards,\n${settings.companyName || ""}`, files: [uri], dialogTitle: "Share via Email" });
        } else {
            // Fallback: mailto link
            const subject = encodeURIComponent(`Tiling Quote – ${j.customerName}`);
            const body = encodeURIComponent(`Hi ${j.customerName},\n\nPlease find your tiling quote attached.\n\nKind regards,\n${settings.companyName || ""}`);
            const email = j.email ? `mailto:${j.email}?subject=${subject}&body=${body}` : `mailto:?subject=${subject}&body=${body}`;
            window.open(email);
        }
    } catch(e) { console.error(e); }
}


/* ═══════════════════════════════════════════════════════════════
   ADDRESS SEARCH  (Nominatim / OpenStreetMap — free, no key)
═══════════════════════════════════════════════════════════════ */
let addrSearchTimer = null;

async function gpsAddress(prefix) {
    const btn = document.querySelector(`[onclick="gpsAddress('${prefix}')"]`);
    if (btn) { btn.textContent = "⏳"; btn.disabled = true; }

    if (!navigator.geolocation) {
        alert("Geolocation is not supported on this device.");
        if (btn) { btn.textContent = "📍"; btn.disabled = false; }
        return;
    }

    navigator.geolocation.getCurrentPosition(
        async (pos) => {
            try {
                const { latitude: lat, longitude: lon } = pos.coords;
                const r    = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&addressdetails=1`, {
                    headers: { "Accept-Language": "en-GB", "User-Agent": "TileIQ Pro/1.0 (support@tileiq.app)" }
                });
                const data = await r.json();
                const a    = data.address || {};
                const road  = a.road || a.pedestrian || a.path || "";
                const num   = a.house_number ? a.house_number + " " : "";
                const line1 = (num + road).trim();
                const city  = a.city || a.town || a.village || a.county || "";
                const pc    = a.postcode || "";
                if (line1) document.getElementById(`${prefix}-address`).value = line1;
                if (city)  document.getElementById(`${prefix}-city`).value    = city;
                if (pc)    document.getElementById(`${prefix}-postcode`).value = pc;
                if (btn) { btn.textContent = "✅"; setTimeout(() => { btn.textContent = "📍"; btn.disabled = false; }, 2000); }
            } catch(e) {
                if (btn) { btn.textContent = "📍"; btn.disabled = false; }
                alert("Could not look up address. Please enter manually.");
            }
        },
        (e) => {
            if (btn) { btn.textContent = "📍"; btn.disabled = false; }
            if (e.code === 1) alert("Location permission denied.\n\nGo to Android Settings → Apps → TileIQ Pro → Permissions → Location → Allow.");
            else if (e.code === 2) alert("Location unavailable. Make sure GPS is enabled.");
            else alert("Could not get location. Please enter the address manually.");
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
}

async function addrSearch(prefix) {
    const input = document.getElementById(prefix + "-address");
    const box   = document.getElementById(prefix + "-addr-suggestions");
    if (!input || !box) return;
    const q = input.value.trim();
    if (q.length < 4) { box.style.display = "none"; return; }
    clearTimeout(addrSearchTimer);
    addrSearchTimer = setTimeout(async () => {
        try {
            const res     = await fetch("https://nominatim.openstreetmap.org/search?q=" + encodeURIComponent(q + ", UK") + "&format=json&addressdetails=1&limit=5&countrycodes=gb", {
                headers: { "Accept-Language": "en-GB", "User-Agent": "TileIQ Pro/1.0 (support@tileiq.app)" }
            });
            const results = await res.json();
            if (!results.length) { box.style.display = "none"; return; }
            const rows = [];
            results.forEach(function(r, i) {
                const a     = r.address || {};
                const road  = a.road || a.pedestrian || a.path || "";
                const num   = a.house_number ? a.house_number + " " : "";
                const line1 = (num + road).trim() || r.display_name.split(",")[0];
                const city  = a.city || a.town || a.village || a.county || "";
                const pc    = a.postcode || "";
                const sub   = [city, pc].filter(Boolean).join(", ");
                const div   = document.createElement("div");
                div.style.cssText = "padding:12px 14px;cursor:pointer;border-bottom:1px solid #334155;font-size:14px;";
                div.innerHTML = "<div style=\"font-weight:600;color:#e2e8f0;\">" + esc(line1) + "</div>" + (sub ? "<div style=\"font-size:12px;color:#64748b;margin-top:2px;\">" + esc(sub) + "</div>" : "");
                div.addEventListener("mouseenter", function() { this.style.background = "#334155"; });
                div.addEventListener("mouseleave", function() { this.style.background = ""; });
                div.addEventListener("click",      function() { addrPick(prefix, i); });
                rows.push(div);
            });
            box.innerHTML = "";
            rows.forEach(function(d) { box.appendChild(d); });
            box._results      = results;
            box.style.display = "block";
        } catch(e) { box.style.display = "none"; }
    }, 400);
}

function addrPick(prefix, idx) {
    const box = document.getElementById(prefix + "-addr-suggestions");
    const r   = box?._results?.[idx];
    if (!r) return;
    const a     = r.address || {};
    const road  = a.road || a.pedestrian || a.path || "";
    const num   = a.house_number ? a.house_number + " " : "";
    const line1 = (num + road).trim() || r.display_name.split(",")[0];
    const city  = a.city || a.town || a.village || a.county || "";
    const pc    = a.postcode || "";
    const addrEl = document.getElementById(prefix + "-address");
    const cityEl = document.getElementById(prefix + "-city");
    const pcEl   = document.getElementById(prefix + "-postcode");
    if (addrEl) addrEl.value = line1;
    if (cityEl && city) cityEl.value = city;
    if (pcEl   && pc)   pcEl.value   = pc;
    box.style.display = "none";
}

document.addEventListener("click", function(e) {
    ["nj","ej"].forEach(function(p) {
        const box = document.getElementById(p + "-addr-suggestions");
        if (box && !box.contains(e.target) && e.target.id !== p + "-address") {
            box.style.display = "none";
        }
    });
});


/* ═══════════════════════════════════════════════════════════════
   POSTCODE LOOKUP  (postcodes.io — free, no API key)
   prefix = 'nj' (new job) or 'ej' (edit job)
═══════════════════════════════════════════════════════════════ */
async function pcLookup(prefix) {
    const raw = (document.getElementById("pc-input-" + prefix)?.value || "").trim().replace(/\s+/g, "");
    const out = document.getElementById("pc-result-" + prefix);
    if (!raw) { _pcShow(out, "err", "Please enter a postcode."); return; }

    _pcShow(out, "ok", "Looking up…");
    try {
        const res  = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(raw)}`);
        const data = await res.json();
        if (data.status !== 200 || !data.result) {
            _pcShow(out, "err", "Postcode not found. Check and try again.");
            return;
        }
        const r    = data.result;
        const town = r.admin_ward || r.parish || r.admin_district || r.region || "";
        const pc   = r.postcode || "";

        // Fill postcode; fill city only if empty
        const cityEl = document.getElementById(prefix + "-city");
        const pcEl   = document.getElementById(prefix + "-postcode");
        if (pcEl)  pcEl.value  = pc;
        if (cityEl && !cityEl.value.trim()) cityEl.value = town;

        // Format the postcode with a space if not already
        const formatted = pc;
        _pcShow(out, "ok", `✓ ${formatted} — ${r.admin_district || r.region || ""}${town ? ", " + town : ""}. Town/city filled${cityEl?.value ? "" : " — enter street address above"}.`);
    } catch(err) {
        _pcShow(out, "err", "Lookup failed — check your connection.");
    }
}

function _pcShow(el, type, msg) {
    if (!el) return;
    el.className = "pc-result pc-" + type;
    el.textContent = msg;
}

async function testNetwork() {
    const btn = document.querySelector('[onclick="testNetwork()"]');
    if (btn) btn.textContent = "Testing…";
    try {
        const r = await fetch("https://lzwmqabxpxuuznhbpewm.supabase.co/rest/v1/", {
            headers: { "apikey": "sbp_bbLOe7wwtEWJhRxXZEKuuQ_QANTrsyr" }
        });
        if (btn) btn.textContent = "✅ Network OK: " + r.status;
    } catch(e) {
        if (btn) btn.textContent = "❌ BLOCKED: " + e.message;
    }
}

/* ═══════════════════════════════════════════════════════════════
   FREEAGENT OAUTH
═══════════════════════════════════════════════════════════════ */
const FA_CLIENT_ID    = "_Ks4ewOfNFJevi4CJEBmsQ";
const FA_CLIENT_SECRET = "BIxz-Iu2cFV1ROhKhK-KhQ";
const FA_REDIRECT_URI = "https://tileiq.app/fa-callback";
const FA_AUTH_URL     = "https://api.freeagent.com/v2/approve_app";

async function freeAgentConnect() {
    const params = new URLSearchParams({ response_type: "code", client_id: FA_CLIENT_ID, redirect_uri: FA_REDIRECT_URI });
    const url    = `${FA_AUTH_URL}?${params.toString()}`;
    const { Browser } = window.Capacitor?.Plugins || {};
    if (Browser?.open) await Browser.open({ url, presentationStyle: "popover" });
    else if (window.AndroidBridge?.open) window.AndroidBridge.open(url);
    else window.open(url, "_system");
}

function getFreeAgentTokens() {
    try { return JSON.parse(localStorage.getItem("fa-tokens") || "null"); } catch(e) { return null; }
}

async function getValidFreeAgentToken() {
    const tokens = getFreeAgentTokens();
    if (!tokens) return null;
    const now = Math.floor(Date.now() / 1000);
    if (tokens.expires_at > now + 60) return tokens;
    try {
        const resp = await fetch(AI_PROXY_URL, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "fa_refresh", refresh_token: tokens.refresh_token })
        });
        const data = await resp.json();
        if (data.access_token) {
            const refreshed = { ...tokens, access_token: data.access_token, refresh_token: data.refresh_token || tokens.refresh_token, expires_at: now + (data.expires_in || 3600) };
            localStorage.setItem("fa-tokens", JSON.stringify(refreshed));
            return refreshed;
        }
    } catch(e) {}
    return tokens;
}

function updateAccountingFields() {
    // Called when settings dropdown changes — just saves preference
}

function updateAccountingSection() {
    const software = settings.accountingSoftware || "none";
    const section = document.getElementById("accounting-export-section");
    const faBtn   = document.getElementById("btn-freeagent");
    const qboBtn  = document.getElementById("btn-qbo");
    const sageBtn = document.getElementById("btn-sage");

    if (!section) return;

    if (software === "none") {
        section.style.display = "none";
        return;
    }

    section.style.display = "block";
    if (faBtn)   faBtn.style.display   = software === "freeagent"   ? "block" : "none";
    if (qboBtn)  qboBtn.style.display  = software === "quickbooks"  ? "block" : "none";
    if (sageBtn) sageBtn.style.display = software === "sage"        ? "block" : "none";

    // Update button labels based on connection status
    if (software === "freeagent")  updateFreeAgentButton();
    if (software === "quickbooks") updateQBOButton();
    if (software === "sage")       updateSageButton();
}

function updateFreeAgentButton() {
    const btn = document.getElementById("btn-freeagent");
    if (!btn) return;
    const tokens = getFreeAgentTokens();
    if (tokens) {
        btn.textContent      = "📤 Export to FreeAgent";
        btn.style.color      = "#000";
        btn.style.background = "#f59e0b";
        btn.style.borderColor = "#f59e0b";
        btn.onclick = () => exportFreeAgent();
    } else {
        btn.textContent      = "🔗 FreeAgent";
        btn.style.color      = "";
        btn.style.background = "";
        btn.style.borderColor = "";
        btn.onclick = () => freeAgentConnect();
    }
}

async function exportFreeAgent() {
    if (!checkProFeature("accounting")) return;
    const tokens = await getValidFreeAgentToken();
    if (!tokens) { freeAgentConnect(); return; }
    const j      = getJob();
    const applyVat = document.getElementById("q-vat")?.value === "true";
    const btn    = document.getElementById("btn-freeagent");
    if (btn) { btn.disabled = true; btn.textContent = "Exporting…"; }
    try {
        let totalLabour = 0, totalMaterials = 0;
        (j.rooms || []).forEach(room => {
            const ct = room.tileSupply === "customer";
            const rArea = (room.surfaces || []).reduce((a, s) => a + (s.area || 0), 0);
            let rLabOpts = null;
            if (room.labourType === "day") rLabOpts = { type: "day", days: room.days || 1, dayRate: room.dayRate || settings.dayRate || 200, totalArea: rArea };
            (room.surfaces || []).forEach(s => {
                s.tileType = s.tileType || room.tileType || "ceramic";
                calcSurface(s, ct, rLabOpts);
                totalLabour    += parseFloat(s.labour || 0) + parseFloat(s.ufhCost || 0) + parseFloat(s.prepCost || 0);
                totalMaterials += parseFloat(s.materialSell || 0);
            });
        });
        const items = [];
        if (totalLabour > 0)    items.push({ description: j.description || "Labour",  quantity: 1, price: totalLabour.toFixed(2),    vat_rate: applyVat ? 20 : 0 });
        if (totalMaterials > 0) items.push({ description: "Materials",                quantity: 1, price: totalMaterials.toFixed(2), vat_rate: applyVat ? 20 : 0 });
        const resp = await fetch(AI_PROXY_URL, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                action: "fa_push", access_token: tokens.access_token,
                contact: { name: j.customerName, email: j.email || "", phone: j.phone || "" },
                invoice: { reference: currentQuoteRef || ("Q" + Date.now().toString().slice(-6)), dated_on: new Date().toISOString().split("T")[0] },
                items
            })
        });
        const data = await resp.json();
        if (data.error) alert("FreeAgent export failed: " + data.error);
        else alert("✅ " + (data.message || "Invoice created in FreeAgent"));
    } catch(e) { alert("FreeAgent export error: " + e.message); }
    finally { if (btn) { btn.disabled = false; updateFreeAgentButton(); } }
}

/* ═══════════════════════════════════════════════════════════════
   QUICKBOOKS OAUTH
═══════════════════════════════════════════════════════════════ */
const QBO_CLIENT_ID   = "ABzC6vAWKHR2PPhthaCETo7Ah89AHNXFuBgjugNKuYfLBW7S51";
const QBO_REDIRECT_URI = "https://tileiq.app/qbo-callback";
const QBO_AUTH_URL    = "https://appcenter.intuit.com/connect/oauth2";
const QBO_SCOPES      = "com.intuit.quickbooks.accounting";

async function qboConnect() {
    const state  = btoa(JSON.stringify({ ts: Date.now() }));
    const params = new URLSearchParams({ response_type: "code", client_id: QBO_CLIENT_ID, redirect_uri: QBO_REDIRECT_URI, scope: QBO_SCOPES, state });
    const url    = `${QBO_AUTH_URL}?${params.toString()}`;
    const { Browser } = window.Capacitor?.Plugins || {};
    if (Browser?.open) await Browser.open({ url, presentationStyle: "popover" });
    else if (window.AndroidBridge?.open) window.AndroidBridge.open(url);
    else window.open(url, "_system");
}

function handleQBOCallback(url) {
    try {
        const u = new URL(url);
        const tokens = u.searchParams.get("tokens");
        if (!tokens) return;
        const data = JSON.parse(atob(decodeURIComponent(tokens)));
        localStorage.setItem("qbo-tokens", JSON.stringify({ access_token: data.access_token, refresh_token: data.refresh_token, realm_id: data.realm_id, expires_at: Math.floor(Date.now() / 1000) + (data.expires_in || 3600) }));
        alert("✅ QuickBooks connected successfully!");
        updateQBOButton();
    } catch(e) { console.error("handleQBOCallback:", e); }
}

function getQBOTokens() {
    try { return JSON.parse(localStorage.getItem("qbo-tokens") || "null"); } catch(e) { return null; }
}

async function getValidQBOToken() {
    const tokens = getQBOTokens();
    if (!tokens) return null;
    const now = Math.floor(Date.now() / 1000);
    if (tokens.expires_at > now + 60) return tokens;
    try {
        const resp = await fetch(AI_PROXY_URL, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "qbo_refresh", refresh_token: tokens.refresh_token })
        });
        const data = await resp.json();
        if (data.access_token) {
            const refreshed = { ...tokens, access_token: data.access_token, refresh_token: data.refresh_token || tokens.refresh_token, expires_at: now + (data.expires_in || 3600) };
            localStorage.setItem("qbo-tokens", JSON.stringify(refreshed));
            return refreshed;
        }
    } catch(e) {}
    return tokens;
}

function updateQBOButton() {
    const btn = document.getElementById("btn-qbo");
    if (!btn) return;
    const tokens = getQBOTokens();
    if (tokens) {
        btn.textContent      = "📤 Export to QuickBooks";
        btn.style.color      = "#fff";
        btn.style.background = "#2CA01C";
        btn.style.borderColor = "#2CA01C";
        btn.onclick = () => exportQBO();
    } else {
        btn.textContent      = "🔗 QuickBooks";
        btn.style.color      = "#2CA01C";
        btn.style.background = "";
        btn.style.borderColor = "#2CA01C";
        btn.onclick = () => qboConnect();
    }
}

async function exportQBO() {
    if (!checkProFeature("accounting")) return;
    const tokens = await getValidQBOToken();
    if (!tokens) { qboConnect(); return; }
    const j      = getJob();
    const applyVat = document.getElementById("q-vat")?.value === "true";
    const btn    = document.getElementById("btn-qbo");
    if (btn) { btn.disabled = true; btn.textContent = "Exporting…"; }
    try {
        let totalLabour = 0, totalMaterials = 0;
        (j.rooms || []).forEach(room => {
            const ct = room.tileSupply === "customer";
            const rArea = (room.surfaces || []).reduce((a, s) => a + (s.area || 0), 0);
            let rLabOpts = null;
            if (room.labourType === "day") rLabOpts = { type: "day", days: room.days || 1, dayRate: room.dayRate || settings.dayRate || 200, totalArea: rArea };
            (room.surfaces || []).forEach(s => {
                s.tileType = s.tileType || room.tileType || "ceramic";
                calcSurface(s, ct, rLabOpts);
                totalLabour    += parseFloat(s.labour || 0) + parseFloat(s.ufhCost || 0) + parseFloat(s.prepCost || 0);
                totalMaterials += parseFloat(s.materialSell || 0);
            });
        });
        const items = [];
        if (totalLabour > 0)    items.push({ description: j.description || "Labour",  quantity: 1, price: totalLabour.toFixed(2) });
        if (totalMaterials > 0) items.push({ description: "Materials",                quantity: 1, price: totalMaterials.toFixed(2) });
        const resp = await fetch(AI_PROXY_URL, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                action: "qbo_push", access_token: tokens.access_token, realm_id: tokens.realm_id,
                contact: { name: j.customerName, email: j.email || "", phone: j.phone || "" },
                invoice: { reference: currentQuoteRef || ("Q" + Date.now().toString().slice(-6)), dated_on: new Date().toISOString().split("T")[0] },
                items
            })
        });
        const data = await resp.json();
        if (data.error) alert("QuickBooks export failed: " + data.error);
        else alert("✅ " + (data.message || "Invoice created in QuickBooks"));
    } catch(e) { alert("QuickBooks export error: " + e.message); }
    finally { if (btn) { btn.disabled = false; updateQBOButton(); } }
}

/* ═══════════════════════════════════════════════════════════════
   QUOTE SENDING & STATUS
═══════════════════════════════════════════════════════════════ */

function getQuoteToken(j) {
    if (!j.quoteToken) { j.quoteToken = uid(); saveAll(); }
    return j.quoteToken;
}

function renderQuoteStatusBar() {
    const bar = document.getElementById("quote-status-bar");
    if (!bar) return;
    const j = getJob();
    if (!j) { bar.style.display = "none"; return; }
    const status = j.quoteStatus;
    const shortToken = j.quoteToken ? j.quoteToken.slice(0, 6).toUpperCase() : "";
    const linkHtml = j.quoteToken ? `
        <div style="margin-top:8px;display:flex;align-items:center;gap:8px;background:#0f172a;border-radius:6px;padding:8px 10px;">
            <span style="font-size:11px;color:#64748b;flex:1;font-weight:400;">tileiq.app/quote/${shortToken}…</span>
            <button onclick="copyQuoteLink()" style="background:#f59e0b;color:#000;border:none;border-radius:6px;padding:4px 10px;font-size:12px;font-weight:700;cursor:pointer;">Copy</button>
        </div>` : "";
    if (!status || status === "pending") {
        if (j.quoteToken) {
            bar.style.display = "block"; bar.style.background = "#1e293b"; bar.style.color = "#94a3b8";
            bar.innerHTML = `⏳ Awaiting customer response${linkHtml}`;
        } else { bar.style.display = "none"; }
    } else if (status === "accepted") {
        bar.style.display = "block"; bar.style.background = "#065f46"; bar.style.color = "#6ee7b7";
        bar.innerHTML = `✅ Quote Accepted` + (j.quoteRespondedAt ? ` · ${new Date(j.quoteRespondedAt).toLocaleDateString("en-GB")}` : "") + linkHtml;
    } else if (status === "declined") {
        bar.style.display = "block"; bar.style.background = "#7f1d1d"; bar.style.color = "#fca5a5";
        bar.innerHTML = `❌ Quote Declined` + (j.quoteRespondedAt ? ` · ${new Date(j.quoteRespondedAt).toLocaleDateString("en-GB")}` : "") + linkHtml;
    }
    if (j.quoteArchived) {
        bar.style.display = "block"; bar.style.background = "#1e293b"; bar.style.color = "#64748b";
        bar.innerHTML = `📦 Archived` + linkHtml;
    }
}

async function copyQuoteLink() {
    const j = getJob();
    if (!j || !j.quoteToken) return;
    const url = `https://tileiq.app/quote/${j.quoteToken}`;
    try { await navigator.clipboard.writeText(url); alert("Link copied!"); } catch(e) { alert(url); }
}

async function convertToInvoice() {
    const j = getJob();
    if (!j) return;

    // Confirm conversion
    if (!confirm(`Convert this quote to an invoice for ${j.customerName}?\n\nThis will generate a PDF invoice with your bank details for payment.`)) return;

    // Temporarily switch doc type to invoice
    const prevDocType = settings.docType;
    settings.docType = "invoice";

    // Check bank details
    if (!settings.bankAccountNumber && !settings.bankSortCode) {
        alert("⚠️ No bank details saved.\n\nGo to Settings → Profile → Bank Details to add your account details so customers know how to pay.");
    }

    // Generate and share PDF
    const pdf = buildPDFBase64();
    if (!pdf) { settings.docType = prevDocType; alert("Could not generate invoice PDF."); return; }

    // Show send options
    showSendInvoiceSheet(j, pdf);
    settings.docType = prevDocType;
}

function showSendInvoiceSheet(j, pdf) {
    const existing = document.getElementById("send-invoice-sheet");
    if (existing) existing.remove();

    const sheet = document.createElement("div");
    sheet.id = "send-invoice-sheet";
    sheet.style.cssText = "position:fixed;inset:0;z-index:9999;display:flex;flex-direction:column;justify-content:flex-end;";
    sheet.innerHTML = `
        <div onclick="document.getElementById('send-invoice-sheet').remove()" style="flex:1;background:rgba(0,0,0,0.5);"></div>
        <div style="background:#1e293b;border-radius:20px 20px 0 0;padding:20px;padding-bottom:calc(20px + env(safe-area-inset-bottom));">
            <div style="width:40px;height:4px;background:#334155;border-radius:2px;margin:0 auto 16px;"></div>
            <div style="font-size:16px;font-weight:700;color:#e2e8f0;margin-bottom:6px;">🧾 Invoice for ${esc(j.customerName)}</div>
            <div style="font-size:13px;color:#64748b;margin-bottom:16px;">Send the invoice PDF to your customer</div>

            <button onclick="sendInvoiceByEmail('${j.id}')" style="width:100%;background:#1e40af;color:#fff;border:none;border-radius:12px;padding:16px;font-size:15px;font-weight:700;margin-bottom:10px;display:flex;align-items:center;gap:12px;cursor:pointer;">
                <span style="font-size:22px;">✉️</span>
                <div style="text-align:left;">
                    <div>Send by Email</div>
                    <div style="font-size:12px;font-weight:400;opacity:0.8;">${j.email || "No email saved"}</div>
                </div>
            </button>
            <button onclick="sendInvoiceShare()" style="width:100%;background:#334155;color:#e2e8f0;border:none;border-radius:12px;padding:16px;font-size:15px;font-weight:700;margin-bottom:16px;display:flex;align-items:center;gap:12px;cursor:pointer;">
                <span style="font-size:22px;">📤</span>
                <div style="text-align:left;"><div>Share / Download PDF</div></div>
            </button>
            <button onclick="document.getElementById('send-invoice-sheet').remove()" style="width:100%;background:transparent;color:#64748b;border:none;padding:12px;font-size:15px;font-weight:600;cursor:pointer;">Cancel</button>
        </div>`;
    sheet._pdf = pdf;
    document.body.appendChild(sheet);
}

async function sendInvoiceByEmail(jobId) {
    const sheet = document.getElementById("send-invoice-sheet");
    const pdf   = sheet?._pdf;
    sheet?.remove();
    const j = jobs.find(x => x.id === jobId) || getJob();
    if (!j || !pdf) return;

    if (j.email) {
        try {
            const fileName = `Invoice-${(j.customerName || "Customer").replace(/[^a-z0-9]/gi, "-")}.pdf`;
            const resp = await fetch(TILEIQ_WORKER_URL, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "send_quote_email",
                    to: j.email, customerName: j.customerName, quoteUrl: "",
                    companyName: settings.companyName || "", companyPhone: settings.companyPhone || "",
                    replyTo: settings.companyEmail || currentUser?.email || "",
                    fromName: settings.companyName || "TileIQ Pro",
                    verifiedDomain: (isPro() && settings.verifiedDomain && settings.domainStatus === "verified") ? settings.verifiedDomain : null,
                    fromEmail: (isPro() && settings.verifiedDomain && settings.domainStatus === "verified" && settings.companyEmail) ? settings.companyEmail : null,
                    pdfBase64: pdf.base64, pdfFileName: fileName, isInvoice: true
                })
            });
            if (resp.ok) { alert("\u2705 Invoice sent to " + j.email); return; }
        } catch(e) { console.error(e); }
    }
    const go = confirm("Could not send automatically.\n\nThis will open your device email app \u2014 make sure you are signed in with the correct account.\n\nTap OK to open.");
    if (!go) return;
    const subject = encodeURIComponent(`Invoice \u2013 ${j.customerName}`);
    const body = encodeURIComponent(`Hi ${j.customerName},\n\nPlease find your invoice attached.\n\nKind regards,\n${settings.companyName || ""}`);
    window.open(`mailto:${j.email ? encodeURIComponent(j.email) : ""}?subject=${subject}&body=${body}`, "_system");
}

async function sendInvoiceShare() {
    const sheet = document.getElementById("send-invoice-sheet");
    const pdf   = sheet?._pdf;
    sheet?.remove();
    if (!pdf) return;

    const { Filesystem, Share } = window.Capacitor?.Plugins || {};
    if (Filesystem && Share) {
        try {
            const fileName = `Invoice-${(pdf.customerName || "Customer").replace(/[^a-z0-9]/gi, "-")}.pdf`;
            await Filesystem.writeFile({ path: fileName, data: pdf.base64, directory: "CACHE" });
            const { uri } = await Filesystem.getUri({ path: fileName, directory: "CACHE" });
            await Share.share({ title: `Invoice – ${pdf.customerName}`, text: "Please find your invoice attached.", files: [uri], dialogTitle: "Share Invoice" });
            return;
        } catch(e) { console.error(e); }
    }
    downloadPDF();
}

async function sendQuote() {
    const j = getJob();
    if (!j) return;
    getQuoteToken(j);
    const url = await buildQuoteUrl(j);
    showSendQuoteSheet(j, url);
}

function showSendQuoteSheet(j, url) {
    const existing = document.getElementById("send-quote-sheet");
    if (existing) existing.remove();

    const modal = document.createElement("div");
    modal.id = "send-quote-sheet";
    modal.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px;box-sizing:border-box;background:rgba(0,0,0,0.7);";

    const box = document.createElement("div");
    box.style.cssText = "background:#1e293b;border-radius:20px;padding:24px;width:100%;max-width:360px;";
    box.innerHTML = `
        <div style="font-size:18px;font-weight:800;color:#e2e8f0;margin-bottom:6px;">📤 Send Quote</div>
        <div style="font-size:14px;color:#64748b;margin-bottom:20px;">${esc(j.customerName)}</div>
        <button onclick="sendQuoteByEmail()" style="width:100%;background:#1e40af;color:#fff;border:none;border-radius:12px;padding:16px;font-size:15px;font-weight:700;margin-bottom:10px;display:flex;align-items:center;gap:12px;cursor:pointer;box-sizing:border-box;">
            <span style="font-size:22px;">✉️</span>
            <div style="text-align:left;"><div>Send by Email</div><div style="font-size:12px;font-weight:400;opacity:0.8;">${j.email || "No email saved"}</div></div>
        </button>
        <button onclick="sendQuoteByWhatsApp()" style="width:100%;background:#25D366;color:#fff;border:none;border-radius:12px;padding:16px;font-size:15px;font-weight:700;margin-bottom:10px;display:flex;align-items:center;gap:12px;cursor:pointer;box-sizing:border-box;">
            <span style="font-size:22px;">💬</span>
            <div style="text-align:left;"><div>Send via WhatsApp</div><div style="font-size:12px;font-weight:400;opacity:0.8;">${j.phone || "No phone saved"}</div></div>
        </button>
        <button onclick="sendQuoteShare()" style="width:100%;background:#334155;color:#e2e8f0;border:none;border-radius:12px;padding:16px;font-size:15px;font-weight:700;margin-bottom:16px;display:flex;align-items:center;gap:12px;cursor:pointer;box-sizing:border-box;">
            <span style="font-size:22px;">📤</span>
            <div style="text-align:left;"><div>Other (Share)</div><div style="font-size:12px;font-weight:400;opacity:0.8;">SMS, copy link, etc.</div></div>
        </button>
        <button onclick="document.getElementById('send-quote-sheet').remove()" style="width:100%;background:transparent;color:#64748b;border:none;padding:10px;font-size:15px;font-weight:600;cursor:pointer;">Cancel</button>`;

    modal.appendChild(box);
    modal._quoteUrl = url;
    // Lock page scroll
    const scrollY = window.scrollY;
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = '100%';

    // Restore scroll on close
    const origRemove = modal.remove.bind(modal);
    modal.remove = function() {
        document.body.style.position = '';
        document.body.style.top = '';
        document.body.style.width = '';
        window.scrollTo(0, scrollY);
        origRemove();
    };
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

    document.documentElement.appendChild(modal);
}



async function sendQuoteByEmail() {
    const sheet = document.getElementById("send-quote-sheet");
    const url   = sheet?._quoteUrl || "";
    sheet?.remove();
    const j = getJob();
    if (!j) return;

    const bodyText = `Hi ${j.customerName},\n\nPlease find your tiling quote attached.\n\nYou can view and accept your quote online here:\n${url}\n\nKind regards,\n${settings.companyName || ""}${settings.companyPhone ? "\n" + settings.companyPhone : ""}`;
    const subject  = encodeURIComponent(`Tiling Quote – ${j.customerName}`);

    if (!j.email) {
        const go = confirm("No customer email saved.\n\nThis will open your device email app — make sure you are sending from the right account.\n\nTap OK to continue.");
        if (!go) return;
        try { window.open(`mailto:?subject=${subject}&body=${encodeURIComponent(bodyText)}`, "_system"); } catch(e) {}
        _markQuoteSent(j); return;
    }

    try {
        const resp = await fetch(TILEIQ_WORKER_URL, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                action: "send_quote_email", to: j.email, customerName: j.customerName, quoteUrl: url,
                companyName: settings.companyName || "", companyPhone: settings.companyPhone || "",
                replyTo: settings.companyEmail || currentUser?.email || "",
                fromName: settings.companyName || "TileIQ Pro",
                verifiedDomain: (isPro() && settings.verifiedDomain && settings.domainStatus === "verified") ? settings.verifiedDomain : null,
                fromEmail: (isPro() && settings.verifiedDomain && settings.domainStatus === "verified" && settings.companyEmail) ? settings.companyEmail : null
            })
        });
        if (resp.ok) { _markQuoteSent(j); alert("✅ Quote sent to " + j.email); return; }
        const errData = await resp.json().catch(() => ({}));
        const errMsg = errData.error || ("HTTP " + resp.status);
        alert("❌ Failed to send: " + errMsg);
        return;
    } catch(e) {
        alert("❌ Network error: " + e.message);
        return;
    }
}

async function sendQuoteByWhatsApp() {
    const sheet = document.getElementById("send-quote-sheet");
    const url   = sheet?._quoteUrl || "";
    sheet?.remove();
    const j = getJob();
    if (!j) return;
    const text = `Hi ${j.customerName}, please view and accept your tiling quote here:\n${url}\n\nKind regards,\n${settings.companyName || ""}${settings.companyPhone ? "\n" + settings.companyPhone : ""}${settings.companyEmail ? "\n" + settings.companyEmail : ""}`;
    let phone = (j.phone || "").replace(/[\s\-\(\)]/g, "");
    if (phone.startsWith("0")) phone = "+44" + phone.slice(1);
    phone = phone.replace("+", "");
    const whatsappUrl = phone ? `whatsapp://send?phone=${phone}&text=${encodeURIComponent(text)}` : `whatsapp://send?text=${encodeURIComponent(text)}`;
    // whatsapp:// must use AndroidBridge — Browser plugin opens Chrome which can't handle it
    if (window.AndroidBridge?.open) window.AndroidBridge.open(whatsappUrl);
    else {
        const waUrl = phone ? `https://wa.me/${phone}?text=${encodeURIComponent(text)}` : `https://wa.me/?text=${encodeURIComponent(text)}`;
        const { Browser } = window.Capacitor?.Plugins || {};
        if (Browser?.open) await Browser.open({ url: waUrl });
        else window.open(waUrl, "_system");
    }
    _markQuoteSent(j);
}

async function sendQuoteShare() {
    const sheet = document.getElementById("send-quote-sheet");
    const url   = sheet?._quoteUrl || "";
    sheet?.remove();
    const j = getJob();
    if (!j) return;
    const text = `Hi ${j.customerName}, please view and accept your tiling quote here: ${url}`;
    const { Share } = window.Capacitor?.Plugins || {};
    if (Share) { try { await Share.share({ title: `Quote – ${j.customerName}`, text, dialogTitle: "Send Quote" }); _markQuoteSent(j); return; } catch(e) {} }
    try { await navigator.clipboard.writeText(url); alert("Link copied!"); } catch(e) { alert(url); }
    _markQuoteSent(j);
}

function _markQuoteSent(j) {
    if (!j.quoteStatus || j.quoteStatus === "pending") {
        j.quoteStatus = "pending";
        j.quoteSentAt = j.quoteSentAt || new Date().toISOString();
    }
    // Auto-advance pipeline to "quoted" if still at an earlier stage
    const PIPELINE = ["enquiry","surveyed","quoted","accepted","scheduled","in_progress","complete"];
    const curIdx = PIPELINE.indexOf(j.status || "enquiry");
    const quotedIdx = PIPELINE.indexOf("quoted");
    if (curIdx < quotedIdx) j.status = "quoted";
    saveAll();
    renderQuoteStatusBar();
    renderJobQuoteStatusBar();
    renderDashboard();
}

async function buildQuoteUrl(j) {
    getQuoteToken(j);
    let grand = 0, totalMats = 0, totalLabour = 0, totalPrep = 0;
    const applyVat = document.getElementById("q-vat")?.value === "true";
    (j.rooms || []).forEach(room => {
        const surfaces = room.surfaces || [];
        const rCt = room.tileSupply === "customer";
        const rArea = surfaces.reduce((a, s) => a + (s.area || 0), 0);
        let rLabOpts = null;
        if (room.labourType === "day") rLabOpts = { type: "day", days: room.days || 1, dayRate: room.dayRate || settings.dayRate || 200, totalArea: rArea };
        surfaces.forEach(s => { s.tileType = s.tileType || room.tileType || "ceramic"; calcSurface(s, rCt, rLabOpts); });
        surfaces.forEach(s => {
            totalMats   += parseFloat(s.materialSell || 0);
            totalLabour += parseFloat(s.labour || 0) + parseFloat(s.ufhCost || 0);
            totalPrep   += parseFloat(s.prepCost || 0);
            grand       += parseFloat(s.total || 0);
        });
    });
    const subtotal = totalMats + totalLabour + totalPrep;
    const vatAmt   = applyVat ? subtotal * 0.2 : 0;
    const grandTotal = subtotal + vatAmt;
    const snapshot = {
        customerName: j.customerName,
        address:      (j.address || "") + (j.city ? ", " + j.city : ""),
        description:  j.description || "",
        grand:        grandTotal.toFixed(2),
        totalMats:    totalMats.toFixed(2),
        totalLabour:  totalLabour.toFixed(2),
        totalPrep:    totalPrep > 0 ? totalPrep.toFixed(2) : null,
        subtotal:     subtotal.toFixed(2),
        vatAmt:       vatAmt > 0 ? vatAmt.toFixed(2) : null,
        applyVat,
        ref:          currentQuoteRef || j.quoteToken.slice(0, 8).toUpperCase(),
        companyName:  settings.companyName || "",
        companyPhone: settings.companyPhone || "",
        companyEmail: settings.companyEmail || "",
        terms:        settings.terms || "",
        customerEmail: j.email || "",
        phone:         j.phone || "",
        customerEmail: j.email || "",
        phone:         j.phone || ""
    };
    try {
        await sb.from("quote_snapshots").upsert(
            { token: j.quoteToken, snapshot, created_at: new Date().toISOString() },
            { onConflict: "token" }
        );
    } catch(e) { console.error("Snapshot save failed:", e); }
    return `https://tileiq.app/quote/${j.quoteToken}`;
}

async function fetchQuoteResponse(token) {
    try {
        const { data, error } = await sb.from("quote_responses")
            .select("status, responded_at, message").eq("token", token)
            .order("responded_at", { ascending: false }).limit(1).single();
        if (error || !data) return null;
        return data;
    } catch(e) { return null; }
}

function archiveQuote() {
    const j = getJob();
    if (!j) return;
    j.quoteArchived = !j.quoteArchived;
    saveAll();
    renderJobQuoteStatusBar();
    renderQuoteStatusBar();
    renderDashboard();
}

async function syncAllQuoteStatuses() {
    const pending = jobs.filter(j => j.quoteToken && (!j.quoteStatus || j.quoteStatus === "pending"));
    if (!pending.length) return;
    let changed = false;
    const PIPELINE = ["enquiry","surveyed","quoted","accepted","scheduled","in_progress","complete"];
    for (const j of pending) {
        const result = await fetchQuoteResponse(j.quoteToken);
        if (result) {
            j.quoteStatus = result.status;
            j.quoteRespondedAt = result.responded_at;
            j.quoteMessage = result.message || "";
            // Auto-advance pipeline stage
            if (result.status === "accepted") {
                const curIdx = PIPELINE.indexOf(j.status || "enquiry");
                const acceptedIdx = PIPELINE.indexOf("accepted");
                if (curIdx < acceptedIdx) j.status = "accepted";
            }
            changed = true;
        }
    }
    if (changed) { saveAll(); renderDashboard(); renderJobQuoteStatusBar(); }
}

/* ═══════════════════════════════════════════════════════════════
   SAGE ACCOUNTING OAUTH
═══════════════════════════════════════════════════════════════ */
const SAGE_CLIENT_ID     = "8b36ca1f-096b-4ec2-ae98-23b8bf1de8de";
const SAGE_CLIENT_SECRET = "AZOieXkS2/qOvjkZbXA0GqKHVrfJ6hmqI3gPVTZ8";
const SAGE_REDIRECT_URI  = "https://tileiq.app/sage-callback";
const SAGE_AUTH_URL      = "https://www.sageone.com/oauth2/auth/central?filter=apiv3.1";
const SAGE_SCOPES        = "full_access";

async function sageConnect() {
    const state  = "sage_" + Date.now();
    const params = new URLSearchParams({
        response_type: "code",
        client_id:     SAGE_CLIENT_ID,
        redirect_uri:  SAGE_REDIRECT_URI,
        scope:         SAGE_SCOPES,
        state
    });
    const url = `${SAGE_AUTH_URL}&${params.toString()}`;
    const { Browser } = window.Capacitor?.Plugins || {};
    if (Browser?.open) await Browser.open({ url, presentationStyle: "popover" });
    else if (window.AndroidBridge?.open) window.AndroidBridge.open(url);
    else window.open(url, "_system");
}

function handleSageCallback(url) {
    try {
        const u = new URL(url);
        const tokens = u.searchParams.get("tokens");
        if (!tokens) return;
        const data = JSON.parse(atob(decodeURIComponent(tokens)));
        localStorage.setItem("sage-tokens", JSON.stringify({
            access_token:  data.access_token,
            refresh_token: data.refresh_token,
            expires_at:    Math.floor(Date.now() / 1000) + (data.expires_in || 3600)
        }));
        alert("✅ Sage connected successfully!");
        updateSageButton();
    } catch(e) { console.error("handleSageCallback:", e); }
}

function getSageTokens() {
    try { return JSON.parse(localStorage.getItem("sage-tokens") || "null"); } catch(e) { return null; }
}

async function getValidSageToken() {
    const tokens = getSageTokens();
    if (!tokens) return null;
    const now = Math.floor(Date.now() / 1000);
    if (tokens.expires_at > now + 60) return tokens;
    try {
        const resp = await fetch(AI_PROXY_URL, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "sage_refresh", refresh_token: tokens.refresh_token })
        });
        const data = await resp.json();
        if (data.access_token) {
            const refreshed = { ...tokens, access_token: data.access_token, refresh_token: data.refresh_token || tokens.refresh_token, expires_at: now + (data.expires_in || 3600) };
            localStorage.setItem("sage-tokens", JSON.stringify(refreshed));
            return refreshed;
        }
    } catch(e) {}
    return tokens;
}

function updateSageButton() {
    const btn = document.getElementById("btn-sage");
    if (!btn) return;
    const tokens = getSageTokens();
    if (tokens) {
        btn.textContent      = "📤 Export to Sage";
        btn.style.color      = "#000";
        btn.style.background = "#00D639";
        btn.style.borderColor = "#00D639";
        btn.onclick = () => exportSage();
    } else {
        btn.textContent      = "🔗 Sage";
        btn.style.color      = "#00D639";
        btn.style.background = "";
        btn.style.borderColor = "#00D639";
        btn.onclick = () => sageConnect();
    }
}

async function exportSage() {
    if (!checkProFeature("accounting")) return;
    const tokens = await getValidSageToken();
    if (!tokens) { sageConnect(); return; }
    const j        = getJob();
    const applyVat = document.getElementById("q-vat")?.value === "true";
    const btn      = document.getElementById("btn-sage");
    if (btn) { btn.disabled = true; btn.textContent = "Exporting…"; }
    try {
        let totalLabour = 0, totalMaterials = 0;
        (j.rooms || []).forEach(room => {
            const ct = room.tileSupply === "customer";
            const rArea = (room.surfaces || []).reduce((a, s) => a + (s.area || 0), 0);
            let rLabOpts = null;
            if (room.labourType === "day") rLabOpts = { type: "day", days: room.days || 1, dayRate: room.dayRate || settings.dayRate || 200, totalArea: rArea };
            (room.surfaces || []).forEach(s => {
                s.tileType = s.tileType || room.tileType || "ceramic";
                calcSurface(s, ct, rLabOpts);
                totalLabour    += parseFloat(s.labour || 0) + parseFloat(s.ufhCost || 0) + parseFloat(s.prepCost || 0);
                totalMaterials += parseFloat(s.materialSell || 0);
            });
        });
        const items = [];
        if (totalLabour > 0)    items.push({ description: j.description || "Labour",  quantity: 1, price: totalLabour.toFixed(2),    vat_rate: applyVat ? 20 : 0 });
        if (totalMaterials > 0) items.push({ description: "Materials",                quantity: 1, price: totalMaterials.toFixed(2), vat_rate: applyVat ? 20 : 0 });
        const resp = await fetch(AI_PROXY_URL, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                action: "sage_push", access_token: tokens.access_token,
                contact: { name: j.customerName, email: j.email || "", phone: j.phone || "" },
                invoice: { reference: currentQuoteRef || ("Q" + Date.now().toString().slice(-6)), dated_on: new Date().toISOString().split("T")[0] },
                items
            })
        });
        const data = await resp.json();
        if (data.error) alert("Sage export failed: " + data.error);
        else alert("✅ " + (data.message || "Invoice created in Sage"));
    } catch(e) { alert("Sage export error: " + e.message); }
    finally { if (btn) { btn.disabled = false; updateSageButton(); } }
}

/* ═══════════════════════════════════════════════════════════════
   REVENUECAT — REST API (no native SDK needed)
═══════════════════════════════════════════════════════════════ */
const FREE_JOB_LIMIT = 3;

let _proStatus    = null;
let _rcAppUserId  = null;

async function initRevenueCat() {
    try {
        const stored = localStorage.getItem("sb-lzwmqabxpxuuznhbpewm-auth-token");
        const userId = stored ? JSON.parse(stored).user?.id : null;
        if (!userId) return;
        _rcAppUserId = userId;
        await refreshProStatus();
    } catch(e) { console.warn("RC init failed:", e.message); }
}

async function refreshProStatus() {
    try {
        // Check access code first
        if (checkAccessCodePro()) { _proStatus = true; updateProBadge(); return true; }
        if (!_rcAppUserId) { _proStatus = false; updateProBadge(); return false; }
        const resp = await fetch(AI_PROXY_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "rc_check", user_id: _rcAppUserId })
        });
        if (!resp.ok) { _proStatus = false; updateProBadge(); return false; }
        const data = await resp.json();
        _proStatus = !!data.pro;
        updateProBadge();
        return _proStatus;
    } catch(e) {
        console.warn("RC status check failed:", e.message);
        _proStatus = false;
        updateProBadge();
        return false;
    }
}

function isPro() {
    if (window._demoIsPro) return true; return _proStatus === true || checkAccessCodePro(); }

function updateProBadge() {
    // Also refresh the home screen tier badge whenever Pro status changes
    if (document.getElementById("home-tier-badge")) renderHomeScreen();
    const btn = document.getElementById("pro-badge-btn");
    if (!btn) return;
    if (_proStatus === false) {
        btn.style.display    = "inline-block";
        btn.textContent      = "⬆ Upgrade";
        btn.style.background = "#f59e0b";
        btn.style.cursor     = "pointer";
        btn.onclick = () => showPaywall("home");
    } else if (_proStatus === true) {
        btn.style.display    = "inline-block";
        btn.textContent      = "✓ PRO";
        btn.style.background = "#10b981";
        btn.style.cursor     = "default";
        btn.onclick = null;
    }
}

async function showPaywall(source) {
    show("screen-paywall");
    await loadPaywallPackages();
}

function closePaywall() {
    const homeHidden = document.getElementById("screen-home")?.classList.contains("hidden");
    show(homeHidden ? "screen-dashboard" : "screen-home");
}

// DEV OVERRIDE — tap version text 5 times to unlock Pro for testing
let _devTapCount = 0;
/* ── ACCESS CODES ────────────────────────────────────────────── */
// Add/remove codes here — keep these secret!
const ACCESS_CODES = [
    'TILEIQ2026',    // General launch code
    'PROTIILER',     // Pro tiler code
    'EARLYBIRD',     // Early access
    'KEVIN2026',     // Owner code
];

function redeemAccessCode() {
    const input = document.getElementById('access-code-input');
    const msg   = document.getElementById('access-code-msg');
    if (!input || !msg) return;

    const code = input.value.trim().toUpperCase();
    if (!code) { msg.style.color = '#ef4444'; msg.textContent = 'Please enter a code.'; return; }

    // Check if already used
    const uid = currentUser?.id || 'anon';
    const usedCodes = JSON.parse(localStorage.getItem(`tileiq_used_codes_${uid}`) || '[]');
    if (usedCodes.includes(code)) {
        msg.style.color = '#10b981';
        msg.textContent = '✅ Code already active!';
        _proStatus = true;
        localStorage.setItem(`tileiq_access_code_pro_${uid}`, 'true');
        updateProBadge();
        setTimeout(() => closePaywall(), 1000);
        return;
    }

    if (ACCESS_CODES.includes(code)) {
        // Valid code — activate Pro
        usedCodes.push(code);
        localStorage.setItem(`tileiq_used_codes_${uid}`, JSON.stringify(usedCodes));
        localStorage.setItem(`tileiq_access_code_pro_${uid}`, 'true');

        _proStatus = true;
        updateProBadge();

        msg.style.color = '#10b981';
        msg.textContent = '✅ Code accepted! Pro unlocked.';
        input.value = '';
        setTimeout(() => closePaywall(), 1200);
    } else {
        msg.style.color = '#ef4444';
        msg.textContent = '❌ Invalid code. Please try again.';
        input.value = '';
    }
}

function checkAccessCodePro() {
    const uid = currentUser?.id || 'anon';
    return localStorage.getItem(`tileiq_access_code_pro_${uid}`) === 'true';
}

/* ── TILE LAYOUT DIAGRAM ─────────────────────────────────────── */
function showLayoutDiagram() {
    const j = getJob();
    if (!j || !j.rooms || !j.rooms.length) { alert('No rooms to show layout for.'); return; }

    // Build room selector if multiple rooms
    const rooms = j.rooms.filter(r => r.surfaces && r.surfaces.some(s => s.area > 0));
    if (!rooms.length) { alert('No room dimensions found.'); return; }

    if (rooms.length === 1) {
        renderLayoutModal(rooms[0]);
    } else {
        // Show room picker
        const modal = createModal();
        const box = modal.querySelector('.layout-box');
        box.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
                <div style="font-size:16px;font-weight:800;color:#e2e8f0;">📐 Choose Room</div>
                <button onclick="this.closest('#layout-modal').remove()" style="background:none;border:none;color:#64748b;font-size:20px;cursor:pointer;">✕</button>
            </div>
            ${rooms.map((r,i) => `
                <div onclick="document.getElementById('layout-modal').remove();renderLayoutModal(${JSON.stringify(r).replace(/"/g,'&quot;')})"
                    style="background:#0f172a;border:1px solid #334155;border-radius:12px;padding:14px;margin-bottom:8px;cursor:pointer;color:#e2e8f0;font-size:15px;font-weight:600;">
                    ${esc(r.name || 'Room ' + (i+1))}
                    <span style="color:#64748b;font-size:12px;font-weight:400;"> — ${r.surfaces?.[0]?.tileW||300}×${r.surfaces?.[0]?.tileH||300}mm tiles</span>
                </div>`).join('')}`;
        document.documentElement.appendChild(modal);
    }
}

function createModal() {
    const existing = document.getElementById('layout-modal');
    if (existing) existing.remove();
    const modal = document.createElement('div');
    modal.id = 'layout-modal';
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:99999;display:flex;align-items:flex-start;justify-content:center;padding:16px;box-sizing:border-box;background:rgba(0,0,0,0.85);overflow-y:auto;';
    const box = document.createElement('div');
    box.className = 'layout-box';
    box.style.cssText = 'background:#1e293b;border-radius:20px;padding:20px;width:100%;max-width:420px;margin-top:20px;';
    modal.appendChild(box);
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
    return modal;
}

function renderLayoutModal(room) {
    const modal = createModal();
    const box = modal.querySelector('.layout-box');

    // Get floor surface dimensions
    const floorSurf = room.surfaces?.find(s => s.type === 'floor' || s.label?.toLowerCase().includes('floor')) || room.surfaces?.[0];
    const wallSurf  = room.surfaces?.find(s => s.type === 'wall' || s.label?.toLowerCase().includes('wall'));

    const roomL  = floorSurf?.length || room.length || 3;
    const roomW  = floorSurf?.width  || room.width  || 3;
    const tileW  = (floorSurf?.tileW || 300) / 1000;  // convert mm to m
    const tileH  = (floorSurf?.tileH || 300) / 1000;
    const grout  = 0.003;  // 3mm grout joint

    const svg = generateLayoutSVG(roomL, roomW, tileW, tileH, grout, room.name || 'Room');

    box.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
            <div style="font-size:16px;font-weight:800;color:#e2e8f0;">📐 ${esc(room.name || 'Layout')}</div>
            <button onclick="document.getElementById('layout-modal').remove()" style="background:none;border:none;color:#64748b;font-size:20px;cursor:pointer;">✕</button>
        </div>
        <div style="background:#0f172a;border-radius:12px;padding:12px;overflow:auto;">
            ${svg}
        </div>
        <div style="display:flex;gap:16px;margin-top:12px;flex-wrap:wrap;">
            <div style="display:flex;align-items:center;gap:6px;font-size:12px;color:#94a3b8;">
                <div style="width:16px;height:16px;background:#3b82f6;border-radius:2px;flex-shrink:0;"></div> Full tile
            </div>
            <div style="display:flex;align-items:center;gap:6px;font-size:12px;color:#94a3b8;">
                <div style="width:16px;height:16px;background:#f59e0b;border-radius:2px;flex-shrink:0;"></div> Cut tile
            </div>
            <div style="display:flex;align-items:center;gap:6px;font-size:12px;color:#94a3b8;">
                <div style="width:16px;height:16px;background:#10b981;border:2px dashed #064e3b;border-radius:2px;flex-shrink:0;"></div> Start point
            </div>
        </div>
        <div id="layout-stats" style="margin-top:12px;background:#0f172a;border-radius:10px;padding:12px;font-size:13px;color:#94a3b8;line-height:1.8;"></div>
        ${wallSurf ? `
        <div style="margin-top:10px;">
            <div style="font-size:13px;font-weight:600;color:#64748b;margin-bottom:6px;">Wall Layout</div>
            <div style="background:#0f172a;border-radius:12px;padding:12px;overflow:auto;">
                ${generateLayoutSVG(roomL, floorSurf?.height || 2.4, wallSurf.tileW/1000, wallSurf.tileH/1000, grout, 'Wall', true)}
            </div>
        </div>` : ''}`;

    document.documentElement.appendChild(modal);
    // Fill stats
    showLayoutStats(roomL, roomW, tileW, tileH, grout);
}

function generateLayoutSVG(roomL, roomW, tileW, tileH, grout, label, isWall = false) {
    const canvasW = 340, canvasH = Math.round(canvasW * (roomW / roomL));
    const scaleX = canvasW / roomL;
    const scaleY = canvasH / roomW;

    const pitch = { x: tileW + grout, y: tileH + grout };

    // Center layout — start point so cuts are equal on both sides
    const nFullX = Math.floor(roomL / pitch.x);
    const nFullY = Math.floor(roomW / pitch.y);
    const leftoverX = roomL - (nFullX * pitch.x - grout);
    const leftoverY = roomW - (nFullY * pitch.y - grout);
    const startX = leftoverX / 2;
    const startY = leftoverY / 2;

    let rects = '';
    let row = 0;
    for (let y = -pitch.y + startY; y < roomW; y += pitch.y) {
        for (let x = -pitch.x + startX; x < roomL; x += pitch.x) {
            const x1 = Math.max(x, 0);
            const y1 = Math.max(y, 0);
            const x2 = Math.min(x + tileW, roomL);
            const y2 = Math.min(y + tileH, roomW);
            if (x2 <= x1 || y2 <= y1) continue;

            const px = x1 * scaleX;
            const py = y1 * scaleY;
            const pw = (x2 - x1) * scaleX - 1;
            const ph = (y2 - y1) * scaleY - 1;

            const isCutX = x < 0 || (x + tileW) > roomL + 0.001;
            const isCutY = y < 0 || (y + tileH) > roomW + 0.001;
            const isCut = isCutX || isCutY;
            const isStart = !isCut && x >= startX - 0.001 && y >= startY - 0.001 && x < startX + pitch.x && y < startY + pitch.y;

            const fill = isStart ? '#10b981' : isCut ? '#f59e0b' : '#3b82f6';
            const stroke = isStart ? '#064e3b' : isCut ? '#92400e' : '#1e40af';
            const dash = isStart ? 'stroke-dasharray="4 2"' : '';

            rects += `<rect x="${px.toFixed(1)}" y="${py.toFixed(1)}" width="${Math.max(pw,0).toFixed(1)}" height="${Math.max(ph,0).toFixed(1)}" fill="${fill}" stroke="${stroke}" stroke-width="1" ${dash} rx="1"/>`;
        }
        row++;
    }

    // Dimension labels
    const dimL = roomL.toFixed(2) + 'm';
    const dimW = roomW.toFixed(2) + 'm';

    return `<svg width="${canvasW}" height="${canvasH + 30}" xmlns="http://www.w3.org/2000/svg" style="display:block;max-width:100%;">
        <rect x="0" y="0" width="${canvasW}" height="${canvasH}" fill="#0f172a" rx="4"/>
        ${rects}
        <!-- Border -->
        <rect x="0" y="0" width="${canvasW}" height="${canvasH}" fill="none" stroke="#334155" stroke-width="2" rx="4"/>
        <!-- Width label -->
        <text x="${canvasW/2}" y="${canvasH + 20}" text-anchor="middle" fill="#94a3b8" font-size="12" font-family="sans-serif">${dimL} × ${dimW}</text>
    </svg>`;
}

function showLayoutStats(roomL, roomW, tileW, tileH, grout) {
    const el = document.getElementById('layout-stats');
    if (!el) return;

    const pitch = { x: tileW + grout, y: tileH + grout };
    const nFullX = Math.floor(roomL / pitch.x);
    const nFullY = Math.floor(roomW / pitch.y);
    const leftoverX = roomL - (nFullX * pitch.x - grout);
    const leftoverY = roomW - (nFullY * pitch.y - grout);
    const cutSizeX = (leftoverX / 2 * 1000).toFixed(0);
    const cutSizeY = (leftoverY / 2 * 1000).toFixed(0);
    const totalRows = Math.ceil(roomW / pitch.y) + (leftoverY > grout ? 1 : 0);
    const totalCols = Math.ceil(roomL / pitch.x) + (leftoverX > grout ? 1 : 0);

    el.innerHTML = `
        <div style="color:#e2e8f0;font-weight:700;margin-bottom:6px;">Layout Summary</div>
        📐 Tile size: ${(tileW*1000).toFixed(0)}×${(tileH*1000).toFixed(0)}mm<br>
        🔢 Grid: ${totalCols} columns × ${totalRows} rows<br>
        ✂️ Cut size along length: <strong style="color:#f59e0b;">${cutSizeX}mm</strong> each side<br>
        ✂️ Cut size along width: <strong style="color:#f59e0b;">${cutSizeY}mm</strong> each side<br>
        ✅ Centred layout — equal cuts on all sides<br>
        ${parseFloat(cutSizeX) < 50 || parseFloat(cutSizeY) < 50 
            ? '<span style="color:#ef4444;">⚠️ Cuts <50mm — consider shifting layout by half a tile</span>' 
            : ''}`;
}

function devProOverride() {
    _devTapCount++;
    if (_devTapCount >= 5) {
        _devTapCount = 0;
        _proStatus = !_proStatus;
        updateProBadge();
        alert(_proStatus ? "🔓 Dev mode: Pro ON" : "🔒 Dev mode: Pro OFF");
    }
}

async function loadPaywallPackages() {
    const container = document.getElementById("paywall-packages");
    if (!container) return;
    container.innerHTML = `
        <button onclick="openPlayStorePurchase('monthly')" style="width:100%;background:var(--card);color:var(--text);border:1px solid var(--border);border-radius:14px;padding:18px 20px;text-align:left;cursor:pointer;margin-bottom:10px;">
            <div style="display:flex;justify-content:space-between;align-items:center;">
                <div style="font-size:16px;font-weight:800;">Monthly</div>
                <div style="font-size:20px;font-weight:800;">£9.99<span style="font-size:12px;font-weight:500;opacity:0.7;"> / month</span></div>
            </div>
        </button>
        <button onclick="openPlayStorePurchase('yearly')" style="width:100%;background:var(--accent);color:#000;border:none;border-radius:14px;padding:18px 20px;text-align:left;cursor:pointer;">
            <div style="display:flex;justify-content:space-between;align-items:center;">
                <div>
                    <div style="font-size:16px;font-weight:800;">Annual</div>
                    <div style="font-size:11px;font-weight:700;margin-top:2px;opacity:0.7;">Best value — save 33%</div>
                </div>
                <div style="font-size:20px;font-weight:800;">£79.99<span style="font-size:12px;font-weight:500;opacity:0.7;"> / year</span></div>
            </div>
        </button>`;
}

function openPlayStorePurchase(plan) {
    const pkg = "com.tileiq.pro";
    const sku = plan === "yearly" ? "tileiq_pro_yearly" : "tileiq_pro_monthly";
    const url = `https://play.google.com/store/account/subscriptions?sku=${sku}&package=${pkg}`;
    if (window.AndroidBridge?.open) window.AndroidBridge.open(url);
    else window.open(url, "_system");
    setTimeout(async () => {
        await refreshProStatus();
        if (_proStatus) { closePaywall(); alert("🎉 Welcome to TileIQ Pro!"); }
    }, 3000);
}

async function restorePurchases() {
    await refreshProStatus();
    if (_proStatus) {
        closePaywall();
        alert("✅ Pro subscription restored!");
    } else {
        alert("No active subscription found.\n\nIf you've subscribed via Google Play, please allow a few minutes and try again.");
    }
}

function checkJobLimit() {
    if (isPro()) return true;
    if (jobs.length < FREE_JOB_LIMIT) return true;
    showPaywall("job_limit");
    return false;
}

function checkProFeature(featureName) {
    if (isPro()) return true;
    showPaywall(featureName);
    return false;
}


/* ─── VOICEMAILS ─────────────────────────────────────────────── */
function goVoicemails() {
  show("screen-voicemails");
  loadVoicemails();
}

async function loadVoicemails() {
  const list = document.getElementById("voicemails-list");
  if (!list) return;
  list.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:40px 20px;">Loading…</div>';

  try {
    const session = JSON.parse(localStorage.getItem("sb-lzwmqabxpxuuznhbpewm-auth-token") || "{}");
    const token = session?.access_token;
    if (!token) { list.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:40px;">Sign in required</div>'; return; }

    const headers = { "apikey": SB_KEY, "Authorization": "Bearer " + token };
    const resp = await fetch(SB_URL + "/rest/v1/customer_voicemails?order=created_at.desc&limit=50", { headers });
    const rows = await resp.json();

    if (!rows || !rows.length) {
      list.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:40px 20px;"><div style=\"font-size:48px;margin-bottom:12px;\">📭</div><div style=\"font-weight:700;margin-bottom:4px;\">No voicemails yet</div><div style=\"font-size:13px;\">When existing customers press 2, their messages appear here.</div></div>';
      return;
    }

    list.innerHTML = rows.map(v => {
      const date = new Date(v.created_at);
      const dateStr = date.toLocaleDateString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
      const dur = v.duration_seconds || 0;
      const durStr = dur >= 60 ? Math.floor(dur/60) + "m " + (dur%60) + "s" : dur + "s";
      const unread = !v.listened;
      return `<div id="vm-${v.id}" style="background:var(--card-bg);border:1px solid ${unread ? "var(--accent)" : "var(--border)"};border-radius:12px;padding:16px;display:flex;flex-direction:column;gap:10px;">
  <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
    <div style="display:flex;align-items:center;gap:8px;">
      ${unread ? '<span style="width:8px;height:8px;border-radius:50%;background:var(--accent);flex-shrink:0;display:inline-block;"></span>' : ''}
      <div>
        <div style="font-weight:700;font-size:15px;">${v.caller_number || "Unknown"}</div>
        <div style="font-size:12px;color:var(--text-muted);">${dateStr} · ${durStr}</div>
      </div>
    </div>
    <button onclick="deleteVoicemail('${v.id}')" style="background:none;border:none;color:var(--text-muted);font-size:18px;cursor:pointer;padding:4px;">🗑</button>
  </div>
  <div style="display:flex;gap:8px;">
    <button onclick="playVoicemail('${v.id}','${v.recording_url}')" style="flex:1;background:var(--accent);color:#000;border:none;border-radius:8px;padding:10px;font-size:14px;font-weight:700;cursor:pointer;">▶ Play</button>
    <a href="tel:${v.caller_number}" style="flex:1;background:var(--card-bg);border:1px solid var(--border);border-radius:8px;padding:10px;font-size:14px;font-weight:700;color:var(--text);text-decoration:none;display:flex;align-items:center;justify-content:center;">📞 Call back</a>
  </div>
</div>`;
    }).join("");

  } catch(e) {
    list.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:40px;">Failed to load voicemails</div>';
    console.error("loadVoicemails error:", e);
  }
}

async function playVoicemail(id, url) {
  // Mark as listened
  try {
    const session = JSON.parse(localStorage.getItem("sb-lzwmqabxpxuuznhbpewm-auth-token") || "{}");
    const token = session?.access_token;
    await fetch(SB_URL + "/rest/v1/customer_voicemails?id=eq." + id, {
      method: "PATCH",
      headers: { "apikey": SB_KEY, "Authorization": "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify({ listened: true })
    });
    // Remove unread dot
    const card = document.getElementById("vm-" + id);
    if (card) {
      card.style.borderColor = "var(--border)";
      const dot = card.querySelector('span[style*="border-radius:50%"]');
      if (dot) dot.remove();
    }
  } catch(e) {}

  // Play audio via proxy
  const proxyUrl = "https://damp-bread-e0f9.kevin-woodley.workers.dev/audio-proxy?url=" + encodeURIComponent(url);
  const audio = new Audio(proxyUrl);
  audio.play().catch(e => {
    // Fallback - open in browser
    window.open(proxyUrl, "_blank");
  });
}

async function deleteVoicemail(id) {
  if (!confirm("Delete this voicemail?")) return;
  try {
    const session = JSON.parse(localStorage.getItem("sb-lzwmqabxpxuuznhbpewm-auth-token") || "{}");
    const token = session?.access_token;
    await fetch(SB_URL + "/rest/v1/customer_voicemails?id=eq." + id, {
      method: "DELETE",
      headers: { "apikey": SB_KEY, "Authorization": "Bearer " + token }
    });
    const card = document.getElementById("vm-" + id);
    if (card) card.remove();
  } catch(e) {
    alert("Failed to delete voicemail");
  }
}


/* ─── DIVERT SETUP ───────────────────────────────────────────── */
function setupDivert() {
    const twilioNum = (settings.twilioNumber || "").replace(/\s/g, "");
    if (!twilioNum) {
        alert("Please enter your TileIQ Business Number above and save settings first.");
        return;
    }
    // Format for divert code: convert 07xxx to +447xxx
    let e164 = twilioNum;
    if (e164.startsWith("07")) e164 = "+44" + e164.slice(1);
    else if (e164.startsWith("447")) e164 = "+" + e164;
    // Divert on no answer after 20 seconds (works on EE, O2, Vodafone, Three)
    const code = "**61*" + e164 + "*11*20#";
    if (confirm("This will open your dialler with the divert setup code.\n\nJust press Call and your missed calls will go to your TileIQ voicemail automatically.\n\nCode: " + code)) {
        window.open("tel:" + code);
    }
}

