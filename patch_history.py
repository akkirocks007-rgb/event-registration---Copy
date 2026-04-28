import sys

with open('src/pages/DeviceManager.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

marker = "      </AnimatePresence>\n    </PageWrapper>"

HISTORY_BLOCK = r"""      </AnimatePresence>

      {/* Custody History Modal */}
      <AnimatePresence>
        {historyDeviceId && (() => {
          const device = devices.find(d => d.id === historyDeviceId);
          if (!device) return null;
          const history    = device.custodyHistory || [];
          const allEntries = [...history, ...(device.currentHolder ? [{ ...device.currentHolder, logoutTime: null }] : [])].reverse();
          const fmt = (iso) => iso ? new Date(iso).toLocaleString('en-IN', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit', hour12:true }) : '';
          const durStr = (a, b) => {
            if (!a || !b) return null;
            const ms = new Date(b) - new Date(a);
            const h = Math.floor(ms/3600000), m = Math.floor((ms%3600000)/60000);
            return h > 0 ? h + 'h ' + m + 'm' : m + 'm';
          };
          return (
            <motion.div key="hist" initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
              onClick={() => setHistoryDeviceId(null)}>
              <motion.div initial={{ scale:0.9, y:20 }} animate={{ scale:1, y:0 }} exit={{ scale:0.9 }}
                className="w-full max-w-lg glass-panel rounded-2xl border border-white/10 shadow-2xl overflow-hidden"
                onClick={e => e.stopPropagation()}>
                <div className="p-6 border-b border-white/5 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-white/5 border border-white/10 rounded-xl flex items-center justify-center">
                      <Monitor className="w-5 h-5 text-zinc-400" />
                    </div>
                    <div>
                      <h2 className="font-bold text-white">{device.name}</h2>
                      <p className="text-xs text-zinc-500">{device.assignedGate?.icon} {device.assignedGate?.label} - Custody Log</p>
                    </div>
                  </div>
                  <button onClick={() => setHistoryDeviceId(null)} className="p-2 rounded-lg hover:bg-white/10 text-zinc-500 hover:text-white transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="p-6 max-h-96 overflow-y-auto space-y-3">
                  {allEntries.length === 0 ? (
                    <div className="py-12 flex flex-col items-center text-center">
                      <History className="w-10 h-10 text-zinc-700 mb-3" />
                      <p className="text-zinc-500 font-medium">No custody history yet.</p>
                      <p className="text-zinc-700 text-sm mt-1">History appears once staff sign in with this PIN.</p>
                    </div>
                  ) : allEntries.map((entry, i) => {
                    const active = !entry.logoutTime;
                    const d = durStr(entry.loginTime, entry.logoutTime);
                    return (
                      <div key={i} className={"p-4 rounded-xl border flex items-start gap-4 " + (active ? "bg-green-500/5 border-green-500/20" : "bg-white/[0.03] border-white/[0.08]")}>
                        <div className={"w-10 h-10 rounded-full flex items-center justify-center font-black text-sm flex-shrink-0 border " + (active ? "bg-green-500/10 border-green-500/20 text-green-400" : "bg-white/5 border-white/10 text-zinc-400")}>
                          {entry.name?.[0]?.toUpperCase() || "?"}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 mb-1">
                            <p className="font-bold text-white text-sm">{entry.name}</p>
                            {active && <span className="text-[9px] font-bold text-green-400 bg-green-400/10 border border-green-400/20 px-1.5 py-0.5 rounded-full">Active</span>}
                            {entry.hasPhoto && <span className="text-[9px] font-bold text-primary bg-primary/10 border border-primary/20 px-1.5 py-0.5 rounded-full flex items-center gap-0.5"><Camera className="w-2.5 h-2.5" /> Photo</span>}
                          </div>
                          {entry.designation && <p className="text-zinc-500 text-xs">{entry.designation}</p>}
                          {entry.phone && <p className="text-zinc-600 text-xs font-mono">{entry.phone}</p>}
                          <div className="flex flex-wrap gap-3 mt-2 text-xs text-zinc-600">
                            <span>In: <span className="text-zinc-400">{fmt(entry.loginTime)}</span></span>
                            {entry.logoutTime && <span>Out: <span className="text-zinc-400">{fmt(entry.logoutTime)}</span></span>}
                            {d && <span>Duration: {d}</span>}
                          </div>
                        </div>
                        <span className="text-[10px] text-zinc-700 font-mono">{i === 0 ? "Latest" : "#" + (allEntries.length - i)}</span>
                      </div>
                    );
                  })}
                </div>
                <div className="px-6 py-4 border-t border-white/5 flex items-center justify-between">
                  <p className="text-xs text-zinc-600">{allEntries.length} session{allEntries.length !== 1 ? "s" : ""} logged</p>
                  <button onClick={() => setHistoryDeviceId(null)} className="px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-zinc-300 text-sm font-medium hover:bg-white/10 transition-colors">Close</button>
                </div>
              </motion.div>
            </motion.div>
          );
        })()}
      </AnimatePresence>
    </PageWrapper>"""

if marker not in content:
    print("ERROR: marker not found in file")
    sys.exit(1)

new_content = content.replace(marker, HISTORY_BLOCK, 1)

with open('src/pages/DeviceManager.jsx', 'w', encoding='utf-8') as f:
    f.write(new_content)

print(f"Patched successfully. New length: {len(new_content)}")
