import "server-only";
import { newId } from "@/lib/ids";
import { nowIso } from "@/lib/time";
import { err, ok, type Result } from "@/lib/result";
import { DEFAULT_TIMEZONE } from "@/lib/time";
import { SUGGESTED_EXTRA_ROLES, toField } from "@/domain/template";
import type {
  Community,
  CommunityType,
  Id,
  JoinRequest,
  MembershipRole,
  TemplateField,
  TemplateFieldKind,
} from "@/domain/types";
import { getDataAdapter } from "../data";
import { ConstraintError } from "../data/port";
import { requireCommunityAction, requireSession } from "../auth/context";
import { enqueueNotifications, writeAudit } from "../notifications/enqueue";

/**
 * Communautes : catalogue public, creation, adhesions, roles, equipes et
 * modele. Le catalogue n'expose que ce qui sert a choisir une communaute.
 */

export interface CatalogueEntry {
  id: Id;
  slug: string;
  name: string;
  type: CommunityType;
  otherLabel: string | null;
  description: string;
  displayedLeaderName: string;
  memberCount: number;
  /** Etat de la relation du visiteur avec cette communaute. */
  relation:
    | { kind: "membre"; role: MembershipRole }
    | { kind: "demande"; status: JoinRequest["status"]; requestId: Id }
    | { kind: "aucune" };
}

export async function listCatalogue(search = ""): Promise<CatalogueEntry[]> {
  const session = await requireSession();
  const adapter = getDataAdapter();
  const needle = search.trim().toLowerCase();

  return adapter.read(async (tx) => {
    const communities = await tx.select("communities", {
      orderBy: { column: "name" },
    });
    const memberships = await tx.select("community_memberships", {
      where: { userId: session.viewer.userId },
    });
    const requests = await tx.select("join_requests", {
      where: { userId: session.viewer.userId },
    });
    const allMemberships = await tx.select("community_memberships", {
      where: { status: "active" },
    });

    const counts = new Map<Id, number>();
    for (const m of allMemberships) {
      counts.set(m.communityId, (counts.get(m.communityId) ?? 0) + 1);
    }

    return communities
      .filter((c) => {
        if (needle === "") return true;
        return (
          c.name.toLowerCase().includes(needle) ||
          c.type.toLowerCase().includes(needle) ||
          (c.otherLabel ?? "").toLowerCase().includes(needle) ||
          c.description.toLowerCase().includes(needle)
        );
      })
      .map((c): CatalogueEntry => {
        const membership = memberships.find(
          (m) => m.communityId === c.id && m.status === "active",
        );
        const pending = requests
          .filter((r) => r.communityId === c.id)
          .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0];
        const relation: CatalogueEntry["relation"] = membership
          ? { kind: "membre", role: membership.role }
          : pending
            ? { kind: "demande", status: pending.status, requestId: pending.id }
            : { kind: "aucune" };
        return {
          id: c.id,
          slug: c.slug,
          name: c.name,
          type: c.type,
          otherLabel: c.otherLabel,
          description: c.description,
          displayedLeaderName: c.displayedLeaderName,
          memberCount: counts.get(c.id) ?? 0,
          relation,
        };
      });
  });
}

export async function getCommunity(communityId: Id): Promise<Community | null> {
  const adapter = getDataAdapter();
  return adapter.read((tx) =>
    tx.selectOne("communities", { where: { id: communityId } }),
  );
}

export interface CreateCommunityInput {
  name: string;
  type: CommunityType;
  otherLabel: string | null;
  description: string;
  displayedLeaderName: string;
  timezone?: string;
}

export async function createCommunity(
  input: CreateCommunityInput,
): Promise<Result<{ communityId: Id }>> {
  const session = await requireSession();
  if (!session.viewer.emailVerified) {
    return err(
      "email_non_verifie",
      "Verifiez votre email avant de creer une communaute.",
    );
  }
  const adapter = getDataAdapter();
  try {
    const result = await adapter.rpc("create_community_with_admin", {
      userId: session.viewer.userId,
      name: input.name.trim(),
      type: input.type,
      otherLabel: input.type === "AUTRE" ? (input.otherLabel?.trim() ?? null) : null,
      description: input.description.trim(),
      displayedLeaderName: input.displayedLeaderName.trim(),
      timezone: input.timezone ?? process.env.DIAPASON_DEFAULT_TIMEZONE ?? DEFAULT_TIMEZONE,
    });
    return ok({ communityId: result.communityId });
  } catch (error) {
    if (error instanceof ConstraintError) {
      return err(error.code, error.message);
    }
    throw error;
  }
}

