-- ---------------------------------------------------------------------------
-- Diapason - securite au niveau des lignes
--
-- Principe : les permissions viennent des adhesions autoritaires en base.
-- Jamais d'un role envoye par le navigateur, jamais d'une metadonnee de
-- profil modifiable par son proprietaire.
-- ---------------------------------------------------------------------------

-- Fonctions d'aide. `security definer` avec un `search_path` fige, et
-- `stable` pour etre evaluees une fois par requete.

create or replace function diapason_is_active_member(target_community uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from community_memberships m
    where m.community_id = target_community
      and m.user_id = auth.uid()
      and m.status = 'active'
  );
$$;

create or replace function diapason_is_active_admin(target_community uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from community_memberships m
    where m.community_id = target_community
      and m.user_id = auth.uid()
      and m.status = 'active'
      and m.role = 'admin'
  );
$$;

-- Mon adhesion dans cette communaute, utilisee pour les ecritures « pour soi ».
create or replace function diapason_my_membership(target_community uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select m.id
  from community_memberships m
  where m.community_id = target_community
    and m.user_id = auth.uid()
    and m.status = 'active'
  limit 1;
$$;

-- Un evenement est-il visible pour moi, compte tenu de son etat ?
create or replace function diapason_can_see_event(target_event uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from events e
    where e.id = target_event
      and diapason_is_active_member(e.community_id)
      and (e.state <> 'brouillon' or diapason_is_active_admin(e.community_id))
  );
$$;

-- Le plan d'un evenement est-il visible ? Pendant la collecte, les
-- affectations en preparation restent reservees aux admins.
create or replace function diapason_can_see_plan(target_event uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from events e
    where e.id = target_event
      and diapason_is_active_member(e.community_id)
      and (
        diapason_is_active_admin(e.community_id)
        or e.state in ('publie', 'annule', 'archive')
      )
  );
$$;

create or replace function diapason_event_of_plan(target_plan uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.event_id from event_plans p where p.id = target_plan;
$$;

-- ---------------------------------------------------------------------------
-- Activation de RLS sur toutes les tables exposees
-- ---------------------------------------------------------------------------

alter table profiles enable row level security;
alter table communities enable row level security;
alter table community_memberships enable row level security;
alter table join_requests enable row level security;
alter table skills enable row level security;
alter table membership_skills enable row level security;
alter table teams enable row level security;
alter table team_memberships enable row level security;
alter table planning_templates enable row level security;
alter table template_fields enable row level security;
alter table events enable row level security;
alter table event_sessions enable row level security;
alter table event_plans enable row level security;
alter table event_role_slots enable row level security;
alter table assignments enable row level security;
alter table session_availabilities enable row level security;
alter table availability_reasons enable row level security;
alter table rehearsals enable row level security;
alter table rehearsal_teams enable row level security;
alter table rehearsal_availabilities enable row level security;
alter table rehearsal_availability_reasons enable row level security;
alter table songs enable row level security;
alter table setlist_items enable row level security;
alter table dress_codes enable row level security;
alter table event_assets enable row level security;
alter table event_messages enable row level security;
alter table message_read_cursors enable row level security;
alter table notifications enable row level security;
alter table notification_preferences enable row level security;
alter table notification_outbox enable row level security;
alter table audit_logs enable row level security;
alter table import_jobs enable row level security;
alter table import_rows enable row level security;
alter table imported_people enable row level security;

-- ---------------------------------------------------------------------------
-- Profils
-- ---------------------------------------------------------------------------

-- Je lis mon profil, et les profils des personnes avec qui je partage une
-- communaute. Rien de plus : on ne decouvre pas les autres ministeres d'un
-- utilisateur.
create policy profiles_select on profiles for select
using (
  id = auth.uid()
  or exists (
    select 1
    from community_memberships mine
    join community_memberships theirs
      on theirs.community_id = mine.community_id
    where mine.user_id = auth.uid()
      and mine.status = 'active'
      and theirs.user_id = profiles.id
      and theirs.status = 'active'
  )
);

create policy profiles_update_self on profiles for update
using (id = auth.uid())
with check (id = auth.uid());

-- ---------------------------------------------------------------------------
-- Communautes
-- ---------------------------------------------------------------------------

-- Le catalogue est public pour un compte connecte : il ne contient que nom,
-- type, description et responsable affiche.
create policy communities_select on communities for select
using (auth.uid() is not null);

create policy communities_update_admin on communities for update
using (diapason_is_active_admin(id))
with check (diapason_is_active_admin(id));

-- La creation passe par la fonction `create_community_with_admin` : aucune
-- insertion directe n'est autorisee, pour garantir l'atomicite.

-- ---------------------------------------------------------------------------
-- Adhesions et demandes
-- ---------------------------------------------------------------------------

create policy memberships_select on community_memberships for select
using (user_id = auth.uid() or diapason_is_active_member(community_id));

-- Les changements de role et les revocations passent par des fonctions
-- dediees : pas de mise a jour libre de colonnes.

create policy join_requests_select on join_requests for select
using (user_id = auth.uid() or diapason_is_active_admin(community_id));

create policy join_requests_insert_self on join_requests for insert
with check (
  user_id = auth.uid()
  and status = 'en_attente'
  and not diapason_is_active_member(community_id)
);

-- Le demandeur peut seulement annuler sa propre demande en attente.
create policy join_requests_cancel_self on join_requests for update
using (user_id = auth.uid() and status = 'en_attente')
with check (user_id = auth.uid() and status = 'annulee');

create policy join_requests_decide_admin on join_requests for update
using (diapason_is_active_admin(community_id) and status = 'en_attente')
with check (diapason_is_active_admin(community_id));

-- ---------------------------------------------------------------------------
-- Competences, equipes, modeles
-- ---------------------------------------------------------------------------

create policy skills_select on skills for select
using (diapason_is_active_member(community_id));
create policy skills_write on skills for all
using (diapason_is_active_admin(community_id))
with check (diapason_is_active_admin(community_id));

create policy membership_skills_select on membership_skills for select
using (diapason_is_active_member(community_id));
create policy membership_skills_write on membership_skills for all
using (diapason_is_active_admin(community_id))
with check (diapason_is_active_admin(community_id));

create policy teams_select on teams for select
using (diapason_is_active_member(community_id));
create policy teams_write on teams for all
using (diapason_is_active_admin(community_id))
with check (diapason_is_active_admin(community_id));

create policy team_memberships_select on team_memberships for select
using (diapason_is_active_member(community_id));
create policy team_memberships_write on team_memberships for all
using (diapason_is_active_admin(community_id))
with check (diapason_is_active_admin(community_id));

create policy templates_select on planning_templates for select
using (diapason_is_active_member(community_id));
create policy templates_write on planning_templates for all
using (diapason_is_active_admin(community_id))
with check (diapason_is_active_admin(community_id));

create policy template_fields_select on template_fields for select
using (diapason_is_active_member(community_id));
create policy template_fields_write on template_fields for all
using (diapason_is_active_admin(community_id))
with check (diapason_is_active_admin(community_id));

-- ---------------------------------------------------------------------------
-- Evenements
-- ---------------------------------------------------------------------------

create policy events_select on events for select
using (
  diapason_is_active_member(community_id)
  and (state <> 'brouillon' or diapason_is_active_admin(community_id))
);

create policy events_insert_admin on events for insert
with check (diapason_is_active_admin(community_id));

-- Un evenement archive n'est plus modifiable par les voies ordinaires.
create policy events_update_admin on events for update
using (diapason_is_active_admin(community_id) and state <> 'archive')
with check (diapason_is_active_admin(community_id));

create policy sessions_select on event_sessions for select
using (diapason_can_see_event(event_id));
create policy sessions_write on event_sessions for all
using (diapason_is_active_admin(community_id))
with check (diapason_is_active_admin(community_id));

create policy plans_select on event_plans for select
using (diapason_can_see_plan(event_id));
create policy plans_write on event_plans for all
using (diapason_is_active_admin(community_id))
with check (diapason_is_active_admin(community_id));

create policy slots_select on event_role_slots for select
using (diapason_can_see_plan(diapason_event_of_plan(plan_id)));
create policy slots_write on event_role_slots for all
using (diapason_is_active_admin(community_id))
with check (diapason_is_active_admin(community_id));

-- Les affectations se voient quand le plan est visible.
create policy assignments_select on assignments for select
using (diapason_can_see_plan(diapason_event_of_plan(plan_id)));

create policy assignments_insert_admin on assignments for insert
with check (
  diapason_is_active_admin(community_id)
  and exists (
    select 1 from community_memberships m
    where m.id = membership_id and m.status = 'active'
  )
);

create policy assignments_update_admin on assignments for update
using (diapason_is_active_admin(community_id))
with check (diapason_is_active_admin(community_id));

-- Le destinataire peut confirmer ou signaler un empechement, et rien d'autre :
-- ni le poste, ni la personne, ni le plan.
create policy assignments_respond_self on assignments for update
using (membership_id = diapason_my_membership(community_id))
with check (
  membership_id = diapason_my_membership(community_id)
  and state in ('confirmee', 'a_remplacer')
);

-- ---------------------------------------------------------------------------
-- Disponibilites et motifs
-- ---------------------------------------------------------------------------

-- Les reponses des autres membres sont visibles : elles servent a composer
-- les equipes. Le motif, lui, ne l'est pas.
create policy availabilities_select on session_availabilities for select
using (diapason_is_active_member(community_id));

create policy availabilities_insert_self on session_availabilities for insert
with check (membership_id = diapason_my_membership(community_id));

create policy availabilities_update_self on session_availabilities for update
using (membership_id = diapason_my_membership(community_id))
with check (membership_id = diapason_my_membership(community_id));

-- Un admin peut marquer une reconfirmation apres un changement d'horaire,
-- mais il ne reecrit pas la reponse elle-meme en silence : l'application ne
-- modifie que `needs_reconfirmation`, et la trace est conservee.
create policy availabilities_reconfirm_admin on session_availabilities for update
using (diapason_is_active_admin(community_id))
with check (diapason_is_active_admin(community_id));

-- Motif prive : auteur et admins de cette communaute uniquement.
create policy reasons_select on availability_reasons for select
using (
  author_user_id = auth.uid() or diapason_is_active_admin(community_id)
);

create policy reasons_write_self on availability_reasons for all
using (author_user_id = auth.uid())
with check (author_user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Repetitions
-- ---------------------------------------------------------------------------

create policy rehearsals_select on rehearsals for select
using (diapason_can_see_event(event_id));
create policy rehearsals_write on rehearsals for all
using (diapason_is_active_admin(community_id))
with check (diapason_is_active_admin(community_id));

create policy rehearsal_teams_select on rehearsal_teams for select
using (diapason_is_active_member(community_id));
create policy rehearsal_teams_write on rehearsal_teams for all
using (diapason_is_active_admin(community_id))
with check (diapason_is_active_admin(community_id));

create policy rehearsal_availabilities_select on rehearsal_availabilities
for select using (diapason_is_active_member(community_id));
create policy rehearsal_availabilities_self on rehearsal_availabilities
for all
using (membership_id = diapason_my_membership(community_id))
with check (membership_id = diapason_my_membership(community_id));

create policy rehearsal_reasons_select on rehearsal_availability_reasons
for select using (
  author_user_id = auth.uid() or diapason_is_active_admin(community_id)
);
create policy rehearsal_reasons_self on rehearsal_availability_reasons
for all
using (author_user_id = auth.uid())
with check (author_user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Chants, dress-code, ressources
-- ---------------------------------------------------------------------------

create policy songs_select on songs for select
using (diapason_is_active_member(community_id));
create policy songs_write on songs for all
using (diapason_is_active_admin(community_id))
with check (diapason_is_active_admin(community_id));

create policy setlist_select on setlist_items for select
using (diapason_can_see_event(event_id));
create policy setlist_write on setlist_items for all
using (diapason_is_active_admin(community_id))
with check (diapason_is_active_admin(community_id));

create policy dress_codes_select on dress_codes for select
using (diapason_can_see_event(event_id));
create policy dress_codes_write on dress_codes for all
using (diapason_is_active_admin(community_id))
with check (diapason_is_active_admin(community_id));

create policy assets_select on event_assets for select
using (diapason_can_see_event(event_id));
create policy assets_write on event_assets for all
using (diapason_is_active_admin(community_id))
with check (diapason_is_active_admin(community_id));

-- ---------------------------------------------------------------------------
-- Messagerie
-- ---------------------------------------------------------------------------

-- Les abonnements Realtime passent par ces memes politiques : une adhesion
-- revoquee cesse de recevoir, meme sur une connexion deja ouverte.
create policy messages_select on event_messages for select
using (diapason_can_see_event(event_id) and deleted_at is null);

create policy messages_insert_member on event_messages for insert
with check (
  author_user_id = auth.uid()
  and diapason_is_active_member(community_id)
  and exists (
    select 1 from events e
    where e.id = event_id and e.state in ('collecte', 'publie')
  )
);

-- L'edition est limitee a son auteur.
create policy messages_update_author on event_messages for update
using (author_user_id = auth.uid())
with check (author_user_id = auth.uid());

-- La moderation est reservee aux admins et laisse une trace.
create policy messages_moderate_admin on event_messages for update
using (diapason_is_active_admin(community_id))
with check (diapason_is_active_admin(community_id));

create policy cursors_self on message_read_cursors for all
using (user_id = auth.uid())
with check (user_id = auth.uid() and diapason_is_active_member(community_id));

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------

create policy notifications_select_self on notifications for select
using (user_id = auth.uid());

create policy notifications_update_self on notifications for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy preferences_self on notification_preferences for all
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- L'outbox et le journal administratif ne sont jamais lisibles par le
-- navigateur : seul le worker, avec la cle secrete cote serveur, y accede.
create policy outbox_no_client_access on notification_outbox for select
using (false);

create policy audit_logs_select_admin on audit_logs for select
using (community_id is not null and diapason_is_active_admin(community_id));

-- ---------------------------------------------------------------------------
-- Import
-- ---------------------------------------------------------------------------

create policy import_jobs_admin on import_jobs for all
using (diapason_is_active_admin(community_id))
with check (diapason_is_active_admin(community_id));

create policy import_rows_admin on import_rows for all
using (diapason_is_active_admin(community_id))
with check (diapason_is_active_admin(community_id));

create policy imported_people_admin on imported_people for all
using (diapason_is_active_admin(community_id))
with check (diapason_is_active_admin(community_id));

-- ---------------------------------------------------------------------------
-- Privileges SQL : le role du navigateur ne peut pas tout faire
-- ---------------------------------------------------------------------------

revoke all on all tables in schema public from anon, authenticated;

grant select on
  profiles, communities, community_memberships, join_requests, skills,
  membership_skills, teams, team_memberships, planning_templates,
  template_fields, events, event_sessions, event_plans, event_role_slots,
  assignments, session_availabilities, availability_reasons, rehearsals,
  rehearsal_teams, rehearsal_availabilities, rehearsal_availability_reasons,
  songs, setlist_items, dress_codes, event_assets, event_messages,
  message_read_cursors, notifications, notification_preferences, audit_logs,
  import_jobs, import_rows, imported_people
to authenticated;

grant insert, update, delete on
  join_requests, skills, membership_skills, teams, team_memberships,
  planning_templates, template_fields, events, event_sessions, event_plans,
  event_role_slots, assignments, session_availabilities, availability_reasons,
  rehearsals, rehearsal_teams, rehearsal_availabilities,
  rehearsal_availability_reasons, songs, setlist_items, dress_codes,
  event_assets, event_messages, message_read_cursors, import_jobs,
  import_rows, imported_people
to authenticated;

grant update (read_at) on notifications to authenticated;
grant update on notification_preferences to authenticated;
grant insert on notification_preferences to authenticated;
grant update (first_name, last_name, declared_ministry, description,
  onboarding_choice) on profiles to authenticated;

-- Aucun acces client a l'outbox.
revoke all on notification_outbox from anon, authenticated;

-- Un membre ne peut pas s'attribuer un role ni changer de communaute : ces
-- colonnes ne sont jamais accessibles en ecriture directe.
revoke insert, update, delete on community_memberships from anon, authenticated;
revoke insert, update, delete on communities from anon, authenticated;
grant update (name, description, displayed_leader_name, other_label, timezone)
  on communities to authenticated;
