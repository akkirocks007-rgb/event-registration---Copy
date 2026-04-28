import React, { useState, useEffect, useRef } from 'react';
import { AnimatePresence, motion as Motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { db, auth, signInWithEmailAndPassword } from '../firebase';
import {
  collection, query, where, getDocs, doc, getDoc, addDoc, serverTimestamp
} from 'firebase/firestore';
import {
  QrCode, Wifi, WifiOff, ShieldCheck, AlertCircle, User, Phone, Briefcase,
  ChevronRight, Camera, RefreshCw, CheckCircle2, X, ArrowLeft, Calendar,
  MapPin, LogOut, Clock
} from 'lucide-react';

const GATE_PRESETS = [
  { id: 'main-entrance', label: 'Main Entrance',     icon: '🚪', scanMode: 'hybrid' },
  { id: 'hall-a',        label: 'Hall A',             icon: '🏛️', scanMode: 'hybrid' },
  { id: 'hall-b',        label: 'Hall B',             icon: '🏛️', scanMode: 'hybrid' },
  { id: 'vip-lounge',   label: 'VIP Lounge',          icon: '💎', scanMode: 'hybrid' },
  { id: 'workshop-1',   label: 'Workshop Room 1',     icon: '📚', scanMode: 'qr' },
  { id: 'workshop-2',   label: 'Workshop Room 2',     icon: '📚', scanMode: 'qr' },
  { id: 'exhibition',   label: 'Exhibition Floor',    icon: '🎪', scanMode: 'qr' },
  { id: 'giveaway',     label: 'Giveaway Station',    icon: '🎁', scanMode: 'qr' },
];

const DeviceLogin = () => {
  const navigate = useNavigate();

  // ─── Step System ───────────────────────────────────────────────────────────
  // 'supervisor-auth' → 'event-select' → 'gate-select' → 'volunteer-details' → 'volunteer-photo' → 'done'
  const [step, setStep] = useState('supervisor-auth');
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  // Step 1: Supervisor Auth
  const [supervisorEmail, setSupervisorEmail] = useState('');
  const [supervisorPassword, setSupervisorPassword] = useState('');
  const [authStatus, setAuthStatus] = useState('idle'); // idle | loading | error
  const [supervisor, setSupervisor] = useState(null);
  const [authError, setAuthError] = useState(null);

  // Step 2: Event Select
  const [events, setEvents] = useState([]);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [loadingEvents, setLoadingEvents] = useState(false);

  // Step 3: Gate Select
  const [selectedGate, setSelectedGate] = useState(null);

  // Step 4: Volunteer Details
  const [volunteer, setVolunteer] = useState({ name: '', email: '', phone: '' });
  const [volunteerErrors, setVolunteerErrors] = useState({});

  // Step 5: Photo
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const [photo, setPhoto] = useState(null);
  const [cameraError, setCameraError] = useState('');
  const [cameraReady, setCameraReady] = useState(false);

  // Misc
  const [saving, setSaving] = useState(false);

  // Online/offline
  useEffect(() => {
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  // ─── Camera helpers ────────────────────────────────────────────────────────
  const startCamera = async () => {
    setCameraError(''); setCameraReady(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 640, height: 480 } });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => { videoRef.current.play(); };
        // Give a short delay before showing ready state
        setTimeout(() => setCameraReady(true), 300);
      }
    } catch { setCameraError('Camera access denied or not available.'); }
  };
  const stopCamera = () => { streamRef.current?.getTracks().forEach(t => t.stop()); streamRef.current = null; };

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (step === 'volunteer-photo') { startCamera(); }
    return () => stopCamera();
  }, [step]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const capturePhoto = () => {
    const video = videoRef.current, canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    ctx.translate(canvas.width, 0); ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    setPhoto(canvas.toDataURL('image/jpeg', 0.75));
    stopCamera();
  };
  const retakePhoto = () => { setPhoto(null); startCamera(); };

  // ─── Step 1: Supervisor Auth ───────────────────────────────────────────────
  const handleSupervisorAuth = async () => {
    if (!supervisorEmail.trim() || !supervisorPassword.trim()) return;
    setAuthStatus('loading'); setAuthError(null);

    try {
      let userData = null;

      // 1. Try users collection (admins, organizers, supervisors, owners)
      const userQ = query(collection(db, 'users'), where('email', '==', supervisorEmail.trim()));
      const userSnap = await getDocs(userQ);
      if (!userSnap.empty) {
        const docRef = userSnap.docs[0];
        const data = docRef.data();
        if (data.password === supervisorPassword) {
          userData = { id: docRef.id, ...data };
        }
      }

      // 2. Try Firebase Auth
      if (!userData) {
        try {
          const cred = await signInWithEmailAndPassword(auth, supervisorEmail.trim(), supervisorPassword);
          const fbUser = cred.user;
          const userDoc = await getDoc(doc(db, 'users', fbUser.uid));
          if (userDoc.exists()) {
            userData = { id: fbUser.uid, ...userDoc.data() };
          } else {
            userData = { id: fbUser.uid, email: fbUser.email, name: fbUser.displayName || fbUser.email, role: 'supervisor' };
          }
        } catch {
          console.log('Firebase auth failed, trying local only');
        }
      }

      // 3. Try superusers registry
      if (!userData) {
        const superDoc = await getDoc(doc(db, '_config', 'mainframe', 'superusers', supervisorEmail.trim()));
        if (superDoc.exists() && superDoc.data().password === supervisorPassword) {
          userData = { id: supervisorEmail, ...superDoc.data(), role: 'superuser' };
        }
      }

      if (!userData) {
        setAuthStatus('error');
        setAuthError('Invalid email or password.');
        return;
      }

      setSupervisor(userData);
      setAuthStatus('idle');
      setStep('event-select');
      fetchEvents(userData);
    } catch (err) {
      console.error('Auth error:', err);
      setAuthStatus('error');
      setAuthError('Authentication failed. Please try again.');
    }
  };

  // ─── Step 2: Fetch Events ──────────────────────────────────────────────────
  const fetchEvents = async (user) => {
    setLoadingEvents(true);
    try {
      let q;
      const role = user.role;
      if (role === 'admin') {
        q = query(collection(db, 'events'), where('adminIds', 'array-contains', user.id));
      } else if (role === 'organizer' || role === 'organiser') {
        q = query(collection(db, 'events'), where('organizerId', '==', user.id));
      } else if (role === 'owner') {
        q = query(collection(db, 'events'), where('ownerId', '==', user.id));
      } else if (role === 'reseller') {
        q = query(collection(db, 'events'), where('resellerId', '==', user.id));
      } else if (role === 'supervisor' && user.assignedEventIds?.length > 0) {
        // For supervisors with explicit event assignments
        const chunks = [];
        for (let i = 0; i < user.assignedEventIds.length; i += 10) {
          chunks.push(user.assignedEventIds.slice(i, i + 10));
        }
        const allEvents = [];
        for (const chunk of chunks) {
          const evQ = query(collection(db, 'events'), where('__name__', 'in', chunk));
          const snap = await getDocs(evQ);
          allEvents.push(...snap.docs.map(d => ({ id: d.id, ...d.data() })));
        }
        setEvents(allEvents);
        setLoadingEvents(false);
        return;
      } else {
        // Superuser or fallback: get all events
        q = query(collection(db, 'events'));
      }

      const snap = await getDocs(q);
      setEvents(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error('Failed to fetch events:', e);
      setEvents([]);
    }
    setLoadingEvents(false);
  };

  // ─── Step 3: Gate Select helpers ───────────────────────────────────────────
  const handleEventSelect = (event) => {
    setSelectedEvent(event);
    setStep('gate-select');
  };

  const handleGateSelect = (gate) => {
    setSelectedGate(gate);
    setStep('volunteer-details');
  };

  // ─── Step 4: Validate Volunteer ────────────────────────────────────────────
  const handleVolunteerNext = () => {
    const errors = {};
    if (!volunteer.name.trim()) errors.name = 'Full name is required';
    if (volunteer.phone && !/^\+?[\d\s\-()]{7,20}$/.test(volunteer.phone)) errors.phone = 'Enter a valid phone number';
    if (Object.keys(errors).length > 0) { setVolunteerErrors(errors); return; }
    setStep('volunteer-photo');
  };

  // ─── Step 5: Save Session + Launch ─────────────────────────────────────────
  const handleFinish = async (skipPhoto = false) => {
    setSaving(true);
    const now = new Date().toISOString();

    const volunteerPayload = {
      name: volunteer.name.trim(),
      email: volunteer.email.trim(),
      phone: volunteer.phone.trim(),
      photo: skipPhoto ? null : (photo || null),
      shiftStart: now,
    };

    // Save volunteer session to Firestore
    let sessionId = null;
    try {
      const docRef = await addDoc(collection(db, 'volunteerSessions'), {
        supervisorId: supervisor.id,
        supervisorName: supervisor.name || supervisor.email,
        supervisorEmail: supervisor.email,
        eventId: selectedEvent.id,
        eventName: selectedEvent.name,
        gateId: selectedGate.id,
        gateLabel: selectedGate.label,
        ...volunteerPayload,
        status: 'active',
        createdAt: serverTimestamp(),
      });
      sessionId = docRef.id;
    } catch (e) {
      console.warn('Failed to save volunteer session to Firestore:', e);
      sessionId = `local-${Date.now()}`;
    }

    // Save to localStorage for ScannerMode to read
    const session = {
      supervisor: { id: supervisor.id, name: supervisor.name || supervisor.email, email: supervisor.email, role: supervisor.role },
      event: { id: selectedEvent.id, name: selectedEvent.name },
      gate: { id: selectedGate.id, label: selectedGate.label, icon: selectedGate.icon, scanMode: selectedGate.scanMode },
      volunteer: volunteerPayload,
      volunteerSessionId: sessionId,
      loginTime: now,
    };
    localStorage.setItem('eventpro_device_session', JSON.stringify(session));
    localStorage.setItem('eventpro_gate_config', JSON.stringify(selectedGate));

    setSaving(false);
    setStep('done');
    setTimeout(() => navigate('/scanner'), 2000);
  };

  // ─── Logout / Reset ────────────────────────────────────────────────────────
  const handleReset = () => {
    setStep('supervisor-auth');
    setSupervisor(null); setSelectedEvent(null); setSelectedGate(null);
    setVolunteer({ name: '', email: '', phone: '' }); setPhoto(null);
    setSupervisorEmail(''); setSupervisorPassword(''); setAuthError(null);
  };

  // ─── Render helpers ────────────────────────────────────────────────────────
  const STEPS = ['supervisor-auth', 'event-select', 'gate-select', 'volunteer-details', 'volunteer-photo'];
  const stepIdx = STEPS.indexOf(step);

  return (
    <div className="fixed inset-0 bg-black flex flex-col items-center justify-center overflow-hidden">
      <div className="absolute inset-0 bg-mesh opacity-20 pointer-events-none" />

      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-6 py-4 z-10">
        <div className="flex items-center gap-3">
          {step !== 'supervisor-auth' && step !== 'done' && (
            <button onClick={() => {
              if (step === 'event-select') handleReset();
              else if (step === 'gate-select') setStep('event-select');
              else if (step === 'volunteer-details') setStep('gate-select');
              else if (step === 'volunteer-photo') { stopCamera(); setPhoto(null); setStep('volunteer-details'); }
            }} className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-zinc-400 hover:text-white">
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-primary rounded-lg flex items-center justify-center">
              <span className="text-white font-black text-sm">E</span>
            </div>
            <span className="text-white font-bold text-sm">EventPro Scanner</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {isOnline
            ? <><Wifi className="w-4 h-4 text-green-400" /><span className="text-green-400 text-xs font-bold">Live</span></>
            : <><WifiOff className="w-4 h-4 text-red-400" /><span className="text-red-400 text-xs font-bold">Offline</span></>}
        </div>
      </div>

      {/* Step progress */}
      {stepIdx >= 0 && step !== 'done' && (
        <div className="absolute top-16 flex gap-2 pt-2">
          {STEPS.map((s, i) => (
            <div key={s} className={`h-1 w-8 rounded-full transition-all duration-300 ${i <= stepIdx ? 'bg-primary' : 'bg-white/10'}`} />
          ))}
        </div>
      )}

      {/* ─── Screens ─── */}
      <AnimatePresence mode="wait">

        {/* DONE */}
        {step === 'done' && (
          <Motion.div key="done" initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
            className="flex flex-col items-center text-center px-8 max-w-sm w-full">
            <Motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 200, damping: 15 }}
              className="w-24 h-24 bg-green-500/10 border border-green-500/30 rounded-full flex items-center justify-center mb-6">
              <ShieldCheck className="w-12 h-12 text-green-400" strokeWidth={1.5} />
            </Motion.div>
            <p className="text-xs font-bold text-green-400 uppercase tracking-widest mb-2">Session Active</p>
            <h2 className="text-3xl font-black text-white mb-1">{selectedEvent?.name}</h2>
            <p className="text-zinc-300 text-lg font-semibold mb-2">{selectedGate?.icon} {selectedGate?.label}</p>
            <div className="w-full p-4 bg-white/5 border border-white/10 rounded-2xl mb-3 flex items-center gap-4 text-left">
              {photo && <img src={photo} alt="volunteer" className="w-12 h-12 rounded-xl object-cover flex-shrink-0 border border-white/10" />}
              <div>
                <p className="text-white font-bold">{volunteer.name}</p>
                <p className="text-zinc-400 text-sm">Volunteer</p>
                {volunteer.phone && <p className="text-zinc-500 text-xs mt-0.5">📞 {volunteer.phone}</p>}
              </div>
            </div>
            <div className="w-full p-3 bg-primary/5 border border-primary/10 rounded-xl mb-4 text-left">
              <p className="text-[10px] font-bold text-primary uppercase tracking-widest mb-1">Supervisor</p>
              <p className="text-white text-sm font-semibold">{supervisor?.name || supervisor?.email}</p>
            </div>
            <p className="text-zinc-600 text-sm mt-4">Launching scanner…</p>
          </Motion.div>
        )}

        {/* STEP 1: SUPERVISOR AUTH */}
        {step === 'supervisor-auth' && (
          <Motion.div key="auth" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -40 }}
            className="flex flex-col items-center w-full max-w-sm px-6">
            <div className="w-16 h-16 bg-primary/10 border border-primary/20 rounded-2xl flex items-center justify-center mb-6">
              <ShieldCheck className="w-8 h-8 text-primary" />
            </div>
            <h1 className="text-2xl font-black text-white mb-1">Supervisor Sign In</h1>
            <p className="text-zinc-500 text-sm mb-8 text-center">Log in to assign volunteers and manage gate scanning.</p>

            {authError && (
              <div className="w-full p-3 bg-red-500/10 border border-red-500/20 rounded-xl mb-4 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                <p className="text-xs text-red-400 font-medium">{authError}</p>
              </div>
            )}

            <div className="w-full space-y-3">
              <div className="relative">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <input type="email" value={supervisorEmail} onChange={e => setSupervisorEmail(e.target.value)}
                  placeholder="supervisor@eventpro.com" autoFocus
                  className="w-full pl-10 pr-4 py-3.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder-zinc-600 outline-none focus:border-primary/50 transition-colors" />
              </div>
              <div className="relative">
                <ShieldCheck className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <input type="password" value={supervisorPassword} onChange={e => setSupervisorPassword(e.target.value)}
                  placeholder="Password"
                  onKeyDown={e => e.key === 'Enter' && handleSupervisorAuth()}
                  className="w-full pl-10 pr-4 py-3.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder-zinc-600 outline-none focus:border-primary/50 transition-colors" />
              </div>
            </div>

            <Motion.button whileTap={{ scale: 0.97 }} onClick={handleSupervisorAuth} disabled={authStatus === 'loading'}
              className="w-full mt-5 py-4 bg-primary text-white font-black rounded-xl hover:bg-primary/90 transition-colors flex items-center justify-center gap-2 disabled:opacity-50">
              {authStatus === 'loading' ? (
                <Motion.div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full"
                  animate={{ rotate: 360 }} transition={{ duration: 0.6, repeat: Infinity, ease: 'linear' }} />
              ) : (
                <>Sign In <ChevronRight className="w-5 h-5" /></>
              )}
            </Motion.button>

            <div className="mt-6 text-center">
              <p className="text-zinc-600 text-xs">Demo credentials</p>
              <p className="text-zinc-500 text-[10px] mt-1">admin1.123@eventpro.demo / ADM-123456</p>
            </div>
          </Motion.div>
        )}

        {/* STEP 2: EVENT SELECT */}
        {step === 'event-select' && (
          <Motion.div key="events" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }}
            className="w-full max-w-sm px-6">
            <h2 className="text-2xl font-black text-white mb-1">Select Event</h2>
            <p className="text-zinc-500 text-sm mb-6">Choose the active event for this scanning session.</p>

            {loadingEvents ? (
              <div className="flex items-center justify-center py-12">
                <Motion.div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full"
                  animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }} />
              </div>
            ) : events.length === 0 ? (
              <div className="text-center py-12 text-zinc-500">
                <Calendar className="w-10 h-10 mx-auto mb-3 text-zinc-600" />
                <p className="text-sm">No events found for your account.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {events.map(ev => (
                  <Motion.button key={ev.id} whileTap={{ scale: 0.98 }} onClick={() => handleEventSelect(ev)}
                    className={`w-full p-4 rounded-2xl border text-left transition-all ${
                      selectedEvent?.id === ev.id
                        ? 'bg-primary/10 border-primary/30'
                        : 'bg-white/5 border-white/10 hover:bg-white/[0.07]'
                    }`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-white font-bold">{ev.name}</p>
                        <p className="text-zinc-500 text-xs mt-0.5">{ev.date} · {ev.location}</p>
                      </div>
                      <ChevronRight className="w-5 h-5 text-zinc-500" />
                    </div>
                  </Motion.button>
                ))}
              </div>
            )}
          </Motion.div>
        )}

        {/* STEP 3: GATE SELECT */}
        {step === 'gate-select' && (
          <Motion.div key="gates" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }}
            className="w-full max-w-sm px-6">
            <h2 className="text-2xl font-black text-white mb-1">Select Gate</h2>
            <p className="text-zinc-500 text-sm mb-6">Which entry point is this device at?</p>
            <div className="grid grid-cols-2 gap-3">
              {GATE_PRESETS.map(gate => (
                <Motion.button key={gate.id} whileTap={{ scale: 0.95 }} onClick={() => handleGateSelect(gate)}
                  className={`p-4 rounded-2xl border text-center transition-all ${
                    selectedGate?.id === gate.id
                      ? 'bg-primary/10 border-primary/30'
                      : 'bg-white/5 border-white/10 hover:bg-white/[0.07]'
                  }`}>
                  <span className="text-2xl mb-2 block">{gate.icon}</span>
                  <p className="text-white text-sm font-bold">{gate.label}</p>
                  <p className="text-zinc-500 text-[10px] uppercase tracking-wider mt-1">{gate.scanMode}</p>
                </Motion.button>
              ))}
            </div>
          </Motion.div>
        )}

        {/* STEP 4: VOLUNTEER DETAILS */}
        {step === 'volunteer-details' && (
          <Motion.div key="volunteer" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }}
            className="w-full max-w-sm px-6">
            <div className="flex items-center gap-3 p-3 bg-white/5 border border-white/10 rounded-xl mb-5">
              <span className="text-xl">{selectedGate?.icon}</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-primary uppercase tracking-widest">{selectedEvent?.name}</p>
                <p className="text-white font-bold truncate text-sm">{selectedGate?.label}</p>
              </div>
            </div>

            <h2 className="text-2xl font-black text-white mb-1">Assign Volunteer</h2>
            <p className="text-zinc-500 text-sm mb-5">This volunteer will be accountable for all scans during their shift.</p>

            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block mb-1">Full Name <span className="text-red-400">*</span></label>
                <div className="relative">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                  <input type="text" value={volunteer.name} autoFocus
                    onChange={e => { setVolunteer(v => ({ ...v, name: e.target.value })); setVolunteerErrors(er => ({ ...er, name: '' })); }}
                    placeholder="Amit Kumar"
                    className={`w-full pl-10 pr-4 py-3.5 bg-white/5 border rounded-xl text-white placeholder-zinc-600 outline-none transition-colors ${volunteerErrors.name ? 'border-red-500/50' : 'border-white/10 focus:border-primary/50'}`} />
                </div>
                {volunteerErrors.name && <p className="text-red-400 text-xs mt-1">{volunteerErrors.name}</p>}
              </div>
              <div>
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block mb-1">Email <span className="text-zinc-600">(optional)</span></label>
                <div className="relative">
                  <Briefcase className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                  <input type="email" value={volunteer.email}
                    onChange={e => setVolunteer(v => ({ ...v, email: e.target.value }))}
                    placeholder="amit@volunteer.in"
                    className="w-full pl-10 pr-4 py-3.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder-zinc-600 outline-none focus:border-primary/50 transition-colors" />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block mb-1">Phone <span className="text-zinc-600">(optional)</span></label>
                <div className="relative">
                  <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                  <input type="tel" value={volunteer.phone}
                    onChange={e => { setVolunteer(v => ({ ...v, phone: e.target.value })); setVolunteerErrors(er => ({ ...er, phone: '' })); }}
                    placeholder="+91 98765 43210"
                    className={`w-full pl-10 pr-4 py-3.5 bg-white/5 border rounded-xl text-white placeholder-zinc-600 outline-none transition-colors ${volunteerErrors.phone ? 'border-red-500/50' : 'border-white/10 focus:border-primary/50'}`} />
                </div>
                {volunteerErrors.phone && <p className="text-red-400 text-xs mt-1">{volunteerErrors.phone}</p>}
              </div>
            </div>

            <Motion.button whileTap={{ scale: 0.97 }} onClick={handleVolunteerNext}
              className="w-full mt-5 py-4 bg-primary text-white font-black rounded-xl hover:bg-primary/90 transition-colors flex items-center justify-center gap-2">
              Next: Take Photo <ChevronRight className="w-5 h-5" />
            </Motion.button>
          </Motion.div>
        )}

        {/* STEP 5: VOLUNTEER PHOTO */}
        {step === 'volunteer-photo' && (
          <Motion.div key="photo" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}
            className="w-full max-w-sm px-6 flex flex-col items-center">
            <div className="w-14 h-14 bg-primary/10 border border-primary/20 rounded-2xl flex items-center justify-center mb-4">
              <Camera className="w-7 h-7 text-primary" />
            </div>
            <h2 className="text-2xl font-black text-white mb-1">Volunteer Photo</h2>
            <p className="text-zinc-500 text-sm mb-5 text-center">A custody photo for accountability.<br/>{volunteer.name} should be clearly visible.</p>

            <div className="w-full aspect-square rounded-2xl overflow-hidden border border-white/10 bg-zinc-900 relative mb-4">
              {photo ? (
                <img src={photo} alt="volunteer" className="w-full h-full object-cover" />
              ) : cameraError ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
                  <AlertCircle className="w-10 h-10 text-red-400 mb-3" />
                  <p className="text-red-400 text-sm font-medium">{cameraError}</p>
                  <button onClick={startCamera} className="mt-3 text-xs text-primary hover:text-primary/80">Retry</button>
                </div>
              ) : (
                <>
                  <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover scale-x-[-1]" />
                  {!cameraReady && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                      <Motion.div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full"
                        animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }} />
                    </div>
                  )}
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-40 h-40 rounded-full border-2 border-white/20 border-dashed" />
                  </div>
                </>
              )}
              <canvas ref={canvasRef} className="hidden" />
            </div>

            {!photo ? (
              <Motion.button whileTap={{ scale: 0.93 }} onClick={capturePhoto} disabled={!cameraReady || !!cameraError}
                className="w-full py-4 bg-primary text-white font-black rounded-2xl hover:bg-primary/90 transition-colors flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed text-lg">
                <Camera className="w-6 h-6" /> Capture
              </Motion.button>
            ) : (
              <div className="flex gap-3 w-full">
                <Motion.button whileTap={{ scale: 0.93 }} onClick={retakePhoto}
                  className="flex-1 py-3.5 bg-white/5 border border-white/10 text-white font-bold rounded-2xl hover:bg-white/10 transition-colors flex items-center justify-center gap-2">
                  <RefreshCw className="w-4 h-4" /> Retake
                </Motion.button>
                <Motion.button whileTap={{ scale: 0.93 }} onClick={() => handleFinish(false)} disabled={saving}
                  className="flex-1 py-3.5 bg-primary text-white font-black rounded-2xl hover:bg-primary/90 transition-colors flex items-center justify-center gap-2 disabled:opacity-50">
                  {saving ? (
                    <Motion.div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full" animate={{ rotate: 360 }} transition={{ duration: 0.6, repeat: Infinity, ease: 'linear' }} />
                  ) : (
                    <><CheckCircle2 className="w-5 h-5" /> Launch</>
                  )}
                </Motion.button>
              </div>
            )}

            <button onClick={() => handleFinish(true)} disabled={saving}
              className="mt-4 text-zinc-600 hover:text-zinc-400 text-sm transition-colors flex items-center gap-1">
              <X className="w-3.5 h-3.5" /> Skip photo and continue
            </button>
          </Motion.div>
        )}
      </AnimatePresence>

      <p className="absolute bottom-6 text-zinc-700 text-xs">
        {step === 'supervisor-auth' ? 'Contact your event admin if you need login credentials.' : `Supervisor: ${supervisor?.name || supervisor?.email}`}
      </p>
    </div>
  );
};

export default DeviceLogin;
