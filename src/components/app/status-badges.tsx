import { AVAILABILITY_LABELS } from "@/domain/availability";
import { ASSIGNMENT_LABELS } from "@/domain/assignments";
import { EVENT_STATE_LABELS } from "@/domain/events";
import type {
  AssignmentState,
  AvailabilityDisplayState,
  EventState,
} from "@/domain/types";
import { Badge, type BadgeTon } from "@/components/ui/primitives";

/**
 * Chaque statut combine un libelle ecrit, une forme et une couleur. Le
 * libelle suffit a comprendre l'etat sans percevoir la couleur.
 */

const DISPO_TON: Record<AvailabilityDisplayState, BadgeTon> = {
  disponible: "dispo",
  indisponible: "indispo",
  a_renseigner: "attente",
  a_reconfirmer: "alerte",
};

const DISPO_SIGNE: Record<AvailabilityDisplayState, string> = {
  disponible: "✓",
  indisponible: "✕",
  a_renseigner: "—",
  a_reconfirmer: "!",
};

export function BadgeDisponibilite({ etat }: { etat: AvailabilityDisplayState }) {
  return (
    <Badge ton={DISPO_TON[etat]} icone={DISPO_SIGNE[etat]}>
      {AVAILABILITY_LABELS[etat]}
    </Badge>
  );
}

const AFFECTATION_TON: Record<AssignmentState, BadgeTon> = {
  a_confirmer: "attente",
  confirmee: "dispo",
  a_remplacer: "alerte",
  retiree: "neutre",
};

const AFFECTATION_SIGNE: Record<AssignmentState, string> = {
  a_confirmer: "…",
  confirmee: "✓",
  a_remplacer: "!",
  retiree: "✕",
};

export function BadgeAffectation({ etat }: { etat: AssignmentState }) {
  return (
    <Badge ton={AFFECTATION_TON[etat]} icone={AFFECTATION_SIGNE[etat]}>
      {ASSIGNMENT_LABELS[etat]}
    </Badge>
  );
}

const ETAT_TON: Record<EventState, BadgeTon> = {
  brouillon: "neutre",
  collecte: "indigo",
  publie: "dispo",
  annule: "indispo",
  archive: "neutre",
};

export function BadgeEtatEvenement({ etat }: { etat: EventState }) {
  return <Badge ton={ETAT_TON[etat]}>{EVENT_STATE_LABELS[etat]}</Badge>;
}

export function BadgeType({ type, autre }: { type: string; autre?: string | null }) {
  const libelles: Record<string, string> = {
    MLA: "MLA",
    ACCUEIL: "Accueil",
    SONORISATION: "Sonorisation",
    INTEGRATION: "Integration",
    AUTRE: autre ? `Autre - ${autre}` : "Autre",
  };
  return <Badge ton="or">{libelles[type] ?? type}</Badge>;
}
