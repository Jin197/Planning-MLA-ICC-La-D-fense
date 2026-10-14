import "server-only";
import { nowIso } from "@/lib/time";
import type { OutboxEntry } from "@/domain/types";
import { getDataAdapter } from "../data";

/**
 * Envoi des emails. Trois etats distincts sont suivis :
 *
 *  - « enregistre »      : la tache existe en base, rien n'a ete envoye ;
 *  - « pris_en_charge »  : le fournisseur a accepte le message ;
 *  - « livre »           : le fournisseur a confirme la remise.
 *
 * Sans fournisseur configure, les taches restent « enregistre » et aucune
 * interface n'affiche « email envoye ».
 */

export interface SendResult {
  accepted: boolean;
  providerMessageId?: string;
  error?: string;
}

export interface EmailProvider {
  readonly name: string;
  readonly configured: boolean;
  send(input: {
    to: string;
    subject: string;
    text: string;
    idempotencyKey: string;
  }): Promise<SendResult>;
}

/** Fournisseur par defaut : ne pretend rien envoyer. */
export const nullProvider: EmailProvider = {
  name: "aucun",
  configured: false,
  async send() {
    return {
      accepted: false,
      error:
        "Aucun fournisseur d'email configure : la tache reste enregistree en base.",
    };
  },
};

export function createResendProvider(apiKey: string, from: string): EmailProvider {
  return {
    name: "resend",
    configured: true,
    async send({ to, subject, text, idempotencyKey }) {
      // Import tardif : la dependance n'est chargee que si elle est utilisee.
      const { Resend } = await import("resend");
      const client = new Resend(apiKey);
      try {
        const response = await client.emails.send(
          { from, to, subject, text },
          // Cle d'idempotence du fournisseur : une reprise ne redouble pas
          // l'envoi cote Resend non plus.
          { idempotencyKey },
        );
        if (response.error) {
          return { accepted: false, error: response.error.message };
        }
        return {
          accepted: true,
          providerMessageId: response.data?.id ?? undefined,
        };
      } catch (error) {
        return {
          accepted: false,
          error: error instanceof Error ? error.message : "Erreur inconnue.",
        };
      }
    },
  };
}

export function resolveProvider(): EmailProvider {
  if (process.env.DIAPASON_EMAIL_PROVIDER !== "resend") return nullProvider;
  const key = process.env.RESEND_API_KEY;
  const from = process.env.DIAPASON_EMAIL_FROM;
  if (!key || !from) return nullProvider;
  return createResendProvider(key, from);
}

const MAX_ATTEMPTS = 5;

export interface WorkerReport {
  provider: string;
  configured: boolean;
  considered: number;
  skippedNoAccess: number;
  accepted: number;
  failed: number;
  leftRegistered: number;
}

/**
 * Worker de l'outbox. A appeler depuis une tache planifiee. Il revalide
 * l'acces du destinataire avant chaque envoi : une adhesion revoquee entre
 * l'enregistrement et l'envoi exclut le message.
 */
export async function processOutbox(
  options: { limit?: number; provider?: EmailProvider } = {},
): Promise<WorkerReport> {
  const provider = options.provider ?? resolveProvider();
  const adapter = getDataAdapter();
  const limit = options.limit ?? 25;

  const due = await adapter.read(async (tx) => {
    const rows = await tx.select("notification_outbox", {
      where: { state: "enregistre" },
      orderBy: { column: "scheduledFor" },
      limit: limit * 2,
    });
    return rows.filter((r) => r.scheduledFor <= nowIso()).slice(0, limit);
  });

  const report: WorkerReport = {
    provider: provider.name,
    configured: provider.configured,
    considered: due.length,
    skippedNoAccess: 0,
    accepted: 0,
    failed: 0,
    leftRegistered: 0,
  };

  for (const entry of due) {
    const target = await adapter.read(async (tx) => {
      const profile = await tx.selectOne("profiles", {
        where: { id: entry.recipientUserId },
      });
      if (!profile) return null;
      if (entry.communityId) {
        const membership = await tx.selectOne("community_memberships", {
          where: {
            communityId: entry.communityId,
            userId: entry.recipientUserId,
            status: "active",
          },
        });
        if (!membership) return null;
      }
      return profile;
    });

    if (!target) {
      report.skippedNoAccess += 1;
      await adapter.transaction((tx) =>
        tx.update("notification_outbox", entry.id, {
          state: "abandonne",
          lastError: "Destinataire sans acces au moment de l'envoi.",
          updatedAt: nowIso(),
        }),
      );
      continue;
    }

    if (!provider.configured) {
      report.leftRegistered += 1;
      continue;
    }

    const result = await provider.send({
      to: target.email,
      subject: entry.subject,
      text: entry.body,
      idempotencyKey: entry.idempotencyKey,
    });

    await adapter.transaction((tx) =>
      tx.update("notification_outbox", entry.id, {
        state: result.accepted
          ? "pris_en_charge"
          : entry.attempts + 1 >= MAX_ATTEMPTS
            ? "echec"
            : "enregistre",
        attempts: entry.attempts + 1,
        lastError: result.error ?? null,
        providerMessageId: result.providerMessageId ?? null,
        updatedAt: nowIso(),
      }),
    );

    if (result.accepted) report.accepted += 1;
    else report.failed += 1;
  }

  return report;
}

/** Contenu de la file, pour la page de developpement. */
export async function listOutbox(limit = 50): Promise<OutboxEntry[]> {
  const adapter = getDataAdapter();
  return adapter.read((tx) =>
    tx.select("notification_outbox", {
      orderBy: { column: "createdAt", direction: "desc" },
      limit,
    }),
  );
}
