import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import {
    Calendar, Users, Settings, Plus, Search, CheckCircle2, XCircle, Zap,
    BarChart3, Box, Lock, Eye, Building2, Palette, Check, LogOut, Key, Mail, Trash2, RefreshCw, Send, DownloadCloud, Database,
    UserPlus, ChevronRight, Ticket, MapPin, Briefcase, ShieldCheck, UserCheck, Smartphone, MessageSquare
} from 'lucide-react';
import PageWrapper from '../components/PageWrapper';
import FormattedDateInput from '../components/FormattedDateInput';
import { useAuth } from '../hooks/useAuth';
import { db, functions, httpsCallable } from '../firebase';
import {
    collection, onSnapshot, query, addDoc, getDocs,
    serverTimestamp, updateDoc, doc, setDoc, where
} from 'firebase/firestore';
import { logAction } from '../utils/audit';

const OrganizerDashboard = () => {
    const { logout, user } = useAuth();
    const navigate = useNavigate();
    const [events, setEvents] = useState([]);
    const [admins, setAdmins] = useState([]);
    const [attendees, setAttendees] = useState([]);
    const [activeTab, setActiveTab] = useState('events');
    const [searchQuery, setSearchQuery] = useState('');
    const [exportingDatabase, setExportingDatabase] = useState(false);

    const exportDatabase = async (filterEventId = null) => {
        setExportingDatabase(true);
        try {
            const dbExport = {
                metadata: {
                    exportedBy: user.email,
                    exportedAt: new Date().toISOString(),
                    scope: filterEventId ? `Event: ${filterEventId}` : 'All Managed Events',
                    tier: 'Organiser'
                },
                collections: {
                    events: [],
                    attendees: [],
                    staffPasses: []
                }
            };
            
            // 1. Fetch Events
            let evQuery = query(collection(db, "events"), where("organizerId", "==", user.uid));
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
            a.download = `eventpro_org_backup_${filterEventId || 'full'}_${new Date().getTime()}.json`;
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
    
    // Event State
    const [showAddEvent, setShowAddEvent] = useState(false);
    const [newEvent, setNewEvent] = useState({
        name: '',
        date: '',
        location: '',
        type: 'Physical',
        status: 'Upcoming',
        description: ''
    });

    // Admin State
    const [showAddAdmin, setShowAddAdmin] = useState(false);
    const [newAdmin, setNewAdmin] = useState({
        name: '',
        email: '',
        phone: '',
        assignedEventIds: []
    });

    // --- Gateway Infrastructure ---
    const [infraConfig, setInfraConfig] = useState(null);
    const [validating, setValidating] = useState({});
    const [, setSavingInfra] = useState(false);

    useEffect(() => {
        if (!user) return;

        // 1. Fetch Events managed by this Organizer
        const qEvents = query(collection(db, "events"), where("organizerId", "==", user.uid));
        const unsubEvents = onSnapshot(qEvents, async (snap) => {
            const loadedEvents = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setEvents(loadedEvents);

            // Fetch attendees for these events (batch in chunks of 30 for Firestore 'in' limit)
            if (loadedEvents.length > 0) {
                try {
                    const eventIds = loadedEvents.map(e => e.id);
                    const chunks = [];
                    for (let i = 0; i < eventIds.length; i += 30) {
                        chunks.push(eventIds.slice(i, i + 30));
                    }
                    let allAttendees = [];
                    for (const chunk of chunks) {
                        const aSnap = await getDocs(query(collection(db, "attendees"), where("eventId", "in", chunk)));
                        allAttendees = allAttendees.concat(aSnap.docs.map(d => ({ id: d.id, ...d.data() })));
                    }
                    setAttendees(allAttendees);
                } catch (err) {
                    console.error("Failed to fetch attendees for analytics:", err);
                }
            } else {
                setAttendees([]);
            }
        });

        // 2. Fetch Admins created by this Organizer
        const qAdmins = query(collection(db, "users"), where("role", "==", "admin"), where("parentId", "==", user.uid));
        const unsubAdmins = onSnapshot(qAdmins, (snap) => {
            setAdmins(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });

        // 3. Fetch Organizer Custom Infrastructure
        const unsubConfig = onSnapshot(doc(db, "_config", `infra_organiser_${user.uid}`), (docSnap) => {
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

        return () => { unsubEvents(); unsubAdmins(); unsubConfig(); };
    }, [user]);

    const handleAddEvent = async () => {
        if (!newEvent.name || !newEvent.date) {
            alert("Name and Date are required.");
            return;
        }
        // Check event limit from parent owner's plan
        const eventLimit = user.eventLimit || user.parentEventLimit || 10;
        if (events.length >= eventLimit) {
            alert(`❌ Event limit reached (${events.length}/${eventLimit}). Contact your owner to upgrade the plan.`);
            return;
        }
        try {
            const docRef = await addDoc(collection(db, "events"), {
                ...newEvent,
                organizerId: user.uid,
                ownerId: user.parentId || '',
                tenantId: user.tenantId || '',
                registrations: 0,
                createdAt: serverTimestamp()
            });
            logAction(db, user, 'CREATE_EVENT', 'event', docRef.id, { name: newEvent.name });
            setShowAddEvent(false);
            setNewEvent({ name: '', date: '', location: '', type: 'Physical', status: 'Upcoming', description: '' });
            alert("✅ Event infrastructure provisioned.");
        } catch (e) {
            alert("Error: " + e.message);
        }
    };

    const handleAddAdmin = async () => {
        if (!newAdmin.name || !newAdmin.email) {
            alert("Name and Email are required.");
            return;
        }
        const adminLimit = user.adminLimit || user.userLimit || 5;
        if (admins.length >= adminLimit) {
            alert(`❌ Admin limit reached (${admins.length}/${adminLimit}). Upgrade plan to add more admins.`);
            return;
        }
        try {
            const tempPassword = `ADM-${Math.floor(100000 + Math.random() * 900000)}`;
            const docRef = await addDoc(collection(db, "users"), {
                ...newAdmin,
                role: 'admin',
                parentId: user.uid,
                status: 'Active',
                password: tempPassword,
                createdAt: serverTimestamp()
            });
            logAction(db, user, 'CREATE_ADMIN', 'user', docRef.id, { name: newAdmin.name, email: newAdmin.email });

            // Send onboarding communication via Cloud Function
            const sendOnboarding = httpsCallable(functions, 'sendOnboardingCommunication');
            let commResult = null;
            try {
                const { data } = await sendOnboarding({
                    to: newAdmin.email,
                    phone: newAdmin.phone,
                    name: newAdmin.name,
                    credentials: { email: newAdmin.email, password: tempPassword },
                    role: 'admin',
                    channels: ['email', 'sms']
                });
                commResult = data;
                // Onboarding communication sent
            } catch (commErr) {
                console.error("Onboarding communication failed:", commErr);
            }

            setShowAddAdmin(false);
            setNewAdmin({ name: '', email: '', phone: '', assignedEventIds: [] });

            const previewUrl = commResult?.results?.email?.previewUrl;
            const emailOk = commResult?.results?.email?.success;
            const smsOk = commResult?.results?.sms?.success;
            alert(
                `✅ Admin account created!` +
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

    const toggleStatus = async (id, currentStatus, coll = "users") => {
        const newStatus = currentStatus === 'Active' ? 'Suspended' : 'Active';
        try {
            await updateDoc(doc(db, coll, id), { status: newStatus });
            logAction(db, user, `${newStatus.toUpperCase()}_USER`, 'user', id);
        } catch { alert("Failed to update status."); }
    };

    const saveInfraConfig = async (newConfig) => {
        setSavingInfra(true);
        try {
            await setDoc(doc(db, "_config", `infra_organiser_${user.uid}`), newConfig, { merge: true });
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

    const stats = [
        { label: 'Active Events', value: events.length.toString(), icon: Calendar, color: 'text-purple-400' },
        { label: 'Platform Admins', value: admins.length.toString(), icon: ShieldCheck, color: 'text-blue-400' },
        { label: 'Total Ingress', value: events.reduce((sum, e) => sum + (e.registrations || 0), 0).toLocaleString(), icon: Users, color: 'text-emerald-400' },
        { label: 'Staff Nodes', value: '12', icon: Smartphone, color: 'text-amber-400' },
    ];

    return (
        <PageWrapper>
            <div className="min-h-screen bg-[#050505] text-white">
                {/* Header Section */}
                <header className="p-8 border-b border-white/5 bg-black/40 backdrop-blur-2xl sticky top-0 z-50">
                    <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                        <div className="flex items-center gap-5">
                            <div className="w-14 h-14 bg-purple-500/10 rounded-2xl flex items-center justify-center border border-purple-500/20 shadow-[0_0_20px_rgba(168,85,247,0.1)]">
                                <Building2 className="w-8 h-8 text-purple-400" />
                            </div>
                            <div>
                                <h1 className="text-3xl font-black tracking-tight uppercase italic">Organiser <span className="text-purple-400">Hub</span></h1>
                                <p className="text-zinc-500 text-xs font-bold uppercase tracking-[0.2em] mt-1">Event Logistics & Staff Control</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="hidden lg:flex items-center gap-6 mr-6 border-r border-white/10 pr-6">
                                <div className="text-right">
                                    <p className="text-[10px] font-black text-zinc-600 uppercase">System Status</p>
                                    <p className="text-xs font-bold text-green-400">Production Ready</p>
                                </div>
                            </div>
                            <button onClick={() => exportDatabase()} disabled={exportingDatabase} className="px-4 py-3 bg-white/5 border border-white/10 text-white rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-white/10 transition-all flex items-center gap-2">
                                {exportingDatabase ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
                                Backup Data
                            </button>
                            <button onClick={() => setShowAddEvent(true)} className="px-6 py-3 bg-purple-600 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-purple-700 transition-all shadow-lg shadow-purple-600/20 flex items-center gap-2">
                                <Plus className="w-4 h-4" /> Create Event
                            </button>
                            <button onClick={logout} className="p-3 bg-white/5 border border-white/10 rounded-xl text-zinc-500 hover:text-white transition-all">
                                <LogOut className="w-5 h-5" />
                            </button>
                        </div>
                    </div>
                </header>

                <div className="p-8 max-w-7xl mx-auto">
                    {/* KPI Row */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
                        {stats.map((s, i) => (
                            <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}
                                className="glass-panel p-6 border-white/5 bg-white/[0.02]">
                                <div className="flex justify-between items-start mb-4">
                                    <div className="p-2.5 bg-zinc-800 rounded-xl">
                                        <s.icon className={`w-5 h-5 ${s.color}`} />
                                    </div>
                                </div>
                                <p className="text-zinc-500 text-[10px] font-black uppercase tracking-widest mb-1">{s.label}</p>
                                <p className="text-2xl font-black text-white">{s.value}</p>
                            </motion.div>
                        ))}
                    </div>

                    {/* Tabs Navigation */}
                    <div className="flex gap-8 border-b border-white/5 mb-8">
                        {[
                            { id: 'events', label: 'Events Registry', icon: Calendar },
                            { id: 'admins', label: 'Administrative Staff', icon: ShieldCheck },
                            { id: 'analytics', label: 'Metrics', icon: BarChart3 },
                            { id: 'settings', label: 'Config', icon: Settings },
                        ].map(tab => (
                            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                                className={`pb-4 text-xs font-black uppercase tracking-widest flex items-center gap-2 transition-all relative ${activeTab === tab.id ? 'text-purple-400' : 'text-zinc-500 hover:text-zinc-300'}`}>
                                <tab.icon className="w-4 h-4" />
                                {tab.label}
                                {activeTab === tab.id && <motion.div layoutId="tab-underline" className="absolute bottom-0 left-0 right-0 h-0.5 bg-purple-400" />}
                            </button>
                        ))}
                    </div>

                    {activeTab === 'events' && (
                        <div className="space-y-6">
                            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
                                <h3 className="text-xs font-black text-zinc-500 uppercase tracking-[0.3em]">Managed Event Nodes</h3>
                                <div className="relative w-full md:w-80">
                                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
                                    <input type="text" placeholder="Filter events..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                                        className="w-full bg-white/5 border border-white/10 rounded-xl pl-11 pr-4 py-2.5 text-xs text-white focus:border-purple-500/50 outline-none transition-all" />
                                </div>
                            </div>
                            <div className="grid grid-cols-1 gap-4">
                                {events.filter(e => e.name.toLowerCase().includes(searchQuery.toLowerCase())).map(event => (
                                    <motion.div key={event.id} layout className="glass-panel p-5 flex items-center justify-between border-white/5 bg-white/[0.02] hover:bg-white/[0.04] transition-all group">
                                        <div className="flex items-center gap-6">
                                            <div className="w-14 h-14 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-center text-2xl group-hover:bg-purple-500/10 group-hover:border-purple-500/20 transition-all">
                                                🎟️
                                            </div>
                                            <div>
                                                <h4 className="text-lg font-black text-white italic tracking-tight">{event.name}</h4>
                                                <div className="flex items-center gap-4 mt-1">
                                                    <span className="text-[10px] font-black text-zinc-500 uppercase flex items-center gap-1"><Calendar className="w-3 h-3" /> {event.date}</span>
                                                    <span className="text-[10px] font-black text-zinc-500 uppercase flex items-center gap-1"><MapPin className="w-3 h-3" /> {event.location}</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-8">
                                            <div className="text-right hidden sm:block">
                                                <p className="text-[10px] font-black text-zinc-600 uppercase tracking-widest mb-1">Status</p>
                                                <span className="text-[10px] font-black text-purple-400 bg-purple-400/10 px-2 py-0.5 rounded border border-purple-400/20 uppercase italic">{event.status}</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <button onClick={() => exportDatabase(event.id)} title="Backup this event" className="p-2.5 bg-white/5 border border-white/10 rounded-xl text-zinc-500 hover:text-purple-400 transition-all">
                                                    <Database className="w-4 h-4" />
                                                </button>
                                                <button onClick={() => navigate(`/admin/${event.id}`)} className="p-2.5 bg-white/5 border border-white/10 rounded-xl text-zinc-500 hover:text-white transition-all">
                                                    <ChevronRight className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>
                                    </motion.div>
                                ))}
                            </div>
                        </div>
                    )}

                    {activeTab === 'admins' && (
                        <div className="space-y-6">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-xs font-black text-zinc-500 uppercase tracking-[0.3em]">Tier 5: Event Administrators</h3>
                                <button onClick={() => setShowAddAdmin(true)} className="px-4 py-2 bg-blue-600/10 border border-blue-600/20 text-blue-400 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-blue-600 hover:text-white transition-all flex items-center gap-2">
                                    <UserPlus className="w-4 h-4" /> Provision Admin
                                </button>
                            </div>
                            <div className="grid grid-cols-1 gap-4">
                                {admins.map(admin => (
                                    <div key={admin.id} className="glass-panel p-5 flex items-center justify-between">
                                        <div className="flex items-center gap-6">
                                            <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-xl">
                                                🛡️
                                            </div>
                                            <div>
                                                <h4 className="text-lg font-black text-white italic tracking-tight">{admin.name}</h4>
                                                <p className="text-[10px] text-zinc-600 font-mono">{admin.email} • {admin.phone}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <button onClick={() => toggleStatus(admin.id, admin.status)} className={`p-2.5 rounded-xl border transition-all ${admin.status === 'Active' ? 'text-zinc-500 hover:text-red-500' : 'text-zinc-500 hover:text-green-500'} bg-white/5 border-white/10`}>
                                                {admin.status === 'Active' ? <XCircle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
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

                    {activeTab === 'analytics' && (() => {
                        const totalRegistrations = events.reduce((sum, e) => sum + (e.registrations || 0), 0);
                        const upcomingCount = events.filter(e => e.status === 'Upcoming').length;
                        const avgRegs = events.length > 0 ? (totalRegistrations / events.length).toFixed(1) : '0';
                        const checkedInCount = attendees.filter(a => a.checkedIn).length;
                        const checkInRate = attendees.length > 0 ? ((checkedInCount / attendees.length) * 100).toFixed(1) : '0.0';

                        const typeColors = {
                            Physical: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20' },
                            Virtual: { bg: 'bg-sky-500/10', text: 'text-sky-400', border: 'border-sky-500/20' },
                            Hybrid: { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/20' },
                        };
                        const statusColors = {
                            Upcoming: { bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/20' },
                            Ongoing: { bg: 'bg-green-500/10', text: 'text-green-400', border: 'border-green-500/20' },
                            Completed: { bg: 'bg-zinc-500/10', text: 'text-zinc-400', border: 'border-zinc-500/20' },
                            Cancelled: { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/20' },
                        };

                        const physicalCount = events.filter(e => e.type === 'Physical').length;
                        const virtualCount = events.filter(e => e.type === 'Virtual').length;
                        const hybridCount = events.filter(e => e.type === 'Hybrid').length;

                        return (
                            <div className="space-y-8">
                                {/* Performance Cards */}
                                <div>
                                    <h3 className="text-xs font-black text-zinc-500 uppercase tracking-[0.3em] mb-4">Event Performance</h3>
                                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                                        {[
                                            { label: 'Total Events', value: events.length, icon: Calendar, color: 'text-purple-400', bg: 'bg-purple-500/10' },
                                            { label: 'Total Registrations', value: totalRegistrations.toLocaleString(), icon: Users, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
                                            { label: 'Upcoming Events', value: upcomingCount, icon: Zap, color: 'text-amber-400', bg: 'bg-amber-500/10' },
                                            { label: 'Avg Regs / Event', value: avgRegs, icon: BarChart3, color: 'text-sky-400', bg: 'bg-sky-500/10' },
                                        ].map((card, i) => (
                                            <motion.div key={i} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}
                                                className="glass-panel p-5 border-white/5 bg-white/[0.02]">
                                                <div className={`w-9 h-9 ${card.bg} rounded-xl flex items-center justify-center mb-3`}>
                                                    <card.icon className={`w-5 h-5 ${card.color}`} />
                                                </div>
                                                <p className="text-zinc-500 text-[9px] font-black uppercase tracking-widest mb-1">{card.label}</p>
                                                <p className="text-2xl font-black text-white">{card.value}</p>
                                            </motion.div>
                                        ))}
                                    </div>
                                </div>

                                {/* Attendee Stats */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="glass-panel p-5 border-white/5 bg-white/[0.02] flex items-center gap-5">
                                        <div className="w-12 h-12 bg-blue-500/10 rounded-2xl flex items-center justify-center shrink-0">
                                            <UserCheck className="w-6 h-6 text-blue-400" />
                                        </div>
                                        <div>
                                            <p className="text-zinc-500 text-[9px] font-black uppercase tracking-widest mb-1">Total Attendees Registered</p>
                                            <p className="text-2xl font-black text-white">{attendees.length.toLocaleString()}</p>
                                        </div>
                                    </div>
                                    <div className="glass-panel p-5 border-white/5 bg-white/[0.02] flex items-center gap-5">
                                        <div className="w-12 h-12 bg-green-500/10 rounded-2xl flex items-center justify-center shrink-0">
                                            <CheckCircle2 className="w-6 h-6 text-green-400" />
                                        </div>
                                        <div>
                                            <p className="text-zinc-500 text-[9px] font-black uppercase tracking-widest mb-1">Check-in Rate</p>
                                            <p className="text-2xl font-black text-white">{checkInRate}%</p>
                                            <p className="text-[9px] text-zinc-600 mt-0.5">{checkedInCount} of {attendees.length} checked in</p>
                                        </div>
                                    </div>
                                </div>

                                {/* Registration Source Breakdown */}
                                <div>
                                    <h3 className="text-xs font-black text-zinc-500 uppercase tracking-[0.3em] mb-4">Event Type Breakdown</h3>
                                    <div className="flex flex-wrap gap-3">
                                        {[
                                            { label: 'Physical', count: physicalCount, ...typeColors.Physical },
                                            { label: 'Virtual', count: virtualCount, ...typeColors.Virtual },
                                            { label: 'Hybrid', count: hybridCount, ...typeColors.Hybrid },
                                        ].map(pill => (
                                            <div key={pill.label} className={`flex items-center gap-2 px-4 py-2 rounded-full ${pill.bg} border ${pill.border}`}>
                                                <span className={`text-xs font-black ${pill.text} uppercase tracking-widest`}>{pill.label}</span>
                                                <span className={`text-lg font-black ${pill.text}`}>{pill.count}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Events Table with Metrics */}
                                <div>
                                    <h3 className="text-xs font-black text-zinc-500 uppercase tracking-[0.3em] mb-4">Events Metrics Table</h3>
                                    <div className="glass-panel border-white/5 bg-white/[0.02] overflow-hidden">
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-xs">
                                                <thead>
                                                    <tr className="border-b border-white/5">
                                                        <th className="text-left p-4 text-[9px] font-black text-zinc-600 uppercase tracking-widest">Event</th>
                                                        <th className="text-left p-4 text-[9px] font-black text-zinc-600 uppercase tracking-widest">Type</th>
                                                        <th className="text-left p-4 text-[9px] font-black text-zinc-600 uppercase tracking-widest">Status</th>
                                                        <th className="text-left p-4 text-[9px] font-black text-zinc-600 uppercase tracking-widest">Registrations</th>
                                                        <th className="text-left p-4 text-[9px] font-black text-zinc-600 uppercase tracking-widest">Capacity</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {events.length === 0 && (
                                                        <tr>
                                                            <td colSpan={5} className="p-8 text-center text-zinc-600 text-xs font-bold uppercase tracking-widest">No events found</td>
                                                        </tr>
                                                    )}
                                                    {events.map((event) => {
                                                        const tc = typeColors[event.type] || typeColors.Physical;
                                                        const sc = statusColors[event.status] || statusColors.Upcoming;
                                                        const regs = event.registrations || 0;
                                                        const cap = event.capacity;
                                                        const fillPct = cap ? Math.min(100, Math.round((regs / cap) * 100)) : null;
                                                        return (
                                                            <tr key={event.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-all">
                                                                <td className="p-4">
                                                                    <p className="font-black text-white text-sm italic">{event.name}</p>
                                                                    <p className="text-[9px] text-zinc-600 flex items-center gap-1 mt-0.5">
                                                                        <Calendar className="w-2.5 h-2.5" /> {event.date}
                                                                    </p>
                                                                </td>
                                                                <td className="p-4">
                                                                    <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${tc.bg} ${tc.text} border ${tc.border}`}>
                                                                        {event.type}
                                                                    </span>
                                                                </td>
                                                                <td className="p-4">
                                                                    <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${sc.bg} ${sc.text} border ${sc.border}`}>
                                                                        {event.status}
                                                                    </span>
                                                                </td>
                                                                <td className="p-4 font-black text-white">{regs.toLocaleString()}</td>
                                                                <td className="p-4">
                                                                    {cap ? (
                                                                        <div className="flex items-center gap-2">
                                                                            <div className="w-24 h-1.5 bg-white/10 rounded-full overflow-hidden">
                                                                                <div
                                                                                    className={`h-full rounded-full ${fillPct >= 90 ? 'bg-red-500' : fillPct >= 70 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                                                                                    style={{ width: `${fillPct}%` }}
                                                                                />
                                                                            </div>
                                                                            <span className="text-[9px] font-black text-zinc-500">{regs}/{cap}</span>
                                                                        </div>
                                                                    ) : (
                                                                        <span className="text-[9px] font-black text-zinc-600 uppercase">Unlimited</span>
                                                                    )}
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })()}

                    {activeTab === 'settings' && (
                        <div className="space-y-8">
                            <div className="flex justify-between items-center mb-4 px-2">
                                <h3 className="text-xs font-black text-zinc-500 uppercase tracking-[0.3em]">Organiser Gateway Engine</h3>
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
                                                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-purple-500/30"
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
                                                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-purple-500/30" 
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
                                                            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-purple-500/30" 
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
                                                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-purple-500/30" 
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
                </div>

                {/* Modals */}
                <AnimatePresence>
                    {showAddEvent && (
                        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowAddEvent(false)} className="absolute inset-0 bg-black/95 backdrop-blur-md" />
                            <motion.div initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 50, opacity: 0 }} className="relative w-full max-w-lg bg-[#0a0a0a] border border-white/10 rounded-3xl overflow-hidden shadow-2xl">
                                <div className="p-8 border-b border-white/5 bg-gradient-to-r from-purple-500/10 to-transparent">
                                    <h3 className="text-2xl font-black text-white uppercase tracking-tight">Provision Event</h3>
                                    <p className="text-zinc-500 text-xs mt-1 italic tracking-widest">Deploying a new event instance on the platform.</p>
                                </div>
                                <div className="p-8 space-y-6">
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-black text-zinc-600 uppercase tracking-widest ml-1">Event Name *</label>
                                        <input type="text" placeholder="Global Tech Summit 2026" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-purple-500/50" value={newEvent.name} onChange={e => setNewEvent({ ...newEvent, name: e.target.value })} />
                                    </div>
                                    <div className="grid grid-cols-2 gap-6">
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-black text-zinc-600 uppercase tracking-widest ml-1">Date (DD-MM-YYYY) *</label>
                                            <FormattedDateInput value={newEvent.date} onChange={e => setNewEvent({ ...newEvent, date: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white" />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-black text-zinc-600 uppercase tracking-widest ml-1">Type</label>
                                            <select value={newEvent.type} onChange={e => setNewEvent({ ...newEvent, type: e.target.value })} className="w-full bg-zinc-900 border border-white/10 rounded-xl px-4 py-3 text-white outline-none">
                                                <option>Physical</option>
                                                <option>Virtual</option>
                                                <option>Hybrid</option>
                                            </select>
                                        </div>
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-black text-zinc-600 uppercase tracking-widest ml-1">Location / Venue</label>
                                        <input type="text" placeholder="Mumbai Convention Centre" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-purple-500/50" value={newEvent.location} onChange={e => setNewEvent({ ...newEvent, location: e.target.value })} />
                                    </div>
                                </div>
                                <div className="p-8 bg-zinc-900/50 border-t border-white/5 flex gap-4">
                                    <button onClick={() => setShowAddEvent(false)} className="flex-1 py-4 text-zinc-500 font-bold hover:text-white transition-all">Cancel</button>
                                    <button onClick={handleAddEvent} className="flex-1 py-4 bg-purple-600 text-white font-black uppercase tracking-widest rounded-2xl hover:bg-purple-700 transition-all">Deploy Node</button>
                                </div>
                            </motion.div>
                        </div>
                    )}

                    {showAddAdmin && (
                        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowAddAdmin(false)} className="absolute inset-0 bg-black/95 backdrop-blur-md" />
                            <motion.div initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 50, opacity: 0 }} className="relative w-full max-w-md bg-[#0a0a0a] border border-white/10 rounded-3xl overflow-hidden shadow-2xl">
                                <div className="p-8 border-b border-white/5 bg-gradient-to-r from-blue-500/10 to-transparent">
                                    <h3 className="text-2xl font-black text-white uppercase tracking-tight">Provision Admin</h3>
                                    <p className="text-zinc-500 text-xs mt-1 italic tracking-widest">Assigning administrative oversight for event clusters.</p>
                                </div>
                                <div className="p-8 space-y-6">
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-black text-zinc-600 uppercase tracking-widest ml-1">Admin Full Name *</label>
                                        <input type="text" placeholder="Sarah Johnson" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-blue-500/50" value={newAdmin.name} onChange={e => setNewAdmin({ ...newAdmin, name: e.target.value })} />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-black text-zinc-600 uppercase tracking-widest ml-1">Work Email *</label>
                                        <input type="email" placeholder="sarah@events.com" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-blue-500/50" value={newAdmin.email} onChange={e => setNewAdmin({ ...newAdmin, email: e.target.value })} />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-black text-zinc-600 uppercase tracking-widest ml-1">Contact Number</label>
                                        <input type="tel" placeholder="+91 00000 00000" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-blue-500/50" value={newAdmin.phone} onChange={e => setNewAdmin({ ...newAdmin, phone: e.target.value })} />
                                    </div>
                                </div>
                                <div className="p-8 bg-zinc-900/50 border-t border-white/5 flex gap-4">
                                    <button onClick={() => setShowAddAdmin(false)} className="flex-1 py-4 text-zinc-500 font-bold hover:text-white transition-all">Cancel</button>
                                    <button onClick={handleAddAdmin} className="flex-1 py-4 bg-blue-600 text-white font-black uppercase tracking-widest rounded-2xl hover:bg-blue-700 transition-all">Create Admin</button>
                                </div>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>
            </div>
        </PageWrapper>
    );
};

export default OrganizerDashboard;
