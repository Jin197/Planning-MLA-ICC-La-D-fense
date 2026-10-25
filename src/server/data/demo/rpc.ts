import "server-only";
import { newId, slugify } from "@/lib/ids";
import { nowIso } from "@/lib/time";
import { DEFAULT_PREFERENCES } from "@/domain/notifications";
import { wouldLeaveNoAdmin } from "@/domain/permissions";
import { buildTemplate } from "@/domain/template";
import { computePublicationReadiness } from "@/domain/events";
import type { CommunityType, Id } from "@/domain/types";
import {
  ConstraintError,
  VersionConflictError,
  type RpcMap,
  type RpcName,
  type Tx,
} from "../port";
import { enqueueNotifications, writeAudit } from "../../notifications/enqueue";

/**
 * Operations atomiques critiques de l'adaptateur de demonstration. Elles
 * reproduisent les fonctions SQL `security definer` de `supabase/migrations`.
 * Les deux chemins appliquent les memes regles : aucune n'est une simple
 * mise a jour de colonne.
 */

async function requireActiveAdmin(
  tx: Tx,
  communityId: Id,
  userId: Id,
): Promise<Id> {
  const membership = await tx.selectOne("community_memberships", {
    where: { communityId, userId, status: "active" },
  });
  if (!membership || membership.role !== "admin") {
    throw new ConstraintError(
      "not_community_admin",
      "Cette operation est reservee aux admins de cette communaute.",
    );
  }
  return membership.id;
}

async function activeAdminUserIds(tx: Tx, communityId: Id): Promise<Id[]> {
  const rows = await tx.select("community_memberships", {
    where: { communityId, status: "active", role: "admin" },
  });
  return rows.map((r) => r.userId);
}

async function uniqueSlug(tx: Tx, name: string): Promise<string> {
  const base = slugify(name) || "communaute";
  let candidate = base;
  let n = 2;
  while (await tx.selectOne("communities", { where: { slug: candidate } })) {
    candidate = `${base}-${n}`;
    n += 1;
  }
  return candidate;
}

async function createCommunityWithAdmin(
  tx: Tx,
  args: RpcMap["create_community_with_admin"]["args"],
): Promise<RpcMap["create_community_with_admin"]["result"]> {
  const profile = await tx.selectOne("profiles", { where: { id: args.userId } });
  if (!profile) {
    throw new ConstraintError("profile_missing", "Profil introuvable.");
  }
  if (!profile.emailVerifiedAt) {
    throw new ConstraintError(
      "email_not_verified",
      "Verifiez votre email avant de creer une communaute.",
    );
  }

  const at = nowIso();
  const communityId = newId();
  const type = args.type as CommunityType;

  await tx.insert("communities", {
    id: communityId,
    slug: await uniqueSlug(tx, args.name),
    name: args.name,
    type,
    otherLabel: type === "AUTRE" ? args.otherLabel : null,
    description: args.description,
    displayedLeaderName: args.displayedLeaderName,
    createdBy: args.userId,
    timezone: args.timezone,
    createdAt: at,
  });

  // Le createur devient admin de cette communaute, et d'aucune autre.
  const membershipId = newId();
  await tx.insert("community_memberships", {
    id: membershipId,
    communityId,
    userId: args.userId,
    role: "admin",
    status: "active",
    joinedAt: at,
    revokedAt: null,
  });

  // Le modele est installe une seule fois, dans la meme transaction.
  const { template, fields } = buildTemplate(communityId, type, at);
  await tx.insert("planning_templates", template);
  await tx.insertMany("template_fields", fields);

  // Aucune equipe n'est creee ici : une equipe appartient a un evenement et
  // se cree dans celui-ci.
  const skillLabels =
    type === "MLA"
      ? [
          "LEAD",
          "Tenor",
          "Alto",
          "Mezzo-soprano",
          "Soprano",
          "Piano",
          "Batterie",
          "Basse",
          "Guitare",
        ]
      : ["Accueil", "Orientation", "Technique"];
  await tx.insertMany(
    "skills",
    skillLabels.map((label) => ({ id: newId(), communityId, label })),
  );

  const prefs = await tx.selectOne("notification_preferences", {
    where: { userId: args.userId },
  });
  if (!prefs) {
    await tx.insert("notification_preferences", {
      userId: args.userId,
      ...DEFAULT_PREFERENCES,
    });
  }

  await writeAudit(tx, {
    communityId,
    actorUserId: args.userId,
    action: "communaute.creee",
    targetType: "community",
    targetId: communityId,
    metadata: { type, templateVersion: template.version },
  });

  return { communityId, membershipId, templateId: template.id };
}

