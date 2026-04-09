import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth, db } from '../firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc, getDocs, collection, query, where, deleteDoc, serverTimestamp } from 'firebase/firestore';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        const userRef = doc(db, 'users', u.uid);
        const snap = await getDoc(userRef);

        if (snap.exists()) {
          // Returning user — just load profile
          setProfile(snap.data());
        } else {
          // First sign-in — find their pendingClients record and activate
          const pendingSnap = await getDocs(
            query(collection(db, 'pendingClients'), where('email', '==', u.email))
          );

          let newProfile;
          if (!pendingSnap.empty) {
            const pendingData = pendingSnap.docs[0].data();
            newProfile = {
              name: pendingData.name || '',
              email: u.email,
              role: 'client',
              searchStarted: pendingData.searchStarted || new Date().toISOString().split('T')[0],
              createdAt: serverTimestamp(),
            };
            // Delete all pendingClients docs for this email (could be dual-invite)
            for (const d of pendingSnap.docs) {
              await deleteDoc(doc(db, 'pendingClients', d.id));
            }
          } else {
            // No pending record — create minimal profile
            newProfile = {
              name: '',
              email: u.email,
              role: 'client',
              createdAt: serverTimestamp(),
            };
          }

          await setDoc(userRef, newProfile);
          setProfile(newProfile);
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });
  }, []);

  return (
    <AuthContext.Provider value={{ user, profile, loading }}>
      {children}
    </AuthContext.Provider>
  );
}
