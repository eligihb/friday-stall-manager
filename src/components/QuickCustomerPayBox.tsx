import React, { useState } from 'react';
import { Copy, Check, Smartphone, Wallet, ExternalLink } from 'lucide-react';
import { formatILS } from '../lib/format';
import { loadStorefrontConfig } from '../lib/storefrontConfig';

interface QuickCustomerPayBoxProps {
  amountToPay: number;
  title?: string;
}

export function QuickCustomerPayBox({ amountToPay, title }: QuickCustomerPayBoxProps) {
  const [cfg] = useState(() => loadStorefrontConfig());
  const [copied, setCopied] = useState(false);

  if (amountToPay <= 0) return null;

  const displayPhone = cfg.paymentPhone || '054-2452100';
  const cleanPhone = displayPhone.replace(/[^\d]/g, '');

  const copyPhone = async () => {
    try {
      await navigator.clipboard.writeText(cleanPhone || displayPhone);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  const bitHref = cfg.bitLink.trim() || 'https://www.bitpay.co.il/app';
  const payboxHref = cfg.payboxLink.trim() || 'https://payboxapp.page.link';

  return (
    <div className="p-3.5 rounded-2xl bg-gradient-to-br from-sky-50 via-white to-indigo-50/70 border border-sky-200 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-xs font-extrabold text-slate-800">{title || 'תשלום מהיר ב-Bit / PayBox'}</div>
          <div className="text-[11px] text-slate-500">הזן את הסכום המדויק בעת ההעברה</div>
        </div>
        <div className="text-lg font-extrabold text-[#C85A17] tabular-nums">
          {formatILS(amountToPay)}
        </div>
      </div>

      {/* מספר להעברה + העתקה בנגיעה אחת */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-white border border-sky-200">
        <div className="min-w-0">
          <div className="text-[10px] font-bold text-slate-500">מספר להעברה:</div>
          <div className="font-extrabold text-sm text-slate-900 tabular-nums" dir="ltr">
            {displayPhone}
          </div>
        </div>
        <button
          type="button"
          onClick={copyPhone}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-extrabold transition-colors shrink-0 ${
            copied
              ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
              : 'bg-sky-50 hover:bg-sky-100 text-sky-900 border border-sky-200'
          }`}
        >
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
          <span>{copied ? 'המספר הועתק ✓' : 'העתק מספר'}</span>
        </button>
      </div>

      {/* כפתורי פתיחת אפליקציות Bit / PayBox */}
      <div className="grid grid-cols-2 gap-2">
        <a
          href={bitHref}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => copyPhone()}
          className="min-h-[44px] px-3 py-2 rounded-xl bg-[#00A8E8] hover:bg-[#0092CC] text-white font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-sm"
        >
          <Wallet className="w-4 h-4 shrink-0" />
          <span>פתח Bit</span>
          <ExternalLink className="w-3 h-3 opacity-80" />
        </a>
        <a
          href={payboxHref}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => copyPhone()}
          className="min-h-[44px] px-3 py-2 rounded-xl bg-[#5B47FB] hover:bg-[#4936E0] text-white font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-sm"
        >
          <Smartphone className="w-4 h-4 shrink-0" />
          <span>פתח PayBox</span>
          <ExternalLink className="w-3 h-3 opacity-80" />
        </a>
      </div>
    </div>
  );
}
