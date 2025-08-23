
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import crypto from 'crypto';

export async function POST(req: NextRequest) {
  const { shop } = await req.json();

  if (!shop) {
    return NextResponse.json({ error: 'Shop name is required' }, { status: 400 });
  }

  const shopifyApiKey = process.env.SHOPIFY_API_KEY;
  const appUrl = process.env.SHOPIFY_APP_URL;

  if (!shopifyApiKey || !appUrl) {
    throw new Error('Required Shopify environment variables are not defined.');
  }

  // Generate a random state token for CSRF protection
  const state = crypto.randomBytes(16).toString('hex');
  
  // Store the state in a secure, httpOnly cookie
  cookies().set('shopify_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 5 // 5 minutes
  });

  const scopes = 'read_orders,read_products';
  const redirectUri = `${appUrl}/api/shopify/callback`;

  // Construct the authorization URL with the state parameter
  const authUrl = `https://${shop}.myshopify.com/admin/oauth/authorize?client_id=${shopifyApiKey}&scope=${scopes}&redirect_uri=${redirectUri}&state=${state}`;

  return NextResponse.json({ redirectUrl: authUrl });
}
