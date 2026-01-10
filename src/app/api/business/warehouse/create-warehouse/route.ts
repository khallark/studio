// /api/business/warehouse/create-warehouse/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { authUserForBusiness } from '@/lib/authoriseUser';
import { db } from '@/lib/firebase-admin';
import { Warehouse } from '@/types/warehouse';

export async function POST(request: NextRequest) {
    try {
        // Parse request body
        const body = await request.json();
        const { businessId, name, code, address, storageCapacity, operationalHours, defaultGSTstate } = body;

        // Verify authentication
        if (!businessId) {
            return NextResponse.json(
                { error: 'Business ID is required' },
                { status: 400 }
            );
        }

        const result = await authUserForBusiness({ businessId, req: request });

        if (!result.authorised) {
            const { error, status } = result;
            return NextResponse.json(
                { error },
                { status }
            );
        }

        const { userId } = result;

        if (!userId) {
            return NextResponse.json(
                { error: 'User not logged in' },
                { status: 401 }
            );
        }

        if (!name || !name.trim()) {
            return NextResponse.json(
                { error: 'Warehouse name is required' },
                { status: 400 }
            );
        }

        if (!code || !code.trim()) {
            return NextResponse.json(
                { error: 'Warehouse code is required' },
                { status: 400 }
            );
        }

        // Normalize code (uppercase, trimmed)
        const normalizedCode = code.trim().toUpperCase();

        // Use code as document ID
        const warehouseRef = db.collection(`users/${businessId}/warehouses`).doc(normalizedCode);

        // Check if warehouse with this code already exists
        const existingWarehouse = await warehouseRef.get();
        if (existingWarehouse.exists) {
            const { isDeleted } = existingWarehouse.data() as Warehouse;
            if (!isDeleted) {
                return NextResponse.json(
                    { error: `Warehouse with code "${normalizedCode}" already exists` },
                    { status: 409 }
                );
            }
        }

        const now = Timestamp.now();

        if (!existingWarehouse.exists) {
            const warehouseData: Warehouse = {
                id: normalizedCode,
                code: normalizedCode,
                name: name.trim(),
                address: address?.trim() || '',
                storageCapacity: storageCapacity || 0,
                operationalHours: operationalHours || 0,
                defaultGSTstate: defaultGSTstate || '',
                deletedAt: null,
                isDeleted: false,
                createdBy: userId,
                createdAt: now,
                updatedAt: now,
                updatedBy: userId,
                stats: {
                    totalZones: 0,
                    totalRacks: 0,
                    totalShelves: 0,
                    totalProducts: 0,
                },
                nameVersion: 1,
            };
    
            await warehouseRef.set(warehouseData);
        } else {
            const warehouseUpdatedData: Partial<Warehouse> = {
                name: name.trim(),
                address: address?.trim() || '',
                storageCapacity: storageCapacity || 0,
                operationalHours: operationalHours || 0,
                defaultGSTstate: defaultGSTstate || '',
                deletedAt: null,
                isDeleted: false,
                updatedAt: now,
                updatedBy: userId,
                stats: {
                    totalZones: 0,
                    totalRacks: 0,
                    totalShelves: 0,
                    totalProducts: 0,
                },
            };
    
            await warehouseRef.update(warehouseUpdatedData);
        }

        return NextResponse.json({
            success: true,
            warehouse: {
                id: normalizedCode,
                code: normalizedCode,
                name: name.trim(),
                address: address?.trim() || '',
            },
        });
    } catch (error) {
        console.error('Error creating warehouse:', error);
        return NextResponse.json(
            { error: 'Failed to create warehouse' },
            { status: 500 }
        );
    }
}