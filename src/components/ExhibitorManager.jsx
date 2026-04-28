import React, { useState, useEffect, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Building2, Plus, Upload, Download, Search, Trash2, X, MapPin, Mail, Phone, User, Store, BadgeCheck, Loader2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import { db } from '../firebase';
import { collection, query, where, orderBy, onSnapshot, addDoc, deleteDoc, updateDoc, doc, serverTimestamp } from 'firebase/firestore';

const BLANK_FORM = { company: '', address: '', stallNumber: '', hallName: '', phone: '', email: '', contactPerson: '' };

export default function ExhibitorManager({ eventId }) {
  const [exhibitors, setExhibitors] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState(BLANK_FORM);
  const [generatingPass, setGeneratingPass] = useState(new Set());
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (!eventId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    const q = query(
      collection(db, 'exhibitors'),
      where('eventId', '==', eventId),
      orderBy('createdAt', 'desc'),
    );
    const unsub = onSnapshot(q, snap => {
      setExhibitors(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, [eventId]);

  const handleInputChange = (e) => setFormData(f => ({ ...f, [e.target.name]: e.target.value }));

  const handleAddExhibitor = async (e) => {
    e.preventDefault();
    if (!eventId) return;
    setSaving(true);
    try {
      await addDoc(collection(db, 'exhibitors'), { ...formData, eventId, createdAt: serverTimestamp() });
      setShowModal(false);
      setFormData(BLANK_FORM);
    } catch (err) {
      alert('Failed to save exhibitor: ' + (err.message || err));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Remove this exhibitor?')) return;
    try {
      await deleteDoc(doc(db, 'exhibitors', id));
    } catch {
      setExhibitors(prev => prev.filter(ex => ex.id !== id));
    }
  };

  const handleGeneratePass = async (ex) => {
    if (ex.passGenerated || generatingPass.has(ex.id)) return;
    setGeneratingPass(prev => new Set(prev).add(ex.id));
    try {
      const passId = 'EXH-' + Math.random().toString(36).substr(2, 6).toUpperCase();
      const docRef = await addDoc(collection(db, 'staffPasses'), {
        id: passId,
        eventId,
        name: ex.contactPerson || ex.company,
        email: ex.email || `${ex.company.replace(/\s+/g, '').toLowerCase()}@exhibitor.local`,
        role: 'exhibitor',
        company: ex.company,
        stallNumber: ex.stallNumber || '',
        hallName: ex.hallName || '',
        zone: 'exhibitor-area',
        status: 'issued',
        issuedAt: new Date().toISOString().split('T')[0],
        createdAt: serverTimestamp(),
      });
      await updateDoc(doc(db, 'exhibitors', ex.id), {
        passGenerated: true,
        passId: docRef.id,
      });
    } catch (err) {
      alert('Failed to generate pass: ' + (err.message || err));
    } finally {
      setGeneratingPass(prev => { const s = new Set(prev); s.delete(ex.id); return s; });
    }
  };

  const handleExcelImport = async (e) => {
    const file = e.target.files[0];
    if (!file || !eventId) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      const wb = XLSX.read(evt.target.result, { type: 'binary' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws);
      const records = rows.map(row => ({
        company:       row['Company']        || row['company']        || row['Company Name'] || '',
        address:       row['Address']        || row['address']        || '',
        stallNumber:   row['Stall Number']   || row['stallNumber']    || row['Stall']        || '',
        hallName:      row['Hall Name']      || row['hallName']       || row['Hall']         || '',
        phone:         row['Phone']          || row['phone']          || row['Phone Number'] || '',
        email:         row['Email']          || row['email']          || row['Email ID']     || '',
        contactPerson: row['Contact Person'] || row['contactPerson']  || row['Contact']      || '',
      })).filter(r => r.company);

      let saved = 0;
      for (const record of records) {
        try {
          await addDoc(collection(db, 'exhibitors'), { ...record, eventId, createdAt: serverTimestamp() });
          saved++;
        } catch { /* ignore individual import failures */ }
      }
      alert(`Imported ${saved} of ${records.length} exhibitors.`);
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsBinaryString(file);
  };

  const exportTemplate = () => {
    const ws = XLSX.utils.json_to_sheet([{
      'Company': 'Example Corp', 'Address': '123 Tech Lane, Silicon Valley',
      'Stall Number': 'A-42', 'Hall Name': 'Main Tech Hall',
      'Contact Person': 'John Doe', 'Phone': '+1 234 567 8900', 'Email': 'john@example.com',
    }]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Exhibitors');
    XLSX.writeFile(wb, 'Exhibitor_Import_Template.xlsx');
  };

  const filtered = exhibitors.filter(ex =>
    (ex.company || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (ex.stallNumber || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (ex.hallName || '').toLowerCase().includes(searchTerm.toLowerCase()),
  );

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-6 glass-panel p-6 border-white/5">
        <div>
          <h2 className="text-2xl font-black text-white uppercase tracking-tight">Exhibitor Directory</h2>
          <p className="text-zinc-400 text-sm mt-1">Manage company profiles, stall assignments, and contact details.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 w-full xl:w-auto">
          <div className="relative flex-1 xl:flex-none min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input type="text" placeholder="Search exhibitors or stalls..."
              value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
              className="w-full bg-black/40 border border-white/10 rounded-xl pl-10 pr-4 py-2 text-sm text-white focus:border-primary/50 focus:outline-none transition-colors placeholder:text-zinc-600"
            />
          </div>
          <button onClick={exportTemplate}
            className="px-4 py-2 bg-white/5 border border-white/10 text-white hover:bg-white/10 font-bold rounded-xl transition-all flex items-center gap-2 text-xs uppercase tracking-widest flex-1 xl:flex-none">
            <Download className="w-4 h-4" /> Template
          </button>
          <label className={`px-4 py-2 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 hover:bg-indigo-500/20 font-bold rounded-xl transition-all flex items-center gap-2 text-xs uppercase tracking-widest flex-1 xl:flex-none ${!eventId ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}>
            <Upload className="w-4 h-4" /> Import Excel
            <input type="file" accept=".xlsx,.xls" className="hidden" ref={fileInputRef} onChange={handleExcelImport} disabled={!eventId} />
          </label>
          <button onClick={() => setShowModal(true)} disabled={!eventId}
            className="px-5 py-2 bg-primary/10 border border-primary/20 text-primary font-bold rounded-xl transition-all hover:bg-primary/20 flex items-center gap-2 text-sm uppercase tracking-widest shadow-lg shadow-primary/5 flex-1 xl:flex-none disabled:opacity-40">
            <Plus className="w-4 h-4" /> Add Exhibitor
          </button>
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="py-20 text-center text-zinc-500 text-sm">Loading exhibitors…</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map((ex, i) => (
            <motion.div key={ex.id}
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
              className="glass-panel p-6 border-white/5 relative group hover:border-primary/30 transition-all shadow-xl"
            >
              <button onClick={() => handleDelete(ex.id)}
                className="absolute top-4 right-4 w-8 h-8 bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white rounded-lg flex items-center justify-center transition-all opacity-0 group-hover:opacity-100">
                <Trash2 className="w-4 h-4" />
              </button>
              <div className="flex items-start gap-4 mb-6">
                <div className="w-12 h-12 bg-primary/20 text-primary border border-primary/30 rounded-xl flex items-center justify-center text-xl font-black shadow-lg">
                  {(ex.company || '?').charAt(0)}
                </div>
                <div className="flex-1 pr-8">
                  <h3 className="text-lg font-black text-white line-clamp-1">{ex.company}</h3>
                  <div className="flex items-center gap-2 text-xs font-bold text-emerald-400 uppercase tracking-widest mt-1">
                    <Store className="w-3 h-3" /> Stall: {ex.stallNumber || 'TBA'}
                  </div>
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex items-center gap-3 text-sm text-zinc-400">
                  <MapPin className="w-4 h-4 text-zinc-600 flex-shrink-0" />
                  <span className="line-clamp-1">{ex.hallName ? `Hall: ${ex.hallName}` : 'No hall assigned'}</span>
                </div>
                <div className="flex items-center gap-3 text-sm text-zinc-400">
                  <User className="w-4 h-4 text-zinc-600 flex-shrink-0" />
                  <span className="line-clamp-1">{ex.contactPerson || 'No contact person'}</span>
                </div>
                <div className="flex items-center gap-3 text-sm text-zinc-400">
                  <Phone className="w-4 h-4 text-zinc-600 flex-shrink-0" />
                  <span className="line-clamp-1">{ex.phone || 'No phone'}</span>
                </div>
                <div className="flex items-center gap-3 text-sm text-zinc-400">
                  <Mail className="w-4 h-4 text-zinc-600 flex-shrink-0" />
                  <span className="line-clamp-1">{ex.email || 'No email'}</span>
                </div>
              </div>

              <div className="pt-4 mt-4 border-t border-white/5">
                {ex.passGenerated ? (
                  <div className="flex items-center justify-center gap-2 py-2 rounded-xl bg-green-500/10 border border-green-500/20 text-green-400 text-xs font-black uppercase tracking-widest">
                    <BadgeCheck className="w-4 h-4" /> Pass Issued
                  </div>
                ) : (
                  <button
                    onClick={() => handleGeneratePass(ex)}
                    disabled={generatingPass.has(ex.id)}
                    className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-primary/10 border border-primary/20 text-primary text-xs font-black uppercase tracking-widest hover:bg-primary/20 transition-all disabled:opacity-60"
                  >
                    {generatingPass.has(ex.id)
                      ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating…</>
                      : <><BadgeCheck className="w-4 h-4" /> Add Pass</>
                    }
                  </button>
                )}
              </div>
            </motion.div>
          ))}

          {filtered.length === 0 && !loading && (
            <div className="col-span-full py-20 text-center glass-panel border-white/5 border-dashed">
              <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4">
                <Building2 className="w-8 h-8 text-zinc-600" />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">No Exhibitors Found</h3>
              <p className="text-zinc-500 text-sm max-w-md mx-auto">Add an exhibitor manually or download the template to bulk-import via Excel.</p>
            </div>
          )}
        </div>
      )}

      {/* Add Modal */}
      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-2xl bg-zinc-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
            >
              <div className="flex items-center justify-between p-6 border-b border-white/5 bg-white/[0.02]">
                <h3 className="text-xl font-black text-white uppercase tracking-tight">Add New Exhibitor</h3>
                <button onClick={() => setShowModal(false)} className="w-8 h-8 flex items-center justify-center bg-white/5 hover:bg-white/10 rounded-full transition-colors">
                  <X className="w-4 h-4 text-zinc-400" />
                </button>
              </div>
              <form onSubmit={handleAddExhibitor} className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="col-span-1 md:col-span-2 space-y-2">
                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Company Name *</label>
                    <input type="text" name="company" required value={formData.company} onChange={handleInputChange} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-primary/50 focus:outline-none" placeholder="e.g. Acme Corporation" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Stall Number *</label>
                    <input type="text" name="stallNumber" required value={formData.stallNumber} onChange={handleInputChange} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-primary/50 focus:outline-none" placeholder="e.g. A-42" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Hall Name / Number</label>
                    <input type="text" name="hallName" value={formData.hallName} onChange={handleInputChange} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-primary/50 focus:outline-none" placeholder="e.g. Main Tech Hall" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Contact Person</label>
                    <input type="text" name="contactPerson" value={formData.contactPerson} onChange={handleInputChange} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-primary/50 focus:outline-none" placeholder="e.g. Jane Doe" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Phone Number</label>
                    <input type="text" name="phone" value={formData.phone} onChange={handleInputChange} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-primary/50 focus:outline-none" placeholder="+1 234 567 8900" />
                  </div>
                  <div className="col-span-1 md:col-span-2 space-y-2">
                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Email Address</label>
                    <input type="email" name="email" value={formData.email} onChange={handleInputChange} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-primary/50 focus:outline-none" placeholder="contact@acme.com" />
                  </div>
                  <div className="col-span-1 md:col-span-2 space-y-2">
                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Company Address</label>
                    <textarea name="address" value={formData.address} onChange={handleInputChange} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-primary/50 focus:outline-none resize-none h-24" placeholder="Full physical address…" />
                  </div>
                </div>
                <div className="mt-8 flex justify-end gap-3">
                  <button type="button" onClick={() => setShowModal(false)} className="px-6 py-3 bg-white/5 hover:bg-white/10 rounded-xl text-white font-bold transition-all text-sm uppercase tracking-widest">
                    Cancel
                  </button>
                  <button type="submit" disabled={saving} className="px-6 py-3 bg-primary hover:bg-primary/90 rounded-xl text-white font-bold transition-all text-sm uppercase tracking-widest shadow-lg shadow-primary/20 disabled:opacity-60">
                    {saving ? 'Saving…' : 'Save Exhibitor'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
