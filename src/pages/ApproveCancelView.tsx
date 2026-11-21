import React, { useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, XCircle, RotateCcw } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { formatFridayLabel, formatILS } from '../lib/format';
import { decodeOrderLinkPayload } from '../lib/orderLinkCodec';

interface ApproveCancelViewProps {
  orderId: number;
  encodedData?: string | null;
}

export function ApproveCancelView({ orderId, encodedData }: ApproveCancelViewProps) {
  const decoded = useMemo(() => decodeOrderLinkPayload(encodedData), [encodedData]);
  const [submitting, setSubmitting] = useState<'approve' | 'reject' | null>(null);
  const [resolved, setResolved] = useState<{
    action: 'approve' | 'reject';
    recipientName: string;
    fridayDate?: string;
    totalAmount?: number;
  } | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const lockedRef = useRef(false);

  const handleDecision = async (action: 'approve' | 'reject') => {
    if (lockedRef.current || submitting) return;
    setSubmitting(action);
    setErrMsg(null);
    try {
      const res = await apiFetch<{
        ok: boolean;
        action: 'approve' | 'reject';
        order?: { recipient_name?: string; friday_date?: string; total_amount?: number };
      }>('/api/public/resolve-cancel', {
        method: 'POST',
        body: JSON.stringify({
          order_id: orderId,
          action,
          decoded: decoded || undefined,
        }),
      });
      lockedRef.current = true;
      setResolved({
        action,
        recipientName: res.order?.recipient_name || decoded?.n || `הזמנה #${orderId}`,
        fridayDate: res.order?.friday_date || decoded?.f,
        totalAmount: decoded?.t ?? res.order?.total_amount,
      });
    } catch (err) {
      if (lockedRef.current) return;
      setErrMsg(err instanceof Error ? err.message : 'שגיאה בעדכון בקשת הביטול');
    } finally {
      setSubmitting(null);
    }
  };

  if (resolved) {
    const isCancelled = resolved.action === 'approve';
    return (
      <div className="min-h-screen bg-[#FAF6F0] flex items-center justify-center p-6">
        <div
          className={`max-w-sm w-full bg-white rounded-3xl border-2 shadow-card p-6 text-center space-y-3 ${
            isCancelled ? 'border-red-300' : 'border-emerald-300'
          }`}
        >
          <div
            className={`w-14 h-14 rounded-full flex items-center justify-center mx-auto ${
              isCancelled ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-600'
            }`}
          >
            {isCancelled ? <XCircle className="w-8 h-8" /> : <CheckCircle2 className="w-8 h-8" />}
          </div>
          <h1
            className={`font-serif text-2xl font-extrabold ${
              isCancelled ? 'text-red-800' : 'text-emerald-800'
            }`}
          >
            {isCancelled ? 'ביטול ההזמנה אושר ✓' : 'בקשת הביטול נדחתה ✓'}
          </h1>
          <div className="p-3 rounded-2xl bg-[#FAF6F0] border border-[#E8D5BE] space-y-1">
            <div className="text-base font-extrabold text-slate-900">{resolved.recipientName}</div>
            {resolved.fridayDate && (
              <div className="text-xs text-slate-600">{formatFridayLabel(resolved.fridayDate)}</div>
            )}
          </div>
          <p className="text-xs text-slate-600">
            {isCancelled
              ? `הזמנה #${orderId} סומנה כ״בוטל״ וסכום החיוב אופס ל-₪0.00.`
              : `הזמנה #${orderId} הוחזרה לסטטוס פעיל (״התקבל״).`}
          </p>
          <a
            href="#/customer-orders"
            className="inline-flex items-center justify-center w-full py-2.5 rounded-xl bg-[#2A1F18] text-white text-sm font-bold hover:bg-[#3d2e24]"
          >
            מעבר להזמנות לקוחות
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAF6F0] flex items-center justify-center p-5">
      <div className="max-w-md w-full bg-white rounded-3xl border border-[#E8D5BE] shadow-card p-6 space-y-4">
        <div className="text-center space-y-2">
          <div className="w-14 h-14 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center mx-auto">
            <AlertTriangle className="w-8 h-8" />
          </div>
          <h1 className="font-serif text-2xl font-extrabold text-[#2A1F18]">
            אישור בקשת ביטול — הזמנה #{orderId}
          </h1>
          <p className="text-xs text-slate-600">
            בחר האם לאשר את ביטול ההזמנה (יאפס את החיוב) או לדחות ולהשאיר אותה פעילה.
          </p>
        </div>

        {decoded && (
          <div className="p-4 rounded-2xl bg-[#FAF6F0] border border-[#E8D5BE] space-y-2 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="font-extrabold text-slate-900">{decoded.n}</span>
              {decoded.t > 0 && (
                <span className="font-extrabold text-[#C85A17] tabular-nums">
                  {formatILS(decoded.t)}
                </span>
              )}
            </div>
            {decoded.f && (
              <div className="text-xs text-slate-600">{formatFridayLabel(decoded.f)}</div>
            )}
            {decoded.i.length > 0 && (
              <ul className="pt-1 border-t border-[#E8D5BE] space-y-1 text-xs text-slate-700">
                {decoded.i.map((it, idx) => (
                  <li key={idx}>
                    • {it.q} × {it.nm || `מוצר #${it.pid}`}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {errMsg && (
          <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold text-center">
            {errMsg}
          </div>
        )}

        <div className="grid grid-cols-1 gap-2.5 pt-1">
          <button
            type="button"
            disabled={submitting !== null}
            onClick={() => handleDecision('approve')}
            className="w-full py-3 rounded-2xl bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-sm transition-colors"
          >
            <XCircle className="w-5 h-5" />
            {submitting === 'approve' ? 'מבטל הזמנה...' : 'אשר ביטול הזמנה'}
          </button>

          <button
            type="button"
            disabled={submitting !== null}
            onClick={() => handleDecision('reject')}
            className="w-full py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-sm transition-colors"
          >
            <RotateCcw className="w-5 h-5" />
            {submitting === 'reject' ? 'מעדכן...' : 'דחה ביטול (השאר הזמנה פעילה)'}
          </button>
        </div>
      </div>
    </div>
  );
}
