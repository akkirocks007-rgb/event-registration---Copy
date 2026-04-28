import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, deleteDoc, doc } from "firebase/firestore";

// Firebase configuration from the project
const firebaseConfig = {
  apiKey: "AIzaSyB...", // I'll need to read the actual config from the project
  authDomain: "indianroar-event.firebaseapp.com",
  projectId: "indianroar-event",
  storageBucket: "indianroar-event.appspot.com",
  messagingSenderId: "367332158652",
  appId: "1:367332158652:web:7570497558661646271970",
  measurementId: "G-GZ0L86P1XF"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function clearTenants() {
    console.log("🚀 Initiating Mainframe Purge...");
    const querySnapshot = await getDocs(collection(db, "tenants"));
    console.log(`Found ${querySnapshot.size} tenants to remove.`);
    
    for (const tenantDoc of querySnapshot.docs) {
        await deleteDoc(doc(db, "tenants", tenantDoc.id));
        console.log(`🗑️ Purged: ${tenantDoc.id}`);
    }

    const archSnapshot = await getDocs(collection(db, "archived_tenants"));
    console.log(`Found ${archSnapshot.size} archived tenants to remove.`);
    for (const archDoc of archSnapshot.docs) {
        await deleteDoc(doc(db, "archived_tenants", archDoc.id));
        console.log(`🗑️ Purged Archive: ${archDoc.id}`);
    }

    console.log("✅ Mainframe Purge Complete.");
    process.exit(0);
}

clearTenants();
