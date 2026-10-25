import type { EventDetail } from "@/server/services/events";
import { listAssets } from "@/server/services/dresscode";
import {
  Alerte,
  Card,
  CardBody,
  CardHeader,
  EtatVide,
} from "@/components/ui/primitives";
import { EditeurDressCode } from "./editeur-dress-code";
import { Moodboard } from "./moodboard";

/**
 * Dress-code : le principal espace visuel de l'application. Une consigne
 * commune peut avoir des variantes par equipe.
 */
export async function OngletDressCode({
  communityId,
  vue,
}: {
  communityId: string;
  vue: EventDetail;
}) {
  const commun = vue.dressCodes.find((d) => d.teamId === null);
  const variantes = vue.dressCodes.filter((d) => d.teamId !== null);
  const visuels = await listAssets(communityId, vue.event.id);

  return (
    <div className="space-y-6">
      {commun ? (
        <Card>
          <CardHeader
            titre={commun.theme || "Consigne commune"}
            sousTitre={commun.mood || undefined}
          />
          <CardBody className="space-y-5">
            {commun.colors.length > 0 ? (
              <div>
                <h3 className="text-sm font-semibold text-nuit-doux">Couleurs</h3>
                <ul className="mt-2 flex flex-wrap gap-3">
                  {commun.colors.map((couleur) => (
                    <li key={couleur} className="flex items-center gap-2">
                      <span
                        aria-hidden="true"
                        className="inline-block size-10 rounded-[var(--radius-doux)] bg-ivoire-fonce/60-forte"
                        style={{ backgroundColor: couleur }}
                      />
                      <span className="text-sm">{couleur}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-nuit-doux">
                  Les codes couleur sont ecrits a cote de chaque pastille : la
                  couleur seule ne porte pas l&apos;information.
                </p>
              </div>
            ) : null}

            {commun.materials ? (
              <div>
                <h3 className="text-sm font-semibold text-nuit-doux">Matieres</h3>
                <p className="mt-1 text-sm">{commun.materials}</p>
              </div>
            ) : null}

            {commun.instruction ? (
              <div>
                <h3 className="text-sm font-semibold text-nuit-doux">Consigne</h3>
                <p className="mt-1 whitespace-pre-line">{commun.instruction}</p>
              </div>
            ) : null}
          </CardBody>
        </Card>
      ) : (
        <Card>
          <CardBody>
            <EtatVide
              titre="Aucun dress-code defini"
              description={
                vue.isAdmin
                  ? "Renseignez le theme, l'ambiance, les couleurs, les matieres et la consigne."
                  : "Le pole dress-code n'a pas encore publie de consigne pour cet evenement."
              }
            />
          </CardBody>
        </Card>
      )}

      {variantes.length > 0 ? (
        <Card>
          <CardHeader titre="Variantes par equipe" />
          <CardBody>
            <ul className="space-y-4">
              {variantes.map((variante) => (
                <li
                  key={variante.id}
                  className="rounded-[var(--radius-doux)] bg-ivoire-fonce/60 p-3"
                >
                  <p className="font-medium">
                    {vue.teams.find((t) => t.id === variante.teamId)?.name ??
                      "Equipe"}
                  </p>
                  {variante.colors.length > 0 ? (
                    <ul className="mt-2 flex flex-wrap gap-2">
                      {variante.colors.map((couleur) => (
                        <li key={couleur} className="flex items-center gap-1.5 text-sm">
                          <span
                            aria-hidden="true"
                            className="inline-block size-5 rounded bg-ivoire-fonce/60-forte"
                            style={{ backgroundColor: couleur }}
                          />
                          {couleur}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {variante.instruction ? (
                    <p className="mt-2 whitespace-pre-line text-sm">
                      {variante.instruction}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ) : null}

      <Moodboard
        communityId={communityId}
        eventId={vue.event.id}
        dressCodeId={commun?.id ?? null}
        peutModifier={vue.isAdmin}
        visuels={visuels.map((visuel) => ({
          id: visuel.id,
          alt: visuel.alt,
          filename: visuel.filename,
          sizeBytes: visuel.sizeBytes,
        }))}
      />

      <Alerte ton="info" titre="Referent dress-code">
        Le referent dress-code est un poste affectable : il se gere dans
        l&apos;onglet « Creneaux et equipes », avec une precision possible comme
        le groupe accompagne.
      </Alerte>

      {vue.isAdmin ? (
        <EditeurDressCode
          communityId={communityId}
          eventId={vue.event.id}
          equipes={vue.teams.map((t) => ({ id: t.id, name: t.name }))}
          actuel={
            commun
              ? {
                  theme: commun.theme,
                  mood: commun.mood,
                  colors: commun.colors.join(", "),
                  materials: commun.materials,
                  instruction: commun.instruction,
                }
              : null
          }
        />
      ) : null}
    </div>
  );
}
