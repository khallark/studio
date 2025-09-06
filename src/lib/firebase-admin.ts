import admin from 'firebase-admin';
// import serviceAccount from '../../service-account.json';

if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount!),
    projectId: serviceAccount.project_id,
  });
}

const db = admin.firestore();
const auth = admin.auth();

export { db, auth };