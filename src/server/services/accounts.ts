import "server-only";
import { newId } from "@/lib/ids";
import { nowIso } from "@/lib/time";
import { err, ok, type Result } from "@/lib/result";
import { DEFAULT_PREFERENCES } from "@/domain/notifications";
import type { OnboardingChoice, Profile } from "@/domain/types";
import { getDataAdapter } from "../data";
import { ConstraintError } from "../data/port";
import { hashPassword, passwordIssues, randomToken, verifyPassword } from "../auth/password";
import { endSession, startSession } from "../auth/session";

/**
 * Comptes : inscription, verification de l'email, connexion, reinitialisation.
 * Le ministere declare est une information de profil ; le choix d'accueil
 * oriente l'interface et n'accorde aucun droit dans une communaute.
 */

const MAX_FAILED_ATTEMPTS = 8;
const LOCK_MINUTES = 15;

export interface RegisterInput {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  declaredMinistry: string;
  description: string | null;
  onboardingChoice: OnboardingChoice;
}

export interface RegisterOutcome {
  userId: string;
  /** Jeton de verification. En demonstration il est lisible dans /dev/boite-mail. */
  verificationToken: string;
}

export async function registerAccount(
  input: RegisterInput,
): Promise<Result<RegisterOutcome>> {
  const issues = passwordIssues(input.password);
  if (issues.length > 0) {
    return err("mot_de_passe_faible", issues.join(" "));
  }

  const email = input.email.trim().toLowerCase();
  const adapter = getDataAdapter();
  const { hash, salt } = await hashPassword(input.password);
  const token = randomToken();
  const at = nowIso();
  const userId = newId();

  try {
    await adapter.transaction(async (tx) => {
      await tx.insert("profiles", {
        id: userId,
        email,
        firstName: input.firstName.trim(),
        lastName: input.lastName.trim(),
        declaredMinistry: input.declaredMinistry.trim(),
        description: input.description?.trim() || null,
        onboardingChoice: input.onboardingChoice,
        emailVerifiedAt: null,
        createdAt: at,
      });
      await tx.insert("account_secrets", {
        userId,
        passwordHash: hash,
        passwordSalt: salt,
        emailVerificationToken: token,
        passwordResetToken: null,
        passwordResetExpiresAt: null,
        failedAttempts: 0,
        lockedUntil: null,
      });
      await tx.insert("notification_preferences", {
        userId,
        ...DEFAULT_PREFERENCES,
      });
    });
  } catch (error) {
    if (error instanceof ConstraintError && error.code === "profiles_email_unique") {
      return err("email_deja_utilise", "Un compte existe deja avec cet email.");
    }
    throw error;
  }

  return ok({ userId, verificationToken: token });
}

export async function verifyEmail(token: string): Promise<Result<{ userId: string }>> {
  const adapter = getDataAdapter();
  return adapter.transaction(async (tx) => {
    const secret = await tx.selectOne("account_secrets", {
      where: { emailVerificationToken: token },
    });
    if (!secret) {
      return err("jeton_invalide", "Ce lien de verification n'est plus valable.");
    }
    await tx.update("account_secrets", secret.userId, {
      emailVerificationToken: null,
    });
    await tx.update("profiles", secret.userId, { emailVerifiedAt: nowIso() });
    return ok({ userId: secret.userId });
  });
}

