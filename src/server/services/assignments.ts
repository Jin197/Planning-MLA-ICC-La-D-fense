import "server-only";
import { newId } from "@/lib/ids";
import { nowIso } from "@/lib/time";
import { err, ok, type Result } from "@/lib/result";
import { displayState } from "@/domain/availability";
import {
  canActorTransition,
  exceptionRequirement,
  findIncompatibleRoles,
  isExactDuplicate,
} from "@/domain/assignments";
import { detectConflicts, type Commitment, type ConflictDetail } from "@/domain/conflicts";
import type {
  AssignmentState,
  AvailabilityDisplayState,
  ExceptionKind,
  Id,
} from "@/domain/types";
import { getDataAdapter } from "../data";
import { ConstraintError, type Tx } from "../data/port";
import { requireActiveMembership, requireCommunityAction } from "../auth/context";
import { enqueueNotifications, writeAudit } from "../notifications/enqueue";

/**
 * Affectations : selection des candidats, ecriture avec exceptions tracees,
 * confirmation par le membre.
 */

export interface CandidateView {
  membershipId: Id;
  name: string;
  initials: string;
  skills: string[];
  availability: AvailabilityDisplayState;
  matchesSkills: boolean;
  /** La personne fait partie de l'effectif de l'equipe de ce plan. */
  inTeam: boolean;
  conflicts: ConflictDetail[];
  alreadyOnThisSlot: boolean;
  otherRolesThisSession: string[];
  /** Alerte d'incompatibilite, ex. piano et batterie au meme creneau. */
  incompatible: string[][];
}

/**
 * Charge les engagements d'une personne, toutes communautes confondues.
 * Le detail n'est conserve que pour la communaute consultee ; ailleurs le
 * conflit est signale sans reveler l'autre ministere.
 */
async function commitmentsForUser(
  tx: Tx,
  userId: Id,
): Promise<Commitment[]> {
  const memberships = (
    await tx.select("community_memberships", { where: { userId } })
  ).filter((m) => m.status === "active");
  if (memberships.length === 0) return [];

  const assignments = (
    await tx.select("assignments", {
      whereIn: { membershipId: memberships.map((m) => m.id) },
    })
  ).filter((a) => a.state !== "retiree");

  const plans = await tx.select("event_plans", {
    whereIn: { id: assignments.map((a) => a.planId) },
  });
  const sessions = await tx.select("event_sessions", {
    whereIn: {
      id: plans
        .map((p) => p.sessionId)
        .filter((id): id is Id => id !== null),
    },
  });
  const events = await tx.select("events", {
    whereIn: { id: [...new Set(plans.map((p) => p.eventId))] },
  });
  const eventById = new Map(events.map((e) => [e.id, e]));

  const out: Commitment[] = [];
  for (const plan of plans) {
    const event = eventById.get(plan.eventId);
    if (!event || event.state === "annule") continue;
    // Une equipe rattachee a tout l'evenement engage sur sa duree entiere.
    const session =
      plan.sessionId === null
        ? null
        : (sessions.find((s) => s.id === plan.sessionId) ?? null);
    if (plan.sessionId !== null && !session) continue;
    out.push({
      kind: "creneau",
      communityId: plan.communityId,
      eventId: plan.eventId,
      refId: session?.id ?? plan.eventId,
      label: session?.label ?? event.title,
      eventTitle: event.title,
      startsAt: session?.startsAt ?? event.startsAt,
      endsAt: session?.endsAt ?? event.endsAt,
    });
  }

  // Repetitions ou la presence est attendue.
  const rehearsalAvailabilities = await tx.select("rehearsal_availabilities", {
    whereIn: { membershipId: memberships.map((m) => m.id) },
  });
  const rehearsals = await tx.select("rehearsals", {
    whereIn: { id: rehearsalAvailabilities.map((r) => r.rehearsalId) },
  });
  for (const r of rehearsals) {
    const answer = rehearsalAvailabilities.find((a) => a.rehearsalId === r.id);
    if (!answer || answer.answer !== "disponible") continue;
    if (!r.attendanceExpected) continue;
    const event = await tx.selectOne("events", { where: { id: r.eventId } });
    if (!event || event.state === "annule") continue;
    out.push({
      kind: "repetition",
      communityId: r.communityId,
      eventId: r.eventId,
      refId: r.id,
      label: r.label,
      eventTitle: event.title,
      startsAt: r.startsAt,
      endsAt: r.endsAt,
    });
  }

  return out;
}

