import { ExternalLink } from "lucide-react";
import type { Song } from "@/domain/types";
import type { EventDetail } from "@/server/services/events";
import {
  Alerte,
  Badge,
  Card,
  CardBody,
  CardHeader,
  EtatVide,
} from "@/components/ui/primitives";
import { EditeurListeChants } from "./editeur-chants";

/**
 * Chants : une liste ordonnee par occurrence — par sous-evenement, ou pour
 * l'evenement seul s'il n'en a pas. Les liens s'ouvrent clairement comme
 * ressources externes ; rien n'est telecharge et aucune parole n'est recopiee.
 */
export function OngletChants({
  communityId,
  vue,
  chants,
}: {
  communityId: string;
  vue: EventDetail;
  chants: Song[];
}) {
  const chantById = new Map(chants.map((c) => [c.id, c]));

  return (
    <div className="space-y-6">
      {vue.occurrences.map((occurrence) => (
        <Card key={occurrence.sessionId ?? "evenement"}>
          <CardHeader
            titre={
              occurrence.sessionId === null
                ? "Chants"
                : `Chants - ${occurrence.label}`
            }
            actions={
              <Badge ton="neutre">{occurrence.setlist.length} element(s)</Badge>
            }
          />
          <CardBody className="space-y-4">
            {occurrence.setlist.length === 0 ? (
              <EtatVide
                titre="Aucun chant pour l'instant"
                description="Les sequences habituelles sont Chant 1, Chant 2, Chant 3, Sainte Cene et Offrandes."
              />
            ) : (
              <ol className="space-y-2">
                {occurrence.setlist.map((item) => {
                  const chant = item.songId ? chantById.get(item.songId) : undefined;
                  const liens = [...item.links, ...(chant?.links ?? [])];
                  return (
                    <li
                      key={item.id}
                      className="rounded-[var(--radius-doux)] bg-ivoire-fonce/60 px-3 py-2"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold uppercase tracking-wide text-nuit-doux">
                            {item.sequence}
                          </p>
                          <p className="font-medium">
                            {chant?.title ?? item.freeTitle ?? "Sans titre"}
                          </p>
                          {chant?.songKey || chant?.tempo ? (
                            <p className="text-xs text-nuit-doux">
                              {chant.songKey ? `Tonalite ${chant.songKey}` : ""}
                              {chant.songKey && chant.tempo ? " - " : ""}
                              {chant.tempo ? `${chant.tempo} bpm` : ""}
                            </p>
                          ) : null}
                          {item.notes ? (
                            <p className="mt-1 text-sm text-nuit-doux">{item.notes}</p>
                          ) : null}
                          {liens.length > 0 ? (
                            <ul className="mt-2 space-y-1">
                              {liens.map((lien) => (
                                <li key={lien}>
                                  <a
                                    href={lien}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1.5 break-all text-sm text-indigo-accent underline"
                                  >
                                    <ExternalLink
                                      aria-hidden="true"
                                      className="size-3.5 shrink-0"
                                    />
                                    {lien}
                                    <span className="sr-only">
                                      (s&apos;ouvre dans un nouvel onglet, site externe)
                                    </span>
                                  </a>
                                </li>
                              ))}
                            </ul>
                          ) : null}
                        </div>
                        {vue.isAdmin ? (
                          <EditeurListeChants
                            mode="retirer"
                            communityId={communityId}
                            eventId={vue.event.id}
                            itemId={item.id}
                            titre={chant?.title ?? item.freeTitle ?? item.sequence}
                          />
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}

            {vue.isAdmin ? (
              <EditeurListeChants
                mode="ajouter"
                communityId={communityId}
                eventId={vue.event.id}
                sessionId={occurrence.sessionId}
                chants={chants}
                autresCreneaux={vue.occurrences
                  .filter((o) => o.sessionId !== occurrence.sessionId)
                  .map((o) => ({ id: o.sessionId, label: o.label }))}
              />
            ) : null}
          </CardBody>
        </Card>
      ))}

      {vue.occurrences.length > 1 ? (
        <Alerte ton="info" titre="Partage entre sous-evenements">
          Une liste peut etre copiee d&apos;un sous-evenement vers un autre. La
          copie est explicite : les deux listes restent ensuite independantes.
        </Alerte>
      ) : null}
    </div>
  );
}
