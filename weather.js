// Wetter am Stammtischabend (Open-Meteo, kein Schlüssel). Reine Funktionen oben, Abruf und Zwischenspeicher darunter.
// Antworten gelten eine Stunde pro Gerät (localStorage). Ist der Wert älter, wird er sofort gezeigt und im Hintergrund erneuert.
(function (root) {
  "use strict";

  const FROM = 19, TO = 23; // Abend, auf den sich die Anzeige bezieht (deutsche Zeit)
  const MAX_DAYS = 5; // Vorhersage nur, wenn der Termin höchstens so viele Tage entfernt ist

  // Wettercode (WMO) -> Art. Reihenfolge der Schwere für "schlimmstes Wetter des Abends".
  function kind(code) {
    if (code >= 95) return "storm";
    if (code >= 71 && code <= 77 || code === 85 || code === 86) return "snow";
    if (code >= 80 && code <= 82) return "shower";
    if (code >= 51 && code <= 67) return "rain";
    if (code === 45 || code === 48) return "fog";
    if (code >= 2) return "cloud";
    return "clear";
  }
  const SEVERITY = { clear: 0, cloud: 1, fog: 2, shower: 3, rain: 4, snow: 5, storm: 6 };
  const LABEL = { clear: "klar", cloud: "bewölkt", fog: "Nebel", shower: "Schauer", rain: "Regen", snow: "Schnee", storm: "Gewitter" };
  const ICON = { clear: "☀️", cloud: "☁️", fog: "🌫️", shower: "🌦️", rain: "🌧️", snow: "🌨️", storm: "⛈️" };

  // data: Antwort von Open-Meteo (hourly: time, temperature_2m, precipitation_probability, weather_code; daily: sunset). day: "YYYY-MM-DD".
  // Liefert null, wenn für den Abend keine Werte da sind.
  function evening(data, day) {
    const h = data && data.hourly;
    if (!h || !Array.isArray(h.time)) return null;
    const hours = [];
    h.time.forEach((t, i) => {
      if (t.slice(0, 10) !== day) return;
      const hr = Number(t.slice(11, 13));
      if (hr < FROM || hr > TO) return;
      hours.push({ hr, temp: h.temperature_2m[i], rain: h.precipitation_probability[i], kind: kind(h.weather_code[i]) });
    });
    if (!hours.length || hours.some((x) => x.temp == null)) return null;
    const first = hours[0];
    const worst = hours.reduce((a, b) => (SEVERITY[b.kind] > SEVERITY[a.kind] ? b : a));
    const wet = hours.filter((x) => SEVERITY[x.kind] >= SEVERITY.shower);
    const sunset = data.daily && data.daily.time ? (data.daily.sunset || [])[data.daily.time.indexOf(day)] : null;
    return {
      temp: Math.round(first.temp),
      kind: worst.kind,
      text: text(first, worst, wet),
      rainMax: Math.max(...hours.map((x) => x.rain || 0)),
      at: [19, 21, 23].map((hr) => hours.find((x) => x.hr === hr)).filter(Boolean).map((x) => ({ hr: x.hr, temp: Math.round(x.temp) })),
      sunset: sunset ? sunset.slice(11, 16) : null,
    };
  }

  // Kurztext in höchstens zwei, drei Wörtern.
  function text(first, worst, wet) {
    if (worst.kind === "storm") return "Gewitter";
    if (wet.length) {
      const label = LABEL[worst.kind];
      return wet[0].hr <= FROM ? label : `${label} ab ${wet[0].hr}`;
    }
    return worst.kind === "clear" ? "trocken" : LABEL[worst.kind];
  }

  const dayDiff = (a, b) => Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 86400000);

  const api = { kind, evening, text, dayDiff, ICON, LABEL, MAX_DAYS };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.Weather = Object.assign(root.Weather || {}, api);
})(typeof window !== "undefined" ? window : globalThis);

(function (root) {
  "use strict";
  if (typeof document === "undefined" || !root.Weather) return;
  const W = root.Weather;
  const TTL = 60 * 60 * 1000, KEY = "stammtisch_wetter_v1";

  const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
  const write = (v) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* egal */ } };

  async function fetchData(lat, lon, day) {
    const url = "https://api.open-meteo.com/v1/forecast?latitude=" + lat.toFixed(3) + "&longitude=" + lon.toFixed(3)
      + "&hourly=temperature_2m,precipitation_probability,weather_code&daily=sunset&timezone=Europe%2FBerlin&start_date=" + day + "&end_date=" + day;
    const res = await fetch(url);
    if (!res.ok) throw new Error("Wetter nicht erreichbar");
    return res.json();
  }

  // onUpdate(ergebnis, stand) wird mit dem Zwischenspeicher sofort und nach einem Abruf erneut aufgerufen. Fehler bleiben still.
  function load(lat, lon, day, onUpdate) {
    const key = `${lat.toFixed(3)},${lon.toFixed(3)},${day}`;
    const cache = read(), hit = cache[key];
    if (hit) onUpdate(W.evening(hit.data, day), hit.at);
    if (hit && Date.now() - hit.at < TTL) return;
    fetchData(lat, lon, day).then((data) => {
      const now = Date.now(), next = read();
      for (const k of Object.keys(next)) if (now - next[k].at > 24 * TTL) delete next[k];
      next[key] = { at: now, data };
      write(next);
      onUpdate(W.evening(data, day), now);
    }).catch(() => {});
  }

  root.Weather.load = load;
})(window);