export async function listCandidates(
  communityId: Id,
  slotId: Id,
  options: { includeAll?: boolean; search?: string } = {},
): Promise<Result<{ candidates: CandidateView[]; slotLabel: string }>> {
  await requireCommunityAction(communityId, "affectation.ecrire");
  const adapter = getDataAdapter();
  const needle = (options.search ?? "").trim().toLowerCase();

  return adapter.read(async (tx) => {
    const slot = await tx.selectOne("event_role_slots", {
      where: { id: slotId, communityId },
    });
    if (!slot) return err("poste_inconnu", "Poste introuvable.");
    const plan = await tx.selectOne("event_plans", { where: { id: slot.planId } });
    if (!plan) return err("plan_inconnu", "Plan introuvable.");
    const event = await tx.selectOne("events", { where: { id: plan.eventId } });
    if (!event) return err("evenement_inconnu", "Evenement introuvable.");
    // Le plan vise un sous-evenement, ou toute la duree de l'evenement.
    const session =
      plan.sessionId === null
        ? null
        : await tx.selectOne("event_sessions", { where: { id: plan.sessionId } });
    if (plan.sessionId !== null && !session) {
      return err("sous_evenement_inconnu", "Sous-evenement introuvable.");
    }
    const occurrence = {
      refId: session?.id ?? event.id,
      startsAt: session?.startsAt ?? event.startsAt,
      endsAt: session?.endsAt ?? event.endsAt,
    };

    const memberships = await tx.select("community_memberships", {
      where: { communityId, status: "active" },
    });
    const profiles = await tx.select("profiles", {
      whereIn: { id: memberships.map((m) => m.userId) },
    });
    const skills = await tx.select("skills", { where: { communityId } });
    const links = await tx.select("membership_skills", { where: { communityId } });
    const teamMembers = await tx.select("event_team_members", {
      where: { teamId: plan.teamId },
    });
    const availabilities = (
      await tx.select("availabilities", { where: { eventId: plan.eventId } })
    ).filter((a) => a.sessionId === plan.sessionId);
    const sessionPlans = (
      await tx.select("event_plans", { where: { eventId: plan.eventId } })
    ).filter((p) => p.sessionId === plan.sessionId);
    const sessionSlots = await tx.select("event_role_slots", {
      whereIn: { planId: sessionPlans.map((p) => p.id) },
    });
    const sessionAssignments = (
      await tx.select("assignments", {
        whereIn: { planId: sessionPlans.map((p) => p.id) },
      })
    ).filter((a) => a.state !== "retiree");

    const profileById = new Map(profiles.map((p) => [p.id, p]));
    const skillById = new Map(skills.map((s) => [s.id, s.label]));
    const slotById = new Map(sessionSlots.map((s) => [s.id, s]));
    const slotLabelNorm = slot.label.trim().toLowerCase();

    const candidates: CandidateView[] = [];
    for (const membership of memberships) {
      const profile = profileById.get(membership.userId);
      if (!profile) continue;
      const fullName = `${profile.firstName} ${profile.lastName}`;
      if (needle !== "" && !fullName.toLowerCase().includes(needle)) continue;

      const memberSkills = links
        .filter((l) => l.membershipId === membership.id)
        .map((l) => skillById.get(l.skillId) ?? "")
        .filter(Boolean);
      const matchesSkills =
        memberSkills.length === 0
          ? false
          : memberSkills.some(
              (s) =>
                s.trim().toLowerCase() === slotLabelNorm ||
                slotLabelNorm.includes(s.trim().toLowerCase()),
            );

      const availability = displayState(
        availabilities.find((a) => a.membershipId === membership.id) ?? null,
      );

      const commitments = await commitmentsForUser(tx, membership.userId);
      const report = detectConflicts(occurrence, commitments, communityId);

      const otherRoles = sessionAssignments
        .filter((a) => a.membershipId === membership.id && a.slotId !== slotId)
        .map((a) => slotById.get(a.slotId)?.label ?? "")
        .filter(Boolean);

      candidates.push({
        membershipId: membership.id,
        name: fullName,
        initials: `${profile.firstName.charAt(0)}${profile.lastName.charAt(0)}`.toUpperCase(),
        skills: memberSkills,
        availability,
        matchesSkills,
        inTeam: teamMembers.some((t) => t.membershipId === membership.id),
        conflicts: report.conflicts,
        alreadyOnThisSlot: sessionAssignments.some(
          (a) => a.slotId === slotId && a.membershipId === membership.id,
        ),
        otherRolesThisSession: otherRoles,
        incompatible: findIncompatibleRoles([...otherRoles, slot.label]),
      });
    }

    // Par defaut : membres actifs, disponibles et compatibles avec le poste.
    const filtered = options.includeAll
      ? candidates
      : candidates.filter(
          (c) => c.availability === "disponible" && (c.matchesSkills || c.skills.length === 0),
        );

    // L'effectif de l'equipe d'abord : c'est la composition voulue par
    // l'admin, le reste de la communaute vient apres.
    filtered.sort(
      (a, b) =>
        Number(b.inTeam) - Number(a.inTeam) || a.name.localeCompare(b.name, "fr"),
    );
    return ok({ candidates: filtered, slotLabel: slot.label });
  });
}

