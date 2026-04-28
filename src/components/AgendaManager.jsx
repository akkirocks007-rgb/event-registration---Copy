import React, { useState, useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Calendar, Plus, Trash2, Clock, MapPin, User, DollarSign, Loader2, Save } from 'lucide-react';
import { collection, query, where, getDocs, addDoc, deleteDoc, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../firebase';

export default function AgendaManager({ eventId }) {
  const [agendas, setAgendas] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showModal, setShowModal] = useState(false);
  
  const [speakersList] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('speakers') || '[]');
    } catch {
      return [];
    }
  });

  const [formData, setFormData] = useState({
    title: '',
    type: 'Conference',
    hallName: '',
    date: '',
    time: '10:00 AM',
    duration: '1h',
    isFree: true,
    price: 0,
    description: '',
    selectedSpeakers: []
  });

  useEffect(() => {
    if (!eventId) return;
    const fetchAgendas = async () => {
      setIsLoading(true);
      try {
        const q = query(collection(db, "agendas"), where("eventId", "==", eventId));
        const snap = await getDocs(q);
        setAgendas(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (e) {
        console.error("Error fetching agendas", e);
      }
      setIsLoading(false);
    };
    fetchAgendas();
  }, [eventId]);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!formData.title || !formData.time) return;
    
    setIsSaving(true);
    try {
      const payload = {
        ...formData,
        price: formData.isFree ? 0 : Number(formData.price),
        eventId,
        createdAt: serverTimestamp()
      };
      const docRef = await addDoc(collection(db, "agendas"), payload);
      setAgendas(prev => [...prev, { id: docRef.id, ...payload }]);
      
      // Auto-sync Hall Name to Access Control Zones and Exhibition Map
      if (formData.hallName) {
         const gateId = formData.hallName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
         try {
            await setDoc(doc(db, 'zoneRules', gateId), {
               gateId,
               gateName: formData.hallName,
               gateIcon: 'dY"?',
               allowedTickets: ['organiser', 'vip', 'speaker', 'delegate'],
               timeWindow: { always: false, start: '09:00', end: '18:00' }
            }, { merge: true });
         } catch(err) {
            console.error("Failed to sync hall to zone rules", err);
         }
      }

      setShowModal(false);
      setFormData({ title: '', type: 'Conference', hallName: '', date: '', time: '10:00 AM', duration: '1h', isFree: true, price: 0, description: '', selectedSpeakers: [] });
    } catch (e) {
      console.error("Error saving agenda", e);
    }
    setIsSaving(false);
  };

  const handleDelete = async (id) => {
    try {
      await deleteDoc(doc(db, "agendas", id));
      setAgendas(prev => prev.filter(a => a.id !== id));
    } catch (e) {
      console.error("Error deleting agenda", e);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-20">
         <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-white">Conference Line Up</h2>
          <p className="text-zinc-500 text-sm mt-1">Manage a la carte sessions and agenda tracks.</p>
        </div>
        <button 
          onClick={() => setShowModal(true)}
          className="btn-primary px-4 py-2 rounded-xl flex items-center gap-2 font-bold"
        >
          <Plus className="w-4 h-4" /> Add Session
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <AnimatePresence>
          {agendas.map((agenda, i) => (
            <motion.div 
              key={agenda.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ delay: i * 0.05 }}
              className="glass-panel p-6 border border-white/5 relative group"
            >
               <button 
                 onClick={() => handleDelete(agenda.id)}
                 className="absolute top-4 right-4 text-red-500/50 hover:text-red-500 hover:bg-red-500/10 p-2 rounded-lg transition-all opacity-0 group-hover:opacity-100"
               >
                  <Trash2 className="w-4 h-4" />
               </button>
               
               <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-primary/20 text-primary rounded-xl flex items-center justify-center border border-primary/30">
                     <Calendar className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-white font-bold">{agenda.title}</h3>
                    <p className="text-xs text-zinc-500">{agenda.type} • {agenda.hallName}</p>
                  </div>
               </div>

               {agenda.description && (
                  <p className="text-sm text-zinc-400 mb-4 line-clamp-2">{agenda.description}</p>
               )}

               <div className="space-y-2 mb-4">
                 <div className="flex items-center gap-2 text-sm text-zinc-400">
                    <Clock className="w-4 h-4 text-zinc-600" /> {agenda.date} {agenda.time} ({agenda.duration})
                 </div>
                 <div className="flex items-center gap-2 text-sm text-zinc-400">
                    <MapPin className="w-4 h-4 text-zinc-600" /> {agenda.hallName || 'TBD'}
                 </div>
                 {agenda.selectedSpeakers && agenda.selectedSpeakers.length > 0 && (
                     <div className="flex items-start gap-2 text-sm text-zinc-400">
                        <User className="w-4 h-4 text-zinc-600 mt-0.5" /> 
                        <div className="flex flex-col">
                           {agenda.selectedSpeakers.map(sid => {
                               const spk = speakersList.find(s => s.id === sid);
                               return spk ? <span key={sid}>{spk.name}</span> : null;
                           })}
                        </div>
                     </div>
                 )}
               </div>

               <div className="pt-4 border-t border-white/5 flex justify-between items-center">
                  <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">Access Type</span>
                  <span className={`font-black ${agenda.isFree ? 'text-emerald-400' : 'text-white'}`}>
                     {agenda.isFree ? 'Free' : `$${agenda.price}`}
                  </span>
               </div>
            </motion.div>
          ))}
        </AnimatePresence>
        
        {agendas.length === 0 && (
            <div className="col-span-full py-20 flex flex-col items-center justify-center text-center glass-panel border border-white/5 border-dashed">
              <Calendar className="w-12 h-12 text-zinc-600 mb-4" />
              <h3 className="text-white font-bold mb-2">No Sessions Scheduled</h3>
              <p className="text-zinc-500 text-sm">Add your first session to build the conference line up.</p>
            </div>
        )}
      </div>

      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setShowModal(false)}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="glass-panel p-8 max-w-md w-full relative z-10 border border-white/10 max-h-[90vh] overflow-y-auto custom-scrollbar"
            >
              <h2 className="text-2xl font-bold text-white mb-6">New Session</h2>
              <form onSubmit={handleSave} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                      <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-2">Access Type</label>
                      <div className="flex bg-black/40 rounded-xl p-1 border border-white/10">
                        <button type="button" onClick={() => setFormData({...formData, isFree: true})} className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${formData.isFree ? 'bg-emerald-500/20 text-emerald-400 shadow-lg' : 'text-zinc-500 hover:text-white'}`}>Free Session</button>
                        <button type="button" onClick={() => setFormData({...formData, isFree: false})} className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${!formData.isFree ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'text-zinc-500 hover:text-white'}`}>Paid Add-on</button>
                      </div>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-2">Event Type</label>
                      <select required value={formData.type} onChange={e => setFormData({...formData, type: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-primary/50 [&>option]:bg-zinc-900">
                         <option value="Conference">Conference</option>
                         <option value="Workshop">Workshop</option>
                         <option value="Seminar">Seminar</option>
                      </select>
                    </div>
                    {!formData.isFree ? (
                        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
                          <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-2">A La Carte Price ($)</label>
                          <input type="number" min="1" required value={formData.price} onChange={e => setFormData({...formData, price: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-primary/50" />
                        </motion.div>
                    ) : (
                        <div>
                          <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-2">A La Carte Price ($)</label>
                          <div className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-zinc-500 cursor-not-allowed">Free</div>
                        </div>
                    )}
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-2">Session Title</label>
                  <input required type="text" value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-primary/50" placeholder="e.g. AI Keynote" />
                </div>
                
                <div>
                  <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-2">Description</label>
                  <textarea rows="2" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-primary/50 resize-none" placeholder="Brief details about the session..." />
                </div>

                <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-2">Date</label>
                      <input required type="date" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-primary/50 [color-scheme:dark]" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-2">Time</label>
                      <input required type="time" value={formData.time} onChange={e => setFormData({...formData, time: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-primary/50 [color-scheme:dark]" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-2">Duration</label>
                      <input required type="text" value={formData.duration} onChange={e => setFormData({...formData, duration: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-primary/50" placeholder="1.5h" />
                    </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-2">Conference Hall Name</label>
                  <input required type="text" value={formData.hallName} onChange={e => setFormData({...formData, hallName: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-primary/50" placeholder="e.g. Hall A, Grand Ballroom" />
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-2">Speakers (Select multiple)</label>
                  <div className="w-full bg-white/5 border border-white/10 rounded-xl p-3 max-h-32 overflow-y-auto custom-scrollbar space-y-2">
                     {speakersList.length === 0 ? (
                        <p className="text-xs text-zinc-500 py-2 text-center">No speakers found. Add speakers in the Speakers tab first.</p>
                     ) : (
                        speakersList.map(speaker => (
                           <label key={speaker.id} className="flex items-center gap-3 p-2 hover:bg-white/5 rounded-lg cursor-pointer transition-colors">
                              <input 
                                 type="checkbox" 
                                 checked={formData.selectedSpeakers.includes(speaker.id)}
                                 onChange={(e) => {
                                    if(e.target.checked) {
                                       setFormData({...formData, selectedSpeakers: [...formData.selectedSpeakers, speaker.id]});
                                    } else {
                                       setFormData({...formData, selectedSpeakers: formData.selectedSpeakers.filter(id => id !== speaker.id)});
                                    }
                                 }}
                                 className="accent-primary w-4 h-4"
                              />
                              <div className="flex items-center gap-2">
                                 {speaker.picture ? (
                                     <img src={speaker.picture} alt="" className="w-6 h-6 rounded-full object-cover" />
                                 ) : (
                                     <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-[10px] text-primary"><User className="w-3 h-3"/></div>
                                 )}
                                 <span className="text-sm text-white">{speaker.name}</span>
                                 {speaker.company && <span className="text-xs text-zinc-500">- {speaker.company}</span>}
                              </div>
                           </label>
                        ))
                     )}
                  </div>
                </div>

                <div className="pt-4 flex gap-3">
                  <button type="button" onClick={() => setShowModal(false)} className="flex-1 px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-white font-bold transition-all">Cancel</button>
                  <button type="submit" disabled={isSaving} className="flex-1 px-4 py-3 rounded-xl btn-primary flex items-center justify-center gap-2 font-bold disabled:opacity-50">
                    {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save Session
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
