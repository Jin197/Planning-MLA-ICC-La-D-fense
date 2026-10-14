import "server-only";
import { nowIso } from "@/lib/time";
import { canSeeAssignments, canSeeEvent } from "@/domain/permissions";
import { computeSlotFill } from "@/domain/assignments";
import type { AssignmentState, EventState, Id } from "@/domain/types";
import { getDataAdapter } from "../data";
import { requireSession } from "../auth/context";

/**
 * Accueil : ce qui attend l'utilisateur, toutes communautes confondues.
 * Pour les admins, les demandes en attente et les postes a completer de
 * leurs communautes s'ajoutent.
 */

export interface ProchaineAffectation {
  communityId: Id;
  communityName: string;
  eventId: Id;
  eventTitle: string;
  sessionLabel: string;
  startsAt: string;
  timezone: string;
  slotLabel: string;
  detail: string | null;
  assignmentId: Id;
  state: AssignmentState;
}

export interface ReponseAttendue {
  communityId: Id;
  communityName: string;
  eventId: Id;
  eventTitle: string;
  timezone: string;
  /** Creneaux sans reponse. */
  sessions: { id: Id; label: string; startsAt: string }[];
  deadline: string | null;
}

export interface ProchainEvenement {
  communityId: Id;
  communityName: string;
  eventId: Id;
  title: string;
  state: EventState;
  timezone: string;
  startsAt: string;
  sessionLabel: string;
}

export interface TacheAdmin {
  communityId: Id;
  communityName: string;
  demandesEnAttente: number;
  postesACompleter: number;
  affectationsARemplacer: number;
}

export interface TableauDeBord {
  prochainEvenement: ProchainEvenement | null;
  mesAffectations: ProchaineAffectation[];
  reponsesAttendues: ReponseAttendue[];
  tachesAdmin: TacheAdmin[];
  messagesNonLus: { communityId: Id; eventId: Id; eventTitle: string; count: number }[];
  aucuneAdhesion: boolean;
}

