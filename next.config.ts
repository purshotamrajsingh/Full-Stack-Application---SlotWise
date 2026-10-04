import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // The sandbox preview pane proxies the app from a *.space-z.ai origin.
  allowedDevOrigins: ["*.space-z.ai"],
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
