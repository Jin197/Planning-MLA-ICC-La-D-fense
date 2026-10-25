"use client";

import { useActionState } from "react";
import { Archive, Plus, Save } from "lucide-react";
import {
  actionAjouterChamp,
  actionArchiverChamp,
  actionModifierChamp,
} from "./actions";
import { ETAT_INITIAL } from "@/lib/form";
import { SubmitButton } from "@/components/ui/button";
import {
  Alerte,
  Badge,
  Card,
  CardBody,
  CardHeader,
  Input,
  Select,
} from "@/components/ui/primitives";

export function EditeurModele({
  communityId,
  version,
  postes,
  suggestions,
}: {
  communityId: string;
  version: number;
  postes: { id: string; label: string; minRequired: number; order: number }[];
  suggestions: readonly string[];
}) {
  const [etatAjout, actionAjout] = useActionState(actionAjouterChamp, ETAT_INITIAL);
  const [etatModif, actionModif] = useActionState(actionModifierChamp, ETAT_INITIAL);
  const [etatArchive, actionArchive] = useActionState(
    actionArchiverChamp,
    ETAT_INITIAL,
  );

  return (
    <Card>
      <CardHeader
        titre="Postes du modele"
        sousTitre="Renommez, reglez l'effectif minimum, ajoutez ou archivez. Un effectif de 0 rend le poste facultatif."
        actions={<Badge ton="neutre">Version {version}</Badge>}
      />
      <CardBody className="space-y-5">
        {etatModif.status !== "repos" ? (
          <Alerte ton={etatModif.status === "succes" ? "succes" : "erreur"}>
            {etatModif.message}
          </Alerte>
        ) : null}
        {etatArchive.status !== "repos" ? (
          <Alerte ton={etatArchive.status === "succes" ? "succes" : "erreur"}>
            {etatArchive.message}
          </Alerte>
        ) : null}

        <ul className="space-y-3">
          {postes.map((poste) => (
            <li
              key={poste.id}
              className="rounded-[var(--radius-doux)] bg-ivoire-fonce/60 p-3"
            >
              <div className="flex flex-wrap items-end gap-3">
                <form
                  action={actionModif}
                  className="flex min-w-0 flex-1 flex-wrap items-end gap-3"
                >
                  <input type="hidden" name="communityId" value={communityId} />
                  <input type="hidden" name="fieldId" value={poste.id} />
                  <div className="min-w-0 flex-1">
                    <label
                      htmlFor={`label-${poste.id}`}
                      className="block text-xs font-medium text-nuit-doux"
                    >
                      Libelle
                    </label>
                    <Input
                      id={`label-${poste.id}`}
                      name="label"
                      defaultValue={poste.label}
                      className="mt-1"
                    />
                  </div>
                  <div className="w-32">
                    <label
                      htmlFor={`min-${poste.id}`}
                      className="block text-xs font-medium text-nuit-doux"
                    >
                      Effectif min.
                    </label>
                    <Input
                      id={`min-${poste.id}`}
                      name="minRequired"
                      type="number"
                      min={0}
                      max={40}
                      defaultValue={poste.minRequired}
                      className="mt-1"
                    />
                  </div>
                  <SubmitButton
                    variante="secondaire"
                    taille="compact"
                    libelleEnCours="..."
                  >
                    <Save aria-hidden="true" className="size-4" />
                    Enregistrer
                  </SubmitButton>
                </form>

                <form action={actionArchive}>
                  <input type="hidden" name="communityId" value={communityId} />
                  <input type="hidden" name="fieldId" value={poste.id} />
                  <SubmitButton
                    variante="discret"
                    taille="compact"
                    libelleEnCours="..."
                    aria-label={`Archiver le poste ${poste.label}`}
                  >
                    <Archive aria-hidden="true" className="size-4" />
                    Archiver
                  </SubmitButton>
                </form>
              </div>
            </li>
          ))}
        </ul>

        <form
          action={actionAjout}
          className="space-y-3 border-t border-bordure pt-4"
        >
          <input type="hidden" name="communityId" value={communityId} />
          <h3 className="text-sm font-semibold">Ajouter un champ</h3>

          {etatAjout.status !== "repos" ? (
            <Alerte ton={etatAjout.status === "succes" ? "succes" : "erreur"}>
              {etatAjout.message}
            </Alerte>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label
                htmlFor="nouveau-label"
                className="block text-xs font-medium text-nuit-doux"
              >
                Libelle
              </label>
              <Input
                id="nouveau-label"
                name="label"
                required
                list="suggestions-postes"
                className="mt-1"
                placeholder="Referent Coordination, Star 5..."
              />
              <datalist id="suggestions-postes">
                {suggestions.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </div>
            <div>
              <label
                htmlFor="nouveau-min"
                className="block text-xs font-medium text-nuit-doux"
              >
                Effectif min.
              </label>
              <Input
                id="nouveau-min"
                name="minRequired"
                type="number"
                min={0}
                max={40}
                defaultValue={0}
                className="mt-1"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="nouveau-kind"
              className="block text-xs font-medium text-nuit-doux"
            >
              Type de donnee
            </label>
            <Select id="nouveau-kind" name="kind" defaultValue="poste" className="mt-1">
              <option value="poste">Poste affectable</option>
              <option value="texte">Texte</option>
              <option value="texte_long">Texte long</option>
              <option value="lieu">Lieu</option>
              <option value="dress_code">Dress-code</option>
            </Select>
            <p className="mt-1 text-xs text-nuit-doux">
              Seul un poste recoit un selecteur de membres.
            </p>
          </div>

          <SubmitButton taille="compact" libelleEnCours="Ajout...">
            <Plus aria-hidden="true" className="size-4" />
            Ajouter au modele
          </SubmitButton>
        </form>
      </CardBody>
    </Card>
  );
}
