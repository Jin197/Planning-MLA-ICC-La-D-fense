"use client";

import { useActionState } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import { actionAjouterVisuel, actionRetirerVisuel } from "./actions";
import { ETAT_INITIAL } from "@/lib/form";
import { SubmitButton } from "@/components/ui/button";
import {
  Alerte,
  Card,
  CardBody,
  CardHeader,
  Champ,
  EtatVide,
  Input,
} from "@/components/ui/primitives";

export interface VisuelAffiche {
  id: string;
  alt: string;
  filename: string;
  sizeBytes: number;
}

/**
 * Moodboard du dress-code.
 *
 * Chaque visuel porte un texte alternatif obligatoire, et les fichiers sont
 * servis par une route qui verifie l'adhesion : ils ne sont jamais publics.
 */
export function Moodboard({
  communityId,
  eventId,
  dressCodeId,
  visuels,
  peutModifier,
}: {
  communityId: string;
  eventId: string;
  dressCodeId: string | null;
  visuels: VisuelAffiche[];
  peutModifier: boolean;
}) {
  const [etatAjout, actionAjout] = useActionState(actionAjouterVisuel, ETAT_INITIAL);
  const [etatRetrait, actionRetrait] = useActionState(
    actionRetirerVisuel,
    ETAT_INITIAL,
  );

  return (
    <Card>
      <CardHeader
        titre="Moodboard"
        sousTitre="Visuels de reference. Ils restent dans un espace prive, accessible aux seuls membres de cette communaute."
      />
      <CardBody className="space-y-5">
        {etatRetrait.status !== "repos" ? (
          <Alerte ton={etatRetrait.status === "succes" ? "succes" : "erreur"}>
            {etatRetrait.message}
          </Alerte>
        ) : null}

        {visuels.length === 0 ? (
          <EtatVide
            titre="Aucun visuel"
            description={
              peutModifier
                ? "Ajoutez une image de reference ci-dessous."
                : "Le pole dress-code n'a pas encore ajoute de visuel."
            }
          />
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visuels.map((visuel) => (
              <li
                key={visuel.id}
                className="overflow-hidden rounded-[var(--radius-doux)] bg-ivoire-fonce/60"
              >
                {/* Image servie par une route authentifiee, jamais depuis public/. */}
                <img
                  src={`/api/c/${communityId}/visuels/${visuel.id}`}
                  alt={visuel.alt}
                  loading="lazy"
                  className="aspect-[4/3] w-full bg-ivoire-fonce object-cover"
                />
                <div className="space-y-2 p-3">
                  <p className="text-sm">{visuel.alt}</p>
                  <p className="text-xs text-nuit-tres-doux">
                    {visuel.filename} - {Math.round(visuel.sizeBytes / 1024)} ko
                  </p>
                  {peutModifier ? (
                    <form action={actionRetrait}>
                      <input type="hidden" name="communityId" value={communityId} />
                      <input type="hidden" name="eventId" value={eventId} />
                      <input type="hidden" name="assetId" value={visuel.id} />
                      <SubmitButton
                        variante="discret"
                        taille="compact"
                        libelleEnCours="..."
                        aria-label={`Retirer le visuel « ${visuel.alt} »`}
                      >
                        <Trash2 aria-hidden="true" className="size-4" />
                        Retirer
                      </SubmitButton>
                    </form>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}

        {peutModifier ? (
          <form
            action={actionAjout}
            className="space-y-4 border-t border-bordure pt-5"
            encType="multipart/form-data"
          >
            <input type="hidden" name="communityId" value={communityId} />
            <input type="hidden" name="eventId" value={eventId} />
            {dressCodeId ? (
              <input type="hidden" name="dressCodeId" value={dressCodeId} />
            ) : null}

            <h3 className="text-sm font-semibold">Ajouter un visuel</h3>

            {etatAjout.status !== "repos" ? (
              <Alerte ton={etatAjout.status === "succes" ? "succes" : "erreur"}>
                {etatAjout.message}
              </Alerte>
            ) : null}

            <Champ
              label="Image"
              htmlFor="visuel"
              requis
              aide="JPEG, PNG, WEBP ou AVIF. 5 Mo maximum. Le format est verifie sur le contenu du fichier, pas sur son nom."
            >
              <Input
                id="visuel"
                name="visuel"
                type="file"
                accept="image/jpeg,image/png,image/webp,image/avif"
                required
                className="py-2"
              />
            </Champ>

            <Champ
              label="Texte alternatif"
              htmlFor="alt"
              requis
              aide="Decrivez le visuel pour les personnes qui ne le voient pas, et pour les lecteurs d'ecran."
            >
              <Input
                id="alt"
                name="alt"
                required
                maxLength={300}
                defaultValue={etatAjout.valeurs?.alt ?? ""}
                placeholder="Haut ivoire, veste brune, chaussures fermees"
              />
            </Champ>

            <SubmitButton libelleEnCours="Envoi du visuel...">
              <ImagePlus aria-hidden="true" className="size-4" />
              Ajouter au moodboard
            </SubmitButton>
          </form>
        ) : null}
      </CardBody>
    </Card>
  );
}
