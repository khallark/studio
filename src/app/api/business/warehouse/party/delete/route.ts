import { NextRequest, NextResponse } from 'next/server';
import { authUserForBusiness } from '@/lib/authoriseUser';
import { Timestamp } from 'firebase-admin/firestore';
import { db } from '@/lib/firebase-admin';
import { Party } from '@/types/warehouse';

export async function POST(req: NextRequest) {
    try {
        const { businessId, partyId } = await req.json();

        // ============================================================
        // VALIDATION
        // ============================================================

        if (!businessId || typeof businessId !== 'string') {
            return NextResponse.json(
                { error: 'Validation Error', message: 'businessId is required and must be a string' },
                { status: 400 }
            );
        }

        if (!partyId || typeof partyId !== 'string') {
            return NextResponse.json(
                { error: 'Validation Error', message: 'partyId is required' },
                { status: 400 }
            );
        }

        // ============================================================
        // AUTHORIZATION
        // ============================================================

        const result = await authUserForBusiness({ businessId, req });
        const { businessDoc, userId } = result;

        if (!result.authorised) {
            const { error, status } = result;
            return NextResponse.json({ error }, { status });
        }

        if (!userId) {
            return NextResponse.json({ error: 'User not logged in' }, { status: 401 });
        }

        // ============================================================
        // FETCH PARTY
        // ============================================================

        const partiesCollection = businessDoc!.ref.collection('parties');
        const partyRef = partiesCollection.doc(partyId);
        const partySnap = await partyRef.get();

        if (!partySnap.exists) {
            return NextResponse.json(
                { error: 'Not Found', message: 'Party not found' },
                { status: 404 }
            );
        }

        const partyData = partySnap.data() as Party;

        if (!partyData.isActive) {
            return NextResponse.json(
                { error: 'Validation Error', message: 'Party is already deactivated' },
                { status: 400 }
            );
        }

        // ============================================================
        // CHECK FOR NON-CLOSED POs
        // ============================================================

        const closedStatuses = ['closed', 'cancelled', 'fully_received'];

        const linkedPOs = await businessDoc!.ref
            .collection('purchaseOrders')
            .where('supplierId', '==', partyId)
            .get();

        const openPOs = linkedPOs.docs.filter(doc => {
            const poStatus = doc.data().status;
            return !closedStatuses.includes(poStatus);
        });

        if (openPOs.length > 0) {
            const openPONumbers = openPOs.map(doc => doc.data().poNumber).join(', ');
            return NextResponse.json(
                {
                    error: 'Conflict',
                    message: `Cannot deactivate party. ${openPOs.length} open PO(s) exist: ${openPONumbers}. Close or cancel them first.`,
                },
                { status: 409 }
            );
        }

        // ============================================================
        // SOFT DELETE (deactivate)
        // ============================================================

        const now = Timestamp.now();

        await partyRef.update({
            isActive: false,
            updatedAt: now,
            updatedBy: userId,
        });

        return NextResponse.json(
            {
                success: true,
                message: `Party "${partyData.name}" has been deactivated`,
                partyId,
                partyName: partyData.name,
            },
            { status: 200 }
        );
    } catch (error: any) {
        console.error('❌ Party delete API error:', error);
        return NextResponse.json(
            { error: 'Internal Server Error', message: error.message || 'An unexpected error occurred' },
            { status: 500 }
        );
    }
}