import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import PageWrapper from '../components/PageWrapper';
import NotificationCenter from '../components/NotificationCenter';
import { 
  Settings, Users, User, FileText, MessageSquare, BarChart, ChevronRight, Plus, CreditCard, 
  LayoutDashboard, Palette, Move, Zap, Send, Trash2, PlusCircle, Gift, Package, Trophy, 
  ChevronDown, ChevronUp, Check, ShieldCheck, Download, Filter, UserPlus, Save, RefreshCw,
  Mail, Phone, Lock, Shield, Camera, Image as ImageIcon, Layout, Code, Monitor, ExternalLink,
  Calendar, MapPin, Cpu, Tag, CheckCircle, XCircle, AlertTriangle, TrendingUp, Percent,
  Clock, BarChart2, BadgePercent, Ticket, ListChecks, Globe, BarChart3, Type,
  BadgeCheck, Briefcase, Mic2, HardHat, Building2, Eye, Send as SendIcon, Box, LogOut, Tv
} from 'lucide-react';
import ZoneRulesManager from '../components/ZoneRulesManager';
import EntryLog from '../components/EntryLog';
import MapBuilder from '../components/MapBuilder';
import ExhibitorManager from '../components/ExhibitorManager';
import SpeakerManager from '../components/SpeakerManager';
import DeviceManager from './DeviceManager';
import WelcomeTVDesigner from './WelcomeTVDesigner';
import AgendaManager from '../components/AgendaManager';
import { AnimatePresence } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import FormattedDateInput from '../components/FormattedDateInput';
import DynamicBadge from '../components/DynamicBadge';
import { db, auth, RecaptchaVerifier, signInWithPhoneNumber } from '../firebase';
import { collection, query, where, getDocs, deleteDoc, doc, updateDoc, addDoc, serverTimestamp, getDoc, setDoc, onSnapshot, increment } from 'firebase/firestore';
import { useAuth } from '../hooks/useAuth';

const HeatmapHotspot = ({ x, y, intensity, label }) => (
  <div className="absolute group" style={{ left: `${x / 10}%`, top: `${y / 6}%`, transform: 'translate(-50%, -50%)' }}>
    <motion.div 
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.6, 0.3] }}
      transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
      className="rounded-full bg-red-500 blur-xl"
      style={{ width: `${intensity}px`, height: `${intensity}px` }}
    />
    <motion.div 
      animate={{ scale: [1, 1.1, 1] }}
      transition={{ duration: 2, repeat: Infinity }}
      className="absolute inset-0 m-auto w-4 h-4 bg-red-500 border-2 border-white rounded-full shadow-[0_0_10px_rgba(239,68,68,1)]"
    />
    <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 bg-black/80 border border-white/10 px-2 py-1 rounded text-[8px] font-black text-white opacity-0 group-hover:opacity-100 whitespace-nowrap transition-all z-20">
      {label}
    </div>
  </div>
);

