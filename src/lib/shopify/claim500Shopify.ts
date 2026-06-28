// lib/shopify/claim500Shopify.ts
//
// Minimal Shopify Admin GraphQL helpers for the claim-500 flow.
// Uses the shop's `accessToken` (read from accounts/{storeId}.myshopify.com).

import { CLAIM, splitName } from "@/lib/claim500/helpers";

const API_VERSION = CLAIM.SHOPIFY_API_VERSION;

interface ShopCtx {
  shopName: string; // e.g. "onewhorules.myshopify.com"
  accessToken: string;
}

/** Thin GraphQL fetcher with top-level + userErrors awareness. */
export async function shopifyGraphQL<T = any>(
  ctx: ShopCtx,
  query: string,
  variables: Record<string, any> = {},
): Promise<T> {
  const res = await fetch(
    `https://${ctx.shopName}/admin/api/${API_VERSION}/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": ctx.accessToken,
      },
      body: JSON.stringify({ query, variables }),
    },
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Shopify HTTP ${res.status}: ${body.slice(0, 500)}`);
  }

  const json = (await res.json()) as any;
  if (json.errors?.length) {
    throw new Error(`Shopify GraphQL errors: ${JSON.stringify(json.errors)}`);
  }
  return json.data as T;
}

const FIND_CUSTOMER = /* GraphQL */ `
  query findCustomer($q: String!) {
    customers(first: 1, query: $q) {
      edges { node { id email phone firstName lastName } }
    }
  }
`;

const CREATE_CUSTOMER = /* GraphQL */ `
  mutation customerCreate($input: CustomerInput!) {
    customerCreate(input: $input) {
      customer { id email phone }
      userErrors { field message }
    }
  }
`;

const UPDATE_CUSTOMER = /* GraphQL */ `
  mutation customerUpdate($input: CustomerInput!) {
    customerUpdate(input: $input) {
      customer { id email phone }
      userErrors { field message }
    }
  }
`;

const STORE_CREDIT = /* GraphQL */ `
  mutation storeCreditAccountCredit($id: ID!, $creditInput: StoreCreditAccountCreditInput!) {
    storeCreditAccountCredit(id: $id, creditInput: $creditInput) {
      storeCreditAccountTransaction {
        amount { amount currencyCode }
        account { id balance { amount currencyCode } }
      }
      userErrors { field message }
    }
  }
`;

export interface ResolvedCustomer {
  id: string; // gid://shopify/Customer/123
  created: boolean;
}

function isTakenError(message: string): boolean {
  return /taken|already been taken|has already/i.test(message || "");
}

/**
 * Find an existing customer by email, or create one with email + phone.
 * - If found, best-effort adds the phone if it's missing.
 * - If creating fails on phone uniqueness, retries without phone (credit still
 *   lands on the email-identified customer).
 */
export async function findOrCreateShopifyCustomer(
  ctx: ShopCtx,
  args: { email: string; name: string },
): Promise<ResolvedCustomer> {
  const email = args.email.trim().toLowerCase();
  const firstName = String(args.name || "").trim();
  const lastName = "";

  // 1) Lookup by email
  const found = await shopifyGraphQL(ctx, FIND_CUSTOMER, { q: `email:${email}` });
  const existing = found?.customers?.edges?.[0]?.node;

  if (existing?.id) {
    // Fill in the name only if they don't already have one.
    const hasName = !!(existing.firstName || existing.lastName);
    if (!hasName && firstName) {
      const upd = await shopifyGraphQL(ctx, UPDATE_CUSTOMER, {
        input: { id: existing.id, firstName },
      });
      void upd?.customerUpdate?.userErrors;
    }
    return { id: existing.id, created: false };
  }

  // 2) Create with name only (no phone)
  const create = await shopifyGraphQL(ctx, CREATE_CUSTOMER, {
    input: { email, firstName, lastName },
  });

  const errs = create?.customerCreate?.userErrors ?? [];
  const customer = create?.customerCreate?.customer;
  if (customer?.id) return { id: customer.id, created: true };

  // Email taken in a race -> re-lookup
  if (errs.some((e: any) => isTakenError(e.message))) {
    const refound = await shopifyGraphQL(ctx, FIND_CUSTOMER, { q: `email:${email}` });
    const node = refound?.customers?.edges?.[0]?.node;
    if (node?.id) return { id: node.id, created: false };
  }

  throw new Error(`customerCreate failed: ${JSON.stringify(errs)}`);
}

/**
 * Credit a customer's store-credit account. Passing a Customer GID auto-creates
 * the currency-specific account if it doesn't exist yet.
 */
export async function addStoreCreditToCustomer(
  ctx: ShopCtx,
  args: { customerId: string; amount: string; currencyCode: string },
): Promise<{ balance: { amount: string; currencyCode: string } }> {
  const data = await shopifyGraphQL(ctx, STORE_CREDIT, {
    id: args.customerId,
    creditInput: {
      creditAmount: { amount: args.amount, currencyCode: args.currencyCode },
    },
  });

  const errs = data?.storeCreditAccountCredit?.userErrors ?? [];
  if (errs.length) {
    throw new Error(`storeCreditAccountCredit failed: ${JSON.stringify(errs)}`);
  }

  const account = data?.storeCreditAccountCredit?.storeCreditAccountTransaction?.account;
  return { balance: account?.balance };
}