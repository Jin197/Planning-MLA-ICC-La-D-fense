import { SUGGESTED_EXTRA_ROLES } from "@/domain/template";
import type { PlanView } from "@/server/services/events";
import { Avatar, Badge } from "@/components/ui/primitives";
import { BadgeAffectation } from "@/components/app/status-badges";
import { SelecteurMembre } from "./selecteur-membre";
import { BoutonRetirerAffectation, ReglagesPoste } from "./poste-admin";
import { AjouterPoste } from "./ajouter-poste";

/**
 * Feuille de postes d'une equipe sur une occurrence. Les postes sont ceux
 * copies du modele au moment du rattachement : les renommer ou les desactiver
 * ici ne touche pas au modele de la communaute.
 */
export function FeuillePostes({
  communityId,
  eventId,
  plan,
  estAdmin,
}: {
  communityId: string;
  eventId: string;
  plan: PlanView;
  estAdmin: boolean;
}) {
  return (
    <section
      aria-labelledby={`plan-${plan.id}`}
      className="rounded-[var(--radius-carte)] bg-ivoire-fonce/60"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-bordure bg-ivoire-fonce/50 px-4 py-2.5">
        <h3 id={`plan-${plan.id}`} className="font-medium">
          {plan.teamName}
        </h3>
        <Badge ton="neutre">
          {plan.slots.filter((s) => s.incomplete).length} poste(s) a completer
        </Badge>
      </div>

      <ul className="divide-y divide-bordure">
        {plan.slots.map((slot) => (
          <li key={slot.id} className="px-4 py-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium">
                  {slot.label}
                  {!slot.enabled ? (
                    <Badge ton="neutre" className="ml-2">
                      Non utilise
                    </Badge>
                  ) : slot.minRequired === 0 ? (
                    <Badge ton="neutre" className="ml-2">
                      Facultatif
                    </Badge>
                  ) : (
                    <span className="ml-2 text-xs font-normal text-nuit-doux">
                      minimum {slot.minRequired}
                    </span>
                  )}
                </p>
                {slot.incomplete ? (
                  <p className="mt-1 text-xs text-alerte-texte">
                    {slot.missing} personne(s) manquante(s)
                  </p>
                ) : null}
              </div>
              {estAdmin ? (
                <ReglagesPoste
                  communityId={communityId}
                  eventId={eventId}
                  slotId={slot.id}
                  label={slot.label}
                  minRequired={slot.minRequired}
                  enabled={slot.enabled}
                />
              ) : null}
            </div>

            {slot.assignments.length > 0 ? (
              <ul className="mt-3 space-y-2">
                {slot.assignments.map((affectation) => (
                  <li
                    key={affectation.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-doux)] bg-ivoire-fonce/60 px-3 py-2"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <Avatar
                        initiales={affectation.initials}
                        nom={affectation.name}
                        taille="petit"
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">
                          {affectation.name}
                          {affectation.detail ? (
                            <span className="font-normal text-nuit-doux">
                              {" "}
                              ({affectation.detail})
                            </span>
                          ) : null}
                        </span>
                        {affectation.exceptions.length > 0 ? (
                          <span className="block text-xs text-alerte-texte">
                            Exception :{" "}
                            {affectation.exceptions
                              .map((e) => e.kind.replace("_", " "))
                              .join(", ")}
                            {affectation.exceptions[0]?.reason
                              ? ` - ${affectation.exceptions[0].reason}`
                              : ""}
                          </span>
                        ) : null}
                      </span>
                    </span>
                    <span className="flex items-center gap-2">
                      <BadgeAffectation etat={affectation.state} />
                      {estAdmin ? (
                        <BoutonRetirerAffectation
                          communityId={communityId}
                          eventId={eventId}
                          assignmentId={affectation.id}
                          nom={affectation.name}
                        />
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-nuit-doux">
                Personne sur ce poste pour l&apos;instant.
              </p>
            )}

            {estAdmin && slot.enabled ? (
              <SelecteurMembre
                communityId={communityId}
                eventId={eventId}
                slotId={slot.id}
                slotLabel={slot.label}
                autoriseDetail={slot.allowsDetail}
              />
            ) : null}
          </li>
        ))}
      </ul>

      {estAdmin ? (
        <div className="border-t border-bordure px-4 py-3">
          <AjouterPoste
            communityId={communityId}
            eventId={eventId}
            planId={plan.id}
            suggestions={SUGGESTED_EXTRA_ROLES}
          />
        </div>
      ) : null}
    </section>
  );
}
