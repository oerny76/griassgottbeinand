// Abstimmungen: Liste (offen oben, Archiv unten, Volltextsuche), Detail mit Stimmenliste, Antrag stellen.
// Alle Regeln (7 Tage, Antragsteller stimmt zu, Stimme final, Mehrheit) setzt die Datenbank durch (db/motions.sql).
(function (root) {
  "use strict";
  if (!root.App) return;
  const { h, rpc, act, toast } = root.App;

  // Zustand überlebt das Neuzeichnen der App: view = "list", "new" oder die id eines Antrags.
  const st = { view: "list", q: "", filter: "all" };

  const CHOICE = { yes: "Zustimmung", no: "Ablehnung", abstain: "Enthaltung" };
  const RESULT = { accepted: "Angenommen", rejected: "Abgelehnt", tie: "Unentschieden, nicht angenommen" };
  const fmt = (iso) => new Date(iso).toLocaleString("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const fmtDay = (iso) => new Date(iso).toLocaleDateString("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric" });

  function left(iso) {
    const min = Math.floor((Date.parse(iso) - Date.now()) / 60000);
    if (min < 1) return "endet gleich";
    const d = Math.floor(min / 1440), hr = Math.floor((min % 1440) / 60);
    if (d > 0) return `noch ${d} ${d === 1 ? "Tag" : "Tage"} ${hr} Std.`;
    if (hr > 0) return `noch ${hr} Std. ${min % 60} Min.`;
    return `noch ${min} Min.`;
  }

  const resultChip = (m) => h("span", { class: "chip" + (m.result === "accepted" ? "" : " warn") }, RESULT[m.result]);
  const statusChip = (m) => m.closed_at ? resultChip(m)
    : m.can_vote ? h("span", { class: "chip warn" }, "Deine Stimme fehlt")
    : m.my_choice ? h("span", { class: "chip" }, "Du: " + CHOICE[m.my_choice]) : null;

  const pct = (n, total) => (total > 0 ? Math.round((n / total) * 1000) / 10 : 0);
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

  // Zwischenstand als Balken: Zustimmung, Ablehnung, Enthaltung, offen (schraffiert).
  function tally(m) {
    const total = Math.max(m.total, m.voted, 1), open = Math.max(total - m.voted, 0);
    const seg = (cls, n) => n > 0 ? h("i", { class: cls, style: `width:${pct(n, total)}%` }) : null;
    const text = `${m.yes} Zustimmung, ${m.no} Ablehnung, ${m.abstain} Enthaltung, ${open} ${m.closed_at ? "nicht abgestimmt" : "offen"}`;
    return h("div", {},
      h("div", { class: "tally", role: "img", "aria-label": text }, seg("y", m.yes), seg("n", m.no), seg("a", m.abstain), seg("p", open)),
      h("div", { class: "tally-legend" },
        h("span", {}, h("b", {}, m.yes), " Ja"), h("span", {}, h("b", {}, m.no), " Nein"), h("span", {}, h("b", {}, m.abstain), " Enthaltung"),
        h("span", {}, h("b", {}, open), m.closed_at ? " nicht abgestimmt" : " offen")));
  }

  // Beteiligung als Ring: Anteil der Stimmberechtigten, die schon abgestimmt haben.
  function ring(m) {
    const total = Math.max(m.total, m.voted, 1);
    return h("span", { class: "ring", style: `--p:${pct(m.voted, total)}%`, role: "img", "aria-label": `${m.voted} von ${total} haben abgestimmt` },
      h("span", {}, `${m.voted}/${total}`));
  }

  // Restzeit als Balken über die 7 Tage. Unter 24 Stunden wird er auffällig.
  function timeline(m) {
    const total = Date.parse(m.ends_at) - Date.parse(m.created_at), rest = Date.parse(m.ends_at) - Date.now();
    const frac = Math.min(Math.max(rest / total, 0), 1);
    return h("div", { class: "timeline" + (rest < 86400000 ? " urgent" : ""), role: "img", "aria-label": left(m.ends_at) },
      h("i", { style: `width:${Math.round(frac * 1000) / 10}%` }));
  }

  function motionCard(m, onOpen, withStatus) {
    const cls = "motion" + (m.closed_at ? " done " + m.result : "");
    return h("button", { type: "button", class: cls, onclick: onOpen },
      h("span", { class: "motion-head" },
        h("span", { class: "motion-title" },
          h("strong", {}, m.title),
          h("span", { class: "muted small" }, `von ${m.author} · ` + (m.closed_at ? `abgeschlossen am ${fmtDay(m.closed_at)}` : left(m.ends_at)))),
        ring(m)),
      m.closed_at ? null : timeline(m),
      tally(m),
      h("span", { class: "chips" }, statusChip(m), withStatus && !m.closed_at ? h("span", { class: "chip" }, "offen") : null));
  }

  function listView(list, reload, setView) {
    const input = h("input", { type: "search", value: st.q, placeholder: "Anträge durchsuchen (alle, auch archivierte)", "aria-label": "Anträge durchsuchen", maxlength: "100" });
    const results = h("div", {});
    let timer;
    const show = (items) => {
      const searching = !!st.q.trim();
      const open = items.filter((m) => !m.closed_at), closed = items.filter((m) => m.closed_at);
      const nothing = h("p", { class: "muted center pad" }, searching ? "Keine Anträge gefunden." : "Noch keine Anträge.");
      if (searching) {
        results.replaceChildren(h("h2", {}, `Suchergebnisse (${items.length})`), ...(items.length ? items.map((m) => motionCard(m, () => setView(m.id), true)) : [nothing]));
        return;
      }
      const FILTERS = [["all", "Alle"], ["accepted", "Angenommen"], ["not", "Nicht angenommen"]];
      const shown = closed.filter((m) => st.filter === "all" || (st.filter === "accepted") === (m.result === "accepted"));
      const filters = h("div", { class: "chips motion-filter", role: "group", "aria-label": "Archiv filtern" },
        FILTERS.map(([k, label]) => h("button", { type: "button", class: "chip" + (st.filter === k ? " on" : ""), "aria-pressed": String(st.filter === k), onclick: () => { st.filter = k; show(items); } }, label)));
      results.replaceChildren(
        h("h2", {}, "Offen"),
        ...(open.length ? open.map((m) => motionCard(m, () => setView(m.id))) : [h("p", { class: "muted" }, "Keine offenen Anträge.")]),
        ...(closed.length ? [h("details", { class: "motion-archive", open: st.filter !== "all" }, h("summary", {}, `Archiv (${closed.length})`), filters,
          ...(shown.length ? shown.map((m) => motionCard(m, () => setView(m.id))) : [h("p", { class: "muted" }, "Nichts in dieser Auswahl.")]))] : []));
    };
    show(list);
    input.addEventListener("input", () => {
      st.q = input.value;
      clearTimeout(timer);
      timer = setTimeout(async () => {
        try { show(await rpc("app_motion_list", { p_query: st.q.trim() || null })); } catch (e) { toast(e.message, true); }
      }, 300);
    });
    return h("div", {},
      h("div", { class: "motion-bar" }, input, h("button", { type: "button", class: "primary", onclick: () => setView("new") }, "+ Antrag")),
      results);
  }

  // Zwei Schritte, damit eine Stimme nie versehentlich fällt: Auswahl, dann Rückfrage.
  function voteBox(m) {
    const box = h("div", { class: "stack" });
    const choose = () => box.replaceChildren(
      h("p", { class: "muted small", style: "margin:0" }, "Deine Stimme ist endgültig und für alle sichtbar."),
      h("div", { class: "motion-vote" },
        ["yes", "no", "abstain"].map((c) => h("button", { type: "button", class: c === "yes" ? "primary" : "", onclick: () => confirmStep(c) }, c === "yes" ? "Stimme zu" : c === "no" ? "Stimme nicht zu" : "Enthaltung"))));
    const confirmStep = (c) => box.replaceChildren(
      h("p", { class: "notice", style: "margin:0" }, `${CHOICE[c]}: Bist du sicher? Das ist endgültig und lässt sich nicht ändern.`),
      h("div", { class: "motion-vote" },
        h("button", { type: "button", class: "primary", onclick: (e) => act(e.currentTarget, () => rpc("app_motion_vote", { p_id: m.id, p_choice: c }), "Stimme abgegeben.") }, "Ja, sicher"),
        h("button", { type: "button", onclick: choose }, "Zurück")));
    choose();
    return box;
  }

  // Abschluss: erst das Urteil, darunter die Zahlen und die Mehrheit aus Ja und Nein.
  function verdict(m) {
    const sym = { accepted: "✓", rejected: "✕", tie: "=" }[m.result], decided = m.yes + m.no;
    return h("div", { class: "verdict " + m.result },
      h("span", { class: "verdict-sym", "aria-hidden": "true" }, sym),
      h("p", { class: "verdict-title" }, RESULT[m.result]),
      h("p", { class: "verdict-sub" }, `${m.yes} Ja gegen ${m.no} Nein · ${plural(m.abstain, "Enthaltung", "Enthaltungen")} · ${m.total - m.voted > 0 ? `${m.total - m.voted} nicht abgestimmt` : "alle abgestimmt"}`),
      decided > 0 ? h("div", { class: "majority", role: "img", "aria-label": `${m.yes} Ja gegen ${m.no} Nein, Mehrheitsgrenze bei der Hälfte` },
        h("i", { class: "y", style: `width:${pct(m.yes, decided)}%` }), h("i", { class: "n", style: `width:${pct(m.no, decided)}%` }), h("u")) : null,
      h("p", { class: "verdict-sub small" }, `Abgeschlossen am ${fmt(m.closed_at)}. Enthaltungen und Nichtabstimmende zählen nicht.`));
  }

  // Alle Stimmberechtigten als Chips, nach Stimme gruppiert. Antippen zeigt die Uhrzeit.
  function voters(m, me) {
    const info = h("p", { class: "muted small", style: "margin:8px 0 0", "aria-live": "polite" }, "Tippe auf einen Namen für die Uhrzeit.");
    const chip = (v, cls, mark) => h("button", { type: "button", class: "vchip " + cls, onclick: () => {
      info.textContent = v.choice ? `${v.name}: ${CHOICE[v.choice]} am ${fmt(v.voted_at)}` : `${v.name} hat noch nicht abgestimmt.`;
    } }, mark, v.name === me.name ? v.name + " (du)" : v.name);
    const rows = [["yes", "y", "✓ "], ["no", "n", "✕ "], ["abstain", "a", "– "]];
    return h("div", {},
      rows.map(([c, cls]) => h("div", { class: "vrow" },
        h("span", { class: "vlabel" }, CHOICE[c]),
        h("span", { class: "vtrack" }, h("i", { class: cls, style: `width:${pct(m[c], Math.max(m.total, m.voted, 1))}%` })),
        h("span", { class: "vnum" }, m[c]))),
      h("div", { class: "vchips" },
        rows.flatMap(([c, cls, mark]) => m.votes.filter((v) => v.choice === c).map((v) => chip(v, cls, mark))),
        m.votes.filter((v) => !v.choice).map((v) => chip(v, "p", ""))),
      info,
      m.votes.some((v) => !v.choice) ? h("p", { class: "muted small", style: "margin:6px 0 0" }, `Gestrichelt: ${m.closed_at ? "nicht abgestimmt" : "noch nicht abgestimmt"}.`) : null);
  }

  function detailView(m, me, setView) {
    return h("div", {},
      h("button", { type: "button", class: "link", style: "margin:0 0 8px", onclick: () => setView("list") }, "‹ Zurück zur Liste"),
      h("section", { class: "card stack" },
        h("h1", { style: "margin:0" }, m.title),
        h("p", { class: "muted small", style: "margin:0" }, `von ${m.author} · eingereicht ${fmt(m.created_at)}`),
        h("p", { style: "margin:0;white-space:pre-wrap" }, m.body),
        m.closed_at ? null : h("div", {}, timeline(m), h("p", { class: "muted small", style: "margin:6px 0 0" }, `${left(m.ends_at)} (bis ${fmt(m.ends_at)})`))),
      m.closed_at ? verdict(m) : null,
      m.can_vote ? h("section", { class: "card" }, h("h2", {}, "Deine Stimme"), voteBox(m)) : null,
      !m.closed_at && m.my_choice ? h("p", { class: "notice" }, `✓ Deine Stimme ist gezählt: ${CHOICE[m.my_choice]}.`) : null,
      h("section", { class: "card" },
        h("h2", {}, `Stimmen (${m.voted} von ${m.total})`),
        voters(m, me)),
      me.is_admin ? h("p", { class: "center" }, h("button", { type: "button", class: "linkbtn", onclick: (e) => {
        if (confirm("Antrag samt allen Stimmen endgültig löschen?")) act(e.currentTarget, async () => { await rpc("app_motion_delete", { p_id: m.id }); st.view = "list"; }, "Antrag gelöscht.");
      } }, "Antrag löschen (Admin)")) : null);
  }

  const draft = { title: "", body: "" };

  function newView(setView) {
    const title = h("input", { type: "text", maxlength: "100", placeholder: "Kurzer Titel", "aria-label": "Titel", value: draft.title });
    const body = h("textarea", { maxlength: "2000", rows: "8", placeholder: "Antrag ausformulieren: Worüber soll abgestimmt werden?", "aria-label": "Antragstext" });
    body.value = draft.body;
    const count = h("span", { class: "muted small" }, `${body.value.length} / 2000`);
    const box = h("div", { class: "stack" });
    title.addEventListener("input", () => { draft.title = title.value; });
    body.addEventListener("input", () => { draft.body = body.value; count.textContent = `${body.value.length} / 2000`; });
    const form = () => box.replaceChildren(
      h("label", { class: "small muted" }, "Titel"), title,
      h("label", { class: "small muted" }, "Antrag"), body, count,
      h("p", { class: "muted small", style: "margin:0" }, "Mit dem Einreichen stimmst du automatisch zu. Alle werden benachrichtigt und können 7 Tage lang abstimmen. Ein eingereichter Antrag lässt sich nicht mehr ändern."),
      h("button", { type: "button", class: "primary full", onclick: () => {
        if (!title.value.trim() || !body.value.trim()) return toast("Bitte Titel und Antrag ausfüllen.", true);
        sure();
      } }, "Antrag einreichen"));
    const sure = () => box.replaceChildren(
      h("p", { style: "margin:0" }, h("strong", {}, title.value.trim())),
      h("p", { style: "margin:0;white-space:pre-wrap" }, body.value.trim()),
      h("p", { class: "notice", style: "margin:0" }, "Wirklich einreichen? Der Antrag geht sofort an alle und lässt sich nicht mehr ändern."),
      h("div", { class: "motion-vote" },
        h("button", { type: "button", class: "primary", onclick: (e) => act(e.currentTarget, async () => {
          await rpc("app_motion_create", { p_title: title.value, p_body: body.value });
          draft.title = draft.body = ""; st.view = "list";
        }, "Antrag eingereicht.") }, "Ja, einreichen"),
        h("button", { type: "button", onclick: form }, "Zurück")));
    form();
    return h("div", {},
      h("button", { type: "button", class: "link", style: "margin:0 0 8px", onclick: () => setView("list") }, "‹ Zurück zur Liste"),
      h("section", { class: "card" }, h("h2", {}, "Neuer Antrag"), box));
  }

  // me: { name, is_admin }. Lädt die Daten selbst und zeichnet in einen Container.
  function render(me) {
    const box = h("div", {});
    const setView = (v) => { st.view = v; draw(); window.scrollTo(0, 0); };
    const fail = (e) => box.replaceChildren(h("div", { class: "card center" }, h("p", {}, e.message || "Die Abstimmungen sind gerade nicht erreichbar."),
      h("button", { class: "primary", onclick: () => draw() }, "Nochmal versuchen")));
    async function draw() {
      if (st.view === "new") return box.replaceChildren(newView(setView));
      box.replaceChildren(h("p", { class: "muted center pad" }, "Lade ..."));
      try {
        if (st.view === "list") box.replaceChildren(listView(await rpc("app_motion_list", { p_query: st.q.trim() || null }), draw, setView));
        else box.replaceChildren(detailView(await rpc("app_motion_get", { p_id: st.view }), me, setView));
      } catch (e) {
        if (e.invalid) { root.App.forgetToken(); return root.App.hooks.noToken(); }
        if (st.view !== "list") { st.view = "list"; toast(e.message, true); return draw(); }
        fail(e);
      }
    }
    draw();
    return box;
  }

  root.Motions = { render };
})(window);
