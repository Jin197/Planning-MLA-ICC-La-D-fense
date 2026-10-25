import "server-only";
import { newId, stableKey } from "@/lib/ids";
import { localToUtc, nowIso } from "@/lib/time";
import { err, ok, type Result } from "@/lib/result";
import { suggestMatches } from "@/domain/import-parsing";
import { resolveAvailabilityForDay } from "@/domain/availability";
import { copyTemplateIntoPlan } from "@/domain/template";
import type {
  Id,
  ImportJob,
  ImportRow,
  ImportRowKind,
  ImportedPerson,
} from "@/domain/types";
import { getDataAdapter } from "../data";
import type { Tx } from "../data/port";
import { requireCommunityAction } from "../auth/context";
import { writeAudit } from "../notifications/enqueue";
import { analyserClasseur, type AnalyseClasseur } from "./workbook";

/**
 * Import controle : charger, analyser, previsualiser, rapprocher, valider,
 * importer. Aucune ecriture metier avant la validation explicite de l'admin.
 */

export const TAILLE_MAX_FICHIER = 12 * 1024 * 1024;
const TYPES_ACCEPTES = [
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "application/octet-stream",
];

export interface PreviewResume {
  jobId: Id;
  filename: string;
  state: ImportJob["state"];
  sheetsDetected: string[];
  sheetsManquantes: string[];
  assumedYear: number | null;
  yearEvidence: string | null;
  compte: {
    personnes: number;
    colonnes: number;
    colonnesSansAnnee: number;
    disponibilites: number;
    affectations: number;
    repetitions: number;
    chants: number;
    dressCodes: number;
    anomalies: number;
  };
  doublons: { columnKey: string; sheets: string[] }[];
  anomalies: { sheet: string; cell: string; message: string }[];
  personnes: {
    id: Id;
    nom: string;
    prenom: string;
    competences: string;
    statut: ImportedPerson["status"];
    suggestion: { membershipId: Id; nom: string; score: number } | null;
    lieA: Id | null;
    source: string;
  }[];
}

/**
 * Etape 1 et 2 : charger puis analyser. Le resultat est conserve en staging
 * (import_jobs, import_rows, imported_people) et nulle part ailleurs.
 */
