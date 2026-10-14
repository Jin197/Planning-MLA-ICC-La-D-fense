/**
 * Analyse un classeur sans rien ecrire, et imprime un resume.
 * Usage : npm run analyse:classeur -- "PLANNING MLA LA DEFENSE (1).xlsx"
 */
import { readFileSync } from "node:fs";
import { analyserClasseur } from "../src/server/import/workbook";

async function main(): Promise<void> {
  const chemin = process.argv[2] ?? "PLANNING MLA LA DEFENSE (1).xlsx";
  const fichier = readFileSync(chemin);
  const buffer = fichier.buffer.slice(
    fichier.byteOffset,
    fichier.byteOffset + fichier.byteLength,
  ) as ArrayBuffer;

  const analyse = await analyserClasseur(buffer);

  console.log(`Fichier : ${chemin}`);
  console.log(`Feuilles reconnues : ${analyse.sheetsDetected.join(", ")}`);
  if (analyse.sheetsManquantes.length > 0) {
    console.log(`Feuilles attendues absentes : ${analyse.sheetsManquantes.join(", ")}`);
  }
  console.log(
    analyse.yearEvidence
      ? `Annee proposee : ${analyse.yearEvidence.year} (${analyse.yearEvidence.count} preuve(s)) - « ${analyse.yearEvidence.evidence} »`
      : "Aucune annee etayee dans le fichier.",
  );

  console.table({
    personnes: analyse.personnes.length,
    colonnesDeDates: analyse.colonnes.length,
    colonnesSansDate: analyse.colonnes.filter((c) => c.parsed.date === null).length,
    disponibilites: analyse.disponibilites.length,
    affectations: analyse.affectations.length,
    rendezVousRepetition: analyse.repetitions.reduce((n, r) => n + r.parsed.length, 0),
    chants: analyse.chants.length,
    dressCodes: analyse.dressCodes.length,
    anomalies: analyse.anomalies.length,
    doublonsPlanningHistorique: analyse.doublonsPlanningHistorique.length,
  });

  const franchissentMinuit = analyse.repetitions
    .flatMap((r) => r.parsed)
    .filter((r) => r.crossesMidnight);
  console.log(`\nRepetitions franchissant minuit : ${franchissentMinuit.length}`);
  for (const r of franchissentMinuit.slice(0, 5)) {
    console.log(`  ${r.date ?? "date a definir"} ${r.startTime} -> ${r.endTime}  (${r.raw.slice(0, 70)})`);
  }

  console.log("\nPremieres anomalies :");
  for (const a of analyse.anomalies.slice(0, 12)) {
    console.log(`  [${a.sheet}!${a.cell}] ${a.message}`);
  }

  console.log("\nPostes lus dans les blocs d'equipe :");
  const postes = [...new Set(analyse.affectations.map((a) => a.roleLabel))];
  console.log(`  ${postes.join(" | ")}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
