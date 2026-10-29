import Link from "next/link";
import { BRAND } from "@/lib/brand";
import { FiletSignature } from "@/components/ui/primitives";

export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="min-h-dvh bg-ivoire">
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 py-8 sm:py-14">
        <header className="mb-8">
          <Link href="/" className="inline-block">
            <p className="text-2xl font-semibold tracking-tight">{BRAND.name}</p>
          </Link>
          <div className="mt-2">
            <FiletSignature />
          </div>
          <p className="mt-3 text-sm text-nuit-doux">
            {BRAND.tagline} - {BRAND.context}
          </p>
        </header>
        <main id="contenu" className="flex-1">
          {children}
        </main>
        <footer className="mt-10 text-xs text-nuit-tres-doux">
          <p>
            Nom provisoire. Donnees de demonstration fictives : aucun email reel
            n'est envoye tant qu'aucun fournisseur n'est configure.
          </p>
        </footer>
      </div>
    </div>
  );
}
