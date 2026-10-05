// Stammtischausflug: Banner fürs Dashboard und Sonderseite mit dem Ablaufplan.
// Die Daten stehen bewusst fest hier. Nach dem Rückreisetag verschwindet der Banner von selbst.
(function (root) {
  "use strict";

  // Orte: Name und Adresse für die Karte, optional Website. Der Kartenlink wird daraus gebaut.
  const P = {
    airport: { name: "Malta International Airport", addr: "Luqa, Malta", url: "https://www.maltairport.com" },
    hotel: { name: "VITA Hotel", addr: "146 St George's Road, St Julian's STJ 3203, Malta", url: "https://www.vitahotel.com.mt" },
    bayview: { name: "Bayview Restaurant, Marina Hotel Corinthia", addr: "St George's Bay, St Julian's, Malta", url: "https://corinthiagroup.com/property/marina-hotel-corinthia-beach-resort-malta/" },
    sliema: { name: "Sliema Ferries", addr: "The Strand, Sliema, Malta" },
    valletta: { name: "Valletta", addr: "Valletta, Malta" },
    lubelli: { name: "Lubelli, InterContinental Malta", addr: "St George's Bay, St Julian's STJ 3310, Malta", url: "https://www.ihg.com/intercontinental/hotels/gb/en/malta/malha/hoteldetail/dining" },
    brasserie: { name: "Brasserie", addr: "Paceville, St Julian's, Malta", unsure: true },
  };

  const TRIP = {
    title: "Stammtischausflug Malta",
    place: "Malta",
    from: "2026-10-15",
    to: "2026-10-18",
    hotel: "Hotel Vita, Paceville",
    hotelPlace: P.hotel,
    days: [
      { day: "Donnerstag 15.10.", items: [
        ["11:00", "Flug nach Malta", "10 Personen, mit Gepäckaufgabe"],
        ["13:20", "Landung (ETA)", "Transfer für 10 Personen zum Hotel Vita in Paceville", P.airport],
        ["19:30", "Abendessen", "Bayview Restaurant, Paceville", P.bayview],
      ] },
      { day: "Freitag 16.10.", items: [
        ["12:30", "Hafentour ab Sliema", "10 Personen, danach Besichtigung von Valletta. Transfer noch offen: Bus oder zu Fuß.", P.sliema, P.valletta],
        ["", "Ernest und Stefan", "Werden vom Flughafen abgeholt und zum Hotel gebracht. Danach kommen sie je nach Lust und Laune direkt nach Valletta."],
        ["20:00", "Abendessen", "Lubelli, Paceville", P.lubelli],
      ] },
      { day: "Samstag 17.10.", items: [
        ["09:20", "Abholung am Hotel", "", P.hotel],
        ["10:00", "Inselrundfahrt", "Dauer circa 7,5 Stunden"],
        ["20:00", "Abendessen", "Brasserie, Paceville", P.brasserie],
      ] },
      { day: "Sonntag 18.10.", items: [
        ["", "Freie Verfügung", ""],
        ["16:25", "Rückflug", "Transfer zum Flughafen ist gebucht, die genaue Abholzeit wird noch vereinbart."],
      ] },
    ],
    tips: "Badehandtuch und Badeschuhe oder Flip-Flops schaden nicht. Das Hotel hat einen Pool, das Meer ist circa 300 Meter entfernt. Jetzt heißt es Daumen drücken, dass das Wetter hält!",
  };

  const dayMs = 86400000;
  const noon = (iso) => Date.parse(iso + "T12:00:00");
  const dayDiff = (a, b) => Math.round((noon(b) - noon(a)) / dayMs);

  // Zeigen bis einschließlich Rückreisetag.
  const active = (today) => today <= TRIP.to;

  function status(today) {
    const toStart = dayDiff(today, TRIP.from);
    if (toStart > 1) return `in ${toStart} Tagen`;
    if (toStart === 1) return "morgen";
    return "läuft gerade";
  }

  const mapsUrl = (p) => "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(p.name + ", " + p.addr);

  function places(h, list) {
    return list.map((p) => h("span", { class: "muted small", style: "display:block" },
      "📍 ", p.name, " · ", p.addr, p.unsure ? " (Ort bitte bestätigen)" : "", " · ",
      h("a", { href: mapsUrl(p), target: "_blank", rel: "noopener noreferrer" }, "Karte"),
      p.url ? [" · ", h("a", { href: p.url, target: "_blank", rel: "noopener noreferrer" }, "Website")] : null));
  }

  const range = () => "15. bis 18. Oktober 2026";

  function banner(h, today, onOpen) {
    return h("button", { type: "button", class: "trip-banner", onclick: onOpen, "aria-label": `${TRIP.title}, ${range()}, Ablaufplan öffnen` },
      h("span", { class: "trip-emoji", "aria-hidden": "true" }, "✈️"),
      h("span", { class: "trip-text" },
        h("strong", {}, TRIP.title),
        h("span", {}, `${range()} · ${status(today)}`)),
      h("span", { class: "trip-go", "aria-hidden": "true" }, "›"));
  }

  function page(h, today, onBack) {
    return h("div", {},
      h("button", { type: "button", class: "link", style: "margin:0 0 8px", onclick: onBack }, "‹ Zurück zum Start"),
      h("div", { class: "hero" },
        h("p", { class: "when" }, status(today)),
        h("p", { class: "date" }, TRIP.title),
        h("p", { class: "muted" }, `${range()} · ${TRIP.hotel}`),
        h("p", { class: "muted small" }, h("a", { href: mapsUrl(TRIP.hotelPlace), target: "_blank", rel: "noopener noreferrer" }, "Hotel auf der Karte"))),
      TRIP.days.map((d) => h("section", { class: "card" },
        h("h2", { style: "margin:0 0 6px;font-size:1.05rem" }, d.day),
        d.items.map(([time, what, note, ...pl]) => h("div", { class: "trip-row" },
          h("span", { class: "trip-time" }, time || "·"),
          h("span", {}, h("strong", {}, what), note ? h("span", { class: "muted small", style: "display:block" }, note) : null, places(h, pl)))))),
      h("section", { class: "card" },
        h("h2", { style: "margin:0 0 6px;font-size:1.05rem" }, "Gut zu wissen"),
        h("p", { style: "margin:0" }, TRIP.tips)));
  }

  root.Trip = { TRIP, active, banner, page };
})(window);
