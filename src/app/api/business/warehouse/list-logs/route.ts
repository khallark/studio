// /api/business/warehouse/list-logs/route.ts

import { authUserForBusiness } from '@/lib/authoriseUser';
import { db } from '@/lib/firebase-admin';
import { NextRequest, NextResponse } from 'next/server';

interface LogEntry {
    id: string;
    entityType: 'zone' | 'rack' | 'shelf' | 'placement';
    entityId: string;
    entityName: string;
    type: string;
    changes?: Record<string, { from: any; to: any }>;
    note?: string;
    timestamp: string;
    userId: string;
    // Additional fields based on entity type
    fromLocation?: any;
    toLocation?: any;
    quantity?: number;
    quantityBefore?: number;
    quantityAfter?: number;
}

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const businessId = searchParams.get('businessId');

        if (!businessId) {
            return NextResponse.json(
                { error: 'Business ID is required' },
                { status: 400 }
            );
        }

        // Verify authentication
        const result = await authUserForBusiness({ businessId, req: request });

        if (!result.authorised) {
            const { error, status } = result;
            return NextResponse.json(
                { error },
                { status }
            );
        }

        const entityType = searchParams.get('entityType'); // zone, rack, shelf, placement
        const entityId = searchParams.get('entityId');
        const limit = parseInt(searchParams.get('limit') || '50');

        if (!businessId) {
            return NextResponse.json({ error: 'Business ID is required' }, { status: 400 });
        }

        const logs: LogEntry[] = [];

        // If specific entity requested
        if (entityType && entityId) {
            const collectionPath = `users/${businessId}/${entityType === 'shelf' ? 'shelve' : entityType}s/${entityId}/logs`;
            const logsSnapshot = await db
                .collection(collectionPath)
                .orderBy('timestamp', 'desc')
                .limit(limit)
                .get();

            // Get entity name
            const entityDoc = await db.doc(`users/${businessId}/${entityType}s/${entityId}`).get();
            const entityName = entityDoc.data()?.name || entityDoc.data()?.productId || 'Unknown';

            logsSnapshot.docs.forEach((doc) => {
                const data = doc.data();
                logs.push({
                    id: doc.id,
                    entityType: entityType as any,
                    entityId,
                    entityName,
                    type: data.type,
                    changes: data.changes,
                    note: data.note,
                    timestamp: data.timestamp?.toDate?.()?.toISOString() || '',
                    userId: data.userId,
                    fromLocation: data.fromZone || data.fromRack,
                    toLocation: data.toZone || data.toRack,
                    quantity: data.quantity,
                    quantityBefore: data.quantityBefore,
                    quantityAfter: data.quantityAfter,
                });
            });
        } else {
            // Fetch recent logs from all entity types
            const entityTypes = ['zones', 'racks', 'shelves'];
            const perTypeLimit = Math.ceil(limit / entityTypes.length);

            for (const type of entityTypes) {
                const entitiesSnapshot = await db
                    .collection(`users/${businessId}/${type}`)
                    .where('isDeleted', '==', false)
                    .limit(20)
                    .get();

                for (const entityDoc of entitiesSnapshot.docs) {
                    const logsSnapshot = await db
                        .collection(`users/${businessId}/${type}/${entityDoc.id}/logs`)
                        .orderBy('timestamp', 'desc')
                        .limit(5)
                        .get();

                    const entityName = entityDoc.data()?.name || 'Unknown';
                    const singularType = type.slice(0, -1) as 'zone' | 'rack' | 'shelf';

                    logsSnapshot.docs.forEach((doc) => {
                        const data = doc.data();
                        logs.push({
                            id: doc.id,
                            entityType: singularType,
                            entityId: entityDoc.id,
                            entityName,
                            type: data.type,
                            changes: data.changes,
                            note: data.note,
                            timestamp: data.timestamp?.toDate?.()?.toISOString() || '',
                            userId: data.userId,
                            fromLocation: data.fromZone || data.fromRack,
                            toLocation: data.toZone || data.toRack,
                            quantity: data.quantity,
                            quantityBefore: data.quantityBefore,
                            quantityAfter: data.quantityAfter,
                        });
                    });
                }
            }

            // Sort all logs by timestamp
            logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        }

        return NextResponse.json({ logs: logs.slice(0, limit) });
    } catch (error) {
        console.error('Error fetching logs:', error);
        return NextResponse.json({ error: 'Failed to fetch logs' }, { status: 500 });
    }
}