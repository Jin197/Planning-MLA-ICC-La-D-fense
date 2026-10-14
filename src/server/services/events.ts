import "server-only";
import { newId } from "@/lib/ids";
import { err, ok, type Result } from "@/lib/result";
import { localToUtc, nowIso, type LocalDateTimeInput } from "@/lib/time";
import { isSignificantScheduleChange } from "@/domain/availability";
import {
  canTransitionEvent,
  computePublicationReadiness,
  type DuplicateOptions,
  type PublicationReadiness,
} from "@/domain/events";
import { canSeeAssignments, canSeeEvent } from "@/domain/permissions";
import { copyTemplateIntoPlan } from "@/domain/template";
import type {
  Assignment,
  DressCode,
  Event,
  EventPlan,
  EventRoleSlot,
  EventSession,
  EventState,
  Id,
  Rehearsal,
  SessionAvailability,
  SetlistItem,
  Team,
} from "@/domain/types";
import { getDataAdapter } from "../data";
import { ConstraintError, VersionConflictError, type Tx } from "../data/port";
import {
  getCommunityContext,
  requireActiveMembership,
  requireCommunityAction,
} from "../auth/context";
import { enqueueNotifications, writeAudit } from "../notifications/enqueue";
import { scheduleRemindersForEvent } from "./reminders";

/* -------------------------------------------------------------------------- */
/* Creation                                                                   */
/* -------------------------------------------------------------------------- */

export interface SessionDraft {
  label: string;
  start: LocalDateTimeInput;
  end: LocalDateTimeInput;
  locationName: string;
  locationAddress: string;
  scheduleProvisional?: boolean;
}

export interface RehearsalDraft {
  label: string;
  start: LocalDateTimeInput;
  end: LocalDateTimeInput;
  locationName: string;
  locationAddress: string;
  room: string;
  teamIds: Id[];
}

export interface CreateEventInput {
  title: string;
  description: string;
  sessions: SessionDraft[];
  /** Equipes a preparer sur chaque creneau. */
  teamIds: Id[];
  rehearsals: RehearsalDraft[];
  responseDeadline?: LocalDateTimeInput | null;
  /** Ouvrir directement la collecte des disponibilites. */
  openCollection: boolean;
}

export async function createEvent(
  communityId: Id,
  input: CreateEventInput,
): Promise<Result<{ eventId: Id }>> {
  const ctx = await requireCommunityAction(communityId, "evenement.creer");
  const adapter = getDataAdapter();

  if (input.title.trim() === "") {
    return err("titre_requis", "Le nom de l'evenement est requis.");
  }
  if (input.sessions.length === 0) {
    return err("creneau_requis", "Ajoutez au moins un creneau date.");
  }

  try {
    return await adapter.transaction(async (tx) => {
      const community = await tx.selectOne("communities", {
        where: { id: communityId },
      });
      if (!community) return err("communaute_inconnue", "Communaute introuvable.");
      const tz = community.timezone;
      const at = nowIso();
      const eventId = newId();

      const event: Event = {
        id: eventId,
        communityId,
        title: input.title.trim(),
        description: input.description.trim(),
        state: input.openCollection ? "collecte" : "brouillon",
        timezone: tz,
        version: 1,
        publishedVersion: 0,
        responseDeadline: input.responseDeadline
          ? localToUtc(input.responseDeadline, tz)
          : null,
        publishedAt: null,
        cancelledAt: null,
        cancelReason: null,
        archivedAt: null,
        createdBy: ctx.viewer.userId,
        createdAt: at,
        updatedAt: at,
      };
      await tx.insert("events", event);

      const sessions: EventSession[] = [];
      for (const [index, draft] of input.sessions.entries()) {
        const session: EventSession = {
          id: newId(),
          communityId,
          eventId,
          label: draft.label.trim() || `Creneau ${index + 1}`,
          ordinal: index + 1,
          startsAt: localToUtc(draft.start, tz),
          endsAt: localToUtc(draft.end, tz),
          locationName: draft.locationName.trim(),
          locationAddress: draft.locationAddress.trim(),
          scheduleProvisional: draft.scheduleProvisional ?? false,
        };
        await tx.insert("event_sessions", session);
        sessions.push(session);
      }

      // Un plan par equipe et par creneau, avec les postes copies du modele.
      const template = await tx.selectOne("planning_templates", {
        where: { communityId },
      });
      const fields = template
        ? await tx.select("template_fields", { where: { templateId: template.id } })
        : [];
      const teams = await tx.select("teams", { where: { communityId } });
      const selectedTeams = teams.filter((t) => input.teamIds.includes(t.id));

      for (const session of sessions) {
        for (const team of selectedTeams) {
          const plan: EventPlan = {
            id: newId(),
            communityId,
            eventId,
            sessionId: session.id,
            teamId: team.id,
            templateVersion: template?.version ?? 1,
            createdAt: at,
          };
          await tx.insert("event_plans", plan);
          const slots = copyTemplateIntoPlan(fields, {
            communityId,
            planId: plan.id,
          });
          await tx.insertMany("event_role_slots", slots);
        }
      }

      for (const draft of input.rehearsals) {
        const rehearsal: Rehearsal = {
          id: newId(),
          communityId,
          eventId,
          label: draft.label.trim() || "Repetition",
          startsAt: localToUtc(draft.start, tz),
          endsAt: localToUtc(draft.end, tz),
          locationName: draft.locationName.trim(),
          locationAddress: draft.locationAddress.trim(),
          room: draft.room.trim(),
          attendanceExpected: true,
        };
        await tx.insert("rehearsals", rehearsal);
        for (const teamId of draft.teamIds) {
          if (!teams.some((t) => t.id === teamId)) continue;
          await tx.insert("rehearsal_teams", {
            id: newId(),
            communityId,
            rehearsalId: rehearsal.id,
            teamId,
          });
        }
      }

      if (input.openCollection) {
        const members = await tx.select("community_memberships", {
          where: { communityId, status: "active" },
        });
        await enqueueNotifications(tx, {
          kind: "collecte_ouverte",
          recipientUserIds: members.map((m) => m.userId),
          communityId,
          eventId,
          body: `Repondez a vos disponibilites pour « ${event.title} ».`,
          href: `/c/${communityId}/evenements/${eventId}`,
          subjectId: eventId,
          revision: "collecte",
        });
      }

      await writeAudit(tx, {
        communityId,
        actorUserId: ctx.viewer.userId,
        action: "evenement.cree",
        targetType: "event",
        targetId: eventId,
        metadata: { creneaux: sessions.length, equipes: selectedTeams.length },
      });

      return ok({ eventId });
    });
  } catch (error) {
    if (error instanceof ConstraintError) return err(error.code, error.message);
    throw error;
  }
}

