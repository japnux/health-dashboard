import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // RFC 9728 : les clients MCP construisent l'URL de découverte en préfixant
  // /.well-known/oauth-protected-resource au path de la ressource.
  // Ex: /api/mcp → /.well-known/oauth-protected-resource/api/mcp
  // On redirige tout ça vers notre endpoint racine.
  async rewrites() {
    return [
      {
        source: "/.well-known/oauth-protected-resource/:path*",
        destination: "/.well-known/oauth-protected-resource",
      },
    ];
  },
};

export default nextConfig;
