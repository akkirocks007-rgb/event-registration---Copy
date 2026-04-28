import React, { useState, useEffect } from 'react';
import PageWrapper from '../components/PageWrapper';
import { AnimatePresence } from 'framer-motion';
import { Ticket, Calendar, Users, User, LogOut, Sparkles, MapPin, Search, MessageSquare, Gamepad2, Gift, Trophy, Star, Send } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { db } from '../firebase';
import { collection, query, where, onSnapshot, orderBy, limit } from 'firebase/firestore';
import { QRCodeSVG } from 'qrcode.react';
import { useMotionValue, useTransform, useSpring } from 'framer-motion';

const Ticket3D = ({ uid, name, eventName }) => {
    const x = useMotionValue(0);
    const y = useMotionValue(0);
    const mouseXSpring = useSpring(x);
    const mouseYSpring = useSpring(y);
    const rotateX = useTransform(mouseYSpring, [-0.5, 0.5], ["10deg", "-10deg"]);
    const rotateY = useTransform(mouseXSpring, [-0.5, 0.5], ["-10deg", "10deg"]);

    const handleInteraction = (e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        x.set((clientX - rect.left) / rect.width - 0.5);
        y.set((clientY - rect.top) / rect.height - 0.5);
    };

    return (
        <div className="perspective-1000 w-full select-none"
            onMouseMove={handleInteraction} onMouseLeave={() => { x.set(0); y.set(0); }}
            onTouchMove={handleInteraction} onTouchEnd={() => { x.set(0); y.set(0); }}>
            <motion.div style={{ rotateX, rotateY, transformStyle: "preserve-3d" }}
                className="w-full bg-white rounded-[2rem] p-6 md:p-8 relative overflow-hidden shadow-[0_20px_50px_rgba(84,34,255,0.3)]">
                <motion.div style={{
                    background: useTransform([mouseXSpring, mouseYSpring],
                        ([lx, ly]) => `radial-gradient(circle at ${50 + lx * 100}% ${50 + ly * 100}%, rgba(84,34,255,0.25) 0%, transparent 80%)`)
                }} className="absolute inset-0 z-10 pointer-events-none" />
                <motion.div style={{
                    left: useTransform(mouseXSpring, [-0.5, 0.5], ["-150%", "150%"]),
                    opacity: useTransform(mouseXSpring, [-0.5, 0, 0.5], [0, 1, 0])
                }} className="absolute inset-0 bg-gradient-to-r from-transparent via-white/60 to-transparent rotate-25 w-32 blur-3xl z-20 pointer-events-none" />

                <div className="relative z-30" style={{ transform: "translateZ(60px)" }}>
                    <div className="flex justify-between items-center mb-6 border-b-2 border-dashed border-zinc-100 pb-6">
                        <div>
                            <p className="text-[9px] font-black text-zinc-400 uppercase tracking-[0.2em]">Credential Status</p>
                            <p className="text-xl font-black text-slate-900 leading-none mt-1 uppercase italic">VIP Access</p>
                        </div>
                        <div className="text-right">
                            <p className="text-[9px] font-black text-zinc-400 uppercase tracking-[0.2em]">Token</p>
                            <p className="text-sm font-black text-primary mt-1 font-mono">#921-AG</p>
                        </div>
                    </div>
                    <div className="bg-slate-950 p-6 rounded-[1.5rem] flex justify-center items-center shadow-2xl relative group mb-6">
                        <div className="absolute inset-0 bg-primary/20 rounded-[1.5rem] opacity-50 blur-2xl -z-10 animate-pulse" />
                        <QRCodeSVG value={uid || 'GUEST-ID'} size={180} bgColor="transparent" fgColor="#ffffff" level="H" />
                    </div>
                    <div className="text-center">
                        <h2 className="text-2xl font-black text-slate-900 tracking-tight">{name || 'Attendee'}</h2>
                        <p className="text-[10px] font-black text-zinc-500 mt-1 uppercase tracking-[0.3em] flex items-center justify-center gap-2">
                            <MapPin className="w-3 h-3 text-primary" /> {eventName || 'Live Event'}
                        </p>
                    </div>
                </div>
            </motion.div>
        </div>
    );
};

