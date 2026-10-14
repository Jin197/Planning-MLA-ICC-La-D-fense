import type {
  CommunityMembership,
  EventState,
  Id,
  MembershipRole,
} from "./types";

/**
 * Autorisations. Un seul endroit decide, et il ne lit jamais un role fourni
 * par le navigateur : il part d'une adhesion chargee en base.
 */

export interface Viewer {
  userId: Id;
  emailVerified: boolean;
}

/** Adhesion telle qu'elle est lue en base pour la communaute consultee. */
export interface MembershipContext {
  communityId: Id;
  role: MembershipRole;
  status: "active" | "revoked";
  membershipId: Id;
}

export type Action =
  // Communaute
  | "communaute.creer"
  | "communaute.voir_fiche_publique"
  | "communaute.voir_contenu_prive"
  | "communaute.modifier"
  | "communaute.gerer_membres"
  | "communaute.gerer_roles"
  | "communaute.decider_adhesion"
  | "communaute.gerer_modele"
  | "communaute.importer"
  // Evenements
  | "evenement.creer"
  | "evenement.modifier"
  | "evenement.publier"
  | "evenement.annuler"
  | "evenement.archiver"
  | "evenement.dupliquer"
  | "evenement.voir"
  | "evenement.voir_affectations"
  // Affectations et disponibilites
  | "affectation.ecrire"
  | "affectation.repondre_pour_soi"
  | "disponibilite.repondre_pour_soi"
  | "motif.voir_les_autres"
  // Discussion
  | "discussion.lire"
  | "discussion.ecrire"
  | "discussion.moderer"
  | "discussion.epingler";

export interface AccessContext {
  /** Etat de l'evenement concerne, quand l'action en depend. */
  eventState?: EventState;
}

const ADMIN_ONLY: ReadonlySet<Action> = new Set<Action>([
  "communaute.modifier",
  "communaute.gerer_membres",
  "communaute.gerer_roles",
  "communaute.decider_adhesion",
  "communaute.gerer_modele",
  "communaute.importer",
  "evenement.creer",
  "evenement.modifier",
  "evenement.publier",
  "evenement.annuler",
  "evenement.archiver",
  "evenement.dupliquer",
  "affectation.ecrire",
  "motif.voir_les_autres",
  "discussion.moderer",
  "discussion.epingler",
]);

const MEMBER_ACTIONS: ReadonlySet<Action> = new Set<Action>([
  "communaute.voir_contenu_prive",
  "evenement.voir",
  "evenement.voir_affectations",
  "affectation.repondre_pour_soi",
  "disponibilite.repondre_pour_soi",
  "discussion.lire",
  "discussion.ecrire",
]);

export function isActiveMember(m: MembershipContext | null): boolean {
  return m !== null && m.status === "active";
}

export function isActiveAdmin(m: MembershipContext | null): boolean {
  return isActiveMember(m) && m?.role === "admin";
}

/**
 * Visibilite d'un evenement selon son etat. Un brouillon n'existe pas pour
 * les membres ; pendant la collecte les affectations en preparation restent
 * reservees aux admins.
 */
export function canSeeEvent(
  m: MembershipContext | null,
  state: EventState,
): boolean {
  if (!isActiveMember(m)) return false;
  if (state === "brouillon") return isActiveAdmin(m);
  return true;
}

export function canSeeAssignments(
  m: MembershipContext | null,
  state: EventState,
): boolean {
  if (!isActiveMember(m)) return false;
  if (isActiveAdmin(m)) return true;
  return state === "publie" || state === "annule" || state === "archive";
}

/** La discussion d'un evenement archive ou annule est en lecture seule. */
export function canWriteDiscussion(
  m: MembershipContext | null,
  state: EventState,
): boolean {
  if (!isActiveMember(m)) return false;
  if (state === "brouillon") return isActiveAdmin(m);
  return state === "collecte" || state === "publie";
}

export function canReadDiscussion(
  m: MembershipContext | null,
  state: EventState,
): boolean {
  if (!isActiveMember(m)) return false;
  if (state === "brouillon") return isActiveAdmin(m);
  return true;
}

