import "server-only";
import { newId } from "@/lib/ids";
import { err, ok, type Result } from "@/lib/result";
import { nowIso } from "@/lib/time";
import { copyTemplateIntoPlan } from "@/domain/template";
import type { Id } from "@/domain/types";
import { getDataAdapter } from "../data";
import { ConstraintError, VersionConflictError, type Tx } from "../data/port";
import { getCommunityContext, requireCommunityAction } from "../auth/context";
import { writeAudit } from "../notifications/enqueue";

/**
 * Equipes d'un evenement.
 *
 * Une equipe est creee dans un evenement, en nombre libre, et n'existe que
 * pour lui : son nom, son effectif et ses rattachements disparaissent avec
 * l'evenement. C'est le choix de fonctionnement retenu — rien ne se reporte
 * automatiquement d'un evenement au suivant, la duplication d'evenement
 * restant la facon de repartir d'une composition connue.
 *
 * Le rattachement d'une equipe est porte par son plan : un sous-evenement
 * precis, ou `null` pour toute la duree de l'evenement.
 */

/** Charge l'evenement et verifie que l'appelant peut le modifier. */
async function loadWritableEvent(tx: Tx, communityId: Id, eventId: Id) {
  const event = await tx.selectOne("events", {
    where: { id: eventId, communityId },
  });
  if (!event) return null;
  await requireCommunityAction(communityId, "evenement.modifier", {
    eventState: event.state,
  });
  return event;
}

/**
 * Verrou optimiste partage avec les autres ecritures de l'evenement : la
 * composition des equipes compte comme une modification de l'evenement.
 */
async function bumpVersion(
  tx: Tx,
  eventId: Id,
  expectedVersion: number,
): Promise<void> {
  const fresh = await tx.selectOne("events", { where: { id: eventId } });
  if (!fresh) throw new ConstraintError("event_missing", "Evenement introuvable.");
  if (fresh.version !== expectedVersion) {
    throw new VersionConflictError(
      "Cet evenement a ete modifie par un autre admin. Rechargez pour voir la version a jour.",
      fresh.version,
    );
  }
  await tx.update("events", eventId, {
    version: fresh.version + 1,
    updatedAt: nowIso(),
  });
}

/**
 * Cree le plan d'une equipe.
 *
 * Si l'equipe est deja rattachee ailleurs, la nouvelle feuille reprend la
 * sienne — postes retenus, libelles et effectifs compris. Une equipe garde
 * ainsi la meme composition de postes d'un sous-evenement a l'autre, y
 * compris apres un reglage fait a la main.
 */
async function createPlan(
  tx: Tx,
  input: {
    communityId: Id;
    eventId: Id;
    sessionId: Id | null;
    teamId: Id;
    /** Postes du modele retenus ; ignore si l'equipe a deja un plan. */
    templateFieldIds?: readonly Id[];
  },
): Promise<Id> {
  const template = await tx.selectOne("planning_templates", {
    where: { communityId: input.communityId },
  });
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

  const existant = (
    await tx.select("event_plans", { where: { teamId: input.teamId } })
  ).find((p) => p.id !== planId);
  if (existant) {
    const modele = await tx.select("event_role_slots", {
      where: { planId: existant.id },
    });
    await tx.insertMany(
      "event_role_slots",
      modele.map((slot) => ({ ...slot, id: newId(), planId })),
    );
    return planId;
  }

  const fields = template
    ? await tx.select("template_fields", { where: { templateId: template.id } })
    : [];
  await tx.insertMany(
    "event_role_slots",
    copyTemplateIntoPlan(fields, {
      communityId: input.communityId,
      planId,
      retenus: input.templateFieldIds,
    }),
  );
  return planId;
}

/**
 * Traduit les erreurs de concurrence et de contrainte en resultats lisibles,
 * au lieu de laisser remonter une exception technique a l'interface.
 */
async function wrap<T>(run: () => Promise<Result<T>>): Promise<Result<T>> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof VersionConflictError) {
      return err("conflit_de_version", error.message);
    }
    if (error instanceof ConstraintError) {
      return err(error.code, error.message);
    }
    throw error;
  }
}

export interface AddTeamInput {
  name: string;
  /** Adhesions placees dans l'equipe des sa creation. */
  membershipIds?: Id[];
  /**
   * Sous-evenements couverts. Une liste vide rattache l'equipe a toute la
   * duree de l'evenement.
   */
  sessionIds?: Id[];
  /** Postes du modele dont l'equipe a besoin. Vide = tout le modele. */
  templateFieldIds?: Id[];
  expectedVersion: number;
}

