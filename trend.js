// Reine Logik ohne Oberfläche: Durchschnitt der Abwesenheiten im laufenden Jahr und Tendenz der letzten 12 Monate.
// Datengrundlage ist die Antwort von app_stats (Gruppenwerte, keine Einzelpersonen).
(function (root) {
  "use strict";

  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  const MIN_PREV = 6; // Weniger Abende im Vergleichszeitraum: kein Vergleich, nur der eigene Verlauf
  // Abwesenheiten pro Abend streuen stark (Standardabweichung etwa 2 bis 3), 12 Abende sind wenig.
// Der Unterschied zweier Zwölfer-Durchschnitte hat daher einen Zufallsfehler von etwa 1. Darunter sagen wir "ähnlich".
const FLAT = 1;

  // ISO-Datum minus n Monate (nur für Zeiträume, ein Versatz um einen Tag am Monatsende ist egal)
  function monthsBack(iso, n) {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1 - n, d)).toISOString().slice(0, 10);
  }

  // stats: { asof, members, attendance: [{date, present, guests}], absences_by_year: [{year, absences, meetings}] }
  function absenceTrend(stats) {
    const year = Number(String(stats.asof).slice(0, 4));
    const cur = (stats.absences_by_year || []).find((r) => Number(r.year) === year);
    const yearAvg = cur && Number(cur.meetings) > 0 ? Number(cur.absences) / Number(cur.meetings) : null;

    const absent = (a) => Math.max(0, Number(stats.members) - Number(a.present));
    const from = monthsBack(stats.asof, 12), before = monthsBack(stats.asof, 24);
    const att = stats.attendance || [];
    const series = att.filter((a) => a.date > from).map(absent);
    const prevSeries = att.filter((a) => a.date > before && a.date <= from).map(absent);

    const last = series.length ? mean(series) : null;
    const prev = prevSeries.length >= MIN_PREV ? mean(prevSeries) : null;
    let direction = null;
    if (last != null && prev != null) direction = Math.abs(last - prev) < FLAT ? "ähnlich" : last > prev ? "mehr" : "weniger";
    // Vorjahre nach genauso vielen Abenden wie das laufende Jahr (Feld absences_same_point), jüngstes Jahr zuerst
    const same = (stats.absences_same_point || [])
      .filter((r) => Number(r.year) < year && Number(r.meetings) > 0)
      .map((r) => ({ year: Number(r.year), meetings: Number(r.meetings), avg: Number(r.absences) / Number(r.meetings) }))
      .sort((a, b) => b.year - a.year);
    return { same, year, yearAvg, yearEvenings: cur ? Number(cur.meetings) : 0, series, last, prev, direction };
  }

  const api = { absenceTrend, monthsBack };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.Trend = api;
})(typeof window !== "undefined" ? window : globalThis);