/** Les modifications ordinaires sont fermees sur un evenement archive. */
export function isMutableState(state: EventState): boolean {
  return state === "brouillon" || state === "collecte" || state === "publie";
}

export interface PermissionDecision {
  allowed: boolean;
  reason: string;
}

export function can(
  viewer: Viewer | null,
  membership: MembershipContext | null,
  action: Action,
  ctx: AccessContext = {},
): PermissionDecision {
  if (!viewer) {
    return { allowed: false, reason: "Session absente." };
  }

  // La fiche publique d'une communaute est le seul contenu lisible sans
  // adhesion : nom, type, description, responsable affiche.
  if (action === "communaute.voir_fiche_publique") {
    return { allowed: true, reason: "Fiche publique." };
  }

  if (action === "communaute.creer") {
    return viewer.emailVerified
      ? { allowed: true, reason: "Session verifiee." }
      : { allowed: false, reason: "Email non verifie." };
  }

  if (!isActiveMember(membership)) {
    return {
      allowed: false,
      reason: "Aucune adhesion active dans cette communaute.",
    };
  }

  const admin = isActiveAdmin(membership);
  const state = ctx.eventState;

  switch (action) {
    case "evenement.voir":
      return state && !canSeeEvent(membership, state)
        ? { allowed: false, reason: "Evenement non visible dans cet etat." }
        : { allowed: true, reason: "Membre actif." };

    case "evenement.voir_affectations":
      return state && !canSeeAssignments(membership, state)
        ? {
            allowed: false,
            reason: "Affectations en preparation reservees aux admins.",
          }
        : { allowed: true, reason: "Affectations visibles." };

    case "discussion.lire":
      return state && !canReadDiscussion(membership, state)
        ? { allowed: false, reason: "Discussion non accessible." }
        : { allowed: true, reason: "Lecture autorisee." };

    case "discussion.ecrire":
      return state && !canWriteDiscussion(membership, state)
        ? { allowed: false, reason: "Discussion en lecture seule." }
        : { allowed: true, reason: "Ecriture autorisee." };

    case "evenement.modifier":
    case "affectation.ecrire":
      if (!admin) return { allowed: false, reason: "Reserve aux admins." };
      if (state && !isMutableState(state)) {
        return {
          allowed: false,
          reason: "Evenement archive ou annule : modification fermee.",
        };
      }
      return { allowed: true, reason: "Admin de cette communaute." };

    default:
      break;
  }

  if (ADMIN_ONLY.has(action)) {
    return admin
      ? { allowed: true, reason: "Admin de cette communaute." }
      : { allowed: false, reason: "Reserve aux admins." };
  }

  if (MEMBER_ACTIONS.has(action)) {
    return { allowed: true, reason: "Membre actif." };
  }

  return { allowed: false, reason: "Action inconnue." };
}

export function toMembershipContext(
  m: CommunityMembership | null | undefined,
): MembershipContext | null {
  if (!m) return null;
  return {
    communityId: m.communityId,
    role: m.role,
    status: m.status,
    membershipId: m.id,
  };
}

/**
 * Un motif d'indisponibilite n'est lisible que par son auteur et les admins
 * de la communaute concernee.
 */
export function canReadReason(
  viewer: Viewer | null,
  membership: MembershipContext | null,
  reasonAuthorUserId: Id,
): boolean {
  if (!viewer) return false;
  if (viewer.userId === reasonAuthorUserId && isActiveMember(membership)) {
    return true;
  }
  return isActiveAdmin(membership);
}

/**
 * Garde-fou du dernier admin. Un retrait ou une rétrogradation ne passe que
 * s'il reste un admin actif apres l'operation. Appele a l'interieur de la
 * transaction pour resister a deux changements simultanes.
 */
export function wouldLeaveNoAdmin(
  activeAdminUserIds: readonly Id[],
  targetUserId: Id,
): boolean {
  const remaining = activeAdminUserIds.filter((id) => id !== targetUserId);
  return remaining.length === 0;
}
