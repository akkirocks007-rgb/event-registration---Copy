import React, { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { X, Bell, UserCheck, CreditCard, ShieldAlert, Zap, AlertTriangle, CheckCircle2, Gift, TrendingUp } from 'lucide-react';

const NOTIFICATIONS = [
  { id: 1,  type: 'registration', title: 'New Registration',      desc: 'Riya Sharma just registered for Global Tech Summit (VIP Pass).', time: '2m ago',   icon: UserCheck,    color: 'text-emerald-400', bg: 'bg-emerald-500/10', read: false },
  { id: 2,  type: 'revenue',      title: 'Revenue Milestone 🎉',  desc: 'You have crossed 70% of your ₹5L revenue target!',                time: '18m ago',  icon: TrendingUp,   color: 'text-primary',     bg: 'bg-primary/10',      read: false },
  { id: 3,  type: 'registration', title: 'New Registration',      desc: 'James Okafor registered — General Delegate.',                     time: '34m ago',  icon: UserCheck,    color: 'text-emerald-400', bg: 'bg-emerald-500/10', read: false },
  { id: 4,  type: 'system',       title: 'Staff Assigned',        desc: 'Arjun Mehta is now an Admin for Modern UI Workshop.',             time: '1h ago',   icon: ShieldAlert,  color: 'text-purple-400',  bg: 'bg-purple-500/10',   read: true  },
  { id: 5,  type: 'revenue',      title: 'Payment Received',      desc: 'Stripe payment of $899 confirmed — VIP Pass #GT-X812.',          time: '2h ago',   icon: CreditCard,   color: 'text-sky-400',     bg: 'bg-sky-500/10',      read: true  },
  { id: 6,  type: 'system',       title: 'Promo Code Applied',    desc: 'Code EARLY20 was redeemed by Meera Nair — 20% off.',             time: '3h ago',   icon: Gift,         color: 'text-amber-400',   bg: 'bg-amber-500/10',    read: true  },
  { id: 7,  type: 'system',       title: 'Zone Access Denied',    desc: 'Attendee GT-X512 attempted VIP Lounge without clearance.',        time: '5h ago',   icon: AlertTriangle,color: 'text-red-400',     bg: 'bg-red-500/10',      read: true  },
  { id: 8,  type: 'system',       title: 'Automation Triggered',  desc: '"24hr Pre-Event Reminder" email sent to 1,240 attendees.',       time: '8h ago',   icon: Zap,          color: 'text-indigo-400',  bg: 'bg-indigo-500/10',   read: true  },
];

const TABS = [
  { id: 'all',          label: 'All' },
  { id: 'registration', label: 'Registrations' },
  { id: 'revenue',      label: 'Revenue' },
  { id: 'system',       label: 'System' },
];

const NotificationCenter = ({ isOpen, onClose }) => {
  const [items, setItems] = useState(NOTIFICATIONS);
  const [activeFilter, setActiveFilter] = useState('all');

  const unreadCount = items.filter(n => !n.read).length;
  const filtered = activeFilter === 'all' ? items : items.filter(n => n.type === activeFilter);

  const markRead = (id) => setItems(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  const markAllRead = () => setItems(prev => prev.map(n => ({ ...n, read: true })));

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex justify-end pointer-events-none">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm pointer-events-auto" onClick={onClose} />

      <motion.div
        initial={{ x: 420, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: 420, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className="relative w-[400px] h-full glass-panel border-l border-white/10 pointer-events-auto flex flex-col shadow-2xl"
      >
        {/* Header */}
        <div className="p-6 border-b border-white/5 flex justify-between items-center bg-white/[0.02]">
          <div className="flex items-center gap-2">
            <div className="relative">
              <Bell className="w-5 h-5 text-primary" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-amber-500 text-white text-[9px] font-black flex items-center justify-center">{unreadCount}</span>
              )}
            </div>
            <h2 className="text-xl font-bold text-white">Notifications</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full transition-colors">
            <X className="w-5 h-5 text-zinc-500" />
          </button>
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-1 p-3 border-b border-white/5 bg-white/[0.01]">
          {TABS.map(tab => {
            const tabUnread = tab.id === 'all'
              ? unreadCount
              : items.filter(n => n.type === tab.id && !n.read).length;
            return (
              <button key={tab.id}
                onClick={() => setActiveFilter(tab.id)}
                className={`relative px-3 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-widest transition-all ${
                  activeFilter === tab.id ? 'bg-primary text-white' : 'text-zinc-500 hover:text-white hover:bg-white/5'
                }`}
              >
                {tab.label}
                {tabUnread > 0 && (
                  <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-amber-500 text-white text-[8px] font-black flex items-center justify-center">{tabUnread}</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Feed */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
          <AnimatePresence>
            {filtered.map((n) => (
              <motion.div
                key={n.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: 20 }}
                onClick={() => markRead(n.id)}
                className={`p-4 rounded-xl border cursor-pointer transition-all ${
                  n.read
                    ? 'bg-white/[0.02] border-white/5 opacity-60 hover:opacity-80'
                    : 'bg-white/[0.06] border-white/10 hover:bg-white/10'
                }`}
              >
                <div className="flex gap-3">
                  <div className={`p-2 rounded-xl ${n.bg} shrink-0 mt-0.5`}>
                    <n.icon className={`w-4 h-4 ${n.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className={`font-bold text-sm ${n.read ? 'text-zinc-400' : 'text-white'}`}>{n.title}</p>
                      {!n.read && <div className="w-2 h-2 rounded-full bg-primary shrink-0 mt-1.5" />}
                    </div>
                    <p className="text-xs text-zinc-500 leading-relaxed mt-1">{n.desc}</p>
                    <p className="text-[10px] text-zinc-700 mt-2 font-bold uppercase tracking-wider">{n.time}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          {filtered.length === 0 && (
            <div className="text-center py-12">
              <CheckCircle2 className="w-10 h-10 text-zinc-700 mx-auto mb-3" />
              <p className="text-zinc-600 text-sm font-bold">All caught up!</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-white/5 bg-white/[0.02] flex justify-between items-center">
          <span className="text-[10px] text-zinc-600 font-bold uppercase">{unreadCount} unread</span>
          <button onClick={markAllRead} className="text-xs font-bold text-primary hover:underline transition-colors">
            Mark all as read
          </button>
        </div>
      </motion.div>
    </div>
  );
};

export default NotificationCenter;
