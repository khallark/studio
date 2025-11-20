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

        const userId = result.userId!;

        // ✅ Get user's own document
        const userDoc = await db.collection('users').doc(userId).get();
        const userData = userDoc.data();

        // ✅ Get user's direct stores
        const directStores: string[] = userData?.stores || [];

        // ✅ Get stores from businesses user is a member of
        const userBusinesses: string[] = userData?.businesses || [];
        const memberStores: string[] = [];

        for (const businessId of userBusinesses) {
            // Check if user is an active member
            const memberDoc = await db.collection('users').doc(businessId)
                .collection('members').doc(userId).get();

            if (memberDoc.exists && memberDoc.data()?.status === 'active') {
                // Get business's stores
                const businessDoc = await db.collection('users').doc(businessId).get();
                const businessStores = businessDoc.data()?.stores || [];
                memberStores.push(...businessStores);
            }
        }

        // ✅ Combine and deduplicate all accessible stores
        const accessibleStores = [...new Set([...directStores, ...memberStores])];

        // ✅ Get current business info for additional claims
        const businessDoc = await db.collection('users').doc(businessId).get();

        // Set custom claims with ALL accessible stores
        await auth.setCustomUserClaims(userId, {
            businessId: businessId, // Current active business
            accessibleStores, // All stores user can access
            vendorName: businessDoc.data()?.vendorName,
        });

        console.log(`✅ Set custom claims for user ${userId}:`);
        console.log(`   - Current business: ${businessId}`);
        console.log(`   - Accessible stores: ${accessibleStores.length}`);
        console.log(JSON.stringify(accessibleStores, null, 2));
        console.log(`   - Direct stores: ${directStores.length}`);
        console.log(`   - Member stores: ${memberStores.length}`);

        return NextResponse.json({
            success: true,
            businessId,
            accessibleStoresCount: accessibleStores.length,
            directStoresCount: directStores.length,
            memberStoresCount: memberStores.length
        });

    } catch (error) {
        console.error('Set claims error:', error);
        return NextResponse.json({
            error: 'Failed to set claims'
        }, { status: 500 });
    }
}