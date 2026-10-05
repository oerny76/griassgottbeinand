// Virtueller Bierdeckel (Phase 1): läuft nur auf diesem Gerät (localStorage), nichts geht an die Datenbank.
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
  const { h, card, euro, dateShort, toast } = root.App;
  const KEY = "stammtisch_deckel_v1";
  const CHIPS = [
    ["Helles", "beer"], ["Weißbier", "beer"], ["Dunkles", "beer"], ["Radler", "beer"],
    ["Spezi", "soft"], ["Wasser", "soft"], ["Apfelschorle", "soft"], ["Essen", "food"],
  ];

  const empty = () => ({ open: null, book: [], prices: {} });
  function load() {
    try { const v = JSON.parse(localStorage.getItem(KEY)); return v && typeof v === "object" ? Object.assign(empty(), v) : empty(); } catch { return empty(); }
  }
  function save(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { toast("Speichern auf diesem Gerät nicht möglich.", true); } }

  const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });
  const priceKey = (loc, label) => `${loc || ""}|${label}`;
  const qtyText = (i) => `${i.qty}× ${i.label}`;
  const money = (n) => euro.format(n);

  function render(ctx) {
    const loc = (ctx && ctx.location) || "";
    const state = load();
    let view = "deck"; // deck | bill | asked
    const box = h("div", {});
    const commit = () => { save(state); draw(); };

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

    function deckView() {
      const o = state.open;
      if (!o) {
        return [card("Mein Deckel",
          h("p", { class: "muted", style: "margin:0 0 10px" }, "Schreib auf, was du bestellst, und lass dir am Ende die Schlussrechnung geben. Der Deckel bleibt auf diesem Gerät und ist nur für dich."),
          h("button", { class: "primary full", onclick: () => { state.open = { started: today(), location: loc, items: [] }; commit(); } }, "Neuen Deckel starten"))];
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
        o.items.length ? h("div", { style: "margin-top:12px" },
          h("p", { class: "muted small", style: "margin:0" }, "Zwischenstand"),
          h("p", { class: "total", style: "margin:0" }, money(s.total)),
          s.units_no_price ? h("p", { class: "muted small", style: "margin:2px 0 0" }, `+ ${s.units_no_price} Stück ohne Preis`) : null) : null,
        h("div", { class: "inline", style: "margin-top:12px" },
          h("button", { class: "primary", disabled: !o.items.length, style: "flex:1", onclick: () => { view = "bill"; draw(); } }, "Schlussrechnung"),
          h("button", { class: "link", onclick: () => { if (!o.items.length || confirm("Deckel verwerfen?")) { state.open = null; commit(); } } }, "Verwerfen")))];
    }

    function billLines(items) {
      return items.map((i) => h("div", { class: "row" },
        h("span", {}, qtyText(i)),
        h("strong", {}, i.price == null ? "ohne Preis" : money(i.qty * i.price))));
    }

    function billView() {
      const o = state.open, s = root.Deckel.summary(o.items);
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
          h("p", { class: "muted small", style: "margin:0 0 8px" }, "Das siehst nur du, auf diesem Gerät."),
          h("div", { class: "inline" },
            h("button", { class: "primary", style: "flex:1", onclick: () => { state.book.unshift({ date: o.started, location: o.location, items: o.items, total: s.total, no_price: s.units_no_price, beers: s.beers }); state.open = null; view = "deck"; save(state); draw(); toast("Im Deckelbuch gespeichert."); } }, "Ja, speichern"),
            h("button", { style: "flex:1", onclick: () => { state.open = null; view = "deck"; commit(); } }, "Nein, verwerfen")));
      }
      return [card("Schlussrechnung", ...body)];
    }

    function bookView() {
      if (!state.book.length) return [];
      const beers = state.book.reduce((a, b) => a + (b.beers || 0), 0);
      return [card("Deckelbuch",
        h("p", { class: "muted small", style: "margin:0 0 6px" }, `${state.book.length} Abende, ${beers} Bier. Nur auf diesem Gerät.`),
        state.book.map((b, n) => h("details", {},
          h("summary", {}, `${dateShort(b.date)}${b.location ? " · " + b.location : ""} · ${money(b.total)}${b.no_price ? " +" : ""}`),
          h("div", { style: "margin-top:6px" }, billLines(b.items)),
          h("button", { class: "link", onclick: () => { if (confirm("Diesen Eintrag löschen?")) { state.book.splice(n, 1); commit(); } } }, "Löschen"))))];
    }

    function draw() {
      const main = state.open && view !== "deck" ? billView() : (view = "deck", deckView());
      box.replaceChildren(...main, ...bookView());
    }
    draw();
    return box;
  }

  root.Deckel = Object.assign(root.Deckel || {}, { render });
})(typeof window !== "undefined" ? window : globalThis);
