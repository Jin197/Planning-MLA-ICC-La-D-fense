# Plan de realisation et etat d'avancement

Mis a jour le 14 octobre 2026.

Legende : **fait** = implemente et verifie par un test ou au navigateur ;
**ecrit** = code produit mais non execute faute d'acces externe ;
**a faire** = non commence.

## Lot 1 — Socle utilisable

| Element | Etat | Verification |
| --- | --- | --- |
| Design system | fait | Contrastes calcules ; largeurs 360 / 390 / 768 / 1440 et zoom 200 % verifies au navigateur |
| Inscription, connexion, deconnexion | fait | `tests/e2e/parcours.spec.ts` |
| Verification d'email, reinitialisation | fait | Jetons visibles dans `/dev/boite-mail` faute de fournisseur |
| Onboarding responsable / membre | fait | Le choix n'accorde aucun droit : `tests/unit/permissions.test.ts` |
| Catalogue des communautes | fait | N'expose que nom, type, description, responsable |
| Creation de communaute | fait | Atomicite et modele installe une fois : `tests/integration/communities.test.ts` |
| Demandes d'adhesion, decisions | fait | Dont le blocage des demandes en double |
| Roles admin / membre, dernier admin protege | fait | Y compris deux retrogradations simultanees |
| Modeles MLA et Star | fait | `tests/unit/template.test.ts` : 21 champs MLA, Star 1 a 4 |
| Evenements, sous-evenements, equipes | fait | Sous-evenements **facultatifs** (0..n), equipes creees dans l'evenement en nombre libre, rattachees a un sous-evenement ou a toute la duree, **ajout apres coup** |
| Repetitions | fait | Franchissement de minuit et changement d'heure testes |
| Disponibilites par occurrence | fait | Reponses differentes aux cultes 1 et 2 ; une seule reponse quand l'evenement n'a pas de sous-evenement |
| Motifs prives | fait | Table separee, RLS dediee, verifie par service et au navigateur |
| Affectations multiples, exceptions | fait | Doublons refuses, motif administratif exige |
| Publication avec controles | fait | Bloquants, alertes, confirmation explicite |

## Lot 2 — Coordination

| Element | Etat | Verification |
| --- | --- | --- |
| Confirmation d'affectation | fait | Le membre confirme ou signale ; il ne modifie pas le poste |
| Alerte et marquage « a remplacer » | fait | Indisponibilite d'une personne affectee, depart d'un membre |
| Alertes de conflit | fait | Chevauchement reel detecte, creneaux successifs permis, autre ministere masque |
| Discussion persistante | fait | Messages en base, non lus, mentions des membres actifs, epinglage, moderation tracee, **edition limitee a l'auteur** |
| Discussion en temps reel | **a faire** | Les politiques RLS necessaires sont ecrites ; l'abonnement n'est pas branche |
| Notifications dans l'application | fait | Organisation et discussions separees |
| Outbox transactionnelle | fait | Idempotence et exclusion d'un destinataire retire testees |
| Envoi reel des emails | **ecrit** | Fournisseur Resend derriere une interface ; jamais exerce |
| Preferences et rappels | fait | 48 h et 24 h par defaut ; aucun rappel dont l'echeance est passee |

## Lot 3 — Continuite avec l'Excel

| Element | Etat | Verification |
| --- | --- | --- |
| Bibliotheque de chants, listes par occurrence | fait | Copie explicite entre sous-evenements |
| Dress-code, variantes par equipe | fait | Couleurs avec code ecrit, texte alternatif exige |
| Moodboards (fichiers) | fait | Televersement, texte alternatif obligatoire, format verifie **sur le contenu** du fichier, stockage hors de `public/`, lecture par route authentifiee. 12 tests. Le bucket Supabase Storage reste non branche |
| Import controle du classeur | fait | 16 tests sur le classeur reel |
| Historique | fait | Evenements archives en lecture seule |
| Exports imprimable, CSV, ICS | fait | Droits respectes, motifs prives exclus |
| Duplication d'evenement | fait | Ne copie jamais disponibilites ni confirmations |

### Ce que l'import fait reellement

Mesure sur `PLANNING MLA LA DEFENSE (1).xlsx` :

| Lecture | Resultat |
| --- | --- |
| Feuilles reconnues | 5 sur 5 |
| Personnes | 57 |
| Colonnes de dates | 77, toutes datees apres validation de l'annee |
| Disponibilites | 398 |
| Affectations | 1 154 |
| Rendez-vous de repetition | 84, dont 23 franchissant minuit |
| Chants | 14, avec leurs liens |
| Dress-codes | 105 |
| Anomalies signalees | 298 |
| Journees presentes dans le planning **et** dans l'historique | 19, signalees comme conflit |
| Annee proposee | 2026, etayee par 17 cellules |

Anomalie reelle detectee dans le fichier : `PLANNING MLA!A42`, la colonne
pupitre contient « Lionel », qui n'est ni un pupitre ni un instrument.

## Lot 4 — Ameliorations

| Element | Etat |
| --- | --- |
| Modeles de recurrence | a faire |
| Suggestions de repartition | a faire |
| Calendrier personnel abonnable | partiel — export `.ics` telechargeable, pas d'abonnement |
| Installation PWA | a faire |

