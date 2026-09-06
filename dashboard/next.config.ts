import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: { root: __dirname },
  outputFileTracingRoot: __dirname,
  // Una campana con imagen supera el limite por defecto de 1 MB de las server actions.
  experimental: { serverActions: { bodySizeLimit: '10mb' } },
};

export default nextConfig;
