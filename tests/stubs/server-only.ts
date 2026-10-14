/**
 * Remplace le paquet `server-only` dans les tests. Celui-ci leve une erreur
 * des qu'il est charge hors du graphe serveur de React ; ici les modules
 * testes sont deja executes cote Node uniquement.
 */
export {};
