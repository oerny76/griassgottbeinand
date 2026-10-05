// Stammtischausflug: Banner fürs Dashboard und Sonderseite mit dem Ablaufplan.
// Die Daten stehen bewusst fest hier. Nach dem Rückreisetag verschwindet der Banner von selbst.
(function (root) {
  "use strict";

  const TRIP = {
    title: "Stammtischausflug Malta",
    place: "Malta",
    from: "2026-10-15",
    to: "2026-10-18",
    hotel: "Hotel Vita, Paceville",
    days: [
      { day: "Donnerstag 15.10.", items: [
        ["11:00", "Flug nach Malta", "10 Personen, mit Gepäckaufgabe"],
        ["13:20", "Landung (ETA)", "Transfer für 10 Personen zum Hotel Vita in Paceville"],
        ["19:30", "Abendessen", "Bayview Restaurant, Paceville"],
      ] },
      { day: "Freitag 16.10.", items: [
        ["12:30", "Hafentour ab Sliema", "10 Personen, danach Besichtigung von Valletta. Transfer noch offen: Bus oder zu Fuß."],
        ["", "Ernest und Stefan", "Werden vom Flughafen abgeholt und zum Hotel gebracht. Danach kommen sie je nach Lust und Laune direkt nach Valletta."],
        ["20:00", "Abendessen", "Lubelli, Paceville"],
      ] },
      { day: "Samstag 17.10.", items: [
        ["09:20", "Abholung am Hotel", ""],
        ["10:00", "Inselrundfahrt", "Dauer circa 7,5 Stunden"],
        ["20:00", "Abendessen", "Brasserie, Paceville"],
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
        h("p", { class: "muted" }, `${range()} · ${TRIP.hotel}`)),
      TRIP.days.map((d) => h("section", { class: "card" },
        h("h2", { style: "margin:0 0 6px;font-size:1.05rem" }, d.day),
        d.items.map(([time, what, note]) => h("div", { class: "trip-row" },
          h("span", { class: "trip-time" }, time || "·"),
          h("span", {}, h("strong", {}, what), note ? h("span", { class: "muted small", style: "display:block" }, note) : null))))),
      h("section", { class: "card" },
        h("h2", { style: "margin:0 0 6px;font-size:1.05rem" }, "Gut zu wissen"),
        h("p", { style: "margin:0" }, TRIP.tips)));
  }

  root.Trip = { TRIP, active, banner, page };
})(window);
