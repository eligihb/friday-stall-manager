import React, { useState } from 'react';
import { Copy, Check, Banknote, Building2 } from 'lucide-react';
import { formatILS } from '../lib/format';
import { loadStorefrontConfig } from '../lib/storefrontConfig';

export type CustomerPaymentChoice = 'prepay' | 'cash_pickup';
export type PrepayMethod = 'bit' | 'paybox' | 'bank_transfer' | null;

interface QuickCustomerPayBoxProps {
  amountToPay: number;
  title?: string;
  paymentChoice?: CustomerPaymentChoice;
  onPaymentChoiceChange?: (choice: CustomerPaymentChoice) => void;
  prepayMethod?: PrepayMethod;
  onPrepayMethodChange?: (method: PrepayMethod) => void;
}

export function QuickCustomerPayBox({
  amountToPay,
  title,
  paymentChoice,
  onPaymentChoiceChange,
  prepayMethod,
  onPrepayMethodChange,
}: QuickCustomerPayBoxProps) {
  const [cfg] = useState(() => loadStorefrontConfig());
  const [internalChoice, setInternalChoice] = useState<CustomerPaymentChoice>('prepay');
  const [internalPrepayMethod, setInternalPrepayMethod] = useState<PrepayMethod>(null);
  const [copied, setCopied] = useState(false);
  const [copyToast, setCopyToast] = useState('');

  if (amountToPay <= 0) return null;

  const activeChoice = paymentChoice ?? internalChoice;
  const activePrepayMethod = prepayMethod !== undefined ? prepayMethod : internalPrepayMethod;

  const setChoice = (next: CustomerPaymentChoice) => {
    setInternalChoice(next);
    onPaymentChoiceChange?.(next);
  };

  const setPrepay = (next: PrepayMethod) => {
    setInternalPrepayMethod(next);
    onPrepayMethodChange?.(next);
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
    setTimeout(() => setCopied(false), 2800);
    setTimeout(() => setCopyToast(''), 4000);
  };

  const handleCopyOnly = async () => {
    await copyTextSafe(cleanPhone || displayPhone);
    triggerCopyToast(`המספר ${displayPhone} הועתק! בחרו 'העברה לפי מספר נייד' והדביקו`);
  };

  const bitHref = cfg.bitLink.trim() || 'https://www.bitpay.co.il/app';
  const payboxHref = cfg.payboxLink.trim() || 'https://payboxapp.page.link';

  const handleOpenApp = async (method: 'bit' | 'paybox', href: string) => {
    await copyTextSafe(cleanPhone || displayPhone);
    setPrepay(method);
    triggerCopyToast(`המספר ${displayPhone} הועתק! בחרו 'העברה לפי מספר נייד' והדביקו`);
    window.open(href, '_blank', 'noopener,noreferrer');
  };

  const handleToggleBankTransfer = () => {
    const next: PrepayMethod = activePrepayMethod === 'bank_transfer' ? null : 'bank_transfer';
    setPrepay(next);
  };

  const isCashMode = activeChoice === 'cash_pickup';

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

      {/* בורר 2 אפשרויות זו לצד זו */}
      <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-white border border-[#E8D5BE]">
        <button
          type="button"
          onClick={() => setChoice('prepay')}
          className={`py-2 px-2 rounded-lg text-xs font-extrabold transition-all ${
            !isCashMode
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
            isCashMode
              ? 'bg-emerald-700 text-white shadow-sm'
              : 'text-slate-600 hover:bg-[#FAF6F0]'
          }`}
        >
          💵 תשלום באיסוף (מזומן)
        </button>
      </div>

      {isCashMode && (
        <div className="py-2 px-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-bold flex items-center justify-center gap-1.5 text-center">
          <Banknote className="w-4 h-4 text-emerald-700 shrink-0" />
          <span>תשלום במזומן בעת האיסוף בדוכן — ניתן לשלוח את ההזמנה כעת</span>
        </div>
      )}

      {/* כרטיסייה אחת אחידה ומאוחדת לתשלום מראש — מושחרת ולא לחיצה במצב מזומן */}
      <div
        aria-disabled={isCashMode}
        className={`rounded-2xl bg-white border border-[#E8D5BE] p-3 space-y-2.5 transition-opacity ${
          isCashMode ? 'opacity-40 pointer-events-none select-none' : ''
        }`}
      >
        {/* 1. שורה עליונה: תווית + מספר + העתק */}
        <div className="flex items-center justify-between gap-2 pb-2 border-b border-[#F3E9DC]">
          <span className="text-[11px] font-extrabold text-slate-600">מספר להעברת התשלום:</span>
          <div className="flex items-center gap-1.5">
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

        {/* 2. שורה אמצעית: 2 קוביות קטנות זו לצד זו (bit | PayBox) */}
        <div className="grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={() => handleOpenApp('bit', bitHref)}
            className={`py-2.5 px-3 rounded-xl bg-gradient-to-br from-[#008C9E] to-[#00B4D8] hover:brightness-105 active:scale-[0.98] text-white shadow-sm flex flex-col items-center justify-center gap-1 transition-all ${
              activePrepayMethod === 'bit' ? 'ring-2 ring-offset-1 ring-emerald-500' : ''
            }`}
          >
            <span
              className="w-8 h-8 rounded-lg bg-white/20 border border-white/30 flex items-center justify-center font-black text-sm tracking-tight"
              dir="ltr"
            >
              bit
            </span>
            <span className="text-xs font-extrabold tracking-wide flex items-center gap-1" dir="ltr">
              bit {activePrepayMethod === 'bit' ? '✓' : ''}
            </span>
          </button>

          <button
            type="button"
            onClick={() => handleOpenApp('paybox', payboxHref)}
            className={`py-2.5 px-3 rounded-xl bg-gradient-to-br from-[#4338CA] to-[#6366F1] hover:brightness-105 active:scale-[0.98] text-white shadow-sm flex flex-col items-center justify-center gap-1 transition-all ${
              activePrepayMethod === 'paybox' ? 'ring-2 ring-offset-1 ring-emerald-500' : ''
            }`}
          >
            <span
              className="w-8 h-8 rounded-lg bg-white/20 border border-white/30 flex items-center justify-center font-black text-xs tracking-tight"
              dir="ltr"
            >
              PB
            </span>
            <span className="text-xs font-extrabold tracking-wide flex items-center gap-1" dir="ltr">
              PayBox {activePrepayMethod === 'paybox' ? '✓' : ''}
            </span>
          </button>
        </div>

        {/* Toast אישור העתקה */}
        {copyToast && !isCashMode && (
          <div className="px-2.5 py-1.5 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-900 text-[11px] font-bold text-center">
            ✓ {copyToast}
          </div>
        )}

        {/* 3. שורת הסבר קצרה ומאוחדת */}
        <p className="text-[11px] text-slate-600 leading-snug text-center">
          💡 המספר מועתק אוטומטית בלחיצה — באפליקציה בחרו &quot;העברה לפי מספר נייד&quot; והדביקו.
        </p>

        {/* 4. אפשרות העברה בנקאית נקייה (ללא "במקרים חריגים") */}
        <button
          type="button"
          onClick={handleToggleBankTransfer}
          className={`w-full py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-between gap-2 transition-colors ${
            activePrepayMethod === 'bank_transfer'
              ? 'bg-emerald-50 border-emerald-400 text-emerald-900'
              : 'bg-[#FAF6F0] border-[#E8D5BE] text-slate-700 hover:bg-[#F3E9DC]'
          }`}
        >
          <span className="flex items-center gap-1.5">
            <Building2 className="w-3.5 h-3.5 text-slate-600 shrink-0" />
            <span>🏦 תשלום בהעברה בנקאית</span>
          </span>
          <span
            className={`w-4 h-4 rounded border flex items-center justify-center text-[10px] font-extrabold ${
              activePrepayMethod === 'bank_transfer'
                ? 'bg-emerald-600 border-emerald-600 text-white'
                : 'bg-white border-slate-300'
            }`}
          >
            {activePrepayMethod === 'bank_transfer' ? '✓' : ''}
          </span>
        </button>
      </div>
    </div>
  );
}
