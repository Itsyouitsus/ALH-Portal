import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth, db } from '../firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc, collection, query, where, getDocs, deleteDoc, serverTimestamp } from 'firebase/firestore';

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

        if (!snap.exists()) {
          // First sign-in — seed user profile from pendingClients record
          const pendingSnap = await getDocs(
            query(collection(db, 'pendingClients'), where('email', '==', u.email))
          );

          const pendingData = pendingSnap.docs[0]?.data() || {};

          await setDoc(userRef, {
            email: u.email,
            name: pendingData.name || u.email,
            role: 'client',
            createdAt: serverTimestamp(),
            searchStarted: pendingData.searchStarted || new Date().toISOString().split('T')[0],
          });

          // Delete ALL pendingClients records for this email (handles dual-invite case)
          for (const pendingDoc of pendingSnap.docs) {
            await deleteDoc(doc(db, 'pendingClients', pendingDoc.id));
          }

          // Also clean up records tied to other emails in the same allEmails group
          if (pendingData.allEmails?.length > 1) {
            for (const otherEmail of pendingData.allEmails) {
              if (otherEmail !== u.email) {
                const otherSnap = await getDocs(
                  query(collection(db, 'pendingClients'), where('email', '==', otherEmail), where('primaryEmail', '==', pendingData.primaryEmail))
                );
                for (const d of otherSnap.docs) {
                  await deleteDoc(doc(db, 'pendingClients', d.id));
                }
              }
            }
          }

          const freshSnap = await getDoc(userRef);
          setProfile(freshSnap.data());
        } else {
          setProfile(snap.data());
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
