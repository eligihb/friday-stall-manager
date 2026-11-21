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
  const [partialAmount, setPartialAmount] = useState('');
  const [methodChoice, setMethodChoice] = useState<PaymentMethodChoice>('paybox');
  const [paidTime, setPaidTime] = useState(() => getCurrentHHMM());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (order) {
      const existingMeta = getOrderPaymentMeta(order.id);
      setPartialAmount(order.paid_amount > 0 ? String(order.paid_amount) : '');
      if (existingMeta) {
        const found = (
          Object.entries(CHOICE_TO_LABEL) as Array<[PaymentMethodChoice, PaymentMethodLabel]>
        ).find(([, lbl]) => lbl === existingMeta.methodLabel);
        setMethodChoice(found ? found[0] : 'paybox');
        setPaidTime(existingMeta.paidTime || getCurrentHHMM());
      } else {
        setMethodChoice('paybox');
        setPaidTime(getCurrentHHMM());
      }
    }
  }, [order]);

  const commitPayment = async (finalAmount: number) => {
    if (!order) return;
    setSaving(true);
    try {
      const apiMethod: PaymentMethod = methodChoice === 'bit' ? 'paybox' : methodChoice;
      if (finalAmount > 0) {
        saveOrderPaymentMeta(order.id, {
          methodLabel: CHOICE_TO_LABEL[methodChoice],
          paidTime: paidTime || getCurrentHHMM(),
        });
      }
      await onConfirm(order.id, Math.max(0, finalAmount), apiMethod);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const numPartial = Math.max(0, Number(partialAmount) || 0);
  const isPartial = Boolean(order && numPartial > 0 && numPartial < order.total_amount);

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
        <div className="space-y-4">
          {/* אמצעי תשלום ושעה */}
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
                    className={`min-h-[58px] px-2 rounded-2xl border-2 flex flex-col items-center justify-center gap-1 font-bold text-xs transition-all ${
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

          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1 flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-[#C85A17]" />
              <span>שעת תשלום / העברה</span>
            </label>
            <input
              type="time"
              dir="ltr"
              value={paidTime}
              onChange={(e) => setPaidTime(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl border border-[#E8D5BE] bg-[#FDFBF7] text-left tabular-nums font-bold text-sm"
            />
          </div>

          {/* כפתור ראשי אחד: שולם הכל */}
          <button
            type="button"
            disabled={saving}
            onClick={() => commitPayment(order.total_amount)}
            className="w-full min-h-[52px] rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-base flex items-center justify-center gap-2 shadow-sm"
          >
            <CheckCircle2 className="w-5 h-5" />
            <span>{saving ? 'מעדכן...' : `שולם הכל (${formatILS(order.total_amount)})`}</span>
          </button>

          {/* שדה סכום חלקי — מסמן אוטומטית "שולם חלקית" */}
          <div className="p-3.5 rounded-2xl bg-[#FAF6F0] border border-[#E8D5BE] space-y-2.5">
            <label className="block text-xs font-extrabold text-slate-700">
              או הזן סכום ששולם (₪) לתשלום חלקי / איפוס:
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                inputMode="decimal"
                step="0.5"
                min="0"
                dir="ltr"
                value={partialAmount}
                onChange={(e) => setPartialAmount(e.target.value)}
                placeholder="0.00"
                className="flex-1 px-3.5 py-2.5 rounded-xl border border-[#E8D5BE] bg-white text-left tabular-nums font-extrabold text-base"
              />
              <button
                type="button"
                disabled={saving}
                onClick={() => commitPayment(numPartial)}
                className={`px-4 py-2.5 rounded-xl font-extrabold text-xs text-white shrink-0 ${
                  isPartial
                    ? 'bg-amber-600 hover:bg-amber-700'
                    : numPartial === 0
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-emerald-600 hover:bg-emerald-700'
                }`}
              >
                {isPartial ? 'עדכן חלקי' : numPartial === 0 ? 'סמן לא שולם' : 'עדכן'}
              </button>
            </div>
            {isPartial && (
              <div className="p-2 rounded-xl bg-amber-100 border border-amber-300 text-amber-950 text-xs font-extrabold tabular-nums">
                שולם חלקית: {formatILS(numPartial)} מתוך {formatILS(order.total_amount)} (נותר{' '}
                {formatILS(Math.max(0, order.total_amount - numPartial))})
              </div>
            )}
          </div>
        </div>
      )}
    </BottomSheet>
  );
}