export interface AssignInput {
  slotId: Id;
  membershipId: Id;
  detail?: string | null;
  /** Motif administratif, requis pour une affectation par exception. */
  exceptionReason?: string | null;
  /** L'admin a vu et accepte les alertes. */
  acceptExceptions?: boolean;
}

export async function assignMember(
  communityId: Id,
  input: AssignInput,
): Promise<Result<{ assignmentId: Id; exceptions: ExceptionKind[] }>> {
  const ctx = await requireCommunityAction(communityId, "affectation.ecrire");
  const adapter = getDataAdapter();

  try {
    return await adapter.transaction(async (tx) => {
      const slot = await tx.selectOne("event_role_slots", {
        where: { id: input.slotId, communityId },
      });
      if (!slot) return err("poste_inconnu", "Poste introuvable.");
      const plan = await tx.selectOne("event_plans", { where: { id: slot.planId } });
      if (!plan) return err("plan_inconnu", "Plan introuvable.");
      const event = await tx.selectOne("events", { where: { id: plan.eventId } });
      if (!event) return err("evenement_inconnu", "Evenement introuvable.");
      const session =
        plan.sessionId === null
          ? null
          : await tx.selectOne("event_sessions", { where: { id: plan.sessionId } });
      if (plan.sessionId !== null && !session) {
        return err("sous_evenement_inconnu", "Sous-evenement introuvable.");
      }
      const occurrence = {
        refId: session?.id ?? event.id,
        startsAt: session?.startsAt ?? event.startsAt,
        endsAt: session?.endsAt ?? event.endsAt,
      };
      if (event.state === "annule" || event.state === "archive") {
        return err(
          "evenement_ferme",
          "Aucune nouvelle affectation sur un evenement annule ou archive.",
        );
      }

      // L'adhesion active est revalidee cote serveur a l'ecriture.
      const membership = await tx.selectOne("community_memberships", {
        where: { id: input.membershipId, communityId, status: "active" },
      });
      if (!membership) {
        return err(
          "adhesion_inactive",
          "Cette personne n'est pas un membre actif de cette communaute.",
        );
      }

      const existing = await tx.select("assignments", { where: { slotId: slot.id } });
      if (isExactDuplicate(existing, { slotId: slot.id, membershipId: membership.id })) {
        return err(
          "doublon_exact",
          "Cette personne est deja affectee a ce poste.",
        );
      }

      const availabilityRow =
        (
          await tx.select("availabilities", {
            where: { eventId: event.id, membershipId: membership.id },
          })
        ).find((a) => a.sessionId === plan.sessionId) ?? null;
      const availability = displayState(availabilityRow);

      const skills = await tx.select("skills", { where: { communityId } });
      const links = await tx.select("membership_skills", {
        where: { membershipId: membership.id },
      });
      const memberSkills = links
        .map((l) => skills.find((s) => s.id === l.skillId)?.label ?? "")
        .filter(Boolean);
      const slotLabelNorm = slot.label.trim().toLowerCase();
      const matchesSkills =
        memberSkills.length === 0
          ? false
          : memberSkills.some(
              (s) =>
                s.trim().toLowerCase() === slotLabelNorm ||
                slotLabelNorm.includes(s.trim().toLowerCase()),
            );

      const commitments = await commitmentsForUser(tx, membership.userId);
      const conflictReport = detectConflicts(occurrence, commitments, communityId);

      const requirement = exceptionRequirement({
        availability,
        matchesSkills,
        hasConflict: conflictReport.hasConflict,
      });

      if (requirement.required) {
        if (!input.acceptExceptions) {
          return err("exception_a_confirmer", requirement.messages.join(" "), {
            kinds: requirement.kinds,
          });
        }
        if (
          requirement.kinds.some((k) => k === "indisponible" || k === "sans_reponse") &&
          !(input.exceptionReason ?? "").trim()
        ) {
          return err(
            "motif_administratif_requis",
            "Indiquez un motif administratif pour cette affectation par exception.",
          );
        }
      }

      const at = nowIso();
      const assignmentId = newId();
      await tx.insert("assignments", {
        id: assignmentId,
        communityId,
        planId: plan.id,
        slotId: slot.id,
        membershipId: membership.id,
        state: "a_confirmer",
        detail: input.detail?.trim() || null,
        exceptions: requirement.required
          ? requirement.kinds.map((kind) => ({
              kind,
              reason: (input.exceptionReason ?? "").trim() || "Accepte par l'admin.",
              byUserId: ctx.viewer.userId,
              at,
            }))
          : [],
        memberNote: null,
        createdBy: ctx.viewer.userId,
        createdAt: at,
        updatedAt: at,
      });

      // Une affectation abonne automatiquement son destinataire.
      await enqueueNotifications(tx, {
        kind: "affectation_nouvelle",
        recipientUserIds: [membership.userId],
        communityId,
        eventId: event.id,
        body: `Vous etes affecte au poste « ${slot.label} » sur « ${event.title} » (${session?.label ?? "tout l'evenement"}). Merci de confirmer.`,
        href: `/c/${communityId}/evenements/${event.id}`,
        subjectId: assignmentId,
      });

      await writeAudit(tx, {
        communityId,
        actorUserId: ctx.viewer.userId,
        action: "affectation.creee",
        targetType: "assignment",
        targetId: assignmentId,
        metadata: {
          slot: slot.label,
          exceptions: requirement.kinds,
          motif: input.exceptionReason ?? null,
        },
      });

      return ok({ assignmentId, exceptions: requirement.kinds });
    });
  } catch (error) {
    if (error instanceof ConstraintError) return err(error.code, error.message);
    throw error;
  }
}

