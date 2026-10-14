# Modele de donnees

Source de verite du schema : `supabase/migrations/0001_schema.sql`. Les noms
de colonnes y sont en `snake_case` ; le code TypeScript utilise `camelCase` et
l'adaptateur Supabase fait la conversion.

## Diagramme relationnel

```
profiles ──┬─< community_memberships >─┬── communities
           │         │                 ├── teams ──< team_memberships
           │         │                 ├── skills ──< membership_skills
           │         │                 └── planning_templates ──< template_fields
           ├─< join_requests >─────────┘
           ├─< notification_preferences
           ├─< notifications
           └─< message_read_cursors

communities ──< events ──┬──< event_sessions ──┬──< event_plans ──┬──< event_role_slots
                         │                     │        │          └──< assignments
                         │                     │        └── teams          │
                         │                     ├──< session_availabilities ─┘
                         │                     │        └──< availability_reasons  (prive)
                         │                     └──< setlist_items >── songs
                         ├──< rehearsals ──┬──< rehearsal_teams >── teams
                         │                 └──< rehearsal_availabilities
                         │                        └──< rehearsal_availability_reasons (prive)
                         ├──< dress_codes ──< event_assets
                         └──< event_messages

communities ──< import_jobs ──┬──< import_rows
                              └──< imported_people >·· community_memberships
                                   (lien optionnel, decide par un admin)

notification_outbox   (serveur uniquement)
audit_logs            (admins de la communaute uniquement)
```

`>──` indique une cle etrangere ; `··` un rapprochement facultatif.

## Dictionnaire des donnees

### Comptes

**`profiles`** — profil partageable, lie a `auth.users`.

| Colonne | Type | Notes |
| --- | --- | --- |
| `id` | uuid | = `auth.users.id` |
| `email` | text unique | Identifiant de connexion |
| `first_name`, `last_name` | text | Non vides |
| `declared_ministry` | text | **Information de profil. N'accorde aucune adhesion.** |
| `description` | text | Facultatif |
| `onboarding_choice` | enum | `responsable` ou `membre`. Oriente l'accueil, **jamais un droit** |
| `email_verified_at` | timestamptz | Requis pour creer une communaute |

Les identifiants secrets ne sont pas dans cette table. Avec Supabase, Auth les
detient. L'adaptateur de demonstration a sa propre table `account_secrets`
(scrypt + sel), sans equivalent en base.

### Communautes et adhesions

**`communities`**

| Colonne | Notes |
| --- | --- |
| `slug` | Unique, derive du nom |
| `type` | `MLA`, `ACCUEIL`, `SONORISATION`, `INTEGRATION`, `AUTRE` |
| `other_label` | Contrainte : non nul **seulement** si `type = 'AUTRE'` |
| `displayed_leader_name` | Nom d'affichage. **N'accorde aucune permission a un autre compte** |
| `timezone` | Fuseau IANA, `Europe/Paris` par defaut |

**`community_memberships`** — la source de verite des permissions.

| Colonne | Notes |
| --- | --- |
| `role` | `admin` ou `membre`, propre a **cette** communaute |
| `status` | `active` ou `revoked` |
| `unique (community_id, user_id)` | Une seule adhesion par personne et par communaute |

**`join_requests`** — index unique partiel : **une seule demande en attente**
par personne et par communaute, meme en cas de double soumission.

### Modeles

**`planning_templates`** — index unique sur `community_id` : un seul modele
actif. `version` s'incremente a chaque modification.

**`template_fields`**

| Colonne | Notes |
| --- | --- |
| `kind` | `texte`, `texte_long`, `lieu`, `creneau_horaire`, `dress_code`, `repetition_lieu`, `repetition_horaire`, `poste` |
| `assignable` | Contrainte : vrai **si et seulement si** `kind = 'poste'` |
| `min_required` | `>= 0`. Zero = poste facultatif |
| `multiple` | Plusieurs personnes sur le poste |
| `allows_detail` | Une precision est attendue (pupitre tenu, groupe accompagne) |
| `archived_at` | Archive au lieu d'etre supprime quand il est utilise dans l'historique |

### Evenements

**`events`**

| Colonne | Notes |
| --- | --- |
| `state` | `brouillon`, `collecte`, `publie`, `annule`, `archive` |
| `version` | **Verrou optimiste.** Toute ecriture compare cette valeur |
| `published_version` | Numero de publication ; entre dans les cles d'idempotence |
| `response_deadline` | Limite de reponse, facultative |

**`event_sessions`** — le creneau, pas la journee.

| Colonne | Notes |
| --- | --- |
| `ordinal` | Rang dans la journee : permet de lire « Cultes 1 & 2 » |
| `starts_at`, `ends_at` | Instants UTC. Contrainte `ends_at > starts_at` |
| `schedule_provisional` | Horaire a definir (import) : **bloque la publication** |

**`event_plans`** — `unique (session_id, team_id)` : un seul plan par equipe
et par creneau.

**`event_role_slots`** — postes copies du modele dans le plan.

