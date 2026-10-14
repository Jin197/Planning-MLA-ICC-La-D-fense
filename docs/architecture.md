# Architecture

Diapason est un **monolithe modulaire** Next.js. Il n'y a pas de
microservices : le perimetre ne le justifie pas, et la coherence des
autorisations est plus facile a garantir dans un seul processus.

## Vue d'ensemble

```
Navigateur
   |
   |  composants serveur (lecture) + actions serveur (ecriture)
   v
src/app/**            routes, formulaires, rendu
   |
   v
src/server/services/**   regles metier, autorisations, notifications
   |                      (aucune route n'ecrit en base directement)
   v
src/server/data/port.ts   contrat de donnees
   |                \
   |                 \__ src/server/data/demo/      magasin local, JSON
   |                 \__ src/server/data/supabase/  PostgreSQL + RLS
   v
src/domain/**         regles pures, sans dependance serveur
```

Deux regles structurent tout le reste :

1. **Le domaine ne connait ni la base, ni HTTP.** `src/domain` contient des
   fonctions pures : vocabulaire des disponibilites, matrice
   d'autorisations, cycles de vie, detection de conflits, modeles de
   planning, calcul des rappels, analyseurs du classeur. Elles sont
   testables sans serveur et sans base.
2. **Aucune page n'ecrit en base.** Les routes appellent des services, qui
   verifient la session, l'adhesion, le role et la communaute de la
   ressource avant toute ecriture.

## Couches

### `src/domain`

Regles pures. Aucun import de `node:*`, de Next ou d'un adaptateur.

| Fichier | Responsabilite |
| --- | --- |
| `types.ts` | Entites et unions d'etats |
| `permissions.ts` | Qui peut quoi, selon l'adhesion et l'etat de l'evenement |
| `availability.ts` | Vocabulaire du classeur, etats affiches, reconfirmation |
| `assignments.ts` | Machine a etats, doublons, exceptions, incompatibilites |
| `conflicts.ts` | Chevauchements, et masquage hors communaute consultee |
| `events.ts` | Cycle de vie, controles avant publication, duplication |
| `template.ts` | Modeles MLA et Star, copie dans un plan, apercu des changements |
| `notifications.ts` | Destinataires, idempotence, rappels |
| `import-parsing.ts` | Lecture des en-tetes, des cellules et rapprochement des noms |
| `songs.ts` | Sequences par defaut, validation des liens |

### `src/server/services`

Chaque service suit la meme forme :

```ts
export async function operation(communityId, input) {
  // 1. Session + adhesion + role, lus en base
  const ctx = await requireCommunityAction(communityId, "action.precise");
  // 2. Transaction
  return adapter.transaction(async (tx) => {
    // 3. Revalidation des invariants sur l'etat frais
    // 4. Ecriture
    // 5. Notification et journal dans la meme transaction
  });
}
```

Les echecs attendus (droits, conflit de version, validation) remontent comme
`Result` plutot que comme exception, pour que l'interface affiche un message
precis. Les echecs d'autorisation levent, parce qu'ils ne doivent jamais etre
silencieusement ignores.

### `src/server/data`

Un contrat unique, `DataAdapter`, implemente deux fois.

| | Demonstration | Supabase |
| --- | --- | --- |
| Stockage | Objet en memoire, instantane JSON dans `.data/` | PostgreSQL |
| Transactions | Verrou unique, copie de travail, annulation sur exception | Par instruction ; l'atomicite passe par `rpc` |
| Contraintes | Reproduites en TypeScript dans `store.ts` | Contraintes et index SQL |
| Autorisations | Services uniquement | Services **et** RLS |
| Authentification | Cookie signe HMAC, scrypt | Supabase Auth |

Les deux adaptateurs partagent les memes signatures, y compris les cinq
operations critiques exposees par `rpc` :

- `create_community_with_admin`
- `accept_join_request`
- `change_membership_role`
- `revoke_membership`
- `publish_event`

Ces operations ne sont pas des mises a jour de colonnes : elles portent des
invariants qui doivent tenir face a des requetes concurrentes (installation du
modele une seule fois, conservation d'au moins un admin actif, verrou de
version a la publication). Cote Supabase, ce sont des fonctions SQL
`security definer` ; cote demonstration, le meme code en TypeScript sous
verrou.

