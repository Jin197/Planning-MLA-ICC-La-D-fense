"use client";

import { useActionState, useState } from "react";
import { Link2, Trash2, UserPlus, Users } from "lucide-react";
import {
  actionCreerEquipe,
  actionDetacherEquipe,
  actionEffectifEquipe,
  actionRattacherEquipe,
  actionRenommerEquipe,
  actionSupprimerEquipe,
} from "./actions";
import { ETAT_INITIAL } from "@/lib/form";
import { Button, SubmitButton } from "@/components/ui/button";
import {
  Alerte,
  Badge,
  Card,
  CardBody,
  CardHeader,
  Champ,
  EtatVide,
  Input,
  Select,
} from "@/components/ui/primitives";
import type { TeamView } from "@/server/services/events";

/**
 * Equipes de l'evenement.
 *
 * L'admin en cree autant qu'il veut, saisit leur effectif, et rattache
 * chacune soit a un sous-evenement precis, soit a toute la duree de
 * l'evenement. Une equipe n'existe que pour cet evenement : rien ne se
 * reporte sur le suivant.
 */

interface Occurrence {
  /** null = toute la duree de l'evenement. */
  sessionId: string | null;
  label: string;
}

interface MembreOption {
  membershipId: string;
  name: string;
}

export function EquipesAdmin({
  communityId,
  eventId,
  version,
  equipes,
  sousEvenements,
  membres,
}: {
  communityId: string;
  eventId: string;
  version: number;
  equipes: TeamView[];
  sousEvenements: Occurrence[];
  membres: MembreOption[];
}) {
  const [ouvert, setOuvert] = useState(equipes.length === 0);
  const [etat, action] = useActionState(actionCreerEquipe, ETAT_INITIAL);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          titre="Equipes de cet evenement"
          sousTitre="Creees ici, en nombre libre. Elles n'existent que pour cet evenement."
          actions={
            <Button
              variante="secondaire"
              taille="compact"
              onClick={() => setOuvert((o) => !o)}
              aria-expanded={ouvert}
            >
              <UserPlus aria-hidden="true" className="size-4" />
              {ouvert ? "Masquer" : "Nouvelle equipe"}
            </Button>
          }
        />
        {ouvert ? (
          <CardBody>
            <form action={action} className="space-y-4">
              <input type="hidden" name="communityId" value={communityId} />
              <input type="hidden" name="eventId" value={eventId} />
              <input type="hidden" name="version" value={version} />

              {etat.status !== "repos" ? (
                <Alerte ton={etat.status === "succes" ? "succes" : "erreur"}>
                  {etat.message}
                </Alerte>
              ) : null}

              <Champ label="Nom de l'equipe" htmlFor="equipe-nom" requis>
                <Input
                  id="equipe-nom"
                  name="nom"
                  required
                  maxLength={80}
                  defaultValue={
                    typeof etat.valeurs?.nom === "string" ? etat.valeurs.nom : ""
                  }
                  placeholder="Equipe 1, Groupe louange du soir, Pole technique..."
                />
              </Champ>

              <fieldset>
                <legend className="text-sm font-medium">Effectif</legend>
                <p className="mt-1 text-xs text-nuit-doux">
                  Les personnes de l&apos;equipe apparaissent en tete du choix
                  des candidats. Facultatif : vous pouvez composer plus tard.
                </p>
                <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                  {membres.map((membre) => (
                    <li key={membre.membershipId}>
                      <label className="flex min-h-11 items-center gap-2 rounded-[var(--radius-doux)] bg-ivoire-fonce/60 px-3 text-sm">
                        <input
                          type="checkbox"
                          name="membres"
                          value={membre.membershipId}
                          className="size-5"
                        />
                        {membre.name}
                      </label>
                    </li>
                  ))}
                </ul>
              </fieldset>

              {sousEvenements.length > 0 ? (
                <fieldset>
                  <legend className="text-sm font-medium">Rattachement</legend>
                  <p className="mt-1 text-xs text-nuit-doux">
                    Cochez les sous-evenements ou cette equipe sert. Sans
                    selection, elle couvre toute la duree de l&apos;evenement.
                  </p>
                  <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                    {sousEvenements.map((occurrence) => (
                      <li key={occurrence.sessionId}>
                        <label className="flex min-h-11 items-center gap-2 rounded-[var(--radius-doux)] bg-ivoire-fonce/60 px-3 text-sm">
                          <input
                            type="checkbox"
                            name="sessionIds"
                            value={occurrence.sessionId ?? ""}
                            className="size-5"
                          />
                          {occurrence.label}
                        </label>
                      </li>
                    ))}
                  </ul>
                </fieldset>
              ) : (
                <p className="text-xs text-nuit-doux">
                  Cet evenement n&apos;a pas de sous-evenement : l&apos;equipe
                  couvre toute sa duree.
                </p>
              )}

              <SubmitButton libelleEnCours="Creation...">
                Creer cette equipe
              </SubmitButton>
            </form>
          </CardBody>
        ) : null}
      </Card>

      {equipes.length === 0 ? (
        <EtatVide
          titre="Aucune equipe dans cet evenement"
          description="Creez-en une pour commencer : elle recevra la feuille de postes du modele sur chaque rattachement."
        />
      ) : (
        equipes.map((equipe) => (
          <FicheEquipe
            key={equipe.id}
            communityId={communityId}
            eventId={eventId}
            version={version}
            equipe={equipe}
            sousEvenements={sousEvenements}
            membres={membres}
          />
        ))
      )}
    </div>
  );
}

