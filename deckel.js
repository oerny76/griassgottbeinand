// Virtueller Bierdeckel: Deckel und Deckelbuch bleiben lokal im Browser (localStorage), nichts davon geht in die Datenbank.
// Nur die Anzahl Bier eines Stammtischabends wird auf Wunsch je Mitglied gespeichert (db/deckel.sql, app_beer_save).
// Reine Rechenfunktionen oben, Oberfläche unten (window.Deckel.render).
(function (root) {
  "use strict";

  const cents = (n) => Math.round(Number(n) * 100);

  // Summe der Posten mit Preis; units_no_price zählt Stück ohne Preis.
  function summary(items) {
    let sum = 0, noPrice = 0, beers = 0;
    for (const i of items) {
      if (i.price == null) noPrice += i.qty; else sum += i.qty * cents(i.price);
      if (i.cat === "beer") beers += i.qty;
    }
    return { total: sum / 100, units_no_price: noPrice, beers };
  }

  // "4,20" oder "4.20" -> 4.2; leer oder ungültig -> null
  function parsePrice(s) {
    const t = String(s == null ? "" : s).trim().replace(",", ".");
    if (!t) return null;
    const n = Number(t);
    return Number.isFinite(n) && n >= 0 && n < 1000 ? Math.round(n * 100) / 100 : null;
  }

  // Tipp auf eine Schnellwahl oder Freitext: gleiche Zeile (Name und Preis gleich) wird um 1 erhöht.
  function addItem(items, label, cat, price) {
    const hit = items.find((i) => i.label === label && i.price === price);
    if (hit) hit.qty += 1; else items.push({ label, cat, qty: 1, price });
    return items;
  }

  const api = { summary, parsePrice, addItem };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.Deckel = Object.assign(root.Deckel || {}, api);
})(typeof window !== "undefined" ? window : globalThis);

