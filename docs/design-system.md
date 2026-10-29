# Design system

Les jetons vivent dans `src/app/globals.css`, sous `@theme`. Tailwind 4 en
derive les utilitaires : `--color-nuit` donne `text-nuit`, `bg-nuit`,
`border-nuit`.

## Intentions

L'application sert a repondre vite sur un telephone, et a organiser
confortablement sur un ordinateur. Les ecrans operationnels privilegient donc
la lisibilite des dates, des roles, des lieux et des actions. Le dress-code
est le seul espace reellement visuel.

Elle s'utilise souvent le soir, en studio ou en regie, lumieres baissees :
l'apparence sombre est donc celle par defaut.

Elle doit aussi etre utilisable par des personnes peu familieres des outils
numeriques : libelles explicites, parcours courts, messages qui disent ce qui
s'est passe.

## Deux palettes, un seul jeu de jetons

L'application a une apparence **sombre par defaut** et une apparence claire.
Les composants n'ont **aucune variante `dark:`** : seules les valeurs des
jetons changent. Il n'y a donc qu'une definition par regle de style, et pas
deux verites a maintenir.

Le serveur pose toujours `data-theme="dark"` ou `data-theme="light"` sur
`<html>`, d'apres un cookie lu avant le premier rendu. Consequence voulue :
**aucun scintillement** au chargement.

Le choix se fait dans **Profil > Apparence**. C'est une preference
d'appareil, pas de compte : la meme personne peut vouloir le sombre sur son
telephone le soir et le clair sur l'ordinateur du studio.

La preference du systeme (`prefers-color-scheme`) n'est pas suivie
automatiquement. La supporter demanderait de dupliquer tout le bloc de jetons
sombres dans une regle `@media`, donc deux endroits a garder synchronises.
C'est un compromis assume, pas un oubli.

Une seule exception a la bascule : la **version imprimable** garde la palette
claire quel que soit le theme, via la classe `.feuille-impression`. Un fond
sombre ne s'imprime pas.

## Identite

La palette reprend celle du **logo Air France** : un bleu marine profond, un
bleu vif pour ce sur quoi on agit, et le rouge de la bande en signature.

Le partage des roles suit celui de la marque, et ce n'est pas un detail :
**l'accent est bleu, pas rouge**. Le rouge d'Air France ponctue — la bande du
logo, un filet sous un titre, une etiquette — mais ne porte pas l'interface.
Un bouton rouge sur « Je suis disponible » se lirait comme une alerte, et
entrerait en concurrence avec l'etat « indisponible », qui est rouge lui
aussi et porte un sens.

Les noms de jetons disent un **role**, pas une couleur : `--color-accent` et
non `--color-bleu`. Changer d'identite reste ainsi un changement de
`globals.css` seul.

## Couleurs - palette claire

Contrastes calcules sur le fond de page `#f1f5fa`.

| Jeton | Valeur | Contraste | Usage |
| --- | --- | --- | --- |
| `--color-ivoire` | `#f1f5fa` | — | Fond de l'application |
| `--color-ivoire-fonce` | `#e2e9f3` | — | Zones secondaires, lignes paires |
| `--color-surface` | `#ffffff` | — | Cartes |
| `--color-nuit` | `#002157` | **14,2:1** | Texte principal, marine du logo |
| `--color-nuit-doux` | `#41526f` | **7,2:1** | Texte secondaire |
| `--color-nuit-tres-doux` | `#5e6e8a` | **4,7:1** | Mentions discretes, texte non essentiel |
| `--color-accent` | `#0b4ea2` | **7,3:1** | Accent, boutons principaux, liens |
| `--color-accent-fort` | `#073a7a` | 9,4:1 sur accent pale | Survol, texte sur aplat d'accent pale |
| `--color-accent-pale` | `#e3edfa` | — | Fond d'accent |
| `--color-secondaire` | `#c8102e` | **5,4:1** | Signature : filets, etiquettes, rouge du logo |
| `--color-secondaire-clair` | `#e23b50` | — | Aplats decoratifs |
| `--color-secondaire-pale` | `#fce7ea` | — | Fond d'etiquette de signature |
| `--color-bordure` | `#e2e2e2` | — | Bords de cadre et separateurs |
| `--color-bordure-forte` | `#8a8a8a` | **3,5:1** | Champs et composants d'interface |
| `--color-sur-accent` | `#ffffff` | 8,0:1 sur l'accent | Texte pose sur un aplat d'accent |

