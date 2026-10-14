import { describe, expect, it } from "vitest";
import {
  extractYearEvidence,
  nameSimilarity,
  parseAssignmentCell,
  parseDateHeader,
  parseRehearsalCell,
  parseSongGroupLabel,
  suggestMatches,
  suggestYear,
} from "@/domain/import-parsing";

/** Section 10 : l'import lit, signale, et ne devine pas. */
describe("en-tetes de colonnes de dates", () => {
  it("lit « DIM 18/10 » avec l'annee fournie", () => {
    const resultat = parseDateHeader("DIM 18/10", 2026);
    expect(resultat.date).toBe("2026-10-18");
    expect(resultat.declaredWeekday).toBe(0);
    expect(resultat.issues).toEqual([]);
  });

  it("conserve le libelle d'evenement particulier", () => {
    const resultat = parseDateHeader("SAM 07/03\nBAPTEMES (9h-13h)", 2026);
    expect(resultat.note).toBe("BAPTEMES (9h-13h)");
  });

  it("refuse d'inventer une annee quand elle manque", () => {
    const resultat = parseDateHeader("13/09", null);
    expect(resultat.date).toBeNull();
    expect(resultat.day).toBe(13);
    expect(resultat.month).toBe(9);
    expect(resultat.issues.join(" ")).toContain("Annee absente");
  });

  it("accepte une vraie date Excel", () => {
    const resultat = parseDateHeader(new Date(Date.UTC(2026, 5, 9)), null);
    expect(resultat.date).toBe("2026-06-09");
    expect(resultat.fromExcelDate).toBe(true);
  });

  it("signale une incoherence entre la date et le jour annonce", () => {
    // Le 18/10/2026 est un dimanche : « SAM » est donc incoherent.
    const resultat = parseDateHeader("SAM 18/10", 2026);
    expect(resultat.issues.join(" ")).toContain("Incoherence");
  });

  it("signale un en-tete sans date", () => {
    const resultat = parseDateHeader("NOVEMBRE", 2026);
    expect(resultat.date).toBeNull();
    expect(resultat.issues.join(" ")).toContain("Aucune date reconnue");
  });
});

describe("annee etayee", () => {
  it("propose l'annee la plus souvent citee", () => {
    const preuves = extractYearEvidence([
      "Vendredi 04/09/2026 - 19h-23h",
      "Samedi 17/10/2026 - 12h-15h",
      "note de 2024",
    ]);
    const suggestion = suggestYear(preuves);
    expect(suggestion?.year).toBe(2026);
    expect(suggestion?.count).toBe(2);
  });

  it("ne propose rien sans preuve", () => {
    expect(suggestYear(extractYearEvidence(["Vendredi 19h-22h"]))).toBeNull();
  });
});

describe("cellules de repetition", () => {
  it("lit date complete, horaires et studio", () => {
    const [repetition] = parseRehearsalCell(
      "FGO Barbara :Studio numero 5\n1 rue Fleury 75018 Paris      Vendredi 04/09/2026 - 19h-23h",
      { assumedYear: 2026, month: 9 },
    );
    expect(repetition?.date).toBe("2026-09-04");
    expect(repetition?.startTime).toBe("19:00");
    expect(repetition?.endTime).toBe("23:00");
    expect(repetition?.room).toBe("Studio 5");
    expect(repetition?.locationName).toContain("FGO Barbara");
  });

  it("detecte un horaire qui franchit minuit", () => {
    const [repetition] = parseRehearsalCell("Mardi 19 : 22h-00h", {
      assumedYear: 2026,
      month: 5,
    });
    expect(repetition?.startTime).toBe("22:00");
    expect(repetition?.endTime).toBe("00:00");
    expect(repetition?.crossesMidnight).toBe(true);
  });

  it("lit plusieurs rendez-vous dans une seule cellule", () => {
    const rendezVous = parseRehearsalCell(
      "Mardi 19 : 22h-00h\nSamedi 23 : 17h-19h\nWacked Studio, 32 Boulevard Sebastopol, Paris 75004",
      { assumedYear: 2026, month: 5 },
    );
    expect(rendezVous).toHaveLength(2);
    expect(rendezVous[1]?.startTime).toBe("17:00");
    expect(rendezVous[1]?.endTime).toBe("19:00");
  });

  it("signale une cellule sans horaire au lieu d'en inventer un", () => {
    const [repetition] = parseRehearsalCell("Samedi 18", {
      assumedYear: 2026,
      month: 7,
    });
    expect(repetition?.startTime).toBeNull();
    expect(repetition?.issues.join(" ")).toContain("Aucune plage horaire");
  });

  it("ignore « N/A »", () => {
    expect(parseRehearsalCell("N/A", { assumedYear: 2026, month: 5 })).toEqual([]);
  });

  it("signale un jour seul sans contexte de mois", () => {
    const [repetition] = parseRehearsalCell("Jeudi 18 : 22h-00h", {
      assumedYear: null,
      month: null,
    });
    expect(repetition?.date).toBeNull();
    expect(repetition?.issues.join(" ")).toContain("date a saisir");
  });
});

