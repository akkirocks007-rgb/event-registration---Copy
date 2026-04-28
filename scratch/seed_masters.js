
import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, serverTimestamp } from "firebase/firestore";

const firebaseConfig = {
    apiKey: "AIzaSyAxp9sYBhVWRyiqyx59ujTTIRbMGDMB31M",
    authDomain: "eventpro-ag.firebaseapp.com",
    projectId: "eventpro-ag",
    storageBucket: "eventpro-ag.firebasestorage.app",
    messagingSenderId: "641114958776",
    appId: "1:641114958776:web:b2ac1cf228587adc203d4d"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const seed = async () => {
    console.log("🚀 Injecting SaaS Master Identities...");
    try {
        const batch = [
            { value: 'akshay@indianroar.com', type: 'email', name: 'Akshay (Root)' },
            { value: '+919220601860', type: 'phone', name: 'Akshay (Root)' }
        ];

        for (const master of batch) {
            await setDoc(doc(db, "_config", "mainframe", "superusers", master.value), {
                ...master,
                addedAt: serverTimestamp()
            });
            console.log(`✅ Injected: ${master.value}`);
        }
        console.log("🌟 Database Ready. You can now login!");
        process.exit(0);
    } catch (e) {
        console.error("❌ Injection Failed:", e);
        process.exit(1);
    }
};

seed();
