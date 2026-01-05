

import type { NextConfig } from 'next';

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
      {
        protocol: 'https',
        hostname: 'firebasestorage.googleapis.com',
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
        source: '/api/integrations/xpressbees/update',
        destination: '/api/integrations/xpressbees/update/route',
      },
      {
        source: '/api/integrations/shiprocket/refresh-token',
        destination: '/api/integrations/shiprocket/refresh-token/route',
      },
      {
        source: '/api/integrations/xpressbees/refresh-token',
        destination: '/api/integrations/xpressbees/refresh-token/route',
      },
      {
        source: '/api/shopify/courier/download-jobs',
        destination: '/api/shopify/courier/download-jobs/route',
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
        source: '/api/shopify/orders/generate-purchase-order',
        destination: '/api/shopify/orders/generate-purchase-order/route',
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
      {
        source: '/api/public/book-return/request',
        destination: '/api/public/book-return/request/route',
      },
      {
        source: '/api/public/book-return/cancel-request',
        destination: '/api/public/book-return/cancel-request/route',
      },
      {
        source: '/api/public/book-return/upload-image',
        destination: '/api/public/book-return/upload-image/route',
      },
      {
        source: '/api/public/book-return/delete-images',
        destination: '/api/public/book-return/delete-images/route',
      },
      {
        source: '/api/integrations/courier/update-priority',
        destination: '/api/integrations/courier/update-priority/route',
      },
      {
        source: '/api/shopify/orders/update-confirmed-orders-availability-tag',
        destination: '/api/shopify/orders/update-confirmed-orders-availability-tag/route',
      },
      {
        source: '/api/shopify/orders/revert-to-confirmed',
        destination: '/api/shopify/orders/revert-to-confirmed/route',
      },
      {
        source: '/api/shopify/orders/revert-to-delivered',
        destination: '/api/shopify/orders/revert-to-delivered/route',
      },
      {
        source: '/api/shopify/orders/split-order',
        destination: '/api/shopify/orders/split-order/route',
      },
      {
        source: '/api/shopify/products/sync',
        destination: '/api/shopify/products/sync/route',
      },
      {
        source: '/api/shopify/products/store-variants',
        destination: '/api/shopify/products/store-variants/route',
      },
      {
        source: '/api/shopify/products/search-business-products',
        destination: '/api/shopify/products/search-business-products/route',
      },
      {
        source: '/api/shopify/products/create-mapping',
        destination: '/api/shopify/products/create-mapping/route',
      },
      {
        source: '/api/shopify/products/remove-mapping',
        destination: '/api/shopify/products/remove-mapping/route',
      },
      {
        source: '/proxy/api/checkout/customer',
        destination: '/proxy/api/checkout/customer/route',
      },
      {
        source: '/proxy/api/checkout/draft-session-creation',
        destination: '/proxy/api/checkout/draft-session-creation/route',
      },
      {
        source: '/proxy/api/checkout/order-create-cod',
        destination: '/proxy/api/checkout/order-create-cod/route',
      },
      {
        source: '/proxy/api/checkout/products-details',
        destination: '/proxy/api/checkout/products-details/route',
      },
      {
        source: '/proxy/api/checkout/send-otp',
        destination: '/proxy/api/checkout/send-otp/route',
      },
      {
        source: '/proxy/api/checkout/verify-otp',
        destination: '/proxy/api/checkout/verify-otp/route',
      },
      {
        source: '/api/business/members/create-invite',
        destination: '/api/business/members/create-invite/route',
      },
      {
        source: '/api/business/members/join',
        destination: '/api/business/members/join/route',
      },
      {
        source: '/api/business/members/request-join',
        destination: '/api/business/members/request-join/route',
      },
      {
        source: '/api/business/members/accept-request',
        destination: '/api/business/members/accept-request/route',
      },
      {
        source: '/api/business/members/decline-request',
        destination: '/api/business/members/decline-request/route',
      },
      {
        source: '/api/business/generate-tax-report',
        destination: '/api/business/generate-tax-report/route',
      },
      {
        source: '/api/business/table-data',
        destination: '/api/business/table-data/route',
      },
      {
        source: '/api/business/products/create',
        destination: '/api/business/products/create/route',
      },
      {
        source: '/api/business/products/update',
        destination: '/api/business/products/update/route',
      },
      {
        source: '/api/business/products/delete',
        destination: '/api/business/products/delete/route',
      },
      {
        source: '/api/business/inventory/adjust',
        destination: '/api/business/inventory/adjust/route',
      },
      {
        source: '/api/business/warehouse/create-warehouse',
        destination: '/api/business/warehouse/create-warehouse/route',
      },
      {
        source: '/api/business/warehouse/create-zone',
        destination: '/api/business/warehouse/create-zone/route',
      },
      {
        source: '/api/business/warehouse/create-rack',
        destination: '/api/business/warehouse/create-rack/route',
      },
      {
        source: '/api/business/warehouse/create-shelf',
        destination: '/api/business/warehouse/create-shelf/route',
      },
      {
        source: '/api/business/warehouse/list-warehouses',
        destination: '/api/business/warehouse/list-warehouses/route',
      },
      {
        source: '/api/business/warehouse/list-zones',
        destination: '/api/business/warehouse/list-zones/route',
      },
      {
        source: '/api/business/warehouse/list-racks',
        destination: '/api/business/warehouse/list-racks/route',
      },
      {
        source: '/api/business/warehouse/list-shelves',
        destination: '/api/business/warehouse/list-shelves/route',
      },
      {
        source: '/api/business/warehouse/list-placements',
        destination: '/api/business/warehouse/list-placements/route',
      },
      {
        source: '/api/business/warehouse/list-product-placements',
        destination: '/api/business/warehouse/list-product-placements/route',
      },
      {
        source: '/api/business/warehouse/list-movements',
        destination: '/api/business/warehouse/list-movements/route',
      },
      {
        source: '/api/business/warehouse/list-logs',
        destination: '/api/business/warehouse/list-logs/route',
      },
      {
        source: '/api/business/warehouse/update-warehouse',
        destination: '/api/business/warehouse/update-warehouse/route',
      },
      {
        source: '/api/business/warehouse/update-zone',
        destination: '/api/business/warehouse/update-zone/route',
      },
      {
        source: '/api/business/warehouse/update-rack',
        destination: '/api/business/warehouse/update-rack/route',
      },
      {
        source: '/api/business/warehouse/update-shelf',
        destination: '/api/business/warehouse/update-shelf/route',
      },
      {
        source: '/api/business/warehouse/move-zone',
        destination: '/api/business/warehouse/move-zone/route',
      },
      {
        source: '/api/business/warehouse/move-rack',
        destination: '/api/business/warehouse/move-rack/route',
      },
      {
        source: '/api/business/warehouse/move-shelf',
        destination: '/api/business/warehouse/move-shelf/route',
      },
      {
        source: '/api/business/warehouse/delete-warehouse',
        destination: '/api/business/warehouse/delete-warehouse/route',
      },
      {
        source: '/api/business/warehouse/delete-zone',
        destination: '/api/business/warehouse/delete-zone/route',
      },
      {
        source: '/api/business/warehouse/delete-rack',
        destination: '/api/business/warehouse/delete-rack/route',
      },
      {
        source: '/api/business/warehouse/delete-shelf',
        destination: '/api/business/warehouse/delete-shelf/route',
      },
      {
        source: '/api/public/join-business/[sessionId]',
        destination: '/api/public/join-business/[sessionId]/route',
      },
      {
        source: '/api/settings/get-details',
        destination: '/api/settings/get-details/route',
      },
      {
        source: '/api/integrations/courier/delete',
        destination: '/api/integrations/courier/delete/route',
      },
      {
        source: '/api/auth/set-business-claims',
        destination: '/api/auth/set-business-claims/route',
      },
      {
        source: '/api/shopify/orders/refund',
        destination: '/api/shopify/orders/refund/route',
      },
      {
        source: '/api/business/list',
        destination: '/api/business/list/route',
      },
      {
        source: '/api/business/[businessId]/auth',
        destination: '/api/business/[businessId]/auth/route',
      },
      {
        source: '/api/signup',
        destination: '/api/signup/route',
      },
      {
        source: '/api/test',
        destination: '/api/test/route',
      }
    ]
  },
};

export default nextConfig;


