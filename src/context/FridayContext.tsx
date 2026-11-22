import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { getActiveWeekRange, type ActiveWeekRange } from '../lib/format';
import {
  pullLatestCloudStateSilently,
  subscribeCloudDataUpdated,
  syncWithCloudOnStartupOrPoll,
} from '../lib/supabaseSync';

interface FridayContextValue {
  fridayDate: string;
  setFridayDate: (date: string) => void;
  activeWeekRange: ActiveWeekRange;
  refreshTick: number;
  triggerRefresh: () => void;
}

const FridayContext = createContext<FridayContextValue | null>(null);

export function FridayProvider({ children }: { children: React.ReactNode }) {
  const [activeWeekRange, setActiveWeekRange] = useState<ActiveWeekRange>(() =>
    getActiveWeekRange()
  );
  const [fridayDate, setFridayDate] = useState(() => getActiveWeekRange().fridayDate);
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

    // רענון שקט מהענן בחזרה ללשונית/אפליקציה (מוגן ב-Cooldown של 6 שניות)
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void pullLatestCloudStateSilently();
      }
    };
    const onWindowFocus = () => {
      void pullLatestCloudStateSilently();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('focus', onWindowFocus);

    // בדיקה תקופתית למעבר אוטומטי לשבוע חדש במוצאי שבת 21:00
    const timer = window.setInterval(() => {
      const nextRange = getActiveWeekRange();
      setActiveWeekRange((prev) => {
        if (prev.fridayDate !== nextRange.fridayDate) {
          setFridayDate((cur) => (cur === prev.fridayDate ? nextRange.fridayDate : cur));
          return nextRange;
        }
        return prev;
      });
    }, 60000);

    return () => {
      unsubscribe();
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('focus', onWindowFocus);
      window.clearInterval(timer);
    };
  }, []);

  return (
    <FridayContext.Provider
      value={{ fridayDate, setFridayDate, activeWeekRange, refreshTick, triggerRefresh }}
    >
      {children}
    </FridayContext.Provider>
  );
}

export function useFriday() {
  const ctx = useContext(FridayContext);
  if (!ctx) throw new Error('useFriday must be used inside FridayProvider');
  return ctx;
}
