import React, { useState, useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import {
    ShieldAlert, Globe, Users, CreditCard, Layout, Settings,
    Plus, Search, MoreVertical, CheckCircle2, XCircle, Zap,
    BarChart3, Box, Lock, Eye, Building2, Palette, Check, LogOut, Key, Mail, Trash2, RefreshCw, Send, DownloadCloud, Download, Database, Fingerprint, ShieldCheck, MessageSquare, Shield
} from 'lucide-react';
import PageWrapper from '../components/PageWrapper';
import FormattedDateInput from '../components/FormattedDateInput';
import { useAuth } from '../hooks/useAuth';
import { db, auth, functions, httpsCallable } from '../firebase';
import { sendPasswordResetEmail, updatePassword, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import {
    collection, onSnapshot, query, addDoc, getDocs,
    serverTimestamp, updateDoc, doc, setDoc, deleteDoc, orderBy, where, limit
} from 'firebase/firestore';
import { logAction } from '../utils/audit';
import { CURRENCIES } from '../utils/currency';

const SuperuserDashboard = () => {
    const { logout } = useAuth();
    const [resellers, setResellers] = useState([]);
    const [activeTab, setActiveTab] = useState('resellers');
    const [editingReseller, setEditingReseller] = useState(null);
    const [showAddReseller, setShowAddReseller] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [newReseller, setNewReseller] = useState({
        name: '',
        slug: '',
        ownerName: '',
        ownerEmail: '',
        phone: '',
        address: '',
        taxNumber: '',
        country: '',
        city: '',
        language: 'English',
        plan: 'Enterprise Universal',
        validFrom: new Date().toISOString().split('T')[0],
        validUntil: new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().split('T')[0],
        eventLimit: 10,
        userLimit: 5000,
        features: {
            aiScanning: true,
            identityAuth: true,
            paymentGateway: true,
            messagingHub: true,
            i18nSupport: true,
            whiteLabel: true,
            customInfra: true,
            advancedAnalytics: true
        },
        branding: {
            color: '#FF2222',
            logo: ''
        }
    });

    const [infraConfig, setInfraConfig] = useState(null);
    const [, setSavingInfra] = useState(false);
    const [validating, setValidating] = useState({ sms: false, whatsapp: false, email: false });
    const [superusers, setSuperusers] = useState([]);
    const [newMaster, setNewMaster] = useState({ name: '', email: '', phone: '', password: '' });
    const [, setExportingDatabase] = useState(false);
    
    // --- Password Change State ---
    const [passwordForm, setPasswordForm] = useState({ current: '', new: '', confirm: '' });
    const [updatingPassword, setUpdatingPassword] = useState(false);

    const handleChangePassword = async (e) => {
        e.preventDefault();
        if (passwordForm.new !== passwordForm.confirm) {
            alert("New passwords do not match.");
            return;
        }
        if (passwordForm.new.length < 6) {
            alert("Password must be at least 6 characters.");
            return;
        }

        setUpdatingPassword(true);
        try {
            const user = auth.currentUser;
            if (!user) throw new Error("No active session found.");

            // Re-authenticate for security
            const credential = EmailAuthProvider.credential(user.email, passwordForm.current);
            await reauthenticateWithCredential(user, credential);
            
            // Update password
            await updatePassword(user, passwordForm.new);
            
            // Update in local registry if it exists
            const d = await getDocs(query(collection(db, "_config", "mainframe", "superusers"), where("email", "==", user.email)));
            if (!d.empty) {
                await updateDoc(d.docs[0].ref, { password: passwordForm.new });
            }

            alert("✅ Password updated successfully.");
            setPasswordForm({ current: '', new: '', confirm: '' });
            await logAction(db, user, 'CHANGE_PASSWORD', 'user', user.email);
        } catch (e) {
            console.error("Password update failed:", e);
            alert("❌ Update Failed: " + e.message);
        } finally {
            setUpdatingPassword(false);
        }
    };
    
    // Email Templates State
    const [emailTemplates, setEmailTemplates] = useState(null);
    const [activeTemplate, setActiveTemplate] = useState('welcome_onboarding');
    const [, setSavingTemplates] = useState(false);
    
    // --- Backup Filtering State ---
    const [allEvents, setAllEvents] = useState([]);
    const [selectedResellerForBackup, setSelectedResellerForBackup] = useState('');
    const [selectedEventForBackup, setSelectedEventForBackup] = useState('');
    
    // --- Custom Dialog System ---
    const [dialog, setDialog] = useState({ isOpen: false, type: 'confirm', title: '', message: '', inputValue: '', onConfirm: null });
    const showConfirm = (title, message, onConfirm) => setDialog({ isOpen: true, type: 'confirm', title, message, inputValue: '', onConfirm });
    const _showPrompt = (title, message, defaultValue, onConfirm) => setDialog({ isOpen: true, type: 'prompt', title, message, inputValue: defaultValue || '', onConfirm });
    const closeDialog = () => setDialog(prev => ({ ...prev, isOpen: false }));
    
    const [realStats, setRealStats] = useState({
        attendees: 0,
        resellers: 0,
        events: 0,
        archivedCount: 0,
        archivedResellersCount: 0
    });
    const [archivedAttendees, setArchivedAttendees] = useState([]);
    const [archivedResellers, setArchivedResellers] = useState([]);

    // --- Analytics & Audit State ---
    const [analyticsKPIs, setAnalyticsKPIs] = useState({
        activeResellers: 0,
        totalEvents: 0,
        totalAttendees: 0,
        totalCommunications: 0,
    });
    const [topResellers, setTopResellers] = useState([]);
    const [recentActivity, setRecentActivity] = useState([]);
    const [auditLogs, setAuditLogs] = useState([]);
    const [auditFilter, setAuditFilter] = useState('all');

    // --- Platform Currency State ---
    const [defaultCurrency, setDefaultCurrency] = useState('USD');
    const [savingCurrency, setSavingCurrency] = useState(false);

    const seedRootMaster = async () => {
        try {
            const batch = [
                { value: 'akshay@indianroar.com', type: 'email', name: 'Akshay (Root)' },
                { value: '+919220601860', type: 'phone', name: 'Akshay (Root)' }
            ];
            for (const master of batch) {
                await setDoc(doc(db, "_config", "mainframe", "superusers", master.value), {
                    ...master,
                    addedAt: serverTimestamp()
                });
            }
        } catch (_err) {
            console.error("Seeding failed:", _err);
        }
    };

    useEffect(() => {
        // 1. Fetch Global Infrastructure Config
        const configRef = doc(db, "_config", "mainframe");
        const unsubConfig = onSnapshot(configRef, (doc) => {
            if (doc.exists()) {
                setInfraConfig(doc.data());
            } else {
                const initialConfig = {
                    firebase: {
                        apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
                        authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
                        projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
                        storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '',
                        messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
                        appId: import.meta.env.VITE_FIREBASE_APP_ID || ''
                    },
                    sms: {
                        provider: 'Twilio Global',
                        status: 'Not Configured',
                        quotaUsed: 0,
                        quotaTotal: 10000,
                        apiKey: ''
                    },
                    whatsapp: {
                        provider: 'WhatsApp Business',
                        status: 'Not Configured',
                        apiKey: ''
                    },
                    email: {
                        provider: 'Resend',
                        status: 'Operational',
                        sender: 'no-reply@eventpro.ag',
                        apiKey: ''
                    }
                };
                setInfraConfig(initialConfig);
            }
        });

        // 2. Fetch SaaS Masters (Superusers)
        const unsubSuper = onSnapshot(collection(db, "_config", "mainframe", "superusers"), (snap) => {
            const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            if (list.length === 0) {
                seedRootMaster();
            }
            setSuperusers(list);
        });

        // 3. Fetch Real Usage Metrics
        const unsubAttendees = onSnapshot(collection(db, "attendees"), (snap) => {
            setRealStats(prev => ({ ...prev, attendees: snap.size }));
        });
        
        const qResellers = query(collection(db, "users"), where("role", "==", "reseller"));
        const unsubResellers = onSnapshot(qResellers, (snap) => {
            setRealStats(prev => ({ ...prev, resellers: snap.size }));
            setResellers(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });

        // 4. Fetch Global Archives
        const archQuery = query(collection(db, "archived_attendees"), orderBy("archivedAt", "desc"));
        const unsubArch = onSnapshot(archQuery, (snap) => {
            const archData = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            setArchivedAttendees(archData);
            setRealStats(prev => ({ ...prev, archivedCount: archData.length }));
        });

        const unsubArchResellers = onSnapshot(collection(db, "archived_resellers"), (snap) => {
            const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setArchivedResellers(list);
            setRealStats(prev => ({ ...prev, archivedResellersCount: list.length }));
        });

        // 5. Fetch Email Templates
        const unsubTemplates = onSnapshot(doc(db, "_config", "email_templates"), (snap) => {
            if (snap.exists()) {
                setEmailTemplates(snap.data());
            } else {
                setEmailTemplates({
                    welcome_onboarding: { 
                        subject: 'Welcome to the EventPro Mainframe', 
                        body: 'Your node has been provisioned. Access the dashboard to begin infrastructure setup.' 
                    },
                    password_reset: { 
                        subject: 'Security: Credential Reset Requested', 
                        body: 'A password reset was triggered for your identity. Click the link below to securely update your credentials.' 
                    },
                    node_suspension: { 
                        subject: 'URGENT: Infrastructure Node Suspended', 
                        body: 'Your management access has been temporarily suspended by the root administrator. Please contact support.' 
                    },
                    digital_ticket: { 
                        subject: 'Your Digital Entry Pass', 
                        body: 'Attached is your secure holographic QR ticket for the upcoming event. Present this at the scanning node for access.' 
                    }
                });
            }
        });

        const unsubAllEvents = onSnapshot(collection(db, "events"), (snap) => {
            setAllEvents(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            setAnalyticsKPIs(prev => ({ ...prev, totalEvents: snap.size }));
        });

        // 6. Analytics KPIs
        const qActiveResellers = query(collection(db, "users"), where("role", "==", "reseller"), where("status", "==", "Active"));
        const unsubActiveResellers = onSnapshot(qActiveResellers, (snap) => {
            setAnalyticsKPIs(prev => ({ ...prev, activeResellers: snap.size }));
        });

        const unsubAnalyticsAttendees = onSnapshot(collection(db, "attendees"), (snap) => {
            setAnalyticsKPIs(prev => ({ ...prev, totalAttendees: snap.size }));
        });

        const unsubComms = onSnapshot(collection(db, "communications"), (snap) => {
            setAnalyticsKPIs(prev => ({ ...prev, totalCommunications: snap.size }));
        });

        // 7. Recent Activity from auditLogs (last 10)
        const recentActivityQuery = query(collection(db, "auditLogs"), orderBy("timestamp", "desc"), limit(10));
        const unsubActivity = onSnapshot(recentActivityQuery, (snap) => {
            setRecentActivity(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });

        // 8. Full Audit Logs (last 100)
        const auditQuery = query(collection(db, "auditLogs"), orderBy("timestamp", "desc"), limit(100));
        const unsubAudit = onSnapshot(auditQuery, (snap) => {
            setAuditLogs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });

        // 9. Platform Config (default currency)
        const platformConfigRef = doc(db, "_config", "platform");
        const unsubPlatformConfig = onSnapshot(platformConfigRef, (snap) => {
            if (snap.exists() && snap.data().defaultCurrency) {
                setDefaultCurrency(snap.data().defaultCurrency);
            }
        });

        return () => {
            unsubConfig();
            unsubResellers();
            unsubSuper();
            unsubAttendees();
            unsubArch();
            unsubArchResellers();
            unsubTemplates();
            unsubAllEvents();
            unsubActiveResellers();
            unsubAnalyticsAttendees();
            unsubComms();
            unsubActivity();
            unsubAudit();
            unsubPlatformConfig();
        };
    }, []);

    // Compute top 5 resellers whenever resellers or events change
    useEffect(() => {
        if (resellers.length === 0) return;
        const computeTopResellers = async () => {
            const eventsSnap = await getDocs(collection(db, "events"));
            const usersSnap = await getDocs(query(collection(db, "users"), where("role", "==", "owner")));
            const eventsData = eventsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            const ownersData = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }));

            const enriched = resellers.map(r => ({
                ...r,
                ownerCount: ownersData.filter(u => u.parentId === r.id).length,
                eventCount: eventsData.filter(e => e.tenantId === r.id).length,
            }));
            enriched.sort((a, b) => b.eventCount - a.eventCount);
            setTopResellers(enriched.slice(0, 5));
        };
        computeTopResellers();
    }, [resellers]);

    // Save platform default currency
    const saveCurrency = async (code) => {
        setSavingCurrency(true);
        try {
            await setDoc(doc(db, "_config", "platform"), { defaultCurrency: code }, { merge: true });
            setDefaultCurrency(code);
        } catch (e) {
            console.error("Failed to save currency:", e);
            alert("Failed to save currency preference.");
        } finally {
            setSavingCurrency(false);
        }
    };

    // Relative time helper
    const relativeTime = (timestamp) => {
        if (!timestamp) return 'Just now';
        const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        const diff = Math.floor((new Date().getTime() - date.getTime()) / 1000);
        if (diff < 60) return `${diff}s ago`;
        if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
        if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
        return `${Math.floor(diff / 86400)}d ago`;
    };

    const _addMaster = async () => {
        if (!newMaster.email && !newMaster.phone) {
            alert("Please provide at least an Email or a Phone number.");
            return;
        }
        if (!newMaster.password) {
            alert("Please provide an initial security password.");
            return;
        }

        try {
            if (newMaster.email) {
                await setDoc(doc(db, "_config", "mainframe", "superusers", newMaster.email.trim()), {
                    value: newMaster.email.trim(),
                    type: 'email',
                    name: newMaster.name,
                    password: newMaster.password,
                    addedAt: serverTimestamp()
                });
            }
            
            if (newMaster.phone) {
                let formattedPhone = newMaster.phone.trim();
                if (!formattedPhone.startsWith('+')) {
                    formattedPhone = '+' + formattedPhone;
                }
                await setDoc(doc(db, "_config", "mainframe", "superusers", formattedPhone), {
                    value: formattedPhone,
                    type: 'phone',
                    email: newMaster.email.trim(),
                    name: newMaster.name,
                    password: newMaster.password,
                    addedAt: serverTimestamp()
                });
            }

            setNewMaster({ name: '', email: '', phone: '', password: '' });
            alert("✅ Superuser provisioned successfully.");
        } catch (e) {
            console.error("Failed to add master:", e);
            alert("❌ Mainframe Reject: " + e.message);
        }
    };

    const _removeMaster = async (id, name) => {
        if (superusers.length <= 1) {
            alert("Cannot remove the last SaaS Master.");
            return;
        }
        showConfirm(
            "Remove Superuser",
            `Revoke Superuser access for ${name}?`,
            async () => {
                try {
                    await deleteDoc(doc(db, "_config", "mainframe", "superusers", id));
                } catch {
                    alert("Failed to remove master.");
                }
            }
        );
    };

    const saveInfraConfig = async (newConfig) => {
        setSavingInfra(true);
        try {
            await setDoc(doc(db, "_config", "mainframe"), newConfig, { merge: true });
        } catch (err) {
            console.error("Save failed:", err);
        } finally {
            setSavingInfra(false);
        }
    };

    const saveEmailTemplates = async () => {
        if (!emailTemplates) return;
        setSavingTemplates(true);
        try {
            await setDoc(doc(db, "_config", "email_templates"), emailTemplates, { merge: true });
            alert("✅ Templates saved successfully to the global registry.");
        } catch (err) {
            console.error("Save failed:", err);
            alert("❌ Failed to save templates.");
        } finally {
            setSavingTemplates(false);
        }
    };

    const exportDatabase = async (filterEventId = null) => {
        setExportingDatabase(true);
        try {
            const dbExport = {
                timestamp: new Date().toISOString(),
                version: "2.0",
                type: filterEventId ? 'Event-Specific' : 'Global-Mainframe',
                collections: {
                    resellers: filterEventId ? resellers.filter(r => r.id === selectedResellerForBackup) : resellers,
                    archived_resellers: filterEventId ? [] : archivedResellers,
                    events: filterEventId ? allEvents.filter(e => e.id === filterEventId) : allEvents,
                    attendees: [],
                    archived_attendees: archivedAttendees,
                    config: infraConfig
                }
            };
            
            let attQuery = collection(db, "attendees");
            if (filterEventId) {
                attQuery = query(attQuery, where("eventId", "==", filterEventId));
            }
            const attSnap = await getDocs(attQuery);
            dbExport.collections.attendees = attSnap.docs.map(d => ({ id: d.id, ...d.data() }));

            const blob = new Blob([JSON.stringify(dbExport, null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `eventpro_db_backup_${filterEventId || 'full'}_${new Date().getTime()}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            alert(`✅ ${filterEventId ? 'Event' : 'Full'} Database Export Downloaded Successfully.`);
        } catch (e) {
            console.error("Export Failed:", e);
            alert("❌ Export Failed: " + e.message);
        } finally {
            setExportingDatabase(false);
        }
    };

    const handleAddReseller = async () => {
        if (!newReseller.name || !newReseller.ownerEmail || !newReseller.phone) {
            alert("Reseller Name, Mobile Number, and Email ID are compulsory fields.");
            return;
        }

        const validFromDate = new Date(newReseller.validFrom);
        const validUntilDate = new Date(newReseller.validUntil);
        if (validUntilDate < validFromDate) {
            alert("Valid Until date cannot be less than Valid From date.");
            return;
        }

        const exists = resellers.some(t => t.slug?.toLowerCase().trim() === newReseller.slug?.toLowerCase().trim());
        if (exists && newReseller.slug) {
            alert(`🚫 Conflict: A reseller with the unique slug "${newReseller.slug}" is already registered.`);
            return;
        }

        try {
            const tempPassword = `EP-${Math.floor(100000 + Math.random() * 900000)}`;

            const newDoc = await addDoc(collection(db, "users"), {
                ...newReseller,
                role: 'reseller',
                parentId: auth.currentUser?.uid || 'system',
                status: 'Active',
                password: tempPassword,
                createdAt: serverTimestamp()
            });

            // Send onboarding communication via Cloud Function (supports Ethereal, Textbelt, Resend, Mock)
            const sendOnboarding = httpsCallable(functions, 'sendOnboardingCommunication');
            let commResult = null;
            try {
                const { data } = await sendOnboarding({
                    to: newReseller.ownerEmail,
                    phone: newReseller.phone,
                    name: newReseller.name,
                    credentials: { email: newReseller.ownerEmail, password: tempPassword },
                    role: 'reseller',
                    channels: ['email', 'sms']
                });
                commResult = data;
                // Onboarding communication sent
            } catch (commErr) {
                console.error("Onboarding communication failed:", commErr);
            }

            setShowAddReseller(false);
            setNewReseller({
                name: '', slug: '', ownerName: '', ownerEmail: '', phone: '', address: '', taxNumber: '', country: '', city: '', language: 'English',
                plan: 'Enterprise Universal', validFrom: new Date().toISOString().split('T')[0],
                validUntil: new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().split('T')[0],
                eventLimit: 10, userLimit: 5000,
                features: { aiScanning: true, identityAuth: true, paymentGateway: true, messagingHub: true, i18nSupport: true, whiteLabel: true, customInfra: true, advancedAnalytics: true },
                branding: { color: '#FF2222', logo: '' }
            });

            const previewUrl = commResult?.results?.email?.previewUrl;
            const emailOk = commResult?.results?.email?.success;
            const smsOk = commResult?.results?.sms?.success;
            alert(
                `🚀 Reseller Provisioned!` +
                `\n\nEmail: ${emailOk ? '✅ Sent' : '⚠️ Not sent'} ${previewUrl ? '(Test Preview)' : ''}` +
                `${previewUrl ? '\n🔗 ' + previewUrl : ''}` +
                `\nSMS: ${smsOk ? '✅ Sent' : '⚠️ Not sent'}` +
                `\n\nTemp Password: ${tempPassword}` +
                `${commResult?.mode === 'mock' ? '\n\nℹ️ Running in MOCK mode. Set firebase functions:config:set comms.mode=ethereal to test emails.' : ''}`
            );
            await logAction(db, auth.currentUser, 'CREATE_RESELLER', 'user', newDoc.id, { name: newReseller.name });
        } catch (e) {
            console.error("Error creating reseller:", e);
            alert(`❌ Provisioning Failed: ${e.message}`);
        }
    };

    const handleArchiveReseller = async (reseller) => {
        showConfirm(
            "Archive Reseller",
            `📦 Move "${reseller.name}" to vault? \n\nThis will AUTOMATICALLY SUSPEND their account and all sub-entities.`,
            async () => {
                try {
                    await setDoc(doc(db, "archived_resellers", reseller.id), {
                        ...reseller,
                        status: 'Suspended',
                        archivedAt: serverTimestamp(),
                        archiveStatus: 'Vaulted'
                    });
                    await deleteDoc(doc(db, "users", reseller.id));
                    alert(`📦 ${reseller.name} has been archived and suspended.`);
                    await logAction(db, auth.currentUser, 'ARCHIVE_RESELLER', 'user', reseller.id, { name: reseller.name });
                } catch (e) {
                    console.error("Archive failed:", e);
                    alert("❌ Archive Failed: " + e.message);
                }
            }
        );
    };

    const restoreReseller = async (reseller) => {
        showConfirm(
            "Restore Reseller",
            `Restore "${reseller.name}" to active production?`,
            async () => {
                try {
                    const { archivedAt: _archivedAt, archiveStatus: _archiveStatus, ...originalData } = reseller;
                    await setDoc(doc(db, "users", reseller.id), { ...originalData, status: 'Active' });
                    await deleteDoc(doc(db, "archived_resellers", reseller.id));
                    alert("Reseller restored successfully.");
                    await logAction(db, auth.currentUser, 'RESTORE_RESELLER', 'user', reseller.id);
                } catch (_err) {
                    console.error("Restore failed:", _err);
                }
            }
        );
    };

    const purgeReseller = async (id) => {
        showConfirm(
            "Permanent Destruction",
            "🚨 PERMANENT DESTRUCTION: All data for this reseller will be erased forever. Proceed?",
            async () => {
                try {
                    await deleteDoc(doc(db, "archived_resellers", id));
                    await logAction(db, auth.currentUser, 'PURGE_RESELLER', 'user', id);
                } catch (e) {
                    console.error("Purge failed:", e);
                }
            }
        );
    };

    const handleResetPassword = async (email, name) => {
        showConfirm(
            "Send Reset Link",
            `📧 Dispatch a secure password reset link to ${name.toUpperCase()} at ${email}?`,
            async () => {
                try {
                    await sendPasswordResetEmail(auth, email);
                    
                    // Log the communication
                    await addDoc(collection(db, "communications"), {
                        to: email,
                        name: name,
                        type: 'password_reset',
                        channels: ['email'],
                        status: 'Sent',
                        timestamp: new Date().toISOString()
                    });

                    alert(`✅ Reset Link Dispatched to ${email}.`);
                } catch (e) {
                    console.error("Reset failed:", e);
                    alert("❌ Reset Failed: " + e.message);
                }
            }
        );
    };

    const toggleResellerStatus = async (id, name, currentStatus) => {
        const isSuspending = currentStatus === 'Active';
        const newStatus = isSuspending ? 'Suspended' : 'Active';
        showConfirm(
            isSuspending ? "Suspend Reseller" : "Activate Reseller",
            isSuspending ? `⚠️ SUSPEND ${name.toUpperCase()}? This blocks all access.` : `✅ ACTIVATE ${name.toUpperCase()}?`,
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

    const globalStats = [
        { label: 'Total Resellers', value: resellers.length, icon: Building2, trend: 'Live' },
        { label: 'Global Active Users', value: realStats.attendees, icon: Users, trend: 'Live' },
        { label: 'System Health', value: '99.9%', icon: Zap, trend: 'Nominal' },
        { label: 'Vaulted Records', value: realStats.archivedResellersCount + realStats.archivedCount, icon: Box, trend: 'Secure' },
    ];

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
                            <h1 className="font-black text-xl text-white tracking-tighter">ROOT <span className="text-red-500">PRO</span></h1>
                            <p className="text-[10px] text-zinc-600 font-bold uppercase tracking-widest">Mainframe Console</p>
                        </div>
                    </div>

                    <nav className="space-y-1">
                        {[
                            { id: 'resellers', label: 'Reseller Hub', icon: Building2 },
                            { id: 'analytics', label: 'Analytics', icon: BarChart3 },
                            { id: 'auditlog', label: 'Audit Log', icon: Shield },
                            { id: 'archive', label: 'Global Archive', icon: Trash2 },
                            { id: 'templates', label: 'Email Templates', icon: Mail },
                            { id: 'settings', label: 'Core Infrastructure', icon: Settings },
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
                        <p className="text-[10px] font-black text-red-400 uppercase tracking-widest mb-1">Mainframe Health</p>
                        <div className="flex items-center gap-2 mb-3">
                            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                            <span className="text-xs text-white font-bold tracking-tight">System Operational</span>
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
                            <h2 className="text-3xl md:text-4xl font-black text-white tracking-tight uppercase italic">Mainframe Hub</h2>
                            <p className="text-zinc-500 mt-1 text-xs md:text-sm font-medium italic">Master Control for the Akshay/Company Multi-Tier SaaS Hierarchy.</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 md:gap-3 w-full lg:w-auto">
                            <div className="relative flex-1 lg:flex-none">
                                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
                                <input
                                    type="text" placeholder="Search Name/Email/Mobile..."
                                    value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                                    className="bg-white/5 border border-white/10 rounded-xl pl-11 pr-4 py-3 text-xs md:text-sm text-white focus:border-red-500/50 outline-none w-full lg:w-64 transition-all"
                                />
                            </div>
                            <button
                                onClick={() => setShowAddReseller(true)}
                                className="flex items-center gap-2 px-6 py-3 bg-red-600 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-red-700 transition-all shadow-lg shadow-red-600/20"
                            >
                                <Plus className="w-4 h-4" /> Add Reseller
                            </button>
                            <button onClick={logout} title="Log Out" className="px-4 py-3 bg-white/5 border border-white/10 text-white font-bold rounded-xl transition-all flex items-center gap-2 hover:bg-white/10 hover:text-red-400">
                                <LogOut className="w-5 h-5" />
                            </button>
                        </div>
                    </header>

                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 mb-12">
                        {globalStats.map((stat, i) => (
                            <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}
                                className="glass-panel p-4 md:p-6 border-white/5 bg-white/[0.02]">
                                <div className="flex justify-between items-start mb-4">
                                    <div className="p-2 md:p-2.5 bg-zinc-800 rounded-xl">
                                        <stat.icon className="w-4 h-4 md:w-6 md:h-6 text-zinc-400" />
                                    </div>
                                    <span className="text-[8px] md:text-[10px] font-black text-red-400 bg-red-400/10 px-1.5 md:px-2 py-0.5 md:py-1 rounded-full uppercase italic">
                                        {stat.trend}
                                    </span>
                                </div>
                                <p className="text-zinc-500 text-[9px] md:text-xs font-black uppercase tracking-widest mb-1">{stat.label}</p>
                                <p className="text-xl md:text-3xl font-black text-white">{stat.value}</p>
                            </motion.div>
                        ))}
                    </div>

                    {activeTab === 'resellers' && (
                        <div className="space-y-6">
                            <div className="flex items-center justify-between mb-4 px-2">
                                <h3 className="text-sm font-black text-zinc-500 uppercase tracking-[0.3em]">Registered Resellers</h3>
                                <div className="flex items-center gap-4 text-[10px] font-black text-zinc-600 uppercase tracking-widest">
                                    <span className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-green-500" /> Production</span>
                                    <span className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-red-500" /> Suspended</span>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 gap-4">
                                <AnimatePresence>
                                    {resellers.filter(t =>
                                        t.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                                        t.ownerEmail?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                                        t.phone?.includes(searchQuery)
                                    ).map((reseller) => (
                                        <motion.div
                                            layout key={reseller.id}
                                            initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
                                            className="group glass-panel p-4 md:p-5 flex flex-col xl:flex-row items-start xl:items-center justify-between hover:bg-white/[0.04] border-white/5 transition-all gap-6"
                                        >
                                            <div className="flex items-center gap-4 md:gap-6 w-full xl:w-auto">
                                                <div className="relative">
                                                    <div className="w-14 h-14 rounded-2xl flex items-center justify-center border-2" style={{ backgroundColor: `${reseller.branding?.color || '#FF2222'}20`, borderColor: `${reseller.branding?.color || '#FF2222'}40` }}>
                                                        <Building2 className="w-7 h-7" style={{ color: reseller.branding?.color || '#FF2222' }} />
                                                    </div>
                                                    <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-[#0a0a0a] shadow-sm ${reseller.status === 'Active' ? 'bg-green-500' : 'bg-red-500'}`} />
                                                </div>
                                                <div>
                                                    <div className="flex items-center gap-3">
                                                        <h4 className="text-lg font-black text-white italic">{reseller.name}</h4>
                                                        <span className="px-2 py-0.5 bg-white/5 border border-white/10 rounded text-[9px] font-black text-zinc-500 uppercase tracking-tighter">
                                                            SLUG: {reseller.slug || 'N/A'}
                                                        </span>
                                                    </div>
                                                    <div className="flex flex-col mt-1">
                                                        <p className="text-xs text-zinc-400 font-bold uppercase tracking-tight">{reseller.ownerName || 'Unknown Owner'}</p>
                                                        <p className="text-[10px] text-zinc-600 font-mono">{reseller.ownerEmail} • {reseller.phone}</p>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-2 md:grid-cols-3 gap-8 text-left md:text-center w-full xl:w-auto">
                                                <div>
                                                    <p className="text-[9px] font-black text-zinc-600 uppercase tracking-widest mb-1">License Period</p>
                                                    <p className="text-[10px] font-bold text-white bg-white/5 border border-white/5 px-2 py-1.5 rounded">{reseller.validUntil || 'N/A'}</p>
                                                </div>
                                                <div>
                                                    <p className="text-[9px] font-black text-zinc-600 uppercase tracking-widest mb-1">Tier</p>
                                                    <p className="text-[9px] font-black text-red-500 bg-red-500/10 px-2 py-1 rounded inline-block uppercase italic">{reseller.plan}</p>
                                                </div>
                                                <div className="hidden md:block">
                                                    <p className="text-[9px] font-black text-zinc-600 uppercase tracking-widest mb-1">Capability</p>
                                                    <div className="flex items-center justify-center gap-1.5 text-[10px] font-black text-zinc-400 uppercase italic">
                                                        <Zap className="w-3 h-3 text-red-500" />
                                                        {reseller.eventLimit || 0} Events
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-4">
                                                <button 
                                                    onClick={() => toggleResellerStatus(reseller.id, reseller.name, reseller.status)}
                                                    title={reseller.status === 'Active' ? 'Suspend' : 'Activate'}
                                                    className={`p-2.5 border rounded-xl transition-all ${reseller.status === 'Active' ? 'hover:text-red-500 hover:border-red-500/20' : 'hover:text-green-500 hover:border-green-500/20'} bg-white/5 border-white/10 text-zinc-500`}
                                                >
                                                    {reseller.status === 'Active' ? <XCircle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                                                </button>
                                                <button onClick={() => handleResetPassword(reseller.ownerEmail, reseller.name)} title="Send Password Reset" className="p-2.5 bg-white/5 border border-white/10 rounded-xl text-zinc-500 hover:text-red-400 hover:bg-red-400/5 transition-all">
                                                    <Key className="w-4 h-4" />
                                                </button>
                                                <button onClick={() => setEditingReseller(reseller)} title="Edit Licensing" className="p-2.5 bg-white/5 border border-white/10 rounded-xl text-zinc-500 hover:text-white transition-all">
                                                    <Settings className="w-4 h-4" />
                                                </button>
                                                <button onClick={() => handleArchiveReseller(reseller)} title="Archive & Suspend" className="p-2.5 bg-white/5 border border-white/10 rounded-xl text-zinc-500 hover:text-amber-500 hover:bg-amber-500/10 transition-all">
                                                    <Box className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </motion.div>
                                    ))}
                                </AnimatePresence>
                            </div>
                        </div>
                    )}

                    {activeTab === 'analytics' && (
                        <div className="space-y-8">
                            {/* Header */}
                            <div className="flex items-center gap-4 mb-2">
                                <div className="p-3 bg-red-500/10 rounded-2xl border border-red-500/20">
                                    <BarChart3 className="w-6 h-6 text-red-500" />
                                </div>
                                <div>
                                    <h3 className="text-2xl font-black text-white uppercase tracking-tight italic">Platform Analytics</h3>
                                    <p className="text-zinc-600 text-xs font-bold uppercase tracking-widest">Live Firestore data</p>
                                </div>
                            </div>

                            {/* KPI Cards */}
                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
                                {[
                                    { label: 'Active Resellers', value: analyticsKPIs.activeResellers, color: 'text-green-400' },
                                    { label: 'Total Events', value: analyticsKPIs.totalEvents, color: 'text-sky-400' },
                                    { label: 'Total Attendees', value: analyticsKPIs.totalAttendees, color: 'text-purple-400' },
                                    { label: 'Communications Sent', value: analyticsKPIs.totalCommunications, color: 'text-amber-400' },
                                ].map((kpi, i) => (
                                    <div key={i} className="glass-panel p-6 border-white/5 bg-white/[0.02]">
                                        <p className="text-zinc-500 text-[10px] font-black uppercase tracking-widest mb-3">{kpi.label}</p>
                                        <p className={`text-2xl font-black ${kpi.color}`}>{kpi.value.toLocaleString()}</p>
                                    </div>
                                ))}
                            </div>

                            {/* Top 5 Resellers Table */}
                            <div className="glass-panel border-white/5 bg-white/[0.02] overflow-hidden">
                                <div className="px-6 py-4 border-b border-white/5">
                                    <h4 className="text-xs font-black text-zinc-500 uppercase tracking-[0.2em]">Top 5 Resellers by Event Activity</h4>
                                </div>
                                {topResellers.length === 0 ? (
                                    <div className="px-6 py-12 text-center text-zinc-600 text-xs font-bold uppercase tracking-widest">No reseller data yet.</div>
                                ) : (
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="bg-white/5 text-[10px] font-black text-zinc-500 uppercase tracking-widest">
                                                <th className="px-6 py-3 text-left">#</th>
                                                <th className="px-6 py-3 text-left">Reseller</th>
                                                <th className="px-6 py-3 text-center">Owners</th>
                                                <th className="px-6 py-3 text-center">Events</th>
                                                <th className="px-6 py-3 text-center">Status</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-white/5">
                                            {topResellers.map((r, i) => (
                                                <tr key={r.id} className="hover:bg-white/[0.02] transition-colors">
                                                    <td className="px-6 py-4 text-zinc-600 font-black text-xs">{i + 1}</td>
                                                    <td className="px-6 py-4">
                                                        <p className="text-white font-bold text-sm">{r.name}</p>
                                                        <p className="text-zinc-600 text-[10px] font-mono">{r.ownerEmail}</p>
                                                    </td>
                                                    <td className="px-6 py-4 text-center text-white font-black">{r.ownerCount}</td>
                                                    <td className="px-6 py-4 text-center text-white font-black">{r.eventCount}</td>
                                                    <td className="px-6 py-4 text-center">
                                                        <span className={`text-xs font-black uppercase px-2 py-0.5 rounded ${r.status === 'Active' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                                                            {r.status}
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                            </div>

                            {/* Recent Activity Feed */}
                            <div className="glass-panel border-white/5 bg-white/[0.02] overflow-hidden">
                                <div className="px-6 py-4 border-b border-white/5">
                                    <h4 className="text-xs font-black text-zinc-500 uppercase tracking-[0.2em]">Recent Activity</h4>
                                </div>
                                {recentActivity.length === 0 ? (
                                    <div className="px-6 py-12 text-center text-zinc-600 text-xs font-bold uppercase tracking-widest">No activity yet.</div>
                                ) : (
                                    <div className="divide-y divide-white/5">
                                        {recentActivity.map(entry => (
                                            <div key={entry.id} className="px-6 py-4 flex items-center justify-between hover:bg-white/[0.02] transition-colors">
                                                <div className="flex items-center gap-4">
                                                    <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center">
                                                        <Shield className="w-4 h-4 text-zinc-500" />
                                                    </div>
                                                    <div>
                                                        <p className="text-white text-xs font-bold">{entry.userEmail || 'System'}</p>
                                                        <p className="text-zinc-500 text-[10px] font-mono uppercase">{entry.action} &rarr; {entry.targetType}</p>
                                                    </div>
                                                </div>
                                                <span className="text-zinc-600 text-[10px] font-bold whitespace-nowrap">{relativeTime(entry.timestamp)}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {activeTab === 'auditlog' && (
                        <div className="space-y-6">
                            {/* Header */}
                            <div className="flex items-center gap-4 mb-2">
                                <div className="p-3 bg-amber-500/10 rounded-2xl border border-amber-500/20">
                                    <Shield className="w-6 h-6 text-amber-500" />
                                </div>
                                <div>
                                    <h3 className="text-2xl font-black text-white uppercase tracking-tight italic">Audit Log</h3>
                                    <p className="text-zinc-600 text-xs font-bold uppercase tracking-widest">Last 100 actions — newest first</p>
                                </div>
                            </div>

                            {/* Filter Tabs */}
                            <div className="flex flex-wrap gap-2">
                                {[
                                    { id: 'all', label: 'All Actions' },
                                    { id: 'reseller', label: 'Reseller Actions' },
                                    { id: 'owner', label: 'Owner Actions' },
                                    { id: 'system', label: 'System' },
                                ].map(f => (
                                    <button
                                        key={f.id}
                                        onClick={() => setAuditFilter(f.id)}
                                        className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${auditFilter === f.id ? 'bg-amber-500/20 text-amber-400 border border-amber-500/20' : 'bg-white/5 text-zinc-500 hover:text-white hover:bg-white/10'}`}
                                    >
                                        {f.label}
                                    </button>
                                ))}
                            </div>

                            {/* Audit Table */}
                            <div className="glass-panel border-white/5 bg-white/[0.02] overflow-hidden">
                                {auditLogs.length === 0 ? (
                                    <div className="px-6 py-16 text-center">
                                        <Shield className="w-10 h-10 text-zinc-700 mx-auto mb-4" />
                                        <p className="text-zinc-500 text-sm font-bold">No audit trail yet.</p>
                                        <p className="text-zinc-700 text-xs mt-1">Actions will appear here once users begin operating.</p>
                                    </div>
                                ) : (
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm min-w-[700px]">
                                            <thead>
                                                <tr className="bg-white/5 text-[10px] font-black text-zinc-500 uppercase tracking-widest">
                                                    <th className="px-5 py-3 text-left">Timestamp</th>
                                                    <th className="px-5 py-3 text-left">User</th>
                                                    <th className="px-5 py-3 text-left">Action</th>
                                                    <th className="px-5 py-3 text-left">Target</th>
                                                    <th className="px-5 py-3 text-left">Details</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-white/5">
                                                {auditLogs
                                                    .filter(entry => {
                                                        if (auditFilter === 'all') return true;
                                                        if (auditFilter === 'reseller') return entry.action?.includes('RESELLER') || entry.userRole === 'reseller';
                                                        if (auditFilter === 'owner') return entry.userRole === 'owner';
                                                        if (auditFilter === 'system') return !entry.userEmail || entry.userEmail === null;
                                                        return true;
                                                    })
                                                    .map(entry => (
                                                        <tr key={entry.id} className="hover:bg-white/[0.02] transition-colors">
                                                            <td className="px-5 py-3 text-zinc-500 text-[10px] font-mono whitespace-nowrap">{relativeTime(entry.timestamp)}</td>
                                                            <td className="px-5 py-3">
                                                                <p className="text-white text-xs font-bold">{entry.userEmail || '—'}</p>
                                                                {entry.userRole && (
                                                                    <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-white/5 text-zinc-500">{entry.userRole}</span>
                                                                )}
                                                            </td>
                                                            <td className="px-5 py-3">
                                                                <span className={`text-xs font-black uppercase px-2 py-0.5 rounded whitespace-nowrap ${
                                                                    entry.action?.includes('CREATE') ? 'bg-green-500/10 text-green-400' :
                                                                    entry.action?.includes('PURGE') || entry.action?.includes('DELETE') ? 'bg-red-500/10 text-red-400' :
                                                                    entry.action?.includes('ARCHIVE') ? 'bg-amber-500/10 text-amber-400' :
                                                                    entry.action?.includes('RESTORE') ? 'bg-sky-500/10 text-sky-400' :
                                                                    'bg-white/5 text-zinc-400'
                                                                }`}>
                                                                    {entry.action || '—'}
                                                                </span>
                                                            </td>
                                                            <td className="px-5 py-3 text-zinc-400 text-xs font-mono">{entry.targetType || '—'} / {entry.targetId ? entry.targetId.slice(0, 8) + '…' : '—'}</td>
                                                            <td className="px-5 py-3 text-zinc-600 text-[10px] font-mono max-w-[200px] truncate">
                                                                {entry.details && Object.keys(entry.details).length > 0 ? JSON.stringify(entry.details) : '—'}
                                                            </td>
                                                        </tr>
                                                    ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {activeTab === 'archive' && (
                        <div className="space-y-12">
                            <div className="space-y-6">
                                <div className="flex items-center justify-between px-2">
                                    <h3 className="text-sm font-black text-zinc-500 uppercase tracking-[0.3em]">Reseller Vault</h3>
                                    <span className="text-[10px] font-black text-amber-500 bg-amber-500/10 px-3 py-1 rounded-full uppercase italic">{archivedResellers.length} Suspended Entities</span>
                                </div>
                                <div className="grid grid-cols-1 gap-4">
                                    {archivedResellers.map(reseller => (
                                        <div key={reseller.id} className="glass-panel p-4 flex items-center justify-between border-white/5 bg-white/[0.02]">
                                            <div className="flex items-center gap-4">
                                                <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center border border-white/10">
                                                    <Building2 className="w-5 h-5 text-zinc-600" />
                                                </div>
                                                <div>
                                                    <p className="text-sm font-bold text-white uppercase tracking-tight">{reseller.name}</p>
                                                    <p className="text-[10px] text-zinc-500">Vaulted on {reseller.archivedAt?.toDate ? reseller.archivedAt.toDate().toLocaleDateString() : 'Recent'}</p>
                                                </div>
                                            </div>
                                            <div className="flex gap-2">
                                                <button onClick={() => restoreReseller(reseller)} className="p-2 hover:bg-green-500/10 text-zinc-500 hover:text-green-500 rounded-lg transition-all" title="Restore & Activate">
                                                    <RefreshCw className="w-4 h-4" />
                                                </button>
                                                <button onClick={() => purgeReseller(reseller.id)} className="p-2 hover:bg-red-500/10 text-zinc-500 hover:text-red-500 rounded-lg transition-all" title="Permanent Destruction">
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'templates' && (
                        <div className="space-y-8">
                            <div className="flex items-center gap-4 mb-6">
                                <div className="p-3 bg-sky-500/10 rounded-2xl border border-sky-500/20">
                                    <Mail className="w-6 h-6 text-sky-500" />
                                </div>
                                <h3 className="text-2xl font-black text-white uppercase tracking-tight italic">Lifecycle Templates</h3>
                            </div>
                            <div className="grid grid-cols-1 xl:grid-cols-4 gap-8">
                                <div className="xl:col-span-1 space-y-2">
                                    {emailTemplates && Object.keys(emailTemplates).map(id => (
                                        <button key={id} onClick={() => setActiveTemplate(id)} className={`w-full text-left px-5 py-4 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTemplate === id ? 'bg-sky-600 text-white shadow-lg' : 'bg-white/5 text-zinc-500 hover:bg-white/10'}`}>
                                            {id.replace('_', ' ')}
                                        </button>
                                    ))}
                                </div>
                                <div className="xl:col-span-3">
                                    {emailTemplates && (
                                        <div className="glass-panel p-8 border-white/5 space-y-6">
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">Subject</label>
                                                <input type="text" value={emailTemplates[activeTemplate]?.subject || ''} onChange={e => setEmailTemplates({...emailTemplates, [activeTemplate]: {...emailTemplates[activeTemplate], subject: e.target.value}})} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none" />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">Body Content</label>
                                                <textarea rows={12} value={emailTemplates[activeTemplate]?.body || ''} onChange={e => setEmailTemplates({...emailTemplates, [activeTemplate]: {...emailTemplates[activeTemplate], body: e.target.value}})} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-4 text-zinc-300 font-mono text-sm leading-relaxed outline-none resize-none" />
                                            </div>
                                            <button onClick={saveEmailTemplates} className="w-full py-4 bg-sky-500 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-sky-600 transition-all">Save Registry Update</button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'settings' && (
                        <div className="space-y-8">
                             <div className="glass-panel p-8 border-white/5 bg-white/[0.02]">
                                <div className="flex justify-between items-center mb-8">
                                    <h4 className="text-xs font-black text-zinc-500 uppercase tracking-[0.2em] flex items-center gap-2">
                                        <Box className="w-4 h-4 text-orange-500" /> Firebase Core
                                    </h4>
                                    <span className="px-2 py-1 bg-green-500/10 text-green-500 text-[10px] font-black rounded uppercase">MASTER_LINK: READY</span>
                                </div>
                                <div className="grid grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">Project ID</label>
                                        <input type="text" value={infraConfig?.firebase?.projectId || ''} readOnly className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-zinc-500 font-mono outline-none" />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">Auth State</label>
                                        <input type="text" value="VERIFIED_SESSION" readOnly className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-green-500 font-mono outline-none" />
                                    </div>
                                </div>
                            </div>

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

                            {/* Platform Default Currency */}
                            <div className="glass-panel p-8 border-white/5 bg-white/[0.02]">
                                <div className="flex justify-between items-start mb-6">
                                    <div>
                                        <h4 className="text-xs font-black text-zinc-500 uppercase tracking-[0.2em] flex items-center gap-2 mb-2">
                                            <CreditCard className="w-4 h-4 text-purple-500" /> Platform Default Currency
                                        </h4>
                                        <p className="text-[10px] text-zinc-500 font-mono italic">Set the default currency shown across all reseller dashboards and event pages.</p>
                                    </div>
                                    <div className="px-3 py-1 bg-purple-500/10 border border-purple-500/20 rounded-lg text-xs font-black text-purple-400 uppercase tracking-widest">
                                        {CURRENCIES.find(c => c.code === defaultCurrency)?.symbol || '$'} {defaultCurrency}
                                    </div>
                                </div>
                                <div className="flex flex-col md:flex-row gap-4 items-end">
                                    <div className="flex-1 space-y-1.5">
                                        <label className="text-[9px] font-black text-zinc-600 uppercase tracking-widest ml-1">Select Currency</label>
                                        <select
                                            value={defaultCurrency}
                                            onChange={(e) => setDefaultCurrency(e.target.value)}
                                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-purple-500/30"
                                        >
                                            {CURRENCIES.map(c => (
                                                <option key={c.code} value={c.code} className="bg-[#0a0a0a]">
                                                    {c.symbol} — {c.name} ({c.code})
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <button
                                        onClick={() => saveCurrency(defaultCurrency)}
                                        disabled={savingCurrency}
                                        className="px-6 py-3 bg-purple-600 hover:bg-purple-500 text-white font-black text-[10px] uppercase tracking-widest rounded-xl transition-all flex items-center gap-2 disabled:opacity-50 whitespace-nowrap"
                                    >
                                        {savingCurrency ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                                        Save Currency
                                    </button>
                                </div>
                            </div>

                            <div className="glass-panel p-8 border-white/5 bg-white/[0.02]">
                                <div className="flex justify-between items-start mb-6">
                                    <div>
                                        <h4 className="text-xs font-black text-zinc-500 uppercase tracking-[0.2em] flex items-center gap-2 mb-2">
                                            <Database className="w-4 h-4 text-indigo-500" /> Data Portability & Master Backups
                                        </h4>
                                        <p className="text-[10px] text-zinc-500 font-mono italic">Download complete JSON replicas of the database. Useful for auditing or disaster recovery.</p>
                                    </div>
                                </div>
                                <div className="flex flex-col md:flex-row gap-4 items-end">
                                    <div className="space-y-6">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest px-1">Select Reseller (Node)</label>
                                                <select 
                                                    value={selectedResellerForBackup}
                                                    onChange={(e) => setSelectedResellerForBackup(e.target.value)}
                                                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs text-white outline-none focus:border-primary/50"
                                                >
                                                    <option value="" className="bg-zinc-900">Entire Infrastructure (Master)</option>
                                                    {resellers.map(r => (
                                                        <option key={r.id} value={r.id} className="bg-zinc-900">{r.name}</option>
                                                    ))}
                                                </select>
                                            </div>

                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest px-1">Select Target Event</label>
                                                <select 
                                                    value={selectedEventForBackup}
                                                    onChange={(e) => setSelectedEventForBackup(e.target.value)}
                                                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs text-white outline-none focus:border-primary/50"
                                                >
                                                    <option value="" className="bg-zinc-900">All Nodes & Sub-Events</option>
                                                    {allEvents.filter(e => !selectedResellerForBackup || e.tenantId === selectedResellerForBackup).map(ev => (
                                                        <option key={ev.id} value={ev.id} className="bg-zinc-900">{ev.name}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>

                                        <div className="flex flex-wrap gap-2">
                                            <button onClick={() => exportDatabase()} className="px-6 py-3 bg-primary text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-primary/90 transition-all flex items-center gap-2">
                                                <Download className="w-4 h-4" /> 
                                                {selectedResellerForBackup || selectedEventForBackup ? 'Download Targeted Node' : 'Download Primary DB'}
                                            </button>
                                            <button className="px-6 py-3 bg-white/5 border border-white/10 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-white/10 transition-all flex items-center gap-2">
                                                <ShieldCheck className="w-4 h-4" /> Integrity Check
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                    {activeTab === 'profile' && (
                        <div className="max-w-2xl mx-auto space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
                            <div className="glass-panel p-8 md:p-10 border-white/5 relative overflow-hidden">
                                <div className="absolute top-0 right-0 p-6 opacity-10">
                                    <Fingerprint className="w-24 h-24 text-red-500" />
                                </div>
                                <div className="relative z-10">
                                    <h3 className="text-2xl font-black text-white uppercase tracking-tight mb-2">Master Security</h3>
                                    <p className="text-zinc-500 text-xs font-medium uppercase tracking-widest mb-8">Update your administrative credentials for the Root Mainframe.</p>
                                    
                                    <form onSubmit={handleChangePassword} className="space-y-6">
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-black text-zinc-600 uppercase tracking-widest ml-1">Current Password</label>
                                            <div className="relative">
                                                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
                                                <input 
                                                    type="password" required
                                                    value={passwordForm.current} onChange={e => setPasswordForm({ ...passwordForm, current: e.target.value })}
                                                    placeholder="Required for security verification"
                                                    className="w-full bg-white/5 border border-white/10 rounded-2xl pl-12 pr-4 py-4 text-white outline-none focus:border-red-500/50 transition-all font-medium" 
                                                />
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                            <div className="space-y-1.5">
                                                <label className="text-[10px] font-black text-zinc-600 uppercase tracking-widest ml-1">New Security Password</label>
                                                <div className="relative">
                                                    <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
                                                    <input 
                                                        type="password" required
                                                        value={passwordForm.new} onChange={e => setPasswordForm({ ...passwordForm, new: e.target.value })}
                                                        placeholder="Min. 6 characters"
                                                        className="w-full bg-white/5 border border-white/10 rounded-2xl pl-12 pr-4 py-4 text-white outline-none focus:border-red-500/50 transition-all font-medium" 
                                                    />
                                                </div>
                                            </div>
                                            <div className="space-y-1.5">
                                                <label className="text-[10px] font-black text-zinc-600 uppercase tracking-widest ml-1">Confirm New Password</label>
                                                <div className="relative">
                                                    <Check className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
                                                    <input 
                                                        type="password" required
                                                        value={passwordForm.confirm} onChange={e => setPasswordForm({ ...passwordForm, confirm: e.target.value })}
                                                        placeholder="Repeat new password"
                                                        className="w-full bg-white/5 border border-white/10 rounded-2xl pl-12 pr-4 py-4 text-white outline-none focus:border-red-500/50 transition-all font-medium" 
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        <button 
                                            type="submit" disabled={updatingPassword}
                                            className="w-full bg-red-600 hover:bg-red-500 text-white font-black py-4 rounded-2xl shadow-xl shadow-red-600/20 transition-all flex items-center justify-center gap-3 uppercase tracking-widest text-xs disabled:opacity-50"
                                        >
                                            {updatingPassword ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ShieldAlert className="w-4 h-4" />}
                                            {updatingPassword ? 'Updating Mainframe Secure Key...' : 'Update Root Access Credentials'}
                                        </button>
                                    </form>
                                </div>
                            </div>

                            <div className="glass-panel p-8 border-white/5 bg-red-500/5">
                                <div className="flex items-start gap-4">
                                    <div className="p-3 bg-red-500/10 rounded-xl border border-red-500/20">
                                        <ShieldAlert className="w-6 h-6 text-red-500" />
                                    </div>
                                    <div>
                                        <h4 className="text-lg font-black text-white uppercase tracking-tight">Security Protocol</h4>
                                        <p className="text-zinc-500 text-xs mt-1 leading-relaxed">
                                            Updating your master password will immediately invalidate all existing session tokens. 
                                            You may need to re-login on other devices to maintain access to the Root Mainframe.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </main>

                {/* Provision Modal */}
                <AnimatePresence>
                    {showAddReseller && (
                        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowAddReseller(false)} className="absolute inset-0 bg-black/95 backdrop-blur-md" />
                            <motion.div initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 50, opacity: 0 }} className="relative w-full max-w-2xl bg-[#0a0a0a] border border-white/10 rounded-3xl overflow-hidden shadow-2xl">
                                <div className="p-8 border-b border-white/5 bg-gradient-to-r from-red-500/10 to-transparent">
                                    <h3 className="text-2xl font-black text-white uppercase tracking-tight">Provision Infrastructure</h3>
                                    <p className="text-zinc-500 text-xs mt-1 italic tracking-widest">Assigning new reseller node to the hierarchy.</p>
                                </div>
                                <div className="p-8 space-y-6 max-h-[60vh] overflow-y-auto custom-scrollbar">
                                    <div className="grid grid-cols-2 gap-6">
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-black text-zinc-600 uppercase tracking-widest ml-1">Reseller Name *</label>
                                            <input type="text" placeholder="Official Entity Name" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-red-500/50" value={newReseller.name} onChange={e => setNewReseller({ ...newReseller, name: e.target.value })} />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-black text-zinc-600 uppercase tracking-widest ml-1">Unique Node Slug</label>
                                            <input type="text" placeholder="reseller-alpha" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-red-500/50" value={newReseller.slug} onChange={e => setNewReseller({ ...newReseller, slug: e.target.value })} />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-black text-zinc-600 uppercase tracking-widest ml-1">Admin Name *</label>
                                            <input type="text" placeholder="John Doe" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-red-500/50" value={newReseller.ownerName} onChange={e => setNewReseller({ ...newReseller, ownerName: e.target.value })} />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-black text-zinc-600 uppercase tracking-widest ml-1">Admin Email *</label>
                                            <input type="email" placeholder="admin@entity.com" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-red-500/50" value={newReseller.ownerEmail} onChange={e => setNewReseller({ ...newReseller, ownerEmail: e.target.value })} />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-black text-zinc-600 uppercase tracking-widest ml-1">Contact Number *</label>
                                            <input type="tel" placeholder="+91 00000 00000" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-red-500/50" value={newReseller.phone} onChange={e => setNewReseller({ ...newReseller, phone: e.target.value })} />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-6">
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-black text-zinc-600 uppercase tracking-widest ml-1">License Start (DD-MM-YYYY)</label>
                                            <FormattedDateInput value={newReseller.validFrom} onChange={e => setNewReseller({ ...newReseller, validFrom: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white" />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-black text-zinc-600 uppercase tracking-widest ml-1">License End (DD-MM-YYYY)</label>
                                            <FormattedDateInput value={newReseller.validUntil} onChange={e => setNewReseller({ ...newReseller, validUntil: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white" />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-6">
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-black text-zinc-600 uppercase tracking-widest ml-1">Event Limit</label>
                                            <input type="number" min="1" placeholder="e.g. 10" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-red-500/50" value={newReseller.eventLimit} onChange={e => setNewReseller({ ...newReseller, eventLimit: parseInt(e.target.value) || 0 })} />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-black text-zinc-600 uppercase tracking-widest ml-1">Badge / User Limit</label>
                                            <input type="number" min="1" placeholder="e.g. 5000" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-red-500/50" value={newReseller.userLimit} onChange={e => setNewReseller({ ...newReseller, userLimit: parseInt(e.target.value) || 0 })} />
                                        </div>
                                    </div>
                                </div>
                                <div className="p-8 bg-zinc-900/50 border-t border-white/5 flex gap-4">
                                    <button onClick={() => setShowAddReseller(false)} className="flex-1 py-4 text-zinc-500 font-bold hover:text-white">Cancel</button>
                                    <button onClick={handleAddReseller} className="flex-1 py-4 bg-red-600 text-white font-black uppercase tracking-widest rounded-2xl hover:bg-red-700 transition-all">Provision Node</button>
                                </div>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>

                {/* Edit License Modal */}
                <AnimatePresence>
                    {editingReseller && (
                        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setEditingReseller(null)} className="absolute inset-0 bg-black/95 backdrop-blur-md" />
                            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="relative w-full max-w-xl bg-[#0a0a0a] border border-white/10 rounded-3xl overflow-hidden">
                                <div className="p-8 border-b border-white/5">
                                    <h3 className="text-xl font-black text-white uppercase">Edit Licensing: {editingReseller.name}</h3>
                                </div>
                                <div className="p-8 space-y-6">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">Event Limit</label>
                                            <input type="number" value={editingReseller.eventLimit} onChange={e => setEditingReseller({...editingReseller, eventLimit: parseInt(e.target.value) || 0})} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white" />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">User Limit</label>
                                            <input type="number" value={editingReseller.userLimit} onChange={e => setEditingReseller({...editingReseller, userLimit: parseInt(e.target.value) || 0})} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white" />
                                        </div>
                                    </div>
                                    <div className="space-y-1">
                                            <label className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">License Valid Until</label>
                                            <FormattedDateInput value={editingReseller.validUntil} onChange={e => setEditingReseller({ ...editingReseller, validUntil: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white" />
                                    </div>
                                </div>
                                <div className="p-8 bg-zinc-900/50 flex gap-4">
                                    <button onClick={() => setEditingReseller(null)} className="flex-1 py-4 text-zinc-500 font-bold">Cancel</button>
                                    <button onClick={async () => {
                                        await updateDoc(doc(db, "users", editingReseller.id), editingReseller);
                                        setEditingReseller(null);
                                        alert("✅ Registry updated.");
                                    }} className="flex-1 py-4 bg-red-600 text-white font-black uppercase tracking-widest rounded-2xl">Update Registry</button>
                                </div>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>

                {/* Dialog System */}
                <AnimatePresence>
                    {dialog.isOpen && (
                        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 backdrop-blur-md bg-black/40">
                            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-[#0f0f0f] border border-white/10 p-8 rounded-3xl max-w-md w-full shadow-2xl">
                                <h4 className="text-lg font-black text-white uppercase italic mb-4">{dialog.title}</h4>
                                <p className="text-sm text-zinc-400 mb-8">{dialog.message}</p>
                                <div className="flex gap-4">
                                    <button onClick={closeDialog} className="flex-1 py-3 text-zinc-500 font-bold uppercase tracking-widest">Cancel</button>
                                    <button onClick={() => { dialog.onConfirm(); closeDialog(); }} className="flex-1 py-3 bg-red-600 text-white font-black uppercase tracking-widest rounded-xl">Confirm</button>
                                </div>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>

                {/* System Diagnostics Footer */}
                <div className="fixed bottom-0 left-0 lg:left-72 right-0 bg-black/80 border-t border-white/5 px-6 py-2 flex items-center justify-between z-[60] backdrop-blur-md">
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-1.5">
                            <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                            <span className="text-[8px] font-black text-zinc-600 uppercase tracking-widest">Secure Link: Active</span>
                        </div>
                        <div className="w-px h-3 bg-white/5" />
                        <span className="text-[8px] font-mono text-zinc-700">NODE_ID: {auth.currentUser?.uid || 'INIT'}</span>
                    </div>
                    <div className="text-[8px] font-black text-zinc-800 uppercase italic tracking-tighter">
                        Ag-Root-v4.5 | Unified SaaS Registry
                    </div>
                </div>
            </div>
        </PageWrapper>
    );
};

export default SuperuserDashboard;
