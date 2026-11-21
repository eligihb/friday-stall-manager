import React, { useState } from 'react';
import { Copy, Check, Banknote } from 'lucide-react';
import { formatILS } from '../lib/format';
import { loadStorefrontConfig } from '../lib/storefrontConfig';

export type CustomerPaymentChoice = 'prepay' | 'cash_pickup';

interface QuickCustomerPayBoxProps {
  amountToPay: number;
  title?: string;
  paymentChoice?: CustomerPaymentChoice;
  onPaymentChoiceChange?: (choice: CustomerPaymentChoice) => void;
}

export function QuickCustomerPayBox({
  amountToPay,
  title,
  paymentChoice,
  onPaymentChoiceChange,
}: QuickCustomerPayBoxProps) {
  const [cfg] = useState(() => loadStorefrontConfig());
  const [internalChoice, setInternalChoice] = useState<CustomerPaymentChoice>('prepay');
  const [copied, setCopied] = useState(false);
  const [copyToast, setCopyToast] = useState('');

  if (amountToPay <= 0) return null;

  const activeChoice = paymentChoice ?? internalChoice;
  const setChoice = (next: CustomerPaymentChoice) => {
    setInternalChoice(next);
    onPaymentChoiceChange?.(next);
  };

  const displayPhone = cfg.paymentPhone || '054-2452100';
  const cleanPhone = displayPhone.replace(/[^\d]/g, '');

  const copyTextSafe = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      } catch {
        // ignore
      }
    }
  };

  const triggerCopyToast = (msg: string) => {
    setCopied(true);
    setCopyToast(msg);
    setTimeout(() => {
      setCopied(false);
    }, 2800);
    setTimeout(() => {
      setCopyToast('');
    }, 4000);
  };

  const handleCopyOnly = async () => {
    await copyTextSafe(cleanPhone || displayPhone);
    triggerCopyToast(`המספר ${displayPhone} הועתק! בחרו 'העברה לפי מספר נייד' והדביקו`);
  };

  const bitHref = cfg.bitLink.trim() || 'https://www.bitpay.co.il/app';
  const payboxHref = cfg.payboxLink.trim() || 'https://payboxapp.page.link';

  const handleOpenApp = async (href: string) => {
    await copyTextSafe(cleanPhone || displayPhone);
    triggerCopyToast(`המספר ${displayPhone} הועתק! בחרו 'העברה לפי מספר נייד' והדביקו`);
    window.open(href, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="p-3.5 rounded-2xl bg-[#FAF7F2] border border-[#E8D5BE] space-y-3">
      {/* כותרת + סכום */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-extrabold text-slate-800">
          {title || 'אופן תשלום'}
        </span>
        <span className="text-base font-extrabold text-[#C85A17] tabular-nums">
          {formatILS(amountToPay)}
        </span>
      </div>

      {/* בורר נקי: תשלום מראש / תשלום באיסוף (מזומן) */}
      <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-white border border-[#E8D5BE]">
        <button
          type="button"
          onClick={() => setChoice('prepay')}
          className={`py-2 px-2 rounded-lg text-xs font-extrabold transition-all ${
            activeChoice === 'prepay'
              ? 'bg-[#2B1B12] text-amber-50 shadow-sm'
              : 'text-slate-600 hover:bg-[#FAF6F0]'
          }`}
        >
          💳 תשלום מראש
        </button>
        <button
          type="button"
          onClick={() => setChoice('cash_pickup')}
          className={`py-2 px-2 rounded-lg text-xs font-extrabold transition-all ${
            activeChoice === 'cash_pickup'
              ? 'bg-emerald-700 text-white shadow-sm'
              : 'text-slate-600 hover:bg-[#FAF6F0]'
          }`}
        >
          💵 תשלום באיסוף (מזומן)
        </button>
      </div>

      {activeChoice === 'cash_pickup' ? (
        <div className="py-3 px-3 rounded-xl bg-white border border-emerald-200 text-emerald-900 text-xs font-bold flex items-center justify-center gap-2 text-center">
          <Banknote className="w-4 h-4 text-emerald-700 shrink-0" />
          <span>תשלום במזומן בעת האיסוף בדוכן</span>
        </div>
      ) : (
        <div className="space-y-2.5">
          {/* 2 קוביות קטנות ומעוצבות זו לצד זו — bit ו-PayBox */}
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => handleOpenApp(bitHref)}
              className="py-3 px-3 rounded-2xl bg-gradient-to-br from-[#008C9E] to-[#00B4D8] hover:brightness-105 active:scale-[0.98] text-white shadow-sm flex flex-col items-center justify-center gap-1 transition-all"
            >
              <span
                className="w-9 h-9 rounded-xl bg-white/20 border border-white/30 flex items-center justify-center font-black text-base tracking-tight"
                dir="ltr"
              >
                bit
              </span>
              <span className="text-xs font-extrabold tracking-wide" dir="ltr">
                bit
              </span>
            </button>

            <button
              type="button"
              onClick={() => handleOpenApp(payboxHref)}
              className="py-3 px-3 rounded-2xl bg-gradient-to-br from-[#4338CA] to-[#6366F1] hover:brightness-105 active:scale-[0.98] text-white shadow-sm flex flex-col items-center justify-center gap-1 transition-all"
            >
              <span
                className="w-9 h-9 rounded-xl bg-white/20 border border-white/30 flex items-center justify-center font-black text-sm tracking-tight"
                dir="ltr"
              >
                PB
              </span>
              <span className="text-xs font-extrabold tracking-wide" dir="ltr">
                PayBox
              </span>
            </button>
          </div>

          {/* חיווי Toast קצר בעת לחיצה */}
          {copyToast && (
            <div className="px-2.5 py-1.5 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-900 text-[11px] font-bold text-center">
              ✓ {copyToast}
            </div>
          )}

          {/* שורה קומפקטית אחת בלבד עם המספר וכפתור העתקה קטן */}
          <div className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl bg-white border border-[#E8D5BE]">
            <span className="text-[11px] font-bold text-slate-500">נייד להעברה:</span>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-xs text-slate-900 tabular-nums" dir="ltr">
                {displayPhone}
              </span>
              <button
                type="button"
                onClick={handleCopyOnly}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-bold transition-colors ${
                  copied
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-[#FAF6F0] hover:bg-[#F3E9DC] text-slate-700 border border-[#E8D5BE]'
                }`}
                title="העתק מספר"
              >
                {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                <span>{copied ? 'הועתק' : 'העתק'}</span>
              </button>
            </div>
          </div>

          {/* משפט עזר קצר בשורה אחת */}
          <p className="text-[11px] text-slate-600 leading-snug text-center">
            💡 המספר מועתק אוטומטית בלחיצה — באפליקציה בחרו &quot;העברה לפי מספר נייד&quot; (ללא שמירה באנשי קשר).
          </p>

          {/* העברה בנקאית — חריגים */}
          <p className="text-[10px] text-slate-400 text-center">
            העברה בנקאית — למקרים חריגים בתיאום מול המוכר
          </p>
        </div>
      )}
    </div>
  );
}
