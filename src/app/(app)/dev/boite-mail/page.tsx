import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isDemoMode } from "@/server/data";
import { requireSession } from "@/server/auth/context";
import { pendingAccountTokens } from "@/server/services/accounts";
import { listOutbox, resolveProvider } from "@/server/notifications/mailer";
import {
  Alerte,
  Badge,
  Card,
  CardBody,
  CardHeader,
  EtatVide,
  GrilleDefilante,
} from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Boite de developpement" };

const ETATS: Record<string, { libelle: string; ton: "neutre" | "attente" | "dispo" | "indispo" }> = {
  enregistre: { libelle: "Enregistre en base", ton: "attente" },
  pris_en_charge: { libelle: "Pris en charge par le fournisseur", ton: "dispo" },
  livre: { libelle: "Livre", ton: "dispo" },
  echec: { libelle: "Echec", ton: "indispo" },
  abandonne: { libelle: "Abandonne", ton: "neutre" },
};

/**
 * Page de developpement de l'adaptateur de demonstration. Elle montre
 * honnetement ce qui s'est passe : les taches enregistrees ne sont pas des
 * emails envoyes.
 */
export default async function PageBoiteMail() {
  if (!isDemoMode()) notFound();
  await requireSession();

  const [jetons, file] = await Promise.all([pendingAccountTokens(), listOutbox(60)]);
  const fournisseur = resolveProvider();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold sm:text-3xl">
          Boite de developpement
        </h1>
        <p className="mt-1 max-w-prose text-sm text-nuit-doux">
          Visible uniquement avec l&apos;adaptateur de demonstration. Elle
          remplace l&apos;envoi d&apos;emails reels.
        </p>
      </header>

      <Alerte
        ton={fournisseur.configured ? "info" : "attention"}
        titre={`Fournisseur d'email : ${fournisseur.name}`}
      >
        {fournisseur.configured
          ? "Un fournisseur est configure. Lancez « npm run outbox » pour traiter la file."
          : "Aucun fournisseur configure : rien n'est envoye et les taches restent a l'etat « enregistre »."}
      </Alerte>

      <Card>
        <CardHeader
          titre="Jetons de compte en attente"
          sousTitre="Verification d'email et reinitialisation de mot de passe."
        />
        <CardBody>
          {jetons.length === 0 ? (
            <EtatVide titre="Aucun jeton en attente" />
          ) : (
            <ul className="space-y-3">
              {jetons.map((jeton) => (
                <li
                  key={jeton.email}
                  className="rounded-[var(--radius-doux)] bg-ivoire-fonce/60 p-3 text-sm"
                >
                  <p className="font-medium">{jeton.email}</p>
                  {jeton.verification ? (
                    <p className="mt-1 break-all">
                      Verification :{" "}
                      <Link
                        href={`/verification-email?jeton=${encodeURIComponent(jeton.verification)}`}
                        className="text-accent underline"
                      >
                        {jeton.verification}
                      </Link>
                    </p>
                  ) : null}
                  {jeton.reset ? (
                    <p className="mt-1 break-all">
                      Reinitialisation :{" "}
                      <Link
                        href={`/reinitialiser?jeton=${encodeURIComponent(jeton.reset)}`}
                        className="text-accent underline"
                      >
                        {jeton.reset}
                      </Link>
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          titre={`File de notifications (${file.length})`}
          sousTitre="Outbox transactionnelle : chaque tache porte une cle d'idempotence."
        />
        <CardBody>
          {file.length === 0 ? (
            <EtatVide titre="File vide" />
          ) : (
            <GrilleDefilante legende="File des emails en attente">
              <table className="min-w-max text-sm">
                <thead>
                  <tr>
                    <th scope="col" className="border-b border-bordure px-3 py-2 text-left">
                      Type
                    </th>
                    <th scope="col" className="border-b border-bordure px-3 py-2 text-left">
                      Sujet
                    </th>
                    <th scope="col" className="border-b border-bordure px-3 py-2 text-left">
                      Etat
                    </th>
                    <th scope="col" className="border-b border-bordure px-3 py-2 text-left">
                      Prevu pour
                    </th>
                    <th scope="col" className="border-b border-bordure px-3 py-2 text-left">
                      Tentatives
                    </th>
                    <th scope="col" className="border-b border-bordure px-3 py-2 text-left">
                      Cle d&apos;idempotence
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {file.map((tache) => {
                    const etat = ETATS[tache.state] ?? {
                      libelle: tache.state,
                      ton: "neutre" as const,
                    };
                    return (
                      <tr key={tache.id} className="even:bg-ivoire-fonce/40">
                        <td className="border-b border-bordure px-3 py-2">
                          {tache.kind}
                        </td>
                        <td className="border-b border-bordure px-3 py-2">
                          {tache.subject}
                        </td>
                        <td className="border-b border-bordure px-3 py-2">
                          <Badge ton={etat.ton}>{etat.libelle}</Badge>
                        </td>
                        <td className="border-b border-bordure px-3 py-2 whitespace-nowrap">
                          {new Intl.DateTimeFormat("fr-FR", {
                            dateStyle: "short",
                            timeStyle: "short",
                            hour12: false,
                          }).format(new Date(tache.scheduledFor))}
                        </td>
                        <td className="border-b border-bordure px-3 py-2">
                          {tache.attempts}
                        </td>
                        <td className="border-b border-bordure px-3 py-2 font-mono text-xs">
                          {tache.idempotencyKey.slice(0, 12)}...
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </GrilleDefilante>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
