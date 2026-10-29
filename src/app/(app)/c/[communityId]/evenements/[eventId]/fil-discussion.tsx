"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { PencilLine, Pin, ShieldAlert } from "lucide-react";
import {
  actionEnvoyerMessage,
  actionEpingler,
  actionMarquerLu,
  actionModerer,
  actionModifierMessage,
} from "./actions";
import { ETAT_INITIAL } from "@/lib/form";
import type { ThreadPage } from "@/server/services/messages";
import { Avatar, Alerte, Badge, Textarea } from "@/components/ui/primitives";
import { Button, SubmitButton } from "@/components/ui/button";

/**
 * Fil de discussion. Le contenu vient de la base ; l'interface se contente de
 * l'afficher et de marquer la lecture.
 */
/**
 * Edition d'un message par son auteur. Un admin ne passe pas par ici : la
 * moderation est une action distincte, qui laisse une trace.
 */
function EditionMessage({
  communityId,
  eventId,
  messageId,
  corps,
}: {
  communityId: string;
  eventId: string;
  messageId: string;
  corps: string;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [etat, action] = useActionState(actionModifierMessage, ETAT_INITIAL);

  // Un enregistrement reussi referme le formulaire : le message modifie
  // s'affiche alors a sa place.
  useEffect(() => {
    if (etat.status === "succes") setOuvert(false);
  }, [etat.status]);

  if (!ouvert) {
    return (
      <div className="mt-1">
        <Button
          variante="discret"
          taille="compact"
          onClick={() => setOuvert(true)}
          aria-label="Modifier mon message"
        >
          <PencilLine aria-hidden="true" className="size-4" />
          Modifier
        </Button>
        {etat.status === "succes" ? (
          <p className="mt-1 text-xs text-dispo-texte">{etat.message}</p>
        ) : null}
      </div>
    );
  }

  return (
    <form action={action} className="mt-2 space-y-2">
      <input type="hidden" name="communityId" value={communityId} />
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="messageId" value={messageId} />

      {etat.status === "erreur" ? (
        <Alerte ton="erreur">{etat.message}</Alerte>
      ) : null}

      <label htmlFor={`corps-${messageId}`} className="sr-only">
        Nouveau texte du message
      </label>
      <Textarea
        id={`corps-${messageId}`}
        name="corps"
        rows={3}
        required
        maxLength={4000}
        defaultValue={etat.valeurs?.corps ?? corps}
      />
      <div className="flex flex-wrap gap-2">
        <SubmitButton taille="compact" libelleEnCours="Enregistrement...">
          Enregistrer
        </SubmitButton>
        <Button variante="discret" taille="compact" onClick={() => setOuvert(false)}>
          Annuler
        </Button>
      </div>
    </form>
  );
}

export function FilDiscussion({
  communityId,
  eventId,
  fil,
  estAdmin,
}: {
  communityId: string;
  eventId: string;
  fil: ThreadPage;
  estAdmin: boolean;
}) {
  const [etat, action] = useActionState(actionEnvoyerMessage, ETAT_INITIAL);
  const [, actionPin] = useActionState(actionEpingler, ETAT_INITIAL);
  const [etatModeration, actionModeration] = useActionState(
    actionModerer,
    ETAT_INITIAL,
  );
  const dejaMarque = useRef(false);

  // La position de lecture est enregistree une fois le fil affiche.
  useEffect(() => {
    if (dejaMarque.current || fil.unread === 0) return;
    dejaMarque.current = true;
    void actionMarquerLu(communityId, eventId);
  }, [communityId, eventId, fil.unread]);

  const epingle = fil.messages.find((m) => m.pinned);

  return (
    <div className="space-y-5">
      {epingle ? (
        <div className="rounded-[var(--radius-doux)] border border-secondaire/30 bg-secondaire-pale px-4 py-3">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-secondaire">
            <Pin aria-hidden="true" className="size-3.5" />
            Annonce epinglee
          </p>
          <p className="mt-1 whitespace-pre-line text-sm">{epingle.body}</p>
          <p className="mt-1 text-xs text-nuit-doux">par {epingle.authorName}</p>
        </div>
      ) : null}

      {etatModeration.status === "succes" ? (
        <Alerte ton="succes">{etatModeration.message}</Alerte>
      ) : null}

      <ol className="space-y-4">
        {fil.messages.map((message) => (
          <li key={message.id} className="flex gap-3">
            <Avatar initiales={message.authorInitials} nom={message.authorName} />
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium">{message.authorName}</span>
                <span className="text-xs text-nuit-tres-doux">
                  {new Intl.DateTimeFormat("fr-FR", {
                    day: "2-digit",
                    month: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false,
                  }).format(new Date(message.createdAt))}
                </span>
                {message.editedAt ? (
                  <span className="text-xs text-nuit-tres-doux">modifie</span>
                ) : null}
                {message.moderated ? (
                  <Badge ton="indispo" icone={<ShieldAlert className="size-3" />}>
                    Modere
                  </Badge>
                ) : null}
                {message.pinned ? <Badge ton="secondaire">Epingle</Badge> : null}
              </p>
              <p className="mt-1 whitespace-pre-line break-words">{message.body}</p>

              {message.isMine && !message.moderated && fil.canWrite ? (
                <EditionMessage
                  communityId={communityId}
                  eventId={eventId}
                  messageId={message.id}
                  corps={message.body}
                />
              ) : null}

              {estAdmin ? (
                <div className="mt-2 flex flex-wrap gap-3">
                  <form action={actionPin}>
                    <input type="hidden" name="communityId" value={communityId} />
                    <input type="hidden" name="eventId" value={eventId} />
                    <input type="hidden" name="messageId" value={message.id} />
                    <input
                      type="hidden"
                      name="epingle"
                      value={message.pinned ? "false" : "on"}
                    />
                    <SubmitButton variante="discret" taille="compact" libelleEnCours="...">
                      {message.pinned ? "Desepingler" : "Epingler"}
                    </SubmitButton>
                  </form>
                  {!message.moderated ? (
                    <form action={actionModeration} className="flex items-end gap-2">
                      <input type="hidden" name="communityId" value={communityId} />
                      <input type="hidden" name="eventId" value={eventId} />
                      <input type="hidden" name="messageId" value={message.id} />
                      <input
                        type="hidden"
                        name="note"
                        value="Retire par la moderation"
                      />
                      <SubmitButton
                        variante="discret"
                        taille="compact"
                        libelleEnCours="..."
                      >
                        Moderer
                      </SubmitButton>
                    </form>
                  ) : null}
                </div>
              ) : null}
            </div>
          </li>
        ))}
      </ol>

      {fil.nextCursor ? (
        <p className="text-sm text-nuit-doux">
          Les messages plus anciens sont charges par page de 30.
        </p>
      ) : null}

      {fil.canWrite ? (
        <form action={action} className="space-y-3 border-t border-bordure pt-4">
          <input type="hidden" name="communityId" value={communityId} />
          <input type="hidden" name="eventId" value={eventId} />

          {etat.status === "erreur" ? (
            <Alerte ton="erreur" titre="Message non envoye">
              {etat.message}
            </Alerte>
          ) : null}

          <div>
            <label htmlFor="corps" className="block text-sm font-medium">
              Votre message
            </label>
            <Textarea
              id="corps"
              name="corps"
              rows={3}
              required
              maxLength={4000}
              className="mt-1.5"
              defaultValue={etat.valeurs?.corps ?? ""}
              placeholder="Une information utile pour l'equipe..."
            />
          </div>

          {fil.mentionables.length > 0 ? (
            <details className="rounded-[var(--radius-doux)] bg-ivoire-fonce/60 px-3 py-2">
              <summary className="cursor-pointer text-sm">
                Mentionner des membres ({fil.mentionables.length})
              </summary>
              <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
                {fil.mentionables.map((membre) => (
                  <li key={membre.userId}>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        name="mentions"
                        value={membre.userId}
                        className="size-5"
                      />
                      {membre.name}
                    </label>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}

          <SubmitButton libelleEnCours="Envoi...">Envoyer</SubmitButton>
        </form>
      ) : (
        <Alerte ton="info" titre="Lecture seule">
          Cette discussion est fermee a l&apos;ecriture dans l&apos;etat actuel de
          l&apos;evenement.
        </Alerte>
      )}
    </div>
  );
}