export async function setAssignmentState(
  communityId: Id,
  assignmentId: Id,
  target: AssignmentState,
  note?: string | null,
): Promise<Result<{ state: AssignmentState }>> {
  const ctx = await requireActiveMembership(communityId);
  const adapter = getDataAdapter();

  return adapter.transaction(async (tx) => {
    const assignment = await tx.selectOne("assignments", {
      where: { id: assignmentId, communityId },
    });
    if (!assignment) return err("affectation_inconnue", "Affectation introuvable.");

    const membership = await tx.selectOne("community_memberships", {
      where: { id: assignment.membershipId },
    });
    const isOwner = membership?.userId === ctx.viewer.userId;
    const isAdmin = ctx.membership.role === "admin";
    if (!isOwner && !isAdmin) {
      return err(
        "non_autorise",
        "Vous ne pouvez repondre que pour vos propres affectations.",
      );
    }

    const actor = isAdmin && !isOwner ? "admin" : isOwner ? "membre" : "admin";
    if (!canActorTransition(actor, assignment.state, target)) {
      return err(
        "transition_invalide",
        `Passage impossible de « ${assignment.state} » a « ${target} ».`,
      );
    }

    const at = nowIso();
    await tx.update("assignments", assignmentId, {
      state: target,
      memberNote: note?.trim() || assignment.memberNote,
      updatedAt: at,
    });

    if (target === "a_remplacer") {
      const admins = await tx.select("community_memberships", {
        where: { communityId, status: "active", role: "admin" },
      });
      const plan = await tx.selectOne("event_plans", { where: { id: assignment.planId } });
      const event = plan
        ? await tx.selectOne("events", { where: { id: plan.eventId } })
        : null;
      const slot = await tx.selectOne("event_role_slots", {
        where: { id: assignment.slotId },
      });
      await enqueueNotifications(tx, {
        kind: "affectation_a_remplacer",
        recipientUserIds: admins.map((a) => a.userId),
        communityId,
        eventId: event?.id ?? null,
        body: `Un remplacement est necessaire sur le poste « ${slot?.label ?? "?"} » de « ${event?.title ?? "?"} ».`,
        href: event ? `/c/${communityId}/evenements/${event.id}` : null,
        subjectId: `${assignmentId}:a_remplacer`,
        revision: at,
      });
    }

    await writeAudit(tx, {
      communityId,
      actorUserId: ctx.viewer.userId,
      action: `affectation.${target}`,
      targetType: "assignment",
      targetId: assignmentId,
      metadata: { from: assignment.state, parSoi: isOwner },
    });

    return ok({ state: target });
  });
}

