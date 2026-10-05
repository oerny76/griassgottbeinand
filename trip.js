// Stammtischausflug: Banner fürs Dashboard und Sonderseite mit dem Ablaufplan.
// Die Daten stehen bewusst fest hier. Nach dem Rückreisetag verschwindet der Banner von selbst.
(function (root) {
  "use strict";

  // Orte: Name und Adresse für die Karte, optional Website. Der Kartenlink wird daraus gebaut.
  const P = {
    airport: { name: "Malta International Airport", addr: "Luqa, Malta", url: "https://www.maltairport.com" },
    hotel: { name: "VITA Hotel", addr: "146 St George's Road, St Julian's STJ 3203, Malta", url: "https://www.vitahotel.com.mt" },
    bayview: { name: "Bayview Restaurant, Marina Hotel Corinthia", addr: "St George's Bay, St Julian's, Malta", url: "https://corinthiagroup.com/property/marina-hotel-corinthia-beach-resort-malta/" },
    noru: { name: "Noru Hotel Malta", addr: "Triq Elija Zammit, San Ġiljan STJ 3151, Malta" },
    valletta: { name: "Valletta", addr: "Valletta, Malta" },
    lubelli: { name: "Lubelli, InterContinental Malta", addr: "St George's Bay, St Julian's STJ 3310, Malta", url: "https://www.ihg.com/intercontinental/hotels/gb/en/malta/malha/hoteldetail/dining" },
  };

  // Zielgruppe eines Programmpunkts: REST = alle außer Ernest und Stefan (sie reisen erst am Freitag), ONLY = nur Ernest und Stefan.
  const REST = { aud: "rest" }, ONLY = { aud: "es" };
  const isEs = (name) => /^(ernest|stefan)\b/i.test(String(name || "").trim());

  const TRIP = {
    title: "Stammtischausflug Malta",
    place: "Malta",
    from: "2026-10-15",
    to: "2026-10-18",
    days: [
      { day: "Donnerstag 15.10.", date: "2026-10-15", items: [
        ["11:00", "Flug nach Malta", "KM 307, München Terminal 2, 10 Personen, mit Gepäckaufgabe", REST],
        ["13:20", "Landung (ETA)", "Transfer für 10 Personen zum Hotel Vita in Paceville", P.hotel, REST],
        ["19:30", "Abendessen", "Bayview Restaurant, Paceville", P.bayview, REST],
      ] },
      { day: "Freitag 16.10.", date: "2026-10-16", items: [
        ["12:30", "Hafentour ab Sliema", "10 Personen, danach Besichtigung von Valletta. Transfer noch offen: Bus oder zu Fuß.", P.valletta, REST],
        ["11:00", "Flug Ernest und Stefan", "KM 307, München Terminal 2 nach Malta, Landung 13:20. Economy, aufgegebenes Gepäck 10 kg.", ONLY],
        ["13:20", "Ernest und Stefan: Landung", "Werden vom Flughafen abgeholt und zum Noru Hotel Malta gebracht. Danach kommen sie je nach Lust und Laune direkt nach Valletta.", P.noru, ONLY],
        ["20:00", "Abendessen", "Lubelli, Paceville", P.lubelli],
      ] },
      { day: "Samstag 17.10.", date: "2026-10-17", items: [
        ["09:20", "Abholung am Hotel", "", P.hotel],
        ["10:00", "Inselrundfahrt", "Dauer circa 7,5 Stunden"],
        ["20:00", "Abendessen", "Brasserie, Paceville"],
      ] },
      { day: "Sonntag 18.10.", date: "2026-10-18", items: [
        ["", "Freie Verfügung", ""],
        ["16:25", "Rückflug", "KM 3306 nach München Terminal 2, Landung 18:55, 12 Personen. Transfer zum Flughafen ist gebucht, die genaue Abholzeit wird noch vereinbart.", P.airport],
      ] },
    ],
    tips: "Badehandtuch und Badeschuhe oder Flip-Flops schaden nicht. Das Hotel hat einen Pool, das Meer ist circa 300 Meter entfernt. Jetzt heißt es Daumen drücken, dass das Wetter hält!",
  };

  const dayMs = 86400000;
  const noon = (iso) => Date.parse(iso + "T12:00:00");
  const dayDiff = (a, b) => Math.round((noon(b) - noon(a)) / dayMs);

  const nowBerlin = () => new Date().toLocaleString("sv-SE", { timeZone: "Europe/Berlin" }).slice(0, 16).replace(" ", "T");

  // Betrifft der Punkt diese Person? Ohne Zielgruppe gilt er für alle.
  const applies = (rest, name) => {
    const aud = (rest.find((x) => x.aud) || {}).aud;
    return !aud || (aud === "es") === isEs(name);
  };

  // Alle Programmpunkte mit Uhrzeit, für die angegebene Person, nach Zeit sortiert.
  function events(name) {
    return TRIP.days.flatMap((d) => d.items
      .filter(([time, , , ...rest]) => time && applies(rest, name))
      .map(([time, what, note]) => ({ at: `${d.date}T${time}`, time, what, note, date: d.date })))
      .sort((a, b) => a.at.localeCompare(b.at));
  }

  const nextEvent = (name, now) => events(name).find((e) => e.at >= (now || nowBerlin()));

  // Zeigen bis zum letzten Programmpunkt (Rückflug).
  const active = (today) => today <= TRIP.to && (today < TRIP.to || !!nextEvent("", nowBerlin()));

  function until(e, now) {
    const min = Math.round((Date.parse(e.at + ":00Z") - Date.parse(now + ":00Z")) / 60000);
    if (min < 1) return "jetzt";
    if (min < 60) return `in ${min} Min.`;
    if (min < 24 * 60) return `in ${Math.floor(min / 60)} Std.${min % 60 ? ` ${min % 60} Min.` : ""}`;
    return new Date(e.date + "T12:00:00").toLocaleDateString("de-DE", { weekday: "short" }) + " " + e.time;
  }

  // Ernest und Stefan kommen einen Tag später an.
  const startOf = (name) => (isEs(name) ? TRIP.days[1].date : TRIP.from);

  function status(today, name) {
    const toStart = dayDiff(today, startOf(name));
    if (toStart > 1) return `in ${toStart} Tagen`;
    if (toStart === 1) return "morgen";
    return "läuft gerade";
  }

  const mapsUrl = (p) => "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(p.name + ", " + p.addr);

  function places(h, list) {
    return list.map((p) => h("span", { class: "muted small", style: "display:block" },
      "📍 ", p.name, " · ", p.addr, " · ",
      h("a", { href: mapsUrl(p), target: "_blank", rel: "noopener noreferrer" }, "Karte"),
      p.url ? [" · ", h("a", { href: p.url, target: "_blank", rel: "noopener noreferrer" }, "Website")] : null));
  }

  const range = (name) => (isEs(name) ? "16. bis 18. Oktober 2026" : "15. bis 18. Oktober 2026");

  function banner(h, today, onOpen, name) {
    // Ab dem Abreisetag zeigt der Banner den nächsten Programmpunkt, vorher den Countdown.
    const now = nowBerlin();
    const e = today >= startOf(name) ? nextEvent(name, now) : null;
    const l1 = e ? `Als Nächstes: ${e.time} ${e.what}` : TRIP.title;
    const l2 = e ? `${e.note ? e.note.split(/[.,]/)[0] + " · " : ""}${until(e, now)}` : `${range(name)} · ${status(today, name)}`;
    return h("button", { type: "button", class: "trip-banner", onclick: onOpen, "aria-label": `${l1}, ${l2}, Ablaufplan öffnen` },
      h("span", { class: "trip-emoji", "aria-hidden": "true" }, "✈️"),
      h("span", { class: "trip-text" },
        h("strong", {}, l1),
        h("span", {}, l2)),
      h("span", { class: "trip-go", "aria-hidden": "true" }, "›"));
  }

  function page(h, today, onBack, name) {
    return h("div", {},
      h("button", { type: "button", class: "link", style: "margin:0 0 8px", onclick: onBack }, "‹ Zurück zum Start"),
      h("div", { class: "hero" },
        h("p", { class: "when" }, status(today, name)),
        h("p", { class: "date" }, TRIP.title),
        h("p", { class: "muted" }, range(name))),
      TRIP.days.map((d) => h("section", { class: "card" },
        h("h2", { style: "margin:0 0 6px;font-size:1.05rem" }, d.day),
        d.items.map(([time, what, note, ...rest]) => h("div", { class: "trip-row" + (applies(rest, name) ? "" : " off") },
          h("span", { class: "trip-time" }, time || "·"),
          h("span", {}, h("strong", {}, what), note ? h("span", { class: "muted small", style: "display:block" }, note) : null, places(h, rest.filter((x) => x.name)), rest.some((x) => x.aud) ? h("span", { class: "chip", style: "margin-top:4px" }, rest.find((x) => x.aud).aud === "es" ? "nur Ernest und Stefan" : "ohne Ernest und Stefan") : null))))),
      h("section", { class: "card" },
        h("h2", { style: "margin:0 0 6px;font-size:1.05rem" }, "Gut zu wissen"),
        h("p", { style: "margin:0" }, TRIP.tips)));
  }

  root.Trip = { TRIP, active, banner, page, nextEvent, events };
})(window);