export async function loadTableauDeBord(): Promise<TableauDeBord> {
  const session = await requireSession();
  const adapter = getDataAdapter();
  const at = nowIso();

  return adapter.read(async (tx) => {
    const memberships = (
      await tx.select("community_memberships", {
        where: { userId: session.viewer.userId, status: "active" },
      })
    );
    if (memberships.length === 0) {
      return {
        prochainEvenement: null,
        mesAffectations: [],
        reponsesAttendues: [],
        tachesAdmin: [],
        messagesNonLus: [],
        aucuneAdhesion: true,
      };
    }

    const communityIds = memberships.map((m) => m.communityId);
    const communities = await tx.select("communities", { whereIn: { id: communityIds } });
    const nameOf = new Map(communities.map((c) => [c.id, c.name]));
    const membershipOf = new Map(memberships.map((m) => [m.communityId, m]));

    const events = await tx.select("events", { whereIn: { communityId: communityIds } });
    const visibleEvents = events.filter((e) => {
      const membership = membershipOf.get(e.communityId);
      return membership
        ? canSeeEvent(
            {
              communityId: membership.communityId,
              role: membership.role,
              status: membership.status,
              membershipId: membership.id,
            },
            e.state,
          )
        : false;
    });
    const eventIds = visibleEvents.map((e) => e.id);
    const sessions = await tx.select("event_sessions", { whereIn: { eventId: eventIds } });
    const plans = await tx.select("event_plans", { whereIn: { eventId: eventIds } });
    const slots = await tx.select("event_role_slots", {
      whereIn: { planId: plans.map((p) => p.id) },
    });
    const assignments = await tx.select("assignments", {
      whereIn: { membershipId: memberships.map((m) => m.id) },
    });
    const availabilities = await tx.select("session_availabilities", {
      whereIn: { membershipId: memberships.map((m) => m.id) },
    });

    const eventById = new Map(visibleEvents.map((e) => [e.id, e]));
    const sessionById = new Map(sessions.map((s) => [s.id, s]));
    const planById = new Map(plans.map((p) => [p.id, p]));
    const slotById = new Map(slots.map((s) => [s.id, s]));

    /* Mes prochaines affectations. */
    const mesAffectations: ProchaineAffectation[] = [];
    for (const assignment of assignments) {
      if (assignment.state === "retiree") continue;
      const plan = planById.get(assignment.planId);
      const session_ = plan ? sessionById.get(plan.sessionId) : undefined;
      const event = plan ? eventById.get(plan.eventId) : undefined;
      if (!plan || !session_ || !event) continue;
      if (event.state === "annule" || event.state === "archive") continue;
      if (session_.startsAt < at) continue;
      const membership = membershipOf.get(event.communityId);
      if (!membership) continue;
      // Pendant la collecte, le membre ne voit pas encore le plan.
      const visible = canSeeAssignments(
        {
          communityId: membership.communityId,
          role: membership.role,
          status: membership.status,
          membershipId: membership.id,
        },
        event.state,
      );
      if (!visible) continue;

      mesAffectations.push({
        communityId: event.communityId,
        communityName: nameOf.get(event.communityId) ?? "",
        eventId: event.id,
        eventTitle: event.title,
        sessionLabel: session_.label,
        startsAt: session_.startsAt,
        timezone: event.timezone,
        slotLabel: slotById.get(assignment.slotId)?.label ?? "Poste",
        detail: assignment.detail,
        assignmentId: assignment.id,
        state: assignment.state,
      });
    }
    mesAffectations.sort((a, b) => (a.startsAt < b.startsAt ? -1 : 1));

    /* Disponibilites a renseigner, sur les evenements ouverts. */
    const reponsesAttendues: ReponseAttendue[] = [];
    for (const event of visibleEvents) {
      if (event.state !== "collecte" && event.state !== "publie") continue;
      const membership = membershipOf.get(event.communityId);
      if (!membership) continue;
      const own = sessions
        .filter((s) => s.eventId === event.id && s.startsAt >= at)
        .sort((a, b) => a.ordinal - b.ordinal);
      const manquants = own.filter(
        (s) =>
          !availabilities.some(
            (a) => a.sessionId === s.id && a.membershipId === membership.id,
          ),
      );
      if (manquants.length === 0) continue;
      reponsesAttendues.push({
        communityId: event.communityId,
        communityName: nameOf.get(event.communityId) ?? "",
        eventId: event.id,
        eventTitle: event.title,
        timezone: event.timezone,
        sessions: manquants.map((s) => ({
          id: s.id,
          label: s.label,
          startsAt: s.startsAt,
        })),
        deadline: event.responseDeadline,
      });
    }
    reponsesAttendues.sort((a, b) =>
      (a.sessions[0]?.startsAt ?? "") < (b.sessions[0]?.startsAt ?? "") ? -1 : 1,
    );

    /* Prochain evenement, toutes communautes. */
    const prochainCreneau = sessions
      .filter((s) => s.startsAt >= at && eventById.has(s.eventId))
      .sort((a, b) => (a.startsAt < b.startsAt ? -1 : 1))[0];
    const prochainEvent = prochainCreneau
      ? eventById.get(prochainCreneau.eventId)
      : undefined;
    const prochainEvenement: ProchainEvenement | null =
      prochainCreneau && prochainEvent
        ? {
            communityId: prochainEvent.communityId,
            communityName: nameOf.get(prochainEvent.communityId) ?? "",
            eventId: prochainEvent.id,
            title: prochainEvent.title,
            state: prochainEvent.state,
            timezone: prochainEvent.timezone,
            startsAt: prochainCreneau.startsAt,
            sessionLabel: prochainCreneau.label,
          }
        : null;

    /* Taches d'administration. */
    const tachesAdmin: TacheAdmin[] = [];
    for (const membership of memberships) {
      if (membership.role !== "admin") continue;
      const demandes = await tx.count("join_requests", {
        where: { communityId: membership.communityId, status: "en_attente" },
      });
      const commEvents = visibleEvents.filter(
        (e) =>
          e.communityId === membership.communityId &&
          (e.state === "collecte" || e.state === "publie"),
      );
      const commPlans = plans.filter((p) =>
        commEvents.some((e) => e.id === p.eventId),
      );
      const commSlots = slots.filter((s) =>
        commPlans.some((p) => p.id === s.planId),
      );
      const commAssignments = await tx.select("assignments", {
        whereIn: { planId: commPlans.map((p) => p.id) },
      });
      const postesACompleter = commSlots.filter(
        (s) => computeSlotFill(s, commAssignments).incomplete,
      ).length;
      const aRemplacer = commAssignments.filter((a) => a.state === "a_remplacer").length;

      if (demandes === 0 && postesACompleter === 0 && aRemplacer === 0) continue;
      tachesAdmin.push({
        communityId: membership.communityId,
        communityName: nameOf.get(membership.communityId) ?? "",
        demandesEnAttente: demandes,
        postesACompleter,
        affectationsARemplacer: aRemplacer,
      });
    }

    /* Messages non lus. */
    const messages = await tx.select("event_messages", { whereIn: { eventId: eventIds } });
    const cursors = await tx.select("message_read_cursors", {
      where: { userId: session.viewer.userId },
    });
    const cursorByEvent = new Map(cursors.map((c) => [c.eventId, c.lastReadAt]));
    const parEvenement = new Map<Id, number>();
    for (const message of messages) {
      if (message.deletedAt !== null) continue;
      if (message.authorUserId === session.viewer.userId) continue;
      const lastRead = cursorByEvent.get(message.eventId) ?? "1970-01-01T00:00:00.000Z";
      if (message.createdAt <= lastRead) continue;
      parEvenement.set(message.eventId, (parEvenement.get(message.eventId) ?? 0) + 1);
    }

    return {
      prochainEvenement,
      mesAffectations: mesAffectations.slice(0, 8),
      reponsesAttendues: reponsesAttendues.slice(0, 5),
      tachesAdmin,
      messagesNonLus: [...parEvenement.entries()].map(([eventId, count]) => {
        const event = eventById.get(eventId);
        return {
          communityId: event?.communityId ?? "",
          eventId,
          eventTitle: event?.title ?? "Evenement",
          count,
        };
      }),
      aucuneAdhesion: false,
    };
  });
}