Les trois couleurs de texte depassent 4,5:1 ; les deux premieres depassent 7:1.
Les variantes claires ne portent jamais de texte : elles sont reservees aux
filets et aux aplats, ou le contraste de texte ne s'applique pas.

## Couleurs - palette sombre

Contrastes calcules sur la surface des cartes `#002157`, sauf mention
contraire. La page est plus sombre que les cartes, qui ressortent ainsi sans
avoir besoin d'ombres marquees.

| Jeton | Valeur | Contraste | Usage |
| --- | --- | --- | --- |
| `--color-ivoire` | `#001636` | — | Fond de page |
| `--color-ivoire-fonce` | `#002045` | — | Zones secondaires, lignes paires |
| `--color-surface` | `#002157` | — | Cartes, marine du logo |
| `--color-nuit` | `#eef3fa` | **13,9:1** | Texte principal |
| `--color-nuit-doux` | `#b5c4da` | **8,8:1** | Texte secondaire |
| `--color-nuit-tres-doux` | `#91a3bf` | **6,0:1** | Mentions discretes |
| `--color-accent` | `#7fb2f0` | **7,0:1** | Accent, liens, aplats de bouton |
| `--color-accent-fort` | `#a9ccf7` | 7,4:1 sur accent pale | Survol, texte sur fond d'accent |
| `--color-accent-pale` | `#0b3566` | — | Fond d'accent |
| `--color-sur-accent` | `#001636` | **8,2:1** sur l'accent | Texte pose sur un aplat d'accent |
| `--color-secondaire` | `#ff8a96` | **6,9:1** | Signature : filets, etiquettes |
| `--color-secondaire-clair` | `#ff6273` | — | Aplats decoratifs |
| `--color-secondaire-pale` | `#3a1220` | — | Fond d'etiquette de signature |
| `--color-bordure` | `#3a3a3a` | — | Bords de cadre et separateurs |
| `--color-bordure-forte` | `#707070` | **3,2:1** | Champs et composants d'interface |

Trois points ont demande une decision :

- **Les bords de cadre sont achromatiques dans les deux palettes.** Un cadre
  se dessine par une valeur de gris, pas par une teinte : les seules couleurs
  de l'interface sont alors porteuses de sens — l'accent, la signature, et les
  quatre etats. Les bords beiges et bleu-gris d'avant entraient en concurrence
  avec elles.

- **Le texte pose sur un aplat d'accent change de couleur selon le theme.**
  En clair, l'accent est un bleu fonce qui porte du blanc. En sombre,
  l'accent est un bleu pale, et du blanc dessus serait illisible : il porte
  donc du bleu nuit. D'ou le jeton `--color-sur-accent`, qui a remplace tous
  les `text-white` codes en dur.
- **La bordure forte vise 3:1**, pas 4,5:1. C'est le seuil du critere
  « Non-text Contrast » pour les champs de formulaire et les composants
  d'interface, qui ne sont pas du texte.

### Etats

Chaque etat a un couple fond / texte, et **toujours un libelle ecrit**.

Palette claire :

| Etat | Fond | Texte | Contraste | Libelle | Signe |
| --- | --- | --- | --- | --- | --- |
| Disponible | `#dcfce7` | `#14532d` | 10,1:1 | « Disponible » | ✓ |
| Indisponible | `#ffe4e6` | `#9f1239` | 6,8:1 | « Indisponible » | ✕ |
| A renseigner | `#eef1f6` | `#3f4a5f` | 7,9:1 | « A renseigner » | — |
| A reconfirmer | `#fdf0d9` | `#7c3c00` | 7,2:1 | « A reconfirmer » | ! |

