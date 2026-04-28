import React from 'react';
import { LayoutGrid, Users, Settings, LogOut, Activity, Bell, Key } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

const Sidebar = ({ activeTab, setActiveTab, role }) => {
  const { logout } = useAuth();
  
  const ownerMenu = [
    { id: 'overview', icon: LayoutGrid, label: 'Home' },
    { id: 'analytics', icon: Activity, label: 'Stats' },
    { id: 'organisers', icon: Users, label: 'Organisers' },
    { id: 'settings', icon: Settings, label: 'Config' },
  ];

  const menuItems = role === 'owner' ? ownerMenu : ownerMenu.slice(0, 2);

  return (
    <>
      {/* 💻 Desktop Sidebar */}
      <div className="hidden lg:flex w-64 glass-panel h-[calc(100vh-2rem)] m-4 flex-col p-6 fixed left-0 top-0 z-50">
        <div className="flex items-center gap-3 px-2 mb-10">
          <div className="w-10 h-10 bg-gradient-to-br from-primary to-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-primary/20">
            <span className="text-white font-black text-xl">E</span>
          </div>
          <span className="font-black text-xl tracking-tighter text-white uppercase italic">EventPro</span>
        </div>

        <nav className="flex-1 space-y-2">
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab ? setActiveTab(item.id) : null}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                activeTab === item.id 
                ? 'bg-primary/10 text-primary border border-primary/20 shadow-[0_0_15px_rgba(84,34,255,0.1)]' 
                : 'text-zinc-500 hover:text-white hover:bg-white/5'
              }`}
            >
              <item.icon className={`w-5 h-5 ${activeTab === item.id ? 'text-primary' : 'text-zinc-400'}`} />
              <span className="font-bold text-sm tracking-tight">{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="mt-auto space-y-6">
          <button 
              onClick={() => setActiveTab ? setActiveTab('notifications') : null}
              className="w-full p-4 bg-white/5 rounded-2xl border border-white/5 flex items-center gap-3 hover:bg-white/10 transition-all text-left group"
          >
              <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Bell className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1">
                  <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Signals</p>
                  <p className="text-xs text-white font-bold">Live Traffic</p>
              </div>
          </button>
          
          <button 
              onClick={logout}
              className="w-full flex items-center gap-3 px-4 py-2 text-zinc-500 hover:text-red-400 transition-colors group"
          >
              <LogOut className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
              <span className="font-bold text-sm">Sign Out</span>
          </button>
        </div>
      </div>

      {/* 📱 Mobile Bottom Navigation */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-[100] p-4 pb-8 bg-gradient-to-t from-black to-transparent pointer-events-none">
        <div className="glass-panel p-2 flex justify-around items-center gap-2 pointer-events-auto border-white/10 shadow-2xl">
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab ? setActiveTab(item.id) : null}
              className={`flex-1 flex flex-col items-center justify-center py-2 rounded-2xl transition-all ${
                activeTab === item.id 
                ? 'bg-primary/20 text-primary' 
                : 'text-zinc-500'
              }`}
            >
              <item.icon className={`w-6 h-6 mb-1 ${activeTab === item.id ? 'text-primary' : 'text-zinc-500'}`} />
              <span className="text-[10px] font-black uppercase tracking-tighter">{item.label}</span>
            </button>
          ))}
          <button onClick={logout} className="flex-1 flex flex-col items-center justify-center py-2 text-zinc-500">
            <LogOut className="w-6 h-6 mb-1" />
            <span className="text-[10px] font-black uppercase tracking-tighter">Exit</span>
          </button>
        </div>
      </div>
    </>
  );
};

export default Sidebar;
