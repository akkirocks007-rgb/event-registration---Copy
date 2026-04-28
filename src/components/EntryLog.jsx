import React, { useState, useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import { db } from '../firebase';
import { collection, onSnapshot, query, orderBy, limit, where, getDocs } from 'firebase/firestore';
import {
  CheckCircle2, XCircle, AlertTriangle, ShieldX, Clock as ClockIcon,
  Filter, Search, Download, RefreshCw, Activity, Users, TrendingUp, Ban, MapPin, ArrowRight, X, Mail
} from 'lucide-react';

const RESULT_STYLES = {
  approved:    { label: 'Approved',       color: 'text-green-400',  bg: 'bg-green-500/10',   border: 'border-green-500/20',  bar: 'bg-green-500',  icon: CheckCircle2 },
  duplicate:   { label: 'Duplicate',      color: 'text-amber-400',  bg: 'bg-amber-500/10',   border: 'border-amber-500/20',  bar: 'bg-amber-500',  icon: AlertTriangle },
  zone_denied: { label: 'Zone Restricted',color: 'text-indigo-400', bg: 'bg-indigo-500/10',  border: 'border-indigo-500/20', bar: 'bg-indigo-500', icon: ShieldX },
  time_denied: { label: 'Outside Hours',  color: 'text-indigo-400', bg: 'bg-indigo-500/10',  border: 'border-indigo-500/20', bar: 'bg-indigo-500', icon: ClockIcon },
  rejected:    { label: 'Not Found',      color: 'text-red-400',    bg: 'bg-red-500/10',     border: 'border-red-500/20',    bar: 'bg-red-500',    icon: XCircle },
};

// Seed demo entries for when Firebase is empty
const SEED_LOGS = [
  { id: 's1', attendeeName: 'Priya Sharma',   ticketType: 'VIP Pass',          company: 'TechCorp', gateId: 'vip-lounge',   gateName: 'VIP Lounge',      gateIcon: '💎', result: 'approved',    reason: 'Access Granted', timestamp: new Date(Date.now()-120000).toISOString() },
  { id: 's2', attendeeName: 'Rahul Mehta',    ticketType: 'General Delegate',  company: 'StartupX', gateId: 'vip-lounge',   gateName: 'VIP Lounge',      gateIcon: '💎', result: 'zone_denied', reason: 'Zone Restricted', timestamp: new Date(Date.now()-240000).toISOString() },
  { id: 's3', attendeeName: 'Anjali Nair',    ticketType: 'Speaker RSVP',      company: '',         gateId: 'hall-a',       gateName: 'Hall A',          gateIcon: '🏛️', result: 'approved',    reason: 'Access Granted', timestamp: new Date(Date.now()-360000).toISOString() },
  { id: 's4', attendeeName: 'Dev Patel',      ticketType: 'Workshop Pass',     company: 'EduTech',  gateId: 'main-entrance',gateName: 'Main Entrance',   gateIcon: '🚪', result: 'approved',    reason: 'Access Granted', timestamp: new Date(Date.now()-480000).toISOString() },
  { id: 's5', attendeeName: 'Sneha Roy',      ticketType: 'General Delegate',  company: 'Finance+', gateId: 'workshop-1',   gateName: 'Workshop Room 1', gateIcon: '📚', result: 'zone_denied', reason: 'Zone Restricted', timestamp: new Date(Date.now()-600000).toISOString() },
  { id: 's6', attendeeName: 'Karan Singh',    ticketType: 'VIP Pass',          company: 'VentureX', gateId: 'main-entrance',gateName: 'Main Entrance',   gateIcon: '🚪', result: 'duplicate',   reason: 'Already Scanned', timestamp: new Date(Date.now()-720000).toISOString() },
  { id: 's7', attendeeName: 'Meera Iyer',     ticketType: 'Organiser / Staff', company: '',         gateId: 'vip-lounge',   gateName: 'VIP Lounge',      gateIcon: '💎', result: 'approved',    reason: 'Access Granted', timestamp: new Date(Date.now()-840000).toISOString() },
  { id: 's8', attendeeName: 'Unknown',        ticketType: '',                  company: '',         gateId: 'hall-b',       gateName: 'Hall B',          gateIcon: '🏛️', result: 'rejected',    reason: 'Not Found', timestamp: new Date(Date.now()-960000).toISOString() },
];

const fmt = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  const now = Date.now();
  const diff = now - d.getTime();
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
};

