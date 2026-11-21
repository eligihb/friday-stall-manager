import React, { useEffect, useState } from 'react';
import { CheckCircle2, AlertTriangle } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { formatILS } from '../lib/format';
import { decodeOrderLinkPayload } from '../lib/orderLinkCodec';

interface QuickApproveViewProps {
  orderId: number;
  encodedData?: string | null;
}

export function QuickApproveView({ orderId, encodedData }: QuickApproveViewProps) {
  const [status, setStatus] = useState<'loading' | 'done' | 'error'>('loading');
  const [errMsg, setErrMsg] = useState('');
  const [summaryText, setSummaryText] = useState('');

  useEffect(() => {
    let active = true;
    const run = async () => {
      try {
        // 1. ניסיון אישור ישיר אם ההזמנה כבר קיימת במאגר המקומי/שרת
        await apiFetch(`/api/orders/${orderId}`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'received' }),
        });
        if (!active) return;
        setStatus('done');
      } catch (firstErr) {
        // 2. Fallback חוצה-מכשירים: פענוח וייבוא ההזמנה מפרמטר הקישור (?d=...)
        const decoded = decodeOrderLinkPayload(encodedData);
        if (decoded) {
          try {
            await apiFetch('/api/public/import-order', {
              method: 'POST',
              body: JSON.stringify({
                id: decoded.id || orderId,
                recipient_name: decoded.n,
                phone: decoded.p,
                friday_date: decoded.f,
                total_amount: decoded.t,
                notes: decoded.nt || '',
                items: decoded.i,
                status: 'received',
              }),
            });
            if (!active) return;
            setSummaryText(`${decoded.n} · ${formatILS(decoded.t)}`);
            setStatus('done');
          } catch (importErr) {
            if (!active) return;
            setErrMsg(importErr instanceof Error ? importErr.message : 'שגיאה בייבוא ואישור ההזמנה');
            setStatus('error');
            return;
          }
        } else {
          if (!active) return;
          setErrMsg(firstErr instanceof Error ? firstErr.message : 'ההזמנה לא נמצאה');
          setStatus('error');
          return;
        }
      }

      // ניסיון סגירה אוטומטית של החלונית אם הדפדפן מאפשר
      setTimeout(() => {
        try {
          window.close();
        } catch {
          // ignore
        }
      }, 2000);
    };
    run();
    return () => {
      active = false;
    };
  }, [orderId, encodedData]);

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
            {summaryText && (
              <div className="text-sm font-extrabold text-slate-800">{summaryText}</div>
            )}
            <p className="text-xs text-slate-500">
              הזמנה #{orderId} נקלטה והועברה לסטטוס ״התקבל״. ניתן לסגור חלונית זו.
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