/* -------------------------------------------------------------------------- */
/* Lecture                                                                    */
/* -------------------------------------------------------------------------- */

export interface EventListItem {
  id: Id;
  title: string;
  state: EventState;
  timezone: string;
  sessions: EventSession[];
  rehearsals: Rehearsal[];
  /** Nombre de creneaux ou le membre n'a pas encore repondu. */
  myMissingResponses: number;
  /** Mes affectations sur cet evenement. */
  myAssignments: { label: string; sessionLabel: string; state: Assignment["state"] }[];
}

export async function listEvents(
  communityId: Id,
  options: { from?: string; to?: string } = {},
): Promise<EventListItem[]> {
  const ctx = await requireActiveMembership(communityId);
  const adapter = getDataAdapter();

  return adapter.read(async (tx) => {
    const events = await tx.select("events", {
      where: { communityId },
      orderBy: { column: "createdAt", direction: "desc" },
    });
    const visible = events.filter((e) => canSeeEvent(ctx.membership, e.state));
    const eventIds = visible.map((e) => e.id);
    const sessions = await tx.select("event_sessions", {
      whereIn: { eventId: eventIds },
    });
    const rehearsals = await tx.select("rehearsals", {
      whereIn: { eventId: eventIds },
    });
    const availabilities = await tx.select("session_availabilities", {
      where: { membershipId: ctx.membership.membershipId },
    });
    const plans = await tx.select("event_plans", { whereIn: { eventId: eventIds } });
    const myAssignments = await tx.select("assignments", {
      where: { membershipId: ctx.membership.membershipId },
    });
    const slots = await tx.select("event_role_slots", {
      whereIn: { planId: plans.map((p) => p.id) },
    });

    const slotById = new Map(slots.map((s) => [s.id, s]));
    const planById = new Map(plans.map((p) => [p.id, p]));
    const sessionById = new Map(sessions.map((s) => [s.id, s]));

    const inRange = (s: EventSession) => {
      if (options.from && s.startsAt < options.from) return false;
      if (options.to && s.startsAt > options.to) return false;
      return true;
    };

    return visible
      .map((e): EventListItem => {
        const own = sessions.filter((s) => s.eventId === e.id);
        const answered = new Set(
          availabilities
            .filter((a) => own.some((s) => s.id === a.sessionId))
            .map((a) => a.sessionId),
        );
        const mine = myAssignments
          .filter((a) => {
            const plan = planById.get(a.planId);
            return plan?.eventId === e.id && a.state !== "retiree";
          })
          .filter(() => canSeeAssignments(ctx.membership, e.state))
          .map((a) => {
            const plan = planById.get(a.planId);
            const session = plan ? sessionById.get(plan.sessionId) : undefined;
            return {
              label: slotById.get(a.slotId)?.label ?? "Poste",
              sessionLabel: session?.label ?? "",
              state: a.state,
            };
          });
        return {
          id: e.id,
          title: e.title,
          state: e.state,
          timezone: e.timezone,
          sessions: own.sort((a, b) => a.ordinal - b.ordinal),
          rehearsals: rehearsals.filter((r) => r.eventId === e.id),
          myMissingResponses: own.filter((s) => !answered.has(s.id)).length,
          myAssignments: mine,
        };
      })
      .filter((e) => e.sessions.length === 0 || e.sessions.some(inRange))
      .sort((a, b) => {
        const sa = a.sessions[0]?.startsAt ?? "";
        const sb = b.sessions[0]?.startsAt ?? "";
        return sa < sb ? -1 : sa > sb ? 1 : 0;
      });
  });
}

export interface AssignmentView {
  id: Id;
  membershipId: Id;
  name: string;
  initials: string;
  state: Assignment["state"];
  detail: string | null;
  isMine: boolean;
  exceptions: Assignment["exceptions"];
}

export interface SlotView {
  id: Id;
  label: string;
  order: number;
  minRequired: number;
  enabled: boolean;
  allowsDetail: boolean;
  assignments: AssignmentView[];
  missing: number;
  incomplete: boolean;
}

