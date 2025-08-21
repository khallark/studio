
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const { shop } = await req.json();

  if (!shop) {
    return NextResponse.json({ error: 'Shop name is required' }, { status: 400 });
  }

  const shopifyApiKey = process.env.SHOPIFY_API_KEY;
  if (!shopifyApiKey) {
    throw new Error('SHOPIFY_API_KEY is not defined in environment variables');
  }

  const scopes = 'read_orders,read_products,read_customers';
  const redirectUri = `${process.env.SHOPIFY_APP_URL}/api/shopify/callback`;

  // Construct the authorization URL
  const authUrl = `https://${shop}.myshopify.com/admin/oauth/authorize?client_id=${shopifyApiKey}&scope=${scopes}&redirect_uri=${redirectUri}`;

  return NextResponse.json({ redirectUrl: authUrl });
}
