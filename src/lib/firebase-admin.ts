import admin from 'firebase-admin';

if (!admin.apps.length) {
  try {
    const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    if (!serviceAccountKey) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY environment variable is not set.');
    }
    const serviceAccount = JSON.parse(serviceAccountKey);

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: serviceAccount.project_id,
    });
  } catch (error) {
    console.error('Firebase Admin SDK initialization error:', error);
    // Depending on the environment, you might want to handle this differently.
    // For now, we'll log the error. The app will likely fail on DB operations.
  }
}

const db = admin.firestore();
const auth = admin.auth();

export { db, auth };
