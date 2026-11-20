import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { apiFetch } from '../lib/api';
import type { User, UserRole } from '../types';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  refreshUser: () => Promise<void>;
  updateUserName: (newName: string) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  signup: (payload: {
    name: string;
    phone: string;
    email: string;
    password: string;
    role: Exclude<UserRole, 'admin'>;
  }) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      const data = await apiFetch<{ user: User }>('/api/auth/me');
      let u = data.user;
      if (u && u.role === 'admin') {
        try {
          const customName = localStorage.getItem('fsm_admin_display_name');
          if (customName && customName.trim()) {
            u = { ...u, name: customName.trim() };
          } else if (u.name === 'יגאל מנהל') {
            u = { ...u, name: 'אליאב מנהל' };
          }
        } catch {
          // ignore
        }
      }
      setUser(u);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const updateUserName = async (newName: string) => {
    const clean = newName.trim();
    if (!clean || !user) return;
    try {
      await apiFetch(`/api/users/${user.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: clean,
          phone: user.phone,
          role: user.role,
          balance: user.balance,
          notes: user.notes,
        }),
      });
    } catch {
      // fallback to local override
    }
    if (user.role === 'admin') {
      try {
        localStorage.setItem('fsm_admin_display_name', clean);
      } catch {
        // ignore
      }
    }
    setUser((prev) => (prev ? { ...prev, name: clean } : prev));
  };

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const login = async (email: string, password: string) => {
    const data = await apiFetch<{ user: User }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setUser(data.user);
  };

  const signup = async (payload: {
    name: string;
    phone: string;
    email: string;
    password: string;
    role: Exclude<UserRole, 'admin'>;
  }) => {
    const data = await apiFetch<{ user: User }>('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    setUser(data.user);
  };

  const logout = async () => {
    await apiFetch('/api/auth/logout', { method: 'POST' });
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, refreshUser, updateUserName, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