/* -------------------------------------------------------------------------- */
/* Adhesions                                                                  */
/* -------------------------------------------------------------------------- */

export async function requestJoin(
  communityId: Id,
  message: string | null,
): Promise<Result<{ requestId: Id }>> {
  const session = await requireSession();
  const adapter = getDataAdapter();

  try {
    return await adapter.transaction(async (tx) => {
      const community = await tx.selectOne("communities", {
        where: { id: communityId },
      });
      if (!community) return err("communaute_inconnue", "Communaute introuvable.");

      const existing = await tx.selectOne("community_memberships", {
        where: { communityId, userId: session.viewer.userId, status: "active" },
      });
      if (existing) {
        return err("deja_membre", "Vous etes deja membre de cette communaute.");
      }

      const requestId = newId();
      await tx.insert("join_requests", {
        id: requestId,
        communityId,
        userId: session.viewer.userId,
        message: message?.trim() || null,
        status: "en_attente",
        decidedBy: null,
        decidedAt: null,
        decisionNote: null,
        createdAt: nowIso(),
      });

      const admins = await tx.select("community_memberships", {
        where: { communityId, status: "active", role: "admin" },
      });
      await enqueueNotifications(tx, {
        kind: "adhesion_demandee",
        recipientUserIds: admins.map((a) => a.userId),
        communityId,
        eventId: null,
        body: `${session.profile.firstName} ${session.profile.lastName} demande a rejoindre « ${community.name} ».`,
        href: `/c/${communityId}/demandes`,
        subjectId: requestId,
      });

      return ok({ requestId });
    });
  } catch (error) {
    if (
      error instanceof ConstraintError &&
      error.code === "join_request_single_pending"
    ) {
      return err(
        "demande_en_double",
        "Une demande est deja en attente pour cette communaute.",
      );
    }
    throw error;
  }
}

export async function cancelJoinRequest(
  requestId: Id,
): Promise<Result<{ requestId: Id }>> {
  const session = await requireSession();
  const adapter = getDataAdapter();
  return adapter.transaction(async (tx) => {
    const request = await tx.selectOne("join_requests", { where: { id: requestId } });
    if (!request || request.userId !== session.viewer.userId) {
      return err("demande_inconnue", "Demande introuvable.");
    }
    if (request.status !== "en_attente") {
      return err("demande_traitee", "Cette demande a deja ete traitee.");
    }
    await tx.update("join_requests", requestId, {
      status: "annulee",
      decidedAt: nowIso(),
    });
    return ok({ requestId });
  });
}

export interface PendingRequestView {
  id: Id;
  userId: Id;
  firstName: string;
  lastName: string;
  declaredMinistry: string;
  message: string | null;
  createdAt: string;
}

export async function listPendingRequests(
  communityId: Id,
): Promise<PendingRequestView[]> {
  await requireCommunityAction(communityId, "communaute.decider_adhesion");
  const adapter = getDataAdapter();
  return adapter.read(async (tx) => {
    const requests = await tx.select("join_requests", {
      where: { communityId, status: "en_attente" },
      orderBy: { column: "createdAt" },
    });
    const profiles = await tx.select("profiles", {
      whereIn: { id: requests.map((r) => r.userId) },
    });
    const byId = new Map(profiles.map((p) => [p.id, p]));
    return requests.map((r) => {
      const p = byId.get(r.userId);
      return {
        id: r.id,
        userId: r.userId,
        firstName: p?.firstName ?? "?",
        lastName: p?.lastName ?? "",
        declaredMinistry: p?.declaredMinistry ?? "",
        message: r.message,
        createdAt: r.createdAt,
      };
    });
  });
}

export async function acceptJoinRequest(
  communityId: Id,
  requestId: Id,
  note: string | null,
): Promise<Result<{ membershipId: Id }>> {
  const ctx = await requireCommunityAction(communityId, "communaute.decider_adhesion");
  const adapter = getDataAdapter();
  try {
    const result = await adapter.rpc("accept_join_request", {
      actorUserId: ctx.viewer.userId,
      requestId,
      note,
    });
    return ok(result);
  } catch (error) {
    if (error instanceof ConstraintError) return err(error.code, error.message);
    throw error;
  }
}

