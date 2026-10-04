# Griassgottbeinand

Schlanke Web-App (PWA) für den Stammtisch: Termine, Abmeldung, Gäste, eigene offene Beträge mit PayPal-Link.
Ohne Build-Schritt: reines HTML, CSS und JavaScript. Daten liegen in Supabase (Projekt `griassgottbeinand`).

## Dateien

| Datei | Zweck |
|---|---|
| `index.html`, `styles.css`, `common.js`, `app.js` | Mitglieder-App (`common.js` ist gemeinsam mit dem Admin-Bereich) |
| `admin.html`, `admin.js`, `paypal.js` | Admin-Bereich: Zahlungen, Buchungen, Offen, Letzte |
| `config.js` | Öffentliche Verbindungsdaten (URL, öffentlicher Schlüssel, PayPal-Name) |
| `charts.js` | Statistik-Seite mit den Diagrammen |
| `db/` | SQL der Datenbankfunktionen (bisher nur `app_stats.sql`, die übrigen liegen noch nur in Supabase) |
| `docs/` | Redesign-Konzept und Prototyp (nur Entwurf, wird nicht ausgeliefert genutzt) |
| `manifest.webmanifest`, `sw.js`, `icons/` | Installierbare App, Offline-Hülle |

## Aufbau der Mitglieder-App

Untere Tab-Leiste mit vier Bereichen (Konzept: `docs/REDESIGN-KONZEPT.md`):

- **Start:** Hauptkarte mit dem nächsten Termin ("in X Tagen"), Kacheln (Konto mit PayPal-Link, Kassenstand, Geburtstag, Abwesenheiten), Anmeldung, Vorsitz.
- **Statistik:** Anwesenheit pro Abend (12 oder 24 Abende), Kassenstand über die Zeit, Einnahmen pro Jahr. Siehe unten.
- **Konto:** eigene Posten und die offenen Beträge im Stammtisch.
- **Chronik:** letzte Abende, Vorsitz-Historie, besuchte Locations, Abwesenheiten.

Hell und Dunkel folgen dem Gerät. Farben und Formen stehen als Variablen oben in `styles.css`.

## Statistik

Eigene SVG-Diagramme in `charts.js`, keine Bibliothek. Tooltip per Hover, Antippen und Tastatur (Pfeiltasten im Kassen-Diagramm), jedes Diagramm hat eine Tabellenansicht.
Daten kommen aus der Funktion `app_stats` (`db/app_stats.sql`). Sie liefert nur Gruppenwerte, keine Einzelpersonen (Datenschutz-Stufe 1).

Annahmen, die man kennen sollte:

- **Anwesende** = aktuelle Mitgliederzahl minus Entschuldigte (Abwesenheit 1x und unentschuldigt) pro Abend. Nur die letzten 24 Abende, denn die Mitgliederzahl hat sich früher geändert. Die Buchung "Abwesenheit (6x)" zählt nicht als Abwesenheit an diesem Abend.
- **Kassenstand** = Summe der PayPal-Zahlungen ohne Altbestand (`money_pool` leer), am Monatsende. Monate ohne Zahlung übernehmen den Vormonat. Punkte markieren Monate mit Auszahlungen ab 1.000 €.
- **Einnahmen** = nur positive Buchungen nach Buchungsdatum, nicht nach Zahlung. Ausgaben sind nicht abgezogen. Gäste = Gastbeitrag und Gast unangemeldet.
- Das laufende Jahr ist unvollständig und mit * markiert.

## Sicherheit in Kürze

- Alle Tabellen sind für Browser gesperrt (Row Level Security ohne Policy).
- Zugriff geht nur über Datenbankfunktionen `app_*`. Jede prüft den persönlichen Code (`?t=…` im Link) und die Rolle.
- Der Schlüssel in `config.js` ist für Browser gedacht und darf öffentlich sein.
- Persönliche Codes gehören **nie** ins Repo.
- Buchungen werden nie gelöscht, nur storniert (`entries.cancelled_at`).

## Ansicht wechseln (nur Admin)

In der App erscheint für den Admin oben eine Leiste mit Auswahl:

- **Meine Ansicht (Admin):** wie bisher.
- **Wie ein normales Mitglied:** deine eigenen Daten, aber ohne Admin-Werkzeuge. Ein gelbes Banner zeigt den Modus.
- **Mitglied ansehen:** die App genau so, wie das gewählte Mitglied sie sieht (nur lesen, Funktion `app_admin_view_as`).
  Darunter gibt es eine eigene Karte "Admin-Aktion", mit der du ausdrücklich für diese Person Abwesenheit oder Gäste ändern kannst.

Aus dem Admin-Bereich öffnet "Mitglied ansehen" dieselbe Ansicht (`index.html#as=Name`).

## Rollen

- Mitglied: eigene Abwesenheit und Gäste (bis 19 Uhr am Stammtischtag), eigene offene Posten.
- Vorsitz des letzten Abends: bestimmt den nächsten Vorsitz. Ist er vergeben, darf er ihn nur noch bis einschließlich zum Tag nach dem Stammtisch ändern.
- Designierter Vorsitz ("ich" in der App): überträgt den Vorsitz mit "Vorsitz übertragen" (Auswahl mit Vorschlag nach der längsten Zeit ohne Vorsitz, `vorsitz.js`) und trägt die Location ein.
- Admin: alles, auch für andere Mitglieder und ohne Frist.

## Veröffentlichen

GitHub Pages aus dem Hauptzweig, Ordner `/ (root)`. Bei privaten Repos braucht Pages einen bezahlten GitHub-Tarif.
Alternativen ohne Build: Cloudflare Pages oder Netlify (Ordner direkt ausliefern).

Persönlicher Link pro Mitglied: `https://<adresse>/?t=<Code>`.
Der Code wird auf dem Gerät gespeichert. Danach "Zum Startbildschirm hinzufügen".

## Admin-Bereich (`admin.html`)

Eigene Seite mit dunkelblauem Kopf und gelbem Streifen, damit man immer sieht, wo man ist. Nur der Admin kommt hinein, alle anderen
sehen "Kein Zugriff". Die Prüfung liegt in der Datenbank, nicht in der Seite.

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
