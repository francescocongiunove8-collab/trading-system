/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/notion/:path*',
        destination: 'https://api.notion.com/v1/:path*',
      },
    ]
  },
}

module.exports = nextConfig
