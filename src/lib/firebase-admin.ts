
import admin from 'firebase-admin';

if (!admin.apps.length) {
  // Ensure you have the GOOGLE_APPLICATION_CREDENTIALS environment variable set
  // This is typically a path to your service account JSON file.
  // In Firebase Hosting or Cloud Functions, this is often handled automatically.
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    databaseURL: `https://${process.env.GCLOUD_PROJECT}.firebaseio.com`
  });
}

const db = admin.firestore();
const auth = admin.auth();

export { db, auth };
