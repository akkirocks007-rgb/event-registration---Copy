import React, { useState, useEffect, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Search, Command, Map, Users, Settings, LogOut, Ticket, Layout, Calendar, Bell, Shield, Zap } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

const CommandPalette = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [selectedIndex, setSelectedIndex] = useState(0);
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const inputRef = useRef(null);

    // Navigation and Action Items
    const items = [
        { id: 'dashboard', title: 'Go to Dashboard', icon: Layout, shortcut: 'G D', action: () => navigate('/') },
        { id: 'attendees', title: 'Manage Attendees', icon: Users, shortcut: 'G A', roles: ['owner', 'admin'], action: () => navigate('/admin') },
        { id: 'events', title: 'Events Terminal', icon: Calendar, shortcut: 'G E', roles: ['owner', 'admin'], action: () => navigate('/owner') },
        { id: 'settings', title: 'System Settings', icon: Settings, shortcut: 'G S', roles: ['owner'], action: () => navigate('/owner') },
        { id: 'scanner', title: 'Gate Scanner', icon: Zap, shortcut: 'G C', roles: ['supervisor'], action: () => navigate('/scanner') },
        { id: 'ticket', title: 'My Digital Ticket', icon: Ticket, roles: ['attendee'], action: () => navigate('/attendee') },
        { id: 'logout', title: 'Terminate Session', icon: LogOut, shortcut: 'ESC L', action: logout },
    ].filter(item => !item.roles || item.roles.includes(user?.role));

    const filteredItems = items.filter(item => 
        item.title.toLowerCase().includes(query.toLowerCase())
    );

    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                setIsOpen(prev => !prev);
            }
            if (e.key === 'Escape') {
                setIsOpen(false);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    const resetPalette = () => {
        setQuery('');
        setSelectedIndex(0);
        setTimeout(() => inputRef.current?.focus(), 100);
    };

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        if (isOpen) resetPalette();
    }, [isOpen]);

    const handleSelect = (item) => {
        item.action();
        setIsOpen(false);
    };

    const handleKeyDown = (e) => {
        if (e.key === 'ArrowDown') {
            setSelectedIndex(prev => (prev + 1) % filteredItems.length);
        } else if (e.key === 'ArrowUp') {
            setSelectedIndex(prev => (prev - 1 + filteredItems.length) % filteredItems.length);
        } else if (e.key === 'Enter' && filteredItems[selectedIndex]) {
            handleSelect(filteredItems[selectedIndex]);
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[10000] flex items-start justify-center pt-32 px-4">
                    {/* Backdrop */}
                    <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setIsOpen(false)}
                        className="fixed inset-0 bg-black/60 backdrop-blur-md"
                    />

                    {/* Palette */}
                    <motion.div
                        initial={{ scale: 0.95, opacity: 0, y: -20 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        exit={{ scale: 0.95, opacity: 0, y: -20 }}
                        className="relative w-full max-w-xl bg-zinc-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
                    >
                        <div className="p-4 border-b border-white/5 flex items-center gap-3">
                            <Search className="w-5 h-5 text-zinc-500" />
                            <input 
                                ref={inputRef}
                                type="text"
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder="Search commands, pages, or data..."
                                className="flex-1 bg-transparent border-none outline-none text-white text-lg placeholder-zinc-700 font-medium"
                            />
                            <div className="flex items-center gap-1.5 px-2 py-1 bg-white/5 rounded-md border border-white/10">
                                <span className="text-[10px] text-zinc-500 font-black">ESC</span>
                            </div>
                        </div>

                        <div className="max-h-[400px] overflow-y-auto p-2 scrollbar-thin scrollbar-thumb-white/10">
                            {filteredItems.length > 0 ? (
                                <div className="space-y-1">
                                    {filteredItems.map((item, idx) => (
                                        <button
                                            key={item.id}
                                            onClick={() => handleSelect(item)}
                                            onMouseEnter={() => setSelectedIndex(idx)}
                                            className={`w-full flex items-center gap-4 p-3 rounded-xl transition-all text-left ${
                                                idx === selectedIndex ? 'bg-primary/20 border-primary/30 ring-1 ring-primary/20' : 'hover:bg-white/5 border border-transparent'
                                            }`}
                                        >
                                            <div className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${
                                                idx === selectedIndex ? 'bg-primary text-white' : 'bg-white/5 text-zinc-500'
                                            }`}>
                                                <item.icon className="w-5 h-5" />
                                            </div>
                                            <div className="flex-1">
                                                <h4 className="text-sm font-bold text-white">{item.title}</h4>
                                                <p className="text-[10px] text-zinc-600 font-bold uppercase tracking-wider">Navigate</p>
                                            </div>
                                            {item.shortcut && (
                                                <div className="flex items-center gap-1">
                                                    {item.shortcut.split(' ').map((key, kidx) => (
                                                        <span key={kidx} className="px-1.5 py-0.5 bg-white/5 border border-white/10 rounded text-[9px] text-zinc-500 font-mono">
                                                            {key}
                                                        </span>
                                                    ))}
                                                </div>
                                            )}
                                        </button>
                                    ))}
                                </div>
                            ) : (
                                <div className="py-12 text-center">
                                    <div className="w-12 h-12 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4 border border-white/5">
                                        <Shield className="w-6 h-6 text-zinc-700" />
                                    </div>
                                    <p className="text-sm text-zinc-600 font-medium">No results found for "<span className="text-zinc-400">{query}</span>"</p>
                                </div>
                            )}
                        </div>

                        <div className="p-3 bg-black/40 border-t border-white/5 flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <div className="flex items-center gap-1.5 grayscale opacity-50">
                                   <Zap className="w-3 h-3 text-primary fill-primary" />
                                   <span className="text-[9px] font-black tracking-widest text-white uppercase">EventPro OS v4.2</span>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className="text-[10px] text-zinc-600 flex items-center gap-1">
                                    <Command className="w-3 h-3" /> + K to toggle
                                </span>
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};

export default CommandPalette;
