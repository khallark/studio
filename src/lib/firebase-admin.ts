import admin from 'firebase-admin';

if (!admin.apps.length) {
  const privateKey = process.env.FIREBASE_SERVICE_ACC_PRIVATE_KEY;

  if (!privateKey) {
    throw new Error("Missing Firebase Private Key in environment");
  }

  const serviceAccount: admin.ServiceAccount = {
    projectId: process.env.FIREBASE_SERVICE_ACC_PROJECT_ID!,
    clientEmail: process.env.FIREBASE_SERVICE_ACC_CLIENT_EMAIL!,
    privateKey: privateKey,
  };

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: serviceAccount.projectId,
  });
}

const db = admin.firestore();
const auth = admin.auth();

export { db, auth };