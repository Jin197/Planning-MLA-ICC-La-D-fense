"use client";

import { useActionState, useState } from "react";
import { ArrowDown, ArrowUp, Copy, Plus, Trash2 } from "lucide-react";
import {
  actionAjouterChant,
  actionCopierListeChants,
  actionDeplacerChant,
  actionRetirerChant,
} from "./actions";
import { ETAT_INITIAL } from "@/lib/form";
import { DEFAULT_SEQUENCES } from "@/domain/songs";
import type { Song } from "@/domain/types";
import { Button, SubmitButton } from "@/components/ui/button";
import { Alerte, Input, Select, Textarea } from "@/components/ui/primitives";

type Props =
  | {
      mode: "retirer";
      communityId: string;
      eventId: string;
      itemId: string;
      titre: string;
    }
  | {
      mode: "ajouter";
      communityId: string;
      eventId: string;
      sessionId: string;
      chants: Song[];
      autresCreneaux: { id: string; label: string }[];
    };

export function EditeurListeChants(props: Props) {
  if (props.mode === "retirer") {
    return <BoutonRetirer {...props} />;
  }
  return <PanneauAjout {...props} />;
}

/**
 * Reordonnancement et retrait d'un element.
 *
 * Le deplacement se fait par boutons « Monter » et « Descendre » : utilisable
 * au clavier et sur un telephone, contrairement a un glisser-deposer.
 */
function BoutonRetirer({
  communityId,
  eventId,
  itemId,
  titre,
}: {
  communityId: string;
  eventId: string;
  itemId: string;
  titre: string;
}) {
  const [etatRetrait, actionRetrait] = useActionState(
    actionRetirerChant,
    ETAT_INITIAL,
  );
  const [etatDeplacement, actionDeplacement] = useActionState(
    actionDeplacerChant,
    ETAT_INITIAL,
  );

  const champs = (
    <>
      <input type="hidden" name="communityId" value={communityId} />
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="itemId" value={itemId} />
    </>
  );

  return (
    <div className="shrink-0">
      <div className="flex flex-wrap items-center gap-1">
        <form action={actionDeplacement}>
          {champs}
          <SubmitButton
            name="direction"
            value="haut"
            variante="discret"
            taille="compact"
            libelleEnCours="..."
            aria-label={`Monter « ${titre} » dans la liste`}
          >
            <ArrowUp aria-hidden="true" className="size-4" />
          </SubmitButton>
        </form>
        <form action={actionDeplacement}>
          {champs}
          <SubmitButton
            name="direction"
            value="bas"
            variante="discret"
            taille="compact"
            libelleEnCours="..."
            aria-label={`Descendre « ${titre} » dans la liste`}
          >
            <ArrowDown aria-hidden="true" className="size-4" />
          </SubmitButton>
        </form>
        <form action={actionRetrait}>
          {champs}
          <SubmitButton
            variante="discret"
            taille="compact"
            libelleEnCours="..."
            aria-label={`Retirer « ${titre} » de la liste`}
          >
            <Trash2 aria-hidden="true" className="size-4" />
            Retirer
          </SubmitButton>
        </form>
      </div>

      {etatDeplacement.status === "erreur" ? (
        <p className="mt-1 text-xs text-nuit-doux">{etatDeplacement.message}</p>
      ) : null}
      {etatRetrait.status === "erreur" ? (
        <p className="mt-1 text-xs text-indispo-texte">{etatRetrait.message}</p>
      ) : null}
    </div>
  );
}