## Couverture des 17 criteres de validation

| # | Critere | Ou |
| --- | --- | --- |
| 1 | Creation : seul le createur admin, modele installe une fois | `integration/communities.test.ts` |
| 2 | Demande en attente sans aucun acces ; acceptation ouvre les droits | `integration/communities.test.ts`, `unit/permissions.test.ts` |
| 3 | Un membre ne peut pas administrer, meme par appel direct | `integration/communities.test.ts`, `integration/planning.test.ts` |
| 4 | Un admin de A n'a rien dans B | `integration/communities.test.ts` |
| 5 | Champs MLA present des la creation ; Star 1 a 4 ailleurs | `unit/template.test.ts` |
| 6 | Plusieurs postes, plusieurs membres, doublons refuses | `unit/assignments.test.ts`, `integration/planning.test.ts` |
| 7 | Dispo differente cultes 1 et 2 ; services successifs ; chevauchement detecte | `integration/planning.test.ts`, `unit/assignments.test.ts`, `unit/time.test.ts` |
| 8 | Indisponibilite d'un affecte : « a remplacer » et notification | `integration/planning.test.ts` |
| 9 | Motif lisible par l'auteur et les admins seulement | `integration/planning.test.ts`, `e2e/parcours.spec.ts` |
| 10 | Collecte sans exposer le brouillon ; publication revele ; archive en lecture seule | `integration/planning.test.ts`, `e2e/parcours.spec.ts` |
| 11 | Depart du dernier admin bloque, y compris en concurrence | `integration/communities.test.ts` |
| 12 | Modele modifie sans alterer l'historique ; concurrence sans perte | `unit/template.test.ts`, `integration/planning.test.ts` |
| 13 | Message persiste, prive a la communaute, non lus ; membre retire exclu | `integration/planning.test.ts`, `e2e` |
| 14 | Reprise sans double envoi ; destinataire retire exclu | `unit/notifications.test.ts`, `integration/planning.test.ts` |
| 15 | Minuit et changements d'heure : durees correctes | `unit/time.test.ts`, `e2e/parcours.spec.ts` |
| 16 | Previsualisation sans ecriture ; ambiguites a valider ; import idempotent | `integration/import.test.ts` |
| 17 | Mobile lisible, clavier, pas de couleur seule | `e2e/parcours.spec.ts` (profil Pixel 5) |

## Defauts trouves par les tests et corriges

Les parcours au navigateur ont revele trois problemes que les tests de service
ne pouvaient pas voir :

1. **Message de confirmation perdu.** Apres acceptation d'une adhesion ou
   retrait d'un membre, la carte traitee quittait la liste et emportait son
   message de confirmation. L'admin n'avait aucun retour. Corrige : la
   confirmation est remontee au niveau de la page, qui reste affichee.
2. **Contenu manquant sur mobile.** La vue en cartes du tableau n'affichait
   pas le motif prive, alors qu'elle doit presenter le meme contenu que la
   grille. Corrige.
3. **Noms composes mal rapproches.** `nameSimilarity` supprimait les traits
   d'union, si bien que « Carine-Linda Danadam » ne se rapprochait pas de
   « Carine Linda ». Corrige : les traits d'union deviennent des separateurs,
   ce qui compte pour un classeur plein de noms composes.

Une regle d'anomalie de l'import a aussi ete resserree : elle signalait chaque
instrument comme un prenom suspect. Elle ne signale desormais que les valeurs
hors vocabulaire, ce qui fait ressortir la seule vraie erreur du fichier.

### Capacites sans interface, depuis reliees

Une revue des fonctions de service a revele six capacites ecrites mais
accessibles par aucun ecran. Quatre correspondaient a des exigences du cahier
des charges, et ont donc ete reliees :

| Manque | Exigence concernee |
| --- | --- |
| Pas de formulaire pour corriger le nom ou la description | « Une correction de description ne remet pas toutes les reponses a zero » |
| Pas de reordonnancement des chants | « Permettre reordonnancement et ajout de sequences », avec « alternatives aux interactions par glisser-deposer » |
| Pas d'edition d'un message par son auteur | « Limiter l'edition d'un message a son auteur » |
| Aucun moyen d'ajouter un moodboard | « Le dress-code comporte [...] moodboard », visuels avec texte alternatif dans un espace prive |

Deux ajouts de confort ont suivi : archiver un chant du repertoire, et marquer
une notification comme lue individuellement.

Le televersement des visuels a conduit a ecrire un port de stockage
(`src/server/storage`) avec une implementation locale : les fichiers vivent
sous `.data/assets/`, **en dehors de `public/`**, et ne sont servis que par
une route qui verifie l'adhesion. Le format est verifie **sur les premiers
octets du fichier**, pas sur son extension : un fichier texte renomme en
`.png` est refuse.

## Prochaines etapes proposees

1. Brancher un projet Supabase : executer les migrations, verifier les
   politiques RLS avec des sessions reelles, et rejouer la suite
   d'integration contre PostgreSQL.
2. Configurer un fournisseur d'email et exercer le worker de bout en bout.
3. Brancher le temps reel de la messagerie.
4. Audit d'accessibilite outille et test avec un lecteur d'ecran.
5. Lot 4.
