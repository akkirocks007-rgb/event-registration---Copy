import React, { useState, useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import FormattedDateInput from './FormattedDateInput';
import { db } from '../firebase';
import { collection, onSnapshot, setDoc, doc, deleteDoc } from 'firebase/firestore';
import {
  ShieldCheck, ShieldX, Clock, Edit3, Save, X, Plus, Trash2,
  CheckCircle2, AlertCircle, Info, AlertTriangle, Mail
} from 'lucide-react';

import { TICKET_TYPES, DEFAULT_ZONE_RULES } from '../utils/zoneRules';

// ─── Blank zone template ──────────────────────────────────────────────────────
const blankZone = () => ({
  gateId:         '',
  gateName:       '',
  gateIcon:       '\uD83D\uDCCD',
  date:           '', // empty for daily/any
  allowUpgrade:   true, // toggle marketing automated email
  allowedTickets: ['organiser'],
  timeWindow:     { always: false, start: '09:00', end: '18:00' },
});

const QUICK_ICONS = ['\uD83D\uDEAA','\uD83C\uDFDB️','\uD83D\uDC8E','\uD83D\uDCDA','\uD83C\uDFAA','\uD83C\uDF81','\uD83C\uDFE2','\uD83C\uDFA4','\uD83C\uDFAD','\uD83C\uDF7D️','\uD83D\uDEBB','\uD83C\uDD7F️','\uD83C\uDFCB️','\uD83C\uDFAF','\uD83D\uDD12','\uD83D\uDECE️','\uD83C\uDF3F','\uD83D\uDE91','\uD83D\uDCE1','\uD83D\uDDA5️'];

// ─── Zone Rules Manager UI ────────────────────────────────────────────────────
const ZoneRulesManager = () => {
  const [rules, setRules]               = useState([]);
  const [agendas, setAgendas]           = useState([]);
  const [editingGate, setEditingGate]   = useState(null);
  const [draftRule, setDraftRule]       = useState(null);
  const [isAdding, setIsAdding]         = useState(false);
  const [newZone, setNewZone]           = useState(blankZone());
  const [deleteConfirm, setDeleteConfirm] = useState(null); // gateId to confirm delete
  const [saving, setSaving]             = useState(false);
  const [nameError, setNameError]       = useState('');

  useEffect(() => {
    try {
      const unsub = onSnapshot(collection(db, 'zoneRules'), snap => {
        const data = snap.docs.map(d => ({ gateId: d.id, ...d.data() }));
        setRules(data.length > 0 ? data : DEFAULT_ZONE_RULES);
      }, () => setRules(DEFAULT_ZONE_RULES));
      return () => unsub();
    } catch {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRules(DEFAULT_ZONE_RULES);
    }
  }, []);

  useEffect(() => {
    try {
      const unsub = onSnapshot(collection(db, 'agendas'), snap => {
        setAgendas(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      }, () => {});
      return () => unsub();
    } catch { /* ignore agenda fetch errors */ }
  }, []);

  // ─── Helpers ───────────────────────────────────────────────────────────────
  const toGateId = (name) =>
    name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  const openEdit = (rule) => {
    setDraftRule(JSON.parse(JSON.stringify(rule)));
    setEditingGate(rule.gateId);
  };

  const saveEdit = async () => {
    setSaving(true);
    try { await setDoc(doc(db, 'zoneRules', draftRule.gateId), draftRule); }
    catch { setRules(prev => prev.map(r => r.gateId === draftRule.gateId ? draftRule : r)); }
    setSaving(false);
    setEditingGate(null);
    setDraftRule(null);
  };

  const toggleTicket = (ticketId, target, setter) => {
    setter(r => ({
      ...r,
      allowedTickets: r.allowedTickets.includes(ticketId)
        ? r.allowedTickets.filter(t => t !== ticketId)
        : [...r.allowedTickets, ticketId],
    }));
  };

  const addZone = async () => {
    setNameError('');
    if (!newZone.gateName.trim()) { setNameError('Zone name is required'); return; }
    const gateId = toGateId(newZone.gateName);
    if (rules.find(r => r.gateId === gateId)) { setNameError('A zone with this name already exists'); return; }
    const payload = { ...newZone, gateId };
    setSaving(true);
    try { await setDoc(doc(db, 'zoneRules', gateId), payload); }
    catch (err) { console.error(err); setRules(prev => [...prev, payload]); }
    setSaving(false);
    setIsAdding(false);
    setNewZone(blankZone());
  };

  const deleteZone = async (gateId) => {
    try { await deleteDoc(doc(db, 'zoneRules', gateId)); }
    catch (err) { console.error(err); setRules(prev => prev.filter(r => r.gateId !== gateId)); }
    setDeleteConfirm(null);
  };

  // ─── Reusable ticket toggle grid ─────────────────────────────────────────
  const renderTicketGrid = (rule, setter) => {
    const agendaTickets = agendas.map(a => ({
      id: a.id,
      label: a.title,
      color: 'text-indigo-400',
      bg: 'bg-indigo-400/10',
      border: 'border-indigo-400/20'
    }));
    
    const combinedTickets = [
        ...TICKET_TYPES.filter(t => t.id !== 'organiser'),
        ...agendaTickets
    ];

    return (
    <div>
      <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block mb-3">
        Allowed Ticket Types <span className="text-zinc-600 normal-case font-normal">(click to toggle)</span>
      </label>
      <div className="p-3 rounded-xl bg-purple-400/5 border border-purple-400/20 mb-3 flex items-center gap-3">
        <CheckCircle2 className="w-4 h-4 text-purple-400" />
        <div>
          <p className="text-purple-300 text-sm font-bold">Organiser / Staff</p>
          <p className="text-purple-400/60 text-xs">Always allowed — cannot be removed</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {combinedTickets.map(ticket => {
          const allowed = rule.allowedTickets.includes(ticket.id);
          return (
            <button key={ticket.id} onClick={() => toggleTicket(ticket.id, rule, setter)}
              className={`p-3 rounded-xl border flex items-center gap-2.5 transition-all text-left ${
                allowed ? `${ticket.bg} ${ticket.border} ${ticket.color}` : 'bg-white/5 border-white/10 text-zinc-500 hover:border-white/20'
              }`}>
              {allowed
                ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                : <div className="w-4 h-4 rounded-full border-2 border-zinc-600 flex-shrink-0" />}
              <span className="text-sm font-bold flex-1 truncate">{ticket.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
  };

  const renderTimeGrid = (rule, setter) => (
    <div className="space-y-4">
      {/* Upgrade / Marketing Toggle */}
      <button onClick={() => setter(r => ({ ...r, allowUpgrade: !r.allowUpgrade }))}
        className={`w-full py-2.5 rounded-xl border font-bold text-xs transition-all flex items-center justify-between px-4 ${
          rule.allowUpgrade ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-300' : 'bg-zinc-800/50 border-white/5 text-zinc-500'
        }`}>
        <div className="flex items-center gap-2">
          <Mail className="w-4 h-4" />
          <span>ALLOW AUTOMATED UPSELL INVITE</span>
        </div>
        <div className={`w-10 h-5 rounded-full relative transition-colors ${rule.allowUpgrade ? 'bg-indigo-500' : 'bg-zinc-700'}`}>
          <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${rule.allowUpgrade ? 'right-1' : 'left-1'}`} />
        </div>
      </button>

      {/* Date Picker */}
      <div>
        <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block mb-1.5">Scheduled Date (DD-MM-YYYY)</label>
        <div className="flex items-center gap-3">
          <FormattedDateInput value={rule.date || ''}
            onChange={e => setter(r => ({ ...r, date: e.target.value }))}
            className="flex-1 px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white outline-none focus:border-primary/50 transition-colors" />
          <button onClick={() => setter(r => ({ ...r, date: '' }))}
            className={`px-3 py-2.5 rounded-xl border text-xs font-bold transition-all ${
              !rule.date ? 'bg-primary/20 border-primary/40 text-primary' : 'bg-white/5 border-white/10 text-zinc-500 hover:text-white'
            }`}>
            Daily / Any
          </button>
        </div>
      </div>

      {/* Time Window */}
      <div>
        <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block mb-3">Access Hours</label>
        <button onClick={() => setter(r => ({ ...r, timeWindow: { ...r.timeWindow, always: !r.timeWindow?.always } }))}
          className={`w-full py-2.5 rounded-xl border font-bold text-sm transition-all flex items-center justify-center gap-2 mb-3 ${
            rule.timeWindow?.always ? 'bg-green-500/10 border-green-500/30 text-green-400' : 'bg-white/5 border-white/10 text-zinc-400 hover:text-white'
          }`}>
          {rule.timeWindow?.always ? <CheckCircle2 className="w-4 h-4" /> : <div className="w-4 h-4 rounded border-2 border-zinc-600" />}
          Open 24/7 (no time restriction)
        </button>
        {!rule.timeWindow?.always && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-zinc-600 uppercase tracking-widest block mb-1">Open from</label>
              <input type="time" value={rule.timeWindow?.start || '09:00'}
                onChange={e => setter(r => ({ ...r, timeWindow: { ...r.timeWindow, start: e.target.value } }))}
                className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white outline-none focus:border-primary/50 transition-colors" />
            </div>
            <div>
              <label className="text-[10px] text-zinc-600 uppercase tracking-widest block mb-1">Close at</label>
              <input type="time" value={rule.timeWindow?.end || '18:00'}
                onChange={e => setter(r => ({ ...r, timeWindow: { ...r.timeWindow, end: e.target.value } }))}
                className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white outline-none focus:border-primary/50 transition-colors" />
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-2xl font-bold text-white">Zone Access Control</h2>
          <p className="text-zinc-500 text-sm mt-1">Define which ticket types can enter each zone and during what hours. The scanner enforces these rules in real-time.</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
            {[
              { icon: ShieldCheck, color: 'text-green-400', label: 'Allowed' },
              { icon: ShieldX,     color: 'text-red-400',   label: 'Blocked' },
              { icon: Clock,       color: 'text-amber-400', label: 'Time-gated' },
            ].map((item) => {
              const IconComponent = item.icon;
              return (
              <div key={item.label} className="flex items-center gap-1.5 text-xs text-zinc-500">
                <IconComponent className={`w-4 h-4 ${item.color}`} /> {item.label}
              </div>
              );
            })}
          </div>
          <button onClick={() => { setIsAdding(true); setNewZone(blankZone()); setNameError(''); }}
            className="btn-primary flex items-center gap-2 text-sm">
            <Plus className="w-4 h-4" /> Add Zone
          </button>
        </div>
      </div>

      {/* Bypass notice */}
      <div className="flex items-start gap-3 p-4 bg-purple-500/5 border border-purple-500/20 rounded-xl">
        <Info className="w-4 h-4 text-purple-400 flex-shrink-0 mt-0.5" />
        <p className="text-sm text-purple-300">
          <strong>Organiser / Staff passes always bypass all zone restrictions</strong> — full 24/7 access to every gate regardless of rules below.
        </p>
      </div>

      {/* Zone cards */}
      <div className="grid grid-cols-1 gap-3">
        {rules.map((rule, i) => (
          <motion.div key={rule.gateId} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}
            className="glass-panel p-5 group">
            <div className="flex items-start justify-between gap-4">
              {/* Zone info */}
              <div className="flex items-center gap-3 flex-shrink-0 w-52">
                <div className="text-3xl w-12 h-12 flex items-center justify-center bg-white/5 border border-white/10 rounded-xl">{rule.gateIcon}</div>
                <div>
                  <h3 className="font-bold text-white">{rule.gateName}</h3>
                  <div className="flex flex-col gap-1 mt-1.5">
                    {rule.date && (
                      <span className="text-[10px] text-primary bg-primary/10 border border-primary/20 px-2 py-0.5 rounded-full font-black uppercase tracking-tighter w-fit">
                        \uD83D\uDDD3️ {new Date(rule.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                      </span>
                    )}
                    {rule.timeWindow?.always
                      ? <span className="text-[10px] text-green-400 bg-green-400/10 border border-green-400/20 px-2 py-0.5 rounded-full font-bold w-fit">Open 24/7</span>
                      : <span className="text-[10px] text-amber-400 bg-amber-400/10 border border-amber-400/20 px-2 py-0.5 rounded-full font-bold flex items-center gap-1 w-fit">
                          <Clock className="w-2.5 h-2.5" /> {rule.timeWindow?.start} – {rule.timeWindow?.end}
                        </span>}
                  </div>
                </div>
              </div>

              {/* Ticket chips */}
              <div className="flex-1 flex flex-wrap gap-2">
                {TICKET_TYPES.filter(t => t.id !== 'organiser').map(ticket => {
                  const allowed = rule.allowedTickets.includes(ticket.id);
                  return (
                    <span key={ticket.id} className={`text-[10px] font-bold px-2.5 py-1 rounded-full border flex items-center gap-1 ${
                      allowed ? `${ticket.bg} ${ticket.color} ${ticket.border}` : 'bg-white/3 text-zinc-700 border-white/5 line-through'
                    }`}>
                      {allowed ? <ShieldCheck className="w-3 h-3" /> : <ShieldX className="w-3 h-3" />}
                      {ticket.label}
                    </span>
                  );
                })}
              </div>

              {/* Actions — visible on hover */}
              <div className="flex items-center gap-2 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => openEdit(rule)}
                  className="flex items-center gap-1.5 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-all text-xs font-bold">
                  <Edit3 className="w-3.5 h-3.5" /> Edit
                </button>
                <button onClick={() => setDeleteConfirm(rule.gateId)}
                  className="p-2 bg-white/5 border border-white/10 rounded-lg text-zinc-600 hover:text-red-400 hover:bg-red-500/10 hover:border-red-500/20 transition-all">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </motion.div>
        ))}

        {rules.length === 0 && (
          <div className="py-20 flex flex-col items-center text-center glass-panel">
            <ShieldX className="w-12 h-12 text-zinc-700 mb-4" />
            <p className="text-zinc-500 font-medium">No zones defined yet.</p>
            <p className="text-zinc-700 text-sm mt-1">Click "Add Zone" to create your first access rule.</p>
          </div>
        )}
      </div>

      {/* ─── Add Zone Modal ─── */}
      <AnimatePresence>
        {isAdding && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 overflow-y-auto">
            <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9 }}
              className="w-full max-w-lg glass-panel rounded-2xl border border-white/10 p-8 shadow-2xl my-8">

              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <Plus className="w-5 h-5 text-primary" /> Add New Zone
                </h2>
                <button onClick={() => setIsAdding(false)} className="p-2 rounded-lg hover:bg-white/10 text-zinc-500 hover:text-white transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-5">
                {/* Name + Icon */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block mb-1.5">Zone Name <span className="text-red-400">*</span></label>
                    <input type="text" value={newZone.gateName}
                      onChange={e => { setNewZone(z => ({ ...z, gateName: e.target.value })); setNameError(''); }}
                      placeholder="e.g. Networking Lounge"
                      className={`w-full px-4 py-3 bg-white/5 border rounded-xl text-white placeholder-zinc-600 outline-none transition-colors ${nameError ? 'border-red-500/50' : 'border-white/10 focus:border-primary/50'}`} />
                    {nameError && <p className="text-red-400 text-xs mt-1">{nameError}</p>}
                    <p className="text-zinc-600 text-[10px] mt-1 font-mono">
                      id: {newZone.gateName ? toGateId(newZone.gateName) : '—'}
                    </p>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block mb-1.5">Icon</label>
                    <input type="text" value={newZone.gateIcon} maxLength={2}
                      onChange={e => setNewZone(z => ({ ...z, gateIcon: e.target.value }))}
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white text-2xl text-center outline-none focus:border-primary/50 transition-colors" />
                  </div>
                </div>

                {/* Quick icon picker */}
                <div>
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block mb-2">Quick Pick Icon</label>
                  <div className="flex flex-wrap gap-2">
                    {QUICK_ICONS.map(icon => (
                      <button key={icon} onClick={() => setNewZone(z => ({ ...z, gateIcon: icon }))}
                        className={`w-9 h-9 rounded-lg text-lg flex items-center justify-center transition-all border ${
                          newZone.gateIcon === icon ? 'bg-primary/20 border-primary/50' : 'bg-white/5 border-white/10 hover:bg-white/10'
                        }`}>{icon}</button>
                    ))}
                  </div>
                </div>

                {renderTicketGrid(newZone, setNewZone)}
                {renderTimeGrid(newZone, setNewZone)}
              </div>

              <div className="flex gap-3 mt-6">
                <button onClick={() => setIsAdding(false)}
                  className="flex-1 py-3 bg-white/5 border border-white/10 text-white font-bold rounded-xl hover:bg-white/10 transition-colors">
                  Cancel
                </button>
                <button onClick={addZone} disabled={saving}
                  className="flex-1 py-3 btn-primary font-bold rounded-xl flex items-center justify-center gap-2 disabled:opacity-50">
                  {saving ? <motion.div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full" animate={{ rotate: 360 }} transition={{ duration: 0.6, repeat: Infinity, ease: 'linear' }} />
                    : <><Plus className="w-4 h-4" /> Create Zone</>}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Edit Modal ─── */}
      <AnimatePresence>
        {editingGate && draftRule && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 overflow-y-auto">
            <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9 }}
              className="w-full max-w-lg glass-panel rounded-2xl border border-white/10 p-8 shadow-2xl my-8">

              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{draftRule.gateIcon}</span>
                  <h2 className="text-xl font-bold text-white">Edit: {draftRule.gateName}</h2>
                </div>
                <button onClick={() => { setEditingGate(null); setDraftRule(null); }}
                  className="p-2 rounded-lg hover:bg-white/10 text-zinc-500 hover:text-white transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-5">
                {renderTicketGrid(draftRule, setDraftRule)}
                {renderTimeGrid(draftRule, setDraftRule)}
              </div>

              <div className="flex gap-3 mt-6">
                <button onClick={() => { setEditingGate(null); setDraftRule(null); }}
                  className="flex-1 py-3 bg-white/5 border border-white/10 text-white font-bold rounded-xl hover:bg-white/10 transition-colors">
                  Cancel
                </button>
                <button onClick={saveEdit} disabled={saving}
                  className="flex-1 py-3 btn-primary font-bold rounded-xl flex items-center justify-center gap-2 disabled:opacity-50">
                  {saving ? <motion.div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full" animate={{ rotate: 360 }} transition={{ duration: 0.6, repeat: Infinity, ease: 'linear' }} />
                    : <><Save className="w-4 h-4" /> Save Changes</>}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Delete Confirm ─── */}
      <AnimatePresence>
        {deleteConfirm && (() => {
          const zone = rules.find(r => r.gateId === deleteConfirm);
          return (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
              onClick={() => setDeleteConfirm(null)}>
              <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }}
                className="w-full max-w-sm glass-panel rounded-2xl border border-red-500/20 p-8 shadow-2xl"
                onClick={e => e.stopPropagation()}>
                <div className="flex flex-col items-center text-center">
                  <div className="w-16 h-16 bg-red-500/10 border border-red-500/20 rounded-full flex items-center justify-center mb-4">
                    <AlertTriangle className="w-8 h-8 text-red-400" />
                  </div>
                  <h2 className="text-xl font-bold text-white mb-2">Delete Zone?</h2>
                  <p className="text-zinc-400 text-sm mb-1">
                    You are about to permanently delete:
                  </p>
                  <div className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-xl mb-4">
                    <span className="text-xl">{zone?.gateIcon}</span>
                    <span className="text-white font-bold">{zone?.gateName}</span>
                  </div>
                  <p className="text-zinc-600 text-xs mb-6">Scanners at this zone will fall back to open access until reassigned.</p>
                  <div className="flex gap-3 w-full">
                    <button onClick={() => setDeleteConfirm(null)}
                      className="flex-1 py-3 bg-white/5 border border-white/10 text-white font-bold rounded-xl hover:bg-white/10 transition-colors">
                      Keep It
                    </button>
                    <button onClick={() => deleteZone(deleteConfirm)}
                      className="flex-1 py-3 bg-red-500/20 border border-red-500/30 text-red-400 font-bold rounded-xl hover:bg-red-500/30 transition-colors flex items-center justify-center gap-2">
                      <Trash2 className="w-4 h-4" /> Delete
                    </button>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          );
        })()}
      </AnimatePresence>
    </div>
  );
};

export default ZoneRulesManager;
