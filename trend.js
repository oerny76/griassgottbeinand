// Reine Logik ohne Oberfläche: Durchschnitt der Abwesenheiten im laufenden Jahr und Tendenz gegenüber dem Vorjahr.
// Datengrundlage ist die Antwort von app_stats (Gruppenwerte, keine Einzelpersonen).
(function (root) {
  "use strict";

  // Abwesenheiten pro Abend streuen stark (Standardabweichung etwa 2 bis 3), zehn Abende sind wenig.
  // Der Unterschied zweier Durchschnitte hat daher einen Zufallsfehler von etwa 1. Darunter sagen wir "ähnlich".
  const FLAT = 1;

  // stats: { asof, absences_by_year: [{year, absences, meetings}], absences_same_point: [{year, absences, meetings}] }
  function absenceTrend(stats) {
    const year = Number(String(stats.asof).slice(0, 4));
    const cur = (stats.absences_by_year || []).find((r) => Number(r.year) === year);
    const yearAvg = cur && Number(cur.meetings) > 0 ? Number(cur.absences) / Number(cur.meetings) : null;

    // Vorjahre nach genauso vielen Abenden wie das laufende Jahr (Feld absences_same_point), jüngstes Jahr zuerst
    const same = (stats.absences_same_point || [])
      .filter((r) => Number(r.year) < year && Number(r.meetings) > 0)
      .map((r) => ({ year: Number(r.year), meetings: Number(r.meetings), avg: Number(r.absences) / Number(r.meetings) }))
      .sort((a, b) => b.year - a.year);

    // Tendenz: laufendes Jahr gegen das Vorjahr zum gleichen Zeitpunkt
    let direction = null;
    if (yearAvg != null && same.length && same[0].year === year - 1) {
      const diff = yearAvg - same[0].avg;
      direction = Math.abs(diff) < FLAT ? "ähnlich" : diff > 0 ? "mehr" : "weniger";
    }
    return { same, year, yearAvg, yearEvenings: cur ? Number(cur.meetings) : 0, direction };
  }

  const api = { absenceTrend };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.Trend = api;
})(typeof window !== "undefined" ? window : globalThis);
