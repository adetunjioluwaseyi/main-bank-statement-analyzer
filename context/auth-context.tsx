'use client';

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

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

export interface AuthenticatedIdentity {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
}

interface AuthResponseUser {
  id: string;
  username: string;
  name: string;
  email: string;
  role: 'user' | 'admin';
  status: 'active' | 'suspended';
}

interface AuthContextType {
  user: AuthenticatedIdentity | null;
  profile: UserProfile | null;
  loading: boolean;
  isAdmin: boolean;
  isSuspended: boolean;
  logoutUser: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  isAdmin: false,
  isSuspended: false,
  logoutUser: async () => {},
  refreshProfile: async () => {},
});

function mapResponseUser(value: AuthResponseUser | null): {
  user: AuthenticatedIdentity | null;
  profile: UserProfile | null;
} {
  if (!value) return { user: null, profile: null };
  return {
    user: {
      uid: value.id,
      email: value.email,
      displayName: value.name,
      photoURL: '',
    },
    profile: {
      uid: value.id,
      email: value.email,
      displayName: value.name,
      photoURL: '',
      role: value.role,
      status: value.status,
      createdAt: '',
      lastActiveAt: '',
      uploadedFilesCount: 0,
    },
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthenticatedIdentity | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshProfile = useCallback(async () => {
    const response = await fetch('/api/auth/session', { cache: 'no-store' });
    if (!response.ok) {
      throw new Error('The current Active Directory session could not be verified.');
    }
    const result = (await response.json()) as { user: AuthResponseUser | null };
    const mapped = mapResponseUser(result.user);
    setUser(mapped.user);
    setProfile(mapped.profile);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetch('/api/auth/session', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error('Session verification request failed.');
        return (await response.json()) as { user: AuthResponseUser | null };
      })
      .then((result) => {
        if (cancelled) return;
        const mapped = mapResponseUser(result.user);
        setUser(mapped.user);
        setProfile(mapped.profile);
      })
      .catch((error: unknown) => {
        console.error('[Auth] Could not restore the Active Directory session:', error);
        if (!cancelled) {
          setUser(null);
          setProfile(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const logoutUser = useCallback(async () => {
    const response = await fetch('/api/auth/logout', { method: 'POST' });
    if (!response.ok) throw new Error('Could not sign out securely.');
    setUser(null);
    setProfile(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        isAdmin: false,
        isSuspended: profile?.status === 'suspended',
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
