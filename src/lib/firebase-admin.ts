import admin from 'firebase-admin';
import serviceAccount from '../../service-account.json';

if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);

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