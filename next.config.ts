import type { NextConfig } from "next";
const config: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  serverExternalPackages: ["@prisma/client", "bcryptjs"],
  experimental: { proxyClientMaxBodySize: "110mb" },
};
export default config;
