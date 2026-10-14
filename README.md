# Diapason

Planning des ministeres ICC. Premier cas d'usage : le **MLA** (ministere de
louange et d'adoration) de **La Defense**. L'application accueille aussi les
communautes Accueil, Sonorisation, Integration et Autre.

« Diapason » est un **nom provisoire** : l'objet qui met tout le monde au meme
ton. Il est centralise dans `src/lib/brand.ts` et se change en une ligne.

---

## Demarrage rapide

Prerequis : **Node.js 20.9 ou plus** (teste sur 24.16).

```bash
npm install
npm run seed      # installe un jeu de donnees fictif
npm run dev
```

Puis <http://localhost:3000>.

### Comptes de demonstration

Mot de passe commun : `diapason2026`. Ces comptes et ces plannings sont
**fictifs** : aucune identite ni aucun motif du classeur source n'y figure.

| Email | Role | Ce qu'il permet de voir |
| --- | --- | --- |
| `noa.bertrand@exemple.test` | Admin du MLA | Tout : affectations, publication, demandes, modele, import |
| `ines.valadier@exemple.test` | Second admin du MLA | Protection du dernier admin |
| `elias.marchand@exemple.test` | Membre du MLA | Parcours membre : repondre, confirmer |
| `gaspard.nguema@exemple.test` | Membre de deux ministeres | Conflit inter-ministere, masque |
| `anaelle.rakoto@exemple.test` | Aucune adhesion | Catalogue et demande en attente |

### Parcours conseille

Pour une visite guidee complete, suivez
[docs/scenarios-utilisation.md](docs/scenarios-utilisation.md). En resume :

1. **Admin** : selecteur de communaute → *MLA La Defense (demonstration)* →
   Planning. Trois vues : Agenda, Calendrier, Tableau — calculees sur les
   memes donnees.
2. Ouvrir *Cultes du dimanche 18 octobre*, onglet **Creneaux et equipes** →
   « Affecter sur « Guitare » » → cocher **Tous les membres**. Disponibilite,
   competences, conflits et exigence de motif administratif apparaissent.
3. Onglet **Repetitions** de l'evenement du 25 octobre : une repetition de
   22 h a 00 h 30 (2 h 30, « se termine le lendemain ») et une sur la nuit du
   changement d'heure.
4. *Cultes du dimanche 25 octobre* : panneau **Avant publication**, avec les
   postes a completer, les reponses manquantes et les affectations non
   confirmees.
5. **Membre** (`elias.marchand`) : l'accueil liste les disponibilites a
   renseigner ; deux interactions suffisent pour repondre.
6. **Import** (admin, menu lateral) : charger
   `PLANNING MLA LA DEFENSE (1).xlsx`. L'analyse lit les cinq feuilles **sans
   rien ecrire**.
7. `/dev/boite-mail` : la file de notifications reste a l'etat
   « enregistre » — aucun fournisseur d'email n'est configure, donc rien n'est
   envoye.

---

## Commandes

| Commande | Effet |
| --- | --- |
| `npm run dev` | Serveur de developpement |
| `npm run build` | Build de production |
| `npm start` | Sert le build |
| `npm run typecheck` | TypeScript strict, sans emission |
| `npm test` | Tests de domaine et d'integration (Vitest) |
| `npm run test:e2e` | Parcours au navigateur (Playwright) |
| `npm run verify` | `typecheck` puis `test` |
| `npm run seed` | Installe les donnees fictives |
| `npm run reset:demo` | Vide la demonstration |
| `npm run outbox` | Traite la file d'emails et imprime un rapport honnete |
| `npm run analyse:classeur` | Analyse un classeur et imprime un resume, sans rien ecrire |

### Etat de la verification

```
npm run verify     195 tests, 10 fichiers         ✓
npm run build      compile et type-check          ✓
npm run test:e2e   46 parcours, 2 profils         ✓
```

