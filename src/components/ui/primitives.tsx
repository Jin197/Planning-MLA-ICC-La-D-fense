import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/* -------------------------------------------------------------------------- */
/* Cartes et sections                                                         */
/* -------------------------------------------------------------------------- */

export function Card({
  children,
  className,
  as: Tag = "section",
}: {
  children: ReactNode;
  className?: string;
  as?: "section" | "div" | "article" | "li";
}) {
  return (
    <Tag
      className={cn(
        "rounded-[var(--radius-carte)] border border-bordure bg-surface shadow-[var(--shadow-carte)]",
        className,
      )}
    >
      {children}
    </Tag>
  );
}

export function CardHeader({
  titre,
  sousTitre,
  actions,
  niveau = 2,
}: {
  titre: ReactNode;
  sousTitre?: ReactNode;
  actions?: ReactNode;
  niveau?: 1 | 2 | 3;
}) {
  const Titre = `h${niveau}` as "h1" | "h2" | "h3";
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-bordure px-4 py-3 sm:px-6 sm:py-4">
      <div className="min-w-0">
        <Titre className={niveau === 1 ? "text-xl sm:text-2xl" : "text-base sm:text-lg"}>
          {titre}
        </Titre>
        {sousTitre ? (
          <p className="mt-1 text-sm text-nuit-doux">{sousTitre}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function CardBody({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("px-4 py-4 sm:px-6", className)}>{children}</div>;
}

/* -------------------------------------------------------------------------- */
/* Badges d'etat                                                              */
/* -------------------------------------------------------------------------- */

export type BadgeTon =
  | "neutre"
  | "dispo"
  | "indispo"
  | "attente"
  | "alerte"
  | "indigo"
  | "or";

const TONS: Record<BadgeTon, string> = {
  neutre: "bg-ivoire-fonce text-nuit-doux border-bordure-forte",
  dispo: "bg-dispo-fond text-dispo-texte border-dispo-texte/25",
  indispo: "bg-indispo-fond text-indispo-texte border-indispo-texte/25",
  attente: "bg-attente-fond text-attente-texte border-attente-texte/25",
  alerte: "bg-alerte-fond text-alerte-texte border-alerte-texte/25",
  indigo: "bg-indigo-clair text-indigo-fonce border-indigo-accent/25",
  or: "bg-or-pale text-or border-or/25",
};

/**
 * Un badge porte toujours un libelle ecrit : la couleur ne transporte jamais
 * l'information a elle seule.
 */
export function Badge({
  children,
  ton = "neutre",
  icone,
  className,
  titre,
}: {
  children: ReactNode;
  ton?: BadgeTon;
  icone?: ReactNode;
  className?: string;
  titre?: string;
}) {
  return (
    <span
      title={titre}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        TONS[ton],
        className,
      )}
    >
      {icone ? <span aria-hidden="true">{icone}</span> : null}
      {children}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Avatar                                                                     */
/* -------------------------------------------------------------------------- */

export function Avatar({
  initiales,
  nom,
  taille = "normal",
}: {
  initiales: string;
  nom: string;
  taille?: "normal" | "petit";
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-indigo-clair font-semibold text-indigo-fonce",
        taille === "petit" ? "size-7 text-[0.7rem]" : "size-9 text-sm",
      )}
      aria-hidden="true"
      title={nom}
    >
      {initiales}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Messages                                                                   */
/* -------------------------------------------------------------------------- */

export type AlerteTon = "info" | "succes" | "attention" | "erreur";

const ALERTE_STYLES: Record<AlerteTon, string> = {
  info: "border-indigo-accent/30 bg-indigo-clair text-indigo-fonce",
  succes: "border-dispo-texte/30 bg-dispo-fond text-dispo-texte",
  attention: "border-alerte-texte/30 bg-alerte-fond text-alerte-texte",
  erreur: "border-indispo-texte/30 bg-indispo-fond text-indispo-texte",
};

const ALERTE_PREFIXES: Record<AlerteTon, string> = {
  info: "Information",
  succes: "Termine",
  attention: "Attention",
  erreur: "Erreur",
};

export function Alerte({
  ton = "info",
  titre,
  children,
  className,
}: {
  ton?: AlerteTon;
  titre?: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      role={ton === "erreur" ? "alert" : "status"}
      className={cn("rounded-[var(--radius-doux)] border px-4 py-3 text-sm", ALERTE_STYLES[ton], className)}
    >
      <p className="font-semibold">{titre ?? ALERTE_PREFIXES[ton]}</p>
      {children ? <div className="mt-1">{children}</div> : null}
    </div>
  );
}

export function EtatVide({
  titre,
  description,
  action,
}: {
  titre: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-[var(--radius-doux)] border border-dashed border-bordure-forte bg-ivoire-fonce/60 px-6 py-10 text-center">
      <p className="font-medium text-nuit">{titre}</p>
      {description ? (
        <p className="mx-auto mt-2 max-w-prose text-sm text-nuit-doux">{description}</p>
      ) : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function Squelette({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn("animate-pulse rounded-[var(--radius-doux)] bg-ivoire-fonce", className)}
    />
  );
}

/* -------------------------------------------------------------------------- */
/* Formulaires                                                                */
/* -------------------------------------------------------------------------- */

export function Champ({
  label,
  htmlFor,
  aide,
  erreur,
  requis,
  children,
}: {
  label: string;
  htmlFor: string;
  aide?: ReactNode;
  erreur?: string | null;
  requis?: boolean;
  children: ReactNode;
}) {
  const aideId = aide ? `${htmlFor}-aide` : undefined;
  const erreurId = erreur ? `${htmlFor}-erreur` : undefined;
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-nuit">
        {label}
        {requis ? (
          <span className="ml-1 text-indispo-texte" aria-hidden="true">
            *
          </span>
        ) : (
          <span className="ml-2 text-xs font-normal text-nuit-tres-doux">
            facultatif
          </span>
        )}
      </label>
      <div aria-describedby={cn(aideId, erreurId) || undefined}>{children}</div>
      {aide ? (
        <p id={aideId} className="text-xs text-nuit-doux">
          {aide}
        </p>
      ) : null}
      {erreur ? (
        <p id={erreurId} className="text-xs font-medium text-indispo-texte">
          {erreur}
        </p>
      ) : null}
    </div>
  );
}

const CONTROLE =
  "w-full min-h-11 rounded-[var(--radius-doux)] border border-bordure-forte bg-surface px-3 py-2 text-base text-nuit placeholder:text-nuit-tres-doux disabled:bg-ivoire-fonce";

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(CONTROLE, props.className)} />;
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea {...props} className={cn(CONTROLE, "min-h-24 py-2", props.className)} />
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cn(CONTROLE, "pr-8", props.className)} />;
}

/* -------------------------------------------------------------------------- */
/* Divers                                                                     */
/* -------------------------------------------------------------------------- */

export function GrilleDefilante({
  children,
  legende,
}: {
  children: ReactNode;
  legende?: string;
}) {
  return (
    <div className="grille-defilante max-h-[70vh] rounded-[var(--radius-doux)] border border-bordure">
      {legende ? <p className="sr-only">{legende}</p> : null}
      {children}
    </div>
  );
}

export function Separateur({ className }: { className?: string }) {
  return <hr className={cn("border-t border-bordure", className)} />;
}

export function FiletDore() {
  return (
    <div
      aria-hidden="true"
      className="h-0.5 w-12 rounded-full bg-or-clair"
    />
  );
}
