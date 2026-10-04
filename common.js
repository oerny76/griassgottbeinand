// Gemeinsame Bausteine für die Mitglieder-App (index.html) und den Admin-Bereich (admin.html).
(() => {
  "use strict";
  const C = window.APP_CONFIG;
  const STORE_KEY = "stammtisch_token";
  const $toast = document.getElementById("toast");

  const store = {
    get() { try { return localStorage.getItem(STORE_KEY); } catch { return null; } },
    set(v) { try { localStorage.setItem(STORE_KEY, v); } catch { /* egal */ } },
    clear() { try { localStorage.removeItem(STORE_KEY); } catch { /* egal */ } },
  };
  const session = {
    get(k) { try { return sessionStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { sessionStorage.setItem(k, v); } catch { /* egal */ } },
  };

  // Persönlicher Code: aus dem Link (?t=…) oder vom Gerät.
  const qs = new URLSearchParams(location.search);
  let token = (qs.get("t") || "").trim() || store.get() || "";
  if (qs.get("t")) store.set(token);

  const euro = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });
  const dateLong = (iso) => new Date(iso + "T12:00:00").toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const dateShort = (iso) => new Date(iso + "T12:00:00").toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
  const dateDay = (iso) => new Date(iso + "T12:00:00").toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" });
  const stripGast = (s) => String(s || "").replace(/^Gast\s+/i, "");

  function safeUrl(u, hosts) {
    try {
      const url = new URL(u);
      if (url.protocol !== "https:" && url.protocol !== "http:") return null;
      if (hosts && !hosts.includes(url.hostname)) return null;
      return url.href;
    } catch { return null; }
  }

  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? "" : v);
    }
    for (const kid of kids.flat()) {
      if (kid == null || kid === false) continue;
      el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
    return el;
  }

  const card = (title, ...kids) => h("section", { class: "card" }, title && h("h2", {}, title), ...kids);
  const options = (names, selected) => names.map((n) => h("option", { value: n, selected: n === selected }, n));

  let toastTimer;
  function toast(text, isError) {
    $toast.textContent = text;
    $toast.className = "show" + (isError ? " err" : "");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { $toast.className = ""; }, isError ? 6000 : 3500);
  }

  const FRIENDLY = [
    [/Link ungueltig/i, "Dieser Link ist ungültig. Bitte den persönlichen Link nutzen."],
    [/naechsten/gi, "nächsten"],
    [/Frist abgelaufen/i, "Die Frist ist abgelaufen (19 Uhr am Stammtischtag). Bitte beim Admin melden."],
  ];
  function friendly(msg) {
    let out = String(msg || "Unbekannter Fehler");
    for (const [re, to] of FRIENDLY) out = out.replace(re, to);
    return out;
  }

  async function rpc(fn, args = {}) {
    let res;
    try {
      res = await fetch(`${C.SUPABASE_URL}/rest/v1/rpc/${fn}`, {
        method: "POST",
        headers: { apikey: C.SUPABASE_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ p_token: token, ...args }),
      });
    } catch {
      throw new Error("Keine Verbindung. Bitte später noch einmal versuchen.");
    }
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      const err = new Error(friendly(body && body.message));
      err.invalid = !!(body && /Link ungueltig/i.test(body.message || ""));
      err.forbidden = !!(body && /Nicht berechtigt/i.test(body.message || ""));
      throw err;
    }
    return body;
  }

  // Jede Seite meldet an, was bei "neu laden" und "kein gültiger Code" passiert.
  const hooks = { reload: async () => {}, noToken: () => {} };

  async function act(btn, fn, okText) {
    if (btn) btn.disabled = true;
    try {
      const r = await fn();
      toast(typeof okText === "function" ? okText(r) : okText);
      await hooks.reload();
    } catch (e) {
      if (e.invalid) { forgetToken(); return hooks.noToken(); }
      toast(e.message, true);
      if (btn) btn.disabled = false;
    }
  }

  function forgetToken() { store.clear(); token = ""; }

  window.App = {
    h, card, options, rpc, toast, euro, dateShort, dateLong, dateDay, stripGast, safeUrl, act, friendly,
    hooks, session, forgetToken, hasToken: () => !!token,
  };
})();
