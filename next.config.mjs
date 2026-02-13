/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: '/mbts',
        destination: '/mbts.html',
      },
    ]
  },
};

export default nextConfig;
