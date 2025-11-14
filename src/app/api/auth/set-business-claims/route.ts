// /api/auth/set-business-claims/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { auth, db } from '@/lib/firebase-admin';
import { authUserForBusiness } from '@/lib/authoriseUser';

export async function POST(req: NextRequest) {
    try {
        const { businessId } = await req.json();
        if (!businessId) {
            return NextResponse.json({ error: "No businessId provided" }, { status: 400 });
        }

        const result = await authUserForBusiness({ businessId, req })

        if (!result.authorised) {
            return NextResponse.json(
                { error: result.error || 'Unauthorized' },
                { status: result.status || 403 }
            );
        }

        // Get stores for this business
        const businessDoc = await db.collection('users').doc(businessId).get();
        const stores = businessDoc.data()?.stores || [];

        // Set custom claims
        await auth.setCustomUserClaims(result.userId!, {
            businessId: businessId,
            authorizedStores: stores,
            vendorName: businessDoc.data()?.vendorName,
        });

        return Response.json({
            success: true,
            businessId,
            storeCount: stores.length
        });

    } catch (error) {
        console.error('Set claims error:', error);
        return Response.json({
            error: 'Failed to set claims'
        }, { status: 500 });
    }
}