export interface PlanView {
  id: Id;
  teamId: Id;
  teamName: string;
  slots: SlotView[];
}

export interface SessionView {
  session: EventSession;
  plans: PlanView[];
  /** Ma reponse de disponibilite sur ce creneau. */
  myAvailability: SessionAvailability | null;
  myReason: string | null;
  /** Vue d'ensemble des reponses, reservee aux admins. */
  responseSummary: { disponible: number; indisponible: number; aRenseigner: number } | null;
  setlist: SetlistItem[];
}

export interface EventDetail {
  event: Event;
  sessions: SessionView[];
  rehearsals: (Rehearsal & {
    teamIds: Id[];
    myAvailability: { answer: string; needsReconfirmation: boolean } | null;
  })[];
  dressCodes: DressCode[];
  teams: Team[];
  canSeePlan: boolean;
  isAdmin: boolean;
  readiness: PublicationReadiness | null;
  unreadMessages: number;
}

export async function getEventDetail(
  communityId: Id,
  eventId: Id,
): Promise<Result<EventDetail>> {
  const ctx = await requireActiveMembership(communityId);
  const adapter = getDataAdapter();
  const isAdmin = ctx.membership.role === "admin";

  return adapter.read(async (tx) => {
    const event = await tx.selectOne("events", { where: { id: eventId, communityId } });
    if (!event) return err("evenement_inconnu", "Evenement introuvable.");
    if (!canSeeEvent(ctx.membership, event.state)) {
      return err("evenement_non_visible", "Cet evenement n'est pas accessible.");
    }

    const showPlan = canSeeAssignments(ctx.membership, event.state);
    const sessions = (
      await tx.select("event_sessions", { where: { eventId } })
    ).sort((a, b) => a.ordinal - b.ordinal);
    const plans = await tx.select("event_plans", { where: { eventId } });
    const slots = await tx.select("event_role_slots", {
      whereIn: { planId: plans.map((p) => p.id) },
    });
    const assignments = await tx.select("assignments", {
      whereIn: { planId: plans.map((p) => p.id) },
    });
    const teams = await tx.select("teams", { where: { communityId } });
    const memberships = await tx.select("community_memberships", {
      where: { communityId },
    });
    const profiles = await tx.select("profiles", {
      whereIn: { id: memberships.map((m) => m.userId) },
    });
    const availabilities = await tx.select("session_availabilities", {
      whereIn: { sessionId: sessions.map((s) => s.id) },
    });
    const reasons = await tx.select("availability_reasons", {
      whereIn: { availabilityId: availabilities.map((a) => a.id) },
    });
    const setlist = await tx.select("setlist_items", { where: { eventId } });
    const dressCodes = await tx.select("dress_codes", { where: { eventId } });
    const rehearsals = await tx.select("rehearsals", { where: { eventId } });
    const rehearsalTeams = await tx.select("rehearsal_teams", {
      whereIn: { rehearsalId: rehearsals.map((r) => r.id) },
    });
    const rehearsalAvailabilities = await tx.select("rehearsal_availabilities", {
      where: { membershipId: ctx.membership.membershipId },
    });
    const messages = await tx.select("event_messages", { where: { eventId } });
    const cursor = await tx.selectOne("message_read_cursors", {
      where: { eventId, userId: ctx.viewer.userId },
    });

    const profileById = new Map(profiles.map((p) => [p.id, p]));
    const membershipById = new Map(memberships.map((m) => [m.id, m]));
    const activeMembers = memberships.filter((m) => m.status === "active");

    const nameOf = (membershipId: Id) => {
      const membership = membershipById.get(membershipId);
      const profile = membership ? profileById.get(membership.userId) : undefined;
      if (!profile) return { name: "Membre retire", initials: "--" };
      return {
        name: `${profile.firstName} ${profile.lastName}`,
        initials: `${profile.firstName.charAt(0)}${profile.lastName.charAt(0)}`.toUpperCase(),
      };
    };

    const sessionViews: SessionView[] = sessions.map((session) => {
      const sessionPlans = plans.filter((p) => p.sessionId === session.id);
      const planViews: PlanView[] = showPlan
        ? sessionPlans.map((plan) => {
            const planSlots = slots
              .filter((s) => s.planId === plan.id)
              .sort((a, b) => a.order - b.order);
            return {
              id: plan.id,
              teamId: plan.teamId,
              teamName: teams.find((t) => t.id === plan.teamId)?.name ?? "Equipe",
              slots: planSlots.map((slot): SlotView => {
                const slotAssignments = assignments.filter(
                  (a) => a.slotId === slot.id && a.state !== "retiree",
                );
                const counted = slotAssignments.filter(
                  (a) => a.state !== "a_remplacer",
                );
                const missing = slot.enabled
                  ? Math.max(0, slot.minRequired - counted.length)
                  : 0;
                return {
                  id: slot.id,
                  label: slot.label,
                  order: slot.order,
                  minRequired: slot.minRequired,
                  enabled: slot.enabled,
                  allowsDetail: slot.allowsDetail,
                  missing,
                  incomplete: slot.enabled && missing > 0,
                  assignments: slotAssignments.map((a): AssignmentView => {
                    const who = nameOf(a.membershipId);
                    return {
                      id: a.id,
                      membershipId: a.membershipId,
                      name: who.name,
                      initials: who.initials,
                      state: a.state,
                      detail: a.detail,
                      isMine: a.membershipId === ctx.membership.membershipId,
                      // Les exceptions administratives restent aux admins.
                      exceptions: isAdmin ? a.exceptions : [],
                    };
                  }),
                };
              }),
            };
          })
        : [];

      const mine =
        availabilities.find(
          (a) =>
            a.sessionId === session.id &&
            a.membershipId === ctx.membership.membershipId,
        ) ?? null;
      const myReason = mine
        ? (reasons.find((r) => r.availabilityId === mine.id)?.text ?? null)
        : null;

      const sessionAvailabilities = availabilities.filter(
        (a) => a.sessionId === session.id,
      );
      const summary = isAdmin
        ? {
            disponible: sessionAvailabilities.filter((a) => a.answer === "disponible")
              .length,
            indisponible: sessionAvailabilities.filter(
              (a) => a.answer === "indisponible",
            ).length,
            aRenseigner: Math.max(
              0,
              activeMembers.length - sessionAvailabilities.length,
            ),
          }
        : null;

      return {
        session,
        plans: planViews,
        myAvailability: mine,
        myReason,
        responseSummary: summary,
        setlist: setlist
          .filter((i) => i.sessionId === session.id)
          .sort((a, b) => a.order - b.order),
      };
    });

    const readiness = isAdmin
      ? computePublicationReadiness({
          sessions,
          plans,
          slots,
          assignments: assignments.filter((a) => a.state !== "retiree"),
          missingResponses: Math.max(
            0,
            sessions.length * activeMembers.length - availabilities.length,
          ),
          conflictCount: 0,
        })
      : null;

    const lastRead = cursor?.lastReadAt ?? "1970-01-01T00:00:00.000Z";
    const unread = messages.filter(
      (m) =>
        m.deletedAt === null &&
        m.createdAt > lastRead &&
        m.authorUserId !== ctx.viewer.userId,
    ).length;

    return ok({
      event,
      sessions: sessionViews,
      rehearsals: rehearsals.map((r) => {
        const mine = rehearsalAvailabilities.find((a) => a.rehearsalId === r.id);
        return {
          ...r,
          teamIds: rehearsalTeams
            .filter((rt) => rt.rehearsalId === r.id)
            .map((rt) => rt.teamId),
          myAvailability: mine
            ? { answer: mine.answer, needsReconfirmation: mine.needsReconfirmation }
            : null,
        };
      }),
      dressCodes,
      teams,
      canSeePlan: showPlan,
      isAdmin,
      readiness,
      unreadMessages: unread,
    });
  });
}

