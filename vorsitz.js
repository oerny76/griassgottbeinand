// Reine Logik ohne Oberfläche: Vorschlag für den nächsten Vorsitz.
// Sortiert nach der längsten Zeit ohne Vorsitz (ältester letzter Vorsitz zuerst, "noch nie" ganz vorn).
(function (root) {
  "use strict";

  const dayMs = 86400000;
  const noon = (iso) => Date.parse(iso + "T12:00:00");

  // names: aktive Mitglieder, chairs: [{name, former, count, last}], exclude: z. B. der aktuelle Vorsitz, today: "JJJJ-MM-TT"
  function rankMembers(names, chairs, exclude, today) {
    const last = new Map((chairs || []).filter((c) => !c.former).map((c) => [c.name, c]));
    const t = noon(today);
    const list = names.filter((n) => n !== exclude).map((name) => {
      const c = last.get(name);
      return { name, last: c ? c.last : null, count: c ? Number(c.count) : 0, days: c ? Math.max(0, Math.round((t - noon(c.last)) / dayMs)) : null };
    });
    list.sort((a, b) => {
      if ((a.last === null) !== (b.last === null)) return a.last === null ? -1 : 1;
      if (a.last !== b.last) return a.last < b.last ? -1 : 1;
      if (a.count !== b.count) return a.count - b.count;
      return a.name.localeCompare(b.name, "de");
    });
    return list;
  }

  function ago(days) {
    if (days == null) return "noch nie";
    if (days < 1) return "heute";
    if (days === 1) return "gestern";
    if (days < 60) return `vor ${days} Tagen`;
    if (days < 730) return `vor ${Math.round(days / 30.44)} Monaten`;
    return `vor ${Math.round(days / 365.25)} Jahren`;
  }

  const api = { rankMembers, ago };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.Vorsitz = api;
})(typeof window !== "undefined" ? window : globalThis);
