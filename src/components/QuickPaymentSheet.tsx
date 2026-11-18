import React, { useEffect, useState } from 'react';
import { Banknote, Smartphone, Landmark, CheckCircle2 } from 'lucide-react';
import { formatILS } from '../lib/format';
import { BottomSheet } from './BottomSheet';
import type { Order, PaymentMethod } from '../types';

interface QuickPaymentSheetProps {
  order: Order | null;
  onClose: () => void;
  onConfirm: (orderId: number, paidAmount: number, method: PaymentMethod) => Promise<void>;
}

export function QuickPaymentSheet({ order, onClose, onConfirm }: QuickPaymentSheetProps) {
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('bit');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (order) {
      setAmount(order.total_amount.toFixed(2));
      setMethod('bit');
    }
  }, [order]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!order) return;
    setSaving(true);
    try {
      await onConfirm(order.id, Number(amount), method);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <BottomSheet
      open={Boolean(order)}
      onClose={onClose}
      title={order ? `סמן כשולם — ${order.recipient_name}` : ''}
      subtitle={
        order ? `הזמנה #${order.id} · סה״כ לחיוב: ${formatILS(order.total_amount)}` : undefined
      }
      maxWidthClass="md:max-w-md"
    >
      {order && (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-2">בחר אמצעי תשלום</label>
            <div className="grid grid-cols-3 gap-2.5">
              {(
                [
                  ['cash', 'מזומן', Banknote, 'emerald'],
                  ['bit', 'ביט', Smartphone, 'sky'],
                  ['transfer', 'העברה', Landmark, 'amber'],
                ] as const
              ).map(([pm, label, Icon]) => {
                const active = method === pm;
                return (
                  <button
                    key={pm}
                    type="button"
                    onClick={() => setMethod(pm)}
                    className={`min-h-[68px] rounded-2xl border-2 flex flex-col items-center justify-center gap-1.5 font-bold text-xs transition-all ${
                      active
                        ? 'border-[#C85A17] bg-[#FFF7ED] text-[#8A330B] shadow-sm'
                        : 'border-[#E8D5BE] bg-[#FDFBF7] text-slate-600'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    <span>{label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-slate-600">סה״כ ששולם (₪)</label>
              <button
                type="button"
                onClick={() => setAmount(order.total_amount.toFixed(2))}
                className="text-xs font-bold text-[#C85A17]"
              >
                מלוא הסכום ({formatILS(order.total_amount)})
              </button>
            </div>
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              required
              dir="ltr"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full px-4 py-3 rounded-2xl border border-[#E8D5BE] bg-[#FDFBF7] text-left tabular-nums font-extrabold text-xl"
            />
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full min-h-[52px] rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-base flex items-center justify-center gap-2 shadow-sm"
          >
            <CheckCircle2 className="w-5 h-5" />
            <span>{saving ? 'שומר תשלום...' : 'אשר תשלום ועדכן קופה'}</span>
          </button>
        </form>
      )}
    </BottomSheet>
  );
}
