import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /* Origines de développement autorisées (preview sandbox) :
     supprime le warning « Cross origin request detected … /_next/* ». */
  allowedDevOrigins: ["*.space-z.ai"],
  /* config options here */
  typescript: {
    /* Vérification TypeScript réactivée : src/ est propre (0 erreur).
       Les erreurs résiduelles examples/ et skills/ sont hors compilation
       Next (dossiers non importés par l'application). */
    ignoreBuildErrors: false,
  },
  reactStrictMode: false,
};

export default nextConfig;
