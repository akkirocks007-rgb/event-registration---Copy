import React, { useState } from 'react';
import Sidebar from '../components/Sidebar';
import PageWrapper from '../components/PageWrapper';
import NotificationCenter from '../components/NotificationCenter';
import { useNavigate } from 'react-router-dom';
import { QrCode, Search, CheckCircle2, AlertCircle, Clock, Filter, UserCheck, Bell, Plus, Printer, XCircle, RefreshCw, BadgeCheck, UserPlus } from 'lucide-react';
import { AnimatePresence } from 'framer-motion';
import { db, auth, RecaptchaVerifier, signInWithPhoneNumber } from '../firebase';
import { collection, onSnapshot, query, updateDoc, doc, addDoc, serverTimestamp } from 'firebase/firestore';

// ─── SUNMI V2s 58mm Thermal Printer Bridge ─────────────────────────────────
const DEFAULT_PRINT_CONFIG = {
  printName: true,
  printTicket: true,
  printCompany: true,
  printEmail: false,
  printJobTitle: false,
  printQR: true,
  printEventHeader: true,
  copies: 1,
};

const loadPrintConfig = () => {
  try {
    const saved = localStorage.getItem('eventpro_print_config');
    return saved ? { ...DEFAULT_PRINT_CONFIG, ...JSON.parse(saved) } : DEFAULT_PRINT_CONFIG;
  } catch { return DEFAULT_PRINT_CONFIG; }
};

const generateConfirmId = (prefix) => `${prefix}-${Math.random().toString(36).substr(2, 6).toUpperCase()}-${new Date().getFullYear()}`;

const savePrintConfig = (cfg) => {
  try { localStorage.setItem('eventpro_print_config', JSON.stringify(cfg)); } catch { /* noop */ }
};

const printBadgeOnSunmi = async ({ name, ticket, company, email, jobTitle, attendeeId, config = DEFAULT_PRINT_CONFIG }) => {
  try {
    const { SunmiPrinter, AlignmentModeEnum } = await import('@kduma-autoid/capacitor-sunmi-printer');
    for (let copy = 0; copy < (config.copies || 1); copy++) {
      await SunmiPrinter.enterPrinterBuffer({ clean: true });
      if (config.printEventHeader) {
        await SunmiPrinter.setAlignment({ alignment: AlignmentModeEnum.CENTER });
        await SunmiPrinter.setFontSize({ size: 32 });
        await SunmiPrinter.setBold({ enable: true });
        await SunmiPrinter.printText({ text: 'EVENTPRO LIVE\n' });
        await SunmiPrinter.setBold({ enable: false });
        await SunmiPrinter.setFontSize({ size: 20 });
        await SunmiPrinter.printText({ text: '--------------------------------\n' });
      }
      await SunmiPrinter.setAlignment({ alignment: AlignmentModeEnum.LEFT });
      if (config.printName && name) {
        await SunmiPrinter.setFontSize({ size: 28 });
        await SunmiPrinter.setBold({ enable: true });
        await SunmiPrinter.printText({ text: `${name}\n` });
        await SunmiPrinter.setBold({ enable: false });
      }
      await SunmiPrinter.setFontSize({ size: 22 });
      if (config.printTicket && ticket) await SunmiPrinter.printText({ text: `Ticket: ${ticket}\n` });
      if (config.printCompany && company) await SunmiPrinter.printText({ text: `Org: ${company}\n` });
      if (config.printJobTitle && jobTitle) await SunmiPrinter.printText({ text: `Role: ${jobTitle}\n` });
      if (config.printEmail && email) await SunmiPrinter.printText({ text: `${email}\n` });
      if (config.printQR) {
        await SunmiPrinter.printText({ text: '--------------------------------\n' });
        await SunmiPrinter.setAlignment({ alignment: AlignmentModeEnum.CENTER });
        await SunmiPrinter.printQRCode({ content: attendeeId || email, size: 8, errorLevel: 1 });
      }
      await SunmiPrinter.printText({ text: '\n\n' });
      await SunmiPrinter.exitPrinterBuffer({ commit: true });
    }
  } catch (e) {
    console.info('[EventPro] SUNMI printer not available in browser — skipping.', e?.message);
  }
};

