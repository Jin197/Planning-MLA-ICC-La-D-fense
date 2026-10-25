import "server-only";
import { newId } from "@/lib/ids";
import { nowIso } from "@/lib/time";
import { err, ok, type Result } from "@/lib/result";
import { occurrencesOf } from "@/domain/events";
import { canReadReason } from "@/domain/permissions";
import type { AvailabilityAnswer, Id } from "@/domain/types";
import { getDataAdapter } from "../data";
import { ConstraintError, type Tx } from "../data/port";
import { requireActiveMembership } from "../auth/context";
import { enqueueNotifications } from "../notifications/enqueue";

/**
 * Disponibilites. Une reponse porte sur une occurrence — un sous-evenement,
 * ou l'evenement lui-meme quand il n'en a aucun — jamais sur une journee.
 * L'interface peut proposer une selection multiple, mais elle enregistre une
 * reponse par occurrence choisie.
 */

export interface AnswerInput {
  eventId: Id;
  /**
   * Sous-evenements vises. Laisser vide quand l'evenement n'a pas de
   * sous-evenement : la reponse porte alors sur l'evenement.
   */
  sessionIds: Id[];
  answer: AvailabilityAnswer;
  /** Motif facultatif, prive : auteur et admins de la communaute seulement. */
  reason?: string | null;
}

export async function answerAvailability(
  communityId: Id,
  input: AnswerInput,
): Promise<Result<{ saved: number }>> {
  const ctx = await requireActiveMembership(communityId);
  const adapter = getDataAdapter();

  try {
    return await adapter.transaction(async (tx) => {
      const event = await tx.selectOne("events", {
        where: { id: input.eventId, communityId },
      });
      if (!event) return err("evenement_inconnu", "Evenement introuvable.");

      const openStates = new Set(["collecte", "publie"]);
      if (!openStates.has(event.state)) {
        return err(
          "collecte_fermee",
          "Les reponses ne sont pas ouvertes pour cet evenement.",
        );
      }
      if (event.responseDeadline !== null && event.responseDeadline < nowIso()) {
        return err(
          "limite_depassee",
          "La limite de reponse est depassee. Contactez un admin.",
        );
      }

      const sessions = await tx.select("event_sessions", {
        where: { eventId: event.id },
      });

      // Les occurrences visees : les sous-evenements choisis, ou l'evenement
      // lui-meme s'il n'en a pas.
      let targets: (Id | null)[];
      if (sessions.length === 0) {
        targets = [null];
      } else {
        targets = sessions
          .filter((s) => input.sessionIds.includes(s.id))
          .map((s) => s.id);
        if (targets.length === 0) {
          return err(
            "aucun_sous_evenement",
            "Choisissez au moins un sous-evenement.",
          );
        }
      }

      const at = nowIso();
      let saved = 0;

      for (const sessionId of targets) {
        const existing = (
          await tx.select("availabilities", {
            where: {
              eventId: event.id,
              membershipId: ctx.membership.membershipId,
            },
          })
        ).find((a) => a.sessionId === sessionId);

        let availabilityId: Id;
        if (existing) {
          const updated = await tx.update("availabilities", existing.id, {
            answer: input.answer,
            needsReconfirmation: false,
            updatedAt: at,
          });
          availabilityId = updated.id;
        } else {
          availabilityId = newId();
          await tx.insert("availabilities", {
            id: availabilityId,
            communityId,
            eventId: event.id,
            sessionId,
            membershipId: ctx.membership.membershipId,
            answer: input.answer,
            needsReconfirmation: false,
            answeredAt: at,
            updatedAt: at,
          });
        }
        saved += 1;

        await upsertReason(
          tx,
          { communityId, availabilityId, authorUserId: ctx.viewer.userId },
          input.reason ?? null,
        );
      }

      // Une personne affectee qui devient indisponible : l'affectation est
      // conservee, marquee « A remplacer », et les admins sont prevenus.
      if (input.answer === "indisponible") {
        await flagAssignmentsToReplace(tx, {
          communityId,
          eventId: event.id,
          membershipId: ctx.membership.membershipId,
          sessionIds: targets,
          sessionCount: sessions.length,
        });
      }

      return ok({ saved });
    });
  } catch (error) {
    if (error instanceof ConstraintError) return err(error.code, error.message);
    throw error;
  }
}