/* -------------------------------------------------------------------------- */
/* Modification                                                               */
/* -------------------------------------------------------------------------- */

export interface UpdateEventInput {
  expectedVersion: number;
  title?: string;
  description?: string;
  responseDeadline?: LocalDateTimeInput | null;
}

/**
 * Verrouillage optimiste : si deux admins modifient la meme version, la
 * seconde ecriture est refusee avec un message explicite au lieu d'ecraser.
 */
async function bumpVersion(
  tx: Tx,
  event: Event,
  expectedVersion: number,
): Promise<Event> {
  const fresh = await tx.selectOne("events", { where: { id: event.id } });
  if (!fresh) throw new ConstraintError("event_missing", "Evenement introuvable.");
  if (fresh.version !== expectedVersion) {
    throw new VersionConflictError(
      "Cet evenement a ete modifie par un autre admin. Rechargez pour voir la version a jour.",
      fresh.version,
    );
  }
  return tx.update("events", event.id, {
    version: fresh.version + 1,
    updatedAt: nowIso(),
  });
}

export async function updateEvent(
  communityId: Id,
  eventId: Id,
  input: UpdateEventInput,
): Promise<Result<{ version: number }>> {
  const ctx = await getCommunityContext(communityId);
  const adapter = getDataAdapter();

  try {
    return await adapter.transaction(async (tx) => {
      const event = await tx.selectOne("events", { where: { id: eventId, communityId } });
      if (!event) return err("evenement_inconnu", "Evenement introuvable.");
      await requireCommunityAction(communityId, "evenement.modifier", {
        eventState: event.state,
      });

      const patch: Partial<Event> = {};
      if (input.title !== undefined) {
        if (input.title.trim() === "") {
          return err("titre_requis", "Le nom de l'evenement est requis.");
        }
        patch.title = input.title.trim();
      }
      if (input.description !== undefined) patch.description = input.description.trim();
      if (input.responseDeadline !== undefined) {
        patch.responseDeadline = input.responseDeadline
          ? localToUtc(input.responseDeadline, event.timezone)
          : null;
      }

      const updated = await bumpVersion(tx, event, input.expectedVersion);
      await tx.update("events", eventId, patch);

      // Une correction de description ne remet aucune reponse a zero.
      await writeAudit(tx, {
        communityId,
        actorUserId: ctx.viewer.userId,
        action: "evenement.modifie",
        targetType: "event",
        targetId: eventId,
        metadata: { champs: Object.keys(patch) },
      });

      return ok({ version: updated.version });
    });
  } catch (error) {
    if (error instanceof VersionConflictError) {
      return err("conflit_de_version", error.message, {
        currentVersion: error.currentVersion,
      });
    }
    if (error instanceof ConstraintError) return err(error.code, error.message);
    throw error;
  }
}

