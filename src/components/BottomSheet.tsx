import React, { useEffect } from 'react';
import { X } from 'lucide-react';

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  maxWidthClass?: string;
  children: React.ReactNode;
}

export function BottomSheet({
  open,
  onClose,
  title,
  subtitle,
  maxWidthClass = 'md:max-w-xl',
  children,
}: BottomSheetProps) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/55 backdrop-blur-[2px] animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`w-full ${maxWidthClass} bg-white rounded-t-[28px] md:rounded-3xl border-t md:border border-[#E8D5BE] shadow-2xl max-h-[92dvh] flex flex-col animate-sheet-up md:animate-fade-in overflow-hidden`}
      >
        {/* ידית גרירה למובייל */}
        <div className="md:hidden flex justify-center pt-2.5 pb-1 shrink-0">
          <div className="w-11 h-1.5 rounded-full bg-[#D8C3AA]" />
        </div>

        {/* כותרת החלונית */}
        <div className="px-5 py-3.5 border-b border-[#F3E9DC] flex items-start justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <h3 className="font-serif text-xl sm:text-2xl font-bold text-slate-900 leading-tight truncate">
              {title}
            </h3>
            {subtitle && <p className="text-xs text-slate-500 mt-0.5 truncate">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 rounded-xl bg-[#FAF6F0] hover:bg-[#F3E9DC] text-slate-600 flex items-center justify-center shrink-0"
            aria-label="סגירה"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* תוכן נגלל עם מרווח בטוח לתחתית מובייל */}
        <div className="p-5 overflow-y-auto overscroll-contain pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          {children}
        </div>
      </div>
    </div>
  );
}
