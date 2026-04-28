import React, { useState, useEffect } from 'react';

import {
    Monitor, Layout, Tv, Image as ImageIcon, Type,
    Maximize2, Zap, Palette, Play, ArrowLeft, X, CheckCircle2, AlertCircle
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { db } from '../firebase';
import { collection, doc, onSnapshot, setDoc, serverTimestamp, query } from 'firebase/firestore';

const DEFAULT_CONFIG = {
    theme: 'Split Flow',
    message: 'Welcome, {name}!',
    customBgImage: null,
    showPicture: true,
    showName: true,
    showCompany: true,
    showDesignation: true,
    primaryColor: '#5422ff',
    speed: 5,
};

const GATE_FALLBACK = [
    { id: 'main-entrance', label: 'Main Entrance', icon: '🚪' },
    { id: 'hall-a',        label: 'Hall A',        icon: '🏛️' },
    { id: 'vip-lounge',   label: 'VIP Lounge',    icon: '💎' },
    { id: 'giveaway',     label: 'Giveaway',       icon: '🎁' },
];

const PREVIEW_ATTENDEE = {
    name: 'Alexander Pierce',
    company: 'Global Dynamics Corp',
    designation: 'Chief Technology Officer',
    avatar: 'https://i.pravatar.cc/150?u=alex',
};

// ─── Live TV Preview ─────────────────────────────────────────────────────────
const TVPreview = ({ config }) => {
    const { theme, message, primaryColor, showPicture, showName, showCompany, showDesignation } = config;
    const color = primaryColor || '#5422ff';
    const welcomeText = message
        .replace('{name}', PREVIEW_ATTENDEE.name)
        .replace('{company}', PREVIEW_ATTENDEE.company);

    const avatarEl = (
        <div className="relative shrink-0">
            <div className="absolute -inset-4 blur-2xl rounded-full opacity-40" style={{ background: color }} />
            <img src={PREVIEW_ATTENDEE.avatar} alt="" className="w-20 h-20 rounded-full border-4 border-white/20 relative z-10" />
        </div>
    );

    const badgeEl = showDesignation ? (
        <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase border"
            style={{ color, borderColor: `${color}55`, background: `${color}15` }}>
            {PREVIEW_ATTENDEE.designation}
        </span>
    ) : null;

    if (theme === 'Centered') {
        return (
            <div className="flex flex-col items-center justify-center text-center gap-5 h-full p-10">
                <p className="text-[10px] font-black uppercase tracking-[0.3em]" style={{ color }}>{welcomeText}</p>
                {showPicture && avatarEl}
                {showName && <h3 className="text-3xl font-black text-white tracking-tight leading-none">{PREVIEW_ATTENDEE.name}</h3>}
                <div className="flex items-center gap-3 flex-wrap justify-center">
                    {showCompany && <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">{PREVIEW_ATTENDEE.company}</span>}
                    {badgeEl}
                </div>
            </div>
        );
    }

    if (theme === 'Dynamic Grid') {
        return (
            <div className="h-full p-10 flex flex-col gap-4">
                <p className="text-[10px] font-black uppercase tracking-[0.3em]" style={{ color }}>{welcomeText}</p>
                {showName && (
                    <h3 className="text-5xl font-black text-white tracking-tighter leading-none flex-1 flex items-center">
                        {PREVIEW_ATTENDEE.name}
                    </h3>
                )}
                <div className="grid grid-cols-3 gap-2">
                    {showCompany && (
                        <div className="bg-white/5 border border-white/10 rounded-xl p-3">
                            <p className="text-[8px] font-black text-zinc-600 uppercase tracking-widest mb-1">Org</p>
                            <p className="text-[10px] font-bold text-white truncate">{PREVIEW_ATTENDEE.company}</p>
                        </div>
                    )}
                    {showDesignation && (
                        <div className="bg-white/5 border border-white/10 rounded-xl p-3">
                            <p className="text-[8px] font-black text-zinc-600 uppercase tracking-widest mb-1">Role</p>
                            <p className="text-[10px] font-bold text-white truncate">{PREVIEW_ATTENDEE.designation}</p>
                        </div>
                    )}
                    <div className="rounded-xl p-3" style={{ background: `${color}12`, border: `1px solid ${color}33` }}>
                        <p className="text-[8px] font-black uppercase tracking-widest mb-1" style={{ color }}>Status</p>
                        <p className="text-[10px] font-bold text-green-400">✓ Approved</p>
                    </div>
                </div>
            </div>
        );
    }

    if (theme === 'Cinematic') {
        return (
            <div className="h-full flex flex-col justify-end p-10 gap-3">
                <p className="text-[9px] font-black uppercase tracking-[0.4em] opacity-60" style={{ color }}>{welcomeText}</p>
                {showName && (
                    <h3 className="text-6xl font-black text-white leading-none tracking-tighter"
                        style={{ WebkitTextStroke: `1px ${color}44` }}>
                        {PREVIEW_ATTENDEE.name}
                    </h3>
                )}
                <div className="flex items-center gap-4 pt-2 border-t border-white/5">
                    {showCompany && <p className="text-xs font-bold text-zinc-400">{PREVIEW_ATTENDEE.company}</p>}
                    {showCompany && showDesignation && <div className="w-px h-3 bg-white/20" />}
                    {showDesignation && <p className="text-xs font-bold text-zinc-500">{PREVIEW_ATTENDEE.designation}</p>}
                </div>
            </div>
        );
    }

    // Split Flow (default)
    return (
        <div className="flex items-center gap-8 h-full p-10">
            {showPicture && avatarEl}
            <div className="flex-1 min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[0.3em] mb-3" style={{ color }}>{welcomeText}</p>
                {showName && <h3 className="text-3xl font-black text-white tracking-tight leading-none mb-3">{PREVIEW_ATTENDEE.name}</h3>}
                <div className="flex items-center gap-3 flex-wrap">
                    {showCompany && <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">{PREVIEW_ATTENDEE.company}</p>}
                    {badgeEl}
                </div>
            </div>
        </div>
    );
};

// ─── Main Component ───────────────────────────────────────────────────────────
const WelcomeTVDesigner = ({ embedded = false }) => {
    const [gates, setGates] = useState(GATE_FALLBACK);
    const [selectedGateId, setSelectedGateId] = useState(GATE_FALLBACK[0].id);
    const [config, setConfig] = useState(DEFAULT_CONFIG);
    const [savedConfig, setSavedConfig] = useState(DEFAULT_CONFIG);
    const [saving, setSaving] = useState(false);
    const [saveStatus, setSaveStatus] = useState(null); // 'saved' | 'error' | null

    // Load gates from registered devices in Firestore
    useEffect(() => {
        const unsub = onSnapshot(query(collection(db, 'devices')), snap => {
            const gateMap = new Map();
            snap.docs.forEach(d => {
                const gate = d.data().assignedGate;
                if (gate?.id) gateMap.set(gate.id, gate);
            });
            if (gateMap.size > 0) {
                const list = [...gateMap.values()];
                setGates(list);
                setSelectedGateId(id => gateMap.has(id) ? id : list[0].id);
            }
        });
        return () => unsub();
    }, []);

    // Load saved config for this gate from tvConfigs/{gateId}
    useEffect(() => {
        if (!selectedGateId) return;
        const unsub = onSnapshot(doc(db, 'tvConfigs', selectedGateId), snap => {
            const data = snap.exists() ? { ...DEFAULT_CONFIG, ...snap.data() } : DEFAULT_CONFIG;
            setConfig(data);
            setSavedConfig(data);
        });
        return () => unsub();
    }, [selectedGateId]);

    const handleDeploy = async () => {
        if (!selectedGateId || saving) return;
        setSaving(true);
        try {
            await setDoc(doc(db, 'tvConfigs', selectedGateId), {
                ...config,
                updatedAt: serverTimestamp(),
            });
            setSavedConfig(config);
            setSaveStatus('saved');
        } catch {
            setSaveStatus('error');
        } finally {
            setSaving(false);
            setTimeout(() => setSaveStatus(null), 3000);
        }
    };

    const handleDiscard = () => setConfig(savedConfig);

    const cfg = (key, val) => setConfig(c => ({ ...c, [key]: val }));
    const isDirty = JSON.stringify(config) !== JSON.stringify(savedConfig);
    const selectedGate = gates.find(g => g.id === selectedGateId);

    return (
        <div className={embedded
            ? 'flex flex-col font-inter rounded-2xl overflow-hidden border border-white/10'
            : 'min-h-screen bg-[#050505] text-white flex flex-col font-inter'
        }>
            {/* Top Bar */}
            {!embedded && (
                <header className="h-16 border-b border-white/5 bg-black/40 backdrop-blur-xl px-8 flex items-center justify-between sticky top-0 z-[100]">
                    <div className="flex items-center gap-6">
                        <Link to="/owner" className="p-2 hover:bg-white/5 rounded-full transition-all">
                            <ArrowLeft className="w-5 h-5 text-zinc-400" />
                        </Link>
                        <div>
                            <h1 className="text-sm font-black uppercase tracking-[0.3em] text-white">TV UI Studio</h1>
                            <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">
                                {selectedGate ? `${selectedGate.icon} ${selectedGate.label}` : 'Select a Gate'}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        {saveStatus === 'saved' && (
                            <div className="flex items-center gap-2 px-4 py-2 bg-green-500/10 border border-green-500/20 rounded-xl text-green-400 text-[10px] font-black uppercase tracking-widest">
                                <CheckCircle2 className="w-3.5 h-3.5" /> Deployed
                            </div>
                        )}
                        {saveStatus === 'error' && (
                            <div className="flex items-center gap-2 px-4 py-2 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-[10px] font-black uppercase tracking-widest">
                                <AlertCircle className="w-3.5 h-3.5" /> Failed
                            </div>
                        )}
                        <button
                            onClick={handleDiscard}
                            disabled={!isDirty}
                            className="px-5 py-2 bg-white/5 border border-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-white/10 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                            Discard
                        </button>
                        <button
                            onClick={handleDeploy}
                            disabled={saving}
                            className="px-6 py-2 bg-primary border border-primary/50 rounded-xl text-[10px] font-black uppercase tracking-widest hover:opacity-90 shadow-[0_0_20px_rgba(84,34,255,0.3)] transition-all disabled:opacity-60"
                        >
                            {saving ? 'Deploying…' : 'Deploy to Gate TV'}
                        </button>
                    </div>
                </header>
            )}

            <div className={`flex-1 flex overflow-hidden ${embedded ? 'h-[800px]' : ''}`}>
                {/* ── Control Panel ── */}
                <aside className="w-80 border-r border-white/5 bg-black/20 overflow-y-auto p-6 space-y-8 no-scrollbar">

                    {/* Gate Selector */}
                    <div className="space-y-3">
                        <h3 className="flex items-center gap-2 text-[10px] font-black text-zinc-500 uppercase tracking-widest">
                            <Monitor className="w-3 h-3" /> Target Gate
                        </h3>
                        <div className="grid grid-cols-1 gap-1.5">
                            {gates.map(g => (
                                <button
                                    key={g.id}
                                    onClick={() => setSelectedGateId(g.id)}
                                    className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all text-[10px] font-black uppercase tracking-widest ${
                                        selectedGateId === g.id
                                            ? 'bg-primary/10 border-primary text-primary'
                                            : 'bg-white/5 border-white/5 text-zinc-500 hover:border-white/10 hover:text-zinc-300'
                                    }`}
                                >
                                    <span>{g.icon}</span> {g.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Layout Engine */}
                    <div className="space-y-3">
                        <h3 className="flex items-center gap-2 text-[10px] font-black text-zinc-500 uppercase tracking-widest">
                            <Layout className="w-3 h-3" /> Layout
                        </h3>
                        <div className="grid grid-cols-2 gap-2">
                            {['Split Flow', 'Centered', 'Dynamic Grid', 'Cinematic'].map(l => (
                                <button
                                    key={l}
                                    onClick={() => cfg('theme', l)}
                                    className={`p-4 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all ${
                                        config.theme === l
                                            ? 'bg-primary/10 border-primary text-primary'
                                            : 'bg-white/5 border-white/5 text-zinc-500 hover:border-white/10'
                                    }`}
                                >
                                    {l}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Accent Color */}
                    <div className="space-y-3">
                        <h3 className="flex items-center gap-2 text-[10px] font-black text-zinc-500 uppercase tracking-widest">
                            <Palette className="w-3 h-3" /> Accent Color
                        </h3>
                        <div className="flex items-center gap-3">
                            <input
                                type="color"
                                value={config.primaryColor}
                                onChange={e => cfg('primaryColor', e.target.value)}
                                className="w-12 h-10 rounded-lg border border-white/10 bg-transparent cursor-pointer"
                            />
                            <input
                                type="text"
                                value={config.primaryColor}
                                onChange={e => /^#[0-9a-fA-F]{0,6}$/.test(e.target.value) && cfg('primaryColor', e.target.value)}
                                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white font-mono outline-none focus:border-primary/50 transition-colors uppercase"
                            />
                        </div>
                    </div>

                    {/* Background */}
                    <div className="space-y-3">
                        <h3 className="flex items-center gap-2 text-[10px] font-black text-zinc-500 uppercase tracking-widest">
                            <ImageIcon className="w-3 h-3" /> Background
                        </h3>
                        <label className="flex flex-col items-center justify-center p-4 border border-dashed border-white/10 rounded-xl hover:bg-white/5 cursor-pointer transition-all gap-1">
                            <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Upload Custom Image</span>
                            <span className="text-[9px] text-zinc-600">PNG or JPG • Stored locally</span>
                            <input type="file" accept="image/png,image/jpeg" className="hidden" onChange={e => {
                                const file = e.target.files[0];
                                if (file) {
                                    const reader = new FileReader();
                                    reader.onload = evt => cfg('customBgImage', evt.target.result);
                                    reader.readAsDataURL(file);
                                }
                            }} />
                        </label>
                        {config.customBgImage && (
                            <div className="relative h-24 rounded-xl overflow-hidden border border-white/10">
                                <img src={config.customBgImage} alt="Custom Background" className="w-full h-full object-cover" />
                                <button onClick={() => cfg('customBgImage', null)}
                                    className="absolute top-2 right-2 p-1.5 bg-black/60 rounded-lg hover:bg-red-500/80 transition-colors">
                                    <X className="w-3 h-3 text-white" />
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Display Elements */}
                    <div className="space-y-3">
                        <h3 className="flex items-center gap-2 text-[10px] font-black text-zinc-500 uppercase tracking-widest">
                            <Monitor className="w-3 h-3" /> Display Elements
                        </h3>
                        <div className="space-y-1.5">
                            {[
                                { id: 'showPicture',     label: 'Profile Picture'   },
                                { id: 'showName',        label: 'Attendee Name'     },
                                { id: 'showCompany',     label: 'Company'           },
                                { id: 'showDesignation', label: 'Designation Badge' },
                            ].map(item => (
                                <label key={item.id}
                                    className="flex items-center justify-between p-3 bg-white/5 border border-white/5 rounded-xl cursor-pointer hover:bg-white/10 transition-all">
                                    <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-300">{item.label}</span>
                                    <input type="checkbox" checked={config[item.id]} onChange={e => cfg(item.id, e.target.checked)}
                                        className="accent-primary w-4 h-4" />
                                </label>
                            ))}
                        </div>
                    </div>

                    {/* Welcome Message */}
                    <div className="space-y-3">
                        <h3 className="flex items-center gap-2 text-[10px] font-black text-zinc-500 uppercase tracking-widest">
                            <Type className="w-3 h-3" /> Welcome Message
                        </h3>
                        <textarea
                            value={config.message}
                            onChange={e => cfg('message', e.target.value)}
                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs text-white outline-none min-h-[80px] resize-none focus:border-primary/50 transition-colors"
                            placeholder="Welcome {name}…"
                        />
                        <p className="text-[9px] text-zinc-600 font-medium italic">
                            Use {'{name}'} and {'{company}'} as dynamic placeholders.
                        </p>
                    </div>

                    {/* Animation Speed */}
                    <div className="space-y-3">
                        <h3 className="flex items-center gap-2 text-[10px] font-black text-zinc-500 uppercase tracking-widest">
                            <Play className="w-3 h-3" /> Display Duration: {config.speed}s
                        </h3>
                        <input
                            type="range" min="3" max="15" step="1"
                            value={config.speed}
                            onChange={e => cfg('speed', parseInt(e.target.value))}
                            className="w-full accent-primary"
                        />
                        <div className="flex justify-between text-[8px] text-zinc-600 font-black uppercase">
                            <span>3s</span><span>15s</span>
                        </div>
                    </div>

                    {/* Embedded deploy buttons */}
                    {embedded && (
                        <div className="flex gap-3 pt-2">
                            <button onClick={handleDiscard} disabled={!isDirty}
                                className="flex-1 py-3 bg-white/5 border border-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-white/10 transition-all disabled:opacity-30">
                                Discard
                            </button>
                            <button onClick={handleDeploy} disabled={saving}
                                className="flex-1 py-3 bg-primary rounded-xl text-[10px] font-black uppercase tracking-widest hover:opacity-90 transition-all disabled:opacity-60">
                                {saving ? 'Deploying…' : 'Deploy'}
                            </button>
                        </div>
                    )}
                </aside>

                {/* ── Canvas Area ── */}
                <main className="flex-1 bg-[#020202] p-12 flex flex-col items-center justify-center relative">
                    <div className="absolute top-6 left-6 flex items-center gap-3">
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-green-500/10 border border-green-500/20 rounded-full">
                            <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                            <span className="text-[10px] font-black text-green-500 uppercase tracking-widest">Live Preview</span>
                        </div>
                        {isDirty && (
                            <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/10 border border-amber-500/20 rounded-full">
                                <div className="w-1.5 h-1.5 bg-amber-500 rounded-full" />
                                <span className="text-[10px] font-black text-amber-500 uppercase tracking-widest">Unsaved</span>
                            </div>
                        )}
                    </div>

                    {/* TV Emulator */}
                    <div className="w-full max-w-4xl aspect-video bg-black rounded-3xl border-4 border-zinc-800 shadow-[0_0_100px_rgba(0,0,0,1)] overflow-hidden relative">
                        {/* Background layers */}
                        <div className="absolute inset-0 bg-mesh opacity-40" />
                        {config.customBgImage && (
                            <div className="absolute inset-0 z-0">
                                <img src={config.customBgImage} alt="" className="w-full h-full object-cover opacity-50" />
                                <div className="absolute inset-0 bg-black/50" />
                            </div>
                        )}

                        {/* Animated accent top strip */}
                        <div className="absolute top-0 left-0 right-0 h-0.5 z-20"
                            style={{ background: `linear-gradient(90deg, transparent, ${config.primaryColor}, transparent)` }} />

                        {/* Content */}
                        <div className="absolute inset-0 z-10">
                            <motion.div
                                key={config.theme}
                                initial={{ opacity: 0, y: 12 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.4 }}
                                className="h-full"
                            >
                                <TVPreview config={config} />
                            </motion.div>
                        </div>

                        {/* Scanner corner brackets */}
                        <div className="absolute inset-0 pointer-events-none opacity-15">
                            <div className="absolute top-0 left-0 w-20 h-20 border-t-2 border-l-2 m-8" style={{ borderColor: config.primaryColor }} />
                            <div className="absolute top-0 right-0 w-20 h-20 border-t-2 border-r-2 m-8" style={{ borderColor: config.primaryColor }} />
                            <div className="absolute bottom-0 left-0 w-20 h-20 border-b-2 border-l-2 m-8" style={{ borderColor: config.primaryColor }} />
                            <div className="absolute bottom-0 right-0 w-20 h-20 border-b-2 border-r-2 m-8" style={{ borderColor: config.primaryColor }} />
                        </div>
                    </div>

                    <div className="mt-8 flex items-center gap-12 text-zinc-600 font-medium text-sm">
                        <div className="flex items-center gap-2"><Tv className="w-4 h-4" /> 4K Output</div>
                        <div className="flex items-center gap-2"><Zap className="w-4 h-4" /> {config.speed}s display</div>
                        <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full" style={{ background: config.primaryColor }} />
                            Accent: {config.primaryColor}
                        </div>
                    </div>
                </main>
            </div>
        </div>
    );
};

export default WelcomeTVDesigner;
