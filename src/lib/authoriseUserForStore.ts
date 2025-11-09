import { NextRequest } from "next/server";
import { db, auth as adminAuth } from "./firebase-admin";
import { DocumentSnapshot } from "firebase-admin/firestore";

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

interface storeAuthParams {
    shop: string;
    req: NextRequest;
}
interface storeAuthOutput {
    authorised: boolean;
    error?: string;
    status?: number;
    memberDoc?: DocumentSnapshot;
    userDoc?: DocumentSnapshot;
    shopDoc?: DocumentSnapshot;
    userId?: string;
}

export async function authUserForStore({ shop, req }: storeAuthParams): Promise<storeAuthOutput> {
    try {
        const shopRef = db.collection('accounts').doc(shop)
        const shopDoc = await shopRef.get();
        if (!shopDoc.exists) {
            return {
                authorised: false,
                status: 404,
                error: 'Shop not found'
            }
        }
    
        const userId = await getUserIdFromToken(req);
        if (!userId) {
            return {
                authorised: false,
                status: 401,
                error: 'User not logged in'
            }
        }
        const userDoc = await db.collection('users').doc(userId).get();
        if (!userDoc) {
            return {
                authorised: false,
                status: 404,
                error: 'User not found'
            }
        }
    
        const memberRef = db.collection('accounts').doc(shop).collection('members').doc(userId);
        const memberDoc = await memberRef.get();
        const isAuthorized = memberDoc.exists && memberDoc.data()?.status === 'active';
        if (!isAuthorized) {
            return {
                authorised: false,
                status: 403,
                error: 'User cannot access this store'
            }
        }
    
        return {
            authorised: true,
            memberDoc,
            userDoc,
            userId,
            shopDoc,
        }
    } catch (error: any) {
        return {
            authorised: false,
            status: 500,
            error: error.message ?? "Unknow error occured",
        }
    }
}