async function upsertReason(
  tx: Tx,
  ctx: { communityId: Id; availabilityId: Id; authorUserId: Id },
  text: string | null,
): Promise<void> {
  const existing = await tx.selectOne("availability_reasons", {
    where: { availabilityId: ctx.availabilityId },
  });
  const trimmed = text?.trim() ?? "";
  const at = nowIso();

  if (trimmed === "") {
    if (existing) await tx.remove("availability_reasons", existing.id);
    return;
  }
  if (existing) {
    await tx.update("availability_reasons", existing.id, {
      text: trimmed,
      updatedAt: at,
    });
    return;
  }
  await tx.insert("availability_reasons", {
    id: newId(),
    communityId: ctx.communityId,
    availabilityId: ctx.availabilityId,
    authorUserId: ctx.authorUserId,
    text: trimmed,
    createdAt: at,
    updatedAt: at,
  });
}

/**
 * Marque « a remplacer » les affectations devenues sans titulaire.
 *
 * Une equipe rattachee a toute la duree de l'evenement n'est concernee que
 * si la personne n'est plus disponible sur aucune occurrence : une
 * indisponibilite sur un seul sous-evenement ne la retire pas du reste.
 */
async function flagAssignmentsToReplace(
  tx: Tx,
  input: {
    communityId: Id;
    eventId: Id;
    membershipId: Id;
    sessionIds: readonly (Id | null)[];
    sessionCount: number;
  },
): Promise<number> {
  const { communityId, eventId, membershipId } = input;
  const answers = (
    await tx.select("availabilities", { where: { eventId, membershipId } })
  ).filter((a) => a.answer === "indisponible");
  const unavailableEverywhere =
    input.sessionCount === 0
      ? input.sessionIds.includes(null)
      : answers.filter((a) => a.sessionId !== null).length >= input.sessionCount;

  const plans = (
    await tx.select("event_plans", { where: { eventId } })
  ).filter(
    (p) =>
      input.sessionIds.includes(p.sessionId) ||
      (p.sessionId === null && unavailableEverywhere),
  );
  if (plans.length === 0) return 0;
  const assignments = (
    await tx.select("assignments", { where: { membershipId } })
  ).filter((a) => plans.some((p) => p.id === a.planId) && a.state !== "retiree");
  if (assignments.length === 0) return 0;

  const at = nowIso();
  for (const a of assignments) {
    if (a.state === "a_remplacer") continue;
    await tx.update("assignments", a.id, { state: "a_remplacer", updatedAt: at });
  }

  const admins = await tx.select("community_memberships", {
    where: { communityId, status: "active", role: "admin" },
  });
  const membership = await tx.selectOne("community_memberships", {
    where: { id: membershipId },
  });
  const profile = membership
    ? await tx.selectOne("profiles", { where: { id: membership.userId } })
    : null;
  const event = await tx.selectOne("events", { where: { id: eventId } });

  await enqueueNotifications(tx, {
    kind: "affectation_a_remplacer",
    recipientUserIds: admins.map((a) => a.userId),
    communityId,
    eventId,
    // Aucun motif prive n'apparait ici.
    body: `${profile ? `${profile.firstName} ${profile.lastName}` : "Un membre"} s'est declare indisponible sur « ${event?.title ?? "un evenement"} » : ${assignments.length} affectation(s) a remplacer.`,
    href: `/c/${communityId}/evenements/${eventId}`,
    subjectId: `${membershipId}:${eventId}:indisponible`,
    revision: at,
  });

  return assignments.length;
}

export async function answerRehearsalAvailability(
  communityId: Id,
  input: { rehearsalId: Id; answer: AvailabilityAnswer; reason?: string | null },
): Promise<Result<{ saved: boolean }>> {
  const ctx = await requireActiveMembership(communityId);
  const adapter = getDataAdapter();
  return adapter.transaction(async (tx) => {
    const rehearsal = await tx.selectOne("rehearsals", {
      where: { id: input.rehearsalId, communityId },
    });
    if (!rehearsal) return err("repetition_inconnue", "Repetition introuvable.");

    const at = nowIso();
    const existing = await tx.selectOne("rehearsal_availabilities", {
      where: {
        rehearsalId: input.rehearsalId,
        membershipId: ctx.membership.membershipId,
      },
    });

    let id: Id;
    if (existing) {
      const updated = await tx.update("rehearsal_availabilities", existing.id, {
        answer: input.answer,
        needsReconfirmation: false,
        updatedAt: at,
      });
      id = updated.id;
    } else {
      id = newId();
      await tx.insert("rehearsal_availabilities", {
        id,
        communityId,
        rehearsalId: input.rehearsalId,
        membershipId: ctx.membership.membershipId,
        answer: input.answer,
        needsReconfirmation: false,
        answeredAt: at,
        updatedAt: at,
      });
    }

    const reason = input.reason?.trim() ?? "";
    const existingReason = await tx.selectOne("rehearsal_availability_reasons", {
      where: { rehearsalAvailabilityId: id },
    });
    if (reason === "") {
      if (existingReason) {
        await tx.remove("rehearsal_availability_reasons", existingReason.id);
      }
    } else if (existingReason) {
      await tx.update("rehearsal_availability_reasons", existingReason.id, {
        text: reason,
        updatedAt: at,
      });
    } else {
      await tx.insert("rehearsal_availability_reasons", {
        id: newId(),
        communityId,
        rehearsalAvailabilityId: id,
        authorUserId: ctx.viewer.userId,
        text: reason,
        createdAt: at,
        updatedAt: at,
      });
    }

    return ok({ saved: true });
  });
}

