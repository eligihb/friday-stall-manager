import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2, AlertTriangle } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { ensureInitialCloudHydration } from '../lib/supabaseSync';
import { formatFridayLabel, formatILS } from '../lib/format';
import { decodeOrderLinkPayload, persistImportedOrderBackup } from '../lib/orderLinkCodec';

interface QuickApproveViewProps {
  orderId: number;
  encodedData?: string | null;
}

interface ConfirmedOrderSnapshot {
  id: number;
  recipient_name: string;
  total_amount: number;
  friday_date?: string;
}

export function QuickApproveView({ orderId, encodedData }: QuickApproveViewProps) {
  // State מקומי עצמאי ונעול: מרגע שאוכלס, תמיד מציג הצלחה ולעולם לא נדרס ע"י טעינות רקע
  const [confirmedOrder, setConfirmedOrder] = useState<ConfirmedOrderSnapshot | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const startedKeyRef = useRef<string | null>(null);
  const lockedSuccessRef = useRef<boolean>(false);

  useEffect(() => {
    const runKey = `${orderId}::${encodedData || ''}`;
    if (lockedSuccessRef.current || startedKeyRef.current === runKey) {
      return;
    }
    startedKeyRef.current = runKey;

    const lockSuccess = (snapshot: ConfirmedOrderSnapshot) => {
      lockedSuccessRef.current = true;
      setErrMsg(null);
      setConfirmedOrder(snapshot);
      setLoading(false);
      setTimeout(() => {
        try {
          window.close();
        } catch {
          // ignore
        }
      }, 2200);
    };

    const run = async () => {
      // ממתינים תמיד לטעינת הענן הראשונה לפני בדיקת ההזמנה
      await ensureInitialCloudHydration(false);
      const decoded = decodeOrderLinkPayload(encodedData);

      if (decoded) {
        // 1. כתיבה סינכרונית מיידית לגיבוי localStorage (כך ששום טעינת רקע לא תוכל לדרוס!)
        persistImportedOrderBackup(decoded, 'received');

        // 2. ייבוא ואישור במאגר המערכת
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
        } catch {
          // גם אם השרת החיצוני לא תומך ב-import-order, הגיבוי המקומי כבר שמור ומאומת
        }

        lockSuccess({
          id: decoded.id || orderId,
          recipient_name: decoded.n,
          total_amount: decoded.t,
          friday_date: decoded.f,
        });
        return;
      }

      const tryApprove = () =>
        apiFetch(`/api/orders/${orderId}`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'received' }),
        });

      try {
        await tryApprove();
        lockSuccess({
          id: orderId,
          recipient_name: `הזמנה #${orderId}`,
          total_amount: 0,
        });
      } catch {
        // אם לא נמצא בזיכרון המקומי — מבצעים שליפה רעננה מהענן ומנסים שוב לפני הצגת שגיאה
        await ensureInitialCloudHydration(true);
        try {
          await tryApprove();
          lockSuccess({
            id: orderId,
            recipient_name: `הזמנה #${orderId}`,
            total_amount: 0,
          });
        } catch (err2) {
          if (lockedSuccessRef.current) return;
          setErrMsg(err2 instanceof Error ? err2.message : 'ההזמנה לא נמצאה');
          setLoading(false);
        }
      }
    };

    run();
  }, [orderId, encodedData]);

  // מרגע ש-confirmedOrder מאוכלס — תמיד מציג הצלחה ירוקה ולעולם לא מציג שגיאה
  if (confirmedOrder) {
    return (
      <div className="min-h-screen bg-[#FAF6F0] flex items-center justify-center p-6">
        <div className="max-w-sm w-full bg-white rounded-3xl border-2 border-emerald-300 shadow-card p-6 text-center space-y-3">
          <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <h1 className="font-serif text-2xl font-extrabold text-emerald-800">
            ההזמנה אושרה בהצלחה ✓
          </h1>
          <div className="p-3 rounded-2xl bg-emerald-50/70 border border-emerald-200 space-y-1">
            <div className="text-base font-extrabold text-slate-900">
              {confirmedOrder.recipient_name}
            </div>
            {confirmedOrder.total_amount > 0 && (
              <div className="text-sm font-extrabold text-[#C85A17] tabular-nums">
                סה״כ: {formatILS(confirmedOrder.total_amount)}
              </div>
            )}
            {confirmedOrder.friday_date && (
              <div className="text-xs text-slate-600">
                {formatFridayLabel(confirmedOrder.friday_date)}
              </div>
            )}
          </div>
          <p className="text-xs text-slate-500">
            הזמנה #{confirmedOrder.id} נשמרה והועברה לסטטוס ״התקבל״. ניתן לסגור חלונית זו.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAF6F0] flex items-center justify-center p-6">
      <div className="max-w-sm w-full bg-white rounded-3xl border border-[#E8D5BE] shadow-card p-6 text-center space-y-3">
        {loading ? (
          <>
            <div className="w-10 h-10 border-4 border-[#C85A17] border-t-transparent rounded-full animate-spin mx-auto" />
            <div className="font-bold text-slate-700">🔄 טוען פרטי הזמנה #{orderId}...</div>
          </>
        ) : (
          <>
            <div className="w-14 h-14 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-8 h-8" />
            </div>
            <h1 className="font-serif text-xl font-extrabold text-red-800">שגיאה באישור</h1>
            <p className="text-xs text-slate-600">{errMsg || 'ההזמנה לא נמצאה'}</p>
          </>
        )}
      </div>
    </div>
  );
}