export async function refuseJoinRequest(
  communityId: Id,
  requestId: Id,
  note: string | null,
): Promise<Result<{ requestId: Id }>> {
  const ctx = await requireCommunityAction(communityId, "communaute.decider_adhesion");
  const adapter = getDataAdapter();
  return adapter.transaction(async (tx) => {
    const request = await tx.selectOne("join_requests", { where: { id: requestId } });
    if (!request || request.communityId !== communityId) {
      return err("demande_inconnue", "Demande introuvable.");
    }
    if (request.status !== "en_attente") {
      return err("demande_traitee", "Cette demande a deja ete traitee.");
    }
    await tx.update("join_requests", requestId, {
      status: "refusee",
      decidedBy: ctx.viewer.userId,
      decidedAt: nowIso(),
      decisionNote: note,
    });
    const community = await tx.selectOne("communities", { where: { id: communityId } });
    await enqueueNotifications(tx, {
      kind: "adhesion_refusee",
      recipientUserIds: [request.userId],
      communityId,
      eventId: null,
      body: `Votre demande d'adhesion a « ${community?.name ?? "la communaute"} » n'a pas ete retenue.`,
      href: "/communautes",
      subjectId: requestId,
    });
    await writeAudit(tx, {
      communityId,
      actorUserId: ctx.viewer.userId,
      action: "adhesion.refusee",
      targetType: "join_request",
      targetId: requestId,
      metadata: {},
    });
    return ok({ requestId });
  });
}

/* -------------------------------------------------------------------------- */
/* Membres, roles, competences, equipes                                       */
/* -------------------------------------------------------------------------- */

export interface MemberView {
  membershipId: Id;
  userId: Id;
  firstName: string;
  lastName: string;
  initials: string;
  role: MembershipRole;
  status: "active" | "revoked";
  skills: string[];
  teams: string[];
}

export function initialsOf(firstName: string, lastName: string): string {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
}

export async function listMembers(communityId: Id): Promise<MemberView[]> {
  await requireCommunityAction(communityId, "communaute.voir_contenu_prive");
  const adapter = getDataAdapter();
  return adapter.read(async (tx) => {
    const memberships = await tx.select("community_memberships", {
      where: { communityId },
    });
    const profiles = await tx.select("profiles", {
      whereIn: { id: memberships.map((m) => m.userId) },
    });
    const skills = await tx.select("skills", { where: { communityId } });
    const links = await tx.select("membership_skills", { where: { communityId } });
    const teams = await tx.select("teams", { where: { communityId } });
    const teamLinks = await tx.select("team_memberships", { where: { communityId } });

    const profileById = new Map(profiles.map((p) => [p.id, p]));
    const skillById = new Map(skills.map((s) => [s.id, s.label]));
    const teamById = new Map(teams.map((t) => [t.id, t.name]));

    return memberships
      .map((m): MemberView => {
        const p = profileById.get(m.userId);
        const firstName = p?.firstName ?? "?";
        const lastName = p?.lastName ?? "";
        return {
          membershipId: m.id,
          userId: m.userId,
          firstName,
          lastName,
          initials: initialsOf(firstName, lastName),
          role: m.role,
          status: m.status,
          skills: links
            .filter((l) => l.membershipId === m.id)
            .map((l) => skillById.get(l.skillId) ?? "")
            .filter(Boolean),
          teams: teamLinks
            .filter((l) => l.membershipId === m.id)
            .map((l) => teamById.get(l.teamId) ?? "")
            .filter(Boolean),
        };
      })
      .sort((a, b) =>
        `${a.lastName}${a.firstName}`.localeCompare(`${b.lastName}${b.firstName}`, "fr"),
      );
  });
}

export async function changeMemberRole(
  communityId: Id,
  membershipId: Id,
  role: MembershipRole,
): Promise<Result<{ membershipId: Id }>> {
  const ctx = await requireCommunityAction(communityId, "communaute.gerer_roles");
  const adapter = getDataAdapter();
  try {
    const result = await adapter.rpc("change_membership_role", {
      actorUserId: ctx.viewer.userId,
      membershipId,
      role,
    });
    return ok(result);
  } catch (error) {
    if (error instanceof ConstraintError) return err(error.code, error.message);
    throw error;
  }
}

