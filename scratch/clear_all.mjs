/**
 * EventPro Firestore Wipe Script
 * ================================
 * Clears ALL demo data so you can run a fresh event simulation.
 *
 * Prerequisites:
 *   1. Place your serviceAccount.json in the project root
 *   2. Run: node scratch/clear_all.mjs
 *
 * This uses Firebase Admin SDK to bypass security rules.
 * ⚠️ DESTRUCTIVE — this deletes documents permanently.
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync, existsSync } from 'fs';

// ─── Load Service Account ───────────────────────────────────────────────────
const saPath = './serviceAccount.json';
if (!existsSync(saPath)) {
  console.error('❌ serviceAccount.json not found in project root.');
  console.error('   Download it from Firebase Console → Project Settings → Service Accounts');
  process.exit(1);
}

const serviceAccount = JSON.parse(readFileSync(saPath, 'utf8'));
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

// ─── Collections to wipe ────────────────────────────────────────────────────
const COLLECTIONS = [
  'users',           // resellers, owners, organisers, admins, supervisors, exhibitors
  'events',          // event definitions
  'attendees',       // registrations
  'scanLogs',        // gate scan history
  'agendas',         // session schedules
  'zoneRules',       // gate access rules
  'staffPasses',     // staff badges
  'exhibitorLeads',  // sponsor lead captures
  'communications',  // onboarding emails/sms logs
  'auditLogs',       // platform audit trail
  'tvConfigs',       // welcome TV designs
  'tvPairings',      // scanner-TV pairings
  'questions',       // jumbotron Q&A
  'devices',         // registered scanner devices
  'giveaways',       // giveaway redemptions
  'exhibitors',      // exhibitor directory
  'speakers',        // speaker directory
  'volunteerSessions', // scanner volunteer custody shifts
];

// Sub-collections under _config to preserve vs wipe
const CONFIG_KEEP = ['mainframe']; // keep superuser registry
const CONFIG_ROOT_DOCS = ['email_templates', 'platform'];

async function deleteCollection(collectionRef, batchSize = 100) {
  const query = collectionRef.limit(batchSize);
  return new Promise((resolve, reject) => {
    deleteQueryBatch(query, resolve).catch(reject);
  });
}

async function deleteQueryBatch(query, resolve) {
  const snapshot = await query.get();
  const batchSize = snapshot.size;
  if (batchSize === 0) {
    resolve();
    return;
  }

  const batch = db.batch();
  snapshot.docs.forEach((doc) => batch.delete(doc.ref));
  await batch.commit();

  // Recurse on the next process tick to avoid stack overflow
  process.nextTick(() => deleteQueryBatch(query, resolve));
}

async function wipe() {
  console.log('🔥 EventPro Firestore Wipe');
  console.log('==========================\n');

  let totalDeleted = 0;

  for (const name of COLLECTIONS) {
    const ref = db.collection(name);
    const snapshot = await ref.limit(1).get();
    if (snapshot.empty) {
      console.log(`⏭️  ${name}: already empty`);
      continue;
    }

    const countSnap = await ref.count().get();
    const count = countSnap.data().count;
    console.log(`🗑️  Deleting ${count} documents from "${name}"...`);
    await deleteCollection(ref);
    totalDeleted += count;
    console.log(`   ✅ ${name} cleared`);
  }

  // Handle _config root docs (preserve mainframe subcollection)
  console.log(`\n🗑️  Cleaning _config root documents...`);
  for (const docId of CONFIG_ROOT_DOCS) {
    const ref = db.collection('_config').doc(docId);
    const snap = await ref.get();
    if (snap.exists) {
      await ref.delete();
      console.log(`   ✅ Deleted _config/${docId}`);
      totalDeleted++;
    }
  }

  // Clean _config subcollections except mainframe
  const configSnap = await db.collection('_config').get();
  for (const doc of configSnap.docs) {
    if (doc.id === 'mainframe') continue; // keep superusers

    // Check if it has subcollections (like infra_reseller_xxx, infra_owner_xxx)
    const subcollections = await doc.ref.listCollections();
    for (const sub of subcollections) {
      const subSnap = await sub.limit(1).get();
      if (!subSnap.empty) {
        const countSnap = await sub.count().get();
        const count = countSnap.data().count;
        console.log(`   🗑️  Deleting ${count} docs from _config/${doc.id}/${sub.id}...`);
        await deleteCollection(sub);
        totalDeleted += count;
      }
    }

    // Delete the document itself if it's an infra doc
    if (doc.id.startsWith('infra_')) {
      await doc.ref.delete();
      console.log(`   ✅ Deleted _config/${doc.id}`);
      totalDeleted++;
    }
  }

  console.log('\n==========================');
  console.log(`✅ Wipe complete! ${totalDeleted} documents deleted.`);
  console.log('\n📌 What was preserved:');
  console.log('   • _config/mainframe (superuser registry)');
  console.log('\n🌱 Next step: Run the seeder to create fresh demo data');
  console.log('   node scratch/seed_demo_data.mjs');
  process.exit(0);
}

wipe().catch((err) => {
  console.error('❌ Wipe failed:', err);
  process.exit(1);
});
