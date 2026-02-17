import { NextRequest, NextResponse } from 'next/server';
import { authUserForBusiness } from '@/lib/authoriseUser';
import { Timestamp } from 'firebase-admin/firestore';
import { db } from '@/lib/firebase-admin';
import { Party } from '@/types/warehouse';

export async function POST(req: NextRequest) {
    try {
        const {
            businessId,
            name,
            type,
            code,
            contactPerson,
            phone,
            email,
            address,
            gstin,
            pan,
            bankDetails,
            defaultPaymentTerms,
            notes,
        } = await req.json();

        // ============================================================
        // VALIDATION
        // ============================================================

        if (!businessId || typeof businessId !== 'string') {
            return NextResponse.json(
                { error: 'Validation Error', message: 'businessId is required and must be a string' },
                { status: 400 }
            );
        }

        if (!name || typeof name !== 'string' || name.trim().length === 0) {
            return NextResponse.json(
                { error: 'Validation Error', message: 'Party name is required' },
                { status: 400 }
            );
        }

        const validTypes = ['supplier', 'customer', 'both'];
        if (!type || !validTypes.includes(type)) {
            return NextResponse.json(
                { error: 'Validation Error', message: `type must be one of: ${validTypes.join(', ')}` },
                { status: 400 }
            );
        }

        // Validate GSTIN format (if provided)
        if (gstin && typeof gstin === 'string' && gstin.trim().length > 0) {
            const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
            if (!gstinRegex.test(gstin.trim().toUpperCase())) {
                return NextResponse.json(
                    { error: 'Validation Error', message: 'Invalid GSTIN format' },
                    { status: 400 }
                );
            }
        }

        // Validate PAN format (if provided)
        if (pan && typeof pan === 'string' && pan.trim().length > 0) {
            const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
            if (!panRegex.test(pan.trim().toUpperCase())) {
                return NextResponse.json(
                    { error: 'Validation Error', message: 'Invalid PAN format' },
                    { status: 400 }
                );
            }
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
        // GSTIN UNIQUENESS CHECK
        // ============================================================

        const partiesCollection = businessDoc!.ref.collection('parties');
        const trimmedGstin = gstin?.trim().toUpperCase() || null;

        if (trimmedGstin) {
            const existingGstin = await partiesCollection
                .where('gstin', '==', trimmedGstin)
                .limit(1)
                .get();

            if (!existingGstin.empty) {
                const existingParty = existingGstin.docs[0].data();
                return NextResponse.json(
                    {
                        error: 'Validation Error',
                        message: `A party with this GSTIN already exists: ${existingParty.name}`,
                    },
                    { status: 409 }
                );
            }
        }

        // ============================================================
        // CREATE PARTY
        // ============================================================

        const now = Timestamp.now();
        const partyRef = partiesCollection.doc();

        const partyData: Party = {
            id: partyRef.id,
            name: name.trim(),
            type,
            code: code?.trim() || null,
            contactPerson: contactPerson?.trim() || null,
            phone: phone?.trim() || null,
            email: email?.trim() || null,
            address: address
                ? {
                      line1: address.line1?.trim() || null,
                      line2: address.line2?.trim() || null,
                      city: address.city?.trim() || null,
                      state: address.state?.trim() || null,
                      pincode: address.pincode?.trim() || null,
                      country: address.country?.trim() || 'India',
                  }
                : null,
            gstin: trimmedGstin,
            pan: pan?.trim().toUpperCase() || null,
            bankDetails: bankDetails
                ? {
                      accountName: bankDetails.accountName?.trim() || null,
                      accountNumber: bankDetails.accountNumber?.trim() || null,
                      ifsc: bankDetails.ifsc?.trim().toUpperCase() || null,
                      bankName: bankDetails.bankName?.trim() || null,
                  }
                : null,
            defaultPaymentTerms: defaultPaymentTerms?.trim() || null,
            notes: notes?.trim() || null,
            isActive: true,
            createdAt: now,
            updatedAt: now,
            createdBy: userId,
            updatedBy: userId,
        };

        await partyRef.set(partyData);

        // ============================================================
        // RETURN SUCCESS
        // ============================================================

        return NextResponse.json(
            {
                success: true,
                message: `Party "${partyData.name}" created successfully`,
                partyId: partyRef.id,
                party: partyData,
            },
            { status: 201 }
        );
    } catch (error: any) {
        console.error('❌ Party create API error:', error);
        return NextResponse.json(
            { error: 'Internal Server Error', message: error.message || 'An unexpected error occurred' },
            { status: 500 }
        );
    }
}