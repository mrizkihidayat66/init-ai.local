import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prevent webpack from bundling mermaid for server-side API routes.
  // mermaid is a large ESM package with optional browser globals; keeping it
  // as a Node.js native import avoids bundler issues and allows us to call
  // mermaid.parse() for real server-side diagram validation.
  serverExternalPackages: ['mermaid'],
};

export default nextConfig;
