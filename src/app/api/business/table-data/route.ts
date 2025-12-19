// app/api/business/table-data/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { authUserForBusiness } from '@/lib/authoriseUser';
import { db } from '@/lib/firebase-admin';

const CLOUD_FUNCTION_URL = process.env.GENERATE_TABLE_DATA_URL!;
const ENQUEUE_FUNCTION_SECRET = process.env.ENQUEUE_FUNCTION_SECRET!;

export async function POST(req: NextRequest) {
    try {
        const { businessId, stores, startTime, endTime } = await req.json();

        // ============================================================
        // VALIDATION
        // ============================================================

        if (!businessId || typeof businessId !== 'string') {
            return NextResponse.json(
                { error: 'Validation Error', message: 'businessId is required and must be a string' },
                { status: 400 }
            );
        }

        // Get authorization header
        const authHeader = req.headers.get('Authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return NextResponse.json(
                { error: 'Unauthorized', message: 'Missing or invalid authorization header' },
                { status: 401 }
            );
        }

        // ============================================================
        // AUTHORIZATION
        // ============================================================

        const result = await authUserForBusiness({ businessId, req });
        const { businessDoc } = result;

        if (!result.authorised) {
            const { error, status } = result;
            return NextResponse.json({ error }, { status });
        }

        // ============================================================
        // VALIDATE STORES
        // ============================================================

        if (!stores || !Array.isArray(stores) || stores.length === 0) {
            return NextResponse.json(
                { error: 'Validation Error', message: 'stores must be a non-empty array' },
                { status: 400 }
            );
        }

        if (!startTime || typeof startTime !== 'string') {
            return NextResponse.json(
                { error: 'Validation Error', message: 'startTime is required and must be a string in ISO format' },
                { status: 400 }
            );
        }

        if (!endTime || typeof endTime !== 'string') {
            return NextResponse.json(
                { error: 'Validation Error', message: 'endTime is required and must be a string in ISO format' },
                { status: 400 }
            );
        }

        // Validate that requested stores belong to the business
        const actualBusinessStores: string[] = businessDoc?.data()?.stores || [];
        
        const invalidStores = stores.filter((store: string) => !actualBusinessStores.includes(store));
        if (invalidStores.length > 0) {
            return NextResponse.json(
                { 
                    error: 'Validation Error', 
                    message: `The following stores do not belong to this business: ${invalidStores.join(', ')}` 
                },
                { status: 403 }
            );
        }

        // ============================================================
        // SET LOADING STATE IN FIRESTORE
        // ============================================================

        const businessDocRef = db.collection('users').doc(businessId);

        // Set loading state to true
        await businessDocRef.set(
            {
                tableData: {
                    loading: true,
                    startTime,
                    endTime,
                    stores,
                    error: null,
                },
            },
            { merge: true }
        );

        console.log('🚀 Calling Cloud Function:', {
            url: CLOUD_FUNCTION_URL,
            businessId,
            storeCount: stores.length,
            startTime,
            endTime,
        });

        // ============================================================
        // FIRE-AND-FORGET CLOUD FUNCTION CALL
        // ============================================================

        // We don't await this - fire and forget
        fetch(CLOUD_FUNCTION_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Api-Key': ENQUEUE_FUNCTION_SECRET,
            },
            body: JSON.stringify({
                businessId,
                stores,
                startTime,
                endTime,
            }),
        })
            .then(async (response) => {
                if (!response.ok) {
                    console.error('❌ Cloud Function returned error:', response.status);
                    const errorText = await response.text().catch(() => 'Unknown error');
                    console.error('Error details:', errorText);
                    
                    // Update document with error state
                    await businessDocRef.update({
                        'tableData.loading': false,
                        'tableData.error': `Cloud function failed: ${response.status}`,
                    });
                } else {
                    console.log('✅ Cloud Function call initiated successfully');
                }
            })
            .catch(async (error) => {
                console.error('❌ Cloud Function request failed:', error);
                
                // Update document with error state
                await businessDocRef.update({
                    'tableData.loading': false,
                    'tableData.error': error.message || 'Failed to call cloud function',
                });
            });

        // ============================================================
        // RETURN ACCEPTED RESPONSE
        // ============================================================

        return NextResponse.json(
            {
                success: true,
                message: 'Table data calculation has been initiated.',
                status: 'processing',
                dateRange: { startTime, endTime },
                stores,
            },
            { status: 202 }
        );

    } catch (error: any) {
        console.error('❌ API error:', error);
        return NextResponse.json(
            {
                error: 'Internal Server Error',
                message: error.message || 'An unexpected error occurred',
            },
            { status: 500 }
        );
    }
}