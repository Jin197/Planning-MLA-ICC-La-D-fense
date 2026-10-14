import Link from "next/link";
import { formatTime, localDayKey, localMonthName } from "@/lib/time";
import type { VuePlanning } from "@/server/services/planning-views";
import { Card, CardBody, CardHeader, Badge } from "@/components/ui/primitives";

/**
 * Calendrier mensuel. Sur telephone, la meme information est presentee en
 * liste de journees : la grille ne force jamais un defilement horizontal de
 * la page.
 */

const JOURS = ["lun", "mar", "mer", "jeu", "ven", "sam", "dim"] as const;

interface JourCellule {
  cle: string;
  jourDuMois: number;
  dansLeMois: boolean;
  evenements: {
    id: Id;
    title: string;
    heure: string;
    etat: string;
  }[];
}

type Id = string;

function construireMois(
  annee: number,
  mois: number,
  planning: VuePlanning,
): JourCellule[] {
  const premier = new Date(Date.UTC(annee, mois, 1));
  // Lundi = 0
  const decalage = (premier.getUTCDay() + 6) % 7;
  const debut = new Date(Date.UTC(annee, mois, 1 - decalage));

  const parJour = new Map<string, JourCellule["evenements"]>();
  for (const evenement of planning.evenements) {
    for (const creneau of evenement.creneaux) {
      const cle = localDayKey(creneau.startsAt, evenement.timezone);
      parJour.set(cle, [
        ...(parJour.get(cle) ?? []),
        {
          id: evenement.id,
          title: evenement.title,
          heure: creneau.scheduleProvisional
            ? "a definir"
            : formatTime(creneau.startsAt, evenement.timezone),
          etat: evenement.state,
        },
      ]);
    }
  }

  const cellules: JourCellule[] = [];
  for (let index = 0; index < 42; index += 1) {
    const jour = new Date(debut.getTime() + index * 86400000);
    const cle = `${jour.getUTCFullYear()}-${String(jour.getUTCMonth() + 1).padStart(2, "0")}-${String(jour.getUTCDate()).padStart(2, "0")}`;
    cellules.push({
      cle,
      jourDuMois: jour.getUTCDate(),
      dansLeMois: jour.getUTCMonth() === mois,
      evenements: parJour.get(cle) ?? [],
    });
  }
  return cellules;
}

export function VueCalendrier({ planning }: { planning: VuePlanning }) {
  const premierCreneau = planning.evenements[0]?.creneaux[0];
  const reference = premierCreneau ? new Date(premierCreneau.startsAt) : new Date();
  const annee = reference.getUTCFullYear();
  const mois = reference.getUTCMonth();
  const cellules = construireMois(annee, mois, planning);
  const titreMois = premierCreneau
    ? `${localMonthName(premierCreneau.startsAt, planning.timezone)} ${annee}`
    : `${annee}`;

  const joursAvecEvenements = cellules.filter(
    (c) => c.dansLeMois && c.evenements.length > 0,
  );

  return (
    <Card>
      <CardHeader
        titre={`Calendrier - ${titreMois}`}
        sousTitre="Les evenements sont places sur le jour local du creneau."
      />
      <CardBody>
        {/* Grille, a partir de la tablette */}
        <div className="hidden sm:block">
          <div className="grille-defilante">
            <table className="w-full min-w-[42rem] text-sm">
              <caption className="sr-only">
                Calendrier mensuel des evenements de la communaute
              </caption>
              <thead>
                <tr>
                  {JOURS.map((jour) => (
                    <th
                      key={jour}
                      scope="col"
                      className="border-b border-bordure px-2 py-2 text-left text-xs font-semibold uppercase text-nuit-doux"
                    >
                      {jour}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 6 }, (_, semaine) => (
                  <tr key={semaine}>
                    {cellules.slice(semaine * 7, semaine * 7 + 7).map((cellule) => (
                      <td
                        key={cellule.cle}
                        className={
                          cellule.dansLeMois
                            ? "h-24 border border-bordure align-top p-1.5"
                            : "h-24 border border-bordure bg-ivoire-fonce/50 align-top p-1.5 text-nuit-tres-doux"
                        }
                      >
                        <span className="text-xs font-medium">{cellule.jourDuMois}</span>
                        <ul className="mt-1 space-y-1">
                          {cellule.evenements.slice(0, 3).map((evenement, index) => (
                            <li key={`${evenement.id}-${index}`}>
                              <Link
                                href={`/c/${planning.communityId}/evenements/${evenement.id}`}
                                className="block truncate rounded bg-indigo-clair px-1.5 py-0.5 text-[0.7rem] text-indigo-fonce"
                                title={`${evenement.title} - ${evenement.heure}`}
                              >
                                {evenement.heure} {evenement.title}
                              </Link>
                            </li>
                          ))}
                          {cellule.evenements.length > 3 ? (
                            <li className="text-[0.7rem] text-nuit-doux">
                              +{cellule.evenements.length - 3} autre(s)
                            </li>
                          ) : null}
                        </ul>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Cartes, sur telephone */}
        <ul className="space-y-3 sm:hidden">
          {joursAvecEvenements.length === 0 ? (
            <li className="text-sm text-nuit-doux">Aucun evenement ce mois-ci.</li>
          ) : (
            joursAvecEvenements.map((cellule) => (
              <li
                key={cellule.cle}
                className="rounded-[var(--radius-doux)] border border-bordure p-3"
              >
                <p className="text-sm font-semibold">
                  {new Intl.DateTimeFormat("fr-FR", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                    timeZone: planning.timezone,
                  }).format(new Date(`${cellule.cle}T12:00:00.000Z`))}
                </p>
                <ul className="mt-2 space-y-2">
                  {cellule.evenements.map((evenement, index) => (
                    <li key={`${evenement.id}-${index}`}>
                      <Link
                        href={`/c/${planning.communityId}/evenements/${evenement.id}`}
                        className="flex items-center justify-between gap-2 rounded-[var(--radius-doux)] bg-ivoire-fonce px-3 py-2 text-sm"
                      >
                        <span className="min-w-0 truncate">{evenement.title}</span>
                        <Badge ton="indigo">{evenement.heure}</Badge>
                      </Link>
                    </li>
                  ))}
                </ul>
              </li>
            ))
          )}
        </ul>
      </CardBody>
    </Card>
  );
}
