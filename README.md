# Griassgottbeinand

Schlanke Web-App (PWA) für den Stammtisch: Termine, Abmeldung, Gäste, eigene offene Beträge mit PayPal-Link.
Ohne Build-Schritt: reines HTML, CSS und JavaScript. Daten liegen in Supabase (Projekt `griassgottbeinand`).

## Dateien

| Datei | Zweck |
|---|---|
| `index.html`, `styles.css`, `app.js` | Oberfläche und Logik |
| `config.js` | Öffentliche Verbindungsdaten (URL, öffentlicher Schlüssel, PayPal-Name) |
| `manifest.webmanifest`, `sw.js`, `icons/` | Installierbare App, Offline-Hülle |

## Sicherheit in Kürze

- Alle Tabellen sind für Browser gesperrt (Row Level Security ohne Policy).
- Zugriff geht nur über Datenbankfunktionen `app_*`. Jede prüft den persönlichen Code (`?t=…` im Link) und die Rolle.
- Der Schlüssel in `config.js` ist für Browser gedacht und darf öffentlich sein.
- Persönliche Codes gehören **nie** ins Repo.
- Buchungen werden nie gelöscht, nur storniert (`entries.cancelled_at`).

## Rollen

- Mitglied: eigene Abwesenheit und Gäste (bis 19 Uhr am Stammtischtag), eigene offene Posten.
- Vorsitz des letzten Abends: bestimmt den nächsten Vorsitz, trägt die Location ein.
- Neuer Vorsitz: trägt die Location ein.
- Admin: alles, auch für andere Mitglieder und ohne Frist.

## Veröffentlichen

GitHub Pages aus dem Hauptzweig, Ordner `/ (root)`. Bei privaten Repos braucht Pages einen bezahlten GitHub-Tarif.
Alternativen ohne Build: Cloudflare Pages oder Netlify (Ordner direkt ausliefern).

Persönlicher Link pro Mitglied: `https://<adresse>/?t=<Code>`.
Der Code wird auf dem Gerät gespeichert. Danach "Zum Startbildschirm hinzufügen".

## Admin-Bereich (`#admin`)

- **Zahlung:** Text der PayPal-Mail einfügen. Betrag, Datum, Transaktionscode, Absender und Mitteilung werden ausgelesen (`paypal.js`).
  Die App schlägt eine Zuordnung zu offenen Posten vor (alles, eindeutig oder mehrere Varianten zur Auswahl). Gebucht wird erst nach Bestätigung,
  und nur, wenn die Summe genau dem Betrag entspricht. Doppelte Transaktionscodes werden abgelehnt.
- **Buchen:** manuelle Buchungen, auch für alle Mitglieder (z. B. Geburtstagsbeitrag).
- **Offen:** offene Posten je Mitglied und Abgleich mit dem PayPal-Saldo.
- **Letzte:** letzte Buchungen, unbezahlte lassen sich stornieren.

Tests der Logik: `node` mit `paypal.js` (reine Funktionen, kein Browser nötig).

## Noch offen

- Datenbank-Migrationen als SQL-Dateien im Repo ablegen.
- Aufräumen der leeren Spalte `entries.payment_reported_at`.
