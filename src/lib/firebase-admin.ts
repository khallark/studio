
import admin from 'firebase-admin';

// This is your client-side config. We'll use it to initialize the Admin SDK.
// It's safe to expose this on the server.
const firebaseConfig = {
  apiKey: "AIzaSyD5mhKWYl-SAY_BB-D8y2q5rqa_kha42no",
  authDomain: "orderflow-jnig7.firebaseapp.com",
  projectId: "orderflow-jnig7",
  storageBucket: "orderflow-jnig7.firebasestorage.app",
  messagingSenderId: "1005907384516",
  appId: "1:1005907384516:web:b079b9512e64c4788b5191"
};

if (!admin.apps.length) {
  // In a managed environment like Firebase Hosting or Cloud Functions,
  // GOOGLE_APPLICATION_CREDENTIALS is often handled automatically.
  // For local development or other environments, you need to set this env var.
  // We are also explicitly passing the projectId and databaseURL to be safe.
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: firebaseConfig.projectId,
    databaseURL: `https://${firebaseConfig.projectId}.firebaseio.com`
  });
}

const db = admin.firestore();
const auth = admin.auth();

export { db, auth };
