import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
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

  const triggerRefresh = useCallback(() => {
    setRefreshTick((t) => t + 1);
  }, []);

  useEffect(() => {
    // 1. סנכרון ראשוני והעלאה בטוחה (Migration) מול Supabase בעליית האפליקציה
    void syncWithCloudOnStartupOrPoll();

    // 2. האזנה לעדכוני נתונים מהענן כדי לרענן את המסכים בזמן אמת
    const unsubscribe = subscribeCloudDataUpdated(() => {
      setRefreshTick((t) => t + 1);
    });

    // 3. רענון אוטומטי מהענן בעת חזרה ללשונית (focus / visibilitychange) וכל 15 שניות
    const onFocusOrVisible = () => {
      if (document.visibilityState === 'visible') {
        void syncWithCloudOnStartupOrPoll();
      }
    };
    window.addEventListener('focus', onFocusOrVisible);
    document.addEventListener('visibilitychange', onFocusOrVisible);

    const intervalId = setInterval(() => {
      if (document.visibilityState === 'visible') {
        void syncWithCloudOnStartupOrPoll();
      }
    }, 15000);

    return () => {
      unsubscribe();
      window.removeEventListener('focus', onFocusOrVisible);
      document.removeEventListener('visibilitychange', onFocusOrVisible);
      clearInterval(intervalId);
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
