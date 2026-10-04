(() => {
  "use strict";
  const C = window.APP_CONFIG;
  const STORE_KEY = "stammtisch_token";
  const DOC_HOSTS = ["drive.google.com", "docs.google.com"];
  let linksCache = null; // Satzung und Gebührenordnung kommen aus der Datenbank, nicht aus dem Code
  const $app = document.getElementById("app");
  const $toast = document.getElementById("toast");

  // ---------- Hilfsfunktionen ----------
  const store = {
    get() { try { return localStorage.getItem(STORE_KEY); } catch { return null; } },
    set(v) { try { localStorage.setItem(STORE_KEY, v); } catch { /* egal */ } },
    clear() { try { localStorage.removeItem(STORE_KEY); } catch { /* egal */ } },
  };

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
      throw err;
    }
    return body;
  }

  async function act(btn, fn, okText) {
    if (btn) btn.disabled = true;
    try {
      const r = await fn();
      toast(typeof okText === "function" ? okText(r) : okText);
      await load();
    } catch (e) {
      if (e.invalid) { store.clear(); token = ""; return showNoToken(); }
      toast(e.message, true);
      if (btn) btn.disabled = false;
    }
  }

  // ---------- Bereiche ----------
  function meetingCard(d) {
    const m = d.meeting;
    if (!m) {
      return card("Nächster Stammtisch",
        h("p", { class: "big" }, "Noch kein Termin"),
        h("p", { class: "muted small" }, "Der Vorsitz des letzten Abends legt den nächsten Termin fest."));
    }
    const loc = m.location;
    const web = loc && safeUrl(loc.url);
    const addr = loc ? [loc.street, [loc.zip, loc.city].filter(Boolean).join(" ")].filter(Boolean).join(", ") : "";
    const maps = loc ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([loc.name, addr].filter(Boolean).join(", "))}` : null;
    return card("Nächster Stammtisch",
      h("p", { class: "big" }, dateLong(m.date)),
      h("p", {}, "Vorsitz: ", h("strong", {}, m.chair || "noch offen")),
      loc
        ? h("p", {}, h("strong", {}, loc.name), addr && h("span", { class: "muted" }, " · " + addr), " ",
            maps && h("a", { href: maps, target: "_blank", rel: "noopener noreferrer" }, "Karte"),
            web && [" · ", h("a", { href: web, target: "_blank", rel: "noopener noreferrer" }, "Website")])
        : h("p", { class: "muted" }, "Location noch offen"),
      h("p", { class: "muted small" }, m.deadline_passed ? "Die Anmeldefrist ist abgelaufen." : "Abmelden oder Gäste anmelden bis 19 Uhr am Stammtischtag."));
  }

  function signupCard(d) {
    const m = d.meeting, me = d.me;
    if (!m) return null;
    const locked = m.deadline_passed && !me.is_admin;
    const children = [];
    if (locked) children.push(h("p", { class: "notice" }, "Die Frist ist abgelaufen (19 Uhr am Stammtischtag). Bitte beim Admin melden."));

    const absBtn = h("button", {
      class: d.my_absent ? "full" : "primary full", disabled: locked,
      onclick: (e) => act(e.currentTarget,
        () => rpc(d.my_absent ? "app_cancel_absence" : "app_add_absence"),
        (r) => d.my_absent ? "Abmeldung zurückgezogen." : `Abwesenheit eingetragen (${euro.format(r.amount)}).`),
    }, d.my_absent ? "Abmeldung zurückziehen" : "Ich komme nicht");
    children.push(d.my_absent ? h("p", {}, h("span", { class: "chip" }, "Du bist entschuldigt")) : null, absBtn);

    children.push(h("hr", { style: "border:0;border-top:1px solid var(--line);margin:14px 0" }));
    children.push(h("label", { for: "guest" }, "Gast mitbringen"));
    const input = h("input", { id: "guest", type: "text", maxlength: "60", placeholder: "Name des Gastes", autocomplete: "off", disabled: locked });
    const addBtn = h("button", {
      class: "primary", disabled: locked,
      onclick: (e) => {
        const name = input.value.trim();
        if (!name) { toast("Bitte den Namen des Gastes eingeben.", true); input.focus(); return; }
        act(e.currentTarget, () => rpc("app_add_guest", { p_guest: name }), (r) => `Gast angemeldet (${euro.format(r.amount)}).`);
      },
    }, "Anmelden");
    children.push(h("div", { class: "inline" }, input, addBtn));
    if (d.my_guests.length) {
      children.push(h("div", { style: "margin-top:8px" }, d.my_guests.map((g) =>
        h("div", { class: "row" }, h("span", {}, stripGast(g)),
          h("button", { class: "link", disabled: locked, onclick: (e) => act(e.currentTarget, () => rpc("app_cancel_guest", { p_guest: stripGast(g) }), "Gast entfernt.") }, "Entfernen")))));
    }
    return card("Deine Anmeldung", ...children);
  }

  function whoCard(d) {
    if (!d.meeting) return null;
    return card("Wer fehlt, wer kommt dazu",
      h("p", { class: "small muted", style: "margin:0 0 6px" }, "Entschuldigt"),
      d.absent.length ? h("ul", { class: "chips" }, d.absent.map((n) => h("li", { class: "chip" }, n))) : h("p", { style: "margin:0" }, "Bisher niemand."),
      h("p", { class: "small muted", style: "margin:12px 0 6px" }, "Gäste"),
      d.guests.length ? h("ul", { class: "chips" }, d.guests.map((g) => h("li", { class: "chip" }, `${stripGast(g.guest)} (bei ${g.host})`))) : h("p", { style: "margin:0" }, "Bisher keine."));
  }

  function accountCard(d) {
    const o = d.my_open;
    const pay = safeUrl(o.paypal_url, ["paypal.me", "www.paypal.me"]);
    if (!o.items.length) {
      return card("Dein Konto", h("p", { class: "total zero" }, "Alles bezahlt ✓"));
    }
    return card("Dein Konto",
      h("p", { class: "muted small", style: "margin:0" }, "Offen"),
      h("p", { class: "total", style: "margin:0 0 10px" }, euro.format(o.total)),
      pay && h("a", { class: "btn paypal full", href: pay, target: "_blank", rel: "noopener noreferrer" }, `Mit PayPal bezahlen (${euro.format(o.total)})`),
      h("div", { style: "margin-top:12px" }, o.items.map((i) =>
        h("div", { class: "row" },
          h("span", {}, dateShort(i.date), " · ", i.category, i.sub ? h("span", { class: "muted" }, " (" + stripGast(i.sub) + ")") : null),
          h("strong", {}, euro.format(i.open))))),
      h("p", { class: "muted small", style: "margin:10px 0 0" }, "Nach der Zahlung bucht der Admin den Eingang. Das kann etwas dauern."));
  }

  function memberNames(d) { return d.absences_year.list.map((x) => x.name).sort((a, b) => a.localeCompare(b, "de")); }
  const options = (names, selected) => names.map((n) => h("option", { value: n, selected: n === selected }, n));

  function chairCard(d) {
    const me = d.me, parts = [];
    if (me.can_set_next_chair) {
      const sel = h("select", { id: "nextChair" }, h("option", { value: "" }, "Bitte wählen"), options(memberNames(d)));
      const date = h("input", { id: "nextDate", type: "date" });
      parts.push(
        h("div", { class: "stack" },
          h("div", {}, h("label", { for: "nextChair" }, "Nächster Vorsitz"), sel),
          h("div", {}, h("label", { for: "nextDate" }, "Datum (leer lassen: erster Freitag im Folgemonat)"), date),
          h("button", {
            class: "primary full",
            onclick: (e) => {
              if (!sel.value) { toast("Bitte ein Mitglied wählen.", true); return; }
              act(e.currentTarget, () => rpc("app_set_next_chair", { p_chair: sel.value, p_date: date.value || null }),
                (r) => `${r.chair} hat den Vorsitz am ${dateShort(r.date)}.`);
            },
          }, "Vorsitz festlegen")));
    }
    if (me.can_set_location) {
      const list = h("datalist", { id: "locList" });
      rpc("app_locations").then((names) => names.forEach((n) => list.append(h("option", { value: n })))).catch(() => {});
      const loc = h("input", { id: "loc", type: "text", list: "locList", maxlength: "80", placeholder: "Name der Location", autocomplete: "off" });
      const street = h("input", { type: "text", maxlength: "80", placeholder: "Straße und Hausnummer", autocomplete: "off" });
      const zip = h("input", { type: "text", maxlength: "10", placeholder: "PLZ", inputmode: "numeric", autocomplete: "off" });
      const city = h("input", { type: "text", maxlength: "60", placeholder: "Ort", autocomplete: "off" });
      const url = h("input", { type: "url", maxlength: "200", placeholder: "Website (https://…)", autocomplete: "off" });
      parts.push(
        h("div", { class: "stack", style: parts.length ? "margin-top:18px" : "" },
          h("div", {}, h("label", { for: "loc" }, "Location für den nächsten Termin"), loc, list),
          h("details", {}, h("summary", {}, "Neue Location? Adresse ergänzen"), h("div", { class: "stack", style: "margin-top:10px" }, street, h("div", { class: "inline" }, zip, city), url)),
          h("button", {
            class: "primary full",
            onclick: (e) => {
              if (!loc.value.trim()) { toast("Bitte die Location eintragen.", true); return; }
              act(e.currentTarget, () => rpc("app_set_next_location", { p_location: loc.value, p_street: street.value, p_zip: zip.value, p_city: city.value, p_url: url.value }),
                (r) => `Location eingetragen: ${r.location}.`);
            },
          }, "Location eintragen")));
    }
    return card("Vorsitz", ...parts);
  }

  function adminCard(d) {
    if (!d.meeting) return null;
    const sel = h("select", { id: "adminMember" }, options(memberNames(d)));
    const guest = h("input", { type: "text", maxlength: "60", placeholder: "Name des Gastes", autocomplete: "off" });
    const who = () => sel.value;
    return card("Admin: für andere eintragen",
      h("div", { class: "stack" },
        h("a", { class: "btn primary full", href: "#admin" }, "Zahlungen und Buchungen"),
        h("div", {}, h("label", { for: "adminMember" }, "Mitglied"), sel),
        h("div", { class: "inline" },
          h("button", { class: "full", onclick: (e) => act(e.currentTarget, () => rpc("app_add_absence", { p_member: who() }), (r) => `${r.member}: Abwesenheit eingetragen.`) }, "Abwesenheit"),
          h("button", { class: "full", onclick: (e) => act(e.currentTarget, () => rpc("app_cancel_absence", { p_member: who() }), (r) => `${r.member}: Abwesenheit zurückgezogen.`) }, "Zurückziehen")),
        h("div", { class: "inline" }, guest,
          h("button", {
            onclick: (e) => {
              if (!guest.value.trim()) { toast("Bitte den Namen des Gastes eingeben.", true); return; }
              act(e.currentTarget, () => rpc("app_add_guest", { p_guest: guest.value, p_host: who() }), (r) => `Gast bei ${r.host} (${r.category}).`);
            },
          }, "Gast")),
        h("p", { class: "muted small", style: "margin:0" }, "Als Admin gilt die Frist nicht. Gäste nach 19 Uhr werden als „Gast unangemeldet“ gebucht.")));
  }

  function absencesCard(d) {
    const a = d.absences_year;
    return h("section", { class: "card" },
      h("details", {},
        h("summary", {}, `Abwesenheiten ${a.year}`),
        h("div", { style: "margin-top:8px" }, a.list.map((x) =>
          h("div", { class: "row" }, h("span", {}, x.name), h("span", { class: x.count >= 5 ? "chip warn" : "" }, x.count >= 5 ? `⚠ ${x.count}` : x.count)))),
        h("p", { class: "muted small", style: "margin:8px 0 0" }, "Ab 5 gibt es einen Warnhinweis.")));
  }

  function openCard(d) {
    const list = d.overview && d.overview.open;
    if (!list) return null;
    const sum = list.reduce((a, x) => a + Number(x.total), 0);
    return card("Offene Beträge im Stammtisch",
      list.length
        ? [...list.map((x) => h("div", { class: "row" }, h("span", {}, x.name, x.mine ? h("span", { class: "chip", style: "margin-left:8px" }, "du") : null), h("strong", {}, euro.format(x.total)))),
           h("div", { class: "row" }, h("span", { class: "muted" }, "Summe"), h("strong", {}, euro.format(sum)))]
        : h("p", { style: "margin:0" }, "Alles bezahlt ✓"),
      h("p", { class: "muted small", style: "margin:10px 0 0" }, "Die einzelnen Posten und den PayPal-Link siehst nur du bei dir unter „Dein Konto“."));
  }

  function chairsCard(d) {
    const o = d.overview;
    if (!o) return null;
    const max = Math.max(1, ...o.chairs.map((c) => c.count));
    return h("section", { class: "card" },
      h("details", {},
        h("summary", {}, "Vorsitz-Historie"),
        h("div", { style: "margin-top:8px" }, o.chairs.map((c) =>
          h("div", { class: "row" },
            h("span", { style: "flex:1" }, c.name, c.former ? h("span", { class: "muted small" }, " (ehemals)") : null,
              h("span", { class: "bar", style: `width:${Math.round(c.count / max * 100)}%` })),
            h("strong", {}, c.count + "×")))),
        h("p", { class: "muted small", style: "margin:12px 0 6px" }, "Zuletzt"),
        o.recent.map((r) => h("div", { class: "row" }, h("span", {}, dateShort(r.date), " · ", r.chair || "?"), h("span", { class: "muted small" }, r.location || "")))));
  }

  const RATING_LABELS = [["food", "Essen"], ["drinks", "Getränke"], ["service", "Service"], ["ambience", "Ambiente"], ["value", "Preis-Leistung"]];
  const fmt1 = (n) => Number(n).toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const stars = (n) => "★".repeat(Math.round(n)) + "☆".repeat(5 - Math.round(n));

  function locationsCard(d) {
    const o = d.overview;
    if (!o) return null;
    const all = o.locations.slice();
    const listEl = h("div", { style: "margin-top:8px" });
    let sortBy = "visits";
    const draw = (filter) => {
      const f = (filter || "").trim().toLowerCase();
      const items = all
        .filter((l) => !f || (l.name + " " + (l.city || "")).toLowerCase().includes(f))
        .sort((a, b) => sortBy === "rating"
          ? (b.avg == null) - (a.avg == null) || (b.avg ?? 0) - (a.avg ?? 0) || b.visits - a.visits
          : b.visits - a.visits || a.name.localeCompare(b.name, "de"));
      listEl.replaceChildren(...items.map((l) => {
        const web = safeUrl(l.url);
        const head = h("span", { style: "flex:1" }, web ? h("a", { href: web, target: "_blank", rel: "noopener noreferrer" }, l.name) : l.name,
          h("span", { class: "muted small" }, ` · ${l.city || ""} · ${l.visits}× zuletzt ${dateShort(l.last)}`));
        if (l.avg == null) return h("div", { class: "row" }, head, h("span", { class: "muted small" }, "noch nicht bewertet"));
        return h("details", { class: "loc" },
          h("summary", { class: "row", style: "border:0" }, head, h("span", { class: "rate", title: `${l.n} Bewertung${l.n === 1 ? "" : "en"}` }, "★ " + fmt1(l.avg))),
          h("div", { style: "padding:0 0 8px" },
            RATING_LABELS.map(([k, label]) => l[k] == null ? null : h("div", { class: "row small" }, h("span", {}, label), h("span", {}, h("span", { class: "stars" }, stars(l[k])), " " + fmt1(l[k])))),
            h("p", { class: "muted small", style: "margin:4px 0 0" }, `${l.n} Bewertung${l.n === 1 ? "" : "en"}, Skala 1 bis 5`)));
      }));
      if (!items.length) listEl.append(h("p", { class: "muted" }, "Nichts gefunden."));
    };
    const search = h("input", { type: "search", placeholder: "Location oder Ort suchen", autocomplete: "off", "aria-label": "Locations durchsuchen", oninput: (e) => draw(e.target.value) });
    const sort = h("select", { "aria-label": "Sortierung", onchange: (e) => { sortBy = e.target.value; draw(search.value); } },
      h("option", { value: "visits" }, "Nach Besuchen"), h("option", { value: "rating" }, "Nach Bewertung"));
    draw("");
    return h("section", { class: "card" },
      h("details", {},
        h("summary", {}, `Besuchte Locations (${all.length})`),
        h("div", { class: "inline", style: "margin-top:10px" }, search, h("div", { style: "flex:0 0 46%" }, sort)),
        listEl));
  }

  function infoCard(d) {
    const b = d.birthday, t = d.budget;
    return card("Sonstiges",
      b && h("div", { class: "row" }, h("span", {}, "Nächster Geburtstag"), h("strong", {}, `${b.name}, ${dateDay(b.date)} (${b.turns})`)),
      h("div", { class: "row" }, h("span", {}, "Kassenstand inkl. Außenstände"), h("strong", {}, euro.format(Number(t.paypal) + Number(t.outstanding))))
    );
  }

  function docLinks(slot, links) {
    const items = [["satzung", "Satzung"], ["gebuehren", "Gebührenordnung"]]
      .map(([key, label]) => [safeUrl(links && links[key], DOC_HOSTS), label]).filter(([u]) => u);
    slot.replaceChildren(...items.flatMap(([u, label]) => [h("a", { href: u, target: "_blank", rel: "noopener noreferrer" }, label), " · "]));
  }

  function footer() {
    const slot = h("span");
    if (linksCache) docLinks(slot, linksCache);
    else rpc("app_links").then((l) => { linksCache = l; docLinks(slot, l); }).catch(() => {});
    return h("p", { class: "center muted small", style: "margin-top:18px" },
      slot,
      h("button", { class: "link", onclick: () => load(true) }, "Aktualisieren"),
      h("br"), "Stand: " + new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }));
  }

  function render(d) {
    const root = h("div", {},
      h("h1", {}, "🍻 Griassgottbeinand"),
      h("p", { class: "hello" }, `Servus, ${d.me.name}!`),
      meetingCard(d), signupCard(d), whoCard(d), accountCard(d),
      (d.me.can_set_next_chair || d.me.can_set_location) ? chairCard(d) : null,
      d.me.is_admin ? (adminCard(d) || card("Admin", h("a", { class: "btn primary full", href: "#admin" }, "Zahlungen und Buchungen"))) : null,
      openCard(d), absencesCard(d), chairsCard(d), locationsCard(d), infoCard(d), footer());
    $app.replaceChildren(root);
  }

  function showNoToken() {
    $app.replaceChildren(h("div", { class: "card center", style: "margin-top:32px" },
      h("p", { class: "big" }, "🍻 Griassgottbeinand"),
      h("p", {}, "Bitte öffne deinen persönlichen Link. Den bekommst du vom Kassier."),
      h("p", { class: "muted small" }, "Dein Link wird auf diesem Gerät gespeichert. Danach reicht das Icon auf dem Startbildschirm.")));
  }

  let lastData = null;
  function show(d) {
    lastData = d;
    if (location.hash === "#admin" && d.me.is_admin && window.Admin) window.Admin.render($app, d);
    else render(d);
  }
  window.addEventListener("hashchange", () => { if (lastData) { show(lastData); window.scrollTo(0, 0); } });

  let loading = false;
  async function load(manual) {
    if (!token) return showNoToken();
    if (loading) return;
    loading = true;
    try {
      const [d, overview] = await Promise.all([rpc("app_dashboard"), rpc("app_overview").catch(() => null)]);
      d.overview = overview;
      show(d);
      if (manual) toast("Aktualisiert.");
    } catch (e) {
      if (e.invalid) { store.clear(); token = ""; showNoToken(); }
      else if (!$app.querySelector(".card")) { $app.replaceChildren(h("div", { class: "card center pad" }, h("p", {}, e.message), h("button", { class: "primary", onclick: () => load() }, "Nochmal versuchen"))); }
      else toast(e.message, true);
    } finally { loading = false; }
  }

  window.App = { h, card, rpc, toast, euro, dateShort, dateLong, stripGast, act, load, friendly };

  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && token) load(); });
  if ("serviceWorker" in navigator && location.protocol !== "file:") navigator.serviceWorker.register("sw.js").catch(() => {});
  load();
})();
