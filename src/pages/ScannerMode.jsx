import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AnimatePresence, motion as Motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { db } from '../firebase';
import { collection, query, onSnapshot, doc, updateDoc, arrayUnion, serverTimestamp, addDoc, where, getDocs } from 'firebase/firestore';
import { Html5Qrcode } from 'html5-qrcode';
import { QrCode, CheckCircle2, XCircle, ArrowLeft, Wifi, Settings, AlertTriangle, MapPin, Users, Gift, Package, ShieldOff, Clock, Radio, Mail, Monitor, ExternalLink, RefreshCw, Zap, UserPlus, LogOut, Calendar } from 'lucide-react';
import { checkZoneAccess, DEFAULT_ZONE_RULES } from '../utils/zoneRules';
import {
  lookupCachedPerson, loadCachedAttendees, loadCachedStaff,
  queueScanOperation, getScanQueue, removeFromQueue, markQueueAttempt,
  cacheEventAttendees, cacheStaffPasses, clearAllCache
} from '../utils/offlineCache';

const generateConfirmId = (prefix) => `${prefix}-${Math.random().toString(36).substr(2, 6).toUpperCase()}-${new Date().getFullYear()}`;

// ─── Gate Config helpers ────────────────────────────────────────────────────
const loadGateConfig = () => {
  try {
    const saved = localStorage.getItem('eventpro_gate_config');
    return saved ? JSON.parse(saved) : null;
  } catch { return null; }
};
const saveGateConfig = (cfg) => {
  try { localStorage.setItem('eventpro_gate_config', JSON.stringify(cfg)); } catch { /* noop */ }
};

const GATE_PRESETS = [
  // Entry gates
  { id: 'main-entrance',  label: 'Main Entrance',       icon: '🚪', scanMode: 'hybrid', mode: 'entry' },
  { id: 'hall-a',         label: 'Hall A',              icon: '🏛️', scanMode: 'hybrid', mode: 'entry' },
  { id: 'hall-b',         label: 'Hall B',              icon: '🏛️', scanMode: 'hybrid', mode: 'entry' },
  { id: 'vip-lounge',     label: 'VIP Lounge',          icon: '💎', scanMode: 'hybrid', mode: 'entry' },
  { id: 'workshop-1',     label: 'Workshop Room 1',     icon: '📚', scanMode: 'qr',     mode: 'entry' },
  { id: 'workshop-2',     label: 'Workshop Room 2',     icon: '📚', scanMode: 'qr',     mode: 'entry' },
  { id: 'exhibition',     label: 'Exhibition Floor',    icon: '🎪', scanMode: 'qr',     mode: 'entry' },
  { id: 'exit-gate',      label: 'Exit Gate',           icon: '🚶', scanMode: 'qr',     mode: 'entry' },
  // Service stations
  { id: 'spot-reg-free',  label: 'Spot Reg (Free)',     icon: '📝', scanMode: 'qr',     mode: 'spot_reg_free' },
  { id: 'spot-reg-paid',  label: 'Spot Reg (Paid)',     icon: '💵', scanMode: 'qr',     mode: 'spot_reg_paid' },
  { id: 'badge-print',    label: 'Badge Printing',      icon: '🎫', scanMode: 'qr',     mode: 'badge_print' },
  { id: 'giveaway',       label: 'Giveaway Station',    icon: '🎁', scanMode: 'qr',     mode: 'giveaway' },
  { id: 'food-counter',   label: 'Food Counter',        icon: '🍕', scanMode: 'qr',     mode: 'food_counter' },
  { id: 'lead-exchange',  label: 'Lead Exchange',       icon: '🤝', scanMode: 'qr',     mode: 'lead_exchange' },
  { id: 'custom',         label: 'Custom Gate Name',    icon: '✏️', scanMode: 'hybrid', mode: 'entry' },
];

// Giveaway items — in production these come from Firestore. Fallback to seeded data.
const DEFAULT_GIVEAWAYS = [
  { id: 1, name: 'Branded Kit Bag',  emoji: '🎒', eligibleTickets: ['All'] },
  { id: 2, name: 'Event T-Shirt',    emoji: '👕', eligibleTickets: ['All'] },
  { id: 3, name: 'USB Drive 32GB',   emoji: '💾', eligibleTickets: ['VIP Pass'] },
  { id: 4, name: 'Speaker Gift Box', emoji: '🎁', eligibleTickets: ['Speaker RSVP'] },
];

const getEligibleGiveaways = (ticketName) => {
  return DEFAULT_GIVEAWAYS.filter(g =>
    g.eligibleTickets.includes('All') || g.eligibleTickets.includes(ticketName)
  );
};

const mapTicketToId = (name) => {
  if (!name) return 'delegate';
  const n = name.toLowerCase();
  if (n.includes('vip')) return 'vip';
  if (n.includes('speaker')) return 'speaker';
  if (n.includes('press')) return 'press';
  if (n.includes('day')) return 'day-pass';
  return 'delegate';
};

const getAttendeeName = (a) => a.primaryName || `${a.firstName || ''} ${a.lastName || ''}`.trim() || 'Guest';
const getAttendeeEmail = (a) => a.primaryEmail || a.email || '';

