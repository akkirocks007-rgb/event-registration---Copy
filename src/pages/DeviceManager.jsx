import React, { useState, useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import Sidebar from '../components/Sidebar';
import PageWrapper from '../components/PageWrapper';
import { db } from '../firebase';
import { collection, onSnapshot, addDoc, deleteDoc, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import {
  Monitor, Plus, Trash2, Edit3, CheckCircle2, Copy, Wifi, WifiOff,
  MapPin, QrCode, Gift, Tv, Settings, RefreshCw, Clock, User, Phone, Briefcase, History, X, Camera,
  UserPlus, CreditCard, Coffee, Zap, Star
} from 'lucide-react';

const GATE_OPTIONS = [
  // Entry gates
  { id: 'main-entrance',  label: 'Main Entrance',       icon: '🚪', mode: 'entry' },
  { id: 'hall-a',         label: 'Hall A',              icon: '🏛️', mode: 'entry' },
  { id: 'hall-b',         label: 'Hall B',              icon: '🏛️', mode: 'entry' },
  { id: 'vip-lounge',     label: 'VIP Lounge',          icon: '💎', mode: 'entry' },
  { id: 'workshop-1',     label: 'Workshop Room 1',     icon: '📚', mode: 'entry' },
  { id: 'workshop-2',     label: 'Workshop Room 2',     icon: '📚', mode: 'entry' },
  { id: 'exhibition',     label: 'Exhibition Floor',    icon: '🎪', mode: 'entry' },
  { id: 'exit-gate',      label: 'Exit Gate',           icon: '🚶', mode: 'entry' },
  // Service stations
  { id: 'spot-reg-free',  label: 'Spot Reg (Free)',     icon: '📝', mode: 'spot_reg_free' },
  { id: 'spot-reg-paid',  label: 'Spot Reg (Paid)',     icon: '💵', mode: 'spot_reg_paid' },
  { id: 'badge-print',    label: 'Badge Printing',      icon: '🎫', mode: 'badge_print' },
  { id: 'giveaway',       label: 'Giveaway Station',    icon: '🎁', mode: 'giveaway' },
  { id: 'food-counter',   label: 'Food Counter',        icon: '🍕', mode: 'food_counter' },
  { id: 'lead-exchange',  label: 'Lead Exchange',       icon: '🤝', mode: 'lead_exchange' },
];

const MODE_OPTIONS = [
  { id: 'entry',          label: 'Entry Scanner',       icon: QrCode,   color: 'text-primary',    bg: 'bg-primary/10',    border: 'border-primary/20' },
  { id: 'spot_reg_free',  label: 'Spot Reg (Free)',     icon: UserPlus, color: 'text-emerald-400',bg: 'bg-emerald-400/10',border: 'border-emerald-400/20' },
  { id: 'spot_reg_paid',  label: 'Spot Reg (Paid)',     icon: CreditCard,color:'text-amber-400',  bg: 'bg-amber-400/10',  border: 'border-amber-400/20' },
  { id: 'badge_print',    label: 'Badge Printing',      icon: Star,     color: 'text-indigo-400', bg: 'bg-indigo-400/10', border: 'border-indigo-400/20' },
  { id: 'giveaway',       label: 'Giveaway Station',    icon: Gift,     color: 'text-pink-400',   bg: 'bg-pink-400/10',   border: 'border-pink-400/20' },
  { id: 'food_counter',   label: 'Food Counter',        icon: Coffee,   color: 'text-orange-400', bg: 'bg-orange-400/10', border: 'border-orange-400/20' },
  { id: 'lead_exchange',  label: 'Lead Exchange',       icon: Zap,      color: 'text-cyan-400',   bg: 'bg-cyan-400/10',   border: 'border-cyan-400/20' },
  { id: 'jumbotron',      label: 'Jumbotron Display',   icon: Tv,       color: 'text-zinc-300',   bg: 'bg-white/5',       border: 'border-white/10' },
  { id: 'supervisor',     label: 'Supervisor Desk',     icon: Monitor,  color: 'text-green-400',  bg: 'bg-green-400/10',  border: 'border-green-400/20' },
];

const SEED_DEVICES = [
  { id: 'dev-001', name: 'SUNMI-001', pin: '1111', assignedGate: { id: 'main-entrance', label: 'Main Entrance', icon: '🚪', mode: 'entry' }, mode: 'entry',          status: 'online',  lastSeen: new Date().toISOString() },
  { id: 'dev-002', name: 'SUNMI-002', pin: '2222', assignedGate: { id: 'hall-a',        label: 'Hall A',       icon: '🏛️', mode: 'entry' }, mode: 'entry',          status: 'offline', lastSeen: new Date(Date.now() - 900000).toISOString() },
  { id: 'dev-003', name: 'SUNMI-003', pin: '3333', assignedGate: { id: 'vip-lounge',    label: 'VIP Lounge',   icon: '💎', mode: 'entry' }, mode: 'entry',          status: 'online',  lastSeen: new Date().toISOString() },
  { id: 'dev-004', name: 'SUNMI-004', pin: '4444', assignedGate: { id: 'giveaway',      label: 'Giveaway Station', icon: '🎁', mode: 'giveaway' }, mode: 'giveaway', status: 'offline', lastSeen: new Date(Date.now() - 3600000).toISOString() },
  { id: 'dev-005', name: 'SUNMI-005', pin: '5555', assignedGate: { id: 'food-counter',  label: 'Food Counter', icon: '🍕', mode: 'food_counter' }, mode: 'food_counter', status: 'online', lastSeen: new Date().toISOString() },
  { id: 'dev-006', name: 'SUNMI-006', pin: '6666', assignedGate: { id: 'lead-exchange', label: 'Lead Exchange', icon: '🤝', mode: 'lead_exchange' }, mode: 'lead_exchange', status: 'online', lastSeen: new Date().toISOString() },
];

const genPin = () => String(Math.floor(1000 + Math.random() * 9000));

const DeviceManager = ({ embedded = false }) => {
  const [activeTab, setActiveTab] = useState('devices');
  const [devices, setDevices] = useState([]);
  const [showAddDevice, setShowAddDevice] = useState(false);
  const [copiedPin, setCopiedPin]           = useState(null);
  const [editingId, setEditingId]           = useState(null);
  const [historyDeviceId, setHistoryDeviceId] = useState(null);
  const [newDevice, setNewDevice] = useState({
    name: '',
    mode: 'scanner',
    assignedGate: GATE_OPTIONS[0],
    pin: genPin(),
    assignedTo: { name: '', phone: '', designation: '' },
  });

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'devices'), snap => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setDevices(data.length > 0 ? data : SEED_DEVICES);
    }, () => setDevices(SEED_DEVICES));
    return () => unsub();
  }, []);

  const createDevice = async () => {
    if (!newDevice.name.trim()) return;
    const payload = {
      name: newDevice.name.trim(),
      mode: newDevice.mode,
      assignedGate: newDevice.assignedGate,
      pin: newDevice.pin,
      assignedTo: newDevice.assignedTo.name.trim() ? newDevice.assignedTo : null,
      currentHolder: null,
      status: 'offline',
      lastSeen: null,
      createdAt: serverTimestamp(),
    };
    try {
      await addDoc(collection(db, 'devices'), payload);
    } catch {
      setDevices(prev => [...prev, { ...payload, id: `dev-${Date.now()}` }]);
    }
    setNewDevice({ name: '', mode: 'scanner', assignedGate: GATE_OPTIONS[0], pin: genPin(), assignedTo: { name: '', phone: '', designation: '' } });
    setShowAddDevice(false);
  };

  const removeDevice = async (id) => {
    try {
      await deleteDoc(doc(db, 'devices', id));
    } catch {
      setDevices(prev => prev.filter(d => d.id !== id));
    }
  };

  const reassignGate = async (deviceId, gate) => {
    try {
      await updateDoc(doc(db, 'devices', deviceId), { assignedGate: gate });
    } catch {
      setDevices(prev => prev.map(d => d.id === deviceId ? { ...d, assignedGate: gate } : d));
    }
    setEditingId(null);
  };

  const copyPin = (pin, id) => {
    navigator.clipboard.writeText(pin).catch(() => {});
    setCopiedPin(id);
    setTimeout(() => setCopiedPin(null), 2000);
  };

  const onlineCount  = devices.filter(d => d.status === 'online').length;
  const offlineCount = devices.filter(d => d.status === 'offline').length;

  const content = (
    <>
      <header className={`flex justify-between items-start mb-10 ${embedded ? '' : ''}`}>
        <div>
          {!embedded && (
            <div className="flex items-center gap-2 text-sm text-zinc-500 mb-2">
              <span>Owner HQ</span>
              <span className="text-zinc-700">›</span>
              <span className="text-zinc-300">Device Registry</span>
            </div>
          )}
          <h2 className="text-3xl font-bold text-white">Device Registry</h2>
          <p className="text-zinc-400 text-sm mt-1">Manage POS terminals, assign gates & generate PIN codes for field staff.</p>
        </div>
        <button onClick={() => { setNewDevice({ name: '', mode: 'scanner', assignedGate: GATE_OPTIONS[0], pin: genPin() }); setShowAddDevice(true); }}
          className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> Register Device
        </button>
      </header>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-6 mb-10">
            {[
              { label: 'Total Devices',  value: devices.length, icon: Monitor,        color: 'text-white',      border: 'border-white/10' },
              { label: 'Online Now',     value: onlineCount,    icon: Wifi,            color: 'text-green-400',  border: 'border-green-500/20' },
              { label: 'Offline',        value: offlineCount,   icon: WifiOff,         color: 'text-zinc-500',   border: 'border-zinc-700/30' },
            ].map(stat => (
              <div key={stat.label} className={`glass-panel p-6 border ${stat.border}`}>
                <div className="flex justify-between items-center mb-3">
                  <p className="text-zinc-500 text-xs font-bold uppercase tracking-widest">{stat.label}</p>
                  <stat.icon className={`w-5 h-5 ${stat.color}`} />
                </div>
                <p className={`text-4xl font-black ${stat.color}`}>{stat.value}</p>
              </div>
            ))}
          </div>

          {/* Device Table */}
          <div className="glass-panel overflow-hidden">
            <div className="p-5 border-b border-white/5 flex justify-between items-center">
              <h2 className="font-bold text-white">All Registered Devices</h2>
              <button className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-white transition-colors">
                <RefreshCw className="w-3.5 h-3.5" /> Refresh
              </button>
            </div>

            <table className="w-full">
              <thead>
                <tr className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest border-b border-white/5">
                  <th className="text-left px-6 py-3">Device</th>
                  <th className="text-left px-6 py-3">Assigned Gate</th>
                  <th className="text-left px-6 py-3">Mode</th>
                  <th className="text-left px-6 py-3">Custodian</th>
                  <th className="text-left px-6 py-3">PIN</th>
                  <th className="text-left px-6 py-3">Status</th>
                  <th className="text-left px-6 py-3">Last Seen</th>
                  <th className="px-6 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {devices.map((device, i) => {
                  const modeInfo = MODE_OPTIONS.find(m => m.id === device.mode);
                  const ModeIcon = modeInfo?.icon || Monitor;
                  const gateIcon = device.assignedGate?.icon || '📍';
                  const isOnline = device.status === 'online';
                  const lastSeen = device.lastSeen
                    ? new Date(device.lastSeen).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                    : '—';

                  return (
                    <motion.tr key={device.id}
                      initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}
                      className="group hover:bg-white/[0.02] transition-colors">

                      {/* Device Name */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 bg-white/5 border border-white/10 rounded-xl flex items-center justify-center">
                            <Monitor className="w-4 h-4 text-zinc-400" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-bold text-white text-sm">{device.name}</p>
                              {device.tvConnected && (
                                <div className="group/tv relative">
                                  <Tv className="w-3.5 h-3.5 text-indigo-400 group-hover:scale-110 transition-transform" />
                                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-indigo-600 text-white text-[8px] font-black rounded opacity-0 group-hover/tv:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-20">
                                    TV Display Active
                                  </div>
                                </div>
                              )}
                            </div>
                            <p className="text-[10px] text-zinc-600 font-mono">{device.id?.slice(0, 8)}</p>
                          </div>
                        </div>
                      </td>

                      {/* Gate */}
                      <td className="px-6 py-4">
                        {editingId === device.id ? (
                          <select
                            autoFocus
                            className="bg-zinc-900 border border-primary/40 text-white text-sm rounded-lg px-2 py-1.5 outline-none"
                            defaultValue={device.assignedGate?.id}
                            onChange={e => {
                              const gate = GATE_OPTIONS.find(g => g.id === e.target.value);
                              reassignGate(device.id, gate);
                            }}
                            onBlur={() => setEditingId(null)}
                          >
                            {GATE_OPTIONS.map(g => <option key={g.id} value={g.id}>{g.icon} {g.label}</option>)}
                          </select>
                        ) : (
                          <button onClick={() => setEditingId(device.id)}
                            className="flex items-center gap-2 group/gate hover:text-white transition-colors">
                            <span className="text-lg">{gateIcon}</span>
                            <span className="text-sm text-zinc-300 font-medium">{device.assignedGate?.label || '—'}</span>
                            <Edit3 className="w-3 h-3 text-zinc-600 opacity-0 group-hover/gate:opacity-100 transition-opacity" />
                          </button>
                        )}
                      </td>

                      {/* Mode */}
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-full border ${modeInfo?.bg} ${modeInfo?.color} ${modeInfo?.border}`}>
                          <ModeIcon className="w-3 h-3" />
                          {modeInfo?.label || device.mode}
                        </span>
                      </td>

                      {/* Custodian */}
                      <td className="px-6 py-4">
                        {(() => {
                          const holder = device.currentHolder || device.assignedTo;
                          if (!holder?.name) return <span className="text-zinc-600 text-xs">Not assigned</span>;
                          return (
                            <div>
                              <p className="text-white text-sm font-bold">{holder.name}</p>
                              {holder.designation && <p className="text-zinc-500 text-[11px]">{holder.designation}</p>}
                              {holder.phone && <p className="text-zinc-600 text-[11px] font-mono">{holder.phone}</p>}
                              {device.currentHolder && (
                                <span className="text-[9px] font-bold text-green-400 bg-green-400/10 border border-green-400/20 px-1.5 py-0.5 rounded-full">In Session</span>
                              )}
                            </div>
                          );
                        })()}
                      </td>

                      {/* PIN */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-lg text-white font-bold tracking-[0.2em]">{device.pin}</span>
                          <button onClick={() => copyPin(device.pin, device.id)}
                            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors">
                            {copiedPin === device.id
                              ? <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
                              : <Copy className="w-3.5 h-3.5 text-zinc-500" />}
                          </button>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-green-400 shadow-[0_0_6px_rgba(74,222,128,0.8)]' : 'bg-zinc-600'}`} />
                          <span className={`text-xs font-bold ${isOnline ? 'text-green-400' : 'text-zinc-500'}`}>
                            {isOnline ? 'Online' : 'Offline'}
                          </span>
                        </div>
                      </td>

                      {/* Last Seen */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1.5 text-zinc-500 text-xs">
                          <Clock className="w-3 h-3" />
                          {lastSeen}
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => setHistoryDeviceId(device.id)}
                            className="p-1.5 rounded-lg text-zinc-500 hover:text-primary hover:bg-primary/10 transition-all" title="View custody history">
                            <History className="w-4 h-4" />
                          </button>
                          <button onClick={() => removeDevice(device.id)}
                            className="p-1.5 rounded-lg text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition-all">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>

            {devices.length === 0 && (
              <div className="py-20 flex flex-col items-center text-center">
                <Monitor className="w-12 h-12 text-zinc-700 mb-4" />
                <p className="text-zinc-500 font-medium">No devices registered yet.</p>
                <p className="text-zinc-700 text-sm">Click "Register Device" to add your first POS terminal.</p>
              </div>
            )}
          </div>

          {/* Instructions */}
          <div className="mt-8 p-6 glass-panel border-primary/10 bg-primary/3">
            <h3 className="font-bold text-white mb-4 flex items-center gap-2"><Settings className="w-4 h-4 text-primary" /> How to activate a device</h3>
            <ol className="space-y-2 text-sm text-zinc-400">
              <li className="flex gap-3"><span className="w-5 h-5 bg-primary/20 text-primary rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">1</span> Register the device above with a name, gate, and mode.</li>
              <li className="flex gap-3"><span className="w-5 h-5 bg-primary/20 text-primary rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">2</span> Share the 4-digit PIN with the field supervisor for that gate.</li>
              <li className="flex gap-3"><span className="w-5 h-5 bg-primary/20 text-primary rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">3</span> On the SUNMI device, open EventPro and navigate to <strong className="text-zinc-200">/device-login</strong>.</li>
              <li className="flex gap-3"><span className="w-5 h-5 bg-primary/20 text-primary rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">4</span> Enter the PIN — the device auto-configures and enters scanner/giveaway mode instantly.</li>
            </ol>
          </div>
    </>
  );

  const modals = (
    <>
      {/* Add Device Modal */}
      <AnimatePresence>
        {showAddDevice && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9 }}
              className="w-full max-w-md glass-panel p-8 rounded-2xl border border-white/10 shadow-2xl">
              <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2"><Monitor className="w-5 h-5 text-primary" /> Register New Device</h2>

              <div className="space-y-4">
                <div>
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block mb-1">Device Name</label>
                  <input type="text" value={newDevice.name} onChange={e => setNewDevice(d => ({ ...d, name: e.target.value }))}
                    placeholder="e.g. SUNMI-005 or Tablet-Hall-B"
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-zinc-600 outline-none focus:border-primary/50 transition-colors" />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block mb-1">Assigned Gate</label>
                  <select value={newDevice.assignedGate.id}
                    onChange={e => setNewDevice(d => ({ ...d, assignedGate: GATE_OPTIONS.find(g => g.id === e.target.value) }))}
                    className="w-full px-4 py-3 bg-zinc-900 border border-white/10 rounded-xl text-white outline-none focus:border-primary/50">
                    {GATE_OPTIONS.map(g => <option key={g.id} value={g.id}>{g.icon} {g.label}</option>)}
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block mb-1">Device Mode</label>
                  <div className="grid grid-cols-2 gap-2">
                    {MODE_OPTIONS.map(m => (
                      <button key={m.id} onClick={() => setNewDevice(d => ({ ...d, mode: m.id }))}
                        className={`p-3 rounded-xl border text-left transition-all flex items-center gap-2 ${
                          newDevice.mode === m.id ? `${m.bg} ${m.border} ${m.color}` : 'bg-white/5 border-white/10 text-zinc-400 hover:text-white hover:border-white/20'
                        }`}>
                        <m.icon className="w-4 h-4 flex-shrink-0" />
                        <span className="text-xs font-bold">{m.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Pre-assign Custodian */}
                <div className="p-4 bg-white/3 border border-white/8 rounded-xl space-y-3">
                  <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Pre-Assign Custodian <span className="text-zinc-700 normal-case font-normal">(optional)</span></p>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
                    <input type="text" value={newDevice.assignedTo.name}
                      onChange={e => setNewDevice(d => ({ ...d, assignedTo: { ...d.assignedTo, name: e.target.value } }))}
                      placeholder="Full Name" className="w-full pl-9 pr-3 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white placeholder-zinc-700 text-sm outline-none focus:border-primary/40 transition-colors" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
                      <input type="tel" value={newDevice.assignedTo.phone}
                        onChange={e => setNewDevice(d => ({ ...d, assignedTo: { ...d.assignedTo, phone: e.target.value } }))}
                        placeholder="Phone" className="w-full pl-9 pr-3 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white placeholder-zinc-700 text-sm outline-none focus:border-primary/40 transition-colors" />
                    </div>
                    <div className="relative">
                      <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
                      <input type="text" value={newDevice.assignedTo.designation}
                        onChange={e => setNewDevice(d => ({ ...d, assignedTo: { ...d.assignedTo, designation: e.target.value } }))}
                        placeholder="Role" className="w-full pl-9 pr-3 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white placeholder-zinc-700 text-sm outline-none focus:border-primary/40 transition-colors" />
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/10">
                  <div>
                    <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-1">Device PIN</p>
                    <p className="font-mono text-2xl font-black text-white tracking-[0.25em]">{newDevice.pin}</p>
                  </div>
                  <button onClick={() => setNewDevice(d => ({ ...d, pin: genPin() }))}
                    className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-white transition-colors px-3 py-2 bg-white/5 rounded-lg">
                    <RefreshCw className="w-3.5 h-3.5" /> Regenerate
                  </button>
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button onClick={() => setShowAddDevice(false)}
                  className="flex-1 py-3 bg-white/5 border border-white/10 text-white font-bold rounded-xl hover:bg-white/10 transition-colors">
                  Cancel
                </button>
                <button onClick={createDevice} disabled={!newDevice.name.trim()}
                  className="flex-1 py-3 btn-primary font-bold rounded-xl disabled:opacity-40 disabled:cursor-not-allowed">
                  Create Device
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Custody History Modal */}
      <AnimatePresence>
        {historyDeviceId && (() => {
          const device = devices.find(d => d.id === historyDeviceId);
          if (!device) return null;
          const history    = device.custodyHistory || [];
          const allEntries = [...history, ...(device.currentHolder ? [{ ...device.currentHolder, logoutTime: null }] : [])].reverse();
          const fmt = (iso) => iso ? new Date(iso).toLocaleString('en-IN', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit', hour12:true }) : '';
          const durStr = (a, b) => {
            if (!a || !b) return null;
            const ms = new Date(b) - new Date(a);
            const h = Math.floor(ms/3600000), m = Math.floor((ms%3600000)/60000);
            return h > 0 ? h + 'h ' + m + 'm' : m + 'm';
          };
          return (
            <motion.div key="hist" initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
              onClick={() => setHistoryDeviceId(null)}>
              <motion.div initial={{ scale:0.9, y:20 }} animate={{ scale:1, y:0 }} exit={{ scale:0.9 }}
                className="w-full max-w-lg glass-panel rounded-2xl border border-white/10 shadow-2xl overflow-hidden"
                onClick={e => e.stopPropagation()}>
                <div className="p-6 border-b border-white/5 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-white/5 border border-white/10 rounded-xl flex items-center justify-center">
                      <Monitor className="w-5 h-5 text-zinc-400" />
                    </div>
                    <div>
                      <h2 className="font-bold text-white">{device.name}</h2>
                      <p className="text-xs text-zinc-500">{device.assignedGate?.icon} {device.assignedGate?.label} - Custody Log</p>
                    </div>
                  </div>
                  <button onClick={() => setHistoryDeviceId(null)} className="p-2 rounded-lg hover:bg-white/10 text-zinc-500 hover:text-white transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="p-6 max-h-96 overflow-y-auto space-y-3">
                  {allEntries.length === 0 ? (
                    <div className="py-12 flex flex-col items-center text-center">
                      <History className="w-10 h-10 text-zinc-700 mb-3" />
                      <p className="text-zinc-500 font-medium">No custody history yet.</p>
                      <p className="text-zinc-700 text-sm mt-1">History appears once staff sign in with this PIN.</p>
                    </div>
                  ) : allEntries.map((entry, i) => {
                    const active = !entry.logoutTime;
                    const d = durStr(entry.loginTime, entry.logoutTime);
                    return (
                      <div key={i} className={"p-4 rounded-xl border flex items-start gap-4 " + (active ? "bg-green-500/5 border-green-500/20" : "bg-white/[0.03] border-white/[0.08]")}>
                        <div className={"w-10 h-10 rounded-full flex items-center justify-center font-black text-sm flex-shrink-0 border " + (active ? "bg-green-500/10 border-green-500/20 text-green-400" : "bg-white/5 border-white/10 text-zinc-400")}>
                          {entry.name?.[0]?.toUpperCase() || "?"}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 mb-1">
                            <p className="font-bold text-white text-sm">{entry.name}</p>
                            {active && <span className="text-[9px] font-bold text-green-400 bg-green-400/10 border border-green-400/20 px-1.5 py-0.5 rounded-full">Active</span>}
                            {entry.hasPhoto && <span className="text-[9px] font-bold text-primary bg-primary/10 border border-primary/20 px-1.5 py-0.5 rounded-full flex items-center gap-0.5"><Camera className="w-2.5 h-2.5" /> Photo</span>}
                          </div>
                          {entry.designation && <p className="text-zinc-500 text-xs">{entry.designation}</p>}
                          {entry.phone && <p className="text-zinc-600 text-xs font-mono">{entry.phone}</p>}
                          <div className="flex flex-wrap gap-3 mt-2 text-xs text-zinc-600">
                            <span>In: <span className="text-zinc-400">{fmt(entry.loginTime)}</span></span>
                            {entry.logoutTime && <span>Out: <span className="text-zinc-400">{fmt(entry.logoutTime)}</span></span>}
                            {d && <span>Duration: {d}</span>}
                          </div>
                        </div>
                        <span className="text-[10px] text-zinc-700 font-mono">{i === 0 ? "Latest" : "#" + (allEntries.length - i)}</span>
                      </div>
                    );
                  })}
                </div>
                <div className="px-6 py-4 border-t border-white/5 flex items-center justify-between">
                  <p className="text-xs text-zinc-600">{allEntries.length} session{allEntries.length !== 1 ? "s" : ""} logged</p>
                  <button onClick={() => setHistoryDeviceId(null)} className="px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-zinc-300 text-sm font-medium hover:bg-white/10 transition-colors">Close</button>
                </div>
              </motion.div>
            </motion.div>
          );
        })()}
      </AnimatePresence>
    </>
  );

  if (embedded) {
    return (
      <div className="space-y-6">
        {content}
        {modals}
      </div>
    );
  }

  return (
    <PageWrapper>
      <div className="flex bg-mesh min-h-screen text-slate-100">
        <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} role="owner" />
        <main className="flex-1 ml-72 p-8">
          {content}
        </main>
      </div>
      {modals}
    </PageWrapper>
  );
};

export default DeviceManager;
