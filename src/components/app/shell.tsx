"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Bell,
  CalendarDays,
  Home,
  Music4,
  Settings,
  Shirt,
  UserCircle2,
  Users,
  UsersRound,
  FileSpreadsheet,
  Inbox,
} from "lucide-react";
import { useId } from "react";
import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/cn";
import type { NavigationData } from "@/server/services/navigation";

/**
 * Coquille de l'application.
 *
 * Sur ordinateur : barre laterale et selecteur de communaute visible.
 * Sur mobile : selecteur en haut, et une barre basse limitee aux actions
 * frequentes. Les outils d'administration apparaissent dans la communaute
 * concernee.
 */

interface Lien {
  href: string;
  label: string;
  icone: typeof Home;
  badge?: number;
  /** Visible dans la barre basse du mobile. */
  mobile?: boolean;
  adminSeulement?: boolean;
}

function liensGeneraux(nav: NavigationData): Lien[] {
  return [
    { href: "/accueil", label: "Accueil", icone: Home, mobile: true },
    { href: "/communautes", label: "Communautes", icone: UsersRound },
    {
      href: "/notifications",
      label: "Notifications",
      icone: Bell,
      badge: nav.unreadNotifications,
      mobile: true,
    },
    { href: "/profil", label: "Profil", icone: UserCircle2 },
  ];
}

function liensCommunaute(communityId: string, role: "admin" | "membre", enAttente: number): Lien[] {
  const base = `/c/${communityId}`;
  return [
    { href: `${base}/planning`, label: "Planning", icone: CalendarDays, mobile: true },
    { href: `${base}/membres`, label: "Membres", icone: Users },
    { href: `${base}/chants`, label: "Chants", icone: Music4 },
    { href: `${base}/dress-code`, label: "Dress-code", icone: Shirt },
    {
      href: `${base}/demandes`,
      label: "Demandes",
      icone: Inbox,
      badge: enAttente,
      adminSeulement: true,
    },
    {
      href: `${base}/import`,
      label: "Import Excel",
      icone: FileSpreadsheet,
      adminSeulement: true,
    },
    {
      href: `${base}/parametres`,
      label: "Parametres",
      icone: Settings,
      adminSeulement: true,
    },
  ].filter((lien) => !lien.adminSeulement || role === "admin");
}

function communauteActive(pathname: string): string | null {
  const match = /^\/c\/([^/]+)/.exec(pathname);
  return match?.[1] ?? null;
}