const AttendeePortal = () => {
  const { logout, user: currentUser } = useAuth();
  const [activeTab, setActiveTab] = useState('badge');

  // Firestore-loaded data
  const [registration, setRegistration] = useState(null);
  const [agenda, setAgenda] = useState([]);
  const [networkAttendees, setNetworkAttendees] = useState([]);
  const [points, setPoints] = useState(0);
  const [dataLoading, setDataLoading] = useState(false);

  // UI state
  const [savedSessions, setSavedSessions] = useState([]);
  const [messages, setMessages] = useState([]);
  const [msgInput, setMsgInput] = useState('');
  const [networkSearch, setNetworkSearch] = useState('');

  // Load attendee registration by email or phone
  useEffect(() => {
    if (!currentUser) return;

    const identifier = currentUser.email || currentUser.phoneNumber;
    if (!identifier) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDataLoading(true);

    const field = currentUser.email ? 'email' : 'phone';
    const q = query(collection(db, 'attendees'), where(field, '==', identifier), limit(1));

    const unsub = onSnapshot(q, (snap) => {
      if (!snap.empty) {
        const reg = { id: snap.docs[0].id, ...snap.docs[0].data() };
        setRegistration(reg);
        setPoints(reg.points || 0);
        // Pre-populate saved sessions from registration
        if (reg.agendas?.length) setSavedSessions(reg.agendas);
      }
      setDataLoading(false);
    });

    return () => unsub();
  }, [currentUser]);

  // Load agenda once we know the event
  useEffect(() => {
    if (!registration?.eventId) return;
    const q = query(collection(db, 'agendas'), where('eventId', '==', registration.eventId), orderBy('time'));
    const unsub = onSnapshot(q, (snap) => {
      setAgenda(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [registration?.eventId]);

  // Load other attendees for networking
  useEffect(() => {
    if (!registration?.eventId) return;
    const q = query(collection(db, 'attendees'), where('eventId', '==', registration.eventId), limit(30));
    const unsub = onSnapshot(q, (snap) => {
      const others = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(a => a.email !== currentUser?.email);
      setNetworkAttendees(others);
    });
    return () => unsub();
  }, [registration?.eventId, currentUser?.email]);

  const toggleSave = (sessionId) => {
    setSavedSessions(prev =>
      prev.includes(sessionId) ? prev.filter(i => i !== sessionId) : [...prev, sessionId]
    );
  };

  const displayName = registration
    ? `${registration.firstName || ''} ${registration.lastName || ''}`.trim()
    : currentUser?.email?.split('@')[0] || 'Attendee';

  const filteredNetwork = networkAttendees.filter(a =>
    `${a.firstName} ${a.lastName} ${a.company} ${a.designation}`
      .toLowerCase().includes(networkSearch.toLowerCase())
  );

  if (dataLoading) {
    return (
      <PageWrapper>
        <div className="min-h-screen bg-bg-dark flex items-center justify-center">
          <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper>
      <div className="min-h-screen bg-bg-dark text-slate-100 flex justify-center overflow-auto relative font-inter">
        <div className="bg-mesh absolute inset-0 z-0 opacity-30 pointer-events-none" />

        <div className="w-full max-w-md bg-black/40 relative z-10 min-h-screen border-x border-white/5 flex flex-col shadow-2xl">

          {/* Header */}
          <div className="p-6 pb-2 border-white/5 flex justify-between items-start z-50">
            <div>
              <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-1">Live Event Portal</h4>
              <h1 className="text-2xl font-black text-white">Hey, {displayName.split(' ')[0] || 'Attendee'}</h1>
            </div>
            <button onClick={logout} className="p-2 bg-white/5 rounded-full text-zinc-400 hover:text-white transition-colors">
              <LogOut className="w-4 h-4" />
            </button>
          </div>

          {/* Main Content */}
          <div className="flex-1 overflow-y-auto pb-24">
            <AnimatePresence mode="wait">

              {/* ── Badge tab ── */}
              {activeTab === 'badge' && (
                <motion.div key="badge" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                  className="p-6 pt-8 flex flex-col items-center">
                  <p className="text-zinc-400 text-center text-sm mb-8">Present this badge at venue scanners or sponsor booths.</p>
                  <Ticket3D
                    uid={currentUser?.uid}
                    name={displayName}
                    eventName={registration?.eventName || registration?.eventId || 'Live Event'}
                  />
                  {registration && (
                    <div className="mt-6 w-full p-4 bg-white/5 rounded-2xl border border-white/5 text-center">
                      <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold mb-1">Confirmation ID</p>
                      <p className="text-lg font-black text-primary font-mono tracking-wider">{registration.confirmationId}</p>
                      <p className="text-xs text-zinc-600 mt-1">{registration.ticketName}</p>
                    </div>
                  )}
                </motion.div>
              )}

              {/* ── Agenda tab ── */}
              {activeTab === 'agenda' && (
                <motion.div key="agenda" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="p-6">
                  {savedSessions.length > 0 && (
                    <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
                      className="mb-5 p-3 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Star className="w-4 h-4 text-primary fill-primary" />
                        <span className="text-xs font-bold text-primary">{savedSessions.length} session{savedSessions.length > 1 ? 's' : ''} saved</span>
                      </div>
                      <button onClick={() => setSavedSessions([])} className="text-[10px] text-zinc-500 hover:text-red-400 font-bold uppercase transition-colors">Clear all</button>
                    </motion.div>
                  )}

                  {agenda.length === 0 ? (
                    <div className="text-center py-16 text-zinc-600 text-sm italic">
                      No sessions published yet. Check back soon.
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {agenda.map((session) => {
                        const isSaved = savedSessions.includes(session.id);
                        return (
                          <div key={session.id} className={`p-4 rounded-xl border transition-all ${isSaved ? 'bg-primary/10 border-primary/30' : 'border-white/5 bg-white/[0.02] hover:bg-white/[0.05]'}`}>
                            <div className="flex justify-between items-start mb-2">
                              <span className={`text-[10px] uppercase font-bold tracking-widest px-2 py-0.5 rounded ${
                                session.track === 'Main Stage' ? 'bg-purple-500/20 text-purple-400'
                                : session.track === 'Dev Hub' ? 'bg-blue-500/20 text-blue-400'
                                : 'bg-orange-500/20 text-orange-400'
                              }`}>{session.track || 'Session'}</span>
                              <button onClick={() => toggleSave(session.id)}
                                className={`transition-all active:scale-110 ${isSaved ? 'text-yellow-400' : 'text-zinc-600 hover:text-yellow-400'}`}>
                                <Star className={`w-4 h-4 ${isSaved ? 'fill-yellow-400' : ''}`} />
                              </button>
                            </div>
                            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1">{session.time}</p>
                            <h4 className="font-bold text-white text-sm mb-1 leading-tight">{session.title}</h4>
                            <p className="text-xs text-zinc-500 flex items-center gap-1"><User className="w-3 h-3" /> {session.speaker}</p>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </motion.div>
              )}

              {/* ── Networking tab ── */}
              {activeTab === 'network' && (
                <motion.div key="network" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="p-6">
                  <h2 className="text-xl font-bold mb-4">Networking</h2>
                  <div className="relative mb-6">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                    <input type="text" placeholder="Find attendees…" value={networkSearch}
                      onChange={e => setNetworkSearch(e.target.value)}
                      className="input-base w-full pl-10 py-3 text-sm h-12 rounded-xl" />
                  </div>

                  <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-4">
                    {filteredNetwork.length} attendee{filteredNetwork.length !== 1 ? 's' : ''} at this event
                  </p>

                  {filteredNetwork.length === 0 ? (
                    <p className="text-center text-zinc-600 text-sm py-12 italic">No other attendees found yet.</p>
                  ) : (
                    <div className="space-y-3">
                      {filteredNetwork.map(a => (
                        <div key={a.id} className="p-4 bg-white/5 rounded-xl border border-white/5 flex items-center justify-between group cursor-pointer hover:bg-white/10 transition-colors">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/40 to-blue-500/40 flex items-center justify-center font-bold text-white shadow-inner">
                              {(a.firstName || 'A').charAt(0)}
                            </div>
                            <div>
                              <p className="font-bold text-sm text-white">{a.firstName} {a.lastName}</p>
                              <p className="text-xs text-zinc-400">{a.designation || a.ticketName || 'Attendee'}{a.company ? ` · ${a.company}` : ''}</p>
                            </div>
                          </div>
                          <button className="text-zinc-500 group-hover:text-white transition-colors">
                            <MessageSquare className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </motion.div>
              )}

              {/* ── Gamification tab ── */}
              {activeTab === 'gamify' && (
                <motion.div key="gamify" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="p-6">
                  <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-bold">Gamification</h2>
                    <div className="bg-primary/20 text-primary border border-primary/30 px-3 py-1 rounded-full text-sm font-bold flex items-center gap-1">
                      <Star className="w-4 h-4 fill-primary" /> {points} PTS
                    </div>
                  </div>

                  <div className="bg-gradient-to-br from-indigo-500/20 to-purple-600/20 border border-purple-500/30 rounded-2xl p-6 mb-8 text-center relative overflow-hidden">
                    <div className="absolute inset-0 bg-mesh opacity-50 mix-blend-overlay pointer-events-none" />
                    <Trophy className={`w-12 h-12 mx-auto mb-3 ${points >= 500 ? 'text-yellow-400' : 'text-zinc-500'}`} />
                    <h3 className="text-lg font-bold text-white mb-1">{points >= 2000 ? 'Gold' : points >= 500 ? 'Silver' : 'Unranked'}</h3>
                    <p className="text-xs text-zinc-400 mb-4">
                      {points < 500 ? `${500 - points} pts to Silver` : points < 2000 ? `${2000 - points} pts to Gold` : 'Top tier reached!'}
                    </p>
                    <div className="w-full bg-black/50 h-2 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-primary to-purple-500 rounded-full transition-all duration-700"
                        style={{ width: `${Math.min((points / 2000) * 100, 100)}%` }} />
                    </div>
                  </div>

                  <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest mb-4">Digital Swag Bag</h3>
                  <div className="grid grid-cols-2 gap-4">
                    {[
                      { id: 1, name: 'Free Espresso', cost: 500, icon: Gift, color: 'text-orange-400', bg: 'bg-orange-500/20', border: 'border-orange-500/30' },
                      { id: 2, name: 'VIP Lounge Pass', cost: 2000, icon: Ticket, color: 'text-purple-400', bg: 'bg-purple-500/20', border: 'border-purple-500/30' },
                      { id: 3, name: 'Tech Sticker Pack', cost: 800, icon: Sparkles, color: 'text-blue-400', bg: 'bg-blue-500/20', border: 'border-blue-500/30' },
                      { id: 4, name: 'Lunch Voucher', cost: 1200, icon: MapPin, color: 'text-green-400', bg: 'bg-green-500/20', border: 'border-green-500/30' },
                    ].map(swag => (
                      <div key={swag.id} className="bg-white/5 border border-white/10 rounded-xl p-4 flex flex-col items-center text-center group cursor-pointer hover:bg-white/10 transition-all">
                        <div className={`w-12 h-12 rounded-full ${swag.bg} ${swag.border} border flex flex-col justify-center items-center mb-3 group-hover:scale-110 transition-transform`}>
                          <swag.icon className={`w-6 h-6 ${swag.color}`} />
                        </div>
                        <h4 className="font-bold text-white text-xs mb-1">{swag.name}</h4>
                        <button disabled={points < swag.cost} className={`text-[10px] font-bold px-2 py-1 rounded w-full border transition-colors mt-2 ${
                          points >= swag.cost ? 'bg-primary/20 text-primary border-primary/30 hover:bg-primary hover:text-white' : 'bg-black/40 text-zinc-600 border-white/5 cursor-not-allowed'
                        }`}>{swag.cost} PTS</button>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}

              {/* ── Chat tab ── */}
              {activeTab === 'chat' && (
                <motion.div key="chat" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className="p-0 flex flex-col h-[calc(100vh-210px)] relative">
                  <div className="p-4 border-b border-white/5 flex items-center justify-between bg-black/20">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center font-bold text-primary">AI</div>
                      <div>
                        <p className="text-xs font-bold text-white">Event Concierge</p>
                        <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">Awaiting Messages</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-hide">
                    {messages.length === 0 && (
                      <p className="text-center text-zinc-600 text-xs pt-8 italic">Ask anything about the event…</p>
                    )}
                    {messages.map(m => (
                      <div key={m.id} className={`flex ${m.type === 'sent' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[80%] p-3 rounded-2xl text-sm ${
                          m.type === 'sent' ? 'bg-primary text-white rounded-tr-none shadow-lg shadow-primary/10'
                          : 'bg-white/5 border border-white/5 text-zinc-300 rounded-tl-none'
                        }`}>
                          <p className="leading-relaxed">{m.text}</p>
                          <p className={`text-[9px] mt-1 font-bold ${m.type === 'sent' ? 'text-white/60' : 'text-zinc-600'}`}>{m.time}</p>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="p-4 bg-black/40 backdrop-blur-xl border-t border-white/5">
                    <div className="relative flex items-center gap-2">
                      <input type="text" placeholder="Type a message…" value={msgInput}
                        onChange={e => setMsgInput(e.target.value)}
                        onKeyPress={e => {
                          if (e.key === 'Enter' && msgInput.trim()) {
                            setMessages(prev => [...prev, { id: Date.now(), text: msgInput, type: 'sent', time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }]);
                            setMsgInput('');
                          }
                        }}
                        className="flex-1 bg-white/5 border border-white/10 rounded-full px-6 py-3 text-sm text-white focus:border-primary/50 outline-none transition-all placeholder-zinc-700 h-10"
                      />
                      <button onClick={() => {
                        if (!msgInput.trim()) return;
                        setMessages(prev => [...prev, { id: Date.now(), text: msgInput, type: 'sent', time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }]);
                        setMsgInput('');
                      }} className={`p-2.5 rounded-full transition-all ${msgInput.trim() ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'bg-white/5 text-zinc-600'}`}>
                        <Send className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* iOS-style Bottom Tab Bar */}
          <div className="fixed bottom-0 w-full max-w-md pb-safe pt-4 px-6 bg-black/60 backdrop-blur-2xl border-t border-white/10 flex justify-between z-50">
            <button onClick={() => setActiveTab('agenda')} className={`relative flex flex-col items-center gap-1.5 transition-colors ${activeTab === 'agenda' ? 'text-primary' : 'text-zinc-500'}`}>
              <Calendar className="w-5 h-5 md:w-6 md:h-6" />
              <span className="text-[9px] font-bold">Schedule</span>
              {savedSessions.length > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-yellow-400 text-black text-[9px] font-black flex items-center justify-center">{savedSessions.length}</span>
              )}
            </button>
            <button onClick={() => setActiveTab('network')} className={`flex flex-col items-center gap-1.5 transition-colors ${activeTab === 'network' ? 'text-primary' : 'text-zinc-500'}`}>
              <Users className="w-5 h-5 md:w-6 md:h-6" />
              <span className="text-[9px] font-bold">Network</span>
            </button>
            <button onClick={() => setActiveTab('chat')} className={`relative flex flex-col items-center gap-1.5 transition-colors ${activeTab === 'chat' ? 'text-primary' : 'text-zinc-500'}`}>
              <MessageSquare className="w-5 h-5 md:w-6 md:h-6" />
              <span className="text-[9px] font-bold">Messages</span>
              <span className="absolute -top-1 -right-0.5 w-2 h-2 rounded-full bg-red-500 border border-black animate-pulse" />
            </button>
            <button onClick={() => setActiveTab('badge')} className="relative -top-6 group">
              <div className={`w-14 h-14 md:w-16 md:h-16 rounded-full flex items-center justify-center transition-all shadow-xl ${activeTab === 'badge' ? 'bg-primary text-white shadow-primary/30' : 'bg-zinc-800 text-zinc-400 border border-white/10'}`}>
                <Ticket className="w-6 h-6 md:w-7 md:h-7" />
              </div>
            </button>
            <button onClick={() => setActiveTab('gamify')} className={`flex flex-col items-center gap-1.5 transition-colors ${activeTab === 'gamify' ? 'text-primary' : 'text-zinc-500'}`}>
              <Gamepad2 className="w-5 h-5 md:w-6 md:h-6" />
              <span className="text-[9px] font-bold">Rewards</span>
            </button>
          </div>
        </div>
      </div>
    </PageWrapper>
  );
};

export default AttendeePortal;
