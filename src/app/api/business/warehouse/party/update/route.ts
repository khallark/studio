import { NextRequest, NextResponse } from 'next/server';
import { authUserForBusiness } from '@/lib/authoriseUser';
import { Timestamp } from 'firebase-admin/firestore';
import { db } from '@/lib/firebase-admin';
import { Party } from '@/types/warehouse';

export async function POST(req: NextRequest) {
    try {
        const {
            businessId,
            partyId,
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
            isActive,
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

        if (!partyId || typeof partyId !== 'string') {
            return NextResponse.json(
                { error: 'Validation Error', message: 'partyId is required' },
                { status: 400 }
            );
        }

        // At least one field must be provided for update
        const hasUpdates =
            name !== undefined ||
            code !== undefined ||
            contactPerson !== undefined ||
            phone !== undefined ||
            email !== undefined ||
            address !== undefined ||
            gstin !== undefined ||
            pan !== undefined ||
            bankDetails !== undefined ||
            defaultPaymentTerms !== undefined ||
            notes !== undefined ||
            isActive !== undefined;

        if (!hasUpdates) {
            return NextResponse.json(
                { error: 'Validation Error', message: 'At least one field must be provided for update' },
                { status: 400 }
            );
        }

        // Block type change
        if (type !== undefined) {
            return NextResponse.json(
                { error: 'Validation Error', message: 'Party type cannot be changed after creation' },
                { status: 400 }
            );
        }

        // Validate name if provided
        if (name !== undefined && (!name || typeof name !== 'string' || name.trim().length === 0)) {
            return NextResponse.json(
                { error: 'Validation Error', message: 'Party name cannot be empty' },
                { status: 400 }
            );
        }

        // Validate GSTIN format (if provided and not clearing)
        const trimmedGstin = gstin !== undefined ? (gstin?.trim().toUpperCase() || null) : undefined;
        if (trimmedGstin) {
            const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
            if (!gstinRegex.test(trimmedGstin)) {
                return NextResponse.json(
                    { error: 'Validation Error', message: 'Invalid GSTIN format' },
                    { status: 400 }
                );
            }
        }

        // Validate PAN format (if provided and not clearing)
        const trimmedPan = pan !== undefined ? (pan?.trim().toUpperCase() || null) : undefined;
        if (trimmedPan) {
            const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
            if (!panRegex.test(trimmedPan)) {
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
        // FETCH EXISTING PARTY
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

        const existingParty = partySnap.data() as Party;

        // ============================================================
        // GSTIN UNIQUENESS CHECK (excluding self)
        // ============================================================

        if (trimmedGstin && trimmedGstin !== existingParty.gstin) {
            const existingGstin = await partiesCollection
                .where('gstin', '==', trimmedGstin)
                .limit(1)
                .get();

            if (!existingGstin.empty) {
                const conflictDoc = existingGstin.docs[0];
                if (conflictDoc.id !== partyId) {
                    const conflictParty = conflictDoc.data();
                    return NextResponse.json(
                        {
                            error: 'Validation Error',
                            message: `A party with this GSTIN already exists: ${conflictParty.name}`,
                        },
                        { status: 409 }
                    );
                }
            }
        }

        // ============================================================
        // BUILD UPDATE OBJECT
        // ============================================================

        const now = Timestamp.now();
        const updateData: Record<string, any> = {
            updatedAt: now,
            updatedBy: userId,
        };

        if (name !== undefined) updateData.name = name.trim();
        if (code !== undefined) updateData.code = code?.trim() || null;
        if (contactPerson !== undefined) updateData.contactPerson = contactPerson?.trim() || null;
        if (phone !== undefined) updateData.phone = phone?.trim() || null;
        if (email !== undefined) updateData.email = email?.trim() || null;
        if (trimmedGstin !== undefined) updateData.gstin = trimmedGstin;
        if (trimmedPan !== undefined) updateData.pan = trimmedPan;
        if (defaultPaymentTerms !== undefined) updateData.defaultPaymentTerms = defaultPaymentTerms?.trim() || null;
        if (notes !== undefined) updateData.notes = notes?.trim() || null;
        if (isActive !== undefined) updateData.isActive = !!isActive;

        if (address !== undefined) {
            updateData.address = address
                ? {
                      line1: address.line1?.trim() || null,
                      line2: address.line2?.trim() || null,
                      city: address.city?.trim() || null,
                      state: address.state?.trim() || null,
                      pincode: address.pincode?.trim() || null,
                      country: address.country?.trim() || 'India',
                  }
                : null;
        }

        if (bankDetails !== undefined) {
            updateData.bankDetails = bankDetails
                ? {
                      accountName: bankDetails.accountName?.trim() || null,
                      accountNumber: bankDetails.accountNumber?.trim() || null,
                      ifsc: bankDetails.ifsc?.trim().toUpperCase() || null,
                      bankName: bankDetails.bankName?.trim() || null,
                  }
                : null;
        }

        // ============================================================
        // COMMIT UPDATE
        // ============================================================

        await partyRef.update(updateData);

        return NextResponse.json(
            {
                success: true,
                message: `Party "${updateData.name || existingParty.name}" updated successfully`,
                partyId,
            },
            { status: 200 }
        );
    } catch (error: any) {
        console.error('❌ Party update API error:', error);
        return NextResponse.json(
            { error: 'Internal Server Error', message: error.message || 'An unexpected error occurred' },
            { status: 500 }
        );
    }
}