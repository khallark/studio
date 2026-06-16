'use client';

import { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { ParentProduct } from '@/types/warehouse';

export function useParentProducts(businessId: string | undefined) {
    const [parents, setParents] = useState<ParentProduct[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!businessId) return;
        setLoading(true);

        const ref = collection(db, 'users', businessId, 'parentProducts');
        const unsubscribe = onSnapshot(
            ref,
            (snapshot) => {
                const list = snapshot.docs.map((d) => ({
                    id: d.id,
                    ...d.data(),
                })) as ParentProduct[];

                // Latest first; legacy docs without createdAt sort to the bottom.
                list.sort((a, b) => {
                    const am = (a.createdAt as any)?.toMillis?.() ?? 0;
                    const bm = (b.createdAt as any)?.toMillis?.() ?? 0;
                    return bm - am;
                });

                setParents(list);
                setLoading(false);
            },
            (error) => {
                console.error('Error fetching parent products:', error);
                setLoading(false);
            }
        );

        return () => unsubscribe();
    }, [businessId]);

    return { parents, loading };
}