export async function analyserFichier(
  communityId: Id,
  fichier: { name: string; type: string; size: number; buffer: ArrayBuffer },
  options: { assumedYear?: number | null } = {},
): Promise<Result<{ jobId: Id }>> {
  const ctx = await requireCommunityAction(communityId, "communaute.importer");

  if (fichier.size > TAILLE_MAX_FICHIER) {
    return err(
      "fichier_trop_grand",
      `Fichier limite a ${Math.round(TAILLE_MAX_FICHIER / 1024 / 1024)} Mo.`,
    );
  }
  if (!/\.xlsx?$/i.test(fichier.name) && !TYPES_ACCEPTES.includes(fichier.type)) {
    return err("format_refuse", "Formats acceptes : .xlsx et .xls.");
  }

  let analyse: AnalyseClasseur;
  try {
    analyse = await analyserClasseur(fichier.buffer, options);
  } catch (error) {
    return err(
      "lecture_impossible",
      error instanceof Error
        ? `Lecture du classeur impossible : ${error.message}`
        : "Lecture du classeur impossible.",
    );
  }

  const adapter = getDataAdapter();
  const jobId = newId();
  const at = nowIso();

  await adapter.transaction(async (tx) => {
    const membres = await chargerMembres(tx, communityId);

    const job: ImportJob = {
      id: jobId,
      communityId,
      createdBy: ctx.viewer.userId,
      filename: fichier.name,
      state: "previsualise",
      assumedYear: options.assumedYear ?? analyse.yearEvidence?.year ?? null,
      yearEvidence: analyse.yearEvidence?.evidence ?? null,
      inferMissingAsUnavailable: false,
      summary: {
        sheetsDetected: analyse.sheetsDetected,
        people: analyse.personnes.length,
        days: new Set(analyse.colonnes.map((c) => c.parsed.date ?? c.header)).size,
        sessions: 0,
        availabilities: analyse.disponibilites.length,
        assignments: analyse.affectations.length,
        songs: analyse.chants.length,
        dressCodes: analyse.dressCodes.length,
        rehearsals: analyse.repetitions.reduce((n, r) => n + r.parsed.length, 0),
        issues: analyse.anomalies.length,
      },
      createdAt: at,
      updatedAt: at,
    };
    await tx.insert("import_jobs", job);

    const lignes: ImportRow[] = [];
    const ajouter = (
      kind: ImportRowKind,
      source: { sheet: string; cell: string },
      parsed: Record<string, unknown>,
      raw: string,
      issues: string[] = [],
    ) => {
      lignes.push({
        id: newId(),
        jobId,
        communityId,
        kind,
        sheet: source.sheet,
        cell: source.cell,
        rawValue: raw.slice(0, 500),
        parsed,
        issues,
        skipped: false,
      });
    };

    for (const colonne of analyse.colonnes) {
      ajouter(
        "creneau",
        colonne,
        {
          date: colonne.parsed.date,
          jour: colonne.parsed.day,
          mois: colonne.parsed.month,
          note: colonne.parsed.note,
          depuisDateExcel: colonne.parsed.fromExcelDate,
        },
        colonne.header,
        colonne.parsed.issues,
      );
    }
    for (const dispo of analyse.disponibilites) {
      ajouter(
        "disponibilite",
        dispo,
        { personne: dispo.personRef, colonne: dispo.columnKey, token: dispo.token },
        dispo.raw,
        dispo.token.kind === "inconnu" ? ["Valeur non reconnue."] : [],
      );
    }
    for (const affectation of analyse.affectations) {
      ajouter(
        "affectation",
        affectation,
        {
          colonne: affectation.columnKey,
          equipe: affectation.teamLabel,
          poste: affectation.roleLabel,
          noms: affectation.parsed.names,
          precision: affectation.parsed.detail,
          parCreneau: affectation.parsed.perSession,
          nonApplicable: affectation.parsed.notApplicable,
        },
        affectation.raw,
        affectation.parsed.issues,
      );
    }
    for (const repetition of analyse.repetitions) {
      ajouter(
        "repetition",
        repetition,
        { colonne: repetition.columnKey, equipe: repetition.teamLabel, rendezVous: repetition.parsed },
        repetition.parsed.map((p) => p.raw).join(" | "),
        repetition.parsed.flatMap((p) => p.issues),
      );
    }
    for (const chant of analyse.chants) {
      ajouter(
        "chant",
        chant,
        {
          groupe: chant.groupLabel,
          sequence: chant.sequence,
          titre: chant.title,
          liens: chant.links,
          colonne: chant.columnKey,
        },
        chant.title,
      );
    }
    for (const dressCode of analyse.dressCodes) {
      ajouter(
        "dress_code",
        dressCode,
        {
          colonne: dressCode.columnKey,
          theme: dressCode.theme,
          mood: dressCode.mood,
          couleurs: dressCode.colors,
          matieres: dressCode.materials,
        },
        dressCode.theme,
      );
    }
    for (const anomalie of analyse.anomalies) {
      ajouter(
        "anomalie",
        { sheet: anomalie.sheet, cell: anomalie.cell },
        { message: anomalie.message },
        anomalie.message,
        [anomalie.message],
      );
    }

    await tx.insertMany("import_rows", lignes);

    // Fiches importees : aucune adhesion, aucun compte, aucune fusion.
    const vues = new Set<string>();
    const fiches: ImportedPerson[] = [];
    for (const personne of analyse.personnes) {
      const cle = stableKey(
        personne.lastName.toLowerCase(),
        personne.firstName.toLowerCase(),
      );
      if (vues.has(cle)) continue;
      vues.add(cle);

      const nomComplet = `${personne.firstName} ${personne.lastName}`.trim();
      const suggestions = suggestMatches(nomComplet, membres);
      fiches.push({
        id: newId(),
        jobId,
        communityId,
        lastName: personne.lastName,
        firstName: personne.firstName,
        rawSkills: personne.rawSkills,
        sourceCells: [`${personne.sheet}!${personne.cell}`],
        suggestedMembershipId: suggestions[0]?.candidateId ?? null,
        suggestionScore: suggestions[0]?.score ?? null,
        linkedMembershipId: null,
        status: "a_rapprocher",
      });
    }
    await tx.insertMany("imported_people", fiches);

    await writeAudit(tx, {
      communityId,
      actorUserId: ctx.viewer.userId,
      action: "import.previsualise",
      targetType: "import_job",
      targetId: jobId,
      metadata: { fichier: fichier.name, anomalies: analyse.anomalies.length },
    });
  });

  return ok({ jobId });
}

