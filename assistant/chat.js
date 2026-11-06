// TileIQ assistant: the chat panel on tile-iq.com. Loaded by site.js when the "Ask TileIQ" button
// is first tapped. Talks to the worker's /api/assistant/*; the instructions, knowledge base and
// keys all live there, never here.
// Kept in this tab only (sessionStorage): the conversation and a 2-hour visitor token. Nothing
// is stored on our side except counts. Analytics events only with the visitor's consent, and
// never the text of a question or answer.
(() => {
  if (window.tileiqAssistant) return;
  const API = "https://damp-bread-e0f9.kevin-woodley.workers.dev/api/assistant/";
  const STORE = "tq-assistant-chat";
  const MAX_LEN = 1500;
  const OK_HOST = /^https:\/\/(tile-iq\.com|www\.tile-iq\.com|www\.gov\.uk|gov\.uk|apps\.apple\.com|play\.google\.com)(\/|$)/i;

  let state = { messages: [], token: null, exp: 0, rated: {} };
  try { const s = JSON.parse(sessionStorage.getItem(STORE) || "null"); if (s && Array.isArray(s.messages)) state = { ...state, ...s }; } catch (e) {}
  const save = () => { try { sessionStorage.setItem(STORE, JSON.stringify(state)); } catch (e) {} };

  let status = null, launcher = null, el = {}, busy = false, tsWidget = null, tsWaiters = [];

  // ── Analytics: only with consent, and never the words typed ─────────────
  function track(name, props) {
    const p = Object.assign({ page: location.pathname }, props || {});
    try { if (window.tileiqConsent && window.tileiqConsent.get() === "granted") {
      if (window.posthog && window.posthog.__loaded) window.posthog.capture(name, p);
      if (typeof window.gtag === "function") window.gtag("event", name, p);
    } } catch (e) {}
  }

  // ── Suggested questions for the page they're on ─────────────────────────
  function suggestions() {
    const p = location.pathname;
    if (/calculator/.test(p)) return ["How much adhesive do I need per m²?", "How much wastage should I allow?", "Can TileIQ do this for a whole job?", "How do I price the labour?"];
    if (/^\/guides\/tileiq-vs-/.test(p)) return ["What makes TileIQ different?", "How much does TileIQ cost?", "Can I try it without signing up?", "Does it work on iPhone and Android?"];
    if (/^\/guides\/|^\/blog\//.test(p)) return ["How do I price a bathroom tiling job?", "How much does a tiler charge per m²?", "What is CIS and how does TileIQ handle it?", "Can I try TileIQ without signing up?"];
    if (/invoice|money/.test(p)) return ["Can I send CIS invoices?", "Does TileIQ connect to Xero or QuickBooks?", "Can it scan receipts?", "Does TileIQ do Making Tax Digital?"];
    return ["What does TileIQ do?", "Can I try it without signing up?", "How much does it cost?", "Does it work with a Leica Disto?"];
  }

  // ── Safe rendering: text only, with **bold**, "- " lists and allowed links ─
  const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  function inline(s) {
    return esc(s)
      .replace(/\[([^\]]{1,120})\]\((https:\/\/[^)\s"]{1,300})\)/g, (all, label, href) => {
        if (!OK_HOST.test(href)) return label;
        const own = /^https:\/\/(www\.)?tile-iq\.com/i.test(href);
        return `<a href="${href}"${own ? "" : ' target="_blank" rel="noopener"'} data-tq-link>${label}</a>`;
      })
      .replace(/\*\*([^*]{1,200})\*\*/g, "<strong>$1</strong>");
  }
  function md(text) {
    const out = []; let list = null;
    String(text).split(/\n/).forEach(line => {
      const m = line.match(/^\s*[-•*]\s+(.*)$/);
      if (m) { if (!list) { list = []; out.push(list); } list.push(m[1]); return; }
      list = null;
      if (line.trim()) out.push(line.trim());
    });
    return out.map(b => Array.isArray(b) ? "<ul>" + b.map(li => "<li>" + inline(li) + "</li>").join("") + "</ul>" : "<p>" + inline(b) + "</p>").join("");
  }

  // ── The panel ───────────────────────────────────────────────────────────
  function build() {
    const box = document.createElement("section");
    box.className = "tq-chat";
    box.hidden = true;
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-label", "TileIQ assistant");
    box.innerHTML =
      '<div class="tq-chat-head"><div class="tq-chat-title"><strong>TileIQ assistant</strong><span>Answers about TileIQ and tiling. Can make mistakes.</span></div>' +
      '<button type="button" data-act="restart" title="Start a new chat">New chat</button>' +
      '<button type="button" data-act="min" aria-label="Minimise" title="Minimise">&#8211;</button>' +
      '<button type="button" data-act="close" class="tq-x" aria-label="Close and end the chat" title="Close and end the chat">&times;</button></div>' +
      '<div class="tq-chat-log" aria-live="polite"></div>' +
      '<div class="tq-chat-foot"><div class="tq-ts"></div><form class="tq-form"><label class="sr-only" for="tq-q" style="position:absolute;left:-9999px">Your question</label>' +
      '<textarea id="tq-q" rows="1" maxlength="' + MAX_LEN + '" placeholder="Ask about TileIQ or tiling…" autocomplete="off"></textarea>' +
      '<button type="submit">Send</button></form>' +
      '<p class="tq-legal">Don\'t include customers\' details. Questions go to our AI provider to answer them; we don\'t keep them. <a href="/privacy.html#assistant">Privacy</a></p></div>';
    document.body.appendChild(box);
    el = { box, log: box.querySelector(".tq-chat-log"), form: box.querySelector("form"), input: box.querySelector("textarea"),
      send: box.querySelector('button[type="submit"]'), ts: box.querySelector(".tq-ts") };
    box.querySelector('[data-act="restart"]').addEventListener("click", restart);
    box.querySelector('[data-act="min"]').addEventListener("click", () => close(false));
    box.querySelector('[data-act="close"]').addEventListener("click", () => close(true));
    box.addEventListener("keydown", e => { if (e.key === "Escape") close(false); });
    el.form.addEventListener("submit", e => { e.preventDefault(); ask(el.input.value); });
    el.input.addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(el.input.value); } });
    el.input.addEventListener("input", () => { el.input.style.height = "auto"; el.input.style.height = Math.min(el.input.scrollHeight, 120) + "px"; });
    el.log.addEventListener("click", e => {
      const s = e.target.closest("[data-suggest]");
      if (s) return ask(s.textContent, true);
      const a = e.target.closest("a[data-tq-link]");
      if (a) track("assistant_link_clicked", { link: a.getAttribute("href").replace(/^https:\/\/(www\.)?tile-iq\.com/, "") });
      const r = e.target.closest("[data-rate]");
      if (r) rate(Number(r.dataset.i), Number(r.dataset.rate));
      const retry = e.target.closest("[data-retry]");
      if (retry) { retry.closest(".tq-note").remove(); send(); }
    });
  }

  function render() {
    const parts = [];
    if (!state.messages.length) {
      parts.push('<div class="tq-msg tq-bot"><p>Hi! I can help with TileIQ and with tiling questions: quotes, materials, pricing, CIS and more. What would you like to know?</p></div>');
      parts.push('<div class="tq-suggest">' + suggestions().map(q => '<button type="button" data-suggest>' + esc(q) + "</button>").join("") + "</div>");
    }
    state.messages.forEach((m, i) => {
      if (m.role === "user") parts.push('<div class="tq-msg tq-user">' + esc(m.content) + "</div>");
      else {
        const r = state.rated[i];
        parts.push('<div class="tq-msg tq-bot">' + md(m.content) +
          '<div class="tq-rate" role="group" aria-label="Was this helpful?">' +
          '<button type="button" data-rate="1" data-i="' + i + '" aria-pressed="' + (r === 1) + '" aria-label="Helpful">👍</button>' +
          '<button type="button" data-rate="-1" data-i="' + i + '" aria-pressed="' + (r === -1) + '" aria-label="Not helpful">👎</button></div></div>');
      }
    });
    el.log.innerHTML = parts.join("");
    el.log.scrollTop = el.log.scrollHeight;
  }

  function note(html, error) {
    const n = document.createElement("div");
    n.className = "tq-note" + (error ? " tq-error" : "");
    n.innerHTML = html;
    el.log.appendChild(n);
    el.log.scrollTop = el.log.scrollHeight;
    return n;
  }
  function typing(on) {
    const t = el.log.querySelector(".tq-typing-msg");
    if (on && !t) { el.log.insertAdjacentHTML("beforeend", '<div class="tq-msg tq-bot tq-typing-msg" aria-label="Thinking"><span class="tq-typing"><i></i><i></i><i></i></span></div>'); el.log.scrollTop = el.log.scrollHeight; }
    if (!on && t) t.remove();
  }
  function setBusy(on) { busy = on; el.send.disabled = on; el.input.setAttribute("aria-busy", String(on)); }

  // ── Turnstile: an invisible check, once per 2 hours ─────────────────────
  function loadTurnstile() {
    if (window.turnstile) return Promise.resolve();
    return new Promise((ok, fail) => {
      const s = document.createElement("script");
      s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      s.async = true; s.onload = ok; s.onerror = fail;
      document.head.appendChild(s);
    });
  }
  function turnstileToken() {
    return new Promise((ok, fail) => {
      tsWaiters.push({ ok, fail });
      if (tsWidget !== null) { try { window.turnstile.reset(tsWidget); } catch (e) {} return; }
      tsWidget = window.turnstile.render(el.ts, {
        sitekey: status.siteKey, appearance: "interaction-only", action: "assistant",
        callback: t => tsWaiters.splice(0).forEach(w => w.ok(t)),
        "error-callback": () => tsWaiters.splice(0).forEach(w => w.fail(new Error("turnstile"))),
        "expired-callback": () => {}
      });
    });
  }
  async function visitorToken() {
    if (state.token && state.exp - Date.now() > 60000) return state.token;
    await loadTurnstile();
    const t = await turnstileToken();
    const r = await fetch(API + "session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ turnstile: t }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.token) throw Object.assign(new Error(d.error || "session"), { friendly: d.error });
    state.token = d.token; state.exp = d.expires; save();
    return d.token;
  }

  // ── Asking ──────────────────────────────────────────────────────────────
  function ask(text, suggested) {
    const q = String(text || "").trim().slice(0, MAX_LEN);
    if (!q || busy) return;
    el.input.value = ""; el.input.style.height = "auto";
    state.messages.push({ role: "user", content: q }); save();
    render();
    track("assistant_question", { suggested: !!suggested, turn: state.messages.filter(m => m.role === "user").length });
    send();
  }

  async function send(retried) {
    setBusy(true); typing(true);
    try {
      const token = await visitorToken();
      const r = await fetch(API + "chat", {
        method: "POST", headers: { "Content-Type": "application/json", "X-Assistant-Visitor": token },
        body: JSON.stringify({ surface: "website", page: location.pathname, messages: state.messages.slice(-10) })
      });
      const d = await r.json().catch(() => ({}));
      if (r.status === 401 && d.needSession && !retried) { state.token = null; save(); typing(false); setBusy(false); return send(true); }
      typing(false);
      if (!r.ok || !d.text) {
        note(md(d.error || "Sorry, something went wrong.") + (d.fallback ? md(d.fallback) : "") +
          (r.status >= 500 && r.status !== 503 ? '<button type="button" data-retry>Try again</button>' : ""), true);
        track("assistant_unavailable", { status: r.status, reason: d.reason || null });
        return;
      }
      state.messages.push({ role: "assistant", content: d.text }); save();
      render();
    } catch (e) {
      typing(false);
      note(esc(e.friendly || (navigator.onLine === false ? "You look to be offline. Check your connection and try again." : "Couldn't reach the assistant. Check your connection and try again.")) +
        '<br><button type="button" data-retry>Try again</button>', true);
    } finally {
      setBusy(false);
      if (!el.box.hidden) el.input.focus();
    }
  }

  function rate(i, rating) {
    if (!state.messages[i] || state.rated[i] === rating) return;
    state.rated[i] = rating; save(); render();
    track("assistant_feedback", { rating });
    if (state.token) fetch(API + "feedback", { method: "POST", headers: { "Content-Type": "application/json", "X-Assistant-Visitor": state.token },
      body: JSON.stringify({ rating, page: location.pathname, surface: "website" }) }).catch(() => {});
  }

  function restart() {
    state.messages = []; state.rated = {}; save();
    render(); el.input.focus();
    track("assistant_restarted");
  }
  function open() {
    el.box.hidden = false;
    launcher && launcher.setAttribute("aria-expanded", "true");
    render();
    setTimeout(() => el.input.focus(), 30);
    track("assistant_opened", { returning: state.messages.length > 0 });
  }
  function close(end) {
    el.box.hidden = true;
    if (end) { state.messages = []; state.rated = {}; save(); }
    if (launcher) { launcher.setAttribute("aria-expanded", "false"); launcher.focus(); }
    track(end ? "assistant_closed" : "assistant_minimised");
  }

  window.tileiqAssistant = {
    start(s, button) { status = s; launcher = button; if (!el.box) build(); open(); },
    toggle() { if (el.box.hidden) open(); else close(false); }
  };
})();
