/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // PGlite (local embedded Postgres) ships WASM + data files that must load from node_modules.
    serverComponentsExternalPackages: ['@electric-sql/pglite'],
  },
};
export default nextConfig;