const EntryLog = () => {
  const [logs, setLogs]                   = useState([]);
  const [loading, setLoading]             = useState(true);
  const [searchQuery, setSearchQuery]     = useState('');
  const [filterZone, setFilterZone]       = useState('all');
  const [filterResult, setFilterResult]   = useState('all');
  const [autoRefresh]                     = useState(true);
  const [selectedAttendee, setSelectedAttendee] = useState(null); // { id, name, logs: [] }
  const [fetchingJourney, setFetchingJourney] = useState(false);

  useEffect(() => {
    try {
      const q = query(collection(db, 'scanLogs'), orderBy('timestamp', 'desc'), limit(200));
      const unsub = onSnapshot(q, snap => {
        const data = snap.docs.map(d => {
          const raw = d.data();
          return {
            id: d.id,
            ...raw,
            // Firestore Timestamp → ISO string
            timestamp: raw.timestamp?.toDate ? raw.timestamp.toDate().toISOString() : raw.timestamp,
          };
        });
        setLogs(data.length > 0 ? data : SEED_LOGS);
        setLoading(false);
      }, () => { setLogs(SEED_LOGS); setLoading(false); });
      return () => unsub();
    } catch { /* fallback already handled by onSnapshot error cb */ }
  }, []);

  // Filter
  const zones   = ['all', ...Array.from(new Set(logs.map(l => l.gateId)))];
  const results = ['all', 'approved', 'zone_denied', 'time_denied', 'duplicate', 'rejected'];

  const filtered = logs.filter(log => {
    if (filterZone !== 'all'   && log.gateId  !== filterZone)   return false;
    if (filterResult !== 'all' && log.result  !== filterResult)  return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!log.attendeeName?.toLowerCase().includes(q) &&
          !log.ticketType?.toLowerCase().includes(q)   &&
          !log.company?.toLowerCase().includes(q)      &&
          !log.gateName?.toLowerCase().includes(q))     return false;
    }
    return true;
  });

  // Stats
  const total    = logs.length;
  const approved = logs.filter(l => l.result === 'approved').length;
  const denied   = logs.filter(l => ['zone_denied','time_denied','rejected'].includes(l.result)).length;
  const unique   = new Set(logs.filter(l => l.attendeeId).map(l => l.attendeeId)).size;

  const exportCSV = () => {
    const header = ['Name', 'Ticket', 'Company', 'Zone', 'Result', 'Reason', 'Date', 'Time', 'Device', 'Operator'].join(',');
    const rows = filtered.map(l => {
      const d = new Date(l.timestamp);
      return [
        `"${l.attendeeName}"`,
        `"${l.ticketType}"`,
        `"${l.company || ''}"`,
        `"${l.gateName}"`,
        `"${l.result}"`,
        `"${l.reason}"`,
        `"${d.toLocaleDateString()}"`,
        `"${d.toLocaleTimeString()}"`,
        `"${l.deviceName || ''}"`,
        `"${l.holderName || ''}"`
      ].join(',');
    });
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `Event_Entry_History_${new Date().toISOString().slice(0,10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const showJourney = async (log) => {
    if (!log.attendeeId && log.attendeeName === 'Unknown') return;
    
    setFetchingJourney(true);
    setSelectedAttendee({ id: log.attendeeId, name: log.attendeeName, logs: [] });

    try {
      // Find all SUCCESSFUL entries for this person to build a map of movement
      let journeyLogs = [];
      if (log.attendeeId) {
        const q = query(
          collection(db, 'scanLogs'), 
          where('attendeeId', '==', log.attendeeId),
          orderBy('timestamp', 'asc')
        );
        const snap = await getDocs(q);
        journeyLogs = snap.docs.map(d => ({ 
          ...d.data(), 
          timestamp: d.data().timestamp?.toDate ? d.data().timestamp.toDate().toISOString() : d.data().timestamp 
        }));
      } else {
        // Fallback for demo/manual entries without ID - search by name
        journeyLogs = logs
          .filter(l => l.attendeeName === log.attendeeName)
          .sort((a,b) => new Date(a.timestamp) - new Date(b.timestamp));
      }
      setSelectedAttendee(prev => ({ ...prev, logs: journeyLogs }));
    } catch (e) {
      console.error('Error fetching journey:', e);
    } finally {
      setFetchingJourney(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Stats row */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Total Scans',      value: total,    icon: Activity,    color: 'text-white',     border: 'border-white/10' },
          { label: 'Approved',         value: approved, icon: CheckCircle2,color: 'text-green-400', border: 'border-green-500/20' },
          { label: 'Denied / Blocked', value: denied,   icon: Ban,         color: 'text-red-400',   border: 'border-red-500/20' },
          { label: 'Unique Attendees', value: unique,   icon: Users,       color: 'text-primary',   border: 'border-primary/20' },
        ].map(stat => (
          <div key={stat.label} className={`glass-panel p-5 border ${stat.border}`}>
            <div className="flex justify-between items-center mb-2">
              <p className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest">{stat.label}</p>
              <stat.icon className={`w-4 h-4 ${stat.color}`} />
            </div>
            <p className={`text-3xl font-black ${stat.color}`}>{stat.value}</p>
            {total > 0 && stat.label !== 'Unique Attendees' && stat.label !== 'Total Scans' && (
              <p className="text-zinc-600 text-xs mt-1">{Math.round((stat.value / total) * 100)}% of scans</p>
            )}
          </div>
        ))}
      </div>

      {/* Filter bar */}
      <div className="glass-panel p-4 flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search name, ticket, company, zone…"
            className="w-full pl-9 pr-4 py-2 bg-white/5 border border-white/10 rounded-xl text-white placeholder-zinc-600 text-sm outline-none focus:border-primary/50 transition-colors" />
        </div>

        {/* Zone filter */}
        <div className="flex items-center gap-1.5">
          <Filter className="w-4 h-4 text-zinc-500" />
          <select value={filterZone} onChange={e => setFilterZone(e.target.value)}
            className="bg-zinc-900 border border-white/10 text-white text-sm rounded-xl px-3 py-2 outline-none focus:border-primary/50">
            {zones.map(z => (
              <option key={z} value={z}>
                {z === 'all' ? 'All Zones' : logs.find(l => l.gateId === z)?.gateIcon + ' ' + (logs.find(l => l.gateId === z)?.gateName || z)}
              </option>
            ))}
          </select>
        </div>

        {/* Result filter */}
        <select value={filterResult} onChange={e => setFilterResult(e.target.value)}
          className="bg-zinc-900 border border-white/10 text-white text-sm rounded-xl px-3 py-2 outline-none focus:border-primary/50">
          {results.map(r => (
            <option key={r} value={r}>{r === 'all' ? 'All Results' : RESULT_STYLES[r]?.label || r}</option>
          ))}
        </select>

        {/* Live badge */}
        <div className="flex items-center gap-1.5 ml-auto">
          {autoRefresh && (
            <span className="flex items-center gap-1 text-[10px] font-bold text-green-400 bg-green-400/10 border border-green-400/20 px-2 py-1 rounded-full">
              <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" /> LIVE
            </span>
          )}
          <button onClick={exportCSV}
            className="flex items-center gap-1.5 px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-zinc-400 hover:text-white hover:bg-white/10 transition-all text-xs font-bold">
            <Download className="w-3.5 h-3.5" /> CSV
          </button>
        </div>
      </div>

      {/* Log entries */}
      <div className="glass-panel overflow-hidden">
        <div className="p-4 border-b border-white/5 flex items-center justify-between">
          <p className="text-sm font-bold text-white">
            {filtered.length} entries {filterZone !== 'all' || filterResult !== 'all' || searchQuery ? '(filtered)' : ''}
          </p>
          <p className="text-xs text-zinc-600">Showing most recent first · Max 200</p>
        </div>

        {loading ? (
          <div className="py-20 flex items-center justify-center">
            <motion.div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full"
              animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-20 flex flex-col items-center text-center">
            <Activity className="w-10 h-10 text-zinc-700 mb-3" />
            <p className="text-zinc-500 font-medium">No entries match your filter.</p>
            <button onClick={() => { setSearchQuery(''); setFilterZone('all'); setFilterResult('all'); }}
              className="mt-3 text-primary text-sm hover:text-primary/80">Clear filters</button>
          </div>
        ) : (
          <div className="divide-y divide-white/[0.04]">
            {filtered.map((log, i) => {
              const style = RESULT_STYLES[log.result] || RESULT_STYLES.rejected;
              const Icon  = style.icon;
              return (
                <motion.div key={log.id}
                  initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(i * 0.02, 0.3) }}
                  onClick={() => showJourney(log)}
                  className="flex items-center gap-4 px-5 py-3 hover:bg-white/[0.04] transition-colors group cursor-pointer relative">
                  
                  {/* Tooltip on hover */}
                  <div className="absolute left-1/2 -top-8 -translate-x-1/2 px-2 py-1 bg-primary text-[10px] font-black text-white rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-10 whitespace-nowrap shadow-xl">
                    CLICK TO VIEW MOVEMENT MAP
                  </div>

                  {/* Result color bar */}
                  <div className={`w-1 h-10 rounded-full flex-shrink-0 ${style.bar}`} />

                  {/* Icon */}
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 border ${style.bg} ${style.border}`}>
                    <Icon className={`w-4 h-4 ${style.color}`} />
                  </div>

                  {/* Attendee info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-bold text-white text-sm">{log.attendeeName || 'Unknown'}</p>
                      {log.ticketType && (
                        <span className="text-[10px] font-bold text-zinc-400 bg-white/5 border border-white/10 px-2 py-0.5 rounded-full">
                          {log.ticketType}
                        </span>
                      )}
                      {log.company && <span className="text-zinc-600 text-xs">{log.company}</span>}
                    </div>
                    <p className="text-zinc-500 text-xs mt-0.5">{log.reason}</p>
                  </div>

                  {/* Zone */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-lg">{log.gateIcon}</span>
                    <div className="min-w-[80px]">
                      <p className="text-zinc-300 text-xs font-bold">{log.gateName}</p>
                      {log.deviceName && <p className="text-zinc-600 text-[10px]">{log.deviceName}</p>}
                    </div>
                  </div>

                  {/* Upsell Badge */}
                  {log.upsellTriggered && (
                    <div className="flex items-center gap-1.5 px-2 py-1 bg-indigo-500/10 border border-indigo-500/30 rounded-lg group/upsell relative">
                      <Mail className="w-3 h-3 text-indigo-400" />
                      <span className="text-[9px] font-black text-indigo-400 leading-none">UPSELL</span>
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-indigo-600 text-white text-[8px] font-bold rounded opacity-0 group-hover/upsell:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                        Email Sent: Workshop Invite
                      </div>
                    </div>
                  )}

                  {/* Result badge */}
                  <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border flex-shrink-0 ${style.bg} ${style.color} ${style.border}`}>
                    {style.label}
                  </span>

                  {/* Time */}
                  <div className="text-right flex-shrink-0 min-w-16">
                    <p className="text-zinc-400 text-xs font-bold">{fmt(log.timestamp)}</p>
                    <p className="text-zinc-700 text-[10px] font-mono">
                      {log.timestamp ? new Date(log.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : ''}
                    </p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* ─── Journey Timeline Modal ─── */}
      <AnimatePresence>
        {selectedAttendee && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4"
            onClick={() => setSelectedAttendee(null)}>
            <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9 }}
              className="w-full max-w-2xl glass-panel rounded-3xl border border-white/10 p-0 overflow-hidden shadow-2xl"
              onClick={e => e.stopPropagation()}>
              
              {/* Modal Header */}
              <div className="bg-white/5 p-6 border-b border-white/10 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-primary/20 rounded-2xl flex items-center justify-center text-primary border border-primary/20">
                    <MapPin className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-white leading-tight">{selectedAttendee.name}</h2>
                    <p className="text-zinc-500 text-xs font-medium tracking-wide uppercase mt-0.5">Attendee Movement Journey</p>
                  </div>
                </div>
                <button onClick={() => setSelectedAttendee(null)}
                  className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-500 hover:text-white transition-all">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Modal Content */}
              <div className="p-8 max-h-[60vh] overflow-y-auto custom-scrollbar bg-black/40">
                {fetchingJourney ? (
                  <div className="py-20 flex flex-col items-center gap-4">
                    <RefreshCw className="w-10 h-10 text-primary animate-spin" />
                    <p className="text-zinc-500 font-bold text-sm">RECONSTRUCTING JOURNEY...</p>
                  </div>
                ) : selectedAttendee.logs.length === 0 ? (
                  <div className="py-20 text-center">
                    <p className="text-zinc-600 font-bold italic">No consistent history found for this ID.</p>
                  </div>
                ) : (
                  <div className="relative pl-8">
                    {/* Vertical line */}
                    <div className="absolute left-[11px] top-2 bottom-2 w-0.5 bg-gradient-to-b from-primary/50 via-zinc-800 to-zinc-900/10" />

                    <div className="space-y-10">
                      {selectedAttendee.logs.map((jlog, idx) => {
                        const style = RESULT_STYLES[jlog.result] || RESULT_STYLES.rejected;
                        const isLast = idx === selectedAttendee.logs.length - 1;
                        const timeStr = new Date(jlog.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });

                        return (
                          <motion.div key={idx} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: idx * 0.1 }}
                            className="relative flex items-start gap-6 group">
                            
                            {/* Dot indicator */}
                            <div className={`absolute -left-[30px] top-1.5 w-6 h-6 rounded-lg flex items-center justify-center z-10 border transition-transform group-hover:scale-125 ${
                              jlog.result === 'approved' ? 'bg-green-500 border-green-400 rotate-45 shadow-[0_0_15px_rgba(34,197,94,0.4)]' : 'bg-red-500 border-red-400'
                            }`}>
                              <div className="-rotate-45">
                                {jlog.result === 'approved' 
                                  ? <CheckCircle2 className="w-3 h-3 text-white" /> 
                                  : <Ban className="w-3 h-3 text-white" />}
                              </div>
                            </div>

                            {/* Journey Card */}
                            <div className="flex-1 glass-panel p-4 border border-white/5 group-hover:border-primary/20 transition-all bg-white/[0.02]">
                              <div className="flex justify-between items-start mb-2">
                                <div className="flex items-center gap-2">
                                  <span className="text-xl">{jlog.gateIcon}</span>
                                  <p className="text-white font-black uppercase text-xs tracking-tighter">{jlog.gateName}</p>
                                </div>
                                <span className="text-primary font-mono text-xs font-black bg-primary/10 px-2 py-0.5 rounded border border-primary/20">
                                  {timeStr}
                                </span>
                              </div>
                              
                              <div className="flex items-center gap-2 mb-3">
                                <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-sm border ${style.bg} ${style.color} ${style.border}`}>
                                  {style.label}
                                </span>
                                <span className="text-zinc-600 text-[10px]">— {jlog.reason}</span>
                              </div>

                              <div className="flex items-center justify-between text-[10px]">
                                <div className="flex items-center gap-1.5 text-zinc-500 font-bold">
                                  <Users className="w-3 h-3" /> Scanned by {jlog.holderName || 'System'}
                                </div>
                                {jlog.deviceName && (
                                  <div className="text-zinc-700 italic flex items-center gap-1">
                                    via {jlog.deviceName}
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Transition Arrow for between points */}
                            {!isLast && jlog.result === 'approved' && (
                              <div className="absolute -bottom-7 left-12 flex items-center gap-1 text-zinc-800">
                                <ArrowRight className="w-3 h-3 rotate-90" />
                                <span className="text-[8px] font-black uppercase tracking-widest">Moving to Next zone</span>
                              </div>
                            )}
                          </motion.div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="p-6 bg-white/[0.02] border-t border-white/5 text-center">
                <p className="text-zinc-600 text-[10px] font-bold uppercase tracking-widest">
                  Total Zone Checkpoints: {selectedAttendee.logs.filter(l => l.result === 'approved').length}
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default EntryLog;