async function chargerMembres(
  tx: Tx,
  communityId: Id,
): Promise<{ id: Id; name: string }[]> {
  const memberships = await tx.select("community_memberships", {
    where: { communityId, status: "active" },
  });
  const profiles = await tx.select("profiles", {
    whereIn: { id: memberships.map((m) => m.userId) },
  });
  const byId = new Map(profiles.map((p) => [p.id, p]));
  return memberships.map((m) => {
    const profile = byId.get(m.userId);
    return {
      id: m.id,
      name: profile ? `${profile.firstName} ${profile.lastName}` : "",
    };
  });
}

export async function chargerPreview(
  communityId: Id,
  jobId: Id,
): Promise<Result<PreviewResume>> {
  await requireCommunityAction(communityId, "communaute.importer");
  const adapter = getDataAdapter();

  return adapter.read(async (tx) => {
    const job = await tx.selectOne("import_jobs", { where: { id: jobId, communityId } });
    if (!job) return err("import_inconnu", "Import introuvable.");

    const lignes = await tx.select("import_rows", { where: { jobId } });
    const fiches = await tx.select("imported_people", { where: { jobId } });
    const membres = await chargerMembres(tx, communityId);
    const nomParMembership = new Map(membres.map((m) => [m.id, m.name]));

    const creneaux = lignes.filter((l) => l.kind === "creneau");
    const sansAnnee = creneaux.filter((l) => l.parsed.date === null).length;

    return ok({
      jobId,
      filename: job.filename,
      state: job.state,
      sheetsDetected: job.summary?.sheetsDetected ?? [],
      sheetsManquantes: [],
      assumedYear: job.assumedYear,
      yearEvidence: job.yearEvidence,
      compte: {
        personnes: fiches.length,
        colonnes: creneaux.length,
        colonnesSansAnnee: sansAnnee,
        disponibilites: lignes.filter((l) => l.kind === "disponibilite").length,
        affectations: lignes.filter((l) => l.kind === "affectation").length,
        repetitions: lignes.filter((l) => l.kind === "repetition").length,
        chants: lignes.filter((l) => l.kind === "chant").length,
        dressCodes: lignes.filter((l) => l.kind === "dress_code").length,
        anomalies: lignes.filter((l) => l.issues.length > 0).length,
      },
      doublons: [],
      anomalies: lignes
        .filter((l) => l.issues.length > 0)
        .slice(0, 120)
        .map((l) => ({
          sheet: l.sheet,
          cell: l.cell,
          message: l.issues.join(" "),
        })),
      personnes: fiches
        .map((fiche) => ({
          id: fiche.id,
          nom: fiche.lastName,
          prenom: fiche.firstName,
          competences: fiche.rawSkills,
          statut: fiche.status,
          suggestion: fiche.suggestedMembershipId
            ? {
                membershipId: fiche.suggestedMembershipId,
                nom: nomParMembership.get(fiche.suggestedMembershipId) ?? "",
                score: fiche.suggestionScore ?? 0,
              }
            : null,
          lieA: fiche.linkedMembershipId,
          source: fiche.sourceCells.join(", "),
        }))
        .sort((a, b) => `${a.nom}${a.prenom}`.localeCompare(`${b.nom}${b.prenom}`, "fr")),
    });
  });
}

/** Etape 4 : l'admin tranche chaque rapprochement. */
export async function rapprocherPersonne(
  communityId: Id,
  input: {
    jobId: Id;
    importedPersonId: Id;
    decision: "lier" | "nouveau" | "ignorer";
    membershipId?: Id | null;
  },
): Promise<Result<{ statut: ImportedPerson["status"] }>> {
  await requireCommunityAction(communityId, "communaute.importer");
  const adapter = getDataAdapter();

  return adapter.transaction(async (tx) => {
    const fiche = await tx.selectOne("imported_people", {
      where: { id: input.importedPersonId, jobId: input.jobId, communityId },
    });
    if (!fiche) return err("fiche_inconnue", "Fiche importee introuvable.");

    if (input.decision === "lier") {
      if (!input.membershipId) {
        return err("adhesion_requise", "Choisissez la personne a lier.");
      }
      const membership = await tx.selectOne("community_memberships", {
        where: { id: input.membershipId, communityId, status: "active" },
      });
      if (!membership) {
        return err(
          "adhesion_inactive",
          "Cette personne n'est pas un membre actif de la communaute.",
        );
      }
      await tx.update("imported_people", fiche.id, {
        linkedMembershipId: input.membershipId,
        status: "lie",
      });
      return ok({ statut: "lie" as const });
    }

    const statut = input.decision === "nouveau" ? "nouveau" : "ignore";
    await tx.update("imported_people", fiche.id, {
      linkedMembershipId: null,
      status: statut,
    });
    return ok({ statut });
  });
}

