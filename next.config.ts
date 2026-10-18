import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /* Origines de développement autorisées (preview sandbox) :
     supprime le warning « Cross origin request detected … /_next/* ». */
  allowedDevOrigins: ["*.space-z.ai"],
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
