import React, { useState, useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Clock, MessageSquareQuote, Mic2, Activity } from 'lucide-react';
import { db } from '../firebase';
import { collection, query, where, orderBy, onSnapshot, limit, doc, getDoc } from 'firebase/firestore';

const parseSessionTime = (timeVal) => {
  if (!timeVal) return null;
  if (timeVal?.toDate) return timeVal.toDate();
  const d = new Date(timeVal);
  if (!isNaN(d)) return d;
  // "HH:MM" or "H:MM AM/PM" treated as today
  const today = new Date();
  const parts = String(timeVal).trim().split(' ');
  const [h, m] = parts[0].split(':').map(Number);
  let hours = h;
  if (parts[1] === 'PM' && h !== 12) hours += 12;
  if (parts[1] === 'AM' && h === 12) hours = 0;
  today.setHours(hours, m || 0, 0, 0);
  return today;
};

const Jumbotron = () => {
  const [viewIndex, setViewIndex] = useState(0);
  const [event, setEvent] = useState(null);
  const [agenda, setAgenda] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [currentQIdx, setCurrentQIdx] = useState(0);
  const [now, setNow] = useState(new Date());

  // Rotate views every 10s
  useEffect(() => {
    const iv = setInterval(() => setViewIndex(i => (i + 1) % 3), 10000);
    return () => clearInterval(iv);
  }, []);

  // Live clock
  useEffect(() => {
    const iv = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(iv);
  }, []);

  // Rotate Q&A questions
  useEffect(() => {
    if (!questions.length) return;
    const iv = setInterval(() => setCurrentQIdx(i => (i + 1) % questions.length), 4000);
    return () => clearInterval(iv);
  }, [questions.length]);

  // Load active event via device session → device doc → fallback to most recent
  useEffect(() => {
    let unsub = () => {};
    const load = async () => {
      let eventId = null;
      try {
        const session = JSON.parse(localStorage.getItem('eventpro_device_session') || '{}');
        eventId = session.eventId;
        if (!eventId && session.deviceId) {
          const snap = await getDoc(doc(db, 'devices', session.deviceId));
          if (snap.exists()) eventId = snap.data().eventId;
        }
      } catch { /* ignore session read errors */ }

      const q = eventId
        ? query(collection(db, 'events'), where('__name__', '==', eventId), limit(1))
        : query(collection(db, 'events'), orderBy('createdAt', 'desc'), limit(1));

      unsub = onSnapshot(q, snap => {
        if (!snap.empty) setEvent({ id: snap.docs[0].id, ...snap.docs[0].data() });
      });
    };
    load();
    return () => unsub();
  }, []);

  // Load agendas for the event
  useEffect(() => {
    if (!event?.id) return;
    const q = query(collection(db, 'agendas'), where('eventId', '==', event.id), orderBy('time'));
    const unsub = onSnapshot(q, snap => {
      setAgenda(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [event?.id]);

  // Load Q&A questions for the event
  useEffect(() => {
    if (!event?.id) return;
    const q = query(collection(db, 'questions'), where('eventId', '==', event.id), orderBy('createdAt', 'desc'), limit(20));
    const unsub = onSnapshot(q, snap => {
      setQuestions(snap.docs.map(d => d.data().text || d.data().question || '').filter(Boolean));
    });
    return () => unsub();
  }, [event?.id]);

  // Derive current and next sessions from real agenda
  const currentSession = [...agenda].reverse().find(s => {
    const t = parseSessionTime(s.time);
    return t && t <= now;
  }) ?? null;
  const nextSession = agenda.find(s => {
    const t = parseSessionTime(s.time);
    return t && t > now;
  }) ?? null;

  const eventName = event?.name || event?.title || 'EventPro Live';
  const hashtag = event?.hashtag ? `#${event.hashtag}` : '#EventProLive';

  const formatCountdown = (session) => {
    if (!session) return '';
    const t = parseSessionTime(session.time);
    if (!t) return '';
    const diff = t - now;
    if (diff <= 0) return 'Starting Now';
    const mins = Math.floor(diff / 60000);
    const secs = Math.floor((diff % 60000) / 1000);
    return `${mins}:${String(secs).padStart(2, '0')}`;
  };

  const upNextTitle = nextSession?.title || nextSession?.name || 'Stay Tuned';
  const upNextVenue = nextSession?.venue || nextSession?.track || 'Main Stage';
  const upNextTimeStr = nextSession?.time
    ? (parseSessionTime(nextSession.time)?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) ?? String(nextSession.time))
    : '';

  const speakerName = currentSession?.speaker || currentSession?.speakerName || 'On Stage';
  const speakerRole = currentSession?.speakerRole || currentSession?.designation || '';
  const speakerTopic = currentSession?.title || currentSession?.name || '';
  const speakerTrack = currentSession?.track || currentSession?.venue || 'Main Stage';
  const speakerPhoto = currentSession?.speakerPhoto || null;

  const announcements = (event?.announcements?.length
    ? event.announcements
    : [`Welcome to ${eventName}`, hashtag, 'Visit the sponsor hall', 'Collect your event kit']).flatMap(a => [a, '•']);

  return (
    <div className="w-screen h-screen bg-black overflow-hidden flex font-inter text-white relative">

      {/* Ambient Background */}
      <div className="absolute inset-0 z-0">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-primary/20 via-black to-black"></div>
        <div className="absolute inset-0 bg-mesh opacity-30"></div>
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-[0.03] animate-[pulse_10s_ease-in-out_infinite]"></div>
      </div>

      <div className="relative z-10 w-full h-full flex flex-col p-12">

        {/* Global Header */}
        <div className="flex justify-between items-center mb-auto border-b border-white/10 pb-8">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-primary rounded-2xl flex items-center justify-center font-black text-3xl">E</div>
            <h1 className="text-4xl font-black tracking-tighter">{eventName} <span className="font-light text-zinc-500">Live</span></h1>
          </div>
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-3 text-red-500 bg-red-500/10 px-6 py-3 rounded-full border border-red-500/20">
              <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
              <span className="text-xl font-bold uppercase tracking-widest">Live Cast</span>
            </div>
            <p className="text-4xl font-mono font-bold text-zinc-300">{hashtag}</p>
          </div>
        </div>

        {/* Dynamic Content Core */}
        <div className="flex-1 flex items-center justify-center relative">
          <AnimatePresence mode="wait">

            {/* SCREEN 1: UP NEXT */}
            {viewIndex === 0 && (
              <motion.div
                key="upnext"
                initial={{ opacity: 0, y: 50 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="w-full max-w-6xl flex flex-col items-center text-center"
              >
                <div className="p-8 bg-white/5 border border-white/10 rounded-full mb-12 flex items-center gap-4 text-primary">
                  <Clock className="w-12 h-12" />
                  <span className="text-3xl font-black uppercase tracking-[0.2em]">
                    {nextSession ? `Up Next in ${formatCountdown(nextSession)}` : 'Programme Complete'}
                  </span>
                </div>
                <h2 className="text-7xl md:text-8xl font-black tracking-tight leading-[1.1] mb-8">
                  {upNextTitle}
                </h2>
                <p className="text-4xl text-zinc-400 font-medium">
                  {upNextVenue}{upNextTimeStr ? ` • ${upNextTimeStr}` : ''}
                </p>
              </motion.div>
            )}

            {/* SCREEN 2: LIVE FEED (Q&A) */}
            {viewIndex === 1 && (
              <motion.div
                key="livefeed"
                initial={{ opacity: 0, x: 100 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -100 }}
                className="w-full max-w-6xl"
              >
                <div className="flex items-center gap-4 text-blue-400 mb-12">
                  <MessageSquareQuote className="w-12 h-12" />
                  <span className="text-4xl font-black uppercase tracking-widest">Live Audience Q&A</span>
                </div>
                <div className="glass-card p-16 rounded-[3rem] border-white/10 bg-black/60 shadow-2xl relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-2 h-full bg-blue-500"></div>
                  {questions.length > 0 ? (
                    <AnimatePresence mode="wait">
                      <motion.div
                        key={currentQIdx}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                      >
                        <p className="text-5xl md:text-6xl font-medium leading-tight tracking-tight">"{questions[currentQIdx]}"</p>
                      </motion.div>
                    </AnimatePresence>
                  ) : (
                    <div className="flex items-center justify-center h-full">
                      <p className="text-3xl text-zinc-500 font-bold italic tracking-widest uppercase">Waiting for questions…</p>
                    </div>
                  )}
                  <p className="text-2xl text-zinc-500 font-mono mt-12">Scan QR on badge to submit your question.</p>
                </div>
              </motion.div>
            )}

            {/* SCREEN 3: CURRENT SPEAKER */}
            {viewIndex === 2 && (
              <motion.div
                key="speaker"
                initial={{ opacity: 0, scale: 1.05 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="w-full max-w-6xl flex items-center justify-between gap-16"
              >
                <div className="flex-1">
                  <div className="inline-flex items-center gap-3 text-orange-400 bg-orange-400/10 px-6 py-3 rounded-full border border-orange-400/20 mb-8">
                    <Mic2 className="w-6 h-6" />
                    <span className="text-xl font-bold uppercase tracking-widest">
                      {currentSession ? 'Currently Speaking' : 'Coming Up Next'}
                    </span>
                  </div>
                  <h2 className="text-7xl font-black text-white mb-4 leading-none">{speakerName}</h2>
                  {speakerRole && <h3 className="text-4xl text-zinc-400 mb-12">{speakerRole}</h3>}
                  {speakerTopic && (
                    <p className="text-3xl leading-relaxed font-light text-zinc-300">
                      "{speakerTopic}"
                    </p>
                  )}
                </div>
                <div className="w-[500px] h-[500px] rounded-[3rem] overflow-hidden border border-white/10 relative shadow-2xl shadow-orange-500/20">
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent z-10"></div>
                  {speakerPhoto ? (
                    <img src={speakerPhoto} alt={speakerName} className="w-full h-full object-cover filter grayscale contrast-125" />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-orange-500/20 to-primary/20 flex items-center justify-center">
                      <span className="text-[160px] font-black text-white/20">{speakerName.charAt(0)}</span>
                    </div>
                  )}
                  <div className="absolute bottom-8 left-8 right-8 z-20 flex justify-between items-end">
                    <div className="flex items-center gap-4 bg-white/10 backdrop-blur-md px-6 py-3 rounded-full border border-white/20">
                      <Activity className="w-6 h-6 text-green-400" />
                      <span className="text-xl font-bold">{speakerTrack}</span>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

          </AnimatePresence>
        </div>

        {/* Footer Ticker */}
        <div className="mt-auto pt-8 border-t border-white/10 overflow-hidden flex gap-8 whitespace-nowrap opacity-50">
          <motion.div
            animate={{ x: [0, -2000] }}
            transition={{ duration: 40, repeat: Infinity, ease: 'linear' }}
            className="flex gap-20 items-center text-3xl font-mono uppercase"
          >
            {[...announcements, ...announcements].map((item, i) => (
              <span key={i}>{item}</span>
            ))}
          </motion.div>
        </div>

      </div>
    </div>
  );
};

export default Jumbotron;
