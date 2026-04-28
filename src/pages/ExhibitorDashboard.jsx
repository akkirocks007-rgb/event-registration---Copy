import React, { useState, useEffect, useRef } from 'react';
import PageWrapper from '../components/PageWrapper';
import { AnimatePresence } from 'framer-motion';
import { ScanLine, LogOut, CheckCircle2, User, Building2, Mail, Check, Star, Download, Search, Users, X, ZapOff } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { db } from '../firebase';
import { collection, addDoc, onSnapshot, query, where, getDocs, serverTimestamp } from 'firebase/firestore';
import { Html5Qrcode } from 'html5-qrcode';

const ExhibitorDashboard = () => {
  const { logout, user } = useAuth();
  const [activeTab, setActiveTab] = useState('scan');
  const [scannedLead, setScannedLead] = useState(null);
  const [leads, setLeads] = useState([]);
  const [rating, setRating] = useState(null);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState(null);
  const [lookingUp, setLookingUp] = useState(false);
  const scannerRef = useRef(null);
  const html5QrRef = useRef(null);

  // Load leads from Firestore
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'exhibitorLeads'), where('exhibitorId', '==', user.uid));
    const unsub = onSnapshot(q, snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setLeads(list);
    });
    return () => unsub();
  }, [user]);

  // Start/stop the camera scanner
  const startScanner = async () => {
    setScanError(null);
    setScanning(true);
    try {
      const html5Qr = new Html5Qrcode('qr-reader');
      html5QrRef.current = html5Qr;
      await html5Qr.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 220, height: 220 } },
        async (decodedText) => {
          await stopScanner();
          await lookupAttendee(decodedText.trim());
        },
        () => {}
      );
    } catch {
      setScanning(false);
      setScanError('Camera access denied. Use "Manual Entry" below.');
    }
  };

  const stopScanner = async () => {
    if (html5QrRef.current) {
      try { await html5QrRef.current.stop(); } catch { /* ignore stop errors */ }
      html5QrRef.current = null;
    }
    setScanning(false);
  };

  // Clean up scanner on unmount / tab change
  useEffect(() => {
    return () => { stopScanner(); };
  }, []);

  // Look up attendee by UID (from badge QR) or confirmationId or email
  const lookupAttendee = async (value) => {
    setLookingUp(true);
    try {
      let data = null;

      // Try confirmationId first
      const byConfirm = query(collection(db, 'attendees'), where('confirmationId', '==', value));
      const s1 = await getDocs(byConfirm);
      if (!s1.empty) data = s1.docs[0].data();

      // Try email
      if (!data) {
        const byEmail = query(collection(db, 'attendees'), where('email', '==', value));
        const s2 = await getDocs(byEmail);
        if (!s2.empty) data = s2.docs[0].data();
      }

      // Try uid field
      if (!data) {
        const byUid = query(collection(db, 'attendees'), where('uid', '==', value));
        const s3 = await getDocs(byUid);
        if (!s3.empty) data = s3.docs[0].data();
      }

      if (data) {
        setScannedLead({
          name: `${data.firstName || ''} ${data.lastName || ''}`.trim() || 'Unknown',
          company: data.company || '—',
          role: data.designation || data.ticketName || '—',
          email: data.email || '—',
          confirmationId: data.confirmationId || value,
        });
      } else {
        // Unrecognised QR — let exhibitor fill it in manually
        setScannedLead({ name: value, company: '—', role: '—', email: '—', confirmationId: value });
      }
    } catch (err) {
      setScanError('Lookup failed: ' + err.message);
    } finally {
      setLookingUp(false);
    }
  };

  const handleManualScan = () => {
    const val = prompt('Enter badge confirmation ID or email:');
    if (val?.trim()) lookupAttendee(val.trim());
  };

  const handleSaveLead = async () => {
    if (!scannedLead) return;
    setSaving(true);
    try {
      await addDoc(collection(db, 'exhibitorLeads'), {
        exhibitorId: user?.uid || 'unknown',
        name: scannedLead.name,
        company: scannedLead.company,
        role: scannedLead.role,
        email: scannedLead.email,
        confirmationId: scannedLead.confirmationId || '',
        rating: rating || 'Cold',
        notes: notes.trim(),
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        createdAt: serverTimestamp(),
      });
      setScannedLead(null);
      setRating(null);
      setNotes('');
      setActiveTab('leads');
    } catch (e) {
      alert('Failed to save lead: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const filteredLeads = leads.filter(l =>
    l.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    l.company?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <PageWrapper>
      <div className="min-h-screen bg-bg-dark text-slate-100 flex justify-center overflow-auto relative">
        <div className="bg-mesh absolute inset-0 z-0 opacity-20 pointer-events-none"></div>

        <div className="w-full max-w-md bg-black/60 relative z-10 min-h-screen border-x border-white/5 shadow-2xl flex flex-col">

          {/* Header */}
          <div className="p-6 border-b border-white/5 flex justify-between items-center bg-black/50 backdrop-blur-xl sticky top-0 z-50">
            <div>
              <h1 className="text-xl font-bold bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">Sponsor Portal</h1>
              <p className="text-xs text-zinc-500">{user?.boothNumber || 'Exhibitor'}</p>
            </div>
            <button onClick={logout} className="p-2 text-zinc-500 hover:text-white transition-colors">
              <LogOut className="w-5 h-5" />
            </button>
          </div>

          {/* Main Content Area */}
          <div className="flex-1 p-6 flex flex-col">
            <AnimatePresence mode="wait">

              {/* ── Scanner tab ── */}
              {activeTab === 'scan' && !scannedLead && (
                <motion.div key="scan" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 flex flex-col items-center justify-center gap-6">

                  {lookingUp ? (
                    <div className="flex flex-col items-center gap-4 py-12">
                      <div className="w-16 h-16 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                      <p className="text-zinc-400 text-sm font-bold uppercase tracking-widest">Looking up attendee…</p>
                    </div>
                  ) : scanning ? (
                    <div className="w-full space-y-4">
                      {/* html5-qrcode renders into this div */}
                      <div id="qr-reader" ref={scannerRef} className="w-full overflow-hidden rounded-2xl" />
                      <button onClick={stopScanner} className="w-full py-3 bg-white/5 border border-white/10 rounded-xl text-zinc-400 font-bold text-sm flex items-center justify-center gap-2 hover:bg-white/10 transition-all">
                        <X className="w-4 h-4" /> Cancel Scan
                      </button>
                    </div>
                  ) : (
                    <>
                      {/* Viewfinder placeholder */}
                      <div className="w-64 h-64 border-2 border-dashed border-zinc-600 rounded-3xl relative flex items-center justify-center bg-white/[0.02]">
                        <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-primary rounded-tl-3xl -translate-x-1 -translate-y-1" />
                        <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-primary rounded-tr-3xl translate-x-1 -translate-y-1" />
                        <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-primary rounded-bl-3xl -translate-x-1 translate-y-1" />
                        <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-primary rounded-br-3xl translate-x-1 translate-y-1" />
                        <div className="text-center opacity-50">
                          <ScanLine className="w-12 h-12 mx-auto mb-2 text-zinc-400" />
                          <span className="text-xs font-bold uppercase tracking-widest">Ready to Scan</span>
                        </div>
                      </div>

                      {scanError && (
                        <div className="w-full p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-2">
                          <ZapOff className="w-4 h-4 text-red-400 shrink-0" />
                          <p className="text-xs text-red-400">{scanError}</p>
                        </div>
                      )}

                      <button onClick={startScanner} className="w-full btn-primary py-4 rounded-xl flex justify-center items-center gap-2">
                        <ScanLine className="w-5 h-5" /> Scan Badge QR
                      </button>

                      <button onClick={handleManualScan} className="w-full py-3 bg-white/5 border border-white/10 rounded-xl text-zinc-400 font-bold text-sm hover:bg-white/10 transition-all">
                        Manual Entry / Confirmation ID
                      </button>
                    </>
                  )}
                </motion.div>
              )}

              {/* ── Lead qualification form ── */}
              {scannedLead && (
                <motion.div key="lead" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex-1 space-y-6">
                  <div className="text-center mb-8">
                    <div className="w-20 h-20 bg-gradient-to-br from-green-400 to-blue-500 rounded-full mx-auto flex items-center justify-center shadow-[0_0_30px_rgba(34,197,94,0.3)] mb-4 border-4 border-black">
                      <Check className="w-10 h-10 text-white" />
                    </div>
                    <h2 className="text-2xl font-bold text-white mb-1">Lead Captured!</h2>
                    <p className="text-zinc-500 text-sm">Please qualify the prospect.</p>
                  </div>

                  <div className="glass-card p-5 space-y-4">
                    <div className="flex items-center gap-3">
                      <User className="w-5 h-5 text-zinc-400" />
                      <div>
                        <p className="text-[10px] uppercase font-bold text-zinc-500">Full Name</p>
                        <p className="font-bold text-white text-lg">{scannedLead.name}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Building2 className="w-5 h-5 text-zinc-400" />
                      <div>
                        <p className="text-[10px] uppercase font-bold text-zinc-500">Company & Title</p>
                        <p className="font-medium text-zinc-300">{scannedLead.company} — {scannedLead.role}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Mail className="w-5 h-5 text-zinc-400" />
                      <div>
                        <p className="text-[10px] uppercase font-bold text-zinc-500">Contact</p>
                        <p className="font-medium text-primary">{scannedLead.email}</p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Lead Quality</p>
                    <div className="grid grid-cols-3 gap-3">
                      {['Cold', 'Warm', 'Hot'].map(level => (
                        <button key={level} onClick={() => setRating(level)}
                          className={`py-3 rounded-lg text-sm font-bold border transition-all ${
                            rating === level
                              ? level === 'Hot' ? 'bg-orange-500/20 border-orange-500 text-orange-400'
                              : level === 'Warm' ? 'bg-yellow-500/20 border-yellow-500 text-yellow-400'
                              : 'bg-blue-500/20 border-blue-500 text-blue-400'
                              : 'bg-white/5 border-white/10 text-zinc-400'
                          }`}>
                          {level}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-4">
                    <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Private Notes</p>
                    <textarea className="input-base w-full h-24 resize-none" placeholder="Add follow-up notes here..."
                      value={notes} onChange={(e) => setNotes(e.target.value)} />
                  </div>

                  <div className="flex gap-3">
                    <button onClick={() => setScannedLead(null)} className="flex-1 py-4 bg-white/5 border border-white/10 rounded-xl text-zinc-400 font-bold hover:bg-white/10 transition-all">
                      Discard
                    </button>
                    <button onClick={handleSaveLead} disabled={saving} className="flex-1 btn-primary py-4 rounded-xl disabled:opacity-50">
                      {saving ? 'Saving…' : 'Save Lead'}
                    </button>
                  </div>
                </motion.div>
              )}

              {/* ── Leads list ── */}
              {activeTab === 'leads' && !scannedLead && (
                <motion.div key="list" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex-1">
                  <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-bold">Collected Leads</h2>
                    <button onClick={() => {
                      const header = 'Name,Company,Role,Email,Rating,Notes,Time';
                      const rows = leads.map(l => `"${l.name}","${l.company}","${l.role}","${l.email}","${l.rating}","${(l.notes||'').replace(/"/g,'""')}","${l.time}"`);
                      const csv = [header, ...rows].join('\n');
                      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url; a.download = `leads_${new Date().toISOString().split('T')[0]}.csv`;
                      document.body.appendChild(a); a.click();
                      document.body.removeChild(a); URL.revokeObjectURL(url);
                    }} className="text-primary text-xs font-bold hover:underline flex items-center gap-1">
                      <Download className="w-3 h-3" /> Export CSV
                    </button>
                  </div>

                  <div className="relative mb-6">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                    <input type="text" placeholder="Search leads..." value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      className="input-base w-full pl-10 py-3 text-sm" />
                  </div>

                  <div className="space-y-3">
                    {filteredLeads.map(lead => (
                      <div key={lead.id} className="p-4 bg-white/5 rounded-xl border border-white/5 flex items-center justify-between">
                        <div>
                          <p className="font-bold text-white text-sm">{lead.name}</p>
                          <p className="text-xs text-zinc-500">{lead.company}{lead.email && lead.email !== '—' ? ` · ${lead.email}` : ''}</p>
                          {lead.notes && <p className="text-[10px] text-zinc-600 mt-1 italic truncate max-w-[160px]">{lead.notes}</p>}
                        </div>
                        <div className="text-right">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                            lead.rating === 'Hot' ? 'bg-orange-500/20 text-orange-400'
                            : lead.rating === 'Warm' ? 'bg-yellow-500/20 text-yellow-400'
                            : 'bg-blue-500/20 text-blue-400'
                          }`}>{lead.rating}</span>
                          <p className="text-[10px] text-zinc-600 mt-1">{lead.time}</p>
                        </div>
                      </div>
                    ))}
                    {filteredLeads.length === 0 && (
                      <p className="text-center text-zinc-600 text-sm py-12">No leads yet. Start scanning!</p>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Bottom Nav */}
          <div className="h-20 border-t border-white/5 bg-black/80 backdrop-blur-md flex p-4 gap-4 sticky bottom-0 z-50">
            <button onClick={() => { setActiveTab('scan'); setScannedLead(null); stopScanner(); }}
              className={`flex-1 rounded-xl flex flex-col items-center justify-center gap-1 transition-colors ${activeTab === 'scan' ? 'bg-primary text-white' : 'text-zinc-500 hover:bg-white/5'}`}>
              <ScanLine className="w-5 h-5" />
              <span className="text-[10px] font-bold uppercase tracking-wider">Scanner</span>
            </button>
            <button onClick={() => { setActiveTab('leads'); setScannedLead(null); stopScanner(); }}
              className={`flex-1 rounded-xl flex flex-col items-center justify-center gap-1 transition-colors ${activeTab === 'leads' ? 'bg-primary text-white' : 'text-zinc-500 hover:bg-white/5'}`}>
              <Users className="w-5 h-5" />
              <span className="text-[10px] font-bold uppercase tracking-wider">My Leads ({leads.length})</span>
            </button>
          </div>
        </div>
      </div>
    </PageWrapper>
  );
};

export default ExhibitorDashboard;