/** Retire une affectation. L'historique est conserve : l'etat passe a retiree. */
export async function removeAssignment(
  communityId: Id,
  assignmentId: Id,
): Promise<Result<{ assignmentId: Id }>> {
  const ctx = await requireCommunityAction(communityId, "affectation.ecrire");
  const adapter = getDataAdapter();
  return adapter.transaction(async (tx) => {
    const assignment = await tx.selectOne("assignments", {
      where: { id: assignmentId, communityId },
    });
    if (!assignment) return err("affectation_inconnue", "Affectation introuvable.");
    await tx.update("assignments", assignmentId, {
      state: "retiree",
      updatedAt: nowIso(),
    });
    await writeAudit(tx, {
      communityId,
      actorUserId: ctx.viewer.userId,
      action: "affectation.retiree",
      targetType: "assignment",
      targetId: assignmentId,
      metadata: {},
    });
    return ok({ assignmentId });
  });
}

/** Conflits d'un evenement, pour l'ecran de publication. */
export async function conflictCountForEvent(
  communityId: Id,
  eventId: Id,
): Promise<number> {
  await requireCommunityAction(communityId, "evenement.voir_affectations");
  const adapter = getDataAdapter();
  return adapter.read(async (tx) => {
    const event = await tx.selectOne("events", { where: { id: eventId, communityId } });
    if (!event) return 0;
    const plans = await tx.select("event_plans", { where: { eventId } });
    const assignments = (
      await tx.select("assignments", { whereIn: { planId: plans.map((p) => p.id) } })
    ).filter((a) => a.state !== "retiree");
    const sessions = await tx.select("event_sessions", { where: { eventId } });
    const memberships = await tx.select("community_memberships", {
      whereIn: { id: assignments.map((a) => a.membershipId) },
    });

    let count = 0;
    for (const assignment of assignments) {
      const plan = plans.find((p) => p.id === assignment.planId);
      if (!plan) continue;
      const session =
        plan.sessionId === null
          ? null
          : sessions.find((s) => s.id === plan.sessionId);
      if (plan.sessionId !== null && !session) continue;
      const membership = memberships.find((m) => m.id === assignment.membershipId);
      if (!membership) continue;
      const commitments = await commitmentsForUser(tx, membership.userId);
      const report = detectConflicts(
        {
          startsAt: session?.startsAt ?? event.startsAt,
          endsAt: session?.endsAt ?? event.endsAt,
          refId: session?.id ?? event.id,
        },
        commitments,
        communityId,
      );
      if (report.hasConflict) count += 1;
    }
    return count;
  });
}

/* -------------------------------------------------------------------------- */
/* Positionnement par le membre                                               */
/* -------------------------------------------------------------------------- */