const AdminDashboard = () => {
  const location = useLocation();
  const navigate = useNavigate();

  // ─── Staff Passes State ──────────────────────────────────────────────────
  const [staffPasses, setStaffPasses] = useState([]);
  const [showStaffModal, setShowStaffModal] = useState(false);
  const [isAddingCustomCategory, setIsAddingCustomCategory] = useState(false);
  const [customCategoryInput, setCustomCategoryInput] = useState('');
  
  // Derive active tab from URL path
  const currentTab = location.pathname.split('/').pop();
  const [activeTab, setActiveTab] = useState(currentTab && currentTab !== 'admin' ? currentTab : 'forms');
  const { user, logout } = useAuth();
  const [myEvents, setMyEvents] = useState([]);
  const [selectedEventId, setSelectedEventId] = useState(null);
  const [eventData, setEventData] = useState(null);
  const [isFetchingEvents, setIsFetchingEvents] = useState(true);

  const [fetchLogs, setFetchLogs] = useState([]);
  
  useEffect(() => {
    if (!user) return;
    const fetchEvents = async () => {
      setFetchLogs(["Fetch started..."]);
      let q;
      if (user.role === 'admin') {
         q = query(collection(db, "events"), where("adminIds", "array-contains", user.uid));
      } else if (user.role === 'organizer') {
         q = query(collection(db, "events"), where("organizerId", "==", user.uid));
      } else if (user.role === 'owner') {
         q = query(collection(db, "events"), where("ownerId", "==", user.uid));
      } else if (user.role === 'reseller') {
         q = query(collection(db, "events"), where("resellerId", "==", user.uid));
      } else {
         q = query(collection(db, "events")); // Superuser gets all
      }
      
      try {
          const snap = await getDocs(q);
          const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          setFetchLogs(prev => [...prev, `Web SDK found ${data.length} events.`]);
          
          if (data.length === 0) {
              setFetchLogs(prev => [...prev, `Fallback Triggered. User Role: ${user.role}`]);
              try {
                  const token = await auth.currentUser?.getIdToken();
                  if (token) {
                      const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
                      setFetchLogs(prev => [...prev, `REST Fetching URL...`]);
                      const res = await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/events`, {
                          headers: { 'Authorization': `Bearer ${token}` }
                      });
                      if (res.ok) {
                          const restData = await res.json();
                          if (restData.documents) {
                              setFetchLogs(prev => [...prev, `REST found ${restData.documents.length} docs. Parsing...`]);
                              const parsedRest = restData.documents.map(d => {
                                  const obj = { id: d.name.split('/').pop() };
                                  if (d.fields) {
                                      Object.keys(d.fields).forEach(k => {
                                          obj[k] = Object.values(d.fields[k])[0];
                                      });
                                  }
                                  return obj;
                              });
                              setMyEvents(parsedRest);
                              setIsFetchingEvents(false);
                              return;
                          } else {
                              setFetchLogs(prev => [...prev, `REST API returned no documents.`]);
                          }
                      } else {
                          const errData = await res.json();
                          setFetchLogs(prev => [...prev, `REST Error: ${JSON.stringify(errData)}`]);
                      }
                  } else {
                      setFetchLogs(prev => [...prev, `No Auth Token available.`]);
                  }
              } catch (restErr) {
                  setFetchLogs(prev => [...prev, `REST Fallback Exception: ${restErr.message}`]);
              }
          }
          
          setMyEvents(data);
      } catch (err) {
          setFetchLogs(prev => [...prev, `Web SDK Error: ${err.message}`]);
      }
      
      setIsFetchingEvents(false);
    };
    fetchEvents();
  }, [user]);

  // Synchronize URL and state when location or events change
  useEffect(() => {
      if (myEvents.length === 0) return;
      
      const pathParts = location.pathname.split('/').filter(p => p && p !== 'admin');
      let initialEventId = null;
      let initialTab = 'overview';

      if (pathParts.length > 0) {
          const knownTabs = ['overview', 'reg-designer', 'tickets', 'staff-passes', 'discounts', 'approvals', 'forms', 'designer', 'giveaways', 'zones', 'map', 'automation', 'attendees', 'settings'];
          
          if (knownTabs.includes(pathParts[0])) {
              initialTab = pathParts[0];
          } else {
              initialEventId = pathParts[0];
              if (pathParts[1] && knownTabs.includes(pathParts[1])) {
                  initialTab = pathParts[1];
              }
          }
      }

      if (initialEventId && myEvents.find(e => e.id === initialEventId)) {
          setSelectedEventId(initialEventId);
          setEventData(myEvents.find(e => e.id === initialEventId));
          setActiveTab(initialTab);
      } else if (!initialEventId) {
          setSelectedEventId(null);
          setEventData(null);
      }
  }, [location.pathname, myEvents]);

  const handleEventSwitch = (eId) => {
    if (!eId) {
      setSelectedEventId(null);
      setEventData(null);
      navigate(`/admin`);
      return;
    }
    const ev = myEvents.find(e => e.id === eId);
    setSelectedEventId(eId);
    setEventData(ev);
    navigate(`/admin/${eId}/overview`);
    setActiveTab('overview');
  };

  const [insertLogs, setInsertLogs] = useState([]);
  
  const handleInsertTestEvents = async () => {
    setInsertLogs(["Step 1: Button clicked. Preparing data..."]);
    try {
      const uid = user?.uid || 'test_user';
      const role = user?.role || 'admin';
      const testEvents = [
        {
          name: "Global Tech Summit 2026",
          description: "The premier gathering of tech innovators and leaders from around the world. Featuring keynote speeches, interactive workshops, and exclusive networking.",
          adminIds: [uid],
          organizerId: (role === 'organizer' || role === 'organiser') ? uid : 'test_org',
          ownerId: role === 'owner' ? uid : 'test_owner',
          resellerId: role === 'reseller' ? uid : 'test_reseller',
          tenantId: role === 'reseller' ? uid : (role === 'owner' ? (user?.parentId || 'test_tenant') : 'test_tenant'),
          createdAt: new Date().toISOString(),
          status: 'Active'
        },
        {
          name: "Neon Nights Music Festival",
          description: "A breathtaking three-day electronic music festival featuring top international DJs, stunning light shows, and an immersive audiovisual experience.",
          adminIds: [uid],
          organizerId: (role === 'organizer' || role === 'organiser') ? uid : 'test_org',
          ownerId: role === 'owner' ? uid : 'test_owner',
          resellerId: role === 'reseller' ? uid : 'test_reseller',
          tenantId: role === 'reseller' ? uid : (role === 'owner' ? (user?.parentId || 'test_tenant') : 'test_tenant'),
          createdAt: new Date().toISOString(),
          status: 'Active'
        },
        {
          name: "Startup Pitch & Demo Day",
          description: "Watch the next generation of unicorns pitch their revolutionary ideas to top-tier venture capitalists and angel investors.",
          adminIds: [uid],
          organizerId: (role === 'organizer' || role === 'organiser') ? uid : 'test_org',
          ownerId: role === 'owner' ? uid : 'test_owner',
          resellerId: role === 'reseller' ? uid : 'test_reseller',
          tenantId: role === 'reseller' ? uid : (role === 'owner' ? (user?.parentId || 'test_tenant') : 'test_tenant'),
          createdAt: new Date().toISOString(),
          status: 'Active'
        }
      ];

      setInsertLogs(prev => [...prev, "Step 2: Data prepared. Testing via REST API..."]);
      
      const token = await auth.currentUser.getIdToken();
      const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
      const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/events`;

      for (let i = 0; i < testEvents.length; i++) {
          setInsertLogs(prev => [...prev, `Inserting Event ${i+1} via REST API...`]);
          const ev = testEvents[i];
          
          const response = await fetch(url, {
              method: 'POST',
              headers: {
                  'Authorization': `Bearer ${token}`,
                  'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                  fields: {
                      name: { stringValue: ev.name },
                      description: { stringValue: ev.description },
                      adminIds: { arrayValue: { values: ev.adminIds.map(id => ({ stringValue: id })) } },
                      organizerId: { stringValue: ev.organizerId },
                      ownerId: { stringValue: ev.ownerId },
                      resellerId: { stringValue: ev.resellerId },
                      tenantId: { stringValue: ev.tenantId },
                      createdAt: { timestampValue: ev.createdAt },
                      status: { stringValue: ev.status }
                  }
              })
          });
          
          if (!response.ok) {
              const errData = await response.json();
              setInsertLogs(prev => [...prev, `Event ${i+1} FAILED: ${JSON.stringify(errData)}`]);
              return;
          }
          setInsertLogs(prev => [...prev, `Event ${i+1} SUCCESS!`]);
      }
      
      setInsertLogs(prev => [...prev, "Step 3: All Test events successfully inserted! You can safely navigate to Overview."]);
    } catch (err) {
      console.error("Error inserting test events:", err);
      setInsertLogs(prev => [...prev, "FAILED! Error: " + err.message]);
    }
  };
  const [accessSubTab, setAccessSubTab] = useState('rules');
  const [searchTerm, setSearchTerm] = useState('');
  const [, setLoading] = useState(false);
  const [attendees, setAttendees] = useState([]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "attendees"), (snap) => {
      setAttendees(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!selectedEventId) return;
    const q = query(collection(db, "staffPasses"), where("eventId", "==", selectedEventId));
    const unsub = onSnapshot(q, (snap) => {
      setStaffPasses(snap.docs.map(doc => ({ id: doc.id, firestoreId: doc.id, ...doc.data() })));
    });
    return () => unsub();
  }, [selectedEventId]);


  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    if (selectedEventId) {
        navigate(`/admin/${selectedEventId}/${tabId}`);
    } else {
        navigate(`/admin/${tabId}`);
    }
  };
  const [tickets, setTickets] = useState([]);
  const [showNewTicketModal, setShowNewTicketModal] = useState(false);
  const [newTicket, setNewTicket] = useState({ name: '', description: '', price: 'Free', qty: 100, bookedQty: 0, type: 'Public', categoryType: 'standard' });

  const defaultBadgeElements = [
    { id: 'qr', label: 'QR Code', x: 50, y: 300, scale: 1 },
    { id: 'name', label: 'Attendee Name', x: 50, y: 150, scale: 1.2, size: '2xl' },
    { id: 'role', label: 'Ticket Category', x: 50, y: 200, scale: 1, color: 'text-primary' },
  ];
  const badgeCanvasRef = useRef(null);
  const [badgeElements, setBadgeElements] = useState(defaultBadgeElements);
  const [editingBadgeElementId, setEditingBadgeElementId] = useState(null);

  const [, setSpatialStats] = useState([]);

  const addBadgeElement = (type) => {
    const labels = { 'email': 'Email Address', 'company': 'Company Name', 'job': 'Job Title', 'venue': 'Venue Name' };
    const newEl = { 
        id: `el-${Date.now()}`, 
        label: labels[type] || 'New Field', 
        x: 50, 
        y: 250, 
        scale: 1 
    };
    setBadgeElements(prev => { const next = [...prev, newEl]; saveBadgeDesign(next); return next; });
  };

  const [showSpotRegistrationModal, setShowSpotRegistrationModal] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [spotAttendee, setSpotAttendee] = useState({ firstName: '', lastName: '', email: '', company: '', designation: '', phone: '', ticket: 'General Delegate' });
  const [spotStep, setSpotStep] = useState('details'); // 'details', 'otp'
  const [spotOtp, setSpotOtp] = useState(['', '', '', '', '', '']);
  const [spotConfirmation, setSpotConfirmation] = useState(null);
  const [spotAuthError, setSpotAuthError] = useState(null);
  const [spotRegisteredAttendee, setSpotRegisteredAttendee] = useState(null);

  const removeBadgeElement = (id) => {
    if (id === 'qr') return; // Protect QR
    setBadgeElements(prev => { const next = prev.filter(el => el.id !== id); saveBadgeDesign(next); return next; });
  };

  const updateBadgeElement = (id, updater) => {
    setBadgeElements(prev => {
      const next = prev.map(el => el.id === id ? (typeof updater === 'function' ? updater(el) : { ...el, ...updater }) : el);
      saveBadgeDesign(next);
      return next;
    });
  };

  const updateBadgeElementScale = (id, newScale) => {
    updateBadgeElement(id, { scale: parseFloat(newScale) });
  };

  // Persist badge design to the selected event document.
  const saveBadgeDesign = async (next) => {
    if (!selectedEventId) return;
    try {
      await updateDoc(doc(db, "events", selectedEventId), { badgeDesign: next });
      setMyEvents(prev => prev.map(e => e.id === selectedEventId ? { ...e, badgeDesign: next } : e));
      setEventData(prev => prev ? { ...prev, badgeDesign: next } : prev);
    } catch (err) {
      console.error("Failed to save badge design:", err);
    }
  };

  // Load badge design for the currently selected event.
  useEffect(() => {
    if (!eventData) { setBadgeElements(defaultBadgeElements); return; }
    const loaded = Array.isArray(eventData.badgeDesign) ? eventData.badgeDesign : [];
    if (loaded.length > 0) {
      setBadgeElements(loaded);
    } else {
      setBadgeElements(defaultBadgeElements);
    }
  }, [eventData]);

  const [giveaways, setGiveaways] = useState([]);
  const [newGiveaway, setNewGiveaway] = useState({ name: '', emoji: '🎁', totalQty: 100, eligibleTickets: ['All'] });
  const [showAddGiveaway, setShowAddGiveaway] = useState(false);
  const [raffleWinner, setRaffleWinner] = useState(null);

  // ── Discounts ──
  const [discounts, setDiscounts] = useState([]);
  const [newDiscount, setNewDiscount] = useState({ code: '', description: '', type: 'manual', valueType: 'percentage', value: 10, validFrom: '', validUntil: '', usageType: 'tickets', category: 'All', minOrder: 1, limit: 100 });
  const [showDiscountModal, setShowDiscountModal] = useState(false);

  // ── Pending Approvals ──
  const [pendingApprovals, setPendingApprovals] = useState([]);

  const iconMap = { User, Mail, Camera, ImageIcon, FileText, Phone, Lock, Calendar, MapPin, Briefcase, Globe, CheckCircle, Building2, Tag, CreditCard, Ticket, LayoutDashboard, Percent, ListChecks, Type };
  const getIconByName = (name) => iconMap[name] || FileText;
  const fieldTypeOptions = [
    { value: 'text', label: 'Short Text', iconName: 'FileText' },
    { value: 'email', label: 'Email', iconName: 'Mail' },
    { value: 'phone', label: 'Phone', iconName: 'Phone' },
    { value: 'number', label: 'Number', iconName: 'Tag' },
    { value: 'textarea', label: 'Long Text', iconName: 'Type' },
    { value: 'date', label: 'Date', iconName: 'Calendar' },
    { value: 'select', label: 'Dropdown', iconName: 'ListChecks' },
    { value: 'checkbox', label: 'Checkbox', iconName: 'CheckCircle' },
    { value: 'camera', label: 'Camera / Selfie', iconName: 'Camera' },
    { value: 'image', label: 'Image Upload', iconName: 'ImageIcon' },
    { value: 'pdf', label: 'File Upload', iconName: 'FileText' },
  ];

  const defaultFormFields = [
    { id: 1, name: 'Full Name', type: 'text', iconName: 'User', required: true, ticketIds: ['all'] },
    { id: 2, name: 'Professional Email', type: 'email', iconName: 'Mail', required: true, ticketIds: ['all'] },
    { id: 3, name: 'Face ID / Selfie', type: 'camera', iconName: 'Camera', required: true, ticketIds: ['all'] },
    { id: 4, name: 'Identity Proof / Visiting Card', type: 'image', iconName: 'ImageIcon', required: true, ticketIds: ['all'] },
    { id: 5, name: 'Resume / Portfolio', type: 'pdf', iconName: 'FileText', required: false, ticketIds: ['all'] }
  ];
  const [formFields, setFormFields] = useState(defaultFormFields);
  const [showFieldModal, setShowFieldModal] = useState(false);
  const [editingFieldId, setEditingFieldId] = useState(null);
  const [newField, setNewField] = useState({ name: '', type: 'text', iconName: 'FileText', required: false, ticketIds: ['all'] });

  const approveGuest = (id) => setPendingApprovals(prev => prev.map(p => p.id === id ? { ...p, status: 'approved' } : p));
  const rejectGuest  = (id) => setPendingApprovals(prev => prev.map(p => p.id === id ? { ...p, status: 'rejected' } : p));

  const addDiscount = () => {
    if (!newDiscount.description.trim()) return;
    setDiscounts(prev => [...prev, { ...newDiscount, id: Date.now(), used: 0, isActive: true }]);
    setNewDiscount({ code: '', description: '', type: 'manual', valueType: 'percentage', value: 10, validFrom: '', validUntil: '', usageType: 'tickets', category: 'All', minOrder: 1, limit: 100 });
    setShowDiscountModal(false);
  };

  // Persist the current tickets array to the selected event document.
  const persistTickets = async (next) => {
    if (!selectedEventId) return;
    try {
      await updateDoc(doc(db, "events", selectedEventId), { ticketTypes: next });
      setMyEvents(prev => prev.map(e => e.id === selectedEventId ? { ...e, ticketTypes: next } : e));
      setEventData(prev => prev ? { ...prev, ticketTypes: next } : prev);
    } catch (err) {
      console.error("Failed to save tickets:", err);
      alert("Could not save tickets: " + err.message);
    }
  };

  const addNewTicket = () => {
    if (!newTicket.name.trim()) return;
    const next = [...tickets, { ...newTicket, id: Date.now() }];
    setTickets(next);
    persistTickets(next);
    setNewTicket({ name: '', description: '', price: 'Free', qty: 100, bookedQty: 0, type: 'Public', categoryType: 'standard' });
    setShowNewTicketModal(false);
  };

  const deleteTicket = (id) => {
    const next = tickets.filter(t => t.id !== id);
    setTickets(next);
    persistTickets(next);
  };

  // Persist form fields to the selected event document.
  const saveFormFields = async (next) => {
    if (!selectedEventId) return;
    try {
      const serializable = next.map(f => ({ ...f, iconName: f.iconName || 'FileText' }));
      await updateDoc(doc(db, "events", selectedEventId), { formFields: serializable });
      setMyEvents(prev => prev.map(e => e.id === selectedEventId ? { ...e, formFields: serializable } : e));
      setEventData(prev => prev ? { ...prev, formFields: serializable } : prev);
    } catch (err) {
      console.error("Failed to save form fields:", err);
      alert("Could not save form fields: " + err.message);
    }
  };

  const addFormField = () => {
    if (!newField.name.trim()) return;
    const typeOpt = fieldTypeOptions.find(t => t.value === newField.type);
    const field = {
      id: Date.now(),
      name: newField.name.trim(),
      type: newField.type,
      iconName: newField.iconName || (typeOpt ? typeOpt.iconName : 'FileText'),
      required: !!newField.required,
      ticketIds: newField.ticketIds || ['all'],
      aiExtract: newField.aiExtract || []
    };
    const next = editingFieldId
      ? formFields.map(f => f.id === editingFieldId ? { ...field, id: editingFieldId } : f)
      : [...formFields, field];
    setFormFields(next);
    saveFormFields(next);
    setShowFieldModal(false);
    setEditingFieldId(null);
    setNewField({ name: '', type: 'text', iconName: 'FileText', required: false, ticketIds: ['all'] });
  };

  const deleteFormField = (id) => {
    const next = formFields.filter(f => f.id !== id);
    setFormFields(next);
    saveFormFields(next);
  };

  const moveField = (index, direction) => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === formFields.length - 1) return;
    const next = [...formFields];
    const swapIdx = direction === 'up' ? index - 1 : index + 1;
    [next[index], next[swapIdx]] = [next[swapIdx], next[index]];
    setFormFields(next);
    saveFormFields(next);
  };

  const openEditField = (field) => {
    setEditingFieldId(field.id);
    setNewField({
      name: field.name,
      type: field.type,
      iconName: field.iconName || 'FileText',
      required: !!field.required,
      ticketIds: field.ticketIds || ['all'],
      aiExtract: field.aiExtract || []
    });
    setShowFieldModal(true);
  };

  const openAddField = () => {
    setEditingFieldId(null);
    setNewField({ name: '', type: 'text', iconName: 'FileText', required: false, ticketIds: ['all'] });
    setShowFieldModal(true);
  };

  // Load tickets for the currently selected event.
  useEffect(() => {
    if (!eventData) { setTickets([]); return; }
    setTickets(Array.isArray(eventData.ticketTypes) ? eventData.ticketTypes : []);
  }, [eventData]);

  // Load form fields for the currently selected event.
  useEffect(() => {
    if (!eventData) { setFormFields(defaultFormFields); return; }
    const loaded = Array.isArray(eventData.formFields) ? eventData.formFields : [];
    if (loaded.length > 0) {
      setFormFields(loaded.map(f => ({ ...f, iconName: f.iconName || 'FileText' })));
    } else {
      setFormFields(defaultFormFields);
    }
  }, [eventData]);

  const [categoryTypeConfig, setCategoryTypeConfig] = useState({
    standard:  { label: 'Standard', color: 'bg-sky-500/10 text-sky-400 border-sky-500/20' },
    rsvp:      { label: 'Round-Table / RSVP', color: 'bg-purple-500/10 text-purple-400 border-purple-500/20' },
    approval:  { label: 'Vetting Required', color: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
    exhibitor: { label: 'Exhibitor', color: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' },
    speaker:   { label: 'Speaker', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
    organiser: { label: 'Organiser', color: 'bg-rose-500/10 text-rose-400 border-rose-500/20' },
    crew:      { label: 'Crew / Staff', color: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20' },
  });
  
  // Automation Templates
  const [automationTemplates, setAutomationTemplates] = useState({
    'registration': {
       name: 'Registration Confirmation', 
       trigger: 'First Check-In',
       subject: 'Welcome to the Event, {{attendee_name}}!',
       body: 'Hi {{attendee_name}},\n\nYou just checked in at {{gate_name}}! We are thrilled to have you here at the EventPro summit.\n\nEnjoy the sessions!'
    },
    'workshop-upsell': {
       name: 'Workshop Denial Upsell', 
       trigger: 'On Workshop Access Denial',
       subject: 'Exclusive Invite: Attend the {{gate_name}}',
       body: 'Hello {{attendee_name}},\n\nWe noticed you tried to enter the {{gate_name}} but your current pass doesn\'t include workshop access.\n\nGood news! You can upgrade your pass right now and join the session here: {{upsell_link}}\n\nDon\'t miss out on these deep-dive technical sessions!'
    },
    'vip-upsell': {
       name: 'VIP Zone Denial Upsell', 
       trigger: 'On VIP Area Access Denial',
       subject: 'Upgrade to VIP: Experience {{gate_name}} in style',
       body: 'Hi {{attendee_name}},\n\nOnly the best for the best! We saw you were interested in the {{gate_name}}.\n\nOur VIP Platinum pass gives you 24/7 access to all lounges, open bar, and premium seating. \n\nUpgrade your experience here: {{upsell_link}}\n\nLive the event differently!'
    }
  });
  const [activeAutomationId, setActiveAutomationId] = useState('registration');
  const [savingTemplate, setSavingTemplate] = useState(false);

  const deleteAttendee = async (attendeeId) => {
    if (!window.confirm("Are you sure you want to archive this attendee? Their record will be moved to long-term storage and their slot will be freed in your global subscription quota.")) return;
    
    try {
      const attendeeRef = doc(db, "attendees", attendeeId);
      const attendeeSnap = await getDoc(attendeeRef);
      
      if (attendeeSnap.exists()) {
        const attendeeData = attendeeSnap.data();
        const eventId = attendeeData.eventId;
        
        // 1. Move to Archive
        await setDoc(doc(db, "archived_attendees", attendeeId), {
          ...attendeeData,
          archivedAt: serverTimestamp(),
          archiveReason: 'Manual Admin Deletion'
        });

        // 2. Delete original Attendee
        await deleteDoc(attendeeRef);
        
        // 3. Decrement Event Regs
        if (eventId) {
          const eventRef = doc(db, "events", eventId);
          await updateDoc(eventRef, { registrations: increment(-1) });
          
          // 4. Decrement Tenant Quota
          const eventSnap = await getDoc(eventRef);
          if (eventSnap.exists() && eventSnap.data().tenantId) {
            const tenantRef = doc(db, "tenants", eventSnap.data().tenantId);
            await updateDoc(tenantRef, { currentUsers: increment(-1) });
          }
        }
        
        alert("Attendee archived and quota recycled.");
      }
    } catch (e) {
      console.error("Delete attendee error:", e);
      alert("Error removing attendee. Please try again.");
    }
  };

  const exportAttendeesExcel = async () => {
    try {
      const dataToExport = attendees.map(a => ({
        'Badge ID': a.id || 'N/A',
        'First Name': a.firstName || '',
        'Last Name': a.lastName || '',
        'Email Address': a.email || '',
        'Organization': a.company || '',
        'Designation': a.designation || '',
        'Phone': a.phone || '',
        'Ticket Type': a.ticket || '',
        'Status': a.status || 'Pending',
        'Registration Date': a.registeredAt || ''
      }));

      const XLSX = await import('xlsx');
      const worksheet = XLSX.utils.json_to_sheet(dataToExport);
      const workbook  = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Attendees");

      // Professional Column Width Setting
      const wscols = [
        {wch: 15}, {wch: 20}, {wch: 20}, {wch: 30}, 
        {wch: 25}, {wch: 20}, {wch: 15}, {wch: 15}, 
        {wch: 15}, {wch: 25}
      ];
      worksheet['!cols'] = wscols;

      XLSX.writeFile(workbook, `EventPro_Attendees_${new Date().toISOString().split('T')[0]}.xlsx`);
    } catch (error) {
      console.error('Export failed:', error);
      alert('Could not generate Excel file. Please try again.');
    }
  };

  const addGiveaway = () => {
    if (!newGiveaway.name.trim()) return;
    setGiveaways(prev => [...prev, { ...newGiveaway, id: Date.now(), claimedQty: 0, isActive: true }]);
    setNewGiveaway({ name: '', emoji: '🎁', totalQty: 100, eligibleTickets: ['All'] });
    setShowAddGiveaway(false);
  };

  const drawRaffleWinner = () => {
    const pool = ['Arjun Mehta', 'Priya Sharma', 'Michael Chen', 'Sarah Wilson', 'Rahul V.'];
    setRaffleWinner(pool[Math.floor(Math.random() * pool.length)]);
  };

  const setupSpotRecaptcha = () => {
    if (window.spotRecaptcha) return;
    window.spotRecaptcha = new RecaptchaVerifier(auth, 'spot-recaptcha-container', {
      'size': 'invisible'
    });
  };

  const requestSpotOTP = async () => {
    if (!spotAttendee.firstName || !spotAttendee.lastName || !spotAttendee.phone) {
        alert('First Name, Last Name, and Phone are required for verification.');
        return;
    }
    setLoading(true);
    setSpotAuthError(null);
    try {
        let formattedPhone = spotAttendee.phone.trim();
        if (!formattedPhone.startsWith('+')) formattedPhone = `+91${formattedPhone}`;
        
        setupSpotRecaptcha();
        const confirmation = await signInWithPhoneNumber(auth, formattedPhone, window.spotRecaptcha);
        setSpotConfirmation(confirmation);
        setSpotStep('otp');
    } catch (err) {
        setSpotAuthError(err.message);
    } finally {
        setLoading(false);
    }
  };

  const verifyAndRegisterSpot = async () => {
    const code = spotOtp.join('');
    if (code.length < 6) return;
    setIsPrinting(true);
    setSpotAuthError(null);
    try {
        await spotConfirmation.confirm(code);
        
        const newEntry = {
            firstName: spotAttendee.firstName,
            lastName: spotAttendee.lastName,
            email: spotAttendee.email,
            company: spotAttendee.company,
            designation: spotAttendee.designation,
            phone: spotAttendee.phone,
            ticketName: spotAttendee.ticket,
            status: 'checked-in',
            scanned: true,
            registeredAt: new Date().toISOString()
        };

        // 1. Save to Firestore
        const docRef = await addDoc(collection(db, "attendees"), { ...newEntry, createdAt: serverTimestamp() });
        
        // 2. Update local state
        setAttendees(prev => [{ ...newEntry, id: docRef.id }, ...prev]);
        setTickets(prev => prev.map(t => t.name === spotAttendee.ticket ? { ...t, bookedQty: (t.bookedQty || 0) + 1 } : t));

        // 3. Show badge preview
        setSpotRegisteredAttendee({ ...newEntry, id: docRef.id });
        setIsPrinting(false);
        setSpotStep('preview');
    } catch {
        setSpotAuthError("Invalid code. Please try again.");
        setIsPrinting(false);
    }
  };
  const [previewPass, setPreviewPass] = useState(null);
  const [newStaffPass, setNewStaffPass] = useState({ name: '', email: '', role: 'crew', company: '', zone: 'All Access' });

  const roleConfig = {
    'designer': { 
      label: 'Designer', icon: Palette, accent: '#a855f7', 
      panelCls: 'bg-purple-500/5 border-purple-500/20', iconWrap: 'bg-purple-500/10', iconCls: 'text-purple-400', textCls: 'text-purple-400',
      badgeCls: 'bg-purple-500/10 text-purple-400 border-purple-500/20', avatarCls: 'from-purple-600 to-purple-400',
      rowHover: 'hover:bg-purple-500/5', selectedCls: 'bg-purple-500/20 border-purple-500/50 text-white',
      zones: ['All Access', 'Stage', 'Backstage']
    },
    'security-head': { 
      label: 'Security Head', icon: ShieldCheck, accent: '#ef4444', 
      panelCls: 'bg-red-500/5 border-red-500/20', iconWrap: 'bg-red-500/10', iconCls: 'text-red-400', textCls: 'text-red-400',
      badgeCls: 'bg-red-500/10 text-red-400 border-red-500/20', avatarCls: 'from-red-600 to-red-400',
      rowHover: 'hover:bg-red-500/5', selectedCls: 'bg-red-500/20 border-red-500/50 text-white',
      zones: ['All Access']
    },
    'bouncer': { 
      label: 'Bouncer', icon: HardHat, accent: '#f97316', 
      panelCls: 'bg-orange-500/5 border-orange-500/20', iconWrap: 'bg-orange-500/10', iconCls: 'text-orange-400', textCls: 'text-orange-400',
      badgeCls: 'bg-orange-500/10 text-orange-400 border-orange-500/20', avatarCls: 'from-orange-600 to-orange-400',
      rowHover: 'hover:bg-orange-500/5', selectedCls: 'bg-orange-500/20 border-orange-500/50 text-white',
      zones: ['Main Gate', 'VIP Entrance', 'Stage Security']
    },
    'security': { 
      label: 'Security', icon: Shield, accent: '#f87171', 
      panelCls: 'bg-red-400/5 border-red-400/20', iconWrap: 'bg-red-400/10', iconCls: 'text-red-300', textCls: 'text-red-300',
      badgeCls: 'bg-red-400/10 text-red-300 border-red-400/20', avatarCls: 'from-red-500 to-red-300',
      rowHover: 'hover:bg-red-400/5', selectedCls: 'bg-red-400/20 border-red-400/50 text-white',
      zones: ['Main Gate', 'General Access']
    },
    'runner': { 
      label: 'Runner Boy', icon: Zap, accent: '#fbbf24', 
      panelCls: 'bg-amber-500/5 border-amber-500/20', iconWrap: 'bg-amber-500/10', iconCls: 'text-amber-400', textCls: 'text-amber-400',
      badgeCls: 'bg-amber-500/10 text-amber-400 border-amber-500/20', avatarCls: 'from-amber-600 to-amber-400',
      rowHover: 'hover:bg-amber-500/5', selectedCls: 'bg-amber-500/20 border-amber-500/50 text-white',
      zones: ['All Access', 'Production Office']
    },
    'scanner': { 
      label: 'Batch Scanner', icon: Camera, accent: '#22d3ee', 
      panelCls: 'bg-cyan-500/5 border-cyan-500/20', iconWrap: 'bg-cyan-500/10', iconCls: 'text-cyan-400', textCls: 'text-cyan-400',
      badgeCls: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20', avatarCls: 'from-cyan-600 to-cyan-400',
      rowHover: 'hover:bg-cyan-500/5', selectedCls: 'bg-cyan-500/20 border-cyan-500/50 text-white',
      zones: ['Main Gate', 'Checkpoints']
    },
    'crew': { 
      label: 'Management', icon: Users, accent: '#60a5fa', 
      panelCls: 'bg-blue-500/5 border-blue-500/20', iconWrap: 'bg-blue-500/10', iconCls: 'text-blue-400', textCls: 'text-blue-400',
      badgeCls: 'bg-blue-500/10 text-blue-400 border-blue-500/20', avatarCls: 'from-blue-600 to-blue-400',
      rowHover: 'hover:bg-blue-500/5', selectedCls: 'bg-blue-500/20 border-blue-500/50 text-white',
      zones: ['All Access']
    },
    'electrician': { 
      label: 'Electrician', icon: Zap, accent: '#facc15', 
      panelCls: 'bg-yellow-500/5 border-yellow-500/20', iconWrap: 'bg-yellow-500/10', iconCls: 'text-yellow-400', textCls: 'text-yellow-400',
      badgeCls: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20', avatarCls: 'from-yellow-600 to-yellow-400',
      rowHover: 'hover:bg-yellow-500/5', selectedCls: 'bg-yellow-500/20 border-yellow-500/50 text-white',
      zones: ['Backstage', 'Technical Booth']
    },
    'fabricator': { 
      label: 'Fabricator', icon: Box, accent: '#818cf8', 
      panelCls: 'bg-indigo-500/5 border-indigo-500/20', iconWrap: 'bg-indigo-500/10', iconCls: 'text-indigo-400', textCls: 'text-indigo-400',
      badgeCls: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20', avatarCls: 'from-indigo-600 to-indigo-400',
      rowHover: 'hover:bg-indigo-500/5', selectedCls: 'bg-indigo-500/20 border-indigo-500/50 text-white',
      zones: ['Exhibition Hall', 'Workshop Area']
    },
    'police': { 
      label: 'Police', icon: Shield, accent: '#2563eb', 
      panelCls: 'bg-blue-700/5 border-blue-700/20', iconWrap: 'bg-blue-700/10', iconCls: 'text-blue-600', textCls: 'text-blue-600',
      badgeCls: 'bg-blue-700/10 text-blue-600 border-blue-700/20', avatarCls: 'from-blue-800 to-blue-600',
      rowHover: 'hover:bg-blue-700/5', selectedCls: 'bg-blue-700/20 border-blue-700/50 text-white',
      zones: ['All Access']
    },
    'fire-marshall': { 
      label: 'Fire Marshall', icon: Zap, accent: '#ea580c', 
      panelCls: 'bg-orange-700/5 border-orange-700/20', iconWrap: 'bg-orange-700/10', iconCls: 'text-orange-600', textCls: 'text-orange-600',
      badgeCls: 'bg-orange-700/10 text-orange-600 border-orange-700/20', avatarCls: 'from-orange-800 to-orange-600',
      rowHover: 'hover:bg-orange-700/5', selectedCls: 'bg-orange-700/20 border-orange-700/50 text-white',
      zones: ['All Access']
    },
    'cleaner': { 
      label: 'Cleaner', icon: RefreshCw, accent: '#9ca3af', 
      panelCls: 'bg-zinc-500/5 border-zinc-500/20', iconWrap: 'bg-zinc-500/10', iconCls: 'text-zinc-400', textCls: 'text-zinc-400',
      badgeCls: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20', avatarCls: 'from-zinc-600 to-zinc-400',
      rowHover: 'hover:bg-zinc-500/5', selectedCls: 'bg-zinc-500/20 border-zinc-500/50 text-white',
      zones: ['Common Areas']
    },
    'finance': { 
      label: 'Finance', icon: CreditCard, accent: '#34d399', 
      panelCls: 'bg-emerald-500/5 border-emerald-500/20', iconWrap: 'bg-emerald-500/10', iconCls: 'text-emerald-400', textCls: 'text-emerald-400',
      badgeCls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', avatarCls: 'from-emerald-600 to-emerald-400',
      rowHover: 'hover:bg-emerald-500/5', selectedCls: 'bg-emerald-500/20 border-emerald-500/50 text-white',
      zones: ['Registration Desk', 'Accounts Office']
    },
  };

  const issueStaffPass = async () => {
    if (!newStaffPass.name || !newStaffPass.email) return;
    setLoading(true);
    try {
      const id = `SP${Date.now().toString().slice(-4)}`;
      const staffRef = await addDoc(collection(db, "staffPasses"), {
        ...newStaffPass,
        id,
        status: 'issued',
        issuedAt: new Date().toISOString().split('T')[0],
        eventId: selectedEventId,
        createdAt: serverTimestamp()
      });
      setStaffPasses(prev => [...prev, { ...newStaffPass, id, firestoreId: staffRef.id, status: 'issued', issuedAt: new Date().toISOString().split('T')[0] }]);
      setNewStaffPass({ name: '', email: '', role: 'crew', company: '', zone: 'All Access' });
      setShowStaffModal(false);
    } catch (err) {
      console.error("Error issuing staff pass:", err);
      alert("Failed to issue staff pass. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const tabs = [
    { id: 'overview', label: 'Event Stats', icon: BarChart },
    { id: 'exhibitors', label: 'Exhibitors', icon: Building2 },
    { id: 'speakers', label: 'Speakers', icon: Mic2 },
    { id: 'agendas', label: 'Conference Line Up', icon: Calendar },
    { id: 'zones', label: 'Access Control', icon: ShieldCheck },
    { id: 'map', label: 'Exhibition Map', icon: Globe },
    { id: 'tickets', label: 'Ticketing', icon: CreditCard },
    { id: 'discounts', label: 'Discounts', icon: Tag },
    { id: 'approvals', label: 'Approvals', icon: ListChecks, badge: pendingApprovals.filter(p => p.status === 'pending').length },
    { id: 'giveaways', label: 'Giveaways', icon: Gift },
    { id: 'forms', label: 'Form Builder', icon: FileText },
    { id: 'reg-designer', label: 'Site Builder', icon: Layout },
    { id: 'designer', label: 'Badge Designer', icon: Palette },
    { id: 'automation', label: 'Automation', icon: Zap },
    { id: 'staff-passes', label: 'Staff Management', icon: BadgeCheck, badge: staffPasses.filter(p => p.status === 'pending').length || undefined },
    { id: 'attendees', label: 'Attendees', icon: Users },
    { id: 'devices', label: 'Device Registry', icon: Monitor },
    { id: 'tv-designer', label: 'TV Studio', icon: Tv },
    { id: 'settings', label: 'Dashboard Config', icon: Settings },
  ];

  const defaultLandingConfig = {
    themeColor: '#5422ff',
    headerImage: 'https://images.unsplash.com/photo-1540575861501-7ce0e220beff?q=80&w=2070',
    headerOverlay: 40,
    fontFamily: 'Inter',
    eventTitle: '',
    eventDate: '',
    eventLocation: '',
    eventDesc: '',
    sections: {
        about: true,
        agenda: true,
        speakers: true,
        sponsors: true
    }
  };
  const [registrationDesign, setRegistrationDesign] = useState(defaultLandingConfig);
  const [previewMode, setPreviewMode] = useState('desktop');

  const saveLandingConfig = async (next) => {
    if (!selectedEventId) return;
    try {
      await updateDoc(doc(db, "events", selectedEventId), { landingConfig: next });
      setMyEvents(prev => prev.map(e => e.id === selectedEventId ? { ...e, landingConfig: next } : e));
      setEventData(prev => prev ? { ...prev, landingConfig: next } : prev);
    } catch (err) {
      console.error("Failed to save landing config:", err);
      alert("Could not save site design: " + err.message);
    }
  };

  // Load landing config for the currently selected event.
  useEffect(() => {
    if (!eventData) { setRegistrationDesign(defaultLandingConfig); return; }
    const loaded = eventData.landingConfig;
    if (loaded && typeof loaded === 'object') {
      setRegistrationDesign({
        ...defaultLandingConfig,
        ...loaded,
        sections: { ...defaultLandingConfig.sections, ...(loaded.sections || {}) }
      });
    } else {
      setRegistrationDesign({
        ...defaultLandingConfig,
        eventTitle: eventData.name || '',
        eventDate: eventData.date || '',
        eventLocation: eventData.location || '',
        eventDesc: eventData.description || ''
      });
    }
  }, [eventData]);

  const _runHeavySimulation = async (count = 50) => {
    setLoading(true);
    const mockCompanies = ['Quantum Dynamics', 'Neuralink', 'SpaceX', 'Google DeepMind', 'Ethical AI', 'CryptoSettle', 'Metaverse Lab'];
    const mockDesignations = ['VP Engineering', 'CTO', 'Product Lead', 'Senior Staff Eng', 'Blockchain Architect', 'Data Scientist'];
    
    let currentAttendees = [...attendees];
    let currentTickets = [...tickets];
    let currentDiscounts = [...discounts];
    let addedCount = 0;
    let stopReason = null;

    for (let i = 0; i < count; i++) {
        // Find tickets that still have capacity
        const availableTickets = currentTickets.filter(t => (t.bookedQty || 0) < (t.qty || 0));
        
        if (availableTickets.length === 0) {
            stopReason = 'Total Event Capacity Reached';
            break;
        }

        const ticket = availableTickets[Math.floor(Math.random() * availableTickets.length)];
        const [firstName, lastName] = [['Arjun', 'Mehta'], ['Priya', 'Sharma'], ['Michael', 'Chen'], ['Sarah', 'Wilson'], ['Yuki', 'Tanaka'], ['Carlos', 'Ruiz'], ['Amara', 'Okafor'], ['Zoe', 'Smith']][Math.floor(Math.random() * 8)];
        const isCheckedIn = Math.random() > 0.4;
        
        // Randomly apply a promo code (30% chance)
        let appliedPromo = null;
        if (Math.random() > 0.7) {
            const activePromos = currentDiscounts.filter(d => 
                d.isActive && 
                (d.limit === 0 || d.used < d.limit) && 
                (d.category === 'All' || d.category === ticket.name)
            );
            if (activePromos.length > 0) {
                appliedPromo = activePromos[Math.floor(Math.random() * activePromos.length)];
                currentDiscounts = currentDiscounts.map(d => 
                    d.id === appliedPromo.id ? { ...d, used: d.used + 1 } : d
                );
            }
        }

        const newAttendee = {
            id: `SIM-${Date.now()}-${i}`,
            firstName,
            lastName,
            email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}${Date.now()}${i}@sim.io`,
            phone: '+91 9' + Math.floor(100000000 + Math.random() * 900000000),
            company: mockCompanies[Math.floor(Math.random() * mockCompanies.length)],
            designation: mockDesignations[Math.floor(Math.random() * mockDesignations.length)],
            ticket: ticket.name,
            promoUsed: appliedPromo ? appliedPromo.code : null,
            status: isCheckedIn ? 'Checked In' : 'Registered',
            registeredAt: `${Math.floor(Math.random() * 24)}h ago`,
            checkpoints: isCheckedIn ? [{ gateId: 'main-entrance', gateLabel: 'Main Entrance', time: new Date().toISOString() }] : []
        };

        currentAttendees.push(newAttendee);
        
        // Update ticket booked quantity
        currentTickets = currentTickets.map(t => 
            t.id === ticket.id ? { ...t, bookedQty: (t.bookedQty || 0) + 1 } : t
        );
        
        addedCount++;
    }

    setAttendees(currentAttendees);
    setTickets(currentTickets);
    setDiscounts(currentDiscounts);
    
    // Simulate Spatial Movement
    setSpatialStats(prev => prev.map(s => ({
        ...s,
        count: s.count + Math.floor(Math.random() * 20) - 5,
        intensity: Math.min(200, Math.max(40, s.intensity + Math.floor(Math.random() * 20) - 10))
    })));

    if (stopReason) {
        alert(`⚠️ Simulation Stopped: ${stopReason}. Total injected in this batch: ${addedCount}.\n\nℹ️ This is local preview data only — it will NOT be saved to Firestore.`);
    } else if (addedCount > 10) {
        alert(`🚀 Heavy Simulation Complete. Injected ${addedCount} attendees across available categories.\n\nℹ️ This is local preview data only — it will NOT be saved to Firestore.`);
    } else {
        alert(`⚡ Simulated ${addedCount} attendees added.\n\nℹ️ This is local preview data only — it will NOT be saved to Firestore.`);
    }
    setLoading(false);
  };

  const [securitySettings, setSecuritySettings] = useState({
    emailOTP: true,
    smsOTP: true,
    whatsappOTP: true,
    requireOTP: true,
    aadhaarAuth: false,
    sessionExpiry: '24h'
  });

  const toggleSecurity = (key) => {
    setSecuritySettings(prev => ({ ...prev, [key]: !prev[key] }));
  };

  if (isFetchingEvents) {
    return (
       <PageWrapper>
          <div className="min-h-screen bg-mesh flex flex-col items-center justify-center p-8">
             <motion.div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full" animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }} />
          </div>
       </PageWrapper>
    );
  }

  if (!selectedEventId) {
    return (
      <PageWrapper>
        <div className="min-h-screen bg-mesh flex flex-col p-4 md:p-8">
          <div className="w-full max-w-7xl mx-auto">
             <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12 mt-8">
                <div>
                   <h1 className="text-3xl md:text-5xl font-black text-white uppercase tracking-tighter mb-2">Select Event</h1>
                   <p className="text-zinc-400 font-medium">Choose an event to manage its settings, tickets, and attendees.</p>
                </div>
                <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                   {myEvents.length === 0 && (
                     <div className="flex flex-col items-end gap-2">
                         <button onClick={handleInsertTestEvents} className="flex-1 md:flex-none px-6 py-3 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 font-bold rounded-xl transition-all border border-emerald-500/20 flex items-center justify-center gap-2">
                            <PlusCircle className="w-4 h-4" /> Insert Test Events
                         </button>
                         {insertLogs.length > 0 && (
                             <div className="bg-black/50 p-4 rounded-xl border border-white/10 text-xs font-mono text-emerald-400 space-y-1 mt-2 text-right">
                                 {insertLogs.map((log, index) => <div key={index}>{log}</div>)}
                             </div>
                         )}
                     </div>
                   )}
                   <button onClick={() => navigate('/')} className="flex-1 md:flex-none px-6 py-3 bg-white/5 hover:bg-white/10 rounded-xl text-white font-bold transition-all border border-white/10 flex items-center justify-center gap-2">
                      <ChevronRight className="w-4 h-4 rotate-180" /> Back to Platform
                   </button>
                   <button onClick={logout} className="flex-1 md:flex-none px-6 py-3 bg-red-500/10 hover:bg-red-500/20 text-red-400 font-bold rounded-xl transition-all border border-red-500/20 flex items-center justify-center gap-2">
                      <LogOut className="w-4 h-4" /> Logout
                   </button>
                </div>
             </div>
             
             <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {myEvents.map((event, i) => (
                   <motion.div 
                     key={event.id} 
                     initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                     whileHover={{ scale: 1.02, y: -4 }}
                     className="glass-panel p-6 cursor-pointer group flex flex-col h-full border border-white/5 hover:border-primary/30 transition-all shadow-xl shadow-black/20" 
                     onClick={() => handleEventSwitch(event.id)}
                   >
                       <div className="flex items-start justify-between mb-6">
                           <div className="w-14 h-14 bg-gradient-to-br from-primary/20 to-indigo-500/20 text-primary border border-primary/30 rounded-2xl flex items-center justify-center text-2xl font-black shadow-[0_0_15px_rgba(84,34,255,0.2)]">
                              {event.name?.charAt(0) || 'E'}
                           </div>
                           <div className="px-3 py-1 bg-white/5 rounded-full border border-white/10 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                               ID: {event.id.slice(0, 8)}
                           </div>
                       </div>
                       
                       <h2 className="text-xl font-black text-white mb-2 line-clamp-1">{event.name || 'Unnamed Event'}</h2>
                       <p className="text-sm text-zinc-400 mb-8 line-clamp-2 min-h-[40px]">
                           {event.description || 'No description provided. Click to manage this event.'}
                       </p>
                       
                       <div className="mt-auto pt-4 border-t border-white/10 flex items-center justify-between">
                           <span className="text-xs font-black text-zinc-500 uppercase tracking-widest group-hover:text-primary transition-colors">Manage Event</span>
                           <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center group-hover:bg-primary group-hover:text-white transition-all">
                               <ChevronRight className="w-4 h-4" />
                           </div>
                       </div>
                   </motion.div>
                ))}
                {myEvents.length === 0 && (
                   <div className="col-span-full py-32 flex flex-col items-center justify-center text-center glass-panel border border-white/5 border-dashed">
                   <div className="flex flex-col items-center justify-center py-20 text-center relative z-10">
                   <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center mb-6 border border-white/10">
                      <Package className="w-8 h-8 text-zinc-500" />
                   </div>
                   <h3 className="text-xl font-bold text-white mb-2">No Events Found</h3>
                   <p className="text-zinc-500 text-sm max-w-md">You don't have access to manage any events yet. Create one from the platform dashboard first.</p>
                   
                   {fetchLogs.length > 0 && (
                       <div className="mt-8 bg-black/50 p-4 rounded-xl border border-white/10 text-xs font-mono text-emerald-400 space-y-1 text-left max-w-lg w-full">
                           <div className="text-white font-bold mb-2 border-b border-white/10 pb-1">Fetch Diagnostics:</div>
                           {fetchLogs.map((log, index) => <div key={index}>{log}</div>)}
                       </div>
                   )}
                </div>
                   </div>
                )}
             </div>
          </div>
        </div>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper>
      <div className="flex bg-mesh min-h-screen text-slate-100">
        
        {/* ─── VERTICAL TABS SIDEBAR (DESKTOP) ─── */}
        <aside className="w-64 hidden lg:flex flex-col p-6 border-r border-white/5 h-screen sticky top-0 overflow-y-auto no-scrollbar bg-black/20 shrink-0">
          <div className="mb-10">
            <button 
              onClick={() => navigate('/')} 
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-zinc-400 hover:text-white hover:bg-white/10 transition-all text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2"
            >
              <ChevronRight className="w-4 h-4 rotate-180" /> Back to Platform
            </button>
          </div>
          
          <div className="flex items-center gap-3 mb-6 px-2">
             <div className="w-10 h-10 bg-gradient-to-br from-primary to-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-primary/20 flex-shrink-0">
                <span className="text-white font-black text-xl">E</span>
             </div>
             <div className="flex-1 min-w-0">
                <h2 className="font-bold text-sm text-white truncate" title={eventData?.name}>{eventData?.name || 'Select Event'}</h2>
                <p className="text-[10px] text-zinc-500 uppercase tracking-widest">Control Panel</p>
             </div>
          </div>

          <nav className="flex-1 flex flex-col gap-1.5 pb-10">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-left group ${
                  activeTab === tab.id 
                  ? 'bg-primary text-white shadow-[0_0_15px_rgba(84,34,255,0.2)]' 
                  : 'text-zinc-500 hover:text-white hover:bg-white/5'
                }`}
              >
                <tab.icon className={`w-4 h-4 flex-shrink-0 ${activeTab === tab.id ? 'text-white' : 'text-zinc-500 group-hover:text-white'}`} />
                <span className="font-bold text-[11px] uppercase tracking-widest truncate">{tab.label}</span>
                {tab.badge > 0 && (
                  <span className="ml-auto bg-amber-500 text-white text-[9px] font-black w-5 h-5 flex items-center justify-center rounded-full flex-shrink-0">
                    {tab.badge}
                  </span>
                )}
              </button>
            ))}
          </nav>
          
          <div className="mt-auto pt-6 border-t border-white/5">
             <button 
                onClick={logout}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 font-bold rounded-xl transition-all"
             >
                <LogOut className="w-4 h-4" /> Logout
             </button>
          </div>
        </aside>

        {/* ─── MAIN CONTENT AREA ─── */}
        <main className="flex-1 p-4 md:p-8 pb-32 lg:pb-8 w-full min-w-0 max-w-[1600px] mx-auto">
          <header className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-6 mb-10">
            <div className="w-full xl:w-auto">
              <div className="flex lg:hidden items-center gap-4 mb-4">
                <button 
                  onClick={() => navigate('/')} 
                  className="px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-all text-[10px] font-black uppercase tracking-widest flex items-center gap-2"
                >
                  <ChevronRight className="w-3 h-3 rotate-180" /> Back
                </button>
                <button 
                  onClick={logout} 
                  className="px-3 py-1.5 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 hover:text-white hover:bg-red-500/30 transition-all text-[10px] font-black uppercase tracking-widest flex items-center gap-2 ml-auto"
                >
                  <LogOut className="w-3 h-3" /> Logout
                </button>
              </div>
              <div className="flex items-center gap-2 text-[10px] md:text-xs text-zinc-500 mb-2">
                <span>Active Event</span>
                <ChevronRight className="w-3 h-3" />
                <select 
                  value={selectedEventId || ''} 
                  onChange={(e) => handleEventSwitch(e.target.value)}
                  className="bg-transparent text-zinc-300 outline-none border-none cursor-pointer hover:text-white transition-colors"
                >
                  <option value="" className="bg-zinc-900">-- Back to Gallery --</option>
                  {myEvents.map(ev => <option key={ev.id} value={ev.id} className="bg-zinc-900">{ev.name}</option>)}
                </select>
              </div>
              <h1 className="text-2xl md:text-3xl font-black text-white uppercase tracking-tight lg:hidden">
                {eventData?.name || 'Loading Event...'}
              </h1>
              <h1 className="hidden lg:block text-2xl md:text-3xl font-black text-white uppercase tracking-tight">
                {tabs.find(t => t.id === activeTab)?.label || 'Dashboard'}
              </h1>
            </div>
            <div className="flex flex-wrap items-center gap-2 md:gap-3 w-full xl:w-auto">
              <button
                onClick={() => {
                  if (!selectedEventId) { alert('Select an event first'); return; }
                  const query = new URLSearchParams({
                      color: registrationDesign.themeColor.replace('#', '')
                  }).toString();
                  window.open(`/event/${selectedEventId}?${query}`, '_blank');
                }}
                className="flex-1 xl:flex-none px-3 md:px-4 py-2 bg-white/5 rounded-xl border border-white/10 hover:bg-white/10 transition-colors text-white text-[10px] md:text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2"
              >
                <ExternalLink className="w-3 h-3" /> <span className="hidden sm:inline">Preview</span>
              </button>
              <button className="flex-1 xl:flex-none px-3 md:px-4 py-2 bg-primary/10 text-primary border border-primary/20 rounded-xl text-[9px] md:text-[10px] font-black uppercase tracking-widest hover:bg-primary/20 transition-all flex items-center justify-center gap-2"
                onClick={() => setShowSpotRegistrationModal(true)}>
                <UserPlus className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Spot Reg</span>
              </button>
              <button className="btn-primary flex-1 xl:flex-none text-[10px] md:text-xs py-2 px-4" onClick={() => {
                if (!selectedEventId) { alert('Select an event first'); return; }
                saveLandingConfig(registrationDesign);
                alert('✅ Changes published! Your event page is now live.');
              }}>
                Publish
              </button>
            </div>
          </header>

          {/* ─── HORIZONTAL TABS (MOBILE ONLY) ─── */}
          <div className="flex lg:hidden gap-2 mb-8 bg-white/5 p-1.5 rounded-xl border border-white/10 overflow-x-auto no-scrollbar whitespace-nowrap scroll-smooth">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={`relative flex items-center gap-2 px-4 py-2.5 rounded-lg transition-all flex-shrink-0 ${
                  activeTab === tab.id 
                  ? 'bg-primary text-white shadow-lg' 
                  : 'text-zinc-500 hover:text-white hover:bg-white/5'
                }`}
              >
                <tab.icon className={`w-4 h-4 ${activeTab === tab.id ? 'text-white' : 'text-zinc-500'}`} />
                <span className="font-bold text-xs uppercase tracking-widest">{tab.label}</span>
                {tab.badge > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-amber-500 text-white text-[9px] font-black flex items-center justify-center border-2 border-bg-dark">{tab.badge}</span>
                )}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-12 gap-8">

          {/* ─── EVENT STATS OVERVIEW TAB ─── */}
          {activeTab === 'overview' && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="col-span-12 space-y-6">

              {/* KPI Row */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { label: 'Registrations', value: attendees.length, delta: '+12% vs last week', icon: Users, color: 'text-sky-400', bg: 'bg-sky-500/10 border-sky-500/20' },
                  { label: 'Checked In', value: attendees.filter(a => a.status === 'Checked In').length, delta: '66.7% rate', icon: CheckCircle, color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
                  { label: 'Approvals', value: pendingApprovals.filter(p => p.status === 'pending').length, delta: 'requires action', icon: Clock, color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' },
                  { label: 'Revenue', value: `₹${(attendees.reduce((sum, a) => {
                    const t = tickets.find(tk => tk.name === a.ticket);
                    const p = t ? parseInt(t.price.replace(/[^\d]/g, '')) || 0 : 0;
                    return sum + p;
                  }, 0)).toLocaleString()}`, delta: '+8% target', icon: TrendingUp, color: 'text-purple-400', bg: 'bg-purple-500/10 border-purple-500/20' },
                ].map((stat, i) => (
                  <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}
                    className={`glass-panel p-4 md:p-6 border ${stat.bg}`}>
                    <div className={`w-8 h-8 md:w-10 md:h-10 rounded-xl flex items-center justify-center ${stat.bg} mb-4`}>
                      <stat.icon className={`w-4 h-4 md:w-5 md:h-5 ${stat.color}`} />
                    </div>
                    <p className="text-[9px] md:text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1">{stat.label}</p>
                    <p className={`text-xl md:text-3xl font-black ${stat.color}`}>{stat.value}</p>
                    <p className="text-[9px] text-zinc-600 mt-1.5 font-bold">{stat.delta}</p>
                  </motion.div>
                ))}
              </div>

              {/* Funnel + Category Breakdown */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="col-span-2 glass-panel p-6">
                  <h3 className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-6 flex items-center gap-2">
                    <BarChart2 className="w-4 h-4 text-primary" /> Registration Funnel
                  </h3>
                  {[
                    { label: 'Page Visits',          value: 4820, color: 'bg-zinc-600' },
                    { label: 'Started Registration', value: attendees.length * 4, color: 'bg-sky-500' },
                    { label: 'Completed Form',       value: Math.floor(attendees.length * 2.5),  color: 'bg-primary' },
                    { label: 'Confirmed / Paid',     value: attendees.length,  color: 'bg-emerald-500' },
                    { label: 'Checked In',           value: attendees.filter(a => a.status === 'Checked In').length,  color: 'bg-amber-500' },
                  ].map((stage, i) => (
                    <div key={i} className="mb-5">
                      <div className="flex justify-between text-xs mb-1.5">
                        <span className="text-zinc-400 font-medium">{stage.label}</span>
                        <span className="text-white font-bold">{stage.value.toLocaleString()}</span>
                      </div>
                      <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                        <motion.div initial={{ width: 0 }} animate={{ width: `${(stage.value / 4820) * 100}%` }}
                          transition={{ duration: 0.8, delay: i * 0.1 }}
                          className={`h-full rounded-full ${stage.color}`} />
                      </div>
                      <p className="text-[10px] text-zinc-700 mt-1">{Math.round((stage.value / 4820) * 100)}% of visitors</p>
                    </div>
                  ))}
                </div>

                <div className="glass-panel p-6">
                  <h3 className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-6 flex items-center gap-2">
                    <Ticket className="w-4 h-4 text-amber-400" /> By Category
                  </h3>
                  <div className="space-y-5">
                    {tickets.map(ticket => {
                      const booked = ticket.bookedQty || 0;
                      const cap = ticket.qty || 1;
                      const pct = Math.round((booked / cap) * 100);
                      return (
                        <div key={ticket.id}>
                          <div className="flex justify-between text-xs mb-1.5">
                            <span className="text-zinc-300 font-medium truncate pr-2">{ticket.name}</span>
                            <span className="text-white font-black">{booked}</span>
                          </div>
                          <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                            <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.8 }}
                              className={`h-full rounded-full ${pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-primary'}`} />
                          </div>
                          <p className="text-[10px] text-zinc-600 mt-0.5">{pct}% of {cap} capacity</p>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-6 pt-4 border-t border-white/5">
                    <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Promo Redemptions</p>
                    <p className="text-2xl font-black text-primary">{discounts.reduce((s, d) => s + d.used, 0)}</p>
                    <p className="text-[10px] text-zinc-600">across all active codes</p>
                  </div>
                </div>
              </div>

              {/* Recent Registrations + Traffic Sources */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="glass-panel p-6">
                  <h3 className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-5 flex items-center gap-2">
                    <Users className="w-4 h-4 text-sky-400" /> Recent Registrations
                  </h3>
                  <div className="space-y-4">
                    {attendees.slice(0, 5).map((a, i) => (
                      <div key={i} className="flex items-center justify-between group">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary/30 to-purple-500/30 border border-white/10 flex items-center justify-center text-white text-xs font-black">
                            {(a.firstName || 'A')[0]}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-white">{a.firstName} {a.lastName}</p>
                            <p className="text-[10px] text-zinc-500">{a.email}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-bold border border-primary/20">{a.ticket || 'General'}</span>
                          <p className="text-[10px] text-zinc-600 mt-1">{a.registeredAt || '—'}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="glass-panel p-6">
                  <h3 className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-5 flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-emerald-400" /> Traffic Sources
                  </h3>
                  {[].map((src, i) => (
                    <div key={i} className="mb-5">
                      <div className="flex justify-between text-xs mb-1.5">
                        <span className="text-zinc-400 font-medium">{src.source}</span>
                        <span className="text-white font-bold">{src.count} <span className="text-zinc-600">({src.pct}%)</span></span>
                      </div>
                      <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                        <motion.div initial={{ width: 0 }} animate={{ width: `${src.pct}%` }} transition={{ duration: 0.8, delay: i * 0.1 }}
                          className={`h-full rounded-full ${src.color}`} />
                      </div>
                    </div>
                  ))}

                  <div className="mt-6 pt-4 border-t border-white/5 grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">Avg. Session</p>
                      <p className="text-xl font-black text-white">4m 32s</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">Bounce Rate</p>
                      <p className="text-xl font-black text-amber-400">34.2%</p>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'reg-designer' && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="col-span-12 grid grid-cols-12 gap-8">
                {/* Visual Controls */}
                <div className="col-span-4 space-y-6 overflow-y-auto max-h-[85vh] pr-4 custom-scrollbar">
                    <div className="glass-panel p-6 border-white/10">
                        <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                             <Palette className="w-5 h-5 text-primary" /> Global Theme
                        </h3>
                        
                        <div className="space-y-6">
                            <div className="flex gap-4">
                                <div className="flex-1">
                                    <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest block mb-3">Primary Color</label>
                                    <div className="flex gap-3">
                                        <input 
                                            type="color" 
                                            value={registrationDesign.themeColor} 
                                            onChange={e => setRegistrationDesign({...registrationDesign, themeColor: e.target.value})}
                                            className="w-10 h-10 rounded bg-transparent border-none cursor-pointer"
                                        />
                                        <input 
                                            type="text" 
                                            value={registrationDesign.themeColor} 
                                            onChange={e => setRegistrationDesign({...registrationDesign, themeColor: e.target.value})}
                                            className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 text-white font-mono text-[10px]"
                                        />
                                    </div>
                                </div>
                                <div className="flex-1">
                                    <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest block mb-3">Font Family</label>
                                    <select 
                                        value={registrationDesign.fontFamily}
                                        onChange={e => setRegistrationDesign({...registrationDesign, fontFamily: e.target.value})}
                                        className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-[10px] appearance-none"
                                    >
                                        <option value="Inter">Modern (Inter)</option>
                                        <option value="Outfit">Cinematic (Outfit)</option>
                                        <option value="Roboto">Corporate (Roboto)</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="glass-panel p-6 border-white/10">
                        <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                             <FileText className="w-5 h-5 text-indigo-400" /> Hero Content
                        </h3>
                        <div className="space-y-4">
                            <div>
                                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest block mb-2">Event Title</label>
                                <input 
                                    type="text" 
                                    value={registrationDesign.eventTitle}
                                    onChange={e => setRegistrationDesign({...registrationDesign, eventTitle: e.target.value})}
                                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-xs"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest block mb-2">Date String</label>
                                    <input 
                                        type="text" value={registrationDesign.eventDate}
                                        onChange={e => setRegistrationDesign({...registrationDesign, eventDate: e.target.value})}
                                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-white text-[10px]"
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest block mb-2">Location</label>
                                    <input 
                                        type="text" value={registrationDesign.eventLocation}
                                        onChange={e => setRegistrationDesign({...registrationDesign, eventLocation: e.target.value})}
                                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-white text-[10px]"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest block mb-2">Hero Narrative</label>
                                <textarea 
                                    value={registrationDesign.eventDesc}
                                    onChange={e => setRegistrationDesign({...registrationDesign, eventDesc: e.target.value})}
                                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-white text-xs h-24 resize-none"
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest block mb-2">Hero Image</label>
                                <div className="space-y-3">
                                   {registrationDesign.headerImage && (
                                       <div className="relative h-24 rounded-xl overflow-hidden border border-white/10">
                                          <img src={registrationDesign.headerImage} alt="Hero" className="w-full h-full object-cover" />
                                       </div>
                                   )}
                                   <label className="flex flex-col items-center justify-center p-3 border border-dashed border-white/10 rounded-xl hover:bg-white/5 cursor-pointer transition-all">
                                      <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Upload Custom Image</span>
                                      <input type="file" accept="image/png, image/jpeg, image/webp" className="hidden" onChange={(e) => {
                                         const file = e.target.files[0];
                                         if(file) {
                                            const reader = new FileReader();
                                            reader.onload = evt => setRegistrationDesign({...registrationDesign, headerImage: evt.target.result});
                                            reader.readAsDataURL(file);
                                         }
                                      }} />
                                   </label>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="glass-panel p-6 border-white/10">
                        <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                             <LayoutDashboard className="w-5 h-5 text-emerald-400" /> Page Layout Sections
                        </h3>
                        <div className="grid grid-cols-2 gap-3">
                            {Object.entries(registrationDesign.sections).map(([id, enabled]) => (
                                <button 
                                    key={id}
                                    onClick={() => setRegistrationDesign({...registrationDesign, sections: {...registrationDesign.sections, [id]: !enabled}})}
                                    className={`p-3 rounded-xl border text-[10px] font-bold uppercase tracking-widest transition-all ${
                                        enabled ? 'bg-primary/20 border-primary/40 text-primary' : 'bg-white/5 border-white/5 text-zinc-500 hover:border-white/10'
                                    }`}
                                >
                                    {id}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="p-6 rounded-3xl bg-indigo-600/20 border border-indigo-500/30">
                        <div className="flex items-center justify-between mb-4">
                             <h3 className="font-bold text-white flex items-center gap-2">
                                <Code className="w-5 h-5" /> Embed Studio
                             </h3>
                        </div>
                        <div className="space-y-3">
                             <button
                                onClick={() => {
                                    if (!selectedEventId) { alert('Select an event first'); return; }
                                    const code = `<iframe src="${window.location.origin}/event/${selectedEventId}?embed=true" width="100%" height="700px" frameborder="0" style="border-radius:24px;"></iframe>`;
                                    navigator.clipboard.writeText(code);
                                    alert("Iframe Code Copied!");
                                }}
                                className="w-full btn-primary py-2 text-[10px] font-black uppercase tracking-widest"
                             >
                                Copy Standard Iframe
                             </button>
                             <button
                                onClick={() => {
                                    if (!selectedEventId) { alert('Select an event first'); return; }
                                    const code = `<iframe src="${window.location.origin}/event/${selectedEventId}?embed=true" width="100%" height="700px" frameborder="0" style="border-radius:24px;" id="event-reg-widget"></iframe>`;
                                    navigator.clipboard.writeText(code);
                                    alert("JS Snippet Copied!");
                                }}
                                className="w-full bg-white/5 hover:bg-white/10 py-2 border border-white/10 text-[10px] font-bold text-zinc-400 uppercase tracking-widest rounded-xl transition-all"
                             >
                                Copy JS Snippet (Auto-Sizer)
                             </button>
                        </div>
                    </div>
                </div>

                {/* Device Simulation Area */}
                <div className="col-span-8 flex flex-col h-[85vh] perspective-1000">
                    <div className="flex justify-between items-center mb-6 px-4">
                        <div className="flex items-center gap-6">
                             <button
                                onClick={() => setPreviewMode('desktop')}
                                className={`flex items-center gap-2 px-4 py-2 rounded-full border transition-all ${previewMode === 'desktop' ? 'bg-primary/20 border-primary/40 text-primary' : 'bg-white/5 border-white/10 text-zinc-500 hover:bg-white/10'}`}
                             >
                                 <Monitor className="w-4 h-4" />
                                 <span className="text-[10px] font-black uppercase tracking-widest">Desktop</span>
                             </button>
                             <button
                                onClick={() => setPreviewMode('mobile')}
                                className={`flex items-center gap-2 px-4 py-2 rounded-full border transition-all ${previewMode === 'mobile' ? 'bg-primary/20 border-primary/40 text-primary' : 'bg-white/5 border-white/10 text-zinc-500 hover:bg-white/10'}`}
                             >
                                 <Phone className="w-4 h-4" />
                                 <span className="text-[10px] font-black uppercase tracking-widest">Mobile</span>
                             </button>
                        </div>
                        <div className="flex items-center gap-2 text-zinc-500 text-[10px] font-bold uppercase tracking-widest bg-zinc-900/50 px-4 py-2 rounded-full">
                             <RefreshCw className="w-3 h-3 text-emerald-400 animate-spin-slow" /> Auto-synced
                        </div>
                    </div>

                    <div className={`flex-1 rounded-[3rem] bg-zinc-900 border-[16px] border-zinc-800 shadow-3xl overflow-hidden relative group mx-auto transition-all ${previewMode === 'mobile' ? 'max-w-[375px]' : 'w-full'}`}>
                         {/* Full Page Content Scroller */}
                         <div className="absolute inset-0 overflow-y-auto custom-scrollbar-thin bg-[#050505]">
                            <div className="min-h-full" style={{ fontFamily: registrationDesign.fontFamily }}>
                                {/* Hero Section */}
                                <div className={`relative overflow-hidden ${previewMode === 'mobile' ? 'h-[500px]' : 'h-[450px]'}`}>
                                    <div className="absolute inset-0 z-10" style={{ background: `linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(5,5,5,1) 100%), rgba(0,0,0,${registrationDesign.headerOverlay/100})` }}></div>
                                    <motion.img
                                        key={registrationDesign.headerImage}
                                        initial={{ scale: 1.1, opacity: 0 }} animate={{ scale: 1, opacity: 0.8 }}
                                        src={registrationDesign.headerImage}
                                        className="w-full h-full object-cover"
                                    />
                                    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center p-12 text-center">
                                        <motion.h1 className={`font-black text-white mb-6 uppercase tracking-tighter leading-none ${previewMode === 'mobile' ? 'text-3xl' : 'text-5xl'}`}>{registrationDesign.eventTitle || eventData?.name}</motion.h1>
                                        <div className={`flex items-center mb-8 ${previewMode === 'mobile' ? 'flex-col gap-3' : 'gap-8'}`}>
                                            <div className="flex items-center gap-2 text-zinc-300">
                                                <Calendar className="w-4 h-4 text-primary" /> <span className="text-xs font-bold uppercase">{registrationDesign.eventDate || eventData?.date}</span>
                                            </div>
                                            <div className="flex items-center gap-2 text-zinc-300">
                                                <MapPin className="w-4 h-4 text-primary" /> <span className="text-xs font-bold uppercase">{registrationDesign.eventLocation || eventData?.location}</span>
                                            </div>
                                        </div>
                                        <button className="px-8 py-4 rounded-full font-black uppercase text-sm tracking-widest transition-all" style={{ backgroundColor: registrationDesign.themeColor, color: '#fff', boxShadow: `0 10px 40px ${registrationDesign.themeColor}40` }}>
                                            Register Now
                                        </button>
                                    </div>
                                </div>

                                {/* About Section (Conditional) */}
                                {registrationDesign.sections.about && (
                                    <div className={`border-b border-white/5 ${previewMode === 'mobile' ? 'px-6 py-12' : 'px-20 py-24'}`}>
                                        <div className="grid grid-cols-12 gap-12">
                                            <div className="col-span-12">
                                                <h2 className="text-[10px] font-black text-primary uppercase tracking-[0.4em] mb-4">Event Narrative</h2>
                                                <p className={`font-bold text-white leading-relaxed ${previewMode === 'mobile' ? 'text-lg' : 'text-2xl'}`}>{registrationDesign.eventDesc || eventData?.description}</p>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Agenda Section (Conditional) */}
                                {registrationDesign.sections.agenda && (
                                    <div className={`border-b border-white/5 ${previewMode === 'mobile' ? 'px-6 py-12' : 'px-20 py-24'}`}>
                                        <h2 className="text-[10px] font-black text-primary uppercase tracking-[0.4em] mb-6">Agenda</h2>
                                        <div className="space-y-4">
                                            {[1,2,3].map(i => (
                                                <div key={i} className="p-4 bg-white/5 rounded-xl border border-white/10 flex items-center gap-4">
                                                    <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-xs">{i}</div>
                                                    <div className="flex-1">
                                                        <div className="h-3 bg-white/10 rounded w-3/4 mb-2" />
                                                        <div className="h-2 bg-white/5 rounded w-1/2" />
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Speakers Section (Conditional) */}
                                {registrationDesign.sections.speakers && (
                                    <div className={`border-b border-white/5 ${previewMode === 'mobile' ? 'px-6 py-12' : 'px-20 py-24'}`}>
                                        <h2 className="text-[10px] font-black text-primary uppercase tracking-[0.4em] mb-6">Speakers</h2>
                                        <div className={`grid gap-6 ${previewMode === 'mobile' ? 'grid-cols-1' : 'grid-cols-3'}`}>
                                            {[1,2,3].map(i => (
                                                <div key={i} className="p-4 bg-white/5 rounded-xl border border-white/10 text-center">
                                                    <div className="w-16 h-16 rounded-full bg-white/10 mx-auto mb-3" />
                                                    <div className="h-3 bg-white/10 rounded w-2/3 mx-auto mb-2" />
                                                    <div className="h-2 bg-white/5 rounded w-1/2 mx-auto" />
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Sponsors Section (Conditional) */}
                                {registrationDesign.sections.sponsors && (
                                    <div className={`${previewMode === 'mobile' ? 'px-6 py-12' : 'px-20 py-24'}`}>
                                        <h2 className="text-[10px] font-black text-primary uppercase tracking-[0.4em] mb-6">Sponsors</h2>
                                        <div className="flex flex-wrap justify-center gap-6">
                                            {[1,2,3,4].map(i => (
                                                <div key={i} className="w-24 h-12 bg-white/5 rounded-lg border border-white/10" />
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                         </div>

                         <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-6">
                              <div className="w-32 h-1 bg-zinc-700/50 rounded-full"></div>
                         </div>
                    </div>
                </div>
            </motion.div>
          )}

          {activeTab === 'forms' && (
              <>
                <div className="col-span-8 space-y-4">
                  <div className="glass-panel p-6">
                    <div className="flex items-center justify-between mb-6">
                      <h3 className="text-lg font-semibold text-white">Registration Form Structure</h3>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => saveFormFields(formFields)}
                          className="px-3 py-1.5 bg-primary/20 text-primary text-xs font-bold rounded-lg hover:bg-primary/30 transition-colors flex items-center gap-1"
                        >
                          <Save className="w-3.5 h-3.5" /> Save
                        </button>
                        <button
                          onClick={openAddField}
                          className="text-primary text-sm flex items-center gap-1 hover:underline"
                        >
                          <Plus className="w-4 h-4" /> Add Field
                        </button>
                      </div>
                    </div>

                    <div className="space-y-3">
                      {formFields.map((field, i) => {
                        const FieldIcon = getIconByName(field.iconName);
                        const typeLabel = fieldTypeOptions.find(t => t.value === field.type)?.label || field.type;
                        return (
                          <motion.div
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.05 }}
                            key={field.id}
                            className="p-4 bg-white/5 border border-white/10 rounded-xl group hover:border-primary/30 transition-all"
                          >
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center gap-4">
                                <div className="w-8 h-8 rounded bg-zinc-800 flex items-center justify-center text-zinc-500">
                                  <FieldIcon className="w-4 h-4" />
                                </div>
                                <div>
                                  <span className="font-bold text-white block">{field.name}</span>
                                  <span className="text-[10px] text-zinc-400 uppercase font-black tracking-widest">{typeLabel}</span>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                  onClick={() => moveField(i, 'up')}
                                  disabled={i === 0}
                                  className="p-1.5 hover:bg-white/10 rounded text-zinc-400 disabled:opacity-30"
                                  title="Move up"
                                >
                                  <ChevronUp className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => moveField(i, 'down')}
                                  disabled={i === formFields.length - 1}
                                  className="p-1.5 hover:bg-white/10 rounded text-zinc-400 disabled:opacity-30"
                                  title="Move down"
                                >
                                  <ChevronDown className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => openEditField(field)}
                                  className="p-1.5 hover:bg-white/10 rounded text-zinc-400"
                                  title="Edit field"
                                >
                                  <Settings className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => deleteFormField(field.id)}
                                  className="p-1.5 hover:bg-red-500/10 rounded text-red-400"
                                  title="Delete field"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                            <div className="flex items-center gap-4 pl-12">
                              <div className="flex-1">
                                <p className="text-[10px] font-bold text-zinc-600 uppercase mb-1">Assigned To Ticket</p>
                                <select
                                  className="w-full bg-transparent border-none text-xs text-primary font-bold p-0 focus:ring-0 cursor-pointer"
                                  value={field.ticketIds?.[0] || 'all'}
                                  onChange={(e) => {
                                    const next = formFields.map(f => f.id === field.id ? { ...f, ticketIds: [e.target.value] } : f);
                                    setFormFields(next);
                                    saveFormFields(next);
                                  }}
                                >
                                  <option className="bg-bg-dark" value="all">All Tickets</option>
                                  {tickets.map(t => (
                                    <option key={t.id} className="bg-bg-dark" value={t.id}>{t.name}</option>
                                  ))}
                                </select>
                              </div>
                              <div className="flex-1">
                                <p className="text-[10px] font-bold text-zinc-600 uppercase mb-1">Required</p>
                                <button
                                  onClick={() => {
                                    const next = formFields.map(f => f.id === field.id ? { ...f, required: !f.required } : f);
                                    setFormFields(next);
                                    saveFormFields(next);
                                  }}
                                  className={`text-xs px-2 py-1 rounded font-bold transition-colors ${field.required ? 'bg-emerald-500/10 text-emerald-400' : 'bg-white/5 text-zinc-500'}`}
                                >
                                  {field.required ? 'Required' : 'Optional'}
                                </button>
                              </div>
                              {field.type === 'image' && (
                                <div className="flex-1 border-l border-white/5 pl-4 ml-4">
                                  <p className="text-[10px] font-bold text-indigo-400 uppercase mb-1 flex items-center gap-1">
                                    <Cpu className="w-3 h-3" /> AI extraction
                                  </p>
                                  <div className="flex flex-wrap gap-1">
                                    {['Name', 'Email', 'Phone', 'Company', 'Designation'].map(data => (
                                      <button
                                        key={data}
                                        onClick={() => {
                                          const current = field.aiExtract || [];
                                          const nextArr = current.includes(data) ? current.filter(d => d !== data) : [...current, data];
                                          const next = formFields.map(f => f.id === field.id ? { ...f, aiExtract: nextArr } : f);
                                          setFormFields(next);
                                          saveFormFields(next);
                                        }}
                                        className={`px-2 py-0.5 border text-[9px] font-bold rounded transition-all uppercase ${(field.aiExtract || []).includes(data) ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-300' : 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400 hover:bg-indigo-500/20'}`}
                                      >
                                        {data}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className="col-span-4 space-y-6">
                  <div className="glass-card p-6">
                    <h4 className="font-semibold mb-4 text-sm uppercase tracking-wider text-zinc-500">Live Preview</h4>
                    <div className="p-4 bg-black/40 rounded-xl border border-white/5 aspect-[3/4] overflow-y-auto">
                      <div className="w-full h-12 bg-primary/20 rounded-lg mb-6 flex items-center justify-center">
                        <span className="text-primary font-bold text-xs">HEADER LOGO</span>
                      </div>
                      <div className="space-y-3">
                        {formFields.map((field) => {
                          const FieldIcon = getIconByName(field.iconName);
                          return (
                            <div key={field.id} className="space-y-1">
                              <label className="text-[10px] font-bold text-zinc-400 uppercase flex items-center gap-1">
                                {field.name} {field.required && <span className="text-red-400">*</span>}
                              </label>
                              {field.type === 'camera' && (
                                <div className="h-24 bg-zinc-800/50 rounded-lg border border-dashed border-white/10 flex flex-col items-center justify-center gap-1">
                                  <Camera className="w-5 h-5 text-zinc-500" />
                                  <span className="text-[9px] text-zinc-500 font-bold uppercase">Take Photo</span>
                                </div>
                              )}
                              {field.type === 'image' && (
                                <div className="h-24 bg-zinc-800/50 rounded-lg border border-dashed border-white/10 flex flex-col items-center justify-center gap-1">
                                  <ImageIcon className="w-5 h-5 text-zinc-500" />
                                  <span className="text-[9px] text-zinc-500 font-bold uppercase">Upload Image</span>
                                </div>
                              )}
                              {field.type === 'pdf' && (
                                <div className="h-24 bg-zinc-800/50 rounded-lg border border-dashed border-white/10 flex flex-col items-center justify-center gap-1">
                                  <FileText className="w-5 h-5 text-zinc-500" />
                                  <span className="text-[9px] text-zinc-500 font-bold uppercase">Upload PDF</span>
                                </div>
                              )}
                              {field.type === 'textarea' && (
                                <div className="h-16 bg-zinc-800/50 rounded-lg border border-white/10" />
                              )}
                              {field.type === 'select' && (
                                <div className="h-8 bg-zinc-800/50 rounded-lg border border-white/10 flex items-center px-3">
                                  <span className="text-xs text-zinc-500">Select option...</span>
                                </div>
                              )}
                              {field.type === 'checkbox' && (
                                <div className="flex items-center gap-2 py-1">
                                  <div className="w-4 h-4 rounded border border-white/20" />
                                  <span className="text-xs text-zinc-500">Option</span>
                                </div>
                              )}
                              {['text','email','phone','number','date'].includes(field.type) && (
                                <div className="h-8 bg-zinc-800/50 rounded-lg border border-white/10 flex items-center px-3 gap-2">
                                  <FieldIcon className="w-3 h-3 text-zinc-600" />
                                  <span className="text-xs text-zinc-600">
                                    {field.type === 'email' ? 'email@example.com' :
                                     field.type === 'phone' ? '+1 234 567 890' :
                                     field.type === 'date' ? 'YYYY-MM-DD' :
                                     field.type === 'number' ? '0' : 'Type here...'}
                                  </span>
                                </div>
                              )}
                            </div>
                          );
                        })}
                        <div className="h-10 bg-primary rounded-lg mt-6 flex items-center justify-center">
                          <span className="text-white font-bold text-xs uppercase tracking-wider">Register</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Add/Edit Field Modal */}
                {showFieldModal && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="glass-panel w-full max-w-md p-6 border border-white/10"
                    >
                      <h3 className="text-lg font-semibold text-white mb-4">
                        {editingFieldId ? 'Edit Field' : 'Add Field'}
                      </h3>
                      <div className="space-y-4">
                        <div>
                          <label className="text-xs font-bold text-zinc-500 uppercase mb-1 block">Field Label</label>
                          <input
                            type="text"
                            value={newField.name}
                            onChange={(e) => setNewField({ ...newField, name: e.target.value })}
                            className="w-full bg-zinc-800/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-primary focus:outline-none"
                            placeholder="e.g. Company Name"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-bold text-zinc-500 uppercase mb-1 block">Field Type</label>
                          <select
                            value={newField.type}
                            onChange={(e) => {
                              const typeOpt = fieldTypeOptions.find(t => t.value === e.target.value);
                              setNewField({ ...newField, type: e.target.value, iconName: typeOpt ? typeOpt.iconName : newField.iconName });
                            }}
                            className="w-full bg-zinc-800/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-primary focus:outline-none"
                          >
                            {fieldTypeOptions.map(opt => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                        </div>
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-bold text-zinc-500 uppercase">Required</label>
                          <button
                            onClick={() => setNewField({ ...newField, required: !newField.required })}
                            className={`w-10 h-5 rounded-full relative transition-colors ${newField.required ? 'bg-primary' : 'bg-zinc-700'}`}
                          >
                            <div className={`w-3 h-3 bg-white rounded-full absolute top-1 transition-all ${newField.required ? 'left-6' : 'left-1'}`} />
                          </button>
                        </div>
                        <div>
                          <label className="text-xs font-bold text-zinc-500 uppercase mb-1 block">Assigned Ticket</label>
                          <select
                            value={newField.ticketIds?.[0] || 'all'}
                            onChange={(e) => setNewField({ ...newField, ticketIds: [e.target.value] })}
                            className="w-full bg-zinc-800/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-primary focus:outline-none"
                          >
                            <option value="all">All Tickets</option>
                            {tickets.map(t => (
                              <option key={t.id} value={t.id}>{t.name}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div className="flex justify-end gap-3 mt-6">
                        <button
                          onClick={() => { setShowFieldModal(false); setEditingFieldId(null); }}
                          className="px-4 py-2 text-xs font-bold text-zinc-400 hover:text-white transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={addFormField}
                          className="px-4 py-2 bg-primary text-white text-xs font-bold rounded-lg hover:bg-primary/80 transition-colors"
                        >
                          {editingFieldId ? 'Save Changes' : 'Add Field'}
                        </button>
                      </div>
                    </motion.div>
                  </div>
                )}
              </>
            )}

            {activeTab === 'marketing' && (
              <div className="col-span-12 space-y-6">
                <div className="grid grid-cols-3 gap-6">
                  <div className="glass-panel p-6 border-none bg-white/5">
                    <h4 className="text-zinc-500 text-xs font-bold uppercase mb-4 tracking-widest">Total Registrations</h4>
                    <p className="text-3xl font-bold text-white">{attendees.length}</p>
                  </div>
                  <div className="glass-panel p-6 border-l-4 border-l-primary bg-white/5 border-t-0 border-r-0 border-b-0">
                    <h4 className="text-zinc-500 text-xs font-bold uppercase mb-4 tracking-widest">Checked In</h4>
                    <p className="text-3xl font-bold text-white">{attendees.filter(a => a.status === 'checked-in').length}</p>
                  </div>
                  <div className="glass-panel p-6 border-none bg-white/5">
                    <h4 className="text-zinc-500 text-xs font-bold uppercase mb-4 tracking-widest">Pending Approvals</h4>
                    <p className="text-3xl font-bold text-white">{pendingApprovals.filter(p => p.status === 'pending').length}</p>
                  </div>
                </div>

                <div className="glass-panel p-6">
                  <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-bold text-white">Campaigns</h2>
                    <button onClick={() => handleTabChange('automation')}
                      className="btn-primary py-2 text-sm flex items-center gap-2">
                      <Zap className="w-4 h-4" /> Manage in Automation
                    </button>
                  </div>
                  <p className="text-zinc-500 text-sm">Campaign management has moved to the <button onClick={() => handleTabChange('automation')} className="text-primary hover:underline">Automation tab</button>. Configure email triggers, templates, and auto-responders there.</p>
                </div>
              </div>
            )}

            {activeTab === 'speakers' && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="col-span-12">
                <SpeakerManager
                    eventId={selectedEventId}
                    onSpeakerAdded={async (speaker) => {
                        if (speaker.generatePass) {
                            const id = 'SPK-' + Math.random().toString(36).substr(2, 6).toUpperCase();
                            const newStaffPass = {
                                eventId: selectedEventId,
                                name: speaker.name,
                                email: speaker.email || `${speaker.name.replace(/\s+/g, '').toLowerCase()}@speaker.local`,
                                role: 'speaker',
                                company: speaker.company || 'Guest Speaker',
                                zone: 'all-access',
                                status: 'issued',
                                issuedAt: new Date().toISOString().split('T')[0],
                                id
                            };
                            try {
                                const docRef = await addDoc(collection(db, "staffPasses"), newStaffPass);
                                setStaffPasses(prev => [...prev, { ...newStaffPass, firestoreId: docRef.id }]);
                                // Speaker pass generated
                            } catch (error) {
                                console.error("Error creating speaker pass:", error);
                                console.error("Failed to generate speaker pass");
                            }
                        }
                    }} 
                />
              </motion.div>
            )}

            {activeTab === 'exhibitors' && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="col-span-12">
                <ExhibitorManager eventId={selectedEventId} />
              </motion.div>
            )}

            {activeTab === 'agendas' && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="col-span-12">
                <AgendaManager eventId={selectedEventId} />
              </motion.div>
            )}

            {activeTab === 'devices' && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="col-span-12">
                <DeviceManager embedded={true} />
              </motion.div>
            )}

            {activeTab === 'tv-designer' && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="col-span-12">
                 <div className="flex justify-between items-center mb-6">
                    <div>
                       <h2 className="text-2xl font-black text-white uppercase tracking-tight">TV UI Studio</h2>
                       <p className="text-zinc-400 text-sm mt-1">Design and push layouts to your connected Jumbotron displays.</p>
                    </div>
                 </div>
                 <WelcomeTVDesigner embedded={true} />
              </motion.div>
            )}

            {activeTab === 'attendees' && (
              <div className="col-span-12 space-y-6">
                <div className="glass-panel p-6">
                  <div className="flex justify-between items-center mb-8">
                      <h2 className="text-xl font-bold text-white">Attendee Directory</h2>
                      <div className="flex gap-3">
                          <button onClick={exportAttendeesExcel} className="p-2.5 glass-card border-white/10 text-zinc-400 hover:text-green-400 hover:bg-green-500/10 transition-all flex items-center gap-2 px-4 group">
                              <Download className="w-4 h-4 group-hover:-translate-y-0.5 transition-transform" />
                              <span className="text-xs font-bold uppercase tracking-widest">Export Excel</span>
                          </button>
                      </div>
                  </div>

                  <div className="flex gap-4 mb-6">
                      <div className="flex-1 relative">
                          <input 
                              type="text" 
                              placeholder="Search by name, email or company..." 
                              className="w-full input-base pl-10 h-10 text-sm"
                              value={searchTerm}
                              onChange={(e) => setSearchTerm(e.target.value)}
                          />
                           <div className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500">
                              <Users className="w-4 h-4" />
                          </div>
                      </div>
                      <select className="input-base py-0 px-4 h-10 text-sm bg-bg-dark border-white/10">
                          <option>All Status</option>
                          <option>Registered</option>
                          <option>Checked In</option>
                      </select>
                  </div>

                  <table className="w-full text-left">
                      <thead>
                          <tr className="text-zinc-500 text-xs uppercase border-b border-white/5">
                          <th className="pb-4">Name</th>
                          <th className="pb-4">Company</th>
                          <th className="pb-4">Ticket</th>
                          <th className="pb-4">Registration Date</th>
                          <th className="pb-4">Status</th>
                          <th className="pb-4 text-right">Actions</th>
                          </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                          {attendees.filter(a => (a.firstName?.toLowerCase() || '').includes(searchTerm.toLowerCase()) || (a.lastName?.toLowerCase() || '').includes(searchTerm.toLowerCase()) || (a.email?.toLowerCase() || '').includes(searchTerm.toLowerCase()) || (a.phone || '').includes(searchTerm) || (a.company?.toLowerCase() || '').includes(searchTerm.toLowerCase())).map(attendee => (
                          <tr key={attendee.email} className="group hover:bg-white/[0.02]">
                              <td className="py-4">
                                  <div className="font-medium text-white">{attendee.firstName} {attendee.lastName}</div>
                                  <div className="text-xs text-zinc-500">{attendee.email}</div>
                              </td>
                              <td className="py-4 text-sm text-zinc-400">{attendee.company}</td>
                              <td className="py-4 text-sm">
                                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                      attendee.ticket === 'VIP' ? 'bg-purple-500/20 text-purple-400' : 'bg-blue-500/20 text-blue-400'
                                  }`}>
                                      {attendee.ticket}
                                  </span>
                              </td>
                              <td className="py-4 text-sm text-zinc-500">{attendee.registeredAt}</td>
                              <td className="py-4">
                              <span className={`text-[10px] px-2 py-1 rounded-full font-bold inline-flex items-center gap-1 ${
                                  attendee.status === 'Checked In' ? 'bg-green-500/10 text-green-400' : 'bg-primary/10 text-primary'
                              }`}>
                                  {attendee.status}
                              </span>
                              </td>
                              <td className="py-4 text-right">
                                  <div className="flex justify-end gap-1">
                                      <button className="p-2 hover:bg-white/10 rounded-lg text-zinc-500 hover:text-white transition-all">
                                          <Settings className="w-4 h-4" />
                                      </button>
                                      <button 
                                          onClick={() => deleteAttendee(attendee.id)}
                                          className="p-2 hover:bg-red-500/10 rounded-lg text-zinc-500 hover:text-red-400 transition-all"
                                          title="Delete Attendee"
                                      >
                                          <Trash2 className="w-4 h-4" />
                                      </button>
                                  </div>
                              </td>
                          </tr>
                          ))}
                      </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          <AnimatePresence>
            {activeTab === 'notifications' && (
                <NotificationCenter 
                    isOpen={true} 
                    onClose={() => setActiveTab('forms')} 
                />
            )}
          </AnimatePresence>

          {activeTab === 'tickets' && (
            <div className="col-span-12 space-y-6">
              <div className="glass-panel p-6">
                <div className="flex justify-between items-center mb-8">
                    <div>
                        <h2 className="text-xl font-bold text-white">Ticketing & Category Matrix</h2>
                        <p className="text-sm text-zinc-500">Manage entry passes, category types, pricing, and capacity.</p>
                    </div>
                    <button onClick={() => setShowNewTicketModal(true)} className="btn-primary py-2 text-sm flex items-center gap-2">
                        <Plus className="w-4 h-4" /> Create Ticket
                    </button>
                </div>

                <div className="grid grid-cols-1 gap-4">
                    {tickets.map(ticket => {
                        const cap = ticket.qty || 1;
                        const booked = ticket.bookedQty || 0;
                        const pct = Math.min(100, Math.round((booked / cap) * 100));
                        const soldOut = booked >= cap;
                        const typeCfg = categoryTypeConfig[ticket.categoryType] || categoryTypeConfig.standard;
                        return (
                        <div key={ticket.id} className="p-5 glass-card bg-white/5 border border-white/10 rounded-xl group hover:border-primary/30 transition-all">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-6">
                                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold bg-gradient-to-br ${
                                      ticket.type === 'Public' ? 'from-green-500/20 to-blue-500/20 text-green-400' : 'from-purple-500/20 to-pink-500/20 text-purple-400'
                                  }`}>
                                      <Ticket className="w-5 h-5" />
                                  </div>
                                  <div>
                                      <h3 className="font-bold text-white text-lg flex items-center gap-2">
                                          {ticket.name}
                                          <span className={`text-[10px] uppercase px-2 py-0.5 rounded border ${typeCfg.color}`}>{typeCfg.label}</span>
                                          {soldOut && <span className="text-[10px] uppercase px-2 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20">Sold Out</span>}
                                      </h3>
                                      <p className="text-sm text-zinc-500">{ticket.description}</p>
                                  </div>
                              </div>
                              <div className="flex items-center gap-8">
                                  <div className="text-right">
                                      <p className="text-xs text-zinc-500 uppercase font-bold tracking-widest mb-1">Price</p>
                                      <p className="text-lg font-bold text-white">{ticket.price}</p>
                                  </div>
                                  <div className="text-right">
                                      <p className="text-xs text-zinc-500 uppercase font-bold tracking-widest mb-1">Capacity</p>
                                      <p className="text-lg font-bold text-white">{booked} / {cap}</p>
                                  </div>
                                  <button
                                      onClick={() => {
                                          if (window.confirm(`Delete ticket "${ticket.name}"? This will remove it from the public registration page.`)) {
                                              deleteTicket(ticket.id);
                                          }
                                      }}
                                      className="p-2 text-zinc-500 hover:text-red-400 transition-all opacity-0 group-hover:opacity-100"
                                      title="Delete ticket"
                                  >
                                      <Trash2 className="w-5 h-5" />
                                  </button>
                              </div>
                            </div>
                            <div className="mt-4 ml-18">
                              <div className="flex justify-between text-[10px] text-zinc-600 font-bold uppercase tracking-widest mb-1.5">
                                <span>Capacity Used</span><span>{pct}%</span>
                              </div>
                              <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                                <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.8 }}
                                  className={`h-full rounded-full ${ pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-emerald-500' }`} />
                              </div>
                            </div>
                        </div>);
                    })}
                </div>
              </div>

              {/* New Ticket Modal */}
              <AnimatePresence>
                {showNewTicketModal && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-6"
                    onClick={e => e.target === e.currentTarget && setShowNewTicketModal(false)}>
                    <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
                      className="bg-zinc-900 border border-white/10 rounded-3xl p-8 w-full max-w-lg shadow-2xl">
                      <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-3"><Ticket className="w-5 h-5 text-primary" /> New Ticket Category</h2>
                      <div className="space-y-4">
                        <div>
                          <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block mb-2">Ticket Name</label>
                          <input value={newTicket.name} onChange={e => setNewTicket(t => ({ ...t, name: e.target.value }))}
                            placeholder="e.g. VIP Executive Pass" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-primary/50 transition-colors" />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block mb-2">Category Type</label>
                          <div className="grid grid-cols-3 gap-3">
                            {Object.entries(categoryTypeConfig).map(([key, cfg]) => (
                              <button key={key} type="button" onClick={() => setNewTicket(t => ({ ...t, categoryType: key }))}
                                className={`p-3 rounded-xl border text-xs font-bold transition-all ${ newTicket.categoryType === key ? cfg.color : 'bg-white/5 border-white/10 text-zinc-500 hover:border-white/20' }`}>
                                {cfg.label}
                              </button>
                            ))}
                            {isAddingCustomCategory ? (
                                <div className="flex flex-col gap-1 p-2 border border-primary/50 rounded-xl bg-primary/5">
                                   <input type="text" autoFocus value={customCategoryInput} onChange={e => setCustomCategoryInput(e.target.value)} onKeyDown={e => {
                                      if(e.key === 'Enter' && customCategoryInput) {
                                         e.preventDefault();
                                         const newKey = customCategoryInput.toLowerCase().replace(/[^a-z0-9]/g, '');
                                         setCategoryTypeConfig(prev => ({ ...prev, [newKey]: { label: customCategoryInput, color: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20' } }));
                                         setNewTicket(t => ({ ...t, categoryType: newKey }));
                                         setIsAddingCustomCategory(false);
                                         setCustomCategoryInput('');
                                      } else if (e.key === 'Escape') {
                                         setIsAddingCustomCategory(false);
                                      }
                                   }} className="w-full bg-transparent text-xs text-white px-1 outline-none" placeholder="Type name & hit Enter..." />
                                </div>
                            ) : (
                                <button type="button" onClick={() => setIsAddingCustomCategory(true)} className="p-3 rounded-xl border border-dashed border-white/20 bg-transparent text-white/50 hover:text-white hover:border-white text-xs font-bold transition-all">
                                    + Custom Type
                                </button>
                            )}
                          </div>
                          <p className="text-[10px] text-zinc-600 mt-2">
                            {newTicket.categoryType === 'rsvp' && '📨 Invite-only — guests accept/decline invitations.'}
                            {newTicket.categoryType === 'approval' && '⏳ Approval Required — host must approve each registration.'}
                            {newTicket.categoryType === 'standard' && '🎟 Open registration — anyone can register directly.'}
                          </p>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block mb-2">Price</label>
                            <input value={newTicket.price} onChange={e => setNewTicket(t => ({ ...t, price: e.target.value }))}
                              placeholder="Free or $299" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-primary/50" />
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block mb-2">Total Capacity</label>
                            <input type="number" value={newTicket.qty} onChange={e => setNewTicket(t => ({ ...t, qty: parseInt(e.target.value) || 100 }))}
                              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-primary/50" />
                          </div>
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block mb-2">Internal Category / Role</label>
                          <select value={newTicket.categoryType} onChange={e => setNewTicket(t => ({ ...t, categoryType: e.target.value }))}
                            className="w-full bg-zinc-800 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-primary/50">
                            {Object.entries(categoryTypeConfig).map(([id, cfg]) => (
                                <option key={id} value={id}>{cfg.label}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block mb-2">Visibility Style</label>
                          <input value={newTicket.description} onChange={e => setNewTicket(t => ({ ...t, description: e.target.value }))}
                            placeholder="Short description of this ticket" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-primary/50" />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block mb-2">Visibility</label>
                          <select value={newTicket.type} onChange={e => setNewTicket(t => ({ ...t, type: e.target.value }))}
                            className="w-full bg-zinc-800 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-primary/50">
                            <option value="Public">Public — visible on landing page</option>
                            <option value="Private">Private — hidden, invite-only</option>
                          </select>
                        </div>
                      </div>
                      <div className="flex gap-3 mt-6">
                        <button onClick={() => setShowNewTicketModal(false)} className="flex-1 py-3 bg-white/5 border border-white/10 rounded-xl text-white font-bold hover:bg-white/10 transition-colors">Cancel</button>
                        <button onClick={addNewTicket} disabled={!newTicket.name.trim()} className="flex-1 py-3 btn-primary rounded-xl font-bold disabled:opacity-40">Create Ticket</button>
                      </div>
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* ─── DISCOUNTS TAB ─── */}
          {activeTab === 'discounts' && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="col-span-12 space-y-6">
              {/* Header */}
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-2xl font-bold text-white">Discounts & Promo Codes</h2>
                  <p className="text-zinc-500 text-sm mt-1">Create manual promo codes and automatic discounts to drive registrations.</p>
                </div>
                <button onClick={() => setShowDiscountModal(true)} className="btn-primary flex items-center gap-2 text-sm">
                  <Plus className="w-4 h-4" /> Create Discount
                </button>
              </div>

              {/* Stats Row */}
              <div className="grid grid-cols-3 gap-4">
                {[
                  { label: 'Active Codes', value: discounts.filter(d => d.isActive).length, icon: Tag, color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
                  { label: 'Total Redemptions', value: discounts.reduce((s, d) => s + d.used, 0), icon: Percent, color: 'text-sky-400', bg: 'bg-sky-500/10 border-sky-500/20' },
                  { label: 'Estimated Savings', value: '₹24,800', icon: TrendingUp, color: 'text-purple-400', bg: 'bg-purple-500/10 border-purple-500/20' },
                ].map((s, i) => (
                  <div key={i} className={`glass-panel p-5 border ${s.bg} flex items-center gap-4`}>
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${s.bg}`}><s.icon className={`w-5 h-5 ${s.color}`} /></div>
                    <div><p className="text-xs text-zinc-500 font-bold uppercase tracking-widest">{s.label}</p><p className={`text-2xl font-black ${s.color}`}>{s.value}</p></div>
                  </div>
                ))}
              </div>

              {/* Tabs: Manual vs Auto */}
              {['manual', 'auto'].map(dtype => (
                <div key={dtype} className="glass-panel p-6">
                  <h3 className="text-sm font-black text-zinc-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                    {dtype === 'manual' ? <><Tag className="w-4 h-4 text-sky-400" /> Manual Promo Codes</> : <><Zap className="w-4 h-4 text-amber-400" /> Automatic Discounts</>}
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead><tr className="text-zinc-500 text-[10px] uppercase tracking-widest border-b border-white/5">
                        {dtype === 'manual' && <th className="pb-3 pr-4">Code</th>}
                        <th className="pb-3 pr-4">Description</th>
                        <th className="pb-3 pr-4">Value</th>
                        <th className="pb-3 pr-4">Category</th>
                        <th className="pb-3 pr-4">Valid Until</th>
                        <th className="pb-3 pr-4">Usage</th>
                        <th className="pb-3">Status</th>
                      </tr></thead>
                      <tbody className="divide-y divide-white/5">
                        {discounts.filter(d => d.type === dtype).map(d => (
                          <tr key={d.id} className="group hover:bg-white/[0.02]">
                            {dtype === 'manual' && <td className="py-4 pr-4"><code className="px-2 py-1 bg-primary/10 text-primary rounded text-xs font-mono font-bold border border-primary/20">{d.code}</code></td>}
                            <td className="py-4 pr-4 text-white text-sm font-medium">{d.description}</td>
                            <td className="py-4 pr-4">
                              <span className="text-emerald-400 font-bold text-sm">{d.valueType === 'percentage' ? `${d.value}%` : `₹${d.value}`}</span>
                              <span className="text-zinc-600 text-xs ml-1">{d.valueType === 'percentage' ? 'off' : 'flat'}</span>
                            </td>
                            <td className="py-4 pr-4 text-zinc-400 text-sm">{d.category}</td>
                            <td className="py-4 pr-4 text-zinc-400 text-sm flex items-center gap-1"><Clock className="w-3 h-3" />{d.validUntil}</td>
                            <td className="py-4 pr-4">
                              <div className="flex items-center gap-2">
                                <div className="w-20 h-1 bg-white/5 rounded-full overflow-hidden">
                                  <div className="h-full bg-primary rounded-full" style={{ width: d.limit > 0 ? `${Math.min(100, (d.used / d.limit) * 100)}%` : '40%' }} />
                                </div>
                                <span className="text-xs text-zinc-500">{d.used}{d.limit > 0 ? ` / ${d.limit}` : ''}</span>
                              </div>
                            </td>
                            <td className="py-4">
                              <button onClick={() => setDiscounts(prev => prev.map(x => x.id === d.id ? { ...x, isActive: !x.isActive } : x))}
                                className={`text-[10px] uppercase font-bold px-3 py-1 rounded-full border transition-all ${ d.isActive ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-zinc-800 text-zinc-500 border-zinc-700' }`}>
                                {d.isActive ? 'Active' : 'Inactive'}
                              </button>
                            </td>
                          </tr>
                        ))}
                        {discounts.filter(d => d.type === dtype).length === 0 && (
                          <tr><td colSpan={7} className="py-10 text-center text-zinc-600 text-sm">No {dtype} discounts yet.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}

              {/* Create Discount Modal */}
              <AnimatePresence>
                {showDiscountModal && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-6"
                    onClick={e => e.target === e.currentTarget && setShowDiscountModal(false)}>
                    <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
                      className="bg-zinc-900 border border-white/10 rounded-3xl p-8 w-full max-w-lg shadow-2xl">
                      <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-3"><BadgePercent className="w-5 h-5 text-primary" /> New Discount</h2>
                      <div className="space-y-4">
                        {/* Type Toggle */}
                        <div className="grid grid-cols-2 gap-3">
                          {['manual', 'auto'].map(t => (
                            <button key={t} onClick={() => setNewDiscount(d => ({ ...d, type: t }))}
                              className={`py-2.5 rounded-xl border text-sm font-bold transition-all ${ newDiscount.type === t ? 'bg-primary/20 border-primary/40 text-primary' : 'bg-white/5 border-white/10 text-zinc-500 hover:border-white/20' }`}>
                              {t === 'manual' ? '🏷 Manual (Promo Code)' : '⚡ Automatic'}
                            </button>
                          ))}
                        </div>
                        {newDiscount.type === 'manual' && (
                          <div>
                            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block mb-2">Promo Code</label>
                            <input value={newDiscount.code} onChange={e => setNewDiscount(d => ({ ...d, code: e.target.value.toUpperCase() }))}
                              placeholder="e.g. WELCOME30" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white font-mono outline-none focus:border-primary/50" />
                          </div>
                        )}
                        <div>
                          <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block mb-2">Description</label>
                          <input value={newDiscount.description} onChange={e => setNewDiscount(d => ({ ...d, description: e.target.value }))}
                            placeholder="e.g. 20% off early bird" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-primary/50" />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block mb-2">Discount Type</label>
                            <select value={newDiscount.valueType} onChange={e => setNewDiscount(d => ({ ...d, valueType: e.target.value }))}
                              className="w-full bg-zinc-800 border border-white/10 rounded-xl px-4 py-3 text-white outline-none">
                              <option value="percentage">Percentage (%)</option>
                              <option value="flat">Flat Amount (₹)</option>
                            </select>
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block mb-2">Value</label>
                            <input type="number" min="1" value={newDiscount.value} onChange={e => setNewDiscount(d => ({ ...d, value: parseFloat(e.target.value) || 0 }))}
                              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-primary/50" />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block mb-2">Valid From (DD-MM-YYYY)</label>
                            <FormattedDateInput value={newDiscount.validFrom} onChange={e => setNewDiscount(d => ({ ...d, validFrom: e.target.value }))}
                              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-primary/50" />
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block mb-2">Valid Until (DD-MM-YYYY)</label>
                            <FormattedDateInput value={newDiscount.validUntil} onChange={e => setNewDiscount(d => ({ ...d, validUntil: e.target.value }))}
                              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-primary/50" />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block mb-2">Apply To Category</label>
                            <select value={newDiscount.category} onChange={e => setNewDiscount(d => ({ ...d, category: e.target.value }))}
                              className="w-full bg-zinc-800 border border-white/10 rounded-xl px-4 py-3 text-white outline-none">
                              <option value="All">All Categories</option>
                              {tickets.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block mb-2">Usage Limit</label>
                            <input type="number" min="0" value={newDiscount.limit} onChange={e => setNewDiscount(d => ({ ...d, limit: parseInt(e.target.value) || 0 }))}
                              placeholder="0 = unlimited" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-primary/50" />
                          </div>
                        </div>
                        {newDiscount.type === 'auto' && (
                          <div>
                            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block mb-2">Min. Tickets to Qualify</label>
                            <input type="number" min="1" value={newDiscount.minOrder} onChange={e => setNewDiscount(d => ({ ...d, minOrder: parseInt(e.target.value) || 1 }))}
                              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-primary/50" />
                          </div>
                        )}
                      </div>
                      <div className="flex gap-3 mt-6">
                        <button onClick={() => setShowDiscountModal(false)} className="flex-1 py-3 bg-white/5 border border-white/10 rounded-xl text-white font-bold hover:bg-white/10 transition-colors">Cancel</button>
                        <button onClick={addDiscount} disabled={!newDiscount.description.trim()} className="flex-1 py-3 btn-primary rounded-xl font-bold disabled:opacity-40">Create Discount</button>
                      </div>
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}

          {/* ─── APPROVALS TAB ─── */}
          {activeTab === 'approvals' && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="col-span-12 space-y-6">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-2xl font-bold text-white">Pending Approvals</h2>
                  <p className="text-zinc-500 text-sm mt-1">Review and approve/reject registrations for approval-required categories.</p>
                </div>
                <div className="flex gap-3 text-sm">
                  <span className="px-4 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 font-bold">
                    {pendingApprovals.filter(p => p.status === 'pending').length} Pending
                  </span>
                  <span className="px-4 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-bold">
                    {pendingApprovals.filter(p => p.status === 'approved').length} Approved
                  </span>
                  <span className="px-4 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 font-bold">
                    {pendingApprovals.filter(p => p.status === 'rejected').length} Rejected
                  </span>
                </div>
              </div>

              <div className="glass-panel p-6">
                <div className="space-y-3">
                  {pendingApprovals.map((applicant, i) => (
                    <motion.div key={applicant.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
                      className={`p-5 rounded-2xl border flex items-center justify-between gap-6 transition-all ${
                        applicant.status === 'approved' ? 'bg-emerald-500/5 border-emerald-500/20' :
                        applicant.status === 'rejected' ? 'bg-red-500/5 border-red-500/10 opacity-60' :
                        'bg-white/[0.03] border-white/10 hover:border-amber-500/20'
                      }`}>
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/20 to-purple-500/20 flex items-center justify-center text-white font-bold text-sm border border-white/10">
                          {applicant.name[0]}
                        </div>
                        <div>
                          <p className="font-bold text-white">{applicant.name}</p>
                          <p className="text-xs text-zinc-500">{applicant.email} · {applicant.phone}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-6 text-sm">
                        <div className="text-right">
                          <p className="text-[10px] text-zinc-600 uppercase font-bold tracking-widest">Category</p>
                          <p className="text-white font-medium">{applicant.category}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] text-zinc-600 uppercase font-bold tracking-widest">Submitted</p>
                          <p className="text-zinc-400 flex items-center gap-1"><Clock className="w-3 h-3" />{applicant.submittedAt}</p>
                        </div>
                        {applicant.status === 'pending' ? (
                          <div className="flex gap-2">
                            <button onClick={() => approveGuest(applicant.id)}
                              className="flex items-center gap-1.5 px-4 py-2 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold rounded-xl hover:bg-emerald-500/20 transition-all">
                              <CheckCircle className="w-3.5 h-3.5" /> Approve
                            </button>
                            <button onClick={() => rejectGuest(applicant.id)}
                              className="flex items-center gap-1.5 px-4 py-2 bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-bold rounded-xl hover:bg-red-500/20 transition-all">
                              <XCircle className="w-3.5 h-3.5" /> Reject
                            </button>
                          </div>
                        ) : (
                          <span className={`px-4 py-2 rounded-xl text-xs font-bold border ${ applicant.status === 'approved' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20' }`}>
                            {applicant.status === 'approved' ? '✓ Approved' : '✗ Rejected'}
                          </span>
                        )}
                      </div>
                    </motion.div>
                  ))}
                  {pendingApprovals.length === 0 && (
                    <div className="py-20 text-center">
                      <CheckCircle className="w-12 h-12 text-emerald-500/30 mx-auto mb-4" />
                      <p className="text-zinc-500">All caught up! No pending approvals.</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Info Box */}
              <div className="p-5 rounded-2xl bg-primary/5 border border-primary/20 flex gap-4">
                <AlertTriangle className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-bold text-white mb-1">How Approval-Required Categories Work</p>
                  <p className="text-xs text-zinc-500 leading-relaxed">When a ticket is set to "Approval Required", attendees submit their registration and wait. <br /> Once you click <strong className="text-white">Approve</strong>, they receive a confirmation email with their badge. Rejected applicants are notified automatically.</p>
                </div>
              </div>
            </motion.div>
          )}
          {activeTab === 'designer' && (
            <div className="col-span-12 grid grid-cols-12 gap-8">
                <div className="col-span-7 bg-black/50 rounded-3xl p-12 flex items-center justify-center border border-white/5 relative overflow-hidden">
                    <div className="absolute inset-0 bg-mesh opacity-30"></div>

                    <motion.div
                        ref={badgeCanvasRef}
                        className="w-[350px] h-[500px] bg-white rounded-xl shadow-2xl relative overflow-hidden flex flex-col items-center p-8 text-slate-900"
                        layoutId="badge-preview"
                    >
                        <div className="absolute inset-0 border-4 border-dashed border-zinc-200 pointer-events-none"></div>

                        {badgeElements.map((el) => (
                            <motion.div
                                key={el.id}
                                drag
                                dragMomentum={false}
                                dragConstraints={{ left: 0, top: 0, right: 310, bottom: 460 }}
                                onDragEnd={(e, info) => {
                                    setBadgeElements(prev => {
                                        const next = prev.map(item =>
                                            item.id === el.id ? { ...item, x: Math.max(0, Math.min(310, item.x + info.offset.x)), y: Math.max(0, Math.min(460, item.y + info.offset.y)) } : item
                                        );
                                        saveBadgeDesign(next);
                                        return next;
                                    });
                                }}
                                className={`absolute top-0 left-0 cursor-move select-none p-2 rounded hover:bg-primary/10 border border-transparent hover:border-primary/20 transition-shadow ${el.size === '2xl' ? 'text-3xl font-black uppercase' : el.size === 'xl' ? 'text-2xl font-bold' : 'font-bold text-sm'} ${el.color || 'text-slate-900'}`}
                                animate={{
                                    x: el.x,
                                    y: el.y,
                                    scale: el.scale || 1
                                }}
                                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                            >
                                {el.id === 'qr' ? (
                                    <div className="bg-white p-2 rounded shadow-sm border border-zinc-100">
                                        <QRCodeSVG
                                            value={spotRegisteredAttendee?.id || spotRegisteredAttendee?.confirmationId || spotRegisteredAttendee?.email || 'SAMPLE-QR'}
                                            size={100}
                                            level="M"
                                        />
                                    </div>
                                ) : el.label}
                            </motion.div>
                        ))}

                        <div className="absolute bottom-4 left-0 right-0 text-center opacity-20 pointer-events-none">
                            <p className="text-[10px] font-bold uppercase tracking-[0.3em]">EventPro Badge System</p>
                        </div>
                    </motion.div>
                </div>

                <div className="col-span-5 space-y-6">
                    <div className="glass-panel p-6">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-bold">Badge Configuration</h3>
                            <div className="relative group">
                                <button className="p-2 bg-primary/10 rounded-lg text-primary border border-primary/20 flex items-center gap-2 hover:bg-primary/20 transition-all">
                                    <PlusCircle className="w-4 h-4" />
                                    <span className="text-xs font-bold">Add Field</span>
                                </button>
                                <div className="absolute right-0 top-full mt-2 w-48 bg-zinc-900 border border-white/10 rounded-xl shadow-2xl p-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-20">
                                    {['email', 'company', 'job', 'venue'].map(type => (
                                        <button
                                            key={type}
                                            onClick={() => addBadgeElement(type)}
                                            className="w-full text-left p-2 hover:bg-white/5 rounded text-xs capitalize text-zinc-400 hover:text-white"
                                        >
                                            {type} Field
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="space-y-6">
                            <div>
                                <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-3 block">Element Settings</label>
                                <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                                    {badgeElements.map(el => (
                                        <div key={el.id} className="p-4 bg-white/5 rounded-xl border border-white/10">
                                            <div className="flex justify-between items-center mb-3">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-bold text-sm text-white">{el.label}</span>
                                                </div>
                                                <div className="flex gap-1">
                                                    {el.id !== 'qr' && (
                                                        <button
                                                            onClick={() => removeBadgeElement(el.id)}
                                                            className="p-1.5 hover:bg-red-500/10 rounded text-zinc-500 hover:text-red-400 transition-colors"
                                                        >
                                                            <Trash2 className="w-3.5 h-3.5" />
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={() => setEditingBadgeElementId(editingBadgeElementId === el.id ? null : el.id)}
                                                        className={`p-1.5 rounded transition-colors ${editingBadgeElementId === el.id ? 'bg-primary/20 text-primary' : 'hover:bg-white/10 text-zinc-500 hover:text-white'}`}
                                                    >
                                                        <Settings className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            </div>

                                            {editingBadgeElementId === el.id && (
                                                <div className="mb-3 p-3 bg-black/30 rounded-lg space-y-2">
                                                    <div>
                                                        <label className="text-[10px] text-zinc-500 font-bold uppercase">Label</label>
                                                        <input
                                                            type="text"
                                                            value={el.label}
                                                            onChange={(e) => updateBadgeElement(el.id, { label: e.target.value })}
                                                            className="w-full bg-zinc-800/50 border border-white/10 rounded px-2 py-1 text-xs text-white mt-0.5"
                                                        />
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-2">
                                                        <div>
                                                            <label className="text-[10px] text-zinc-500 font-bold uppercase">Color</label>
                                                            <select
                                                                value={el.color || 'text-slate-900'}
                                                                onChange={(e) => updateBadgeElement(el.id, { color: e.target.value })}
                                                                className="w-full bg-zinc-800/50 border border-white/10 rounded px-2 py-1 text-xs text-white mt-0.5"
                                                            >
                                                                <option value="text-slate-900">Black</option>
                                                                <option value="text-primary">Primary</option>
                                                                <option value="text-red-600">Red</option>
                                                                <option value="text-emerald-600">Green</option>
                                                                <option value="text-blue-600">Blue</option>
                                                                <option value="text-amber-600">Amber</option>
                                                                <option value="text-purple-600">Purple</option>
                                                            </select>
                                                        </div>
                                                        <div>
                                                            <label className="text-[10px] text-zinc-500 font-bold uppercase">Size</label>
                                                            <select
                                                                value={el.size || 'base'}
                                                                onChange={(e) => updateBadgeElement(el.id, { size: e.target.value })}
                                                                className="w-full bg-zinc-800/50 border border-white/10 rounded px-2 py-1 text-xs text-white mt-0.5"
                                                            >
                                                                <option value="base">Small</option>
                                                                <option value="lg">Medium</option>
                                                                <option value="xl">Large</option>
                                                                <option value="2xl">Extra Large</option>
                                                            </select>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}

                                            <div className="space-y-3">
                                                <div>
                                                    <div className="flex justify-between mb-1">
                                                        <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">Scaling Factor</span>
                                                        <span className="text-[10px] text-primary font-mono">{parseFloat(el.scale || 1).toFixed(1)}x</span>
                                                    </div>
                                                    <input
                                                        type="range"
                                                        min="0.5"
                                                        max="3"
                                                        step="0.1"
                                                        value={el.scale || 1}
                                                        onChange={(e) => updateBadgeElementScale(el.id, e.target.value)}
                                                        className="w-full accent-primary h-1 bg-white/5 rounded-lg appearance-none cursor-pointer"
                                                    />
                                                </div>
                                                <div className="grid grid-cols-2 gap-4 pt-1">
                                                    <div>
                                                        <p className="text-[10px] text-zinc-600 mb-1 font-bold">X-POS</p>
                                                        <input
                                                            type="number"
                                                            min={0}
                                                            max={310}
                                                            value={Math.round(el.x)}
                                                            onChange={(e) => {
                                                                const v = Math.max(0, Math.min(310, parseInt(e.target.value) || 0));
                                                                updateBadgeElement(el.id, { x: v });
                                                            }}
                                                            className="w-full input-base py-1 px-3 h-8 text-xs bg-bg-dark border-white/5"
                                                        />
                                                    </div>
                                                    <div>
                                                        <p className="text-[10px] text-zinc-600 mb-1 font-bold">Y-POS</p>
                                                        <input
                                                            type="number"
                                                            min={0}
                                                            max={460}
                                                            value={Math.round(el.y)}
                                                            onChange={(e) => {
                                                                const v = Math.max(0, Math.min(460, parseInt(e.target.value) || 0));
                                                                updateBadgeElement(el.id, { y: v });
                                                            }}
                                                            className="w-full input-base py-1 px-3 h-8 text-xs bg-bg-dark border-white/5"
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="pt-6 border-t border-white/5 space-y-4">
                                <button
                                    onClick={() => {
                                        saveBadgeDesign(badgeElements);
                                        alert('✅ Badge design saved to event!');
                                    }}
                                    className="w-full py-3 bg-primary text-white rounded-xl font-bold shadow-lg shadow-primary/20"
                                >
                                    Save Design
                                </button>
                                <button onClick={() => window.print()} className="w-full py-3 bg-white/5 border border-white/10 text-white rounded-xl font-bold">Print Preview (PDF)</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
          )}
          {activeTab === 'automation' && (
            <div className="col-span-12 grid grid-cols-12 gap-8">
                <div className="col-span-4 space-y-6">
                    <div className="glass-panel p-6">
                        <h3 className="text-[10px] font-black mb-6 text-zinc-500 uppercase tracking-widest">Automation Triggers</h3>
                        <div className="space-y-4">
                            {Object.entries(automationTemplates).map(([id, t]) => (
                                <button key={id} 
                                  onClick={() => setActiveAutomationId(id)}
                                  className={`w-full text-left p-4 rounded-2xl border transition-all ${
                                    activeAutomationId === id 
                                      ? 'bg-primary/20 border-primary/40 shadow-lg' 
                                      : 'bg-white/5 border-white/5 hover:bg-white/10'
                                  }`}>
                                    <div className="flex justify-between items-start mb-2">
                                        <p className={`font-bold text-sm ${activeAutomationId === id ? 'text-white' : 'text-zinc-400'}`}>{t.name}</p>
                                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-green-500/10 text-green-400">Active</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-primary">
                                        <Zap className="w-3 h-3" />
                                        <span className="text-[10px] font-black uppercase tracking-widest">{t.trigger}</span>
                                    </div>
                                </button>
                            ))}
                            <button onClick={() => alert('🛠️ Custom triggers can be configured by editing automationConfigs in Firestore directly.')}
                              className="w-full py-4 border border-dashed border-white/10 rounded-2xl text-xs text-zinc-600 font-bold hover:text-white transition-all uppercase tracking-widest">
                                + Add Custom Trigger
                            </button>
                        </div>
                    </div>

                    <div className="glass-panel p-6">
                         <h3 className="text-[10px] font-black mb-4 text-zinc-500 uppercase tracking-widest">Available Variables</h3>
                         <div className="flex flex-wrap gap-2">
                             {['attendee_name', 'gate_name', 'event_name', 'upsell_link', 'login_time'].map(v => (
                                 <code key={v} className="text-[10px] font-mono bg-white/10 px-2 py-1 rounded text-primary">
                                     {`{{${v}}}`}
                                 </code>
                             ))}
                         </div>
                    </div>
                </div>

                <div className="col-span-8 space-y-6">
                    <div className="glass-panel p-8 flex-1">
                        <div className="flex justify-between items-center mb-8">
                            <div>
                                <h2 className="text-xl font-bold text-white uppercase tracking-wider">Email Template Studio</h2>
                                <p className="text-zinc-500 text-xs mt-1">Editing: <span className="text-primary font-bold">{automationTemplates[activeAutomationId].name}</span></p>
                            </div>
                            <div className="flex gap-3">
                                <button onClick={async () => {
                                  setSavingTemplate(true);
                                  try {
                                    if (!selectedEventId) { alert('Select an event first'); return; }
                                    await updateDoc(doc(db, 'events', selectedEventId), { automationConfigs: automationTemplates });
                                    alert('Template Saved & Synced!');
                                  } catch (err) {
                                    alert('Save failed: ' + err.message);
                                  } finally {
                                    setSavingTemplate(false);
                                  }
                                }} className="btn-primary py-2.5 text-sm px-6 flex items-center gap-2">
                                  {savingTemplate ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                  {savingTemplate ? 'Syncing...' : 'Save & Sync'}
                                </button>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 gap-6">
                            <div className="space-y-3">
                                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest pl-1">Email Subject Line</label>
                                <input 
                                  type="text" 
                                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-primary/50" 
                                  value={automationTemplates[activeAutomationId].subject}
                                  onChange={e => setAutomationTemplates(prev => ({
                                    ...prev,
                                    [activeAutomationId]: { ...prev[activeAutomationId], subject: e.target.value }
                                  }))}
                                />
                            </div>
                            
                            <div className="space-y-3">
                                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest pl-1">Message Content (HTML/Plain Text)</label>
                                <div className="p-1 glass-panel border-white/10 overflow-hidden">
                                    <div className="flex gap-2 p-2 bg-white/5 border-b border-white/5">
                                        <button className="px-3 py-1.5 bg-white/5 border border-white/10 rounded text-[10px] font-black uppercase tracking-widest hover:bg-white/10 text-zinc-400">Bold</button>
                                        <button className="px-3 py-1.5 bg-white/5 border border-white/10 rounded text-[10px] font-black uppercase tracking-widest hover:bg-white/10 text-zinc-400">Italic</button>
                                        <button className="px-3 py-1.5 bg-white/5 border border-white/10 rounded text-[10px] font-black uppercase tracking-widest hover:bg-white/10 text-primary">Preview</button>
                                    </div>
                                    <textarea 
                                        className="w-full h-80 bg-transparent p-6 text-sm text-zinc-300 outline-none resize-none leading-relaxed font-mono"
                                        value={automationTemplates[activeAutomationId].body}
                                        onChange={e => setAutomationTemplates(prev => ({
                                          ...prev,
                                          [activeAutomationId]: { ...prev[activeAutomationId], body: e.target.value }
                                        }))}
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="mt-8 flex gap-4 p-6 bg-primary/10 rounded-2xl border border-primary/20">
                            <Send className="w-10 h-10 text-primary" />
                            <div className="flex-1">
                                <h4 className="font-bold text-primary text-sm uppercase tracking-widest">Send Live Test</h4>
                                <p className="text-xs text-zinc-500 leading-relaxed mt-1">Ready to deploy? Send a real test email to your primary admin account to verify formatting across mobile and desktop clients.</p>
                            </div>

                        </div>
                    </div>
                </div>
            </div>
          )}

          {/* ─── GIVEAWAYS TAB ─── */}
          {activeTab === 'giveaways' && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">

              {/* Header */}
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-2xl font-bold text-white">Giveaway & Swag Manager</h2>
                  <p className="text-zinc-500 text-sm mt-1">Define items, set eligibility per ticket type, and track real-time distribution.</p>
                </div>
                <div className="flex gap-3">
                  <button onClick={drawRaffleWinner} className="flex items-center gap-2 px-4 py-2.5 bg-amber-500/10 border border-amber-500/20 text-amber-400 font-bold rounded-xl hover:bg-amber-500/20 transition-colors text-sm">
                    <Trophy className="w-4 h-4" /> Run Raffle Draw
                  </button>
                  <button onClick={() => setShowAddGiveaway(true)} className="btn-primary flex items-center gap-2 text-sm">
                    <Plus className="w-4 h-4" /> Add Item
                  </button>
                </div>
              </div>

              {/* Raffle Winner Banner */}
              <AnimatePresence>
                {raffleWinner && (
                  <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                    className="glass-panel p-6 border-amber-500/30 bg-amber-500/5 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <span className="text-4xl">🏆</span>
                      <div>
                        <p className="text-xs font-bold text-amber-400 uppercase tracking-widest mb-1">Raffle Draw Winner</p>
                        <p className="text-2xl font-black text-white">{raffleWinner}</p>
                      </div>
                    </div>
                    <button onClick={() => setRaffleWinner(null)} className="text-zinc-500 hover:text-white transition-colors text-sm">Dismiss</button>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Giveaway Items Grid */}
              <div className="grid grid-cols-1 gap-4">
                {giveaways.map((item, i) => {
                  const pct = item.totalQty > 0 ? Math.round((item.claimedQty / item.totalQty) * 100) : 0;
                  const remaining = item.totalQty - item.claimedQty;
                  return (
                    <motion.div key={item.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
                      className="glass-panel p-5 flex items-center gap-6">
                      {/* Icon */}
                      <div className="text-4xl w-14 h-14 flex items-center justify-center bg-white/5 rounded-xl border border-white/10 flex-shrink-0">{item.emoji}</div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-1">
                          <h3 className="font-bold text-white text-lg">{item.name}</h3>
                          <span className={`text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full ${
                            item.isActive ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-zinc-700/50 text-zinc-500 border border-zinc-700'
                          }`}>{item.isActive ? 'Active' : 'Inactive'}</span>
                        </div>
                        <div className="flex flex-wrap gap-2 mb-3">
                          {item.eligibleTickets.map(t => (
                            <span key={t} className="text-[10px] px-2 py-0.5 bg-primary/10 text-primary border border-primary/20 rounded-full font-bold">{t}</span>
                          ))}
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
                            <motion.div className="h-full bg-gradient-to-r from-primary to-purple-400 rounded-full"
                              initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.8, delay: i * 0.05 }} />
                          </div>
                          <span className="text-xs text-zinc-400 font-medium whitespace-nowrap">{item.claimedQty} / {item.totalQty} collected</span>
                        </div>
                      </div>

                      {/* Stats */}
                      <div className="text-right flex-shrink-0">
                        <p className="text-3xl font-black text-white">{remaining}</p>
                        <p className="text-xs text-zinc-500 font-medium">remaining</p>
                      </div>

                      {/* Toggle */}
                      <div className="flex flex-col gap-2 flex-shrink-0">
                        <button onClick={() => setGiveaways(prev => prev.map(g => g.id === item.id ? { ...g, isActive: !g.isActive } : g))}
                          className={`p-2 rounded-lg border transition-all ${ item.isActive ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-white/5 border-white/10 text-zinc-500 hover:text-white'}`}>
                          <Check className="w-4 h-4" />
                        </button>
                        <button onClick={() => setGiveaways(prev => prev.filter(g => g.id !== item.id))}
                          className="p-2 rounded-lg border border-white/10 bg-white/5 text-zinc-500 hover:text-red-400 hover:border-red-500/20 transition-all">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </motion.div>
                  );
                })}
              </div>

              {/* Add Giveaway Form */}
              <AnimatePresence>
                {showAddGiveaway && (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                    className="glass-panel p-6 border-primary/20 bg-primary/5">
                    <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2"><Gift className="w-5 h-5 text-primary" /> New Giveaway Item</h3>
                    <div className="grid grid-cols-12 gap-4">
                      <div className="col-span-1">
                        <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block mb-1">Icon</label>
                        <input type="text" maxLength={2} value={newGiveaway.emoji} onChange={e => setNewGiveaway(g => ({ ...g, emoji: e.target.value }))}
                          className="w-full p-3 bg-white/5 border border-white/10 rounded-xl text-white text-center text-xl outline-none focus:border-primary/50" />
                      </div>
                      <div className="col-span-5">
                        <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block mb-1">Item Name</label>
                        <input type="text" value={newGiveaway.name} onChange={e => setNewGiveaway(g => ({ ...g, name: e.target.value }))}
                          placeholder="e.g. Water Bottle" className="w-full p-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-zinc-600 outline-none focus:border-primary/50 transition-colors" />
                      </div>
                      <div className="col-span-2">
                        <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block mb-1">Quantity</label>
                        <input type="number" min={1} value={newGiveaway.totalQty} onChange={e => setNewGiveaway(g => ({ ...g, totalQty: parseInt(e.target.value) || 1 }))}
                          className="w-full p-3 bg-white/5 border border-white/10 rounded-xl text-white outline-none focus:border-primary/50 transition-colors" />
                      </div>
                      <div className="col-span-4">
                        <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block mb-1">Eligible Tickets</label>
                        <select className="w-full p-3 bg-zinc-900 border border-white/10 rounded-xl text-white outline-none focus:border-primary/50"
                          onChange={e => setNewGiveaway(g => ({ ...g, eligibleTickets: [e.target.value] }))}>
                          <option value="All">All Tickets</option>
                          <option value="General Delegate">General Delegate</option>
                          <option value="VIP Pass">VIP Pass</option>
                          <option value="Speaker RSVP">Speaker RSVP</option>
                        </select>
                      </div>
                    </div>
                    <div className="flex gap-3 mt-5">
                      <button onClick={() => setShowAddGiveaway(false)} className="flex-1 py-2.5 bg-white/5 border border-white/10 text-white font-bold rounded-xl hover:bg-white/10 transition-colors">Cancel</button>
                      <button onClick={addGiveaway} disabled={!newGiveaway.name.trim()} className="flex-1 py-2.5 btn-primary font-bold rounded-xl disabled:opacity-40">Save Item</button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}

          {activeTab === 'zones' && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              {/* Sub-tab bar */}
              <div className="flex gap-1 p-1 bg-white/5 border border-white/10 rounded-xl w-fit mb-6">
                {[
                  { id: 'rules', label: '🛡️ Zone Rules' },
                  { id: 'log',   label: '📋 Entry Log' },
                ].map(t => (
                  <button key={t.id} onClick={() => setAccessSubTab(t.id)}
                    className={`px-5 py-2 rounded-lg text-sm font-bold transition-all ${
                      accessSubTab === t.id ? 'bg-primary text-white shadow-lg' : 'text-zinc-400 hover:text-white'
                    }`}>
                    {t.label}
                  </button>
                ))}
              </div>
              {accessSubTab === 'rules' && <ZoneRulesManager />}
              {accessSubTab === 'log'   && <EntryLog />}
            </motion.div>
          )}

          {activeTab === 'map' && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="col-span-12">
               <MapBuilder />
            </motion.div>
          )}

          {activeTab === 'automation' && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, x: 0 }} className="col-span-12 space-y-8">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-2xl font-bold text-white">Automated Communication Engine</h2>
                  <p className="text-zinc-500 text-sm mt-1">Configure real-time event triggers for Email, WhatsApp, and SMS.</p>
                </div>
                <button className="btn-primary px-6 py-2.5 flex items-center gap-2 text-sm">
                  <Zap className="w-4 h-4" /> Create New Trigger
                </button>
              </div>

              <div className="grid grid-cols-12 gap-8">
                {/* Trigger List */}
                <div className="col-span-4 space-y-3">
                  {Object.entries(automationTemplates).map(([id, t]) => (
                    <button 
                      key={id}
                      onClick={() => setActiveAutomationId(id)}
                      className={`w-full text-left p-6 rounded-2xl border transition-all ${
                        activeAutomationId === id 
                        ? 'bg-primary/10 border-primary/40 shadow-lg shadow-primary/5' 
                        : 'bg-white/3 border-white/5 hover:border-white/10'
                      }`}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <h4 className={`font-bold ${activeAutomationId === id ? 'text-white' : 'text-zinc-400'}`}>{t.name}</h4>
                        <div className={`p-1.5 rounded-lg ${activeAutomationId === id ? 'bg-primary text-white' : 'bg-white/5 text-zinc-600'}`}>
                          <Zap className="w-3 h-3" />
                        </div>
                      </div>
                      <p className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">{t.trigger}</p>
                    </button>
                  ))}
                </div>

                {/* Template Editor */}
                <div className="col-span-8">
                  <div className="glass-panel p-8 border-white/5 bg-white/[0.02]">
                    <div className="flex justify-between items-center mb-8 pb-4 border-b border-white/5">
                      <h3 className="font-bold text-white text-lg flex items-center gap-3">
                        <Mail className="w-5 h-5 text-primary" /> Template Editor
                      </h3>
                      <button 
                        onClick={() => {
                          setSavingTemplate(true);
                          setTimeout(() => setSavingTemplate(false), 1500);
                        }}
                        className="px-6 py-2 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-black uppercase tracking-widest rounded-xl hover:bg-emerald-500/20 transition-all min-w-[120px]"
                      >
                        {savingTemplate ? <RefreshCw className="w-3 h-3 animate-spin mx-auto" /> : 'Save Changes'}
                      </button>
                    </div>

                    <div className="space-y-6">
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest ml-1">Subject Line</label>
                        <input 
                          type="text" 
                          value={automationTemplates[activeAutomationId].subject} 
                          className="w-full bg-black/40 border border-white/10 rounded-xl px-5 py-3 text-sm text-white focus:border-primary/50 outline-none"
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest ml-1">Message Body (Smart Tags Enabled)</label>
                        <div className="relative">
                          <textarea 
                            rows={10}
                            value={automationTemplates[activeAutomationId].body}
                            className="w-full bg-black/40 border border-white/10 rounded-xl px-5 py-4 text-xs font-mono text-zinc-300 focus:border-primary/50 outline-none leading-loose"
                          />
                          <div className="absolute top-4 right-4 flex flex-col gap-2">
                            {['attendee_name', 'gate_name', 'upsell_link'].map(tag => (
                              <button key={tag} className="px-2 py-1 bg-white/5 hover:bg-white/10 border border-white/10 rounded text-[9px] font-bold text-zinc-500 hover:text-white transition-all">
                                + &#123;&#123;{tag}&#125;&#125;
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                      
                      <div className="p-4 bg-primary/5 border border-primary/10 rounded-xl">
                        <div className="flex items-center gap-3">
                          <ShieldCheck className="w-4 h-4 text-primary" />
                          <p className="text-[10px] text-zinc-400 font-medium">All automated messages are routed through our <b>EventRelay Anti-Spam Gate</b> to ensure 99.9% inbox delivery.</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* ─── STAFF PASSES TAB ─── */}
          {activeTab === 'staff-passes' && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="col-span-12 space-y-6">

              {/* Header */}
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                    <BadgeCheck className="w-6 h-6 text-primary" /> Staff & Internal Pass Issuance
                  </h2>
                  <p className="text-zinc-500 text-sm mt-1">Create, preview, and distribute digital access passes for internal roles.</p>
                </div>
                <div className="flex gap-3">
                  <button onClick={() => {
                    const csv = ['Name,Email,Role,Company,Zone,Status,Issued',
                      ...staffPasses.map(p => `"${p.name}","${p.email}","${p.role}","${p.company}","${p.zone}","${p.status}","${p.issuedAt}"`)
                    ].join('\n');
                    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([csv], {type:'text/csv'})), download: 'staff_passes.csv' });
                    document.body.appendChild(a); a.click(); document.body.removeChild(a);
                  }} className="px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-xs font-black text-zinc-400 uppercase tracking-widest hover:bg-white/10 transition-all flex items-center gap-2">
                    <Download className="w-3.5 h-3.5" /> Export CSV
                  </button>
                  <button onClick={() => setShowStaffModal(true)} className="btn-primary flex items-center gap-2 px-5 py-2.5 text-sm">
                    <Plus className="w-4 h-4" /> Issue New Pass
                  </button>
                </div>
              </div>

              {/* Role Stats Row */}
              <div className="grid grid-cols-5 gap-4">
                                {Object.entries(roleConfig).map(([roleId, cfg]) => {
                  const RoleIcon = cfg.icon;
                  const count = staffPasses.filter(p => p.role === roleId).length;
                  return (
                    <motion.div key={roleId} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                      className={`glass-panel p-5 border flex items-center gap-4 cursor-pointer transition-all ${cfg.panelCls}`}>
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${cfg.iconWrap}`}>
                        <RoleIcon className={`w-5 h-5 ${cfg.iconCls}`} />
                      </div>
                      <div>
                        <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">{cfg.label}</p>
                        <p className={`text-2xl font-black ${cfg.textCls}`}>{count}</p>
                      </div>
                    </motion.div>
                  );
                })}
              </div>

              {/* Pass Roster */}
              <div className="glass-panel p-6">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-[10px] font-black text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                    <Users className="w-4 h-4 text-primary" /> Issued Passes — {staffPasses.length} Total
                  </h3>
                  <div className="flex gap-2">
                    {['all', ...Object.keys(roleConfig)].map(r => (
                      <button key={r} className="px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest bg-white/5 border border-white/10 text-zinc-500 hover:text-white hover:border-white/20 transition-all">
                        {r === 'all' ? 'All' : roleConfig[r]?.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  {staffPasses.map((pass, i) => {
                    const cfg = roleConfig[pass.role] || roleConfig.crew;
                    const RoleIcon = cfg.icon;
                    return (
                      <motion.div key={pass.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}
                        className={`flex items-center justify-between p-4 rounded-2xl border bg-white/[0.02] border-white/5 group transition-all ${cfg.rowHover}`}>

                        <div className="flex items-center gap-4">
                          {/* Avatar */}
                          <div className={`w-12 h-12 rounded-xl bg-gradient-to-br flex items-center justify-center text-lg font-black text-white border ${cfg.avatarCls}`}>
                            {pass.name[0]}
                          </div>
                          <div>
                            <p className="font-bold text-white">{pass.name}</p>
                            <p className="text-xs text-zinc-500">{pass.email} · {pass.company}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-6">
                          {/* Role Badge */}
                          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border ${cfg.badgeCls}`}>
                            <RoleIcon className={`w-3.5 h-3.5 ${cfg.iconCls}`} />
                            <span className={`text-[10px] font-black uppercase tracking-widest ${cfg.iconCls}`}>{cfg.label}</span>
                          </div>

                          {/* Zone */}
                          <div className="text-right">
                            <p className="text-[9px] font-bold text-zinc-600 uppercase tracking-widest">Zone</p>
                            <p className="text-xs font-bold text-zinc-300">{pass.zone}</p>
                          </div>

                          {/* Status */}
                          <span className={`text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full border ${
                            pass.status === 'issued' 
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                              : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                          }`}>
                            {pass.status === 'issued' ? '✓ Issued' : '⏳ Pending'}
                          </span>

                          {/* Actions */}
                          <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-all">
                            <button onClick={() => setPreviewPass(pass)}
                              className="p-2 bg-white/5 border border-white/10 rounded-xl text-zinc-400 hover:text-white hover:bg-white/10 transition-all"
                              title="Preview Pass">
                              <Eye className="w-4 h-4" />
                            </button>
                            <button onClick={async () => {
                              const sendComm = httpsCallable(functions, 'sendOnboardingCommunication');
                              try {
                                const { data } = await sendComm({
                                  to: pass.email,
                                  name: pass.name,
                                  credentials: { email: pass.email, password: 'Use your existing login' },
                                  role: pass.role,
                                  channels: ['email']
                                });
                                alert(`✅ Pass notification sent to ${pass.email}\n${data.results?.email?.previewUrl ? '🔗 Preview: ' + data.results.email.previewUrl : ''}`);
                              } catch (err) {
                                alert('❌ Failed to send: ' + err.message);
                              }
                            }}
                              className="p-2 bg-primary/10 border border-primary/20 rounded-xl text-primary hover:bg-primary hover:text-white transition-all"
                              title="Send Pass">
                              <SendIcon className="w-4 h-4" />
                            </button>
                            <button onClick={() => setStaffPasses(prev => prev.filter(p => p.id !== pass.id))}
                              className="p-2 bg-red-500/5 border border-red-500/10 rounded-xl text-zinc-600 hover:text-red-400 hover:border-red-500/20 transition-all"
                              title="Revoke Pass">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </div>

              {/* Issue New Pass Modal */}
              <AnimatePresence>
                {showStaffModal && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="fixed inset-0 bg-black/70 backdrop-blur-md z-50 flex items-center justify-center p-6"
                    onClick={e => e.target === e.currentTarget && setShowStaffModal(false)}>
                    <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9 }}
                      className="bg-zinc-900 border border-white/10 rounded-3xl p-8 w-full max-w-2xl shadow-2xl">
                      <div className="flex items-center gap-4 mb-8">
                        <div className="w-12 h-12 bg-primary/10 border border-primary/20 rounded-2xl flex items-center justify-center">
                          <BadgeCheck className="w-6 h-6 text-primary" />
                        </div>
                        <div>
                          <h2 className="text-xl font-bold text-white">Issue Internal Pass</h2>
                          <p className="text-zinc-500 text-sm">Create a credential for Exhibitors, Speakers, Organisers, Crew or Staff.</p>
                        </div>
                        <button onClick={() => setShowStaffModal(false)} className="ml-auto p-2 text-zinc-500 hover:text-white transition-colors">
                          <XCircle className="w-5 h-5" />
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-5">
                        {/* Role Selector */}
                        <div className="col-span-2">
                          <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block mb-3">Role / Pass Type</label>
                          <div className="grid grid-cols-5 gap-2">
                            {Object.entries(roleConfig).map(([roleId, cfg]) => {
                              const RoleIcon = cfg.icon;
                              return (
                                <button key={roleId} onClick={() => setNewStaffPass(p => ({ ...p, role: roleId, zone: cfg.zones[0] }))}
                                  className={`p-3 rounded-xl border flex flex-col items-center gap-2 transition-all ${
                                    newStaffPass.role === roleId
                                      ? cfg.selectedCls
                                      : 'bg-white/5 border-white/10 text-zinc-500 hover:border-white/20'
                                  }`}>
                                  <RoleIcon className="w-5 h-5" />
                                  <span className="text-[9px] font-black uppercase tracking-widest">{cfg.label}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <div>
                          <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block mb-2">Full Name *</label>
                          <input value={newStaffPass.name} onChange={e => setNewStaffPass(p => ({ ...p, name: e.target.value }))}
                            placeholder="e.g. Priya Sharma"
                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-primary/50 transition-colors placeholder-zinc-700" />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block mb-2">Email Address *</label>
                          <input value={newStaffPass.email} onChange={e => setNewStaffPass(p => ({ ...p, email: e.target.value }))}
                            placeholder="priya@company.com"
                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-primary/50 transition-colors placeholder-zinc-700" />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block mb-2">Organisation / Company</label>
                          <input value={newStaffPass.company} onChange={e => setNewStaffPass(p => ({ ...p, company: e.target.value }))}
                            placeholder="e.g. Booth Co."
                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-primary/50 transition-colors placeholder-zinc-700" />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block mb-2">Zone Access</label>
                          <select value={newStaffPass.zone} onChange={e => setNewStaffPass(p => ({ ...p, zone: e.target.value }))}
                            className="w-full bg-zinc-800 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-primary/50">
                            {(roleConfig[newStaffPass.role]?.zones || ['All Access']).map(z => (
                              <option key={z} value={z}>{z}</option>
                            ))}
                            <option value="All Access">All Access</option>
                          </select>
                        </div>
                      </div>

                      <div className="flex gap-3 mt-8">
                        <button onClick={() => setShowStaffModal(false)}
                          className="flex-1 py-3 bg-white/5 border border-white/10 rounded-xl text-white font-bold hover:bg-white/10 transition-colors">
                          Cancel
                        </button>
                        <button onClick={issueStaffPass}
                          disabled={!newStaffPass.name || !newStaffPass.email}
                          className="flex-1 py-3 btn-primary rounded-xl font-bold disabled:opacity-40 flex items-center justify-center gap-2">
                          <BadgeCheck className="w-4 h-4" /> Issue Pass & Send Invite
                        </button>
                      </div>
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Pass Preview Modal */}
              <AnimatePresence>
                {previewPass && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="fixed inset-0 bg-black/80 backdrop-blur-xl z-50 flex items-center justify-center p-6"
                    onClick={e => e.target === e.currentTarget && setPreviewPass(null)}>
                    <motion.div initial={{ scale: 0.8, y: 30 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.8 }}
                      className="flex flex-col items-center gap-6">
                      <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Digital Pass Preview</p>

                      {/* The Badge Card */}
                      {(() => {
                        const cfg = roleConfig[previewPass.role] || roleConfig.crew;
                        const RoleIcon = cfg.icon;
                        return (
                          <div className="w-72 rounded-3xl overflow-hidden shadow-2xl border border-white/10" style={{ background: `linear-gradient(135deg, #0a0a0a 0%, ${cfg.accent}18 100%)` }}>
                            {/* Top stripe */}
                            <div className="h-2 w-full" style={{ background: cfg.accent }} />
                            <div className="p-7">
                              {/* Logo + Event */}
                              <div className="flex justify-between items-start mb-6">
                                <div>
                                  <p className="text-[9px] font-black uppercase tracking-[0.3em] text-zinc-500">EventPro Suite</p>
                                  <p className="text-[10px] font-bold text-white mt-0.5">Global Tech Summit 2026</p>
                                </div>
                                <div className="p-2 rounded-xl" style={{ background: `${cfg.accent}20`, border: `1px solid ${cfg.accent}40` }}>
                                  <RoleIcon className="w-5 h-5" style={{ color: cfg.accent }} />
                                </div>
                              </div>

                              {/* Avatar + Name */}
                              <div className="text-center mb-6">
                                <div className="w-20 h-20 rounded-full mx-auto mb-3 flex items-center justify-center text-3xl font-black text-white border-2 border-white/10"
                                  style={{ background: `linear-gradient(135deg, ${cfg.accent}40, ${cfg.accent}10)` }}>
                                  {previewPass.name[0]}
                                </div>
                                <h3 className="text-xl font-black text-white">{previewPass.name}</h3>
                                <p className="text-xs text-zinc-500 mt-1">{previewPass.company}</p>
                                <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest"
                                  style={{ background: `${cfg.accent}15`, border: `1px solid ${cfg.accent}30`, color: cfg.accent }}>
                                  <RoleIcon className="w-3 h-3" /> {cfg.label}
                                </div>
                              </div>

                              {/* Zone */}
                              <div className="mb-5 p-3 rounded-xl bg-white/5 border border-white/5 text-center">
                                <p className="text-[9px] font-black uppercase tracking-widest text-zinc-600 mb-1">Zone Access</p>
                                <p className="text-sm font-bold text-white">{previewPass.zone}</p>
                              </div>

                              {/* QR Code */}
                              <div className="flex justify-center">
                                <div className="p-3 bg-white rounded-2xl">
                                  <QRCodeSVG value={`EVENTPRO:STAFF:${previewPass.id}:${previewPass.role}`} size={100} />
                                </div>
                              </div>
                              <p className="text-center text-[9px] font-mono text-zinc-600 mt-2">{previewPass.id}</p>
                            </div>
                          </div>
                        );
                      })()}

                      <div className="flex gap-3">
                        <button onClick={async () => {
                          const sendComm = httpsCallable(functions, 'sendOnboardingCommunication');
                          try {
                            const { data } = await sendComm({
                              to: previewPass.email,
                              name: previewPass.name,
                              credentials: { email: previewPass.email, password: 'Use your existing login' },
                              role: previewPass.role,
                              channels: ['email']
                            });
                            alert(`✅ Pass notification sent to ${previewPass.email}\n${data.results?.email?.previewUrl ? '🔗 Preview: ' + data.results.email.previewUrl : ''}`);
                            setPreviewPass(null);
                          } catch (err) {
                            alert('❌ Failed to send: ' + err.message);
                          }
                        }}
                          className="btn-primary px-6 py-2.5 flex items-center gap-2 text-sm">
                          <SendIcon className="w-4 h-4" /> Send to {previewPass.email}
                        </button>
                        <button onClick={() => setPreviewPass(null)}
                          className="px-6 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-sm font-bold hover:bg-white/10 transition-colors">
                          Close
                        </button>
                      </div>
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>

            </motion.div>
          )}

          {activeTab === 'settings' && (
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="grid grid-cols-12 gap-8">
                {/* Security Config */}
                <div className="col-span-8 space-y-6">
                    <div className="glass-panel p-8 border-primary/10 bg-primary/3">
                        <div className="flex items-center gap-4 mb-8">
                            <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center border border-primary/20">
                                <Shield className="w-6 h-6 text-primary" />
                            </div>
                            <div>
                                <h2 className="text-xl font-bold text-white uppercase tracking-tight">Authentication Engine</h2>
                                <p className="text-xs text-zinc-500 font-medium">Control how Attendees & Exhibitors verify their identity.</p>
                            </div>
                        </div>

                        <div className="space-y-4">
                            {[
                                { id: 'emailOTP', label: 'Email OTP Dispatch', icon: Mail, desc: 'Send 4-digit codes via secure event relay.' },
                                { id: 'smsOTP', label: 'Global SMS Relay', icon: MessageSquare, desc: 'Traditional cellular delivery for offline areas.' },
                                { id: 'whatsappOTP', label: 'WhatsApp Business API', icon: Phone, desc: 'Enterprise WhatsApp messaging for high engagement.' },
                                { id: 'aadhaarAuth', label: 'Aadhaar ID (India)', icon: ShieldCheck, desc: 'Enable 12-digit Aadhaar verification for Indian delegates.' },
                                { id: 'requireOTP', label: 'Enforce MFA', icon: Lock, desc: 'Verify identity on every new session.' },
                            ].map(item => (
                                <div key={item.id} className="p-5 glass-card border-white/5 flex items-center justify-between hover:bg-white/5 transition-colors">
                                    <div className="flex items-center gap-4">
                                        <div className={`p-2.5 rounded-xl border ${securitySettings[item.id] ? 'bg-primary/20 border-primary/30 text-white' : 'bg-white/5 border-white/5 text-zinc-600'}`}>
                                            <item.icon className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <h4 className="font-bold text-sm text-white">{item.label}</h4>
                                            <p className="text-xs text-zinc-500">{item.desc}</p>
                                        </div>
                                    </div>
                                    <button 
                                        onClick={() => toggleSecurity(item.id)}
                                        className={`w-14 h-7 rounded-full relative transition-all shadow-inner ${
                                            securitySettings[item.id] ? 'bg-primary shadow-[0_0_15px_rgba(84,34,255,0.4)]' : 'bg-zinc-800'
                                        }`}
                                    >
                                        <motion.div 
                                            animate={{ x: securitySettings[item.id] ? 28 : 4 }}
                                            className="w-5 h-5 bg-white rounded-full absolute top-1 shadow-md"
                                        />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="glass-panel p-8 border-white/5">
                        <h3 className="font-bold text-white mb-6 uppercase tracking-widest text-xs flex items-center gap-2">
                           <RefreshCw className="w-4 h-4 text-zinc-500" /> Session Management
                        </h3>
                        <div className="grid grid-cols-2 gap-6">
                            <div>
                                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block mb-2">Token Expiry</label>
                                <select value={securitySettings.sessionExpiry} onChange={e => setSecuritySettings(s => ({ ...s, sessionExpiry: e.target.value }))}
                                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-primary/50">
                                    <option value="1h">1 Hour (High Security)</option>
                                    <option value="24h">24 Hours (Balanced)</option>
                                    <option value="7d">7 Days (Casual)</option>
                                </select>
                            </div>
                            <div>
                                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block mb-2">Device Limit</label>
                                <select className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-primary/50">
                                    <option>Single Device</option>
                                    <option>Up to 3 Devices</option>
                                    <option>Unlimited</option>
                                </select>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Sidebar Stats */}
                <div className="col-span-4 space-y-6">
                    <div className="glass-panel p-6 border-indigo-500/20">
                         <h4 className="text-xs font-bold text-indigo-400 mb-4 uppercase tracking-[0.2em]">Live Auth Status</h4>
                         <div className="space-y-4">
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-zinc-500">Node Status</span>
                                <span className="text-green-400 font-mono text-xs">ENCRYPTED // ACTIVE</span>
                            </div>
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-zinc-500">Gateway</span>
                                <span className="text-white font-mono text-xs">global-v4.eventpro.io</span>
                            </div>
                         </div>
                    </div>

                    <div className="p-6 rounded-3xl bg-gradient-to-br from-primary/10 to-transparent border border-white/5">
                        <Zap className="w-8 h-8 text-primary mb-4" />
                        <h4 className="text-white font-bold mb-2">Omnichannel Verified</h4>
                        <p className="text-zinc-500 text-xs leading-relaxed mb-4">
                            Your current settings allow attendees to authenticate via any available channel. This decreases registration dropout by 22%.
                        </p>
                        <button className="text-primary text-xs font-bold hover:underline py-2">Read Documentation →</button>
                    </div>
                </div>
            </motion.div>
          )}


        </main>
      </div>

      {/* Global On-Site Spot Registration Modal */}
      <AnimatePresence>
        {showSpotRegistrationModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-6"
            onClick={e => e.target === e.currentTarget && !isPrinting && setShowSpotRegistrationModal(false)}>
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-zinc-900 border border-white/10 rounded-3xl p-8 w-full max-w-xl shadow-2xl overflow-hidden relative">
              
              <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-primary via-purple-500 to-primary" />
              
              <div className="flex justify-between items-center mb-8">
                  <div>
                      <h2 className="text-2xl font-black text-white flex items-center gap-3">
                          <UserPlus className="w-6 h-6 text-primary" /> On-Site Spot Registration
                      </h2>
                      <p className="text-zinc-500 text-sm">{spotStep === 'details' ? 'Issue instant badges for walk-in attendees.' : 'Verify mobile number to authorize badge print.'}</p>
                  </div>
                  <button onClick={() => !isPrinting && setShowSpotRegistrationModal(false)} className="p-2 hover:bg-white/5 rounded-full text-zinc-500 transition-colors"><XCircle className="w-6 h-6" /></button>
              </div>

              {spotStep === 'preview' && spotRegisteredAttendee ? (
                <div className="mb-8 flex flex-col items-center">
                    <p className="text-zinc-400 text-sm mb-4 text-center">Badge preview for {spotRegisteredAttendee.firstName} {spotRegisteredAttendee.lastName}</p>
                    <div className="p-4 bg-zinc-800/50 rounded-2xl border border-white/10">
                        <DynamicBadge
                            design={eventData?.badgeDesign}
                            attendee={spotRegisteredAttendee}
                            eventName={eventData?.name || 'Event'}
                        />
                    </div>
                    <div className="flex gap-3 mt-6 w-full">
                        <button onClick={() => window.print()} className="flex-1 py-3 bg-white/5 border border-white/10 rounded-xl text-white font-bold hover:bg-white/10 transition-colors text-sm">Print Badge</button>
                        <button
                            onClick={() => {
                                setShowSpotRegistrationModal(false);
                                setSpotStep('details');
                                setSpotAttendee({ firstName: '', lastName: '', email: '', company: '', designation: '', phone: '', ticket: 'General Delegate' });
                                setSpotOtp(['', '', '', '', '', '']);
                                setSpotRegisteredAttendee(null);
                            }}
                            className="flex-1 py-3 bg-primary text-white rounded-xl font-bold hover:bg-primary/90 transition-colors text-sm"
                        >
                            Done
                        </button>
                    </div>
                </div>
              ) : spotStep === 'details' ? (
                <div className="grid grid-cols-2 gap-5 mb-8">
                    <div className="col-span-1">
                        <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block mb-2">First Name *</label>
                        <input value={spotAttendee.firstName} onChange={e => setSpotAttendee(s => ({ ...s, firstName: e.target.value }))}
                          placeholder="e.g. John" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-primary/50 transition-colors" />
                    </div>
                    <div className="col-span-1">
                        <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block mb-2">Last Name *</label>
                        <input value={spotAttendee.lastName} onChange={e => setSpotAttendee(s => ({ ...s, lastName: e.target.value }))}
                          placeholder="e.g. Wick" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-primary/50 transition-colors" />
                    </div>
                    <div className="col-span-2">
                        <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block mb-2">Professional Email *</label>
                        <input type="email" value={spotAttendee.email} onChange={e => setSpotAttendee(s => ({ ...s, email: e.target.value }))}
                          placeholder="john.wick@continental.com" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-primary/50 transition-colors" />
                    </div>
                    <div className="col-span-1">
                        <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block mb-2">Company / Organization</label>
                        <input value={spotAttendee.company} onChange={e => setSpotAttendee(s => ({ ...s, company: e.target.value }))}
                          placeholder="e.g. Quantum Dynamics" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-primary/50 transition-colors" />
                    </div>
                    <div className="col-span-1">
                        <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block mb-2">Designation</label>
                        <input value={spotAttendee.designation} onChange={e => setSpotAttendee(s => ({ ...s, designation: e.target.value }))}
                          placeholder="e.g. CTO" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-primary/50 transition-colors" />
                    </div>
                    <div className="col-span-1">
                        <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block mb-2">Phone Number *</label>
                        <input value={spotAttendee.phone} onChange={e => setSpotAttendee(s => ({ ...s, phone: e.target.value }))}
                          placeholder="+91 00000 00000" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-primary/50 transition-colors" />
                    </div>
                    <div className="col-span-1">
                        <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block mb-2">Ticket Category</label>
                        <select value={spotAttendee.ticket} onChange={e => setSpotAttendee(s => ({ ...s, ticket: e.target.value }))}
                          className="w-full bg-zinc-800 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-primary/50">
                          {tickets.map(t => (
                              <option key={t.id} value={t.name}>{t.name} ({t.price})</option>
                          ))}
                        </select>
                    </div>
                </div>
              ) : (
                <div className="mb-8">
                    <div className="flex justify-center gap-3 mb-8">
                        {spotOtp.map((digit, idx) => (
                            <input key={idx} id={`spot-otp-${idx}`} type="text" maxLength={1} value={digit}
                                onChange={e => {
                                    const newOtp = [...spotOtp];
                                    newOtp[idx] = e.target.value.slice(-1);
                                    setSpotOtp(newOtp);
                                    if (e.target.value && idx < 5) document.getElementById(`spot-otp-${idx + 1}`).focus();
                                }}
                                className="w-12 h-16 bg-white/5 border border-white/10 rounded-xl text-center text-2xl font-bold text-white focus:border-primary/50 outline-none" />
                        ))}
                    </div>
                    {spotAuthError && <p className="text-red-400 text-xs text-center mb-4">{spotAuthError}</p>}
                    <p className="text-zinc-500 text-xs text-center">A 6-digit code has been sent to {spotAttendee.phone}</p>
                </div>
              )}

              {spotStep !== 'preview' && (
              <div className="flex gap-4">
                  <button onClick={() => spotStep === 'details' ? setShowSpotRegistrationModal(false) : setSpotStep('details')} disabled={isPrinting} className="flex-1 py-4 bg-white/5 border border-white/10 rounded-2xl text-white font-bold hover:bg-white/10 transition-colors disabled:opacity-30">
                    {spotStep === 'details' ? 'Cancel' : 'Back'}
                  </button>
                  <button
                      onClick={spotStep === 'details' ? requestSpotOTP : verifyAndRegisterSpot}
                      disabled={isPrinting || (spotStep === 'otp' && spotOtp.some(d => !d))}
                      className={`flex-[2] py-4 rounded-2xl font-black transition-all flex items-center justify-center gap-3 shadow-lg ${
                          isPrinting ? 'bg-amber-500 text-white cursor-wait' : 'bg-primary text-white hover:bg-primary/90 shadow-[0_10px_30px_rgba(84,34,255,0.3)]'
                      }`}>
                      {isPrinting ? (
                          <>
                              <RefreshCw className="w-6 h-6 animate-spin" />
                              <span>Printing Badge...</span>
                          </>
                      ) : (
                          <>
                              {spotStep === 'details' ? <SendIcon className="w-6 h-6" /> : <BadgeCheck className="w-6 h-6" />}
                              <span>{spotStep === 'details' ? 'Verify Mobile' : 'Confirm & Print'}</span>
                          </>
                      )}
                  </button>
              </div>
              )}
              <div id="spot-recaptcha-container"></div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </PageWrapper>
  );
};

export default AdminDashboard;