| Colonne | Notes |
| --- | --- |
| `template_field_id` | Identifiant stable du champ d'origine |
| `label`, `min_required`, `multiple`, `allows_detail` | **Instantane** au moment de la copie |
| `enabled` | Poste volontairement non utilise pour cet evenement |

Renommer le modele plus tard ne change ni ce libelle ni les affectations.

**`assignments`**

| Colonne | Notes |
| --- | --- |
| `state` | `a_confirmer`, `confirmee`, `a_remplacer`, `retiree` |
| `detail` | Precision libre, ex. « alto » |
| `exceptions` | jsonb : type, motif administratif, auteur, horodatage |
| `member_note` | Note laissee par le destinataire |

Index unique partiel `(slot_id, membership_id) where state <> 'retiree'` :
**pas de double affectation active** de la meme personne au meme poste. Une
affectation retiree reste en base pour l'historique.

### Disponibilites

**`session_availabilities`** — `unique (session_id, membership_id)`.

L'**absence de ligne** signifie « a renseigner ». Elle n'est jamais convertie
en disponibilite ni en indisponibilite.

`needs_reconfirmation` marque une reponse rendue douteuse par un changement
d'horaire, sans l'effacer.

**`availability_reasons`** — **ressource separee**, une ligne par reponse.
Cette separation existe pour que la confidentialite soit imposee par sa propre
politique RLS, et pas seulement par l'interface.

### Repetitions

`rehearsals` porte des instants complets : une repetition de 22 h a 00 h 30 a
une date de fin au lendemain. `rehearsal_availabilities` est distincte des
disponibilites de creneau : etre disponible le dimanche ne dit rien du
vendredi.

### Chants, dress-code

`songs` est le repertoire de la communaute ; `setlist_items` la liste ordonnee
**par creneau**. Contrainte : un element porte soit un `song_id`, soit un
`free_title` non vide.

`dress_codes` : index uniques partiels garantissant une consigne commune
(`team_id is null`) et au plus une variante par equipe.

`event_assets` : `size_bytes <= 5 Mo`, `mime_type` restreint aux images, et
`alt` non vide — verifie en base, pas seulement dans le formulaire.

### Messagerie

`event_messages` : `body` entre 1 et 4000 caracteres, index unique partiel
pour **une seule annonce epinglee** par evenement. `moderated_by` et
`moderation_note` conservent la trace d'une moderation.

`message_read_cursors` : position de lecture, `unique (event_id, user_id)`.

### Notifications

`notification_outbox` : `idempotency_key` **unique**. Deux reprises de la meme
notification logique ne produisent qu'une tache. Etats : `enregistre`,
`pris_en_charge`, `livre`, `echec`, `abandonne`.

`notification_preferences` : `reminder_offsets_hours` vaut `{48,24}` par
defaut.

### Import

`import_jobs`, `import_rows`, `imported_people` forment une zone de staging.
Chaque ligne conserve `sheet` et `cell` : la provenance exacte reste
verifiable. `imported_people.linked_membership_id` n'est rempli que par une
decision d'admin.

## Coherence entre communautes

Toutes les tables filles portent `community_id` et utilisent des **cles
etrangeres composites** vers `(id, community_id)` du parent :

```sql
foreign key (session_id, community_id)
  references event_sessions (id, community_id)
```

Un poste ne peut donc pas appartenir au plan d'une autre communaute, ni une
affectation pointer vers l'adhesion d'une autre communaute. La base refuse ces
liens, independamment du code applicatif. L'adaptateur de demonstration
reproduit ces controles dans `assertCommunityCoherence`.

## Contraintes minimales exigees

| Contrainte | Mise en oeuvre |
| --- | --- |
| Adhesion unique utilisateur / communaute | `unique (community_id, user_id)` |
| Une seule demande en attente | Index unique partiel sur `status = 'en_attente'` |
| Disponibilite unique membre / creneau | `unique (session_id, membership_id)` |
| Un plan par equipe et creneau | `unique (session_id, team_id)` |
| Pas de double affectation active | Index unique partiel sur `state <> 'retiree'` |
| Fin apres debut | `check (ends_at > starts_at)` sur creneaux et repetitions |
| Effectif minimum positif ou nul | `check (min_required >= 0)` |

## Index

Recherches par communaute (`events`, `community_memberships`), par date
(`event_sessions (community_id, starts_at)`), par evenement (`event_plans`,
`event_role_slots`), par destinataire (`notifications (user_id, created_at
desc)`, index partiel sur les non lues), messages recents
(`event_messages (event_id, created_at desc)`) et taches echues
(`notification_outbox (state, scheduled_for)`).

Les annuaires et les conversations sont pagines : la messagerie renvoie des
pages de 30 messages avec un curseur sur `created_at`.

## Concurrence

Les plannings utilisent un **verrou optimiste** : `events.version`. Toute
ecriture passe la version attendue ; si elle ne correspond plus, l'operation
est refusee avec un message explicite au lieu d'ecraser le travail d'un autre
admin. Les operations critiques verrouillent la ligne concernee
(`select ... for update`) avant de reverifier leurs invariants, ce qui
serialise deux retrogradations simultanees du dernier admin.