async function acceptJoinRequest(
  tx: Tx,
  args: RpcMap["accept_join_request"]["args"],
): Promise<RpcMap["accept_join_request"]["result"]> {
  const request = await tx.selectOne("join_requests", {
    where: { id: args.requestId },
  });
  if (!request) {
    throw new ConstraintError("join_request_missing", "Demande introuvable.");
  }
  if (request.status !== "en_attente") {
    throw new ConstraintError(
      "join_request_not_pending",
      "Cette demande a deja ete traitee.",
    );
  }
  await requireActiveAdmin(tx, request.communityId, args.actorUserId);

  const at = nowIso();
  const existing = await tx.selectOne("community_memberships", {
    where: { communityId: request.communityId, userId: request.userId },
  });

  let membershipId: Id;
  if (existing) {
    // Reactivation : le role repart a membre.
    const updated = await tx.update("community_memberships", existing.id, {
      status: "active",
      role: existing.role === "admin" ? "admin" : "membre",
      revokedAt: null,
      joinedAt: at,
    });
    membershipId = updated.id;
  } else {
    membershipId = newId();
    await tx.insert("community_memberships", {
      id: membershipId,
      communityId: request.communityId,
      userId: request.userId,
      role: "membre",
      status: "active",
      joinedAt: at,
      revokedAt: null,
    });
  }

  await tx.update("join_requests", request.id, {
    status: "acceptee",
    decidedBy: args.actorUserId,
    decidedAt: at,
    decisionNote: args.note,
  });

  const community = await tx.selectOne("communities", {
    where: { id: request.communityId },
  });

  await enqueueNotifications(tx, {
    kind: "adhesion_acceptee",
    recipientUserIds: [request.userId],
    communityId: request.communityId,
    eventId: null,
    body: `Votre demande d'adhesion a « ${community?.name ?? "la communaute"} » a ete acceptee.`,
    href: `/c/${request.communityId}/planning`,
    subjectId: request.id,
  });

  await writeAudit(tx, {
    communityId: request.communityId,
    actorUserId: args.actorUserId,
    action: "adhesion.acceptee",
    targetType: "join_request",
    targetId: request.id,
    metadata: { userId: request.userId },
  });

  return { membershipId };
}

async function changeMembershipRole(
  tx: Tx,
  args: RpcMap["change_membership_role"]["args"],
): Promise<RpcMap["change_membership_role"]["result"]> {
  const membership = await tx.selectOne("community_memberships", {
    where: { id: args.membershipId },
  });
  if (!membership) {
    throw new ConstraintError("membership_missing", "Adhesion introuvable.");
  }
  await requireActiveAdmin(tx, membership.communityId, args.actorUserId);

  if (membership.role === "admin" && args.role === "membre") {
    const admins = await activeAdminUserIds(tx, membership.communityId);
    if (wouldLeaveNoAdmin(admins, membership.userId)) {
      throw new ConstraintError(
        "last_admin_protected",
        "Cette communaute doit conserver au moins un admin actif.",
      );
    }
  }

  await tx.update("community_memberships", membership.id, { role: args.role });
  await writeAudit(tx, {
    communityId: membership.communityId,
    actorUserId: args.actorUserId,
    action: args.role === "admin" ? "role.promu" : "role.retrograde",
    targetType: "community_membership",
    targetId: membership.id,
    metadata: { userId: membership.userId, role: args.role },
  });

  return { membershipId: membership.id };
}

