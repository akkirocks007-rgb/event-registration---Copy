import React, { createContext, useContext, useState, useEffect } from 'react';
import { auth, db } from '../firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // Fetch extended profile from Firestore
        try {
          const userDoc = await getDoc(doc(db, "users", firebaseUser.uid));
          if (userDoc.exists()) {
            const userData = { ...userDoc.data(), uid: firebaseUser.uid, email: firebaseUser.email };
            setUser(userData);
            localStorage.setItem('event_app_user', JSON.stringify(userData));
          } else {
            // Fallback for legacy users or hardcoded masters
            const fallbackData = JSON.parse(localStorage.getItem('event_app_user')) || { role: 'attendee' };
            setUser({ ...fallbackData, uid: firebaseUser.uid, email: firebaseUser.email });
          }
        } catch (e) {
          // Firestore offline / transient errors must not log the user out — fall back to cached profile.
          console.warn("Profile fetch failed (using cached profile if available):", e.message);
          const cached = JSON.parse(localStorage.getItem('event_app_user') || 'null');
          if (cached) {
            setUser({ ...cached, uid: firebaseUser.uid, email: firebaseUser.email });
          } else {
            setUser({ uid: firebaseUser.uid, email: firebaseUser.email, role: 'attendee' });
          }
        }
      } else {
        setUser(null);
        localStorage.removeItem('event_app_user');
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const login = (userData) => {
    setUser(userData);
    localStorage.setItem('event_app_user', JSON.stringify(userData));
  };

  const logout = () => {
    auth.signOut();
    setUser(null);
    localStorage.removeItem('event_app_user');
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext);
