/**
 * Remplace `next/headers` dans les tests : un bocal a cookies en memoire.
 * Le chemin de signature de la session reste le vrai code de production,
 * ce qui permet de tester les services exactement comme une requete.
 */
interface CookieRecord {
  name: string;
  value: string;
}

const jar = new Map<string, CookieRecord>();

export function clearTestCookies(): void {
  jar.clear();
}

export async function cookies(): Promise<{
  get(name: string): CookieRecord | undefined;
  set(name: string, value: string, options?: unknown): void;
  delete(name: string): void;
}> {
  return {
    get(name) {
      return jar.get(name);
    },
    set(name, value) {
      jar.set(name, { name, value });
    },
    delete(name) {
      jar.delete(name);
    },
  };
}

export async function headers(): Promise<Headers> {
  return new Headers();
}
