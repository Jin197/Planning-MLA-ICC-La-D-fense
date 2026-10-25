process.env.DIAPASON_DEMO_PERSIST = "0";
process.env.DIAPASON_DATA_ADAPTER = "demo";

import { newId } from "@/lib/ids";
import { nowIso } from "@/lib/time";
import { DEFAULT_PREFERENCES } from "@/domain/notifications";
import type { CommunityType, Id, Profile } from "@/domain/types";
import { emptySnapshot, replaceSnapshot, writeStore } from "@/server/data/demo/store";
import { runDemoRpc } from "@/server/data/demo/rpc";
import type { RpcMap, RpcName, Tx } from "@/server/data/port";
import { startSession } from "@/server/auth/session";
import { clearTestCookies } from "../stubs/next-headers";

/**
 * Outils des tests d'integration : magasin en memoire, sans fichier, et appel
 * direct des operations atomiques. Rien ici ne passe par l'interface, ce qui
 * permet de verifier les regles « meme par appel direct ».
 */

export function resetStore(): void {
  replaceSnapshot(emptySnapshot(), false);
  clearTestCookies();
}

/**
 * Ouvre une session pour ce compte, par le vrai chemin de signature du
 * cookie. Les services appeles ensuite voient la meme chose qu'une requete.
 */
export async function signIn(userId: Id): Promise<void> {
  await startSession(userId);
}

export async function signOut(): Promise<void> {
  clearTestCookies();
}

export function tx<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return writeStore(fn);
}

export function rpc<N extends RpcName>(
  name: N,
  args: RpcMap[N]["args"],
): Promise<RpcMap[N]["result"]> {
  return writeStore((t) => runDemoRpc(t, name, args));
}

export async function createVerifiedUser(
  email: string,
  firstName = "Test",
  lastName = "Utilisateur",
): Promise<Profile> {
  return tx(async (t) => {
    const profile: Profile = {
      id: newId(),
      email,
      firstName,
      lastName,
      declaredMinistry: "Demonstration",
      description: null,
      onboardingChoice: "membre",
      emailVerifiedAt: nowIso(),
      createdAt: nowIso(),
    };
    await t.insert("profiles", profile);
    await t.insert("notification_preferences", {
      userId: profile.id,
      ...DEFAULT_PREFERENCES,
    });
    return profile;
  });
}

export async function createCommunity(
  userId: Id,
  type: CommunityType = "MLA",
  name = "Communaute de test",
): Promise<{ communityId: Id; membershipId: Id; templateId: Id }> {
  return rpc("create_community_with_admin", {
    userId,
    name,
    type,
    otherLabel: null,
    description: "Test",
    displayedLeaderName: "Responsable test",
    timezone: "Europe/Paris",
  });
}

export async function joinAsMember(
  communityId: Id,
  adminUserId: Id,
  memberUserId: Id,
): Promise<Id> {
  const requestId = await tx(async (t) => {
    const id = newId();
    await t.insert("join_requests", {
      id,
      communityId,
      userId: memberUserId,
      message: null,
      status: "en_attente",
      decidedBy: null,
      decidedAt: null,
      decisionNote: null,
      createdAt: nowIso(),
    });
    return id;
  });
  const result = await rpc("accept_join_request", {
    actorUserId: adminUserId,
    requestId,
    note: null,
  });
  return result.membershipId;
}

export interface EventFixture {
  eventId: Id;
  /** Vide quand l'evenement n'a pas de sous-evenement. */
  sessionIds: Id[];
  teamId: Id;
  planIds: Id[];
  slotIdsByLabel: Map<string, Id>;
}

/**
 * Evenement de test avec une equipe et sa feuille de postes.
 *
 * `sessions: []` cree un evenement sans sous-evenement : l'equipe est alors
 * rattachee a toute sa duree, et les reponses portent sur l'evenement.
 */
export async function createEventWithPlan(
  communityId: Id,
  createdBy: Id,
  options: {
    state?: "brouillon" | "collecte" | "publie";
    sessions?: { label: string; startsAt: string; endsAt: string; provisional?: boolean }[];
    /** Horaire propre de l'evenement. */
    startsAt?: string;
    endsAt?: string;
    provisional?: boolean;
  } = {},
): Promise<EventFixture> {
  const sessions =
    options.sessions ??
    [
      {
        label: "Culte 1",
        startsAt: "2026-10-18T07:00:00.000Z",
        endsAt: "2026-10-18T08:45:00.000Z",
      },
      {
        label: "Culte 2",
        startsAt: "2026-10-18T09:00:00.000Z",
        endsAt: "2026-10-18T10:45:00.000Z",
      },
    ];

  return tx(async (t) => {
    const at = nowIso();
    const eventId = newId();
    await t.insert("events", {
      id: eventId,
      communityId,
      title: "Evenement de test",
      description: "",
      state: options.state ?? "collecte",
      timezone: "Europe/Paris",
      startsAt:
        options.startsAt ??
        sessions[0]?.startsAt ??
        "2026-10-18T07:00:00.000Z",
      endsAt:
        options.endsAt ??
        sessions[sessions.length - 1]?.endsAt ??
        "2026-10-18T10:45:00.000Z",
      locationName: "Salle test",
      locationAddress: "",
      scheduleProvisional: options.provisional ?? false,
      version: 1,
      publishedVersion: 0,
      responseDeadline: null,
      publishedAt: null,
      cancelledAt: null,
      cancelReason: null,
      archivedAt: null,
      createdBy,
      createdAt: at,
      updatedAt: at,
    });

    const sessionIds: Id[] = [];
    for (const [index, s] of sessions.entries()) {
      const id = newId();
      await t.insert("event_sessions", {
        id,
        communityId,
        eventId,
        label: s.label,
        ordinal: index + 1,
        startsAt: s.startsAt,
        endsAt: s.endsAt,
        locationName: "Salle test",
        locationAddress: "",
        scheduleProvisional: s.provisional ?? false,
      });
      sessionIds.push(id);
    }

    // L'equipe appartient a l'evenement : elle est creee avec lui.
    const teamId = newId();
    await t.insert("event_teams", {
      id: teamId,
      communityId,
      eventId,
      name: "Equipe de test",
      order: 1,
    });

    const template = await t.selectOne("planning_templates", { where: { communityId } });
    const fields = await t.select("template_fields", {
      where: { templateId: template!.id },
    });

    const planIds: Id[] = [];
    const slotIdsByLabel = new Map<string, Id>();
    // Sans sous-evenement, un seul plan rattache a toute la duree.
    const cibles: (Id | null)[] = sessionIds.length > 0 ? sessionIds : [null];
    for (const sessionId of cibles) {
      const planId = newId();
      await t.insert("event_plans", {
        id: planId,
        communityId,
        eventId,
        sessionId,
        teamId,
        templateVersion: template!.version,
        createdAt: at,
      });
      planIds.push(planId);
      for (const field of fields.filter((f) => f.assignable)) {
        const slotId = newId();
        await t.insert("event_role_slots", {
          id: slotId,
          communityId,
          planId,
          templateFieldId: field.id,
          label: field.label,
          order: field.order,
          minRequired: field.minRequired,
          multiple: field.multiple,
          allowsDetail: field.allowsDetail,
          enabled: true,
        });
        // Cle « planId:libelle » pour viser un poste precis.
        slotIdsByLabel.set(`${planId}:${field.label}`, slotId);
      }
    }

    return { eventId, sessionIds, teamId, planIds, slotIdsByLabel };
  });
}
