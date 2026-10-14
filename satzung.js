// Satzung und Gebührenordnung (Anlage 1) als Unterseiten, jeweils durchsuchbar.
// Der Wortlaut ist bewusst fest hier hinterlegt und stammt unverändert aus den PDF-Dokumenten, Stand 05.01.2024.
(function (root) {
  "use strict";

  // Block-Arten: ["p", Text] Absatz, ["li", Text] Listenpunkt, ["fee", Text, Betrag] Zeile mit Betrag.
  const SATZUNG = {
    key: "satzung",
    title: "Stammtisch-Satzung",
    stand: "Stand: 05.01.2024",
    intro: [["p", "Präambel: Dieser Stammtisch wurde am 9. April des Jahres 2004 n. Chr. gegründet. Gründungsmitglieder sind Andreas Beck, Dennis Ostermeier, Bernd Hanselmann, Manuel Hackel, Ernest Jennen, Norbert Hanselmann und Michael Hirschbichler. Als Gründungsort gilt offiziell der „Dreigroschenkeller“ in München."]],
    sections: [
      { head: "§ 1 Name", blocks: [
        ["p", "(1) Dieser Stammtisch trägt den Namen „Griassgottbeinand“."],
        ["p", "(2) Ein Antrag auf Änderung des Stammtischnamens kann nur von einem aktiven Stammtischmitglied erfolgen. Die Abstimmung über die Änderung verlangt Einstimmigkeit."],
      ] },
      { head: "§ 2 Sinn und Zweck", blocks: [
        ["p", "(1) Dieser Stammtisch dient in erster Linie dem Erhalt des Bayerischen Brauchtums. Darüber hinaus ist dieser Stammtisch zum Erhalt der Freundschaft und Verbundenheit der Mitglieder durch regelmäßige Treffen gedacht."],
      ] },
      { head: "§ 3 Gebühren und Mitgliedsbeiträge", blocks: [
        ["p", "(1) Mitgliedsbeiträge werden nicht erhoben."],
        ["p", "(2) Gebühren, Kosten und Strafzahlungen regelt die im Anhang abgedruckte Gebührenordnung als Anlage zu dieser Satzung."],
      ] },
      { head: "§ 4 Mitgliedschaft", blocks: [
        ["p", "(1) Die Mitgliedschaft erstreckt sich auf aktive und Ehrenmitglieder. Stimmberechtigt sind ausschließlich aktive Mitglieder. Über den Status oder die Änderung der Mitgliedschaft eines einzelnen Mitgliedes entscheidet die Vollversammlung."],
        ["p", "(2) Aktive Mitglieder sind derzeit: Alexander Gresiak, Andreas Beck, Bernd Hanselmann, Berthold Riesterer, Christian Beyer, Christoph Herberth, Dennis Ostermeier, Ernest Jennen, Manuel Hackel, Michael Hirschbichler, Norbert Hanselmann, Stefan Heinzel, Johannes Poethen."],
        ["p", "(3) Ehrenmitglied ohne Stimmrechte ist derzeit: Thomas Heigermoser."],
        ["p", "(4) Die Mitgliedschaft ist zeitlich unbefristet und endet mit dem Tod."],
        ["p", "(5) Eine vorzeitige Beendigung der Mitgliedschaft kann von einem Mitglied für seine Person beantragt werden."],
        ["p", "(6) Bei schwerwiegenden Verfehlungen gegen Moral und Ethik kann der Ausschluss eines Mitgliedes erfolgen. Dies geschieht auf Antrag und erfordert eine 2/3-Mehrheit."],
        ["p", "(7) Für die Neuaufnahme eines Mitgliedes ist grundsätzlich Einstimmigkeit erforderlich."],
      ] },
      { head: "§ 5 Sitz", blocks: [
        ["p", "(1) Dieser Stammtisch hat nicht wie allgemein üblich einen festen Sitz in einer Wirtschaft. Die Lokalität wechselt monatlich. Der Sitz ist München, Ausnahme siehe Abs. 3."],
        ["p", "(2) Es ist bei der Wahl der Örtlichkeit darauf zu achten, dass sie sich im Einzugsbereich der MVG zu befinden hat. Nach Möglichkeit ist eine Anbindung zur U-Bahn zu präferieren. Ausnahmen sind in Einzelfällen möglich."],
        ["p", "(3) Einmal jährlich soll dem einzigen Mitglied, das nicht an den MVV angebunden ist, Rechnung getragen werden und der Stammtisch in Augsburg stattfinden."],
      ] },
      { head: "§ 6 Zeit und Ort", blocks: [
        ["p", "(1) Der Stammtisch findet jeweils am 1. Freitag eines jeden Monats statt. Der Beginn ist um 19:00 Uhr MEZ/MESZ. Auf Antrag kann die Uhrzeit oder der Tag im Einzelfall geändert werden. Hierzu ist die einfache Mehrheit ausreichend."],
        ["p", "(2) Das Stammtischjahr ist das Kalenderjahr."],
      ] },
      { head: "§ 7 Organe", blocks: [
        ["p", "(1) Der Stammtisch hat folgende offiziellen Organe:"],
        ["li", "1. Präsident"],
        ["li", "2. Kassenwart"],
        ["p", "(2) Der Präsident steht dem Stammtisch vor. Er wechselt monatlich. Er organisiert das Treffen im Voraus und gibt den Mitgliedern spätestens 48 Stunden vor Beginn Zeit und Ort des Treffens per E-Mail bekannt. Der Präsident hat den Stammtisch zu eröffnen und im Laufe des Abends an seinen Nachfolger zu übergeben."],
        ["p", "(3) Der Kassenwart (Ernest Jennen) führt und verwaltet die Stammtischkasse. Er ist von der Vollversammlung am Beginn des Stammtischjahres für das vergangene Jahr zu entlasten. Bei entsprechender Entlastung behält er seinen Posten für ein weiteres Jahr. Er kann sein Amt in einer Abstimmung zur Verfügung stellen (2/3-Mehrheit)."],
      ] },
      { head: "§ 8 Pflichten der Mitglieder", blocks: [
        ["p", "(1) Die einzelnen Mitglieder verpflichten sich zur monatlichen Teilnahme am Stammtisch. Absagen sind persönlich, per SMS, WhatsApp, E-Mail oder fernmündlich zulässig und direkt an den amtierenden Präsidenten zu richten."],
        ["p", "(2) Jedes Mitglied hat die Pflicht, den anderen Mitgliedern am entsprechenden Tag in frei wählbarer Form zum Geburtstag zu gratulieren."],
        ["p", "(3) Belange der einzelnen Mitglieder, die am Stammtisch erörtert werden und von persönlicher oder für seine oder eine andere Person belastender Natur sind, verbleiben im Kenntnisbereich der Mitglieder (Stichwort: Käseglocke)."],
        ["p", "(4) Dasselbe gilt für Bild-, Ton- und Videoaufnahmen. Die Mitglieder des Stammtisches behalten das Recht am eigenen Bild."],
        ["p", "(5) Jedes Mitglied verpflichtet sich zur Übernahme des Präsidentenamtes in regelmäßigen Abständen und den daraus resultierenden Verpflichtungen. Im Regelfall wird das Präsidentenamt alle 12-14 Monate übernommen."],
        ["p", "(6) Der amtierende Präsident hat den Stammtisch zu eröffnen und seinem Nachfolger das Amt am selben Abend zu übergeben."],
      ] },
      { head: "§ 9 Sonstiges", blocks: [
        ["p", "(1) Verfügungen über Ausgaben aus der Stammtischkasse (z.B. Stammtischausflug, Grillabende, Stammtischrunden etc.) bedürfen der Zustimmung von mindestens 2/3 der Mitglieder."],
        ["p", "(2) Die in der Satzung genannten Mehrheiten (einfach, 2/3-Mehrheit sowie Einstimmigkeit) beziehen sich auf alle (aktiven) Mitglieder, nicht auf die Zahl der zum Zeitpunkt der Abstimmung Anwesenden."],
      ] },
    ],
  };

  const GEBUEHREN = {
    key: "gebuehren",
    title: "Gebührenordnung",
    sub: "Anlage 1 zur Stammtisch-Satzung",
    stand: "Stand: 05.01.2024",
    intro: [],
    sections: [
      { head: "§ 1 Gebühren und Strafen", blocks: [
        ["p", "(1) Die nachfolgenden Gebühren und Strafen gelten uneingeschränkt."],
        ["p", "(2) Neue Gebühren bzw. Strafen sowie Abschaffung oder Änderung derselben müssen von der Vollversammlung beschlossen werden (2/3 Mehrheit)."],
      ] },
      { head: "§ 2 Spenden", blocks: [
        ["p", "Spenden sowie freiwillige Zahlungen können in unbegrenzter Höhe, von jedermann und zu jeder Zeit getätigt werden. Der Kassenwart hat die Mitglieder darüber zu informieren."],
      ] },
      { head: "§ 3 Unpünktlichkeit und Nicht-Erscheinen", blocks: [
        ["fee", "Einmaliges entschuldigtes Fernbleiben", "10,00 €"],
        ["fee", "Einmaliges unentschuldigtes Fernbleiben", "20,00 €"],
        ["fee", "Sechsmaliges unentschuldigtes / entschuldigtes Fernbleiben", "50,00 €"],
        ["fee", "Unpünktlichkeit:", "derzeit nicht geregelt"],
        ["fee", "Erscheinen nach 22:00 Uhr entspricht Fernbleiben", "10,00 €"],
      ] },
      { head: "§ 4 Geburtstage", blocks: [
        ["fee", "Vergessen des Geburtstages eines Mitgliedes", "10,00 €"],
        ["fee", "Vergessen des Dankes und der Rückmeldung am Tag nach dem eigenen Geburtstag", "10,00 €"],
        ["fee", "„Spende“ anlässlich des eigenen Geburtstages", "50,00 €"],
      ] },
      { head: "§ 5 Ehegatte, LAG und Freundinnen", blocks: [
        ["fee", "Das Mitbringen an Stammtischabenden von Ehegattinnen, Lebensabschnittsgefährtinnen sowie Personen, zu denen man ein eheähnliches Verhältnis unterhält oder mit denen man nicht nur vorübergehend den Beischlaf vollzieht, ist nicht gestattet und wird entsprechend sanktioniert", "50,00 €"],
        ["fee", "Zufälliges „Auftauchen“ des o.g. Personenkreises", "Einzelfallentscheidung"],
        ["p", "Im Falle eines besonderen Anlasses, worüber die Vollversammlung entscheidet, kann das o.g. Verbot einmalig aufgehoben werden. Zumeist trifft dies aber nicht für reguläre Stammtischtermine zu."],
      ] },
      { head: "§ 6 Sonstiges", blocks: [
        ["fee", "Vergessen, den Stammtisch zu eröffnen", "10,00 €"],
        ["fee", "Vergessen, den Stammtisch zu übergeben", "10,00 €"],
      ] },
    ],
  };

  const DOCS = { satzung: SATZUNG, gebuehren: GEBUEHREN };
  const norm = (s) => String(s).toLocaleLowerCase("de-DE");
  const queries = {}; // Suchtext pro Dokument, bleibt beim Neuzeichnen der Seite erhalten

  // Text mit hervorgehobenen Treffern (ohne innerHTML).
  function marked(h, text, q) {
    if (!q) return text;
    const low = norm(text), out = [];
    let i = 0, at;
    while ((at = low.indexOf(q, i)) !== -1) {
      if (at > i) out.push(text.slice(i, at));
      out.push(h("mark", {}, text.slice(at, at + q.length)));
      i = at + q.length;
    }
    out.push(text.slice(i));
    return out;
  }

  function page(h, key, onBack) {
    const doc = DOCS[key];
    const list = h("div", {});
    const count = h("p", { class: "muted small", role: "status", "aria-live": "polite", style: "margin:0 0 8px" });
    const search = h("input", { type: "search", class: "doc-search", placeholder: doc.title + " durchsuchen", "aria-label": doc.title + " durchsuchen", autocomplete: "off", autocapitalize: "off", spellcheck: "false", value: queries[key] || "" });

    const blockEl = (b, q) => {
      const [kind, text, amount] = b;
      if (kind === "li") return h("p", { class: "doc-li" }, marked(h, text, q));
      if (kind === "fee") return h("div", { class: "doc-fee" }, h("span", {}, marked(h, text, q)), h("strong", {}, marked(h, amount, q)));
      return h("p", { class: "doc-p" }, marked(h, text, q));
    };
    const text = (b) => b[1] + (b[2] ? " " + b[2] : "");

    function draw() {
      const q = norm(search.value.trim());
      queries[key] = search.value;
      let hits = 0;
      const cards = [];
      const intro = doc.intro.filter((b) => !q || norm(text(b)).includes(q));
      hits += intro.length;
      if (intro.length) cards.push(h("section", { class: "card" }, intro.map((b) => blockEl(b, q))));
      for (const s of doc.sections) {
        const headHit = q && norm(s.head).includes(q);
        const blocks = s.blocks.filter((b) => !q || headHit || norm(text(b)).includes(q));
        if (!blocks.length) continue;
        hits += blocks.length;
        cards.push(h("section", { class: "card" }, h("h2", { class: "doc-head" }, marked(h, s.head, q)), blocks.map((b) => blockEl(b, q))));
      }
      count.textContent = q ? (hits ? `${hits} ${hits === 1 ? "Stelle" : "Stellen"} gefunden` : "") : "";
      list.replaceChildren(...(cards.length ? cards : [h("div", { class: "card center" }, h("p", { class: "muted", style: "margin:0" }, "Nichts gefunden."))]));
    }
    search.addEventListener("input", draw);
    draw();

    return h("div", {},
      h("button", { type: "button", class: "link", style: "margin:0 0 8px", onclick: onBack }, "‹ Zurück zum Start"),
      h("h1", { style: "margin-bottom:2px" }, doc.title),
      doc.sub ? h("p", { class: "muted", style: "margin:0" }, doc.sub) : null,
      h("p", { class: "muted", style: "margin:0 0 12px" }, doc.stand),
      search, count, list);
  }

  root.Satzung = { page, DOCS };
})(window);
