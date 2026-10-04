# Griassgottbeinand

Schlanke Web-App (PWA) für den Stammtisch: Termine, Abmeldung, Gäste, eigene offene Beträge mit PayPal-Link.
Ohne Build-Schritt: reines HTML, CSS und JavaScript. Daten liegen in Supabase (Projekt `griassgottbeinand`).

## Dateien

| Datei | Zweck |
|---|---|
| `index.html`, `styles.css`, `common.js`, `app.js` | Mitglieder-App  |
| `admin.js`, `paypal.js` | Admin-Tab in der App: Zahlungen, Buchungen, Offen, Letzte |
| `config.js` | Öffentliche Verbindungsdaten (URL, öffentlicher Schlüssel, PayPal-Name) |
| `charts.js` | Statistik-Seite mit den Diagrammen |
| `trend.js` | Rechenlogik für Durchschnitt und Tendenz der Abwesenheiten (reine Funktionen, mit `node` testbar) |
| `db/` | SQL der Datenbankfunktionen (`app_stats.sql`, `app_stats_absent.sql`, `app_add_absence.sql`, `chair_target.sql`, `location_ratings.sql`; die übrigen liegen noch nur in Supabase) |
| `docs/` | Redesign-Konzept und Prototyp (nur Entwurf, wird nicht ausgeliefert genutzt) |
| `manifest.webmanifest`, `sw.js`, `icons/` | Installierbare App, Offline-Hülle |

## Aufbau der Mitglieder-App

Untere Tab-Leiste mit vier Bereichen (Konzept: `docs/REDESIGN-KONZEPT.md`):

- **Start:** Hauptkarte mit dem nächsten Termin ("in X Tagen") und den Aktionen direkt darin ("Ich komme nicht" oder "Doch teilnehmen", für den Vorsitz "Vorsitz übertragen" oder "Vorsitz ändern" und "Location festlegen" oder "Location ändern"; Auswahl und Eingabe klappen in der Karte auf), dazu bei gewählter Location Knöpfe für die Route (Apple Karten auf Apple-Geräten, Google Maps) und die Website, darunter die Karte "Wer fehlt, wer kommt dazu" (Entschuldigte und Gäste), dann Kacheln (Konto mit PayPal-Link, Kassenstand, Geburtstag, Abwesenheiten mit Durchschnitt pro Abend und Tendenz der letzten 12 Monate).
- **Statistik:** Anwesenheit pro Abend (12 oder 24 Abende), Heatmap "Wer fehlt wie oft?", Kassenstand über die Zeit, Einnahmen pro Jahr, Wartezeit auf den Vorsitz, Abwesenheiten pro Abend und Jahr. Siehe unten.
- **Locations bewerten:** Je Mitglied und Location eine Bewertung (Essen, Getränke, Service, Ambiente, Preis-Leistung, 1 bis 5 Sterne, nicht alles muss gesetzt sein, später änderbar). Zu erreichen über "Location bewerten" in der Hauptkarte (ab dem Stammtischtag) und über die Abende unter Chronik > Letzte Abende (aufklappen). Bewerten geht nur für Locations, an denen schon ein Stammtisch war. Funktionen `app_my_ratings` und `app_rate_location` in `db/location_ratings.sql`. Die alten importierten Bewertungen haben kein Mitglied und bleiben unverändert.
- **Konto:** eigene Posten und die offenen Beträge im Stammtisch.
- **Chronik:** letzte Abende (mit Anzahl Anwesender und Gästen, sobald die Statistik geladen ist), Vorsitz-Historie, besuchte Locations, Abwesenheiten.

Hell und Dunkel folgen dem Gerät. Farben und Formen stehen als Variablen oben in `styles.css`.

## Statistik

Eigene SVG-Diagramme in `charts.js`, keine Bibliothek. Tooltip per Hover, Antippen und Tastatur (Pfeiltasten im Kassen-Diagramm), jedes Diagramm hat eine Tabellenansicht.
Daten kommen aus der Funktion `app_stats` (`db/app_stats.sql`). Sie liefert nur Gruppenwerte. Nur die Heatmap enthält Namen (siehe unten).

Annahmen, die man kennen sollte:

- **Anwesende** = aktuelle Mitgliederzahl minus Entschuldigte (Abwesenheit 1x und unentschuldigt) pro Abend. Nur die letzten 24 Abende, denn die Mitgliederzahl hat sich früher geändert. Die Buchung "Abwesenheit (6x)" zählt nicht als Abwesenheit an diesem Abend.
- **Kassenstand** = Summe der PayPal-Zahlungen ohne Altbestand (`money_pool` leer), am Monatsende. Monate ohne Zahlung übernehmen den Vormonat. Punkte markieren Monate mit Auszahlungen ab 1.000 €.
- **Einnahmen** = nur positive Buchungen nach Buchungsdatum, nicht nach Zahlung. Ausgaben sind nicht abgezogen. Gäste = Gastbeitrag und Gast unangemeldet.
- **Wartezeit auf den Vorsitz:** Monate seit dem letzten Vorsitz, gleiche Rangliste wie der Vorschlag bei "Vorsitz übertragen" (`vorsitz.js`). Der schon bestimmte Vorsitz fehlt in der Liste. Diese Angaben sehen alle ohnehin in der Vorsitz-Historie.
- **Abwesenheiten pro Abend:** Abwesenheiten je Jahr geteilt durch die Zahl der Abende, seit 2015. Gezählt nach Buchungsdatum, denn vor 2021 sind einige Abwesenheiten keinem Abend zugeordnet.
- **Tendenz (Kachel Abwesenheiten):** Durchschnitt der letzten 12 Monate gegen die 12 Monate davor, gerechnet aus den Anwesenden pro Abend. Gezeigt wird ein neutraler Pfeil (schräg hoch, waagerecht, schräg runter) mit Text und Zahlen. Pro Abend schwankt die Zahl stark (etwa 1 bis 7), deshalb heißt es erst ab einem Unterschied von 1 pro Abend "mehr" oder "weniger", sonst "ähnlich". Fehlen Vergleichsdaten, steht nur der Durchschnitt der letzten 12 Monate.
- Das laufende Jahr ist unvollständig und mit * markiert.

