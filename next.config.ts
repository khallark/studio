
import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  /* config options here */
  assetPrefix: process.env.NEXT_PUBLIC_ASSET_PREFIX || undefined,
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
        hostname: 'picsum.photos',
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
       {
        source: '/api/shopify/locations/add',
        destination: '/api/shopify/locations/add/route',
      },
       {
        source: '/api/shopify/locations/update',
        destination: '/api/shopify/locations/update/route',
      },
      {
        source: '/api/shopify/locations/delete',
        destination: '/api/shopify/locations/delete/route',
      },
      {
        source: '/api/shopify/orders/bulk-update-status',
        destination: '/api/shopify/orders/bulk-update-status/route',
      },
       {
        source: '/api/shopify/account/update-address',
        destination: '/api/shopify/account/update-address/route',
      },
      {
        source: '/api/shopify/account/update-contact',
        destination: '/api/g/api/shopify/account/update-contact/route',
      },
      {
        source: '/api/integrations/courier/update',
        destination: '/api/integrations/courier/update/route',
      },
      {
        source: '/api/shopify/orders/export',
        destination: '/api/shopify/orders/export/route',
      },
    ]
  },
};

export default nextConfig;