/**
 * Un membre se place lui-meme sur un poste ouvert.
 *
 * C'est l'autre sens de l'affectation : l'admin compose, mais un membre
 * disponible peut aussi prendre un poste qui manque. Trois garde-fous, parce
 * qu'il n'y a ici aucun admin pour accepter une exception :
 *
 *  - il faut s'etre declare disponible sur cette occurrence ;
 *  - le poste doit etre encore ouvert ;
 *  - un chevauchement ou une incompatibilite refuse le positionnement au
 *    lieu de l'enregistrer avec une alerte.
 *
 * L'affectation est creee « confirmee » : la personne s'engage en se
 * positionnant, elle n'a rien a reconfirmer. Les admins en sont informes et
 * peuvent la retirer.
 */
export async function selfAssign(
  communityId: Id,
  input: { slotId: Id; detail?: string | null },
): Promise<Result<{ assignmentId: Id }>> {
  const ctx = await requireActiveMembership(communityId);
  const adapter = getDataAdapter();

  try {
    return await adapter.transaction(async (tx) => {
      const slot = await tx.selectOne("event_role_slots", {
        where: { id: input.slotId, communityId },
      });
      if (!slot) return err("poste_inconnu", "Poste introuvable.");
      if (!slot.enabled) {
        return err("poste_desactive", "Ce poste n'est pas utilise sur cet evenement.");
      }

      const plan = await tx.selectOne("event_plans", { where: { id: slot.planId } });
      if (!plan) return err("plan_inconnu", "Plan introuvable.");
      const event = await tx.selectOne("events", { where: { id: plan.eventId } });
      if (!event) return err("evenement_inconnu", "Evenement introuvable.");
      if (event.state !== "collecte" && event.state !== "publie") {
        return err(
          "evenement_ferme",
          "Les postes ne sont pas ouverts au positionnement sur cet evenement.",
        );
      }

      const session =
        plan.sessionId === null
          ? null
          : await tx.selectOne("event_sessions", { where: { id: plan.sessionId } });
      if (plan.sessionId !== null && !session) {
        return err("sous_evenement_inconnu", "Sous-evenement introuvable.");
      }

      /*
       * 1. La disponibilite declaree commande : pas de positionnement sans
       *    reponse, ni apres un changement d'horaire non reconfirme.
       *
       *    Une equipe rattachee a toute la duree engage sur chaque
       *    sous-evenement : il faut alors etre disponible partout.
       */
      const mesReponses = await tx.select("availabilities", {
        where: { eventId: event.id, membershipId: ctx.membership.membershipId },
      });
      const sessionsDeLEvenement = await tx.select("event_sessions", {
        where: { eventId: event.id },
      });
      const surToutLEvenement =
        plan.sessionId === null && sessionsDeLEvenement.length > 0;
      const attendues: (Id | null)[] = surToutLEvenement
        ? sessionsDeLEvenement.map((x) => x.id)
        : [plan.sessionId];

      const trouvees = attendues.map((sessionId) =>
        mesReponses.find((a) => a.sessionId === sessionId),
      );
      if (trouvees.some((a) => !a || a.answer !== "disponible")) {
        return err(
          "disponibilite_requise",
          surToutLEvenement
            ? "Cette equipe sert sur toute la duree de l'evenement : declarez-vous disponible sur chaque sous-evenement pour vous y positionner."
            : "Declarez-vous d'abord disponible sur ce creneau pour vous y positionner.",
        );
      }
      if (trouvees.some((a) => a?.needsReconfirmation)) {
        return err(
          "reconfirmation_requise",
          "Les horaires ont change : reconfirmez votre disponibilite avant de vous positionner.",
        );
      }

      // 2. Le poste doit etre encore ouvert.
      const surCePoste = (
        await tx.select("assignments", { where: { slotId: slot.id } })
      ).filter((a) => a.state !== "retiree");
      if (
        isExactDuplicate(surCePoste, {
          slotId: slot.id,
          membershipId: ctx.membership.membershipId,
        })
      ) {
        return err("deja_positionne", "Vous tenez deja ce poste.");
      }
      const comptes = surCePoste.filter((a) => a.state !== "a_remplacer");
      const manquants = Math.max(0, slot.minRequired - comptes.length);
      const ouvert =
        manquants > 0 || (slot.minRequired === 0 && comptes.length === 0);
      if (!ouvert) {
        return err(
          "poste_pourvu",
          "Ce poste est deja pourvu. Demandez a un admin si vous souhaitez tout de meme y figurer.",
        );
      }

      // 3. Chevauchement et incompatibilites : refus, pas d'alerte.
      const commitments = await commitmentsForUser(tx, ctx.viewer.userId);
      const conflits = detectConflicts(
        {
          refId: session?.id ?? event.id,
          startsAt: session?.startsAt ?? event.startsAt,
          endsAt: session?.endsAt ?? event.endsAt,
        },
        commitments,
        communityId,
      );
      if (conflits.hasConflict) {
        // Un conflit hors de cette communaute reste masque : on signale le
        // chevauchement sans nommer l'autre ministere.
        const details = conflits.conflicts
          .map((c) =>
            c.visibility === "detaille"
              ? `${c.label} (${c.eventTitle})`
              : "un engagement dans un autre ministere",
          )
          .join(", ");
        return err(
          "chevauchement",
          `Vous etes deja engage sur un horaire qui chevauche celui-ci : ${details}. Demandez a un admin.`,
        );
      }

      const planFrere = (
        await tx.select("event_plans", { where: { eventId: event.id } })
      ).filter((p) => p.sessionId === plan.sessionId);
      const slotsFreres = await tx.select("event_role_slots", {
        whereIn: { planId: planFrere.map((p) => p.id) },
      });
      const mesAutresPostes = (
        await tx.select("assignments", {
          where: { membershipId: ctx.membership.membershipId },
        })
      )
        .filter((a) => a.state !== "retiree")
        .map((a) => slotsFreres.find((s) => s.id === a.slotId)?.label)
        .filter((label): label is string => label !== undefined);
      const incompatibles = findIncompatibleRoles([...mesAutresPostes, slot.label]);
      if (incompatibles.length > 0) {
        return err(
          "postes_incompatibles",
          `Vous tenez deja un poste difficilement compatible avec « ${slot.label} » : ${incompatibles
            .map((paire) => paire.join(" et "))
            .join(", ")}. Demandez a un admin.`,
        );
      }

      const at = nowIso();
      const assignmentId = newId();
      await tx.insert("assignments", {
        id: assignmentId,
        communityId,
        planId: plan.id,
        slotId: slot.id,
        membershipId: ctx.membership.membershipId,
        // La personne s'engage en se positionnant : rien a reconfirmer.
        state: "confirmee",
        detail: input.detail?.trim() || null,
        exceptions: [],
        memberNote: null,
        createdBy: ctx.viewer.userId,
        createdAt: at,
        updatedAt: at,
      });

      const equipe = await tx.selectOne("event_teams", { where: { id: plan.teamId } });
      const profile = await tx.selectOne("profiles", {
        where: { id: ctx.viewer.userId },
      });
      const admins = await tx.select("community_memberships", {
        where: { communityId, status: "active", role: "admin" },
      });
      await enqueueNotifications(tx, {
        kind: "positionnement",
        recipientUserIds: admins.map((a) => a.userId),
        communityId,
        eventId: event.id,
        body: `${profile ? `${profile.firstName} ${profile.lastName}` : "Un membre"} s'est positionne sur « ${slot.label} » (${equipe?.name ?? "equipe"}${session ? `, ${session.label}` : ""}) pour « ${event.title} ».`,
        href: `/c/${communityId}/evenements/${event.id}`,
        subjectId: assignmentId,
      });

      await writeAudit(tx, {
        communityId,
        actorUserId: ctx.viewer.userId,
        action: "affectation.positionnement",
        targetType: "assignment",
        targetId: assignmentId,
        metadata: { poste: slot.label, equipe: equipe?.name ?? null },
      });

      return ok({ assignmentId });
    });
  } catch (error) {
    if (error instanceof ConstraintError) return err(error.code, error.message);
    throw error;
  }
}