export async function revokeMember(
  communityId: Id,
  membershipId: Id,
): Promise<Result<{ membershipId: Id; assignmentsToReplace: number }>> {
  const session = await requireSession();
  const adapter = getDataAdapter();

  // Un membre peut quitter de lui-meme ; retirer quelqu'un d'autre est admin.
  const membership = await adapter.read((tx) =>
    tx.selectOne("community_memberships", { where: { id: membershipId } }),
  );
  if (!membership || membership.communityId !== communityId) {
    return err("adhesion_inconnue", "Adhesion introuvable.");
  }
  if (membership.userId !== session.viewer.userId) {
    await requireCommunityAction(communityId, "communaute.gerer_membres");
  }

  try {
    const result = await adapter.rpc("revoke_membership", {
      actorUserId: session.viewer.userId,
      membershipId,
    });
    return ok(result);
  } catch (error) {
    if (error instanceof ConstraintError) return err(error.code, error.message);
    throw error;
  }
}

export async function setMemberSkills(
  communityId: Id,
  membershipId: Id,
  skillIds: readonly Id[],
): Promise<Result<{ count: number }>> {
  await requireCommunityAction(communityId, "communaute.gerer_membres");
  const adapter = getDataAdapter();
  return adapter.transaction(async (tx) => {
    const membership = await tx.selectOne("community_memberships", {
      where: { id: membershipId, communityId },
    });
    if (!membership) return err("adhesion_inconnue", "Adhesion introuvable.");
    await tx.removeWhere("membership_skills", { membershipId });
    const skills = await tx.select("skills", { where: { communityId } });
    const valid = skillIds.filter((id) => skills.some((s) => s.id === id));
    await tx.insertMany(
      "membership_skills",
      valid.map((skillId) => ({
        id: newId(),
        communityId,
        membershipId,
        skillId,
      })),
    );
    return ok({ count: valid.length });
  });
}

export async function listSkills(communityId: Id) {
  await requireCommunityAction(communityId, "communaute.voir_contenu_prive");
  const adapter = getDataAdapter();
  return adapter.read((tx) =>
    tx.select("skills", { where: { communityId }, orderBy: { column: "label" } }),
  );
}

export async function createSkill(
  communityId: Id,
  label: string,
): Promise<Result<{ id: Id }>> {
  await requireCommunityAction(communityId, "communaute.gerer_membres");
  const adapter = getDataAdapter();
  const trimmed = label.trim();
  if (trimmed === "") return err("libelle_vide", "Indiquez un libelle.");
  return adapter.transaction(async (tx) => {
    const id = newId();
    await tx.insert("skills", { id, communityId, label: trimmed });
    return ok({ id });
  });
}

export async function listTeams(communityId: Id) {
  await requireCommunityAction(communityId, "communaute.voir_contenu_prive");
  const adapter = getDataAdapter();
  return adapter.read((tx) =>
    tx.select("teams", { where: { communityId }, orderBy: { column: "order" } }),
  );
}

export async function createTeam(
  communityId: Id,
  name: string,
): Promise<Result<{ id: Id }>> {
  await requireCommunityAction(communityId, "communaute.modifier");
  const adapter = getDataAdapter();
  const trimmed = name.trim();
  if (trimmed === "") return err("libelle_vide", "Indiquez un nom d'equipe.");
  return adapter.transaction(async (tx) => {
    const existing = await tx.select("teams", { where: { communityId } });
    const id = newId();
    await tx.insert("teams", {
      id,
      communityId,
      name: trimmed,
      order: existing.length + 1,
      archivedAt: null,
    });
    return ok({ id });
  });
}

export async function setTeamMembers(
  communityId: Id,
  teamId: Id,
  membershipIds: readonly Id[],
): Promise<Result<{ count: number }>> {
  await requireCommunityAction(communityId, "communaute.gerer_membres");
  const adapter = getDataAdapter();
  return adapter.transaction(async (tx) => {
    const team = await tx.selectOne("teams", { where: { id: teamId, communityId } });
    if (!team) return err("equipe_inconnue", "Equipe introuvable.");
    await tx.removeWhere("team_memberships", { teamId });
    const members = await tx.select("community_memberships", {
      where: { communityId, status: "active" },
    });
    const valid = membershipIds.filter((id) => members.some((m) => m.id === id));
    await tx.insertMany(
      "team_memberships",
      valid.map((membershipId) => ({
        id: newId(),
        communityId,
        teamId,
        membershipId,
      })),
    );
    return ok({ count: valid.length });
  });
}

