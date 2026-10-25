"use client";

import { useActionState, useState } from "react";
import { actionChangerEtat, actionDupliquer } from "./actions";
import { ETAT_INITIAL } from "@/lib/form";
import type { EventDetail } from "@/server/services/events";
import { SubmitButton } from "@/components/ui/button";
import {
  Alerte,
  Badge,
  Card,
  CardBody,
  CardHeader,
  Champ,
  Input,
} from "@/components/ui/primitives";

/**
 * Panneau d'administration : controles avant publication, changements d'etat
 * et duplication. Une publication avec alertes demande une confirmation
 * explicite et conserve les alertes dans le journal.
 */
export function PanneauPublication({
  communityId,
  vue,
  conflits,
}: {
  communityId: string;
  vue: EventDetail;
  conflits: number;
}) {
  const [etat, action] = useActionState(actionChangerEtat, ETAT_INITIAL);
  const [etatCopie, actionCopie] = useActionState(actionDupliquer, ETAT_INITIAL);
  const [accepter, setAccepter] = useState(false);
  const readiness = vue.readiness;
  const bloquants = (readiness?.blockers ?? []).filter(
    (b) => b.severity === "bloquant",
  );
  const alertes = (readiness?.blockers ?? []).filter((b) => b.severity === "alerte");

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          titre="Avant publication"
          sousTitre="Postes a completer, reponses manquantes, affectations non confirmees et conflits."
        />
        <CardBody className="space-y-4">
          {etat.status === "succes" ? (
            <Alerte ton="succes">{etat.message}</Alerte>
          ) : null}
          {etat.status === "erreur" ? (
            <Alerte ton="erreur" titre="Action impossible">
              {etat.message}
            </Alerte>
          ) : null}

          {bloquants.length === 0 && alertes.length === 0 && conflits === 0 ? (
            <Alerte ton="succes" titre="Pret a publier">
              Aucun point bloquant. Les postes facultatifs non utilises ne
              rendent pas le planning incomplet.
            </Alerte>
          ) : (
            <ul className="space-y-2">
              {bloquants.map((blocage) => (
                <li key={blocage.code}>
                  <Alerte ton="erreur" titre="Bloquant">
                    {blocage.message}
                  </Alerte>
                </li>
              ))}
              {alertes.map((alerte) => (
                <li key={alerte.code}>
                  <Alerte ton="attention" titre="Alerte">
                    {alerte.message}
                  </Alerte>
                </li>
              ))}
              {conflits > 0 ? (
                <li>
                  <Alerte ton="attention" titre="Chevauchements">
                    {conflits} personne(s) affectee(s) ont un chevauchement sur
                    leur creneau. Hors de cette communaute, seul « Conflit sur ce
                    creneau » est indique.
                  </Alerte>
                </li>
              ) : null}
            </ul>
          )}

          <form action={action} className="space-y-3">
            <input type="hidden" name="communityId" value={communityId} />
            <input type="hidden" name="eventId" value={vue.event.id} />
            <input type="hidden" name="version" value={vue.event.version} />

            {alertes.length > 0 || conflits > 0 ? (
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  name="accepterExceptions"
                  checked={accepter}
                  onChange={(event) => setAccepter(event.target.checked)}
                  className="mt-1 size-5"
                />
                <span>
                  Je publie malgre ces alertes. Elles restent visibles et tracees.
                </span>
              </label>
            ) : (
              <input type="hidden" name="accepterExceptions" value="on" />
            )}

            <div className="flex flex-wrap gap-2">
              {vue.event.state === "brouillon" ? (
                <SubmitButton name="cible" value="collecte" variante="secondaire">
                  Ouvrir la collecte
                </SubmitButton>
              ) : null}
              {vue.event.state !== "publie" &&
              vue.event.state !== "annule" &&
              vue.event.state !== "archive" ? (
                <SubmitButton
                  name="cible"
                  value="publie"
                  libelleEnCours="Publication..."
                  disabled={
                    bloquants.length > 0 ||
                    ((alertes.length > 0 || conflits > 0) && !accepter)
                  }
                >
                  Publier le planning
                </SubmitButton>
              ) : null}
              {vue.event.state === "publie" ? (
                <SubmitButton
                  name="cible"
                  value="publie"
                  libelleEnCours="Publication..."
                  variante="secondaire"
                  disabled={
                    bloquants.length > 0 ||
                    ((alertes.length > 0 || conflits > 0) && !accepter)
                  }
                >
                  Republier (nouvelle version)
                </SubmitButton>
              ) : null}
              {vue.event.state === "publie" || vue.event.state === "annule" ? (
                <SubmitButton name="cible" value="archive" variante="secondaire">
                  Archiver
                </SubmitButton>
              ) : null}
            </div>

            {vue.event.state !== "annule" && vue.event.state !== "archive" ? (
              <div className="rounded-[var(--radius-doux)] bg-ivoire-fonce/60 p-3">
                <Champ
                  label="Motif d'annulation"
                  htmlFor="motif"
                  aide="Transmis aux personnes concernees."
                >
                  <Input id="motif" name="motif" placeholder="Salle indisponible" />
                </Champ>
                <div className="mt-3">
                  <SubmitButton
                    name="cible"
                    value="annule"
                    variante="danger"
                    taille="compact"
                    libelleEnCours="Annulation..."
                  >
                    Annuler l&apos;evenement
                  </SubmitButton>
                </div>
              </div>
            ) : null}
          </form>

          <p className="text-xs text-nuit-doux">
            Version actuelle du document : {vue.event.version}. Si un autre admin
            modifie l&apos;evenement entre-temps, l&apos;enregistrement est refuse
            au lieu d&apos;ecraser son travail.
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          titre="Dupliquer"
          sousTitre="La copie ne reprend jamais les disponibilites ni les confirmations des membres."
        />
        <CardBody>
          {etatCopie.status === "erreur" ? (
            <Alerte ton="erreur" className="mb-3">
              {etatCopie.message}
            </Alerte>
          ) : null}
          <form action={actionCopie} className="space-y-4">
            <input type="hidden" name="communityId" value={communityId} />
            <input type="hidden" name="eventId" value={vue.event.id} />

            <div className="grid gap-4 sm:grid-cols-2">
              <Champ label="Titre de la copie" htmlFor="titre">
                <Input
                  id="titre"
                  name="titre"
                  placeholder={`${vue.event.title} (copie)`}
                />
              </Champ>
              <Champ
                label="Decalage en jours"
                htmlFor="decalage"
                aide="7 pour le dimanche suivant."
              >
                <Input
                  id="decalage"
                  name="decalage"
                  type="number"
                  defaultValue={7}
                  min={-365}
                  max={365}
                />
              </Champ>
            </div>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">A reprendre</legend>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="chants" defaultChecked className="size-5" />
                Liste de chants
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="dressCode" defaultChecked className="size-5" />
                Dress-code
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="repetitions" className="size-5" />
                Repetitions (dates decalees)
              </label>
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" name="affectations" className="mt-1 size-5" />
                <span>
                  Affectations. Action explicite : elles reviennent toutes a
                  « A confirmer ».
                </span>
              </label>
            </fieldset>

            <SubmitButton variante="secondaire" libelleEnCours="Duplication...">
              Dupliquer en brouillon
            </SubmitButton>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader titre="Etat du document" />
        <CardBody className="flex flex-wrap gap-2">
          <Badge ton="neutre">Version {vue.event.version}</Badge>
          <Badge ton="neutre">Publications : {vue.event.publishedVersion}</Badge>
          <Badge ton="neutre">{vue.sessions.length} creneau(x)</Badge>
          <Badge ton="neutre">{vue.rehearsals.length} repetition(s)</Badge>
        </CardBody>
      </Card>
    </div>
  );
}
