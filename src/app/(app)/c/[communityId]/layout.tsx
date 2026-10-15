import Link from "next/link";
import { getCommunityContext } from "@/server/auth/context";
import { getCommunity } from "@/server/services/communities";
import { Card, CardBody, CardHeader, EtatVide } from "@/components/ui/primitives";

/**
 * Garde d'acces de la communaute. Sans adhesion active, aucun contenu prive
 * n'est rendu : la page renvoie vers le catalogue.
 */
export default async function CommunityLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ communityId: string }>;
}) {
  const { communityId } = await params;
  const ctx = await getCommunityContext(communityId);
  const community = await getCommunity(communityId);

  if (!community) {
    return (
      <Card>
        <CardHeader niveau={1} titre="Communaute introuvable" />
        <CardBody>
          <EtatVide
            titre="Ce lien ne correspond a aucune communaute"
            action={
              <Link href="/communautes" className="text-indigo-accent underline">
                Retour au catalogue
              </Link>
            }
          />
        </CardBody>
      </Card>
    );
  }

  if (!ctx.membership || ctx.membership.status !== "active") {
    return (
      <Card>
        <CardHeader
          niveau={1}
          titre={community.name}
          sousTitre={`Responsable affiche : ${community.displayedLeaderName}`}
        />
        <CardBody className="space-y-4">
          <p className="text-sm text-nuit-doux">{community.description}</p>
          <EtatVide
            titre="Contenu reserve aux membres"
            description="Les plannings, les equipes, les echanges et les motifs d'indisponibilite ne sont pas accessibles sans adhesion active. Vous pouvez demander a rejoindre cette communaute depuis le catalogue."
            action={
              <Link
                href="/communautes"
                className="inline-flex min-h-11 items-center rounded-[var(--radius-doux)] bg-indigo-accent px-4 py-2 text-sur-accent"
              >
                Aller au catalogue
              </Link>
            }
          />
        </CardBody>
      </Card>
    );
  }

  return <>{children}</>;
}