export async function reglerOptionsImport(
  communityId: Id,
  jobId: Id,
  options: { assumedYear: number | null; inferMissingAsUnavailable: boolean },
): Promise<Result<{ jobId: Id }>> {
  await requireCommunityAction(communityId, "communaute.importer");
  const adapter = getDataAdapter();
  return adapter.transaction(async (tx) => {
    const job = await tx.selectOne("import_jobs", { where: { id: jobId, communityId } });
    if (!job) return err("import_inconnu", "Import introuvable.");
    await tx.update("import_jobs", jobId, {
      assumedYear: options.assumedYear,
      inferMissingAsUnavailable: options.inferMissingAsUnavailable,
      updatedAt: nowIso(),
    });
    return ok({ jobId });
  });
}

export interface RapportImport {
  evenementsCrees: number;
  evenementsIgnores: { titre: string; raison: string }[];
  /** Equipes creees, une par evenement importe. */
  equipesCreees: number;
  repetitionsCreees: number;
  affectationsCreees: number;
  disponibilitesCreees: number;
  chantsCrees: number;
  dressCodesCrees: number;
  rejets: { source: string; raison: string }[];
}

/**
 * Etape 6 : import definitif. Idempotent — relancer le meme import ne cree
 * pas de doublon, parce que chaque evenement est identifie par une cle
 * stable (communaute, jour, libelle).
 */
