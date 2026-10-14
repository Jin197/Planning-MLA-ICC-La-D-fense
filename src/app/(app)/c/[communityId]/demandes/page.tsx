import type { Metadata } from "next";
import { listPendingRequests, getCommunity } from "@/server/services/communities";
import { requireCommunityAction } from "@/server/auth/context";
import {
  Alerte,
  Card,
  CardBody,
  CardHeader,
  EtatVide,
} from "@/components/ui/primitives";
import { DecisionAdhesion } from "./decision";

export const metadata: Metadata = { title: "Demandes d'adhesion" };

export default async function PageDemandes({
  params,
  searchParams,
}: {
  params: Promise<{ communityId: string }>;
  searchParams: Promise<{ traite?: string }>;
}) {
  const { communityId } = await params;
  const { traite } = await searchParams;
  await requireCommunityAction(communityId, "communaute.decider_adhesion");

  const [community, demandes] = await Promise.all([
    getCommunity(communityId),
    listPendingRequests(communityId),
  ]);

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm text-nuit-doux">{community?.name}</p>
        <h1 className="mt-0.5 text-2xl font-semibold sm:text-3xl">
          Demandes d&apos;adhesion
        </h1>
        <p className="mt-1 max-w-prose text-sm text-nuit-doux">
          Une personne en attente n&apos;accede qu&apos;a la fiche publique et a
          sa propre demande. L&apos;acceptation cree une adhesion avec le role
          membre.
        </p>
      </header>

      {traite === "acceptee" ? (
        <Alerte ton="succes" titre="Adhesion acceptee">
          La personne est informee et devient membre actif de cette communaute,
          avec le role membre.
        </Alerte>
      ) : null}
      {traite === "refusee" ? (
        <Alerte ton="info" titre="Demande refusee">
          La personne est informee. Elle pourra soumettre une nouvelle demande.
        </Alerte>
      ) : null}

      {demandes.length === 0 ? (
        <Card>
          <CardBody>
            <EtatVide
              titre="Aucune demande en attente"
              description="Les nouvelles demandes apparaitront ici et vous serez notifie."
            />
          </CardBody>
        </Card>
      ) : (
        <ul className="space-y-4">
          {demandes.map((demande) => (
            <Card as="li" key={demande.id}>
              <CardHeader
                titre={`${demande.firstName} ${demande.lastName}`}
                sousTitre={
                  demande.declaredMinistry
                    ? `Ministere declare : ${demande.declaredMinistry}`
                    : undefined
                }
              />
              <CardBody className="space-y-4">
                {demande.message ? (
                  <blockquote className="rounded-[var(--radius-doux)] bg-ivoire-fonce px-3 py-2 text-sm">
                    {demande.message}
                  </blockquote>
                ) : (
                  <p className="text-sm text-nuit-tres-doux">Aucun message.</p>
                )}
                <p className="text-xs text-nuit-doux">
                  Demande du{" "}
                  {new Intl.DateTimeFormat("fr-FR", {
                    dateStyle: "long",
                    timeStyle: "short",
                    hour12: false,
                  }).format(new Date(demande.createdAt))}
                </p>
                <DecisionAdhesion communityId={communityId} requestId={demande.id} />
              </CardBody>
            </Card>
          ))}
        </ul>
      )}

      <Alerte ton="info" titre="Le ministere declare n'accorde rien">
        Le ministere indique a l&apos;inscription est une information de profil.
        Seule l&apos;acceptation d&apos;une demande ouvre les droits de membre
        dans cette communaute.
      </Alerte>
    </div>
  );
}
