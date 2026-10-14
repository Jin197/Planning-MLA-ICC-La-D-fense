-- ---------------------------------------------------------------------------
-- Diapason - schema relationnel
--
-- Les colonnes sont en snake_case ; l'adaptateur applicatif fait la
-- conversion depuis les noms camelCase du code.
--
-- Les identifiants d'authentification ne sont pas stockes ici : avec cet
-- adaptateur, Supabase Auth detient les mots de passe. La table
-- `account_secrets` de l'adaptateur de demonstration n'a donc pas
-- d'equivalent en base.
-- ---------------------------------------------------------------------------

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------

create type community_type as enum (
  'MLA', 'ACCUEIL', 'SONORISATION', 'INTEGRATION', 'AUTRE'
);
create type membership_role as enum ('admin', 'membre');
create type membership_status as enum ('active', 'revoked');
create type join_request_status as enum (
  'en_attente', 'acceptee', 'refusee', 'annulee'
);
create type onboarding_choice as enum ('responsable', 'membre');
create type template_field_kind as enum (
  'texte', 'texte_long', 'lieu', 'creneau_horaire', 'dress_code',
  'repetition_lieu', 'repetition_horaire', 'poste'
);
create type event_state as enum (
  'brouillon', 'collecte', 'publie', 'annule', 'archive'
);
create type assignment_state as enum (
  'a_confirmer', 'confirmee', 'a_remplacer', 'retiree'
);
create type availability_answer as enum ('disponible', 'indisponible');
create type subscription_scope as enum ('toute_la_communaute', 'mes_evenements');
create type outbox_state as enum (
  'enregistre', 'pris_en_charge', 'livre', 'echec', 'abandonne'
);
create type import_job_state as enum (
  'charge', 'analyse', 'previsualise', 'valide', 'importe', 'echec'
);
create type import_row_kind as enum (
  'personne', 'disponibilite', 'affectation', 'chant', 'dress_code',
  'repetition', 'creneau', 'anomalie'
);
create type imported_person_status as enum (
  'a_rapprocher', 'lie', 'nouveau', 'ignore'
);

-- ---------------------------------------------------------------------------
-- Profils
-- ---------------------------------------------------------------------------

create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  first_name text not null check (length(trim(first_name)) > 0),
  last_name text not null check (length(trim(last_name)) > 0),
  -- Information de profil : n'accorde aucune adhesion ni aucun droit.
  declared_ministry text not null default '',
  description text,
  -- Oriente l'accueil, ne confere aucun role administratif.
  onboarding_choice onboarding_choice not null default 'membre',
  email_verified_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Communautes et adhesions
-- ---------------------------------------------------------------------------

create table communities (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null check (length(trim(name)) > 0),
  type community_type not null,
  other_label text,
  description text not null default '',
  -- Nom d'affichage : n'accorde aucune permission a un autre compte.
  displayed_leader_name text not null default '',
  created_by uuid not null references profiles (id),
  timezone text not null default 'Europe/Paris',
  created_at timestamptz not null default now(),
  constraint other_label_only_for_autre check (
    type = 'AUTRE' or other_label is null
  )
);

