// /api/business/warehouse/create-instant-warehouse/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { db } from '@/lib/firebase-admin';
import { authUserForBusiness } from '@/lib/authoriseUser';
import { Rack, Shelf, Warehouse, Zone } from '@/types/warehouse';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { businessId, warehouseName, address, zoneCount, racksPerZone, shelvesPerRack } = body;

        // Validation
        if (!businessId) {
            return NextResponse.json({ error: 'Business ID is required' }, { status: 400 });
        }

        const result = await authUserForBusiness({ businessId, req: request });

        if (!result.authorised) {
            return NextResponse.json({ error: result.error }, { status: result.status });
        }

        const { userId } = result;

        if (!userId) {
            return NextResponse.json({ error: 'User not logged in' }, { status: 401 });
        }

        if (!warehouseName || !warehouseName.trim()) {
            return NextResponse.json({ error: 'Warehouse name is required' }, { status: 400 });
        }

        const zones = parseInt(zoneCount) || 0;
        const racks = parseInt(racksPerZone) || 0;
        const shelves = parseInt(shelvesPerRack) || 0;

        if (zones < 1 || zones > 50) {
            return NextResponse.json({ error: 'Zone count must be between 1 and 50' }, { status: 400 });
        }

        if (racks < 1 || racks > 50) {
            return NextResponse.json({ error: 'Racks per zone must be between 1 and 50' }, { status: 400 });
        }

        if (shelves < 1 || shelves > 20) {
            return NextResponse.json({ error: 'Shelves per rack must be between 1 and 20' }, { status: 400 });
        }

        // Calculate totals
        const totalZones = zones;
        const totalRacks = zones * racks;
        const totalShelves = zones * racks * shelves;
        const totalOperations = 1 + totalZones + totalRacks + totalShelves;

        // Firestore batch limit is 500, so we need to split into multiple batches
        const MAX_BATCH_SIZE = 500;

        if (totalOperations > 5000) {
            return NextResponse.json({
                error: 'Structure too large. Maximum 5000 total entities allowed.',
                details: { totalZones, totalRacks, totalShelves, totalOperations }
            }, { status: 400 });
        }

        const now = Timestamp.now();
        const warehouseRef = db.collection(`users/${businessId}/warehouses`).doc();
        const warehouseId = warehouseRef.id;
        const trimmedName = warehouseName.trim();

        // Prepare all documents
        interface DocToCreate {
            ref: FirebaseFirestore.DocumentReference;
            data: any;
        }

        const allDocs: DocToCreate[] = [];

        const warehouseData: Warehouse = {
            id: warehouseId,
            name: trimmedName,
            address: address?.trim() || '',
            storageCapacity: 0,
            operationalHours: 0,
            defaultGSTstate: '',
            isDeleted: false,
            createdBy: userId,
            createdAt: now,
            updatedAt: now,
            updatedBy: userId,
            deletedAt: null,
            stats: {
                totalZones: 0,
                totalRacks: 0,
                totalShelves: 0,
                totalProducts: 0,
            },
        };

        // 1. Create warehouse document
        allDocs.push({
            ref: warehouseRef,
            data: warehouseData,
        });

        // 2. Create zones, racks, and shelves
        for (let z = 1; z <= zones; z++) {
            const zoneRef = db.collection(`users/${businessId}/zones`).doc();
            const zoneId = zoneRef.id;
            const zoneName = `Zone-${z}`;
            const zoneCode = `Z${z.toString().padStart(2, '0')}`;

            const zoneData: Zone = {
                id: zoneId,
                name: zoneName,
                code: zoneCode,
                description: '',
                isDeleted: false,
                createdAt: now,
                updatedAt: now,
                createdBy: userId,
                updatedBy: userId,
                warehouseId: warehouseId,
                warehouseName: trimmedName,
                deletedAt: null,
                stats: {
                    totalRacks: 0,
                    totalShelves: 0,
                    totalProducts: 0,
                },
            }

            allDocs.push({
                ref: zoneRef,
                data: zoneData,
            });

            for (let r = 1; r <= racks; r++) {
                const rackRef = db.collection(`users/${businessId}/racks`).doc();
                const rackId = rackRef.id;
                const rackName = `Rack-${r}`;
                const rackCode = `${zoneCode}-R${r.toString().padStart(2, '0')}`;

                const rackData: Rack = {
                    id: rackId,
                    name: rackName,
                    code: rackCode,
                    position: r,
                    isDeleted: false,
                    createdAt: now,
                    updatedAt: now,
                    createdBy: userId,
                    updatedBy: userId,
                    warehouseId: warehouseId,
                    warehouseName: trimmedName,
                    zoneId: zoneId,
                    zoneName: zoneName,
                    deletedAt: null,
                    stats: {
                        totalShelves: 0,
                        totalProducts: 0,
                    },
                }

                allDocs.push({
                    ref: rackRef,
                    data: rackData,
                });

                for (let s = 1; s <= shelves; s++) {
                    const shelfRef = db.collection(`users/${businessId}/shelves`).doc();
                    const shelfId = shelfRef.id;
                    const shelfName = `Shelf-${s}`;
                    const shelfCode = `${rackCode}-S${s.toString().padStart(2, '0')}`;

                    const shelfData: Shelf = {
                        id: shelfId,
                        name: shelfName,
                        code: shelfCode,
                        position: s,
                        capacity: null,
                        isDeleted: false,
                        createdAt: now,
                        updatedAt: now,
                        createdBy: userId,
                        updatedBy: userId,
                        warehouseId: warehouseId,
                        warehouseName: trimmedName,
                        zoneId: zoneId,
                        zoneName: zoneName,
                        rackId: rackId,
                        rackName: rackName,
                        deletedAt: null,
                        coordinates: null,
                        stats: {
                            totalProducts: 0,
                            currentOccupancy: 0,
                        },
                    }

                    allDocs.push({
                        ref: shelfRef,
                        data: shelfData,
                    });
                }
            }
        }

        // Execute in batches
        const batches: FirebaseFirestore.WriteBatch[] = [];
        let currentBatch = db.batch();
        let operationsInCurrentBatch = 0;

        for (const doc of allDocs) {
            if (operationsInCurrentBatch >= MAX_BATCH_SIZE) {
                batches.push(currentBatch);
                currentBatch = db.batch();
                operationsInCurrentBatch = 0;
            }
            currentBatch.set(doc.ref, doc.data);
            operationsInCurrentBatch++;
        }

        // Don't forget the last batch
        if (operationsInCurrentBatch > 0) {
            batches.push(currentBatch);
        }

        // Commit all batches
        await Promise.all(batches.map(batch => batch.commit()));

        return NextResponse.json({
            success: true,
            warehouse: {
                id: warehouseId,
                name: trimmedName,
            },
            structure: {
                zones: totalZones,
                racks: totalRacks,
                shelves: totalShelves,
                totalEntities: totalOperations,
                batchesUsed: batches.length,
            },
        });
    } catch (error) {
        console.error('Error creating instant warehouse:', error);
        return NextResponse.json({ error: 'Failed to create warehouse structure' }, { status: 500 });
    }
}