/**
 * Deplacement d'un creneau. Les personnes concernees doivent reconfirmer
 * leur disponibilite et leur affectation ; les reponses initiales sont
 * conservees et marquees « a reconfirmer ».
 */
export async function updateSessionSchedule(
  communityId: Id,
  sessionId: Id,
  input: {
    expectedVersion: number;
    label?: string;
    start?: LocalDateTimeInput;
    end?: LocalDateTimeInput;
    locationName?: string;
    locationAddress?: string;
    clearProvisional?: boolean;
  },
): Promise<Result<{ version: number; reconfirmations: number }>> {
  const ctx = await getCommunityContext(communityId);
  const adapter = getDataAdapter();

  try {
    return await adapter.transaction(async (tx) => {
      const session = await tx.selectOne("event_sessions", {
        where: { id: sessionId, communityId },
      });
      if (!session) return err("creneau_inconnu", "Creneau introuvable.");
      const event = await tx.selectOne("events", { where: { id: session.eventId } });
      if (!event) return err("evenement_inconnu", "Evenement introuvable.");
      await requireCommunityAction(communityId, "evenement.modifier", {
        eventState: event.state,
      });

      const patch: Partial<EventSession> = {};
      if (input.label !== undefined) patch.label = input.label.trim();
      if (input.locationName !== undefined) patch.locationName = input.locationName.trim();
      if (input.locationAddress !== undefined) {
        patch.locationAddress = input.locationAddress.trim();
      }
      if (input.start) patch.startsAt = localToUtc(input.start, event.timezone);
      if (input.end) patch.endsAt = localToUtc(input.end, event.timezone);
      if (input.clearProvisional) patch.scheduleProvisional = false;

      const after = {
        startsAt: patch.startsAt ?? session.startsAt,
        endsAt: patch.endsAt ?? session.endsAt,
      };
      if (new Date(after.endsAt) <= new Date(after.startsAt)) {
        return err("horaire_invalide", "La fin doit suivre le debut.");
      }

      const significant = isSignificantScheduleChange(session, after);
      const updated = await bumpVersion(tx, event, input.expectedVersion);
      await tx.update("event_sessions", sessionId, patch);

      let reconfirmations = 0;
      if (significant) {
        const availabilities = await tx.select("session_availabilities", {
          where: { sessionId },
        });
        for (const a of availabilities) {
          await tx.update("session_availabilities", a.id, {
            needsReconfirmation: true,
            updatedAt: nowIso(),
          });
          reconfirmations += 1;
        }

        const plans = await tx.select("event_plans", { where: { sessionId } });
        const assignments = (
          await tx.select("assignments", {
            whereIn: { planId: plans.map((p) => p.id) },
          })
        ).filter((a) => a.state === "confirmee");
        for (const a of assignments) {
          await tx.update("assignments", a.id, {
            state: "a_confirmer",
            updatedAt: nowIso(),
          });
        }

        const membershipIds = new Set([
          ...availabilities.map((a) => a.membershipId),
          ...assignments.map((a) => a.membershipId),
        ]);
        const memberships = await tx.select("community_memberships", {
          whereIn: { id: [...membershipIds] },
        });
        await enqueueNotifications(tx, {
          kind: "modification_importante",
          recipientUserIds: memberships
            .filter((m) => m.status === "active")
            .map((m) => m.userId),
          communityId,
          eventId: event.id,
          body: `Les horaires du creneau « ${patch.label ?? session.label} » de « ${event.title} » ont change. Merci de reconfirmer.`,
          href: `/c/${communityId}/evenements/${event.id}`,
          subjectId: `${sessionId}:horaire`,
          revision: updated.version,
        });

        await scheduleRemindersForEvent(tx, event.id);
      }

      await writeAudit(tx, {
        communityId,
        actorUserId: ctx.viewer.userId,
        action: "creneau.modifie",
        targetType: "event_session",
        targetId: sessionId,
        metadata: { significant, reconfirmations },
      });

      return ok({ version: updated.version, reconfirmations });
    });
  } catch (error) {
    if (error instanceof VersionConflictError) {
      return err("conflit_de_version", error.message);
    }
    if (error instanceof ConstraintError) return err(error.code, error.message);
    throw error;
  }
}

