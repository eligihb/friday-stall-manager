import React, { useEffect, useState } from 'react';
import { CheckCircle2, AlertTriangle } from 'lucide-react';
import { apiFetch } from '../lib/api';

interface QuickApproveViewProps {
  orderId: number;
}

export function QuickApproveView({ orderId }: QuickApproveViewProps) {
  const [status, setStatus] = useState<'loading' | 'done' | 'error'>('loading');
  const [errMsg, setErrMsg] = useState('');

  useEffect(() => {
    let active = true;
    apiFetch(`/api/orders/${orderId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'received' }),
    })
      .then(() => {
        if (!active) return;
        setStatus('done');
        // ניסיון סגירה אוטומטית של החלונית אם הדפדפן מאפשר
        setTimeout(() => {
          try {
            window.close();
          } catch {
            // ignore
          }
        }, 1800);
      })
      .catch((err) => {
        if (!active) return;
        setErrMsg(err instanceof Error ? err.message : 'שגיאה באישור ההזמנה');
        setStatus('error');
      });
    return () => {
      active = false;
    };
  }, [orderId]);

  return (
    <div className="min-h-screen bg-[#FAF6F0] flex items-center justify-center p-6">
      <div className="max-w-sm w-full bg-white rounded-3xl border border-[#E8D5BE] shadow-card p-6 text-center space-y-3">
        {status === 'loading' ? (
          <>
            <div className="w-10 h-10 border-4 border-[#C85A17] border-t-transparent rounded-full animate-spin mx-auto" />
            <div className="font-bold text-slate-700">מאשר הזמנה #{orderId}...</div>
          </>
        ) : status === 'done' ? (
          <>
            <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h1 className="font-serif text-2xl font-extrabold text-emerald-800">
              ההזמנה אושרה בהצלחה ✓
            </h1>
            <p className="text-xs text-slate-500">
              הזמנה #{orderId} הועברה לסטטוס ״התקבל״. ניתן לסגור חלונית זו.
            </p>
          </>
        ) : (
          <>
            <div className="w-14 h-14 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-8 h-8" />
            </div>
            <h1 className="font-serif text-xl font-extrabold text-red-800">שגיאה באישור</h1>
            <p className="text-xs text-slate-600">{errMsg}</p>
          </>
        )}
      </div>
    </div>
  );
}
