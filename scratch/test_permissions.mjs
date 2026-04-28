import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc, updateDoc, doc, deleteDoc, getDocs } from "firebase/firestore";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";

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
const auth = getAuth(app);

async function testPermissions() {
    try {
        console.log("🚀 Testing Auth...");
        const userCredential = await signInWithEmailAndPassword(auth, "akshay@indianroar.com", "admin123");
        console.log("✅ Logged in as:", userCredential.user.email);
        
        console.log("🚀 Testing Create...");
        const docRef = await addDoc(collection(db, "tenants"), {
            name: "Test Tenant",
            status: "Active"
        });
        console.log("✅ Created tenant:", docRef.id);
        
        console.log("🚀 Testing Update...");
        await updateDoc(doc(db, "tenants", docRef.id), {
            status: "Suspended"
        });
        console.log("✅ Updated tenant");
        
        console.log("🚀 Testing Archive...");
        await addDoc(collection(db, "archived_tenants"), {
            name: "Test Tenant Archive"
        });
        console.log("✅ Created archive tenant");
        
        console.log("🚀 Testing Delete...");
        await deleteDoc(doc(db, "tenants", docRef.id));
        console.log("✅ Deleted tenant");
        
        console.log("🎉 All permissions are working!");
    } catch (e) {
        console.error("❌ Test Failed:", e.message);
    }
    process.exit(0);
}

testPermissions();
