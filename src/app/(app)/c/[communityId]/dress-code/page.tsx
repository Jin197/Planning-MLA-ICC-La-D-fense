import Link from "next/link";
import type { Metadata } from "next";
import { formatDateLong } from "@/lib/time";
import { listEvents } from "@/server/services/events";
import { getCommunity } from "@/server/services/communities";
import { listDressCodes } from "@/server/services/dresscode";
import {
  Card,
  CardBody,
  CardHeader,
  EtatVide,
  FiletSignature,
} from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Dress-code" };

/**
 * Vue d'ensemble des consignes vestimentaires de la communaute. C'est le
 * principal espace visuel : les ecrans operationnels restent sobres.
 */
export default async function PageDressCode({
  params,
}: {
  params: Promise<{ communityId: string }>;
}) {
  const { communityId } = await params;
  const [community, evenements] = await Promise.all([
    getCommunity(communityId),
    listEvents(communityId),
  ]);

  const avecDressCode = await Promise.all(
    evenements.map(async (evenement) => ({
      evenement,
      consignes: await listDressCodes(communityId, evenement.id),
    })),
  );
  const pertinents = avecDressCode.filter((e) => e.consignes.length > 0);

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm text-nuit-doux">{community?.name}</p>
        <h1 className="mt-0.5 text-2xl font-semibold sm:text-3xl">Dress-code</h1>
        <div className="mt-3">
          <FiletSignature />
        </div>
        <p className="mt-3 max-w-prose text-sm text-nuit-doux">
          Theme, ambiance, couleurs, matieres et consigne, par evenement. Le
          referent dress-code est un poste affectable, gere avec les
          affectations de chaque creneau.
        </p>
      </header>

      {pertinents.length === 0 ? (
        <Card>
          <CardBody>
            <EtatVide
              titre="Aucune consigne pour le moment"
              description="Les consignes se definissent dans chaque evenement, onglet « Dress-code »."
            />
          </CardBody>
        </Card>
      ) : (
        <ul className="grid gap-6 lg:grid-cols-2">
          {pertinents.map(({ evenement, consignes }) => (
            <Card as="li" key={evenement.id}>
              <CardHeader
                titre={
                  <Link
                    href={`/c/${communityId}/evenements/${evenement.id}?onglet=dress-code`}
                    className="hover:underline"
                  >
                    {evenement.title}
                  </Link>
                }
                sousTitre={
                  evenement.sessions[0]
                    ? formatDateLong(
                        evenement.sessions[0].startsAt,
                        evenement.timezone,
                      )
                    : undefined
                }
              />
              <CardBody className="space-y-4">
                {consignes.map((consigne) => (
                  <div key={consigne.id}>
                    <p className="font-medium">
                      {consigne.theme || "Consigne"}
                      {consigne.teamId ? (
                        <span className="ml-2 text-xs font-normal text-nuit-doux">
                          variante d&apos;equipe
                        </span>
                      ) : null}
                    </p>
                    {consigne.mood ? (
                      <p className="text-sm text-nuit-doux">{consigne.mood}</p>
                    ) : null}
                    {consigne.colors.length > 0 ? (
                      <ul className="mt-2 flex flex-wrap gap-2">
                        {consigne.colors.map((couleur) => (
                          <li
                            key={couleur}
                            className="flex items-center gap-1.5 text-sm"
                          >
                            <span
                              aria-hidden="true"
                              className="inline-block size-8 rounded-[var(--radius-doux)] bg-ivoire-fonce/60-forte"
                              style={{ backgroundColor: couleur }}
                            />
                            {couleur}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {consigne.instruction ? (
                      <p className="mt-2 whitespace-pre-line text-sm">
                        {consigne.instruction}
                      </p>
                    ) : null}
                  </div>
                ))}
              </CardBody>
            </Card>
          ))}
        </ul>
      )}
    </div>
  );
}
