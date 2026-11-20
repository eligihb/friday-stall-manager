import React, { useEffect, useState } from 'react';
import { Banknote, Smartphone, Landmark, CheckCircle2, Wallet } from 'lucide-react';
import { formatILS } from '../lib/format';
import { BottomSheet } from './BottomSheet';
import type { Order, PaymentMethod } from '../types';

interface QuickPaymentSheetProps {
  order: Order | null;
  onClose: () => void;
  onConfirm: (orderId: number, paidAmount: number, method: PaymentMethod) => Promise<void>;
}

type PaymentMethodChoice = 'cash' | 'paybox' | 'bit' | 'transfer';

export function QuickPaymentSheet({ order, onClose, onConfirm }: QuickPaymentSheetProps) {
  const [payMode, setPayMode] = useState<'full' | 'partial'>('full');
  const [amount, setAmount] = useState('');
  const [methodChoice, setMethodChoice] = useState<PaymentMethodChoice>('paybox');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (order) {
      setPayMode('full');
      setAmount(order.total_amount.toFixed(2));
      setMethodChoice('paybox');
    }
  }, [order]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!order) return;
    setSaving(true);
    try {
      const apiMethod: PaymentMethod = methodChoice === 'bit' ? 'paybox' : methodChoice;
      const finalAmount = payMode === 'full' ? order.total_amount : Number(amount);
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
      title={order ? `אישור תשלום — ${order.recipient_name}` : ''}
      subtitle={
        order ? `הזמנה #${order.id} · סה״כ לחיוב: ${formatILS(order.total_amount)}` : undefined
      }
      maxWidthClass="md:max-w-md"
    >
      {order && (
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* בחירה בין שולם הכל לשולם חלקי */}
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-2">סטטוס תשלום</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setPayMode('full');
                  setAmount(order.total_amount.toFixed(2));
                }}
                className={`py-2.5 px-3 rounded-xl border-2 text-xs font-extrabold transition-all ${
                  payMode === 'full'
                    ? 'border-emerald-600 bg-emerald-50 text-emerald-800'
                    : 'border-[#E8D5BE] bg-[#FDFBF7] text-slate-600'
                }`}
              >
                שולם הכל ({formatILS(order.total_amount)})
              </button>
              <button
                type="button"
                onClick={() => {
                  setPayMode('partial');
                  setAmount(order.paid_amount > 0 ? order.paid_amount.toFixed(2) : '');
                }}
                className={`py-2.5 px-3 rounded-xl border-2 text-xs font-extrabold transition-all ${
                  payMode === 'partial'
                    ? 'border-amber-500 bg-amber-50 text-amber-900'
                    : 'border-[#E8D5BE] bg-[#FDFBF7] text-slate-600'
                }`}
              >
                שולם חלקי (הזן סכום)
              </button>
            </div>
          </div>

          {payMode === 'partial' && (
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5">סכום ששולם בפועל (₪)</label>
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

          {/* אמצעי תשלום: מזומן | פייבוקס | ביט | העברה בנקאית */}
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-2">אמצעי תשלום</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {(
                [
                  ['cash', 'מזומן', Banknote],
                  ['paybox', 'פייבוקס', Smartphone],
                  ['bit', 'ביט', Wallet],
                  ['transfer', 'העברה בנקאית', Landmark],
                ] as const
              ).map(([pm, label, Icon]) => {
                const active = methodChoice === pm;
                return (
                  <button
                    key={pm}
                    type="button"
                    onClick={() => setMethodChoice(pm)}
                    className={`min-h-[64px] px-2 rounded-2xl border-2 flex flex-col items-center justify-center gap-1 font-bold text-xs transition-all ${
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

          <button
            type="submit"
            disabled={saving}
            className="w-full min-h-[50px] rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-sm"
          >
            <CheckCircle2 className="w-5 h-5" />
            <span>{saving ? 'שומר תשלום...' : 'אשר תשלום ועדכן קופה'}</span>
          </button>
        </form>
      )}
    </BottomSheet>
  );
}