export async function addTeam(
  communityId: Id,
  eventId: Id,
  input: AddTeamInput,
): Promise<Result<{ teamId: Id }>> {
  const ctx = await getCommunityContext(communityId);
  const adapter = getDataAdapter();

  return wrap(() =>
    adapter.transaction(async (tx) => {
      const event = await loadWritableEvent(tx, communityId, eventId);
      if (!event) return err("evenement_inconnu", "Evenement introuvable.");

      const name = input.name.trim();
      if (name === "") return err("nom_requis", "Donnez un nom a l'equipe.");

      const existing = await tx.select("event_teams", { where: { eventId } });
      await bumpVersion(tx, eventId, input.expectedVersion);

      const teamId = newId();
      await tx.insert("event_teams", {
        id: teamId,
        communityId,
        eventId,
        name,
        order: existing.length + 1,
      });

      const active = await tx.select("community_memberships", {
        where: { communityId, status: "active" },
      });
      for (const membershipId of new Set(input.membershipIds ?? [])) {
        if (!active.some((m) => m.id === membershipId)) continue;
        await tx.insert("event_team_members", {
          id: newId(),
          communityId,
          teamId,
          membershipId,
        });
      }

      const sessions = await tx.select("event_sessions", { where: { eventId } });
      const targets =
        input.sessionIds && input.sessionIds.length > 0
          ? sessions.filter((s) => input.sessionIds!.includes(s.id)).map((s) => s.id)
          : [null];
      for (const sessionId of targets) {
        await createPlan(tx, {
          communityId,
          eventId,
          sessionId,
          teamId,
          templateFieldIds: input.templateFieldIds,
        });
      }

      await writeAudit(tx, {
        communityId,
        actorUserId: ctx.viewer.userId,
        action: "equipe.creee",
        targetType: "event_team",
        targetId: teamId,
        metadata: { evenement: eventId, rattachements: targets.length },
      });

      return ok({ teamId });
    }),
  );
}

export async function renameTeam(
  communityId: Id,
  teamId: Id,
  input: { name: string; expectedVersion: number },
): Promise<Result<{ teamId: Id }>> {
  const adapter = getDataAdapter();
  return wrap(() =>
    adapter.transaction(async (tx) => {
      const team = await tx.selectOne("event_teams", {
        where: { id: teamId, communityId },
      });
      if (!team) return err("equipe_inconnue", "Equipe introuvable.");
      const event = await loadWritableEvent(tx, communityId, team.eventId);
      if (!event) return err("evenement_inconnu", "Evenement introuvable.");

      const name = input.name.trim();
      if (name === "") return err("nom_requis", "Donnez un nom a l'equipe.");

      await bumpVersion(tx, team.eventId, input.expectedVersion);
      await tx.update("event_teams", teamId, { name });
      return ok({ teamId });
    }),
  );
}

/**
 * Suppression d'une equipe. Elle emporte son effectif, ses rattachements et
 * les affectations qui en dependent : c'est une action d'admin explicite, pas
 * un effet de bord.
 */
export async function removeTeam(
  communityId: Id,
  teamId: Id,
  input: { expectedVersion: number },
): Promise<Result<{ teamId: Id; assignmentsRemoved: number }>> {
  const ctx = await getCommunityContext(communityId);
  const adapter = getDataAdapter();

  return wrap(() =>
    adapter.transaction(async (tx) => {
      const team = await tx.selectOne("event_teams", {
        where: { id: teamId, communityId },
      });
      if (!team) return err("equipe_inconnue", "Equipe introuvable.");
      const event = await loadWritableEvent(tx, communityId, team.eventId);
      if (!event) return err("evenement_inconnu", "Evenement introuvable.");

      await bumpVersion(tx, team.eventId, input.expectedVersion);

      const plans = await tx.select("event_plans", { where: { teamId } });
      let assignmentsRemoved = 0;
      for (const plan of plans) {
        const slots = await tx.select("event_role_slots", {
          where: { planId: plan.id },
        });
        assignmentsRemoved += await tx.removeWhere("assignments", {
          planId: plan.id,
        });
        for (const slot of slots) {
          await tx.remove("event_role_slots", slot.id);
        }
        await tx.remove("event_plans", plan.id);
      }
      await tx.removeWhere("event_team_members", { teamId });
      await tx.removeWhere("rehearsal_teams", { teamId });
      await tx.removeWhere("dress_codes", { teamId });
      await tx.remove("event_teams", teamId);

      await writeAudit(tx, {
        communityId,
        actorUserId: ctx.viewer.userId,
        action: "equipe.supprimee",
        targetType: "event_team",
        targetId: teamId,
        metadata: { evenement: team.eventId, affectations: assignmentsRemoved },
      });

      return ok({ teamId, assignmentsRemoved });
    }),
  );
}

