# Autorisations et confidentialite

## Principe

Les permissions viennent des **adhesions lues en base**. Jamais d'un role
envoye par le navigateur, jamais d'une metadonnee de profil que son
proprietaire peut modifier.

Trois consequences concretes :

- Le **ministere declare** a l'inscription est une information de profil. Il
  n'accorde aucune adhesion et aucun droit.
- Le **choix d'accueil** (« responsable » ou « membre ») oriente l'interface.
  Il ne cree aucun role. Un responsable n'a aucun acces aux donnees privees
  d'une communaute qu'il n'a pas rejointe. Le modifier dans le profil ne
  change aucun role existant.
- Le **nom du responsable** saisi a la creation d'une communaute est un nom
  d'affichage. Ecrire le nom de quelqu'un ne lui donne rien. Pour qu'une autre
  personne devienne admin, il faut son compte verifie et la gestion des
  membres.

Il n'existe **aucun admin global**. Le role est propre a chaque communaute :
la meme personne peut etre admin ici et membre ailleurs.

## Trois niveaux de controle

| Niveau | Role | Portee |
| --- | --- | --- |
| Interface | Confort : ne pas montrer des boutons inutilisables | Aucune garantie |
| Services (`src/server/services`) | **Decision** : session, adhesion, role, communaute de la ressource | Les deux adaptateurs |
| RLS PostgreSQL | **Defense en profondeur** : meme un appel direct a la base est filtre | Adaptateur Supabase |

Toute ecriture passe par un service. Aucune route ne modifie la base
directement. Les controles d'exception, d'adhesion active et de conflit sont
refaits cote serveur au moment de l'ecriture, sur l'etat frais, meme s'ils ont
deja ete faits a l'affichage.

## Matrice des droits

| Action | Sans adhesion | Demande en attente | Membre actif | Admin de cette communaute |
| --- | --- | --- | --- | --- |
| Voir la fiche publique (nom, type, description, responsable affiche) | Oui | Oui | Oui | Oui |
| Voir sa propre demande | — | Oui | — | Oui |
| Voir les evenements ouverts et les plannings publies | Non | Non | Oui | Oui |
| Voir un brouillon | Non | Non | Non | Oui |
| Voir les affectations pendant la collecte | Non | Non | **Non** | Oui |
| Modifier sa disponibilite et son motif | Non | Non | Oui | Oui, pour sa propre reponse |
| Repondre a une affectation recue | Non | Non | Oui | Oui |
| Creer, modifier, publier, annuler un evenement | Non | Non | **Non** | Oui |
| Affecter des personnes, modifier les modeles | Non | Non | **Non** | Oui |
| Accepter les adhesions, attribuer les roles | Non | Non | **Non** | Oui |
| Ecrire dans la discussion d'un evenement accessible | Non | Non | Oui | Oui |
| Voir les motifs prives des autres membres | Non | Non | **Non** | Oui |
| Importer le classeur | Non | Non | **Non** | Oui |
| Lire le journal administratif | Non | Non | Non | Oui |

Une personne **en attente** n'accede qu'a la fiche publique et a sa propre
demande : ni evenement, ni discussion, ni motif. Le catalogue ne contient que
ce qui sert a choisir une communaute ; les plannings, les noms d'equipes, les
echanges et les motifs restent prives.

## Visibilite selon l'etat de l'evenement

| Etat | Membre actif | Admin |
| --- | --- | --- |
| Brouillon | Invisible | Visible et modifiable |
| Collecte | Voit l'evenement et repond. **Les affectations en preparation restent cachees** | Tout |
| Publie | Voit le planning complet ; reponses et confirmations encore possibles | Tout |
| Annule | Voit l'evenement ; discussion en lecture seule | Pas de nouvelle affectation |
| Archive | Lecture seule | Lecture seule ; modifier demande une action explicite |

## Ce qu'un membre ne peut pas faire sur une affectation

Le destinataire peut **confirmer** ou **signaler un empechement**. Il ne peut
ni changer le poste, ni le nom d'une autre personne, ni le plan. La politique
RLS le dit explicitement :

```sql
create policy assignments_respond_self on assignments for update
using (membership_id = diapason_my_membership(community_id))
with check (
  membership_id = diapason_my_membership(community_id)
  and state in ('confirmee', 'a_remplacer')
);
```

## Motifs prives

Un motif d'indisponibilite est lisible par **son auteur et les admins de la
communaute concernee**, et par personne d'autre.

La garantie ne repose pas sur l'interface :

1. Les motifs vivent dans une **table separee** des reponses visibles aux
   autres (`availability_reasons`).
2. Leur politique RLS est propre :
   `author_user_id = auth.uid() or diapason_is_active_admin(community_id)`.
3. Les projections de lecture refont la verification cote serveur
   (`canReadReason`) : un membre qui appelle le service recoit `motif: null`.
4. Les exports communs (CSV, impression, ICS) **excluent** les motifs.
5. Les notifications et les emails ne les contiennent jamais. Une fonction du
   domaine, `assertNoPrivateReason`, est la pour verifier ce point en test.

