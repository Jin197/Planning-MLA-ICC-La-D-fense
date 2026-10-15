"use client";

import { useFormStatus } from "react-dom";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

type Variant = "principal" | "secondaire" | "discret" | "danger";
type Taille = "normal" | "compact";

const VARIANTES: Record<Variant, string> = {
  // `sur-accent` vaut blanc en theme clair et bleu nuit en theme sombre :
  // l'aplat d'accent porte toujours un texte lisible.
  principal:
    "bg-indigo-accent text-sur-accent hover:bg-indigo-fonce border border-transparent",
  secondaire:
    "bg-surface text-nuit border border-bordure-forte hover:bg-ivoire-fonce",
  discret:
    "bg-transparent text-indigo-accent border border-transparent hover:bg-indigo-clair",
  danger:
    "bg-surface text-indispo-texte border border-bordure-forte hover:bg-indispo-fond",
};

const TAILLES: Record<Taille, string> = {
  // Environ 44 px de hauteur : choix de confort tactile.
  normal: "min-h-11 px-4 py-2 text-[0.95rem]",
  compact: "min-h-9 px-3 py-1.5 text-sm",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: Variant;
  taille?: Taille;
  /** Libelle affiche pendant l'action, et annonce aux lecteurs d'ecran. */
  libelleEnCours?: string;
  pleineLargeur?: boolean;
  children: ReactNode;
}

export function Button({
  variante = "principal",
  taille = "normal",
  libelleEnCours,
  pleineLargeur,
  className,
  children,
  disabled,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-[var(--radius-doux)] font-medium transition-colors",
        "disabled:cursor-not-allowed disabled:opacity-55",
        VARIANTES[variante],
        TAILLES[taille],
        pleineLargeur && "w-full",
        className,
      )}
      {...rest}
    >
      {libelleEnCours ? <span>{libelleEnCours}</span> : children}
    </button>
  );
}

/**
 * Bouton de soumission. Il se desactive pendant l'envoi : un double clic ne
 * declenche pas deux fois l'action.
 */
export function SubmitButton({
  children,
  libelleEnCours = "Enregistrement...",
  variante = "principal",
  taille = "normal",
  pleineLargeur,
  className,
  ...rest
}: Omit<ButtonProps, "type">) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variante={variante}
      taille={taille}
      pleineLargeur={pleineLargeur}
      className={className}
      disabled={pending || rest.disabled}
      aria-busy={pending}
      {...rest}
    >
      {pending ? libelleEnCours : children}
    </Button>
  );
}
