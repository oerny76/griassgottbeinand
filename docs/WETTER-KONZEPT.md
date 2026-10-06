# Wetter am Stammtischabend: Konzept (Entwurf)

## Idee
Auf der Hauptkarte steht beim nächsten Termin eine kleine Wetteranzeige für den Abend: Temperatur, Symbol und ein Hinweis wie "Regen ab 21". Ein Tipp darauf klappt Details auf (Temperatur um 19, 21 und 23 Uhr, Regenrisiko, Sonnenuntergang). Das hilft vor allem bei Biergarten-Locations.

## Datenquelle
[Open-Meteo](https://open-meteo.com/en/about): kein Schlüssel, kein Konto, CORS erlaubt (der Browser darf direkt anfragen), frei für nichtkommerzielle Nutzung, Daten unter CC BY 4.0. Bedingung: Namensnennung ("Wetterdaten von Open-Meteo.com") und faire Nutzung (Richtwert unter 10.000 Abrufe pro Tag, wir liegen bei wenigen Dutzend).

Ein Abruf liefert für die Koordinate stündlich: Temperatur, Regenwahrscheinlichkeit, Wettercode (daraus das Symbol) und dazu die Sonnenuntergangszeit. Die Antwort ist klein (wenige KB).

## Abruf und Zwischenspeicher (Traffic)
- **Abruf im Browser**, kein eigener Server nötig. Das passt zur vorhandenen App.
- **Zwischenspeicher je Gerät** (`localStorage`, Schlüssel aus Koordinate und Datum): Eine Antwort gilt **1 Stunde**. Innerhalb der Stunde wird nichts neu abgerufen, auch nicht beim Wechseln der Reiter oder beim Neuladen der App.
- Ist die Antwort älter, wird sie **sofort angezeigt und im Hintergrund erneuert** ("stale while revalidate"). Die Karte bleibt nie leer.
- Ohne Netz oder bei einem Fehler: der alte Wert mit "Stand 15:00 Uhr", oder gar keine Anzeige. Nie eine Fehlermeldung auf der Startseite.
- Warum nicht serverseitig: Ein zentraler Abruf einmal pro Stunde wäre sparsamer, braucht aber Datenbank-Job, Tabelle und Edge Function. Bei etwa 13 Mitgliedern kostet der Abruf pro Gerät praktisch nichts. Ausbau später möglich, falls es nötig wird.

## Wann wird angezeigt?
- Nur für den **nächsten Termin** und nur, wenn er höchstens **7 Tage** entfernt ist (davor sind Vorhersagen zu unsicher; Open-Meteo liefert bis 16 Tage).
- Bezugszeit ist der Abend: **19 bis 23 Uhr** deutscher Zeit (als Konstante in `weather.js`, leicht änderbar).
- Hat die Location keine Koordinate oder fehlt noch die Location, gibt es keine Wetteranzeige.
- Am Stammtischtag selbst (ab 19 Uhr) wird auf den nächsten Termin umgeschaltet, wie bei den anderen Anzeigen der Hauptkarte.

## Geodaten der Locations
Die Tabelle `locations` hat Name, Straße, PLZ, Ort, aber keine Koordinaten.

1. **Neue Spalten** `lat` und `lon` (numerisch, beide leer erlaubt), plus Prüfung auf sinnvolle Werte.
2. **Befüllen der aktuellen Location jetzt sofort**, einmalig per Hand: Adresse bei der [OSM-Suche (Nominatim)](https://operations.osmfoundation.org/policies/nominatim/) nachschlagen und per SQL eintragen. Das genügt für den nächsten Termin und ist ohne Code erledigt.
3. **Automatisch für neue Locations:** Wird eine Location für einen Termin gesetzt und hat noch keine Koordinate, ruft eine **Edge Function** `geocode` die Nominatim-Suche auf (höchstens 1 Anfrage pro Sekunde, mit eigenem User-Agent wie von der Nutzungsrichtlinie verlangt, keine Massenabfragen) und trägt das Ergebnis ein. Ausgelöst wie bei den Push-Nachrichten über einen Datenbank-Trigger. Findet sie nichts, bleibt die Spalte leer, ohne dass der Termin leidet.
4. **Alte Locations (116)** nicht nachtragen. Falls später eine Karte aller Locations gewünscht ist, ist ein einmaliger, gedrosselter Durchlauf (etwa 2 Minuten) möglich.
5. Trefferqualität: Bei ungenauen Adressen rutscht der Punkt in die Ortsmitte. Für das Wetter ist das unkritisch (Abweichung wenige Kilometer).

## Oberfläche
Siehe Skizze im Chat. Der Platz unter der gelben Teilnehmerzahl rechts oben ist frei.

- **Kompakt (Standard):** Kleine halbtransparente Kachel unter der Teilnehmerzahl, gleiche Breite (84 px): Symbol, Temperatur um 19 Uhr, darunter ein Kurztext in höchstens zwei Wörtern: "trocken", "Regen ab 21", "Schauer", "Gewitter". Auf dem Handy bleibt die Datumszeile links frei, weil sie ohnehin links endet.
- **Antippen:** Unter der Location klappt eine Zeile auf: Temperatur um 19, 21 und 23 Uhr, Regenrisiko in Prozent, Sonnenuntergang, "Stand 15:00 Uhr · Wetterdaten von Open-Meteo.com". Erneutes Tippen schließt sie. Der Zustand bleibt beim Neuzeichnen offen, wie die anderen Fenster der Hauptkarte (`heroPanel`).
- **Barrierefreiheit:** Die Kachel ist ein Knopf mit Beschriftung ("Wetter am Stammtischabend: 13 Grad, Regen ab 21 Uhr"), Symbole sind dekorativ, die Information steht immer auch als Text da.
- Symbole: einfache Zeichen oder kleine SVGs (Sonne, Wolke, Regen, Gewitter, Schnee, Nebel), keine Bibliothek nötig. Zuordnung über die Wettercodes von Open-Meteo (0 klar, 1 bis 3 bewölkt, 45 und 48 Nebel, 51 bis 67 Regen, 71 bis 77 Schnee, 80 bis 82 Schauer, 95 bis 99 Gewitter).

## Technik
- Neue Datei `weather.js` (Abruf, Zwischenspeicher, Text und Symbol aus Wettercode). Reine Funktionen wie in `deckel.js`, damit sie ohne Browser testbar sind.
- `app.js`: die Hauptkarte bekommt Koordinate und Termin aus dem Dashboard. Dafür liefert `_dashboard_json` im Block `meeting.location` zusätzlich `lat` und `lon`.
- `db/geo.sql`: Spalten, Prüfung, Trigger. `supabase/functions/geocode/index.ts`: Edge Function.
- `sw.js`: neue Datei in den Cache aufnehmen. Anfragen an Open-Meteo werden, wie die an Supabase, nicht vom Service Worker zwischengespeichert (er ignoriert fremde Domains bereits).
- Datenschutz: Open-Meteo sieht nur die Koordinate der Location und die IP-Adresse des Geräts, es gibt keine Cookies und kein Tracking. In der App steht der Quellenhinweis.

## Phasen
1. **Daten:** Spalten `lat` und `lon`, Koordinate der aktuellen Location eintragen, Dashboard liefert sie mit.
2. **Anzeige:** `weather.js`, kompakte Kachel und aufklappbare Details auf der Hauptkarte.
3. **Automatik:** Edge Function `geocode` und Trigger für neue Locations.

## Offene Fragen
1. **Uhrzeit des Abends:** Reichen 19 bis 23 Uhr, oder beginnt der Stammtisch meist später oder früher?
2. **Zeitraum:** Wetter ab 7 Tagen vorher, oder erst ab 5 oder 3 Tagen, wenn es sicherer sein soll?
3. **Einheit und Text:** Nur Grad Celsius und Kurztext, oder auch Wind?
4. **Automatik sofort mitbauen** (Phase 3) oder zuerst nur die aktuelle Location per Hand eintragen und schauen, wie es ankommt?

## Stand der Umsetzung
Alle drei Phasen sind gebaut (`db/geo.sql`, `supabase/functions/geocode`, `weather.js`, Hauptkarte in `app.js`). Festlegungen: Abend 19 bis 23 Uhr, Anzeige ab 5 Tage vorher, nur Temperatur und Kurztext.

Abweichung vom Konzept: Die öffentliche Nominatim-Instanz antwortet auf Anfragen von den Supabase-Servern mit 403. Die Edge Function sucht deshalb zuerst über [Photon](https://photon.komoot.io) (Komoot, ebenfalls OpenStreetMap-Daten) und nutzt Nominatim nur als Rückfall. Die Suche ist bei Locations ohne Adresse (nur Name) ungenau. Falsche Koordinaten lassen sich von Hand korrigieren: `update public.locations set lat = ..., lon = ... where name = '...';`
