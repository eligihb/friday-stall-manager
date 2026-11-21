import React, { createContext, useContext, useState } from 'react';
import type { UserRole } from '../types';

interface ContactDrawerContextValue {
  openContactById: (userId: number) => void;
  openCreateContact: (defaultRole?: Exclude<UserRole, 'admin'>) => void;
  closeDrawer: () => void;
  drawerState: {
    open: boolean;
    mode: 'edit' | 'create';
    userId: number | null;
    defaultRole: Exclude<UserRole, 'admin'>;
  };
}

const ContactDrawerContext = createContext<ContactDrawerContextValue | null>(null);

export function ContactDrawerProvider({ children }: { children: React.ReactNode }) {
  const [drawerState, setDrawerState] = useState<{
    open: boolean;
    mode: 'edit' | 'create';
    userId: number | null;
    defaultRole: Exclude<UserRole, 'admin'>;
  }>({
    open: false,
    mode: 'create',
    userId: null,
    defaultRole: 'customer',
  });

  const openContactById = (userId: number) => {
    setDrawerState({ open: true, mode: 'edit', userId, defaultRole: 'customer' });
  };

  const openCreateContact = (defaultRole: Exclude<UserRole, 'admin'> = 'customer') => {
    setDrawerState({ open: true, mode: 'create', userId: null, defaultRole });
  };

  const closeDrawer = () => {
    setDrawerState((prev) => ({ ...prev, open: false }));
  };

  return (
    <ContactDrawerContext.Provider
      value={{ openContactById, openCreateContact, closeDrawer, drawerState }}
    >
      {children}
    </ContactDrawerContext.Provider>
  );
}

export function useContactDrawer() {
  const ctx = useContext(ContactDrawerContext);
  if (!ctx) throw new Error('useContactDrawer must be used inside ContactDrawerProvider');
  return ctx;
}