Palette sombre. Les roles sont inverses : fond sourd, texte vif.

| Etat | Fond | Texte | Contraste |
| --- | --- | --- | --- |
| Disponible | `#123524` | `#86efac` | 9,6:1 |
| Indisponible | `#3f1620` | `#fda4af` | 8,2:1 |
| A renseigner | `#1e2639` | `#cbd5e1` | 10,2:1 |
| A reconfirmer | `#3a2a10` | `#fcd34d` | 9,6:1 |

Les libelles et les signes sont identiques dans les deux palettes : la couleur
ne porte jamais seule l'information, et changer de theme ne change pas la
facon de lire un statut.

**La couleur ne porte jamais seule l'information.** Un badge combine un
libelle, un signe et une couleur ; n'importe lequel des trois suffit a
comprendre. Les blocs d'alerte sont prefixes par « Information »,
« Attention », « Erreur » ou « Termine ».

Les couleurs de dress-code sont affichees comme pastilles **avec leur code
ecrit a cote** : une consigne « bleu nuit » reste lisible sans percevoir la
couleur.

## Typographie

Inter, avec la pile systeme en secours : `"Segoe UI", system-ui,
-apple-system, "Helvetica Neue", Arial, sans-serif`. Chaque famille a donc un
vrai repli.

| Usage | Taille | Interlignage |
| --- | --- | --- |
| Corps | 1 rem (16 px) | 1,55 |
| Titre de page (`h1`) | 1,5 → 1,875 rem | 1,25 |
| Titre de carte (`h2`) | 1 → 1,125 rem | 1,25 |
| Secondaire | 0,875 rem | 1,55 |
| Mention | 0,75 rem | 1,55 |

Le corps reste a 16 px : c'est ce qui evite le zoom automatique des champs sur
iOS et ce qui se lit le plus facilement.

## Espacement

`--spacing: 0.25rem` (4 px). Les ecrans utilisent des multiples pairs — `p-2`,
`p-4`, `gap-6` — ce qui donne la **grille de 8 px** annoncee.

Rayons : `--radius-doux` 10 px pour les controles, `--radius-carte` 14 px pour
les cartes. Ombres discretes (`--shadow-carte`), une seule ombre plus marquee
pour les elements flottants.

## Composants

`src/components/ui/`

| Composant | Points notables |
| --- | --- |
| `Button` | 4 variantes, 2 tailles, hauteur minimale 44 px |
| `SubmitButton` | Se desactive pendant l'envoi via `useFormStatus` : **un double clic ne declenche pas deux fois l'action**, et annonce `aria-busy` |
| `Card`, `CardHeader`, `CardBody` | Niveau de titre reglable, pour garder une hierarchie correcte |
| `Badge` | Libelle obligatoire, signe facultatif, 7 tons |
| `Champ` | Label, aide et erreur relies par `aria-describedby`. Marque « facultatif » explicitement plutot que de laisser deviner |
| `Input`, `Textarea`, `Select` | Hauteur minimale 44 px, 16 px de texte |
| `Alerte` | `role="alert"` pour les erreurs, `role="status"` sinon |
| `EtatVide` | Titre, explication, action suggeree |
| `Avatar` | Initiales, `aria-hidden` car le nom est toujours ecrit a cote |
| `GrilleDefilante` | Conteneur a defilement propre, en-tetes figees |

## Accessibilite

Cible : **WCAG 2.2 niveau AA**. Mesures en place :

- **Focus visible** partout : contour d'accent de 3 px avec decalage de 2 px, et
  contour blanc sur fond fonce.
- **Lien de saut** vers le contenu principal, premier element au clavier.
  Verifie au navigateur, y compris son effet.
- **Navigation complete au clavier** : tout est lien, bouton ou champ natif.
  Aucun glisser-deposer n'est necessaire — le reordonnancement passe par des
  champs numeriques et des boutons.
