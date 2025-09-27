
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
      {
        source: '/api/integrations/shiprocket/update',
        destination: '/api/integrations/shiprocket/update/route',
      },
      {
        source: '/api/integrations/shiprocket/refresh-token',
        destination: '/api/integrations/shiprocket/refresh-token/route',
      },
      {
        source: '/api/shopify/courier/download-failed-jobs',
        destination: '/api/shopify/courier/download-failed-jobs/route',
      },
      {
        source: '/api/shopify/orders/download-slips',
        destination: '/api/shopify/orders/download-slips/route',
      },
      {
        source: '/api/shopify/orders/dispatch',
        destination: '/api/shopify/orders/dispatch/route',
      },
      {
        source: '/api/integrations/interakt/update',
        destination: '/api/integrations/interakt/update/route',
      },
      {
        source: '/api/webhooks/interakt',
        destination: '/api/webhooks/interakt/route',
      },
      {
        source: '/api/integrations/interakt/templates/update-category',
        destination: '/api/integrations/interakt/templates/update-category/route',
      },
      {
        source: '/api/integrations/interakt/templates/set-active',
        destination: '/api/integrations/interakt/templates/set-active/route',
      },
      {
        source: '/api/integrations/interakt/templates/create',
        destination: '/api/integrations/interakt/templates/create/route',
      },
      {
        source: '/api/integrations/interakt/media/upload',
        destination: '/api/integrations/interakt/media/upload/route',
      },
       {
        source: '/api/shopify/courier/update-shipped-statuses',
        destination: '/api/shopify/courier/update-shipped-statuses/route',
      },
      {
        source: '/api/shopify/courier/book-reverse-order',
        destination: '/api/shopify/courier/book-reverse-order/route',
      },
      {
        source: '/api/shopify/orders/export-products',
        destination: '/api/shopify/orders/export-products/route',
      },
      {
        source: '/api/shopify/account/toggle-service',
        destination: '/api/shopify/account/toggle-service/route',
      },
      {
        source: '/api/public/book-return/start-session',
        destination: '/api/public/book-return/start-session/route',
      },
      {
        source: '/api/public/book-return/order',
        destination: '/api/public/book-return/order/route',
      },
    ]
  },
};

export default nextConfig;
