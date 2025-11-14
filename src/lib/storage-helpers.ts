// lib/storage-helpers.ts

import { ref, getDownloadURL } from 'firebase/storage';
import { storage } from '@/lib/firebase';
import { db } from './firebase-admin';

const SHARED_STORE_ID = 'nfkjgp-sv.myshopify.com';

/**
 * Get businessId for a store, or null if it's a shared store
 */
export async function getBusinessIdForStore(storeId: string): Promise<string | null> {
  // ✅ Special case: shared store
  if (storeId === SHARED_STORE_ID) {
    console.log(`Store ${storeId} is shared - using shared path`);
    return null; // Signal to use shared path
  }
  
  try {
    const businessesSnapshot = await db
      .collection('users')
      .where('stores', 'array-contains', storeId)
      .limit(1)
      .get();
    
    if (businessesSnapshot.empty) {
      console.error(`No business found for store: ${storeId}`);
      return null;
    }
    
    return businessesSnapshot.docs[0].id;
    
  } catch (error) {
    console.error('Error looking up businessId for store:', error);
    return null;
  }
}

/**
 * Get storage path for return images (handles shared stores)
 */
export function getReturnImagesPath(
  businessId: string | null,
  storeId: string,
  orderId: string,
  fileName: string
): string {
  if (storeId === SHARED_STORE_ID || !businessId) {
    // Shared store or no businessId - use shared path
    return `return-images/shared/${storeId}/${orderId}/${fileName}`;
  } else {
    // Regular store - use business-specific path
    return `return-images/${businessId}/${storeId}/${orderId}/${fileName}`;
  }
}

/**
 * Get download URL for return images, supporting both old and new path structures
 */
export async function getReturnImageUrl(
  businessId: string,
  shopId: string,
  orderId: string,
  imageName: string
): Promise<string | null> {
  try {
    // ✅ Try NEW path first (with businessId)
    const newPath = `return-images/${businessId}/${shopId}/${orderId}/${imageName}`;
    const newRef = ref(storage, newPath);
    
    try {
      const url = await getDownloadURL(newRef);
      console.log('✅ Found image in new path');
      return url;
    } catch (newError: any) {
      // If not found in new path, try old path
      if (newError.code === 'storage/object-not-found') {
        console.log('⚠️ Not found in new path, trying legacy path...');
        
        // ✅ Fallback to OLD path (without businessId)
        const oldPath = `return-images/${shopId}/${orderId}/${imageName}`;
        const oldRef = ref(storage, oldPath);
        
        const url = await getDownloadURL(oldRef);
        console.log('✅ Found image in legacy path');
        return url;
      }
      
      throw newError;
    }
  } catch (error) {
    console.error(`Failed to get download URL for ${imageName}:`, error);
    return null;
  }
}