- **Noms accessibles** sur les boutons d'icone : « Retirer Noa Bertrand de ce
  poste », pas « Retirer ».
- **Vues alternatives** : chaque grille a une vue en cartes sur petit ecran,
  avec le meme contenu.
- **Mouvement reduit** : `prefers-reduced-motion` neutralise animations et
  transitions.
- **Zoom 200 %** verifie au navigateur, sans debordement horizontal.
- `lang="fr"` sur `<html>`, et un seul `h1` par page.
- **Deux apparences** aux contrastes calcules, au choix de la personne. Le
  theme sombre n'est pas un filtre applique au theme clair : chaque valeur a
  ete choisie et verifiee.
- `color-scheme` suit le theme, donc les ascenseurs et les controles natifs du
  navigateur s'accordent a l'interface.

Les cibles tactiles visent environ **44 px**, comme choix de confort. Ce n'est
pas presente comme la regle universelle du niveau AA : le critere
« Target Size (Minimum) » de WCAG 2.2 demande 24 px avec des exceptions.

### Contrastes verifies automatiquement

Les valeurs de ce document ne sont pas declaratives : `tests/unit/contrastes.test.ts`
les recalcule depuis `globals.css` a chaque execution de la suite. 24
controles couvrent, pour les deux palettes, le texte principal (7:1), le texte
secondaire et les mentions (4,5:1), l'accent, la signature, les quatre couples
d'etat, la bordure des champs (3:1) et le caractere achromatique des bords.

Ce test a d'ailleurs trouve un defaut reel : en palette claire, les mentions
discretes etaient a 4,30:1, sous le seuil, alors que ce document annoncait
4,6:1. La couleur a ete corrigee.

### Ce qui n'a pas ete verifie

Aucun audit automatise de bout en bout (axe, Lighthouse) n'a ete execute : le
reseau de ce poste bloque le telechargement de l'outillage correspondant. Les
parcours clavier sont testes au navigateur, mais un audit complet reste a
faire — notamment avec un lecteur d'ecran reel.

Le respect de `prefers-color-scheme` n'est pas implemente : voir la section
sur les deux palettes pour la raison.

## Largeurs verifiees

| Largeur | Disposition |
| --- | --- |
| 360 px | Une colonne, navigation basse, vues en cartes |
| 390 px | Idem, teste au navigateur (profil Pixel 5) |
| 768 px | Deux colonnes, grille du calendrier |
| 1440 px | Barre laterale, selecteur de communaute visible, deux colonnes |

Un gouttiere laterale d'au moins 16 px est maintenue partout. Tableaux,
diagrammes et grilles defilent dans leur propre conteneur : la page ne defile
jamais horizontalement, ce qui est verifie au navigateur sur l'agenda et le
tableau.

## Navigation

**Ordinateur** : barre laterale avec le selecteur de communaute toujours
visible, liens generaux puis liens de la communaute active. Les outils
d'administration apparaissent uniquement dans la communaute concernee, et
uniquement pour un admin.

**Mobile** : selecteur de communaute en haut, barre basse limitee aux actions
frequentes (Accueil, Planning, Notifications), et une barre de sections
defilante pour le reste. Les encoches sont respectees via
`env(safe-area-inset-*)`.

## Impression

`.sans-impression` masque navigation et actions. La version imprimable d'un
evenement est une page dediee, sobre, en tableaux, sans couleur necessaire a
la comprehension, et **sans motif prive**.

Elle porte la classe `.feuille-impression`, qui redeclare localement les
jetons clairs : meme consultee en theme sombre, elle reste noire sur blanc.
Verifie au navigateur.

## Nom et identite

« Diapason » est un nom provisoire, centralise dans `src/lib/brand.ts`. Aucun
logo officiel n'a ete invente : l'identite se limite a une typographie, une
palette et un filet de signature. Le sous-titre « MLA - ICC La Defense » situe le
contexte sans usurper une identite institutionnelle.
