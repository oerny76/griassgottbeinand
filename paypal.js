// Reine Logik ohne Oberfläche: PayPal-Mail auslesen und Zahlung offenen Posten zuordnen.
(function (root) {
  "use strict";

  const MONTHS = { januar: 1, februar: 2, "märz": 3, maerz: 3, april: 4, mai: 5, juni: 6, juli: 7, august: 8, september: 9, oktober: 10, november: 11, dezember: 12 };

  // Liest den eingefügten Mailtext. Fehlende Felder bleiben leer, es wird nie etwas geraten.
  function parsePayPal(text) {
    const t = String(text || "");
    const out = { tx_code: null, tx_date: null, amount: null, from_name: null, message: "" };
    const code = t.match(/Transaktionscode\s*([A-Z0-9]{12,25})/i);
    if (code) out.tx_code = code[1].toUpperCase();
    const d = t.match(/Transaktionsdatum\s*(\d{1,2})\.\s*([A-Za-zäöüÄÖÜ]+)\s*(\d{4})/);
    if (d && MONTHS[d[2].toLowerCase()]) out.tx_date = `${d[3]}-${String(MONTHS[d[2].toLowerCase()]).padStart(2, "0")}-${d[1].padStart(2, "0")}`;
    const b = t.match(/Erhaltener Betrag\s*(-?[\d.]+,\d{2})/);
    if (b) out.amount = Math.round(parseFloat(b[1].replace(/\./g, "").replace(",", ".")) * 100) / 100;
    const m = t.match(/Mitteilung von\s+(.+?)(?:\t+|[ ]{2,}|\n|$)([^\n]*)/);
    if (m) { out.from_name = m[1].trim(); out.message = (m[2] || "").trim(); }
    return out;
  }

  const cents = (n) => Math.round(Number(n) * 100);

  // Findet alle Teilmengen offener Posten, die genau den Betrag ergeben (höchstens 40 Treffer).
  function subsets(items, target) {
    const list = items.slice(0, 22);
    const found = [];
    (function walk(i, sum, picked) {
      if (found.length >= 40) return;
      if (sum === target) { found.push(picked.slice()); return; }
      if (i >= list.length || sum > target) return;
      picked.push(i); walk(i + 1, sum + cents(list[i].open), picked); picked.pop();
      walk(i + 1, sum, picked);
    })(0, 0, []);
    return found.map((idx) => idx.map((i) => list[i]));
  }

  // items: offene Posten, älteste zuerst. Ergebnis:
  //  kind "all"       alles offene wird beglichen
  //  kind "exact"     genau eine eindeutige Zuordnung
  //  kind "ambiguous" mehrere Zuordnungen möglich, variants enthält die Kandidaten
  //  kind "none"      keine passende Kombination
  function suggest(items, amount) {
    const target = cents(amount);
    const total = items.reduce((s, i) => s + cents(i.open), 0);
    if (!items.length) return { kind: "none", variants: [] };
    if (total === target) return { kind: "all", variants: [items.slice()] };
    const sols = subsets(items, target);
    if (!sols.length) return { kind: "none", variants: [] };
    const sig = (s) => s.map((i) => `${i.category}|${cents(i.open)}`).sort().join(";");
    const order = new Map(items.map((i, n) => [i.id, n]));
    const score = (s) => s.reduce((a, i) => a + order.get(i.id), 0);
    const bySig = new Map();
    for (const s of sols) {
      const k = sig(s);
      if (!bySig.has(k) || score(s) < score(bySig.get(k))) bySig.set(k, s);
    }
    const variants = [...bySig.values()].sort((a, b) => score(a) - score(b)).slice(0, 5);
    return { kind: variants.length === 1 ? "exact" : "ambiguous", variants };
  }

  // Älteste zuerst füllen; letzter Posten ggf. nur teilweise. rest > 0 bedeutet: mehr gezahlt als offen.
  function fifo(items, amount) {
    let left = cents(amount);
    const picks = [];
    for (const i of items) {
      if (left <= 0) break;
      const take = Math.min(left, cents(i.open));
      picks.push({ id: i.id, amount: take / 100 });
      left -= take;
    }
    return { picks, rest: left / 100 };
  }

  const api = { parsePayPal, suggest, fifo, cents };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.StammtischLogic = api;
})(typeof window !== "undefined" ? window : globalThis);
