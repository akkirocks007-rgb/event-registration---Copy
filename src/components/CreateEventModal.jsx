import React, { useState } from 'react';

import { X, CheckCircle, Info } from 'lucide-react';
import FormattedDateInput from './FormattedDateInput';

const CreateEventModal = ({ isOpen, onClose, onCreate }) => {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    name: '',
    type: 'physical',
    location: '',
    date: '',
  });

  if (!isOpen) return null;

  const nextStep = () => setStep(s => s + 1);
  const prevStep = () => setStep(s => s - 1);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="glass-panel w-full max-w-xl overflow-hidden"
      >
        <div className="p-6 border-b border-white/10 flex justify-between items-center">
            <h2 className="text-xl font-bold">Launch New Event</h2>
            <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full">
                <X className="w-5 h-5 text-zinc-400" />
            </button>
        </div>

        <div className="p-8">
            {/* Progress Bar */}
            <div className="flex gap-2 mb-8">
                {[1, 2, 3].map(i => (
                    <div key={i} className={`h-1 flex-1 rounded-full ${step >= i ? 'bg-purple-500' : 'bg-white/10'}`} />
                ))}
            </div>

            {step === 1 && (
                <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
                    <label className="block text-sm font-medium text-zinc-400 mb-2">Event Title</label>
                    <input 
                        type="text" 
                        placeholder="e.g. World Developers Summit" 
                        className="w-full mb-6"
                        value={formData.name}
                        onChange={(e) => setFormData({...formData, name: e.target.value})}
                    />
                    
                    <label className="block text-sm font-medium text-zinc-400 mb-2">Event Type</label>
                    <div className="grid grid-cols-2 gap-4">
                        {['Physical', 'Virtual'].map(type => (
                            <button 
                                key={type}
                                onClick={() => setFormData({...formData, type: type.toLowerCase()})}
                                className={`p-4 rounded-xl border transition-all ${
                                    formData.type === type.toLowerCase() 
                                    ? 'border-purple-500 bg-purple-500/10 text-white' 
                                    : 'border-white/10 bg-white/5 text-zinc-400'
                                }`}
                            >
                                {type}
                            </button>
                        ))}
                    </div>
                </motion.div>
            )}

            {step === 2 && (
                <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
                    <label className="block text-sm font-medium text-zinc-400 mb-2">Venue / Platform</label>
                    <input 
                        type="text" 
                        placeholder={formData.type === 'physical' ? 'Venue Address' : 'Streaming URL'} 
                        className="w-full mb-6"
                        value={formData.location}
                        onChange={(e) => setFormData({...formData, location: e.target.value})}
                    />
                    <label className="block text-sm font-medium text-zinc-400 mb-2">Event Date (DD-MM-YYYY)</label>
                    <FormattedDateInput 
                        className="w-full"
                        value={formData.date}
                        onChange={(e) => setFormData({...formData, date: e.target.value})}
                    />
                </motion.div>
            )}

            {step === 3 && (
                <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="text-center py-6">
                    <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                        <CheckCircle className="w-10 h-10 text-green-500" />
                    </div>
                    <h3 className="text-xl font-bold mb-2">Ready to Launch?</h3>
                    <p className="text-zinc-400 mb-6 px-10">We'll initialize your event dashboard and registration page instantly.</p>
                    <div className="bg-white/5 p-4 rounded-xl text-left border border-white/10">
                        <div className="flex gap-3 items-center text-sm text-zinc-300">
                            <Info className="w-4 h-4 text-purple-400" />
                            <span>This will use 1 of your 5 active event slots.</span>
                        </div>
                    </div>
                </motion.div>
            )}
        </div>

        <div className="p-6 bg-white/5 border-t border-white/10 flex justify-between items-center">
            {step > 1 ? (
                <button onClick={prevStep} className="text-zinc-400 hover:text-white transition-colors">
                    Back
                </button>
            ) : <div />}
            
            {step < 3 ? (
                <button onClick={nextStep} className="btn-primary">
                    Continue
                </button>
            ) : (
                <button onClick={() => { onCreate(formData); onClose(); }} className="btn-primary">
                    Launch Event
                </button>
            )}
        </div>
      </motion.div>
    </div>
  );
};

export default CreateEventModal;
