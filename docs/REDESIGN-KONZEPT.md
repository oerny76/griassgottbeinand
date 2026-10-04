# Redesign-Konzept: Stammtisch-App

Stand: 04.10.2026. Status: Alle drei Phasen umgesetzt. Richtung Mischung aus A und B, Datenschutz-Stufe 1 (Heatmap mit Namen nur im Admin-Bereich).

Hinweis: GitHub Pages ist öffentlich. Diese Datei enthält deshalb bewusst keine Namen und keine echten Zahlen einzelner Mitglieder.

## 1. Ziel

Die App wirkt heute bieder. Sie soll warm, modern und lebendig werden und aus den vorhandenen Daten interaktive Statistiken zeigen. Sie bleibt schlank: Vanilla HTML/CSS/JS, kein Build, Hosting über GitHub Pages, Daten in Supabase.

## 2. Gestaltungsrichtungen (Prototyp)

Der Prototyp liegt als `docs/redesign-prototyp.html` im Repo. Es ist eine einzelne Datei mit eingebetteten Daten. Die Namen sind anonymisiert (Mitglied A bis M), die Zahlen sind echt. Lokal einfach im Browser öffnen. Wichtig: Buttons A, B, C, Statistik. Mit `?v=S&dark=1` startet er in der Statistik im Dunkelmodus.

| | Richtung | Charakter | Einschätzung |
|---|---|---|---|
| A | Biergarten | Warm, grüne Hauptkarte für den nächsten Termin, Chip "in X Tagen", Kacheln | Freundlich, passt zur Gruppe |
| B | Bento dunkel | Kompakte Kacheln, großer Countdown mit Ring, Sparklines | Am modernsten, weniger "Stammtisch" |
| C | Chronik | Redaktionell, riesiges Datum, große Zahlenzeilen | Stilvoll, auf dem Handy sperrig |

**Empfehlung:** Mischung aus A und B. Kachel-Struktur von B, warme Optik von A, Hell und Dunkel (folgt dem Gerät).

## 3. Navigation

Untere Tab-Leiste mit vier Punkten:

1. **Start:** nächster Termin, An-/Abmelden, Gäste, Vorsitz, Location, offener Betrag mit PayPal-Link
2. **Statistik:** siehe Abschnitt 4
3. **Konto:** eigene Posten und Zahlungen
4. **Chronik:** vergangene Abende

Admin bleibt eine eigene Seite (`admin.html`), damit klar ist, wo man ist.

## 4. Statistiken

Alle Diagramme sind eigene SVGs ohne Bibliothek.

| Diagramm | Form | Hinweis |
|---|---|---|
| Anwesenheit pro Abend | Balken, Umschalter 12 / 24 Treffen | Kennzahl: Durchschnitt |
| Abwesenheiten Mitglieder x Abende | Heatmap | Datenschutz-Stufe beachten |
| Kassenstand über die Zeit | Linie mit Markierungen für große Ausgaben (Reisen) | Monatswerte |
| Einnahmen pro Jahr | Gestapelte Balken nach Art | Geburtstag, Abwesenheit, Sonderumlage, Gäste |
| Wartezeit auf den Vorsitz | Balken pro Mitglied | Gleiche Logik wie `vorsitz.js` |
| Abwesenheiten pro Jahr | Balken, pro Abend normiert | Seit 2015 |

Jedes Diagramm bekommt: Tooltip (Hover und Antippen), Beschriftung direkt an den Marken, Legende ab zwei Serien, Knopf "Als Tabelle anzeigen", Hell- und Dunkelvariante.

## 5. Farben (mit dataviz-Validator geprüft)

Reihenfolge fest: Grün, Gelb, Koralle, Violett. Nie zyklisch, Farbe folgt der Bedeutung.