(function (root) {
  "use strict";
  if (typeof document === "undefined" || !root.App) return;
  const { h, card, euro, dateShort, toast, rpc } = root.App;
  const KEY = "stammtisch_deckel_v1";
  // "beer" zählt für die Bier-Statistik (Radler, Alkoholfreies, Spezi und Essen nicht).
  const CHIPS = [
    ["Helles", "beer"], ["Weißbier", "beer"], ["Dunkles", "beer"], ["Kellerbier", "beer"], ["Draftbier", "beer"], ["Radler", "other"],
    ["Helles alkoholfrei", "nonalc"], ["Weißbier alkoholfrei", "nonalc"], ["Dunkles alkoholfrei", "nonalc"], ["Radler alkoholfrei", "nonalc"],
    ["Spezi", "soft"], ["Wasser", "soft"], ["Apfelschorle", "soft"], ["Essen", "food"],
  ];

  const empty = () => ({ open: null, book: [], prices: {} });
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));
  function load() {
    try {
      const v = JSON.parse(localStorage.getItem(KEY));
      const s = v && typeof v === "object" ? Object.assign(empty(), v) : empty();
      for (const b of s.book) if (!b.id) b.id = uid();
      return s;
    } catch { return empty(); }
  }
  function save(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { toast("Speichern auf diesem Gerät nicht möglich.", true); } }

  const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });
  const priceKey = (loc, label) => `${loc || ""}|${label}`;
  const qtyText = (i) => `${i.qty}× ${i.label}`;
  const money = (n) => euro.format(n);
  const LOCAL_NOTE = "Lokal gespeichert: Deckel und Deckelbuch liegen nur in diesem Browser auf diesem Gerät. Sie werden nirgends hochgeladen und verschwinden, wenn du sie löschst oder die Browserdaten löschst.";

  function render(ctx) {
    const loc = (ctx && ctx.location) || "";
    const meetingDate = (ctx && ctx.meetingDate) || null; // Datum des Stammtischs, wenn heute einer ist
    const state = load();
    let view = "deck"; // deck | bill | asked
    let share = true; // Biermenge am Stammtisch zählen
    let saving = false;
    const box = h("div", {});
    const commit = () => { save(state); draw(); };
    // Biere dieses Abends aus allen lokalen Deckeln, die gezählt wurden
    const sharedBeers = (date, exceptId) => state.book.filter((b) => b.date === date && b.shared && b.id !== exceptId).reduce((a, b) => a + (b.beers || 0), 0);

    function lineView(item, idx) {
      const price = h("input", {
        type: "text", inputmode: "decimal", placeholder: "€ je Stück", value: item.price == null ? "" : String(item.price).replace(".", ","),
        "aria-label": `Preis je Stück für ${item.label}`, style: "width:7rem",
        onchange: (e) => {
          const p = root.Deckel.parsePrice(e.target.value);
          item.price = p;
          if (p != null) state.prices[priceKey(loc, item.label)] = p;
          commit();
        },
      });
      const change = (d) => { item.qty += d; if (item.qty <= 0) state.open.items.splice(idx, 1); commit(); };
      return h("div", { class: "row" },
        h("span", {}, h("strong", {}, qtyText(item)), item.price != null ? h("span", { class: "muted" }, ` · ${money(item.qty * item.price)}`) : null),
        h("span", { class: "inline", style: "flex:0 0 auto;align-items:center" },
          h("button", { type: "button", class: "link", "aria-label": `${item.label} weniger`, onclick: () => change(-1) }, "−"),
          h("button", { type: "button", class: "link", "aria-label": `${item.label} mehr`, onclick: () => change(1) }, "+"),
          price));
    }

    function add(label, cat) {
      const remembered = state.prices[priceKey(loc, label)];
      root.Deckel.addItem(state.open.items, label, cat, remembered == null ? null : remembered);
      commit();
    }

    const note = () => h("p", { class: "muted small", style: "margin:10px 0 0" }, LOCAL_NOTE);

    function deckView() {
      const o = state.open;
      if (!o) {
        return [card("Mein Deckel",
          h("p", { class: "muted", style: "margin:0 0 10px" }, "Schreib auf, was du bestellst, und lass dir am Ende die Schlussrechnung geben."),
          h("button", { class: "primary full", onclick: () => { state.open = { started: today(), location: loc, items: [] }; commit(); } }, "Neuen Deckel starten"),
          note())];
      }
      const s = root.Deckel.summary(o.items);
      const free = h("input", { type: "text", placeholder: "Etwas anderes, z. B. Salat", autocomplete: "off", "aria-label": "Eigene Bestellung" });
      const addFree = () => { const v = free.value.trim(); if (!v) { free.focus(); return; } add(v, "other"); };
      free.addEventListener("keydown", (e) => { if (e.key === "Enter") addFree(); });
      return [card("Mein Deckel",
        h("p", { class: "muted small", style: "margin:0 0 8px" }, `${dateShort(o.started)}${o.location ? " · " + o.location : ""}`),
        h("ul", { class: "chips" }, CHIPS.map(([label, cat]) => h("li", {}, h("button", { type: "button", class: "chip", onclick: () => add(label, cat) }, "+ " + label)))),
        h("div", { class: "inline", style: "margin-top:10px" }, free, h("button", { type: "button", onclick: addFree }, "Hinzufügen")),
        o.items.length ? h("div", { style: "margin-top:12px" }, o.items.map(lineView)) : h("p", { class: "muted", style: "margin:12px 0 0" }, "Noch nichts bestellt."),
        h("div", { class: "dk-sticky" },
          o.items.length ? h("div", { style: "margin-bottom:8px" },
            h("span", { class: "muted small" }, "Zwischenstand "),
            h("strong", { class: "total", style: "font-size:1.25rem" }, money(s.total)),
            s.units_no_price ? h("span", { class: "muted small" }, `  + ${s.units_no_price} Stück ohne Preis`) : null) : null,
          h("div", { class: "inline" },
            h("button", { class: "primary", disabled: !o.items.length, style: "flex:1", onclick: () => { view = "bill"; draw(); } }, "Schlussrechnung"),
            h("button", { class: "link", onclick: () => { if (!o.items.length || confirm("Deckel verwerfen?")) { state.open = null; commit(); } } }, "Verwerfen"))),
        note())];
    }

    function billLines(items) {
      return items.map((i) => h("div", { class: "row" },
        h("span", {}, qtyText(i)),
        h("strong", {}, i.price == null ? "ohne Preis" : money(i.qty * i.price))));
    }

    function finish(keep, counted) {
      const o = state.open, s = root.Deckel.summary(o.items);
      if (keep) state.book.unshift({ id: uid(), date: o.started, location: o.location, items: o.items, total: s.total, no_price: s.units_no_price, beers: s.beers, shared: counted });
      state.open = null; view = "deck"; save(state); draw();
    }

    function billView() {
      const o = state.open, s = root.Deckel.summary(o.items);
      const atMeeting = !!meetingDate && o.started === meetingDate && s.beers > 0;
      const body = [
        h("p", { class: "muted small", style: "margin:0" }, "Zu zahlen ungefähr"),
        h("p", { class: "total", style: "margin:0 0 10px" }, money(s.total)),
        s.units_no_price ? h("p", { class: "muted small", style: "margin:0 0 10px" }, `Ohne ${s.units_no_price} Stück, bei denen kein Preis steht.`) : null,
        h("div", {}, billLines(o.items)),
      ];
      if (view === "bill") {
        body.push(h("p", { style: "margin:14px 0 6px" }, h("strong", {}, "Hast du abgerechnet?")),
          h("div", { class: "inline" },
            h("button", { class: "primary", style: "flex:1", onclick: () => { view = "asked"; draw(); } }, "Ja"),
            h("button", { style: "flex:1", onclick: () => { view = "deck"; draw(); } }, "Nein, weiter bestellen")));
      } else {
        body.push(h("p", { style: "margin:14px 0 6px" }, h("strong", {}, "In mein Deckelbuch speichern?")),
          h("p", { class: "muted small", style: "margin:0 0 8px" }, "Es bleibt nur auf diesem Gerät."));
        if (atMeeting) {
          const cb = h("input", { type: "checkbox", id: "dk-share", checked: share ? "" : null, onchange: (e) => { share = e.target.checked; } });
          body.push(h("label", { for: "dk-share", style: "display:flex;gap:8px;align-items:flex-start;margin:0 0 10px" }, cb,
            h("span", { class: "small" }, `Heute ist Stammtisch: ${s.beers} Bier für die Bier-Statistik zählen. Gespeichert wird nur diese Zahl mit deinem Namen, keine Preise und nichts anderes. Bei „Nein, verwerfen“ wird nichts gezählt.`)));
        }
        body.push(h("div", { class: "inline" },
          h("button", { class: "primary", style: "flex:1", disabled: saving, onclick: async () => {
            const count = atMeeting && share;
            if (count) {
              saving = true; draw();
              try { await rpc("app_beer_save", { p_date: o.started, p_beers: sharedBeers(o.started) + s.beers }); }
              catch (e) { saving = false; toast(e.message, true); draw(); return; }
              saving = false; toast(`${s.beers} Bier gezählt.`);
            }
            finish(true, count);
          } }, "Ja, speichern"),
          h("button", { style: "flex:1", disabled: saving, onclick: () => finish(false, false) }, "Nein, verwerfen")));
      }
      return [card("Schlussrechnung", ...body)];
    }

    function bookView() {
      const list = state.book;
      if (!list.length) return [];
      const beers = list.reduce((a, b) => a + (b.beers || 0), 0);
      return [card("Deckelbuch",
        h("p", { class: "muted small", style: "margin:0 0 6px" }, `${list.length} Abende, ${beers} Bier.`),
        list.map((b) => h("details", {},
          h("summary", {}, `${dateShort(b.date)}${b.location ? " · " + b.location : ""} · ${money(b.total)}${b.no_price ? " +" : ""}`),
          h("div", { style: "margin-top:6px" }, billLines(b.items)),
          b.shared ? h("p", { class: "muted small", style: "margin:6px 0 0" }, `${b.beers} Bier wurden in der Bier-Statistik gezählt.`) : null,
          h("button", { class: "link", onclick: async () => {
            if (!confirm(b.shared ? "Eintrag löschen? Die gezählten Biere dieses Abends werden dann auch aus der Bier-Statistik entfernt." : "Diesen Eintrag löschen?")) return;
            if (b.shared) {
              const rest = sharedBeers(b.date, b.id);
              try { await (rest > 0 ? rpc("app_beer_save", { p_date: b.date, p_beers: rest }) : rpc("app_beer_delete", { p_date: b.date })); }
              catch (e) { toast(e.message, true); return; }
            }
            state.book = state.book.filter((x) => x.id !== b.id); commit();
          } }, "Löschen"))),
        note())];
    }

    function draw() {
      const main = state.open && view !== "deck" ? billView() : (view = "deck", deckView());
      box.replaceChildren(...main, ...bookView());
      if (ctx && ctx.onChange) ctx.onChange();
    }
    draw();
    return box;
  }

  // ---------- Schwebender Knopf unten rechts mit Overlay ----------
  const COASTER = "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM8 12h8M12 8v8";
  let fab = null, back = null, sheetBody = null, closeBtn = null, getCtx = () => ({});

  function openUnits() {
    const o = load().open;
    return o ? o.items.reduce((a, i) => a + i.qty, 0) : 0;
  }
  function updateBadge() {
    if (!fab) return;
    const n = openUnits(), b = fab.querySelector(".dk-badge");
    b.textContent = String(n); b.hidden = n === 0;
    fab.setAttribute("aria-label", n ? `Mein Deckel öffnen, ${n} Posten` : "Mein Deckel öffnen");
  }
  function openSheet() {
    sheetBody.replaceChildren(render(Object.assign({}, getCtx(), { onChange: updateBadge })));
    back.hidden = false; document.body.style.overflow = "hidden";
    closeBtn.focus();
  }
  function closeSheet() {
    if (!back || back.hidden) return;
    back.hidden = true; document.body.style.overflow = "";
    updateBadge(); fab.focus();
  }
  function mount(ctxFn) {
    getCtx = ctxFn;
    if (fab) { fab.hidden = false; updateBadge(); return; }
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24"); svg.setAttribute("aria-hidden", "true");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path"); path.setAttribute("d", COASTER); svg.append(path);
    fab = h("button", { type: "button", class: "dk-fab", "aria-haspopup": "dialog", onclick: openSheet }, svg, h("span", { class: "dk-badge", hidden: "" }));
    closeBtn = h("button", { type: "button", class: "link", onclick: closeSheet }, "Schließen");
    sheetBody = h("div", { class: "dk-body" });
    back = h("div", { class: "dk-back", hidden: "", onclick: (e) => { if (e.target === back) closeSheet(); } },
      h("div", { class: "dk-sheet", role: "dialog", "aria-modal": "true", "aria-label": "Mein Deckel" },
        h("div", { class: "dk-head" }, h("strong", {}, "🍺 Mein Deckel"), closeBtn), sheetBody));
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeSheet(); });
    document.body.append(fab, back);
    updateBadge();
  }
  function hide() { if (fab) { closeSheet(); fab.hidden = true; } }

  root.Deckel = Object.assign(root.Deckel || {}, { render, mount, hide });
})(typeof window !== "undefined" ? window : globalThis);
