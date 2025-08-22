
import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
    ],
  },
  async rewrites() {
    return [
      {
        source: '/api/shopify/auth',
        destination: '/api/shopify/auth/route',
      },
      {
        source: '/api/shopify/callback',
        destination: '/api/shopify/callback/route',
      },
       {
        source: '/api/webhooks/orders',
        destination: '/api/webhooks/orders/route',
      },
    ]
  },
};

export default nextConfig;