/** Remplace l'effectif d'une equipe par la liste fournie. */
export async function setTeamMembers(
  communityId: Id,
  teamId: Id,
  input: { membershipIds: Id[]; expectedVersion: number },
): Promise<Result<{ members: number }>> {
  const adapter = getDataAdapter();
  return wrap(() =>
    adapter.transaction(async (tx) => {
      const team = await tx.selectOne("event_teams", {
        where: { id: teamId, communityId },
      });
      if (!team) return err("equipe_inconnue", "Equipe introuvable.");
      const event = await loadWritableEvent(tx, communityId, team.eventId);
      if (!event) return err("evenement_inconnu", "Evenement introuvable.");

      await bumpVersion(tx, team.eventId, input.expectedVersion);

      const active = await tx.select("community_memberships", {
        where: { communityId, status: "active" },
      });
      const wanted = [...new Set(input.membershipIds)].filter((id) =>
        active.some((m) => m.id === id),
      );
      const current = await tx.select("event_team_members", { where: { teamId } });

      for (const row of current) {
        if (!wanted.includes(row.membershipId)) {
          await tx.remove("event_team_members", row.id);
        }
      }
      for (const membershipId of wanted) {
        if (current.some((r) => r.membershipId === membershipId)) continue;
        await tx.insert("event_team_members", {
          id: newId(),
          communityId,
          teamId,
          membershipId,
        });
      }

      return ok({ members: wanted.length });
    }),
  );
}

/**
 * Rattache une equipe a un sous-evenement, ou a toute la duree de
 * l'evenement quand `sessionId` vaut null.
 */
export async function attachTeam(
  communityId: Id,
  teamId: Id,
  input: { sessionId: Id | null; expectedVersion: number },
): Promise<Result<{ planId: Id }>> {
  const adapter = getDataAdapter();
  return wrap(() =>
    adapter.transaction(async (tx) => {
      const team = await tx.selectOne("event_teams", {
        where: { id: teamId, communityId },
      });
      if (!team) return err("equipe_inconnue", "Equipe introuvable.");
      const event = await loadWritableEvent(tx, communityId, team.eventId);
      if (!event) return err("evenement_inconnu", "Evenement introuvable.");

      if (input.sessionId !== null) {
        const session = await tx.selectOne("event_sessions", {
          where: { id: input.sessionId, eventId: team.eventId },
        });
        if (!session) {
          return err("sous_evenement_inconnu", "Sous-evenement introuvable.");
        }
      }

      await bumpVersion(tx, team.eventId, input.expectedVersion);
      const planId = await createPlan(tx, {
        communityId,
        eventId: team.eventId,
        sessionId: input.sessionId,
        teamId,
      });
      return ok({ planId });
    }),
  );
}

/** Retire un rattachement, avec la feuille de postes qui l'accompagne. */
export async function detachTeam(
  communityId: Id,
  planId: Id,
  input: { expectedVersion: number },
): Promise<Result<{ assignmentsRemoved: number }>> {
  const ctx = await getCommunityContext(communityId);
  const adapter = getDataAdapter();

  return wrap(() =>
    adapter.transaction(async (tx) => {
      const plan = await tx.selectOne("event_plans", {
        where: { id: planId, communityId },
      });
      if (!plan) return err("plan_inconnu", "Rattachement introuvable.");
      const event = await loadWritableEvent(tx, communityId, plan.eventId);
      if (!event) return err("evenement_inconnu", "Evenement introuvable.");

      await bumpVersion(tx, plan.eventId, input.expectedVersion);

      const assignmentsRemoved = await tx.removeWhere("assignments", { planId });
      const slots = await tx.select("event_role_slots", { where: { planId } });
      for (const slot of slots) {
        await tx.remove("event_role_slots", slot.id);
      }
      await tx.remove("event_plans", planId);

      await writeAudit(tx, {
        communityId,
        actorUserId: ctx.viewer.userId,
        action: "equipe.detachee",
        targetType: "event_plan",
        targetId: planId,
        metadata: {
          evenement: plan.eventId,
          equipe: plan.teamId,
          affectations: assignmentsRemoved,
        },
      });

      return ok({ assignmentsRemoved });
    }),
  );
}
