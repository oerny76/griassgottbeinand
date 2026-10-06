# Abstimmungen: Konzept (Entwurf)

## Idee
Bisher wird nur am Stammtisch abgestimmt, wer fehlt, hat keine Stimme. Künftig kann jedes Mitglied in der App einen **Antrag** stellen, alle stimmen innerhalb von 7 Tagen ab, das Ergebnis ist für alle sichtbar und bleibt als Archiv erhalten.

## Regeln
- **Antrag stellen:** jedes Mitglied. Pflicht: Titel (kurz) und Text (ausformulierter Antrag). Nach dem Einreichen nicht mehr änderbar (sonst stimmen Leute über etwas anderes ab als andere vor ihnen).
- **Stimmen:** *Stimme zu*, *Stimme nicht zu*, *Enthaltung*. Enthaltung zählt als abgegebene Stimme (für "alle haben abgestimmt"), geht aber nicht in die Wertung ein.
- **Antragsteller** stimmt automatisch zu (final, keine Änderung).
- **Final:** Vor dem Absenden Rückfrage ("Stimme zu – sicher? Das ist endgültig."). Danach keine Änderung mehr.
- **Offen und namentlich:** Es ist sichtbar, wer wann wie abgestimmt hat (auch während der Abstimmung).
- **Dauer:** 7 Tage ab Einreichung, auf die Minute (`ends_at = created_at + 7 days`).
- **Abschluss**, sobald **eines** zutrifft:
  1. alle stimmberechtigten Mitglieder haben abgestimmt (Enthaltung zählt mit),
  2. `ends_at` ist erreicht.
- **Stimmberechtigt** sind die aktiven Mitglieder zum Zeitpunkt der Einreichung (Momentaufnahme). Wer später dazukommt, stimmt nicht mit; wer ausscheidet, wird nicht mehr abgewartet.
- **Ergebnis:** Anzahl Zustimmung, Ablehnung, Enthaltung, nicht abgestimmt, jeweils mit Namen. Dazu ein Urteil (siehe offene Fragen).
- **Benachrichtigungen (Web Push, bestehende Infrastruktur):**
  - neuer Antrag → alle außer Antragsteller,
  - Antrag abgeschlossen → alle, mit Ergebnis,
  - optional: Erinnerung 24 h vor Ablauf an alle, die noch nicht abgestimmt haben.

## Oberfläche
Neuer Reiter **"Abstimmung"** (Badge mit Zahl der Anträge, bei denen man selbst noch nicht abgestimmt hat).

1. **Liste**, hierarchisch sortiert:
   - **Offen**: der zuerst ablaufende oben. Pro Karte: Titel, Antragsteller, Restzeit ("noch 2 T 4 Std"), kleine Fortschrittsanzeige (z. B. 7/12 abgestimmt), eigener Status (*Du musst noch abstimmen* hervorgehoben, sonst *Du: Zustimmung*).
   - **Abgeschlossen** (Archiv): zuletzt abgeschlossene zuerst, eingeklappt unter "Archiv". Karte mit Ergebnis (angenommen/abgelehnt) und Zahlen.
2. **Suche** oben in der Liste: Volltext über Titel und Antragstext, durchsucht **alle** Anträge (offen und archiviert), Treffer zeigen ihren Status als Chip. Leere Suche = normale Liste.
3. **Detailansicht:** Antragstext, Antragsteller und Datum, Restzeit bzw. Abschlussdatum, drei Buttons (nur solange man nicht abgestimmt hat und der Antrag offen ist), Rückfrage-Dialog, darunter Stimmenliste: Name, Stimme, Zeitpunkt. Wer noch nicht abgestimmt hat, erscheint als "ausstehend", nach Abschluss als "nicht abgestimmt".
4. **Antrag stellen:** Knopf "+ Antrag" → Formular (Titel max. 100 Zeichen, Text max. 2000), Vorschau-Hinweis "Mit dem Einreichen stimmst du automatisch zu, 7 Tage Laufzeit, alle werden benachrichtigt", Bestätigungsdialog.

## Daten (Supabase)
Muster wie bei den vorhandenen Funktionen: Tabellen ohne direkten Zugriff (RLS an, alle Rechte entzogen), Zugriff nur über `security definer`-Funktionen mit Token (`_auth_member`).

