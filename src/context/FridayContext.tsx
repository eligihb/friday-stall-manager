import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { getNextFridayISO } from '../lib/format';
import {
  subscribeCloudDataUpdated,
  syncWithCloudOnStartupOrPoll,
} from '../lib/supabaseSync';

interface FridayContextValue {
  fridayDate: string;
  setFridayDate: (date: string) => void;
  refreshTick: number;
  triggerRefresh: () => void;
}

const FridayContext = createContext<FridayContextValue | null>(null);

export function FridayProvider({ children }: { children: React.ReactNode }) {
  const [fridayDate, setFridayDate] = useState(getNextFridayISO());
  const [refreshTick, setRefreshTick] = useState(0);
  const startupSyncedRef = useRef(false);

  const triggerRefresh = useCallback(() => {
    setRefreshTick((t) => t + 1);
  }, []);

  useEffect(() => {
    // סנכרון ראשוני חד-פעמי בלבד בעליית האפליקציה (עם useRef למניעת הרצה כפולה)
    if (!startupSyncedRef.current) {
      startupSyncedRef.current = true;
      void syncWithCloudOnStartupOrPoll(false);
    }

    const unsubscribe = subscribeCloudDataUpdated(() => {
      setRefreshTick((t) => t + 1);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  return (
    <FridayContext.Provider value={{ fridayDate, setFridayDate, refreshTick, triggerRefresh }}>
      {children}
    </FridayContext.Provider>
  );
}

export function useFriday() {
  const ctx = useContext(FridayContext);
  if (!ctx) throw new Error('useFriday must be used inside FridayProvider');
  return ctx;
}
