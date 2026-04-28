import React, { useState, useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import {
    ShieldAlert, Globe, Users, CreditCard, Layout, Settings,
    Plus, Search, MoreVertical, CheckCircle2, XCircle, Zap,
    BarChart3, Box, Lock, Eye, Building2, Palette, Check, LogOut, Key, Mail, Trash2, RefreshCw, Send, DownloadCloud, Database, Fingerprint, Briefcase, Calendar, MessageSquare, Activity, TrendingUp, DollarSign
} from 'lucide-react';
import PageWrapper from '../components/PageWrapper';
import FormattedDateInput from '../components/FormattedDateInput';
import { useAuth } from '../hooks/useAuth';
import { db, auth } from '../firebase';
import { sendPasswordResetEmail, updatePassword, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import {
    collection, onSnapshot, query, addDoc, getDocs,
    serverTimestamp, updateDoc, doc, setDoc, deleteDoc, where
} from 'firebase/firestore';
import { CURRENCIES } from '../utils/currency';
import { logAction } from '../utils/audit';

const ResellerDashboard = () => {
    const { logout, user } = useAuth();
    const [owners, setOwners] = useState([]);
    const [activeTab, setActiveTab] = useState('owners');
    const [showAddOwner, setShowAddOwner] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [newOwner, setNewOwner] = useState({
        name: '',
        ownerName: '',
        ownerEmail: '',
        phone: '',
        plan: 'Enterprise Universal',
        eventLimit: 10,
        userLimit: 5000,
        validFrom: new Date().toISOString().split('T')[0],
        validUntil: new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().split('T')[0],
        branding: { color: '#FF2222', logo: '' }
    });

    const [allEvents, setAllEvents] = useState([]);
    const [realStats, setRealStats] = useState({ attendees: 0, owners: 0, events: 0, archivedCount: 0 });
    const [passwordForm, setPasswordForm] = useState({ current: '', new: '', confirm: '' });
    const [updatingPassword, setUpdatingPassword] = useState(false);
    const [communications, setCommunications] = useState([]);
    const [archivedOwners, setArchivedOwners] = useState([]);

    // --- Backup & Data Portability ---
    const [exportingDatabase, setExportingDatabase] = useState(false);
    const [selectedOwnerForBackup, setSelectedOwnerForBackup] = useState('');
    const [selectedEventForBackup, setSelectedEventForBackup] = useState('');

    // --- Gateway Infrastructure ---
    const [infraConfig, setInfraConfig] = useState(null);
    const [validating, setValidating] = useState({});
    const [, setSavingInfra] = useState(false);

    // --- Currency & Branding ---
    const [selectedCurrency, setSelectedCurrency] = useState('USD');
    const [branding, setBranding] = useState({ appName: '', logoUrl: '', supportEmail: '' });
    const [savingBranding, setSavingBranding] = useState(false);

    // --- Custom Dialog System ---
    const [dialog, setDialog] = useState({ isOpen: false, type: 'confirm', title: '', message: '', inputValue: '', onConfirm: null });
    const showConfirm = (title, message, onConfirm) => setDialog({ isOpen: true, type: 'confirm', title, message, inputValue: '', onConfirm });
    const closeDialog = () => setDialog(prev => ({ ...prev, isOpen: false }));

    useEffect(() => {
        if (!user) return;

        // 1. Fetch Owners managed by this Reseller (Excluding Archived)
        const qOwners = query(collection(db, "users"), where("parentId", "==", user.uid), where("role", "==", "owner"), where("status", "!=", "Archived"));
        const unsubOwners = onSnapshot(qOwners, (snap) => {
            const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setOwners(list);
            setRealStats(prev => ({ ...prev, owners: list.length }));
        });

        // 2. Fetch Archived Owners
        const qArch = query(collection(db, "users"), where("parentId", "==", user.uid), where("role", "==", "owner"), where("status", "==", "Archived"));
        const unsubArch = onSnapshot(qArch, (snap) => {
            const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setArchivedOwners(list);
            setRealStats(prev => ({ ...prev, archivedCount: list.length }));
        });

        // 3. Fetch Events for this Reseller's tenant
        const qEvents = query(collection(db, "events"), where("tenantId", "==", user.uid));
        const unsubEvents = onSnapshot(qEvents, (snap) => {
            const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setAllEvents(list);
            setRealStats(prev => ({ ...prev, events: list.length }));
        });

        // 4. Fetch Attendee Count (Aggregated client-side to avoid index complexity)
        const qAtt = collection(db, "attendees");
        const unsubAtt = onSnapshot(qAtt, (snap) => {
            const managedEventIds = allEvents.map(e => e.id);
            const count = snap.docs.filter(d => managedEventIds.includes(d.data().eventId)).length;
            setRealStats(prev => ({ ...prev, attendees: count }));
        });

        // 5. Fetch Communications (JS sorting to avoid Index Error)
        const qComms = query(collection(db, "communications"), where("resellerId", "==", user.uid));
        const unsubComms = onSnapshot(qComms, (snap) => {
            const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setCommunications(list.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)));
        });

        // 6. Fetch Reseller Custom Infrastructure
        const unsubConfig = onSnapshot(doc(db, "_config", `infra_reseller_${user.uid}`), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                setInfraConfig(data);
                if (data.currency) setSelectedCurrency(data.currency);
                if (data.branding) setBranding(prev => ({ ...prev, ...data.branding }));
            } else {
                setInfraConfig({
                    sms: { provider: 'Twilio', status: 'Not Configured', apiKey: '' },
                    whatsapp: { provider: 'Meta Business API', status: 'Not Configured', apiKey: '' },
                    email: { provider: 'Resend', status: 'Not Configured', apiKey: '' }
                });
            }
        });

        return () => {
            unsubOwners();
            unsubArch();
            unsubEvents();
            unsubAtt();
            unsubComms();
            unsubConfig();
        };
    }, [user, allEvents]);

    useEffect(() => {
        if (allEvents.length === 0) return;
        const qAtt = collection(db, "attendees");
        const unsubAtt = onSnapshot(qAtt, (snap) => {
            const managedEventIds = allEvents.map(e => e.id);
            const count = snap.docs.filter(d => managedEventIds.includes(d.data().eventId)).length;
            setRealStats(prev => ({ ...prev, attendees: count }));
        });
        return () => unsubAtt();
    }, [allEvents]);

    const handleAddOwner = async () => {
        if (!newOwner.name || !newOwner.ownerEmail || !newOwner.phone) {
            alert("All primary fields are required.");
            return;
        }

        const currentOwnerCount = owners.length;
        const ownerLimit = user.userLimit || user.ownerLimit || 10;
        if (currentOwnerCount >= ownerLimit) {
            alert(`❌ Owner limit reached (${ownerLimit}). Upgrade your plan to add more owners.`);
            return;
        }

        try {
            const tempPassword = `OWN-${Math.floor(100000 + Math.random() * 900000)}`;

            const docRef = await addDoc(collection(db, "users"), {
                ...newOwner,
                role: 'owner',
                parentId: user.uid,
                tenantId: user.uid,
                status: 'Active',
                password: tempPassword,
                createdAt: serverTimestamp()
            });

            await logAction(db, user, 'CREATE_OWNER', 'user', docRef.id, { name: newOwner.name });

            // Log notification to communication hub
            await addDoc(collection(db, "communications"), {
                to: newOwner.ownerEmail,
                phone: newOwner.phone,
                name: newOwner.name,
                credentials: { email: newOwner.ownerEmail, password: tempPassword },
                type: 'onboarding',
                channels: ['email', 'sms', 'whatsapp'],
                status: 'Sent',
                timestamp: new Date().toISOString(),
                resellerId: user.uid
            });

            setShowAddOwner(false);
            setNewOwner({
                name: '', ownerName: '', ownerEmail: '', phone: '', plan: 'Enterprise Universal', eventLimit: 10, userLimit: 5000,
                validFrom: new Date().toISOString().split('T')[0],
                validUntil: new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().split('T')[0],
                branding: { color: '#FF2222', logo: '' }
            });

            alert(`🚀 Company Owner Provisioned! \n\nCredentials sent via Multi-Channel Onboarding.`);
        } catch (e) {
            console.error("Error creating owner:", e);
            alert(`❌ Provisioning Failed: ${e.message}`);
        }
    };

    const archiveOwner = async (id, name) => {
        showConfirm(
            "Archive Owner",
            `Are you sure you want to move ${name} to the vault? This will suspend their access immediately.`,
            async () => {
                try {
                    await updateDoc(doc(db, "users", id), { status: 'Archived', archivedAt: serverTimestamp() });
                    await logAction(db, user, 'ARCHIVE_OWNER', 'user', id, { name });
                } catch { alert("Archive failed."); }
            }
        );
    };

    const restoreOwner = async (owner) => {
        try {
            await updateDoc(doc(db, "users", owner.id), { status: 'Active', archivedAt: null });
            await logAction(db, user, 'RESTORE_OWNER', 'user', owner.id);
        } catch { alert("Restore failed."); }
    };

    const purgeOwner = async (id) => {
        showConfirm("Permanent Destruction", "This will permanently delete the owner record. This action cannot be undone.", async () => {
            try {
                await deleteDoc(doc(db, "users", id));
                await logAction(db, user, 'PURGE_OWNER', 'user', id);
            } catch { alert("Delete failed."); }
        });
    };

    const handleResetPassword = async (email, name) => {
        showConfirm(
            "Send Reset Link",
            `📧 Dispatch a secure password reset link to ${name.toUpperCase()} at ${email}?`,
            async () => {
                try {
                    await sendPasswordResetEmail(auth, email);
                    
                    await addDoc(collection(db, "communications"), {
                        to: email,
                        name: name,
                        type: 'password_reset',
                        channels: ['email'],
                        status: 'Sent',
                        timestamp: new Date().toISOString(),
                        resellerId: user.uid
                    });

                    alert(`✅ Reset Link Dispatched to ${email}.`);
                } catch {
                    alert("❌ Reset Failed");
                }
            }
        );
    };

    const toggleOwnerStatus = async (id, name, currentStatus) => {
        const newStatus = currentStatus === 'Active' ? 'Suspended' : 'Active';
        showConfirm(
            newStatus === 'Active' ? "Restore Access" : "Suspend Access",
            `Are you sure you want to change ${name}'s status to ${newStatus}?`,
            async () => {
                try {
                    await updateDoc(doc(db, "users", id), { status: newStatus });
                    alert(`✅ ${name} is now ${newStatus}.`);
                } catch {
                    alert("❌ Update failed.");
                }
            }
        );
    };

    const saveInfraConfig = async (newConfig) => {
        setSavingInfra(true);
        try {
            await setDoc(doc(db, "_config", `infra_reseller_${user.uid}`), newConfig, { merge: true });
        } catch (err) {
            console.error("Save failed:", err);
        } finally {
            setSavingInfra(false);
        }
    };

    const saveCurrency = async (code) => {
        setSelectedCurrency(code);
        try {
            await setDoc(doc(db, "_config", `infra_reseller_${user.uid}`), { currency: code }, { merge: true });
        } catch (err) {
            console.error("Currency save failed:", err);
        }
    };

    const saveBranding = async () => {
        setSavingBranding(true);
        try {
            await setDoc(doc(db, "_config", `infra_reseller_${user.uid}`), { branding }, { merge: true });
            alert("✅ Brand identity saved.");
        } catch (err) {
            console.error("Branding save failed:", err);
            alert("❌ Save failed: " + err.message);
        } finally {
            setSavingBranding(false);
        }
    };

    const getGatewayStatus = (gateway) => {
        if (!infraConfig) return 'Loading...';
        const config = infraConfig[gateway];
        if (!config || !config.apiKey || config.apiKey.includes('••••') || config.apiKey === 're_123456789') {
            return 'Not Configured';
        }
        return config.status || 'Operational';
    };

    const validateGateway = async (gateway) => {
        setValidating(prev => ({ ...prev, [gateway]: true }));
        setTimeout(async () => {
            const config = infraConfig[gateway] || {};
            const isPlaceholder = !config.apiKey || config.apiKey.includes('••••') || config.apiKey === 're_123456789';
            const newStatus = isPlaceholder ? 'Invalid Key' : 'Verified';
            const updatedConfig = { ...infraConfig, [gateway]: { ...config, status: newStatus } };
            await saveInfraConfig(updatedConfig);
            setValidating(prev => ({ ...prev, [gateway]: false }));
            alert(isPlaceholder ? `❌ ${gateway.toUpperCase()} Validation Failed.` : `✅ ${gateway.toUpperCase()} Gateway Verified.`);
        }, 1500);
    };

    const exportDatabase = async (filterEventId = null) => {
        setExportingDatabase(true);
        try {
            const dbExport = {
                timestamp: new Date().toISOString(),
                version: "2.0",
                type: filterEventId ? 'Event-Specific' : 'Reseller-Node-Full',
                collections: {
                    owners: filterEventId ? owners.filter(o => o.id === selectedOwnerForBackup) : owners,
                    events: filterEventId ? allEvents.filter(e => e.id === filterEventId) : allEvents,
                    attendees: [],
                }
            };
            
            let attQuery = collection(db, "attendees");
            const attSnap = await getDocs(attQuery);
            const managedEventIds = dbExport.collections.events.map(e => e.id);
            
            dbExport.collections.attendees = attSnap.docs
                .map(d => ({ id: d.id, ...d.data() }))
                .filter(a => managedEventIds.includes(a.eventId));

            const blob = new Blob([JSON.stringify(dbExport, null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `eventpro_reseller_backup_${filterEventId || 'full'}_${new Date().getTime()}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            alert(`✅ ${filterEventId ? 'Event' : 'Reseller Node'} Backup Downloaded Successfully.`);
        } catch (e) {
            console.error("Export Failed:", e);
            alert("❌ Export Failed: " + e.message);
        } finally {
            setExportingDatabase(false);
        }
    };

    const handleChangePassword = async (e) => {
        e.preventDefault();
        if (passwordForm.new !== passwordForm.confirm) {
            alert("New passwords do not match.");
            return;
        }
        setUpdatingPassword(true);
        try {
            const fbUser = auth.currentUser;
            const credential = EmailAuthProvider.credential(fbUser.email, passwordForm.current);
            await reauthenticateWithCredential(fbUser, credential);
            await updatePassword(fbUser, passwordForm.new);
            alert("✅ Password updated successfully.");
            setPasswordForm({ current: '', new: '', confirm: '' });
        } catch (e) {
            alert("❌ Update Failed: " + e.message);
        } finally {
            setUpdatingPassword(false);
        }
    };

    return (
        <PageWrapper>
            <div className="flex min-h-screen bg-[#050505] text-slate-200">
                {/* Sidebar */}
                <div className="hidden lg:flex w-72 border-r border-white/5 p-6 space-y-8 flex-col fixed h-full bg-[#080808]">
                    <div className="flex items-center gap-3 px-2">
                        <div className="w-10 h-10 bg-red-500/10 rounded-xl flex items-center justify-center border border-red-500/20">
                            <ShieldAlert className="w-6 h-6 text-red-500" />
                        </div>
                        <div>
                            <h1 className="font-black text-xl text-white tracking-tighter">RESELLER <span className="text-red-500">PRO</span></h1>
                            <p className="text-[10px] text-zinc-600 font-bold uppercase tracking-widest">Node Mainframe</p>
                        </div>
                    </div>

                    <nav className="space-y-1">
                        {[
                            { id: 'owners', label: 'Managed Owners', icon: Building2 },
                            { id: 'analytics', label: 'Analytics', icon: BarChart3 },
                            { id: 'organisers', label: 'Event Organisers', icon: Briefcase },
                            { id: 'events', label: 'Active Events', icon: Calendar },
                            { id: 'staff', label: 'Node Staff Hub', icon: Users },
                            { id: 'archive', label: 'Owner Vault', icon: Trash2 },
                            { id: 'communications', label: 'Comms Hub', icon: Mail },
                            { id: 'settings', label: 'Infrastructure', icon: Database },
                            { id: 'profile', label: 'Security & Profile', icon: Lock },
                        ].map(item => (
                            <button key={item.id} onClick={() => setActiveTab(item.id)}
                                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all ${activeTab === item.id ? 'bg-red-500/10 text-red-500 border border-red-500/10' : 'text-zinc-500 hover:text-white hover:bg-white/5'
                                    }`}>
                                <item.icon className="w-4 h-4" />
                                {item.label}
                            </button>
                        ))}
                    </nav>

                    <div className="mt-auto p-4 bg-red-500/5 rounded-2xl border border-red-500/10">
                        <p className="text-[10px] font-black text-red-400 uppercase tracking-widest mb-1">Node Status</p>
                        <div className="flex items-center gap-2 mb-3">
                            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                            <span className="text-xs text-white font-bold tracking-tight">Active Infrastructure</span>
                        </div>
                        <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                            <div className="h-full bg-red-500 w-[99%]" />
                        </div>
                    </div>
                </div>

                {/* Main Content */}
                <main className="flex-1 lg:ml-72 p-4 md:p-10 pb-32 lg:pb-10">
                    <header className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-6 mb-12">
                        <div className="w-full lg:w-auto">
                            <h2 className="text-3xl md:text-4xl font-black text-white tracking-tight uppercase italic text-shadow-glow">Reseller Hub</h2>
                            <p className="text-zinc-500 mt-1 text-xs md:text-sm font-medium italic">Managing Enterprise Node for {user?.name || user?.ownerName || 'Active Partner'}.</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 md:gap-3 w-full lg:w-auto">
                            <div className="relative flex-1 lg:flex-none">
                                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
                                <input
                                    type="text" placeholder="Search Owners..."
                                    value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                                    className="bg-white/5 border border-white/10 rounded-xl pl-11 pr-4 py-3 text-xs md:text-sm text-white focus:border-red-500/50 outline-none w-full lg:w-64 transition-all"
                                />
                            </div>
                            <button onClick={() => setShowAddOwner(true)} className="flex items-center gap-2 px-6 py-3 bg-red-600 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-red-700 transition-all shadow-lg shadow-red-600/20">
                                <Plus className="w-4 h-4" /> Add Owner
                            </button>
                            <button onClick={logout} className="px-4 py-3 bg-white/5 border border-white/10 text-white font-bold rounded-xl transition-all flex items-center gap-2 hover:bg-white/10 hover:text-red-400">
                                <LogOut className="w-5 h-5" />
                            </button>
                        </div>
                    </header>

                    {/* Stats */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 mb-12">
                        {[
                            { label: 'Managed Owners', value: realStats.owners, icon: Building2, trend: 'Live' },
                            { label: 'Total Managed Users', value: realStats.attendees, icon: Users, trend: 'Live' },
                            { label: 'System Health', value: '99.9%', icon: Zap, trend: 'Nominal' },
                            { label: 'Vaulted Records', value: realStats.archivedCount, icon: Box, trend: 'Secure' },
                        ].map((stat, i) => (
                            <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }} className="glass-panel p-4 md:p-6 border-white/5 bg-white/[0.02]">
                                <div className="flex justify-between items-start mb-4">
                                    <div className="w-10 h-10 bg-red-500/10 rounded-xl flex items-center justify-center">
                                        <stat.icon className="w-5 h-5 text-red-500" />
                                    </div>
                                    <span className="text-[8px] font-black px-2 py-0.5 bg-green-500/10 text-green-500 rounded uppercase tracking-tighter">{stat.trend}</span>
                                </div>
                                <p className="text-zinc-500 text-[10px] font-black uppercase tracking-widest mb-1">{stat.label}</p>
                                <p className="text-2xl md:text-3xl font-black text-white">{stat.value}</p>
                            </motion.div>
                        ))}
                    </div>

                    {activeTab === 'owners' && (
                        <div className="space-y-4">
                            <AnimatePresence>
                                {owners.filter(o => o.name.toLowerCase().includes(searchQuery.toLowerCase())).map(owner => (
                                    <motion.div
                                        layout key={owner.id}
                                        initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
                                        className="group glass-panel p-4 md:p-5 flex flex-col xl:flex-row items-start xl:items-center justify-between hover:bg-white/[0.04] border-white/5 transition-all gap-6"
                                    >
                                        <div className="flex items-center gap-4 md:gap-6 w-full xl:w-auto">
                                            <div className="relative">
                                                <div className="w-14 h-14 rounded-2xl flex items-center justify-center border-2" style={{ backgroundColor: `${owner.branding?.color || '#FF2222'}20`, borderColor: `${owner.branding?.color || '#FF2222'}40` }}>
                                                    <Building2 className="w-7 h-7" style={{ color: owner.branding?.color || '#FF2222' }} />
                                                </div>
                                                <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-[#0a0a0a] shadow-sm ${owner.status === 'Active' ? 'bg-green-500' : 'bg-red-500'}`} />
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-3">
                                                    <h4 className="text-lg font-black text-white italic">{owner.name}</h4>
                                                    <span className="px-2 py-0.5 bg-white/5 border border-white/10 rounded text-[9px] font-black text-zinc-500 uppercase tracking-tighter">
                                                        NODE: {owner.id.slice(0, 6)}
                                                    </span>
                                                </div>
                                                <div className="flex flex-col mt-1">
                                                    <p className="text-xs text-zinc-400 font-bold uppercase tracking-tight">{owner.ownerName || 'Unknown Owner'}</p>
                                                    <p className="text-[10px] text-zinc-600 font-mono">{owner.ownerEmail} • {owner.phone}</p>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 md:grid-cols-3 gap-8 text-left md:text-center w-full xl:w-auto">
                                            <div>
                                                <p className="text-[9px] font-black text-zinc-600 uppercase tracking-widest mb-1">License Period</p>
                                                <p className="text-[10px] font-bold text-white bg-white/5 border border-white/5 px-2 py-1.5 rounded">{owner.validUntil || 'N/A'}</p>
                                            </div>
                                            <div>
                                                <p className="text-[9px] font-black text-zinc-600 uppercase tracking-widest mb-1">Tier</p>
                                                <p className="text-[9px] font-black text-red-500 bg-red-500/10 px-2 py-1 rounded inline-block uppercase italic">{owner.plan}</p>
                                            </div>
                                            <div className="hidden md:block">
                                                <p className="text-[9px] font-black text-zinc-600 uppercase tracking-widest mb-1">Capability</p>
                                                <div className="flex items-center justify-center gap-1.5 text-[10px] font-black text-zinc-400 uppercase italic">
                                                    <Zap className="w-3 h-3 text-red-500" />
                                                    {owner.eventLimit || 0} Events
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2 w-full xl:w-auto mt-4 xl:mt-0 pt-4 xl:pt-0 border-t border-white/5 xl:border-none">
                                            <button 
                                                onClick={() => toggleOwnerStatus(owner.id, owner.name, owner.status)}
                                                className={`p-2.5 rounded-xl transition-all border ${
                                                    owner.status === 'Active' 
                                                    ? 'bg-amber-500/10 border-amber-500/20 text-amber-500 hover:bg-amber-500 hover:text-white' 
                                                    : 'bg-green-500/10 border-green-500/20 text-green-500 hover:bg-green-500 hover:text-white'
                                                }`}
                                                title={owner.status === 'Active' ? "Suspend Node" : "Re-activate Node"}
                                            >
                                                {owner.status === 'Active' ? <XCircle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                                            </button>
                                            <button onClick={() => archiveOwner(owner.id, owner.name)} className="p-2.5 bg-white/5 border border-white/10 rounded-xl text-zinc-500 hover:text-red-500 hover:bg-red-500/10 hover:border-red-500/30 transition-all" title="Send to Vault">
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                            <button onClick={() => handleResetPassword(owner.ownerEmail, owner.name)} className="p-2.5 bg-white/5 border border-white/10 rounded-xl text-zinc-500 hover:text-sky-400 hover:bg-sky-400/10 hover:border-sky-400/30 transition-all" title="Password Reset">
                                                <Key className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </motion.div>
                                ))}
                            </AnimatePresence>
                        </div>
                    )}

                    {activeTab === 'analytics' && (() => {
                        const ownerLimit = user.userLimit || user.ownerLimit || 10;
                        const potentialMRR = owners.length * 299;
                        const ownerPerformance = owners.map(o => ({
                            ...o,
                            eventCount: allEvents.filter(e => e.ownerId === o.id).length
                        })).sort((a, b) => b.eventCount - a.eventCount);
                        const topEvents = [...allEvents]
                            .sort((a, b) => (b.registrations || 0) - (a.registrations || 0))
                            .slice(0, 5);
                        return (
                            <div className="space-y-8">
                                {/* Revenue Overview */}
                                <div>
                                    <h3 className="text-xs font-black text-zinc-500 uppercase tracking-[0.3em] mb-6 px-2">Revenue Overview</h3>
                                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                                        {[
                                            { label: 'Active Owners', value: owners.length, icon: Building2, sub: `Limit: ${ownerLimit}` },
                                            { label: 'Total Events', value: allEvents.length, icon: Calendar, sub: 'Across all owners' },
                                            { label: 'Total Attendees', value: realStats.attendees.toLocaleString(), icon: Users, sub: 'Live count' },
                                            { label: 'Potential MRR', value: `$${potentialMRR.toLocaleString()}`, icon: TrendingUp, sub: 'Based on standard plan pricing' },
                                        ].map((card, i) => (
                                            <div key={i} className="glass-panel p-6 border-white/5 bg-white/[0.02]">
                                                <div className="w-10 h-10 bg-red-500/10 rounded-xl flex items-center justify-center mb-4">
                                                    <card.icon className="w-5 h-5 text-red-500" />
                                                </div>
                                                <p className="text-zinc-500 text-[10px] font-black uppercase tracking-widest mb-1">{card.label}</p>
                                                <p className="text-3xl font-black text-white">{card.value}</p>
                                                <p className="text-[10px] text-zinc-600 mt-1 italic">{card.sub}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Owner Performance Table */}
                                <div>
                                    <h3 className="text-xs font-black text-zinc-500 uppercase tracking-[0.3em] mb-6 px-2">Owner Performance</h3>
                                    <div className="glass-panel border-white/5 overflow-hidden">
                                        <table className="w-full text-left">
                                            <thead className="bg-white/5">
                                                <tr>
                                                    <th className="px-6 py-4 text-[10px] font-black text-zinc-500 uppercase">Owner</th>
                                                    <th className="px-6 py-4 text-[10px] font-black text-zinc-500 uppercase">Email</th>
                                                    <th className="px-6 py-4 text-[10px] font-black text-zinc-500 uppercase">Events</th>
                                                    <th className="px-6 py-4 text-[10px] font-black text-zinc-500 uppercase">Status</th>
                                                    <th className="px-6 py-4 text-[10px] font-black text-zinc-500 uppercase">Plan</th>
                                                    <th className="px-6 py-4 text-[10px] font-black text-zinc-500 uppercase">License Expiry</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-white/5">
                                                {ownerPerformance.map(o => (
                                                    <tr key={o.id} className="hover:bg-white/[0.01]">
                                                        <td className="px-6 py-4 text-sm font-bold text-white">{o.name}</td>
                                                        <td className="px-6 py-4 text-[10px] text-zinc-500 font-mono">{o.ownerEmail}</td>
                                                        <td className="px-6 py-4">
                                                            <span className="text-sm font-black text-red-500">{o.eventCount}</span>
                                                        </td>
                                                        <td className="px-6 py-4">
                                                            <span className={`text-[9px] font-black px-2 py-1 rounded-full uppercase ${o.status === 'Active' ? 'bg-green-500/10 text-green-500' : 'bg-amber-500/10 text-amber-500'}`}>{o.status}</span>
                                                        </td>
                                                        <td className="px-6 py-4 text-[10px] text-zinc-400 uppercase italic">{o.plan || 'N/A'}</td>
                                                        <td className="px-6 py-4 text-[10px] text-zinc-400 font-mono">{o.validUntil || 'N/A'}</td>
                                                    </tr>
                                                ))}
                                                {ownerPerformance.length === 0 && (
                                                    <tr><td colSpan={6} className="px-6 py-10 text-center text-zinc-600 italic text-sm">No owners found.</td></tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                {/* Top Events */}
                                <div>
                                    <h3 className="text-xs font-black text-zinc-500 uppercase tracking-[0.3em] mb-6 px-2">Top 5 Events by Registrations</h3>
                                    <div className="space-y-3">
                                        {topEvents.length === 0 ? (
                                            <div className="glass-panel p-8 text-center text-zinc-600 italic text-sm">No events found in your infrastructure.</div>
                                        ) : topEvents.map((ev, idx) => (
                                            <div key={ev.id} className="glass-panel p-4 flex items-center gap-6 border-white/5 bg-white/[0.02]">
                                                <span className="text-3xl font-black text-red-500/30 w-8">#{idx + 1}</span>
                                                <div className="w-10 h-10 bg-red-500/10 rounded-xl flex items-center justify-center border border-red-500/10 flex-shrink-0">
                                                    <Calendar className="w-5 h-5 text-red-500" />
                                                </div>
                                                <div className="flex-1">
                                                    <h4 className="text-sm font-black text-white italic uppercase">{ev.name}</h4>
                                                    <p className="text-[10px] text-zinc-500 flex items-center gap-2">
                                                        <Building2 className="w-3 h-3" />
                                                        {owners.find(o => o.id === ev.ownerId)?.name || 'Unknown Owner'}
                                                    </p>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-xl font-black text-white">{(ev.registrations || 0).toLocaleString()}</p>
                                                    <p className="text-[9px] text-zinc-600 uppercase tracking-widest">Registrations</p>
                                                </div>
                                                <span className={`text-[9px] font-black px-2 py-1 rounded-full uppercase ${ev.status === 'Active' ? 'bg-green-500/10 text-green-500' : 'bg-zinc-500/10 text-zinc-500'}`}>{ev.status || 'Draft'}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        );
                    })()}

                    {activeTab === 'archive' && (
                        <div className="space-y-4">
                             <div className="flex justify-between items-center mb-6 px-2">
                                <h3 className="text-xs font-black text-zinc-500 uppercase tracking-[0.3em]">Owner Vault</h3>
                                <span className="text-[10px] font-black text-amber-500 bg-amber-500/10 px-3 py-1 rounded-full uppercase italic">{archivedOwners.length} Suspended Entities</span>
                            </div>
                            <div className="grid grid-cols-1 gap-4">
                                {archivedOwners.map(owner => (
                                    <div key={owner.id} className="glass-panel p-4 flex items-center justify-between border-white/5 bg-white/[0.02]">
                                        <div className="flex items-center gap-4">
                                            <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center border border-white/10">
                                                <Building2 className="w-5 h-5 text-zinc-600" />
                                            </div>
                                            <div>
                                                <p className="text-sm font-bold text-white uppercase tracking-tight">{owner.name}</p>
                                                <p className="text-[10px] text-zinc-500">Suspended Node</p>
                                            </div>
                                        </div>
                                        <div className="flex gap-2">
                                            <button onClick={() => restoreOwner(owner)} className="p-2 hover:bg-green-500/10 text-zinc-500 hover:text-green-500 rounded-lg transition-all" title="Restore & Activate">
                                                <RefreshCw className="w-4 h-4" />
                                            </button>
                                            <button onClick={() => purgeOwner(owner.id)} className="p-2 hover:bg-red-500/10 text-zinc-500 hover:text-red-500 rounded-lg transition-all" title="Permanent Destruction">
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {activeTab === 'organisers' && (
                        <div className="space-y-6">
                            <div className="flex justify-between items-center mb-4 px-2">
                                <h3 className="text-xs font-black text-zinc-500 uppercase tracking-[0.3em]">Organiser Registry (Level 4)</h3>
                                <button className="px-4 py-2 bg-white/5 border border-white/10 text-white rounded-lg font-bold text-[10px] uppercase tracking-widest hover:bg-white/10 transition-all">Add Organiser</button>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {owners.map(owner => (
                                    <div key={owner.id} className="glass-panel p-6 border-white/5 bg-white/[0.02]">
                                        <h4 className="text-[10px] font-black text-red-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                                            <Building2 className="w-3 h-3" /> Under {owner.name}
                                        </h4>
                                        <div className="space-y-3">
                                            <div className="p-3 bg-white/5 rounded-xl border border-white/5 flex items-center justify-between group">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center text-[10px] font-black text-zinc-500 group-hover:text-white transition-colors">
                                                        EP
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-bold text-white tracking-tight italic">EventPro Lead</p>
                                                        <p className="text-[10px] text-zinc-500 font-mono tracking-tighter">primary@eventpro.com</p>
                                                    </div>
                                                </div>
                                                <div className="px-2 py-0.5 bg-green-500/10 text-green-500 text-[8px] font-black rounded uppercase">Active</div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {activeTab === 'events' && (
                        <div className="space-y-6">
                            <div className="flex justify-between items-center mb-4 px-2">
                                <h3 className="text-xs font-black text-zinc-500 uppercase tracking-[0.3em]">Active Event Instances</h3>
                                <div className="flex gap-2">
                                    <span className="text-[10px] font-black text-zinc-500 bg-white/5 px-3 py-1 rounded-full uppercase tracking-widest">Global Status: Nominal</span>
                                </div>
                            </div>
                            <div className="grid grid-cols-1 gap-4">
                                {allEvents.length === 0 ? (
                                    <div className="glass-panel p-12 text-center text-zinc-600 italic text-sm">No active events detected in your infrastructure node.</div>
                                ) : (
                                    allEvents.map(event => (
                                        <div key={event.id} className="glass-panel p-5 border-white/5 flex items-center justify-between hover:bg-white/[0.03] transition-all group">
                                            <div className="flex items-center gap-6">
                                                <div className="w-12 h-12 bg-red-500/10 rounded-2xl flex items-center justify-center border border-red-500/10 group-hover:border-red-500/30 transition-all">
                                                    <Calendar className="w-6 h-6 text-red-500" />
                                                </div>
                                                <div>
                                                    <h4 className="text-lg font-black text-white italic tracking-tight uppercase">{event.name}</h4>
                                                    <div className="flex items-center gap-3 mt-1">
                                                        <span className="text-[10px] text-zinc-500 font-black uppercase flex items-center gap-1">
                                                            <Building2 className="w-3 h-3" /> {owners.find(o => o.id === event.ownerId)?.name || 'Internal'}
                                                        </span>
                                                        <span className="text-[10px] text-red-500 font-black uppercase flex items-center gap-1">
                                                            <Users className="w-3 h-3" /> {event.registrations || 0} Registered
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <button onClick={() => exportDatabase(event.id)} className="p-2.5 bg-white/5 border border-white/10 rounded-xl text-zinc-500 hover:text-white transition-all">
                                                    <Database className="w-4 h-4" />
                                                </button>
                                                <button className="px-4 py-2.5 bg-red-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-red-700 transition-all">Manage Hub</button>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    )}

                    {activeTab === 'staff' && (
                        <div className="space-y-6">
                             <div className="flex justify-between items-center mb-4 px-2">
                                <h3 className="text-xs font-black text-zinc-500 uppercase tracking-[0.3em]">Infrastructure Staff Hub</h3>
                                <div className="flex gap-2">
                                    <button className="px-4 py-2 bg-red-600 text-white rounded-lg font-black text-[10px] uppercase tracking-widest hover:bg-red-700 transition-all">Provision Global Staff</button>
                                </div>
                            </div>
                            
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                {[
                                    { category: 'Security Tier', roles: ['Security Head', 'Bouncer', 'Field Security'], icon: ShieldAlert },
                                    { category: 'Crew Tier', roles: ['Electrician', 'Fabricator', 'Logistics'], icon: Zap },
                                    { category: 'Management Tier', roles: ['Designer', 'Runner Boy', 'Finance'], icon: Activity },
                                ].map((tier, i) => (
                                    <div key={i} className="glass-panel p-6 border-white/5 bg-white/[0.02]">
                                        <div className="flex items-center gap-3 mb-6">
                                            <div className="w-10 h-10 bg-red-500/10 rounded-xl flex items-center justify-center">
                                                <tier.icon className="w-5 h-5 text-red-500" />
                                            </div>
                                            <h4 className="text-sm font-black text-white uppercase tracking-tighter">{tier.category}</h4>
                                        </div>
                                        <div className="space-y-2">
                                            {tier.roles.map(role => (
                                                <div key={role} className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/5 hover:border-red-500/20 transition-all cursor-pointer group">
                                                    <span className="text-[10px] font-bold text-zinc-500 group-hover:text-white uppercase tracking-widest">{role}</span>
                                                    <span className="text-[8px] font-black text-red-500 font-mono">0 Active</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                            
                            <div className="glass-panel p-8 border-white/5 bg-white/[0.01] border-dashed text-center">
                                <p className="text-zinc-600 text-[10px] font-black uppercase tracking-[0.4em]">Global Staff Identity Management System</p>
                            </div>
                        </div>
                    )}

                    {activeTab === 'communications' && (
                        <div className="glass-panel border-white/5 overflow-hidden">
                            <table className="w-full text-left">
                                <thead className="bg-white/5">
                                    <tr>
                                        <th className="px-6 py-4 text-[10px] font-black text-zinc-500 uppercase">Target</th>
                                        <th className="px-6 py-4 text-[10px] font-black text-zinc-500 uppercase">Type</th>
                                        <th className="px-6 py-4 text-[10px] font-black text-zinc-500 uppercase">Channels</th>
                                        <th className="px-6 py-4 text-[10px] font-black text-zinc-500 uppercase">Status</th>
                                        <th className="px-6 py-4 text-[10px] font-black text-zinc-500 uppercase">Timestamp</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {communications.map(comm => (
                                        <tr key={comm.id} className="hover:bg-white/[0.01]">
                                            <td className="px-6 py-4">
                                                <p className="text-sm font-bold text-white">{comm.name}</p>
                                                <p className="text-[10px] text-zinc-500 font-mono">{comm.to}</p>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className="text-[9px] font-black px-2 py-1 bg-red-500/10 text-red-500 rounded-full uppercase italic">{comm.type}</span>
                                            </td>
                                            <td className="px-6 py-4 flex gap-1">
                                                {comm.channels?.map(c => <span key={c} className="text-[8px] bg-white/5 px-1.5 py-0.5 rounded uppercase font-bold text-zinc-500">{c}</span>)}
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-1.5 text-[10px] font-bold text-green-500 uppercase">
                                                    <CheckCircle2 className="w-3 h-3" /> Sent
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-[10px] text-zinc-600 font-mono text-right">
                                                {new Date(comm.timestamp).toLocaleString()}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {activeTab === 'settings' && (
                        <div className="space-y-8">
                            {/* Multi-Provider Gateway Registry */}
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
                                                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-red-500/30"
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
                                                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-red-500/30" 
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
                                                            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-red-500/30" 
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
                                                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-red-500/30" 
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

                            {/* Billing Currency & Brand Identity Row */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* Billing Currency Card */}
                                <div className="glass-panel p-6 border-white/5 bg-white/[0.02]">
                                    <div className="flex items-center gap-3 mb-6">
                                        <div className="w-10 h-10 bg-amber-500/10 rounded-xl flex items-center justify-center">
                                            <DollarSign className="w-5 h-5 text-amber-400" />
                                        </div>
                                        <div>
                                            <h5 className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Billing Currency</h5>
                                            <p className="text-sm font-black text-white uppercase italic">Payment Node</p>
                                        </div>
                                    </div>
                                    <div className="space-y-4">
                                        <div className="space-y-1.5">
                                            <label className="text-[9px] font-black text-zinc-600 uppercase tracking-widest ml-1">Select Currency</label>
                                            <select
                                                value={selectedCurrency}
                                                onChange={(e) => saveCurrency(e.target.value)}
                                                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-red-500/30"
                                            >
                                                {CURRENCIES.map(c => (
                                                    <option key={c.code} value={c.code} className="bg-[#0a0a0a]">
                                                        {c.symbol} {c.code} — {c.name}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="p-3 bg-white/5 rounded-xl border border-white/5">
                                            <p className="text-[10px] text-zinc-400 italic">
                                                All invoices and plans will be displayed in{' '}
                                                <span className="text-white font-black">
                                                    {CURRENCIES.find(c => c.code === selectedCurrency)?.symbol || ''} {selectedCurrency}
                                                </span>
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                {/* Brand Identity Card */}
                                <div className="glass-panel p-6 border-white/5 bg-white/[0.02]">
                                    <div className="flex items-center gap-3 mb-6">
                                        <div className="w-10 h-10 bg-purple-500/10 rounded-xl flex items-center justify-center">
                                            <Palette className="w-5 h-5 text-purple-400" />
                                        </div>
                                        <div>
                                            <h5 className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Brand Identity</h5>
                                            <p className="text-sm font-black text-white uppercase italic">White-label Node</p>
                                        </div>
                                    </div>
                                    <div className="space-y-4">
                                        <div className="space-y-1.5">
                                            <label className="text-[9px] font-black text-zinc-600 uppercase tracking-widest ml-1">App Name</label>
                                            <input
                                                type="text"
                                                placeholder="Your App Name"
                                                value={branding.appName}
                                                onChange={(e) => setBranding(prev => ({ ...prev, appName: e.target.value }))}
                                                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-red-500/30"
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-[9px] font-black text-zinc-600 uppercase tracking-widest ml-1">Logo URL</label>
                                            <input
                                                type="text"
                                                placeholder="https://example.com/logo.png"
                                                value={branding.logoUrl}
                                                onChange={(e) => setBranding(prev => ({ ...prev, logoUrl: e.target.value }))}
                                                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-red-500/30"
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-[9px] font-black text-zinc-600 uppercase tracking-widest ml-1">Support Email</label>
                                            <input
                                                type="email"
                                                placeholder="support@yourdomain.com"
                                                value={branding.supportEmail}
                                                onChange={(e) => setBranding(prev => ({ ...prev, supportEmail: e.target.value }))}
                                                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-red-500/30"
                                            />
                                        </div>
                                        {/* Live Preview */}
                                        {(branding.appName || branding.logoUrl) && (
                                            <div className="p-4 bg-white/5 rounded-xl border border-white/10 flex items-center gap-3">
                                                {branding.logoUrl && (
                                                    <img
                                                        src={branding.logoUrl}
                                                        alt="Logo Preview"
                                                        className="w-10 h-10 object-contain rounded-lg bg-white/5"
                                                        onError={(e) => { e.target.style.display = 'none'; }}
                                                    />
                                                )}
                                                <div>
                                                    <p className="text-sm font-black text-white uppercase tracking-tight">{branding.appName || 'Your App'}</p>
                                                    {branding.supportEmail && <p className="text-[10px] text-zinc-500 font-mono">{branding.supportEmail}</p>}
                                                </div>
                                            </div>
                                        )}
                                        <button
                                            onClick={saveBranding}
                                            disabled={savingBranding}
                                            className="w-full py-3 bg-red-500/10 border border-red-500/20 rounded-xl text-[10px] font-black uppercase tracking-widest text-red-400 hover:bg-red-500 hover:text-white transition-all flex items-center justify-center gap-2"
                                        >
                                            {savingBranding ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                                            Save Brand Identity
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div className="glass-panel p-8 border-white/5 bg-white/[0.02]">
                                <div className="flex justify-between items-start mb-8">
                                    <div>
                                        <h4 className="text-xs font-black text-zinc-500 uppercase tracking-[0.2em] flex items-center gap-2 mb-2">
                                            <Database className="w-4 h-4 text-red-500" /> Data Portability & Master Backups
                                        </h4>
                                        <p className="text-[10px] text-zinc-500 font-mono italic">Download complete JSON replicas of your managed ecosystem. Useful for auditing or disaster recovery.</p>
                                    </div>
                                    <span className="px-2 py-1 bg-green-500/10 text-green-500 text-[10px] font-black rounded uppercase tracking-widest">Master Link: Nominal</span>
                                </div>
                                <div className="flex flex-col md:flex-row gap-4 items-end">
                                    <button onClick={() => exportDatabase()} className="px-6 py-3 bg-red-500/10 border border-red-500/20 rounded-xl text-[10px] font-black uppercase tracking-widest text-red-400 hover:bg-red-500 hover:text-white transition-all h-[42px]">
                                        Download Master Backup (.json)
                                    </button>
                                    
                                    <div className="flex-1 space-y-1.5 w-full md:w-auto">
                                        <label className="text-[9px] font-black text-zinc-600 uppercase tracking-widest ml-1">Select Managed Owner</label>
                                        <select 
                                            value={selectedOwnerForBackup}
                                            onChange={(e) => { setSelectedOwnerForBackup(e.target.value); setSelectedEventForBackup(''); }}
                                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-[10px] text-white outline-none focus:border-red-500/50"
                                        >
                                            <option value="" className="bg-[#0a0a0a]">-- All Owners --</option>
                                            {owners.map(o => (
                                                <option key={o.id} value={o.id} className="bg-[#0a0a0a]">{o.name}</option>
                                            ))}
                                        </select>
                                    </div>

                                    <div className="flex-1 space-y-1.5 w-full md:w-auto">
                                        <label className="text-[9px] font-black text-zinc-600 uppercase tracking-widest ml-1">Select Event Instance</label>
                                        <select 
                                            value={selectedEventForBackup}
                                            onChange={(e) => setSelectedEventForBackup(e.target.value)}
                                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-[10px] text-white outline-none focus:border-red-500/50"
                                            disabled={!selectedOwnerForBackup}
                                        >
                                            <option value="" className="bg-[#0a0a0a]">-- Select Event --</option>
                                            {allEvents.filter(ev => ev.ownerId === selectedOwnerForBackup).map(ev => (
                                                <option key={ev.id} value={ev.id} className="bg-[#0a0a0a]">{ev.name}</option>
                                            ))}
                                        </select>
                                    </div>

                                    <button 
                                        disabled={!selectedEventForBackup || exportingDatabase}
                                        onClick={() => exportDatabase(selectedEventForBackup)} 
                                        className="px-6 py-3 bg-white/5 border border-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest text-zinc-400 hover:text-white disabled:opacity-30 h-[42px] transition-all w-full md:w-auto"
                                    >
                                        {exportingDatabase ? 'Exporting...' : 'Export Target Node'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'profile' && (
                        <div className="max-w-2xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4">
                            <div className="glass-panel p-10 border-white/5 relative overflow-hidden">
                                <Fingerprint className="absolute top-0 right-0 p-8 w-32 h-32 text-red-500/10" />
                                <h3 className="text-2xl font-black text-white uppercase tracking-tight mb-8 text-shadow-glow">Node Security</h3>
                                <form onSubmit={handleChangePassword} className="space-y-6">
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-black text-zinc-600 uppercase tracking-widest ml-1">Current Key</label>
                                        <input type="password" required value={passwordForm.current} onChange={e => setPasswordForm({ ...passwordForm, current: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-white outline-none focus:border-red-500/50" />
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-black text-zinc-600 uppercase tracking-widest ml-1">New Security Key</label>
                                            <input type="password" required value={passwordForm.new} onChange={e => setPasswordForm({ ...passwordForm, new: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-white outline-none focus:border-red-500/50" />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-black text-zinc-600 uppercase tracking-widest ml-1">Confirm Key</label>
                                            <input type="password" required value={passwordForm.confirm} onChange={e => setPasswordForm({ ...passwordForm, confirm: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-white outline-none focus:border-red-500/50" />
                                        </div>
                                    </div>
                                    <button type="submit" disabled={updatingPassword} className="w-full py-4 bg-red-600 hover:bg-red-500 text-white rounded-2xl font-black uppercase tracking-widest text-xs shadow-xl shadow-red-600/20 transition-all">
                                        {updatingPassword ? 'Synchronizing Key...' : 'Update Infrastructure Key'}
                                    </button>
                                </form>
                            </div>
                        </div>
                    )}
                </main>

                {/* Modals & Dialogs */}
                <AnimatePresence>
                    {showAddOwner && (
                        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowAddOwner(false)} className="absolute inset-0 bg-black/90 backdrop-blur-md" />
                            <motion.div initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="relative w-full max-w-2xl bg-[#0a0a0a] border border-white/10 rounded-3xl overflow-hidden shadow-2xl">
                                <div className="p-8 border-b border-white/5 bg-gradient-to-r from-red-500/10 to-transparent">
                                    <h3 className="text-2xl font-black text-white uppercase tracking-tight">Provision Owner Node</h3>
                                    <p className="text-zinc-500 text-xs mt-1 italic tracking-widest uppercase">Hierarchy Level 3: Enterprise Administration</p>
                                </div>
                                <div className="p-8 space-y-6 max-h-[60vh] overflow-y-auto">
                                    <div className="grid grid-cols-2 gap-6">
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">Company Name</label>
                                            <input type="text" placeholder="Entity Name" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-red-500/50" value={newOwner.name} onChange={e => setNewOwner({ ...newOwner, name: e.target.value })} />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">Owner Full Name</label>
                                            <input type="text" placeholder="Administrator Name" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-red-500/50" value={newOwner.ownerName} onChange={e => setNewOwner({ ...newOwner, ownerName: e.target.value })} />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-6">
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">Identity Email</label>
                                            <input type="email" placeholder="admin@entity.com" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-red-500/50" value={newOwner.ownerEmail} onChange={e => setNewOwner({ ...newOwner, ownerEmail: e.target.value })} />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">Contact Phone</label>
                                            <input type="tel" placeholder="+91..." className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-red-500/50" value={newOwner.phone} onChange={e => setNewOwner({ ...newOwner, phone: e.target.value })} />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-6">
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">Event Limit</label>
                                            <input type="number" min="1" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-red-500/50" value={newOwner.eventLimit} onChange={e => setNewOwner({ ...newOwner, eventLimit: parseInt(e.target.value) || 0 })} />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">Badge / User Limit</label>
                                            <input type="number" min="1" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-red-500/50" value={newOwner.userLimit} onChange={e => setNewOwner({ ...newOwner, userLimit: parseInt(e.target.value) || 0 })} />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-1 gap-6">
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">License Period (End Date)</label>
                                            <FormattedDateInput value={newOwner.validUntil} onChange={e => setNewOwner({ ...newOwner, validUntil: e.target.value })} className="w-full" />
                                        </div>
                                    </div>
                                </div>
                                <div className="p-8 bg-white/[0.02] flex gap-4">
                                    <button onClick={() => setShowAddOwner(false)} className="flex-1 py-4 bg-white/5 border border-white/10 rounded-2xl font-black uppercase tracking-widest text-[10px]">Cancel</button>
                                    <button onClick={handleAddOwner} className="flex-1 bg-red-600 text-white py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-red-700 transition-all">Provision Node</button>
                                </div>
                            </motion.div>
                        </div>
                    )}

                    {dialog.isOpen && (
                        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 bg-black/90 backdrop-blur-xl" />
                            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="relative bg-[#0d0d0d] border border-white/10 rounded-3xl p-8 max-w-md w-full shadow-2xl text-center">
                                <ShieldAlert className="w-12 h-12 text-red-500 mb-6 mx-auto" />
                                <h3 className="text-xl font-black text-white uppercase tracking-tight mb-2 italic">{dialog.title}</h3>
                                <p className="text-zinc-500 text-sm mb-8 font-medium">{dialog.message}</p>
                                <div className="flex gap-4">
                                    <button onClick={closeDialog} className="flex-1 py-3 bg-white/5 border border-white/10 rounded-xl font-bold hover:bg-white/10 transition-all">Cancel</button>
                                    <button onClick={() => { dialog.onConfirm(); closeDialog(); }} className="flex-1 bg-red-600 text-white py-3 rounded-xl font-black uppercase tracking-widest text-xs hover:bg-red-700 shadow-lg shadow-red-600/20 transition-all">Confirm</button>
                                </div>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>
            </div>
        </PageWrapper>
    );
};

export default ResellerDashboard;