export async function login(
  email: string,
  password: string,
): Promise<Result<{ userId: string; emailVerified: boolean }>> {
  const adapter = getDataAdapter();
  const normalised = email.trim().toLowerCase();

  const outcome = await adapter.transaction(async (tx) => {
    const profile = await tx.selectOne("profiles", { where: { email: normalised } });
    if (!profile) {
      // Message volontairement identique pour ne pas reveler l'existence du compte.
      return err("identifiants_invalides", "Email ou mot de passe incorrect.");
    }
    const secret = await tx.selectOne("account_secrets", {
      where: { userId: profile.id },
    });
    if (!secret) {
      return err("identifiants_invalides", "Email ou mot de passe incorrect.");
    }
    if (secret.lockedUntil && secret.lockedUntil > nowIso()) {
      return err(
        "compte_verrouille",
        `Trop de tentatives. Reessayez apres ${new Date(secret.lockedUntil).toLocaleTimeString("fr-FR")}.`,
      );
    }

    const valid = await verifyPassword(
      password,
      secret.passwordHash,
      secret.passwordSalt,
    );
    if (!valid) {
      const attempts = secret.failedAttempts + 1;
      await tx.update("account_secrets", profile.id, {
        failedAttempts: attempts,
        lockedUntil:
          attempts >= MAX_FAILED_ATTEMPTS
            ? new Date(Date.now() + LOCK_MINUTES * 60000).toISOString()
            : null,
      });
      return err("identifiants_invalides", "Email ou mot de passe incorrect.");
    }

    await tx.update("account_secrets", profile.id, {
      failedAttempts: 0,
      lockedUntil: null,
    });
    return ok({
      userId: profile.id,
      emailVerified: profile.emailVerifiedAt !== null,
    });
  });

  if (outcome.ok) await startSession(outcome.value.userId);
  return outcome;
}

export async function logout(): Promise<void> {
  await endSession();
}

export async function requestPasswordReset(
  email: string,
): Promise<{ token: string | null }> {
  const adapter = getDataAdapter();
  const normalised = email.trim().toLowerCase();
  return adapter.transaction(async (tx) => {
    const profile = await tx.selectOne("profiles", { where: { email: normalised } });
    // Reponse identique dans tous les cas cote appelant.
    if (!profile) return { token: null };
    const token = randomToken();
    await tx.update("account_secrets", profile.id, {
      passwordResetToken: token,
      passwordResetExpiresAt: new Date(Date.now() + 60 * 60000).toISOString(),
    });
    return { token };
  });
}

export async function resetPassword(
  token: string,
  newPassword: string,
): Promise<Result<{ userId: string }>> {
  const issues = passwordIssues(newPassword);
  if (issues.length > 0) {
    return err("mot_de_passe_faible", issues.join(" "));
  }
  const { hash, salt } = await hashPassword(newPassword);
  const adapter = getDataAdapter();
  return adapter.transaction(async (tx) => {
    const secret = await tx.selectOne("account_secrets", {
      where: { passwordResetToken: token },
    });
    if (
      !secret ||
      !secret.passwordResetExpiresAt ||
      secret.passwordResetExpiresAt < nowIso()
    ) {
      return err("jeton_invalide", "Ce lien de reinitialisation a expire.");
    }
    await tx.update("account_secrets", secret.userId, {
      passwordHash: hash,
      passwordSalt: salt,
      passwordResetToken: null,
      passwordResetExpiresAt: null,
      failedAttempts: 0,
      lockedUntil: null,
    });
    return ok({ userId: secret.userId });
  });
}

export interface ProfileUpdate {
  firstName?: string;
  lastName?: string;
  declaredMinistry?: string;
  description?: string | null;
  /**
   * Modifier le choix d'accueil ne touche pas aux roles deja attribues dans
   * les communautes.
   */
  onboardingChoice?: OnboardingChoice;
}

export async function updateProfile(
  userId: string,
  patch: ProfileUpdate,
): Promise<Profile> {
  const adapter = getDataAdapter();
  return adapter.transaction((tx) => tx.update("profiles", userId, patch));
}

/** Boite de developpement : jetons en attente, uniquement en mode demo. */
export async function pendingAccountTokens(): Promise<
  { email: string; verification: string | null; reset: string | null }[]
> {
  const adapter = getDataAdapter();
  return adapter.read(async (tx) => {
    const secrets = await tx.select("account_secrets");
    const profiles = await tx.select("profiles");
    const byId = new Map(profiles.map((p) => [p.id, p]));
    return secrets
      .filter((s) => s.emailVerificationToken || s.passwordResetToken)
      .map((s) => ({
        email: byId.get(s.userId)?.email ?? s.userId,
        verification: s.emailVerificationToken,
        reset: s.passwordResetToken,
      }));
  });
}