function FicheEquipe({
  communityId,
  eventId,
  version,
  equipe,
  sousEvenements,
  membres,
}: {
  communityId: string;
  eventId: string;
  version: number;
  equipe: TeamView;
  sousEvenements: Occurrence[];
  membres: MembreOption[];
}) {
  const [etatNom, actionNom] = useActionState(actionRenommerEquipe, ETAT_INITIAL);
  const [etatEffectif, actionEffectif] = useActionState(
    actionEffectifEquipe,
    ETAT_INITIAL,
  );
  const [etatRattacher, actionRattacher] = useActionState(
    actionRattacherEquipe,
    ETAT_INITIAL,
  );
  const [etatSuppression, actionSuppression] = useActionState(
    actionSupprimerEquipe,
    ETAT_INITIAL,
  );
  const [confirmer, setConfirmer] = useState(false);

  const champsCaches = (
    <>
      <input type="hidden" name="communityId" value={communityId} />
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="version" value={version} />
      <input type="hidden" name="teamId" value={equipe.id} />
    </>
  );

  // Une equipe peut etre rattachee a tout l'evenement, ou aux
  // sous-evenements ou elle n'est pas encore.
  const dejaRattachee = new Set(equipe.attachments.map((a) => a.sessionId));
  const cibles: Occurrence[] = [
    ...(dejaRattachee.has(null)
      ? []
      : [{ sessionId: null, label: "Toute la duree de l'evenement" }]),
    ...sousEvenements.filter((o) => !dejaRattachee.has(o.sessionId)),
  ];

  const messages = [etatNom, etatEffectif, etatRattacher, etatSuppression].find(
    (e) => e.status !== "repos",
  );

  return (
    <Card>
      <CardHeader
        titre={equipe.name}
        sousTitre={`${equipe.members.length} personne(s) dans l'effectif`}
        niveau={3}
        actions={
          <Badge ton={equipe.attachments.length === 0 ? "alerte" : "neutre"}>
            {equipe.attachments.length === 0
              ? "Sans rattachement"
              : `${equipe.attachments.length} rattachement(s)`}
          </Badge>
        }
      />
      <CardBody className="space-y-6">
        {messages ? (
          <Alerte ton={messages.status === "succes" ? "succes" : "erreur"}>
            {messages.message}
          </Alerte>
        ) : null}

        <form action={actionNom} className="flex flex-wrap items-end gap-3">
          {champsCaches}
          <div className="min-w-48 flex-1">
            <Champ label="Nom" htmlFor={`nom-${equipe.id}`} requis>
              <Input
                id={`nom-${equipe.id}`}
                name="nom"
                required
                defaultValue={equipe.name}
                maxLength={80}
              />
            </Champ>
          </div>
          <SubmitButton variante="secondaire" libelleEnCours="Enregistrement...">
            Renommer
          </SubmitButton>
        </form>

        <form action={actionEffectif} className="space-y-3">
          {champsCaches}
          <fieldset>
            <legend className="flex items-center gap-2 text-sm font-medium">
              <Users aria-hidden="true" className="size-4" />
              Effectif de l&apos;equipe
            </legend>
            <ul className="mt-2 grid gap-2 sm:grid-cols-2">
              {membres.map((membre) => (
                <li key={membre.membershipId}>
                  <label className="flex min-h-11 items-center gap-2 rounded-[var(--radius-doux)] bg-ivoire-fonce/60 px-3 text-sm">
                    <input
                      type="checkbox"
                      name="membres"
                      value={membre.membershipId}
                      className="size-5"
                      defaultChecked={equipe.members.some(
                        (m) => m.membershipId === membre.membershipId,
                      )}
                    />
                    {membre.name}
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
          <SubmitButton variante="secondaire" libelleEnCours="Enregistrement...">
            Enregistrer l&apos;effectif
          </SubmitButton>
        </form>

        <div className="space-y-3">
          <h4 className="flex items-center gap-2 text-sm font-medium">
            <Link2 aria-hidden="true" className="size-4" />
            Rattachements
          </h4>
          {equipe.attachments.length === 0 ? (
            <p className="text-sm text-alerte-texte">
              Cette equipe ne sert nulle part : rattachez-la pour pouvoir
              publier.
            </p>
          ) : (
            <ul className="space-y-2">
              {equipe.attachments.map((rattachement) => (
                <li
                  key={rattachement.planId}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-doux)] bg-ivoire-fonce/60 px-3 py-2 text-sm"
                >
                  <span>{rattachement.label}</span>
                  <BoutonDetacher
                    communityId={communityId}
                    eventId={eventId}
                    version={version}
                    planId={rattachement.planId}
                  />
                </li>
              ))}
            </ul>
          )}

          {cibles.length > 0 ? (
            <form action={actionRattacher} className="flex flex-wrap items-end gap-3">
              {champsCaches}
              <div className="min-w-56 flex-1">
                <Champ label="Rattacher a" htmlFor={`cible-${equipe.id}`} requis>
                  <Select id={`cible-${equipe.id}`} name="sessionId" required>
                    {cibles.map((cible) => (
                      <option
                        key={cible.sessionId ?? "evenement"}
                        value={cible.sessionId ?? ""}
                      >
                        {cible.label}
                      </option>
                    ))}
                  </Select>
                </Champ>
              </div>
              <SubmitButton variante="secondaire" libelleEnCours="Rattachement...">
                Rattacher
              </SubmitButton>
            </form>
          ) : null}
        </div>

        <div className="border-t border-bordure pt-4">
          {confirmer ? (
            <form action={actionSuppression} className="space-y-2">
              {champsCaches}
              <p className="text-sm text-indispo-texte">
                Supprimer « {equipe.name} » retire son effectif, ses
                rattachements et les affectations qui en dependent. Cette action
                ne se defait pas.
              </p>
              <div className="flex flex-wrap gap-2">
                <SubmitButton variante="danger" libelleEnCours="Suppression...">
                  Confirmer la suppression
                </SubmitButton>
                <Button variante="discret" onClick={() => setConfirmer(false)}>
                  Annuler
                </Button>
              </div>
            </form>
          ) : (
            <Button
              variante="discret"
              taille="compact"
              onClick={() => setConfirmer(true)}
            >
              <Trash2 aria-hidden="true" className="size-4" />
              Supprimer cette equipe
            </Button>
          )}
        </div>
      </CardBody>
    </Card>
  );
}

/**
 * Retrait d'un rattachement. Chaque bouton porte son propre etat d'action :
 * un echec sur l'un n'affiche pas de message sous les autres.
 */
function BoutonDetacher({
  communityId,
  eventId,
  version,
  planId,
}: {
  communityId: string;
  eventId: string;
  version: number;
  planId: string;
}) {
  const [etat, action] = useActionState(actionDetacherEquipe, ETAT_INITIAL);

  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="communityId" value={communityId} />
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="version" value={version} />
      <input type="hidden" name="planId" value={planId} />
      {etat.status === "erreur" ? (
        <span className="text-xs text-indispo-texte">{etat.message}</span>
      ) : null}
      <SubmitButton variante="discret" taille="compact" libelleEnCours="Retrait...">
        Retirer
      </SubmitButton>
    </form>
  );
}