create table community_memberships (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references communities (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  role membership_role not null default 'membre',
  status membership_status not null default 'active',
  joined_at timestamptz not null default now(),
  revoked_at timestamptz,
  -- Une seule adhesion par personne et par communaute.
  unique (community_id, user_id)
);

create index community_memberships_by_user on community_memberships (user_id, status);
create index community_memberships_by_community
  on community_memberships (community_id, status, role);

create table join_requests (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references communities (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  message text,
  status join_request_status not null default 'en_attente',
  decided_by uuid references profiles (id),
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now()
);

-- Une seule demande en attente a la fois, meme en cas de double soumission.
create unique index join_requests_single_pending
  on join_requests (community_id, user_id)
  where status = 'en_attente';

create index join_requests_by_community on join_requests (community_id, status);

-- ---------------------------------------------------------------------------
-- Competences et equipes
-- ---------------------------------------------------------------------------

create table skills (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references communities (id) on delete cascade,
  label text not null check (length(trim(label)) > 0),
  unique (community_id, label)
);

create table membership_skills (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references communities (id) on delete cascade,
  membership_id uuid not null,
  skill_id uuid not null,
  unique (membership_id, skill_id),
  -- Cles composites : un lien ne peut pas traverser deux communautes.
  foreign key (membership_id, community_id)
    references community_memberships (id, community_id) on delete cascade,
  foreign key (skill_id, community_id)
    references skills (id, community_id) on delete cascade
);

create table teams (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references communities (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  "order" integer not null default 1,
  archived_at timestamptz,
  unique (community_id, name)
);

create table team_memberships (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references communities (id) on delete cascade,
  team_id uuid not null,
  membership_id uuid not null,
  unique (team_id, membership_id),
  foreign key (team_id, community_id)
    references teams (id, community_id) on delete cascade,
  foreign key (membership_id, community_id)
    references community_memberships (id, community_id) on delete cascade
);

-- Cles uniques composites, requises par les references ci-dessus.
alter table community_memberships add unique (id, community_id);
alter table skills add unique (id, community_id);
alter table teams add unique (id, community_id);

-- ---------------------------------------------------------------------------
-- Modeles de planning
-- ---------------------------------------------------------------------------

create table planning_templates (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references communities (id) on delete cascade,
  name text not null,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, community_id)
);

-- Un seul modele actif par communaute.
create unique index planning_templates_one_per_community
  on planning_templates (community_id);

create table template_fields (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references communities (id) on delete cascade,
  template_id uuid not null,
  kind template_field_kind not null,
  label text not null check (length(trim(label)) > 0),
  "order" integer not null default 1,
  -- Seul un champ de type poste peut recevoir des affectations.
  assignable boolean not null default false,
  min_required integer not null default 0 check (min_required >= 0),
  multiple boolean not null default true,
  allows_detail boolean not null default false,
  required boolean not null default false,
  archived_at timestamptz,
  constraint assignable_only_poste check (
    (kind = 'poste' and assignable) or (kind <> 'poste' and not assignable)
  ),
  foreign key (template_id, community_id)
    references planning_templates (id, community_id) on delete cascade
);

create index template_fields_by_template on template_fields (template_id, "order");

-- ---------------------------------------------------------------------------
-- Evenements, creneaux, plans, postes, affectations
-- ---------------------------------------------------------------------------

create table events (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references communities (id) on delete cascade,
  title text not null check (length(trim(title)) > 0),
  description text not null default '',
  state event_state not null default 'brouillon',
  timezone text not null default 'Europe/Paris',
  -- Verrou optimiste : toute ecriture compare cette version.
  version integer not null default 1 check (version > 0),
  published_version integer not null default 0 check (published_version >= 0),
  response_deadline timestamptz,
  published_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text,
  archived_at timestamptz,
  created_by uuid not null references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, community_id)
);

create index events_by_community on events (community_id, state);

create table event_sessions (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references communities (id) on delete cascade,
  event_id uuid not null,
  label text not null check (length(trim(label)) > 0),
  ordinal integer not null check (ordinal > 0),
  -- Instants UTC ; le fuseau de rendu vient de events.timezone.
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  location_name text not null default '',
  location_address text not null default '',
  -- Horaire encore a definir : bloque la publication.
  schedule_provisional boolean not null default false,
  constraint session_end_after_start check (ends_at > starts_at),
  unique (id, community_id),
  foreign key (event_id, community_id)
    references events (id, community_id) on delete cascade
);

create index event_sessions_by_event on event_sessions (event_id, ordinal);
create index event_sessions_by_start on event_sessions (community_id, starts_at);

create table event_plans (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references communities (id) on delete cascade,
  event_id uuid not null,
  session_id uuid not null,
  team_id uuid not null,
  template_version integer not null default 1,
  created_at timestamptz not null default now(),
  -- Un seul plan par equipe et par creneau.
  unique (session_id, team_id),
  unique (id, community_id),
  foreign key (event_id, community_id)
    references events (id, community_id) on delete cascade,
  foreign key (session_id, community_id)
    references event_sessions (id, community_id) on delete cascade,
  foreign key (team_id, community_id)
    references teams (id, community_id) on delete restrict
);

create index event_plans_by_event on event_plans (event_id);

create table event_role_slots (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references communities (id) on delete cascade,
  plan_id uuid not null,
  -- Identifiant stable du champ d'origine : renommer le modele ne casse rien.
  template_field_id uuid,
  -- Instantane du libelle au moment de la copie.
  label text not null check (length(trim(label)) > 0),
  "order" integer not null default 1,
  min_required integer not null default 0 check (min_required >= 0),
  multiple boolean not null default true,
  allows_detail boolean not null default false,
  enabled boolean not null default true,
  unique (id, community_id),
  foreign key (plan_id, community_id)
    references event_plans (id, community_id) on delete cascade
);

create index event_role_slots_by_plan on event_role_slots (plan_id, "order");

create table assignments (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references communities (id) on delete cascade,
  plan_id uuid not null,
  slot_id uuid not null,
  membership_id uuid not null,
  state assignment_state not null default 'a_confirmer',
  detail text,
  -- Exceptions tracees : type, motif, auteur, horodatage.
  exceptions jsonb not null default '[]'::jsonb,
  member_note text,
  created_by uuid not null references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (plan_id, community_id)
    references event_plans (id, community_id) on delete cascade,
  foreign key (slot_id, community_id)
    references event_role_slots (id, community_id) on delete cascade,
  foreign key (membership_id, community_id)
    references community_memberships (id, community_id) on delete restrict
);

-- Pas de double affectation active de la meme personne au meme poste. Une
-- affectation retiree reste en base pour l'historique.
create unique index assignments_no_active_duplicate
  on assignments (slot_id, membership_id)
  where state <> 'retiree';

create index assignments_by_membership on assignments (membership_id, state);
create index assignments_by_plan on assignments (plan_id);

-- ---------------------------------------------------------------------------
-- Disponibilites
-- ---------------------------------------------------------------------------

create table session_availabilities (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references communities (id) on delete cascade,
  session_id uuid not null,
  membership_id uuid not null,
  answer availability_answer not null,
  -- Les horaires ont change apres la reponse.
  needs_reconfirmation boolean not null default false,
  answered_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Une reponse par membre et par creneau. L'absence de ligne signifie
  -- « a renseigner » : elle n'est jamais convertie.
  unique (session_id, membership_id),
  unique (id, community_id),
  foreign key (session_id, community_id)
    references event_sessions (id, community_id) on delete cascade,
  foreign key (membership_id, community_id)
    references community_memberships (id, community_id) on delete cascade
);

create index session_availabilities_by_membership
  on session_availabilities (membership_id);

-- Ressource separee : la confidentialite du motif est imposee en base par sa
-- propre politique RLS, pas seulement par l'interface.
create table availability_reasons (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references communities (id) on delete cascade,
  availability_id uuid not null,
  author_user_id uuid not null references profiles (id) on delete cascade,
  text text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (availability_id),
  foreign key (availability_id, community_id)
    references session_availabilities (id, community_id) on delete cascade
);

-- ---------------------------------------------------------------------------
-- Repetitions
-- ---------------------------------------------------------------------------

create table rehearsals (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references communities (id) on delete cascade,
  event_id uuid not null,
  label text not null default 'Repetition',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  location_name text not null default '',
  location_address text not null default '',
  room text not null default '',
  attendance_expected boolean not null default true,
  constraint rehearsal_end_after_start check (ends_at > starts_at),
  unique (id, community_id),
  foreign key (event_id, community_id)
    references events (id, community_id) on delete cascade
);

create table rehearsal_teams (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references communities (id) on delete cascade,
  rehearsal_id uuid not null,
  team_id uuid not null,
  unique (rehearsal_id, team_id),
  foreign key (rehearsal_id, community_id)
    references rehearsals (id, community_id) on delete cascade,
  foreign key (team_id, community_id)
    references teams (id, community_id) on delete cascade
);

create table rehearsal_availabilities (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references communities (id) on delete cascade,
  rehearsal_id uuid not null,
  membership_id uuid not null,
  answer availability_answer not null,
  needs_reconfirmation boolean not null default false,
  answered_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (rehearsal_id, membership_id),
  unique (id, community_id),
  foreign key (rehearsal_id, community_id)
    references rehearsals (id, community_id) on delete cascade,
  foreign key (membership_id, community_id)
    references community_memberships (id, community_id) on delete cascade
);

create table rehearsal_availability_reasons (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references communities (id) on delete cascade,
  rehearsal_availability_id uuid not null,
  author_user_id uuid not null references profiles (id) on delete cascade,
  text text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (rehearsal_availability_id),
  foreign key (rehearsal_availability_id, community_id)
    references rehearsal_availabilities (id, community_id) on delete cascade
);

-- ---------------------------------------------------------------------------
-- Chants
-- ---------------------------------------------------------------------------

create table songs (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references communities (id) on delete cascade,
  title text not null check (length(trim(title)) > 0),
  song_key text,
  tempo integer check (tempo is null or (tempo > 20 and tempo < 400)),
  default_lead text,
  -- Liens externes uniquement : aucune parole protegee n'est stockee.
  links text[] not null default '{}',
  notes text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  unique (id, community_id)
);

create table setlist_items (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references communities (id) on delete cascade,
  event_id uuid not null,
  session_id uuid not null,
  sequence text not null,
  "order" integer not null default 1,
  song_id uuid,
  free_title text,
  links text[] not null default '{}',
  notes text,
  constraint song_or_free_title check (
    song_id is not null or (free_title is not null and length(trim(free_title)) > 0)
  ),
  foreign key (event_id, community_id)
    references events (id, community_id) on delete cascade,
  foreign key (session_id, community_id)
    references event_sessions (id, community_id) on delete cascade,
  foreign key (song_id, community_id)
    references songs (id, community_id) on delete set null
);

create index setlist_items_by_session on setlist_items (session_id, "order");

-- ---------------------------------------------------------------------------
-- Dress-code et ressources
-- ---------------------------------------------------------------------------

create table dress_codes (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references communities (id) on delete cascade,
  event_id uuid not null,
  -- null = consigne commune a l'evenement.
  team_id uuid,
  theme text not null default '',
  mood text not null default '',
  colors text[] not null default '{}',
  materials text not null default '',
  instruction text not null default '',
  updated_at timestamptz not null default now(),
  unique (id, community_id),
  foreign key (event_id, community_id)
    references events (id, community_id) on delete cascade,
  foreign key (team_id, community_id)
    references teams (id, community_id) on delete set null
);

-- Une consigne commune et au plus une variante par equipe.
create unique index dress_codes_one_common_per_event
  on dress_codes (event_id)
  where team_id is null;
create unique index dress_codes_one_per_team
  on dress_codes (event_id, team_id)
  where team_id is not null;

create table event_assets (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references communities (id) on delete cascade,
  event_id uuid not null,
  dress_code_id uuid,
  -- Chemin dans un bucket Storage prive.
  storage_path text not null,
  filename text not null,
  mime_type text not null,
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 5242880),
  -- Texte alternatif obligatoire.
  alt text not null check (length(trim(alt)) > 0),
  uploaded_by uuid not null references profiles (id),
  created_at timestamptz not null default now(),
  constraint mime_type_image check (
    mime_type in ('image/jpeg', 'image/png', 'image/webp', 'image/avif')
  ),
  foreign key (event_id, community_id)
    references events (id, community_id) on delete cascade,
  foreign key (dress_code_id, community_id)
    references dress_codes (id, community_id) on delete set null
);

