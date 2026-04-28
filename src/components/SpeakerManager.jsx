import React, { useState, useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Mic2, Plus, Upload, Search, Trash2, X, MapPin, Calendar, Briefcase, GraduationCap, Camera, Eye, EyeOff, Phone, Mail, Ticket } from 'lucide-react';
import { db } from '../firebase';
import { collection, query, where, orderBy, onSnapshot, addDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';

const BLANK_FORM = {
  picture: null, name: '', company: '', expertise: '', college: '', education: '',
  time: '', date: '', customField: '', location: '', phone: '', email: '', generatePass: true,
  visibility: {
    picture: true, name: true, company: true, expertise: true, college: true,
    education: true, time: true, date: true, customField: true, location: true,
    phone: false, email: false,
  },
};

export default function SpeakerManager({ eventId, onSpeakerAdded }) {
  const [speakers, setSpeakers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState(BLANK_FORM);

  useEffect(() => {
    if (!eventId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    const q = query(
      collection(db, 'speakers'),
      where('eventId', '==', eventId),
      orderBy('createdAt', 'desc'),
    );
    const unsub = onSnapshot(q, snap => {
      setSpeakers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, [eventId]);

  const handleInputChange = (e) => setFormData(f => ({ ...f, [e.target.name]: e.target.value }));

  const handleVisibilityToggle = (field) =>
    setFormData(f => ({ ...f, visibility: { ...f.visibility, [field]: !f.visibility[field] } }));

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = evt => setFormData(f => ({ ...f, picture: evt.target.result }));
    reader.readAsDataURL(file);
  };

  const handleAddSpeaker = async (e) => {
    e.preventDefault();
    if (!eventId) return;
    setSaving(true);
    try {
      const payload = { ...formData, eventId, createdAt: serverTimestamp() };
      // Skip picture from Firestore if it's excessively large (> 800 KB base64)
      if (payload.picture && payload.picture.length > 800_000) {
        payload.picture = null;
        alert('Profile photo was too large for cloud storage and was not saved. Use a smaller image.');
      }
      const docRef = await addDoc(collection(db, 'speakers'), payload);
      if (onSpeakerAdded) onSpeakerAdded({ id: docRef.id, ...formData });
      setShowModal(false);
      setFormData(BLANK_FORM);
    } catch (err) {
      alert('Failed to save speaker: ' + (err.message || err));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Remove this speaker?')) return;
    try {
      await deleteDoc(doc(db, 'speakers', id));
    } catch {
      setSpeakers(prev => prev.filter(s => s.id !== id));
    }
  };

  const filtered = speakers.filter(s =>
    (s.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (s.expertise || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (s.company || '').toLowerCase().includes(searchTerm.toLowerCase()),
  );

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-6 glass-panel p-6 border-white/5">
        <div>
          <h2 className="text-2xl font-black text-white uppercase tracking-tight">Speaker Lineup</h2>
          <p className="text-zinc-400 text-sm mt-1">Manage event speakers, their schedules, and visibility settings.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 w-full xl:w-auto">
          <div className="relative flex-1 xl:flex-none min-w-[250px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input
              type="text" placeholder="Search speakers..."
              value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
              className="w-full bg-black/40 border border-white/10 rounded-xl pl-10 pr-4 py-2 text-sm text-white focus:border-primary/50 focus:outline-none transition-colors"
            />
          </div>
          <button onClick={() => setShowModal(true)} disabled={!eventId}
            className="px-5 py-2 bg-primary border border-primary/50 text-white font-bold rounded-xl transition-all hover:bg-primary/90 flex items-center gap-2 text-sm uppercase tracking-widest shadow-[0_0_15px_rgba(84,34,255,0.3)] flex-1 xl:flex-none disabled:opacity-40">
            <Plus className="w-4 h-4" /> Add Speaker
          </button>
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="py-20 text-center text-zinc-500 text-sm">Loading speakers…</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map((s, i) => (
            <motion.div
              key={s.id}
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.05 }}
              className="glass-panel overflow-hidden border-white/5 relative group hover:border-primary/30 transition-all shadow-xl flex flex-col"
            >
              <button onClick={() => handleDelete(s.id)}
                className="absolute top-4 right-4 z-10 w-8 h-8 bg-red-500/10 backdrop-blur-md text-red-500 hover:bg-red-500 hover:text-white rounded-lg flex items-center justify-center transition-all opacity-0 group-hover:opacity-100 border border-red-500/20">
                <Trash2 className="w-4 h-4" />
              </button>

              {s.visibility?.picture && s.picture ? (
                <div className="h-48 w-full relative overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a] to-transparent z-10" />
                  <img src={s.picture} alt={s.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
                </div>
              ) : (
                <div className="h-32 w-full bg-zinc-900 flex items-center justify-center border-b border-white/5 relative">
                  <Mic2 className="w-8 h-8 text-zinc-700" />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a] to-transparent" />
                </div>
              )}

              <div className="p-6 flex-1 flex flex-col -mt-10 z-20">
                {s.visibility?.name && <h3 className="text-xl font-black text-white">{s.name}</h3>}
                {s.visibility?.expertise && <p className="text-sm font-bold text-primary uppercase tracking-widest mt-1 mb-4">{s.expertise}</p>}
                <div className="space-y-3 mt-auto">
                  {s.visibility?.company && s.company && (
                    <div className="flex items-start gap-3 text-sm text-zinc-400">
                      <Briefcase className="w-4 h-4 text-zinc-600 flex-shrink-0 mt-0.5" /><span>{s.company}</span>
                    </div>
                  )}
                  {(s.visibility?.education || s.visibility?.college) && (s.education || s.college) && (
                    <div className="flex items-start gap-3 text-sm text-zinc-400">
                      <GraduationCap className="w-4 h-4 text-zinc-600 flex-shrink-0 mt-0.5" />
                      <span className="line-clamp-2">
                        {s.visibility?.education && s.education}
                        {s.visibility?.education && s.visibility?.college && s.education && s.college ? ' at ' : ''}
                        {s.visibility?.college && s.college}
                      </span>
                    </div>
                  )}
                  {(s.visibility?.date || s.visibility?.time) && (s.date || s.time) && (
                    <div className="flex items-start gap-3 text-sm text-zinc-400">
                      <Calendar className="w-4 h-4 text-zinc-600 flex-shrink-0 mt-0.5" />
                      <span>
                        {s.visibility?.date && s.date}
                        {s.visibility?.date && s.visibility?.time && s.date && s.time ? ' • ' : ''}
                        {s.visibility?.time && s.time}
                      </span>
                    </div>
                  )}
                  {s.visibility?.location && s.location && (
                    <div className="flex items-start gap-3 text-sm text-zinc-400">
                      <MapPin className="w-4 h-4 text-zinc-600 flex-shrink-0 mt-0.5" /><span>{s.location}</span>
                    </div>
                  )}
                  {s.visibility?.phone && s.phone && (
                    <div className="flex items-start gap-3 text-sm text-zinc-400">
                      <Phone className="w-4 h-4 text-zinc-600 flex-shrink-0 mt-0.5" /><span>{s.phone}</span>
                    </div>
                  )}
                  {s.visibility?.email && s.email && (
                    <div className="flex items-start gap-3 text-sm text-zinc-400">
                      <Mail className="w-4 h-4 text-zinc-600 flex-shrink-0 mt-0.5" /><span>{s.email}</span>
                    </div>
                  )}
                  {s.visibility?.customField && s.customField && (
                    <div className="pt-3 mt-3 border-t border-white/5 text-xs text-zinc-500 italic">{s.customField}</div>
                  )}
                </div>
              </div>
            </motion.div>
          ))}

          {filtered.length === 0 && !loading && (
            <div className="col-span-full py-20 text-center glass-panel border-white/5 border-dashed">
              <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4">
                <Mic2 className="w-8 h-8 text-zinc-600" />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">No Speakers Added</h3>
              <p className="text-zinc-500 text-sm max-w-md mx-auto">Build your event's lineup by adding speakers, panel members, or keynote presenters.</p>
            </div>
          )}
        </div>
      )}

      {/* Add Modal */}
      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
              className="w-full max-w-4xl bg-zinc-950 border border-white/10 rounded-2xl shadow-2xl overflow-hidden my-8"
            >
              <div className="flex items-center justify-between p-6 border-b border-white/5 bg-white/[0.02] sticky top-0 z-20 backdrop-blur-xl">
                <h3 className="text-xl font-black text-white uppercase tracking-tight flex items-center gap-2">
                  <Mic2 className="w-5 h-5 text-primary" /> Add Presenter
                </h3>
                <button onClick={() => setShowModal(false)} className="w-8 h-8 flex items-center justify-center bg-white/5 hover:bg-white/10 rounded-full transition-colors">
                  <X className="w-4 h-4 text-zinc-400" />
                </button>
              </div>

              <form onSubmit={handleAddSpeaker} className="flex flex-col md:flex-row h-full">
                <div className="flex-1 p-8 space-y-6 overflow-y-auto max-h-[70vh]">
                  {/* Picture Upload */}
                  <div className="flex items-center gap-6">
                    <label className="w-24 h-24 rounded-full bg-white/5 border-2 border-dashed border-white/20 flex items-center justify-center cursor-pointer overflow-hidden group relative flex-shrink-0 hover:border-primary/50 transition-colors">
                      {formData.picture ? (
                        <>
                          <img src={formData.picture} className="w-full h-full object-cover group-hover:opacity-50 transition-opacity" alt="" />
                          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100">
                            <Upload className="w-6 h-6 text-white" />
                          </div>
                        </>
                      ) : (
                        <Camera className="w-6 h-6 text-zinc-500 group-hover:text-primary transition-colors" />
                      )}
                      <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                    </label>
                    <div>
                      <h4 className="text-sm font-bold text-white">Profile Photo</h4>
                      <p className="text-xs text-zinc-500 mt-1">Upload a portrait (PNG, JPG). Keep under 800 KB.</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Full Name *</label>
                      <input type="text" name="name" required value={formData.name} onChange={handleInputChange} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-primary/50 outline-none" placeholder="e.g. Dr. Sarah Chen" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Expertise / Title</label>
                      <input type="text" name="expertise" value={formData.expertise} onChange={handleInputChange} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-primary/50 outline-none" placeholder="e.g. AI Researcher" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Company Name</label>
                      <input type="text" name="company" value={formData.company} onChange={handleInputChange} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-primary/50 outline-none" placeholder="e.g. NeuralTech Inc." />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Education Degree</label>
                      <input type="text" name="education" value={formData.education} onChange={handleInputChange} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-primary/50 outline-none" placeholder="e.g. Ph.D. Computer Science" />
                    </div>
                    <div className="col-span-1 md:col-span-2 space-y-2">
                      <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">College / University</label>
                      <input type="text" name="college" value={formData.college} onChange={handleInputChange} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-primary/50 outline-none" placeholder="e.g. MIT" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Session Date</label>
                      <input type="date" name="date" value={formData.date} onChange={handleInputChange} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-primary/50 outline-none [color-scheme:dark]" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Session Time</label>
                      <input type="time" name="time" value={formData.time} onChange={handleInputChange} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-primary/50 outline-none [color-scheme:dark]" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Mobile Number</label>
                      <input type="tel" name="phone" value={formData.phone} onChange={handleInputChange} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-primary/50 outline-none" placeholder="+1 234 567 8900" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Email Address</label>
                      <input type="email" name="email" value={formData.email} onChange={handleInputChange} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-primary/50 outline-none" placeholder="speaker@example.com" />
                    </div>
                    <div className="col-span-1 md:col-span-2 space-y-2">
                      <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Location (Hall / Room)</label>
                      <input type="text" name="location" value={formData.location} onChange={handleInputChange} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-primary/50 outline-none" placeholder="e.g. Main Conference Hall A" />
                    </div>
                    <div className="col-span-1 md:col-span-2 space-y-2">
                      <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Custom Field (Bio / Note)</label>
                      <input type="text" name="customField" value={formData.customField} onChange={handleInputChange} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-primary/50 outline-none" placeholder="e.g. Panel moderator for Q&A" />
                    </div>
                  </div>
                </div>

                {/* Visibility Settings */}
                <div className="w-full md:w-72 bg-black/40 border-l border-white/5 p-6 flex flex-col">
                  <h4 className="text-xs font-black text-white uppercase tracking-widest flex items-center gap-2 mb-6">
                    <Eye className="w-4 h-4 text-primary" /> Visibility Controls
                  </h4>
                  <p className="text-[10px] text-zinc-500 leading-relaxed mb-6">Toggle which fields attendees see on public schedules.</p>
                  <div className="space-y-2 flex-1">
                    {[
                      { id: 'picture', label: 'Profile Picture' }, { id: 'name', label: 'Full Name' },
                      { id: 'expertise', label: 'Expertise / Title' }, { id: 'company', label: 'Company' },
                      { id: 'education', label: 'Education' }, { id: 'college', label: 'University' },
                      { id: 'date', label: 'Session Date' }, { id: 'time', label: 'Session Time' },
                      { id: 'location', label: 'Location' }, { id: 'phone', label: 'Mobile' },
                      { id: 'email', label: 'Email' }, { id: 'customField', label: 'Custom Field' },
                    ].map(field => (
                      <button key={field.id} type="button" onClick={() => handleVisibilityToggle(field.id)}
                        className={`w-full flex items-center justify-between p-3 rounded-lg border text-xs font-bold transition-all ${
                          formData.visibility[field.id]
                            ? 'bg-primary/10 border-primary/30 text-primary'
                            : 'bg-white/5 border-transparent text-zinc-500'
                        }`}>
                        <span>{field.label}</span>
                        {formData.visibility[field.id] ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5 opacity-50" />}
                      </button>
                    ))}
                  </div>
                  <div className="pt-6 mt-6 border-t border-white/5 space-y-4">
                    <label className="flex items-center gap-3 p-3 bg-white/5 rounded-xl border border-white/10 cursor-pointer hover:bg-white/10 transition-colors">
                      <div className={`w-10 h-6 rounded-full flex items-center p-1 transition-colors ${formData.generatePass ? 'bg-primary' : 'bg-zinc-700'}`}>
                        <motion.div animate={{ x: formData.generatePass ? 16 : 0 }} className="w-4 h-4 bg-white rounded-full shadow-md" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-white flex items-center gap-1.5"><Ticket className="w-3 h-3 text-primary" /> Auto-Generate Pass</p>
                        <p className="text-[9px] text-zinc-500 mt-0.5">Create a VIP access badge instantly.</p>
                      </div>
                      <input type="checkbox" className="hidden" checked={formData.generatePass} onChange={e => setFormData(f => ({ ...f, generatePass: e.target.checked }))} />
                    </label>
                    <button type="submit" disabled={saving}
                      className="w-full py-4 bg-primary hover:bg-primary/90 rounded-xl text-white font-black transition-all text-sm uppercase tracking-widest shadow-lg shadow-primary/20 disabled:opacity-60">
                      {saving ? 'Saving…' : 'Save Speaker'}
                    </button>
                  </div>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
