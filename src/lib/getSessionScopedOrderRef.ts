import { db } from "./firebase-admin";

export function getSessionScopedOrderRef(session: {
  businessId: string;
  storeId: string;
}, orderId: string) {
  if (!session.businessId || !session.storeId) {
    throw new Error('INVALID_SESSION_SCOPE');
  }

  const cleanOrderId = orderId.trim();

  const storeRef = db.collection('accounts').doc(session.storeId);
  const orderRef = storeRef.collection('orders').doc(cleanOrderId);

  return {
    businessId: session.businessId,
    storeId: session.storeId,
    cleanOrderId,
    storeRef,
    orderRef,
  };
}