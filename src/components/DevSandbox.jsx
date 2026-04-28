import React, { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Code, Play, Terminal, Database, ShieldCheck, CheckCircle2, Copy, Zap, Info } from 'lucide-react';

const DevSandbox = ({ apiKey }) => {
    const [activeEndpoint, setActiveEndpoint] = useState('inventory');
    const [isSimulating, setIsSimulating] = useState(false);
    const [response, setResponse] = useState(null);

    const endpoints = [
        { 
            id: 'inventory', 
            method: 'GET', 
            path: '/v1/events/{id}/inventory', 
            desc: 'Check ticket counts and pricing across all categories.' 
        },
        { 
            id: 'register', 
            method: 'POST', 
            path: '/v1/tickets/issue', 
            desc: 'Issue a ticket sold on your platform directly to our system.' 
        },
    ];

    const runSimulation = () => {
        setIsSimulating(true);
        setResponse(null);
        
        setTimeout(() => {
            if (activeEndpoint === 'inventory') {
                setResponse({
                    status: 200,
                    data: {
                        event_id: "EP_7721",
                        name: "Global Tech Summit 2026",
                        categories: [
                            { id: "VIP_01", name: "VIP Pass", price: 999, currency: "USD", left: 142 },
                            { id: "GEN_02", name: "General Delegate", price: 299, currency: "USD", left: 840 },
                            { id: "SPK_03", name: "Speaker Pass", price: 0, currency: "USD", left: 12 }
                        ]
                    }
                });
            } else {
                setResponse({
                    status: 201,
                    data: {
                        registration_id: "REG_API_" + Math.random().toString(36).substr(2, 6).toUpperCase(),
                        attendee: "Akshay Sharma",
                        status: "Issued",
                        source: "External API (BookMyShow)",
                        timestamp: new Date().toISOString()
                    }
                });
            }
            setIsSimulating(false);
        }, 1500);
    };

    return (
        <div className="grid grid-cols-12 gap-8 mt-8">
            {/* Left: Endpoint List */}
            <div className="col-span-4 space-y-3">
                <h4 className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-4">API Reference</h4>
                {endpoints.map(ep => (
                    <button
                        key={ep.id}
                        onClick={() => { setActiveEndpoint(ep.id); setResponse(null); }}
                        className={`w-full text-left p-4 rounded-xl border transition-all ${
                            activeEndpoint === ep.id 
                            ? 'bg-primary/5 border-primary/30 text-white' 
                            : 'bg-white/5 border-white/5 text-zinc-500 hover:border-white/10'
                        }`}
                    >
                        <div className="flex items-center gap-2 mb-1">
                            <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${ep.method === 'GET' ? 'bg-emerald-500 text-black' : 'bg-amber-500 text-black'}`}>
                                {ep.method}
                            </span>
                            <span className="text-xs font-mono font-bold">{ep.id}</span>
                        </div>
                        <p className="text-[10px] opacity-70 leading-relaxed">{ep.desc}</p>
                    </button>
                ))}

                <div className="p-4 bg-purple-500/10 border border-purple-500/20 rounded-xl mt-6">
                    <div className="flex items-center gap-2 text-purple-400 mb-2">
                        <ShieldCheck className="w-4 h-4" />
                        <span className="text-[10px] font-black uppercase tracking-widest">Authentication</span>
                    </div>
                    <p className="text-[10px] text-zinc-500 leading-relaxed">
                        Pass your key in the header: <br/> 
                        <code className="text-purple-300 font-mono">X-API-KEY: {apiKey || 'YOUR_KEY'}</code>
                    </p>
                </div>
            </div>

            {/* Right: Sandbox Console */}
            <div className="col-span-8 flex flex-col gap-4">
                <div className="glass-panel border-white/5 flex-1 flex flex-col overflow-hidden">
                    <div className="p-4 border-b border-white/5 flex justify-between items-center bg-white/[0.02]">
                        <div className="flex items-center gap-3">
                            <Terminal className="w-4 h-4 text-zinc-500" />
                            <span className="text-xs font-mono text-zinc-300">
                                {endpoints.find(e => e.id === activeEndpoint)?.path}
                            </span>
                        </div>
                        <button 
                            onClick={runSimulation}
                            disabled={isSimulating}
                            className="px-4 py-1.5 bg-primary rounded-lg text-[10px] font-black uppercase text-white hover:bg-primary/80 transition-all flex items-center gap-2 disabled:opacity-50"
                        >
                            {isSimulating ? <Zap className="w-3.5 h-3.5 animate-pulse" /> : <Play className="w-3.5 h-3.5 fill-current" />}
                            Run Test
                        </button>
                    </div>

                    <div className="flex-1 p-6 font-mono text-xs overflow-auto bg-[#0A0A0A]">
                        {activeEndpoint === 'register' && !response && !isSimulating && (
                             <div className="text-zinc-600 mb-4 italic">// Request Payload</div>
                        )}
                        <pre className="text-zinc-400">
                            {activeEndpoint === 'register' && !response && !isSimulating ? 
                            JSON.stringify({ 
                                event_id: "EP_7721",
                                attendee_name: "Akshay Sharma",
                                email: "akshay@example.com",
                                ticket_type: "VIP_01",
                                agent_ref: "BMS_88291"
                            }, null, 4) : 
                            isSimulating ? 
                            "// Connecting to secure node...\n// Authenticating key..." : 
                            response ? 
                            <AnimatePresence mode="wait">
                                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                                    <div className="text-emerald-400 font-bold mb-4">// Response: {response.status} OK</div>
                                    {JSON.stringify(response.data, null, 4)}
                                </motion.div>
                            </AnimatePresence> : 
                            "// Awaiting request..."}
                        </pre>
                    </div>
                </div>

                <div className="flex items-center gap-3 p-4 bg-white/5 border border-white/5 rounded-xl">
                    <Info className="w-4 h-4 text-zinc-500" />
                    <p className="text-[10px] text-zinc-600">
                        This is a simulated environment. In production, these requests are strictly rate-limited to 100/min per agent.
                    </p>
                </div>
            </div>
        </div>
    );
};

export default DevSandbox;
