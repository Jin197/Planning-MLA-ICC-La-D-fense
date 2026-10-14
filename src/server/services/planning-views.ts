import "server-only";
import { localDayKey } from "@/lib/time";
import { displayState } from "@/domain/availability";
import { canSeeAssignments, canSeeEvent } from "@/domain/permissions";
import type {
  AssignmentState,
  AvailabilityDisplayState,
  EventState,
  Id,
} from "@/domain/types";
import { getDataAdapter } from "../data";
import { requireActiveMembership } from "../auth/context";

/**
 * Les trois vues du planning (agenda, calendrier, tableau) sont calculees sur
 * les memes donnees. Le tableau n'est pas une seconde source de verite.
 */

export interface VueCreneau {
  id: Id;
  label: string;
  ordinal: number;
  startsAt: string;
  endsAt: string;
  locationName: string;
  scheduleProvisional: boolean;
  /** Ma reponse sur ce creneau. */
  maDisponibilite: AvailabilityDisplayState;
  /** Mes postes sur ce creneau, si le plan est visible. */
  mesPostes: { label: string; state: AssignmentState }[];
  /** Effectif : postes a completer, pour les admins. */
  postesACompleter: number;
}

export interface VueEvenement {
  id: Id;
  title: string;
  state: EventState;
  timezone: string;
  jour: string;
  creneaux: VueCreneau[];
  repetitions: {
    id: Id;
    label: string;
    startsAt: string;
    endsAt: string;
    locationName: string;
    room: string;
    maDisponibilite: AvailabilityDisplayState;
  }[];
  messagesNonLus: number;
}

export interface LignePersonne {
  membershipId: Id;
  nom: string;
  initiales: string;
  competences: string[];
  /** Par creneau : etat de disponibilite et postes tenus. */
  cellules: Record<
    Id,
    {
      disponibilite: AvailabilityDisplayState;
      postes: string[];
      /** Motif, uniquement si le lecteur a le droit de le lire. */
      motif: string | null;
    }
  >;
}

export interface VuePlanning {
  communityId: Id;
  communityName: string;
  timezone: string;
  estAdmin: boolean;
  evenements: VueEvenement[];
  /** Colonnes du tableau : creneaux dans l'ordre chronologique. */
  colonnes: { sessionId: Id; eventId: Id; eventTitle: string; label: string; startsAt: string }[];
  lignes: LignePersonne[];
}

