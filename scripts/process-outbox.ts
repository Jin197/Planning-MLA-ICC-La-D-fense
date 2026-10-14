/**
 * Worker de l'outbox : traite les emails en attente.
 * Usage : npm run outbox
 *
 * Sans fournisseur configure, rien n'est envoye et les taches restent en
 * etat « enregistre ». Le rapport le dit explicitement.
 */
import { processOutbox } from "../src/server/notifications/mailer";

async function main(): Promise<void> {
  const report = await processOutbox({ limit: 50 });
  console.log("Rapport du worker de notifications");
  console.table(report);
  if (!report.configured) {
    console.log(
      "\nAucun fournisseur d'email configure (DIAPASON_EMAIL_PROVIDER). " +
        "Les taches restent enregistrees : aucun email n'a ete envoye.",
    );
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
