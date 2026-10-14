import "server-only";
import { cache } from "react";
import {
  can,
  toMembershipContext,
  type Action,
  type AccessContext,
  type MembershipContext,
  type Viewer,
} from "@/domain/permissions";
import type { Profile } from "@/domain/types";
import { getDataAdapter } from "../data";
import { readSessionUserId } from "./session";

/**
 * Contexte d'autorisation. Chaque traitement serveur repart d'ici : session,
 * adhesion actuelle lue en base, role, communaute de la ressource. Les
 * controles visuels ne comptent pas.
 */

export class AuthorizationError extends Error {
  readonly status = 403;
  constructor(
    message: string,
    readonly action: Action,
  ) {
    super(message);
    this.name = "AuthorizationError";
  }
}

export class AuthenticationError extends Error {
  readonly status = 401;
  constructor(message = "Connectez-vous pour continuer.") {
    super(message);
    this.name = "AuthenticationError";
  }
}

export interface SessionContext {
  viewer: Viewer;
  profile: Profile;
}

/**
 * `cache` limite la lecture a une fois par requete. Les pages authentifiees
 * ne partagent jamais ce resultat entre utilisateurs.
 */
export const getSession = cache(async (): Promise<SessionContext | null> => {
  const userId = await readSessionUserId();
  if (!userId) return null;
  const adapter = getDataAdapter();
  const profile = await adapter.read((tx) =>
    tx.selectOne("profiles", { where: { id: userId } }),
  );
  if (!profile) return null;
  return {
    viewer: { userId: profile.id, emailVerified: profile.emailVerifiedAt !== null },
    profile,
  };
});

export async function requireSession(): Promise<SessionContext> {
  const session = await getSession();
  if (!session) throw new AuthenticationError();
  return session;
}

export const getMembership = cache(
  async (communityId: string): Promise<MembershipContext | null> => {
    const session = await getSession();
    if (!session) return null;
    const adapter = getDataAdapter();
    const membership = await adapter.read((tx) =>
      tx.selectOne("community_memberships", {
        where: { communityId, userId: session.viewer.userId },
      }),
    );
    return toMembershipContext(membership);
  },
);

export interface CommunityContext extends SessionContext {
  communityId: string;
  membership: MembershipContext | null;
}

export async function getCommunityContext(
  communityId: string,
): Promise<CommunityContext> {
  const session = await requireSession();
  const membership = await getMembership(communityId);
  return { ...session, communityId, membership };
}

/** Leve si l'action n'est pas autorisee. A appeler avant toute ecriture. */
export function assertCan(
  ctx: { viewer: Viewer; membership: MembershipContext | null },
  action: Action,
  access: AccessContext = {},
): void {
  const decision = can(ctx.viewer, ctx.membership, action, access);
  if (!decision.allowed) {
    throw new AuthorizationError(decision.reason, action);
  }
}

export async function requireCommunityAction(
  communityId: string,
  action: Action,
  access: AccessContext = {},
): Promise<CommunityContext> {
  const ctx = await getCommunityContext(communityId);
  assertCan(ctx, action, access);
  return ctx;
}

/** Adhesion active requise, sans exigence de role. */
export async function requireActiveMembership(
  communityId: string,
): Promise<CommunityContext & { membership: MembershipContext }> {
  const ctx = await getCommunityContext(communityId);
  if (!ctx.membership || ctx.membership.status !== "active") {
    throw new AuthorizationError(
      "Aucune adhesion active dans cette communaute.",
      "communaute.voir_contenu_prive",
    );
  }
  return { ...ctx, membership: ctx.membership };
}
