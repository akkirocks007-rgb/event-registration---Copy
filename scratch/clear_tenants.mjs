import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, deleteDoc, doc } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAxp9sYBhVWRyiqyx59ujTTIRbMGDMB31M",
  authDomain: "eventpro-ag.firebaseapp.com",
  projectId: "eventpro-ag",
  storageBucket: "eventpro-ag.firebasestorage.app",
  messagingSenderId: "641114958776",
  appId: "1:641114958776:web:b2ac1cf228587adc203d4d",
  measurementId: "G-S0X55C3VX8"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function clearTenants() {
    try {
        console.log("🚀 Initiating Mainframe Purge...");
        
        // Clear Active Tenants
        const querySnapshot = await getDocs(collection(db, "tenants"));
        console.log(`Found ${querySnapshot.size} active tenants.`);
        for (const tenantDoc of querySnapshot.docs) {
            await deleteDoc(doc(db, "tenants", tenantDoc.id));
            console.log(`🗑️ Purged Active: ${tenantDoc.id}`);
        }

        // Clear Archived Tenants
        const archSnapshot = await getDocs(collection(db, "archived_tenants"));
        console.log(`Found ${archSnapshot.size} archived tenants.`);
        for (const archDoc of archSnapshot.docs) {
            await deleteDoc(doc(db, "archived_tenants", archDoc.id));
            console.log(`🗑️ Purged Archive: ${archDoc.id}`);
        }

        console.log("✅ Mainframe Purge Complete.");
    } catch (e) {
        console.error("❌ Purge Failed:", e);
    }
    process.exit(0);
}

clearTenants();