export async function addSession(
  communityId: Id,
  eventId: Id,
  draft: SessionDraft & { teamIds?: Id[]; expectedVersion: number },
): Promise<Result<{ sessionId: Id }>> {
  const ctx = await getCommunityContext(communityId);
  const adapter = getDataAdapter();
  try {
    return await adapter.transaction(async (tx) => {
      const event = await tx.selectOne("events", { where: { id: eventId, communityId } });
      if (!event) return err("evenement_inconnu", "Evenement introuvable.");
      await requireCommunityAction(communityId, "evenement.modifier", {
        eventState: event.state,
      });
      const existing = await tx.select("event_sessions", { where: { eventId } });
      const session: EventSession = {
        id: newId(),
        communityId,
        eventId,
        label: draft.label.trim() || `Creneau ${existing.length + 1}`,
        ordinal: existing.length + 1,
        startsAt: localToUtc(draft.start, event.timezone),
        endsAt: localToUtc(draft.end, event.timezone),
        locationName: draft.locationName.trim(),
        locationAddress: draft.locationAddress.trim(),
        scheduleProvisional: draft.scheduleProvisional ?? false,
      };
      await bumpVersion(tx, event, draft.expectedVersion);
      await tx.insert("event_sessions", session);

      const template = await tx.selectOne("planning_templates", {
        where: { communityId },
      });
      const fields = template
        ? await tx.select("template_fields", { where: { templateId: template.id } })
        : [];
      const teams = await tx.select("teams", { where: { communityId } });
      const teamIds =
        draft.teamIds && draft.teamIds.length > 0
          ? draft.teamIds
          : [...new Set((await tx.select("event_plans", { where: { eventId } })).map((p) => p.teamId))];

      for (const teamId of teamIds) {
        if (!teams.some((t) => t.id === teamId)) continue;
        const plan: EventPlan = {
          id: newId(),
          communityId,
          eventId,
          sessionId: session.id,
          teamId,
          templateVersion: template?.version ?? 1,
          createdAt: nowIso(),
        };
        await tx.insert("event_plans", plan);
        await tx.insertMany(
          "event_role_slots",
          copyTemplateIntoPlan(fields, { communityId, planId: plan.id }),
        );
      }

      await writeAudit(tx, {
        communityId,
        actorUserId: ctx.viewer.userId,
        action: "creneau.ajoute",
        targetType: "event_session",
        targetId: session.id,
        metadata: {},
      });
      return ok({ sessionId: session.id });
    });
  } catch (error) {
    if (error instanceof VersionConflictError) {
      return err("conflit_de_version", error.message);
    }
    if (error instanceof ConstraintError) return err(error.code, error.message);
    throw error;
  }
}

export async function addPlan(
  communityId: Id,
  input: { sessionId: Id; teamId: Id; expectedVersion: number },
): Promise<Result<{ planId: Id }>> {
  const adapter = getDataAdapter();
  try {
    return await adapter.transaction(async (tx) => {
      const session = await tx.selectOne("event_sessions", {
        where: { id: input.sessionId, communityId },
      });
      if (!session) return err("creneau_inconnu", "Creneau introuvable.");
      const event = await tx.selectOne("events", { where: { id: session.eventId } });
      if (!event) return err("evenement_inconnu", "Evenement introuvable.");
      await requireCommunityAction(communityId, "evenement.modifier", {
        eventState: event.state,
      });
      await bumpVersion(tx, event, input.expectedVersion);

      const template = await tx.selectOne("planning_templates", {
        where: { communityId },
      });
      const fields = template
        ? await tx.select("template_fields", { where: { templateId: template.id } })
        : [];
      const planId = newId();
      await tx.insert("event_plans", {
        id: planId,
        communityId,
        eventId: event.id,
        sessionId: input.sessionId,
        teamId: input.teamId,
        templateVersion: template?.version ?? 1,
        createdAt: nowIso(),
      });
      await tx.insertMany(
        "event_role_slots",
        copyTemplateIntoPlan(fields, { communityId, planId }),
      );
      return ok({ planId });
    });
  } catch (error) {
    if (error instanceof VersionConflictError) {
      return err("conflit_de_version", error.message);
    }
    if (error instanceof ConstraintError) return err(error.code, error.message);
    throw error;
  }
}

/** Renommer, reordonner, regler l'effectif ou desactiver un poste du plan. */
export async function updateSlot(
  communityId: Id,
  slotId: Id,
  patch: { label?: string; minRequired?: number; order?: number; enabled?: boolean },
): Promise<Result<{ slotId: Id }>> {
  const adapter = getDataAdapter();
  return adapter.transaction(async (tx) => {
    const slot = await tx.selectOne("event_role_slots", {
      where: { id: slotId, communityId },
    });
    if (!slot) return err("poste_inconnu", "Poste introuvable.");
    const plan = await tx.selectOne("event_plans", { where: { id: slot.planId } });
    const event = plan
      ? await tx.selectOne("events", { where: { id: plan.eventId } })
      : null;
    if (!event) return err("evenement_inconnu", "Evenement introuvable.");
    await requireCommunityAction(communityId, "affectation.ecrire", {
      eventState: event.state,
    });

    const next: Partial<EventRoleSlot> = {};
    if (patch.label !== undefined) {
      const label = patch.label.trim();
      if (label === "") return err("libelle_vide", "Indiquez un libelle.");
      next.label = label;
    }
    if (patch.minRequired !== undefined) {
      if (patch.minRequired < 0) {
        return err("effectif_invalide", "L'effectif minimum ne peut pas etre negatif.");
      }
      next.minRequired = patch.minRequired;
    }
    if (patch.order !== undefined) next.order = patch.order;
    if (patch.enabled !== undefined) next.enabled = patch.enabled;
    await tx.update("event_role_slots", slotId, next);
    return ok({ slotId });
  });
}