async function revokeMembership(
  tx: Tx,
  args: RpcMap["revoke_membership"]["args"],
): Promise<RpcMap["revoke_membership"]["result"]> {
  const membership = await tx.selectOne("community_memberships", {
    where: { id: args.membershipId },
  });
  if (!membership) {
    throw new ConstraintError("membership_missing", "Adhesion introuvable.");
  }

  const isSelf = membership.userId === args.actorUserId;
  if (!isSelf) {
    await requireActiveAdmin(tx, membership.communityId, args.actorUserId);
  }

  if (membership.role === "admin") {
    const admins = await activeAdminUserIds(tx, membership.communityId);
    if (wouldLeaveNoAdmin(admins, membership.userId)) {
      throw new ConstraintError(
        "last_admin_protected",
        "Le dernier admin actif ne peut pas quitter la communaute.",
      );
    }
  }

  const at = nowIso();
  await tx.update("community_memberships", membership.id, {
    status: "revoked",
    revokedAt: at,
  });

  // Les affectations futures sont signalees a remplacer, jamais effacees.
  const plans = await tx.select("event_plans", {
    where: { communityId: membership.communityId },
  });
  const sessions = await tx.select("event_sessions", {
    where: { communityId: membership.communityId },
  });
  const events = await tx.select("events", {
    where: { communityId: membership.communityId },
  });
  const futureSessionIds = new Set(
    sessions.filter((s) => s.startsAt > at).map((s) => s.id),
  );
  const futureEventIds = new Set(
    events.filter((e) => e.startsAt > at).map((e) => e.id),
  );
  // Un plan rattache a tout l'evenement suit l'horaire de l'evenement.
  const futurePlanIds = new Set(
    plans
      .filter((p) =>
        p.sessionId === null
          ? futureEventIds.has(p.eventId)
          : futureSessionIds.has(p.sessionId),
      )
      .map((p) => p.id),
  );

  const assignments = await tx.select("assignments", {
    where: { membershipId: membership.id },
  });
  let toReplace = 0;
  for (const a of assignments) {
    if (!futurePlanIds.has(a.planId)) continue;
    if (a.state === "retiree") continue;
    await tx.update("assignments", a.id, {
      state: "a_remplacer",
      updatedAt: at,
    });
    toReplace += 1;
  }

  if (toReplace > 0) {
    const admins = await activeAdminUserIds(tx, membership.communityId);
    await enqueueNotifications(tx, {
      kind: "affectation_a_remplacer",
      recipientUserIds: admins,
      communityId: membership.communityId,
      eventId: null,
      body: `Un membre a quitte la communaute : ${toReplace} affectation(s) future(s) a remplacer.`,
      href: `/c/${membership.communityId}/planning`,
      subjectId: `${membership.id}:revocation`,
      revision: at,
    });
  }

  await writeAudit(tx, {
    communityId: membership.communityId,
    actorUserId: args.actorUserId,
    action: isSelf ? "adhesion.quittee" : "adhesion.revoquee",
    targetType: "community_membership",
    targetId: membership.id,
    metadata: { userId: membership.userId, assignmentsToReplace: toReplace },
  });

  return { membershipId: membership.id, assignmentsToReplace: toReplace };
}