describe("cellules d'affectation", () => {
  it("lit un prenom simple", () => {
    expect(parseAssignmentCell("Ariane").names).toEqual(["Ariane"]);
  });

  it("separe plusieurs personnes", () => {
    expect(parseAssignmentCell("Crepin/Yael").names).toEqual(["Crepin", "Yael"]);
    expect(parseAssignmentCell("Emmanuelle et Angela").names).toEqual([
      "Emmanuelle",
      "Angela",
    ]);
  });

  it("extrait la precision de pupitre", () => {
    const cellule = parseAssignmentCell("Flora (alto)");
    expect(cellule.names).toEqual(["Flora"]);
    expect(cellule.detail).toBe("alto");
  });

  it("lit une repartition par culte", () => {
    const cellule = parseAssignmentCell("Culte 1 : Ariane\nCulte 2 : Crepin");
    expect(cellule.perSession).toEqual([
      { sessionHint: "Culte 1", names: ["Ariane"] },
      { sessionHint: "Culte 2", names: ["Crepin"] },
    ]);
  });

  it("lit un co-lead", () => {
    const cellule = parseAssignmentCell("Marianne\nCo-lead : Amanda");
    expect(cellule.names).toContain("Marianne");
    expect(cellule.perSession[0]?.names).toEqual(["Amanda"]);
  });

  it("traite « N/A » comme non applicable, pas comme une personne", () => {
    const cellule = parseAssignmentCell("N/A");
    expect(cellule.notApplicable).toBe(true);
    expect(cellule.names).toEqual([]);
    expect(cellule.issues.join(" ")).toContain("non applicable");
  });

  it("lit un Mass Choir sur plusieurs lignes", () => {
    const cellule = parseAssignmentCell("Jessica\nAngelica\nNahomie\nChristina");
    expect(cellule.names).toHaveLength(4);
  });

  it("signale une marque « * » sans l'interpreter", () => {
    const cellule = parseAssignmentCell("Laura*");
    expect(cellule.names).toEqual(["Laura"]);
    expect(cellule.issues.join(" ")).toContain("*");
  });

  it("ne lit rien dans une cellule vide", () => {
    expect(parseAssignmentCell("").names).toEqual([]);
    expect(parseAssignmentCell(null).names).toEqual([]);
  });
});

describe("rapprochement des noms", () => {
  it("reconnait un nom identique", () => {
    expect(nameSimilarity("Carine Linda", "Carine Linda")).toBe(1);
  });

  it("rapproche malgre les accents et la casse", () => {
    expect(nameSimilarity("Crepin", "Crépin")).toBeGreaterThan(0.9);
  });

  it("rapproche un nom compose partiellement", () => {
    expect(nameSimilarity("Carine-Linda Danadam", "Carine Linda")).toBeGreaterThan(0.5);
  });

  it("ne rapproche pas deux prenoms differents", () => {
    expect(nameSimilarity("Ariane", "Marianne")).toBeLessThan(0.6);
  });

  it("propose sans fusionner, et classe par score", () => {
    const suggestions = suggestMatches("Crepin Gnazeri", [
      { id: "1", name: "Crepin Gnazeri" },
      { id: "2", name: "Crepin Autre" },
      { id: "3", name: "Sans rapport" },
    ]);
    expect(suggestions[0]?.candidateId).toBe("1");
    expect(suggestions.length).toBeGreaterThanOrEqual(2);
    expect(suggestions.every((s) => s.score <= 1)).toBe(true);
  });

  it("ne propose rien en dessous du seuil", () => {
    expect(suggestMatches("Zacharie", [{ id: "1", name: "Ariane" }])).toEqual([]);
  });
});

describe("groupes de la feuille LISTE CHANTS", () => {
  it("lit « CULTES 1 et 2 » comme deux creneaux", () => {
    expect(parseSongGroupLabel("CULTES 1 et 2").sessionOrdinals).toEqual([1, 2]);
  });

  it("lit « CULTE 4 / ATELIER »", () => {
    const groupe = parseSongGroupLabel("CULTE 4 / ATELIER");
    expect(groupe.sessionOrdinals).toEqual([4]);
    expect(groupe.label).toBe("CULTE 4 / ATELIER");
  });
});
