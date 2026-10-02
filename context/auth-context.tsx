'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { auth, db, signInWithGoogle, logOut, handleFirestoreError, OperationType, testConnection } from '@/lib/firebase';

const shouldBypassAuth = true;

const buildBypassUser = (): User =>
  ({
    uid: 'local-demo-user',
    email: 'demo@local.dev',
    displayName: 'Local Demo User',
    photoURL: '',
    emailVerified: true,
    isAnonymous: false,
    providerData: [],
    providerId: 'custom-bypass',
    tenantId: null,
    refreshToken: '',
    metadata: {} as User['metadata'],
  } as unknown as User);

const buildBypassProfile = (): UserProfile => ({
  uid: 'local-demo-user',
  email: 'demo@local.dev',
  displayName: 'Local Demo User',
  photoURL: '',
  role: 'admin',
  status: 'active',
  createdAt: new Date().toISOString(),
  lastActiveAt: new Date().toISOString(),
  uploadedFilesCount: 0,
});

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  role: 'user' | 'admin';
  status: 'active' | 'suspended';
  createdAt: string;
  lastActiveAt: string;
  uploadedFilesCount: number;
}

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  isAdmin: boolean;
  isSuspended: boolean;
  loginWithGoogle: () => Promise<void>;
  logoutUser: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  isAdmin: false,
  isSuspended: false,
  loginWithGoogle: async () => {},
  logoutUser: async () => {},
  refreshProfile: async () => {},
});

const SUPER_ADMIN_EMAIL = 'adetunjiiretomiwa@gmail.com';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Sync / create profile in Firestore
  const syncUserProfile = useCallback(async (firebaseUser: User): Promise<UserProfile | null> => {
    const userDocRef = doc(db, 'users', firebaseUser.uid);
    const path = `users/${firebaseUser.uid}`;
    try {
      const snap = await getDoc(userDocRef);
      const isSuper = firebaseUser.email?.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase();

      if (snap.exists()) {
        const existingData = snap.data() as UserProfile;
        // Keep role as admin if super admin or previously set
        const updatedRole = isSuper ? 'admin' : (existingData.role || 'user');
        
        try {
          await updateDoc(userDocRef, {
            lastActiveAt: new Date().toISOString(),
            displayName: firebaseUser.displayName || existingData.displayName || 'User',
            photoURL: firebaseUser.photoURL || existingData.photoURL || '',
          });
        } catch {
          // If suspended or rule blocked, ignore non-critical lastActive update
        }

        const fullProfile: UserProfile = {
          ...existingData,
          role: updatedRole,
        };
        return fullProfile;
      } else {
        // Create new user record
        const newProfile: UserProfile = {
          uid: firebaseUser.uid,
          email: firebaseUser.email || '',
          displayName: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User',
          photoURL: firebaseUser.photoURL || '',
          role: isSuper ? 'admin' : 'user',
          status: 'active',
          createdAt: new Date().toISOString(),
          lastActiveAt: new Date().toISOString(),
          uploadedFilesCount: 0,
        };
        await setDoc(userDocRef, newProfile);
        return newProfile;
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, path);
      return null;
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!auth.currentUser) {
      setProfile(null);
      return;
    }
    const prof = await syncUserProfile(auth.currentUser);
    setProfile(prof);
  }, [syncUserProfile]);

  useEffect(() => {
    if (shouldBypassAuth) {
      setUser(buildBypassUser());
      setProfile(buildBypassProfile());
      setLoading(false);
      return;
    }

    // Run connection test on boot
    testConnection();

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        try {
          const userProf = await syncUserProfile(firebaseUser);
          setProfile(userProf);
        } catch (err) {
          console.error('Failed to sync user profile:', err);
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [syncUserProfile]);

  const loginWithGoogle = async () => {
    if (shouldBypassAuth) {
      setUser(buildBypassUser());
      setProfile(buildBypassProfile());
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const res = await signInWithGoogle();
      if (res.user) {
        const userProf = await syncUserProfile(res.user);
        setProfile(userProf);
      }
    } catch (err) {
      console.error('Google sign-in error:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const logoutUser = async () => {
    if (shouldBypassAuth) {
      setUser(buildBypassUser());
      setProfile(buildBypassProfile());
      return;
    }

    await logOut();
    setUser(null);
    setProfile(null);
  };

  const isSuper = user?.email?.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase();
  const isAdmin = isSuper || profile?.role === 'admin';
  const isSuspended = profile?.status === 'suspended';

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        isAdmin,
        isSuspended,
        loginWithGoogle,
        logoutUser,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
