import React, { useState } from 'react';
import { Copy, Check, Smartphone, Wallet, ExternalLink, Banknote } from 'lucide-react';
import { formatILS } from '../lib/format';
import { loadStorefrontConfig } from '../lib/storefrontConfig';

interface QuickCustomerPayBoxProps {
  amountToPay: number;
  title?: string;
}

export function QuickCustomerPayBox({ amountToPay, title }: QuickCustomerPayBoxProps) {
  const [cfg] = useState(() => loadStorefrontConfig());
  const [copied, setCopied] = useState(false);
  const [copyToast, setCopyToast] = useState('');

  if (amountToPay <= 0) return null;

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

  const handleCopyOnly = async () => {
    await copyTextSafe(cleanPhone || displayPhone);
    setCopied(true);
    setCopyToast(`המספר ${displayPhone} הועתק!`);
    setTimeout(() => {
      setCopied(false);
      setCopyToast('');
    }, 3200);
  };

  const bitHref = cfg.bitLink.trim() || 'https://www.bitpay.co.il/app';
  const payboxHref = cfg.payboxLink.trim() || 'https://payboxapp.page.link';

  const handleCopyAndOpenBit = async () => {
    await copyTextSafe(cleanPhone || displayPhone);
    setCopied(true);
    setCopyToast(
      `המספר ${displayPhone} הועתק! בחרו ב-Bit 'העברה לפי מספר נייד' והדביקו`
    );
    setTimeout(() => {
      setCopied(false);
    }, 3500);
    window.open(bitHref, '_blank', 'noopener,noreferrer');
  };

  const handleCopyAndOpenPayBox = async () => {
    await copyTextSafe(cleanPhone || displayPhone);
    setCopied(true);
    setCopyToast(`המספר ${displayPhone} הועתק! פותח PayBox...`);
    setTimeout(() => {
      setCopied(false);
    }, 3500);
    window.open(payboxHref, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="p-3.5 rounded-2xl bg-gradient-to-br from-sky-50 via-white to-indigo-50/70 border border-sky-200 space-y-3">
      {/* כותרת + סכום מדויק */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-xs font-extrabold text-slate-900">
            {title || 'תשלום מהיר להזמנה'}
          </div>
          <div className="text-[11px] text-slate-500">סכום מדויק לתשלום</div>
        </div>
        <div className="text-xl font-extrabold text-[#C85A17] tabular-nums">
          {formatILS(amountToPay)}
        </div>
      </div>

      {/* שורת מספר הטלפון להעברה + אייקון העתקה */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-white border border-sky-200">
        <div className="text-xs font-bold text-slate-600">מספר להעברה:</div>
        <div className="flex items-center gap-2">
          <span className="font-extrabold text-sm text-slate-900 tabular-nums" dir="ltr">
            {displayPhone}
          </span>
          <button
            type="button"
            onClick={handleCopyOnly}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-extrabold transition-colors ${
              copied
                ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                : 'bg-sky-100 hover:bg-sky-200 text-sky-900 border border-sky-200'
            }`}
            title="העתק מספר להעברה"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>הועתק ✓</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>📋 העתק</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* התראת אישור העתקה */}
      {copyToast && (
        <div className="px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-900 text-[11px] font-extrabold text-center">
          ✓ {copyToast}
        </div>
      )}

      {/* 1. אפשרות ראשית ובולטת — Bit */}
      <div className="space-y-1.5">
        <button
          type="button"
          onClick={handleCopyAndOpenBit}
          className="w-full py-3.5 px-4 rounded-2xl bg-[#00B4D8] hover:bg-[#0096C7] active:scale-[0.99] text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-md transition-all"
        >
          <Smartphone className="w-4 h-4 shrink-0" />
          <span>העתק מספר ופתח Bit</span>
          <ExternalLink className="w-3.5 h-3.5 opacity-90 shrink-0" />
        </button>
        <p className="text-[11px] text-slate-600 leading-snug bg-amber-50/80 border border-amber-200/80 rounded-xl px-2.5 py-1.5">
          💡 בלחיצה על Bit המספר מועתק אוטומטית! באפליקציה בחרו &quot;העברה לפי מספר נייד&quot; (אין צורך לשמור באנשי קשר) והדביקו.
        </p>
      </div>

      {/* 2. אפשרות משנית — PayBox */}
      <button
        type="button"
        onClick={handleCopyAndOpenPayBox}
        className="w-full py-2 px-3 rounded-xl bg-[#4F46E5]/10 hover:bg-[#4F46E5]/15 border border-[#4F46E5]/30 text-[#3730A3] font-bold text-xs flex items-center justify-center gap-1.5 transition-colors"
      >
        <Wallet className="w-3.5 h-3.5 shrink-0" />
        <span>העתק מספר ופתח PayBox</span>
        <ExternalLink className="w-3 h-3 opacity-80 shrink-0" />
      </button>

      {/* 3. מזומן — נפוץ */}
      <div className="px-3 py-2 rounded-xl bg-emerald-50/80 border border-emerald-200 text-emerald-900 text-xs font-bold flex items-center justify-center gap-1.5 text-center">
        <Banknote className="w-4 h-4 text-emerald-700 shrink-0" />
        <span>💵 ניתן לשלם גם במזומן בעת האיסוף בדוכן</span>
      </div>

      {/* 4. העברה בנקאית — חריגים */}
      <p className="text-[10px] text-slate-400 text-center">
        העברה בנקאית — למקרים חריגים בתיאום מול המוכר
      </p>
    </div>
  );
}
