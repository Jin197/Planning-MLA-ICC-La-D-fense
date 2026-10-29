import type { Metadata } from "next";
import { ExternalLink } from "lucide-react";
import { listSongs } from "@/server/services/songs";
import { getCommunity } from "@/server/services/communities";
import { getCommunityContext } from "@/server/auth/context";
import {
  Alerte,
  Card,
  CardBody,
  CardHeader,
  EtatVide,
} from "@/components/ui/primitives";
import { BoutonArchiverChant, FormulaireChant } from "./formulaire";

export const metadata: Metadata = { title: "Chants" };

export default async function PageChants({
  params,
}: {
  params: Promise<{ communityId: string }>;
}) {
  const { communityId } = await params;
  const ctx = await getCommunityContext(communityId);
  const [community, chants] = await Promise.all([
    getCommunity(communityId),
    listSongs(communityId),
  ]);
  const estAdmin = ctx.membership?.role === "admin";

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm text-nuit-doux">{community?.name}</p>
        <h1 className="mt-0.5 text-2xl font-semibold sm:text-3xl">
          Bibliotheque de chants
        </h1>
        <p className="mt-1 max-w-prose text-sm text-nuit-doux">
          Le repertoire de la communaute. Les listes ordonnees par creneau se
          composent dans chaque evenement, onglet « Chants ».
        </p>
      </header>

      <Alerte ton="info" titre="Liens externes">
        Les liens sont conserves comme ressources externes et s&apos;ouvrent dans
        un nouvel onglet. Aucune video n&apos;est telechargee et aucune parole
        protegee n&apos;est recopiee.
      </Alerte>

      {estAdmin ? (
        <Card>
          <CardHeader titre="Ajouter un chant au repertoire" />
          <CardBody>
            <FormulaireChant communityId={communityId} />
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardHeader titre={`Repertoire (${chants.length})`} />
        <CardBody>
          {chants.length === 0 ? (
            <EtatVide
              titre="Aucun chant pour le moment"
              description={
                estAdmin
                  ? "Ajoutez vos premiers chants ci-dessus."
                  : "Les admins n'ont pas encore rempli le repertoire."
              }
            />
          ) : (
            <ul className="divide-y divide-bordure">
              {chants.map((chant) => (
                <li key={chant.id} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="font-medium">{chant.title}</p>
                    {estAdmin ? (
                      <BoutonArchiverChant
                        communityId={communityId}
                        songId={chant.id}
                        titre={chant.title}
                      />
                    ) : null}
                  </div>
                  <p className="text-sm text-nuit-doux">
                    {[
                      chant.songKey ? `Tonalite ${chant.songKey}` : null,
                      chant.tempo ? `${chant.tempo} bpm` : null,
                      chant.defaultLead ? `Lead habituel : ${chant.defaultLead}` : null,
                    ]
                      .filter(Boolean)
                      .join(" - ") || "Pas de complement."}
                  </p>
                  {chant.notes ? (
                    <p className="mt-1 text-sm">{chant.notes}</p>
                  ) : null}
                  {chant.links.length > 0 ? (
                    <ul className="mt-2 space-y-1">
                      {chant.links.map((lien) => (
                        <li key={lien}>
                          <a
                            href={lien}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 break-all text-sm text-accent underline"
                          >
                            <ExternalLink aria-hidden="true" className="size-3.5 shrink-0" />
                            {lien}
                            <span className="sr-only">
                              (site externe, nouvel onglet)
                            </span>
                          </a>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
