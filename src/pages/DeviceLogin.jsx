import React, { useState, useEffect, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { db } from '../firebase';
import {
  collection, query, where, getDocs, updateDoc, doc,
  arrayUnion, serverTimestamp
} from 'firebase/firestore';
import {
  QrCode, Delete, Wifi, WifiOff, ShieldCheck, AlertCircle,
  User, Phone, Briefcase, ChevronRight, Camera, RefreshCw,
  CheckCircle2, X, ArrowLeft
} from 'lucide-react';

const SEED_DEVICES = [
  { id: 'dev-001', name: 'SUNMI-001', pin: '1111', assignedGate: { id: 'main-entrance', label: 'Main Entrance', icon: '🚪' }, mode: 'scanner' },
  { id: 'dev-002', name: 'SUNMI-002', pin: '2222', assignedGate: { id: 'hall-a',        label: 'Hall A',       icon: '🏛️' }, mode: 'scanner' },
  { id: 'dev-003', name: 'SUNMI-003', pin: '3333', assignedGate: { id: 'vip-lounge',    label: 'VIP Lounge',   icon: '💎' }, mode: 'scanner' },
  { id: 'dev-004', name: 'SUNMI-004', pin: '4444', assignedGate: { id: 'giveaway',      label: 'Giveaway Station', icon: '🎁' }, mode: 'giveaway' },
];

const MODE_LABELS = {
  scanner:   { label: 'Entry Scanner',     color: 'text-primary',   bg: 'bg-primary/10',   border: 'border-primary/20' },
  giveaway:  { label: 'Giveaway Station',  color: 'text-amber-400', bg: 'bg-amber-400/10', border: 'border-amber-400/20' },
  checkin:   { label: 'Check-In Desk',     color: 'text-green-400', bg: 'bg-green-400/10', border: 'border-green-400/20' },
  jumbotron: { label: 'Jumbotron Display', color: 'text-zinc-300',  bg: 'bg-white/5',      border: 'border-white/10' },
  supervisor:{ label: 'Supervisor Desk',   color: 'text-green-400', bg: 'bg-green-400/10', border: 'border-green-400/20' },
};

const DeviceLogin = () => {
  const navigate = useNavigate();

  // Step system: 'pin' → 'custodian' → 'photo' → 'done'
  const [step, setStep] = useState('pin');

  // Step 1: PIN
  const [pin, setPin]           = useState('');
  const [pinStatus, setPinStatus] = useState('idle'); // idle | loading | error
  const [foundDevice, setFoundDevice] = useState(null);
  const dots = [pin.length > 0, pin.length > 1, pin.length > 2, pin.length > 3];
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  // Step 2: Custodian details
  const [holder, setHolder]         = useState({ name: '', phone: '', designation: '' });
  const [holderErrors, setHolderErrors] = useState({});

  // Step 3: Photo
  const videoRef   = useRef(null);
  const canvasRef  = useRef(null);
  const streamRef  = useRef(null);
  const [photo, setPhoto]           = useState(null); // base64
  const [cameraError, setCameraError] = useState('');
  const [cameraReady, setCameraReady] = useState(false);

  // Misc
  const [saving, setSaving] = useState(false);

  // Online/offline listener
  useEffect(() => {
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  // ─── Camera helpers (declared before effects that use them) ──────────────
  const startCamera = async () => {
    setCameraError('');
    setCameraReady(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 640, height: 480 } });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => { videoRef.current.play(); setCameraReady(true); };
      }
    } catch {
      setCameraError('Camera access was denied or not available on this device.');
    }
  };

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  };

  // Start camera when we land on the photo step
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (step === 'photo') startCamera();
    return () => stopCamera();
  }, [step]);

  const capturePhoto = () => {
    const video  = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width  = video.videoWidth  || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    // Mirror horizontally (selfie feels natural when mirrored)
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    setPhoto(canvas.toDataURL('image/jpeg', 0.75));
    stopCamera();
  };

  const retakePhoto = () => { setPhoto(null); startCamera(); };

  // ─── Step 1: Validate PIN ────────────────────────────────────────────────
  const handlePinSubmit = async (enteredPin) => {
    setPinStatus('loading');
    let device = null;
    try {
      const q    = query(collection(db, 'devices'), where('pin', '==', enteredPin));
      const snap = await getDocs(q);
      if (!snap.empty) device = { id: snap.docs[0].id, ...snap.docs[0].data() };
    } catch (e) { console.warn('Firebase PIN lookup failed, using seed:', e); }
    if (!device) device = SEED_DEVICES.find(d => d.pin === enteredPin) || null;

    if (!device) {
      setPinStatus('error');
      setTimeout(() => { setPinStatus('idle'); setPin(''); }, 2000);
      return;
    }
    setFoundDevice(device);
    setPinStatus('idle');
    setStep('custodian');
  };

  // Auto-submit PIN
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (pin.length === 4) handlePinSubmit(pin);
  }, [pin]);

  // ─── Step 2: Validate custodian fields ──────────────────────────────────
  const handleCustodianNext = () => {
    const errors = {};
    if (!holder.name.trim()) errors.name = 'Full name is required';
    if (holder.phone && !/^[\d\s\-+()]{7,15}$/.test(holder.phone)) errors.phone = 'Enter a valid phone number';
    if (Object.keys(errors).length > 0) { setHolderErrors(errors); return; }
    setStep('photo');
  };

  // ─── Step 3: Save + launch ───────────────────────────────────────────────
  const handleFinish = async (skipPhoto = false) => {
    setSaving(true);
    const now = new Date().toISOString();
    const holderPayload = {
      name:        holder.name.trim(),
      phone:       holder.phone.trim(),
      designation: holder.designation.trim(),
      photo:       skipPhoto ? null : (photo || null),
      loginTime:   now,
    };

    try {
      const deviceRef = doc(db, 'devices', foundDevice.id);
      // Build custody history entry for the OUTGOING holder (if any)
      const outgoingEntry = foundDevice.currentHolder
        ? { ...foundDevice.currentHolder, logoutTime: now }
        : null;

      await updateDoc(deviceRef, {
        // Append outgoing holder to history (if there was one)
        ...(outgoingEntry ? { custodyHistory: arrayUnion(outgoingEntry) } : {}),
        // Set new holder (photo stored locally only to stay under Firestore 1MB limit)
        currentHolder: { ...holderPayload, photo: null, hasPhoto: !!holderPayload.photo },
        status:   'online',
        lastSeen: serverTimestamp(),
      });
    } catch (e) {
      console.warn('Firebase update failed (offline mode):', e);
    }

    // Save full session (including photo) to localStorage
    const session = {
      deviceId:    foundDevice.id,
      deviceName:  foundDevice.name,
      assignedGate: foundDevice.assignedGate,
      mode:        foundDevice.mode,
      holder:      holderPayload,
      loginTime:   now,
    };
    localStorage.setItem('eventpro_device_session', JSON.stringify(session));
    localStorage.setItem('eventpro_gate_config',    JSON.stringify(foundDevice.assignedGate));

    setSaving(false);
    setStep('done');
    setTimeout(() => {
      if (foundDevice.mode === 'jumbotron')  navigate('/jumbotron');
      else if (foundDevice.mode === 'supervisor') navigate('/supervisor');
      else navigate('/scanner');
    }, 2500);
  };

  const NUMPAD   = ['1','2','3','4','5','6','7','8','9','','0','⌫'];
  const modeInfo = foundDevice ? MODE_LABELS[foundDevice.mode] : null;

  const STEPS = ['pin', 'custodian', 'photo'];
  const stepIdx = STEPS.indexOf(step);

  return (
    <div className="fixed inset-0 bg-black flex flex-col items-center justify-center overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-mesh opacity-20 pointer-events-none" />

      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-6 py-4 z-10">
        <div className="flex items-center gap-3">
          {(step === 'custodian' || step === 'photo') && (
            <button onClick={() => {
              if (step === 'photo') { stopCamera(); setPhoto(null); setStep('custodian'); }
              else { setStep('pin'); setPin(''); }
            }} className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-zinc-400 hover:text-white">
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-primary rounded-lg flex items-center justify-center">
              <span className="text-white font-black text-sm">E</span>
            </div>
            <span className="text-white font-bold text-sm">EventPro POS</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {isOnline
            ? <><Wifi className="w-4 h-4 text-green-400" /><span className="text-green-400 text-xs font-bold">Live</span></>
            : <><WifiOff className="w-4 h-4 text-red-400" /><span className="text-red-400 text-xs font-bold">Offline</span></>}
        </div>
      </div>

      {/* Step progress dots */}
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
        {step === 'done' && foundDevice && (
          <motion.div key="done" initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
            className="flex flex-col items-center text-center px-8 max-w-sm w-full">
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 200, damping: 15 }}
              className="w-24 h-24 bg-green-500/10 border border-green-500/30 rounded-full flex items-center justify-center mb-6">
              <ShieldCheck className="w-12 h-12 text-green-400" strokeWidth={1.5} />
            </motion.div>
            <p className="text-xs font-bold text-green-400 uppercase tracking-widest mb-2">Session Active</p>
            <h2 className="text-4xl font-black text-white mb-1">{foundDevice.name}</h2>
            <p className="text-zinc-300 text-lg font-semibold mb-4">{foundDevice.assignedGate?.icon} {foundDevice.assignedGate?.label}</p>
            <div className="w-full p-4 bg-white/5 border border-white/10 rounded-2xl mb-4 flex items-center gap-4 text-left">
              {photo && <img src={photo} alt="holder" className="w-12 h-12 rounded-xl object-cover flex-shrink-0 border border-white/10" />}
              <div>
                <p className="text-white font-bold">{holder.name}</p>
                {holder.designation && <p className="text-zinc-400 text-sm">{holder.designation}</p>}
                {holder.phone && <p className="text-zinc-500 text-xs mt-0.5">📞 {holder.phone}</p>}
              </div>
            </div>
            <span className={`text-sm font-bold px-3 py-1 rounded-full border ${modeInfo?.bg} ${modeInfo?.color} ${modeInfo?.border}`}>
              {modeInfo?.label}
            </span>
            <p className="text-zinc-600 text-sm mt-6">Launching in a moment…</p>
          </motion.div>
        )}

        {/* PIN ERROR */}
        {step === 'pin' && pinStatus === 'error' && (
          <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="flex flex-col items-center text-center px-8">
            <div className="w-24 h-24 bg-red-500/10 border border-red-500/30 rounded-full flex items-center justify-center mb-6">
              <AlertCircle className="w-12 h-12 text-red-400" strokeWidth={1.5} />
            </div>
            <h2 className="text-3xl font-black text-red-400 mb-2">Invalid PIN</h2>
            <p className="text-zinc-500 text-sm">Check with your event supervisor.</p>
          </motion.div>
        )}

        {/* STEP 1: PIN PAD */}
        {step === 'pin' && pinStatus !== 'error' && (
          <motion.div key="pad" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -40 }}
            className="flex flex-col items-center w-full max-w-xs select-none">
            <div className="w-16 h-16 bg-primary/10 border border-primary/20 rounded-2xl flex items-center justify-center mb-6">
              <QrCode className="w-8 h-8 text-primary" />
            </div>
            <h1 className="text-2xl font-black text-white mb-1">Device Sign In</h1>
            <p className="text-zinc-500 text-sm mb-8">Enter your 4-digit device PIN</p>
            <div className="flex gap-5 mb-10">
              {dots.map((filled, i) => (
                <motion.div key={i} animate={{ scale: filled ? 1.2 : 1 }} transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                  className={`w-5 h-5 rounded-full border-2 transition-colors ${
                    filled ? pinStatus === 'loading' ? 'bg-amber-400 border-amber-400' : 'bg-primary border-primary' : 'border-white/20'
                  }`} />
              ))}
            </div>
            <div className="grid grid-cols-3 gap-4 w-full">
              {NUMPAD.map((key, i) => (
                key === '' ? <div key={i} /> :
                key === '⌫' ? (
                  <motion.button key={i} whileTap={{ scale: 0.88 }} onClick={() => { setPin(p => p.slice(0, -1)); setPinStatus('idle'); }}
                    className="h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-white hover:bg-white/10 transition-colors select-none">
                    <Delete className="w-6 h-6 text-zinc-400" />
                  </motion.button>
                ) : (
                  <motion.button key={i} whileTap={{ scale: 0.88 }}
                    onClick={() => { if (pin.length < 4 && pinStatus === 'idle') setPin(p => p + key); }}
                    className="h-16 rounded-2xl bg-white/8 border border-white/10 text-white text-2xl font-bold hover:bg-white/15 active:bg-primary/20 transition-colors select-none">
                    {key}
                  </motion.button>
                )
              ))}
            </div>
            {pinStatus === 'loading' && (
              <div className="mt-8 flex items-center gap-2 text-amber-400">
                <motion.div className="w-4 h-4 border-2 border-amber-400 border-t-transparent rounded-full"
                  animate={{ rotate: 360 }} transition={{ duration: 0.6, repeat: Infinity, ease: 'linear' }} />
                <span className="text-sm font-bold">Authenticating…</span>
              </div>
            )}
          </motion.div>
        )}

        {/* STEP 2: CUSTODIAN DETAILS */}
        {step === 'custodian' && foundDevice && (
          <motion.div key="custodian" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }}
            className="w-full max-w-sm px-6 select-text">
            {/* Verified badge */}
            <div className="flex items-center gap-3 p-4 bg-white/5 border border-white/10 rounded-2xl mb-6">
              <span className="text-2xl">{foundDevice.assignedGate?.icon}</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-primary uppercase tracking-widest">Verified</p>
                <p className="text-white font-bold truncate">{foundDevice.name} · {foundDevice.assignedGate?.label}</p>
              </div>
              <ShieldCheck className="w-5 h-5 text-green-400 flex-shrink-0" />
            </div>
            {/* Previous holder notice */}
            {foundDevice.currentHolder?.name && (
              <div className="flex items-start gap-2 p-3 bg-amber-500/5 border border-amber-500/15 rounded-xl mb-4">
                <span className="text-amber-400 text-lg">⚠️</span>
                <p className="text-amber-300 text-xs leading-relaxed">
                  This device is currently assigned to <strong>{foundDevice.currentHolder.name}</strong>. 
                  Signing in will transfer custody and log the handover with a timestamp.
                </p>
              </div>
            )}
            <h2 className="text-2xl font-black text-white mb-1">Who's taking this device?</h2>
            <p className="text-zinc-500 text-sm mb-5">Your details will be logged for accountability.</p>
            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block mb-1">
                  Full Name <span className="text-red-400">*</span>
                </label>
                <div className="relative">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                  <input type="text" value={holder.name}
                    onChange={e => { setHolder(h => ({ ...h, name: e.target.value })); setHolderErrors(er => ({ ...er, name: '' })); }}
                    placeholder="Rajesh Kumar" autoFocus
                    className={`w-full pl-10 pr-4 py-3.5 bg-white/5 border rounded-xl text-white placeholder-zinc-600 outline-none transition-colors ${holderErrors.name ? 'border-red-500/50' : 'border-white/10 focus:border-primary/50'}`} />
                </div>
                {holderErrors.name && <p className="text-red-400 text-xs mt-1">{holderErrors.name}</p>}
              </div>
              <div>
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block mb-1">Phone / WhatsApp <span className="text-zinc-600">(optional)</span></label>
                <div className="relative">
                  <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                  <input type="tel" value={holder.phone}
                    onChange={e => { setHolder(h => ({ ...h, phone: e.target.value })); setHolderErrors(er => ({ ...er, phone: '' })); }}
                    placeholder="+91 98765 43210"
                    className={`w-full pl-10 pr-4 py-3.5 bg-white/5 border rounded-xl text-white placeholder-zinc-600 outline-none transition-colors ${holderErrors.phone ? 'border-red-500/50' : 'border-white/10 focus:border-primary/50'}`} />
                </div>
                {holderErrors.phone && <p className="text-red-400 text-xs mt-1">{holderErrors.phone}</p>}
              </div>
              <div>
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block mb-1">Role / Designation <span className="text-zinc-600">(optional)</span></label>
                <div className="relative">
                  <Briefcase className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                  <input type="text" value={holder.designation}
                    onChange={e => setHolder(h => ({ ...h, designation: e.target.value }))}
                    placeholder="Gate Supervisor / Volunteer"
                    className="w-full pl-10 pr-4 py-3.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder-zinc-600 outline-none focus:border-primary/50 transition-colors" />
                </div>
              </div>
            </div>
            <motion.button whileTap={{ scale: 0.97 }} onClick={handleCustodianNext}
              className="w-full mt-5 py-4 bg-primary text-white font-black rounded-xl hover:bg-primary/90 transition-colors flex items-center justify-center gap-2">
              Next: Take Photo <ChevronRight className="w-5 h-5" />
            </motion.button>
          </motion.div>
        )}

        {/* STEP 3: PHOTO CAPTURE */}
        {step === 'photo' && foundDevice && (
          <motion.div key="photo" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}
            className="w-full max-w-sm px-6 flex flex-col items-center select-none">
            <div className="w-14 h-14 bg-primary/10 border border-primary/20 rounded-2xl flex items-center justify-center mb-4">
              <Camera className="w-7 h-7 text-primary" />
            </div>
            <h2 className="text-2xl font-black text-white mb-1">Take Your Photo</h2>
            <p className="text-zinc-500 text-sm mb-5 text-center">A photo will be saved with your session for<br/>security and accountability.</p>

            {/* Camera / preview area */}
            <div className="w-full aspect-square rounded-2xl overflow-hidden border border-white/10 bg-zinc-900 relative mb-4">
              {photo ? (
                <img src={photo} alt="captured" className="w-full h-full object-cover" />
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
                      <motion.div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full"
                        animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }} />
                    </div>
                  )}
                  {/* Guide overlay */}
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-40 h-40 rounded-full border-2 border-white/20 border-dashed" />
                  </div>
                </>
              )}
              <canvas ref={canvasRef} className="hidden" />
            </div>

            {/* Camera action buttons */}
            {!photo ? (
              <div className="flex gap-3 w-full">
                <motion.button whileTap={{ scale: 0.93 }} onClick={capturePhoto} disabled={!cameraReady || !!cameraError}
                  className="flex-1 py-4 bg-primary text-white font-black rounded-2xl hover:bg-primary/90 transition-colors flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed text-lg">
                  <Camera className="w-6 h-6" /> Capture
                </motion.button>
              </div>
            ) : (
              <div className="flex gap-3 w-full">
                <motion.button whileTap={{ scale: 0.93 }} onClick={retakePhoto}
                  className="flex-1 py-3.5 bg-white/5 border border-white/10 text-white font-bold rounded-2xl hover:bg-white/10 transition-colors flex items-center justify-center gap-2">
                  <RefreshCw className="w-4 h-4" /> Retake
                </motion.button>
                <motion.button whileTap={{ scale: 0.93 }} onClick={() => handleFinish(false)} disabled={saving}
                  className="flex-1 py-3.5 bg-primary text-white font-black rounded-2xl hover:bg-primary/90 transition-colors flex items-center justify-center gap-2 disabled:opacity-50">
                  {saving
                    ? <motion.div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full" animate={{ rotate: 360 }} transition={{ duration: 0.6, repeat: Infinity, ease: 'linear' }} />
                    : <><CheckCircle2 className="w-5 h-5" /> Confirm</>}
                </motion.button>
              </div>
            )}

            {/* Skip option */}
            <button onClick={() => handleFinish(true)} disabled={saving}
              className="mt-4 text-zinc-600 hover:text-zinc-400 text-sm transition-colors flex items-center gap-1">
              <X className="w-3.5 h-3.5" /> Skip photo and continue without it
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <p className="absolute bottom-6 text-zinc-700 text-xs">
        Contact your event supervisor if you don't have a device PIN.
      </p>
    </div>
  );
};

export default DeviceLogin;
