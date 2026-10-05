# Virtueller Bierdeckel: Konzept (Entwurf)

## Idee
Am Stammtischabend führt jedes Mitglied einen privaten Deckel: Bestellungen antippen, Preise optional, am Ende die Schlussrechnung. Auf Wunsch wandert der abgerechnete Deckel in die persönliche Historie. Später optional: gemeinsame Auswertung (z. B. wie viel Bier wir getrunken haben).

Der Deckel ist **kein Teil der Stammtischkasse**. Er verändert keine Buchungen und keine offenen Posten. Er ist nur ein Gedächtnis- und Rechenhelfer.

## Ablauf
1. **Deckel starten** (Knopf auf der Startseite, am Stammtischtag hervorgehoben, sonst auch möglich).
2. **Bestellen:**
   - Schnellwahl-Chips: Bier, Spezi, Radler, Weißbier, Wasser, Essen, Sonstiges. Ein Tipp = +1.
   - Eigene Freitexte ("Salat") mit optionalem Preis. Häufig genutzte Freitexte erscheinen später als eigene Chips.
   - Preis optional, pro Stück oder je Posten. "−" nimmt den letzten Eintrag zurück.
   - Pro Zeile: Menge, Name, Preis (leer erlaubt), Uhrzeit.
3. **Zwischenstand** immer sichtbar: Summe der bekannten Preise plus "3 Posten ohne Preis".
4. **Schlussrechnung:** Positionen gruppiert (4× Bier, 2× Spezi, 1× Salat), Summe, optional Trinkgeld (Prozent oder Betrag), Gesamtbetrag.
5. **Abschluss-Frage:** "Hast du abgerechnet?"
   - Nein: Deckel bleibt offen und kann weitergeführt werden.
   - Ja: "In meine Historie speichern?" Ja = gespeichert, Nein = verworfen.

## Datenschutz
- Deckel und Historie sind **nur für das Mitglied selbst** lesbar (Zugriff nur über die Funktionen mit dem eigenen Token, wie bei `app_my_ratings`). Auch der Admin sieht sie nicht.
- Gruppenauswertung nur mit **Einwilligung je Mitglied** (Schalter "Meine Mengen in der Gruppenstatistik zählen") und nur als Summen ohne Namen, erst ab z. B. 5 teilnehmenden Mitgliedern, damit niemand herausgerechnet werden kann. Vor dem Bau intern abstimmen.

## Daten (Supabase)
- `tabs`: id, member_id, meeting_id (optional), location (kopiert, falls Termin fehlt), tip, status (`open`, `saved`), created_at, settled_at, share_stats (bool)
- `tab_items`: id, tab_id, label, category (`beer`, `softdrink`, `food`, `other`), qty, unit_price (nullable), created_at
- Funktionen nach vorhandenem Muster: `app_tab_get`, `app_tab_add_item`, `app_tab_remove_item`, `app_tab_save`, `app_tab_discard`, `app_tab_history`.
- Kategorie kommt von den Chips. Freitext fällt auf `other`, optional wählbar. Nur so ist "wie viel Bier" später zählbar.

## Offline
Wirtshäuser haben oft schlechten Empfang. Der laufende Deckel liegt zuerst lokal (`localStorage`) und geht erst beim Speichern in die Datenbank. Dadurch ist Phase 1 ohne Datenbank machbar.

## Oberfläche
- Neuer Reiter mit zwei Bereichen: **Heute** (laufender Deckel) und **Historie** (gespeicherte Abende mit Summe, aufklappbar).
- Namensvorschläge: **"Mein Deckel"** (Reiter, empfohlen), Historie **"Deckelbuch"**; Alternativen: "Mein Konsum", "Meine Runde", "Zapfbuch".
- Historie später mit privaten Kennzahlen: Ausgaben pro Abend und Jahr, Durchschnitt, Bier pro Abend, Lieblingsgetränk.

## Gruppenauswertung (Phase 3)
Nur aus gespeicherten Deckeln mit Freigabe: Bier gesamt, pro Abend, pro Jahr, Anteil alkoholfrei, Verlauf. Anzeige in der Statistik, wie die vorhandenen Kennzahlen (`app_stats`).

## Phasen
1. **Deckel lokal:** Chips, Freitext, Preise, Schlussrechnung, Abschlussdialog. Keine Datenbank, sofort nutzbar.
2. **Historie:** Tabellen und Funktionen, Reiter "Deckelbuch", private Kennzahlen.
3. **Gruppenauswertung:** Einwilligung, anonyme Summen in der Statistik.

## Entscheidungen
- Erfassung: eine Zeile mit Menge, Tipp erhöht die Zeile.
- Zeitpunkt: jederzeit, am Stammtischtag kommt die Location des Termins automatisch dazu.
- Getränke: Bier-Sorten (Helles, Weißbier, Dunkles, Radler) und deren alkoholfreie Pendants (eigene Kategorie, zählen nicht als Bier), dazu Spezi, Wasser, Apfelschorle, Essen und Freitext.
- Komfort: Preise werden je Location gemerkt. Kein Trinkgeld.
- Gruppenstatistik: Freigabe je Mitglied, Anzeige ab 5 Teilnehmern (Phase 3).
- Start: Phase 1.

## Stand
Deckel und Deckelbuch bleiben **immer lokal** im Browser (`deckel.js`, Reiter "Deckel"), mit Hinweis in der App. Sie können dort gelöscht werden.

In die Datenbank geht **nur die Anzahl Bier** eines Stammtischabends, je Mitglied und Abend (`beer_counts`, `db/deckel.sql`, Funktionen `app_beer_save`, `app_beer_delete`):
- nur wenn der Deckel am Stammtischtag erfasst wurde und das Mitglied beim Speichern zustimmt (Haken, vorbelegt),
- gezählt werden Helles, Weißbier, Dunkles, Kellerbier, Draftbier. Nicht gezählt: Radler, Alkoholfreies, Spezi, Essen, Preise,
- wird ein gezählter Eintrag im Deckelbuch gelöscht, wird die Zahl auch aus der Datenbank entfernt,
- Zugriff nur über die Funktionen mit persönlichem Code. Einzelwerte pro Mitglied liegen in der Tabelle (per SQL für den Betreiber sichtbar), in der App erscheinen später nur Gruppensummen.

Gruppenauswertung (Phase 3): Karte "Bier" im Statistik-Tab (`db/app_stats_beer.sql`, `beerCard` in `charts.js`). Balken je Stammtisch (letzte 24 Abende), Tabelle je Jahr mit Summe und Durchschnitt pro Mitglied und Abend. Nur Summen, und nur Abende, an denen mindestens 5 Mitglieder gezählt haben. Die Zahlen zeigen nur die Mitglieder, die mitzählen.

Oberfläche: Der Deckel ist ein schwebender Knopf unten rechts (mit Anzahl der Posten) auf allen Seiten. Er öffnet ein Overlay mit Bestellen, Schlussrechnung und Deckelbuch. Der Reiter "Deckel" entfällt. Der Durchschnitt in der Bier-Karte zählt nur Mitglieder mit mindestens einem Bier.

Name in der App: **Bierdeggl** ("Mein Bierdeggl", "Bierdeggl-Buch"), passend zum Spruch auf dem Schild der Runde. Im Code und in den Dateinamen bleibt es bei "Deckel".
