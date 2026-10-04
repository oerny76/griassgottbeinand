(() => {
  "use strict";
  const { h, card, options, rpc, toast, euro, dateShort, dateLong, dateDay, stripGast, safeUrl, act, session, hooks } = window.App;
  const NS = "http://www.w3.org/2000/svg";
  const DOC_HOSTS = ["drive.google.com", "docs.google.com"];
  let linksCache = null; // Satzung und Gebührenordnung kommen aus der Datenbank, nicht aus dem Code
  const $app = document.getElementById("app");

  // ---------- Bereiche ----------
  const noonMs = (iso) => Date.parse(iso + "T12:00:00");
  const inDays = (iso) => Math.round((noonMs(iso) - noonMs(todayBerlin())) / 86400000);
  const whenText = (n) => n < 0 ? "vorbei" : n === 0 ? "heute" : n === 1 ? "morgen" : `in ${n} Tagen`;

  let heroPanel = null; // "chair" oder "loc": welches Fenster in der Hauptkarte offen ist (bleibt beim Neuzeichnen offen)

  // Hauptkarte: der nächste Termin auf einen Blick, mit den Aktionen direkt darin (nicht beim Ansehen eines anderen Mitglieds).
  function heroCard(d) {
    const m = d.meeting;
    const actions = heroActions(d);
    if (!m) {
      return h("section", { class: "hero" },
        h("p", { class: "date" }, "Noch kein Termin"),
        h("p", { class: "muted" }, "Der Vorsitz des letzten Abends legt den nächsten Termin fest."),
        ...actions);
    }
    const loc = m.location;
    const web = loc && safeUrl(loc.url);
    const addr = loc ? [loc.street, [loc.zip, loc.city].filter(Boolean).join(" ")].filter(Boolean).join(", ") : "";
    const maps = loc ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([loc.name, addr].filter(Boolean).join(", "))}` : null;
    const day = new Date(m.date + "T12:00:00");
    const sameYear = day.getFullYear() === new Date(todayBerlin() + "T12:00:00").getFullYear();
    const locked = m.deadline_passed && !d.me.is_admin;
    // Heute ab 19 Uhr: zeigen, was für den nächsten Stammtisch schon feststeht.
    const tgt = chairTarget(d);
    const nextLine = tgt.scope === "next" && tgt.date
      ? h("p", {}, "Nächster Stammtisch: ", h("strong", {}, dateShort(tgt.date)), tgt.chair ? [", Vorsitz ", h("strong", {}, tgt.chair === d.me.name ? "ich" : tgt.chair)] : null) : null;
    return h("section", { class: "hero" },
      h("div", { class: "badges" },
        h("span", { class: "when" }, whenText(inDays(m.date))),
        d.my_absent ? h("span", { class: "state" }, "Du bist entschuldigt") : null),
      h("p", { class: "date" }, day.toLocaleDateString("de-DE", { weekday: "long" }) + ",",
        h("small", {}, day.toLocaleDateString("de-DE", sameYear ? { day: "numeric", month: "long" } : { day: "numeric", month: "long", year: "numeric" }))),
      h("p", {}, "Vorsitz: ", h("strong", {}, m.chair ? (m.chair === d.me.name ? "ich" : m.chair) : "noch offen")),
      loc
        ? h("p", {}, h("strong", {}, loc.name), addr && h("span", { class: "muted" }, " · " + addr), " ",
            maps && h("a", { href: maps, target: "_blank", rel: "noopener noreferrer" }, "Karte"),
            web && [" · ", h("a", { href: web, target: "_blank", rel: "noopener noreferrer" }, "Website")])
        : h("p", { class: "muted" }, "Location noch offen"),
      h("p", { class: "muted small" }, locked ? "Die Anmeldefrist ist abgelaufen. Bitte beim Admin melden." : m.deadline_passed ? "Die Anmeldefrist ist abgelaufen." : "Abmelden oder Gäste anmelden bis 19 Uhr am Stammtischtag."),
      nextLine,
      ...actions);
  }

  // Wofür "Vorsitz übertragen" und "Location eintragen" gelten, bestimmt die Datenbank (me.chair_scope):
  //   upcoming: der anstehende Termin, current: der heutige Stammtisch bis 19 Uhr, next: heute ab 19 Uhr der nächste Stammtisch.
  function chairTarget(d) {
    const me = d.me;
    return { scope: me.chair_scope || "upcoming", date: me.chair_target_date || null, chair: me.chair_target_chair || null };
  }
  const STAMM = { current: "den aktuellen Stammtisch", next: "den nächsten Stammtisch", upcoming: "den Stammtisch" };

  // Knöpfe in der Hauptkarte: Abmelden oder doch teilnehmen, Vorsitz, Location.
  // Auswahl und Eingabe klappen direkt darunter auf. Es ist immer nur ein Fenster offen.
  function heroActions(d) {
    const m = d.meeting, me = d.me;
    const locked = !!m && m.deadline_passed && !me.is_admin;
    const panels = {};
    const tgt = chairTarget(d);
    if (me.can_set_next_chair) {
      // Gibt es schon einen Vorsitz für das Ziel, wird er übertragen (das Datum bleibt). Sonst wird der Vorsitz für einen neuen Termin festgelegt.
      const changing = !!(me.has_upcoming && tgt.chair);
      const mine = tgt.chair === me.name;
      const verb = mine ? "übertragen" : "ändern";
      const when = tgt.date ? ` am ${dateShort(tgt.date)}` : "";
      const info = {
        current: `Gilt für den aktuellen Stammtisch${when}. Ab 19 Uhr gilt es für den nächsten Stammtisch.`,
        next: `Gilt für den nächsten Stammtisch${when}. Der heutige Stammtisch läuft schon.`,
        upcoming: changing ? `Gilt für den Stammtisch${when}.` : "Noch kein Vorsitz für den nächsten Termin. Wähle das Mitglied:",
      }[tgt.scope];
      const label = tgt.scope === "upcoming"
        ? (changing ? `Vorsitz ${verb}` : "Vorsitz festlegen")
        : changing ? `Vorsitz für ${tgt.scope === "current" ? "aktuellen" : "nächsten"} Stammtisch ${verb}` : "Vorsitz für nächsten Stammtisch festlegen";
      panels.chair = { label, build: () => h("div", { class: "stack" },
        h("p", { class: "muted small", style: "margin:0" }, info),
        changing && me.chair_change_until ? h("p", { class: "notice", style: "margin:0" }, `Du kannst den Vorsitz noch bis einschließlich ${dateShort(me.chair_change_until)} ändern. Danach nur noch ${tgt.chair}.`) : null,
        chairPicker(d, changing)) };
    }
    if (me.can_set_location) {
      panels.loc = { label: tgt.scope === "next" ? "Location für nächsten Stammtisch festlegen" : m && m.location ? "Location ändern" : "Location festlegen", build: () => locationForm(d) };
    }

    if (m) panels.guest = { label: d.my_guests.length ? "Gäste ändern" : "Gast anmelden", build: () => guestForm(d) };

    const toggles = {};
    const panelBox = h("div", {});
    const draw = () => {
      const p = panels[heroPanel];
      panelBox.replaceChildren(...(p ? [h("div", { class: "panel" }, p.build())] : []));
      Object.entries(toggles).forEach(([k, b]) => b.setAttribute("aria-expanded", String(k === heroPanel)));
    };
    // Wer den Vorsitz hat, kann sich nicht einfach abmelden: Zuerst den Vorsitz übertragen, dann erscheint "Ich komme nicht".
    // Die Datenbank erzwingt das ebenfalls, bis 19 Uhr am Stammtischtag (danach lässt sich der Vorsitz dieses Abends nicht mehr übertragen).
    const mustTransfer = !!m && tgt.scope !== "next" && !!m.chair && m.chair === me.name && !d.my_absent && !!panels.chair;
    const buttons = [];
    if (m && !mustTransfer) {
      buttons.push(h("button", {
        type: "button", class: "hbtn main", disabled: locked,
        onclick: (e) => act(e.currentTarget,
          () => rpc(d.my_absent ? "app_cancel_absence" : "app_add_absence"),
          (r) => d.my_absent ? "Abmeldung zurückgezogen." : `Abwesenheit eingetragen (${euro.format(r.amount)}).`),
      }, d.my_absent ? "Doch teilnehmen" : "Ich komme nicht"));
    }
    for (const key of ["guest", "chair", "loc"]) {
      if (!panels[key]) continue;
      toggles[key] = h("button", { type: "button", class: "hbtn " + (mustTransfer && key === "chair" ? "main" : "alt"), "aria-expanded": "false", onclick: () => { heroPanel = heroPanel === key ? null : key; draw(); } }, panels[key].label);
      buttons.push(toggles[key]);
    }
    draw();
    return [
      mustTransfer ? h("p", { class: "muted small", style: "margin-top:12px" }, "Du hast den Vorsitz. Um dich abzumelden, übertrage ihn zuerst.") : null,
      d.my_guests.length ? h("p", {}, "Meine Gäste: ", h("strong", {}, d.my_guests.map(stripGast).join(", "))) : null,
      buttons.length ? h("div", { class: "actions" }, buttons) : null,
      panelBox];
  }

  // Eingabe der Location für den nächsten Termin (auch zum Ändern einer schon eingetragenen).
  function locationForm(d) {
    const tgt = chairTarget(d);
    const cur = tgt.scope === "next" ? null : d.meeting && d.meeting.location; // beim nächsten Stammtisch ist noch keine Location bekannt
    const list = h("datalist", { id: "locList" });
    rpc("app_locations").then((names) => names.forEach((n) => list.append(h("option", { value: n })))).catch(() => {});
    const loc = h("input", { id: "loc", type: "text", list: "locList", maxlength: "80", placeholder: cur ? "Name der neuen Location" : "Name der Location", autocomplete: "off" });
    const street = h("input", { type: "text", maxlength: "80", placeholder: "Straße und Hausnummer", autocomplete: "off" });
    const zip = h("input", { type: "text", maxlength: "10", placeholder: "PLZ", inputmode: "numeric", autocomplete: "off" });
    const city = h("input", { type: "text", maxlength: "60", placeholder: "Ort", autocomplete: "off" });
    const url = h("input", { type: "url", maxlength: "200", placeholder: "Website (https://…)", autocomplete: "off" });
    return h("div", { class: "stack" },
      h("div", {}, h("label", { for: "loc" }, cur ? `Andere Location für den nächsten Termin (aktuell: ${cur.name})` : tgt.scope === "next" && tgt.date ? `Location für den nächsten Stammtisch am ${dateShort(tgt.date)}` : "Location für den nächsten Termin"), loc, list),
      h("details", {}, h("summary", {}, "Neue Location? Adresse ergänzen"), h("div", { class: "stack", style: "margin-top:10px" }, street, h("div", { class: "inline" }, zip, city), url)),
      h("button", {
        class: "primary full",
        onclick: (e) => {
          if (!loc.value.trim()) { toast("Bitte die Location eintragen.", true); return; }
          act(e.currentTarget, () => rpc("app_set_next_location", { p_location: loc.value, p_street: street.value, p_zip: zip.value, p_city: city.value, p_url: url.value }),
            (r) => `Location eingetragen: ${r.location}.`);
        },
      }, cur ? "Location ändern" : "Location eintragen"));
  }

  // Gast anmelden und entfernen. Klappt in der Hauptkarte auf.
  function guestForm(d) {
    const m = d.meeting, me = d.me;
    const locked = m.deadline_passed && !me.is_admin;
    const children = [];
    if (locked) children.push(h("p", { class: "notice" }, "Gäste lassen sich nach Fristende (19 Uhr am Stammtischtag) nicht mehr ändern. Bitte beim Admin melden."));

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
    return h("div", {}, ...children);
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

  const todayBerlin = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });

  // Auswahl der Mitglieder mit Vorschlag: längste Zeit ohne Vorsitz zuerst.
  function chairPicker(d, changing) {
    const V = window.Vorsitz;
    const tgt = chairTarget(d);
    const exclude = changing ? tgt.chair : null;
    const hasData = !!(d.overview && d.overview.chairs);
    const ranked = V.rankMembers(memberNames(d), hasData ? d.overview.chairs : null, exclude, todayBerlin());
    // Ohne Daten gibt es keinen Vorschlag: nichts vorauswählen und nichts behaupten.
    let chosen = hasData && ranked.length ? ranked[0].name : "";
    const btn = h("button", { class: "primary full" });
    const label = () => {
      btn.textContent = !chosen ? "Bitte ein Mitglied wählen" : changing ? `Vorsitz an ${chosen} übertragen` : `${chosen} zum Vorsitz machen`;
    };
    label();
    const date = h("input", { id: "nextDate", type: "date" });
    const list = h("div", { class: "picklist", role: "radiogroup", "aria-label": "Mitglied für den Vorsitz" }, ranked.map((m, i) => {
      const id = "pick-" + i;
      return h("label", { class: "pick", for: id },
        h("input", { type: "radio", name: "chairPick", id, value: m.name, checked: hasData && i === 0,
          onchange: () => { chosen = m.name; label(); } }),
        h("span", { class: "pickbody" },
          h("span", {}, h("strong", {}, m.name), hasData && i === 0 ? h("span", { class: "chip", style: "margin-left:8px" }, "Vorschlag") : null),
          hasData ? h("span", { class: "muted small" }, m.last ? `zuletzt ${dateShort(m.last)} · ${V.ago(m.days)} · ${m.count}×` : "noch nie Vorsitz") : null));
    }));
    btn.addEventListener("click", (e) => {
      if (!chosen) { toast("Bitte ein Mitglied wählen.", true); return; }
      const wer = tgt.chair === d.me.name ? "mir" : tgt.chair;
      if (changing && !confirm(`Vorsitz für ${STAMM[tgt.scope]} am ${dateShort(tgt.date)} von ${wer} an ${chosen} übergeben?`)) return;
      act(e.currentTarget, () => rpc("app_set_next_chair", { p_chair: chosen, p_date: changing ? null : (date.value || null) }),
        (r) => `${r.chair} hat den Vorsitz für ${STAMM[tgt.scope]} am ${dateShort(r.date)}.`);
    });
    return h("div", { class: "stack" },
      h("p", { class: "muted small", style: "margin:0" }, hasData
        ? "Vorschlag: Das Mitglied, das am längsten keinen Vorsitz hatte, steht oben."
        : "Die Reihenfolge ist gerade nicht verfügbar. Bitte ein Mitglied wählen."),
      list,
      changing ? null : h("div", {}, h("label", { for: "nextDate" }, "Datum (leer lassen: erster Freitag im Folgemonat)"), date),
      btn);
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
            h("strong", {}, c.count + "×"))))));
  }

  function recentCard(d) {
    const o = d.overview;
    if (!o) return null;
    // Anwesende kommen aus der Statistik und werden nachgetragen, sobald sie da sind. Ohne sie bleibt die Zeile wie sie ist.
    const rows = o.recent.map((r) => {
      const att = h("span", { class: "muted small" });
      return { r, att, el: h("div", { class: "row" },
        h("span", {}, dateShort(r.date), " · ", r.chair || "?", " ", att),
        h("span", { class: "muted small" }, r.location || "")) };
    });
    getStats().then((st) => {
      const by = new Map(st.attendance.map((a) => [a.date, a]));
      rows.forEach(({ r, att }) => {
        const a = by.get(r.date);
        if (a) att.textContent = `· ${a.present} da${a.guests ? `, ${a.guests} ${a.guests === 1 ? "Gast" : "Gäste"}` : ""}`;
      });
    }).catch(() => {});
    return card("Letzte Abende",
      rows.length ? rows.map((x) => x.el) : h("p", { class: "muted", style: "margin:0" }, "Noch keine Abende."));
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

  // Kacheln aus den vorhandenen Daten. Nichts davon ist neu berechnet oder geschätzt.
  function tilesBlock(d, goTab) {
    const o = d.my_open, b = d.birthday, t = d.budget, a = d.absences_year;
    const pay = safeUrl(o.paypal_url, ["paypal.me", "www.paypal.me"]);
    const owes = o.items.length > 0;
    const absSum = a.list.reduce((x, y) => x + Number(y.count), 0);
    const konto = owes
      ? h("div", { class: "tile wide" },
          h("p", { class: "label" }, "Dein Konto: offen"),
          h("p", { class: "num" }, euro.format(o.total)),
          pay && h("a", { class: "btn paypal full", href: pay, target: "_blank", rel: "noopener noreferrer" }, `Mit PayPal bezahlen (${euro.format(o.total)})`),
          h("button", { class: "link", onclick: () => goTab("konto") }, "Posten ansehen"))
      : h("div", { class: "tile" }, h("p", { class: "label" }, "Dein Konto"), h("p", { class: "num text zero" }, "Alles bezahlt ✓"));
    // Immer volle Zeilen: Die kleinen Kacheln füllen das Raster, eine einzelne Kachel wird breit. Die Abwesenheiten-Kachel ist immer breit.
    const small = [
      h("div", { class: "tile" },
        h("p", { class: "label" }, "Kassenstand"),
        h("p", { class: "num" }, euro.format(Number(t.paypal) + Number(t.outstanding))),
        h("p", { class: "label" }, `inkl. ${euro.format(t.outstanding)} offen`)),
      b ? h("div", { class: "tile" },
        h("p", { class: "label" }, "Nächster Geburtstag"),
        h("p", { class: "num text" }, b.name),
        h("p", { class: "label" }, `${dateDay(b.date)} (${b.turns})`)) : null,
    ].filter(Boolean);
    if ((small.length + (owes ? 0 : 1)) % 2 === 1) small[small.length - 1].classList.add("wide");
    return h("div", { class: "tiles" }, konto, ...small, absencesTile(a, absSum));
  }

  // Stilisierter Pfeil: schräg hoch (mehr), waagerecht (ähnlich), schräg runter (weniger). Neutrale Farbe, keine Wertung.
  function arrow(direction) {
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("class", "arrow" + (direction === "mehr" ? " a-up" : direction === "weniger" ? " a-down" : ""));
    const p = document.createElementNS(NS, "path"); p.setAttribute("d", "M4 12h15M13 6l6 6-6 6"); svg.append(p);
    return svg;
  }

  // Abwesenheiten: Durchschnitt pro Abend im laufenden Jahr und Tendenz der letzten 12 Monate (aus der Statistik).
  // Bis die Statistik da ist steht "…", fällt sie aus, bleibt die Summe aller Mitglieder.
  function absencesTile(a, absSum) {
    const body = h("div", {}, h("p", { class: "num" }, "…"));
    const fallback = () => body.replaceChildren(h("p", { class: "num" }, String(absSum)), h("p", { class: "label" }, "alle Mitglieder zusammen"));
    getStats().then((st) => {
      const t = window.Trend.absenceTrend(st);
      if (t.yearAvg == null) return fallback();
      const parts = [
        h("p", { class: "num" }, fmt1(t.yearAvg), h("span", { class: "unit" }, " pro Abend")),
        h("p", { class: "label" }, `Durchschnitt ${t.year}, bisher ${t.yearEvenings} ${t.yearEvenings === 1 ? "Abend" : "Abende"}`)];
      if (t.series.length >= 3) {
        const nums = t.prev == null
          ? `Letzte 12 Monate Ø\u00a0${fmt1(t.last)} pro Abend`
          : `Letzte 12 Monate Ø\u00a0${fmt1(t.last)}, davor Ø\u00a0${fmt1(t.prev)}`;
        const head = { mehr: "Mehr als davor", weniger: "Weniger als davor", "ähnlich": "Ähnlich wie davor" }[t.direction];
        parts.push(h("div", { class: "sep trend" },
          t.direction ? h("span", { class: "bubble", "aria-hidden": "true" }, arrow(t.direction)) : null,
          h("div", {},
            head ? h("p", {}, h("strong", {}, head)) : null,
            h("p", { class: "label" }, nums),
            t.direction === "ähnlich" ? h("p", { class: "label" }, "Kleine Unterschiede sind Zufall.") : null)));
      }
      body.replaceChildren(...parts);
    }).catch(fallback);
    return h("div", { class: "tile wide", "aria-label": `Abwesenheiten ${a.year}` }, h("p", { class: "label" }, `Abwesenheiten ${a.year}`), body);
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

  // ---------- Tabs ----------
  const TAB_KEY = "stammtisch_tab";
  const TABS = [
    ["start", "Start", "M3 11.5 12 4l9 7.5M5.5 10v9.5h13V10"],
    ["stat", "Statistik", "M5 20V11M12 20V5M19 20v-7"],
    ["konto", "Konto", "M3.5 7h17v12h-17zM3.5 7l2-3h13l2 3M15.5 13h2"],
    ["chronik", "Chronik", "M5 4.5h11a3 3 0 0 1 3 3v12H8a3 3 0 0 1-3-3zM5 16.5a3 3 0 0 1 3-3h11"],
  ];
  const icon = (path) => {
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24"); svg.setAttribute("aria-hidden", "true");
    const p = document.createElementNS(NS, "path"); p.setAttribute("d", path); svg.append(p);
    return svg;
  };
  let tab = [...TABS.map(([id]) => id), "admin"].includes(session.get(TAB_KEY)) ? session.get(TAB_KEY) : "start";
  let statsCache = null; // Antwort von app_stats, wird beim Öffnen des Tabs geladen
  let statsReq = null; // laufende Anfrage, damit ein erneutes Zeichnen keine zweite startet
  let last = null; // zuletzt geladene Daten, damit ein Tab-Wechsel nicht neu lädt

  function goTab(id) {
    tab = id; session.set(TAB_KEY, id);
    if (last) render(last.own);
    window.scrollTo(0, 0);
  }

  const ADMIN_ICON = "M12 3l7 3v5.5c0 4.5-3 8-7 9.5-4-1.5-7-5-7-9.5V6zM9 12l2.2 2.2L15 10";

  function tabBar(admin) {
    return h("nav", { class: "tabbar", "aria-label": "Bereiche" }, h("div", { class: "tabbar-in" },
      TABS.map(([id, label, path]) => h("button", { type: "button", "aria-current": id === tab ? "page" : null, onclick: () => goTab(id) }, icon(path), label)),
      admin ? h("button", { type: "button", "aria-current": tab === "admin" ? "page" : null, onclick: () => goTab("admin") }, icon(ADMIN_ICON), "Admin") : null));
  }

  // Statistik (Gruppenwerte für alle): wird erst gebraucht geladen, Tab und Chronik teilen sich eine Anfrage.
  function getStats() {
    if (statsCache) return Promise.resolve(statsCache);
    if (!statsReq) statsReq = Promise.all([rpc("app_stats"), rpc("app_stats_absent").catch(() => null)]).then(([d, grid]) => { statsReq = null; return (statsCache = Object.assign(d, { absent_grid: grid })); }, (e) => { statsReq = null; throw e; });
    return statsReq;
  }

  // Rangliste für "Wer ist als Nächstes dran?": gleiche Logik wie der Vorschlag bei der Vorsitz-Übertragung (vorsitz.js).
  function chairRanking(d) {
    if (!(d.overview && d.overview.chairs)) return null;
    return window.Vorsitz.rankMembers(memberNames(d), d.overview.chairs, chairTarget(d).chair, todayBerlin());
  }

  function statsPage(d) {
    const box = h("div", {});
    const show = (st) => box.replaceChildren(window.Charts.statsPage(st, chairRanking(d)));
    const fail = (e) => box.replaceChildren(h("div", { class: "card center" }, h("p", {}, e.message || "Die Statistik ist gerade nicht erreichbar."),
      h("button", { class: "primary", onclick: () => { box.replaceChildren(h("p", { class: "muted center pad" }, "Lade ...")); getStats().then(show, fail); } }, "Nochmal versuchen")));
    if (statsCache) show(statsCache);
    else { box.append(h("p", { class: "muted center pad" }, "Lade ...")); getStats().then(show, (e) => { if (e.invalid) { window.App.forgetToken(); showNoToken(); } else fail(e); }); }
    return box;
  }

  function render(own) {
    last = { own };
    const admin = !!own.me.is_admin;
    if (tab === "admin" && !admin) tab = "start";
    const d = own;
    const today = new Date(todayBerlin() + "T12:00:00").toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" });
    // Nur der geöffnete Tab wird gebaut (der Statistik-Tab lädt Daten).
    const pages = {
      start: () => [heroCard(d), whoCard(d), tilesBlock(d, goTab)],
      stat: () => [statsPage(d)],
      konto: () => [accountCard(d), openCard(d)],
      chronik: () => [recentCard(d), chairsCard(d), locationsCard(d), absencesCard(d)],
      admin: () => [window.AdminView.render(own)],
    };
    const root = h("div", {},
      tab === "start"
        ? [h("p", { class: "hello" }, today), h("h1", {}, `Servus, ${d.me.name}!`)]
        : h("h1", {}, tab === "admin" ? "Admin" : TABS.find(([id]) => id === tab)[1]),
      pages[tab](),
      footer());
    $app.classList.add("tabs");
    $app.replaceChildren(root, tabBar(admin));
  }

  // Für die Home-Bildschirm-App (iPhone): eigener Speicher, deshalb Link oder Code hier einfügen.
  function tokenForm() {
    const input = h("input", { id: "tok", type: "text", autocomplete: "off", autocapitalize: "off", spellcheck: "false", placeholder: "Persönlichen Link oder Code einfügen", "aria-label": "Persönlicher Link oder Code" });
    const save = () => { if (window.App.setToken(input.value)) load(); else input.focus(); };
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") save(); });
    return h("div", { style: "margin-top:16px;text-align:left" }, input, h("button", { class: "primary full", style: "margin-top:8px", onclick: save }, "Speichern"));
  }

  function showNoToken() {
    $app.classList.remove("tabs");
    $app.replaceChildren(h("div", { class: "card center", style: "margin-top:32px" },
      h("p", { class: "big" }, "🍻 Griassgottbeinand"),
      h("p", {}, "Bitte öffne deinen persönlichen Link. Den bekommst du vom Kassier."),
      h("p", { class: "muted small" }, "Dein Link wird auf diesem Gerät gespeichert. Danach reicht das Icon auf dem Startbildschirm."),
      tokenForm()));
  }

  let loading = false;
  async function load(manual) {
    if (!window.App.hasToken()) return showNoToken();
    if (loading) return;
    loading = true;
    try {
      const [own, overview] = await Promise.all([rpc("app_dashboard"), rpc("app_overview").catch(() => null)]);
      own.overview = overview;
      render(own);
      if (manual) { statsCache = null; toast("Aktualisiert."); }
    } catch (e) {
      if (e.invalid) { window.App.forgetToken(); showNoToken(); }
      else if (!$app.querySelector(".card, .hero, .tile")) { $app.classList.remove("tabs"); $app.replaceChildren(h("div", { class: "card center pad" }, h("p", {}, e.message), h("button", { class: "primary", onclick: () => load() }, "Nochmal versuchen"))); }
      else toast(e.message, true);
    } finally { loading = false; }
  }

  hooks.reload = () => load();
  hooks.noToken = showNoToken;

  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && window.App.hasToken()) load(); });
  if ("serviceWorker" in navigator && location.protocol !== "file:") navigator.serviceWorker.register("sw.js").catch(() => {});
  load();
})();