export function Shell({
  nav,
  children,
}: {
  nav: NavigationData;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const selectId = useId();
  const activeId = communauteActive(pathname);
  const active = nav.communities.find((c) => c.id === activeId) ?? null;

  const generaux = liensGeneraux(nav);
  const locaux = active
    ? liensCommunaute(active.id, active.role, nav.pendingRequests[active.id] ?? 0)
    : [];
  const mobiles = [...generaux.filter((l) => l.mobile), ...locaux.filter((l) => l.mobile)];

  const estActif = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  return (
    <div className="min-h-dvh lg:flex">
      <a href="#contenu" className="lien-saut">
        Aller au contenu principal
      </a>

      {/* Barre laterale, ordinateur */}
      <aside className="sans-impression hidden w-64 shrink-0 border-r border-bordure bg-surface lg:block">
        <div className="sticky top-0 flex h-dvh flex-col">
          <div className="border-b border-bordure px-5 py-5">
            <Link href="/accueil" className="block">
              <span className="text-lg font-semibold tracking-tight">{BRAND.name}</span>
              <span className="mt-0.5 block text-xs text-nuit-doux">{BRAND.context}</span>
            </Link>
          </div>

          <div className="border-b border-bordure px-5 py-4">
            <label htmlFor={selectId} className="block text-xs font-medium text-nuit-doux">
              Communaute
            </label>
            <select
              id={selectId}
              value={active?.id ?? ""}
              onChange={(event) => {
                const value = event.target.value;
                if (value) router.push(`/c/${value}/planning`);
              }}
              className="mt-1.5 w-full min-h-11 rounded-[var(--radius-doux)] -forte bg-surface px-2 py-2 text-sm"
            >
              <option value="">Choisir une communaute</option>
              {nav.communities.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {nav.communities.length === 0 ? (
              <p className="mt-2 text-xs text-nuit-doux">
                Aucune adhesion pour le moment.
              </p>
            ) : null}
          </div>

          <nav aria-label="Navigation principale" className="flex-1 overflow-y-auto px-3 py-4">
            <ul className="space-y-1">
              {generaux.map((lien) => (
                <LienNav key={lien.href} lien={lien} actif={estActif(lien.href)} />
              ))}
            </ul>

            {active ? (
              <>
                <p className="mt-6 px-2 text-xs font-semibold uppercase tracking-wide text-nuit-tres-doux">
                  {active.name}
                </p>
                <ul className="mt-2 space-y-1">
                  {locaux.map((lien) => (
                    <LienNav key={lien.href} lien={lien} actif={estActif(lien.href)} />
                  ))}
                </ul>
                {active.role === "admin" ? (
                  <p className="mt-3 px-2 text-xs text-nuit-doux">
                    Vous etes admin de cette communaute.
                  </p>
                ) : null}
              </>
            ) : null}
          </nav>

          <form action="/api/deconnexion" method="post" className="border-t border-bordure px-3 py-3">
            <div className="flex items-center gap-2 px-2 pb-2">
              <span className="inline-flex size-8 items-center justify-center rounded-full bg-accent-pale text-xs font-semibold text-accent-fort">
                {nav.initials}
              </span>
              <span className="truncate text-sm">
                {nav.firstName} {nav.lastName}
              </span>
            </div>
            <button
              type="submit"
              className="w-full rounded-[var(--radius-doux)] px-3 py-2 text-left text-sm text-nuit-doux hover:bg-ivoire-fonce"
            >
              Se deconnecter
            </button>
          </form>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* En-tete mobile : le selecteur de communaute reste en haut. */}
        <header className="sans-impression sticky top-0 z-20 border-b border-bordure bg-surface/95 backdrop-blur lg:hidden">
          <div
            className="flex items-center gap-3 px-4 py-3"
            style={{ paddingTop: "calc(0.75rem + env(safe-area-inset-top, 0px))" }}
          >
            <Link href="/accueil" className="shrink-0 font-semibold">
              {BRAND.name}
            </Link>
            <select
              aria-label="Communaute active"
              value={active?.id ?? ""}
              onChange={(event) => {
                const value = event.target.value;
                if (value) router.push(`/c/${value}/planning`);
              }}
              className="ml-auto min-h-11 min-w-0 flex-1 rounded-[var(--radius-doux)] -forte bg-surface px-2 py-1.5 text-sm"
            >
              <option value="">Communautes</option>
              {nav.communities.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          {active ? (
            <nav
              aria-label="Sections de la communaute"
              className="grille-defilante border-t border-bordure"
            >
              <ul className="flex min-w-max gap-1 px-3 py-2">
                {locaux.map((lien) => (
                  <li key={lien.href}>
                    <Link
                      href={lien.href}
                      className={cn(
                        "inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm",
                        estActif(lien.href)
                          ? "bg-accent text-sur-accent"
                          : "bg-ivoire-fonce text-nuit-doux",
                      )}
                      aria-current={estActif(lien.href) ? "page" : undefined}
                    >
                      {lien.label}
                      {lien.badge ? (
                        <span className="rounded-full bg-sur-accent/90 px-1.5 text-xs font-semibold text-accent">
                          {lien.badge}
                        </span>
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ) : null}
        </header>

        <main id="contenu" className="flex-1 px-4 py-5 pb-28 sm:px-6 lg:px-8 lg:py-8 lg:pb-10">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>

        {/* Barre basse mobile : actions frequentes seulement. */}
        <nav
          aria-label="Navigation rapide"
          className="sans-impression fixed inset-x-0 bottom-0 z-20 border-t border-bordure bg-surface lg:hidden"
          style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
        >
          <ul className="flex">
            {mobiles.map((lien) => {
              const Icone = lien.icone;
              const actif = estActif(lien.href);
              return (
                <li key={lien.href} className="flex-1">
                  <Link
                    href={lien.href}
                    aria-current={actif ? "page" : undefined}
                    className={cn(
                      "flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 py-2 text-[0.7rem]",
                      actif ? "text-accent" : "text-nuit-doux",
                    )}
                  >
                    <span className="relative">
                      <Icone aria-hidden="true" className="size-5" />
                      {lien.badge ? (
                        <span className="absolute -right-2 -top-1 rounded-full bg-indispo-fond px-1 text-[0.6rem] font-semibold text-indispo-texte">
                          {lien.badge > 9 ? "9+" : lien.badge}
                        </span>
                      ) : null}
                    </span>
                    {lien.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </div>
  );
}

function LienNav({ lien, actif }: { lien: Lien; actif: boolean }) {
  const Icone = lien.icone;
  return (
    <li>
      <Link
        href={lien.href}
        aria-current={actif ? "page" : undefined}
        className={cn(
          "flex min-h-11 items-center gap-3 rounded-[var(--radius-doux)] px-3 py-2 text-sm",
          actif
            ? "bg-accent-pale font-medium text-accent-fort"
            : "text-nuit-doux hover:bg-ivoire-fonce",
        )}
      >
        <Icone aria-hidden="true" className="size-4.5 shrink-0" />
        <span className="truncate">{lien.label}</span>
        {lien.badge ? (
          <span className="ml-auto rounded-full bg-indispo-fond px-2 text-xs font-semibold text-indispo-texte">
            {lien.badge}
          </span>
        ) : null}
      </Link>
    </li>
  );
}
