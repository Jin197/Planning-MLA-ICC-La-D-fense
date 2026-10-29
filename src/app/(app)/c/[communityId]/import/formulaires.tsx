"use client";

import { useActionState } from "react";
import { FileSpreadsheet, Upload } from "lucide-react";
import {
  actionAnalyser,
  actionImporter,
  actionOptions,
  actionRapprocher,
} from "./actions";
import { ETAT_INITIAL } from "@/lib/form";
import type { PreviewResume } from "@/server/import/service";
import { SubmitButton } from "@/components/ui/button";
import {
  Alerte,
  Badge,
  Card,
  CardBody,
  CardHeader,
  Champ,
  GrilleDefilante,
  Input,
  Select,
} from "@/components/ui/primitives";

export function FormulaireAnalyse({ communityId }: { communityId: string }) {
  const [etat, action] = useActionState(actionAnalyser, ETAT_INITIAL);

  return (
    <form action={action} className="space-y-4" encType="multipart/form-data">
      <input type="hidden" name="communityId" value={communityId} />

      {etat.status === "succes" ? (
        <Alerte ton="succes" titre="Analyse terminee">
          {etat.message}
        </Alerte>
      ) : null}
      {etat.status === "erreur" ? (
        <Alerte ton="erreur" titre="Analyse impossible">
          {etat.message}
        </Alerte>
      ) : null}

      <Champ
        label="Classeur Excel"
        htmlFor="fichier"
        requis
        aide="Les cinq feuilles connues sont detectees : PLANNING MLA, LISTE CHANTS, DRESS CODE, PLANNING MLA EJP, historique."
      >
        <Input
          id="fichier"
          name="fichier"
          type="file"
          accept=".xlsx,.xls"
          required
          className="py-2"
        />
      </Champ>

      <Champ
        label="Annee a appliquer aux dates sans annee"
        htmlFor="annee"
        aide="Laissez vide pour laisser l'analyse proposer une annee etayee par le fichier."
      >
        <Input id="annee" name="annee" type="number" min={2000} max={2100} />
      </Champ>

      <SubmitButton libelleEnCours="Analyse du classeur...">
        <Upload aria-hidden="true" className="size-4" />
        Analyser sans rien ecrire
      </SubmitButton>
    </form>
  );
}

