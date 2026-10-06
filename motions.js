// Anträge: Liste (offen oben, Archiv unten, Volltextsuche), Detail mit Stimmen, Antrag stellen. Zwei Arten: Ja/Nein und Auswahl (2 bis 6 Optionen, einzeln oder mehrfach).
// Alle Regeln (7 Tage, eigene Stimme beim Einreichen, Stimme final, Mehrheit) setzt die Datenbank durch (db/motions.sql, db/motions_choice.sql).
(function (root) {
  "use strict";
  if (!root.App) return;
  const { h, rpc, act, toast } = root.App;

  // Zustand überlebt das Neuzeichnen der App: view = "list", "new" oder die id eines Antrags.
  const st = { view: "list", q: "", filter: "all" };

  const CHOICE = { yes: "Zustimmung", no: "Ablehnung", abstain: "Enthaltung" };
  const RESULT = { accepted: "Angenommen", rejected: "Abgelehnt", tie: "Unentschieden, nicht angenommen" };
  const isChoice = (m) => m.kind === "choice";
  const kindLabel = (m) => (m.multi ? "Mehrfachauswahl" : "Auswahl");

  // Ja/Nein während der Laufzeit: Steht das Ergebnis rechnerisch schon fest? Enthaltungen zählen nicht, Ausstehende können noch alle in eine Richtung stimmen.
  // Angenommen: Ja liegt vor Nein plus allen Ausstehenden. Abgelehnt: Ja plus alle Ausstehenden reichen nicht mehr für ein Ja vor Nein. Abstimmen geht trotzdem weiter.
  function live(m) {
    if (isChoice(m) || m.closed_at) return null;
    const pending = Math.max(m.total - m.voted, 0);
    if (m.yes > m.no + pending) return "accepted";
    if (m.yes + pending <= m.no) return "rejected";
    return null;
  }
  // Auswahl: Optionen mit den meisten Stimmen (leer, wenn niemand eine Option gewählt hat).
  function leaders(m) {
    const top = Math.max(0, ...m.options.map((o) => o.count));
    return top > 0 ? m.options.filter((o) => o.count === top) : [];
  }
  const myPickLabels = (m) => m.options.filter((o) => (m.my_picks || []).includes(o.id)).map((o) => o.label);
  const myVoteText = (m) => (m.my_choice === "abstain" ? "Enthaltung" : isChoice(m) ? myPickLabels(m).join(", ") : CHOICE[m.my_choice]);
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

  function resultChip(m) {
    if (isChoice(m)) return h("span", { class: "chip" + (m.result === "winner" ? "" : " warn") }, m.result === "winner" ? "Entschieden" : "Gleichstand");
    return h("span", { class: "chip" + (m.result === "accepted" ? "" : " warn") }, RESULT[m.result]);
  }
  function liveChip(m) {
    const l = live(m);
    return l ? h("span", { class: "chip" + (l === "accepted" ? "" : " warn") }, `${l === "accepted" ? "Angenommen" : "Abgelehnt"} (läuft noch)`) : null;
  }
  const statusChip = (m) => m.closed_at ? resultChip(m)
    : m.can_vote ? h("span", { class: "chip warn" }, "Deine Stimme fehlt")
    : m.my_choice ? h("span", { class: "chip" }, isChoice(m) && m.my_choice === "pick" ? "Du hast abgestimmt" : "Du: " + myVoteText(m)) : null;

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

  // Auswahl: ein Balken je Option. Der Anteil bezieht sich auf alle, die eine Option gewählt haben. Führende Option farbig.
  function optionBars(m) {
    const pickers = Math.max(m.voted - m.abstain, 1), lead = leaders(m).map((o) => o.id);
    return h("div", { class: "obars" }, m.options.map((o) => h("div", { class: "obar" + (lead.includes(o.id) ? " lead" : "") },
      h("span", { class: "olabel" }, o.label),
      h("span", { class: "otrack", role: "img", "aria-label": `${o.label}: ${o.count} Stimmen` }, h("i", { style: `width:${pct(o.count, pickers)}%` })),
      h("span", { class: "onum" }, o.count))));
  }

  function motionCard(m, onOpen, withStatus) {
    const l = live(m);
    const cls = "motion" + (m.closed_at ? " done " + m.result : l ? " live " + l : "");
    return h("button", { type: "button", class: cls, onclick: onOpen },
      h("span", { class: "motion-head" },
        h("span", { class: "motion-title" },
          h("strong", {}, m.title),
          h("span", { class: "muted small" }, `von ${m.author} · ` + (m.closed_at ? `abgeschlossen am ${fmtDay(m.closed_at)}` : left(m.ends_at)))),
        ring(m)),
      m.closed_at ? null : timeline(m),
      isChoice(m) ? [optionBars(m), h("span", { class: "tally-legend" }, h("span", {}, h("b", {}, m.abstain), " Enthaltung"), h("span", {}, h("b", {}, Math.max(m.total - m.voted, 0)), m.closed_at ? " nicht abgestimmt" : " offen"))] : tally(m),
      h("span", { class: "chips" }, isChoice(m) ? h("span", { class: "chip" }, kindLabel(m)) : null, statusChip(m), liveChip(m), withStatus && !m.closed_at ? h("span", { class: "chip" }, "offen") : null));
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
      const FILTERS = [["all", "Alle"], ["accepted", "Angenommen"], ["not", "Nicht angenommen"], ["choice", "Auswahl"]];
      const keep = { all: () => true, accepted: (m) => !isChoice(m) && m.result === "accepted", not: (m) => !isChoice(m) && m.result !== "accepted", choice: isChoice };
      const shown = closed.filter(keep[st.filter]);
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
    return isChoice(m) ? choiceVoteBox(m) : yesnoVoteBox(m);
  }

  function yesnoVoteBox(m) {
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

  // Auswahl: Optionen antippen (Einzelwahl wie Kreise, Mehrfachwahl wie Kästchen), dazu "Enthaltung". Danach Rückfrage mit der gewählten Liste.
  function choiceVoteBox(m) {
    const box = h("div", { class: "stack" });
    let picked = new Set(), abstain = false;
    const mark = m.multi ? ["☐", "☑"] : ["○", "◉"];
    const choose = () => {
      const rows = m.options.map((o) => h("button", { type: "button", class: "opt" + (picked.has(o.id) ? " sel" : ""), role: m.multi ? "checkbox" : "radio", "aria-checked": String(picked.has(o.id)),
        onclick: () => { abstain = false; if (m.multi) { picked.has(o.id) ? picked.delete(o.id) : picked.add(o.id); } else picked = new Set([o.id]); choose(); } },
        h("span", { class: "opt-mark", "aria-hidden": "true" }, mark[picked.has(o.id) ? 1 : 0]), o.label));
      const abst = h("button", { type: "button", class: "opt abst" + (abstain ? " sel" : ""), role: "radio", "aria-checked": String(abstain),
        onclick: () => { abstain = true; picked = new Set(); choose(); } }, h("span", { class: "opt-mark", "aria-hidden": "true" }, abstain ? "◉" : "○"), "Enthaltung");
      box.replaceChildren(
        h("p", { class: "muted small", style: "margin:0" }, (m.multi ? "Wähle alle Optionen, die für dich passen. " : "Wähle genau eine Option. ") + "Deine Stimme ist endgültig und für alle sichtbar."),
        h("div", { class: "opts", role: m.multi ? "group" : "radiogroup" }, ...rows, abst),
        h("button", { type: "button", class: "primary full", onclick: () => {
          if (!picked.size && !abstain) return toast(m.multi ? "Bitte mindestens eine Option wählen." : "Bitte eine Option wählen.", true);
          confirmStep();
        } }, "Stimme abgeben"));
    };
    const confirmStep = () => {
      const labels = m.options.filter((o) => picked.has(o.id)).map((o) => o.label);
      box.replaceChildren(
        h("p", { class: "notice", style: "margin:0" }, `${abstain ? "Enthaltung" : labels.join(", ")}: Bist du sicher? Das ist endgültig und lässt sich nicht ändern.`),
        h("div", { class: "motion-vote" },
          h("button", { type: "button", class: "primary", onclick: (e) => act(e.currentTarget,
            () => rpc("app_motion_vote", abstain ? { p_id: m.id, p_choice: "abstain" } : { p_id: m.id, p_choice: "pick", p_options: [...picked] }), "Stimme abgegeben.") }, "Ja, sicher"),
          h("button", { type: "button", onclick: choose }, "Zurück")));
    };
    choose();
    return box;
  }

  // Urteil als Banner. Abgeschlossen: Ergebnis und Zahlen. Laufend (nur Ja/Nein): "rechnerisch angenommen/abgelehnt", Abstimmen geht weiter.
  function verdict(m) {
    if (isChoice(m)) return choiceVerdict(m);
    const closed = !!m.closed_at, res = closed ? m.result : live(m);
    if (!res) return null;
    const sym = { accepted: "✓", rejected: "✕", tie: "=" }[res], decided = m.yes + m.no, pending = Math.max(m.total - m.voted, 0);
    return h("div", { class: "verdict " + res + (closed ? "" : " live") },
      h("span", { class: "verdict-sym", "aria-hidden": "true" }, sym),
      h("p", { class: "verdict-title" }, closed ? RESULT[res] : res === "accepted" ? "Angenommen" : "Abgelehnt"),
      closed ? null : h("p", { class: "verdict-sub" }, res === "accepted"
        ? `Die Abstimmung läuft noch. Auch wenn alle ${pending} Ausstehenden mit Nein stimmen, bleibt es angenommen.`
        : `Die Abstimmung läuft noch. Selbst wenn alle ${pending} Ausstehenden zustimmen, reicht es nicht mehr.`),
      h("p", { class: "verdict-sub" }, `${m.yes} Ja gegen ${m.no} Nein · ${plural(m.abstain, "Enthaltung", "Enthaltungen")} · ${pending > 0 ? `${pending} ${closed ? "nicht abgestimmt" : "ausstehend"}` : "alle abgestimmt"}`),
      decided > 0 ? h("div", { class: "majority", role: "img", "aria-label": `${m.yes} Ja gegen ${m.no} Nein, Mehrheitsgrenze bei der Hälfte` },
        h("i", { class: "y", style: `width:${pct(m.yes, decided)}%` }), h("i", { class: "n", style: `width:${pct(m.no, decided)}%` }), h("u")) : null,
      closed ? h("p", { class: "verdict-sub small" }, `Abgeschlossen am ${fmt(m.closed_at)}. Enthaltungen und Nichtabstimmende zählen nicht.`) : null);
  }

  // Auswahl nach dem Abschluss: Sieger oder Gleichstand. Während der Laufzeit gibt es kein Urteil.
  function choiceVerdict(m) {
    if (!m.closed_at) return null;
    const win = leaders(m), n = win.length ? win[0].count : 0;
    const res = m.result === "winner" ? "winner" : "tie";
    return h("div", { class: "verdict " + res },
      h("span", { class: "verdict-sym", "aria-hidden": "true" }, res === "winner" ? "✓" : "="),
      h("p", { class: "verdict-title" }, res === "winner" ? win[0].label : win.length ? "Gleichstand" : "Keine Option gewählt"),
      h("p", { class: "verdict-sub" }, res === "winner" ? `gewinnt mit ${plural(n, "Stimme", "Stimmen")}`
        : win.length ? `${win.map((o) => o.label).join(" und ")} mit je ${plural(n, "Stimme", "Stimmen")}` : "Alle haben sich enthalten oder nicht abgestimmt"),
      h("p", { class: "verdict-sub small" }, `Abgeschlossen am ${fmt(m.closed_at)}. ${plural(m.abstain, "Enthaltung", "Enthaltungen")}, ${Math.max(m.total - m.voted, 0)} nicht abgestimmt. Bei Gleichstand gibt es keinen automatischen Sieger.`));
  }

  // Alle Stimmberechtigten als Chips, nach Stimme gruppiert. Antippen zeigt die Uhrzeit.
  function voters(m, me) {
    const info = h("p", { class: "muted small", style: "margin:8px 0 0", "aria-live": "polite" }, "Tippe auf einen Namen für die Uhrzeit.");
    const byName = Object.fromEntries(m.votes.map((v) => [v.name, v]));
    const chip = (v, cls, mark) => h("button", { type: "button", class: "vchip " + cls, onclick: () => {
      info.textContent = v.choice ? `${v.name} hat am ${fmt(v.voted_at)} abgestimmt.` : `${v.name} hat noch nicht abgestimmt.`;
    } }, mark, v.name === me.name ? v.name + " (du)" : v.name);
    const pendingChips = m.votes.filter((v) => !v.choice).map((v) => chip(v, "p", ""));
    const tail = [info, m.votes.some((v) => !v.choice) ? h("p", { class: "muted small", style: "margin:6px 0 0" }, `Gestrichelt: ${m.closed_at ? "nicht abgestimmt" : "noch nicht abgestimmt"}.`) : null];
    if (isChoice(m)) {
      const lead = m.closed_at ? leaders(m).map((o) => o.id) : [];
      return h("div", {},
        m.options.map((o) => h("div", { class: "opt-block" + (lead.includes(o.id) ? " lead" : "") },
          h("div", { class: "vrow" }, h("span", { class: "olabel" }, o.label),
            h("span", { class: "vtrack" }, h("i", { class: "y", style: `width:${pct(o.count, Math.max(m.voted - m.abstain, 1))}%` })), h("span", { class: "vnum" }, o.count)),
          h("div", { class: "vchips" }, (o.voters || []).map((name) => byName[name] ? chip(byName[name], "y", "✓ ") : null)))),
        m.abstain ? h("div", { class: "opt-block" }, h("div", { class: "vrow" }, h("span", { class: "olabel" }, "Enthaltung"), h("span", { class: "vnum" }, m.abstain)),
          h("div", { class: "vchips" }, m.votes.filter((v) => v.choice === "abstain").map((v) => chip(v, "a", "– ")))) : null,
        pendingChips.length ? h("div", { class: "vchips" }, pendingChips) : null,
        ...tail);
    }
    const rows = [["yes", "y", "✓ "], ["no", "n", "✕ "], ["abstain", "a", "– "]];
    return h("div", {},
      rows.map(([c, cls]) => h("div", { class: "vrow" },
        h("span", { class: "vlabel" }, CHOICE[c]),
        h("span", { class: "vtrack" }, h("i", { class: cls, style: `width:${pct(m[c], Math.max(m.total, m.voted, 1))}%` })),
        h("span", { class: "vnum" }, m[c]))),
      h("div", { class: "vchips" },
        rows.flatMap(([c, cls, mark]) => m.votes.filter((v) => v.choice === c).map((v) => chip(v, cls, mark))),
        pendingChips),
      ...tail);
  }

  function detailView(m, me, setView) {
    return h("div", {},
      h("button", { type: "button", class: "link", style: "margin:0 0 8px", onclick: () => setView("list") }, "‹ Zurück zur Liste"),
      h("section", { class: "card stack" },
        h("h1", { style: "margin:0" }, m.title),
        h("p", { class: "muted small", style: "margin:0" }, `von ${m.author} · eingereicht ${fmt(m.created_at)}`, isChoice(m) ? ` · ${kindLabel(m)}` : ""),
        h("p", { style: "margin:0;white-space:pre-wrap" }, m.body),
        m.closed_at ? null : h("div", {}, timeline(m), h("p", { class: "muted small", style: "margin:6px 0 0" }, `${left(m.ends_at)} (bis ${fmt(m.ends_at)})`))),
      verdict(m),
      m.can_vote ? h("section", { class: "card" }, h("h2", {}, "Deine Stimme"), voteBox(m)) : null,
      !m.closed_at && m.my_choice ? h("p", { class: "notice" }, `✓ Deine Stimme ist gezählt: ${myVoteText(m)}.`) : null,
      h("section", { class: "card" },
        h("h2", {}, `Stimmen (${m.voted} von ${m.total})`),
        voters(m, me)),
      me.is_admin ? h("p", { class: "center" }, h("button", { type: "button", class: "linkbtn", onclick: (e) => {
        if (confirm("Antrag samt allen Stimmen endgültig löschen?")) act(e.currentTarget, async () => { await rpc("app_motion_delete", { p_id: m.id }); st.view = "list"; }, "Antrag gelöscht.");
      } }, "Antrag löschen (Admin)")) : null);
  }

  // Entwurf bleibt beim Neuzeichnen erhalten. picks sind Positionen in options (bei Einzelwahl höchstens eine).
  const draft = { title: "", body: "", kind: "yesno", multi: false, options: ["", ""], picks: [] };
  const resetDraft = () => Object.assign(draft, { title: "", body: "", kind: "yesno", multi: false, options: ["", ""], picks: [] });

  function newView(setView) {
    const title = h("input", { type: "text", maxlength: "100", placeholder: "Kurzer Titel", "aria-label": "Titel", value: draft.title });
    const body = h("textarea", { maxlength: "2000", rows: "6", placeholder: "Antrag ausformulieren: Worüber soll abgestimmt werden?", "aria-label": "Antragstext" });
    body.value = draft.body;
    const count = h("span", { class: "muted small" }, `${body.value.length} / 2000`);
    const box = h("div", { class: "stack" });
    title.addEventListener("input", () => { draft.title = title.value; });
    body.addEventListener("input", () => { draft.body = body.value; count.textContent = `${body.value.length} / 2000`; });

    // Nur ausgefüllte Optionen zählen. Die Positionen der Wahl werden auf die bereinigte Liste umgerechnet.
    const cleaned = () => {
      const idx = draft.options.map((o, i) => (o.trim() ? i : -1)).filter((i) => i >= 0);
      return { options: idx.map((i) => draft.options[i].trim()), picks: draft.picks.filter((i) => idx.includes(i)).map((i) => idx.indexOf(i) + 1) };
    };
    const setKind = (k) => { draft.kind = k; form(); };
    const setMulti = (on) => { draft.multi = on; if (!on) draft.picks = draft.picks.slice(0, 1); form(); };
    const pick = (i) => {
      const has = draft.picks.includes(i);
      draft.picks = draft.multi ? (has ? draft.picks.filter((x) => x !== i) : [...draft.picks, i]) : (has ? [] : [i]);
      form();
    };
    const addOption = () => { if (draft.options.length < 6) { draft.options.push(""); form(); const ins = box.querySelectorAll(".opt-in"); ins[ins.length - 1].focus(); } };
    const removeOption = (i) => {
      draft.options.splice(i, 1);
      draft.picks = draft.picks.filter((x) => x !== i).map((x) => (x > i ? x - 1 : x));
      form();
    };

    const optionEditor = () => h("div", { class: "stack" },
      h("p", { class: "small muted", style: "margin:0" }, `Optionen (2 bis 6). Tippe bei ${draft.multi ? "den Optionen" : "einer Option"} auf ${draft.multi ? "das Kästchen" : "den Kreis"} für deine eigene Wahl.`),
      draft.options.map((o, i) => h("div", { class: "opt-edit" },
        h("button", { type: "button", class: "opt-pick" + (draft.picks.includes(i) ? " on" : ""), role: draft.multi ? "checkbox" : "radio", "aria-checked": String(draft.picks.includes(i)), "aria-label": `Option ${i + 1} als meine Wahl`,
          onclick: () => pick(i) }, draft.multi ? (draft.picks.includes(i) ? "☑" : "☐") : (draft.picks.includes(i) ? "◉" : "○")),
        h("input", { type: "text", class: "opt-in", maxlength: "60", placeholder: `Option ${i + 1}`, "aria-label": `Option ${i + 1}`, value: o, oninput: (e) => { draft.options[i] = e.target.value; } }),
        draft.options.length > 2 ? h("button", { type: "button", class: "opt-del", "aria-label": `Option ${i + 1} entfernen`, onclick: () => removeOption(i) }, "✕") : null)),
      draft.options.length < 6 ? h("button", { type: "button", class: "linkbtn", style: "text-align:left", onclick: addOption }, "+ Option hinzufügen") : null,
      h("label", { class: "opt-multi" },
        h("input", { type: "checkbox", checked: draft.multi, onchange: (e) => setMulti(e.target.checked) }),
        h("span", {}, h("strong", {}, "Mehrfachauswahl"), h("span", { class: "muted small", style: "display:block" }, "Mitglieder dürfen mehrere Optionen wählen, zum Beispiel alle Termine, die passen."))));

    const form = () => box.replaceChildren(
      h("div", { class: "seg", role: "group", "aria-label": "Art des Antrags" },
        [["yesno", "Ja oder Nein"], ["choice", "Auswahl"]].map(([k, label]) => h("button", { type: "button", class: draft.kind === k ? "on" : "", "aria-pressed": String(draft.kind === k), onclick: () => setKind(k) }, label))),
      h("label", { class: "small muted" }, "Titel"), title,
      h("label", { class: "small muted" }, draft.kind === "choice" ? "Beschreibung" : "Antrag"), body, count,
      draft.kind === "choice" ? optionEditor() : null,
      h("p", { class: "muted small", style: "margin:0" }, (draft.kind === "choice" ? "Mit dem Einreichen gilt deine Wahl als abgegebene Stimme." : "Mit dem Einreichen stimmst du automatisch zu.") + " Alle werden benachrichtigt und können 7 Tage lang abstimmen. Ein eingereichter Antrag lässt sich nicht mehr ändern."),
      h("button", { type: "button", class: "primary full", onclick: () => {
        if (!title.value.trim() || !body.value.trim()) return toast("Bitte Titel und Beschreibung ausfüllen.", true);
        if (draft.kind === "choice") {
          const c = cleaned();
          if (c.options.length < 2) return toast("Bitte mindestens zwei Optionen ausfüllen.", true);
          if (new Set(c.options.map((o) => o.toLowerCase())).size !== c.options.length) return toast("Die Optionen müssen sich unterscheiden.", true);
          if (!c.picks.length) return toast("Bitte tippe bei einer Option auf deine eigene Wahl.", true);
        }
        sure();
      } }, "Antrag einreichen"));

    const sure = () => {
      const c = cleaned();
      box.replaceChildren(
        h("p", { style: "margin:0" }, h("strong", {}, title.value.trim())),
        h("p", { style: "margin:0;white-space:pre-wrap" }, body.value.trim()),
        draft.kind === "choice" ? h("ul", { class: "opt-preview" }, c.options.map((o, i) => h("li", {}, (c.picks.includes(i + 1) ? "✓ " : "") + o))) : null,
        draft.kind === "choice" ? h("p", { class: "muted small", style: "margin:0" }, `${draft.multi ? "Mehrfachauswahl" : "Einzelwahl"}. Mit ✓ markiert: deine Wahl.`) : null,
        h("p", { class: "notice", style: "margin:0" }, "Wirklich einreichen? Der Antrag geht sofort an alle und lässt sich nicht mehr ändern."),
        h("div", { class: "motion-vote" },
          h("button", { type: "button", class: "primary", onclick: (e) => act(e.currentTarget, async () => {
            await rpc("app_motion_create", draft.kind === "choice"
              ? { p_title: title.value, p_body: body.value, p_kind: "choice", p_multi: draft.multi, p_options: c.options, p_picks: c.picks }
              : { p_title: title.value, p_body: body.value });
            resetDraft(); st.view = "list";
          }, "Antrag eingereicht.") }, "Ja, einreichen"),
          h("button", { type: "button", onclick: form }, "Zurück")));
    };
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
