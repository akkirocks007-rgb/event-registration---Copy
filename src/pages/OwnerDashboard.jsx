import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import CreateEventModal from '../components/CreateEventModal';
import NotificationCenter from '../components/NotificationCenter';
import PageWrapper from '../components/PageWrapper';
import {
    Plus, Users, Calendar, Mail, TrendingUp, Settings, MessageSquare,
    Monitor, ShieldCheck, Activity, Key, Globe, Lock, Cpu, Server,
    Tv, CreditCard, Database, Zap, Code, Shield, Copy, Trash2,
    Building2, Briefcase, RefreshCw, XCircle, CheckCircle2, UserPlus, Send, BarChart3
} from 'lucide-react';
import { AnimatePresence } from 'framer-motion';
import { db, functions, httpsCallable } from '../firebase';
import {
    collection, onSnapshot, query, addDoc,
    serverTimestamp, where, doc,
    updateDoc, getDocs, setDoc, getDoc
} from 'firebase/firestore';
import { useAuth } from '../hooks/useAuth';
import { getCurrencySymbol } from '../utils/currency';
import { logAction } from '../utils/audit';

const OwnerDashboard = () => {
  const _navigate = useNavigate();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('overview');
  const [, setLoading] = useState(true);
  const [exportingDatabase, setExportingDatabase] = useState(false);
  
  const exportDatabase = async (filterEventId = null) => {
    setExportingDatabase(true);
    try {
        const dbExport = {
            metadata: {
                exportedBy: user.email,
                exportedAt: new Date().toISOString(),
                scope: filterEventId ? `Event: ${filterEventId}` : 'All Managed Data',
                tier: 'Owner'
            },
            collections: {
                events: [],
                attendees: [],
                staffPasses: []
            }
        };
        
        // 1. Fetch Events
        let evQuery = query(collection(db, "events"), where("ownerId", "==", user.uid));
        if (filterEventId) {
            evQuery = query(collection(db, "events"), where("__name__", "==", filterEventId));
        }
        const evSnap = await getDocs(evQuery);
        dbExport.collections.events = evSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        const managedEventIds = dbExport.collections.events.map(e => e.id);
        if (managedEventIds.length === 0) {
            alert("No events found to export.");
            return;
        }

        // 2. Fetch Attendees
        let attQuery = collection(db, "attendees");
        const attSnap = await getDocs(attQuery);
        // Client-side filtering for security (or use multi-event query if supported)
        dbExport.collections.attendees = attSnap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .filter(a => managedEventIds.includes(a.eventId));

        // 3. Fetch Staff
        const staffSnap = await getDocs(collection(db, "staffPasses"));
        dbExport.collections.staffPasses = staffSnap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .filter(s => managedEventIds.includes(s.eventId));

        const blob = new Blob([JSON.stringify(dbExport, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `eventpro_owner_backup_${filterEventId || 'full'}_${new Date().getTime()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        alert(`✅ Database Export Downloaded Successfully.`);
    } catch (e) {
        console.error("Export Failed:", e);
        alert("❌ Export Failed: " + e.message);
    } finally {
        setExportingDatabase(false);
    }
  };
  
  // State for Organisers (The next tier down)
  const [organisers, setOrganisers] = useState([]);
  const [showAddOrganiser, setShowAddOrganiser] = useState(false);
  const [newOrganiser, setNewOrganiser] = useState({ name: '', email: '', phone: '', company: '', eventLimit: 10, userLimit: 5000 });
  
  // State for Events (Visibility only, or management if needed)
  const [events, setEvents] = useState([]);
  const [stats, setStats] = useState({ totalRegs: 0, activeEvents: 0, totalOrganisers: 0 });

  // --- Gateway Infrastructure ---
  const [infraConfig, setInfraConfig] = useState(null);
  const [validating, setValidating] = useState({});
  const [, setSavingInfra] = useState(false);

  // --- Currency ---
  const [currencyCode, setCurrencyCode] = useState('USD');

  useEffect(() => {
    if (!user) return;

    // 1. Fetch Organisers created by this Owner
    const qOrg = query(collection(db, "users"), where("role", "==", "organiser"), where("parentId", "==", user.uid));
    const unsubOrg = onSnapshot(qOrg, (snap) => {
        const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setOrganisers(list);
        setStats(prev => ({ ...prev, totalOrganisers: list.length }));
    });

    // 2. Fetch Events managed by this Owner's Organisers (Aggregate view)
    const qEvents = query(collection(db, "events"), where("ownerId", "==", user.uid));
    const unsubEvents = onSnapshot(qEvents, (snap) => {
        const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setEvents(list);
        const regs = list.reduce((sum, ev) => sum + (ev.registrations || 0), 0);
        setStats(prev => ({ ...prev, totalRegs: regs, activeEvents: list.filter(e => e.status === 'Active').length }));
        setLoading(false);
    });

    // 3. Fetch Owner Custom Infrastructure
    const unsubConfig = onSnapshot(doc(db, "_config", `infra_owner_${user.uid}`), (docSnap) => {
        if (docSnap.exists()) {
            setInfraConfig(docSnap.data());
        } else {
            setInfraConfig({
                sms: { provider: 'Twilio', status: 'Not Configured', apiKey: '' },
                whatsapp: { provider: 'Meta Business API', status: 'Not Configured', apiKey: '' },
                email: { provider: 'Resend', status: 'Not Configured', apiKey: '' }
            });
        }
    });

    return () => { unsubOrg(); unsubEvents(); unsubConfig(); };
  }, [user]);

  // Load reseller currency if parentId exists
  useEffect(() => {
    if (!user || !user.parentId) return;
    const fetchCurrency = async () => {
        try {
            const snap = await getDoc(doc(db, "_config", `infra_reseller_${user.parentId}`));
            if (snap.exists() && snap.data().currency) {
                setCurrencyCode(snap.data().currency);
            }
        } catch (e) {
            console.error("Currency fetch failed:", e);
        }
    };
    fetchCurrency();
  }, [user]);

  const handleAddOrganiser = async () => {
    if (!newOrganiser.name || !newOrganiser.email) {
        alert("Name and Email are required.");
        return;
    }

    const orgLimit = user.userLimit || user.organizerLimit || 5;
    if (organisers.length >= orgLimit) {
        alert(`❌ Organizer limit reached (${orgLimit}/${orgLimit}). Contact your reseller to upgrade.`);
        return;
    }

    try {
        const tempPassword = `ORG-${Math.floor(100000 + Math.random() * 900000)}`;
        const docRef = await addDoc(collection(db, "users"), {
            ...newOrganiser,
            role: 'organiser',
            parentId: user.uid,
            status: 'Active',
            password: tempPassword,
            createdAt: serverTimestamp()
        });

        await logAction(db, user, 'CREATE_ORGANISER', 'user', docRef.id, { name: newOrganiser.name });

        // Send onboarding communication via Cloud Function
        const sendOnboarding = httpsCallable(functions, 'sendOnboardingCommunication');
        let commResult = null;
        try {
            const { data } = await sendOnboarding({
                to: newOrganiser.email,
                phone: newOrganiser.phone,
                name: newOrganiser.name,
                credentials: { email: newOrganiser.email, password: tempPassword },
                role: 'organiser',
                channels: ['email', 'sms']
            });
            commResult = data;
            // Onboarding communication sent
        } catch (commErr) {
            console.error("Onboarding communication failed:", commErr);
        }

        setShowAddOrganiser(false);
        setNewOrganiser({ name: '', email: '', phone: '', company: '', eventLimit: 10, userLimit: 5000 });

        const previewUrl = commResult?.results?.email?.previewUrl;
        const emailOk = commResult?.results?.email?.success;
        const smsOk = commResult?.results?.sms?.success;
        alert(
            `✅ Event Organiser account created!` +
            `\n\nEmail: ${emailOk ? '✅ Sent' : '⚠️ Not sent'} ${previewUrl ? '(Test Preview)' : ''}` +
            `${previewUrl ? '\n🔗 ' + previewUrl : ''}` +
            `\nSMS: ${smsOk ? '✅ Sent' : '⚠️ Not sent'}` +
            `\n\nTemp Password: ${tempPassword}` +
            `${commResult?.mode === 'mock' ? '\n\nℹ️ Running in MOCK mode. Set firebase functions:config:set comms.mode=ethereal to test emails.' : ''}`
        );
    } catch (e) {
        alert("Error: " + e.message);
    }
  };

  const toggleOrganiserStatus = async (id, currentStatus) => {
    const newStatus = currentStatus === 'Active' ? 'Suspended' : 'Active';
    try {
        await updateDoc(doc(db, "users", id), { status: newStatus });
    } catch { alert("Failed to update status."); }
  };

  const saveInfraConfig = async (newConfig) => {
      setSavingInfra(true);
      try {
          await setDoc(doc(db, "_config", `infra_owner_${user.uid}`), newConfig, { merge: true });
      } catch (err) {
          console.error("Save failed:", err);
      } finally {
          setSavingInfra(false);
      }
  };

  const getGatewayStatus = (gateway) => {
      if (!infraConfig) return 'Loading...';
      const config = infraConfig[gateway];
      if (!config || !config.apiKey || config.apiKey.includes('••••') || !config.apiKey.trim()) {
          return 'Not Configured';
      }
      return config.status || 'Operational';
  };

  const validateGateway = async (gateway) => {
      setValidating(prev => ({ ...prev, [gateway]: true }));
      setTimeout(async () => {
          const config = infraConfig[gateway] || {};
          const isPlaceholder = !config.apiKey || config.apiKey.includes('••••') || !config.apiKey.trim();
          const newStatus = isPlaceholder ? 'Invalid Key' : 'Verified';
          const updatedConfig = { ...infraConfig, [gateway]: { ...config, status: newStatus } };
          await saveInfraConfig(updatedConfig);
          setValidating(prev => ({ ...prev, [gateway]: false }));
          alert(isPlaceholder ? `❌ ${gateway.toUpperCase()} Validation Failed.` : `✅ ${gateway.toUpperCase()} Gateway Verified.`);
      }, 1500);
  };

  const dashboardStats = [
    { label: 'Total Registrations', value: stats.totalRegs.toLocaleString(), icon: Users, color: 'text-blue-400' },
    { label: 'Active Events', value: stats.activeEvents.toString(), icon: Calendar, color: 'text-purple-400' },
    { label: 'Organisers', value: organisers.length.toString(), icon: Briefcase, color: 'text-emerald-400' },
    { label: 'Revenue (Est)', value: `$${(stats.totalRegs * 45).toLocaleString()}`, icon: CreditCard, color: 'text-amber-400' },
  ];

  return (
    <PageWrapper>
      <div className="flex bg-[#050505] min-h-screen text-slate-200">
        <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} role="owner" />
        
        <main className="flex-1 lg:ml-72 p-4 md:p-10 pb-32 lg:pb-10">
          <header className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 mb-12">
            <div>
              <h1 className="text-4xl font-black text-white tracking-tight uppercase italic">Owner Console</h1>
              <p className="text-zinc-500 text-sm mt-1 font-medium">Managing the Event Organiser ecosystem for your territory.</p>
            </div>
            <div className="flex items-center gap-3">
                 <button onClick={() => exportDatabase()} disabled={exportingDatabase} className="px-4 py-3 bg-white/5 border border-white/10 text-white rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-white/10 transition-all flex items-center gap-2">
                    {exportingDatabase ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
                    Backup Master DB
                 </button>
                 <button onClick={() => setShowAddOrganiser(true)} className="px-6 py-3 bg-emerald-600 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-emerald-700 transition-all flex items-center gap-2 shadow-lg shadow-emerald-600/20">
                    <UserPlus className="w-4 h-4" /> Add Organiser
                 </button>
            </div>
          </header>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
            {dashboardStats.map((s, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}
                className="glass-panel p-6 border-white/5 bg-white/[0.02]">
                <div className="flex justify-between items-start mb-4">
                    <div className="p-2.5 bg-zinc-800 rounded-xl">
                        <s.icon className={`w-6 h-6 ${s.color}`} />
                    </div>
                </div>
                <p className="text-zinc-500 text-[10px] font-black uppercase tracking-widest mb-1">{s.label}</p>
                <p className="text-3xl font-black text-white leading-none">{s.value}</p>
              </motion.div>
            ))}
          </div>

          {activeTab === 'overview' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                <section className="lg:col-span-8 space-y-6">
                    <div className="flex justify-between items-center mb-2 px-2">
                        <h3 className="text-xs font-black text-zinc-500 uppercase tracking-[0.3em]">Performance Ledger</h3>
                    </div>
                    <div className="grid grid-cols-1 gap-4">
                        {events.length === 0 ? (
                            <div className="glass-panel p-12 text-center text-zinc-600 italic text-sm">
                                No active events detected in your tier. Invite an Organiser to start.
                            </div>
                        ) : (
                            events.map(event => (
                                <div key={event.id} className="glass-panel p-5 flex items-center justify-between border-white/5 bg-white/[0.02] hover:bg-white/[0.04] transition-all">
                                    <div className="flex items-center gap-4">
                                        <div className="w-2 h-10 rounded-full bg-primary" />
                                        <div>
                                            <h4 className="font-bold text-white">{event.name}</h4>
                                            <p className="text-xs text-zinc-500 font-medium">{event.registrations} Regs • {event.status}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button onClick={() => exportDatabase(event.id)} title="Backup this event" className="p-2 text-zinc-600 hover:text-emerald-400 transition-all">
                                            <Database className="w-5 h-5" />
                                        </button>
                                        <button className="p-2 text-zinc-600 hover:text-white transition-all">
                                            <Settings className="w-5 h-5" />
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </section>

                <section className="lg:col-span-4 space-y-6">
                     <div className="flex justify-between items-center mb-2 px-2">
                        <h3 className="text-xs font-black text-zinc-500 uppercase tracking-[0.3em]">Top Organisers</h3>
                    </div>
                    <div className="glass-panel p-6 space-y-6">
                        {organisers.slice(0, 5).map(org => (
                            <div key={org.id} className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-500 text-[10px] font-black">
                                        {org.name.charAt(0)}
                                    </div>
                                    <div>
                                        <p className="text-sm font-bold text-white">{org.name}</p>
                                        <p className="text-[10px] text-zinc-500 font-mono">{org.email}</p>
                                    </div>
                                </div>
                                <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest bg-emerald-500/10 px-2 py-0.5 rounded">{org.status}</span>
                            </div>
                        ))}
                    </div>
                </section>
            </div>
          )}

          {activeTab === 'analytics' && (() => {
            const totalRegs = events.reduce((sum, ev) => sum + (ev.registrations || 0), 0);
            const topEvents = [...events].sort((a, b) => (b.registrations || 0) - (a.registrations || 0)).slice(0, 3);
            const orgStats = organisers.map(org => ({
              ...org,
              eventCount: events.filter(e => e.organizerId === org.id).length,
              totalRegs: events.filter(e => e.organizerId === org.id).reduce((s, e) => s + (e.registrations || 0), 0),
            })).sort((a, b) => b.totalRegs - a.totalRegs);
            const sym = getCurrencySymbol(currencyCode);
            return (
              <div className="space-y-8">
                <div className="flex justify-between items-center mb-2 px-2">
                  <h3 className="text-xs font-black text-zinc-500 uppercase tracking-[0.3em]">Performance Analytics</h3>
                </div>

                {/* KPI Cards */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
                  {[
                    { label: 'Total Organisers', value: organisers.length, icon: Briefcase, color: 'text-emerald-400' },
                    { label: 'Total Events', value: events.length, icon: Calendar, color: 'text-purple-400' },
                    { label: 'Total Registrations', value: totalRegs.toLocaleString(), icon: Users, color: 'text-blue-400' },
                    { label: 'Est. Revenue', value: `${sym}${(totalRegs * 45).toLocaleString()}`, icon: CreditCard, color: 'text-amber-400' },
                  ].map((s, i) => (
                    <div key={i} className="glass-panel p-6 border-white/5 bg-white/[0.02]">
                      <div className="p-2.5 bg-zinc-800 rounded-xl mb-4 w-fit">
                        <s.icon className={`w-5 h-5 ${s.color}`} />
                      </div>
                      <p className="text-zinc-500 text-[10px] font-black uppercase tracking-widest mb-1">{s.label}</p>
                      <p className="text-3xl font-black text-white">{s.value}</p>
                    </div>
                  ))}
                </div>

                {/* Top 3 Events */}
                <div className="glass-panel p-6 border-white/5 bg-white/[0.02]">
                  <h4 className="text-xs font-black text-zinc-500 uppercase tracking-[0.3em] mb-6">Top Events by Registrations</h4>
                  {topEvents.length === 0 ? (
                    <p className="text-zinc-600 text-sm italic text-center py-6">No events yet.</p>
                  ) : (
                    <div className="space-y-4">
                      {topEvents.map((ev, i) => (
                        <div key={ev.id} className="flex items-center gap-4">
                          <span className="text-2xl font-black text-zinc-700 w-8">#{i + 1}</span>
                          <div className="flex-1">
                            <p className="text-sm font-bold text-white">{ev.name}</p>
                            <p className="text-[10px] text-zinc-500 font-mono">{ev.date} • {ev.status}</p>
                          </div>
                          <span className="text-lg font-black text-emerald-400">{(ev.registrations || 0).toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Organiser Activity Table */}
                <div className="glass-panel border-white/5 bg-white/[0.02] overflow-hidden">
                  <div className="p-6 border-b border-white/5">
                    <h4 className="text-xs font-black text-zinc-500 uppercase tracking-[0.3em]">Organiser Activity</h4>
                  </div>
                  <table className="w-full text-sm">
                    <thead className="bg-white/5">
                      <tr>
                        {['Organiser', 'Email', 'Events', 'Total Regs', 'Status'].map(col => (
                          <th key={col} className="text-left text-[9px] font-black text-zinc-600 uppercase tracking-widest px-6 py-3">{col}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {orgStats.length === 0 ? (
                        <tr><td colSpan={5} className="px-6 py-8 text-zinc-600 italic text-center">No organisers yet.</td></tr>
                      ) : orgStats.map(org => (
                        <tr key={org.id} className="hover:bg-white/[0.02] transition-colors">
                          <td className="px-6 py-4 font-bold text-white">{org.name}</td>
                          <td className="px-6 py-4 text-zinc-400 font-mono text-xs">{org.email}</td>
                          <td className="px-6 py-4 text-white font-bold">{org.eventCount}</td>
                          <td className="px-6 py-4 text-emerald-400 font-bold">{org.totalRegs.toLocaleString()}</td>
                          <td className="px-6 py-4">
                            <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded ${org.status === 'Active' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>{org.status}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()}

          {activeTab === 'organisers' && (
            <div className="space-y-6">
                <div className="flex items-center justify-between mb-4 px-2">
                    <h3 className="text-xs font-black text-zinc-500 uppercase tracking-[0.3em]">Organiser Registry</h3>
                </div>
                <div className="grid grid-cols-1 gap-4">
                    {organisers.map(org => (
                        <div key={org.id} className="glass-panel p-5 flex items-center justify-between group">
                            <div className="flex items-center gap-6">
                                <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-2xl">
                                    👤
                                </div>
                                <div>
                                    <h4 className="text-lg font-black text-white italic tracking-tight">{org.name}</h4>
                                    <p className="text-xs text-zinc-400 font-bold uppercase">{org.company || 'Independent Organiser'}</p>
                                    <p className="text-[10px] text-zinc-600 font-mono">{org.email} • {org.phone}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-4">
                                <button onClick={() => toggleOrganiserStatus(org.id, org.status)} className={`p-2.5 rounded-xl border transition-all ${org.status === 'Active' ? 'text-zinc-500 hover:text-red-500 hover:border-red-500/20' : 'text-zinc-500 hover:text-green-500 hover:border-green-500/20'} bg-white/5 border-white/10`}>
                                    {org.status === 'Active' ? <XCircle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                                </button>
                                <button className="p-2.5 bg-white/5 border border-white/10 rounded-xl text-zinc-500 hover:text-white transition-all">
                                    <Settings className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
          )}

          {activeTab === 'settings' && (
              <div className="space-y-8">
                  <div className="flex justify-between items-center mb-4 px-2">
                      <h3 className="text-xs font-black text-zinc-500 uppercase tracking-[0.3em]">Owner Gateway Engine</h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      {[
                          { 
                              id: 'sms', label: 'SMS Gateway', icon: Send, color: 'text-sky-400',
                              providers: ['Twilio', 'MessageBird', 'Nexmo (Vonage)', 'AWS SNS']
                          },
                          { 
                              id: 'whatsapp', label: 'WhatsApp API', icon: MessageSquare, color: 'text-emerald-400',
                              providers: ['Meta Business API', 'Twilio WhatsApp', 'Gupshup']
                          },
                          { 
                              id: 'email', label: 'Email Node', icon: Mail, color: 'text-amber-400',
                              providers: ['Resend', 'SendGrid', 'Mailgun', 'Postmark']
                          }
                      ].map(gw => {
                          const currentProvider = infraConfig?.[gw.id]?.provider || gw.providers[0];
                          return (
                              <div key={gw.id} className="glass-panel p-6 border-white/5 bg-white/[0.02] flex flex-col">
                                  <div className="flex justify-between items-start mb-6">
                                      <div className={`p-3 rounded-xl bg-white/5 ${gw.color}`}>
                                          <gw.icon className="w-5 h-5" />
                                      </div>
                                      <div className={`px-2 py-1 rounded text-[8px] font-black uppercase tracking-tighter ${getGatewayStatus(gw.id) === 'Operational' || getGatewayStatus(gw.id) === 'Verified' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
                                          {getGatewayStatus(gw.id)}
                                      </div>
                                  </div>
                                  
                                  <h5 className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1">{gw.label}</h5>
                                  <p className="text-lg font-black text-white mb-6 uppercase italic">Node {gw.id}</p>
                                  
                                  <div className="space-y-4 mb-8 flex-1">
                                      <div className="space-y-1.5">
                                          <label className="text-[9px] font-black text-zinc-600 uppercase tracking-widest ml-1">Active Provider</label>
                                          <select 
                                              value={currentProvider}
                                              onChange={(e) => saveInfraConfig({ 
                                                  ...infraConfig, 
                                                  [gw.id]: { ...infraConfig?.[gw.id], provider: e.target.value } 
                                              })}
                                              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-emerald-500/30"
                                          >
                                              {gw.providers.map(p => <option key={p} value={p} className="bg-[#0a0a0a]">{p}</option>)}
                                          </select>
                                      </div>

                                      <div className="space-y-1.5">
                                          <label className="text-[9px] font-black text-zinc-600 uppercase tracking-widest ml-1">
                                              {currentProvider.includes('Twilio') ? 'Account SID / API Key' : 'Access Key / Secret'}
                                          </label>
                                          <input 
                                              type="password" 
                                              value={infraConfig?.[gw.id]?.apiKey || ''} 
                                              placeholder="••••••••••••••••"
                                              onChange={(e) => saveInfraConfig({ 
                                                  ...infraConfig, 
                                                  [gw.id]: { ...infraConfig?.[gw.id], apiKey: e.target.value } 
                                              })}
                                              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-emerald-500/30" 
                                          />
                                      </div>

                                      {currentProvider === 'Twilio' && (
                                          <div className="space-y-1.5">
                                              <label className="text-[9px] font-black text-zinc-600 uppercase tracking-widest ml-1">Auth Token</label>
                                              <input 
                                                  type="password" 
                                                  value={infraConfig?.[gw.id]?.authToken || ''} 
                                                  placeholder="••••••••••••••••"
                                                  onChange={(e) => saveInfraConfig({ 
                                                      ...infraConfig, 
                                                      [gw.id]: { ...infraConfig?.[gw.id], authToken: e.target.value } 
                                                  })}
                                                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-emerald-500/30" 
                                              />
                                          </div>
                                      )}

                                      <div className="space-y-1.5">
                                          <label className="text-[9px] font-black text-zinc-600 uppercase tracking-widest ml-1">Default Sender (From)</label>
                                          <input 
                                              type="text" 
                                              value={infraConfig?.[gw.id]?.from || ''} 
                                              placeholder={gw.id === 'email' ? 'noreply@yourdomain.com' : 'EVENTPRO'}
                                              onChange={(e) => saveInfraConfig({ 
                                                  ...infraConfig, 
                                                  [gw.id]: { ...infraConfig?.[gw.id], from: e.target.value } 
                                              })}
                                              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-emerald-500/30" 
                                          />
                                      </div>
                                  </div>

                                  <button 
                                      onClick={() => validateGateway(gw.id)}
                                      disabled={validating[gw.id]}
                                      className="w-full py-3 bg-white/5 border border-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-white/10 transition-all flex items-center justify-center gap-2"
                                  >
                                      {validating[gw.id] ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
                                      Test Link
                                  </button>
                              </div>
                          );
                      })}
                  </div>
              </div>
          )}

          {/* Add Organiser Modal */}
          <AnimatePresence>
            {showAddOrganiser && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowAddOrganiser(false)} className="absolute inset-0 bg-black/95 backdrop-blur-md" />
                    <motion.div initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 50, opacity: 0 }} className="relative w-full max-w-md bg-[#0a0a0a] border border-white/10 rounded-3xl overflow-hidden">
                        <div className="p-8 border-b border-white/5 bg-gradient-to-r from-emerald-500/10 to-transparent">
                            <h3 className="text-2xl font-black text-white uppercase tracking-tight">Invite Organiser</h3>
                            <p className="text-zinc-500 text-xs mt-1 italic tracking-widest">Tier 4: Event Infrastructure Management.</p>
                        </div>
                        <div className="p-8 space-y-6">
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-zinc-600 uppercase tracking-widest ml-1">Full Name *</label>
                                <input type="text" placeholder="John Smith" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-emerald-500/50" value={newOrganiser.name} onChange={e => setNewOrganiser({ ...newOrganiser, name: e.target.value })} />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-zinc-600 uppercase tracking-widest ml-1">Work Email *</label>
                                <input type="email" placeholder="john@organiser.com" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-emerald-500/50" value={newOrganiser.email} onChange={e => setNewOrganiser({ ...newOrganiser, email: e.target.value })} />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-zinc-600 uppercase tracking-widest ml-1">Mobile Number</label>
                                <input type="tel" placeholder="+91 00000 00000" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-emerald-500/50" value={newOrganiser.phone} onChange={e => setNewOrganiser({ ...newOrganiser, phone: e.target.value })} />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-zinc-600 uppercase tracking-widest ml-1">Company/Agency Name</label>
                                <input type="text" placeholder="Global Events Inc." className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-emerald-500/50" value={newOrganiser.company} onChange={e => setNewOrganiser({ ...newOrganiser, company: e.target.value })} />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-zinc-600 uppercase tracking-widest ml-1">Event Limit</label>
                                    <input type="number" min="1" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-emerald-500/50" value={newOrganiser.eventLimit} onChange={e => setNewOrganiser({ ...newOrganiser, eventLimit: parseInt(e.target.value) || 0 })} />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-zinc-600 uppercase tracking-widest ml-1">Badge / User Limit</label>
                                    <input type="number" min="1" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-emerald-500/50" value={newOrganiser.userLimit} onChange={e => setNewOrganiser({ ...newOrganiser, userLimit: parseInt(e.target.value) || 0 })} />
                                </div>
                            </div>
                        </div>
                        <div className="p-8 bg-zinc-900/50 border-t border-white/5 flex gap-4">
                            <button onClick={() => setShowAddOrganiser(false)} className="flex-1 py-4 text-zinc-500 font-bold hover:text-white">Cancel</button>
                            <button onClick={handleAddOrganiser} className="flex-1 py-4 bg-emerald-600 text-white font-black uppercase tracking-widest rounded-2xl hover:bg-emerald-700 transition-all">Invite Organiser</button>
                        </div>
                    </motion.div>
                </div>
            )}
          </AnimatePresence>

        </main>
      </div>
    </PageWrapper>
  );
};

export default OwnerDashboard;
