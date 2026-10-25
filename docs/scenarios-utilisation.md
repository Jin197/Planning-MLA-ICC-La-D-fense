# Scenarios d'utilisation

Ce document sert a prendre l'application en main, a la montrer a l'equipe, et
a verifier qu'elle fait ce qu'elle promet. Chaque scenario part d'une
situation reelle du MLA de La Defense, donne les etapes exactes, et dit **ce
que vous devez observer**.

Les scenarios marques **verifie par un test** correspondent a une assertion
automatisee : `tests/integration/scenarios.test.ts` et
`tests/e2e/parcours.spec.ts`. Si un de ces comportements changeait, les tests
echoueraient.

## Mise en route

```bash
npm install
npm run seed
npm run dev
```

Puis <http://localhost:3000>. Mot de passe commun : `diapason2026`.

| Compte | Qui | Dans l'application |
| --- | --- | --- |
| `noa.bertrand@exemple.test` | Noa Bertrand | Admin du MLA, Equipe 1, LEAD et soprano |
| `ines.valadier@exemple.test` | Ines Valadier | Second admin, Equipe 2, LEAD et alto |
| `elias.marchand@exemple.test` | Elias Marchand | Membre, piano, batterie, tenor |
| `maelys.fontaine@exemple.test` | Maelys Fontaine | Membre, alto |
| `liora.mendy@exemple.test` | Liora Mendy | Membre, tenor |
| `gaspard.nguema@exemple.test` | Gaspard Nguema | Piano au MLA **et** membre de la Sonorisation |
| `anaelle.rakoto@exemple.test` | Anaelle Rakoto | Aucune adhesion, une demande en attente |

**Les dates sont calculees a l'installation**, pas ecrites en dur : un jeu
date finirait par expirer, et l'application se montrerait vide alors qu'elle
fonctionne. L'ancre est le dernier dimanche d'octobre encore a venir, parce
que la nuit precedente est celle du changement d'heure.