/* -------------------------------------------------------------------------- */
/* Modele de planning                                                         */
/* -------------------------------------------------------------------------- */

export interface TemplateView {
  templateId: Id;
  version: number;
  fields: TemplateField[];
  suggestedRoles: readonly string[];
}

export async function getTemplate(communityId: Id): Promise<TemplateView | null> {
  await requireCommunityAction(communityId, "communaute.voir_contenu_prive");
  const adapter = getDataAdapter();
  return adapter.read(async (tx) => {
    const template = await tx.selectOne("planning_templates", {
      where: { communityId },
    });
    if (!template) return null;
    const fields = await tx.select("template_fields", {
      where: { templateId: template.id },
      orderBy: { column: "order" },
    });
    return {
      templateId: template.id,
      version: template.version,
      fields,
      suggestedRoles: SUGGESTED_EXTRA_ROLES,
    };
  });
}

export async function addTemplateField(
  communityId: Id,
  input: { label: string; kind: TemplateFieldKind; minRequired: number },
): Promise<Result<{ id: Id }>> {
  await requireCommunityAction(communityId, "communaute.gerer_modele");
  const adapter = getDataAdapter();
  const label = input.label.trim();
  if (label === "") return err("libelle_vide", "Indiquez un libelle.");
  return adapter.transaction(async (tx) => {
    const template = await tx.selectOne("planning_templates", {
      where: { communityId },
    });
    if (!template) return err("modele_inconnu", "Modele introuvable.");
    const fields = await tx.select("template_fields", {
      where: { templateId: template.id },
    });
    const field = toField(
      {
        kind: input.kind,
        label,
        minRequired: Math.max(0, input.minRequired),
      },
      {
        communityId,
        templateId: template.id,
        order: fields.length + 1,
      },
    );
    await tx.insert("template_fields", field);
    await tx.update("planning_templates", template.id, {
      version: template.version + 1,
      updatedAt: nowIso(),
    });
    return ok({ id: field.id });
  });
}

export async function updateTemplateField(
  communityId: Id,
  fieldId: Id,
  patch: { label?: string; minRequired?: number; order?: number },
): Promise<Result<{ id: Id }>> {
  await requireCommunityAction(communityId, "communaute.gerer_modele");
  const adapter = getDataAdapter();
  return adapter.transaction(async (tx) => {
    const field = await tx.selectOne("template_fields", {
      where: { id: fieldId, communityId },
    });
    if (!field) return err("champ_inconnu", "Champ introuvable.");
    const next: Partial<TemplateField> = {};
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
    await tx.update("template_fields", fieldId, next);
    const template = await tx.selectOne("planning_templates", {
      where: { id: field.templateId },
    });
    if (template) {
      await tx.update("planning_templates", template.id, {
        version: template.version + 1,
        updatedAt: nowIso(),
      });
    }
    return ok({ id: fieldId });
  });
}

/**
 * Un champ encore utilise dans l'historique est archive, jamais supprime :
 * les affectations passees et leurs libelles restent lisibles.
 */
export async function archiveTemplateField(
  communityId: Id,
  fieldId: Id,
): Promise<Result<{ id: Id; archived: boolean }>> {
  await requireCommunityAction(communityId, "communaute.gerer_modele");
  const adapter = getDataAdapter();
  return adapter.transaction(async (tx) => {
    const field = await tx.selectOne("template_fields", {
      where: { id: fieldId, communityId },
    });
    if (!field) return err("champ_inconnu", "Champ introuvable.");
    const usage = await tx.count("event_role_slots", {
      where: { templateFieldId: fieldId },
    });
    if (usage === 0) {
      await tx.remove("template_fields", fieldId);
      return ok({ id: fieldId, archived: false });
    }
    await tx.update("template_fields", fieldId, { archivedAt: nowIso() });
    return ok({ id: fieldId, archived: true });
  });
}
