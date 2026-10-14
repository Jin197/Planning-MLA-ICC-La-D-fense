import "server-only";
import { formatDateLong, formatTime, nowIso } from "@/lib/time";
import type { Id } from "@/domain/types";
import { getDataAdapter } from "../data";
import { requireActiveMembership, requireSession } from "../auth/context";
import { canSeeAssignments } from "@/domain/permissions";

/**
 * Exports. Ils respectent les droits d'acces et n'incluent jamais les motifs
 * prives dans un fichier partage.
 */

function champCsv(valeur: string): string {
  const propre = valeur.replace(/"/g, '""');
  return /[";\n\r]/.test(propre) ? `"${propre}"` : propre;
}

/**
 * Export CSV des affectations d'une communaute. Reserve aux membres actifs, et
 * limite aux evenements dont le plan leur est visible.
 */
export async function exportAssignmentsCsv(communityId: Id): Promise<string> {
  const ctx = await requireActiveMembership(communityId);
  const adapter = getDataAdapter();

  const lignes = await adapter.read(async (tx) => {
    const community = await tx.selectOne("communities", { where: { id: communityId } });
    const tz = community?.timezone ?? "Europe/Paris";
    const events = await tx.select("events", { where: { communityId } });
    const visibles = events.filter((e) => canSeeAssignments(ctx.membership, e.state));
    const sessions = await tx.select("event_sessions", {
      whereIn: { eventId: visibles.map((e) => e.id) },
    });
    const plans = await tx.select("event_plans", {
      whereIn: { eventId: visibles.map((e) => e.id) },
    });
    const slots = await tx.select("event_role_slots", {
      whereIn: { planId: plans.map((p) => p.id) },
    });
    const assignments = await tx.select("assignments", {
      whereIn: { planId: plans.map((p) => p.id) },
    });
    const teams = await tx.select("teams", { where: { communityId } });
    const memberships = await tx.select("community_memberships", {
      where: { communityId },
    });
    const profiles = await tx.select("profiles", {
      whereIn: { id: memberships.map((m) => m.userId) },
    });

    const eventById = new Map(visibles.map((e) => [e.id, e]));
    const sessionById = new Map(sessions.map((s) => [s.id, s]));
    const planById = new Map(plans.map((p) => [p.id, p]));
    const slotById = new Map(slots.map((s) => [s.id, s]));
    const teamById = new Map(teams.map((t) => [t.id, t]));
    const membershipById = new Map(memberships.map((m) => [m.id, m]));
    const profileById = new Map(profiles.map((p) => [p.id, p]));

    const sorties: string[][] = [];
    for (const assignment of assignments) {
      if (assignment.state === "retiree") continue;
      const plan = planById.get(assignment.planId);
      const session = plan ? sessionById.get(plan.sessionId) : undefined;
      const event = plan ? eventById.get(plan.eventId) : undefined;
      if (!plan || !session || !event) continue;
      const membership = membershipById.get(assignment.membershipId);
      const profile = membership ? profileById.get(membership.userId) : undefined;

      sorties.push([
        event.title,
        event.state,
        session.label,
        formatDateLong(session.startsAt, tz),
        formatTime(session.startsAt, tz),
        formatTime(session.endsAt, tz),
        teamById.get(plan.teamId)?.name ?? "",
        slotById.get(assignment.slotId)?.label ?? "",
        profile ? `${profile.firstName} ${profile.lastName}` : "Membre retire",
        assignment.detail ?? "",
        assignment.state,
        // Les exceptions sont indiquees sans leur motif administratif detaille.
        assignment.exceptions.map((e) => e.kind).join(" "),
      ]);
    }

    sorties.sort((a, b) => (a[3]! + a[4]! < b[3]! + b[4]! ? -1 : 1));
    return sorties;
  });

  const entetes = [
    "Evenement",
    "Etat evenement",
    "Creneau",
    "Date",
    "Debut",
    "Fin",
    "Equipe",
    "Poste",
    "Personne",
    "Precision",
    "Etat affectation",
    "Exceptions",
  ];

  // Point-virgule : separateur attendu par Excel en configuration francaise.
  return [entetes, ...lignes]
    .map((ligne) => ligne.map(champCsv).join(";"))
    .join("\r\n");
}

function echapperIcs(valeur: string): string {
  return valeur
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

function instantIcs(iso: string): string {
  return `${iso.replace(/[-:]/g, "").split(".")[0]}Z`;
}

/**
 * Calendrier personnel : uniquement les creneaux ou la personne est affectee,
 * et les repetitions de ses equipes. Aucun motif prive, aucune donnee d'un
 * autre membre.
 */
export async function exportPersonalIcs(): Promise<string> {
  const session = await requireSession();
  const adapter = getDataAdapter();

  const evenements = await adapter.read(async (tx) => {
    const memberships = (
      await tx.select("community_memberships", {
        where: { userId: session.viewer.userId, status: "active" },
      })
    );
    if (memberships.length === 0) return [];

    const communities = await tx.select("communities", {
      whereIn: { id: memberships.map((m) => m.communityId) },
    });
    const assignments = (
      await tx.select("assignments", {
        whereIn: { membershipId: memberships.map((m) => m.id) },
      })
    ).filter((a) => a.state !== "retiree");
    const plans = await tx.select("event_plans", {
      whereIn: { id: assignments.map((a) => a.planId) },
    });
    const sessions = await tx.select("event_sessions", {
      whereIn: { id: plans.map((p) => p.sessionId) },
    });
    const slots = await tx.select("event_role_slots", {
      whereIn: { id: assignments.map((a) => a.slotId) },
    });
    const events = await tx.select("events", {
      whereIn: { id: [...new Set(sessions.map((s) => s.eventId))] },
    });

    const eventById = new Map(events.map((e) => [e.id, e]));
    const sessionById = new Map(sessions.map((s) => [s.id, s]));
    const slotById = new Map(slots.map((s) => [s.id, s]));
    const planById = new Map(plans.map((p) => [p.id, p]));
    const communityById = new Map(communities.map((c) => [c.id, c]));

    const sorties: {
      uid: string;
      debut: string;
      fin: string;
      titre: string;
      lieu: string;
      description: string;
    }[] = [];

    for (const assignment of assignments) {
      const plan = planById.get(assignment.planId);
      const session_ = plan ? sessionById.get(plan.sessionId) : undefined;
      const event = plan ? eventById.get(plan.eventId) : undefined;
      if (!plan || !session_ || !event) continue;
      // Un planning non publie n'apparait pas dans le calendrier personnel.
      if (event.state !== "publie") continue;

      sorties.push({
        uid: `${assignment.id}@diapason`,
        debut: session_.startsAt,
        fin: session_.endsAt,
        titre: `${slotById.get(assignment.slotId)?.label ?? "Service"} - ${event.title}`,
        lieu: [session_.locationName, session_.locationAddress]
          .filter(Boolean)
          .join(", "),
        description: `${communityById.get(event.communityId)?.name ?? ""} - ${session_.label} - etat : ${assignment.state}`,
      });
    }

    // Repetitions des evenements concernes.
    const rehearsals = await tx.select("rehearsals", {
      whereIn: { eventId: events.map((e) => e.id) },
    });
    const reponses = await tx.select("rehearsal_availabilities", {
      whereIn: { membershipId: memberships.map((m) => m.id) },
    });
    for (const rehearsal of rehearsals) {
      const event = eventById.get(rehearsal.eventId);
      if (!event || event.state !== "publie") continue;
      const reponse = reponses.find((r) => r.rehearsalId === rehearsal.id);
      if (!reponse || reponse.answer !== "disponible") continue;
      sorties.push({
        uid: `${rehearsal.id}@diapason`,
        debut: rehearsal.startsAt,
        fin: rehearsal.endsAt,
        titre: `${rehearsal.label} - ${event.title}`,
        lieu: [rehearsal.locationName, rehearsal.room, rehearsal.locationAddress]
          .filter(Boolean)
          .join(", "),
        description: communityById.get(event.communityId)?.name ?? "",
      });
    }

    return sorties;
  });

  const lignes = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Diapason//Planning ICC//FR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Diapason - mes services",
  ];

  const maintenant = instantIcs(nowIso());
  for (const evenement of evenements) {
    lignes.push(
      "BEGIN:VEVENT",
      `UID:${evenement.uid}`,
      `DTSTAMP:${maintenant}`,
      `DTSTART:${instantIcs(evenement.debut)}`,
      `DTEND:${instantIcs(evenement.fin)}`,
      `SUMMARY:${echapperIcs(evenement.titre)}`,
      `LOCATION:${echapperIcs(evenement.lieu)}`,
      `DESCRIPTION:${echapperIcs(evenement.description)}`,
      "END:VEVENT",
    );
  }
  lignes.push("END:VCALENDAR");

  // Les lignes ICS se terminent par CRLF.
  return `${lignes.join("\r\n")}\r\n`;
}
