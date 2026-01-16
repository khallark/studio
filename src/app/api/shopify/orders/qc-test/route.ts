import { NextRequest, NextResponse } from 'next/server';
import { db, auth as adminAuth, storage } from '@/lib/firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { authBusinessForOrderOfTheExceptionStore, authUserForBusinessAndStore } from '@/lib/authoriseUser';
import { SHARED_STORE_IDS } from '@/lib/shared-constants';
import { UPC } from '@/types/warehouse';

export async function POST(req: NextRequest) {
  try {
    // Parse JSON body instead of FormData
    const body = await req.json();
    const { businessId, shop, orderId, qcStatuses, videoPath } = body;

    // Validate required fields
    if (!shop || !orderId || !qcStatuses || !videoPath) {
      return NextResponse.json({
        error: 'Missing required fields',
        details: 'shopId, orderId, qcStatuses, and videoPath are all required'
      }, { status: 400 });
    }

    const result = await authUserForBusinessAndStore({ businessId, shop, req })

    const businessData = result.businessDoc?.data();

    if (!result.authorised) {
      const { error, status } = result;
      return NextResponse.json({ error }, { status });
    }

    // Validate qcStatuses is an object
    if (typeof qcStatuses !== 'object' || Array.isArray(qcStatuses)) {
      return NextResponse.json({
        error: 'Invalid qcStatuses format',
        details: 'qcStatuses must be an object'
      }, { status: 400 });
    }

    // Verify the video exists in Firebase Storage (security check)
    const bucket = storage.bucket();
    try {
      const [exists] = await bucket.file(videoPath).exists();
      if (!exists) {
        return NextResponse.json({
          error: 'Video not found in storage',
          details: 'The uploaded video could not be verified'
        }, { status: 400 });
      }
    } catch (storageError) {
      console.error('Error checking video existence:', storageError);
      return NextResponse.json({
        error: 'Failed to verify video',
        details: 'Could not verify the uploaded video'
      }, { status: 500 });
    }

    // Get order from Firestore
    const orderRef = db.collection('accounts').doc(shop).collection('orders').doc(orderId);
    const orderDoc = await orderRef.get();

    if (!orderDoc.exists) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    const orderData = orderDoc.data();

    if (SHARED_STORE_IDS.includes(shop)) {
      const vendorName = businessData?.vendorName;
      const vendors = orderData?.vendors;
      const canProcess = authBusinessForOrderOfTheExceptionStore({ businessId, vendorName, vendors });
      if (!canProcess.authorised) {
        const { error, status } = canProcess;
        return NextResponse.json({ error }, { status });
      }
    }

    // Update line items with QC statuses
    const updatedLineItems = orderData?.raw?.line_items?.map((item: any) => ({
      ...item,
      qc_status: qcStatuses[item.id] || null,
    })) || [];

    // Update order in Firestore
    await orderRef.update({
      'raw.line_items': updatedLineItems,
      'unboxing_video_path': videoPath,
      customStatus: 'Pending Refunds',
      lastStatusUpdate: FieldValue.serverTimestamp(),
      customStatusesLogs: FieldValue.arrayUnion({
        status: 'Pending Refunds',
        createdAt: Timestamp.now(),
        remarks: 'QC submitted with unboxing video',
      }),
    });

    console.log(`QC submitted for order ${orderId}, video path: ${videoPath}`);

    // ============================================
    // Handle UPCs for QC Pass items only
    // ============================================
    let upcUpdateCount = 0;
    let upcCreateCount = 0;
    const qcPassItems = updatedLineItems.filter((item: any) => qcStatuses[item.id] === 'QC Pass');

    if (qcPassItems.length > 0) {
      console.log(`🔄 Processing UPCs for ${qcPassItems.length} QC Pass items...`);

      // Query all UPCs for this order
      const upcsSnapshot = await db
        .collection(`users/${businessId}/upcs`)
        .where('orderId', '==', String(orderId))
        .get();

      // Group existing UPCs by productId
      const existingUPCsByProduct = new Map<string, any[]>();
      upcsSnapshot.docs.forEach(doc => {
        const upcData = doc.data() as UPC;
        const productId = upcData.productId;
        if (!existingUPCsByProduct.has(productId)) {
          existingUPCsByProduct.set(productId, []);
        }
        existingUPCsByProduct.get(productId)!.push({ ref: doc.ref, data: upcData });
      });

      // Process each QC Pass item individually
      for (const item of qcPassItems) {
        try {
          const productId = String(item.product_id);
          const variantId = String(item.variant_id);
          const quantity = Number(item.quantity) || 1;

          // Get product mapping
          const storeProductDoc = await db
            .doc(`accounts/${shop}/products/${productId}`)
            .get();

          if (!storeProductDoc.exists) {
            console.warn(`⚠️ Store product ${productId} not found - skipping this item`);
            continue;
          }

          const storeProductData = storeProductDoc.data();
          const variantMapping = storeProductData?.variantMappingDetails?.[variantId]
            || storeProductData?.variantMappings?.[variantId];

          if (!variantMapping) {
            console.warn(`⚠️ No mapping for variant ${variantId} - skipping this item`);
            continue;
          }

          const businessProductSku = typeof variantMapping === 'object'
            ? variantMapping.businessProductSku
            : variantMapping;

          // Check if UPCs already exist for this product
          const existingUPCs = existingUPCsByProduct.get(businessProductSku) || [];

          if (existingUPCs.length > 0) {
            // Update existing UPCs to 'inbound'
            const batch = db.batch();
            let batchCount = 0;

            for (const upc of existingUPCs) {
              if (upc.data.putAway !== 'inbound') {
                const updatedData: Partial<UPC> = {
                  putAway: 'inbound',
                  updatedAt: Timestamp.now(),
                  updatedBy: result.userId!,
                };
                batch.update(upc.ref, updatedData);
                batchCount++;
              }
            }

            if (batchCount > 0) {
              await batch.commit();
              upcUpdateCount += batchCount;
              console.log(`✅ Updated ${batchCount} UPCs to 'inbound' for product ${businessProductSku}`);
            }
          } else {
            // Create new UPCs for this item
            const batch = db.batch();
            let createdCount = 0;

            for (let i = 0; i < quantity; i++) {
              const upcRef = db.collection(`users/${businessId}/upcs`).doc();

              const upcData: UPC = {
                id: upcRef.id,
                createdAt: Timestamp.now(),
                updatedAt: Timestamp.now(),
                createdBy: result.userId!,
                updatedBy: result.userId!,
                storeId: shop,
                orderId: String(orderId),
                putAway: 'inbound',
                productId: businessProductSku,
                warehouseId: null,
                zoneId: null,
                rackId: null,
                shelfId: null,
                placementId: null,
              };

              batch.set(upcRef, upcData);
              createdCount++;
            }

            if (createdCount > 0) {
              await batch.commit();
              upcCreateCount += createdCount;
              console.log(`✅ Created ${createdCount} UPCs for product ${businessProductSku}`);
            }
          }

        } catch (itemError) {
          console.error(`❌ Error processing UPCs for item:`, itemError);
          // Continue with other items
        }
      }
    }

    // Build response message
    let message = 'QC submitted successfully';
    if (qcPassItems.length > 0) {
      if (upcUpdateCount > 0) {
        message += `. ${upcUpdateCount} UPC(s) updated to 'inbound'`;
      }
      if (upcCreateCount > 0) {
        message += `. ${upcCreateCount} UPC(s) created with 'inbound' status`;
      }
    }

    return NextResponse.json({
      success: true,
      message,
      videoPath,
      details: {
        qcPassItems: qcPassItems.length,
        upcsUpdated: upcUpdateCount,
        upcsCreated: upcCreateCount,
      }
    });

  } catch (error) {
    console.error('QC submission error:', error);

    // Handle JSON parsing errors specifically
    if (error instanceof SyntaxError) {
      return NextResponse.json({
        error: 'Invalid JSON format',
        details: 'The request body must be valid JSON'
      }, { status: 400 });
    }

    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({
      error: 'QC submission failed',
      details: errorMessage
    }, { status: 500 });
  }
}