Verifie par : `tests/integration/planning.test.ts` (lecture via le service,
par un autre membre, par l'auteur, par un admin) et `tests/e2e/parcours.spec.ts`
(au navigateur).

## Operations atomiques

Cinq operations ne sont pas de simples mises a jour de colonnes. Elles
portent des invariants qui doivent tenir face a des requetes concurrentes, et
sont donc des fonctions dediees — SQL `security definer` cote Supabase, code
sous verrou cote demonstration.

| Operation | Invariant |
| --- | --- |
| `create_community_with_admin` | Communaute, adhesion admin du createur et installation du modele sont **atomiques**. Email verifie requis. Le modele est installe **une seule fois** |
| `accept_join_request` | La demande est verrouillee : deux admins ne la traitent pas deux fois. L'acceptation cree ou reactive une adhesion avec le role **membre** |
| `change_membership_role` | **Au moins un admin actif** doit rester. La ligne est verrouillee, ce qui serialise deux retrogradations simultanees |
| `revoke_membership` | Meme protection du dernier admin. Les affectations futures passent a « a remplacer », jamais effacees |
| `publish_event` | Verrou de version, controles bloquants (aucun creneau, horaire provisoire, aucun plan), confirmation explicite si alertes |

Cote Supabase, l'insertion directe dans `communities` et
`community_memberships` est **revoquee** pour le role du navigateur : ces
tables ne se modifient que par ces fonctions.

## Affectation par exception

Un admin peut affecter tout membre actif, y compris sans reponse, indisponible,
hors competence declaree, ou en situation de chevauchement. Jamais en silence :

1. L'alerte est affichee, ecrite, et detaillee.
2. L'admin doit cocher une confirmation d'exception.
3. Pour une personne **sans reponse ou indisponible**, un **motif
   administratif est obligatoire** — le service refuse sinon.
4. L'exception est stockee sur l'affectation (type, motif, auteur, date) et
   tracee dans le journal.
5. **La disponibilite declaree par le membre n'est pas modifiee.**
6. La personne est informee et doit confirmer.

Les competences aident au choix mais ne constituent pas une preuve de
qualification : affecter hors competence est permis, avec un avertissement
explicite.

## Conflits entre ministeres

Un chevauchement avec un engagement d'une **autre** communaute est signale,
mais rien n'en est revele : ni le ministere, ni l'evenement, ni le lieu. Le
domaine renvoie exactement :

```ts
{ visibility: "masque", message: "Conflit sur ce creneau" }
```

Deux creneaux successifs dans la journee ne sont pas un conflit : seul un
recouvrement reel en est un.

## Cloisonnement des profils

Un profil n'est lisible que par son proprietaire et par les personnes qui
partagent une communaute active avec lui. On ne decouvre donc pas les autres
ministeres d'un utilisateur.

```sql
create policy profiles_select on profiles for select
using (
  id = auth.uid()
  or exists (
    select 1 from community_memberships mine
    join community_memberships theirs on theirs.community_id = mine.community_id
    where mine.user_id = auth.uid() and mine.status = 'active'
      and theirs.user_id = profiles.id and theirs.status = 'active'
  )
);
```

## Privileges SQL

Au-dela de RLS, les privileges sont restreints :

- `notification_outbox` : **aucun acces** depuis le navigateur. Seul le
  worker, avec la cle secrete cote serveur, la lit.
- `profiles` : seules les colonnes de profil sont modifiables par leur
  proprietaire.
- `notifications` : seule `read_at` est modifiable.
- `communities` : seules les colonnes descriptives, et uniquement par un admin.
- `community_memberships` : aucune ecriture directe.

Un membre ne peut donc pas s'attribuer un role, changer de communaute, ni
changer le proprietaire d'une reponse par une requete forgee.

## Cles et secrets

| Cle | Emplacement | Usage |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Navigateur | Avec la session de l'utilisateur, soumise a RLS |
| `SUPABASE_SECRET_KEY` | **Serveur uniquement** | Worker de notifications et taches d'administration |
| `DIAPASON_SESSION_SECRET` | Serveur uniquement | Signature du cookie de l'adaptateur de demonstration |

Aucune cle secrete n'est exposee au navigateur. Les pages authentifiees ne
sont pas mises en cache partage : les reponses de donnees personnelles portent
`Cache-Control: no-store, private`, et la lecture de session est memorisee par
requete, jamais entre utilisateurs.

## Temps reel

Les abonnements Realtime passent par les memes politiques RLS que les
lectures. Une adhesion revoquee cesse donc de recevoir du contenu, y compris
sur une connexion deja ouverte : l'autorisation n'est pas calculee une fois
pour toutes a l'ouverture.

Le worker de notifications **revalide l'acces du destinataire avant chaque
envoi**. Une personne retiree entre l'enregistrement de la tache et son envoi
est exclue, et la tache passe a « abandonne ».

## Journal et recuperation

- `audit_logs` conserve les operations d'administration (creation,
  adhesions, roles, publications, exceptions, import). Lisible par les admins
  de la communaute concernee.
- Les tentatives de connexion sont limitees : verrouillage temporaire de
  15 minutes apres 8 echecs.
- Recuperation de compte par jeton de reinitialisation a duree limitee
  (1 heure).

## Ce qui n'est pas verifie

- Les politiques RLS et les fonctions SQL sont **ecrites mais non executees** :
  aucun projet Supabase n'etait disponible. Le chemin verifie par les tests
  est l'adaptateur de demonstration, ou les memes regles sont appliquees par
  les services et reproduites par les contraintes du magasin.
- Aucune revendication de conformite legale n'est faite. La politique
  d'archivage, de sauvegarde et de restauration reste a definir avec le
  ministere avant un usage reel.
