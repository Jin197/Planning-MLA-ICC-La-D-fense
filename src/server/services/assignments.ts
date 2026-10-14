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
    whereIn: { id: plans.map((p) => p.sessionId) },
  });
  const events = await tx.select("events", {
    whereIn: { id: [...new Set(sessions.map((s) => s.eventId))] },
  });
  const eventById = new Map(events.map((e) => [e.id, e]));

  const out: Commitment[] = [];
  for (const plan of plans) {
    const session = sessions.find((s) => s.id === plan.sessionId);
    if (!session) continue;
    const event = eventById.get(session.eventId);
    if (!event || event.state === "annule") continue;
    out.push({
      kind: "creneau",
      communityId: session.communityId,
      eventId: session.eventId,
      refId: session.id,
      label: session.label,
      eventTitle: event.title,
      startsAt: session.startsAt,
      endsAt: session.endsAt,
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
    const session = await tx.selectOne("event_sessions", {
      where: { id: plan.sessionId },
    });
    if (!session) return err("creneau_inconnu", "Creneau introuvable.");

    const memberships = await tx.select("community_memberships", {
      where: { communityId, status: "active" },
    });
    const profiles = await tx.select("profiles", {
      whereIn: { id: memberships.map((m) => m.userId) },
    });
    const skills = await tx.select("skills", { where: { communityId } });
    const links = await tx.select("membership_skills", { where: { communityId } });
    const availabilities = await tx.select("session_availabilities", {
      where: { sessionId: session.id },
    });
    const sessionPlans = await tx.select("event_plans", {
      where: { sessionId: session.id },
    });
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
      const report = detectConflicts(
        { startsAt: session.startsAt, endsAt: session.endsAt, refId: session.id },
        commitments,
        communityId,
      );

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

    filtered.sort((a, b) => a.name.localeCompare(b.name, "fr"));
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
      const session = await tx.selectOne("event_sessions", {
        where: { id: plan.sessionId },
      });
      const event = await tx.selectOne("events", { where: { id: plan.eventId } });
      if (!session || !event) {
        return err("evenement_inconnu", "Evenement introuvable.");
      }
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

      const availabilityRow = await tx.selectOne("session_availabilities", {
        where: { sessionId: session.id, membershipId: membership.id },
      });
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
      const conflictReport = detectConflicts(
        { startsAt: session.startsAt, endsAt: session.endsAt, refId: session.id },
        commitments,
        communityId,
      );

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
        body: `Vous etes affecte au poste « ${slot.label} » sur « ${event.title} » (${session.label}). Merci de confirmer.`,
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
      const session = sessions.find((s) => s.id === plan?.sessionId);
      const membership = memberships.find((m) => m.id === assignment.membershipId);
      if (!session || !membership) continue;
      const commitments = await commitmentsForUser(tx, membership.userId);
      const report = detectConflicts(
        { startsAt: session.startsAt, endsAt: session.endsAt, refId: session.id },
        commitments,
        communityId,
      );
      if (report.hasConflict) count += 1;
    }
    return count;
  });
}
