// app/api/businesses/list/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db as adminDb } from '@/lib/firebase-admin';
import { getUserIdFromToken } from '@/lib/authoriseUser';

export async function GET(request: NextRequest) {
    try {
        // Verify authentication
        const authHeader = request.headers.get('Authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        const userId = await getUserIdFromToken(request);

        if (!userId) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        // Get user's business document
        const userBusinessRef = adminDb.collection('users').doc(userId);
        const userBusinessSnap = await userBusinessRef.get();

        if (!userBusinessSnap.exists) {
            return NextResponse.json(
                { error: 'User business document not found' },
                { status: 404 }
            );
        }

        const userData = userBusinessSnap.data();
        const businessIds: string[] = userData?.businesses || [];

        // Always include user's own business (if not already in the array)
        if (!businessIds.includes(userId)) {
            businessIds.unshift(userId); // Add at the beginning
        }

        if (businessIds.length === 0) {
            return NextResponse.json({ businesses: [] });
        }

        // Fetch details for each business
        const businessPromises = businessIds.map(async (businessId) => {
            try {
                // Get business document
                const businessDocRef = adminDb.collection('users').doc(businessId);
                const businessDocSnap = await businessDocRef.get();

                if (!businessDocSnap.exists) {
                    console.warn(`Business ${businessId} not found`);
                    return null;
                }

                const businessData = businessDocSnap.data();

                // Count members
                const membersSnap = await adminDb
                    .collection(`users/${businessId}/members`)
                    .get();

                return {
                    businessId,
                    businessName: businessData?.primaryContact?.name || businessData?.profile?.displayName || 'Unnamed Business',
                    memberCount: 1 + membersSnap.size,
                    isOwnBusiness: businessId === userId,
                };
            } catch (error) {
                console.error(`Error fetching business ${businessId}:`, error);
                return null;
            }
        });

        const businessDetails = await Promise.all(businessPromises);

        // Filter out nulls and sort: own business first, then by name
        const validBusinesses = businessDetails
            .filter((b): b is NonNullable<typeof b> => b !== null)
            .sort((a, b) => {
                if (a.isOwnBusiness) return -1;
                if (b.isOwnBusiness) return 1;
                return a.businessName.localeCompare(b.businessName);
            });

        return NextResponse.json({ businesses: validBusinesses });
    } catch (error) {
        console.error('Error fetching businesses:', error);
        return NextResponse.json(
            { error: 'Failed to fetch businesses' },
            { status: 500 }
        );
    }
}