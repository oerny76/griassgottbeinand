// Statistik-Seite: eigene SVG-Diagramme ohne Bibliothek. Alle Texte gehen über textContent, nie über innerHTML.
// Die Daten (Funktion app_stats) enthalten nur Gruppenwerte. Nur die Heatmap (app_stats_absent) zeigt Namen.
(() => {
  "use strict";
  const { h } = window.App;
  const NS = "http://www.w3.org/2000/svg";
  const W = 342;
  const fmtDate = (iso, o) => new Date(iso + "T12:00:00").toLocaleDateString("de-DE", o);
  const eur0 = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
  const eur2 = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });
  const money = (n) => (Number.isInteger(Number(n)) ? eur0 : eur2).format(Number(n));
  const num1 = (n) => Number(n).toLocaleString("de-DE", { maximumFractionDigits: 1 });
  const tsd = (n) => (n >= 1000 ? `${num1(n / 1000)} Tsd.` : String(n));
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  const niceMax = (v, step) => Math.max(step, Math.ceil(v / step) * step);

  function s(tag, attrs, ...kids) {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs || {})) if (v != null) e.setAttribute(k, v);
    for (const x of kids.flat()) if (x != null) e.append(x.nodeType ? x : document.createTextNode(String(x)));
    return e;
  }
  const fill = (v) => `fill:var(${v})`;
  const text = (x, y, str, cls, anchor) => s("text", { x, y, class: "t " + (cls || ""), "text-anchor": anchor || "middle" }, str);
  // Balken mit 4 px runden Köpfen, am Boden bündig.
  function barTop(x, y, w, hgt, r) {
    r = Math.min(r, w / 2, hgt);
    return `M${x},${y + hgt}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + hgt}Z`;
  }

  // ---------- Tooltip: ein gemeinsames Element, Hover, Antippen und Tastatur ----------
  let tipEl;
  function showTip(x, y, title, lines) {
    if (!tipEl) { tipEl = h("div", { id: "charttip", role: "tooltip" }); document.body.append(tipEl); }
    tipEl.replaceChildren(h("strong", {}, title), ...lines.map((l) => h("div", {}, l)));
    tipEl.classList.add("on");
    const r = tipEl.getBoundingClientRect();
    tipEl.style.left = Math.min(window.innerWidth - r.width - 8, Math.max(8, x - r.width / 2)) + "px";
    const top = y - r.height - 12;
    tipEl.style.top = (top < 8 ? y + 18 : top) + "px";
  }
  const hideTip = () => { if (tipEl) tipEl.classList.remove("on"); };
  document.addEventListener("pointerdown", (e) => { if (!(e.target.closest && e.target.closest("[data-tip]"))) hideTip(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") hideTip(); });

  function bindTip(el, title, lines) {
    el.setAttribute("data-tip", "1");
    el.setAttribute("tabindex", "0");
    el.setAttribute("role", "img");
    el.setAttribute("aria-label", `${title}: ${lines.join(", ")}`);
    const at = (e) => showTip(e.clientX, e.clientY, title, lines);
    el.addEventListener("pointermove", at);
    el.addEventListener("pointerdown", at);
    el.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse") hideTip(); }); // Touch: bleibt bis zum nächsten Tippen
    el.addEventListener("focus", () => { const r = el.getBoundingClientRect(); showTip(r.x + r.width / 2, r.y, title, lines); });
    el.addEventListener("blur", hideTip);
  }

  // ---------- Anwesenheit pro Abend ----------
  function attendance(d, n) {
    const data = d.attendance.slice(-n);
    const H = 190, pl = 26, pr = 4, pt = 16, pb = 20, iw = W - pl - pr, band = iw / data.length, bw = Math.min(14, band * 0.62);
    const ymax = Math.max(d.members, ...data.map((x) => x.present + x.guests));
    const sy = (v) => pt + (H - pt - pb) * (1 - v / ymax);
    const svg = s("svg", { class: "ch", viewBox: `0 0 ${W} ${H}`, width: "100%", role: "group", "aria-label": "Anwesende pro Stammtisch" });
    [0, 5, 10].filter((t) => t <= ymax).forEach((t) => svg.append(s("line", { x1: pl, x2: pl + iw, y1: sy(t), y2: sy(t), class: "grid" }), text(pl - 6, sy(t) + 4, t, "muted", "end")));
    svg.append(s("line", { x1: pl, x2: pl + iw, y1: sy(d.members), y2: sy(d.members), class: "grid" }), text(pl + iw, sy(d.members) - 4, `${d.members} Mitglieder`, "muted", "end"));
    const vals = data.map((x) => x.present), hi = vals.indexOf(Math.max(...vals)), lo = vals.indexOf(Math.min(...vals));
    data.forEach((x, i) => {
      const cx = pl + band * i + band / 2, x0 = cx - bw / 2, top = sy(x.present);
      svg.append(s("path", { d: barTop(x0, top, bw, sy(0) - top, x.guests ? 0 : 4), style: fill("--s1") }));
      if (x.guests) svg.append(s("path", { d: barTop(x0, sy(x.present + x.guests), bw, Math.max(2, top - sy(x.present + x.guests) - 2), 4), style: fill("--s2") }));
      if (i === hi || i === lo) svg.append(text(cx, sy(x.present + x.guests) - 5, x.present, "ink strong"));
      if (i % Math.ceil(data.length / 5) === 0 || i === data.length - 1) svg.append(text(cx, H - 4, fmtDate(x.date, { month: "short", year: "2-digit" }), "muted"));
      const hit = s("rect", { class: "hit", x: cx - band / 2, y: 0, width: band, height: H });
      bindTip(hit, fmtDate(x.date, { weekday: "short", day: "numeric", month: "long", year: "numeric" }),
        [`${x.present} Mitglieder da`, x.guests ? `${x.guests} ${x.guests === 1 ? "Gast" : "Gäste"}` : "keine Gäste", `${d.members - x.present} fehlten`]);
      svg.append(hit);
    });
    return svg;
  }

  // ---------- Kassenstand über die Zeit ----------
  const BIG_DROP = -1000; // Auszahlungen ab diesem Monatsminus werden markiert
  function cash(d) {
    const pts = d.cash, n = pts.length;
    const H = 190, pl = 40, pr = 14, pt = 16, pb = 20, iw = W - pl - pr;
    const ymax = niceMax(Math.max(...pts.map((p) => Number(p.balance))), 1000);
    const sx = (i) => pl + (n > 1 ? i * iw / (n - 1) : 0), sy = (v) => pt + (H - pt - pb) * (1 - v / ymax);
    const svg = s("svg", { class: "ch", viewBox: `0 0 ${W} ${H}`, width: "100%", role: "group", "aria-label": "Kassenstand je Monat" });
    [0, ymax / 2, ymax].forEach((t) => svg.append(s("line", { x1: pl, x2: W - pr, y1: sy(t), y2: sy(t), class: "grid" }), text(pl - 6, sy(t) + 4, t ? tsd(t) : "0", "muted", "end")));
    pts.forEach((p, i) => { if (p.month.endsWith("-01") || i === 0) svg.append(text(sx(i), H - 4, i === 0 && !p.month.endsWith("-01") ? fmtDate(p.month + "-01", { month: "short", year: "2-digit" }) : p.month.slice(0, 4), "muted", i === 0 ? "start" : "middle")); });
    const line = pts.map((p, i) => `${i ? "L" : "M"}${sx(i).toFixed(1)},${sy(p.balance).toFixed(1)}`).join("");
    svg.append(s("path", { d: `${line}L${sx(n - 1)},${sy(0)}L${sx(0)},${sy(0)}Z`, style: fill("--s1"), opacity: 0.1 }),
      s("path", { d: line, class: "line", style: "stroke:var(--s1)" }));
    pts.forEach((p, i) => {
      if (Number(p.change) > BIG_DROP) return;
      svg.append(s("circle", { cx: sx(i), cy: sy(p.balance), r: 4, class: "dot", style: fill("--s3") }));
    });
    const last = pts[n - 1];
    svg.append(s("circle", { cx: sx(n - 1), cy: sy(last.balance), r: 4, class: "dot", style: fill("--s1") }), text(sx(n - 1) - 6, sy(last.balance) - 9, money(last.balance), "ink strong", "end"));
    const cross = s("line", { y1: pt, y2: sy(0), class: "cross", opacity: 0 }), mark = s("circle", { r: 4.5, class: "dot", style: fill("--s1"), opacity: 0 });
    svg.append(cross, mark);
    const ov = s("rect", { class: "hit", x: pl, y: 0, width: iw, height: H, tabindex: 0, role: "img", "aria-label": "Kassenstand je Monat, mit Pfeiltasten wechseln" });
    let cur = n - 1;
    const show = (i, cx, cy) => {
      cur = Math.max(0, Math.min(n - 1, i));
      const p = pts[cur], ch = Number(p.change);
      cross.setAttribute("x1", sx(cur)); cross.setAttribute("x2", sx(cur)); cross.setAttribute("opacity", 1);
      mark.setAttribute("cx", sx(cur)); mark.setAttribute("cy", sy(p.balance)); mark.setAttribute("opacity", 1);
      if (cx == null) { const r = svg.getBoundingClientRect(); cx = r.left + sx(cur) * r.width / W; cy = r.top + sy(p.balance) * r.height / H; }
      showTip(cx, cy, money(p.balance), [fmtDate(p.month + "-01", { month: "long", year: "numeric" }), ch ? `Im Monat: ${ch > 0 ? "+" : ""}${money(ch)}` : "keine Bewegung"]);
    };
    const pointer = (e) => { const r = svg.getBoundingClientRect(); show(Math.round(((e.clientX - r.left) * (W / r.width) - pl) / iw * (n - 1)), e.clientX, e.clientY); };
    ov.addEventListener("pointermove", pointer); ov.addEventListener("pointerdown", pointer);
    const hideAll = () => { hideTip(); cross.setAttribute("opacity", 0); mark.setAttribute("opacity", 0); };
    ov.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse") hideAll(); });
    ov.addEventListener("blur", hideAll);
    ov.addEventListener("focus", () => show(cur));
    ov.addEventListener("keydown", (e) => {
      if (e.key === "ArrowLeft") { e.preventDefault(); show(cur - 1); } else if (e.key === "ArrowRight") { e.preventDefault(); show(cur + 1); }
    });
    ov.setAttribute("data-tip", "1");
    svg.append(ov);
    return svg;
  }

  // ---------- Einnahmen pro Jahr nach Art ----------
  const CATS = [["birthday", "Geburtstag", "--s1"], ["absence", "Abwesenheit", "--s2"], ["special", "Sonderumlage", "--s3"], ["guests", "Gäste", "--s4"]];
  function income(d, thisYear) {
    const rows = d.income.map((r) => Object.assign({ total: CATS.reduce((a, [k]) => a + Number(r[k]), 0) }, r));
    const H = 200, pl = 40, pr = 6, pt = 20, pb = 20, iw = W - pl - pr, band = iw / rows.length, bw = 28;
    const ymax = niceMax(Math.max(...rows.map((r) => r.total)), 1000);
    const sy = (v) => pt + (H - pt - pb) * (1 - v / ymax);
    const svg = s("svg", { class: "ch", viewBox: `0 0 ${W} ${H}`, width: "100%", role: "group", "aria-label": "Einnahmen pro Jahr nach Art" });
    [0, ymax / 2, ymax].forEach((t) => svg.append(s("line", { x1: pl, x2: W - pr, y1: sy(t), y2: sy(t), class: "grid" }), text(pl - 6, sy(t) + 4, t ? tsd(t) : "0", "muted", "end")));
    rows.forEach((r, i) => {
      const cx = pl + band * i + band / 2;
      const segs = CATS.filter(([k]) => Number(r[k]) > 0);
      let acc = 0;
      segs.forEach(([k, , col], j) => {
        const v = Number(r[k]), y1 = sy(acc + v), y0 = sy(acc);
        svg.append(s("path", { d: barTop(cx - bw / 2, y1, bw, Math.max(1.5, y0 - y1 - (j > 0 ? 2 : 0)), j === segs.length - 1 ? 4 : 0), style: fill(col) }));
        acc += v;
      });
      svg.append(text(cx, sy(r.total) - 6, tsd(Math.round(r.total)), "ink strong"), text(cx, H - 4, r.year === thisYear ? `${r.year}*` : r.year, "muted"));
      const hit = s("rect", { class: "hit", x: cx - band / 2, y: 0, width: band, height: H });
      bindTip(hit, `${r.year}${r.year === thisYear ? " (läuft noch)" : ""}: ${money(r.total)}`, segs.slice().reverse().map(([k, label]) => `${label}: ${money(r[k])}`));
      svg.append(hit);
    });
    return svg;
  }

  // ---------- Wer ist als Nächstes dran? ----------
  // rows: Ergebnis von Vorsitz.rankMembers (längste Zeit ohne Vorsitz zuerst). Diese Angaben sehen alle schon in der Vorsitz-Historie.
  function chairWait(rows) {
    const top = rows.slice(0, 8), rh = 28, pl = 84, pr = 58, iw = W - pl - pr;
    const mx = Math.max(12, ...top.filter((r) => r.days != null).map((r) => r.days / 30.44));
    const svg = s("svg", { class: "ch", viewBox: `0 0 ${W} ${top.length * rh + 4}`, width: "100%", role: "group", "aria-label": "Monate seit dem letzten Vorsitz" });
    top.forEach((r, i) => {
      const y = i * rh + 2, never = r.days == null, m = never ? null : r.days / 30.44, w = Math.max(4, iw * (never ? 1 : m / mx)), first = i === 0;
      svg.append(text(pl - 8, y + 18, r.name, "ink name" + (first ? " strong" : ""), "end"),
        s("path", { d: `M${pl},${y + 4}H${pl + w - 4}Q${pl + w},${y + 4} ${pl + w},${y + 8}V${y + 16}Q${pl + w},${y + 20} ${pl + w - 4},${y + 20}H${pl}Z`, style: first ? fill("--accent") : fill("--s1") }),
        text(pl + w + 6, y + 18, never ? "noch nie" : `${Math.round(m)} Mon.`, "ink strong", "start"));
      if (first) svg.append(text(pl + 8, y + 17, "Vorschlag", "dark strong", "start"));
      const hit = s("rect", { class: "hit", x: 0, y, width: W, height: rh });
      bindTip(hit, r.name, [r.last ? `zuletzt ${fmtDate(r.last, { day: "numeric", month: "long", year: "numeric" })}` : "bisher noch kein Vorsitz", `${r.count}× Vorsitz`]);
      svg.append(hit);
    });
    return svg;
  }

  // ---------- Abwesenheiten pro Jahr, je Abend ----------
  function absencesYear(d, thisYear) {
    const rows = d.absences_by_year.filter((r) => r.meetings > 0).map((r) => Object.assign({ avg: r.absences / r.meetings }, r));
    const H = 170, pl = 26, pr = 4, pt = 18, pb = 20, iw = W - pl - pr, band = iw / rows.length, bw = Math.min(18, band * 0.7);
    const ymax = niceMax(Math.max(...rows.map((r) => r.avg)), 2), sy = (v) => pt + (H - pt - pb) * (1 - v / ymax);
    const svg = s("svg", { class: "ch", viewBox: `0 0 ${W} ${H}`, width: "100%", role: "group", "aria-label": "Abwesenheiten pro Abend und Jahr" });
    [0, ymax / 2, ymax].forEach((t) => svg.append(s("line", { x1: pl, x2: W - pr, y1: sy(t), y2: sy(t), class: "grid" }), text(pl - 6, sy(t) + 4, num1(t), "muted", "end")));
    const hi = rows.reduce((a, r, i) => (r.avg > rows[a].avg ? i : a), 0), lo = rows.reduce((a, r, i) => (r.avg < rows[a].avg ? i : a), 0);
    rows.forEach((r, i) => {
      const cx = pl + band * i + band / 2, cur = r.year === thisYear;
      svg.append(s("path", { d: barTop(cx - bw / 2, sy(r.avg), bw, sy(0) - sy(r.avg), 4), style: fill("--s1") }));
      if (i === hi || i === lo || cur) svg.append(text(cx, sy(r.avg) - 5, num1(r.avg), "ink strong"));
      if (i % 2 === 0 || cur) svg.append(text(cx, H - 4, `'${String(r.year).slice(2)}${cur ? "*" : ""}`, "muted"));
      const hit = s("rect", { class: "hit", x: cx - band / 2, y: 0, width: band, height: H });
      bindTip(hit, `${r.year}${cur ? " (läuft noch)" : ""}`, [`${num1(r.avg)} Abwesenheiten pro Abend`, `${r.absences} Abwesenheiten bei ${r.meetings} Abenden`]);
      svg.append(hit);
    });
    return svg;
  }

  // ---------- Nur Admin: Wer fehlte bei den letzten Abenden ----------
  // data: Antwort von app_stats_absent. Ein "×" in der Zelle zeigt das Fehlen auch ohne Farbe.
  function heatmap(data) {
    const n = data.dates.length;
    const people = data.rows.map((r) => ({ name: r.name, cells: [...r.absent].map((c) => c === "1") }))
      .map((p) => Object.assign(p, { count: p.cells.filter(Boolean).length }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "de"));
    const pl = 70, pr = 30, top = 18, ch = 22, cell = (W - pl - pr) / n;
    const svg = s("svg", { class: "ch", viewBox: `0 0 ${W} ${top + people.length * ch + 4}`, width: "100%", role: "group", "aria-label": "Wer fehlte bei den letzten Stammtischen" });
    data.dates.forEach((d, i) => svg.append(text(pl + cell * i + cell / 2, 11, fmtDate(d, { month: "short" }).replace(".", ""), "muted small9")));
    people.forEach((p, r) => {
      const y = top + r * ch;
      svg.append(text(pl - 8, y + ch / 2 + 4, p.name, "ink name", "end"), text(W - 2, y + ch / 2 + 4, `${p.count}×`, "muted strong", "end"));
      p.cells.forEach((absent, i) => {
        const x = pl + cell * i + 1;
        svg.append(s("rect", { x, y: y + 1, width: cell - 2, height: ch - 2, rx: 4, style: fill(absent ? "--seq-hi" : "--seq-lo") }));
        if (absent) svg.append(text(x + (cell - 2) / 2, y + ch / 2 + 4, "×", "onseq strong"));
        const hit = s("rect", { class: "hit", x, y: y + 1, width: cell - 2, height: ch - 2, rx: 4 });
        bindTip(hit, `${p.name}, ${fmtDate(data.dates[i], { day: "numeric", month: "long", year: "numeric" })}`, [absent ? "fehlte" : "war dabei"]);
        svg.append(hit);
      });
    });
    return { svg, people };
  }

  function heatmapCard(data) {
    const { svg, people } = heatmap(data);
    return chartCard("Wer fehlt wie oft?", `Die letzten ${data.dates.length} Abende, Namen sind für alle Mitglieder sichtbar`,
      [legend([["fehlte (×)", "--seq-hi"], ["war dabei", "--seq-lo"]]), svg],
      { headers: ["Mitglied", `Fehlte (von ${data.dates.length})`], rows: people.map((p) => [p.name, p.count]) });
  }

  // ---------- Karten, Legende, Tabellenansicht ----------
  function table(headers, rows) {
    return h("div", { class: "tvwrap" }, h("table", { class: "tv" },
      h("thead", {}, h("tr", {}, headers.map((x) => h("th", { scope: "col" }, x)))),
      h("tbody", {}, rows.map((r) => h("tr", {}, r.map((c, i) => h(i ? "td" : "th", i ? {} : { scope: "row" }, c)))))));
  }
  function chartCard(title, sub, chart, tableData, extra) {
    const tbl = tableData ? table(tableData.headers, tableData.rows) : null;
    if (tbl) tbl.hidden = true;
    const btn = tbl && h("button", { class: "linkbtn", "aria-expanded": "false", onclick: () => {
      const open = tbl.hidden; tbl.hidden = !open; btn.setAttribute("aria-expanded", String(open)); btn.textContent = open ? "Tabelle ausblenden" : "Als Tabelle anzeigen";
    } }, "Als Tabelle anzeigen");
    return h("section", { class: "card chartcard" },
      h("div", { class: "head" }, h("h3", {}, title), h("p", { class: "muted small", style: "margin:2px 0 0" }, sub)),
      extra ? h("div", { class: "ctl" }, extra) : null,
      ...(Array.isArray(chart) ? chart : [chart]), btn, tbl);
  }
  const legend = (items) => h("div", { class: "legend" }, items.map(([label, col]) => h("span", {}, h("i", { style: `background:var(${col})` }), label)));

  function kpi(label, value, sub) {
    return h("div", { class: "kpi" }, h("p", { class: "label" }, label), h("p", { class: "v" }, value), h("p", { class: "label" }, sub));
  }

  // d: Antwort von app_stats, chairs: Rangliste für den Vorsitz (oder null, wenn die Übersicht fehlt)
  function statsPage(d, chairs) {
    const last12 = d.attendance.slice(-12).map((x) => x.present);
    const thisYear = Number(String(d.asof).slice(0, 4));
    const cur = d.income.find((r) => r.year === thisYear);
    const curTotal = cur ? CATS.reduce((a, [k]) => a + Number(cur[k]), 0) : 0;
    const lastCash = d.cash[d.cash.length - 1];

    let n = 24;
    const attBox = h("div", {});
    const draw = () => attBox.replaceChildren(attendance(d, n));
    const seg = h("div", { class: "seg", role: "group", "aria-label": "Zeitraum" }, [12, 24].map((v) => h("button", {
      type: "button", "aria-pressed": String(v === n),
      onclick: (e) => { n = v; seg.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b === e.currentTarget))); draw(); hideTip(); },
    }, `${v} Abende`)));
    draw();

    return h("div", {},
      h("div", { class: "kpis" },
        last12.length ? kpi("Ø Anwesende", num1(mean(last12)), `von ${d.members}, letzte ${last12.length} Abende`) : null,
        lastCash ? kpi("PayPal-Saldo", money(lastCash.balance), "ohne offene Beträge") : null,
        cur ? kpi(`Einnahmen ${thisYear}`, money(curTotal), "bis heute") : null),
      chartCard("Wer war dabei?", "Anwesende Mitglieder pro Stammtisch", [legend([["Mitglieder", "--s1"], ["Gäste", "--s2"]]), attBox,
        h("p", { class: "muted small", style: "margin:4px 0 0" }, `Anwesende = ${d.members} Mitglieder minus Entschuldigte. Tippe auf einen Balken für Datum und Gäste.`)],
        { headers: ["Abend", "Mitglieder", "Gäste"], rows: d.attendance.slice().reverse().map((x) => [fmtDate(x.date, { day: "2-digit", month: "2-digit", year: "numeric" }), x.present, x.guests]) }, seg),
      d.absent_grid && d.absent_grid.dates.length ? heatmapCard(d.absent_grid) : null,
      chartCard("Kassenstand", "PayPal-Saldo am Monatsende, Tippen und Wischen zeigt den Monat",
        [d.cash.some((p) => Number(p.change) <= BIG_DROP) ? legend([["Saldo", "--s1"], ["Auszahlung ab 1.000 € im Monat", "--s3"]]) : null, cash(d)],
        { headers: ["Monat", "Saldo", "Veränderung"], rows: d.cash.slice().reverse().map((p) => [fmtDate(p.month + "-01", { month: "long", year: "numeric" }), money(p.balance), money(p.change)]) }),
      chartCard("Einnahmen pro Jahr", "Was die Kasse eingenommen hat, Ausgaben sind nicht abgezogen",
        [legend(CATS.map(([, label, col]) => [label, col])), income(d, thisYear), h("p", { class: "muted small", style: "margin:4px 0 0" }, `* ${thisYear} läuft noch. Gezählt nach Buchungsdatum, nicht nach Zahlung.`)],
        { headers: ["Jahr", ...CATS.map(([, label]) => label)], rows: d.income.slice().reverse().map((r) => [r.year, ...CATS.map(([k]) => money(r[k]))]) }),
      chairs && chairs.length ? chartCard("Wer ist als Nächstes dran?", "Monate seit dem letzten Vorsitz, ohne den schon bestimmten Vorsitz", chairWait(chairs),
        { headers: ["Mitglied", "Zuletzt", "Vorsitze"], rows: chairs.map((r) => [r.name, r.last ? fmtDate(r.last, { day: "2-digit", month: "2-digit", year: "numeric" }) : "noch nie", r.count]) }) : null,
      d.absences_by_year && d.absences_by_year.length ? chartCard("Abwesenheiten pro Abend", "Durchschnitt je Stammtisch und Jahr, damit die Jahre vergleichbar sind",
        [absencesYear(d, thisYear), h("p", { class: "muted small", style: "margin:4px 0 0" }, `* ${thisYear} läuft noch. Vor 2021 sind einige Abwesenheiten keinem Abend zugeordnet, die Jahreswerte zählen sie trotzdem.`)],
        { headers: ["Jahr", "Abwesenheiten", "Abende", "Ø pro Abend"], rows: d.absences_by_year.filter((r) => r.meetings > 0).slice().reverse().map((r) => [r.year, r.absences, r.meetings, num1(r.absences / r.meetings)]) }) : null);
  }

  window.Charts = { statsPage, heatmapCard };
})();
