"use client";

import { useActionState, useEffect, useId, useState, useTransition } from "react";
import { Search, UserPlus } from "lucide-react";
import { actionAffecter, chargerCandidats } from "./actions";
import { ETAT_INITIAL } from "@/lib/form";
import { describeConflict } from "@/domain/conflicts";
import type { CandidateView } from "@/server/services/assignments";
import { Button, SubmitButton } from "@/components/ui/button";
import { Alerte, Avatar, Badge, Input } from "@/components/ui/primitives";
import { BadgeDisponibilite } from "@/components/app/status-badges";

/**
 * Selecteur de membres pour un poste.
 *
 * Par defaut : membres actifs, disponibles et compatibles. Le filtre
 * « Tous les membres » retrouve les personnes sans reponse ou indisponibles,
 * et toute affectation par exception demande une confirmation et un motif.
 */
export function SelecteurMembre({
  communityId,
  eventId,
  slotId,
  slotLabel,
  autoriseDetail,
}: {
  communityId: string;
  eventId: string;
  slotId: string;
  slotLabel: string;
  autoriseDetail: boolean;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [tous, setTous] = useState(false);
  const [recherche, setRecherche] = useState("");
  const [candidats, setCandidats] = useState<CandidateView[]>([]);
  const [erreurChargement, setErreurChargement] = useState<string | null>(null);
  const [chargement, demarrer] = useTransition();
  const [etat, action] = useActionState(actionAffecter, ETAT_INITIAL);
  const [choisi, setChoisi] = useState<CandidateView | null>(null);
  const panneauId = useId();

  useEffect(() => {
    if (!ouvert) return;
    demarrer(async () => {
      const resultat = await chargerCandidats(communityId, slotId, {
        tous,
        recherche,
      });
      if (resultat.ok) {
        setCandidats(resultat.candidats);
        setErreurChargement(null);
      } else {
        setCandidats([]);
        setErreurChargement(resultat.message);
      }
    });
  }, [ouvert, tous, recherche, communityId, slotId]);

  // Une affectation reussie referme le panneau.
  useEffect(() => {
    if (etat.status === "succes") {
      setChoisi(null);
      setOuvert(false);
    }
  }, [etat.status]);

  const exceptionRequise =
    choisi !== null &&
    (choisi.availability !== "disponible" ||
      !choisi.matchesSkills ||
      choisi.conflicts.length > 0);

  return (
    <div className="mt-2">
      <Button
        variante="secondaire"
        taille="compact"
        onClick={() => setOuvert((o) => !o)}
        aria-expanded={ouvert}
        aria-controls={panneauId}
      >
        <UserPlus aria-hidden="true" className="size-4" />
        Affecter sur « {slotLabel} »
      </Button>

      {etat.status === "succes" ? (
        <Alerte ton="succes" className="mt-2">
          {etat.message}
        </Alerte>
      ) : null}

      {ouvert ? (
        <div
          id={panneauId}
          className="mt-3 rounded-[var(--radius-doux)] bg-ivoire-fonce/40 p-3"
        >
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-0 flex-1">
              <label
                htmlFor={`recherche-${slotId}`}
                className="block text-xs font-medium text-nuit-doux"
              >
                Rechercher une personne
              </label>
              <div className="relative mt-1">
                <Search
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-nuit-tres-doux"
                />
                <Input
                  id={`recherche-${slotId}`}
                  value={recherche}
                  onChange={(event) => setRecherche(event.target.value)}
                  className="pl-9"
                  placeholder="Prenom ou nom"
                />
              </div>
            </div>
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={tous}
                onChange={(event) => setTous(event.target.checked)}
                className="size-5"
              />
              Tous les membres
            </label>
          </div>

          <p className="mt-2 text-xs text-nuit-doux">
            {tous
              ? "Toutes les personnes actives, y compris sans reponse ou indisponibles."
              : "Membres actifs, disponibles et compatibles avec ce poste."}
          </p>

          {erreurChargement ? (
            <Alerte ton="erreur" className="mt-3">
              {erreurChargement}
            </Alerte>
          ) : null}

          <div aria-live="polite" className="mt-3">
            {chargement ? (
              <p className="text-sm text-nuit-doux">Chargement des candidats...</p>
            ) : candidats.length === 0 ? (
              <p className="text-sm text-nuit-doux">
                Aucune personne ne correspond.{" "}
                {!tous ? "Cochez « Tous les membres » pour elargir." : ""}
              </p>
            ) : (
              <ul className="max-h-80 space-y-2 overflow-y-auto">
                {candidats.map((candidat) => (
                  <li key={candidat.membershipId}>
                    <button
                      type="button"
                      onClick={() => setChoisi(candidat)}
                      aria-pressed={choisi?.membershipId === candidat.membershipId}
                      className={`flex w-full items-start gap-3 rounded-[var(--radius-doux)] border px-3 py-2 text-left ${
                        choisi?.membershipId === candidat.membershipId
                          ? "border-indigo-accent bg-indigo-clair"
                          : "border-bordure bg-surface"
                      }`}
                    >
                      <Avatar initiales={candidat.initials} nom={candidat.name} />
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">{candidat.name}</span>
                        <span className="mt-1 flex flex-wrap gap-1.5">
                          <BadgeDisponibilite etat={candidat.availability} />
                          {candidat.matchesSkills ? (
                            <Badge ton="indigo">Competence declaree</Badge>
                          ) : (
                            <Badge ton="attente">Hors competence declaree</Badge>
                          )}
                          {candidat.alreadyOnThisSlot ? (
                            <Badge ton="indispo">Deja sur ce poste</Badge>
                          ) : null}
                          {candidat.otherRolesThisSession.map((role) => (
                            <Badge key={role} ton="neutre">
                              Aussi : {role}
                            </Badge>
                          ))}
                          {candidat.incompatible.length > 0 ? (
                            <Badge ton="alerte">
                              Incompatibilite : {candidat.incompatible[0]?.join(" + ")}
                            </Badge>
                          ) : null}
                          {candidat.conflicts.map((conflit, index) => (
                            <Badge key={index} ton="alerte">
                              {describeConflict(conflit)}
                            </Badge>
                          ))}
                        </span>
                        {candidat.skills.length > 0 ? (
                          <span className="mt-1 block text-xs text-nuit-doux">
                            Competences : {candidat.skills.join(", ")}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {choisi ? (
            <form action={action} className="mt-4 space-y-3 border-t border-bordure pt-3">
              <input type="hidden" name="communityId" value={communityId} />
              <input type="hidden" name="eventId" value={eventId} />
              <input type="hidden" name="slotId" value={slotId} />
              <input type="hidden" name="membershipId" value={choisi.membershipId} />

              <p className="text-sm">
                Affecter <strong>{choisi.name}</strong> au poste{" "}
                <strong>{slotLabel}</strong>.
              </p>

              {etat.status === "erreur" ? (
                <Alerte ton="erreur" titre="Affectation non enregistree">
                  {etat.message}
                </Alerte>
              ) : null}

              {autoriseDetail ? (
                <div>
                  <label
                    htmlFor={`detail-${slotId}`}
                    className="block text-xs font-medium text-nuit-doux"
                  >
                    Precision (pupitre tenu, groupe accompagne...)
                  </label>
                  <Input
                    id={`detail-${slotId}`}
                    name="detail"
                    className="mt-1"
                    placeholder="alto"
                  />
                </div>
              ) : null}

              {exceptionRequise ? (
                <div className="space-y-2 rounded-[var(--radius-doux)] border border-alerte-texte/30 bg-alerte-fond p-3">
                  <p className="text-sm font-medium text-alerte-texte">
                    Affectation par exception
                  </p>
                  <ul className="list-inside list-disc text-sm text-alerte-texte">
                    {choisi.availability !== "disponible" ? (
                      <li>
                        Disponibilite : {choisi.availability.replace("_", " ")}. Sa
                        reponse ne sera pas modifiee.
                      </li>
                    ) : null}
                    {!choisi.matchesSkills ? (
                      <li>
                        Ce poste ne figure pas dans ses competences declarees. La
                        qualification n&apos;est pas verifiee automatiquement.
                      </li>
                    ) : null}
                    {choisi.conflicts.length > 0 ? (
                      <li>Un chevauchement est detecte sur ce creneau.</li>
                    ) : null}
                  </ul>
                  <div>
                    <label
                      htmlFor={`motif-${slotId}`}
                      className="block text-xs font-medium text-alerte-texte"
                    >
                      Motif administratif
                    </label>
                    <Input
                      id={`motif-${slotId}`}
                      name="motifAdministratif"
                      className="mt-1"
                      placeholder="Accord obtenu par telephone"
                      required={choisi.availability !== "disponible"}
                    />
                  </div>
                  <label className="flex items-start gap-2 text-sm text-alerte-texte">
                    <input
                      type="checkbox"
                      name="accepterExceptions"
                      required
                      className="mt-1 size-5"
                    />
                    <span>
                      J&apos;ai vu ces alertes et j&apos;affecte quand meme. La
                      personne sera informee et devra confirmer.
                    </span>
                  </label>
                </div>
              ) : (
                <input type="hidden" name="accepterExceptions" value="on" />
              )}

              <div className="flex flex-wrap gap-2">
                <SubmitButton taille="compact" libelleEnCours="Affectation...">
                  Confirmer l&apos;affectation
                </SubmitButton>
                <Button
                  variante="discret"
                  taille="compact"
                  onClick={() => setChoisi(null)}
                >
                  Annuler
                </Button>
              </div>
            </form>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