**Limite assumee** : sur l'API REST de Supabase, `transaction()` n'offre pas
l'atomicite multi-instructions. C'est documente dans l'adaptateur, et le code
metier critique passe par `rpc`.

## Pourquoi un adaptateur de demonstration

Le projet doit fonctionner sans cles externes. L'adaptateur local permet de
lancer l'application, d'executer les parcours et de montrer le produit sans
compte Supabase ni fournisseur d'email. Les donnees fictives et les comptes
reels ne se melangent jamais : un seul adaptateur est actif par deploiement,
choisi par `DIAPASON_DATA_ADAPTER`.

Ce n'est pas une base de production : un seul processus, pas de replication,
pas de sauvegarde automatique.

## Notifications

L'envoi suit une **outbox transactionnelle** :

1. L'operation metier, la notification dans l'application et la tache d'email
   sont ecrites dans la meme transaction. Si l'operation echoue, aucune
   notification ne subsiste.
2. Un worker (`npm run outbox`) lit les taches echues, **revalide l'acces du
   destinataire**, puis appelle le fournisseur.
3. Trois etats distincts sont suivis : `enregistre` (rien n'est parti),
   `pris_en_charge` (le fournisseur a accepte), `livre` (remise confirmee).
   S'y ajoutent `echec` et `abandonne`.

Chaque tache porte une cle d'idempotence derivee du type, du destinataire, de
la ressource et d'une revision. Une reprise n'envoie pas deux fois le meme
message logique ; une nouvelle publication, qui change la revision, en envoie
un nouveau.

Sans fournisseur configure, les taches restent `enregistre` et aucune
interface n'affiche « email envoye ».

## Temps

Tout instant est stocke en UTC, accompagne du fuseau IANA de la communaute
(`Europe/Paris` par defaut). L'affichage est recalcule a chaque rendu. Debut
et fin portent une date complete, ce qui rend correctes une repetition de 22 h
a 00 h 30 et les nuits de changement d'heure.

## Import

L'import est une zone de staging separee du metier : `import_jobs`,
`import_rows`, `imported_people`. L'analyse n'ecrit rien dans le planning.
L'ecriture definitive est une etape distincte, qui demande une confirmation,
et reste idempotente : relancer le meme import ne cree pas de doublon.

## Choix techniques

| Choix | Version | Raison |
| --- | --- | --- |
| Next.js App Router | 16.4 | Composants serveur et actions serveur : les regles restent sur le serveur |
| React | 19.3 | `useActionState`, `useFormStatus` : etats de formulaire sans bibliotheque |
| TypeScript strict | 5.9 | `noUncheckedIndexedAccess` compris |
| Tailwind CSS | 4.3 | Jetons de design en CSS, pas de fichier de configuration JS |
| Zod | 4.6 | Validation partagee (voir limites) |
| Supabase | 2.117 | PostgreSQL, Auth, Storage prive, Realtime |
| exceljs | 4.4 | Lecture du classeur, cellules fusionnees et images |
| Vitest | 5.0 | Tests de domaine et d'integration |
| Playwright | 1.64 | Parcours au navigateur |

## Etat des lots

| Lot | Etat |
| --- | --- |
| 1 — Socle utilisable | Implemente et verifie |
| 2 — Coordination | Implemente ; emails verifies jusqu'a l'etat « enregistre » |
| 3 — Continuite avec l'Excel | Implemente et verifie sur le classeur reel |
| 4 — Ameliorations | Non commence (recurrence, suggestions, PWA) |

## Limites connues

- L'adaptateur Supabase et les migrations sont ecrits mais **non executes** :
  aucun projet Supabase n'etait disponible. Le chemin verifie est
  l'adaptateur de demonstration.
- Le temps reel de la messagerie n'est pas branche : les messages sont
  persistes et relus a chaque rendu. Les politiques RLS necessaires aux
  abonnements sont ecrites.
- Zod est installe mais la validation des formulaires est actuellement faite
  a la main dans les actions serveur. Les deux approches coexistent sans
  conflit ; l'uniformisation reste a faire.
- L'envoi d'email n'a jamais ete exerce contre un fournisseur reel.
