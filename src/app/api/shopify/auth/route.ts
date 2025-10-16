
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

  const scopes = 'read_app_proxy,write_app_proxy,read_assigned_fulfillment_orders,write_assigned_fulfillment_orders,read_cart_transforms,write_cart_transforms,read_all_cart_transforms,read_custom_fulfillment_services,write_custom_fulfillment_services,read_customers,write_customers,write_draft_orders,read_draft_orders,read_fulfillment_constraint_rules,write_fulfillment_constraint_rules,read_fulfillments,write_fulfillments,write_inventory,read_inventory,read_merchant_managed_fulfillment_orders,write_merchant_managed_fulfillment_orders,write_order_edits,read_order_edits,read_orders,write_orders,read_products,read_script_tags,write_script_tags,read_shipping,write_shipping,read_shopify_payments_accounts,read_shopify_payments_payouts,read_store_credit_account_transactions,write_store_credit_account_transactions,read_store_credit_accounts,read_third_party_fulfillment_orders,write_third_party_fulfillment_orders,customer_read_store_credit_account_transactions,customer_read_store_credit_accounts';
  const redirectUri = `${appUrl}/api/shopify/callback`;

  // Construct the authorization URL with the state parameter
  const authUrl = `https://${shop}.myshopify.com/admin/oauth/authorize?client_id=${shopifyApiKey}&scope=${scopes}&redirect_uri=${redirectUri}&state=${state}`;

  return NextResponse.json({ redirectUrl: authUrl });
}
