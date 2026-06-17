'use client';

import { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { SizeChartPresetDoc } from '@/types/warehouse';

export function useSizeChartPresets(businessId: string | undefined) {
    const [presets, setPresets] = useState<SizeChartPresetDoc[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!businessId) return;
        setLoading(true);

        const ref = collection(db, 'users', businessId, 'sizeChartPresets');
        const unsubscribe = onSnapshot(
            ref,
            (snapshot) => {
                const list = snapshot.docs.map((d) => ({
                    id: d.id,
                    ...d.data(),
                })) as SizeChartPresetDoc[];

                list.sort((a, b) => {
                    const am = (a.createdAt as any)?.toMillis?.() ?? 0;
                    const bm = (b.createdAt as any)?.toMillis?.() ?? 0;
                    return bm - am;
                });

                setPresets(list);
                setLoading(false);
            },
            (error) => {
                console.error('Error fetching size chart presets:', error);
                setLoading(false);
            }
        );

        return () => unsubscribe();
    }, [businessId]);

    return { presets, loading };
}