/**
 * Installe le jeu de donnees fictif de la demonstration locale.
 * Usage : npm run seed
 */
import { buildSeedSnapshot } from "../src/server/data/demo/seed";
import { persistPath, replaceSnapshot } from "../src/server/data/demo/store";
import { DEMO_PASSWORD } from "../src/server/data/demo/seed";

async function main(): Promise<void> {
  const snapshot = await buildSeedSnapshot();
  replaceSnapshot(snapshot);
  const counts = {
    comptes: snapshot.profiles.length,
    communautes: snapshot.communities.length,
    adhesions: snapshot.community_memberships.length,
    evenements: snapshot.events.length,
    creneaux: snapshot.event_sessions.length,
    postes: snapshot.event_role_slots.length,
    affectations: snapshot.assignments.length,
    disponibilites: snapshot.session_availabilities.length,
    repetitions: snapshot.rehearsals.length,
  };
  console.log("Donnees de demonstration installees.");
  console.log(`Fichier : ${persistPath()}`);
  console.table(counts);
  console.log(
    `\nComptes de demonstration (mot de passe commun : ${DEMO_PASSWORD})`,
  );
  console.log("  Admin MLA        noa.bertrand@exemple.test");
  console.log("  Admin MLA (2)    ines.valadier@exemple.test");
  console.log("  Membre MLA       elias.marchand@exemple.test");
  console.log("  Deux ministeres  gaspard.nguema@exemple.test");
  console.log("  Sans adhesion    anaelle.rakoto@exemple.test");
  console.log(
    "\nCes comptes et ces plannings sont fictifs. Aucun email reel n'est envoye.",
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
