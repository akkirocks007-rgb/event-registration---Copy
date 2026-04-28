import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { db } from '../firebase';
import { collection, query, where, orderBy, limit, onSnapshot, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { Users, MapPin, CheckCircle2, ShieldOff, Monitor } from 'lucide-react';

const DEFAULT_TV_CONFIG = {
  message: 'Welcome back, {name}!',
  primaryColor: '#3d5afe',
  showCompany: true,
  speed: 6,
};

const WelcomeTV = () => {
  const { gateId: initialGateId } = useParams();
  const [gateId, setGateId] = useState(initialGateId === 'pair' ? null : initialGateId);
  const [pairingCode, setPairingCode] = useState(() => Math.floor(1000 + Math.random() * 9000).toString());
  const [latestScan, setLatestScan] = useState(null);
  const [showWelcome, setShowWelcome] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [tvConfig, setTvConfig] = useState(DEFAULT_TV_CONFIG);

  // ─── 1. Pairing Logic ───
  useEffect(() => {
    if (gateId) return;

    const pairDoc = doc(db, 'tvPairings', pairingCode);
    setDoc(pairDoc, { 
        code: pairingCode, 
        active: true, 
        createdAt: serverTimestamp(),
        gateId: null 
    });

    // Listen for pairing completion
    const unsub = onSnapshot(pairDoc, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data.gateId) {
          setGateId(data.gateId);
          setPairingCode(null);
        }
      }
    });

    return () => unsub();
  }, [gateId, pairingCode]);

  // ─── 2. Load designer config for this gate ───
  useEffect(() => {
    if (!gateId || gateId === 'pair') return;
    const unsub = onSnapshot(doc(db, 'tvConfigs', gateId), snap => {
      if (snap.exists()) setTvConfig({ ...DEFAULT_TV_CONFIG, ...snap.data() });
    });
    return () => unsub();
  }, [gateId]);

  // ─── 3. Real-time Scan Listening ───
  useEffect(() => {
    if (!gateId || gateId === 'pair') return;

    const q = query(
      collection(db, 'scanLogs'),
      where('gateId', '==', gateId),
      orderBy('timestamp', 'desc'),
      limit(1)
    );

    const unsub = onSnapshot(q, snap => {
      if (!snap.empty) {
        const data = snap.docs[0].data();
        const scanTime = data.timestamp?.toDate ? data.timestamp.toDate() : new Date(data.timestamp);
        const now = new Date();
        
        // Only trigger if scan is within the last 10 seconds (avoid showing old scans on refresh)
        if (now - scanTime < 10000) {
          setLatestScan(data);
          setShowWelcome(true);
        }
      }
    });

    // 2. Count total inside (approved minus duplicate? simplify to total approved today)
    const countQ = query(
        collection(db, 'scanLogs'),
        where('result', '==', 'approved')
    );
    const unsubCount = onSnapshot(countQ, snap => {
        setTotalCount(snap.size);
    });

    return () => { unsub(); unsubCount(); };
  }, [gateId]);

  // Hide welcome after configured duration
  useEffect(() => {
    if (showWelcome) {
      const ms = (tvConfig.speed || 6) * 1000;
      const timer = setTimeout(() => setShowWelcome(false), ms);
      return () => clearTimeout(timer);
    }
  }, [showWelcome, tvConfig.speed]);

  return (
    <div className="w-screen h-screen bg-[#050505] overflow-hidden text-white font-inter relative select-none">
      {/* Dynamic Background */}
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_-20%,#3d5afe_20%,transparent_50%)] opacity-20" />
        <div className="absolute inset-0 bg-mesh opacity-20" />
      </div>

      <div className="relative z-10 w-full h-full flex flex-col p-20">
        {/* Header */}
        <div className="flex justify-between items-center mb-auto border-b border-white/5 pb-10">
          <div className="flex items-center gap-6">
            <div className="w-20 h-20 bg-indigo-600 rounded-[2rem] flex items-center justify-center font-black text-4xl shadow-2xl shadow-indigo-500/20">E</div>
            <div>
              <h1 className="text-4xl font-black tracking-tight text-white/90">EventPro <span className="font-light text-zinc-500">Suite</span></h1>
              <p className="text-indigo-400 font-mono text-sm tracking-widest uppercase mt-1">Live Entry Display</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-3xl font-black text-zinc-200 tracking-tighter uppercase">{gateId?.replace(/-/g, ' ') || 'MAIN ENTRANCE'}</p>
            <div className="flex items-center justify-end gap-2 text-zinc-500 font-bold mt-1 uppercase tracking-widest text-xs">
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" /> Live Terminal Active
            </div>
          </div>
        </div>

        {/* Main Display Area */}
        <div className="flex-1 flex items-center justify-center">
          <AnimatePresence mode="wait">
            {pairingCode ? (
              <motion.div 
                key="pairing" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
                className="flex flex-col items-center gap-10 text-center"
              >
                <div className="w-24 h-24 bg-indigo-500/10 rounded-full flex items-center justify-center text-indigo-400 mb-4 animate-pulse">
                  <Monitor className="w-12 h-12" />
                </div>
                <div className="space-y-4">
                  <h2 className="text-4xl font-bold text-zinc-500 uppercase tracking-widest">Connect to Entry Scanner</h2>
                  <p className="text-xl text-zinc-600">Enter this 4-digit pairing code on your scanner's setup display</p>
                </div>
                <div className="flex gap-4">
                  {pairingCode.split('').map((char, i) => (
                    <motion.div 
                      key={i} initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: i * 0.1 }}
                      className="w-40 h-56 bg-white/5 border border-white/10 rounded-[2.5rem] flex items-center justify-center"
                    >
                      <span className="text-[10rem] font-black leading-none text-white">{char}</span>
                    </motion.div>
                  ))}
                </div>
                <div className="mt-12 flex items-center gap-3 text-zinc-700 bg-white/5 px-6 py-3 rounded-full border border-white/5">
                    <span className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce" />
                    <div className="text-sm font-bold uppercase tracking-widest text-[#666]">Awaiting scanner authorization...</div>
                </div>
              </motion.div>
            ) : !showWelcome ? (
              <motion.div 
                key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="flex flex-col items-center gap-12 text-center"
              >
                <div className="relative">
                  <div className="absolute inset-0 bg-indigo-500 blur-[100px] opacity-10 animate-pulse" />
                  <div className="w-72 h-72 rounded-[4rem] border-2 border-white/5 bg-white/[0.02] flex items-center justify-center relative">
                    <div className="absolute inset-4 rounded-[3rem] border border-dashed border-white/10 animate-[spin_20s_linear_infinite]" />
                    <Users className="w-32 h-32 text-zinc-700" />
                  </div>
                </div>
                <div className="space-y-4">
                  <h2 className="text-7xl font-black text-white/40 tracking-tighter uppercase">Ready for Entry</h2>
                  <p className="text-2xl text-zinc-600 font-medium">Please scan your attendee badge to continue</p>
                </div>
              </motion.div>
            ) : (
              <motion.div 
                key="welcome" initial={{ opacity: 0, scale: 0.9, y: 30 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 1.1, blur: '20px' }}
                className="w-full max-w-7xl"
              >
                {latestScan?.result === 'approved' ? (
                  <div className="bg-white/5 border border-white/10 rounded-[4rem] p-24 relative overflow-hidden backdrop-blur-xl shadow-2xl">
                    <div className="absolute top-0 left-0 w-4 h-full" style={{ background: tvConfig.primaryColor }} />

                    <div className="flex items-start gap-16">
                        {/* Status Icon */}
                        <motion.div initial={{ rotate: -20, scale: 0.5 }} animate={{ rotate: 0, scale: 1 }} transition={{ type: 'spring', damping: 10 }}
                             className="w-48 h-48 bg-green-500/20 border-2 border-green-500/30 rounded-[3rem] flex items-center justify-center shrink-0">
                            <CheckCircle2 className="w-24 h-24 text-green-400" />
                        </motion.div>

                        <div className="flex-1 space-y-6">
                            <motion.p initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }}
                                 className="text-4xl font-bold uppercase tracking-[0.2em] mb-4"
                                 style={{ color: tvConfig.primaryColor }}>
                                {tvConfig.message
                                    .replace('{name}', latestScan.attendeeName || '')
                                    .replace('{company}', latestScan.company || '')}
                            </motion.p>
                            <motion.h2 initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 }}
                                 className="text-9xl font-black text-white leading-none tracking-tighter">
                                {latestScan.attendeeName}
                            </motion.h2>

                            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
                                 className="flex items-center gap-8 pt-10">
                                <div className="space-y-1">
                                    <p className="text-zinc-500 font-bold uppercase tracking-widest text-sm">Pass Type</p>
                                    <p className="text-3xl font-black text-white/90">{latestScan.ticketType || 'Visitor'}</p>
                                </div>
                                {tvConfig.showCompany !== false && latestScan.company && (
                                    <>
                                        <div className="w-px h-16 bg-white/10" />
                                        <div className="space-y-1">
                                            <p className="text-zinc-500 font-bold uppercase tracking-widest text-sm">Organization</p>
                                            <p className="text-3xl font-black text-white/90">{latestScan.company}</p>
                                        </div>
                                    </>
                                )}
                            </motion.div>
                        </div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-red-500/10 border border-red-500/30 rounded-[4rem] p-24 text-center">
                    <ShieldOff className="w-40 h-40 text-red-500 mx-auto mb-10" />
                    <h2 className="text-8xl font-black text-white mb-6 uppercase tracking-tighter">Access Denied</h2>
                    <p className="text-4xl text-red-400 font-medium">{latestScan?.reason || 'Unauthorized'}</p>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer info bar */}
        <div className="mt-auto flex justify-between items-end">
            <div className="flex gap-12">
                <div className="space-y-1">
                    <p className="text-zinc-500 text-xs font-bold tracking-widest uppercase">Verified Entry Count</p>
                    <p className="text-6xl font-black text-white">{totalCount}</p>
                </div>
                <div className="space-y-1">
                    <p className="text-zinc-500 text-xs font-bold tracking-widest uppercase">Venue Capacity</p>
                    <p className="text-6xl font-black text-zinc-700">2500</p>
                </div>
            </div>
            
            <div className="bg-white/5 border border-white/10 px-10 py-6 rounded-3xl flex items-center gap-6">
                <MapPin className="w-8 h-8 text-indigo-400" />
                <div className="text-right">
                    <p className="text-sm font-bold text-zinc-500 uppercase">Current Session</p>
                    <p className="text-xl font-black text-white">Opening Keynote: Innovation 2026</p>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};

export default WelcomeTV;