-- ---------------------------------------------------------------------------
-- Messagerie
-- ---------------------------------------------------------------------------

create table event_messages (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references communities (id) on delete cascade,
  event_id uuid not null,
  author_user_id uuid not null references profiles (id),
  body text not null check (length(trim(body)) > 0 and length(body) <= 4000),
  mentions uuid[] not null default '{}',
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  moderated_by uuid references profiles (id),
  moderation_note text,
  deleted_at timestamptz,
  foreign key (event_id, community_id)
    references events (id, community_id) on delete cascade
);

create index event_messages_recent on event_messages (event_id, created_at desc);

-- Une seule annonce epinglee par evenement.
create unique index event_messages_single_pinned
  on event_messages (event_id)
  where pinned;

create table message_read_cursors (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references communities (id) on delete cascade,
  event_id uuid not null,
  user_id uuid not null references profiles (id) on delete cascade,
  last_read_at timestamptz not null default now(),
  unique (event_id, user_id),
  foreign key (event_id, community_id)
    references events (id, community_id) on delete cascade
);

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------

create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  community_id uuid references communities (id) on delete cascade,
  event_id uuid references events (id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null,
  href text,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index notifications_by_recipient
  on notifications (user_id, created_at desc);
create index notifications_unread on notifications (user_id) where read_at is null;

create table notification_preferences (
  user_id uuid primary key references profiles (id) on delete cascade,
  email_immediate boolean not null default true,
  digest_discussion boolean not null default false,
  subscription_scope subscription_scope not null default 'toute_la_communaute',
  muted_event_ids uuid[] not null default '{}',
  -- Rappels en heures avant le debut. Par defaut 48 et 24.
  reminder_offsets_hours integer[] not null default '{48,24}'
);

-- Outbox transactionnelle : ecrite dans la meme transaction que la
-- modification metier, puis consommee par un worker.
create table notification_outbox (
  id uuid primary key default gen_random_uuid(),
  -- Deux reprises de la meme notification logique partagent cette cle.
  idempotency_key text not null unique,
  kind text not null,
  recipient_user_id uuid not null references profiles (id) on delete cascade,
  community_id uuid references communities (id) on delete cascade,
  event_id uuid references events (id) on delete cascade,
  subject text not null,
  body text not null,
  state outbox_state not null default 'enregistre',
  attempts integer not null default 0 check (attempts >= 0),
  scheduled_for timestamptz not null default now(),
  last_error text,
  provider_message_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index notification_outbox_due
  on notification_outbox (state, scheduled_for);

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  community_id uuid references communities (id) on delete cascade,
  actor_user_id uuid not null references profiles (id),
  action text not null,
  target_type text not null,
  target_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  at timestamptz not null default now()
);

create index audit_logs_by_community on audit_logs (community_id, at desc);

-- ---------------------------------------------------------------------------
-- Import
-- ---------------------------------------------------------------------------

create table import_jobs (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references communities (id) on delete cascade,
  created_by uuid not null references profiles (id),
  filename text not null,
  state import_job_state not null default 'charge',
  -- Annee proposee pour les feuilles sans annee : a valider par l'admin.
  assumed_year integer,
  year_evidence text,
  -- Deduire « indisponible » hors creneaux cites : choix explicite.
  infer_missing_as_unavailable boolean not null default false,
  summary jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, community_id)
);

create table import_rows (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null,
  community_id uuid not null references communities (id) on delete cascade,
  kind import_row_kind not null,
  -- Provenance exacte conservee pour controler les anomalies.
  sheet text not null,
  cell text not null,
  raw_value text not null default '',
  parsed jsonb not null default '{}'::jsonb,
  issues text[] not null default '{}',
  skipped boolean not null default false,
  foreign key (job_id, community_id)
    references import_jobs (id, community_id) on delete cascade
);

create index import_rows_by_job on import_rows (job_id, kind);

create table imported_people (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null,
  community_id uuid not null references communities (id) on delete cascade,
  last_name text not null default '',
  first_name text not null default '',
  raw_skills text not null default '',
  source_cells text[] not null default '{}',
  suggested_membership_id uuid,
  suggestion_score numeric(4, 3),
  linked_membership_id uuid,
  status imported_person_status not null default 'a_rapprocher',
  foreign key (job_id, community_id)
    references import_jobs (id, community_id) on delete cascade,
  foreign key (suggested_membership_id, community_id)
    references community_memberships (id, community_id) on delete set null,
  foreign key (linked_membership_id, community_id)
    references community_memberships (id, community_id) on delete set null
);

create index imported_people_by_job on imported_people (job_id, status);
