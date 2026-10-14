import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  /**
   * En developpement, Next bloque par defaut l'acces a ses ressources depuis
   * une autre origine que celle du serveur. Les parcours Playwright visitent
   * 127.0.0.1 : sans cette autorisation, les scripts clients ne se chargent
   * pas et l'interface ne s'hydrate jamais. N'a aucun effet en production.
   */
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  experimental: {
    // exceljs est charge uniquement par l'importeur cote serveur.
    serverActions: { bodySizeLimit: "12mb" },
  },
  serverExternalPackages: ["exceljs"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};

export default nextConfig;