Le jeu contient donc toujours quatre dimanches : un **dimanche archive**
(trois semaines avant), le **dimanche publie** (une semaine avant), le
**dimanche en collecte** (l'ancre), un **culte EJP** le meme jour dont
l'horaire reste a definir, et une **soiree d'anniversaire** un mois plus tard,
sans sous-evenement, en
brouillon.

Pour repartir d'un etat propre a tout moment : `npm run seed`.

---

# A. Le membre

## A1. Je reponds a mes disponibilites pour un dimanche a quatre cultes

**Situation.** Le dimanche en collecte est ouvert. Elias doit dire s'il est
la, culte par culte.

**Compte.** `elias.marchand@exemple.test`

1. L'accueil affiche **« Disponibilites a renseigner »** avec
   « Cultes du dimanche ... — 4 sous-evenement(s) sans reponse ».
2. Cliquer sur l'evenement.
3. Les quatre creneaux sont deja coches. Cliquer **« Je suis disponible »**.

**A observer.** Une reponse est enregistree **pour chaque creneau**, pas une
reponse de journee : le message indique « Reponse enregistree pour
4 creneau(x) ». Deux interactions ont suffi apres l'ouverture du detail.

Pour une reponse partielle : decocher Culte 3 et Culte 4, cliquer
« Je suis disponible », puis cocher les deux autres et cliquer
« Je suis indisponible ». Le bouton **« Tous les cultes »** coche ou decoche
tout d'un coup.

> **Verifie par un test** — enregistrement par creneau, mise a jour sans
> doublon, selection multiple.

## A2. Je suis indisponible, et mon motif reste prive

**Situation.** Maelys est disponible au culte 1 mais pas au culte 2, pour une
raison personnelle qu'elle accepte de donner aux referents, pas a tout le
monde.

**Compte.** `maelys.fontaine@exemple.test`, puis `elias.marchand@exemple.test`,
puis `noa.bertrand@exemple.test`

1. Avec Maelys : ouvrir *le dimanche publie*. Le culte 1 affiche
   **Disponible**, le culte 2 **Indisponible**, et son motif apparait sous le
   creneau avec la mention « (prive) ».
2. Se deconnecter, se connecter avec **Elias**. Planning → vue **Tableau**.
3. Chercher la ligne de Maelys.
4. Se deconnecter, se connecter avec **Noa** (admin). Meme vue Tableau.

**A observer.** Elias voit bien que Maelys est indisponible au culte 2 — c'est
necessaire pour composer les equipes — mais **aucun motif**. Noa, admin de
cette communaute, lit « Motif : Engagement familial a midi. »

La garantie ne depend pas de l'affichage : les motifs vivent dans une table
separee, avec leur propre regle d'acces, et ils sont exclus des exports
communs.

> **Verifie par deux tests** — lecture par un autre membre, par l'auteur et
> par un admin, au niveau du service **et** au navigateur.

## A3. Je confirme ma participation, ou je signale un empechement

**Situation.** Le dimanche publie l'est. Liora est au micro tenor
et doit confirmer.

**Compte.** `liora.mendy@exemple.test`

1. Accueil → **« Mes prochaines affectations »** montre « Tenor » avec le
   badge **A confirmer**.
2. Ouvrir l'evenement → section **« Mes affectations »**.
3. Cliquer **« Je confirme »**.

**A observer.** Le badge passe a **Confirmee**. Liora peut ajouter une note
pour les referents (« je serai la a 8h45 »), mais elle ne peut ni changer de
poste, ni toucher au nom de quelqu'un d'autre : il n'y a aucun controle pour
cela.

Pour l'autre cas : cliquer **« Signaler un empechement »**. L'affectation
passe a **A remplacer** et les admins sont prevenus — elle n'est pas
supprimee, pour que personne ne disparaisse du planning sans trace.

> **Verifie par un test** au navigateur, et par un test de service qui
> confirme qu'un membre ne peut pas retirer une affectation.

## A4. Je me desiste la veille

**Situation.** Elias est confirme au piano pour les cultes 1 et 2 du
dimanche publie, mais il ne pourra finalement pas venir le matin.

**Compte.** `elias.marchand@exemple.test`, puis `noa.bertrand@exemple.test`

1. Avec Elias : ouvrir *le dimanche publie*.
2. Dans **« Repondre a mes disponibilites »**, ne cocher que **Culte 1**,
   saisir un motif, puis cliquer **« Je suis indisponible »**.
3. Se connecter avec **Noa** et ouvrir **Notifications**.

**A observer.** L'affectation piano d'Elias au culte 1 est passee a
**A remplacer**, et Noa a une notification « Remplacement necessaire ». Sa
disponibilite declaree est conservee telle quelle. **Le motif prive n'apparait
pas dans la notification** : les admins savent qu'il faut remplacer, sans que
la raison circule.

L'accueil de Noa affiche aussi le compteur « affectation(s) a remplacer » dans
« A traiter comme admin ».

> **Verifie par un test** — passage a « a remplacer », notification envoyee,
> et absence du motif dans la notification.

## A5. Je reponds a une repetition de nuit

**Situation.** Deux repetitions sont prevues pour le dimanche en collecte, dont une qui
se termine apres minuit.

**Compte.** n'importe quel membre du MLA

1. Ouvrir *le dimanche en collecte* → onglet **Repetitions**.
2. Repondre « Disponible » a la **Repetition de nuit**.

**A observer.** La repetition du vendredi 23 octobre affiche
**22:00 → 00:30**, le badge **« Se termine le lendemain »** et une duree de
**2 h 30**. La seconde repetition, dans la nuit du changement d'heure, est
aussi correcte.

Un bandeau rappelle que les repetitions ont **leurs propres reponses** : etre
disponible le dimanche ne dit rien du vendredi soir.

> **Verifie par trois tests** — durees reelles autour de minuit et des deux
> changements d'heure, et affichage au navigateur.

## A6. Je corrige un message que j'ai ecrit

**Situation.** Liora a annonce une heure d'arrivee, et veut la corriger.

**Compte.** `liora.mendy@exemple.test`

1. Ouvrir *le dimanche publie* → onglet **Discussion**.
2. Sous son propre message, cliquer **« Modifier »**, corriger, enregistrer.

**A observer.** Le bouton n'apparait que sous **ses** messages : l'edition est
limitee a l'auteur, et le serveur le reverifie. Le message corrige porte la
mention **« modifie »**, et le formulaire se referme de lui-meme.

Un admin ne modifie pas le texte d'autrui : il **modere**, ce qui est une
action distincte, qui remplace le contenu et laisse une trace dans le journal.

> **Verifie par un test** au navigateur — un seul bouton de modification, et
> fermeture du formulaire apres enregistrement.

## A7. Je demande a rejoindre un ministere

**Situation.** Anaelle vient d'arriver et cherche le MLA.

**Compte.** `anaelle.rakoto@exemple.test`

1. **Communautes** : le catalogue affiche les trois ministeres avec leur nom,
   leur type, leur description et leur responsable affiche.
2. Sa demande au MLA apparait **En attente**.
3. Essayer d'ouvrir le planning du MLA depuis l'URL.

**A observer.** Le catalogue ne montre **rien de prive** : ni planning, ni
noms d'equipes, ni echanges. Avec une demande en attente, l'acces au planning
affiche **« Contenu reserve aux membres »**. Une demande ne donne aucun droit :
seule son acceptation en donne.

Le catalogue n'affiche le bouton « Creer une communaute » que si le profil a
choisi « Responsable » — et ce choix, modifiable dans le profil, ne change
aucun role existant.

> **Verifie par trois tests** — absence d'acces sans adhesion, au service et
> au navigateur.

---

# B. Le referent planning

## B1. Je prepare le dimanche suivant

**Situation.** Il faut creer le dimanche a quatre cultes du 1er novembre, avec
la repetition du vendredi soir.

**Compte.** `noa.bertrand@exemple.test`

1. Planning → **Nouvel evenement**.
2. Nom : « Cultes du dimanche 1er novembre ». Date du 1er novembre,
   09:00 → 18:45 : c'est l'horaire de l'evenement lui-meme.
3. Cliquer **« Modele : 4 cultes du dimanche »** : quatre sous-evenements sont
   crees avec leurs horaires habituels. Saisir la date du premier ; elle se
   propage.
4. Section **Equipes de cet evenement** : « Equipe 1 », rattachee aux
   sous-evenements 1 et 2 ; **« Ajouter une equipe »** pour « Equipe 2 »,
   rattachee aux 3 et 4. Cocher au passage leur effectif.
5. **Ajouter une repetition** : vendredi 30 octobre, 22:00 → date de fin
   **31 octobre**, 00:30, Studio Hyacinthe, studio 1.
6. Limite de reponse : 29 octobre, 20:00. Laisser coche
   **« Ouvrir tout de suite la collecte »**.

**A observer.** Chaque horaire demande **une date et une heure** de debut
**et** de fin : une heure seule ne suffirait pas a planifier une repetition
qui passe minuit. Chaque rattachement d'equipe recoit **les 15 postes du
modele MLA** deja en place — rien a ressaisir. Les membres actifs recoivent
une notification d'ouverture de collecte, et une tache d'envoi par mail est
enregistree pour chacun.

**Sans sous-evenement.** Les sous-evenements sont facultatifs. Pour une soiree
d'anniversaire, on saute l'etape 3 : l'evenement reste d'un seul bloc, son
equipe couvre toute sa duree, et les membres repondent une seule fois — sur
l'evenement. La demonstration contient un tel evenement,
*Soiree speciale anniversaire*.

**Les equipes appartiennent a l'evenement.** Leur nom et leur effectif sont
saisis ici et disparaissent avec lui : « Equipe 1 » du 1er novembre et
« Equipe 1 » du 8 novembre sont deux equipes distinctes. Pour repartir d'une
composition connue, dupliquez l'evenement : ses equipes et leur effectif sont
recopies.

## B2. Je compose les equipes, avec un LEAD different entre deux cultes

**Situation.** Le LEAD du culte 1 n'est pas celui du culte 2, meme si l'Equipe
1 assure les deux.

**Compte.** `noa.bertrand@exemple.test`

1. Ouvrir *le dimanche publie* → onglet
   **Equipes et postes**.
2. Comparer le poste **LEAD** du culte 1 et celui du culte 2.
3. Sur un poste vide, cliquer **« Affecter sur « ... » »**.

**A observer.** Le culte 1 a **Noa Bertrand** au LEAD, le culte 2
**Ines Valadier** : le planning se tient par creneau, pas par journee.

Le selecteur affiche par defaut les **membres actifs, disponibles et
compatibles avec le poste**, avec pour chacun son avatar, ses competences, sa
disponibilite et ses eventuels conflits. Une personne deja placee ailleurs sur
le meme creneau est signalee (« Aussi : Piano »), et les combinaisons
douteuses declenchent une alerte d'incompatibilite.

Un poste accueille plusieurs personnes, et une meme personne peut tenir
plusieurs postes compatibles. Un doublon exact est refuse.

> **Verifie par deux tests** — LEAD distinct entre les deux cultes, et liste
> par defaut limitee aux personnes disponibles et compatibles.

## B3. J'affecte quelqu'un qui n'a pas repondu et qui est pris ailleurs

**Situation.** Il manque un pianiste au culte 1. Gaspard sait jouer, mais il
n'a pas repondu pour ce creneau — et il sonorise ce matin-la.

**Compte.** `noa.bertrand@exemple.test`

1. *le dimanche publie* → **Equipes et postes** → culte 1,
   Equipe 1 → **« Affecter sur « Piano » »**.
2. Gaspard **n'apparait pas** dans la liste par defaut.
3. Cocher **« Tous les membres »** : il apparait.
4. Le selectionner, puis essayer de valider sans rien d'autre.

**A observer.** Gaspard porte trois indications : **A renseigner**,
**Competence declaree** (le piano correspond bien), et
**« Conflit sur ce creneau »**.

Ce dernier libelle est volontairement muet : Gaspard est engage dans la
**Sonorisation** ce matin-la, mais rien de cet autre ministere n'est revele —
ni le nom, ni l'evenement, ni le lieu.

L'affectation demande alors, dans l'ordre :

1. de cocher **« J'ai vu ces alertes et j'affecte quand meme »** ;
2. de saisir un **motif administratif** — sans lui, l'enregistrement est
   refuse.

Une fois validee, l'affectation porte la trace de l'exception, elle est
inscrite au journal, **la disponibilite declaree par Gaspard n'est pas
modifiee**, et il est informe qu'il doit confirmer.

> **Verifie par trois tests** — absence dans la liste par defaut, conflit
> masque sans fuite du nom de l'autre ministere, et refus tant que la
> confirmation puis le motif ne sont pas fournis.

## B4. Je verifie avant de publier

**Situation.** Avant d'annoncer le planning, il faut savoir ce qui manque.

**Compte.** `noa.bertrand@exemple.test`

1. Ouvrir *le dimanche en collecte* → section
   **« Avant publication »**.
2. Lire les alertes, puis cocher la confirmation et publier.

**A observer.** Le panneau liste separement :

- les **postes a completer**, en ignorant les postes facultatifs et ceux que
  vous avez desactives pour cet evenement ;
- les **reponses de disponibilite manquantes** ;
- les **affectations non confirmees** et celles **a remplacer** ;
- les **chevauchements**.

Le bouton **Publier** reste inactif tant que vous n'avez pas coche
« Je publie malgre ces alertes ». Les alertes restent visibles apres
publication, et le journal garde la trace d'une publication avec exceptions.

Un planning peut etre **complet** avec des postes facultatifs vides : Guitare
et Mass Choir sont a zero par defaut, comme dans le classeur ou ils sont
souvent « N/A ».

Essayez ensuite *le culte EJP* : son horaire est marque **« a
definir »**, ce qui **bloque** la publication — pas une alerte, un blocage.
L'horaire doit etre fixe dans l'onglet « Equipes et postes »,
**« Modifier ce creneau »**.

> **Verifie par deux tests** — controles et confirmation explicite, blocage
> sur horaire provisoire.

## B5. Je deplace une repetition

**Situation.** Le studio n'est plus libre a 22 h ; la repetition passe a 20 h.

**Compte.** `noa.bertrand@exemple.test`

1. *le dimanche en collecte* → **Equipes et postes** →
   **« Modifier ce creneau »** (ou l'onglet Repetitions pour une repetition).
2. Changer l'heure de debut, enregistrer.

**A observer.** Un decalage important fait passer les reponses concernees a
**A reconfirmer** — un etat distinct, qui **n'efface pas** la reponse initiale
— remet les affectations confirmees a **A confirmer**, previent les personnes
concernees, et recalcule les rappels. Un ajustement de quelques minutes ne
declenche rien.

A l'inverse, corriger le **nom ou la description** depuis
**« Informations de l'evenement »** ne remet **aucune** reponse a zero.

**Et si un culte s'ajoute en cours de route ?** Dans l'onglet
**Equipes et postes**, **« Ajouter un sous-evenement »** l'ajoute a un
evenement deja cree, en y rattachant les equipes cochees — avec les postes du
modele. Une equipe ne peut etre rattachee qu'une fois au meme
sous-evenement.

**Le premier sous-evenement d'un evenement qui n'en avait pas** deplace la
question posee aux membres : elle portait sur l'evenement, elle porte
desormais sur lui. Les reponses deja donnees lui sont rattachees, et
l'application l'annonce avant la validation : personne ne perd sa reponse.

> **Verifie par deux tests** — seuil de declenchement de la reconfirmation, et
> correction de description sans effet sur les reponses ni les confirmations.

## B6. Je traite les demandes d'adhesion

**Compte.** `noa.bertrand@exemple.test`

1. L'accueil signale « 1 demande(s) d'adhesion » dans
   **« A traiter comme admin »**.
2. Ouvrir **Demandes** : la demande d'Anaelle Rakoto, avec son ministere
   declare et son message.
3. **Accepter**, avec une note facultative.

**A observer.** Un message de confirmation s'affiche en haut de page — il ne
disparait pas avec la carte traitee. Anaelle devient membre avec le role
**membre**, et elle est informee. Son ministere declare a l'inscription
n'avait, lui, rien accorde.

> **Verifie par un test** au navigateur et par quatre tests de service — dont
> le fait qu'un membre ou un admin d'une autre communaute ne peut pas accepter
> une demande.

## B7. J'adapte le modele a mon equipe

**Situation.** Le MLA veut ajouter un poste « Referent Coordination », present
dans le classeur mais pas installe par defaut.

**Compte.** `noa.bertrand@exemple.test`

1. **Parametres** → **« Postes du modele »**.
2. Dans « Ajouter un champ », choisir **Referent Coordination** dans les
   suggestions, effectif minimum 0, puis ajouter.
3. Creer un nouvel evenement, puis rouvrir *le dimanche publie*.

**A observer.** Le nouveau poste apparait dans les **nouveaux** plans. Les
plans deja crees gardent leurs postes, leurs libelles et leurs affectations :
un changement de modele ne reecrit pas l'historique.

Vous pouvez aussi renommer un poste, changer son effectif minimum, ou
l'archiver. Un poste **encore utilise dans l'historique** est **archive**, pas
supprime — les affectations passees restent lisibles.

Pour une adaptation limitee a un seul evenement, utilisez
**« Reglages »** sur le poste, dans l'onglet « Equipes et postes » :
renommer, changer l'effectif, ou decocher
**« Poste utilise pour cet evenement »**.

> **Verifie par cinq tests** — presence des champs MLA et Star des la
> creation, instantane du libelle dans les plans, apercu des changements,
> archivage au lieu de suppression.

## B8. Je prepare les chants et le dress-code

**Compte.** `noa.bertrand@exemple.test`

1. **Chants** (menu lateral) : ajouter un chant au repertoire, avec sa
   tonalite, son tempo et un lien.
2. Ouvrir un evenement → onglet **Chants** : ajouter une sequence
   (« Chant 1 », « Sainte Cene », « Offrandes »...), puis reordonner avec les
   fleches **Monter** et **Descendre**.
3. **« Copier la liste d'un autre creneau »** pour reprendre la liste du matin
   l'apres-midi.
4. Onglet **Dress-code** : theme, ambiance, couleurs, matieres, consigne. Puis
   une **variante pour l'Equipe 2**.
5. Dans la section **Moodboard**, ajouter une image. Essayer d'abord sans
   texte alternatif, puis avec. Essayez aussi de renommer un fichier texte en
   `.png` et de l'envoyer.

**A observer.** Les liens s'ouvrent explicitement comme ressources externes,
dans un nouvel onglet : rien n'est telecharge et aucune parole n'est recopiee.
La copie entre creneaux est explicite, et les deux listes restent ensuite
independantes. Le reordonnancement se fait par boutons, utilisables au clavier
et sur un telephone — pas par glisser-deposer.

Les couleurs du dress-code affichent **leur code ecrit a cote** de la
pastille : la consigne reste comprehensible sans percevoir la couleur. Le
**referent dress-code** n'est pas un champ de texte : c'est un poste
affectable, gere avec les affectations, avec une precision possible.

Pour le moodboard, le **texte alternatif est obligatoire** : sans lui, le
visuel est refuse, parce qu'une consigne vestimentaire doit rester
comprehensible pour qui ne voit pas l'image. Le format est verifie **sur le
contenu reel du fichier**, pas sur son nom : un fichier texte renomme en
`.png` est rejete. Les images ne sont jamais publiques — elles passent par une
route qui verifie votre adhesion.

> **Verifie par treize tests** — reordonnancement par echange de rangs, rangs
> contigus, refus de depasser les bornes, et pour les visuels : detection par
> signature, texte alternatif exige, taille limitee, lecture refusee sans
> adhesion, retrait reserve aux admins.

## B9. Je publie, j'annule, j'archive, je duplique

**Compte.** `noa.bertrand@exemple.test`

1. Publier un evenement : les membres actifs sont prevenus et voient le plan
   complet.
2. **Annuler** avec un motif : les personnes concernees sont prevenues, la
   discussion passe en lecture seule, et les rappels encore en attente sont
   abandonnes.
3. **Archiver** : l'evenement reste consultable, sans modification ordinaire.
4. **Dupliquer** avec un decalage de 7 jours.

**A observer.** La copie reprend la structure, les postes, et si vous le
demandez les chants, le dress-code et les repetitions. Elle ne reprend
**jamais** les disponibilites ni les confirmations des membres. Les
affectations ne sont recopiees que si vous le cochez explicitement, et elles
reviennent toutes a **A confirmer**.

Ouvrez *le dimanche archive* (archive) pour voir l'historique en
lecture seule.

> **Verifie par trois tests** — publication revelant le plan, archive en
> lecture seule meme par appel direct, et regles de duplication.

## B10. J'importe le classeur Excel

**Situation.** Reprendre l'historique et l'annuaire depuis
`PLANNING MLA LA DEFENSE (1).xlsx`.

**Compte.** `noa.bertrand@exemple.test`

1. **Import Excel** (menu lateral).
2. Charger le classeur, laisser l'annee vide, cliquer
   **« Analyser sans rien ecrire »**.
3. Lire la previsualisation, l'annee proposee, et le rapport d'anomalies.
4. Rapprocher quelques personnes, puis cocher la confirmation et importer.

**A observer** sur le vrai classeur :

| Lecture | Resultat |
| --- | --- |
| Feuilles reconnues | 5 sur 5 |
| Personnes lues | 57 |
| Colonnes de dates | 77 |
| Disponibilites | 398 |
| Affectations | 1 154 |
| Rendez-vous de repetition | 84, dont **23 franchissant minuit** |
| Chants avec liens | 14 |
| Dress-codes | 105 |
| Anomalies signalees | 298 |
| Annee proposee | **2026**, etayee par 17 cellules |

Points a verifier a l'ecran :

- **L'analyse n'ecrit rien** dans le planning. Tout reste en zone de staging.
- L'annee est **proposee avec sa preuve** (« Samedi 17/10/2026 - 12h-15h »),
  jamais appliquee d'office, et jamais remplacee par l'annee courante.
- « Cultes 1 & 2 » devient une disponibilite sur **ces deux creneaux**, et
  laisse les autres **A renseigner** — le classeur ne dit rien de plus. Une
  case a cocher permet, en le validant, de deduire l'indisponibilite.
- **« N/A »** est traite comme « non applicable », **jamais** comme une
  personne appelee N/A.
- Chaque anomalie garde **sa feuille et sa cellule** : par exemple
  `PLANNING MLA!A42`, ou la colonne pupitre contient « Lionel », qui n'est ni
  un pupitre ni un instrument.
- Les 19 journees presentes **a la fois** dans le planning et dans
  l'historique sont signalees comme conflit.
- Le rapprochement des noms **propose** (« Carine-Linda Danadam » ↔
  « Carine Linda », avec un pourcentage) et ne fusionne jamais tout seul.
- Aucun compte n'est cree : le classeur ne fournit pas les emails. Les
  personnes non rapprochees restent des **fiches importees**.
- Les evenements arrivent **en brouillon**, avec des horaires « a definir » —
  le classeur ne contient pas les horaires exacts des cultes.
- Les disponibilites importees sont **a reconfirmer** et les affectations **a
  confirmer** : une personne planifiee dans l'ancien fichier n'a rien accepte.
- **Relancer le meme import ne cree pas de doublon** : les evenements deja
  presents sont conserves et signales.

Pour voir ces chiffres sans passer par l'interface :
`npm run analyse:classeur`.

> **Verifie par seize tests** contre le classeur reel.

## B11. Je sors le planning

**Compte.** `noa.bertrand@exemple.test`

1. Depuis un evenement : **« Version imprimable »**.
2. Depuis le planning : **« Export CSV »**.
3. Depuis le profil ou le planning : **« Mon calendrier (.ics) »**.

**A observer.** La version imprimable est sobre, en tableaux, sans couleur
necessaire a la comprehension. Le CSV s'ouvre directement dans Excel en
configuration francaise. Le fichier `.ics` ne contient **que vos propres
services publies**.

Les trois exports respectent les droits d'acces et **excluent les motifs
prives**.

---

# C. Ce que l'application garantit

Ces scenarios ne servent pas au travail quotidien : ils verifient les
promesses.

## C1. Un membre ne peut pas administrer, meme en forcant l'URL

**Compte.** `elias.marchand@exemple.test`

Ouvrir directement `/c/<id>/demandes`, `/c/<id>/parametres` ou
`/c/<id>/import`.

**A observer.** L'acces est refuse. Les outils d'administration ne sont pas
seulement caches : la decision est prise cote serveur, a partir de l'adhesion
lue en base, et elle est refaite au moment de chaque ecriture.

> **Verifie par plusieurs tests** — refus au navigateur **et** par appel
> direct aux services, pour la creation d'evenement, l'affectation, le
> changement de role, l'acceptation d'adhesion et l'import.

## C2. Le dernier admin ne peut pas partir

**Compte.** `noa.bertrand@exemple.test`

1. **Membres** → retrograder Ines Valadier en membre.
2. Essayer ensuite de se retrograder soi-meme, ou de se retirer.

**A observer.** Les deux boutons sont desactives, avec l'explication
« Dernier admin actif : la retrogradation et le retrait sont bloques ». La
protection ne repose pas sur l'interface : elle est appliquee a l'interieur de
la transaction, ce qui resiste aussi a **deux retrogradations simultanees**.

> **Verifie par quatre tests** — dont le cas concurrent, ou exactement une des
> deux operations echoue et un admin reste.

## C3. Deux referents modifient le meme evenement

**Comptes.** `noa.bertrand@exemple.test` et `ines.valadier@exemple.test`

1. Ouvrir le meme evenement dans deux fenetres, avec les deux comptes.
2. Dans la premiere, modifier un creneau et enregistrer.
3. Dans la seconde, **sans recharger**, modifier le meme creneau.

**A observer.** La seconde modification est **refusee** avec
« Cet evenement a ete modifie par un autre admin. Rechargez pour voir la
version a jour. » Le travail du premier n'est pas ecrase en silence. Le numero
de version est affiche sous le formulaire.

> **Verifie par un test** — la seconde ecriture sur la meme version est
> refusee et la premiere valeur est conservee.

## C4. Pendant la collecte, le brouillon des affectations reste invisible

**Comptes.** `noa.bertrand@exemple.test` puis `elias.marchand@exemple.test`

1. Avec Noa, affecter quelqu'un sur *le dimanche en collecte*.
2. Avec Elias, ouvrir le meme evenement, onglet **Equipes et postes**.

**A observer.** Elias peut consulter l'evenement et repondre, mais voit
**« Plan non encore publie »** : les affectations en preparation restent
reservees aux admins jusqu'a la publication. La soiree d'anniversaire, encore
en brouillon, n'apparait elle nulle part pour un membre.

> **Verifie par quatre tests** — collecte sans exposition du plan, brouillon
> invisible, publication qui revele, archive en lecture seule.

## C5. Un membre retire cesse de recevoir du contenu

**Compte.** `noa.bertrand@exemple.test`

1. **Membres** → retirer un membre.
2. Observer le message de confirmation, puis la section
   **« Acces revoques »**.

**A observer.** L'acces est revoque, ses **affectations futures** passent a
« a remplacer » et les admins sont prevenus. Ses archives sont conservees : on
n'efface rien sans politique explicite. Il ne recoit plus aucun nouveau
message, et une notification deja en file pour lui est **ecartee avant
l'envoi** apres revalidation de ses droits.

> **Verifie par trois tests** — exclusion des nouveaux messages, perte
> d'acces a la discussion, exclusion avant envoi.

## C6. Les emails ne sont pas annonces a tort

**Compte.** n'importe lequel

Ouvrir `/dev/boite-mail`.

**A observer.** La page annonce **« Fournisseur d'email : aucun »** et toutes
les taches restent a l'etat **« Enregistre en base »**. Aucun ecran ne dit
« email envoye », parce que rien n'a ete envoye. Chaque tache porte une cle
d'idempotence : une reprise n'enverra pas deux fois le meme message.

`npm run outbox` affiche un rapport honnete, qui distingue les taches
considerees, celles ecartees faute d'acces, et celles laissees enregistrees.

> **Verifie par plusieurs tests** — idempotence, exclusion d'un destinataire
> retire, et absence de rappel dont l'echeance est passee.

## C7. L'application reste utilisable sur un telephone

**Compte.** n'importe lequel

Reduire la fenetre a 390 px de large, ou utiliser l'inspecteur mobile. Puis
zoomer a 200 %.

**A observer.** La navigation basse se limite aux actions frequentes, le
selecteur de communaute passe en haut, et les grandes grilles deviennent des
**cartes contenant la meme information** — motifs prives compris, pour qui a
le droit de les lire. La page **ne defile jamais horizontalement** : seules
les grilles defilent, dans leur propre cadre, avec leurs en-tetes figees.

Chaque statut porte un **libelle ecrit** et un signe, en plus de sa couleur :
« Disponible ✓ », « Indisponible ✕ », « A renseigner — »,
« A reconfirmer ! ». Tout est atteignable au clavier, et le premier element
tabulable est le lien « Aller au contenu principal ».

> **Verifie par six tests** sur un profil mobile — absence de debordement a
> 390 px et a 200 % de zoom, libelles presents, clavier.

---

## Ce que ces scenarios ne couvrent pas

Par honnetete, voici ce que vous **ne pourrez pas** eprouver dans cette
version :

- **L'envoi reel d'un email.** Aucun fournisseur n'est configure, et le code
  d'envoi n'a jamais ete exerce.
- **Le comportement sur PostgreSQL.** Les migrations, les regles d'acces en
  base et les operations atomiques SQL sont ecrites mais **jamais executees** :
  le chemin eprouve est le magasin local de demonstration.
- **La messagerie en temps reel.** Les messages sont conserves et relus a
  chaque affichage ; ils n'arrivent pas d'eux-memes.
- **L'extraction automatique des moodboards depuis le classeur.** Vous pouvez
  televerser des visuels dans l'application, mais les images contenues dans le
  fichier Excel sont seulement detectees et signalees : leur association a une
  date reste a confirmer a la main.
- **La recurrence, les suggestions de repartition et l'installation PWA**,
  prevues pour un lot ulterieur.
- **Un audit d'accessibilite outille.** Les contrastes ont ete calcules, le
  clavier teste, mais aucun outil automatise ni lecteur d'ecran n'a ete passe.
- **Les performances.** Aucun chiffre n'est annonce : le jeu de donnees,
  l'appareil et les conditions de mesure n'ont pas ete definis.
