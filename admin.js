// Admin-Bereich (Tab "Admin" in der App): PayPal-Zahlungen zuordnen, manuell buchen, offene Posten, letzte Buchungen.
(() => {
  "use strict";
  const L = window.StammtischLogic;
  const A = () => window.App;
  const TABS = [["pay", "Zahlung"], ["book", "Buchen"], ["open", "Offen"], ["recent", "Letzte"]];
  let tab = "pay";
  let meta = null;
  let nextMeetingDate = null;
  let P = freshPay();

  function freshPay() { return { raw: "", parsed: null, member: "", fromHint: "", dup: false, rows: [], extra: [], alias: true, suggestion: null }; }
  async function getMeta() { if (!meta) meta = await A().rpc("app_admin_meta"); return meta; }

  const field = (label, input, id) => A().h("div", {}, A().h("label", { for: id }, label), input);
  const opts = (names, sel, placeholder) => [placeholder != null ? A().h("option", { value: "" }, placeholder) : null,
    ...names.map((n) => A().h("option", { value: n, selected: n === sel }, n))];
  const eur = (n) => A().euro.format(Number(n));
  const num = (el) => (el.value === "" ? NaN : Number(el.value));

  function render($box, d) {
    const { h } = A();
    nextMeetingDate = d.meeting ? d.meeting.date : null;
    const body = h("div", {});
    const nav = h("div", { class: "inline", style: "margin:0 0 12px", role: "tablist" },
      TABS.map(([id, label]) => h("button", {
        class: id === tab ? "primary full" : "full", role: "tab", "aria-selected": String(id === tab), style: "flex:1 1 0;min-width:0;padding:10px 2px;font-size:.82rem",
        onclick: () => { tab = id; render($box, d); },
      }, label)));
    $box.replaceChildren(h("div", {}, h("p", { class: "muted small", style: "margin:0 0 12px" }, "Nur du kannst hier buchen und verwalten."), nav, body));
    ({ pay: payTab, book: bookTab, open: openTab, recent: recentTab })[tab](body).catch((e) => A().toast(e.message, true));
  }

  // Wird von der App aufgerufen. d: Dashboard des Admins.
  window.AdminView = { render(d) { const box = A().h("div", {}); render(box, d); return box; } };

  // ---------- Zahlung erfassen ----------
  async function payTab(body) {
    const { h, card } = A();
    const m = await getMeta();
    const result = h("div", {});
    const ta = h("textarea", {
      id: "raw", rows: "6", spellcheck: "false", placeholder: "Text aus der PayPal-Mail hier einfügen",
      style: "width:100%;min-height:120px;padding:10px 12px;border-radius:12px;border:1px solid var(--line);background:var(--bg);color:var(--ink);font:inherit",
    });
    ta.value = P.raw;
    let timer;
    ta.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(() => { P = Object.assign(freshPay(), { raw: ta.value }); analyze(result, m); }, 300); });
    body.append(card("Zahlung aus PayPal-Mail (Eingang oder Ausgang)", field("Mailtext", ta, "raw"),
      h("p", { class: "muted small", style: "margin:8px 0 0" }, "Es wird nur Betrag, Datum, Code, Absender und Mitteilung gelesen. Fehlt etwas, wird nichts gebucht.")), result);
    if (P.raw) analyze(result, m);
  }

  async function analyze(result, m) {
    const { h, card } = A();
    const parsed = L.parsePayPal(P.raw);
    P.parsed = parsed;
    if (!P.raw.trim()) { result.replaceChildren(); return; }
    const missing = [["Betrag", parsed.amount], ["Datum", parsed.tx_date], ["Transaktionscode", parsed.tx_code]].filter(([, v]) => v == null).map(([k]) => k);
    if (missing.length || parsed.amount <= 0) {
      result.replaceChildren(card("Nicht lesbar", h("p", { class: "notice" }, `Es fehlt: ${missing.join(", ") || "positiver Betrag"}. Bitte den vollständigen Block aus der Mail einfügen.`)));
      return;
    }
    try {
      const lk = await A().rpc("app_admin_lookup", { p_from: parsed.from_name || "", p_tx_code: parsed.tx_code });
      P.dup = lk.duplicate;
      if (!P.member && lk.member) P.member = lk.member;
    } catch (e) { A().toast(e.message, true); return; }
    await drawPayment(result, m);
  }

  async function drawPayment(result, m) {
    const { h, card } = A();
    const p = P.parsed;
    const memberSel = h("select", { id: "payMember" }, opts(m.members, P.member, "Bitte wählen"));
    memberSel.addEventListener("change", async () => { P.member = memberSel.value; P.rows = []; P.extra = []; try { await loadItems(); } catch (e) { A().toast(e.message, true); } drawAlloc(); });
    const info = h("div", {},
      h("div", { class: "row" }, h("span", {}, "Betrag"), h("strong", {}, eur(p.amount))),
      h("div", { class: "row" }, h("span", {}, "Datum"), h("strong", {}, A().dateShort(p.tx_date))),
      h("div", { class: "row" }, h("span", {}, p.out ? "Empfänger" : "Absender"), h("strong", {}, p.from_name || "unbekannt")),
      h("div", { class: "row" }, h("span", {}, "Mitteilung"), h("span", {}, p.message || "–")),
      h("div", { class: "row" }, h("span", {}, "Code"), h("span", { class: "small" }, p.tx_code)));
    const aliasBox = h("div", { id: "aliasBox" });
    const allocBox = h("div", { id: "allocBox" });
    result.replaceChildren(card(p.out ? "Zahlungsausgang" : "Zahlung",
      P.dup ? h("p", { class: "notice" }, "Diese Zahlung ist schon gebucht (Transaktionscode bekannt). Es wird nichts doppelt gebucht.") : null,
      info,
      h("div", { style: "margin-top:12px" }, field(p.out ? "An wen ging die Zahlung?" : "Wem gehört die Zahlung?", memberSel, "payMember")), aliasBox), allocBox);
    if (!P.dup) { if (P.member) await loadItems(); drawAlloc(); }
  }

  async function loadItems() {
    if (!P.member) { P.rows = []; P.suggestion = null; return; }
    const items = await A().rpc("app_admin_open_items", { p_member: P.member, p_out: !!P.parsed.out });
    P.rows = items.map((i) => ({ id: i.id, date: i.date, category: i.category, sub: i.sub, open: Number(i.open), checked: false, amt: Number(i.open) }));
    const s = L.suggest(P.rows.map((r) => ({ id: r.id, category: r.category, open: r.open })), P.parsed.amount);
    P.suggestion = s;
    if (s.kind === "all" || s.kind === "exact") applyVariant(s.variants[0].map((i) => i.id));
  }

  function applyVariant(ids) {
    P.rows.forEach((r) => { r.checked = ids.includes(r.id); r.amt = r.open; });
    P.extra = [];
  }

  function drawAlloc() {
    const { h, card, toast } = A();
    const box = document.getElementById("allocBox");
    const aliasBox = document.getElementById("aliasBox");
    if (!box) return;
    if (P.dup) { box.replaceChildren(); return; }
    const p = P.parsed;
    aliasBox.replaceChildren();
    if (!p.out && P.member && p.from_name && p.from_name.toLowerCase() !== P.member.toLowerCase()) {
      const cb = h("input", { type: "checkbox", id: "aliasCb", checked: P.alias, style: "width:auto;min-height:0", onchange: (e) => { P.alias = e.target.checked; } });
      aliasBox.append(h("label", { for: "aliasCb", style: "display:flex;gap:8px;align-items:center;margin-top:10px;color:var(--ink)" }, cb, `„${p.from_name}“ künftig ${P.member} zuordnen`));
    }
    if (!P.member) { box.replaceChildren(card("Zuordnung", h("p", { class: "muted", style: "margin:0" }, "Bitte zuerst das Mitglied wählen."))); return; }

    const s = P.suggestion;
    const hint = [];
    if (!P.rows.length) hint.push(h("p", { class: "notice" }, p.out ? `${P.member} hat keine offenen Ausgaben. Erfasse die Zahlung unten als neue Ausgabe.` : `${P.member} hat keine offenen Posten. Du kannst die Zahlung unten als neue Buchung erfassen (z. B. Vorauszahlung).`));
    else if (s && s.kind === "all") hint.push(h("p", { class: "muted small", style: "margin:0 0 8px" }, "Der Betrag deckt alle offenen Posten."));
    else if (s && s.kind === "exact") hint.push(h("p", { class: "muted small", style: "margin:0 0 8px" }, "Eindeutig zugeordnet. Bitte kurz prüfen."));
    else if (s && s.kind === "ambiguous") {
      hint.push(h("p", { class: "notice" }, "Mehrere Zuordnungen sind möglich. Bitte eine Variante wählen:"));
      hint.push(h("div", { class: "stack", style: "margin-bottom:10px" }, s.variants.map((v) =>
        h("button", { class: "full", onclick: () => { applyVariant(v.map((i) => i.id)); drawAlloc(); } }, v.map((i) => `${i.category.replace(" (1x)", "")} ${eur(i.open)}`).join(" + ")))));
    } else if (s && s.kind === "none") {
      hint.push(h("p", { class: "notice" }, "Kein Posten passt genau zum Betrag. Ordne von Hand zu, fülle die ältesten zuerst oder erfasse den Rest neu."));
    }

    const rows = P.rows.map((r) => {
      const amt = h("input", { type: "number", step: "0.01", min: "0.01", max: String(r.open), value: String(r.amt), disabled: !r.checked, "aria-label": "Teilbetrag", style: "width:96px;min-height:40px", oninput: (e) => { r.amt = num(e.target); updateSummary(); } });
      const cb = h("input", { type: "checkbox", id: "r" + r.id, checked: r.checked, style: "width:auto;min-height:0", onchange: (e) => { r.checked = e.target.checked; amt.disabled = !r.checked; if (r.checked && !(r.amt > 0)) { r.amt = r.open; amt.value = String(r.open); } updateSummary(); } });
      return h("div", { class: "row" },
        h("label", { for: "r" + r.id, style: "display:flex;gap:8px;align-items:center;margin:0;color:var(--ink);flex:1" }, cb,
          h("span", {}, A().dateShort(r.date), " · ", r.category, r.sub ? h("span", { class: "muted" }, " (" + A().stripGast(r.sub) + ")") : null, h("span", { class: "muted" }, " · offen " + eur(r.open)))),
        amt);
    });

    const extraRows = P.extra.map((x, idx) => {
      const cat = h("select", { "aria-label": "Kategorie", onchange: (e) => { x.category = e.target.value; } }, opts(meta.categories.filter((c) => !P.parsed.out || c.expense).map((c) => c.name), x.category));
      const sub = h("input", { type: "text", maxlength: "80", placeholder: "Zusatz (optional)", value: x.sub, "aria-label": "Zusatz", oninput: (e) => { x.sub = e.target.value; } });
      const amt = h("input", { type: "number", step: "0.01", min: "0.01", value: String(x.amount), "aria-label": "Betrag", style: "flex:0 0 88px;min-width:0", oninput: (e) => { x.amount = num(e.target); updateSummary(); } });
      const date = h("input", { type: "date", value: x.date, style: "min-width:0", "aria-label": "Datum der Buchung", onchange: (e) => { x.date = e.target.value; } });
      return h("div", { class: "stack", style: "padding:10px 0;border-top:1px solid var(--line)" },
        h("div", { class: "muted small" }, P.parsed.out ? "Neue Ausgabe (wird sofort als ausgezahlt gebucht)" : "Neue Buchung (wird sofort als bezahlt gebucht)"), cat, sub,
        h("div", { class: "inline" }, date, amt, h("button", { class: "link", onclick: () => { P.extra.splice(idx, 1); drawAlloc(); } }, "Entfernen")));
    });

    const summary = h("p", { id: "sum", style: "margin:12px 0 0;font-weight:700" });
    const bookBtn = h("button", { id: "bookBtn", class: "primary full", style: "margin-top:12px", onclick: book }, p.out ? "Ausgang buchen" : "Zahlung buchen");
    const tools = h("div", { class: "inline", style: "margin-top:10px;flex-wrap:wrap" },
      P.rows.length ? h("button", { onclick: () => { const f = L.fifo(P.rows, p.amount); P.rows.forEach((r) => { const pk = f.picks.find((x) => x.id === r.id); r.checked = !!pk; r.amt = pk ? pk.amount : r.open; }); P.extra = []; if (f.rest > 0) addExtra(f.rest); drawAlloc(); } }, "Älteste zuerst füllen") : null,
      h("button", { onclick: () => { addExtra(Math.max(0, remainder())); drawAlloc(); } }, "Rest neu buchen"));
    box.replaceChildren(card("Zuordnung", ...hint, ...rows, ...extraRows, tools, summary, bookBtn));
    updateSummary();
  }

  function addExtra(amount) {
    P.extra.push({ category: P.parsed.out ? "Sonstiges" : "Abwesenheit (1x)", sub: P.parsed.out ? (P.parsed.message || "").slice(0, 80) : "", amount: Math.round(amount * 100) / 100 || 0, date: nextMeetingDate || P.parsed.tx_date });
  }
  const allocatedCents = () =>
    P.rows.filter((r) => r.checked).reduce((s, r) => s + (r.amt > 0 ? L.cents(r.amt) : 0), 0) + P.extra.reduce((s, x) => s + (x.amount > 0 ? L.cents(x.amount) : 0), 0);
  const remainder = () => (L.cents(P.parsed.amount) - allocatedCents()) / 100;

  function updateSummary() {
    const sum = document.getElementById("sum"), btn = document.getElementById("bookBtn");
    if (!sum || !btn) return;
    const rest = remainder();
    const bad = P.rows.some((r) => r.checked && !(r.amt > 0 && L.cents(r.amt) <= L.cents(r.open))) || P.extra.some((x) => !(x.amount > 0) || !x.date);
    sum.textContent = `Zugeordnet ${eur(allocatedCents() / 100)} von ${eur(P.parsed.amount)}` + (rest !== 0 ? ` (${rest > 0 ? "noch " + eur(rest) : "zu viel " + eur(-rest)})` : " ✓");
    sum.style.color = rest === 0 && !bad ? "var(--ok)" : "var(--ink)";
    btn.disabled = rest !== 0 || bad || (!P.rows.some((r) => r.checked) && !P.extra.length);
  }

  async function book(e) {
    const p = P.parsed;
    const allocs = [
      ...P.rows.filter((r) => r.checked).map((r) => ({ entry_id: r.id, amount: r.amt })),
      ...P.extra.map((x) => ({ category: x.category, sub: x.sub, amount: x.amount, date: x.date })),
    ];
    if (p.out) {
      await A().act(e.currentTarget, () => A().rpc("app_admin_book_payout", {
        p_tx_code: p.tx_code, p_tx_date: p.tx_date, p_message: p.message || "", p_amount: p.amount, p_member: P.member, p_allocs: allocs,
      }), (r) => { P = freshPay(); return `Ausgang gebucht: ${eur(-r.amount)} an ${r.member}.`; });
      return;
    }
    await A().act(e.currentTarget, () => A().rpc("app_admin_book_payment", {
      p_tx_code: p.tx_code, p_tx_date: p.tx_date, p_from: p.from_name || "", p_message: p.message || "", p_amount: p.amount,
      p_member: P.member, p_allocs: allocs, p_alias: P.alias,
    }), (r) => { P = freshPay(); return `Gebucht: ${eur(r.amount)} für ${r.member}.`; });
  }

  // ---------- Manuell buchen ----------
  async function bookTab(body) {
    const { h, card, toast } = A();
    const m = await getMeta();
    const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });
    const member = h("select", { id: "bm" }, h("option", { value: "" }, "Bitte wählen"), h("option", { value: "*" }, "Alle Mitglieder"), opts(m.members));
    const cat = h("select", { id: "bc" }, h("option", { value: "" }, "Bitte wählen"), opts(m.categories.map((c) => c.name)));
    const sub = h("input", { id: "bs", type: "text", maxlength: "80", autocomplete: "off" });
    const amt = h("input", { id: "ba", type: "number", step: "0.01", min: "0", inputmode: "decimal" });
    let expense = false;
    const bIn = h("button", { type: "button", onclick: () => setSign(false) }, "+ Einnahme");
    const bOut = h("button", { type: "button", onclick: () => setSign(true) }, "− Ausgabe");
    const setSign = (x) => { expense = x; bIn.setAttribute("aria-pressed", String(!x)); bOut.setAttribute("aria-pressed", String(x)); };
    setSign(false);
    const sign = h("div", { class: "seg", style: "margin-bottom:6px" }, bIn, bOut);
    const date = h("input", { id: "bd", type: "date", value: today });
    const bday = h("select", { id: "bb" }, opts(m.members, "", "Wer hatte Geburtstag?"));
    const subLabel = h("label", { for: "bs" }, "Zusatz");
    const amtLabel = h("label", { for: "ba" }, "Betrag");
    const bdayWrap = h("div", { style: "display:none" }, field("Geburtstagskind", bday, "bb"));
    const ft = () => m.categories.find((c) => c.name === cat.value);
    cat.addEventListener("change", () => {
      const c = ft();
      amt.placeholder = c && c.amount != null ? `Standard ${eur(c.amount)}` : "Betrag";
      subLabel.textContent = c && c.needs_sub ? "Zusatz (Pflicht: Zweck oder Gastname)" : "Zusatz (optional)";
      bdayWrap.style.display = cat.value === "Geburtstag vergessen" ? "" : "none";
    });
    const btn = h("button", {
      class: "primary full",
      onclick: (e) => {
        if (!member.value || !cat.value) { toast("Bitte Mitglied und Kategorie wählen.", true); return; }
        const c = ft(), a = Math.abs(num(amt)) * (expense ? -1 : 1);
        if (c.amount == null && Number.isNaN(a)) { toast("Bitte einen Betrag eingeben.", true); return; }
        if (member.value === "*" && !confirm(`„${cat.value}“ für alle ${m.members.length} Mitglieder buchen?`)) return;
        A().act(e.currentTarget, () => A().rpc("app_admin_add_entry", {
          p_member: member.value, p_category: cat.value, p_sub: sub.value, p_amount: Number.isNaN(a) ? null : a, p_date: date.value || null, p_birthday: bday.value || null,
        }), (r) => `${r.created} Buchung${r.created === 1 ? "" : "en"} über ${eur(r.amount)} angelegt.`);
      },
    }, "Buchung anlegen");
    body.append(card("Manuell buchen",
      h("div", { class: "stack" }, field("Mitglied", member, "bm"), field("Kategorie", cat, "bc"), bdayWrap,
        h("div", {}, subLabel, sub), h("div", {}, amtLabel, sign, amt), field("Datum", date, "bd"), btn,
        h("p", { class: "muted small", style: "margin:0" }, "Neue Buchungen sind offen. Sie werden erst über „Zahlung“ als bezahlt verbucht."))));
  }

  // ---------- Offene Posten ----------
  async function openTab(body) {
    const { h, card } = A();
    const ov = await A().rpc("app_admin_overview");
    const diff = Math.round(Number(ov.diff) * 100) / 100;
    const lists = new Map();
    const rows = ov.by_member.map((x) => {
      const det = h("div", { style: "display:none;padding:4px 0 8px" });
      return h("div", {},
        h("div", { class: "row" },
          h("button", { class: "link", style: "padding-left:0;flex:1;text-align:left", onclick: async () => {
            if (det.style.display === "none") {
              if (!lists.has(x.name)) lists.set(x.name, await A().rpc("app_admin_open_items", { p_member: x.name }));
              det.replaceChildren(...lists.get(x.name).map((i) => h("div", { class: "row small" }, h("span", {}, A().dateShort(i.date), " · ", i.category, i.sub ? " (" + A().stripGast(i.sub) + ")" : ""), h("span", {}, eur(i.open)))));
              det.style.display = "";
            } else det.style.display = "none";
          } }, x.name + " (" + x.count + ")"),
          h("strong", {}, eur(x.total))), det);
    });
    body.append(
      card("Offene Posten", rows.length ? rows : h("p", { class: "total zero", style: "margin:0" }, "Alles bezahlt ✓"),
        rows.length ? h("div", { class: "row" }, h("span", {}, "Summe"), h("strong", {}, eur(ov.by_member.reduce((s, x) => s + Number(x.total), 0)))) : null),
      card("Abgleich mit PayPal",
        h("div", { class: "row" }, h("span", {}, "PayPal-Saldo"), h("strong", {}, eur(ov.paypal_saldo))),
        h("div", { class: "row" }, h("span", {}, "In Buchungen als bezahlt"), h("strong", {}, eur(ov.paid_sum))),
        h("div", { class: "row" }, h("span", {}, "Differenz"), h("strong", { style: diff !== 0 ? "color:var(--warn)" : "color:var(--ok)" }, diff !== 0 ? "⚠ " + eur(diff) : "0,00 € ✓")),
        diff !== 0 ? h("p", { class: "muted small", style: "margin:8px 0 0" }, "Es gibt PayPal-Geld ohne passende Buchung (oder umgekehrt). Das war schon im alten Sheet so (Warnung „!!!“).") : null));
  }

  // ---------- Letzte Buchungen ----------
  async function recentTab(body) {
    const { h, card } = A();
    const list = await A().rpc("app_admin_recent");
    body.append(card("Letzte Buchungen", list.length ? list.map((e) => {
      const unpaid = Number(e.paid) === 0;
      return h("div", { class: "row" },
        h("span", { style: "flex:1" }, h("strong", {}, e.member), " · ", e.category, e.sub ? h("span", { class: "muted" }, " (" + A().stripGast(e.sub) + ")") : null,
          h("br"), h("span", { class: "muted small" }, A().dateShort(e.date) + " · " + e.source + " · " + (Number(e.paid) >= Number(e.amount) ? "bezahlt" : Number(e.paid) > 0 ? "teilbezahlt" : "offen"))),
        h("span", { style: "text-align:right" }, h("strong", {}, eur(e.amount)),
          unpaid ? h("br") : null,
          unpaid ? h("button", { class: "link", onclick: (ev) => { if (confirm("Diese Buchung stornieren?")) A().act(ev.currentTarget, () => A().rpc("app_admin_cancel_entry", { p_id: e.id }), "Buchung storniert."); } }, "Stornieren") : null));
    }) : h("p", { class: "muted" }, "Keine Buchungen."),
    h("p", { class: "muted small", style: "margin:8px 0 0" }, "Stornieren geht nur für unbezahlte Buchungen. Nichts wird gelöscht, nur als storniert markiert.")));
  }
})();