- `motions`: `id`, `author_id`, `title`, `body`, `created_at`, `ends_at`, `closed_at` (null = offen), `result` (`accepted`, `rejected`, `tie`, null solange offen), `search tsvector` (generiert, `german`, aus Titel und Text), GIN-Index.
- `motion_votes`: `motion_id`, `member_id`, `choice` (`yes`, `no`, `abstain`, null = noch offen), `voted_at`. Primärschlüssel `(motion_id, member_id)`. Beim Einreichen wird für **jedes** stimmberechtigte Mitglied eine Zeile mit `choice = null` angelegt (Momentaufnahme), die des Antragstellers sofort mit `yes`. Dadurch ist "nicht abgestimmt" ohne Sonderlogik ableitbar.
- Funktionen:
  - `app_motion_create(token, title, body)` → legt Antrag und Stimmzeilen an, Push an alle,
  - `app_motion_list(token, query)` → Liste inkl. eigener Stimme, Zähler, sortiert (siehe unten), optional Volltextsuche,
  - `app_motion_get(token, id)` → Detail mit Stimmenliste,
  - `app_motion_vote(token, id, choice)` → nur wenn offen, nur wenn eigene Zeile noch `null`, danach Prüfung "alle abgestimmt?" und ggf. Abschluss,
  - `_motion_close(id)` → setzt `closed_at`, berechnet `result`, Push an alle.
- **Zeitablauf:** `pg_cron` (stündlich, wie `push_weekly_open`) ruft `_motion_close_expired()`. Zusätzlich schließen `app_motion_list/get` abgelaufene Anträge beim Lesen, damit nichts bis zur nächsten vollen Stunde als "offen" erscheint. Die Erinnerung 24 h vorher läuft im selben Cron-Job.
- **Sortierung (Liste):** `closed_at is not null` (Offen vor Archiv), dann offen nach `ends_at asc`, Archiv nach `closed_at desc`.
- **Volltextsuche:** `websearch_to_tsquery('german', q)` auf `search`; bei wenigen Anträgen ist das schnell und bringt Wortstämme ("Ausflüge" findet "Ausflug"). Ergänzend `ilike` auf Titel für Teilwörter.
- **Push:** über `_push_send` und die Edge Function `push`, kein neuer Server-Code nötig. Beim Antrag-Push wird der Titel gekürzt in den Text genommen ("Neuer Antrag von Ernest: …"), Tippen öffnet direkt den Antrag (Deep-Link über die vorhandene Service-Worker-Navigation, falls möglich, sonst Reiter "Abstimmung").

## Sicherheit und Missbrauch
- Eine Stimme je Mitglied, serverseitig erzwungen (nur Zeile mit `choice is null` wird gesetzt, in einer Transaktion mit Zeilensperre).
- Anträge und Stimmen werden nie gelöscht oder bearbeitet. Ausnahme: **Admin** kann einen Antrag löschen (z. B. Spam oder Tippfehler im Antrag, dann neu einreichen). Zusatz zu klären, siehe unten.
- Spamschutz: höchstens 3 eigene offene Anträge gleichzeitig.

## Offene Fragen (bitte entscheiden)
1. **Wann gilt ein Antrag als angenommen?** Vorschlag: einfache Mehrheit der Ja/Nein-Stimmen (Enthaltungen und Nichtstimmende zählen nicht), Gleichstand = "Unentschieden, nicht angenommen". Alternativen: Mehrheit aller Stimmberechtigten, oder Zweidrittel für bestimmte Themen (Satzung/Beiträge). Oder bewusst nur Zahlen zeigen und kein Urteil.
2. **Anträge zurückziehen?** Vorschlag: nein (Transparenz). Alternative: Antragsteller darf zurückziehen, solange noch niemand sonst abgestimmt hat.
3. **Admin darf löschen?** Vorschlag ja, mit Sichtbarkeit im Archiv ("gelöscht von Admin") oder ganz still.
4. **Erinnerung 24 h vor Ablauf:** gewünscht?
5. **Kommentare/Diskussion** zum Antrag: bewusst nicht, Diskussion bleibt am Stammtisch/WhatsApp. Später möglich.
6. **Gäste/Zahler-Konten** (Mitglieder mit hinterlegtem Zahler): stimmt jedes Mitglied selbst? Vorschlag ja.

## Phasen
1. **Kern:** Tabellen, Funktionen, Reiter mit Liste, Detail, Antrag stellen, Abstimmen mit Rückfrage, Abschluss bei Ablauf oder wenn alle abgestimmt haben, Push bei neu und abgeschlossen.
2. **Archiv und Suche:** Archivbereich, Volltextsuche, Sortierung, Badge am Reiter.
3. **Komfort:** Erinnerung vor Ablauf, Deep-Link aus dem Push, Admin-Löschen, Antragsvorlagen ("Ausflug", "Location aufnehmen", …).

## Aufwand und Einordnung
Alles passt in die vorhandene Architektur (statisches PWA-Frontend, Supabase-Funktionen mit Token, bestehende Push-Pipeline). Neue Dateien: `db/motions.sql`, `motions.js` (Reiter und Dialoge), Einträge in `index.html`, `styles.css`, `sw.js` (Cache). Keine neue Infrastruktur.
