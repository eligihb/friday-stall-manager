import React, { useEffect, useState } from 'react';
import { Banknote, Smartphone, Landmark, CheckCircle2, Wallet, Clock } from 'lucide-react';
import { formatILS } from '../lib/format';
import {
  getCurrentHHMM,
  getOrderPaymentMeta,
  saveOrderPaymentMeta,
  type PaymentMethodLabel,
} from '../lib/paymentMeta';
import { BottomSheet } from './BottomSheet';
import type { Order, PaymentMethod } from '../types';

interface QuickPaymentSheetProps {
  order: Order | null;
  onClose: () => void;
  onConfirm: (orderId: number, paidAmount: number, method: PaymentMethod) => Promise<void>;
}

type PaymentMethodChoice = 'cash' | 'paybox' | 'bit' | 'transfer';

const CHOICE_TO_LABEL: Record<PaymentMethodChoice, PaymentMethodLabel> = {
  cash: 'מזומן',
  paybox: 'פייבוקס',
  bit: 'ביט',
  transfer: 'העברה בנקאית',
};

export function QuickPaymentSheet({ order, onClose, onConfirm }: QuickPaymentSheetProps) {
  const [payMode, setPayMode] = useState<'full' | 'partial' | 'unpaid'>('full');
  const [amount, setAmount] = useState('');
  const [methodChoice, setMethodChoice] = useState<PaymentMethodChoice>('paybox');
  const [paidTime, setPaidTime] = useState(() => getCurrentHHMM());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (order) {
      const existingMeta = getOrderPaymentMeta(order.id);
      if (order.paid_amount >= order.total_amount && order.total_amount > 0) {
        setPayMode('full');
      } else if (order.paid_amount > 0) {
        setPayMode('partial');
      } else {
        setPayMode('full');
      }
      setAmount(
        order.paid_amount > 0 && order.paid_amount < order.total_amount
          ? order.paid_amount.toFixed(2)
          : order.total_amount.toFixed(2)
      );
      if (existingMeta) {
        const found = (Object.entries(CHOICE_TO_LABEL) as Array<[PaymentMethodChoice, PaymentMethodLabel]>).find(
          ([, lbl]) => lbl === existingMeta.methodLabel
        );
        setMethodChoice(found ? found[0] : 'paybox');
        setPaidTime(existingMeta.paidTime || getCurrentHHMM());
      } else {
        setMethodChoice('paybox');
        setPaidTime(getCurrentHHMM());
      }
    }
  }, [order]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!order) return;
    setSaving(true);
    try {
      const apiMethod: PaymentMethod = methodChoice === 'bit' ? 'paybox' : methodChoice;
      const finalAmount =
        payMode === 'full' ? order.total_amount : payMode === 'unpaid' ? 0 : Number(amount);
      if (finalAmount > 0) {
        saveOrderPaymentMeta(order.id, {
          methodLabel: CHOICE_TO_LABEL[methodChoice],
          paidTime: paidTime || getCurrentHHMM(),
        });
      }
      await onConfirm(order.id, finalAmount, apiMethod);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <BottomSheet
      open={Boolean(order)}
      onClose={onClose}
      title={order ? `עדכון תשלום — ${order.recipient_name}` : ''}
      subtitle={
        order ? `הזמנה #${order.id} · סה״כ לחיוב: ${formatILS(order.total_amount)}` : undefined
      }
      maxWidthClass="md:max-w-md"
    >
      {order && (
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* בחירת סטטוס תשלום */}
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-2">סטטוס תשלום</label>
            <div className="grid grid-cols-3 gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setPayMode('full');
                  setAmount(order.total_amount.toFixed(2));
                }}
                className={`py-2.5 px-2 rounded-xl border-2 text-xs font-extrabold transition-all ${
                  payMode === 'full'
                    ? 'border-emerald-600 bg-emerald-50 text-emerald-800'
                    : 'border-[#E8D5BE] bg-[#FDFBF7] text-slate-600'
                }`}
              >
                שולם מלא
              </button>
              <button
                type="button"
                onClick={() => {
                  setPayMode('partial');
                  setAmount(order.paid_amount > 0 ? order.paid_amount.toFixed(2) : '');
                }}
                className={`py-2.5 px-2 rounded-xl border-2 text-xs font-extrabold transition-all ${
                  payMode === 'partial'
                    ? 'border-amber-500 bg-amber-50 text-amber-900'
                    : 'border-[#E8D5BE] bg-[#FDFBF7] text-slate-600'
                }`}
              >
                שולם חלקית
              </button>
              <button
                type="button"
                onClick={() => {
                  setPayMode('unpaid');
                  setAmount('0');
                }}
                className={`py-2.5 px-2 rounded-xl border-2 text-xs font-extrabold transition-all ${
                  payMode === 'unpaid'
                    ? 'border-red-500 bg-red-50 text-red-800'
                    : 'border-[#E8D5BE] bg-[#FDFBF7] text-slate-600'
                }`}
              >
                לא שולם
              </button>
            </div>
          </div>

          {payMode === 'partial' && (
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5">
                סכום ששולם בפועל (₪) — נותר לגבייה:{' '}
                <strong className="text-amber-800">
                  {formatILS(Math.max(0, order.total_amount - (Number(amount) || 0)))}
                </strong>
              </label>
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                required
                dir="ltr"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full px-4 py-3 rounded-2xl border border-[#E8D5BE] bg-[#FDFBF7] text-left tabular-nums font-extrabold text-xl"
              />
            </div>
          )}

          {payMode !== 'unpaid' && (
            <>
              {/* אמצעי תשלום: מזומן | ביט | פייבוקס | העברה בנקאית */}
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-2">אמצעי תשלום</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {(
                    [
                      ['cash', 'מזומן', Banknote],
                      ['bit', 'ביט', Wallet],
                      ['paybox', 'פייבוקס', Smartphone],
                      ['transfer', 'העברה בנקאית', Landmark],
                    ] as const
                  ).map(([pm, label, Icon]) => {
                    const active = methodChoice === pm;
                    return (
                      <button
                        key={pm}
                        type="button"
                        onClick={() => setMethodChoice(pm)}
                        className={`min-h-[60px] px-2 rounded-2xl border-2 flex flex-col items-center justify-center gap-1 font-bold text-xs transition-all ${
                          active
                            ? 'border-[#C85A17] bg-[#FFF7ED] text-[#8A330B] shadow-sm'
                            : 'border-[#E8D5BE] bg-[#FDFBF7] text-slate-600'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                        <span className="text-center leading-tight">{label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* שעת התשלום / ההעברה (ברירת מחדל לשעה הנוכחית, ניתנת לעריכה ידנית) */}
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-[#C85A17]" />
                  <span>שעת תשלום / העברה (להצלבה ומעקב)</span>
                </label>
                <input
                  type="time"
                  dir="ltr"
                  value={paidTime}
                  onChange={(e) => setPaidTime(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#E8D5BE] bg-[#FDFBF7] text-left tabular-nums font-bold text-sm"
                />
              </div>
            </>
          )}

          <button
            type="submit"
            disabled={saving}
            className="w-full min-h-[50px] rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-sm"
          >
            <CheckCircle2 className="w-5 h-5" />
            <span>{saving ? 'מעדכן...' : 'עדכן תשלום'}</span>
          </button>
        </form>
      )}
    </BottomSheet>
  );
}
