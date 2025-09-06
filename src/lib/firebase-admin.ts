import admin from 'firebase-admin';

if (!admin.apps.length) {
  const serviceAccount = {
    type: process.env.FIREBASE_SERVICE_ACC_TYPE,
    project_id: process.env.FIREBASE_SERVICE_ACC_PROJECT_ID,
    private_key_id: process.env.FIREBASE_SERVICE_ACC_PRIVATE_KEY_ID,
    private_key: process.env.FIREBASE_SERVICE_ACC_PRIVATE_KEY,
    client_email: process.env.FIREBASE_SERVICE_ACC_CLIENT_EMAIL,
    client_id: process.env.FIREBASE_SERVICE_ACC_CLIENT_ID,
    auth_uri: process.env.FIREBASE_SERVICE_ACC_AUTH_URI,
    token_uri: process.env.FIREBASE_SERVICE_ACC_TOKEN_URI,
    auth_provider_x509_cert_url: process.env.FIREBASE_SERVICE_ACC_AUTH_PROVIDER_X509_CERT_URL,
    client_x509_cert_url: process.env.FIREBASE_SERVICE_ACC_CLIENT_X509_CERT_UR,
    universe_domain: process.env.FIREBASE_SERVICE_ACC_UNIVERSE_DOMAIN,
  }

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: serviceAccount.project_id,
  });
}

const db = admin.firestore();
const auth = admin.auth();

export { db, auth };