| Rolle | Hell (Fläche `#fcfcfb`) | Dunkel (Fläche `#1c2b26`) |
|---|---|---|
| Grün (Mitglieder, Geburtstag) | `#1f8a70` | `#22a479` |
| Gelb (Abwesenheit, Gäste) | `#e8a200` | `#b78a0b` |
| Koralle (Sonderumlage) | `#e2573d` | `#c65959` |
| Violett (Gäste im Einnahmen-Diagramm) | `#6b5bd2` | `#7971d0` |

Prüfbefehl: `node scripts/validate_palette.js "<hex,...>" --mode light|dark [--surface #hex]`.
Warnung: Gelb hat im Hellmodus zu wenig Kontrast. Deshalb immer sichtbare Labels und Tabellenansicht. Text nie in Serienfarbe.

## 6. Datenschutz, Entscheidung offen

1. **Nur Gruppenwerte:** Alle sehen Durchschnitte, Kasse, Jahresverläufe. Keine Einzelpersonen.
2. **Mit Namen bei Abwesenheit:** Zusätzlich die Heatmap pro Mitglied. Transparent, kann aber wie ein Pranger wirken.
3. **Wie 2, Beträge nur für Admin.**

Empfehlung: Stufe 1 für alle, Heatmap im Admin-Bereich. Später öffnen ist leicht, zurücknehmen schwer.

## 7. Datengrundlagen und Grenzen

- Anwesenheit = 13 minus Abwesenheiten (wie im alten Sheet). Die Mitgliederzahl hat sich geändert, ältere Werte sind ungenau.
- Abwesenheiten sind erst ab etwa 2014 verlässlich.
- Locations: nur wenige Bewertungen bei über 100 Orten. Keine belastbare Bestenliste.
- Keine Koordinaten, deshalb keine Karte ohne Geocoding.
- Kein Zahlungsdatum gespeichert, deshalb keine "Zahlungsdauer".
- Einträge werden nie gelöscht (Supabase-MCP hängt bei DELETE). Alle Auswertungen müssen `cancelled_at is null` filtern.

## 8. Technik

- **Neue RPC `app_stats(p_token)`**: `SECURITY DEFINER`, prüft den Token über `_auth_member`, liefert nur aggregierte JSON-Werte. Tabellen bleiben für anon gesperrt (RLS ohne Policies).
- Admin-Variante `app_stats_admin(p_token)` für Heatmap und Beträge (`_auth_admin`).
- Charts in neuer Datei `charts.js` (Funktionen, die SVG per `document.createElementNS` bauen, Text nur per `textContent`, kein `innerHTML`).
- Tooltip: ein gemeinsames Element, Positionierung am Marker, Tastatur-Fokus unterstützen.
- Service Worker: Cache-Version erhöhen (aktuell `stammtisch-v6`), neue Dateien in die Liste.
- Tests lokal mit Playwright und gemockten Supabase-Routen (Muster wie bisher), plus Rollback-Test der RPC:
  `DO $$ ... raise exception 'PRUEFUNG: %', ...; $$;` und `set local role anon` für Browserrechte.

## 9. Phasen

1. **Look und Navigation:** neue Tokens in `styles.css` (Farben, Radien, Schatten, Dunkelmodus), Startseite als Kacheln, Tab-Leiste. Keine neue Datenbankfunktion nötig.
2. **Statistik-Tab:** `app_stats`, `charts.js`, erste drei Diagramme (Anwesenheit, Kasse, Einnahmen).
3. **Rest:** Vorsitz-Wartezeit, Abwesenheiten pro Jahr, Admin-Heatmap, Chronik-Tab.

Jede Phase einzeln als Pull Request, damit sie sich leicht prüfen und zurücknehmen lässt.

## 10. Offene Punkte

- Richtung festlegen (A, B, C oder Mischung).
- Datenschutz-Stufe festlegen.
- Aus früheren Schritten: SQL-Migrationen als Dateien ins Repo legen, leere Spalte `entries.payment_reported_at` entfernen, alten Apps Script abschalten.
- Echter Test auf dem iPhone und erster echter Aufruf App gegen Supabase stehen noch aus.
