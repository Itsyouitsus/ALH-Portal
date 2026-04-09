import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth, db } from '../firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, collection, query, where,
         getDocs, deleteDoc, serverTimestamp } from 'firebase/firestore';

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
        // 1. Check if a users doc already exists for this Firebase Auth uid
        const userRef = doc(db, 'users', u.uid);
        const snap = await getDoc(userRef);

        if (snap.exists()) {
          // Returning user — load profile normally
          setProfile(snap.data());
        } else {
          // First sign-in — find their record by email
          // Could be a draft (created during video call) or a pendingClients record
          const byEmail = await getDocs(
            query(collection(db, 'users'), where('email', '==', u.email))
          );

          if (!byEmail.empty) {
            // Found a draft profile — migrate it to the real Firebase Auth uid
            const draftDoc = byEmail.docs[0];
            const draftData = draftDoc.data();

            if (draftDoc.id !== u.uid) {
              // Copy draft data to the real uid doc
              await setDoc(userRef, {
                ...draftData,
                status: 'active',
                activatedAt: serverTimestamp(),
              });
              // Delete the old draft doc
              await deleteDoc(doc(db, 'users', draftDoc.id));
            } else {
              // Same id — just update status
              await updateDoc(userRef, { status: 'active', activatedAt: serverTimestamp() });
            }

            const fresh = await getDoc(userRef);
            setProfile(fresh.data());

          } else {
            // No draft found — check pendingClients (legacy flow)
            const pendingSnap = await getDocs(
              query(collection(db, 'pendingClients'), where('email', '==', u.email))
            );

            const pendingData = pendingSnap.docs[0]?.data() || {};
            const newProfile = {
              email: u.email,
              name: pendingData.name || '',
              role: 'client',
              status: 'active',
              inviteSent: true,
              createdAt: serverTimestamp(),
              activatedAt: serverTimestamp(),
              searchStarted: pendingData.searchStarted || new Date().toISOString().split('T')[0],
            };
            await setDoc(userRef, newProfile);

            // Clean up pendingClients
            for (const d of pendingSnap.docs) {
              await deleteDoc(doc(db, 'pendingClients', d.id));
            }

            setProfile(newProfile);
          }
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