/** Cle d'une occurrence dans la grille : un sous-evenement, ou l'evenement. */
export const COLONNE_EVENEMENT = "evenement";

export interface AvailabilityGridRow {
  membershipId: Id;
  name: string;
  initials: string;
  skills: string[];
  /** Cle : identifiant de sous-evenement, ou `COLONNE_EVENEMENT`. */
  answers: Record<string, { state: string; reason: string | null }>;
}

/**
 * Tableau des reponses pour un evenement. Une colonne par occurrence : les
 * sous-evenements, ou l'evenement seul quand il n'en a pas. Le motif n'est
 * renvoye que si le lecteur a le droit de le lire : la verification est
 * refaite ici, cote serveur, pas seulement a l'affichage.
 */
export async function availabilityGrid(
  communityId: Id,
  eventId: Id,
): Promise<
  Result<{
    columns: { key: string; label: string }[];
    rows: AvailabilityGridRow[];
  }>
> {
  const ctx = await requireActiveMembership(communityId);
  const adapter = getDataAdapter();

  return adapter.read(async (tx) => {
    const event = await tx.selectOne("events", { where: { id: eventId, communityId } });
    if (!event) return err("evenement_inconnu", "Evenement introuvable.");
    if (event.state === "brouillon" && ctx.membership.role !== "admin") {
      return err("evenement_non_visible", "Cet evenement n'est pas accessible.");
    }

    const sessions = (await tx.select("event_sessions", { where: { eventId } })).sort(
      (a, b) => a.ordinal - b.ordinal,
    );
    const occurrences = occurrencesOf(event, sessions);
    const memberships = await tx.select("community_memberships", {
      where: { communityId, status: "active" },
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
    const skills = await tx.select("skills", { where: { communityId } });
    const links = await tx.select("membership_skills", { where: { communityId } });

    const profileById = new Map(profiles.map((p) => [p.id, p]));
    const skillById = new Map(skills.map((s) => [s.id, s.label]));

    const rows = memberships.map((m): AvailabilityGridRow => {
      const profile = profileById.get(m.userId);
      const answers: AvailabilityGridRow["answers"] = {};
      for (const occurrence of occurrences) {
        const a = availabilities.find(
          (x) => x.sessionId === occurrence.sessionId && x.membershipId === m.id,
        );
        const reasonRow = a
          ? reasons.find((r) => r.availabilityId === a.id)
          : undefined;
        const mayRead =
          reasonRow !== undefined &&
          canReadReason(ctx.viewer, ctx.membership, reasonRow.authorUserId);
        answers[occurrence.sessionId ?? COLONNE_EVENEMENT] = {
          state: a
            ? a.needsReconfirmation
              ? "a_reconfirmer"
              : a.answer
            : "a_renseigner",
          reason: mayRead ? (reasonRow?.text ?? null) : null,
        };
      }
      return {
        membershipId: m.id,
        name: profile ? `${profile.firstName} ${profile.lastName}` : "Membre",
        initials: profile
          ? `${profile.firstName.charAt(0)}${profile.lastName.charAt(0)}`.toUpperCase()
          : "--",
        skills: links
          .filter((l) => l.membershipId === m.id)
          .map((l) => skillById.get(l.skillId) ?? "")
          .filter(Boolean),
        answers,
      };
    });

    return ok({
      columns: occurrences.map((o) => ({
        key: o.sessionId ?? COLONNE_EVENEMENT,
        label: o.label,
      })),
      rows,
    });
  });
}
