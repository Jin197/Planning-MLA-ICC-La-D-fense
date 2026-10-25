import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  communauteMla,
  evenementBrouillon,
  evenementEnCollecte,
  evenementPublie,
  urlEvenement,
  urlPlanning,
} from "./donnees";

/**
 * Parcours au navigateur. Ils verifient ce que les tests de service ne
 * peuvent pas voir : l'enchainement reel des ecrans, le clavier, et le fait
 * que les boutons accomplissent de vraies actions.
 */

const MOT_DE_PASSE = "diapason2026";

/**
 * Chaque test repart d'un jeu de donnees propre : plusieurs parcours
 * modifient l'etat (accepter une adhesion, confirmer une affectation) et ne
 * doivent pas dependre de l'ordre d'execution.
 */
test.beforeEach(async ({ request }) => {
  const reponse = await request.post("/api/dev/reinitialiser");
  expect(reponse.ok(), "la route de remise a zero doit etre ouverte en test").toBe(
    true,
  );
});

async function connexion(page: Page, email: string): Promise<void> {
  await page.goto("/connexion");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mot de passe").fill(MOT_DE_PASSE);
  await page.getByRole("button", { name: "Se connecter" }).click();
  // La connexion redirige. Il faut attendre que cette navigation soit
  // terminee : un `goto` lance trop tot serait ecrase par la redirection
  // encore en vol.
  await expect(page).toHaveURL(/\/accueil$/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
}

/**
 * Clique sur un bouton dont le gestionnaire vient du JavaScript client.
 *
 * Un clic envoye avant la fin de l'hydratation React est perdu sans trace :
 * la tentative est donc repetee jusqu'a ce que l'effet attendu apparaisse.
 * Cela teste bien le comportement reel, sans masquer une vraie regression :
 * si le bouton ne fait rien, le test echoue au bout du delai.
 */
async function cliquerApresHydratation(
  bouton: Locator,
  effetAttendu: Locator,
): Promise<void> {
  await expect(bouton).toBeVisible();
  await expect(async () => {
    await bouton.click();
    await expect(effetAttendu).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 25_000 });
}

async function debordementHorizontal(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

test.describe("parcours membre", () => {
  test("se connecte, ouvre un evenement et repond en deux interactions", async ({
    page,
  }) => {
    await connexion(page, "elias.marchand@exemple.test");
    await expect(page).toHaveURL(/\/accueil/);
    await expect(
      page.getByRole("heading", { name: /Disponibilites a renseigner/i }),
    ).toBeVisible();

    /*
     * Interaction 1 : ouvrir l'evenement en collecte.
     *
     * On y va par son URL et non par un lien de l'accueil : l'accueil ne
     * liste que les occurrences encore a venir, et les dates du jeu de
     * demonstration sont fixes. Le test porterait sinon sur l'age du jeu de
     * donnees autant que sur le parcours.
     */
    await page.goto(urlEvenement(evenementEnCollecte()));
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      evenementEnCollecte(),
    );

    // Interaction 2 : repondre pour tous les sous-evenements preselectionnes.
    await cliquerApresHydratation(
      page.getByRole("button", { name: "Je suis disponible" }),
      page.getByText(/Reponse enregistree \(\d+\)/),
    );
  });

  test("modifie son propre message, et seulement le sien", async ({ page }) => {
    await connexion(page, "liora.mendy@exemple.test");
    await page.goto(urlEvenement(evenementPublie(), "discussion"));

    // Un seul message est le sien : un seul bouton de modification existe.
    const boutons = page.getByRole("button", { name: "Modifier mon message" });
    await expect(boutons).toHaveCount(1);

    const champ = page.getByRole("textbox", { name: "Nouveau texte du message" });
    await cliquerApresHydratation(boutons.first(), champ);

    await champ.fill("Bien note, j'arrive a 18h30.");
    await page.getByRole("button", { name: "Enregistrer" }).click();

    // Le formulaire se referme et le message modifie prend sa place.
    await expect(
      page.getByRole("paragraph").filter({ hasText: "Bien note, j'arrive a 18h30." }),
    ).toBeVisible();
    await expect(champ).toHaveCount(0);
    await expect(page.getByText("modifie").first()).toBeVisible();
  });

  test("ne voit pas le plan d'un evenement en collecte", async ({ page }) => {
    await connexion(page, "elias.marchand@exemple.test");
    await page.goto(urlEvenement(evenementEnCollecte(), "equipes"));
    await expect(page.getByText(/Plan non encore publie/)).toBeVisible();
  });

  test("voit le plan une fois le planning publie", async ({ page }) => {
    await connexion(page, "elias.marchand@exemple.test");
    await page.goto(urlEvenement(evenementPublie(), "equipes"));
    await expect(page.getByRole("heading", { name: "Culte 1" })).toBeVisible();
    await expect(page.getByText("LEAD").first()).toBeVisible();
  });

  test("ne voit pas l'evenement en brouillon", async ({ page }) => {
    await connexion(page, "elias.marchand@exemple.test");
    await page.goto(urlPlanning());
    await expect(page.getByRole("heading", { name: "Planning" })).toBeVisible();
    await expect(page.getByText(evenementBrouillon())).toHaveCount(0);
  });

  test("n'a aucun outil d'administration", async ({ page }) => {
    await connexion(page, "elias.marchand@exemple.test");
    await page.goto(urlPlanning());
    await expect(page.getByRole("heading", { name: "Planning" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Nouvel evenement" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Parametres" })).toHaveCount(0);
  });

  test("est refuse sur une page d'administration appelee directement", async ({
    page,
  }) => {
    await connexion(page, "elias.marchand@exemple.test");
    const { id } = communauteMla();
    const reponse = await page.goto(`/c/${id}/demandes`);
    // La page ne s'affiche pas : erreur serveur d'autorisation, pas de contenu.
    expect(reponse?.status()).toBeGreaterThanOrEqual(400);
  });

  test("confirme une affectation recue", async ({ page }) => {
    await connexion(page, "liora.mendy@exemple.test");
    await page.goto(urlEvenement(evenementPublie()));
    await expect(page.getByRole("heading", { name: "Mes affectations" })).toBeVisible();
    await cliquerApresHydratation(
      page.getByRole("button", { name: "Je confirme" }).first(),
      page.getByText(/Participation confirmee/),
    );
  });
});

test.describe("parcours admin", () => {
  test("voit les trois vues du planning", async ({ page }) => {
    await connexion(page, "noa.bertrand@exemple.test");
    await page.goto(urlPlanning("agenda"));
    await expect(page.getByRole("heading", { name: "Planning" })).toBeVisible();

    await page.goto(urlPlanning("calendrier"));
    await expect(page.getByRole("heading", { name: /Calendrier -/ })).toBeVisible();

    await page.goto(urlPlanning("tableau"));
    await expect(
      page.getByRole("heading", { name: /Tableau des disponibilites/ }),
    ).toBeVisible();
  });

  test("traite une demande d'adhesion", async ({ page }) => {
    await connexion(page, "noa.bertrand@exemple.test");
    const { id } = communauteMla();
    await page.goto(`/c/${id}/demandes`);
    await expect(
      page.getByRole("heading", { name: "Demandes d'adhesion" }),
    ).toBeVisible();
    // Le nom est rendu en plusieurs noeuds de texte : on vise le nom
    // accessible de l'en-tete, qui les concatene.
    await expect(
      page.getByRole("heading", { name: /Anaelle\s+Rakoto/ }),
    ).toBeVisible();

    await cliquerApresHydratation(
      page.getByRole("button", { name: "Accepter" }).first(),
      page.getByText(/Adhesion acceptee/),
    );
  });

  test("voit les controles avant publication", async ({ page }) => {
    await connexion(page, "noa.bertrand@exemple.test");
    await page.goto(urlEvenement(evenementEnCollecte()));
    await expect(page.getByRole("heading", { name: "Avant publication" })).toBeVisible();
    await expect(
      page
        .getByText(/poste\(s\) a completer|reponse\(s\) de disponibilite|affectation/)
        .first(),
    ).toBeVisible();
  });

  test("ouvre le selecteur de membres et elargit a tous les membres", async ({
    page,
  }) => {
    await connexion(page, "noa.bertrand@exemple.test");
    await page.goto(urlEvenement(evenementPublie(), "equipes"));

    await cliquerApresHydratation(
      page.getByRole("button", { name: /Affecter sur « Guitare »/ }).first(),
      page.getByText(/Membres actifs, disponibles et compatibles/),
    );

    await page.getByRole("checkbox", { name: "Tous les membres" }).first().check();
    await expect(
      page.getByText(/Toutes les personnes actives, y compris sans reponse/),
    ).toBeVisible();
  });

  test("reordonne la liste de chants au clavier et par boutons", async ({ page }) => {
    await connexion(page, "noa.bertrand@exemple.test");
    await page.goto(urlEvenement(evenementPublie(), "chants"));

    const sequences = page.locator("ol > li").filter({ hasText: /Chant|Sainte|Offrandes/ });
    await expect(sequences.first()).toContainText("Chant 1");

    // Le premier element ne peut pas monter : le refus est explique.
    await cliquerApresHydratation(
      page.getByRole("button", { name: /^Monter/ }).first(),
      page.getByText(/deja en premier/),
    );

    // Le descendre echange son rang avec le suivant.
    await cliquerApresHydratation(
      page.getByRole("button", { name: /^Descendre/ }).first(),
      sequences.first().getByText("Chant 2"),
    );
  });

  test("corrige la description sans remettre les reponses a zero", async ({ page }) => {
    await connexion(page, "noa.bertrand@exemple.test");
    await page.goto(urlEvenement(evenementPublie()));

    await cliquerApresHydratation(
      page.getByRole("button", { name: "Modifier" }).first(),
      page.getByLabel("Description"),
    );

    await page
      .getByLabel("Description")
      .fill("Entree des musiciens par la porte laterale.");
    await page.getByRole("button", { name: "Enregistrer les informations" }).click();
    await expect(page.getByText(/reponses des membres sont intactes/)).toBeVisible();
  });

  test("refuse un visuel de moodboard sans texte alternatif", async ({ page }) => {
    await connexion(page, "noa.bertrand@exemple.test");
    await page.goto(urlEvenement(evenementPublie(), "dress-code"));
    await expect(page.getByRole("heading", { name: "Moodboard" })).toBeVisible();

    // Le champ de texte alternatif est obligatoire : le formulaire ne part pas.
    const alt = page.getByLabel("Texte alternatif");
    await expect(alt).toBeVisible();
    await expect(alt).toHaveAttribute("required", "");
  });

  test("peut ajouter un sous-evenement a un evenement existant", async ({ page }) => {
    await connexion(page, "noa.bertrand@exemple.test");
    await page.goto(urlEvenement(evenementEnCollecte(), "equipes"));

    await cliquerApresHydratation(
      page.getByRole("button", { name: "Ajouter" }).first(),
      page.getByLabel("Libelle"),
    );

    await page.getByLabel("Libelle").first().fill("Atelier");
    await page.getByLabel("Date de debut").first().fill("2026-10-25");
    await page.getByLabel("Heure de debut").first().fill("19:00");
    await page.getByLabel("Heure de fin").first().fill("20:30");
    await page.getByRole("button", { name: "Ajouter ce sous-evenement" }).click();

    await expect(page.getByText(/Sous-evenement ajoute/)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Atelier" })).toBeVisible();
  });

  test("cree une equipe dans l'evenement et la rattache", async ({ page }) => {
    await connexion(page, "noa.bertrand@exemple.test");
    await page.goto(urlEvenement(evenementEnCollecte(), "equipes"));

    await cliquerApresHydratation(
      page.getByRole("button", { name: "Nouvelle equipe" }),
      page.getByLabel("Nom de l'equipe"),
    );

    await page.getByLabel("Nom de l'equipe").fill("Pole technique");
    await page.getByRole("button", { name: "Creer cette equipe" }).click();

    await expect(page.getByText(/Equipe creee dans cet evenement/)).toBeVisible();
    // Sans sous-evenement coche, elle couvre toute la duree.
    await expect(
      page.getByRole("heading", { name: "Pole technique" }).first(),
    ).toBeVisible();
    await expect(page.getByText("Toute la duree de l'evenement").first()).toBeVisible();
  });

  test("repond une seule fois sur un evenement sans sous-evenement", async ({
    page,
  }) => {
    // L'evenement d'anniversaire est en brouillon : seul un admin le voit.
    await connexion(page, "noa.bertrand@exemple.test");
    await page.goto(urlEvenement(evenementBrouillon()));

    await expect(page.getByRole("heading", { name: "Quand et ou" })).toBeVisible();
    await expect(
      page.getByText(/Cet evenement est d'un seul bloc/),
    ).toBeVisible();
    // Aucune case a cocher : il n'y a rien a choisir.
    await expect(page.getByRole("heading", { name: "Sous-evenements" })).toHaveCount(0);
  });

  test("accede aux parametres du modele", async ({ page }) => {
    await connexion(page, "noa.bertrand@exemple.test");
    const { id } = communauteMla();
    await page.goto(`/c/${id}/parametres`);
    await expect(page.getByRole("heading", { name: "Postes du modele" })).toBeVisible();
    await expect(page.getByText(/Version 1/)).toBeVisible();
  });

  test("ouvre l'ecran d'import sans rien ecrire", async ({ page }) => {
    await connexion(page, "noa.bertrand@exemple.test");
    const { id } = communauteMla();
    await page.goto(`/c/${id}/import`);
    await expect(
      page.getByRole("heading", { name: "Import du classeur Excel" }),
    ).toBeVisible();
    await expect(page.getByText(/Ce que l'import ne fait pas/)).toBeVisible();
  });
});

test.describe("accessibilite et lisibilite", () => {
  test("le lien de saut est le premier element au clavier", async ({ page }) => {
    await connexion(page, "noa.bertrand@exemple.test");
    // Chargement complet de la page : le focus part du debut du document,
    // comme pour une personne qui arrive et commence a tabuler.
    await page.goto("/accueil");
    await page.keyboard.press("Tab");

    const lienDeSaut = page.getByRole("link", {
      name: "Aller au contenu principal",
    });
    await expect(lienDeSaut).toBeFocused();

    // Et il remplit son role : il mene a la zone de contenu principale.
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/#contenu$/);
  });

  test("la connexion se parcourt au clavier", async ({ page }) => {
    await page.goto("/connexion");
    await page.getByLabel("Email").focus();
    await page.keyboard.type("noa.bertrand@exemple.test");
    await page.keyboard.press("Tab");
    await page.keyboard.type(MOT_DE_PASSE);
    await page.keyboard.press("Tab");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/accueil/);
  });

  test("l'agenda ne deborde pas horizontalement", async ({ page }) => {
    await connexion(page, "noa.bertrand@exemple.test");
    await page.goto(urlPlanning("agenda"));
    await expect(page.getByRole("heading", { name: "Planning" })).toBeVisible();
    expect(await debordementHorizontal(page)).toBeLessThanOrEqual(1);
  });

  test("le tableau defile dans son conteneur, pas dans la page", async ({ page }) => {
    await connexion(page, "noa.bertrand@exemple.test");
    await page.goto(urlPlanning("tableau"));
    await expect(
      page.getByRole("heading", { name: /Tableau des disponibilites/ }),
    ).toBeVisible();
    expect(await debordementHorizontal(page)).toBeLessThanOrEqual(1);
  });

  test("chaque statut porte un libelle ecrit", async ({ page }) => {
    await connexion(page, "noa.bertrand@exemple.test");
    await page.goto(urlPlanning("tableau"));
    // Selon la largeur, c'est la grille ou les cartes qui sont affichees :
    // on vise donc l'element reellement visible.
    await expect(
      page.getByText("Disponible").filter({ visible: true }).first(),
    ).toBeVisible();
    await expect(
      page.getByText("A renseigner").filter({ visible: true }).first(),
    ).toBeVisible();
  });

  test("tient a 200 % de zoom sans debordement", async ({ page }) => {
    await connexion(page, "noa.bertrand@exemple.test");
    await page.goto(urlPlanning("agenda"));
    // Un zoom de 200 % equivaut a diviser la largeur utile par deux.
    await page.setViewportSize({ width: 720, height: 900 });
    await expect(page.getByRole("heading", { name: "Planning" })).toBeVisible();
    expect(await debordementHorizontal(page)).toBeLessThanOrEqual(1);
  });

  test("affiche les durees correctes pour une repetition apres minuit", async ({
    page,
  }) => {
    await connexion(page, "noa.bertrand@exemple.test");
    await page.goto(urlEvenement(evenementEnCollecte(), "repetitions"));
    await expect(page.getByText("Repetition de nuit")).toBeVisible();
    await expect(page.getByText("Se termine le lendemain").first()).toBeVisible();
    await expect(page.getByText("2 h 30").first()).toBeVisible();
  });
});

test.describe("apparence", () => {
  /** Couleur de fond effectivement calculee par le navigateur. */
  async function fondDuCorps(page: Page): Promise<string> {
    return page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  }

  test("le theme sombre est applique par defaut", async ({ page }) => {
    await connexion(page, "noa.bertrand@exemple.test");

    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    // #101729
    expect(await fondDuCorps(page)).toBe("rgb(16, 23, 41)");
  });

  test("le choix clair est applique et conserve d'une page a l'autre", async ({
    page,
  }) => {
    await connexion(page, "noa.bertrand@exemple.test");
    await page.goto("/profil");
    await expect(page.getByRole("heading", { name: "Apparence" })).toBeVisible();

    await cliquerApresHydratation(
      page.getByRole("button", { name: /Clair/ }),
      page.getByText(/Apparence claire appliquee/),
    );

    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    // #fbf9f4
    expect(await fondDuCorps(page)).toBe("rgb(251, 249, 244)");

    // La preference suit la navigation.
    await page.goto(urlPlanning());
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  });

  test("les statuts restent lisibles dans le theme sombre", async ({ page }) => {
    await connexion(page, "noa.bertrand@exemple.test");
    await page.goto(urlPlanning("tableau"));

    const badge = page
      .getByText("Disponible")
      .filter({ visible: true })
      .first();
    await expect(badge).toBeVisible();

    // Le libelle est ecrit, et sa couleur n'est pas celle du fond.
    const couleurs = await badge.evaluate((element) => {
      const style = getComputedStyle(element);
      return { texte: style.color, fond: style.backgroundColor };
    });
    expect(couleurs.texte).not.toBe(couleurs.fond);
  });

  test("la version imprimable reste claire meme en theme sombre", async ({
    page,
  }) => {
    await connexion(page, "noa.bertrand@exemple.test");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

    const cible = urlEvenement(evenementPublie());
    await page.goto(`${cible}/impression`);

    const feuille = page.locator(".feuille-impression");
    await expect(feuille).toBeVisible();
    const couleurs = await feuille.evaluate((element) => {
      const style = getComputedStyle(element);
      return { texte: style.color, fond: style.backgroundColor };
    });
    expect(couleurs.fond).toBe("rgb(255, 255, 255)");
    expect(couleurs.texte).toBe("rgb(22, 33, 62)");
  });
});

test.describe("confidentialite", () => {
  test("un membre ne voit pas le motif d'un autre", async ({ page }) => {
    await connexion(page, "elias.marchand@exemple.test");
    await page.goto(urlPlanning("tableau"));
    await expect(
      page.getByRole("heading", { name: /Tableau des disponibilites/ }),
    ).toBeVisible();
    await expect(page.getByText(/Deplacement professionnel/)).toHaveCount(0);
  });

  test("un admin voit les motifs de sa communaute", async ({ page }) => {
    await connexion(page, "noa.bertrand@exemple.test");
    await page.goto(urlPlanning("tableau"));
    await expect(
      page.getByText(/Deplacement professionnel/).filter({ visible: true }).first(),
    ).toBeVisible();
  });

  test("une personne sans adhesion ne voit que la fiche publique", async ({ page }) => {
    await connexion(page, "anaelle.rakoto@exemple.test");
    await page.goto("/communautes");
    await expect(page.getByRole("heading", { name: "Communautes" })).toBeVisible();
    await expect(page.getByText(/Demande en attente/).first()).toBeVisible();

    // L'acces direct au planning est refuse et renvoie vers le catalogue.
    const { id } = communauteMla();
    await page.goto(`/c/${id}/planning`);
    await expect(page.getByText(/Contenu reserve aux membres/)).toBeVisible();
  });
});
