import React, { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { AuthProvider, useAuth } from './hooks/useAuth';

// --- Premium Lazy Loading Pages ---
const Login               = lazy(() => import('./pages/Login'));
const OwnerDashboard       = lazy(() => import('./pages/OwnerDashboard'));
const AdminDashboard       = lazy(() => import('./pages/AdminDashboard'));
const SupervisorDashboard  = lazy(() => import('./pages/SupervisorDashboard'));
const ExhibitorDashboard   = lazy(() => import('./pages/ExhibitorDashboard'));
const AttendeePortal       = lazy(() => import('./pages/AttendeePortal'));
const Jumbotron            = lazy(() => import('./pages/Jumbotron'));
const PublicEventPage      = lazy(() => import('./pages/PublicEventPage'));
const ScannerMode          = lazy(() => import('./pages/ScannerMode'));
const DeviceLogin          = lazy(() => import('./pages/DeviceLogin'));
const DeviceManager        = lazy(() => import('./pages/DeviceManager'));
const WelcomeTV            = lazy(() => import('./pages/WelcomeTV'));
const WelcomeTVDesigner    = lazy(() => import('./pages/WelcomeTVDesigner'));
const SuperuserDashboard    = lazy(() => import('./pages/SuperuserDashboard'));
const ResellerDashboard     = lazy(() => import('./pages/ResellerDashboard'));
const OrganizerDashboard    = lazy(() => import('./pages/OrganizerDashboard'));

import './i18n';
import LanguageSwitcher from './components/LanguageSwitcher';
import CommandPalette from './components/CommandPalette';

// Premium Loader Component
const PageLoader = () => (
  <div className="fixed inset-0 bg-[#050505] z-[9999] flex flex-col items-center justify-center">
    <motion.div 
      animate={{ scale: [1, 1.1, 1], rotate: [0, 180, 360] }}
      transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
      className="w-16 h-16 border-t-2 border-r-2 border-primary rounded-full relative"
    >
      <div className="absolute inset-2 border-b-2 border-l-2 border-primary/20 rounded-full" />
    </motion.div>
    <motion.p 
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} 
      className="mt-6 text-zinc-500 font-bold uppercase tracking-[0.3em] text-[10px]"
    >
      Optimizing Session
    </motion.p>
  </div>
);

const ProtectedRoute = ({ children, allowedRole, allowedRoles }) => {
  const { user, loading } = useAuth();
  if (loading) return <PageLoader />;
  if (!user) return <Navigate to="/login" />;

  // Superuser has full access by design (Firestore rules already grant it).
  if (user.role === 'superuser') return children;

  if (allowedRoles && !allowedRoles.includes(user.role)) return <Navigate to="/" />;
  if (allowedRole && user.role !== allowedRole) return <Navigate to="/" />;

  return children;
};

const DashboardRedirect = () => {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" />;
  switch(user.role) {
    case 'superuser': return <Navigate to="/superuser" />;
    case 'reseller': return <Navigate to="/reseller" />;
    case 'owner': return <Navigate to="/owner" />;
    case 'organizer': return <Navigate to="/organizer" />;
    case 'admin': return <Navigate to="/admin" />;
    case 'supervisor': return <Navigate to="/device-login" />;
    case 'exhibitor': return <Navigate to="/exhibitor" />;
    case 'attendee': return <Navigate to="/attendee" />;
    default: return <Navigate to="/login" />;
  }
};

const AnimatedRoutes = () => {
  const location = useLocation();
  return (
    <Suspense fallback={<PageLoader />}>
      <AnimatePresence mode="wait">
        <Routes location={location} key={location.pathname.split('/')[1] || '/'}>
          <Route path="/login" element={<Login />} />
          <Route path="/owner/*" element={<ProtectedRoute allowedRole="owner"><OwnerDashboard /></ProtectedRoute>} />
          <Route path="/admin/*" element={<ProtectedRoute allowedRoles={['admin', 'organizer', 'owner', 'reseller', 'superuser']}><AdminDashboard /></ProtectedRoute>} />
          <Route path="/supervisor" element={<ProtectedRoute allowedRole="supervisor"><SupervisorDashboard /></ProtectedRoute>} />
          <Route path="/scanner" element={<ProtectedRoute allowedRoles={['supervisor', 'admin', 'organizer', 'owner', 'reseller', 'superuser']}><ScannerMode /></ProtectedRoute>} />
          <Route path="/exhibitor" element={<ProtectedRoute allowedRole="exhibitor"><ExhibitorDashboard /></ProtectedRoute>} />
          <Route path="/attendee" element={<ProtectedRoute allowedRole="attendee"><AttendeePortal /></ProtectedRoute>} />
          <Route path="/device-login" element={<DeviceLogin />} />
          <Route path="/devices" element={<ProtectedRoute allowedRole="owner"><DeviceManager /></ProtectedRoute>} />
          <Route path="/superuser" element={<ProtectedRoute allowedRole="superuser"><SuperuserDashboard /></ProtectedRoute>} />
          <Route path="/reseller" element={<ProtectedRoute allowedRole="reseller"><ResellerDashboard /></ProtectedRoute>} />
          <Route path="/organizer" element={<ProtectedRoute allowedRole="organizer"><OrganizerDashboard /></ProtectedRoute>} />
          <Route path="/tv-designer" element={<ProtectedRoute allowedRole="owner"><WelcomeTVDesigner /></ProtectedRoute>} />
          <Route path="/welcome-tv/:gateId" element={<WelcomeTV />} />
          <Route path="/jumbotron" element={<Jumbotron />} />
          <Route path="/event/:id" element={<PublicEventPage />} />
          <Route path="/" element={<DashboardRedirect />} />
        </Routes>
      </AnimatePresence>
      <LanguageSwitcher />
    </Suspense>
  );
};

function App() {
  return (
    <AuthProvider>
      <Router>
        <CommandPalette />
        <AnimatedRoutes />
      </Router>
    </AuthProvider>
  );
}

export default App;

