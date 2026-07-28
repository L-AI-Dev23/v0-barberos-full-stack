/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  async redirects() {
    return [
      {
        source: '/reservar/:orgId',
        destination: '/loyalty/:orgId',
        permanent: true,
      },
    ]
  },
}

export default nextConfig