async function publishEvent(
  tx: Tx,
  args: RpcMap["publish_event"]["args"],
): Promise<RpcMap["publish_event"]["result"]> {
  const event = await tx.selectOne("events", { where: { id: args.eventId } });
  if (!event) {
    throw new ConstraintError("event_missing", "Evenement introuvable.");
  }
  await requireActiveAdmin(tx, event.communityId, args.actorUserId);

  if (event.version !== args.expectedVersion) {
    throw new VersionConflictError(
      "Cet evenement a ete modifie par un autre admin. Rechargez avant de publier.",
      event.version,
    );
  }
  if (event.state === "archive" || event.state === "annule") {
    throw new ConstraintError(
      "event_not_publishable",
      "Un evenement annule ou archive ne peut pas etre publie.",
    );
  }

  const sessions = await tx.select("event_sessions", {
    where: { eventId: event.id },
  });
  const plans = await tx.select("event_plans", { where: { eventId: event.id } });
  const slots = (
    await tx.select("event_role_slots", {
      whereIn: { planId: plans.map((p) => p.id) },
    })
  ).filter((s) => plans.some((p) => p.id === s.planId));
  const assignments = (
    await tx.select("assignments", {
      whereIn: { planId: plans.map((p) => p.id) },
    })
  ).filter((a) => a.state !== "retiree");

  const teams = await tx.select("event_teams", { where: { eventId: event.id } });
  const availabilities = await tx.select("availabilities", {
    where: { eventId: event.id },
  });
  const members = await tx.select("community_memberships", {
    where: { communityId: event.communityId, status: "active" },
  });
  // Les sous-evenements etant facultatifs, un evenement qui n'en a aucun
  // compte pour une occurrence : la sienne.
  const occurrences = Math.max(1, sessions.length);
  const expected = occurrences * members.length;
  const missingResponses = Math.max(0, expected - availabilities.length);

  const readiness = computePublicationReadiness({
    event,
    sessions,
    teams,
    plans,
    slots,
    assignments,
    missingResponses,
    conflictCount: 0,
  });

  if (!readiness.publishableWithExceptions) {
    throw new ConstraintError(
      "publication_blocked",
      readiness.blockers
        .filter((b) => b.severity === "bloquant")
        .map((b) => b.message)
        .join(" "),
    );
  }
  if (!readiness.ready && !args.acceptExceptions) {
    throw new ConstraintError(
      "publication_needs_confirmation",
      "La publication comporte des alertes : une confirmation explicite est requise.",
    );
  }

  const at = nowIso();
  const nextVersion = event.version + 1;
  const publishedVersion = event.publishedVersion + 1;
  await tx.update("events", event.id, {
    state: "publie",
    version: nextVersion,
    publishedVersion,
    publishedAt: event.publishedAt ?? at,
    updatedAt: at,
  });

  await enqueueNotifications(tx, {
    kind: "planning_publie",
    recipientUserIds: members.map((m) => m.userId),
    communityId: event.communityId,
    eventId: event.id,
    body: `Le planning de « ${event.title} » est publie.`,
    href: `/c/${event.communityId}/evenements/${event.id}`,
    subjectId: event.id,
    revision: publishedVersion,
  });

  await writeAudit(tx, {
    communityId: event.communityId,
    actorUserId: args.actorUserId,
    action: "evenement.publie",
    targetType: "event",
    targetId: event.id,
    metadata: {
      publishedVersion,
      withExceptions: !readiness.ready,
      alertes: readiness.blockers.map((b) => b.code),
    },
  });

  return { eventId: event.id, version: nextVersion, publishedVersion };
}

const HANDLERS = {
  create_community_with_admin: createCommunityWithAdmin,
  accept_join_request: acceptJoinRequest,
  change_membership_role: changeMembershipRole,
  revoke_membership: revokeMembership,
  publish_event: publishEvent,
} as const;

export async function runDemoRpc<N extends RpcName>(
  tx: Tx,
  name: N,
  args: RpcMap[N]["args"],
): Promise<RpcMap[N]["result"]> {
  const handler = HANDLERS[name] as (
    tx: Tx,
    args: RpcMap[N]["args"],
  ) => Promise<RpcMap[N]["result"]>;
  return handler(tx, args);
}
