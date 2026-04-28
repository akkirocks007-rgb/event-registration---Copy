import React, { useState, useRef, useEffect } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot } from 'firebase/firestore';
import { AnimatePresence } from 'framer-motion';
import { Upload, Plus, Store, Mic2, ArrowRightCircle, ArrowLeftCircle, X, Save, Edit3, Trash2, MapPin, Coffee, Users, PenTool, Bath, AlertTriangle, LayoutGrid, ChevronDown, Check, Search } from 'lucide-react';

const MARKER_TYPES = [
  { id: 'stall', label: 'Exhibition Stall', icon: Store, color: 'bg-emerald-500', text: 'text-emerald-400' },
];

export default function MapBuilder() {
  const [maps, setMaps] = useState([
    { id: 'map_1', name: 'Main Floor', bgImage: null, markers: [] }
  ]);
  const [activeMapId, setActiveMapId] = useState('map_1');
  const [showMapDropdown, setShowMapDropdown] = useState(false);
  
  // Interaction state
  const [isAdding, setIsAdding] = useState(false);
  const [activeType, setActiveType] = useState('stall');
  const [pendingPlacement, setPendingPlacement] = useState(null);
  const [genericLabel, setGenericLabel] = useState('');
  const [exhibitorSearch, setExhibitorSearch] = useState('');
  const [exhibitors, setExhibitors] = useState([]);
  const [zoneRules, setZoneRules] = useState([]);

  useEffect(() => {
    const handleStorage = () => setExhibitors(JSON.parse(localStorage.getItem('exhibitors') || '[]'));
    handleStorage();
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);
  
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'zoneRules'), snap => {
      setZoneRules(snap.docs.map(d => ({ gateId: d.id, ...d.data() })));
    }, () => {});
    return () => unsub();
  }, []);

  const customZoneMarkers = zoneRules.map(rule => ({
      id: rule.gateId,
      label: rule.gateName,
      iconStr: rule.gateIcon,
      color: 'bg-primary/50',
      text: 'text-primary'
  }));
  const combinedMarkerTypes = [...MARKER_TYPES, ...customZoneMarkers];
  
  const mapRef = useRef(null);
  const activeMap = maps.find(m => m.id === activeMapId);

  const updateActiveMap = (updates) => {
    setMaps(maps.map(m => m.id === activeMapId ? { ...m, ...updates } : m));
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => updateActiveMap({ bgImage: e.target.result });
      reader.readAsDataURL(file);
    }
  };

  const handleMapClick = (e) => {
    if (!isAdding || !activeMap?.bgImage) return;
    
    const rect = mapRef.current.getBoundingClientRect();
    // Calculate percentage based coordinates
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    
    setPendingPlacement({ x, y, type: activeType });
  };

  const deleteMarker = (id, e) => {
    e.stopPropagation();
    updateActiveMap({
       markers: activeMap.markers.filter(m => m.id !== id)
    });
  };

  const addNewMap = () => {
    const name = prompt("Enter a name for the new map (e.g. 'Second Floor', 'Outdoor Area'):");
    if (name) {
      const newId = `map_${Date.now()}`;
      setMaps([...maps, { id: newId, name, bgImage: null, markers: [] }]);
      setActiveMapId(newId);
      setShowMapDropdown(false);
    }
  };

  const deleteActiveMap = () => {
    if (maps.length === 1) {
       alert("You must have at least one map.");
       return;
    }
    if (window.confirm(`Are you sure you want to delete '${activeMap.name}'?`)) {
       const newMaps = maps.filter(m => m.id !== activeMapId);
       setMaps(newMaps);
       setActiveMapId(newMaps[0].id);
       setShowMapDropdown(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 glass-panel p-6 border-white/5">
        <div>
          <h2 className="text-2xl font-black text-white uppercase tracking-tight">Interactive Map Builder</h2>
          <p className="text-zinc-400 text-sm mt-1">Manage multiple floorplans and assign dynamic interactive zones.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
           <div className="relative">
              <button 
                onClick={() => setShowMapDropdown(!showMapDropdown)}
                className="px-4 py-2 bg-black/40 border border-white/10 rounded-xl flex items-center gap-3 min-w-[200px] justify-between hover:bg-white/5 transition-all"
              >
                 <div className="flex items-center gap-2">
                    <LayoutGrid className="w-4 h-4 text-primary" />
                    <span className="font-bold text-sm text-white">{activeMap?.name}</span>
                 </div>
                 <ChevronDown className="w-4 h-4 text-zinc-500" />
              </button>
              
              <AnimatePresence>
                {showMapDropdown && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}
                    className="absolute top-full right-0 mt-2 w-64 bg-zinc-900 border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50"
                  >
                     {maps.map(m => (
                       <button 
                         key={m.id}
                         onClick={() => { setActiveMapId(m.id); setShowMapDropdown(false); }}
                         className="w-full px-4 py-3 text-left flex items-center justify-between hover:bg-white/5 transition-all border-b border-white/5 last:border-0"
                       >
                          <span className={`text-sm font-bold ${activeMapId === m.id ? 'text-primary' : 'text-zinc-300'}`}>{m.name}</span>
                          {activeMapId === m.id && <Check className="w-4 h-4 text-primary" />}
                       </button>
                     ))}
                     <div className="p-2 border-t border-white/10">
                        <button onClick={addNewMap} className="w-full px-4 py-2 flex items-center gap-2 text-xs font-bold text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-all">
                           <Plus className="w-3 h-3" /> Create New Map
                        </button>
                     </div>
                  </motion.div>
                )}
              </AnimatePresence>
           </div>
           
           <button className="px-5 py-2 bg-primary/10 border border-primary/20 text-primary font-bold rounded-xl transition-all hover:bg-primary/20 flex items-center gap-2 text-sm uppercase tracking-widest shadow-lg shadow-primary/5">
              <Save className="w-4 h-4" /> Save Maps
           </button>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-6">
         {/* Tools Panel */}
         <div className="col-span-12 lg:col-span-3 space-y-6">
            <div className="glass-panel p-6 relative group">
               {maps.length > 1 && (
                  <button onClick={deleteActiveMap} className="absolute top-4 right-4 w-6 h-6 bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white rounded flex items-center justify-center transition-all opacity-0 group-hover:opacity-100">
                     <Trash2 className="w-3 h-3" />
                  </button>
               )}
               <h3 className="font-bold text-white mb-4 uppercase tracking-widest text-xs text-zinc-500">1. Background</h3>
               {!activeMap?.bgImage ? (
                  <label className="flex flex-col items-center justify-center h-32 border-2 border-dashed border-white/10 rounded-xl hover:border-primary/50 hover:bg-primary/5 transition-all cursor-pointer bg-black/20">
                    <Upload className="w-6 h-6 text-zinc-400 mb-2" />
                    <span className="text-xs font-bold text-zinc-300">Upload {activeMap?.name}</span>
                    <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                  </label>
               ) : (
                  <div className="space-y-3">
                     <div className="relative h-32 rounded-xl overflow-hidden border border-white/10 group/img shadow-inner">
                        <img src={activeMap.bgImage} alt="Map preview" className="w-full h-full object-cover opacity-50" />
                        <div className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 group-hover/img:opacity-100 transition-opacity backdrop-blur-sm">
                           <label className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-xs font-bold text-white cursor-pointer transition-colors border border-white/20 shadow-xl">
                              Replace Map Image
                              <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                           </label>
                        </div>
                     </div>
                  </div>
               )}
            </div>

            <div className="glass-panel p-6">
               <h3 className="font-bold text-white mb-4 uppercase tracking-widest text-xs text-zinc-500 flex justify-between items-center">
                 <span>2. Place Zones</span>
                 <span className="text-[9px] bg-white/5 px-2 py-0.5 rounded-full">{activeMap?.markers?.length || 0} placed</span>
               </h3>
               <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                  {combinedMarkerTypes.map(type => (
                     <button 
                       key={type.id}
                       onClick={() => { setActiveType(type.id); setIsAdding(true); }}
                       disabled={!activeMap?.bgImage}
                       className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all ${isAdding && activeType === type.id ? 'bg-white/10 border-white/20 shadow-[0_0_15px_rgba(255,255,255,0.05)]' : 'bg-black/20 border-white/5 hover:bg-white/5 disabled:opacity-50 disabled:cursor-not-allowed'}`}
                     >
                        <div className="flex items-center gap-3">
                           <div className={`w-8 h-8 rounded-lg ${type.color} flex items-center justify-center bg-opacity-20 ${type.text}`}>
                              {type.iconStr ? <span className="text-xl">{type.iconStr}</span> : type.icon && <type.icon className="w-4 h-4" />}
                           </div>
                           <span className="text-sm font-bold text-white">{type.label}</span>
                        </div>
                        {isAdding && activeType === type.id && (
                           <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_10px_#10b981]" />
                        )}
                     </button>
                  ))}
               </div>
               
               <AnimatePresence>
                 {isAdding && (
                   <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="mt-4 overflow-hidden">
                      <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-start gap-2">
                        <Edit3 className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
                        <p className="text-[10px] text-amber-200/80 font-bold uppercase tracking-wide leading-relaxed">Click anywhere on the map to place the selected marker.</p>
                      </div>
                   </motion.div>
                 )}
               </AnimatePresence>
            </div>
         </div>

         {/* Map Area */}
         <div className="col-span-12 lg:col-span-9">
            <div className="glass-panel p-2 md:p-6 min-h-[600px] flex items-center justify-center relative overflow-hidden group/canvas bg-black/40">
               {!activeMap?.bgImage ? (
                  <div className="text-center max-w-sm">
                     <div className="w-24 h-24 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-6">
                        <MapPin className="w-10 h-10 text-white/20" />
                     </div>
                     <h3 className="text-xl font-black text-white mb-2 uppercase tracking-tight">Empty Canvas</h3>
                     <p className="text-zinc-500 text-sm">Upload a floorplan image to start placing interactive exhibition zones for <b>{activeMap?.name}</b>.</p>
                  </div>
               ) : (
                  <div 
                    ref={mapRef}
                    className={`relative w-full max-w-5xl border border-white/10 shadow-2xl rounded-xl overflow-hidden ${isAdding ? 'cursor-crosshair' : 'cursor-default'}`}
                    onClick={handleMapClick}
                  >
                     <img src={activeMap.bgImage} alt={`${activeMap.name} Map`} className="w-full h-auto object-contain block" />
                     
                     {/* Markers */}
                     {activeMap.markers.map(marker => {
                        const mType = combinedMarkerTypes.find(t => t.id === marker.type) || combinedMarkerTypes[0];
                        const Icon = mType.icon;
                        return (
                           <motion.div 
                             initial={{ scale: 0, opacity: 0 }}
                             animate={{ scale: 1, opacity: 1 }}
                             key={marker.id}
                             className="absolute flex flex-col items-center justify-center transform -translate-x-1/2 -translate-y-1/2 group/marker z-10"
                             style={{ left: `${marker.x}%`, top: `${marker.y}%` }}
                           >
                              <div className={`w-8 h-8 md:w-10 md:h-10 rounded-full ${mType.color} flex items-center justify-center shadow-2xl border-2 border-white/20 relative cursor-pointer hover:scale-110 hover:z-20 transition-all`}>
                                 {mType.iconStr ? <span className="text-lg md:text-xl">{mType.iconStr}</span> : Icon && <Icon className="w-4 h-4 md:w-5 md:h-5 text-white" />}
                                 
                                 {/* Delete Button (visible on hover) */}
                                 <button 
                                   onClick={(e) => deleteMarker(marker.id, e)}
                                   className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 border-2 border-[#1a1a1a] rounded-full flex items-center justify-center opacity-0 group-hover/marker:opacity-100 transition-opacity scale-0 group-hover/marker:scale-100"
                                 >
                                    <X className="w-3 h-3 text-white stroke-[3px]" />
                                 </button>
                              </div>
                              <div className="mt-2 px-3 py-1.5 bg-black/90 backdrop-blur-md border border-white/10 rounded-lg text-[10px] md:text-xs font-black text-white whitespace-nowrap shadow-2xl opacity-0 group-hover/marker:opacity-100 md:opacity-100 transition-opacity pointer-events-none">
                                 {marker.label}
                              </div>
                           </motion.div>
                        );
                     })}
                  </div>
               )}
            </div>
         </div>
      </div>
      <AnimatePresence>
         {pendingPlacement && (() => {
            const isStall = pendingPlacement.type === 'stall';
            const placedStallLabels = activeMap?.markers.map(m => m.label) || [];
            const availableExhibitors = exhibitors.filter(ex => !placedStallLabels.includes(ex.stallNumber || ex.company));
            const currentMarkerInfo = combinedMarkerTypes.find(t => t.id === pendingPlacement.type);
            
            return (
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
               <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="bg-zinc-900 border border-white/10 rounded-2xl p-6 shadow-2xl max-w-sm w-full">
                  <div className="flex justify-between items-center mb-4">
                     <h3 className="text-lg font-bold text-white">
                        {isStall ? 'Select Exhibitor Stall' : `Place ${currentMarkerInfo?.label}`}
                     </h3>
                     <button onClick={() => { setPendingPlacement(null); setExhibitorSearch(''); setGenericLabel(''); }} className="w-8 h-8 flex items-center justify-center bg-white/5 hover:bg-white/10 rounded-full text-zinc-500 hover:text-white transition-colors">
                        <X className="w-4 h-4" />
                     </button>
                  </div>
                  
                  {!isStall ? (
                     <div className="space-y-4">
                        <div className="space-y-2">
                           <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Marker Label / Name</label>
                           <input 
                              type="text" 
                              autoFocus
                              placeholder="e.g. Area A, Washroom 1..."
                              value={genericLabel}
                              onChange={(e) => setGenericLabel(e.target.value)}
                              onKeyDown={(e) => {
                                 if (e.key === 'Enter' && genericLabel.trim()) {
                                    updateActiveMap({
                                       markers: [...activeMap.markers, { id: Date.now().toString(), type: pendingPlacement.type, x: pendingPlacement.x, y: pendingPlacement.y, label: genericLabel.trim() }]
                                    });
                                    setPendingPlacement(null);
                                    setIsAdding(false);
                                    setGenericLabel('');
                                 }
                              }}
                              className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-primary/50 focus:outline-none transition-colors"
                           />
                        </div>
                        <button 
                           disabled={!genericLabel.trim()}
                           onClick={() => {
                              updateActiveMap({
                                 markers: [...activeMap.markers, { id: Date.now().toString(), type: pendingPlacement.type, x: pendingPlacement.x, y: pendingPlacement.y, label: genericLabel.trim() }]
                              });
                              setPendingPlacement(null);
                              setIsAdding(false);
                              setGenericLabel('');
                           }} 
                           className="w-full py-3 bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:hover:bg-primary/50 text-white font-bold rounded-xl transition-all shadow-lg shadow-primary/20"
                        >
                           Save Marker
                        </button>
                     </div>
                  ) : (
                     <>
                        {exhibitors.length > 0 && (
                           <div className="relative mb-4">
                              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                              <input 
                                 type="text" 
                                 placeholder="Search by company or stall..." 
                                 value={exhibitorSearch}
                                 onChange={(e) => setExhibitorSearch(e.target.value)}
                                 className="w-full bg-black/40 border border-white/10 rounded-xl pl-10 pr-4 py-2 text-sm text-white focus:border-primary/50 focus:outline-none transition-colors placeholder:text-zinc-600"
                              />
                           </div>
                        )}

                        {(() => {
                           const filteredExhibitors = availableExhibitors.filter(ex => 
                              ex.company.toLowerCase().includes(exhibitorSearch.toLowerCase()) || 
                              (ex.stallNumber && ex.stallNumber.toLowerCase().includes(exhibitorSearch.toLowerCase()))
                           );

                           return availableExhibitors.length === 0 ? (
                              <div className="text-center py-6 glass-panel border-dashed">
                                 <Store className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
                                 <p className="text-zinc-500 text-sm font-medium">
                                    {exhibitors.length === 0 ? "No exhibitors found." : "All exhibitors placed."}
                                 </p>
                                 <p className="text-zinc-600 text-xs mt-1">
                                    {exhibitors.length === 0 ? "Please add exhibitors in the Directory first." : "Check the map or add more."}
                                 </p>
                              </div>
                           ) : filteredExhibitors.length === 0 ? (
                              <div className="text-center py-6 glass-panel border-dashed">
                                 <p className="text-zinc-500 text-sm font-medium">No results match your search.</p>
                              </div>
                           ) : (
                              <div className="max-h-60 overflow-y-auto space-y-2 custom-scrollbar pr-2">
                                 {filteredExhibitors.map(ex => (
                                    <button key={ex.id} onClick={() => {
                                       updateActiveMap({
                                          markers: [...activeMap.markers, { id: Date.now().toString(), type: pendingPlacement.type, x: pendingPlacement.x, y: pendingPlacement.y, label: ex.stallNumber || ex.company }]
                                       });
                                       setPendingPlacement(null);
                                       setIsAdding(false);
                                       setExhibitorSearch('');
                                    }} className="w-full text-left p-4 rounded-xl bg-white/5 hover:bg-primary/20 border border-white/10 hover:border-primary/50 transition-colors group">
                                       <div className="font-bold text-white text-sm group-hover:text-primary transition-colors">{ex.company}</div>
                                       <div className="text-xs text-zinc-400 mt-1 flex items-center gap-1.5"><Store className="w-3.5 h-3.5 text-emerald-400" /> Stall: {ex.stallNumber || 'Unassigned'}</div>
                                    </button>
                                 ))}
                              </div>
                           );
                        })()}
                     </>
                  )}
               </motion.div>
            </div>
            );
         })()}
      </AnimatePresence>
    </div>
  );
}
