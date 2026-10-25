import "server-only";
import { newId } from "@/lib/ids";
import { err, ok, type Result } from "@/lib/result";
import { localToUtc, nowIso, type LocalDateTimeInput } from "@/lib/time";
import { isSignificantScheduleChange } from "@/domain/availability";
import {
  canTransitionEvent,
  computePublicationReadiness,
  eventWindow,
  occurrencesOf,
  type DuplicateOptions,
  type PublicationReadiness,
} from "@/domain/events";
import { canSeeAssignments, canSeeEvent } from "@/domain/permissions";
import { copyTemplateIntoPlan } from "@/domain/template";
import type {
  Assignment,
  Availability,
  DressCode,
  Event,
  EventPlan,
  EventRoleSlot,
  EventSession,
  EventState,
  EventTeam,
  Id,
  Rehearsal,
  SetlistItem,
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

/** Sous-evenement a creer. Un evenement peut n'en avoir aucun. */
export interface SessionDraft {
  label: string;
  start: LocalDateTimeInput;
  end: LocalDateTimeInput;
  locationName: string;
  locationAddress: string;
  scheduleProvisional?: boolean;
}

/**
 * Equipe a creer dans l'evenement. Elle n'existe que pour lui : son effectif
 * est saisi ici et ne se reporte pas sur l'evenement suivant.
 */
export interface TeamDraft {
  name: string;
  /** Adhesions placees dans l'equipe. */
  membershipIds: Id[];
  /**
   * Rangs des sous-evenements couverts, 1 pour le premier saisi. Une liste
   * vide signifie que l'equipe couvre toute la duree de l'evenement.
   */
  sessionOrdinals: number[];
  /**
   * Postes du modele dont l'equipe a besoin. Une liste vide reprend tout le
   * modele : une equipe de chant n'a pas de poste technique.
   */
  templateFieldIds: Id[];
}

export interface RehearsalDraft {
  label: string;
  start: LocalDateTimeInput;
  end: LocalDateTimeInput;
  locationName: string;
  locationAddress: string;
  room: string;
  /** Rangs des equipes concernees, 1 pour la premiere saisie. */
  teamOrdinals: number[];
}

export interface CreateEventInput {
  title: string;
  description: string;
  /** Horaire et lieu de l'evenement lui-meme. */
  start: LocalDateTimeInput;
  end: LocalDateTimeInput;
  locationName: string;
  locationAddress: string;
  scheduleProvisional?: boolean;
  /** Sous-evenements, facultatifs : zero, un ou plusieurs. */
  sessions: SessionDraft[];
  /** Equipes creees dans l'evenement, en nombre libre. */
  teams: TeamDraft[];
  rehearsals: RehearsalDraft[];
  responseDeadline?: LocalDateTimeInput | null;
  /** Prevenir les membres par mail et ouvrir la collecte. */
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

  try {
    return await adapter.transaction(async (tx) => {
      const community = await tx.selectOne("communities", {
        where: { id: communityId },
      });
      if (!community) return err("communaute_inconnue", "Communaute introuvable.");
      const tz = community.timezone;
      const at = nowIso();
      const eventId = newId();

      const startsAt = localToUtc(input.start, tz);
      const endsAt = localToUtc(input.end, tz);
      if (new Date(endsAt) <= new Date(startsAt)) {
        return err("horaire_invalide", "La fin doit suivre le debut.");
      }

      const sessions: EventSession[] = input.sessions.map((draft, index) => ({
        id: newId(),
        communityId,
        eventId,
        label: draft.label.trim() || `Sous-evenement ${index + 1}`,
        ordinal: index + 1,
        startsAt: localToUtc(draft.start, tz),
        endsAt: localToUtc(draft.end, tz),
        locationName: draft.locationName.trim(),
        locationAddress: draft.locationAddress.trim(),
        scheduleProvisional: draft.scheduleProvisional ?? false,
      }));

      // La fenetre annoncee s'elargit a ce que les sous-evenements couvrent.
      const window = eventWindow({ startsAt, endsAt }, sessions);

      const event: Event = {
        id: eventId,
        communityId,
        title: input.title.trim(),
        description: input.description.trim(),
        state: input.openCollection ? "collecte" : "brouillon",
        timezone: tz,
        startsAt: window.startsAt,
        endsAt: window.endsAt,
        locationName: input.locationName.trim(),
        locationAddress: input.locationAddress.trim(),
        scheduleProvisional: input.scheduleProvisional ?? false,
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
      await tx.insertMany("event_sessions", sessions);

      const template = await tx.selectOne("planning_templates", {
        where: { communityId },
      });
      const fields = template
        ? await tx.select("template_fields", { where: { templateId: template.id } })
        : [];
      const activeMemberships = await tx.select("community_memberships", {
        where: { communityId, status: "active" },
      });

      const teams: EventTeam[] = [];
      for (const [index, draft] of input.teams.entries()) {
        const name = draft.name.trim();
        if (name === "") continue;
        const team: EventTeam = {
          id: newId(),
          communityId,
          eventId,
          name,
          order: index + 1,
        };
        await tx.insert("event_teams", team);
        teams.push(team);

        for (const membershipId of new Set(draft.membershipIds)) {
          if (!activeMemberships.some((m) => m.id === membershipId)) continue;
          await tx.insert("event_team_members", {
            id: newId(),
            communityId,
            teamId: team.id,
            membershipId,
          });
        }

        // Rattachements : les sous-evenements choisis, ou l'evenement entier.
        const targets =
          draft.sessionOrdinals.length === 0
            ? [null]
            : sessions
                .filter((s) => draft.sessionOrdinals.includes(s.ordinal))
                .map((s) => s.id);
        // Les postes retenus sont les memes sur chaque rattachement de
        // l'equipe : c'est la meme equipe qui sert.
        for (const sessionId of targets) {
          const plan: EventPlan = {
            id: newId(),
            communityId,
            eventId,
            sessionId,
            teamId: team.id,
            templateVersion: template?.version ?? 1,
            createdAt: at,
          };
          await tx.insert("event_plans", plan);
          await tx.insertMany(
            "event_role_slots",
            copyTemplateIntoPlan(fields, {
              communityId,
              planId: plan.id,
              retenus: draft.templateFieldIds,
            }),
          );
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
        for (const ordinal of new Set(draft.teamOrdinals)) {
          const team = teams[ordinal - 1];
          if (!team) continue;
          await tx.insert("rehearsal_teams", {
            id: newId(),
            communityId,
            rehearsalId: rehearsal.id,
            teamId: team.id,
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
          body: `Repondez a vos disponibilites pour « ${event.title} », puis positionnez-vous sur les postes ouverts.`,
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
        metadata: { sousEvenements: sessions.length, equipes: teams.length },
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
  startsAt: string;
  endsAt: string;
  /** Sous-evenements, eventuellement aucun. */
  sessions: EventSession[];
  rehearsals: Rehearsal[];
  /** Nombre d'occurrences ou le membre n'a pas encore repondu. */
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
    const availabilities = await tx.select("availabilities", {
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

    const inRange = (startsAt: string) => {
      if (options.from && startsAt < options.from) return false;
      if (options.to && startsAt > options.to) return false;
      return true;
    };

    return visible
      .map((e): EventListItem => {
        const own = sessions
          .filter((s) => s.eventId === e.id)
          .sort((a, b) => a.ordinal - b.ordinal);
        const mineAnswers = availabilities.filter((a) => a.eventId === e.id);
        const occurrences = occurrencesOf(e, own);
        const mine = myAssignments
          .filter((a) => {
            const plan = planById.get(a.planId);
            return plan?.eventId === e.id && a.state !== "retiree";
          })
          .filter(() => canSeeAssignments(ctx.membership, e.state))
          .map((a) => {
            const plan = planById.get(a.planId);
            const session =
              plan?.sessionId === null || plan === undefined
                ? undefined
                : sessionById.get(plan.sessionId);
            return {
              label: slotById.get(a.slotId)?.label ?? "Poste",
              // Un plan rattache a tout l'evenement n'a pas de sous-titre.
              sessionLabel: session?.label ?? "",
              state: a.state,
            };
          });
        return {
          id: e.id,
          title: e.title,
          state: e.state,
          timezone: e.timezone,
          startsAt: e.startsAt,
          endsAt: e.endsAt,
          sessions: own,
          rehearsals: rehearsals.filter((r) => r.eventId === e.id),
          myMissingResponses: occurrences.filter(
            (o) => !mineAnswers.some((a) => a.sessionId === o.sessionId),
          ).length,
          myAssignments: mine,
        };
      })
      .filter((e) =>
        e.sessions.length === 0
          ? inRange(e.startsAt)
          : e.sessions.some((s) => inRange(s.startsAt)),
      )
      .sort((a, b) => {
        const sa = a.sessions[0]?.startsAt ?? a.startsAt;
        const sb = b.sessions[0]?.startsAt ?? b.startsAt;
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

/**
 * Occurrence affichee : un sous-evenement, ou l'evenement lui-meme quand il
 * n'en a aucun. C'est l'unite a laquelle les membres repondent et sur
 * laquelle le plan se lit, ce qui evite deux affichages differents.
 */
export interface OccurrenceView {
  /** null = l'evenement lui-meme. */
  sessionId: Id | null;
  label: string;
  startsAt: string;
  endsAt: string;
  locationName: string;
  locationAddress: string;
  scheduleProvisional: boolean;
  plans: PlanView[];
  /** Ma reponse de disponibilite sur cette occurrence. */
  myAvailability: Availability | null;
  myReason: string | null;
  /** Vue d'ensemble des reponses, reservee aux admins. */
  responseSummary: { disponible: number; indisponible: number; aRenseigner: number } | null;
  /** Equipes qui servent sur cette occurrence. */
  equipes: EquipePresenteView[];
  /** Postes ou il manque quelqu'un, pour se positionner soi-meme. */
  postesOuverts: PosteOuvertView[];
  /** Postes que je tiens deja sur cette occurrence. */
  mesPostes: { assignmentId: Id; label: string; teamName: string }[];
  setlist: SetlistItem[];
}

/**
 * Poste encore ouvert, tel qu'un membre le voit pour s'y positionner.
 *
 * Pendant la collecte, la composition en preparation reste reservee aux
 * admins : cette vue dit donc ce qui manque, jamais qui est deja place.
 */
/**
 * Equipe qui sert sur une occurrence, telle qu'un membre la voit.
 *
 * Le fait qu'une equipe serve a tel moment n'est pas la composition du
 * planning : c'est la structure de l'evenement, et elle se lit des la
 * collecte. L'effectif, lui, n'est pas repris ici.
 */
export interface EquipePresenteView {
  teamId: Id;
  name: string;
  /** Couvre toute la duree de l'evenement plutot que ce seul moment. */
  surToutLEvenement: boolean;
  /** Je fais partie de son effectif. */
  jEnFaisPartie: boolean;
}

export interface PosteOuvertView {
  slotId: Id;
  teamName: string;
  label: string;
  /** Personnes encore attendues ; 0 pour un poste facultatif libre. */
  manquants: number;
  allowsDetail: boolean;
}

export interface TeamView {
  id: Id;
  name: string;
  order: number;
  members: { membershipId: Id; name: string; initials: string }[];
  /** Rattachements de l'equipe ; `sessionId` null = tout l'evenement. */
  attachments: { planId: Id; sessionId: Id | null; label: string }[];
}

export interface EventDetail {
  event: Event;
  /** Sous-evenements declares ; vide quand l'evenement n'en a aucun. */
  sessions: EventSession[];
  occurrences: OccurrenceView[];
  /**
   * Plans des equipes couvrant tout l'evenement. Vide quand l'evenement n'a
   * pas de sous-evenement : l'occurrence unique les porte alors elle-meme.
   */
  eventWidePlans: PlanView[];
  /**
   * Postes ouverts de ces memes equipes, pour s'y positionner. Les prendre
   * engage sur toute la duree : il faut donc etre disponible partout.
   */
  postesOuvertsEvenement: PosteOuvertView[];
  /** Postes que je tiens sur toute la duree de l'evenement. */
  mesPostesEvenement: { assignmentId: Id; label: string; teamName: string }[];
  teams: TeamView[];
  rehearsals: (Rehearsal & {
    teamIds: Id[];
    myAvailability: { answer: string; needsReconfirmation: boolean } | null;
  })[];
  dressCodes: DressCode[];
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
    const teams = (
      await tx.select("event_teams", { where: { eventId } })
    ).sort((a, b) => a.order - b.order);
    const teamMembers = await tx.select("event_team_members", {
      whereIn: { teamId: teams.map((t) => t.id) },
    });
    const memberships = await tx.select("community_memberships", {
      where: { communityId },
    });
    const profiles = await tx.select("profiles", {
      whereIn: { id: memberships.map((m) => m.userId) },
    });
    const availabilities = await tx.select("availabilities", {
      where: { eventId },
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

    const planViewsFor = (sessionId: Id | null): PlanView[] => {
      if (!showPlan) return [];
      return plans
        .filter((p) => p.sessionId === sessionId)
        .map((plan) => {
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
          });
    };

    /*
     * Postes ouverts : calcules a part des plans, parce qu'ils sont visibles
     * pendant la collecte alors que la composition ne l'est pas encore.
     */
    const ouvert = (slot: EventRoleSlot): number | null => {
      if (!slot.enabled) return null;
      const dessus = assignments.filter(
        (a) => a.slotId === slot.id && a.state !== "retiree",
      );
      const comptes = dessus.filter((a) => a.state !== "a_remplacer");
      const manquants = Math.max(0, slot.minRequired - comptes.length);
      if (manquants > 0) return manquants;
      // Un poste facultatif encore libre reste proposable.
      return slot.minRequired === 0 && comptes.length === 0 ? 0 : null;
    };

    /**
     * Plans qui servent sur une occurrence : ceux qui la visent, et ceux qui
     * couvrent toute la duree de l'evenement.
     */
    const plansPour = (sessionId: Id | null) =>
      plans.filter(
        (p) =>
          p.sessionId === sessionId ||
          (sessionId !== null && p.sessionId === null),
      );

    const equipesPour = (sessionId: Id | null): EquipePresenteView[] =>
      plansPour(sessionId).flatMap((plan) => {
        const equipe = teams.find((t) => t.id === plan.teamId);
        if (!equipe) return [];
        return [
          {
            teamId: equipe.id,
            name: equipe.name,
            surToutLEvenement: plan.sessionId === null,
            jEnFaisPartie: teamMembers.some(
              (m) =>
                m.teamId === equipe.id &&
                m.membershipId === ctx.membership.membershipId,
            ),
          },
        ];
      });

    const postesOuvertsPour = (sessionId: Id | null): PosteOuvertView[] =>
      plans
        .filter((p) => p.sessionId === sessionId)
        .flatMap((plan) =>
          slots
            .filter((s) => s.planId === plan.id)
            .sort((a, b) => a.order - b.order)
            .flatMap((slot) => {
              const manquants = ouvert(slot);
              if (manquants === null) return [];
              if (
                assignments.some(
                  (a) =>
                    a.slotId === slot.id &&
                    a.state !== "retiree" &&
                    a.membershipId === ctx.membership.membershipId,
                )
              ) {
                return [];
              }
              return [
                {
                  slotId: slot.id,
                  teamName:
                    teams.find((t) => t.id === plan.teamId)?.name ?? "Equipe",
                  label: slot.label,
                  manquants,
                  allowsDetail: slot.allowsDetail,
                },
              ];
            }),
        );

    const mesPostesPour = (sessionId: Id | null) =>
      plans
        .filter((p) => p.sessionId === sessionId)
        .flatMap((plan) =>
          assignments
            .filter(
              (a) =>
                a.membershipId === ctx.membership.membershipId &&
                a.state !== "retiree" &&
                slots.some((s) => s.id === a.slotId && s.planId === plan.id),
            )
            .map((a) => ({
              assignmentId: a.id,
              label: slots.find((s) => s.id === a.slotId)?.label ?? "Poste",
              teamName: teams.find((t) => t.id === plan.teamId)?.name ?? "Equipe",
            })),
        );

    const occurrenceViews: OccurrenceView[] = occurrencesOf(event, sessions).map(
      (occurrence) => {
        const answers = availabilities.filter(
          (a) => a.sessionId === occurrence.sessionId,
        );
        const mine =
          answers.find((a) => a.membershipId === ctx.membership.membershipId) ??
          null;
        const myReason = mine
          ? (reasons.find((r) => r.availabilityId === mine.id)?.text ?? null)
          : null;

        return {
          ...occurrence,
          plans: planViewsFor(occurrence.sessionId),
          myAvailability: mine,
          myReason,
          responseSummary: isAdmin
            ? {
                disponible: answers.filter((a) => a.answer === "disponible").length,
                indisponible: answers.filter((a) => a.answer === "indisponible")
                  .length,
                aRenseigner: Math.max(0, activeMembers.length - answers.length),
              }
            : null,
          equipes: equipesPour(occurrence.sessionId),
          postesOuverts: postesOuvertsPour(occurrence.sessionId),
          mesPostes: mesPostesPour(occurrence.sessionId),
          setlist: setlist
            .filter((i) => i.sessionId === occurrence.sessionId)
            .sort((a, b) => a.order - b.order),
        };
      },
    );

    const sessionLabelOf = (sessionId: Id | null) =>
      sessionId === null
        ? "Tout l'evenement"
        : (sessions.find((s) => s.id === sessionId)?.label ?? "Sous-evenement");

    const teamViews: TeamView[] = teams.map((team) => ({
      id: team.id,
      name: team.name,
      order: team.order,
      members: teamMembers
        .filter((m) => m.teamId === team.id)
        .map((m) => ({ membershipId: m.membershipId, ...nameOf(m.membershipId) })),
      attachments: plans
        .filter((p) => p.teamId === team.id)
        .map((p) => ({
          planId: p.id,
          sessionId: p.sessionId,
          label: sessionLabelOf(p.sessionId),
        })),
    }));

    const readiness = isAdmin
      ? computePublicationReadiness({
          event,
          sessions,
          teams,
          plans,
          slots,
          assignments: assignments.filter((a) => a.state !== "retiree"),
          missingResponses: Math.max(
            0,
            occurrenceViews.length * activeMembers.length - availabilities.length,
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
      sessions,
      occurrences: occurrenceViews,
      // Quand l'evenement a des sous-evenements, les equipes couvrant toute
      // sa duree ne se rangent sous aucun d'eux : elles sont a part.
      eventWidePlans: sessions.length === 0 ? [] : planViewsFor(null),
      postesOuvertsEvenement:
        sessions.length === 0 ? [] : postesOuvertsPour(null),
      mesPostesEvenement: sessions.length === 0 ? [] : mesPostesPour(null),
      teams: teamViews,
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
  /** Horaire et lieu de l'evenement lui-meme. */
  start?: LocalDateTimeInput;
  end?: LocalDateTimeInput;
  locationName?: string;
  locationAddress?: string;
  clearProvisional?: boolean;
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
      if (input.locationName !== undefined) {
        patch.locationName = input.locationName.trim();
      }
      if (input.locationAddress !== undefined) {
        patch.locationAddress = input.locationAddress.trim();
      }
      if (input.start) patch.startsAt = localToUtc(input.start, event.timezone);
      if (input.end) patch.endsAt = localToUtc(input.end, event.timezone);
      if (input.clearProvisional) patch.scheduleProvisional = false;

      const after = {
        startsAt: patch.startsAt ?? event.startsAt,
        endsAt: patch.endsAt ?? event.endsAt,
      };
      if (new Date(after.endsAt) <= new Date(after.startsAt)) {
        return err("horaire_invalide", "La fin doit suivre le debut.");
      }

      const sessions = await tx.select("event_sessions", { where: { eventId } });
      // La fenetre reste au moins aussi large que les sous-evenements.
      const widened = eventWindow(after, sessions);
      patch.startsAt = widened.startsAt;
      patch.endsAt = widened.endsAt;

      const updated = await bumpVersion(tx, event, input.expectedVersion);
      await tx.update("events", eventId, patch);

      // Une correction de description ne remet aucune reponse a zero ; un
      // deplacement de l'horaire, lui, demande une reconfirmation — et seul
      // un evenement sans sous-evenement porte les reponses directement.
      let reconfirmations = 0;
      if (sessions.length === 0 && isSignificantScheduleChange(event, after)) {
        reconfirmations = await requestReconfirmation(tx, {
          communityId,
          event,
          sessionId: null,
          label: patch.title ?? event.title,
          revision: updated.version,
        });
      }

      await writeAudit(tx, {
        communityId,
        actorUserId: ctx.viewer.userId,
        action: "evenement.modifie",
        targetType: "event",
        targetId: eventId,
        metadata: { champs: Object.keys(patch), reconfirmations },
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
 * Suite d'un deplacement d'horaire : les reponses deja donnees sont
 * conservees et marquees « a reconfirmer », les affectations confirmees
 * repassent a « a confirmer », et les personnes concernees sont prevenues.
 *
 * `sessionId` vaut null quand l'horaire deplace est celui de l'evenement
 * lui-meme, faute de sous-evenement.
 */
async function requestReconfirmation(
  tx: Tx,
  input: {
    communityId: Id;
    event: Event;
    sessionId: Id | null;
    label: string;
    revision: number;
  },
): Promise<number> {
  const at = nowIso();
  const availabilities = (
    await tx.select("availabilities", { where: { eventId: input.event.id } })
  ).filter((a) => a.sessionId === input.sessionId);
  for (const a of availabilities) {
    await tx.update("availabilities", a.id, {
      needsReconfirmation: true,
      updatedAt: at,
    });
  }

  const plans = (
    await tx.select("event_plans", { where: { eventId: input.event.id } })
  ).filter((p) => p.sessionId === input.sessionId);
  const assignments = (
    await tx.select("assignments", { whereIn: { planId: plans.map((p) => p.id) } })
  ).filter((a) => a.state === "confirmee");
  for (const a of assignments) {
    await tx.update("assignments", a.id, { state: "a_confirmer", updatedAt: at });
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
    communityId: input.communityId,
    eventId: input.event.id,
    body:
      input.sessionId === null
        ? `Les horaires de « ${input.label} » ont change. Merci de reconfirmer.`
        : `Les horaires du sous-evenement « ${input.label} » de « ${input.event.title} » ont change. Merci de reconfirmer.`,
    href: `/c/${input.communityId}/evenements/${input.event.id}`,
    subjectId: `${input.sessionId ?? input.event.id}:horaire`,
    revision: input.revision,
  });

  await scheduleRemindersForEvent(tx, input.event.id);
  return availabilities.length;
}

/**
 * Deplacement d'un sous-evenement. Les personnes concernees doivent
 * reconfirmer leur disponibilite et leur affectation ; les reponses
 * initiales sont conservees et marquees « a reconfirmer ».
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

      // La fenetre de l'evenement suit ses sous-evenements.
      const siblings = await tx.select("event_sessions", {
        where: { eventId: event.id },
      });
      await tx.update("events", event.id, eventWindow(event, siblings));

      let reconfirmations = 0;
      if (significant) {
        reconfirmations = await requestReconfirmation(tx, {
          communityId,
          event,
          sessionId,
          label: patch.label ?? session.label,
          revision: updated.version,
        });
      }

      await writeAudit(tx, {
        communityId,
        actorUserId: ctx.viewer.userId,
        action: "sous_evenement.modifie",
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

/** Cree le plan d'une equipe et y copie les postes du modele. */
async function createPlan(
  tx: Tx,
  input: { communityId: Id; eventId: Id; sessionId: Id | null; teamId: Id },
): Promise<Id> {
  const template = await tx.selectOne("planning_templates", {
    where: { communityId: input.communityId },
  });
  const fields = template
    ? await tx.select("template_fields", { where: { templateId: template.id } })
    : [];
  const planId = newId();
  await tx.insert("event_plans", {
    id: planId,
    communityId: input.communityId,
    eventId: input.eventId,
    sessionId: input.sessionId,
    teamId: input.teamId,
    templateVersion: template?.version ?? 1,
    createdAt: nowIso(),
  });
  await tx.insertMany(
    "event_role_slots",
    copyTemplateIntoPlan(fields, {
      communityId: input.communityId,
      planId,
    }),
  );
  return planId;
}

/**
 * Ajout d'un sous-evenement. Le premier ajoute deplace la question posee aux
 * membres : elle portait sur l'evenement, elle porte maintenant sur lui. Les
 * reponses deja donnees sont donc rattachees a ce premier sous-evenement
 * plutot que perdues.
 */
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
        label: draft.label.trim() || `Sous-evenement ${existing.length + 1}`,
        ordinal: existing.length + 1,
        startsAt: localToUtc(draft.start, event.timezone),
        endsAt: localToUtc(draft.end, event.timezone),
        locationName: draft.locationName.trim(),
        locationAddress: draft.locationAddress.trim(),
        scheduleProvisional: draft.scheduleProvisional ?? false,
      };
      if (new Date(session.endsAt) <= new Date(session.startsAt)) {
        return err("horaire_invalide", "La fin doit suivre le debut.");
      }
      await bumpVersion(tx, event, draft.expectedVersion);
      await tx.insert("event_sessions", session);
      await tx.update(
        "events",
        eventId,
        eventWindow(event, [...existing, session]),
      );

      let reportees = 0;
      if (existing.length === 0) {
        const answers = (
          await tx.select("availabilities", { where: { eventId } })
        ).filter((a) => a.sessionId === null);
        for (const answer of answers) {
          await tx.update("availabilities", answer.id, { sessionId: session.id });
          reportees += 1;
        }
      }

      const teams = await tx.select("event_teams", { where: { eventId } });
      for (const teamId of new Set(draft.teamIds ?? [])) {
        if (!teams.some((t) => t.id === teamId)) continue;
        await createPlan(tx, {
          communityId,
          eventId,
          sessionId: session.id,
          teamId,
        });
      }

      await writeAudit(tx, {
        communityId,
        actorUserId: ctx.viewer.userId,
        action: "sous_evenement.ajoute",
        targetType: "event_session",
        targetId: session.id,
        metadata: { reponsesReportees: reportees },
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
          body: `Repondez a vos disponibilites pour « ${event.title} », puis positionnez-vous sur les postes ouverts.`,
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
      startsAt: shift(source.startsAt),
      endsAt: shift(source.endsAt),
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

    // Les equipes appartiennent a l'evenement : la copie recoit les siennes,
    // avec le meme effectif, et non des references partagees.
    const teams = await tx.select("event_teams", { where: { eventId } });
    const teamMembers = await tx.select("event_team_members", {
      whereIn: { teamId: teams.map((t) => t.id) },
    });
    const teamMap = new Map<Id, Id>();
    for (const team of teams) {
      const id = newId();
      teamMap.set(team.id, id);
      await tx.insert("event_teams", { ...team, id, eventId: newEventId });
      for (const member of teamMembers.filter((m) => m.teamId === team.id)) {
        await tx.insert("event_team_members", { ...member, id: newId(), teamId: id });
      }
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
        sessionId: p.sessionId === null ? null : (sessionMap.get(p.sessionId) ?? null),
        teamId: teamMap.get(p.teamId) ?? p.teamId,
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
          sessionId:
            i.sessionId === null ? null : (sessionMap.get(i.sessionId) ?? null),
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
          teamId: c.teamId === null ? null : (teamMap.get(c.teamId) ?? null),
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
          const teamId = teamMap.get(l.teamId);
          if (!teamId) continue;
          await tx.insert("rehearsal_teams", {
            id: newId(),
            communityId,
            rehearsalId: id,
            teamId,
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