export async function loadVuePlanning(
  communityId: Id,
  options: { from?: string; to?: string; inclureArchives?: boolean } = {},
): Promise<VuePlanning> {
  const ctx = await requireActiveMembership(communityId);
  const adapter = getDataAdapter();
  const estAdmin = ctx.membership.role === "admin";

  return adapter.read(async (tx) => {
    const community = await tx.selectOne("communities", { where: { id: communityId } });
    const timezone = community?.timezone ?? "Europe/Paris";

    const tousEvenements = await tx.select("events", { where: { communityId } });
    const evenements = tousEvenements
      .filter((e) => canSeeEvent(ctx.membership, e.state))
      .filter((e) => (options.inclureArchives ? true : e.state !== "archive"));
    const eventIds = evenements.map((e) => e.id);

    const creneaux = (await tx.select("event_sessions", { whereIn: { eventId: eventIds } }))
      .filter((s) => {
        if (options.from && s.startsAt < options.from) return false;
        if (options.to && s.startsAt > options.to) return false;
        return true;
      })
      .sort((a, b) => (a.startsAt < b.startsAt ? -1 : 1));

    const plans = await tx.select("event_plans", { whereIn: { eventId: eventIds } });
    const slots = await tx.select("event_role_slots", {
      whereIn: { planId: plans.map((p) => p.id) },
    });
    const assignments = (
      await tx.select("assignments", { whereIn: { planId: plans.map((p) => p.id) } })
    ).filter((a) => a.state !== "retiree");
    const availabilities = await tx.select("session_availabilities", {
      whereIn: { sessionId: creneaux.map((s) => s.id) },
    });
    const reasons = estAdmin
      ? await tx.select("availability_reasons", {
          whereIn: { availabilityId: availabilities.map((a) => a.id) },
        })
      : await tx.select("availability_reasons", {
          where: { authorUserId: ctx.viewer.userId },
        });
    const repetitions = await tx.select("rehearsals", { whereIn: { eventId: eventIds } });
    const repetitionsDispos = await tx.select("rehearsal_availabilities", {
      where: { membershipId: ctx.membership.membershipId },
    });
    const memberships = await tx.select("community_memberships", {
      where: { communityId, status: "active" },
    });
    const profiles = await tx.select("profiles", {
      whereIn: { id: memberships.map((m) => m.userId) },
    });
    const skills = await tx.select("skills", { where: { communityId } });
    const skillLinks = await tx.select("membership_skills", { where: { communityId } });
    const messages = await tx.select("event_messages", { whereIn: { eventId: eventIds } });
    const cursors = await tx.select("message_read_cursors", {
      where: { userId: ctx.viewer.userId },
    });

    const planById = new Map(plans.map((p) => [p.id, p]));
    const slotById = new Map(slots.map((s) => [s.id, s]));
    const profileById = new Map(profiles.map((p) => [p.id, p]));
    const skillById = new Map(skills.map((s) => [s.id, s.label]));
    const reasonByAvailability = new Map(reasons.map((r) => [r.availabilityId, r]));
    const cursorByEvent = new Map(cursors.map((c) => [c.eventId, c.lastReadAt]));

    const vueEvenements: VueEvenement[] = evenements
      .map((event): VueEvenement | null => {
        const own = creneaux.filter((s) => s.eventId === event.id);
        if (own.length === 0) return null;
        const planVisible = canSeeAssignments(ctx.membership, event.state);
        const lastRead = cursorByEvent.get(event.id) ?? "1970-01-01T00:00:00.000Z";

        return {
          id: event.id,
          title: event.title,
          state: event.state,
          timezone: event.timezone,
          jour: localDayKey(own[0]!.startsAt, event.timezone),
          creneaux: own.map((session): VueCreneau => {
            const mine = availabilities.find(
              (a) =>
                a.sessionId === session.id &&
                a.membershipId === ctx.membership.membershipId,
            );
            const sessionPlans = plans.filter((p) => p.sessionId === session.id);
            const sessionSlots = slots.filter((s) =>
              sessionPlans.some((p) => p.id === s.planId),
            );
            const postesACompleter = estAdmin
              ? sessionSlots.filter((slot) => {
                  if (!slot.enabled) return false;
                  const count = assignments.filter(
                    (a) => a.slotId === slot.id && a.state !== "a_remplacer",
                  ).length;
                  return count < slot.minRequired;
                }).length
              : 0;

            return {
              id: session.id,
              label: session.label,
              ordinal: session.ordinal,
              startsAt: session.startsAt,
              endsAt: session.endsAt,
              locationName: session.locationName,
              scheduleProvisional: session.scheduleProvisional,
              maDisponibilite: displayState(mine),
              mesPostes: planVisible
                ? assignments
                    .filter(
                      (a) =>
                        a.membershipId === ctx.membership.membershipId &&
                        planById.get(a.planId)?.sessionId === session.id,
                    )
                    .map((a) => ({
                      label: slotById.get(a.slotId)?.label ?? "Poste",
                      state: a.state,
                    }))
                : [],
              postesACompleter,
            };
          }),
          repetitions: repetitions
            .filter((r) => r.eventId === event.id)
            .sort((a, b) => (a.startsAt < b.startsAt ? -1 : 1))
            .map((r) => ({
              id: r.id,
              label: r.label,
              startsAt: r.startsAt,
              endsAt: r.endsAt,
              locationName: r.locationName,
              room: r.room,
              maDisponibilite: displayState(
                repetitionsDispos.find((a) => a.rehearsalId === r.id),
              ),
            })),
          messagesNonLus: messages.filter(
            (m) =>
              m.eventId === event.id &&
              m.deletedAt === null &&
              m.createdAt > lastRead &&
              m.authorUserId !== ctx.viewer.userId,
          ).length,
        };
      })
      .filter((e): e is VueEvenement => e !== null);

    /* Tableau : memes donnees, presentation en grille. */
    const colonnes = creneaux
      .filter((s) => {
        const event = evenements.find((e) => e.id === s.eventId);
        return event !== undefined && event.state !== "brouillon";
      })
      .map((s) => ({
        sessionId: s.id,
        eventId: s.eventId,
        eventTitle: evenements.find((e) => e.id === s.eventId)?.title ?? "",
        label: s.label,
        startsAt: s.startsAt,
      }));

    const lignes: LignePersonne[] = memberships
      .map((membership): LignePersonne => {
        const profile = profileById.get(membership.userId);
        const cellules: LignePersonne["cellules"] = {};
        for (const colonne of colonnes) {
          const availability = availabilities.find(
            (a) =>
              a.sessionId === colonne.sessionId && a.membershipId === membership.id,
          );
          const event = evenements.find((e) => e.id === colonne.eventId);
          const planVisible = event
            ? canSeeAssignments(ctx.membership, event.state)
            : false;
          const reason = availability
            ? reasonByAvailability.get(availability.id)
            : undefined;
          const peutLire =
            reason !== undefined &&
            (estAdmin || reason.authorUserId === ctx.viewer.userId);

          cellules[colonne.sessionId] = {
            disponibilite: displayState(availability),
            postes: planVisible
              ? assignments
                  .filter(
                    (a) =>
                      a.membershipId === membership.id &&
                      planById.get(a.planId)?.sessionId === colonne.sessionId,
                  )
                  .map((a) => slotById.get(a.slotId)?.label ?? "Poste")
              : [],
            motif: peutLire ? (reason?.text ?? null) : null,
          };
        }
        return {
          membershipId: membership.id,
          nom: profile ? `${profile.firstName} ${profile.lastName}` : "Membre",
          initiales: profile
            ? `${profile.firstName.charAt(0)}${profile.lastName.charAt(0)}`.toUpperCase()
            : "--",
          competences: skillLinks
            .filter((l) => l.membershipId === membership.id)
            .map((l) => skillById.get(l.skillId) ?? "")
            .filter(Boolean),
          cellules,
        };
      })
      .sort((a, b) => a.nom.localeCompare(b.nom, "fr"));

    return {
      communityId,
      communityName: community?.name ?? "",
      timezone,
      estAdmin,
      evenements: vueEvenements,
      colonnes,
      lignes,
    };
  });
}
