/**
 * EventPro Demo Data Seeder
 * ==========================
 * Populates Firestore with realistic demo data for pitches & demos.
 *
 * Prerequisites:
 *   1. Generate a service account key from Firebase Console
 *      (Project Settings > Service Accounts > Generate new private key)
 *   2. Save it as `serviceAccount.json` in the project root
 *   3. Run: node scratch/seed_demo_data.mjs
 *
 * This script bypasses Firestore security rules via Admin SDK.
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore';
import { readFileSync, existsSync } from 'fs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// ─── Load Service Account ───────────────────────────────────────────────────
let serviceAccount;
const saPath = './serviceAccount.json';

if (existsSync(saPath)) {
  serviceAccount = JSON.parse(readFileSync(saPath, 'utf8'));
} else if (process.env.GOOGLE_APPLICATION_CREDENTIALS && existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
  serviceAccount = JSON.parse(readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, 'utf8'));
} else {
  console.error('❌ Service account key not found.');
  console.error('   Place it at ./serviceAccount.json or set GOOGLE_APPLICATION_CREDENTIALS');
  process.exit(1);
}

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

// ─── Helpers ────────────────────────────────────────────────────────────────
const rand = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const now = () => Timestamp.now();
const pastDate = (daysAgo) => Timestamp.fromDate(new Date(Date.now() - daysAgo * 86400000));
const futureDate = (daysAhead) => Timestamp.fromDate(new Date(Date.now() + daysAhead * 86400000));

const firstNames = ['Aarav', 'Vivaan', 'Aditya', 'Vihaan', 'Arjun', 'Sai', 'Arnav', 'Ayaan', 'Krishna', 'Ishaan', 'Neil', 'Rohan', 'Ananya', 'Diya', 'Neha', 'Priya', 'Sneha', 'Kavya', 'Riya', 'Sara'];
const lastNames = ['Sharma', 'Verma', 'Gupta', 'Patel', 'Reddy', 'Nair', 'Iyer', 'Desai', 'Mehta', 'Joshi', 'Kumar', 'Singh', 'Yadav', 'Malhotra', 'Banerjee'];
const companies = ['TCS', 'Infosys', 'Wipro', 'Zoho', 'Freshworks', 'Razorpay', 'Zerodha', 'Ola', 'Swiggy', 'CRED', 'PhonePe', 'Paytm', 'BYJU\'s', 'Unacademy', 'Blinkit'];
const designations = ['CEO', 'CTO', 'VP Engineering', 'Product Manager', 'SDE II', 'Marketing Head', 'Sales Director', 'Founder', 'Designer', 'HR Lead'];
const eventNames = [
  'India Tech Summit 2026', 'Bengaluru Startup Grind', 'Mumbai Fintech Week',
  'Delhi AI Conference', 'Chennai SaaS Meetup', 'Hyderabad DevFest',
  'Pune Design Week', 'Kolkata Business Conclave', 'Goa Beach Tech Fest', 'Ahmedabad Manufacturing Expo'
];
const tracks = ['Main Stage', 'Dev Hub', 'Design Track', 'Startup Alley', 'Workshop Room A'];
const ticketTypes = ['General Delegate', 'VIP Pass', 'Speaker RSVP', 'Press Pass', 'Student Ticket', 'Early Bird'];
const gatePresets = ['main-entrance', 'hall-a', 'hall-b', 'vip-lounge', 'workshop-1', 'exhibition'];

const generateConfirmId = (prefix = 'EP') =>
  `${prefix}-${Math.random().toString(36).substr(2, 6).toUpperCase()}-${new Date().getFullYear()}`;

// ─── Create Document Refs ───────────────────────────────────────────────────
const createRef = (collection) => db.collection(collection).doc();

// ─── Main Seeding Logic ─────────────────────────────────────────────────────
async function seed() {
  console.log('🌱 EventPro Demo Seeder starting...\n');

  const batches = [];
  let currentBatch = db.batch();
  let batchCount = 0;
  const BATCH_LIMIT = 500;

  const commitBatch = async () => {
    if (batchCount === 0) return;
    await currentBatch.commit();
    batches.push(batchCount);
    currentBatch = db.batch();
    batchCount = 0;
  };

  const setDoc = (ref, data) => {
    currentBatch.set(ref, data);
    batchCount++;
    if (batchCount >= BATCH_LIMIT) commitBatch();
  };

  // ─── 1. SUPERUSER ─────────────────────────────────────────────────────────
  const superuserEmail = 'akshay@indianroar.com';
  const superuserRef = db.collection('_config').doc('mainframe').collection('superusers').doc(superuserEmail);
  setDoc(superuserRef, {
    value: superuserEmail,
    type: 'email',
    name: 'Akshay (Root)',
    password: 'Admin@123',
    addedAt: now()
  });
  console.log('✅ Superuser seeded');

  // ─── 2. RESELLER ──────────────────────────────────────────────────────────
  const resellerRef = createRef('users');
  const reseller = {
    id: resellerRef.id,
    role: 'reseller',
    name: 'NeoEvent Solutions Pvt Ltd',
    slug: 'neoevent',
    ownerName: 'Rahul Sharma',
    ownerEmail: 'rahul@neoevent.in',
    phone: '+919876543210',
    address: '401, Sector 5, HSR Layout, Bengaluru',
    taxNumber: '29ABCDE1234F1Z5',
    country: 'India',
    city: 'Bengaluru',
    language: 'English',
    plan: 'Enterprise Universal',
    validFrom: '2025-01-01',
    validUntil: '2027-01-01',
    eventLimit: 50,
    userLimit: 10000,
    status: 'Active',
    features: {
      aiScanning: true, identityAuth: true, paymentGateway: true,
      messagingHub: true, i18nSupport: true, whiteLabel: true,
      customInfra: true, advancedAnalytics: true
    },
    branding: { color: '#FF2222', logo: '' },
    parentId: 'system',
    createdAt: now()
  };
  setDoc(resellerRef, reseller);
  console.log(`✅ Reseller: ${reseller.name} (${resellerRef.id})`);

  // ─── 3. OWNERS (2) ────────────────────────────────────────────────────────
  const owners = [];
  for (let i = 0; i < 2; i++) {
    const ref = createRef('users');
    const name = i === 0 ? 'Pulse Events' : 'Stellar Conferences';
    const owner = {
      id: ref.id,
      role: 'owner',
      name,
      ownerName: i === 0 ? 'Vikram Mehta' : 'Ananya Desai',
      ownerEmail: i === 0 ? 'vikram@pulseevent.in' : 'ananya@stellarconf.in',
      phone: `+9198${randInt(10000000, 99999999)}`,
      plan: 'Enterprise Universal',
      eventLimit: 10,
      userLimit: 5000,
      validFrom: '2025-01-01',
      validUntil: '2026-12-31',
      status: 'Active',
      branding: { color: i === 0 ? '#5422FF' : '#00C853', logo: '' },
      parentId: reseller.id,
      tenantId: reseller.id,
      createdAt: pastDate(randInt(10, 60))
    };
    setDoc(ref, owner);
    owners.push(owner);
  }
  console.log(`✅ ${owners.length} Owners seeded`);

  // ─── 4. ORGANISERS (2 per owner = 4) ──────────────────────────────────────
  const organisers = [];
  for (const owner of owners) {
    for (let i = 0; i < 2; i++) {
      const ref = createRef('users');
      const org = {
        id: ref.id,
        role: 'organiser',
        name: `${owner.name} Org Team ${i + 1}`,
        email: `team${i + 1}@${owner.ownerEmail.split('@')[1]}`,
        phone: `+9197${randInt(10000000, 99999999)}`,
        company: owner.name,
        eventLimit: 5,
        userLimit: 2000,
        status: 'Active',
        parentId: owner.id,
        tenantId: reseller.id,
        createdAt: pastDate(randInt(5, 30))
      };
      setDoc(ref, org);
      organisers.push(org);
    }
  }
  console.log(`✅ ${organisers.length} Organisers seeded`);

  // ─── 5. EVENTS (2 per organiser = 8) ──────────────────────────────────────
  const events = [];
  let eventNameIdx = 0;
  for (const org of organisers) {
    for (let i = 0; i < 2; i++) {
      const ref = createRef('events');
      const evName = eventNames[eventNameIdx % eventNames.length];
      eventNameIdx++;
      const isPast = i === 0;
      const event = {
        id: ref.id,
        name: evName,
        description: `Join us for ${evName}, the premier gathering of industry leaders, innovators, and entrepreneurs.`,
        date: isPast ? pastDate(randInt(1, 30)).toDate().toISOString().split('T')[0] : futureDate(randInt(7, 90)).toDate().toISOString().split('T')[0],
        location: rand(['Bengaluru', 'Mumbai', 'Delhi', 'Hyderabad', 'Chennai', 'Pune']),
        type: rand(['Physical', 'Hybrid', 'Virtual']),
        status: isPast ? 'Completed' : 'Active',
        registrations: 0,
        organizerId: org.id,
        ownerId: org.parentId,
        resellerId: reseller.id,
        tenantId: reseller.id,
        adminIds: [],
        createdAt: pastDate(randInt(1, 45))
      };
      setDoc(ref, event);
      events.push(event);
    }
  }
  console.log(`✅ ${events.length} Events seeded`);

  // ─── 6. ADMINS (2 per organiser = 8) ──────────────────────────────────────
  const admins = [];
  for (const org of organisers) {
    for (let i = 0; i < 2; i++) {
      const ref = createRef('users');
      const password = `ADM-${randInt(100000, 999999)}`;
      const admin = {
        id: ref.id,
        role: 'admin',
        name: `Admin ${i + 1} - ${org.name}`,
        email: `admin${i + 1}.${randInt(100, 999)}@eventpro.demo`,
        phone: `+9196${randInt(10000000, 99999999)}`,
        password: password,
        assignedEventIds: events.filter(e => e.organizerId === org.id).map(e => e.id),
        status: 'Active',
        parentId: org.id,
        tenantId: reseller.id,
        createdAt: pastDate(randInt(1, 20))
      };
      setDoc(ref, admin);
      admins.push(admin);

      // Update events with adminIds
      for (const evId of admin.assignedEventIds) {
        const evRef = db.collection('events').doc(evId);
        currentBatch.update(evRef, { adminIds: FieldValue.arrayUnion(ref.id) });
        batchCount++;
      }
    }
  }
  console.log(`✅ ${admins.length} Admins seeded`);

  // ─── 6a. SUPERVISORS (1 per organiser = 4) ────────────────────────────────
  const supervisors = [];
  for (const org of organisers) {
    const ref = createRef('users');
    const password = `SUP-${randInt(100000, 999999)}`;
    const supervisor = {
      id: ref.id,
      role: 'supervisor',
      name: `Supervisor - ${org.name}`,
      email: `supervisor.${randInt(100, 999)}@eventpro.demo`,
      phone: `+9197${randInt(10000000, 99999999)}`,
      password: password,
      assignedEventIds: events.filter(e => e.organizerId === org.id).map(e => e.id),
      status: 'Active',
      parentId: org.id,
      tenantId: reseller.id,
      createdAt: pastDate(randInt(1, 20))
    };
    setDoc(ref, supervisor);
    supervisors.push(supervisor);
  }
  console.log(`✅ ${supervisors.length} Supervisors seeded`);

  // ─── 6b. EXHIBITORS (4 dedicated exhibitor accounts) ───────────────────────
  const exhibitors = [];
  for (let i = 0; i < 4; i++) {
    const ref = createRef('users');
    const password = `EXB${i + 1}@demo`;
    const exhibitor = {
      id: ref.id,
      role: 'exhibitor',
      name: `Exhibitor ${i + 1} - ${rand(companies)}`,
      email: `exhibitor${i + 1}@demo.com`,
      phone: `+91${randInt(7000000000, 9999999999)}`,
      company: rand(companies),
      boothNumber: `A-0${i + 1}`,
      status: 'Active',
      password: password,
      parentId: organisers[0].id,
      tenantId: reseller.id,
      createdAt: pastDate(randInt(1, 20))
    };
    setDoc(ref, exhibitor);
    exhibitors.push(exhibitor);
  }
  console.log(`✅ ${exhibitors.length} Exhibitors seeded`);

  // ─── 7. ATTENDEES (~25-40 per event = ~250 total) ─────────────────────────
  let totalAttendees = 0;
  const attendeeRefs = [];
  for (const event of events) {
    const count = randInt(25, 40);
    let eventRegs = 0;
    for (let i = 0; i < count; i++) {
      const ref = createRef('attendees');
      const fName = rand(firstNames);
      const lName = rand(lastNames);
      const ticket = rand(ticketTypes);
      const isCheckedIn = Math.random() > 0.4;
      const hasEmail = Math.random() > 0.1;
      const attendee = {
        id: ref.id,
        eventId: event.id,
        firstName: fName,
        lastName: lName,
        email: hasEmail ? `${fName.toLowerCase()}.${lName.toLowerCase()}${randInt(1, 999)}@gmail.com` : '',
        phone: `+91${randInt(7000000000, 9999999999)}`,
        company: rand(companies),
        designation: rand(designations),
        ticketName: ticket,
        ticketId: ticket.toLowerCase().replace(/\s/g, '-'),
        ticketPrice: ticket === 'VIP Pass' ? 5000 : ticket === 'Student Ticket' ? 500 : 1999,
        confirmationId: generateConfirmId(),
        status: isCheckedIn ? 'checked-in' : 'Registered',
        scanned: isCheckedIn,
        paymentMethod: rand(['cash', 'free', 'online']),
        paymentStatus: rand(['pending', 'paid', 'free']),
        createdAt: pastDate(randInt(1, 60)),
        points: randInt(0, 500),
        exhibitorScans: Math.random() > 0.7 ? [
          { exhibitorId: `exb-${randInt(1,4)}`, boothNumber: `A-0${randInt(1,4)}`, timestamp: pastDate(randInt(0,5)).toISOString(), pointsEarned: 10 }
        ] : [],
        scannedByExhibitors: Math.random() > 0.7 ? [
          { exhibitorId: `exb-${randInt(1,4)}`, boothNumber: `A-0${randInt(1,4)}`, timestamp: pastDate(randInt(0,5)).toISOString(), pointsEarned: 25 }
        ] : [],
        redeemedRewards: Math.random() > 0.8 ? [
          { rewardId: randInt(1,4), name: 'Free Espresso', pointsCost: 300, redeemedAt: pastDate(randInt(0,3)).toISOString(), gateLabel: 'Food Counter' }
        ] : [],
        badgePrinted: Math.random() > 0.3,
        claimedGiveaways: Math.random() > 0.6 ? [1, 2] : []
      };
      setDoc(ref, attendee);
      attendeeRefs.push({ ref, attendee, event });
      eventRegs++;
      totalAttendees++;

      // Scan logs for checked-in attendees
      if (isCheckedIn) {
        const scanRef = createRef('scanLogs');
        setDoc(scanRef, {
          gateId: rand(gatePresets),
          attendeeId: ref.id,
          attendeeName: `${fName} ${lName}`,
          company: attendee.company,
          ticketName: ticket,
          result: 'approved',
          timestamp: pastDate(randInt(0, 10)),
          deviceName: `SUNMI-00${randInt(1, 4)}`
        });
      }
    }
    // Update event registration count
    const evRef = db.collection('events').doc(event.id);
    currentBatch.update(evRef, { registrations: eventRegs });
    batchCount++;
  }
  console.log(`✅ ${totalAttendees} Attendees seeded (+ scan logs)`);

  // ─── 8. AGENDAS (3-5 per event) ───────────────────────────────────────────
  for (const event of events) {
    const sessions = randInt(3, 5);
    for (let i = 0; i < sessions; i++) {
      const ref = createRef('agendas');
      const hour = 9 + i;
      setDoc(ref, {
        eventId: event.id,
        title: rand(['Keynote: Future of AI', 'Workshop: Scaling SaaS', 'Panel: Funding in 2026', 'Fireside Chat', 'Networking Lunch', 'Demo Day', 'Design Systems', 'Growth Hacking']),
        speaker: `Dr. ${rand(firstNames)} ${rand(lastNames)}`,
        time: `${hour}:00 ${hour < 12 ? 'AM' : 'PM'}`,
        track: rand(tracks),
        description: 'Session description goes here.',
        createdAt: now()
      });
    }
  }
  console.log(`✅ Agenda sessions seeded`);

  // ─── 9. ZONE RULES ─────────────────────────────────────────────────────────
  for (const gate of gatePresets) {
    const ref = db.collection('zoneRules').doc(gate);
    const allowedTickets = randInt(1, ticketTypes.length);
    setDoc(ref, {
      gateId: gate,
      gateLabel: gate.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
      allowedTickets: ticketTypes.slice(0, allowedTickets),
      timeStart: '09:00',
      timeEnd: '18:00',
      bypassRoles: ['admin', 'organiser', 'owner', 'superuser'],
      active: true,
      createdAt: now()
    });
  }
  console.log(`✅ Zone rules seeded`);

  // ─── 10. STAFF PASSES (5-8 per event) ─────────────────────────────────────
  const staffRoles = ['Security Head', 'Bouncer', 'Electrician', 'Fabricator', 'Logistics', 'Designer', 'Runner Boy', 'Finance'];
  for (const event of events) {
    const count = randInt(5, 8);
    for (let i = 0; i < count; i++) {
      const ref = createRef('staffPasses');
      setDoc(ref, {
        eventId: event.id,
        name: `${rand(firstNames)} ${rand(lastNames)}`,
        role: rand(staffRoles),
        category: rand(['Security Tier', 'Crew Tier', 'Management Tier']),
        phone: `+91${randInt(7000000000, 9999999999)}`,
        status: 'Active',
        createdAt: pastDate(randInt(1, 30))
      });
    }
  }
  console.log(`✅ Staff passes seeded`);

  // ─── 11. EXHIBITOR LEADS ──────────────────────────────────────────────────
  for (const exhibitor of exhibitors) {
    const leadCount = randInt(5, 12);
    for (let i = 0; i < leadCount; i++) {
      const ref = createRef('exhibitorLeads');
      const mutual = Math.random() > 0.5;
      setDoc(ref, {
        exhibitorId: exhibitor.id,
        name: `${rand(firstNames)} ${rand(lastNames)}`,
        company: rand(companies),
        role: rand(designations),
        email: `lead${randInt(1, 999)}@demo.com`,
        confirmationId: generateConfirmId('LD'),
        rating: rand(['Cold', 'Warm', 'Hot']),
        notes: rand(['Interested in enterprise plan', 'Follow up next week', 'Budget approved', 'Need demo', 'Decision maker']),
        time: `${randInt(9, 17)}:${randInt(0, 59).toString().padStart(2, '0')} ${rand(['AM', 'PM'])}`,
        mutualScan: mutual,
        attendeeScannedBackAt: mutual ? pastDate(randInt(0, 10)) : null,
        pointsToAttendee: mutual ? 25 : 10,
        pointsToExhibitor: mutual ? 5 : 0,
        createdAt: pastDate(randInt(0, 15))
      });
    }
  }
  console.log(`✅ Exhibitor leads seeded`);

  // ─── 11b. REWARDS (redeemable items for gamification) ──────────────────────
  const rewardItems = [
    { name: 'Free Espresso', emoji: '☕', pointsCost: 300, totalQty: 100, category: 'food' },
    { name: 'Cold Drink', emoji: '🥤', pointsCost: 200, totalQty: 150, category: 'food' },
    { name: 'Lunch Voucher', emoji: '🍕', pointsCost: 800, totalQty: 80, category: 'food' },
    { name: 'Sticker Pack', emoji: '✨', pointsCost: 500, totalQty: 200, category: 'swag' },
    { name: 'VIP Lounge Pass', emoji: '💎', pointsCost: 2000, totalQty: 20, category: 'experience' },
    { name: 'Event T-Shirt', emoji: '👕', pointsCost: 1500, totalQty: 50, category: 'swag' },
  ];
  for (const event of events) {
    for (const r of rewardItems) {
      const ref = createRef('rewards');
      setDoc(ref, {
        eventId: event.id,
        ...r,
        remainingQty: r.totalQty,
        eligibleTickets: ['All'],
        isActive: true,
        createdAt: pastDate(randInt(1, 10))
      });
    }
  }
  console.log(`✅ Rewards seeded (${rewardItems.length * events.length} items)`);

  // ─── 12. COMMUNICATIONS ────────────────────────────────────────────────────
  const commTypes = ['onboarding', 'password_reset', 'ticket_confirmation'];
  const channels = [['email'], ['email', 'sms'], ['email', 'sms', 'whatsapp']];
  for (let i = 0; i < 10; i++) {
    const ref = createRef('communications');
    setDoc(ref, {
      to: `user${randInt(1, 999)}@demo.com`,
      name: `${rand(firstNames)} ${rand(lastNames)}`,
      phone: `+91${randInt(7000000000, 9999999999)}`,
      type: rand(commTypes),
      channels: rand(channels),
      status: 'Sent',
      timestamp: new Date(Date.now() - randInt(0, 30) * 86400000).toISOString(),
      resellerId: reseller.id
    });
  }
  console.log(`✅ Communications seeded`);

  // ─── 13. AUDIT LOGS ────────────────────────────────────────────────────────
  const actions = ['CREATE_RESELLER', 'CREATE_OWNER', 'CREATE_ORGANISER', 'CREATE_ADMIN', 'CREATE_EVENT', 'CHECK_IN', 'EXPORT_DB', 'LOGIN'];
  for (let i = 0; i < 15; i++) {
    const ref = createRef('auditLogs');
    setDoc(ref, {
      userEmail: rand([superuserEmail, reseller.ownerEmail, owners[0].ownerEmail]),
      userId: rand([reseller.id, owners[0].id]),
      action: rand(actions),
      targetType: rand(['user', 'event', 'attendee']),
      targetId: `demo-${randInt(1000, 9999)}`,
      metadata: { ip: `192.168.1.${randInt(1, 255)}` },
      timestamp: pastDate(randInt(0, 30))
    });
  }
  console.log(`✅ Audit logs seeded`);

  // ─── 14. TV CONFIGS ────────────────────────────────────────────────────────
  for (const gate of gatePresets.slice(0, 3)) {
    const ref = db.collection('tvConfigs').doc(gate);
    setDoc(ref, {
      message: rand(['Welcome back, {name}!', 'Hello {name} from {company}!', 'VIP Access Granted, {name}']),
      primaryColor: rand(['#3d5afe', '#5422FF', '#00C853', '#FF2222']),
      showCompany: true,
      speed: 6,
      gateId: gate,
      createdAt: now()
    });
  }
  console.log(`✅ TV configs seeded`);

  // ─── 15. QUESTIONS (Jumbotron) ────────────────────────────────────────────
  for (let i = 0; i < 8; i++) {
    const ref = createRef('questions');
    setDoc(ref, {
      text: rand([
        'When will the keynote start?',
        'Is lunch included in the ticket?',
        'Where is the VIP lounge?',
        'Can I get a refund?',
        'Is there parking available?',
        'Will slides be shared after the event?'
      ]),
      askedBy: `${rand(firstNames)} ${rand(lastNames)}`,
      eventId: rand(events).id,
      upvotes: randInt(0, 25),
      answered: Math.random() > 0.5,
      createdAt: pastDate(randInt(0, 5))
    });
  }
  console.log(`✅ Q&A questions seeded`);

  // ─── Final Commit ──────────────────────────────────────────────────────────
  await commitBatch();

  console.log('\n🎉 Seeding complete!');
  console.log(`   Total documents written: ${totalAttendees + events.length * 3 + admins.length + organisers.length + owners.length + 50}`);
  console.log('\n📊 Dashboards should now show:');
  console.log('   • Superuser: Reseller list, analytics, audit logs');
  console.log('   • Reseller: Owner performance, event list, communications');
  console.log('   • Owner: Organiser registry, event ledger');
  console.log('   • Organiser: Events, admins, attendee ingress');
  console.log('   • Admin: Attendees, zone rules, staff passes, giveaways');
  console.log('   • Supervisor: Check-ins, spot reg, badge printing');
  console.log('   • Exhibitor: Lead capture list');
  console.log('   • Attendee: 3D badge, agenda, networking');
  console.log('   • Welcome TV: Pair any gate and scan to see welcome messages');
  console.log('\n🔑 EXHIBITOR DEMO CREDENTIALS (Password Login):');
  for (const ex of exhibitors) {
    console.log(`   Email: ${ex.email} | Password: ${ex.password} | Booth: ${ex.boothNumber}`);
  }
  console.log('\n🔑 SUPERUSER DEMO CREDENTIALS:');
  console.log('   Email: akshay@indianroar.com | Password: Admin@123');
  console.log('\n⚠️  Remember: Run firebase deploy if you want hosting/rules updated.');
}

seed().catch((err) => {
  console.error('❌ Seeding failed:', err);
  process.exit(1);
});