const SupervisorDashboard = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('overview');
  const [search, setSearch] = useState('');
  const [isSpotModalOpen, setIsSpotModalOpen] = useState(false);
  const [attendees, setAttendees] = useState([]);
  const [, setLoading] = useState(true);
  const [spotForm, setSpotForm] = useState({ firstName: '', lastName: '', email: '', phone: '', company: '', designation: '', ticket: 'General Delegate' });
  // Print Config – loaded from localStorage. showPrintSetup = true on first-ever launch.
  const [printConfig, setPrintConfig] = useState(loadPrintConfig);
  const [showPrintSetup, setShowPrintSetup] = useState(() => !localStorage.getItem('eventpro_print_config'));
  const [draftConfig, setDraftConfig] = useState(loadPrintConfig);
  const [spotStep, setSpotStep] = useState('details'); // 'details', 'otp'
  const [spotOtp, setSpotOtp] = useState(['', '', '', '', '', '']);
  const [spotConfirmation, setSpotConfirmation] = useState(null);
  const [spotAuthError, setSpotAuthError] = useState(null);

  React.useEffect(() => {
    const q = query(collection(db, "attendees"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setAttendees(data);
        setLoading(false);
    }, (err) => {
        console.warn("Firestore error (using fallback):", err);
        setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const [printStatus, setPrintStatus] = useState(null); // 'printing' | 'done' | null

  const getAttendeeName = (a) => (`${a.firstName || ''} ${a.lastName || ''}`.trim()) || a.primaryName || 'Unknown';
  const getAttendeeEmail = (a) => a.email || a.primaryEmail || '';

  const handleCheckIn = async (attendeeId) => {
    const attendee = attendees.find(a => a.id === attendeeId);
    try {
        const docRef = doc(db, "attendees", attendeeId);
        await updateDoc(docRef, { scanned: true, status: 'checked-in' });
    } catch (e) {
        console.error("Check-in failed:", e);
        setAttendees(prev => prev.map(a => a.id === attendeeId ? { ...a, scanned: true, status: 'checked-in' } : a));
    }
    if (attendee) {
      setPrintStatus('printing');
      await printBadgeOnSunmi({ name: getAttendeeName(attendee), ticket: attendee.ticketName || 'General Delegate', company: attendee.company, jobTitle: attendee.designation || attendee.jobTitle, email: getAttendeeEmail(attendee), attendeeId, config: printConfig });
      setPrintStatus('done');
      setTimeout(() => setPrintStatus(null), 3000);
    }
  };

  const handleReprint = async (attendeeId) => {
    const attendee = attendees.find(a => a.id === attendeeId);
    if (attendee) {
        if(window.confirm(`Reprint lost badge for ${getAttendeeName(attendee)}?`)) {
            setPrintStatus('printing');
            await printBadgeOnSunmi({ name: getAttendeeName(attendee), ticket: attendee.ticketName || 'General Delegate', company: attendee.company, jobTitle: attendee.designation || attendee.jobTitle, email: getAttendeeEmail(attendee), attendeeId, config: printConfig });
            setPrintStatus('done');
            setTimeout(() => setPrintStatus(null), 3000);
        }
    }
  };

  const setupSpotRecaptcha = () => {
    if (window.spotRecaptcha) return;
    window.spotRecaptcha = new RecaptchaVerifier(auth, 'supervisor-spot-recaptcha', {
        'size': 'invisible'
    });
  };

  const requestSpotOTP = async () => {
      if (!spotForm.firstName || !spotForm.email || !spotForm.phone) {
          alert('First Name, Email, and Phone Number are required.');
          return;
      }
      setPrintStatus('printing'); 
      setSpotAuthError(null);
      try {
          let formattedPhone = spotForm.phone.trim();
          if (!formattedPhone.startsWith('+')) formattedPhone = `+91${formattedPhone}`;
          
          setupSpotRecaptcha();
          const confirmation = await signInWithPhoneNumber(auth, formattedPhone, window.spotRecaptcha);
          setSpotConfirmation(confirmation);
          setSpotStep('otp');
      } catch (err) {
          setSpotAuthError(err.message);
      } finally {
          setPrintStatus(null);
      }
  };

  const verifyAndRegisterSpot = async () => {
      const code = spotOtp.join('');
      if (code.length < 6) return;

      setPrintStatus('printing');
      setSpotAuthError(null);

      try {
          // 1. Verify OTP
          await spotConfirmation.confirm(code);

          const confirmationId = generateConfirmId('SR');
          const fullName = `${spotForm.firstName} ${spotForm.lastName}`.trim();
          const newAttendee = {
              firstName: spotForm.firstName,
              lastName: spotForm.lastName,
              email: spotForm.email,
              phone: spotForm.phone,
              company: spotForm.company,
              designation: spotForm.designation,
              ticketName: spotForm.ticket,
              confirmationId,
              status: 'checked-in',
              scanned: true,
              spotRegistration: true,
          };

          // 2. Save to Firestore
          let finalId = Date.now().toString();
          try {
              const docRef = await addDoc(collection(db, "attendees"), { ...newAttendee, createdAt: serverTimestamp() });
              finalId = docRef.id;
          } catch {
              setAttendees(prev => [{ ...newAttendee, id: finalId }, ...prev]);
          }

          // 3. Print Hardware Badge
          await printBadgeOnSunmi({
              name: fullName,
              ticket: newAttendee.ticketName,
              company: newAttendee.company,
              jobTitle: newAttendee.designation,
              email: newAttendee.email,
              attendeeId: finalId,
              config: printConfig
          });

          // 4. Finalize
          setPrintStatus('done');
          setTimeout(() => {
              setIsSpotModalOpen(false);
              setSpotForm({ firstName: '', lastName: '', email: '', phone: '', company: '', designation: '', ticket: 'General Delegate' });
              setSpotStep('details');
              setSpotOtp(['', '', '', '', '', '']);
              setPrintStatus(null);
          }, 2000);

      } catch (err) {
          console.error("Spot verification failed:", err);
          setSpotAuthError("Invalid code. Please try again.");
          setPrintStatus(null);
      }
  };

  const savePrintSetup = () => {
      setPrintConfig(draftConfig);
      savePrintConfig(draftConfig);
      setShowPrintSetup(false);
  };

  const filteredAttendees = attendees.filter(a => {
    const s = search.toLowerCase();
    const name = getAttendeeName(a).toLowerCase();
    const email = getAttendeeEmail(a).toLowerCase();
    return name.includes(s) || email.includes(s) ||
      a.phone?.toLowerCase().includes(s) ||
      a.confirmationId?.toLowerCase().includes(s);
  });

  return (
    <PageWrapper>
      <div className="flex bg-mesh min-h-screen text-slate-100">
        <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />
        
        <main className="flex-1 lg:ml-72 p-4 md:p-8 pb-32 lg:pb-8">
          <header className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-6 mb-10">
            <div className="w-full xl:w-auto">
              <h1 className="text-2xl md:text-3xl font-black text-white uppercase tracking-tight italic">On-Site Ops</h1>
              <p className="text-zinc-500 text-xs font-bold uppercase tracking-widest mt-1">Global Tech Summit 2026</p>
            </div>
            <div className="flex flex-wrap items-center gap-2 md:gap-3 w-full xl:w-auto">
                {/* Print Status Pill */}
                {printStatus && (
                    <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                        className={`flex-1 xl:flex-none flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest ${ printStatus === 'printing' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' : 'bg-green-500/10 text-green-400 border border-green-500/20' }`}>
                        <Printer className="w-3.5 h-3.5" />
                        {printStatus === 'printing' ? 'Spooling…' : 'Success'}
                    </motion.div>
                )}
                <button
                    onClick={() => { setDraftConfig({...printConfig}); setShowPrintSetup(true); }}
                    title="Badge Print Settings"
                    className="flex-1 xl:flex-none flex items-center justify-center gap-2 px-4 py-3 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-all font-bold text-zinc-400 hover:text-white"
                >
                    <Settings className="w-5 h-5" />
                </button>
                <button 
                    onClick={() => setIsSpotModalOpen(true)}
                    className="flex-[2] xl:flex-none flex items-center justify-center gap-2 px-6 py-4 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-all font-black text-[10px] uppercase tracking-widest text-white shadow-lg shadow-purple-500/10"
                >
                    <UserPlus className="w-5 h-5 text-primary" />
                    Spot Reg
                </button>
                <button onClick={() => navigate('/scanner')} className="flex-[2] xl:flex-none flex items-center justify-center gap-2 px-6 py-4 bg-primary rounded-xl hover:bg-primary/90 transition-all font-black text-[10px] uppercase tracking-widest text-white shadow-lg shadow-primary/20">
                    <QrCode className="w-5 h-5" />
                    Scan Ticket
                </button>
            </div>
          </header>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10">
              <div className="glass-panel p-5 border-l-4 border-l-green-500">
                  <p className="text-zinc-500 text-[9px] font-black uppercase tracking-widest mb-1.5">Check-ins</p>
                  <div className="flex items-end gap-2 text-white">
                      <span className="text-3xl font-black">{attendees.filter(a => a.status === 'checked-in').length}</span>
                      <span className="text-zinc-600 mb-1 text-xs font-bold">/ {attendees.length || 0}</span>
                  </div>
              </div>
              <div className="glass-panel p-5 border-l-4 border-l-purple-500 text-white">
                  <p className="text-zinc-500 text-[9px] font-black uppercase tracking-widest mb-1.5">Live On-Site</p>
                  <span className="text-3xl font-black">{attendees.filter(a => a.status === 'checked-in').length}</span>
              </div>
              <div className="glass-panel p-5 border-l-4 border-l-zinc-500 text-white">
                  <p className="text-zinc-500 text-[9px] font-black uppercase tracking-widest mb-1.5">Pending</p>
                  <span className="text-3xl font-black">{attendees.filter(a => a.status !== 'checked-in').length}</span>
              </div>
          </div>

          <div className="glass-panel overflow-hidden">
              <div className="p-4 border-b border-white/5 flex gap-4 bg-white/5">
                  <div className="flex-1 relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                      <input 
                          type="text" 
                          placeholder="Search attendees by name or ID..."
                          className="w-full pl-10 bg-white/5 border border-white/10 p-3 rounded-lg text-sm text-white outline-none focus:border-purple-500/50 transition-all"
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                      />
                  </div>
                  <button className="px-5 py-2 bg-white/5 rounded-lg border border-white/10 flex items-center gap-2 text-sm text-zinc-400 font-bold hover:text-white transition-colors">
                      <Filter className="w-4 h-4" /> Filter
                  </button>
              </div>

              <div className="divide-y divide-white/5">
                  {filteredAttendees.length === 0 ? (
                      <div className="p-8 text-center text-zinc-500">No attendees match your search.</div>
                  ) : filteredAttendees.map((attendee, i) => (
                      <motion.div 
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.05 }}
                          key={attendee.id} 
                          className="p-4 md:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between hover:bg-white/[0.03] transition-colors group gap-4"
                      >
                          <div className="flex items-center gap-4">
                              <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-gradient-to-br from-purple-500/20 to-blue-500/20 flex items-center justify-center font-black text-lg text-purple-300 border border-white/5">
                                  {getAttendeeName(attendee).charAt(0) || 'A'}
                              </div>
                              <div>
                                  <h4 className="font-bold text-white text-base md:text-lg leading-tight">{getAttendeeName(attendee)}</h4>
                                  <p className="text-[10px] md:text-xs text-zinc-500 truncate max-w-[180px] md:max-w-none">{getAttendeeEmail(attendee) || 'No Email'}</p>
                              </div>
                          </div>

                          <div className="flex items-center justify-between w-full sm:w-auto gap-4 md:gap-12">
                              <div className="text-left sm:text-right flex flex-col items-start sm:items-end">
                                  <span className={`text-[9px] uppercase font-black tracking-widest mb-0.5 flex items-center gap-1.5 ${
                                      attendee.status === 'checked-in' ? 'text-green-400' : 'text-zinc-500'
                                  }`}>
                                      {attendee.status === 'checked-in' ? <CheckCircle2 className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                                      {attendee.status}
                                  </span>
                                  <span className="text-[10px] text-zinc-600 font-bold uppercase tracking-tighter">{attendee.ticketName || 'Pass'}</span>
                              </div>

                              <button 
                                  onClick={() => attendee.status === 'checked-in' ? handleReprint(attendee.id) : handleCheckIn(attendee.id)}
                                  className={`flex-1 sm:flex-none px-4 md:px-6 py-2.5 rounded-xl text-xs md:text-sm font-black uppercase tracking-widest transition-all ${
                                  attendee.status === 'checked-in' 
                                  ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20 hover:bg-amber-500 hover:text-white' 
                                  : 'bg-green-500/10 text-green-400 border border-green-500/20 hover:bg-green-500 hover:text-white shadow-lg shadow-green-500/10'
                              }`}>
                                  {attendee.status === 'checked-in' ? 'Reprint' : 'Check In'}
                              </button>
                          </div>
                      </motion.div>
                  ))}

              </div>
          </div>

          <div className="mt-8 p-6 glass-card border-none bg-primary/5 rounded-2xl flex items-center gap-6">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center border border-primary/20">
                  <UserCheck className="w-8 h-8 text-primary" />
              </div>
              <div className="flex-1">
                  <h4 className="font-bold text-primary text-lg">Pro Tip for Supervisors</h4>
                  <p className="text-sm text-zinc-400 leading-relaxed max-w-2xl">
                    You can use your keyboard's <b>F1</b> key to instantly focus the search bar. This significantly speeds up check-in for large crowds.
                  </p>
              </div>
          </div>

          <AnimatePresence>
            {activeTab === 'notifications' && (
                <NotificationCenter 
                    isOpen={true} 
                    onClose={() => setActiveTab('overview')} 
                />
            )}

            {isSpotModalOpen && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-6">
                    <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => !printStatus && setIsSpotModalOpen(false)}
                        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
                    />
                    <motion.div 
                        initial={{ y: '100%', opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: '100%', opacity: 0 }}
                        className="bg-zinc-900 border-t lg:border border-white/10 rounded-t-3xl lg:rounded-3xl p-6 md:p-8 w-full max-w-xl shadow-2xl overflow-y-auto max-h-[90vh] relative"
                    >
                        <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-primary via-purple-500 to-primary" />

                        <div className="flex justify-between items-center mb-8">
                            <div>
                                <h2 className="text-2xl font-black text-white flex items-center gap-3">
                                    <UserPlus className="w-6 h-6 text-primary" /> On-Site Spot Registration
                                </h2>
                                <p className="text-zinc-500 text-sm">{spotStep === 'details' ? 'Issue instant badges for walk-in attendees.' : 'Verify mobile number to authorize badge print.'}</p>
                            </div>
                            <button onClick={() => !printStatus && setIsSpotModalOpen(false)} className="p-2 hover:bg-white/5 rounded-full text-zinc-500 transition-colors">
                                <XCircle className="w-6 h-6" />
                            </button>
                        </div>

                        {spotStep === 'details' ? (
                            <div className="grid grid-cols-2 gap-4">
                                <div className="col-span-1 space-y-1">
                                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest pl-1">First Name *</label>
                                    <input type="text" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-primary/50 transition-colors" placeholder="e.g. John" value={spotForm.firstName} onChange={e => setSpotForm({...spotForm, firstName: e.target.value})} />
                                </div>
                                <div className="col-span-1 space-y-1">
                                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest pl-1">Last Name</label>
                                    <input type="text" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-primary/50 transition-colors" placeholder="e.g. Wick" value={spotForm.lastName} onChange={e => setSpotForm({...spotForm, lastName: e.target.value})} />
                                </div>
                                <div className="col-span-1 space-y-1">
                                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest pl-1">Professional Email *</label>
                                    <input type="email" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-primary/50 transition-colors" placeholder="name@company.com" value={spotForm.email} onChange={e => setSpotForm({...spotForm, email: e.target.value})} />
                                </div>
                                <div className="col-span-1 space-y-1">
                                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest pl-1">Mobile Number *</label>
                                    <input type="tel" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-primary/50 transition-colors" placeholder="+91 00000 00000" value={spotForm.phone} onChange={e => setSpotForm({...spotForm, phone: e.target.value})} />
                                </div>
                                <div className="col-span-1 space-y-1">
                                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest pl-1">Company</label>
                                    <input type="text" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-primary/50 transition-colors" placeholder="Organization name" value={spotForm.company} onChange={e => setSpotForm({...spotForm, company: e.target.value})} />
                                </div>
                                <div className="col-span-1 space-y-1">
                                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest pl-1">Designation</label>
                                    <input type="text" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-primary/50 transition-colors" placeholder="Job Title" value={spotForm.designation} onChange={e => setSpotForm({...spotForm, designation: e.target.value})} />
                                </div>
                                <div className="col-span-2 space-y-1">
                                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest pl-1">Ticket Category</label>
                                    <select className="w-full bg-zinc-800 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-primary/50 transition-colors" value={spotForm.ticket} onChange={e => setSpotForm({...spotForm, ticket: e.target.value})}>
                                        <option>General Delegate</option>
                                        <option>Spot VIP Pass</option>
                                        <option>Media Access</option>
                                        <option>Speaker Pass</option>
                                    </select>
                                </div>
                            </div>
                        ) : (
                            <div className="mb-8">
                                <div className="flex justify-center gap-3 mb-8">
                                    {spotOtp.map((digit, idx) => (
                                        <input key={idx} id={`sup-spot-otp-${idx}`} type="text" maxLength={1} value={digit}
                                            onChange={e => {
                                                const newOtp = [...spotOtp];
                                                newOtp[idx] = e.target.value.slice(-1);
                                                setSpotOtp(newOtp);
                                                if (e.target.value && idx < 5) document.getElementById(`sup-spot-otp-${idx + 1}`).focus();
                                            }}
                                            className="w-12 h-16 bg-white/5 border border-white/10 rounded-xl text-center text-2xl font-bold text-white focus:border-primary/50 outline-none" />
                                    ))}
                                </div>
                                {spotAuthError && <p className="text-red-400 text-xs text-center mb-4">{spotAuthError}</p>}
                                <p className="text-zinc-500 text-xs text-center">A 6-digit code has been sent to {spotForm.phone}</p>
                            </div>
                        )}

                        <div className="mt-10 flex gap-4">
                            <button 
                                onClick={() => spotStep === 'details' ? setIsSpotModalOpen(false) : setSpotStep('details')}
                                disabled={printStatus === 'printing'}
                                className="flex-1 py-4 bg-white/5 border border-white/10 rounded-2xl text-white font-bold hover:bg-white/10 transition-colors disabled:opacity-30"
                            >
                                {spotStep === 'details' ? 'Cancel' : 'Back'}
                            </button>
                            <button 
                                onClick={spotStep === 'details' ? requestSpotOTP : verifyAndRegisterSpot}
                                disabled={!spotForm.firstName || !spotForm.email || (spotStep === 'otp' && spotOtp.some(d => !d)) || printStatus === 'printing'}
                                className={`flex-[2] py-4 rounded-2xl font-black transition-all flex items-center justify-center gap-3 shadow-lg ${
                                    printStatus === 'printing' ? 'bg-amber-500 text-white cursor-wait' : 'bg-primary text-white hover:bg-primary/90 shadow-[0_10px_30px_rgba(84,34,255,0.3)]'
                                } disabled:opacity-50 disabled:cursor-not-allowed`}
                            >
                                {printStatus === 'printing' ? (
                                    <>
                                        <RefreshCw className="w-6 h-6 animate-spin" />
                                        <span>Printing Badge...</span>
                                    </>
                                ) : (
                                    <>
                                        {spotStep === 'details' ? <Plus className="w-6 h-6" /> : <BadgeCheck className="w-6 h-6" />}
                                        <span>{spotStep === 'details' ? 'Verify Mobile' : 'Confirm & Print'}</span>
                                    </>
                                )}
                            </button>
                        </div>
                        <div id="supervisor-spot-recaptcha"></div>
                    </motion.div>
                </div>
            )}
          </AnimatePresence>

          {/* ─── Print Setup Wizard ─── */}
          <AnimatePresence>
            {showPrintSetup && (
              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
              >
                <motion.div
                  initial={{ scale: 0.9, y: 30 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 30 }}
                  className="glass-panel w-full max-w-lg p-8 rounded-2xl border border-white/10 shadow-2xl"
                >
                  {/* Header */}
                  <div className="flex items-center gap-4 mb-8">
                    <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center border border-primary/20">
                      <Printer className="w-6 h-6 text-primary" />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-white">Badge Print Setup</h2>
                      <p className="text-zinc-500 text-sm">Choose what gets printed on every 58mm badge receipt.</p>
                    </div>
                  </div>

                  {/* Field Toggles */}
                  <div className="space-y-3 mb-8">
                    {[
                      { key: 'printEventHeader', label: 'Event Header (EventPro Live)', desc: 'Top banner with event branding', locked: false },
                      { key: 'printName',        label: 'Attendee Full Name',            desc: 'Bold large text', locked: true },
                      { key: 'printTicket',      label: 'Ticket Category',               desc: 'e.g. General Delegate / VIP Pass', locked: false },
                      { key: 'printCompany',     label: 'Organization / Company',        desc: "Attendee's employer", locked: false },
                      { key: 'printJobTitle',    label: 'Job Title / Designation',       desc: 'Role at company', locked: false },
                      { key: 'printEmail',       label: 'Email Address',                 desc: 'Professional email', locked: false },
                      { key: 'printQR',          label: 'QR Code',                      desc: 'Scannable check-in code', locked: true },
                    ].map(({ key, label, desc, locked }) => (
                      <div
                        key={key}
                        onClick={() => !locked && setDraftConfig(c => ({ ...c, [key]: !c[key] }))}
                        className={`flex items-center justify-between p-4 rounded-xl border transition-all cursor-pointer ${
                          draftConfig[key]
                            ? 'bg-primary/5 border-primary/30'
                            : 'bg-white/3 border-white/8 hover:border-white/15'
                        } ${locked ? 'opacity-60 cursor-not-allowed' : ''}`}
                      >
                        <div>
                          <p className="text-sm font-bold text-white flex items-center gap-2">
                            {label}
                            {locked && <span className="text-[9px] font-bold uppercase tracking-widest text-zinc-600 bg-white/5 px-1.5 py-0.5 rounded">Required</span>}
                          </p>
                          <p className="text-xs text-zinc-500 mt-0.5">{desc}</p>
                        </div>
                        <div className={`w-10 h-6 rounded-full transition-colors flex items-center px-1 ${draftConfig[key] ? 'bg-primary' : 'bg-white/10'}`}>
                          <motion.div
                            animate={{ x: draftConfig[key] ? 16 : 0 }}
                            className="w-4 h-4 rounded-full bg-white shadow-md"
                          />
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Copies */}
                  <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/10 mb-8">
                    <div>
                      <p className="text-sm font-bold text-white">Copies per Badge</p>
                      <p className="text-xs text-zinc-500">How many receipts to print per attendee check-in</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <button onClick={() => setDraftConfig(c => ({ ...c, copies: Math.max(1, c.copies - 1) }))} className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold flex items-center justify-center transition-colors">−</button>
                      <span className="text-white font-bold text-lg w-6 text-center">{draftConfig.copies}</span>
                      <button onClick={() => setDraftConfig(c => ({ ...c, copies: Math.min(5, c.copies + 1) }))} className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold flex items-center justify-center transition-colors">+</button>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-3">
                    {localStorage.getItem('eventpro_print_config') && (
                      <button onClick={() => setShowPrintSetup(false)} className="flex-1 py-3 glass-card bg-white/5 border-white/10 text-white font-bold hover:bg-white/10 transition-colors rounded-xl">
                        Cancel
                      </button>
                    )}
                    <button onClick={savePrintSetup} className="flex-1 py-3 btn-primary font-bold rounded-xl shadow-lg shadow-primary/20">
                      Save & Start Session
                    </button>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>
    </PageWrapper>
  );
};

export default SupervisorDashboard;
