-- ---------------------------------------------------------------------------
-- Diapason - operations atomiques
--
-- Ces fonctions ne sont pas des mises a jour libres de colonnes : elles
-- portent les invariants qui doivent tenir meme en cas de requetes
-- concurrentes. L'adaptateur de demonstration implemente les memes regles en
-- TypeScript, sous verrou.
-- ---------------------------------------------------------------------------

-- Postes installes a la creation d'une communaute. Les libelles sont
-- renommables ensuite sans changer leur type de donnee.
create or replace function diapason_seed_template(
  target_community uuid,
  community_kind community_type
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_template uuid;
  position integer := 0;
  seed record;
begin
  insert into planning_templates (community_id, name, version)
  values (
    target_community,
    case when community_kind = 'MLA' then 'Modele MLA'
         else 'Modele ' || community_kind::text end,
    1
  )
  returning id into new_template;

  for seed in
    select *
    from (
      values
        ('texte'::template_field_kind, 'Nom de l''evenement', 0, true),
        ('creneau_horaire', 'Heure de l''evenement', 0, true),
        ('lieu', 'Lieu de l''evenement', 0, false),
        ('texte_long', 'Description', 0, false)
    ) as general(kind, label, min_required, required)
  loop
    position := position + 1;
    insert into template_fields (
      community_id, template_id, kind, label, "order", assignable,
      min_required, multiple, allows_detail, required
    )
    values (
      target_community, new_template, seed.kind, seed.label, position, false,
      0, false, false, seed.required
    );
  end loop;

  if community_kind = 'MLA' then
    for seed in
      select *
      from (
        values
          ('LEAD', 1, false),
          ('Tenor', 1, false),
          ('Alto', 1, false),
          ('Soprano', 1, false),
          ('Pupitre double', 0, true),
          ('Piano', 1, false),
          ('Batterie', 1, false),
          ('Basse', 0, false),
          ('Guitare', 0, false)
      ) as poste(label, min_required, allows_detail)
    loop
      position := position + 1;
      insert into template_fields (
        community_id, template_id, kind, label, "order", assignable,
        min_required, multiple, allows_detail, required
      )
      values (
        target_community, new_template, 'poste', poste.label, position, true,
        poste.min_required, true, poste.allows_detail, false
      );
    end loop;

    position := position + 1;
    insert into template_fields (
      community_id, template_id, kind, label, "order", assignable,
      min_required, multiple, allows_detail, required
    )
    values (
      target_community, new_template, 'dress_code', 'Dress-code', position,
      false, 0, false, false
    );

    for seed in
      select *
      from (
        values
          ('Charge des paroles', false),
          ('Mass Choir', false),
          ('Danse / bannieres', false),
          ('Referent Planning', false),
          ('Referent dress-code', true)
      ) as poste(label, allows_detail)
    loop
      position := position + 1;
      insert into template_fields (
        community_id, template_id, kind, label, "order", assignable,
        min_required, multiple, allows_detail, required
      )
      values (
        target_community, new_template, 'poste', poste.label, position, true,
        0, true, poste.allows_detail, false
      );
    end loop;
  else
    -- Accueil, Sonorisation, Integration, Autre : Star 1 a Star 4, avec la
    -- possibilite d'ajouter Star 5 et suivants.
    for seed in
      select *
      from (
        values ('Star 1', 1), ('Star 2', 0), ('Star 3', 0), ('Star 4', 0),
               ('Referent Planning', 0)
      ) as poste(label, min_required)
    loop
      position := position + 1;
      insert into template_fields (
        community_id, template_id, kind, label, "order", assignable,
        min_required, multiple, allows_detail, required
      )
      values (
        target_community, new_template, 'poste', poste.label, position, true,
        poste.min_required, true, false, false
      );
    end loop;
  end if;

  -- Lieu et heure de repetition, pour tous les types.
  position := position + 1;
  insert into template_fields (
    community_id, template_id, kind, label, "order", assignable,
    min_required, multiple, allows_detail, required
  )
  values (
    target_community, new_template, 'repetition_lieu',
    'Lieu de la repetition', position, false, 0, false, false, false
  );

  position := position + 1;
  insert into template_fields (
    community_id, template_id, kind, label, "order", assignable,
    min_required, multiple, allows_detail, required
  )
  values (
    target_community, new_template, 'repetition_horaire',
    'Heure de la repetition', position, false, 0, false, false, false
  );

  return new_template;
end;
$$;

-- ---------------------------------------------------------------------------
-- Creation d'une communaute
-- ---------------------------------------------------------------------------

create or replace function create_community_with_admin(
  user_id uuid,
  name text,
  type text,
  other_label text,
  description text,
  displayed_leader_name text,
  timezone text
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  new_community uuid;
  new_membership uuid;
  new_template uuid;
  base_slug text;
  candidate text;
  suffix integer := 1;
  kind community_type := type::community_type;
begin
  -- L'appelant ne peut creer une communaute que pour lui-meme.
  if user_id is null or user_id <> auth.uid() then
    raise exception 'not_authorized: creation reservee a la session courante';
  end if;

  if not exists (
    select 1 from profiles p
    where p.id = user_id and p.email_verified_at is not null
  ) then
    raise exception 'email_not_verified: verifiez votre email avant de creer une communaute';
  end if;

  base_slug := regexp_replace(lower(unaccent_safe(name)), '[^a-z0-9]+', '-', 'g');
  base_slug := trim(both '-' from left(base_slug, 60));
  if base_slug = '' then base_slug := 'communaute'; end if;
  candidate := base_slug;
  while exists (select 1 from communities c where c.slug = candidate) loop
    suffix := suffix + 1;
    candidate := base_slug || '-' || suffix;
  end loop;

  insert into communities (
    slug, name, type, other_label, description, displayed_leader_name,
    created_by, timezone
  )
  values (
    candidate, name, kind,
    case when kind = 'AUTRE' then other_label else null end,
    coalesce(description, ''), coalesce(displayed_leader_name, ''),
    user_id, coalesce(timezone, 'Europe/Paris')
  )
  returning id into new_community;

  -- Le createur devient admin de cette communaute, et d'aucune autre.
  insert into community_memberships (community_id, user_id, role, status)
  values (new_community, user_id, 'admin', 'active')
  returning id into new_membership;

  new_template := diapason_seed_template(new_community, kind);

  -- Competences de depart. Les equipes, elles, se creent dans chaque
  -- evenement : une communaute n'en a pas d'avance.
  if kind = 'MLA' then
    insert into skills (community_id, label)
    select new_community, label
    from unnest(array[
      'LEAD', 'Tenor', 'Alto', 'Mezzo-soprano', 'Soprano',
      'Piano', 'Batterie', 'Basse', 'Guitare'
    ]) as label;
  else
    insert into skills (community_id, label)
    select new_community, label
    from unnest(array['Accueil', 'Orientation', 'Technique']) as label;
  end if;

  insert into notification_preferences (user_id)
  values (user_id)
  on conflict (user_id) do nothing;

  insert into audit_logs (community_id, actor_user_id, action, target_type, target_id, metadata)
  values (
    new_community, user_id, 'communaute.creee', 'community', new_community,
    json_build_object('type', kind, 'templateVersion', 1)::jsonb
  );

  return json_build_object(
    'community_id', new_community,
    'membership_id', new_membership,
    'template_id', new_template
  );
end;
$$;

-- Retire les accents sans dependre de l'extension unaccent.
create or replace function unaccent_safe(value text)
returns text
language sql
immutable
as $$
  select translate(
    value,
    'àâäáãåçéèêëíìîïñóòôöõúùûüýÿÀÂÄÁÃÅÇÉÈÊËÍÌÎÏÑÓÒÔÖÕÚÙÛÜÝ',
    'aaaaaaceeeeiiiinooooouuuuyyAAAAAACEEEEIIIINOOOOOUUUUY'
  );
$$;

-- ---------------------------------------------------------------------------
-- Acceptation d'une demande d'adhesion
-- ---------------------------------------------------------------------------

create or replace function accept_join_request(
  actor_user_id uuid,
  request_id uuid,
  note text
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  demande join_requests;
  existante community_memberships;
  new_membership uuid;
  nom_communaute text;
begin
  if actor_user_id is null or actor_user_id <> auth.uid() then
    raise exception 'not_authorized';
  end if;

  -- Verrouille la demande : deux admins ne la traitent pas deux fois.
  select * into demande from join_requests where id = request_id for update;
  if demande is null then
    raise exception 'join_request_missing: demande introuvable';
  end if;
  if demande.status <> 'en_attente' then
    raise exception 'join_request_not_pending: cette demande a deja ete traitee';
  end if;
  if not diapason_is_active_admin(demande.community_id) then
    raise exception 'not_community_admin: reserve aux admins de cette communaute';
  end if;

  select * into existante
  from community_memberships
  where community_id = demande.community_id and user_id = demande.user_id
  for update;

  if existante is null then
    insert into community_memberships (community_id, user_id, role, status)
    values (demande.community_id, demande.user_id, 'membre', 'active')
    returning id into new_membership;
  else
    update community_memberships
    set status = 'active',
        revoked_at = null,
        joined_at = now(),
        role = case when existante.role = 'admin' then 'admin' else 'membre' end
    where id = existante.id
    returning id into new_membership;
  end if;

  update join_requests
  set status = 'acceptee',
      decided_by = actor_user_id,
      decided_at = now(),
      decision_note = note
  where id = request_id;

  select c.name into nom_communaute from communities c where c.id = demande.community_id;

  insert into notifications (user_id, community_id, kind, title, body, href)
  values (
    demande.user_id, demande.community_id, 'adhesion_acceptee',
    'Demande d''adhesion acceptee',
    'Votre demande d''adhesion a « ' || coalesce(nom_communaute, 'la communaute') || ' » a ete acceptee.',
    '/c/' || demande.community_id || '/planning'
  );

  insert into notification_outbox (
    idempotency_key, kind, recipient_user_id, community_id, subject, body
  )
  values (
    encode(digest('adhesion_acceptee' || demande.user_id::text || request_id::text, 'sha256'), 'hex'),
    'adhesion_acceptee', demande.user_id, demande.community_id,
    'Demande d''adhesion acceptee',
    'Votre demande a ete acceptee.'
  )
  on conflict (idempotency_key) do nothing;

  insert into audit_logs (community_id, actor_user_id, action, target_type, target_id, metadata)
  values (
    demande.community_id, actor_user_id, 'adhesion.acceptee', 'join_request',
    request_id, json_build_object('userId', demande.user_id)::jsonb
  );

  return json_build_object('membership_id', new_membership);
end;
$$;

-- ---------------------------------------------------------------------------
-- Changement de role, avec protection du dernier admin
-- ---------------------------------------------------------------------------

create or replace function change_membership_role(
  actor_user_id uuid,
  membership_id uuid,
  role text
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  cible community_memberships;
  nouveau membership_role := role::membership_role;
  admins_restants integer;
begin
  if actor_user_id is null or actor_user_id <> auth.uid() then
    raise exception 'not_authorized';
  end if;

  select * into cible from community_memberships where id = membership_id for update;
  if cible is null then
    raise exception 'membership_missing: adhesion introuvable';
  end if;
  if not diapason_is_active_admin(cible.community_id) then
    raise exception 'not_community_admin: reserve aux admins de cette communaute';
  end if;

  if cible.role = 'admin' and nouveau = 'membre' then
    -- Le verrou pris sur la ligne cible serialise deux retrogradations
    -- simultanees : la seconde voit l'etat deja a jour.
    select count(*) into admins_restants
    from community_memberships m
    where m.community_id = cible.community_id
      and m.status = 'active'
      and m.role = 'admin'
      and m.id <> cible.id;
    if admins_restants = 0 then
      raise exception 'last_admin_protected: cette communaute doit conserver au moins un admin actif';
    end if;
  end if;

  update community_memberships set role = nouveau where id = membership_id;

  insert into audit_logs (community_id, actor_user_id, action, target_type, target_id, metadata)
  values (
    cible.community_id, actor_user_id,
    case when nouveau = 'admin' then 'role.promu' else 'role.retrograde' end,
    'community_membership', membership_id,
    json_build_object('userId', cible.user_id, 'role', nouveau)::jsonb
  );

  return json_build_object('membership_id', membership_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Revocation d'une adhesion
-- ---------------------------------------------------------------------------

create or replace function revoke_membership(
  actor_user_id uuid,
  membership_id uuid
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  cible community_memberships;
  est_soi boolean;
  admins_restants integer;
  a_remplacer integer := 0;
begin
  if actor_user_id is null or actor_user_id <> auth.uid() then
    raise exception 'not_authorized';
  end if;

  select * into cible from community_memberships where id = membership_id for update;
  if cible is null then
    raise exception 'membership_missing: adhesion introuvable';
  end if;

  est_soi := cible.user_id = actor_user_id;
  if not est_soi and not diapason_is_active_admin(cible.community_id) then
    raise exception 'not_community_admin: reserve aux admins de cette communaute';
  end if;

  if cible.role = 'admin' then
    select count(*) into admins_restants
    from community_memberships m
    where m.community_id = cible.community_id
      and m.status = 'active'
      and m.role = 'admin'
      and m.id <> cible.id;
    if admins_restants = 0 then
      raise exception 'last_admin_protected: le dernier admin actif ne peut pas quitter la communaute';
    end if;
  end if;

  update community_memberships
  set status = 'revoked', revoked_at = now()
  where id = membership_id;

  -- Les affectations futures sont signalees a remplacer, jamais effacees.
  with futures as (
    update assignments a
    set state = 'a_remplacer', updated_at = now()
    where a.membership_id = membership_id
      and a.state <> 'retiree'
      and exists (
        select 1
        from event_plans p
        join events e on e.id = p.event_id
        -- Un plan rattache a tout l'evenement n'a pas de sous-evenement :
        -- c'est alors l'horaire de l'evenement qui dit s'il est a venir.
        left join event_sessions s on s.id = p.session_id
        where p.id = a.plan_id
          and coalesce(s.starts_at, e.starts_at) > now()
      )
    returning 1
  )
  select count(*) into a_remplacer from futures;

  if a_remplacer > 0 then
    insert into notifications (user_id, community_id, kind, title, body, href)
    select m.user_id, cible.community_id, 'affectation_a_remplacer',
           'Remplacement necessaire',
           'Un membre a quitte la communaute : ' || a_remplacer ||
             ' affectation(s) future(s) a remplacer.',
           '/c/' || cible.community_id || '/planning'
    from community_memberships m
    where m.community_id = cible.community_id
      and m.status = 'active'
      and m.role = 'admin';
  end if;

  insert into audit_logs (community_id, actor_user_id, action, target_type, target_id, metadata)
  values (
    cible.community_id, actor_user_id,
    case when est_soi then 'adhesion.quittee' else 'adhesion.revoquee' end,
    'community_membership', membership_id,
    json_build_object('userId', cible.user_id, 'assignmentsToReplace', a_remplacer)::jsonb
  );

  return json_build_object(
    'membership_id', membership_id,
    'assignments_to_replace', a_remplacer
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Publication d'un evenement
-- ---------------------------------------------------------------------------

create or replace function publish_event(
  actor_user_id uuid,
  event_id uuid,
  expected_version integer,
  accept_exceptions boolean
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  cible events;
  creneaux integer;
  occurrences integer;
  provisoires integer;
  equipes integer;
  equipes_sans_plan integer;
  postes_incomplets integer;
  non_confirmees integer;
  a_remplacer integer;
  membres_actifs integer;
  reponses integer;
  reponses_manquantes integer;
  nouvelle_version integer;
  nouvelle_publication integer;
begin
  if actor_user_id is null or actor_user_id <> auth.uid() then
    raise exception 'not_authorized';
  end if;

  select * into cible from events where id = event_id for update;
  if cible is null then
    raise exception 'event_missing: evenement introuvable';
  end if;
  if not diapason_is_active_admin(cible.community_id) then
    raise exception 'not_community_admin: reserve aux admins de cette communaute';
  end if;

  -- Verrou optimiste : deux admins ne publient pas la meme version.
  if cible.version <> expected_version then
    raise exception 'version_conflict: cet evenement a ete modifie entre-temps (version %)', cible.version;
  end if;
  if cible.state in ('annule', 'archive') then
    raise exception 'event_not_publishable: un evenement annule ou archive ne peut pas etre publie';
  end if;

  -- Les sous-evenements sont facultatifs. Un evenement qui n'en a aucun
  -- compte pour une occurrence : la sienne.
  select count(*) into creneaux from event_sessions where event_sessions.event_id = cible.id;
  occurrences := greatest(1, creneaux);

  select count(*) into provisoires
  from event_sessions s
  where s.event_id = cible.id and s.schedule_provisional;
  if creneaux = 0 and cible.schedule_provisional then
    provisoires := 1;
  end if;
  if provisoires > 0 then
    raise exception 'publication_blocked: horaire a definir sur % occurrence(s)', provisoires;
  end if;

  select count(*) into equipes from event_teams where event_teams.event_id = cible.id;
  if equipes = 0 then
    raise exception 'publication_blocked: aucune equipe creee dans cet evenement';
  end if;

  -- Une equipe sans rattachement ne sait pas quand elle sert.
  select count(*) into equipes_sans_plan
  from event_teams t
  where t.event_id = cible.id
    and not exists (select 1 from event_plans p where p.team_id = t.id);
  if equipes_sans_plan > 0 then
    raise exception 'publication_blocked: % equipe(s) sans rattachement', equipes_sans_plan;
  end if;

  -- Un poste desactive ou a minimum zero n'est jamais « incomplet ».
  select count(*) into postes_incomplets
  from event_role_slots slot
  join event_plans p on p.id = slot.plan_id
  where p.event_id = cible.id
    and slot.enabled
    and slot.min_required > (
      select count(*)
      from assignments a
      where a.slot_id = slot.id and a.state not in ('retiree', 'a_remplacer')
    );

  select count(*) into non_confirmees
  from assignments a
  join event_plans p on p.id = a.plan_id
  where p.event_id = cible.id and a.state = 'a_confirmer';

  select count(*) into a_remplacer
  from assignments a
  join event_plans p on p.id = a.plan_id
  where p.event_id = cible.id and a.state = 'a_remplacer';

  select count(*) into membres_actifs
  from community_memberships m
  where m.community_id = cible.community_id and m.status = 'active';

  select count(*) into reponses
  from availabilities av
  where av.event_id = cible.id
    and (av.session_id is null) = (creneaux = 0);

  reponses_manquantes := greatest(0, occurrences * membres_actifs - reponses);

  if not accept_exceptions and (
    postes_incomplets > 0 or non_confirmees > 0 or a_remplacer > 0
    or reponses_manquantes > 0
  ) then
    raise exception 'publication_needs_confirmation: la publication comporte des alertes, une confirmation explicite est requise';
  end if;

  nouvelle_version := cible.version + 1;
  nouvelle_publication := cible.published_version + 1;

  update events
  set state = 'publie',
      version = nouvelle_version,
      published_version = nouvelle_publication,
      published_at = coalesce(cible.published_at, now()),
      updated_at = now()
  where id = cible.id;

  -- Notification et tache d'email dans la meme transaction que la
  -- modification metier. La cle d'idempotence inclut le numero de
  -- publication : une reprise n'envoie pas deux fois le meme message.
  insert into notifications (user_id, community_id, event_id, kind, title, body, href)
  select m.user_id, cible.community_id, cible.id, 'planning_publie',
         'Planning publie',
         'Le planning de « ' || cible.title || ' » est publie.',
         '/c/' || cible.community_id || '/evenements/' || cible.id
  from community_memberships m
  where m.community_id = cible.community_id and m.status = 'active';

  insert into notification_outbox (
    idempotency_key, kind, recipient_user_id, community_id, event_id,
    subject, body
  )
  select
    encode(digest(
      'planning_publie' || m.user_id::text || cible.id::text ||
      nouvelle_publication::text, 'sha256'
    ), 'hex'),
    'planning_publie', m.user_id, cible.community_id, cible.id,
    'Planning publie',
    'Le planning de « ' || cible.title || ' » est publie.'
  from community_memberships m
  where m.community_id = cible.community_id and m.status = 'active'
  on conflict (idempotency_key) do nothing;

  insert into audit_logs (community_id, actor_user_id, action, target_type, target_id, metadata)
  values (
    cible.community_id, actor_user_id, 'evenement.publie', 'event', cible.id,
    json_build_object(
      'publishedVersion', nouvelle_publication,
      'postesIncomplets', postes_incomplets,
      'nonConfirmees', non_confirmees,
      'aRemplacer', a_remplacer,
      'reponsesManquantes', reponses_manquantes
    )::jsonb
  );

  return json_build_object(
    'event_id', cible.id,
    'version', nouvelle_version,
    'published_version', nouvelle_publication
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges d'execution
-- ---------------------------------------------------------------------------

revoke all on function create_community_with_admin from public, anon;
revoke all on function accept_join_request from public, anon;
revoke all on function change_membership_role from public, anon;
revoke all on function revoke_membership from public, anon;
revoke all on function publish_event from public, anon;

grant execute on function create_community_with_admin to authenticated;
grant execute on function accept_join_request to authenticated;
grant execute on function change_membership_role to authenticated;
grant execute on function revoke_membership to authenticated;
grant execute on function publish_event to authenticated;