// ─── Main Scanner Component ─────────────────────────────────────────────────
const ScannerMode = () => {
  const navigate = useNavigate();
  const scannerRef = useRef(null);
  const html5QrRef = useRef(null);
  const isProcessingRef = useRef(false);
  const handleScanRef = useRef(null); // populated after handleScan is defined

  // State
  const [deviceSession, setDeviceSession] = useState(() => {
    try { return JSON.parse(localStorage.getItem('eventpro_device_session') || 'null'); } catch { return null; }
  });
  const [gateConfig, setGateConfig] = useState(() => {
    const cfg = loadGateConfig();
    const session = (() => { try { return JSON.parse(localStorage.getItem('eventpro_device_session') || 'null'); } catch { return null; } })();
    if (cfg && session?.event?.id && !cfg.eventId) {
      return { ...cfg, eventId: session.event.id, eventName: session.event.name };
    }
    return cfg;
  });
  const [showGateSetup, setShowGateSetup] = useState(!deviceSession && !loadGateConfig());
  const [draftGate, setDraftGate] = useState({ preset: 'main-entrance', customName: '' });
  const [attendees, setAttendees] = useState([]);
  const [staffPasses, setStaffPasses] = useState([]);
  const [scanResult, setScanResult] = useState(null);
  const [giveawaySession, setGiveawaySession] = useState(null); // { attendee, eligibleItems, checkedItems }
  const [badgePrintSession, setBadgePrintSession] = useState(null); // { attendee }
  const [foodCounterSession, setFoodCounterSession] = useState(null); // { attendee, eligibleItems, checkedItems }
  const [leadExchangeSession, setLeadExchangeSession] = useState(null); // { person, isMutual, pointsAwarded }
  const [, setScanCount] = useState(0);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [offlineQueueCount, setOfflineQueueCount] = useState(0);
  const [cacheReady, setCacheReady] = useState(false);
  const [sessionTracking, setSessionTracking] = useState(false);
  const [selectedSession, setSelectedSession] = useState(null);
  const [pairingCodeInput, setPairingCodeInput] = useState('');
  const [pairingStatus, setPairingStatus] = useState('idle'); // 'idle' | 'pairing' | 'success' | 'error'
  
  const AGENDA_SESSIONS = [
    { id: 'k1', title: 'Keynote: UI Future' },
    { id: 'w1', title: 'React Workshop' },
    { id: 'n1', title: 'Networking Lunch' },
  ];
  
  // NFC State
  const [nfcSupported] = useState('NDEFReader' in window);
  const [nfcActive, setNfcActive]       = useState(false);
  const [, setNfcError]         = useState('');

  // NFC Listener
  useEffect(() => {
    const mode = gateConfig?.scanMode || 'hybrid';
    const nfcWanted = mode === 'nfc' || mode === 'hybrid';

    if (!nfcSupported || !nfcWanted || showGateSetup) {
      return;
    }

    let reader = null;

    const startNFC = async () => {
      try {
        // eslint-disable-next-line no-undef
        reader = new NDEFReader();
        await reader.scan();
        setNfcActive(true);
        setNfcError('');

        reader.onreading = (event) => {
          const { serialNumber } = event;
          console.log(`NFC Tag detected: ${serialNumber}`);
          // Use the serial number as the unique ID for the attendee
          handleScanRef.current(serialNumber);
        };

        reader.onreadingerror = () => {
          setNfcError('Error reading NFC tag. Try again.');
        };
      } catch (err) {
        console.warn('NFC Scan failed to start:', err);
        setNfcActive(false);
        setNfcError(err.message || 'NFC Permission denied');
      }
    };

    startNFC();

    return () => {
      // Chrome/Android doesn't have a direct reader.stop(), 
      // but the scan is cleaned up per-tab lifecycle or when component unmounts
      setNfcActive(false);
    };
  }, [nfcSupported, showGateSetup, gateConfig?.scanMode]);
  const [cameraError, setCameraError] = useState(null);

  const gateMode = gateConfig?.mode || 'entry';
  const isCashGate = gateMode === 'spot_reg_paid' || !!gateConfig?.collectsCash;
  const [showWalkup, setShowWalkup] = useState(false);

  // Zone rules — loaded from Firebase or localStorage cache
  const [zoneRules, setZoneRules] = useState(() => {
    try { return JSON.parse(localStorage.getItem('eventpro_zone_rules') || 'null') || DEFAULT_ZONE_RULES; } catch { return DEFAULT_ZONE_RULES; }
  });
  useEffect(() => {
    try {
      const unsub = onSnapshot(collection(db, 'zoneRules'), snap => {
        if (!snap.empty) {
          const rules = snap.docs.map(d => ({ gateId: d.id, ...d.data() }));
          setZoneRules(rules);
          localStorage.setItem('eventpro_zone_rules', JSON.stringify(rules));
        }
      });
      return () => unsub();
    } catch { /* offline – use seed */ }
  }, []);


  // Load attendees & staff — cache first, then Firestore real-time updates
  useEffect(() => {
    const eventId = deviceSession?.event?.id;
    let unsub = null;

    const loadFromCache = async () => {
      try {
        const cachedAttendees = await loadCachedAttendees(eventId);
        if (cachedAttendees.length > 0) {
          setAttendees(cachedAttendees);
          setCacheReady(true);
        }
        const cachedStaff = await loadCachedStaff();
        if (cachedStaff.length > 0) {
          setStaffPasses(cachedStaff.map(s => ({ ...s, isStaff: true })));
        }
      } catch (e) { console.warn('[Scanner] Cache load failed:', e); }
    };

    const subscribeFirestore = () => {
      const q = eventId
        ? query(collection(db, 'attendees'), where('eventId', '==', eventId))
        : query(collection(db, 'attendees'));
      unsub = onSnapshot(q, snap => {
        setAttendees(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        setCacheReady(true);
      }, err => console.warn('Attendee listener error:', err));
    };

    loadFromCache();
    subscribeFirestore();
    return () => unsub && unsub();
  }, [deviceSession?.event?.id]);

  useEffect(() => {
    const q = query(collection(db, 'staffPasses'));
    const unsub = onSnapshot(q, snap => {
      setStaffPasses(snap.docs.map(d => ({ id: d.id, ...d.data(), isStaff: true })));
    }, err => console.warn('Staff listener error:', err));
    return () => unsub();
  }, []);



  // ─── Camera Engine ────────────────────────────────────────────────────────
  useEffect(() => {
    const mode = gateConfig?.scanMode || 'hybrid';
    const qrWanted = mode !== 'nfc';

    if (showGateSetup || !scannerRef.current || !qrWanted) {
      return;
    }

    let isClosed = false;
    let qr = null;
    setCameraError(null);

    // html5-qrcode has a state machine that throws "already under transition" if start() is
    // called while another start() or stop() is in flight. React 18 StrictMode double-mounts
    // effects in dev, which triggers exactly that. We swallow that specific error and rely
    // on the second mount's start to win.
    const isTransitionError = (e) => /already under transition/i.test(e?.message || '');

    const startCamera = async () => {
      try {
        qr = new Html5Qrcode('qr-reader');
        html5QrRef.current = qr;
      } catch (e) {
        console.error('Html5Qrcode init error:', e);
        if (!isClosed) setCameraError(e?.message || 'Failed to initialize camera library.');
        return;
      }

      const config = { fps: 15, qrbox: { width: 260, height: 260 } };
      const onDecode = (text) => { if (!isClosed) handleScanRef.current(text); };

      // Prefer rear camera; if that fails (e.g. laptop without one), fall back to any.
      try {
        await qr.start({ facingMode: { ideal: 'environment' } }, config, onDecode, () => {});
        if (!isClosed) {/* scanner ready */}
        return;
      } catch (e1) {
        if (isTransitionError(e1)) return; // benign — another mount is handling it
        try {
          await qr.start(true, config, onDecode, () => {});
          if (!isClosed) {/* scanner ready */}
        } catch (e2) {
          if (isTransitionError(e2)) return;
          console.error('Camera start error:', e2);
          if (!isClosed) setCameraError(e2?.message || 'Could not start camera. Check browser camera permissions.');
        }
      }
    };

    startCamera();

    return () => {
      isClosed = true;
      // Stop is also async with its own state machine; ignore any errors during teardown.
      if (qr) {
        const stopIfRunning = () => {
          try {
            if (qr.isScanning) return qr.stop();
          } catch { /* ignore teardown errors */ }
          return Promise.resolve();
        };
        stopIfRunning().catch(() => {});
      }
    };
  }, [showGateSetup, gateConfig?.scanMode]);

  // Removed old redundant comment about Refunkunkunkunkunkunkunkunk

  // ─── Write scan event to scanLogs collection ───────────────────────────────
  const writeScanLog = useCallback(async (entry) => {
    try {
      const session = JSON.parse(localStorage.getItem('eventpro_device_session') || '{}');
      const payload = {
        ...entry,
        deviceId:   session.deviceId   || null,
        deviceName: session.deviceName || null,
        holderName: session.holder?.name || null,
        supervisorId:   session.supervisor?.id   || null,
        supervisorName: session.supervisor?.name || null,
        supervisorEmail: session.supervisor?.email || null,
        eventId:        session.event?.id    || entry.eventId  || null,
        eventName:      session.event?.name  || entry.eventName || null,
        gateId:         session.gate?.id     || entry.gateId   || null,
        gateName:       session.gate?.label  || entry.gateName || null,
        gateIcon:       session.gate?.icon   || entry.gateIcon || null,
        volunteerName:  session.volunteer?.name  || null,
        volunteerEmail: session.volunteer?.email || null,
        volunteerPhone: session.volunteer?.phone || null,
        volunteerSessionId: session.volunteerSessionId || null,
        timestamp:  serverTimestamp(),
      };
      if (!navigator.onLine) {
        await queueScanOperation({ type: 'scanLog', data: payload });
        setOfflineQueueCount(c => c + 1);
        return;
      }
      await addDoc(collection(db, 'scanLogs'), payload);
    } catch {
      // If Firestore write fails, queue for retry
      try {
        await queueScanOperation({ type: 'scanLog', data: { ...entry, timestamp: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 } } });
        setOfflineQueueCount(c => c + 1);
      } catch { /* never block the scanner */ }
    }
  }, []);

  // ─── Write checkpoint (attendee/staff scan record) ──────────────────────────
  const writeCheckpoint = useCallback(async (personId, collectionName, checkpointEntry, updates) => {
    if (!navigator.onLine) {
      await queueScanOperation({
        type: 'checkpoint',
        data: { personId, collectionName, checkpointEntry, updates },
      });
      setOfflineQueueCount(c => c + 1);
      return;
    }
    try {
      await updateDoc(doc(db, collectionName, personId), {
        checkpoints: arrayUnion(checkpointEntry),
        ...updates,
      });
    } catch (e) {
      console.warn('Checkpoint write failed, queuing:', e);
      await queueScanOperation({
        type: 'checkpoint',
        data: { personId, collectionName, checkpointEntry, updates },
      });
      setOfflineQueueCount(c => c + 1);
    }
  }, []);

  // ─── Flush pending scan queue when online ──────────────────────────────────
  const flushScanQueue = useCallback(async () => {
    const queue = await getScanQueue();
    if (queue.length === 0) return;
    let flushed = 0;
    for (const item of queue) {
      try {
        if (item.type === 'scanLog') {
          await addDoc(collection(db, 'scanLogs'), { ...item.data, timestamp: serverTimestamp() });
        } else if (item.type === 'checkpoint') {
          const { personId, collectionName, checkpointEntry, updates } = item.data;
          await updateDoc(doc(db, collectionName, personId), {
            checkpoints: arrayUnion(checkpointEntry),
            ...updates,
          });
        }
        await removeFromQueue(item.localId);
        flushed++;
      } catch (e) {
        await markQueueAttempt(item.localId, e);
        console.warn(`Flush failed for item ${item.localId}:`, e);
      }
    }
    const remaining = await getScanQueue();
    setOfflineQueueCount(remaining.length);
    if (flushed > 0) console.log(`[Scanner] Flushed ${flushed} queued operations`);
  }, []);

  // Listen for online events and flush queue
  useEffect(() => {
    const onOnline = () => { setIsOnline(true); };
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  // Flush queue when coming online
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (isOnline) flushScanQueue();
  }, [isOnline, flushScanQueue]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Periodic cache refresh (every 60s when online)
  useEffect(() => {
    if (!deviceSession?.event?.id) return;
    const interval = setInterval(async () => {
      if (!navigator.onLine) return;
      try {
        const eventId = deviceSession.event.id;
        const q = query(collection(db, 'attendees'), where('eventId', '==', eventId));
        const snap = await getDocs(q);
        const attendees = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        await cacheEventAttendees(eventId, attendees);
        const staffSnap = await getDocs(query(collection(db, 'staffPasses')));
        const staff = staffSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        await cacheStaffPasses(staff);
        console.log(`[Scanner] Cache refreshed: ${attendees.length} attendees, ${staff.length} staff`);
      } catch (e) { console.warn('[Scanner] Cache refresh failed:', e); }
    }, 60000);
    return () => clearInterval(interval);
  }, [deviceSession?.event?.id]);

  // ─── End Shift: end volunteer session ──────────────────────────────────────
  const handleEndShift = useCallback(async () => {
    const session = JSON.parse(localStorage.getItem('eventpro_device_session') || '{}');
    if (session.volunteerSessionId && !session.volunteerSessionId.startsWith('local-')) {
      try {
        await updateDoc(doc(db, 'volunteerSessions', session.volunteerSessionId), {
          status: 'ended',
          shiftEnd: serverTimestamp(),
        });
      } catch (e) { console.warn('Failed to update volunteer session:', e); }
    }
    localStorage.removeItem('eventpro_device_session');
    localStorage.removeItem('eventpro_gate_config');
    setDeviceSession(null);
    await clearAllCache();
    html5QrRef.current?.isScanning && html5QrRef.current.stop();
    navigate('/device-login');
  }, [navigate]);

  // ─── Cash Collection: mark a pending ticket as paid, then continue to approval ────
  const markPaidAndApprove = useCallback(async (attendee) => {
    if (!attendee || !attendee.id) return;
    const gateId = gateConfig?.id || 'cash-gate';
    const gateLabel = gateConfig?.label || 'Cash Collection Gate';
    const personName = getAttendeeName(attendee);
    try {
      await updateDoc(doc(db, 'attendees', attendee.id), {
        paymentStatus: 'paid',
        paidAt: serverTimestamp(),
        paidGateId: gateId,
      });
      writeScanLog({
        gateId, gateName: gateLabel, gateIcon: gateConfig?.icon,
        attendeeId: attendee.id, attendeeName: personName,
        ticketType: attendee.ticketName || '',
        company: attendee.company || '',
        result: 'payment_collected',
        reason: `Cash ${attendee.ticketPrice || ''} collected`.trim(),
      });
      // Grant entry immediately so the attendee walks straight in.
      const checkpointEntry = { gateId, gateLabel, time: new Date().toISOString() };
      await updateDoc(doc(db, 'attendees', attendee.id), {
        checkpoints: arrayUnion(checkpointEntry),
        status: 'checked-in',
        scanned: true,
        lastScanGate: gateLabel,
        lastScanTime: serverTimestamp(),
      });
      writeScanLog({
        gateId, gateName: gateLabel, gateIcon: gateConfig?.icon,
        attendeeId: attendee.id, attendeeName: personName,
        ticketType: attendee.ticketName || '',
        result: 'approved', reason: 'Paid + entered',
      });
      setScanResult({
        type: 'approved',
        attendee,
        reason: 'Paid & Entered',
        detail: `${personName} — ${attendee.ticketName || 'Ticket'} (${attendee.ticketPrice || 'cash'})`,
      });
      setScanCount(c => c + 1);
      setTimeout(() => setScanResult(null), 3500);
    } catch (e) {
      console.error('Mark-paid failed:', e);
      alert('Could not mark this ticket as paid: ' + (e.message || 'unknown error'));
    }
  }, [gateConfig, writeScanLog]);

  // ─── Core Scan Authentication Logic ───────────────────────────────────────
  const handleScan = useCallback(async (scannedId) => {
    if (isProcessingRef.current) return; // debounce rapid fire
    isProcessingRef.current = true;
    setTimeout(() => { isProcessingRef.current = false; }, 3000);

    const gateId = gateConfig?.id || 'main-entrance';
    const gateLabel = gateConfig?.label || 'Main Entrance';
    const eventId = deviceSession?.event?.id;
    const mode = gateMode;

    // ─── Mode: Spot Registration (Free / Paid) ───────────────────────────────
    if (mode === 'spot_reg_free' || mode === 'spot_reg_paid') {
      setShowWalkup(true);
      return;
    }

    // ─── All other modes need a registered person ────────────────────────────
    let person = attendees.find(a => a.id === scannedId || getAttendeeEmail(a) === scannedId) ||
                 staffPasses.find(s => s.id === scannedId || s.email === scannedId);

    if (!person && cacheReady) {
      try {
        const cached = await lookupCachedPerson(scannedId, eventId);
        if (cached) person = cached;
      } catch (e) { console.warn('Cache lookup failed:', e); }
    }

    if (!person) {
      setScanResult({ type: 'rejected', reason: 'Not Registered', detail: 'This ID was not found in the system.' });
      setScanCount(c => c + 1);
      writeScanLog({ gateId, gateName: gateLabel, gateIcon: gateConfig?.icon, attendeeId: null, attendeeName: 'Unknown', ticketType: '', company: '', result: 'rejected', reason: 'Not Registered' });
      setTimeout(() => setScanResult(null), 4000);
      return;
    }

    const isStaff = person.isStaff;
    const personName = isStaff ? person.name : getAttendeeName(person);
    const personTicket = isStaff ? person.role : (person.ticketName || 'General Delegate');

    // ─── Mode: Badge Printing ────────────────────────────────────────────────
    if (mode === 'badge_print') {
      if (isStaff) {
        setScanResult({ type: 'rejected', reason: 'Staff Badge', detail: 'Staff badges are not printed here.' });
        setTimeout(() => setScanResult(null), 3000);
        return;
      }
      if (person.badgePrinted) {
        setScanResult({ type: 'duplicate', attendee: person, reason: 'Badge Already Printed', detail: `${personName}'s badge was already printed at ${person.badgePrintedGate || 'this station'}.` });
        setTimeout(() => setScanResult(null), 4000);
        return;
      }
      setBadgePrintSession({ attendee: person });
      return;
    }

    // ─── Mode: Food Counter (Points Redemption) ──────────────────────────────
    if (mode === 'food_counter' && !isStaff) {
      const pts = person.points || 0;
      // Load rewards from cache or fallback to defaults
      const eligible = DEFAULT_GIVEAWAYS.map(g => ({ ...g, pointsCost: g.id === 1 ? 300 : g.id === 2 ? 500 : g.id === 3 ? 800 : 1000, category: 'food' }));
      const alreadyRedeemed = person.redeemedRewards || [];
      const available = eligible.filter(r => !alreadyRedeemed.some(rr => rr.rewardId === r.id) && pts >= r.pointsCost);
      if (available.length === 0) {
        setScanResult({ type: 'duplicate', attendee: person, reason: 'No Points', detail: pts === 0 ? 'No points available. Scan exhibitor badges to earn!' : 'Not enough points for any item.' });
        setTimeout(() => setScanResult(null), 4000);
        return;
      }
      setFoodCounterSession({ attendee: person, points: pts, eligibleItems: available, checkedItems: [] });
      return;
    }

    // ─── Mode: Lead Exchange ─────────────────────────────────────────────────
    if (mode === 'lead_exchange') {
      // Scan can be initiated by attendee (scanning exhibitor QR) or exhibitor (scanning attendee badge)
      // For simplicity at a lead-exchange gate: if person is attendee → they are scanning an exhibitor
      // If person is exhibitor → they are scanning an attendee
      const isExhibitor = person.role === 'exhibitor' || isStaff;
      const targetType = isExhibitor ? 'attendee' : 'exhibitor';
      setLeadExchangeSession({ person, targetType, isMutual: false, pointsAwarded: 0 });
      return;
    }

    // ─── Mode: Giveaway ──────────────────────────────────────────────────────
    if (mode === 'giveaway' && !isStaff) {
      const eligible = getEligibleGiveaways(person.ticketName || 'General Delegate');
      const alreadyClaimed = person.claimedGiveaways || [];
      const unclaimed = eligible.filter(g => !alreadyClaimed.includes(g.id));
      if (unclaimed.length === 0) {
        setScanResult({ type: 'duplicate', attendee: person, reason: 'Already Collected', detail: 'This attendee has already collected all eligible giveaway items.' });
        setTimeout(() => setScanResult(null), 4000);
        return;
      }
      setGiveawaySession({ attendee: person, eligibleItems: unclaimed, checkedItems: [] });
      return;
    }

    // ─── Mode: Entry (default) ───────────────────────────────────────────────
    // 1. Payment gate — pending tickets need to clear cash collection before any other gate.
    if (!isStaff && person.paymentStatus === 'pending') {
      if (isCashGate) {
        setScanResult({
          type: 'payment_due',
          attendee: person,
          reason: 'Payment Due',
          detail: `Collect ${person.ticketPrice || 'cash'} from ${personName} for ${personTicket}.`,
        });
        writeScanLog({ gateId, gateName: gateLabel, gateIcon: gateConfig?.icon, attendeeId: person.id, attendeeName: personName, ticketType: personTicket, company: person.company, result: 'payment_pending_seen', reason: 'Awaiting cash collection' });
        return;
      } else {
        setScanResult({
          type: 'rejected',
          attendee: person,
          reason: 'Payment Pending',
          detail: 'Please proceed to the Cash Collection Gate to pay before entering.',
        });
        writeScanLog({ gateId, gateName: gateLabel, gateIcon: gateConfig?.icon, attendeeId: person.id, attendeeName: personName, ticketType: personTicket, company: person.company, result: 'rejected', reason: 'Payment Pending' });
        setTimeout(() => setScanResult(null), 5000);
        return;
      }
    }

    // 2. Check if already checked in at THIS gate
    const checkpoints = person.checkpoints || [];
    const alreadyAtThisGate = checkpoints.some(cp => cp.gateId === gateId);

    if (alreadyAtThisGate && !isStaff) {
      const time = checkpoints.find(cp => cp.gateId === gateId)?.time;
      setScanResult({
        type: 'duplicate',
        attendee: person,
        reason: 'Already Scanned',
        detail: `${personName} was already scanned at ${gateLabel}${time ? ' at ' + new Date(time).toLocaleTimeString() : ''}.`
      });
      setScanCount(c => c + 1);
      writeScanLog({ gateId, gateName: gateLabel, gateIcon: gateConfig?.icon, attendeeId: person.id, attendeeName: personName, ticketType: personTicket, company: person.company, result: 'duplicate', reason: 'Already Scanned' });
      setTimeout(() => setScanResult(null), 4000);
      return;
    }

    // 3. Zone Access Control
    if (isStaff) {
      const assignedZone = person.zone || 'All Access';
      const isAllowed = assignedZone === 'All Access' || assignedZone === gateLabel;
      if (!isAllowed) {
        setScanResult({
          type: 'zone_denied',
          attendee: person,
          reason: 'Restricted Zone',
          detail: `Staff role "${person.role}" is assigned to "${assignedZone}". Access to "${gateLabel}" is denied.`,
          denyType: 'staff_restricted'
        });
        writeScanLog({ gateId, gateName: gateLabel, attendeeId: person.id, result: 'zone_denied', reason: 'Staff Restricted Zone' });
        setTimeout(() => setScanResult(null), 5000);
        return;
      }
    } else {
      const access = checkZoneAccess(person, gateId, zoneRules);
      if (!access.allowed) {
        const gLow = gateLabel.toLowerCase();
        const isWorkshopZone = gLow.includes('workshop');
        const isVIPZone      = gLow.includes('vip') || gLow.includes('lounge') || gLow.includes('platinum');
        const isUpsellTarget = ['delegate', 'visitor', 'day-pass'].includes(mapTicketToId(person.ticketName));
        let upsellType = null;
        if (isUpsellTarget && access.allowUpgrade !== false) {
          if (isWorkshopZone) upsellType = 'workshop-upsell';
          else if (isVIPZone) upsellType = 'vip-upsell';
        }
        setScanResult({
          type: 'zone_denied',
          attendee: person,
          reason: access.reason,
          detail: access.detail,
          denyType: access.type,
          upsell: !!upsellType,
          upsellType
        });
        writeScanLog({ gateId, gateName: gateLabel, attendeeId: person.id, result: 'zone_denied', reason: access.reason });
        setTimeout(() => setScanResult(null), 5000);
        return;
      }
    }

    // 4. Grant Access
    const checkpointEntry = { gateId, gateLabel, time: new Date().toISOString() };
    const collectionName = isStaff ? 'staffPasses' : 'attendees';
    const checkpointUpdates = {
      status: isStaff ? person.status : 'checked-in',
      scanned: true,
      lastScanGate: gateLabel,
      lastScanTime: serverTimestamp(),
    };

    if (isStaff) {
      setStaffPasses(prev => prev.map(s => s.id === person.id
        ? { ...s, checkpoints: [...(s.checkpoints || []), checkpointEntry], ...checkpointUpdates }
        : s
      ));
    } else {
      setAttendees(prev => prev.map(a => a.id === person.id
        ? { ...a, checkpoints: [...(a.checkpoints || []), checkpointEntry], ...checkpointUpdates }
        : a
      ));
    }

    await writeCheckpoint(person.id, collectionName, checkpointEntry, checkpointUpdates);

    setScanResult({
      type: 'approved',
      attendee: person,
      reason: isStaff ? 'STAFF AUTHORIZED' : 'Access Granted',
      detail: isStaff ? `Internal Role: ${person.role.toUpperCase()}` : (person.ticketName || 'General Delegate')
    });
    writeScanLog({ gateId, gateName: gateLabel, result: 'approved', reason: 'Success' });
    setScanCount(c => c + 1);
    setTimeout(() => setScanResult(null), 3500);
  }, [attendees, gateConfig, zoneRules, isCashGate, staffPasses, writeScanLog, writeCheckpoint, cacheReady, deviceSession?.event?.id, gateMode]);

  // Update handleScanRef so camera callback always calls latest handleScan
  useEffect(() => {
    handleScanRef.current = handleScan;
  }, [handleScan]);

  // ─── Gate Setup Wizard ─────────────────────────────────────────────────────
  const confirmGateSetup = () => {
    const preset = GATE_PRESETS.find(g => g.id === draftGate.preset);
    const cfg = {
      id: draftGate.preset === 'custom' ? `custom-${Date.now()}` : draftGate.preset,
      label: draftGate.preset === 'custom' ? (draftGate.customName || 'Custom Gate') : preset.label,
      icon: draftGate.preset === 'custom' ? '🔵' : preset.icon,
      scanMode: draftGate.scanMode || 'hybrid',
      collectsCash: !!draftGate.collectsCash,
      eventId: draftGate.eventId || deviceSession?.event?.id || null,
      eventName: draftGate.eventName || deviceSession?.event?.name || null,
      ticketTypes: Array.isArray(draftGate.ticketTypes) ? draftGate.ticketTypes : [],
      sessionTracking,
      session: selectedSession
    };
    setGateConfig(cfg);
    saveGateConfig(cfg);
    setShowGateSetup(false);
  };

  // For the cash-gate setup wizard: load events the staff can choose from.
  const [setupEvents, setSetupEvents] = useState([]);
  useEffect(() => {
    if (!showGateSetup || !draftGate.collectsCash) return;
    const unsub = onSnapshot(collection(db, 'events'), snap => {
      setSetupEvents(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, () => {});
    return () => unsub();
  }, [showGateSetup, draftGate.collectsCash]);

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 bg-black flex flex-col overflow-hidden">

      {/* Status Bar */}
      <div className="flex items-center justify-between px-4 md:px-6 py-3 bg-black/80 backdrop-blur-sm border-b border-white/5 z-10">
        <button
          onClick={() => { html5QrRef.current?.isScanning && html5QrRef.current.stop(); navigate('/device-login'); }}
          className="flex items-center gap-2 text-zinc-500 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          <span className="hidden sm:inline text-sm font-medium">Exit</span>
        </button>

        <div className="flex items-center gap-3">
          {/* Headcount Indicator */}
          {gateConfig && (
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border transition-all ${
              (() => {
                const head = attendees.filter(a => a.checkpoints?.some(cp => cp.gateId === gateConfig.id)).length;
                const limit = zoneRules.find(r => r.gateId === gateConfig.id)?.capacityLimit || 500;
                const pct = (head / limit) * 100;
                return pct >= 100 ? 'bg-red-500/10 border-red-500/30 text-red-400' :
                       pct >= 85  ? 'bg-amber-500/10 border-amber-500/30 text-amber-400' :
                       'bg-green-500/10 border-green-500/30 text-green-400';
              })()
            }`}>
              <Users className="w-3.5 h-3.5" />
              <div className="flex flex-col items-start leading-none">
                <span className="text-[8px] font-black uppercase tracking-tighter opacity-70">Live</span>
                <span className="text-[10px] md:text-xs font-black">
                  {attendees.filter(a => a.checkpoints?.some(cp => cp.gateId === gateConfig.id)).length}
                  <span className="opacity-40 mx-0.5">/</span>
                  {zoneRules.find(r => r.gateId === gateConfig.id)?.capacityLimit || 500}
                </span>
              </div>
            </div>
          )}

          {/* Volunteer Session Indicator */}
          {deviceSession?.volunteer?.name && (
            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-xl border border-white/10 bg-white/5">
              <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center overflow-hidden">
                {deviceSession.volunteer.photo ? (
                  <img src={deviceSession.volunteer.photo} alt="V" className="w-full h-full object-cover" />
                ) : (
                  <Users className="w-3 h-3 text-primary" />
                )}
              </div>
              <div className="flex flex-col items-start leading-none">
                <span className="text-[8px] font-black text-primary uppercase tracking-tighter">Volunteer</span>
                <span className="text-[10px] font-bold text-white">{deviceSession.volunteer.name}</span>
              </div>
            </div>
          )}

          {/* Event Badge */}
          {deviceSession?.event?.name && (
            <div className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-white/10 bg-white/5 text-zinc-300">
              <Calendar className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-[10px] font-bold truncate max-w-[120px]">{deviceSession.event.name}</span>
            </div>
          )}

          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-white/5 rounded-full border border-white/10 text-zinc-300">
            <MapPin className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs font-bold">{gateConfig?.icon} {gateConfig?.label || 'Setup…'}</span>
          </div>

          {/* NFC Status Indicator */}
          {nfcSupported && (
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border transition-all ${
              nfcActive ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400' : 'bg-red-500/10 border-red-500/30 text-red-400'
            }`}>
              <Radio className={`w-3.5 h-3.5 ${nfcActive ? 'animate-pulse' : ''}`} />
              <span className="text-[10px] font-black uppercase tracking-widest">{nfcActive ? 'NFC' : 'NFC OFF'}</span>
            </div>
          )}

          <div className="flex items-center gap-1.5 px-2 md:px-3 py-1.5 bg-white/5 rounded-full border border-white/10">
            <Wifi className={`w-3.5 h-3.5 ${isOnline ? 'text-green-400' : 'text-red-400'}`} />
            <span className={`hidden sm:inline text-[10px] font-black uppercase tracking-widest ${isOnline ? 'text-green-400' : 'text-red-400'}`}>{isOnline ? 'Sync' : 'Error'}</span>
          </div>

          {/* Offline Queue Indicator */}
          {offlineQueueCount > 0 && (
            <div className="flex items-center gap-1.5 px-2 md:px-3 py-1.5 bg-amber-500/10 rounded-full border border-amber-500/20">
              <RefreshCw className="w-3.5 h-3.5 text-amber-400 animate-spin" style={{ animationDuration: '2s' }} />
              <span className="text-[10px] font-black text-amber-400 uppercase tracking-widest">{offlineQueueCount}</span>
            </div>
          )}

          {/* End Shift Button */}
          {deviceSession?.volunteer?.name && (
            <button
              onClick={handleEndShift}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 border border-red-500/20 rounded-full text-red-400 hover:bg-red-500/20 transition-colors"
              title="End Volunteer Shift"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline text-[10px] font-black uppercase tracking-widest">End Shift</span>
            </button>
          )}

          <button
            onClick={() => setShowGateSetup(true)}
            className="p-2 bg-white/5 rounded-full border border-white/10 hover:bg-white/10 transition-colors text-zinc-400"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Camera/NFC Viewfinder */}
      <div className="flex-1 relative flex items-center justify-center bg-black">
        {/* QR Scanner Container — render whenever the gate isn't NFC-only (incl. legacy configs without scanMode) */}
        {gateConfig?.scanMode !== 'nfc' && (
          <div id="qr-reader" ref={scannerRef} className="w-full h-full" style={{ maxWidth: '100%', maxHeight: '100%' }} />
        )}

        {/* Camera error banner */}
        {cameraError && (gateConfig?.scanMode === 'qr' || gateConfig?.scanMode === 'hybrid') && (
          <div className="absolute inset-0 z-30 flex items-center justify-center p-8 pointer-events-none">
            <div className="max-w-sm bg-red-950/90 border border-red-500/40 rounded-2xl p-6 text-center pointer-events-auto">
              <XCircle className="w-12 h-12 text-red-400 mx-auto mb-3" />
              <h3 className="text-lg font-bold text-white mb-2">Camera unavailable</h3>
              <p className="text-sm text-red-200/80 mb-4">{cameraError}</p>
              <p className="text-xs text-zinc-400">
                In Chrome: click the camera icon in the address bar → Allow → reload the page.
                If you have no webcam, NFC mode (Tap) still works on supported devices.
              </p>
            </div>
          </div>
        )}

        {/* NFC Only Viewport */}
        {gateConfig?.scanMode === 'nfc' && (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center z-10">
            <div className="w-48 h-48 rounded-full bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mb-8 relative">
              <div className="absolute inset-0 rounded-full border-2 border-indigo-500 animate-ping opacity-20" />
              <Radio className="w-20 h-20 text-indigo-400" />
            </div>
            <h3 className="text-3xl font-black text-white mb-2 tracking-tighter">TAP FOR ENTRY</h3>
            <p className="text-zinc-500 text-sm max-w-xs font-medium">
              Place your RFID or NFC badge against the back of the SUNMI device.
            </p>
          </div>
        )}

        {/* Overlay frame UI — shown over camera */}
        {!showGateSetup && (gateConfig?.scanMode === 'qr' || gateConfig?.scanMode === 'hybrid') && (
          <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
            {/* Darkened corner vignette */}
            <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.7) 100%)' }} />

            {/* Scan frame */}
            <div className="relative z-10 w-64 h-64">
              {/* Animated scanning beam */}
              <Motion.div
                className="absolute left-2 right-2 h-0.5 bg-gradient-to-r from-transparent via-primary to-transparent"
                animate={{ top: ['8px', '248px', '8px'] }}
                transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
              />
              {/* Corner brackets */}
              {[['top-0 left-0', 'border-t-2 border-l-2'],
                ['top-0 right-0', 'border-t-2 border-r-2'],
                ['bottom-0 left-0', 'border-b-2 border-l-2'],
                ['bottom-0 right-0', 'border-b-2 border-r-2']].map(([pos, border]) => (
                <div key={pos} className={`absolute ${pos} w-8 h-8 ${border} border-primary rounded-sm`} />
              ))}
            </div>

            {/* Instruction text */}
            <p className="relative z-10 mt-8 text-zinc-400 text-sm font-medium tracking-wide">
              {gateConfig?.scanMode === 'hybrid' ? 'Scan QR or Tap NFC Badge' : 'Point camera at attendee QR badge'}
            </p>

            {/* Simulation for Dev (to test NFC logic without physical tag) */}
            {import.meta.env.DEV && gateConfig?.scanMode === 'hybrid' && (
              <button 
                onClick={() => handleScan('nfc-sim-001')}
                className="mt-4 px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-zinc-600 text-[10px] uppercase font-black hover:text-white transition-all">
                Simulate NFC Tap
              </button>
            )}
          </div>
        )}
      </div>

      {/* ─── Scan Result Overlay ─── */}
      <AnimatePresence>
        {scanResult && (
          <Motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className={`absolute inset-0 z-50 flex flex-col items-center justify-center p-8 ${
              scanResult.type === 'approved'     ? 'bg-green-950/95'  :
              scanResult.type === 'duplicate'    ? 'bg-amber-950/95'  :
              scanResult.type === 'zone_denied'  ? 'bg-indigo-950/95' :
              scanResult.type === 'payment_due'  ? 'bg-emerald-950/95' : 'bg-red-950/95'
            } backdrop-blur-md`}
          >
            <Motion.div
              initial={{ scale: 0.5 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 20 }}
              className="flex flex-col items-center text-center"
            >
              {scanResult.type === 'approved'    && <CheckCircle2  className="w-28 h-28 text-green-400 mb-6" strokeWidth={1.5} />}
              {scanResult.type === 'duplicate'   && <AlertTriangle className="w-28 h-28 text-amber-400 mb-6" strokeWidth={1.5} />}
              {scanResult.type === 'rejected'    && <XCircle       className="w-28 h-28 text-red-400   mb-6" strokeWidth={1.5} />}
              {scanResult.type === 'zone_denied' && scanResult.denyType === 'time' && <Clock    className="w-28 h-28 text-indigo-300 mb-6" strokeWidth={1.5} />}
              {scanResult.type === 'zone_denied' && scanResult.denyType !== 'time' && <ShieldOff  className="w-28 h-28 text-indigo-300 mb-6" strokeWidth={1.5} />}
              {scanResult.type === 'payment_due' && <span className="text-7xl mb-6">💵</span>}

              <h2 className={`text-4xl md:text-5xl font-black mb-3 tracking-tight ${
                scanResult.type === 'approved'    ? 'text-green-300' :
                scanResult.type === 'duplicate'   ? 'text-amber-300' :
                scanResult.type === 'zone_denied' ? 'text-indigo-300' :
                scanResult.type === 'payment_due' ? 'text-emerald-300' : 'text-red-300'
              }`}>
                {scanResult.reason}
              </h2>

              {scanResult.attendee && (
                <>
                  <p className="text-white text-2xl md:text-3xl font-bold mb-2">{getAttendeeName(scanResult.attendee)}</p>
                  <span className="text-zinc-300 text-sm md:text-lg font-medium px-4 py-1 bg-white/10 rounded-full mb-4">
                    {scanResult.attendee.ticketName || 'General Delegate'}
                  </span>
                  {scanResult.attendee.company && (
                    <p className="text-zinc-400 text-base">{scanResult.attendee.company}</p>
                  )}
                  {gateConfig?.sessionTracking && (
                    <div className="mt-4 p-3 bg-yellow-400/10 border border-yellow-400/20 rounded-xl">
                      <p className="text-[10px] font-black text-yellow-400 uppercase tracking-widest mb-1">Session Attendance Logged</p>
                      <p className="text-sm font-bold text-white">{gateConfig.session?.title || 'Unknown Room'}</p>
                    </div>
                  )}
                </>
              )}

              <p className="text-zinc-400 text-sm mt-6 max-w-xs leading-relaxed">{scanResult.detail}</p>
              
              {scanResult.upsell && (
                <Motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
                  className="mt-8 p-4 bg-white/10 border border-white/20 rounded-2xl flex flex-col items-center gap-3">
                  <div className="flex items-center gap-2 text-indigo-300 font-bold text-sm">
                    <Mail className="w-5 h-5" />
                    <span>{scanResult.upsellType === 'vip-upsell' ? 'VIP UPGRADE SENT' : 'WORKSHOP UPSELL SENT'}</span>
                  </div>
                  <p className="text-white/60 text-[10px] uppercase font-black tracking-widest leading-none text-center">
                    {scanResult.upsellType === 'vip-upsell'
                      ? `Lounge access invitation sent to ${getAttendeeEmail(scanResult.attendee)}`
                      : `Workshop session invite sent to ${getAttendeeEmail(scanResult.attendee)}`}
                  </p>
                </Motion.div>
              )}

              {scanResult.type === 'payment_due' && scanResult.attendee && (
                <Motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
                  className="mt-8 flex flex-col items-center gap-3 w-full max-w-sm">
                  <div className="px-6 py-4 bg-white/10 border border-emerald-400/30 rounded-2xl text-center">
                    <p className="text-[10px] font-black text-emerald-300 uppercase tracking-widest">Amount to Collect</p>
                    <p className="text-3xl font-black text-white mt-1">{scanResult.attendee.ticketPrice || 'Confirm with attendee'}</p>
                  </div>
                  <button
                    onClick={() => markPaidAndApprove(scanResult.attendee)}
                    className="w-full py-4 bg-emerald-500 hover:bg-emerald-400 text-white font-black uppercase tracking-widest rounded-2xl transition-colors active:scale-95"
                  >
                    ✓ Mark Paid &amp; Admit
                  </button>
                  <button
                    onClick={() => setScanResult(null)}
                    className="w-full py-2 text-zinc-500 hover:text-white text-xs font-bold uppercase tracking-widest transition-colors"
                  >
                    Cancel
                  </button>
                </Motion.div>
              )}
            </Motion.div>
          </Motion.div>
        )}
      </AnimatePresence>

      {/* ─── Walk-up Registration FAB (cash gate only) ─── */}
      {isCashGate && !showGateSetup && !scanResult && !showWalkup && (
        <button
          onClick={() => setShowWalkup(true)}
          className="absolute bottom-6 right-6 z-40 flex items-center gap-2 px-5 py-3 bg-emerald-500 hover:bg-emerald-400 text-white font-black uppercase tracking-widest rounded-full shadow-2xl shadow-emerald-500/30 transition-colors active:scale-95"
        >
          <UserPlus className="w-5 h-5" />
          <span className="text-xs">Walk-up</span>
        </button>
      )}

      {/* ─── Walk-up Registration Modal ─── */}
      <AnimatePresence>
        {showWalkup && (
          <WalkupModal
            gateConfig={gateConfig}
            onClose={() => setShowWalkup(false)}
            onCreated={(attendee) => {
              setShowWalkup(false);
              // Show approved card immediately so the attendee walks in.
              setScanResult({
                type: 'approved',
                attendee,
                reason: 'Walk-up Admitted',
                detail: `${getAttendeeName(attendee)} — ${attendee.ticketName} (${attendee.ticketPrice || 'cash'})`,
              });
              setScanCount(c => c + 1);
              setTimeout(() => setScanResult(null), 4000);
            }}
          />
        )}
      </AnimatePresence>

      {/* ─── Gate Setup Wizard Overlay ─── */}
      <AnimatePresence>
        {showGateSetup && (
          <Motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-6"
          >
                    <Motion.div 
                        initial={{ y: '100%', opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: '100%', opacity: 0 }}
                        className="relative w-full lg:max-w-md bg-zinc-900 border-t lg:border border-white/10 rounded-t-3xl lg:rounded-2xl p-6 md:p-8 shadow-2xl overflow-y-auto max-h-[95vh]"
                    >
              <div className="flex items-center gap-4 mb-8">
                <div className="w-12 h-12 bg-primary/10 rounded-xl border border-primary/20 flex items-center justify-center">
                  <MapPin className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">Select Entry Gate</h2>
                  <p className="text-zinc-500 text-sm">Which checkpoint is this POS device?</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-6">
                {GATE_PRESETS.map(gate => (
                  <button
                    key={gate.id}
                    onClick={() => setDraftGate(d => ({ ...d, preset: gate.id }))}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      draftGate.preset === gate.id
                        ? 'bg-primary/10 border-primary/40 text-white'
                        : 'bg-white/5 border-white/10 text-zinc-400 hover:border-white/20 hover:text-white'
                    }`}
                  >
                    <span className="text-xl block mb-1">{gate.icon}</span>
                    <span className="text-sm font-semibold">{gate.label}</span>
                  </button>
                ))}
              </div>

              {draftGate.preset === 'custom' && (
                <input
                  type="text"
                  value={draftGate.customName}
                  onChange={e => setDraftGate(d => ({ ...d, customName: e.target.value }))}
                  placeholder="e.g. Conference Room C"
                  className="w-full mb-6 px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-zinc-600 outline-none focus:border-primary/50 transition-colors"
                  autoFocus
                />
              )}

              <div className="mt-6 pt-6 border-t border-white/5 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-zinc-500" />
                    <span className="text-xs font-bold text-white">Track Session Attendance</span>
                  </div>
                  <button onClick={() => setSessionTracking(!sessionTracking)} className={`w-12 h-6 rounded-full relative transition-all ${sessionTracking ? 'bg-primary shadow-[0_0_10px_rgba(84,34,255,0.3)]' : 'bg-zinc-800'}`}>
                    <Motion.div animate={{ x: sessionTracking ? 26 : 4 }} className="w-4 h-4 bg-white rounded-full absolute top-1 shadow-md" />
                  </button>
                </div>

                {sessionTracking && (
                  <Motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="space-y-2">
                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest ml-1">Select Active Session</label>
                    <div className="space-y-2 max-h-[160px] overflow-y-auto pr-2 custom-scrollbar">
                      {AGENDA_SESSIONS.map(s => (
                        <button key={s.id} onClick={() => setSelectedSession(s)}
                          className={`w-full text-left p-3 rounded-xl border text-xs font-black transition-all ${selectedSession?.id === s.id ? 'bg-primary border-primary text-white' : 'bg-white/5 border-white/5 text-zinc-600'}`}>
                          {s.title}
                        </button>
                      ))}
                    </div>
                  </Motion.div>
                )}

                {/* Cash Collection Gate toggle */}
                <div className="flex items-center justify-between pt-2">
                  <div className="flex items-center gap-2">
                    <span className="text-base leading-none">💵</span>
                    <span className="text-xs font-bold text-white">Cash Collection Gate</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDraftGate(d => ({ ...d, collectsCash: !d.collectsCash }))}
                    className={`w-12 h-6 rounded-full relative transition-all ${draftGate.collectsCash ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.4)]' : 'bg-zinc-800'}`}
                  >
                    <Motion.div animate={{ x: draftGate.collectsCash ? 26 : 4 }} className="w-4 h-4 bg-white rounded-full absolute top-1 shadow-md" />
                  </button>
                </div>

                {draftGate.collectsCash && (
                  <Motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="space-y-2">
                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest ml-1">Event for Walk-up Registration</label>
                    {setupEvents.length === 0 ? (
                      <p className="text-[11px] text-zinc-600 italic px-1">Loading events…</p>
                    ) : (
                      <select
                        value={draftGate.eventId || ''}
                        onChange={e => {
                          const ev = setupEvents.find(x => x.id === e.target.value);
                          setDraftGate(d => ({
                            ...d,
                            eventId: ev?.id || null,
                            eventName: ev?.name || ev?.title || null,
                            ticketTypes: Array.isArray(ev?.ticketTypes) ? ev.ticketTypes : [],
                          }));
                        }}
                        className="w-full bg-zinc-800 border border-white/10 rounded-xl px-3 py-2 text-white text-xs outline-none focus:border-emerald-500/50"
                      >
                        <option value="">— Select an event —</option>
                        {setupEvents.map(ev => (
                          <option key={ev.id} value={ev.id}>{ev.name || ev.title || ev.id}</option>
                        ))}
                      </select>
                    )}
                    <p className="text-[10px] text-zinc-600 px-1">Walk-up registrations will be created against this event.</p>
                  </Motion.div>
                )}
              </div>

              {/* Scan Mode Selection */}
              <div className="mb-8">
                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest block mb-3">Communication Mode</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'qr',     label: 'Camera',  sub: 'QR Code', icon: QrCode },
                    { id: 'nfc',    label: 'Tap',     sub: 'NFC/RFID', icon: Radio },
                    { id: 'hybrid', label: 'Hybrid',  sub: 'Dual Mode', icon: Zap },
                  ].map(m => (
                    <button key={m.id} 
                      onClick={() => setDraftGate(prev => ({ ...prev, scanMode: m.id }))}
                      className={`p-3 rounded-xl border flex flex-col items-center text-center transition-all ${
                        (draftGate.scanMode || 'hybrid') === m.id 
                          ? 'bg-primary/20 border-primary/50 text-white shadow-lg' 
                          : 'bg-white/5 border-white/10 text-zinc-500 hover:text-zinc-400'
                      }`}>
                      <m.icon className="w-5 h-5 mb-1" />
                      <p className="text-xs font-black uppercase leading-none mt-1">{m.label}</p>
                      <p className="text-[9px] opacity-60 font-bold mt-1 line-clamp-1">{m.sub}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-3">
                {gateConfig && (
                  <button onClick={() => setShowGateSetup(false)} className="flex-1 py-3 bg-white/5 border border-white/10 text-white font-bold rounded-xl hover:bg-white/10 transition-colors">
                    Keep Active
                  </button>
                )}
                <button
                  onClick={confirmGateSetup}
                  disabled={draftGate.preset === 'custom' && !draftGate.customName.trim()}
                  className="flex-1 py-3 bg-primary text-white font-bold rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {gateConfig ? 'Update Terminal' : 'Start Scanning'}
                </button>
              </div>

              {/* TV Display Sync Link (Only if configured) */}
              {gateConfig && (
                <div className="mt-8 pt-8 border-t border-white/5">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-8 h-8 bg-indigo-500/20 rounded-lg flex items-center justify-center">
                      <Monitor className="w-4 h-4 text-indigo-400" />
                    </div>
                    <h4 className="text-sm font-bold text-white">External TV Display</h4>
                  </div>
                  <div className="p-4 bg-white/5 border border-white/10 rounded-2xl">
                    <p className="text-zinc-500 text-[10px] uppercase font-black tracking-widest mb-3">Wireless TV Pairing</p>
                    
                    <div className="flex gap-2">
                        <input 
                          type="text" 
                          maxLength={4}
                          placeholder="Enter 4-Digit Code"
                          value={pairingCodeInput}
                          onChange={e => setPairingCodeInput(e.target.value.replace(/\D/g, ''))}
                          className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm font-black tracking-[0.5em] text-center text-white placeholder-zinc-700 focus:border-indigo-500 transition-colors" 
                        />
                        <button 
                          onClick={async () => {
                             if (pairingCodeInput.length !== 4) return;
                             setPairingStatus('pairing');
                             try {
                               await updateDoc(doc(db, 'tvPairings', pairingCodeInput), { gateId: gateConfig.gateId });
                               
                               // Also update the physical device document to show TV is connected
                               const localDeviceId = localStorage.getItem('deviceId');
                               if (localDeviceId) {
                                 await updateDoc(doc(db, 'devices', localDeviceId), { 
                                   tvConnected: true, 
                                   tvPairCode: pairingCodeInput,
                                   tvLastSeen: serverTimestamp()
                                 });
                               }

                               setPairingStatus('success');
                               setTimeout(() => { setPairingStatus('idle'); setPairingCodeInput(''); }, 3000);
                             } catch {
                               setPairingStatus('error');
                               setTimeout(() => setPairingStatus('idle'), 3000);
                             }
                          }}
                          disabled={pairingCodeInput.length !== 4 || pairingStatus === 'pairing'}
                          className={`px-5 rounded-xl font-bold text-xs transition-all flex items-center gap-2 ${
                            pairingStatus === 'success' ? 'bg-green-500 text-white' : 
                            pairingStatus === 'error'   ? 'bg-red-500 text-white' :
                            'bg-indigo-500 text-white hover:bg-indigo-600 disabled:opacity-30'
                          }`}>
                            {pairingStatus === 'pairing' ? <RefreshCw className="w-4 h-4 animate-spin" /> : 
                             pairingStatus === 'success' ? <CheckCircle2 className="w-4 h-4" /> : 
                             pairingStatus === 'error'   ? 'FAILED' : 'CONNECT'}
                        </button>
                    </div>

                    <p className="text-[9px] text-zinc-600 mt-3 font-medium uppercase tracking-tight">
                        {pairingStatus === 'success' ? 'TV Screen Linked Successfully!' : 'See the code on your Foyer Display (Welcome TV Page)'}
                    </p>
                  </div>
                </div>
              )}
            </Motion.div>
          </Motion.div>
        )}
      </AnimatePresence>

      {/* ─── Badge Print Overlay ─── */}
      <AnimatePresence>
        {badgePrintSession && (
          <Motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 bg-black/95 backdrop-blur-md flex flex-col items-center justify-center p-8">
            <Motion.div initial={{ scale: 0.85 }} animate={{ scale: 1 }} className="max-w-sm w-full text-center">
              <div className="w-24 h-24 bg-indigo-500/10 border border-indigo-500/30 rounded-full flex items-center justify-center mx-auto mb-6">
                <span className="text-4xl">🎫</span>
              </div>
              <h2 className="text-3xl font-black text-white mb-1">{getAttendeeName(badgePrintSession.attendee)}</h2>
              <p className="text-zinc-400 text-sm mb-6">{badgePrintSession.attendee.ticketName || 'General Delegate'}</p>
              <div className="p-4 bg-white/5 border border-white/10 rounded-2xl mb-6 text-left">
                <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-2">Badge Preview</p>
                <div className="bg-white rounded-xl p-4 text-black">
                  <p className="text-xs font-bold text-zinc-400 uppercase">{deviceSession?.event?.name || 'EventPro'}</p>
                  <p className="text-lg font-black mt-1">{getAttendeeName(badgePrintSession.attendee)}</p>
                  <p className="text-sm text-zinc-600">{badgePrintSession.attendee.company || ''}</p>
                  <div className="mt-3 flex items-center gap-2">
                    <span className="px-2 py-0.5 bg-primary/10 text-primary text-[10px] font-black rounded uppercase">{badgePrintSession.attendee.ticketName || 'Delegate'}</span>
                  </div>
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setBadgePrintSession(null)}
                  className="flex-1 py-4 bg-white/5 border border-white/10 text-white font-bold rounded-xl hover:bg-white/10 transition-colors">Cancel</button>
                <button onClick={async () => {
                  const attendee = badgePrintSession.attendee;
                  try {
                    await updateDoc(doc(db, 'attendees', attendee.id), {
                      badgePrinted: true,
                      badgePrintedAt: serverTimestamp(),
                      badgePrintedGate: gateConfig?.label || 'Badge Print Station',
                    });
                  } catch (e) {
                    console.warn('Badge print write failed:', e);
                  }
                  setBadgePrintSession(null);
                  setScanResult({ type: 'approved', attendee, reason: 'Badge Printed', detail: `${getAttendeeName(attendee)}'s badge has been printed.` });
                  setTimeout(() => setScanResult(null), 3000);
                }}
                  className="flex-1 py-4 bg-indigo-500 hover:bg-indigo-400 text-white font-black rounded-xl transition-colors">
                  ✓ Print Badge
                </button>
              </div>
            </Motion.div>
          </Motion.div>
        )}
      </AnimatePresence>

      {/* ─── Food Counter Overlay ─── */}
      <AnimatePresence>
        {foodCounterSession && (
          <Motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 bg-black/95 backdrop-blur-md flex flex-col">
            <div className="p-6 border-b border-white/5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <span className="text-3xl">🍕</span>
                  <div>
                    <p className="text-xs font-bold text-orange-400 uppercase tracking-widest">Food Counter</p>
                    <h2 className="text-2xl font-black text-white">{getAttendeeName(foodCounterSession.attendee)}</h2>
                  </div>
                </div>
                <div className="px-3 py-1 bg-orange-500/10 border border-orange-500/20 text-orange-400 text-sm font-bold rounded-full">
                  ⭐ {foodCounterSession.points} pts
                </div>
              </div>
              <p className="text-zinc-500 text-sm">Tap items to redeem. Points will be deducted immediately.</p>
            </div>
            <div className="flex-1 p-6 space-y-4 overflow-y-auto">
              {foodCounterSession.eligibleItems.map(item => {
                const isChecked = foodCounterSession.checkedItems.includes(item.id);
                const canAfford = foodCounterSession.points >= item.pointsCost;
                return (
                  <Motion.button key={item.id} whileTap={{ scale: 0.97 }}
                    onClick={() => canAfford && setFoodCounterSession(s => ({
                      ...s,
                      checkedItems: isChecked ? s.checkedItems.filter(id => id !== item.id) : [...s.checkedItems, item.id]
                    }))}
                    className={`w-full p-5 rounded-2xl border flex items-center gap-5 transition-all ${
                      isChecked ? 'bg-orange-500/10 border-orange-500/30' :
                      canAfford ? 'bg-white/5 border-white/10 hover:bg-white/8' : 'bg-white/[0.02] border-white/5 opacity-40'
                    }`}>
                    <span className="text-4xl">{item.emoji}</span>
                    <div className="flex-1 text-left">
                      <span className="text-xl font-bold text-white block">{item.name}</span>
                      <span className="text-sm text-orange-400 font-bold">{item.pointsCost} pts</span>
                    </div>
                    <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all ${
                      isChecked ? 'bg-orange-500 border-orange-500' : 'border-white/20'
                    }`}>
                      {isChecked && <CheckCircle2 className="w-5 h-5 text-white" strokeWidth={3} />}
                    </div>
                  </Motion.button>
                );
              })}
            </div>
            <div className="p-6 border-t border-white/5 flex gap-4">
              <button onClick={() => setFoodCounterSession(null)}
                className="flex-1 py-4 bg-white/5 border border-white/10 text-white font-bold rounded-xl hover:bg-white/10 transition-colors text-lg">Cancel</button>
              <button disabled={foodCounterSession.checkedItems.length === 0}
                onClick={async () => {
                  const { attendee, checkedItems, eligibleItems } = foodCounterSession;
                  const redeemed = eligibleItems.filter(i => checkedItems.includes(i.id));
                  const totalCost = redeemed.reduce((sum, i) => sum + i.pointsCost, 0);
                  const newPoints = (attendee.points || 0) - totalCost;
                  const redemptionEntries = redeemed.map(r => ({
                    rewardId: r.id,
                    name: r.name,
                    pointsCost: r.pointsCost,
                    redeemedAt: new Date().toISOString(),
                    gateId: gateConfig?.id,
                    gateLabel: gateConfig?.label,
                  }));
                  try {
                    await updateDoc(doc(db, 'attendees', attendee.id), {
                      points: newPoints,
                      redeemedRewards: arrayUnion(...redemptionEntries),
                    });
                    setAttendees(prev => prev.map(a => a.id === attendee.id
                      ? { ...a, points: newPoints, redeemedRewards: [...(a.redeemedRewards || []), ...redemptionEntries] }
                      : a
                    ));
                  } catch (e) { console.warn('Food counter write failed:', e); }
                  setFoodCounterSession(null);
                  setScanResult({ type: 'approved', attendee, reason: 'Redeemed!', detail: `${redeemed.length} item(s) for ${totalCost} pts. Balance: ${newPoints}` });
                  setTimeout(() => setScanResult(null), 3500);
                }}
                className="flex-1 py-4 bg-orange-500 hover:bg-orange-400 text-white font-black rounded-xl transition-colors text-lg disabled:opacity-40 disabled:cursor-not-allowed">
                ✓ Redeem ({foodCounterSession.checkedItems.length})
              </button>
            </div>
          </Motion.div>
        )}
      </AnimatePresence>

      {/* ─── Lead Exchange Overlay ─── */}
      <AnimatePresence>
        {leadExchangeSession && (
          <Motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 bg-black/95 backdrop-blur-md flex flex-col items-center justify-center p-8">
            <Motion.div initial={{ scale: 0.85 }} animate={{ scale: 1 }} className="max-w-sm w-full text-center">
              <div className="w-24 h-24 bg-cyan-500/10 border border-cyan-500/30 rounded-full flex items-center justify-center mx-auto mb-6">
                <span className="text-4xl">🤝</span>
              </div>
              <p className="text-xs font-bold text-cyan-400 uppercase tracking-widest mb-2">Lead Exchange</p>
              <h2 className="text-3xl font-black text-white mb-1">
                {leadExchangeSession.targetType === 'exhibitor' ? 'Exhibitor Scanned!' : 'Attendee Scanned!'}
              </h2>
              <p className="text-zinc-400 text-sm mb-6">
                {leadExchangeSession.targetType === 'exhibitor'
                  ? 'You scanned an exhibitor. Points awarded!'
                  : 'An exhibitor scanned you. Both earn points!'}
              </p>
              <div className="p-4 bg-white/5 border border-white/10 rounded-2xl mb-6 text-left">
                <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-2">Contact</p>
                <p className="text-white font-bold text-lg">{getAttendeeName(leadExchangeSession.person)}</p>
                <p className="text-zinc-400 text-sm">{leadExchangeSession.person.company || leadExchangeSession.person.role || ''}</p>
                <p className="text-cyan-400 text-sm font-bold mt-2">⭐ +{leadExchangeSession.targetType === 'exhibitor' ? '10' : '25'} pts</p>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setLeadExchangeSession(null)}
                  className="flex-1 py-4 bg-white/5 border border-white/10 text-white font-bold rounded-xl hover:bg-white/10 transition-colors">Dismiss</button>
                <button onClick={async () => {
                  const { person, targetType } = leadExchangeSession;
                  const isExhibitor = targetType === 'attendee'; // person IS the exhibitor
                  const points = isExhibitor ? 5 : 10;
                  try {
                    // Write lead to exhibitorLeads
                    await addDoc(collection(db, 'exhibitorLeads'), {
                      exhibitorId: isExhibitor ? person.id : 'unknown',
                      exhibitorName: isExhibitor ? person.name : '',
                      name: isExhibitor ? 'Attendee' : person.name,
                      company: person.company || '',
                      role: person.role || '',
                      email: person.email || '',
                      mutualScan: true,
                      pointsToAttendee: points,
                      pointsToExhibitor: isExhibitor ? 5 : 0,
                      createdAt: serverTimestamp(),
                    });
                    // Award points to attendee
                    if (!isExhibitor) {
                      await updateDoc(doc(db, 'attendees', person.id), {
                        points: (person.points || 0) + points,
                        exhibitorScans: arrayUnion({
                          exhibitorId: 'booth-scanned',
                          boothNumber: gateConfig?.label || 'Lead Exchange',
                          timestamp: new Date().toISOString(),
                          pointsEarned: points,
                        }),
                      });
                      setAttendees(prev => prev.map(a => a.id === person.id
                        ? { ...a, points: (a.points || 0) + points }
                        : a
                      ));
                    }
                  } catch (e) { console.warn('Lead exchange write failed:', e); }
                  setLeadExchangeSession(null);
                  setScanResult({ type: 'approved', attendee: person, reason: 'Points Earned!', detail: `+${points} pts for lead exchange.` });
                  setTimeout(() => setScanResult(null), 3000);
                }}
                  className="flex-1 py-4 bg-cyan-500 hover:bg-cyan-400 text-white font-black rounded-xl transition-colors">
                  ✓ Confirm & Award
                </button>
              </div>
            </Motion.div>
          </Motion.div>
        )}
      </AnimatePresence>

      {/* ─── Giveaway Session Overlay ─── */}
      <AnimatePresence>
        {giveawaySession && (
          <Motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 bg-black/95 backdrop-blur-md flex flex-col"
          >
            {/* Header */}
            <div className="p-6 border-b border-white/5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <span className="text-3xl">🎁</span>
                  <div>
                    <p className="text-xs font-bold text-amber-400 uppercase tracking-widest">Giveaway Station</p>
                    <h2 className="text-2xl font-black text-white">{getAttendeeName(giveawaySession.attendee)}</h2>
                  </div>
                </div>
                <span className="px-3 py-1 bg-primary/10 border border-primary/20 text-primary text-sm font-bold rounded-full">
                  {giveawaySession.attendee.ticketName || 'General Delegate'}
                </span>
              </div>
              <p className="text-zinc-500 text-sm">Tap each item to confirm it was handed to the attendee, then press Confirm.</p>
            </div>

            {/* Items checklist */}
            <div className="flex-1 p-6 space-y-4 overflow-y-auto">
              {giveawaySession.eligibleItems.map(item => {
                const isChecked = giveawaySession.checkedItems.includes(item.id);
                return (
                  <Motion.button
                    key={item.id}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => setGiveawaySession(s => ({
                      ...s,
                      checkedItems: isChecked
                        ? s.checkedItems.filter(id => id !== item.id)
                        : [...s.checkedItems, item.id]
                    }))}
                    className={`w-full p-5 rounded-2xl border flex items-center gap-5 transition-all ${
                      isChecked
                        ? 'bg-green-500/10 border-green-500/30'
                        : 'bg-white/5 border-white/10 hover:bg-white/8'
                    }`}
                  >
                    <span className="text-4xl">{item.emoji}</span>
                    <span className="text-xl font-bold text-white flex-1 text-left">{item.name}</span>
                    <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all ${
                      isChecked ? 'bg-green-500 border-green-500' : 'border-white/20'
                    }`}>
                      {isChecked && <CheckCircle2 className="w-5 h-5 text-white" strokeWidth={3} />}
                    </div>
                  </Motion.button>
                );
              })}
            </div>

            {/* Actions */}
            <div className="p-6 border-t border-white/5 flex gap-4">
              <button
                onClick={() => setGiveawaySession(null)}
                className="flex-1 py-4 bg-white/5 border border-white/10 text-white font-bold rounded-xl hover:bg-white/10 transition-colors text-lg"
              >
                Cancel
              </button>
              <button
                disabled={giveawaySession.checkedItems.length === 0}
                onClick={async () => {
                  const { attendee, checkedItems } = giveawaySession;
                  try {
                    await updateDoc(doc(db, 'attendees', attendee.id), {
                      claimedGiveaways: arrayUnion(...checkedItems),
                    });
                  } catch (e) {
                    console.warn('Giveaway write failed:', e);
                    setAttendees(prev => prev.map(a => a.id === attendee.id
                      ? { ...a, claimedGiveaways: [...(a.claimedGiveaways || []), ...checkedItems] }
                      : a
                    ));
                  }
                  setGiveawaySession(null);
                  setScanResult({ type: 'approved', attendee, reason: 'Items Handed!', detail: `${checkedItems.length} item(s) confirmed and logged.` });
                  setTimeout(() => setScanResult(null), 3000);
                }}
                className="flex-1 py-4 bg-green-600 hover:bg-green-500 text-white font-black rounded-xl transition-colors text-lg disabled:opacity-40 disabled:cursor-not-allowed"
              >
                ✓ Confirm ({giveawaySession.checkedItems.length}/{giveawaySession.eligibleItems.length})
              </button>
            </div>
          </Motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// ─── Walk-up Registration Modal (cash gate) ──────────────────────────────────
const WalkupModal = ({ gateConfig, onClose, onCreated }) => {
  const session = (() => { try { return JSON.parse(localStorage.getItem('eventpro_device_session') || 'null'); } catch { return null; } })();
  const eventId = gateConfig?.eventId || session?.event?.id;
  const eventName = gateConfig?.eventName || session?.event?.name;
  const ticketTypes = Array.isArray(gateConfig?.ticketTypes) ? gateConfig.ticketTypes : [];
  const paidTickets = ticketTypes.filter(t => {
    const p = t.price;
    if (typeof p === 'number') return p > 0;
    if (typeof p === 'string') {
      const s = p.trim().toLowerCase();
      if (!s || s === 'free' || s === 'complimentary') return false;
      const n = parseFloat(s.replace(/[^0-9.]/g, ''));
      return !isNaN(n) && n > 0;
    }
    return false;
  });

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [company, setCompany] = useState('');
  const [ticketIdx, setTicketIdx] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const selectedTicket = paidTickets[ticketIdx];

  const submit = async () => {
    setError(null);
    if (!eventId) { setError('No event linked to this gate. Re-run gate setup.'); return; }
    if (!name.trim()) { setError('Name is required.'); return; }
    if (!email.trim() && !phone.trim()) { setError('Provide an email or phone.'); return; }
    if (!selectedTicket) { setError('Pick a ticket type.'); return; }

    setSubmitting(true);
    const confirmId = generateConfirmId('WK');
    const [firstName, ...rest] = name.trim().split(/\s+/);
    const lastName = rest.join(' ') || '';
    try {
      const ref = await addDoc(collection(db, 'attendees'), {
        eventId,
        ticketId: selectedTicket.id != null ? String(selectedTicket.id) : 'walkup',
        ticketName: selectedTicket.name || 'Walk-up Pass',
        ticketPrice: selectedTicket.price || '',
        firstName,
        lastName,
        email: email.trim(),
        phone: phone.trim(),
        company: company.trim(),
        guests: [],
        agendas: [],
        confirmationId: confirmId,
        status: 'checked-in',
        scanned: true,
        paymentMethod: 'cash',
        paymentStatus: 'paid',
        walkUp: true,
        paidAt: serverTimestamp(),
        paidGateId: gateConfig?.id || null,
        checkpoints: [{ gateId: gateConfig?.id || 'cash-gate', gateLabel: gateConfig?.label || 'Cash Gate', time: new Date().toISOString() }],
        createdAt: serverTimestamp(),
      });
      onCreated({ id: ref.id, firstName, lastName, ticketName: selectedTicket.name, ticketPrice: selectedTicket.price, email: email.trim() });
    } catch (e) {
      console.error('Walk-up create failed:', e);
      setError(e.message || 'Could not save the registration.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="absolute inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-6"
    >
      <Motion.div
        initial={{ y: '100%', opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: '100%', opacity: 0 }}
        className="relative w-full lg:max-w-md bg-zinc-900 border border-white/10 rounded-2xl p-6 md:p-8 shadow-2xl overflow-y-auto max-h-[95vh]"
      >
        <div className="flex items-center gap-4 mb-6">
          <div className="w-12 h-12 bg-emerald-500/10 rounded-xl border border-emerald-500/20 flex items-center justify-center">
            <UserPlus className="w-6 h-6 text-emerald-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Walk-up Registration</h2>
            <p className="text-zinc-500 text-xs">{eventName || 'No event linked'}</p>
          </div>
        </div>

        {paidTickets.length === 0 ? (
          <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-300 text-sm">
            This event has no paid ticket types configured. Add tickets in the admin Ticketing tab first.
          </div>
        ) : (
          <div className="space-y-3">
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Full name *"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-emerald-500/50" />
            <div className="grid grid-cols-2 gap-3">
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm outline-none focus:border-emerald-500/50" />
              <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="Phone"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm outline-none focus:border-emerald-500/50" />
            </div>
            <input value={company} onChange={e => setCompany(e.target.value)} placeholder="Organization (optional)"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-emerald-500/50" />

            <div>
              <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest block mb-2">Ticket</label>
              <div className="space-y-2 max-h-[180px] overflow-y-auto pr-1 custom-scrollbar">
                {paidTickets.map((t, i) => (
                  <button
                    key={t.id || i}
                    type="button"
                    onClick={() => setTicketIdx(i)}
                    className={`w-full text-left p-3 rounded-xl border transition-all flex items-center justify-between ${
                      ticketIdx === i ? 'bg-emerald-500/10 border-emerald-500/40' : 'bg-white/5 border-white/10 hover:border-white/20'
                    }`}
                  >
                    <div>
                      <p className="text-sm font-bold text-white">{t.name}</p>
                      {t.description && <p className="text-[11px] text-zinc-500">{t.description}</p>}
                    </div>
                    <span className="text-base font-black text-white">{t.price}</span>
                  </button>
                ))}
              </div>
            </div>

            {error && (
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-300 text-sm">{error}</div>
            )}

            <div className="flex gap-3 pt-2">
              <button onClick={onClose} disabled={submitting}
                className="flex-1 py-3 bg-white/5 border border-white/10 text-white font-bold rounded-xl hover:bg-white/10 transition-colors disabled:opacity-50">
                Cancel
              </button>
              <button onClick={submit} disabled={submitting}
                className="flex-1 py-3 bg-emerald-500 hover:bg-emerald-400 text-white font-black uppercase tracking-widest rounded-xl transition-colors disabled:opacity-60">
                {submitting ? 'Saving…' : 'Collect & Admit'}
              </button>
            </div>
          </div>
        )}
      </Motion.div>
    </Motion.div>
  );
};

export default ScannerMode;

