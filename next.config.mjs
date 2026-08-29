/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  experimental: {
    cpus: 2,
  },
  serverExternalPackages: ["better-auth", "@better-auth/kysely-adapter", "kysely"],
  images: {
    unoptimized: true,
  },
}

export default nextConfig