**Heatmap "Wer fehlt wie oft?":** Unter "Wer war dabei?" zeigt eine Heatmap mit Namen, wer bei den letzten zwölf Abenden fehlte (`db/app_stats_absent.sql`, für jedes Mitglied mit gültigem Code lesbar). Fällt diese Abfrage aus, fehlt nur die Karte.

## Sicherheit in Kürze

- Alle Tabellen sind für Browser gesperrt (Row Level Security ohne Policy).
- Zugriff geht nur über Datenbankfunktionen `app_*`. Jede prüft den persönlichen Code (`?t=…` im Link) und die Rolle. Alle Mitglieder sehen die Heatmap mit Namen (bewusste Entscheidung vom 04.10.2026).
- Der Schlüssel in `config.js` ist für Browser gedacht und darf öffentlich sein.
- Persönliche Codes gehören **nie** ins Repo.
- Buchungen werden nie gelöscht, nur storniert (`entries.cancelled_at`).

## Rollen

- Mitglied: eigene Abwesenheit und Gäste (bis 19 Uhr am Stammtischtag), eigene offene Posten.
- Vorsitz des letzten Abends: bestimmt den nächsten Vorsitz. Ist er vergeben, darf er ihn nur noch bis einschließlich zum Tag nach dem Stammtisch ändern.
- Designierter Vorsitz ("ich" in der App): kann sich nicht einfach abmelden. Statt "Ich komme nicht" steht zuerst "Vorsitz übertragen", erst danach erscheint "Ich komme nicht" (die Datenbank erzwingt es in `app_add_absence`, siehe `db/app_add_absence.sql`). Er überträgt den Vorsitz mit "Vorsitz übertragen" (Auswahl mit Vorschlag nach der längsten Zeit ohne Vorsitz, `vorsitz.js`) und trägt die Location ein.
- **Am Stammtischtag:** Bis 19 Uhr gelten "Vorsitz übertragen" und "Location eintragen" für den heutigen Stammtisch (Beschriftung: "für aktuellen Stammtisch"). Ab 19 Uhr gelten sie für den nächsten Stammtisch ("für nächsten Stammtisch festlegen"). Gibt es noch keinen, wird er angelegt (erster Freitag im Folgemonat, sonst das gewählte Datum). Das Ziel bestimmt die Datenbank (`_target_meeting()`, siehe `db/chair_target.sql`): der erste Termin, dessen Frist (19 Uhr am Stammtischtag) noch nicht vorbei ist.
- Admin: alles, auch für andere Mitglieder und ohne Frist.

## Veröffentlichen

GitHub Pages aus dem Hauptzweig, Ordner `/ (root)`. Bei privaten Repos braucht Pages einen bezahlten GitHub-Tarif.
Alternativen ohne Build: Cloudflare Pages oder Netlify (Ordner direkt ausliefern).

Persönlicher Link pro Mitglied: `https://<adresse>/?t=<Code>`.
Der Code wird auf dem Gerät gespeichert. Danach "Zum Startbildschirm hinzufügen".

**iPhone:** Die App auf dem Home-Bildschirm hat einen eigenen Speicher, getrennt von Safari, und startet ohne `?t=…`. Deshalb gibt es auf der Seite "Bitte öffne deinen persönlichen Link" ein Eingabefeld: persönlichen Link oder nur den Code einfügen und "Speichern" (`setToken` in `common.js`). Der Code bleibt danach in der App gespeichert (getestet). Zusätzlich trägt `common.js` den Code in ein dynamisches Manifest als `start_url` ein, damit ein in Safari angelegtes Icon gleich mit dem Code startet. Ob iOS das übernimmt, ist nicht geprüft.

## Admin-Bereich (Tab "Admin")

Teil der App, keine eigene Seite. Der Tab "Admin" erscheint unten in der Tab-Leiste, aber nur für den Admin. Die Prüfung liegt in der Datenbank, nicht in der Oberfläche.

- **Zahlung:** Text der PayPal-Mail einfügen. Betrag, Datum, Transaktionscode, Absender und Mitteilung werden ausgelesen (`paypal.js`).
  Die App schlägt eine Zuordnung zu offenen Posten vor (alles, eindeutig oder mehrere Varianten zur Auswahl). Gebucht wird erst nach Bestätigung,
  und nur, wenn die Summe genau dem Betrag entspricht. Doppelte Transaktionscodes werden abgelehnt.
- **Buchen:** manuelle Buchungen, auch für alle Mitglieder (z. B. Geburtstagsbeitrag).
- **Offen:** offene Posten je Mitglied und Abgleich mit dem PayPal-Saldo.
- **Letzte:** letzte Buchungen, unbezahlte lassen sich stornieren.

Tests der Logik: `node` mit `paypal.js` (reine Funktionen, kein Browser nötig).

## Noch offen

- Übrige Datenbank-Migrationen als SQL-Dateien in `db/` ablegen.
- Aufräumen der leeren Spalte `entries.payment_reported_at`.
