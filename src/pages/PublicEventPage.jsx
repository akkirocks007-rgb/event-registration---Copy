import React, { useState, useEffect, useRef } from 'react';
import { AnimatePresence, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { Calendar, MapPin, Users, ArrowRight, ShieldCheck, CheckCircle2, Ticket, ChevronRight, Plus, Trash2, UserPlus, Star, Camera, Scan, Cpu, Eye, ImageIcon, Sparkles, RefreshCw, Banknote, CreditCard, Clock } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import DynamicBadge from '../components/DynamicBadge';
import { db } from '../firebase';
import { collection, addDoc, updateDoc, doc, increment, serverTimestamp, getDocs, getDoc, query, where } from 'firebase/firestore';
import { useParams, useNavigate } from 'react-router-dom';

const generateConfirmId = (prefix) => `${prefix}-${Math.random().toString(36).substr(2, 6).toUpperCase()}-${new Date().getFullYear()}`;

const PublicEventPage = () => {
  const { id: eventId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [confirmationId, setConfirmationId] = useState(null);
  const [registrationError, setRegistrationError] = useState(null);
  const [step, setStep] = useState(1);
  const [availableSessions, setAvailableSessions] = useState([]);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [selectedSessions, setSelectedSessions] = useState([]);
  const [guests, setGuests] = useState([]);
  const [cardImage, setCardImage] = useState(null); // data URL of uploaded visiting card
  const fileInputRef = useRef(null);
  const [paymentMethod, setPaymentMethod] = useState('cash'); // 'cash' | 'online' (online disabled)
  const [promoCode, setPromoCode] = useState('');
  const [promoError, setPromoError] = useState('');
  const [appliedDiscount, setAppliedDiscount] = useState(null); // { code, type: 'percentage'|'flat', value, label }
  
  // Form fields
  const [formData, setFormData] = useState({
      name: '',
      email: '',
      phone: '',
      company: '',
      designation: '',
      country: 'India',
  });

  // All state up front — React Rules of Hooks
  const [isRSVPMode] = useState(() => new URLSearchParams(window.location.search).get('rsvp') === 'true');
  const [viewMode, setViewMode] = useState('register'); // 'register', 'map', 'agenda'
  const [isEmbed] = useState(() => new URLSearchParams(window.location.search).get('embed') === 'true');

  // Holographic 3D motion values
  const mouseX = useMotionValue(0.5);
  const mouseY = useMotionValue(0.5);
  const springConfig = { damping: 25, stiffness: 200, mass: 0.5 };
  const smoothX = useSpring(mouseX, springConfig);
  const smoothY = useSpring(mouseY, springConfig);
  const rotateX = useTransform(smoothY, [0, 1], [15, -15]);
  const rotateY = useTransform(smoothX, [0, 1], [-15, 15]);
  const glareX = useTransform(smoothX, [0, 1], ['0%', '100%']);
  const glareY = useTransform(smoothY, [0, 1], ['0%', '100%']);

  // Event data — populated from Firestore. null = loading, false = not found.
  const [event, setEvent] = useState(null);
  const [eventLoadState, setEventLoadState] = useState('loading'); // 'loading' | 'found' | 'not-found'
  const [tenant, setTenant] = useState(null);

  // Master init effect — branding, embed mode, RSVP, and event fetch
  useEffect(() => {
    if (!eventId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setEventLoadState('not-found');
      return;
    }

    const fetchMeta = async () => {
      try {
        const evSnap = await getDoc(doc(db, "events", eventId));
        if (!evSnap.exists()) {
          setEventLoadState('not-found');
          return;
        }
        const evData = evSnap.data();
        setEvent(evData);
        setEventLoadState('found');

        try {
          const agendasQuery = query(collection(db, "agendas"), where("eventId", "==", eventId));
          const agendasSnap = await getDocs(agendasQuery);
          setAvailableSessions(agendasSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        } catch (e) {
          console.error("Failed to load agendas", e);
        }

        if (evData.tenantId) {
          try {
            const tenSnap = await getDoc(doc(db, "tenants", evData.tenantId));
            if (tenSnap.exists()) setTenant({ id: tenSnap.id, ...tenSnap.data() });
          } catch { /* ignore tenant fetch errors */ }
        }
      } catch (e) {
        console.error("Meta fetch error:", e);
        setEventLoadState('not-found');
      }
    };
    fetchMeta();

    const params = new URLSearchParams(window.location.search);
    const urlColor = params.get('color');
    const brandColor = urlColor ? `#${urlColor.replace('#', '')}` : '#10b981';
    document.documentElement.style.setProperty('--primary-color', brandColor);
    document.documentElement.style.setProperty('--primary-glow', `${brandColor}40`);
    return () => {
      document.documentElement.style.removeProperty('--primary-color');
      document.documentElement.style.removeProperty('--primary-glow');
    };
  }, [eventId]);

  const handleCardFile = (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (!file.type.startsWith('image/')) {
          alert('Please select an image file.');
          return;
      }
      if (file.size > 5 * 1024 * 1024) {
          alert('Image is too large. Please pick a file under 5 MB.');
          return;
      }
      const reader = new FileReader();
      reader.onload = (ev) => setCardImage(ev.target.result);
      reader.readAsDataURL(file);
  };

  const clearCardImage = () => {
      setCardImage(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleRegistration = async () => {
    if (tenant) {
      const expiry = new Date(tenant.validUntil);
      if (expiry < new Date()) {
        alert("🚨 Registration Blocked: This event's license has expired. Please contact the organizer.");
        return;
      }

      const totalRegs = (tenant.currentUsers || 0);
      if (totalRegs >= (tenant.userLimit || 500)) {
        alert("⚠️ Registration Blocked: This event has reached its maximum attendee capacity. Please contact the organizer.");
        return;
      }
    }

    if (!formData.name?.trim()) {
      setRegistrationError('Please enter your full name.');
      return;
    }
    if (!formData.email?.trim() && !formData.phone?.trim()) {
      setRegistrationError('Please provide either an email or phone number.');
      return;
    }

    setLoading(true);
    setRegistrationError(null);

    const confirmId = generateConfirmId('EP');
    const [firstName, ...rest] = formData.name.trim().split(/\s+/);
    const lastName = rest.join(' ') || '';

    const isFreeOrder = isFreeTicket(selectedTicket) && selectedSessions.length === 0;
    const resolvedPaymentMethod = isFreeOrder ? 'free' : paymentMethod;
    const resolvedPaymentStatus = isFreeOrder ? 'free' : (paymentMethod === 'cash' ? 'pending' : 'paid');

    // The Firestore SDK retries silently when offline, which would leave the spinner
    // hung forever. Race the write against a 15s ceiling so the user always gets feedback.
    const REGISTRATION_TIMEOUT_MS = 15000;
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(Object.assign(new Error('timeout'), { code: 'timeout' })), REGISTRATION_TIMEOUT_MS)
    );

    try {
      await Promise.race([
        addDoc(collection(db, "attendees"), {
            eventId: eventId || '1',
            ticketId: selectedTicket?.id || 'standard',
            ticketName: selectedTicket?.name || 'Standard Pass',
            ticketPrice: selectedTicket?.price || 'Free',
            firstName,
            lastName,
            email: formData.email.trim(),
            phone: formData.phone.trim(),
            company: formData.company.trim(),
            designation: formData.designation.trim(),
            guests: guests,
            agendas: selectedSessions.map(s => s.id),
            confirmationId: confirmId,
            status: 'Registered',
            scanned: false,
            paymentMethod: resolvedPaymentMethod,
            paymentStatus: resolvedPaymentStatus,
            createdAt: serverTimestamp(),
        }),
        timeoutPromise,
      ]);

      // Counter updates are best-effort; if they fail the registration itself is still valid.
      try {
        await updateDoc(doc(db, "events", eventId || '1'), { registrations: increment(1) });
        if (tenant?.id) {
          await updateDoc(doc(db, "tenants", tenant.id), { currentUsers: increment(1) });
        }
      } catch (counterErr) {
        console.warn("Counter update failed (registration still saved):", counterErr.message);
      }

      setConfirmationId(confirmId);
      setStep(4);
    } catch (e) {
      console.error("Registration failed:", e);
      const offlineLike = e?.code === 'timeout' || e?.code === 'unavailable' || !navigator.onLine;
      setRegistrationError(
        offlineLike
          ? "We couldn't reach the server within 15 seconds. Check your internet connection and try again."
          : `Registration failed: ${e?.message || 'unknown error'}. Please try again.`
      );
    } finally {
      setLoading(false);
    }
  };




  const handleMouseMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    mouseX.set(x);
    mouseY.set(y);
  };

  const handleMouseLeave = () => {
    mouseX.set(0.5);
    mouseY.set(0.5);
  };

  // ── Promo Code Logic — codes live on the event document (event.promoCodes) ──
  // Shape: [{ code, type: 'percentage'|'flat', value, label }]
  const applyPromoCode = () => {
    const code = promoCode.trim().toUpperCase();
    if (!code) { setPromoError('Please enter a promo code.'); return; }
    const codes = Array.isArray(event?.promoCodes) ? event.promoCodes : [];
    const match = codes.find(c => (c.code || '').toUpperCase() === code);
    if (!match) { setPromoError('Invalid or expired code.'); setAppliedDiscount(null); return; }
    setAppliedDiscount({ ...match, code });
    setPromoError('');
  };

  const removeDiscount = () => { setAppliedDiscount(null); setPromoCode(''); setPromoError(''); };

  const _getDiscountedPrice = (price) => {
    if (!appliedDiscount || !price || price === 'Free' || price === 'Complimentary') return null;
    const num = parseFloat(price.replace(/[^0-9.]/g, ''));
    if (isNaN(num) || num === 0) return null;
    const symbol = price.startsWith('₹') ? '₹' : price.startsWith('$') ? '$' : '';
    const discounted = appliedDiscount.type === 'percentage'
      ? Math.round(num * (1 - appliedDiscount.value / 100))
      : Math.max(0, Math.round(num - appliedDiscount.value));
    return `${symbol}${discounted}`;
  };

  const isFreeTicket = (t) => {
    if (!t) return true;
    const p = t.price;
    if (p === 0 || p === '0' || p == null) return true;
    if (typeof p === 'string') {
      const s = p.trim().toLowerCase();
      if (!s || s === 'free' || s === 'complimentary') return true;
      const n = parseFloat(s.replace(/[^0-9.]/g, ''));
      return isNaN(n) || n === 0;
    }
    return false;
  };
  const normalizeTicket = (t, idx) => ({
    id: t.id != null ? String(t.id) : `t${idx}`,
    name: t.name || 'Pass',
    price: t.price || 'Free',
    desc: t.description || t.desc || '',
    capacity: t.qty ?? t.capacity ?? 500,
    booked: t.bookedQty ?? t.booked ?? 0,
    categoryType: t.categoryType || 'standard',
    private: !!t.private,
  });
  const ticketTypes = (event && Array.isArray(event.ticketTypes) && event.ticketTypes.length > 0)
    ? event.ticketTypes.map(normalizeTicket)
    : [{
        id: 'general',
        name: 'General Admission',
        price: 'Free',
        desc: 'Free entry to this event',
        capacity: (event && event.userLimit) || tenant?.userLimit || 1000,
        booked: (event && event.registrations) || 0,
        categoryType: 'standard',
      }];

  // Add-on sessions for the event — populated from Firestore agendas.

  const handleTicketSelect = (ticket) => {
    if (ticket.booked >= ticket.capacity) {
        alert(`⚠️ Sorry, ${ticket.name} is currently sold out!`);
        return; 
    }
    setSelectedTicket(ticket);
    setAppliedDiscount(null);
    setPromoCode('');
    setStep(2);
  };

  const addGuest = () => {
    setGuests([...guests, { id: Date.now(), name: '', email: '' }]);
  };

  const removeGuest = (id) => {
    setGuests(guests.filter(g => g.id !== id));
  };

  if (eventLoadState === 'loading') {
    return (
      <div className="min-h-screen bg-bg-dark flex items-center justify-center text-white">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-2 border-white/20 border-t-primary rounded-full animate-spin" />
          <p className="text-sm text-zinc-500 uppercase tracking-widest font-bold">Loading event…</p>
        </div>
      </div>
    );
  }

  if (eventLoadState === 'not-found' || !event) {
    return (
      <div className="min-h-screen bg-bg-dark flex items-center justify-center text-white p-6">
        <div className="max-w-md text-center">
          <h1 className="text-3xl font-bold mb-3">Event not found</h1>
          <p className="text-zinc-500 mb-6">We couldn't find an event at this link. Check the URL with the organizer or try again later.</p>
          <button onClick={() => navigate('/')} className="btn-primary px-5 py-2 text-sm">Go to home</button>
        </div>
      </div>
    );
  }

  const eventTitle = event.name || event.title || 'Event';
  const eventDate = event.date || '';
  const eventDescription = event.description || '';
  const eventStats = Array.isArray(event.stats) ? event.stats : [];

  return (
    <div className="min-h-screen bg-bg-dark selection:bg-primary/30 text-white">
      <div className="bg-mesh opacity-50"></div>

      {!isEmbed && (
        <nav className="fixed top-0 w-full z-50 p-6 flex justify-between items-center backdrop-blur-md border-b border-white/5">
            <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center font-bold text-white">E</div>
                <span className="font-bold text-xl tracking-tight text-white">EventPro</span>
            </div>
            <div className="hidden md:flex gap-8 text-sm font-medium text-zinc-400">
                <a href="#" onClick={(e) => { e.preventDefault(); setViewMode('register'); }} className={`transition-colors ${viewMode === 'register' ? 'text-white' : 'text-zinc-400 hover:text-primary'}`}>Overview</a>
                <a href="#" onClick={(e) => { e.preventDefault(); setViewMode('agenda'); }} className={`transition-colors ${viewMode === 'agenda' ? 'text-white' : 'text-zinc-400 hover:text-primary'}`}>Agenda</a>
                <a href="#" onClick={(e) => { e.preventDefault(); setViewMode('map'); }} className={`transition-colors ${viewMode === 'map' ? 'text-white' : 'text-zinc-400 hover:text-primary'}`}>Venue Map</a>
            </div>
            <button onClick={() => navigate('/login')} className="btn-primary py-2 px-4 text-sm">Sign In</button>
        </nav>
      )}

      <main className={`${isEmbed ? 'pt-6' : 'pt-32'} pb-20 px-6 max-w-7xl mx-auto`}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-20 items-center">
            
            {/* Content Side */}
            <motion.div initial={{ opacity: 0, x: -30 }} animate={{ opacity: 1, x: 0 }}>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-bold uppercase tracking-widest mb-6">
                    <ShieldCheck className="w-3 h-3" /> Early Bird Registration Open
                </div>
                <h1 className="text-6xl md:text-7xl font-bold mb-6 tracking-tight leading-[1.1] text-white">
                    {eventTitle}
                </h1>
                <p className="text-xl text-zinc-400 mb-10 leading-relaxed max-w-xl">
                    {eventDescription}
                </p>

                <div className="flex flex-wrap gap-8 mb-12">
                    <div className="flex items-center gap-3 text-white">
                        <div className="p-3 bg-white/5 rounded-xl border border-white/10">
                            <Calendar className="w-6 h-6 text-primary" />
                        </div>
                        <div>
                            <p className="text-xs text-zinc-500 uppercase font-bold">Date</p>
                            <p className="font-medium">{eventDate}</p>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-3 gap-6">
                    {eventStats.map(stat => (
                        <div key={stat.label} className="glass-panel p-4 text-center">
                            <p className="text-2xl font-bold text-primary">{stat.value}</p>
                            <p className="text-xs text-zinc-500 uppercase font-bold tracking-wider">{stat.label}</p>
                        </div>
                    ))}
                </div>
            </motion.div>

            {/* Right Side - Dynamic Content */}
            <div className="relative">
                <div className="absolute inset-0 bg-primary/20 blur-[100px] -z-10 rounded-full"></div>
                
                <AnimatePresence mode="wait">
                    {viewMode === 'register' && (
                        <motion.div key="register" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="glass-panel p-8 border-white/10 shadow-2xl relative overflow-visible min-h-[500px] flex flex-col">
                            {isRSVPMode && (
                                <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-primary text-white text-[10px] font-black uppercase tracking-[0.2em] px-4 py-1.5 rounded-full shadow-lg shadow-primary/20 z-20 flex items-center gap-2 border border-white/20">
                                    <Star className="w-3 h-3 fill-white" />
                                    Personal Invitation
                                </div>
                            )}
                            
                            <AnimatePresence mode="wait">
                                {step === 1 && (
                                    <motion.div 
                                        key="tickets" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -20 }}
                                        className="space-y-6 flex-1"
                                    >
                                        <h2 className="text-3xl font-bold mb-2">Select Your Pass</h2>
                                        <p className="text-zinc-500 mb-8 text-sm">Choose the access level that fits your goals.</p>
                                        
                                        <div className="space-y-4">
                                            {ticketTypes.map((t) => {
                                                const soldOut = t.booked >= t.capacity;
                                                const capPct = Math.round((t.booked / t.capacity) * 100);
                                                return (
                                                <button 
                                                    key={t.id} 
                                                    onClick={() => handleTicketSelect(t)}
                                                    disabled={soldOut}
                                                    className={`w-full relative group overflow-hidden rounded-2xl glass-card p-6 text-left transition-all ${ soldOut ? 'opacity-50 cursor-not-allowed' : 'hover:border-primary/40' }`}
                                                >
                                                    {t.private && isRSVPMode && <div className="absolute top-0 right-0 p-2 text-primary font-bold text-xs uppercase tracking-widest bg-primary/10 rounded-bl-lg">Invited</div>}
                                                    {soldOut && <div className="absolute top-2 right-3 text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/30">Sold Out</div>}
                                                    <div className="flex justify-between items-center mb-2">
                                                        <h3 className={`text-lg font-bold ${ soldOut ? 'text-zinc-500' : 'text-white group-hover:text-primary transition-colors' }`}>{t.name}</h3>
                                                        <span className="text-xl font-black">{t.price}</span>
                                                    </div>
                                                    <p className="text-sm text-zinc-400 mb-3">{t.desc}</p>
                                                    <div className="flex items-center gap-3">
                                                        <div className="flex-1 h-1 bg-white/5 rounded-full overflow-hidden">
                                                            <div className={`h-full rounded-full transition-all ${ capPct >= 90 ? 'bg-red-500' : capPct >= 70 ? 'bg-amber-500' : 'bg-emerald-500' }`}
                                                                style={{ width: `${capPct}%` }} />
                                                        </div>
                                                        <span className="text-[10px] text-zinc-600 font-bold whitespace-nowrap">{t.booked}/{t.capacity} filled</span>
                                                    </div>
                                                    {!soldOut && <div className="absolute bottom-0 left-0 w-0 h-0.5 bg-gradient-to-r from-primary to-blue-500 group-hover:w-full transition-all duration-500"></div>}
                                                </button>
                                                );
                                            })}
                                        </div>
                                    </motion.div>
                                )}

                                {step === 2 && (
                                    <motion.div 
                                        key="schedule" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                                        className="flex flex-col h-full"
                                    >
                                        <button onClick={() => setStep(1)} className="text-zinc-500 hover:text-white flex items-center gap-1 text-sm mb-6 transition-colors">
                                            <ChevronRight className="w-4 h-4 rotate-180" /> Back to Passes
                                        </button>
                                        
                                        <div className="flex-1 space-y-4">
                                            <div>
                                                <h2 className="text-2xl font-bold mb-1">Build Your Schedule</h2>
                                                <p className="text-zinc-500 text-sm mb-6">Select your premium add-on sessions. We'll automatically prevent time clashes.</p>
                                            </div>
                                            
                                            <div className="space-y-3 max-h-[350px] overflow-y-auto pr-2 custom-scrollbar">
                                                {availableSessions.map(session => {
                                                    const isSelected = selectedSessions.some(s => s.id === session.id);
                                                    const hasClash = !isSelected && selectedSessions.some(s => s.time === session.time);
                                                    return (
                                                        <div 
                                                            key={session.id}
                                                            onClick={() => {
                                                                if (hasClash) return;
                                                                if (isSelected) {
                                                                    setSelectedSessions(selectedSessions.filter(s => s.id !== session.id));
                                                                } else {
                                                                    setSelectedSessions([...selectedSessions, session]);
                                                                }
                                                            }}
                                                            className={`p-4 rounded-xl border flex items-center justify-between transition-all ${
                                                                hasClash ? 'opacity-40 grayscale cursor-not-allowed border-white/5 bg-black/20' 
                                                                : isSelected ? 'bg-primary/20 border-primary/50 cursor-pointer shadow-[0_0_15px_rgba(84,34,255,0.2)]'
                                                                : 'bg-white/5 border-white/10 hover:border-white/30 cursor-pointer'
                                                            }`}
                                                        >
                                                            <div>
                                                                <div className="flex items-center gap-2 mb-1">
                                                                    <span className="text-[10px] font-black uppercase tracking-widest text-primary">{session.time}</span>
                                                                    {hasClash && <span className="text-[9px] bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full border border-red-500/20 uppercase tracking-widest font-black">Time Clash</span>}
                                                                </div>
                                                                <h4 className="font-bold text-white text-sm">{session.title}</h4>
                                                                <p className="text-xs text-zinc-400 mt-1">{session.selectedSpeakers?.length || 0} Speaker(s) • {session.hallName || session.track}</p>
                                                            </div>
                                                            <div className="text-right">
                                                                <div className={`text-lg font-black ${isSelected ? 'text-white' : 'text-zinc-300'}`}>
                                                                   {session.isFree || session.price === 0 ? 'Free' : `$${session.price}`}
                                                                </div>
                                                                <div className={`w-6 h-6 rounded-full border-2 mt-2 ml-auto flex items-center justify-center transition-colors ${isSelected ? 'bg-primary border-primary text-white' : 'border-white/20'}`}>
                                                                    {isSelected && <CheckCircle2 className="w-4 h-4" />}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>

                                        <button 
                                            onClick={() => setStep(3)}
                                            className="btn-primary w-full py-4 mt-6 flex items-center justify-center gap-2 text-lg active:scale-95 transition-transform"
                                        >
                                            Continue to Details <ArrowRight className="w-5 h-5" />
                                        </button>
                                    </motion.div>
                                )}

                                {step === 3 && (
                                    <motion.div 
                                        key="form" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                                        className="flex flex-col h-full"
                                    >
                                        <button onClick={() => setStep(2)} className="text-zinc-500 hover:text-white flex items-center gap-1 text-sm mb-6 transition-colors">
                                            <ChevronRight className="w-4 h-4 rotate-180" /> Back to Schedule
                                        </button>
                                        
                                        <div className="flex-1 space-y-4">
                                            <h2 className="text-2xl font-bold mb-6">Your Details</h2>
                                            
                                            {/* Visiting card upload (optional) */}
                                            <div className="mb-8 p-1 bg-white/5 border border-white/5 rounded-2xl relative overflow-hidden group">
                                                <input
                                                    ref={fileInputRef}
                                                    type="file"
                                                    accept="image/*"
                                                    onChange={handleCardFile}
                                                    className="hidden"
                                                />
                                                {!cardImage ? (
                                                    <div onClick={() => fileInputRef.current?.click()} className="py-8 border-2 border-dashed border-white/10 rounded-xl flex flex-col items-center justify-center gap-3 cursor-pointer hover:bg-white/5 transition-all">
                                                        <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center border border-primary/20">
                                                            <Camera className="w-6 h-6 text-primary" />
                                                        </div>
                                                        <div className="text-center">
                                                            <p className="text-sm font-bold text-white">Upload Visiting Card (optional)</p>
                                                            <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-black mt-1">JPEG / PNG · max 5 MB</p>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="relative aspect-[1.58/1] bg-bg-dark rounded-xl border border-white/10 overflow-hidden">
                                                        <img src={cardImage} alt="Visiting card preview" className="absolute inset-0 w-full h-full object-contain" />
                                                        <button onClick={clearCardImage} className="absolute top-2 right-2 p-1.5 bg-black/60 rounded-full text-zinc-300 hover:text-white transition-colors z-40">
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                )}
                                            </div>

                                            <div className="relative">
                                                <p className="text-[10px] font-bold text-zinc-500 uppercase mb-1 ml-1">Country / Region</p>
                                                <select value={formData.country} onChange={e => setFormData({...formData, country: e.target.value})} className="w-full input-base py-2">
                                                    <option value="India">India 🇮🇳</option>
                                                    <option value="USA">United States 🇺🇸</option>
                                                    <option value="UK">United Kingdom 🇬🇧</option>
                                                    <option value="Other">Other Global 🌏</option>
                                                </select>
                                            </div>

                                            <div className="relative">
                                                <input type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="Full Name" className="w-full input-base" />
                                            </div>
                                            <div className="grid grid-cols-2 gap-4">
                                                <input type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} placeholder="Email Address" className="w-full input-base" />
                                                <input type="tel" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} placeholder="Mobile Number" className="w-full input-base" />
                                            </div>

                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="relative">
                                                    <input type="text" value={formData.company} onChange={e => setFormData({...formData, company: e.target.value})} placeholder="Organization" className="w-full input-base" />
                                                </div>
                                                <div className="relative">
                                                    <input type="text" value={formData.designation || ''} onChange={e => setFormData({...formData, designation: e.target.value})} placeholder="Job Title" className="w-full input-base" />
                                                </div>
                                            </div>

                                            <div className="pt-6 border-t border-white/5 space-y-4">
                                                <div className="flex justify-between items-center">
                                                    <h4 className="text-sm font-bold text-zinc-300">Additional Guests</h4>
                                                    <button onClick={addGuest} className="text-xs text-primary flex items-center gap-1 hover:underline">
                                                        <UserPlus className="w-4 h-4" /> Add Guest
                                                    </button>
                                                </div>
                                                
                                                {guests.map((g) => (
                                                    <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} key={g.id} className="p-4 bg-white/5 rounded-xl border border-white/5 relative">
                                                        <button onClick={() => removeGuest(g.id)} className="absolute top-2 right-2 text-zinc-600 hover:text-red-400">
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                        <div className="grid grid-cols-2 gap-3">
                                                            <input type="text" className="input-base py-1.5 px-3 text-xs" placeholder="Guest Name" />
                                                            <input type="email" className="input-base py-1.5 px-3 text-xs" placeholder="Guest Email" />
                                                        </div>
                                                    </motion.div>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Promo Code Box */}
                                        {selectedTicket && selectedTicket.price !== 'Free' && selectedTicket.price !== 'Complimentary' && (
                                          <div className="mt-4 p-4 bg-white/5 rounded-2xl border border-white/10">
                                            {!appliedDiscount ? (
                                              <>
                                                <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-2">Promo / Discount Code</p>
                                                <div className="flex gap-2">
                                                  <input
                                                    type="text"
                                                    value={promoCode}
                                                    onChange={e => { setPromoCode(e.target.value.toUpperCase()); setPromoError(''); }}
                                                    onKeyDown={e => e.key === 'Enter' && applyPromoCode()}
                                                    placeholder="Enter code (e.g. EARLY20)"
                                                    className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm font-mono outline-none focus:border-primary/50 transition-colors placeholder-zinc-700"
                                                  />
                                                  <button onClick={applyPromoCode} className="px-4 py-2 bg-primary/20 border border-primary/30 text-primary text-xs font-black uppercase tracking-widest rounded-xl hover:bg-primary hover:text-white transition-all">Apply</button>
                                                </div>
                                                {promoError && <p className="text-xs text-red-400 mt-2">{promoError}</p>}
                                              </>
                                            ) : (
                                              <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-3">
                                                  <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center">
                                                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                                                  </div>
                                                  <div>
                                                    <p className="text-xs font-black text-emerald-400">{appliedDiscount.label}</p>
                                                    <p className="text-[10px] text-zinc-500">Code: <span className="font-mono text-white">{appliedDiscount.code}</span></p>
                                                  </div>
                                                </div>
                                                <button onClick={removeDiscount} className="text-[10px] text-zinc-500 hover:text-red-400 transition-colors font-bold uppercase tracking-widest">Remove</button>
                                              </div>
                                            )}
                                          </div>
                                        )}

                                        {/* Order Summary */}
                                        {selectedTicket && (
                                          <div className="mt-3 p-4 rounded-2xl bg-primary/5 border border-primary/10">
                                            <div className="flex justify-between text-sm font-bold text-zinc-300 mb-2 border-b border-white/5 pb-2">
                                              <span>Order Summary</span>
                                              <span>{guests.length + 1} Ticket(s)</span>
                                            </div>
                                            <div className="flex justify-between text-sm mb-1">
                                              <span className="text-zinc-400">Base Pass: {selectedTicket.name}</span>
                                              <span className="text-white">
                                                {selectedTicket.price}
                                              </span>
                                            </div>
                                            {selectedSessions.length > 0 && (
                                                <div className="flex justify-between text-sm mb-2 border-b border-white/5 pb-2">
                                                    <span className="text-zinc-400">{selectedSessions.length} Add-on Sessions</span>
                                                    <span className="text-white">+${selectedSessions.reduce((sum, s) => sum + s.price, 0)}</span>
                                                </div>
                                            )}
                                            <div className="flex justify-between text-sm pt-1">
                                              <span className="text-white font-bold">Subtotal</span>
                                              <span className={`font-bold ${ appliedDiscount ? 'line-through text-zinc-600' : 'text-white' }`}>
                                                ${((selectedTicket.price === 'Free' ? 0 : parseFloat(selectedTicket.price.replace(/[^0-9.]/g, ''))) + selectedSessions.reduce((sum, s) => sum + s.price, 0)) * (guests.length + 1)}
                                              </span>
                                            </div>
                                            {appliedDiscount && (
                                              <div className="flex justify-between text-sm mt-1">
                                                <span className="text-emerald-400 font-bold">Total After Discount</span>
                                                <span className="text-emerald-400 font-black text-lg">
                                                  ${Math.max(0, (((selectedTicket.price === 'Free' ? 0 : parseFloat(selectedTicket.price.replace(/[^0-9.]/g, ''))) + selectedSessions.reduce((sum, s) => sum + s.price, 0)) * (guests.length + 1)) * (appliedDiscount.type === 'percentage' ? (1 - appliedDiscount.value/100) : 1) - (appliedDiscount.type === 'flat' ? appliedDiscount.value : 0)).toFixed(2)}
                                                </span>
                                              </div>
                                            )}
                                          </div>
                                        )}

                                        {/* Payment Method — only shown when there's something to pay */}
                                        {selectedTicket && !(isFreeTicket(selectedTicket) && selectedSessions.length === 0) && (
                                          <div className="mt-3 p-4 rounded-2xl bg-white/5 border border-white/10">
                                            <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-3">Payment Method</p>
                                            <div className="grid grid-cols-2 gap-3">
                                              <button
                                                type="button"
                                                onClick={() => setPaymentMethod('cash')}
                                                className={`p-3 rounded-xl border text-left transition-all ${paymentMethod === 'cash' ? 'border-primary/60 bg-primary/10' : 'border-white/10 bg-white/5 hover:border-white/20'}`}
                                              >
                                                <div className="flex items-center gap-2 mb-1">
                                                  <Banknote className="w-4 h-4 text-emerald-400" />
                                                  <span className="text-sm font-bold text-white">Pay at Door</span>
                                                </div>
                                                <p className="text-[10px] text-zinc-500">Pay in cash when you arrive at the venue.</p>
                                              </button>
                                              <button
                                                type="button"
                                                disabled
                                                className="p-3 rounded-xl border border-white/5 bg-white/5 text-left opacity-50 cursor-not-allowed"
                                              >
                                                <div className="flex items-center gap-2 mb-1">
                                                  <CreditCard className="w-4 h-4 text-zinc-400" />
                                                  <span className="text-sm font-bold text-zinc-300">Online</span>
                                                </div>
                                                <p className="text-[10px] text-zinc-500">Coming soon — please choose Pay at Door for now.</p>
                                              </button>
                                            </div>
                                            {paymentMethod === 'cash' && (
                                              <div className="mt-3 flex items-start gap-2 text-[11px] text-amber-300/90">
                                                <Clock className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                                                <span>Your booking will be marked <b>Pending</b> until staff collects payment at entry.</span>
                                              </div>
                                            )}
                                          </div>
                                        )}

                                        {registrationError && (
                                          <div className="mt-4 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-sm flex items-start gap-2">
                                            <span className="font-bold">⚠</span>
                                            <span>{registrationError}</span>
                                          </div>
                                        )}

                                        <button
                                            onClick={handleRegistration}
                                            disabled={loading}
                                            className="btn-primary w-full py-4 mt-4 flex items-center justify-center gap-2 text-lg active:scale-95 transition-transform disabled:opacity-60"
                                        >
                                            {loading ? (
                                                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                            ) : (
                                                <>Complete Order <ArrowRight className="w-5 h-5" /></>
                                            )}
                                        </button>
                                    </motion.div>
                                )}

                                {step === 4 && (
                                    <motion.div 
                                        key="success" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                                        className="text-center py-6 flex-1"
                                    >
                                        <div className={`w-16 h-16 ${selectedTicket?.categoryType === 'approval' ? 'bg-amber-500/20' : 'bg-green-500/20'} rounded-full flex items-center justify-center mx-auto mb-6`}>
                                            {selectedTicket?.categoryType === 'approval' ? (
                                                <Clock className="w-10 h-10 text-amber-500" />
                                            ) : (
                                                <CheckCircle2 className="w-10 h-10 text-green-500" />
                                            )}
                                        </div>
                                        <h2 className="text-2xl font-bold mb-4">
                                            {selectedTicket?.categoryType === 'approval' ? 'Application Received!' : 'Registration Successful!'}
                                        </h2>

                                        {selectedTicket?.categoryType === 'approval' ? (
                                            <div className="p-6 glass-panel border-amber-500/20 mb-8">
                                                <p className="text-sm text-zinc-400 leading-relaxed mb-4">
                                                    Your application for the <span className="text-white font-bold">{selectedTicket.name}</span> is currently <span className="text-amber-400 font-bold">Pending Review</span>.
                                                </p>
                                                <p className="text-xs text-zinc-500 italic">
                                                    Our team will verify your credentials and notify you via email shortly. Once approved, your digital ticket will appear here.
                                                </p>
                                            </div>
                                        ) : event?.badgeDesign ? (
                                          <div className="flex justify-center mb-8">
                                            <DynamicBadge
                                              design={event.badgeDesign}
                                              attendee={{
                                                firstName: formData.name,
                                                email: formData.email,
                                                phone: formData.phone,
                                                company: formData.company,
                                                designation: formData.designation,
                                                ticketName: selectedTicket?.name,
                                                confirmationId
                                              }}
                                              eventName={event?.name || 'Event'}
                                            />
                                          </div>
                                        ) : (
                                          <div className="perspective-1000 mb-8 z-10 relative">
                                              <motion.div
                                                  onMouseMove={handleMouseMove}
                                                  onMouseLeave={handleMouseLeave}
                                                  style={{ rotateX, rotateY, transformStyle: "preserve-3d" }}
                                                  className="bg-white rounded-2xl p-6 text-slate-900 text-left relative shadow-2xl cursor-pointer"
                                              >
                                                  <motion.div
                                                      className="absolute inset-0 bg-gradient-to-tr from-white/0 via-white/40 to-white/0 rounded-2xl pointer-events-none mix-blend-overlay"
                                                      style={{ backgroundPosition: `${glareX}% ${glareY}%`, backgroundSize: '200% 200%' }}
                                                  />
                                                  <div style={{ transform: "translateZ(30px)", transformStyle: "preserve-3d" }}>
                                                      <div className="flex justify-between items-start mb-6">
                                                          <div>
                                                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 font-mono">TICKET: {selectedTicket?.name}</p>
                                                              <p className="text-xl font-black">{(formData.name || 'Attendee').toUpperCase()}</p>
                                                          </div>
                                                          <div className="w-16 h-16 bg-slate-900 p-1.5 rounded-lg border border-slate-700 shadow-inner">
                                                              <QRCodeSVG
                                                                  value={confirmationId || ''}
                                                                  size={52}
                                                                  bgColor={"#0f172a"}
                                                                  fgColor={"#ffffff"}
                                                                  level={"H"}
                                                              />
                                                          </div>
                                                      </div>
                                                      <div className="border-t-2 border-dashed border-slate-100 mt-4 pt-4 flex justify-between items-center text-xs font-bold text-slate-400">
                                                          <span>CONFIRMATION ID: {confirmationId}</span>
                                                          <span className="text-primary font-black uppercase">SCAN AT ENTRY</span>
                                                      </div>
                                                  </div>
                                              </motion.div>
                                          </div>
                                        )}

                                        <div className="flex gap-4">
                                            {selectedTicket?.categoryType === 'approval' ? (
                                                <button onClick={() => setStep(1)} className="flex-1 py-3 btn-primary text-xs font-bold">Return to Overview</button>
                                            ) : (
                                                <>
                                                    <button className="flex-1 py-3 glass-card bg-white/5 border-white/10 text-white text-xs font-bold">Add to Wallet</button>
                                                    <button className="flex-1 py-3 btn-primary text-xs font-bold">Download PDF</button>
                                                </>
                                            )}
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </motion.div>
                    )}

                    {viewMode === 'map' && (
                        <motion.div key="map" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="glass-panel p-8 border-white/10 shadow-2xl relative min-h-[500px] flex flex-col">
                            <h3 className="text-xl font-bold mb-6 text-white flex items-center gap-2">
                                <MapPin className="w-5 h-5 text-primary" /> Venue Map
                            </h3>
                            <div className="flex-1 flex flex-col items-center justify-center text-center text-zinc-500">
                                <MapPin className="w-10 h-10 mb-3 opacity-40" />
                                <p className="text-sm">No floor plan published for this event yet.</p>
                                <p className="text-xs text-zinc-600 mt-1">The organizer can publish one from the admin Map Builder.</p>
                            </div>
                        </motion.div>
                    )}

                    {viewMode === 'agenda' && (
                        <motion.div key="agenda" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="glass-panel p-8 border-white/10 shadow-2xl relative min-h-[500px] flex flex-col overflow-y-auto">
                            <h3 className="text-xl font-bold mb-6 text-white flex items-center gap-2">
                                <Calendar className="w-5 h-5 text-primary" /> Event Agenda
                            </h3>
                            {availableSessions.length === 0 ? (
                                <div className="flex-1 flex flex-col items-center justify-center text-center text-zinc-500">
                                    <Calendar className="w-10 h-10 mb-3 opacity-40" />
                                    <p className="text-sm">Agenda has not been published yet.</p>
                                    <p className="text-xs text-zinc-600 mt-1">Check back closer to the event date.</p>
                                </div>
                            ) : (
                                <div className="space-y-6 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-white/10 before:to-transparent flex-1 mt-4">
                                    {availableSessions.map((session, i) => (
                                        <div key={session.id || i} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                                            <div className="flex items-center justify-center w-10 h-10 rounded-full border border-white/10 bg-bg-dark text-slate-500 shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10">
                                                <span className="text-[10px] font-bold text-primary">{(session.time || '').split(' ')[0]}</span>
                                            </div>
                                            <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded-xl border border-white/5 bg-white/5 hover:bg-white/10 transition-colors cursor-pointer">
                                                <span className="text-[10px] uppercase font-bold tracking-widest px-2 py-0.5 rounded mb-2 inline-block bg-primary/20 text-primary">
                                                    {session.hallName || session.track || 'Session'}
                                                </span>
                                                <h4 className="font-bold text-white text-md mb-1 leading-tight">{session.title}</h4>
                                                <p className="text-xs text-zinc-400 flex items-center gap-1 mt-2"><Users className="w-3 h-3" /> {session.selectedSpeakers?.length || 0} Speaker(s)</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </motion.div>
                    )}
                    </AnimatePresence>
                </div>
            </div>
      </main>

      <footer className="border-t border-white/5 py-10 text-center text-zinc-600 text-sm">
        <p>&copy; 2026 EventPro Platform. All Rights Reserved.</p>
      </footer>
    </div>
  );
};

export default PublicEventPage;