export function PanneauPreview({
  communityId,
  preview,
  membres,
}: {
  communityId: string;
  preview: PreviewResume;
  membres: { membershipId: string; nom: string }[];
}) {
  const [etatOptions, actionOpt] = useActionState(actionOptions, ETAT_INITIAL);
  const [etatRapprochement, actionRap] = useActionState(
    actionRapprocher,
    ETAT_INITIAL,
  );
  const [etatImport, actionImp] = useActionState(actionImporter, ETAT_INITIAL);

  const dejaImporte = preview.state === "importe";
  const aRapprocher = preview.personnes.filter((p) => p.statut === "a_rapprocher");

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          titre="2. Previsualisation"
          sousTitre={`Fichier « ${preview.filename} ». Etat : ${preview.state}.`}
          actions={
            <span className="inline-flex items-center gap-1.5 text-sm text-nuit-doux">
              <FileSpreadsheet aria-hidden="true" className="size-4" />
              {preview.sheetsDetected.length} feuille(s) reconnue(s)
            </span>
          }
        />
        <CardBody className="space-y-4">
          <ul className="flex flex-wrap gap-2">
            {preview.sheetsDetected.map((feuille) => (
              <li key={feuille}>
                <Badge ton="accent">{feuille}</Badge>
              </li>
            ))}
          </ul>

          <dl className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {[
              ["Personnes lues", preview.compte.personnes],
              ["Colonnes de dates", preview.compte.colonnes],
              ["Dates sans annee", preview.compte.colonnesSansAnnee],
              ["Disponibilites", preview.compte.disponibilites],
              ["Affectations", preview.compte.affectations],
              ["Repetitions", preview.compte.repetitions],
              ["Chants", preview.compte.chants],
              ["Dress-codes", preview.compte.dressCodes],
              ["Anomalies", preview.compte.anomalies],
            ].map(([libelle, valeur]) => (
              <div
                key={String(libelle)}
                className="rounded-[var(--radius-doux)] bg-ivoire-fonce/60 px-3 py-2"
              >
                <dt className="text-xs text-nuit-doux">{libelle}</dt>
                <dd className="text-lg font-semibold">{valeur}</dd>
              </div>
            ))}
          </dl>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          titre="3. Annee et deduction"
          sousTitre="Rien n'est applique automatiquement : ces choix doivent etre valides."
        />
        <CardBody>
          <form action={actionOpt} className="space-y-4">
            <input type="hidden" name="communityId" value={communityId} />
            <input type="hidden" name="jobId" value={preview.jobId} />

            {etatOptions.status !== "repos" ? (
              <Alerte ton={etatOptions.status === "succes" ? "succes" : "erreur"}>
                {etatOptions.message}
              </Alerte>
            ) : null}

            {preview.yearEvidence ? (
              <Alerte ton="info" titre={`Annee proposee : ${preview.assumedYear}`}>
                Etayee par : « {preview.yearEvidence} ». Les archives ne recoivent
                pas l&apos;annee courante par defaut.
              </Alerte>
            ) : (
              <Alerte ton="attention" titre="Aucune annee etayee">
                Aucune cellule ne porte d&apos;annee explicite : saisissez-la
                vous-meme avant d&apos;importer.
              </Alerte>
            )}

            <Champ label="Annee retenue" htmlFor="annee-option">
              <Input
                id="annee-option"
                name="annee"
                type="number"
                min={2000}
                max={2100}
                defaultValue={preview.assumedYear ?? ""}
              />
            </Champ>

            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                name="deduireIndisponible"
                className="mt-1 size-5"
              />
              <span>
                Considerer les creneaux non cites comme indisponibles. Par
                defaut, « Cultes 1 &amp; 2 » rend disponible sur ces deux
                creneaux et laisse les autres « a renseigner », car le classeur
                ne le precise pas.
              </span>
            </label>

            <SubmitButton variante="secondaire" libelleEnCours="Enregistrement...">
              Enregistrer ces choix
            </SubmitButton>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          titre={`4. Rapprochement des personnes (${aRapprocher.length} a trancher)`}
          sousTitre="Le rapprochement approximatif propose ; vous decidez. Deux personnes au meme prenom restent distinctes."
        />
        <CardBody className="space-y-4">
          {etatRapprochement.status !== "repos" ? (
            <Alerte
              ton={etatRapprochement.status === "succes" ? "succes" : "erreur"}
            >
              {etatRapprochement.message}
            </Alerte>
          ) : null}

          {preview.personnes.length === 0 ? (
            <p className="text-sm text-nuit-doux">Aucune personne lue.</p>
          ) : (
            <GrilleDefilante legende="Personnes lues dans le classeur">
              <table className="min-w-max text-sm">
                <thead>
                  <tr>
                    <th scope="col" className="border-b border-bordure px-3 py-2 text-left">
                      Personne lue
                    </th>
                    <th scope="col" className="border-b border-bordure px-3 py-2 text-left">
                      Pupitre / instrument
                    </th>
                    <th scope="col" className="border-b border-bordure px-3 py-2 text-left">
                      Provenance
                    </th>
                    <th scope="col" className="border-b border-bordure px-3 py-2 text-left">
                      Suggestion
                    </th>
                    <th scope="col" className="border-b border-bordure px-3 py-2 text-left">
                      Decision
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {preview.personnes.map((personne) => (
                    <tr key={personne.id} className="even:bg-ivoire-fonce/40">
                      <td className="border-b border-bordure px-3 py-2 whitespace-nowrap">
                        {personne.prenom} {personne.nom}
                      </td>
                      <td className="border-b border-bordure px-3 py-2">
                        {personne.competences || "-"}
                      </td>
                      <td className="border-b border-bordure px-3 py-2 font-mono text-xs">
                        {personne.source}
                      </td>
                      <td className="border-b border-bordure px-3 py-2">
                        {personne.suggestion ? (
                          <span>
                            {personne.suggestion.nom}{" "}
                            <Badge ton="attente">
                              {Math.round(personne.suggestion.score * 100)} %
                            </Badge>
                          </span>
                        ) : (
                          <span className="text-nuit-tres-doux">aucune</span>
                        )}
                      </td>
                      <td className="border-b border-bordure px-3 py-2">
                        {personne.statut !== "a_rapprocher" ? (
                          <Badge ton={personne.statut === "lie" ? "dispo" : "neutre"}>
                            {personne.statut === "lie"
                              ? "Liee"
                              : personne.statut === "nouveau"
                                ? "Nouvelle fiche"
                                : "Ignoree"}
                          </Badge>
                        ) : (
                          <form
                            action={actionRap}
                            className="flex flex-wrap items-center gap-2"
                          >
                            <input type="hidden" name="communityId" value={communityId} />
                            <input type="hidden" name="jobId" value={preview.jobId} />
                            <input
                              type="hidden"
                              name="importedPersonId"
                              value={personne.id}
                            />
                            <Select
                              name="membershipId"
                              aria-label={`Compte a lier pour ${personne.prenom} ${personne.nom}`}
                              defaultValue={personne.suggestion?.membershipId ?? ""}
                              className="min-w-44"
                            >
                              <option value="">Choisir un membre</option>
                              {membres.map((membre) => (
                                <option
                                  key={membre.membershipId}
                                  value={membre.membershipId}
                                >
                                  {membre.nom}
                                </option>
                              ))}
                            </Select>
                            <SubmitButton
                              name="decision"
                              value="lier"
                              taille="compact"
                              libelleEnCours="..."
                            >
                              Lier
                            </SubmitButton>
                            <SubmitButton
                              name="decision"
                              value="nouveau"
                              variante="secondaire"
                              taille="compact"
                              libelleEnCours="..."
                            >
                              Nouvelle
                            </SubmitButton>
                            <SubmitButton
                              name="decision"
                              value="ignorer"
                              variante="discret"
                              taille="compact"
                              libelleEnCours="..."
                            >
                              Ignorer
                            </SubmitButton>
                          </form>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </GrilleDefilante>
          )}
        </CardBody>
      </Card>

      {preview.anomalies.length > 0 ? (
        <Card>
          <CardHeader
            titre={`Rapport d'anomalies (${preview.compte.anomalies})`}
            sousTitre="Chaque anomalie garde sa feuille et sa cellule d'origine."
          />
          <CardBody>
            <GrilleDefilante legende="Anomalies detectees">
              <table className="min-w-max text-sm">
                <thead>
                  <tr>
                    <th scope="col" className="border-b border-bordure px-3 py-2 text-left">
                      Feuille
                    </th>
                    <th scope="col" className="border-b border-bordure px-3 py-2 text-left">
                      Cellule
                    </th>
                    <th scope="col" className="border-b border-bordure px-3 py-2 text-left">
                      Anomalie
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {preview.anomalies.map((anomalie, index) => (
                    <tr key={index} className="even:bg-ivoire-fonce/40">
                      <td className="border-b border-bordure px-3 py-2 whitespace-nowrap">
                        {anomalie.sheet}
                      </td>
                      <td className="border-b border-bordure px-3 py-2 font-mono text-xs">
                        {anomalie.cell}
                      </td>
                      <td className="border-b border-bordure px-3 py-2">
                        {anomalie.message}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </GrilleDefilante>
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardHeader
          titre="5 et 6. Valider puis importer"
          sousTitre="C'est la seule etape qui ecrit dans le planning."
        />
        <CardBody>
          {dejaImporte ? (
            <Alerte ton="info" titre="Import deja applique">
              Relancer le meme import ne cree pas de doublon : les evenements
              deja presents sont conserves et signales.
            </Alerte>
          ) : (
            <form action={actionImp} className="space-y-4">
              <input type="hidden" name="communityId" value={communityId} />
              <input type="hidden" name="jobId" value={preview.jobId} />

              {etatImport.status !== "repos" ? (
                <Alerte ton={etatImport.status === "succes" ? "succes" : "erreur"}>
                  {etatImport.message}
                </Alerte>
              ) : null}

              {preview.compte.colonnesSansAnnee > 0 ? (
                <Alerte ton="attention" titre="Dates sans annee">
                  {preview.compte.colonnesSansAnnee} colonne(s) n&apos;ont pas
                  d&apos;annee etablie. Ces journees resteront en staging et
                  seront listees dans le rapport de rejets.
                </Alerte>
              ) : null}

              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  name="confirmation"
                  required
                  className="mt-1 size-5"
                />
                <span>
                  J&apos;ai relu la previsualisation, le rapport d&apos;anomalies
                  et les rapprochements. J&apos;autorise l&apos;ecriture dans le
                  planning.
                </span>
              </label>

              <SubmitButton libelleEnCours="Import en cours...">
                Importer dans le planning
              </SubmitButton>
            </form>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
