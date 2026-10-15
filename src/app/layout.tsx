import type { Metadata, Viewport } from "next";
import { BRAND } from "@/lib/brand";
import { attributTheme } from "@/domain/theme";
import { readTheme } from "@/server/theme";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: BRAND.fullName,
    template: `%s - ${BRAND.name}`,
  },
  description:
    "Planning des ministeres ICC : disponibilites par creneau, equipes, affectations, chants et dress-code.",
  applicationName: BRAND.name,
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // La barre du navigateur suit le theme choisi.
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#101729" },
    { media: "(prefers-color-scheme: light)", color: "#fbf9f4" },
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Le theme est resolu avant le rendu : aucune page ne s'affiche d'abord
  // dans la mauvaise apparence.
  const theme = await readTheme();

  return (
    <html lang="fr" data-theme={attributTheme(theme)}>
      <body>{children}</body>
    </html>
  );
}