export async function importerDefinitivement(
  communityId: Id,
  jobId: Id,
): Promise<Result<RapportImport>> {
  const ctx = await requireCommunityAction(communityId, "communaute.importer");
  const adapter = getDataAdapter();

  return adapter.transaction(async (tx) => {
    const job = await tx.selectOne("import_jobs", { where: { id: jobId, communityId } });
    if (!job) return err("import_inconnu", "Import introuvable.");
    if (job.state === "importe") {
      return err("import_deja_effectue", "Cet import a deja ete applique.");
    }

    const community = await tx.selectOne("communities", { where: { id: communityId } });
    if (!community) return err("communaute_inconnue", "Communaute introuvable.");
    const tz = community.timezone;

    const lignes = await tx.select("import_rows", { where: { jobId } });
    const fiches = await tx.select("imported_people", { where: { jobId } });
    const liees = new Map(
      fiches
        .filter((f) => f.status === "lie" && f.linkedMembershipId !== null)
        .flatMap((f) => [
          [`${f.firstName} ${f.lastName}`.trim().toLowerCase(), f.linkedMembershipId!],
          [f.firstName.trim().toLowerCase(), f.linkedMembershipId!],
        ]),
    );

    const template = await tx.selectOne("planning_templates", { where: { communityId } });
    const champs = template
      ? await tx.select("template_fields", { where: { templateId: template.id } })
      : [];
    const evenementsExistants = await tx.select("events", { where: { communityId } });

    const rapport: RapportImport = {
      evenementsCrees: 0,
      evenementsIgnores: [],
      equipesCreees: 0,
      repetitionsCreees: 0,
      affectationsCreees: 0,
      disponibilitesCreees: 0,
      chantsCrees: 0,
      dressCodesCrees: 0,
      rejets: [],
    };

    const at = nowIso();

    /* --- Un evenement par journee datee ------------------------------- */
    const journees = new Map<
      string,
      { date: string; note: string | null; sources: string[] }
    >();
    for (const ligne of lignes) {
      if (ligne.kind !== "creneau" || ligne.skipped) continue;
      const date = ligne.parsed.date;
      if (typeof date !== "string") {
        rapport.rejets.push({
          source: `${ligne.sheet}!${ligne.cell}`,
          raison: "Date non etablie : creneau laisse en staging.",
        });
        continue;
      }
      const existant = journees.get(date);
      journees.set(date, {
        date,
        note:
          (typeof ligne.parsed.note === "string" ? ligne.parsed.note : null) ??
          existant?.note ??
          null,
        sources: [...(existant?.sources ?? []), `${ligne.sheet}!${ligne.cell}`],
      });
    }

    // Le classeur ne decoupe pas une journee en sous-evenements : chaque
    // date importee devient un evenement sans sous-evenement, dont l'horaire
    // reste a definir.
    const eventParDate = new Map<string, Id>();
    const planParDate = new Map<string, Id>();

    for (const journee of [...journees.values()].sort((a, b) =>
      a.date < b.date ? -1 : 1,
    )) {
      const titre = journee.note
        ? `${journee.note} (${journee.date})`
        : `Journee importee du ${journee.date}`;

      // Idempotence : un evenement deja importe pour cette date est reutilise.
      const dejaPresent = evenementsExistants.find((e) => e.title === titre);
      if (dejaPresent) {
        eventParDate.set(journee.date, dejaPresent.id);
        const planExistant = (
          await tx.select("event_plans", { where: { eventId: dejaPresent.id } })
        )[0];
        if (planExistant) planParDate.set(journee.date, planExistant.id);
        rapport.evenementsIgnores.push({
          titre,
          raison: "Deja importe : conserve tel quel, aucun doublon cree.",
        });
        continue;
      }

      const eventId = newId();
      await tx.insert("events", {
        id: eventId,
        communityId,
        title: titre,
        description: `Importe depuis « ${job.filename} ». Sources : ${journee.sources
          .slice(0, 6)
          .join(", ")}.`,
        // Un import arrive en brouillon : rien n'est publie automatiquement.
        state: "brouillon",
        timezone: tz,
        // Les horaires exacts manquent dans le classeur : l'evenement est
        // marque provisoire, ce qui bloque la publication jusqu'a definition.
        startsAt: localToUtc({ date: journee.date, time: "09:00" }, tz),
        endsAt: localToUtc({ date: journee.date, time: "11:00" }, tz),
        locationName: "",
        locationAddress: "",
        scheduleProvisional: true,
        version: 1,
        publishedVersion: 0,
        responseDeadline: null,
        publishedAt: null,
        cancelledAt: null,
        cancelReason: null,
        archivedAt: null,
        createdBy: ctx.viewer.userId,
        createdAt: at,
        updatedAt: at,
      });
      rapport.evenementsCrees += 1;
      eventParDate.set(journee.date, eventId);

      // Les equipes appartiennent a l'evenement : l'import en cree une par
      // evenement, rattachee a toute sa duree, et y pose la feuille de
      // postes. L'admin la renomme ou la decoupe ensuite.
      const teamId = newId();
      await tx.insert("event_teams", {
        id: teamId,
        communityId,
        eventId,
        name: "Equipe importee",
        order: 1,
      });
      rapport.equipesCreees += 1;

      const planId = newId();
      await tx.insert("event_plans", {
        id: planId,
        communityId,
        eventId,
        sessionId: null,
        teamId,
        templateVersion: template?.version ?? 1,
        createdAt: at,
      });
      await tx.insertMany(
        "event_role_slots",
        copyTemplateIntoPlan(champs, { communityId, planId }),
      );
      planParDate.set(journee.date, planId);
    }

    /* --- Disponibilites des personnes liees --------------------------- */
    for (const ligne of lignes) {
      if (ligne.kind !== "disponibilite" || ligne.skipped) continue;
      const personne = String(ligne.parsed.personne ?? "");
      const colonne = String(ligne.parsed.colonne ?? "");
      const eventId = eventParDate.get(colonne);
      const membershipId =
        liees.get(personne.trim().toLowerCase()) ??
        liees.get(personne.split(" ").slice(-1)[0]?.toLowerCase() ?? "");

      if (!eventId) continue;
      if (!membershipId) {
        rapport.rejets.push({
          source: `${ligne.sheet}!${ligne.cell}`,
          raison: `« ${personne} » n'est pas rapproche d'un compte : disponibilite non importee.`,
        });
        continue;
      }

      const token = ligne.parsed.token as ReturnType<typeof import("@/domain/availability").parseAvailabilityToken>;
      // Une seule occurrence par journee importee : l'evenement lui-meme.
      const resolution = resolveAvailabilityForDay(
        token,
        [{ id: eventId, ordinal: 1, label: "Horaire a definir" }],
        { inferMissingAsUnavailable: job.inferMissingAsUnavailable },
      );
      for (const reponse of resolution.resolved) {
        const existante = (
          await tx.select("availabilities", { where: { eventId, membershipId } })
        ).find((a) => a.sessionId === null);
        if (existante) continue;
        await tx.insert("availabilities", {
          id: newId(),
          communityId,
          eventId,
          sessionId: null,
          membershipId,
          answer: reponse.answer,
          // Une personne planifiee dans l'ancien fichier n'a rien confirme.
          needsReconfirmation: true,
          answeredAt: at,
          updatedAt: at,
        });
        rapport.disponibilitesCreees += 1;
      }
    }

    /* --- Affectations des personnes liees ----------------------------- */
    for (const ligne of lignes) {
      if (ligne.kind !== "affectation" || ligne.skipped) continue;
      if (ligne.parsed.nonApplicable === true) continue;
      const colonne = String(ligne.parsed.colonne ?? "");
      const planId = planParDate.get(colonne);
      if (!planId) continue;
      const poste = String(ligne.parsed.poste ?? "");
      const noms = Array.isArray(ligne.parsed.noms)
        ? (ligne.parsed.noms as string[])
        : [];

      const plan = await tx.selectOne("event_plans", { where: { id: planId } });
      if (!plan) continue;
      const slots = await tx.select("event_role_slots", { where: { planId: plan.id } });
      const slot = slots.find((s) =>
        s.label.toLowerCase().includes(poste.toLowerCase().replace(/micro \d+ - /i, "")),
      );
      if (!slot) {
        rapport.rejets.push({
          source: `${ligne.sheet}!${ligne.cell}`,
          raison: `Poste « ${poste} » sans equivalent dans le modele : a rattacher manuellement.`,
        });
        continue;
      }

      for (const nom of noms) {
        const membershipId = liees.get(nom.trim().toLowerCase());
        if (!membershipId) {
          rapport.rejets.push({
            source: `${ligne.sheet}!${ligne.cell}`,
            raison: `« ${nom} » n'est pas rapproche d'un compte : affectation non importee.`,
          });
          continue;
        }
        const existante = await tx.selectOne("assignments", {
          where: { slotId: slot.id, membershipId },
        });
        if (existante) continue;
        await tx.insert("assignments", {
          id: newId(),
          communityId,
          planId: plan.id,
          slotId: slot.id,
          membershipId,
          // Rien n'est suppose confirme.
          state: "a_confirmer",
          detail:
            typeof ligne.parsed.precision === "string" ? ligne.parsed.precision : null,
          exceptions: [],
          memberNote: null,
          createdBy: ctx.viewer.userId,
          createdAt: at,
          updatedAt: at,
        });
        rapport.affectationsCreees += 1;
      }
    }

    /* --- Repetitions -------------------------------------------------- */
    for (const ligne of lignes) {
      if (ligne.kind !== "repetition" || ligne.skipped) continue;
      const colonne = String(ligne.parsed.colonne ?? "");
      const eventId = eventParDate.get(colonne);
      if (!eventId) continue;
      const rendezVous = Array.isArray(ligne.parsed.rendezVous)
        ? (ligne.parsed.rendezVous as {
            date: string | null;
            startTime: string | null;
            endTime: string | null;
            crossesMidnight: boolean;
            locationName: string;
            room: string;
            address: string;
            raw: string;
          }[])
        : [];

      for (const rdv of rendezVous) {
        if (!rdv.date || !rdv.startTime || !rdv.endTime) {
          rapport.rejets.push({
            source: `${ligne.sheet}!${ligne.cell}`,
            raison: `Repetition « ${rdv.raw} » sans date ou horaire complet : a saisir.`,
          });
          continue;
        }
        // Une fin avant le debut signifie un passage de minuit : jour suivant.
        const dateFin = rdv.crossesMidnight
          ? new Date(new Date(`${rdv.date}T00:00:00Z`).getTime() + 86400000)
              .toISOString()
              .slice(0, 10)
          : rdv.date;

        const deja = (await tx.select("rehearsals", { where: { eventId } })).some(
          (r) =>
            r.startsAt === localToUtc({ date: rdv.date!, time: rdv.startTime! }, tz),
        );
        if (deja) continue;

        await tx.insert("rehearsals", {
          id: newId(),
          communityId,
          eventId,
          label: `Repetition importee (${String(ligne.parsed.equipe ?? "")})`.trim(),
          startsAt: localToUtc({ date: rdv.date, time: rdv.startTime }, tz),
          endsAt: localToUtc({ date: dateFin, time: rdv.endTime }, tz),
          locationName: rdv.locationName,
          locationAddress: rdv.address,
          room: rdv.room,
          attendanceExpected: true,
        });
        rapport.repetitionsCreees += 1;
      }
    }

    /* --- Chants ------------------------------------------------------- */
    const repertoire = await tx.select("songs", { where: { communityId } });
    const titresConnus = new Map(
      repertoire.map((s) => [s.title.toLowerCase(), s.id]),
    );
    for (const ligne of lignes) {
      if (ligne.kind !== "chant" || ligne.skipped) continue;
      const titre = String(ligne.parsed.titre ?? "").trim();
      if (titre === "") continue;
      let songId = titresConnus.get(titre.toLowerCase());
      if (!songId) {
        songId = newId();
        await tx.insert("songs", {
          id: songId,
          communityId,
          title: titre,
          songKey: null,
          tempo: null,
          defaultLead: null,
          links: Array.isArray(ligne.parsed.liens)
            ? (ligne.parsed.liens as string[])
            : [],
          notes: null,
          archivedAt: null,
          createdAt: at,
        });
        titresConnus.set(titre.toLowerCase(), songId);
        rapport.chantsCrees += 1;
      }

      const colonne = String(ligne.parsed.colonne ?? "");
      const eventId = eventParDate.get(colonne);
      if (!eventId) continue;
      const existants = await tx.select("setlist_items", { where: { eventId } });
      const sequence = String(ligne.parsed.sequence ?? "Chant");
      if (existants.some((i) => i.sequence === sequence && i.songId === songId)) {
        continue;
      }
      await tx.insert("setlist_items", {
        id: newId(),
        communityId,
        eventId,
        sessionId: null,
        sequence,
        order: existants.length + 1,
        songId,
        freeTitle: null,
        links: Array.isArray(ligne.parsed.liens) ? (ligne.parsed.liens as string[]) : [],
        notes: null,
      });
    }

    /* --- Dress-codes -------------------------------------------------- */
    for (const ligne of lignes) {
      if (ligne.kind !== "dress_code" || ligne.skipped) continue;
      const colonne = String(ligne.parsed.colonne ?? "");
      const eventId = eventParDate.get(colonne);
      if (!eventId) continue;
      const existants = await tx.select("dress_codes", { where: { eventId } });
      if (existants.some((d) => d.teamId === null)) continue;
      await tx.insert("dress_codes", {
        id: newId(),
        communityId,
        eventId,
        teamId: null,
        theme: String(ligne.parsed.theme ?? ""),
        mood: String(ligne.parsed.mood ?? ""),
        colors: String(ligne.parsed.couleurs ?? "")
          .split(/[,+]/)
          .map((c) => c.trim())
          .filter((c) => c !== ""),
        materials: String(ligne.parsed.matieres ?? ""),
        instruction: String(ligne.parsed.theme ?? ""),
        updatedAt: at,
      });
      rapport.dressCodesCrees += 1;
    }

    await tx.update("import_jobs", jobId, {
      state: "importe",
      updatedAt: nowIso(),
    });

    await writeAudit(tx, {
      communityId,
      actorUserId: ctx.viewer.userId,
      action: "import.applique",
      targetType: "import_job",
      targetId: jobId,
      metadata: { ...rapport, rejets: rapport.rejets.length },
    });

    return ok(rapport);
  });
}

export async function listerImports(communityId: Id): Promise<ImportJob[]> {
  await requireCommunityAction(communityId, "communaute.importer");
  const adapter = getDataAdapter();
  return adapter.read((tx) =>
    tx.select("import_jobs", {
      where: { communityId },
      orderBy: { column: "createdAt", direction: "desc" },
      limit: 20,
    }),
  );
}
