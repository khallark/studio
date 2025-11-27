import { NextRequest } from "next/server";
import { db, auth as adminAuth } from "./firebase-admin";
import { DocumentSnapshot } from "firebase-admin/firestore";

export const SHARED_STORE_ID = process.env.NEXT_PUBLIC_SHARED_STORE_ID!;
export const SUPER_ADMIN_ID = process.env.NEXT_PUBLIC_SUPER_ADMIN_ID!;

export async function getUserIdFromToken(req: NextRequest): Promise<string | null> {
    const authHeader = req.headers.get('authorization');
    if (authHeader?.startsWith('Bearer ')) {
        const idToken = authHeader.split('Bearer ')[1];
        try {
            const decodedToken = await adminAuth.verifyIdToken(idToken);
            return decodedToken.uid;
        } catch (error) {
            console.error('Error verifying auth token:', error);
            return null;
        }
    }
    return null;
}

interface BusinessStoreAuthParams {
    businessId: string;
    shop: string;
    req: NextRequest;
}

interface BusinessAuthParams {
    businessId: string;
    req: NextRequest;
}

interface StoreAuthOutput {
    authorised: boolean;
    isExpection?: boolean;
    error?: string;
    status?: number;
    userId?: string;
    memberDoc?: DocumentSnapshot;
    userDoc?: DocumentSnapshot;
    shopDoc?: DocumentSnapshot;
    businessDoc?: DocumentSnapshot;
}

interface BusinessOrderInput {
    businessId: string;
    vendorName: string;
    vendors: any;
}

interface BusinessOrderOutput {
    authorised: boolean;
    error?: string;
    status?: number;
}

export async function authUserForBusiness({ businessId, req }: BusinessAuthParams): Promise<StoreAuthOutput> {
    try {
        if (!businessId) {
            return {
                authorised: false,
                status: 400,
                error: 'Business ID is required',
            }
        }

        const userId = await getUserIdFromToken(req);
        if (!userId) {
            return {
                authorised: false,
                status: 401,
                error: 'User not logged in',
            }
        }

        const userDoc = await db.collection('users').doc(userId).get();
        if (!userDoc || !userDoc.exists) {
            return {
                authorised: false,
                status: 404,
                error: 'User not found',
            }
        }

        const businessRef = db.collection('users').doc(businessId);
        const businessDoc = await businessRef.get();
        if (!businessDoc || !businessDoc.exists) {
            return {
                authorised: false,
                status: 404,
                error: 'Business not found',
            }
        }

        const memberRef = businessRef.collection('members').doc(userId);
        const memberDoc = await memberRef.get();

        const isAuthorized = (userId === businessId) || (memberDoc && memberDoc.exists && memberDoc.data()?.status === 'active');
        if (!isAuthorized) {
            return {
                authorised: false,
                status: 403,
                error: 'You do not have access to this business',
            }
        }

        return {
            authorised: true,
            userId,
            memberDoc,
            userDoc,
            businessDoc,
        }
    } catch (error: any) {
        return {
            authorised: false,
            status: 500,
            error: error.message ?? "Unknown error occurred",
        }
    }
}

export async function authUserForBusinessAndStore({ businessId, shop, req }: BusinessStoreAuthParams): Promise<StoreAuthOutput> {
    try {
        const isExpection = (shop === SHARED_STORE_ID);

        // ✅ Added: Input validation
        if (!businessId || !shop) {
            return {
                authorised: false,
                status: 400,
                error: 'Business ID and shop ID are required',
            }
        }

        const userId = await getUserIdFromToken(req);
        if (!userId) {
            return {
                authorised: false,
                status: 401,
                error: 'User not logged in',
            }
        }

        const userDoc = await db.collection('users').doc(userId).get();
        if (!userDoc || !userDoc.exists) {
            return {
                authorised: false,
                status: 404,
                error: 'User not found',
            }
        }

        const businessRef = db.collection('users').doc(businessId);
        const businessDoc = await businessRef.get();
        if (!businessDoc || !businessDoc.exists) {
            return {
                authorised: false,
                status: 404,
                error: 'Business not found',
            }
        }

        const shopRef = db.collection('accounts').doc(shop)
        const shopDoc = await shopRef.get();
        if (!shopDoc || !shopDoc.exists) {
            return {
                authorised: false,
                status: 404,
                error: 'Shop not found',
            }
        }

        const memberRef = businessRef.collection('members').doc(userId);
        const memberDoc = await memberRef.get();

        const isAuthorized =
            ((businessDoc.data()?.stores ?? []).includes(shop)) &&
            ((userId === businessId) || (memberDoc && memberDoc.exists && memberDoc.data()?.status === 'active'))
            ;
        if (!isAuthorized) {
            return {
                authorised: false,
                status: 403,
                error: 'You do not have access to this store or it does not belong to this business',
            }
        }

        return {
            authorised: true,
            isExpection,
            userId,
            memberDoc,
            userDoc,
            shopDoc,
            businessDoc,
        }
    } catch (error: any) {
        return {
            authorised: false,
            status: 500,
            error: error.message ?? "Unknown error occurred",
        }
    }
}

export function authBusinessForOrderOfTheExceptionStore({ businessId, vendorName, vendors }: BusinessOrderInput): BusinessOrderOutput {
    try {
        if (businessId === SUPER_ADMIN_ID) {
            return {
                authorised: true,
            }
        }
        if (!vendorName) {
            return {
                authorised: false,
                error: "No vendorName provided",
                status: 400,
            }
        } if (!vendors || !Array.isArray(vendors) || !vendors.length) {
            return {
                authorised: false,
                error: "Invalid vendors array",
                status: 400,
            }
        }

        const isAuthorized = vendorName !== 'OWR'
            ? vendors.includes(vendorName)
            : (vendors.includes(vendorName) || vendors.includes('Ghamand') || vendors.includes('BBB')) && !vendors.includes('ENDORA') && !vendors.includes('STYLE 05');

        if (!isAuthorized) {
            return {
                authorised: false,
                error: "Not authorised to process this order",
                status: 403,
            }
        }

        return {
            authorised: true
        }
    } catch (error: any) {
        return {
            authorised: false,
            error: error?.message ?? "Unknown error occurred",
            status: 500,
        }
    }
}