Les parcours au navigateur utilisent **Microsoft Edge deja installe**
(`channel: "msedge"`), car le CDN de Playwright est inaccessible depuis ce
poste. Sur une machine qui l'atteint :

```bash
npx playwright install chromium
DIAPASON_E2E_CHANNEL="" npm run test:e2e
```

---

## Configuration

Copier `.env.example` vers `.env.local`. Sans aucune variable, l'application
fonctionne en mode demonstration.

| Variable | Defaut | Role |
| --- | --- | --- |
| `DIAPASON_DATA_ADAPTER` | `demo` | `demo` ou `supabase` |
| `DIAPASON_SESSION_SECRET` | — | Signature du cookie de session. **Requis en production** |
| `DIAPASON_DEFAULT_TIMEZONE` | `Europe/Paris` | Fuseau des communautes creees |
| `NEXT_PUBLIC_SUPABASE_URL` | — | Requis si `supabase` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | — | Cle **publishable**, cote navigateur |
| `SUPABASE_SECRET_KEY` | — | Cle **secrete**, strictement cote serveur |
| `DIAPASON_EMAIL_PROVIDER` | `none` | `none` ou `resend` |
| `RESEND_API_KEY`, `DIAPASON_EMAIL_FROM` | — | Requis si `resend` |

Deux variables servent aux tests et ne doivent jamais etre positionnees
ailleurs : `DIAPASON_DEMO_FILE` (chemin de l'instantane) et
`DIAPASON_ALLOW_TEST_RESET` (ouvre la route de remise a zero).

Generer un secret de session :

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Note sur le registre npm

`registry.npmjs.org` renvoie 403 depuis ce poste. `.npmrc` pointe donc vers
`registry.yarnpkg.com`, le miroir officiel qui sert les memes paquets.
Supprimez cette ligne si votre reseau atteint npmjs.org directement.

---

## Passer sur Supabase

> **Non verifie.** Les migrations et l'adaptateur sont ecrits mais n'ont
> jamais ete executes : aucun projet Supabase n'etait disponible. Traitez cette
> section comme une procedure a eprouver, pas comme un chemin valide.

1. Creer un projet Supabase.
2. Appliquer les migrations, dans l'ordre :
   - `supabase/migrations/0001_schema.sql` — tables, contraintes, index
   - `supabase/migrations/0002_rls.sql` — RLS et privileges
   - `supabase/migrations/0003_operations.sql` — operations atomiques
3. Renseigner les variables Supabase et passer
   `DIAPASON_DATA_ADAPTER=supabase`.
4. Creer un bucket **prive** pour les moodboards.
5. Verifier d'abord avec deux comptes de test : un membre ne doit pouvoir ni
   lire un motif qui n'est pas le sien, ni ecrire une affectation.

Les donnees fictives et les comptes reels ne se melangent jamais : un seul
adaptateur est actif par deploiement.

---

## Emails

L'envoi suit une **outbox transactionnelle**. La modification metier, la
notification dans l'application et la tache d'email sont ecrites dans la meme
transaction ; un worker envoie ensuite.

```bash
npm run outbox
```

Trois etats sont distingues : `enregistre` (rien n'est parti),
`pris_en_charge` (le fournisseur a accepte), `livre` (remise confirmee).
**Sans fournisseur configure, les taches restent `enregistre` et aucune
interface n'affiche « email envoye ».**

En production, declenchez `processOutbox()` par une tache planifiee (toutes
les minutes suffit).

---

## Sauvegarde et restauration

**Mode demonstration** : tout est dans `.data/diapason-demo.json`. Copier le
fichier sauvegarde ; le remplacer restaure. Ce n'est pas une base de
production.

**Mode Supabase** : utiliser les sauvegardes du projet. A eprouver avant tout
usage reel :

1. Faire une restauration sur un projet de test.
2. Verifier que les contraintes et les politiques RLS sont bien revenues.
3. Noter la duree reelle de la procedure.

Aucune declaration de disponibilite de production n'est faite ici.

---

## Deploiement

Non effectue. Procedure prevue :

1. `npm run verify` puis `npm run build`.
2. Positionner `DIAPASON_SESSION_SECRET` et les variables Supabase.
3. Deployer sur un hebergeur compatible Next.js 16.
4. Programmer `processOutbox()`.
5. Verifier les parcours membre et admin sur l'environnement cible avant
   d'ouvrir l'acces.

Aucune publication publique, aucune migration sur une base de production et
aucun envoi d'email reel n'a ete realise.

---

## Organisation du code

```
src/
  app/                  routes, formulaires, actions serveur
    (auth)/             inscription, connexion, verification, mot de passe
    (app)/              application authentifiee
      c/[communityId]/  planning, evenements, membres, chants, parametres, import
    api/                exports CSV et ICS, deconnexion
  components/ui/        design system
  components/app/       coquille, badges d'etat
  domain/               regles pures, testables sans serveur
  server/
    auth/               session, mots de passe, contexte d'autorisation
    data/               contrat + adaptateurs demo et supabase
    services/           regles metier
    import/             lecture du classeur et import controle
    notifications/      outbox et envoi
supabase/migrations/    schema, RLS, operations atomiques
tests/
  unit/                 domaine
  integration/          services et magasin
  e2e/                  parcours au navigateur
docs/                   architecture, modele, permissions, design, plan
scripts/                graines, worker, analyse de classeur
```

---

## Documentation

| Document | Contenu |
| --- | --- |
| [docs/scenarios-utilisation.md](docs/scenarios-utilisation.md) | **24 scenarios pas a pas** : parcours membre, parcours referent, et verification des garanties |
| [docs/architecture.md](docs/architecture.md) | Couches, adaptateurs, outbox, limites |
| [docs/data-model.md](docs/data-model.md) | Diagramme, dictionnaire, contraintes, concurrence |
| [docs/permissions.md](docs/permissions.md) | Matrice des droits, motifs prives, RLS |
| [docs/design-system.md](docs/design-system.md) | Jetons, contrastes, accessibilite |
| [docs/implementation-plan.md](docs/implementation-plan.md) | Avancement par lot et couverture des criteres |

---

## Limites

- Le chemin verifie est l'**adaptateur de demonstration**. L'adaptateur
  Supabase, les migrations et les politiques RLS sont ecrits mais non executes.
- **Aucun email n'a jamais ete envoye** : le fournisseur n'a pas ete exerce.
- Le **temps reel** de la messagerie n'est pas branche. Les messages sont
  persistes et relus a chaque affichage ; les politiques RLS necessaires sont
  ecrites.
- L'import cree des evenements **en brouillon** avec des horaires « a
  definir » : le classeur ne contient pas les horaires exacts des cultes, et
  ils doivent etre saisis avant publication.
- L'import ne cree **aucun compte** : le classeur ne fournit pas les emails.
  Les personnes non rapprochees restent des fiches importees, a lier par un
  admin a un compte verifie.
- Les moodboards se televersent dans l'application, mais ils **ne sont pas
  extraits automatiquement du classeur** : les images y sont signalees, leur
  association a une date reste a confirmer a la main. Le stockage utilise le
  disque local (`.data/assets/`) ; le bucket Supabase Storage n'est pas branche.
- Aucun **audit d'accessibilite outille** n'a ete execute (outillage
  inaccessible depuis ce poste). Contrastes calcules a la main, clavier teste
  au navigateur.
- Aucune **mesure de performance** n'est annoncee : le jeu de donnees,
  l'appareil et les conditions de test n'ont pas ete definis.
- Lot 4 (recurrence, suggestions, PWA) non commence.
- **Aucune conformite legale n'est declaree.** Archivage, sauvegarde et
  conservation des donnees personnelles doivent etre decides avec le
  ministere.

Le classeur source contient des donnees personnelles : il est exclu du
versionnement par `.gitignore`.