/** Ajoute un poste supplementaire a un plan, sans toucher au modele. */
export async function addSlotToPlan(
  communityId: Id,
  planId: Id,
  input: { label: string; minRequired: number; allowsDetail?: boolean },
): Promise<Result<{ slotId: Id }>> {
  const adapter = getDataAdapter();
  return adapter.transaction(async (tx) => {
    const plan = await tx.selectOne("event_plans", { where: { id: planId, communityId } });
    if (!plan) return err("plan_inconnu", "Plan introuvable.");
    const event = await tx.selectOne("events", { where: { id: plan.eventId } });
    if (!event) return err("evenement_inconnu", "Evenement introuvable.");
    await requireCommunityAction(communityId, "affectation.ecrire", {
      eventState: event.state,
    });
    const label = input.label.trim();
    if (label === "") return err("libelle_vide", "Indiquez un libelle.");

    const existing = await tx.select("event_role_slots", { where: { planId } });
    // Un poste ajoute hors modele garde une reference de champ propre.
    const template = await tx.selectOne("planning_templates", {
      where: { communityId },
    });
    const field = await tx.selectOne("template_fields", {
      where: { communityId, label },
    });
    let templateFieldId = field?.id;
    if (!templateFieldId && template) {
      const created = {
        id: newId(),
        communityId,
        templateId: template.id,
        kind: "poste" as const,
        label,
        order: 1000 + existing.length,
        assignable: true,
        minRequired: Math.max(0, input.minRequired),
        multiple: true,
        allowsDetail: input.allowsDetail ?? false,
        required: false,
        archivedAt: nowIso(),
      };
      await tx.insert("template_fields", created);
      templateFieldId = created.id;
    }

    const slotId = newId();
    await tx.insert("event_role_slots", {
      id: slotId,
      communityId,
      planId,
      templateFieldId: templateFieldId ?? newId(),
      label,
      order: existing.length + 1,
      minRequired: Math.max(0, input.minRequired),
      multiple: true,
      allowsDetail: input.allowsDetail ?? false,
      enabled: true,
    });
    return ok({ slotId });
  });
}

/* -------------------------------------------------------------------------- */
/* Etats                                                                      */
/* -------------------------------------------------------------------------- */

export async function changeEventState(
  communityId: Id,
  eventId: Id,
  target: EventState,
  options: { expectedVersion: number; reason?: string | null; acceptExceptions?: boolean } ,
): Promise<Result<{ state: EventState; version: number }>> {
  const ctx = await getCommunityContext(communityId);
  const adapter = getDataAdapter();

  if (target === "publie") {
    const published = await publishEvent(communityId, eventId, {
      expectedVersion: options.expectedVersion,
      acceptExceptions: options.acceptExceptions ?? false,
    });
    if (!published.ok) return published;
    return ok({ state: "publie", version: published.value.version });
  }

  const action =
    target === "annule"
      ? "evenement.annuler"
      : target === "archive"
        ? "evenement.archiver"
        : "evenement.modifier";

  try {
    return await adapter.transaction(async (tx) => {
      const event = await tx.selectOne("events", { where: { id: eventId, communityId } });
      if (!event) return err("evenement_inconnu", "Evenement introuvable.");
      await requireCommunityAction(communityId, action, { eventState: event.state });

      if (!canTransitionEvent(event.state, target)) {
        return err(
          "transition_invalide",
          `Passage impossible de « ${event.state} » a « ${target} ».`,
        );
      }

      const updated = await bumpVersion(tx, event, options.expectedVersion);
      const at = nowIso();
      const patch: Partial<Event> = { state: target };
      if (target === "annule") {
        patch.cancelledAt = at;
        patch.cancelReason = options.reason ?? null;
      }
      if (target === "archive") patch.archivedAt = at;
      await tx.update("events", eventId, patch);

      const members = await tx.select("community_memberships", {
        where: { communityId, status: "active" },
      });

      if (target === "collecte") {
        await enqueueNotifications(tx, {
          kind: "collecte_ouverte",
          recipientUserIds: members.map((m) => m.userId),
          communityId,
          eventId,
          body: `Repondez a vos disponibilites pour « ${event.title} ».`,
          href: `/c/${communityId}/evenements/${eventId}`,
          subjectId: eventId,
          revision: "collecte",
        });
        await scheduleRemindersForEvent(tx, eventId);
      }

      if (target === "annule") {
        const plans = await tx.select("event_plans", { where: { eventId } });
        const assignments = await tx.select("assignments", {
          whereIn: { planId: plans.map((p) => p.id) },
        });
        const concerned = await tx.select("community_memberships", {
          whereIn: { id: assignments.map((a) => a.membershipId) },
        });
        const recipients = new Set(
          concerned.filter((m) => m.status === "active").map((m) => m.userId),
        );
        await enqueueNotifications(tx, {
          kind: "evenement_annule",
          recipientUserIds: [...recipients],
          communityId,
          eventId,
          body: options.reason
            ? `« ${event.title} » est annule. Motif : ${options.reason}`
            : `« ${event.title} » est annule.`,
          href: `/c/${communityId}/evenements/${eventId}`,
          subjectId: eventId,
          revision: `annule:${at}`,
        });
        // Les rappels d'un evenement annule sont abandonnes.
        await tx.updateWhere(
          "notification_outbox",
          { eventId, kind: "rappel", state: "enregistre" },
          { state: "abandonne", updatedAt: at },
        );
      }

      await writeAudit(tx, {
        communityId,
        actorUserId: ctx.viewer.userId,
        action: `evenement.${target}`,
        targetType: "event",
        targetId: eventId,
        metadata: { from: event.state, reason: options.reason ?? null },
      });

      return ok({ state: target, version: updated.version });
    });
  } catch (error) {
    if (error instanceof VersionConflictError) {
      return err("conflit_de_version", error.message);
    }
    if (error instanceof ConstraintError) return err(error.code, error.message);
    throw error;
  }
}