function PanneauAjout({
  communityId,
  eventId,
  sessionId,
  chants,
  autresCreneaux,
}: {
  communityId: string;
  eventId: string;
  sessionId: string;
  chants: Song[];
  autresCreneaux: { id: string; label: string }[];
}) {
  const [ouvert, setOuvert] = useState(false);
  const [etatAjout, actionAjout] = useActionState(actionAjouterChant, ETAT_INITIAL);
  const [etatCopie, actionCopie] = useActionState(
    actionCopierListeChants,
    ETAT_INITIAL,
  );

  return (
    <div className="space-y-3 border-t border-bordure pt-3">
      <div className="flex flex-wrap gap-2">
        <Button
          variante="secondaire"
          taille="compact"
          onClick={() => setOuvert((o) => !o)}
          aria-expanded={ouvert}
        >
          <Plus aria-hidden="true" className="size-4" />
          Ajouter un chant
        </Button>
      </div>

      {etatAjout.status === "succes" ? (
        <Alerte ton="succes">{etatAjout.message}</Alerte>
      ) : null}
      {etatCopie.status === "succes" ? (
        <Alerte ton="succes">{etatCopie.message}</Alerte>
      ) : null}

      {ouvert ? (
        <form action={actionAjout} className="space-y-3">
          <input type="hidden" name="communityId" value={communityId} />
          <input type="hidden" name="eventId" value={eventId} />
          <input type="hidden" name="sessionId" value={sessionId} />

          {etatAjout.status === "erreur" ? (
            <Alerte ton="erreur">{etatAjout.message}</Alerte>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label
                htmlFor={`sequence-${sessionId}`}
                className="block text-xs font-medium text-nuit-doux"
              >
                Sequence
              </label>
              <Input
                id={`sequence-${sessionId}`}
                name="sequence"
                list={`sequences-${sessionId}`}
                className="mt-1"
                placeholder="Chant 1"
              />
              <datalist id={`sequences-${sessionId}`}>
                {DEFAULT_SEQUENCES.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </div>
            <div>
              <label
                htmlFor={`song-${sessionId}`}
                className="block text-xs font-medium text-nuit-doux"
              >
                Chant du repertoire
              </label>
              <Select id={`song-${sessionId}`} name="songId" className="mt-1">
                <option value="">Aucun (titre libre)</option>
                {chants.map((chant) => (
                  <option key={chant.id} value={chant.id}>
                    {chant.title}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div>
            <label
              htmlFor={`titre-${sessionId}`}
              className="block text-xs font-medium text-nuit-doux"
            >
              Titre libre (si le chant n&apos;est pas encore au repertoire)
            </label>
            <Input id={`titre-${sessionId}`} name="titreLibre" className="mt-1" />
          </div>

          <div>
            <label
              htmlFor={`lien-${sessionId}`}
              className="block text-xs font-medium text-nuit-doux"
            >
              Lien utile (https://...)
            </label>
            <Input
              id={`lien-${sessionId}`}
              name="liens"
              type="url"
              className="mt-1"
              placeholder="https://..."
            />
            <p className="mt-1 text-xs text-nuit-doux">
              Le lien est conserve comme ressource externe. Aucune video
              n&apos;est telechargee.
            </p>
          </div>

          <div>
            <label
              htmlFor={`notes-${sessionId}`}
              className="block text-xs font-medium text-nuit-doux"
            >
              Notes
            </label>
            <Textarea id={`notes-${sessionId}`} name="notes" rows={2} className="mt-1" />
          </div>

          <SubmitButton taille="compact" libelleEnCours="Ajout...">
            Ajouter a ce creneau
          </SubmitButton>
        </form>
      ) : null}

      {autresCreneaux.length > 0 ? (
        <form action={actionCopie} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="communityId" value={communityId} />
          <input type="hidden" name="eventId" value={eventId} />
          <input type="hidden" name="cibleSessionId" value={sessionId} />
          <div className="min-w-0">
            <label
              htmlFor={`source-${sessionId}`}
              className="block text-xs font-medium text-nuit-doux"
            >
              Copier la liste d&apos;un autre creneau
            </label>
            <Select id={`source-${sessionId}`} name="sourceSessionId" className="mt-1">
              {autresCreneaux.map((creneau) => (
                <option key={creneau.id} value={creneau.id}>
                  {creneau.label}
                </option>
              ))}
            </Select>
          </div>
          <SubmitButton variante="secondaire" taille="compact" libelleEnCours="Copie...">
            <Copy aria-hidden="true" className="size-4" />
            Copier ici
          </SubmitButton>
          {etatCopie.status === "erreur" ? (
            <p className="w-full text-xs text-indispo-texte">{etatCopie.message}</p>
          ) : null}
        </form>
      ) : null}
    </div>
  );
}
