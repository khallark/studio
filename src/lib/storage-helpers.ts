// lib/storage-helpers.ts

import { ref, getDownloadURL } from 'firebase/storage';
import { storage } from '@/lib/firebase';
import { db } from './firebase-admin';

/**
 * Get businessId for a store.
 * Every store must belong to exactly one business.
 */
export async function getBusinessIdForStore(storeId: string): Promise<string> {
  try {
    const businessesSnapshot = await db
      .collection('users')
      .where('stores', 'array-contains', storeId)
      .limit(1)
      .get();

    if (businessesSnapshot.empty) {
      throw new Error(`No business found for store: ${storeId}`);
    }

    return businessesSnapshot.docs[0].id;
  } catch (error) {
    console.error('Error looking up businessId for store:', error);
    throw error;
  }
}

/**
 * Return images path.
 * Every business has its own store path.
 */
export function getReturnImagesPath(
  businessId: string,
  storeId: string,
  orderId: string,
  fileName: string
): string {
  if (!businessId) {
    throw new Error('businessId is required for return image path');
  }

  return `return-images/${businessId}/${storeId}/${orderId}/${fileName}`;
}

/**
 * Get download URL for return image.
 * Main path only. Optional legacy fallback can stay temporarily during migration.
 */
export async function getReturnImageUrl(
  businessId: string,
  shopId: string,
  orderId: string,
  imageName: string
): Promise<string | null> {
  try {
    if (!businessId) {
      throw new Error('businessId is required to fetch return image');
    }

    const path = `return-images/${businessId}/${shopId}/${orderId}/${imageName}`;
    const imageRef = ref(storage, path);

    return await getDownloadURL(imageRef);
  } catch (error) {
    console.error(`Failed to get download URL for ${imageName}:`, error);
    return null;
  }
}