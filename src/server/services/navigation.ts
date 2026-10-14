import "server-only";
import type { CommunityType, Id, MembershipRole } from "@/domain/types";
import { getDataAdapter } from "../data";
import { getSession } from "../auth/context";

/**
 * Donnees de navigation : communautes rejointes, communaute active, compteurs
 * affiches dans la barre laterale. Une seule lecture par requete.
 */

export interface CommunityOption {
  id: Id;
  name: string;
  type: CommunityType;
  role: MembershipRole;
}

export interface NavigationData {
  signedIn: boolean;
  firstName: string;
  lastName: string;
  initials: string;
  communities: CommunityOption[];
  unreadNotifications: number;
  /** Demandes d'adhesion en attente, par communaute ou l'on est admin. */
  pendingRequests: Record<Id, number>;
}

export async function loadNavigation(): Promise<NavigationData> {
  const session = await getSession();
  if (!session) {
    return {
      signedIn: false,
      firstName: "",
      lastName: "",
      initials: "",
      communities: [],
      unreadNotifications: 0,
      pendingRequests: {},
    };
  }

  const adapter = getDataAdapter();
  return adapter.read(async (tx) => {
    const memberships = (
      await tx.select("community_memberships", {
        where: { userId: session.viewer.userId, status: "active" },
      })
    );
    const communities = await tx.select("communities", {
      whereIn: { id: memberships.map((m) => m.communityId) },
    });
    const notifications = await tx.select("notifications", {
      where: { userId: session.viewer.userId, readAt: null },
    });

    const pendingRequests: Record<Id, number> = {};
    for (const membership of memberships) {
      if (membership.role !== "admin") continue;
      pendingRequests[membership.communityId] = await tx.count("join_requests", {
        where: { communityId: membership.communityId, status: "en_attente" },
      });
    }

    const options: CommunityOption[] = memberships
      .map((m) => {
        const community = communities.find((c) => c.id === m.communityId);
        return community
          ? {
              id: community.id,
              name: community.name,
              type: community.type,
              role: m.role,
            }
          : null;
      })
      .filter((o): o is CommunityOption => o !== null)
      .sort((a, b) => a.name.localeCompare(b.name, "fr"));

    return {
      signedIn: true,
      firstName: session.profile.firstName,
      lastName: session.profile.lastName,
      initials:
        `${session.profile.firstName.charAt(0)}${session.profile.lastName.charAt(0)}`.toUpperCase(),
      communities: options,
      unreadNotifications: notifications.length,
      pendingRequests,
    };
  });
}