export async function publishEvent(
  communityId: Id,
  eventId: Id,
  options: { expectedVersion: number; acceptExceptions: boolean },
): Promise<Result<{ version: number; publishedVersion: number }>> {
  const ctx = await requireCommunityAction(communityId, "evenement.publier");
  const adapter = getDataAdapter();
  try {
    const result = await adapter.rpc("publish_event", {
      actorUserId: ctx.viewer.userId,
      eventId,
      expectedVersion: options.expectedVersion,
      acceptExceptions: options.acceptExceptions,
    });
    await adapter.transaction((tx) => scheduleRemindersForEvent(tx, eventId));
    return ok({
      version: result.version,
      publishedVersion: result.publishedVersion,
    });
  } catch (error) {
    if (error instanceof VersionConflictError) {
      return err("conflit_de_version", error.message);
    }
    if (error instanceof ConstraintError) return err(error.code, error.message);
    throw error;
  }
}

/* -------------------------------------------------------------------------- */
/* Duplication                                                                */
/* -------------------------------------------------------------------------- */

export async function duplicateEvent(
  communityId: Id,
  eventId: Id,
  options: DuplicateOptions & { title?: string; dayShiftDays: number },
): Promise<Result<{ eventId: Id }>> {
  const ctx = await requireCommunityAction(communityId, "evenement.dupliquer");
  const adapter = getDataAdapter();
  const shiftMs = options.dayShiftDays * 86400000;
  const shift = (iso: string) => new Date(new Date(iso).getTime() + shiftMs).toISOString();

  return adapter.transaction(async (tx) => {
    const source = await tx.selectOne("events", { where: { id: eventId, communityId } });
    if (!source) return err("evenement_inconnu", "Evenement introuvable.");

    const at = nowIso();
    const newEventId = newId();
    await tx.insert("events", {
      ...source,
      id: newEventId,
      title: options.title?.trim() || `${source.title} (copie)`,
      state: "brouillon",
      version: 1,
      publishedVersion: 0,
      publishedAt: null,
      cancelledAt: null,
      cancelReason: null,
      archivedAt: null,
      createdBy: ctx.viewer.userId,
      createdAt: at,
      updatedAt: at,
    });

    const sessions = await tx.select("event_sessions", { where: { eventId } });
    const sessionMap = new Map<Id, Id>();
    for (const s of sessions) {
      const id = newId();
      sessionMap.set(s.id, id);
      await tx.insert("event_sessions", {
        ...s,
        id,
        eventId: newEventId,
        startsAt: shift(s.startsAt),
        endsAt: shift(s.endsAt),
      });
    }

    const plans = await tx.select("event_plans", { where: { eventId } });
    const slots = await tx.select("event_role_slots", {
      whereIn: { planId: plans.map((p) => p.id) },
    });
    const assignments = await tx.select("assignments", {
      whereIn: { planId: plans.map((p) => p.id) },
    });
    const slotMap = new Map<Id, Id>();

    for (const p of plans) {
      const planId = newId();
      await tx.insert("event_plans", {
        ...p,
        id: planId,
        eventId: newEventId,
        sessionId: sessionMap.get(p.sessionId) ?? p.sessionId,
        createdAt: at,
      });
      for (const s of slots.filter((s) => s.planId === p.id)) {
        const slotId = newId();
        slotMap.set(s.id, slotId);
        await tx.insert("event_role_slots", { ...s, id: slotId, planId });
      }
      // Les affectations ne sont recopiees que sur demande explicite, et
      // reviennent toutes a « A confirmer ».
      if (options.includeAssignments) {
        for (const a of assignments.filter((a) => a.planId === p.id)) {
          if (a.state === "retiree") continue;
          await tx.insert("assignments", {
            ...a,
            id: newId(),
            planId,
            slotId: slotMap.get(a.slotId) ?? a.slotId,
            state: "a_confirmer",
            exceptions: [],
            memberNote: null,
            createdBy: ctx.viewer.userId,
            createdAt: at,
            updatedAt: at,
          });
        }
      }
    }

    if (options.includeSetlist) {
      const items = await tx.select("setlist_items", { where: { eventId } });
      for (const i of items) {
        await tx.insert("setlist_items", {
          ...i,
          id: newId(),
          eventId: newEventId,
          sessionId: sessionMap.get(i.sessionId) ?? i.sessionId,
        });
      }
    }

    if (options.includeDressCode) {
      const codes = await tx.select("dress_codes", { where: { eventId } });
      for (const c of codes) {
        await tx.insert("dress_codes", {
          ...c,
          id: newId(),
          eventId: newEventId,
          updatedAt: at,
        });
      }
    }

    if (options.includeRehearsals) {
      const rehearsals = await tx.select("rehearsals", { where: { eventId } });
      const links = await tx.select("rehearsal_teams", {
        whereIn: { rehearsalId: rehearsals.map((r) => r.id) },
      });
      for (const r of rehearsals) {
        const id = newId();
        await tx.insert("rehearsals", {
          ...r,
          id,
          eventId: newEventId,
          startsAt: shift(r.startsAt),
          endsAt: shift(r.endsAt),
        });
        for (const l of links.filter((l) => l.rehearsalId === r.id)) {
          await tx.insert("rehearsal_teams", {
            id: newId(),
            communityId,
            rehearsalId: id,
            teamId: l.teamId,
          });
        }
      }
    }

    await writeAudit(tx, {
      communityId,
      actorUserId: ctx.viewer.userId,
      action: "evenement.duplique",
      targetType: "event",
      targetId: newEventId,
      metadata: { source: eventId, options },
    });

    return ok({ eventId: newEventId });
  });
}
