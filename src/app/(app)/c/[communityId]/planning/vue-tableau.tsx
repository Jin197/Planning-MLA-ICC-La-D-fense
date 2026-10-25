import { AVAILABILITY_LABELS } from "@/domain/availability";
import { formatDateShort, formatTime } from "@/lib/time";
import type { VuePlanning } from "@/server/services/planning-views";
import { Avatar, Badge, EtatVide } from "@/components/ui/primitives";
import { BadgeDisponibilite } from "@/components/app/status-badges";

/**
 * Tableau annuaire x creneaux, dans l'esprit du classeur d'origine.
 *
 * La grille defile dans son propre conteneur, avec en-tetes figees. Sur
 * telephone, le meme contenu est presente en cartes.
 */
export function VueTableau({ planning }: { planning: VuePlanning }) {
  if (planning.colonnes.length === 0) {
    return (
      <EtatVide
        titre="Aucun creneau publie ou en collecte"
        description="Le tableau se remplit des qu'un evenement ouvre la collecte des disponibilites."
      />
    );
  }

  return (
    <>
      <div className="hidden lg:block">
        <div className="grille-defilante">
          <table className="min-w-max text-sm">
            <caption className="sr-only">
              Disponibilites par personne et par creneau
            </caption>
            <thead>
              <tr>
                <th
                  scope="col"
                  className="colonne-figee border-b border-r border-bordure px-3 py-2 text-left"
                >
                  Personne
                </th>
                {planning.colonnes.map((colonne) => (
                  <th
                    key={colonne.cle}
                    scope="col"
                    className="border-b border-bordure px-3 py-2 text-left align-bottom"
                  >
                    <span className="block text-xs font-normal text-nuit-doux">
                      {formatDateShort(colonne.startsAt, planning.timezone)}
                    </span>
                    <span className="block whitespace-nowrap">{colonne.label}</span>
                    <span className="block text-xs font-normal text-nuit-tres-doux">
                      {formatTime(colonne.startsAt, planning.timezone)}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {planning.lignes.map((ligne) => (
                <tr key={ligne.membershipId} className="even:bg-ivoire-fonce/40">
                  <th
                    scope="row"
                    className="colonne-figee border-b border-r border-bordure px-3 py-2 text-left font-normal"
                  >
                    <span className="flex items-center gap-2">
                      <Avatar
                        initiales={ligne.initiales}
                        nom={ligne.nom}
                        taille="petit"
                      />
                      <span className="min-w-0">
                        <span className="block whitespace-nowrap font-medium">
                          {ligne.nom}
                        </span>
                        {ligne.competences.length > 0 ? (
                          <span className="block text-xs text-nuit-doux">
                            {ligne.competences.join(", ")}
                          </span>
                        ) : null}
                      </span>
                    </span>
                  </th>
                  {planning.colonnes.map((colonne) => {
                    const cellule = ligne.cellules[colonne.cle];
                    return (
                      <td
                        key={colonne.cle}
                        className="border-b border-bordure px-3 py-2 align-top"
                      >
                        <span className="flex flex-col items-start gap-1">
                          <BadgeDisponibilite
                            etat={cellule?.disponibilite ?? "a_renseigner"}
                          />
                          {(cellule?.postes ?? []).map((poste, index) => (
                            <Badge key={`${poste}-${index}`} ton="indigo">
                              {poste}
                            </Badge>
                          ))}
                          {cellule?.motif ? (
                            <span className="text-xs text-nuit-doux">
                              Motif : {cellule.motif}
                            </span>
                          ) : null}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-nuit-doux">
          « {AVAILABILITY_LABELS.a_renseigner} » signifie qu&apos;aucune reponse
          n&apos;a ete donnee : ce n&apos;est ni une disponibilite, ni une
          indisponibilite.
        </p>
      </div>

      {/* Cartes pour les petits ecrans : meme contenu, sans grille. */}
      <ul className="space-y-3 lg:hidden">
        {planning.lignes.map((ligne) => (
          <li
            key={ligne.membershipId}
            className="rounded-[var(--radius-doux)] bg-ivoire-fonce/60 p-3"
          >
            <div className="flex items-center gap-2">
              <Avatar initiales={ligne.initiales} nom={ligne.nom} />
              <div className="min-w-0">
                <p className="font-medium">{ligne.nom}</p>
                {ligne.competences.length > 0 ? (
                  <p className="text-xs text-nuit-doux">
                    {ligne.competences.join(", ")}
                  </p>
                ) : null}
              </div>
            </div>
            <ul className="mt-3 space-y-2">
              {planning.colonnes.map((colonne) => {
                const cellule = ligne.cellules[colonne.cle];
                return (
                  <li
                    key={colonne.cle}
                    className="flex flex-wrap items-center justify-between gap-2 border-t border-bordure pt-2 text-sm first:border-0 first:pt-0"
                  >
                    <span className="min-w-0">
                      <span className="block text-xs text-nuit-doux">
                        {formatDateShort(colonne.startsAt, planning.timezone)} -{" "}
                        {colonne.eventTitle}
                      </span>
                      <span className="font-medium">{colonne.label}</span>
                      {(cellule?.postes ?? []).length > 0 ? (
                        <span className="ml-2 text-xs text-indigo-fonce">
                          {(cellule?.postes ?? []).join(", ")}
                        </span>
                      ) : null}
                      {/* Meme contenu que la grille, motif inclus quand on a
                          le droit de le lire. */}
                      {cellule?.motif ? (
                        <span className="mt-1 block text-xs text-nuit-doux">
                          Motif : {cellule.motif}
                        </span>
                      ) : null}
                    </span>
                    <BadgeDisponibilite etat={cellule?.disponibilite ?? "a_renseigner"} />
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ul>
    </>
  );
}
