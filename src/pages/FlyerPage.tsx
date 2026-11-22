import React, { useEffect, useMemo, useState } from 'react';
import { Flame, Share2, Sparkles, Link2, Check } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { formatFridayLabel, formatILS } from '../lib/format';
import { useFriday } from '../context/FridayContext';
import {
  buildDigitalMenuUrl,
  buildWhatsAppShareUrl,
  formatDigitalMenuWhatsApp,
} from '../lib/whatsappFormat';
import { isProductVisibleToCustomers, loadStorefrontConfig } from '../lib/storefrontConfig';
import type { AdminProduct, BusinessSettings } from '../types';

export function FlyerPage() {
  const { fridayDate } = useFriday();
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [settings, setSettings] = useState<BusinessSettings | undefined>(undefined);
  const [storefrontCfg] = useState(() => loadStorefrontConfig());
  const [sharing, setSharing] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [shareNote, setShareNote] = useState('');

  useEffect(() => {
    Promise.all([
      apiFetch<{ products: AdminProduct[] }>('/api/products'),
      apiFetch<{ settings: BusinessSettings }>('/api/settings'),
    ]).then(([pRes, sRes]) => {
      setProducts(pRes.products);
      setSettings(sRes.settings);
    });
  }, []);

  const visibleProducts = useMemo(
    () => products.filter((p) => p.is_active && isProductVisibleToCustomers(p.id, storefrontCfg)),
    [products, storefrontCfg]
  );

  const otherItems = useMemo(() => {
    return visibleProducts.filter((p) => {
      const n = p.name;
      if (
        n.includes('סאלוף') ||
        n.includes('סלוף') ||
        n.includes('לחוח') ||
        n.includes("ג'חנון") ||
        n.includes('גחנון') ||
        n.includes('זלביה') ||
        n.includes('חילבה') ||
        n.includes('מארז פיתה') ||
        n.includes('מארז לחם שום')
      ) {
        return false;
      }
      return true;
    });
  }, [visibleProducts]);

  const bizName = settings?.business_name || 'המטבח התימני – תפריט יום שישי';
  const menuUrl = buildDigitalMenuUrl();
  const shareText = useMemo(
    () => formatDigitalMenuWhatsApp(visibleProducts, settings),
    [visibleProducts, settings]
  );

  // יצירת תמונת PNG חדה של הפלייר בזיכרון לשיתוף ישיר לוואטסאפ (ללא שמירה לגלריה)
  const renderFlyerPngBlob = async (): Promise<Blob | null> => {
    const canvas = document.createElement('canvas');
    const width = 900;
    const height = 1480;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // רקע חם בסגנון מאפייה ביתית
    const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
    bgGrad.addColorStop(0, '#2B1B12');
    bgGrad.addColorStop(0.22, '#4A2816');
    bgGrad.addColorStop(0.221, '#FAF3E8');
    bgGrad.addColorStop(1, '#F3E3CE');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    ctx.textAlign = 'center';
    ctx.direction = 'rtl';

    // כותרת עליונה
    ctx.fillStyle = '#FEF3C7';
    ctx.font = 'bold 54px serif';
    ctx.fillText(bizName, width / 2, 115);

    ctx.fillStyle = '#FCD34D';
    ctx.font = 'bold 30px sans-serif';
    ctx.fillText(`המחירים הם בהזמנה מוקדמת · ${formatFridayLabel(fridayDate)}`, width / 2, 180);

    ctx.fillStyle = '#FDE68A';
    ctx.font = '600 24px sans-serif';
    ctx.fillText('מאפים תימניים מהטאבון ליום שישי', width / 2, 235);

    let y = 370;
    const drawSection = (title: string, rows: Array<{ left: string; right: string; sub?: string }>) => {
      // כותרת קטגוריה
      ctx.fillStyle = '#4A2816';
      ctx.beginPath();
      ctx.roundRect(60, y - 42, width - 120, 58, 16);
      ctx.fill();

      ctx.fillStyle = '#FEF3C7';
      ctx.font = 'bold 30px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(title, width - 90, y - 2);
      y += 45;

      for (const r of rows) {
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.roundRect(60, y - 28, width - 120, r.sub ? 84 : 62, 14);
        ctx.fill();

        ctx.fillStyle = '#1E242B';
        ctx.font = 'bold 26px sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(r.right, width - 90, y + 12);

        ctx.fillStyle = '#C85A17';
        ctx.font = 'bold 28px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(r.left, 90, y + 12);

        if (r.sub) {
          ctx.fillStyle = '#047857';
          ctx.font = 'bold 20px sans-serif';
          ctx.textAlign = 'right';
          ctx.fillText(r.sub, width - 90, y + 42);
        }
        y += r.sub ? 96 : 74;
      }
      y += 28;
    };

    drawSection('🫓 סאלוף & לחוח', [
      { right: 'סאלוף / לחוח — מארז חמישייה (5 יח׳)', left: '₪20 (במקום ₪25)', sub: 'מחיר הזמנה מוקדמת' },
      { right: 'סאלוף / לחוח — יחידה בודדת', left: '₪5' },
    ]);

    drawSection("🍯 ג'חנון ביתי", [
      { right: "מגש ג'חנון (5 יח׳)", left: '₪40 (במקום ₪45)' },
      { right: "ג'חנון (יחידה)", left: '₪8 (במקום ₪9)' },
    ]);

    drawSection('✨ פריטים מיוחדים ומארזים', [
      { right: 'זלביה — מארז שלישייה (3 יח׳)', left: '₪12', sub: 'מבצע: 2 מארזים ב-20 ₪!' },
      { right: "ג'בטה מאורכת בטעמים (שום, זעתר, שומשום, רגיל)", left: '₪12', sub: 'מבצע: 2 מארזים (6 יח׳) ב-20 ₪ (ניתן לשלב!) | יחידה 5 ₪' },
      { right: 'חילבה טרייה — קטן (250 גר׳) / גדול (500 גר׳)', left: '₪12 / ₪20' },
    ]);

    // פוטר תחתון
    ctx.textAlign = 'center';
    ctx.fillStyle = '#4A2816';
    ctx.font = 'bold 26px sans-serif';
    ctx.fillText('להזמנה מהירה אונליין — לחצו על הקישור בהודעה 🛒', width / 2, height - 55);

    return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/png'));
  };

  const handleShareFlyerDirect = async () => {
    setSharing(true);
    setShareNote('');
    try {
      const blob = await renderFlyerPngBlob();
      if (blob && navigator.share) {
        const file = new File([blob], 'friday-menu-flyer.png', { type: 'image/png' });
        const navAny = navigator as Navigator & {
          canShare?: (data: ShareData) => boolean;
        };
        if (navAny.canShare && navAny.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: bizName,
            text: shareText,
          });
          setShareNote('הפלייר שותף בהצלחה ✓');
          return;
        }
        // גיבוי Web Share טקסט + קישור
        await navigator.share({
          title: bizName,
          text: shareText,
          url: menuUrl,
        });
        setShareNote('הקישור שותף בהצלחה ✓');
        return;
      }
      // גיבוי וואטסאפ בדסקטופ
      window.open(buildWhatsAppShareUrl(shareText), '_blank', 'noopener,noreferrer');
    } catch (err) {
      if ((err as Error)?.name !== 'AbortError') {
        window.open(buildWhatsAppShareUrl(shareText), '_blank', 'noopener,noreferrer');
      }
    } finally {
      setSharing(false);
    }
  };

  const handleCopyLink = async () => {
    await navigator.clipboard.writeText(menuUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 1800);
  };

  return (
    <div className="max-w-md mx-auto space-y-4">
      {/* פלייר מחירון נקי */}
      <div className="rounded-3xl overflow-hidden shadow-sm border border-[#D9B68C] bg-[#FAF3E8]">
        {/* כותרת */}
        <div className="px-5 py-5 text-center text-white bg-[#2B1B12] space-y-2">
          <div className="w-10 h-10 mx-auto rounded-xl bg-[#C85A17] flex items-center justify-center">
            <Flame className="w-5 h-5 text-white" />
          </div>
          <h2 className="font-serif text-2xl font-extrabold text-amber-50 leading-tight">{bizName}</h2>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 border border-white/15 text-[11px] font-bold text-amber-100">
            <span>מחירי מכירה מוקדמת · {formatFridayLabel(fridayDate)}</span>
          </div>
        </div>

        {/* גוף הפלייר */}
        <div className="p-4 space-y-3 text-sm">
          {/* 1. סאלוף ולחוח */}
          <div className="bg-white/95 rounded-2xl border border-[#DFC3A0] overflow-hidden">
            <div className="px-3.5 py-1.5 bg-[#4A2816] text-amber-100 font-bold text-xs">
              🫓 סאלוף &amp; לחוח
            </div>
            <div className="p-3 space-y-1.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-extrabold text-slate-900">מארז חמישייה (5 יח&apos;)</span>
                <div className="flex items-center gap-1.5 tabular-nums">
                  <span className="text-slate-400 line-through decoration-red-600 decoration-2 font-bold">
                    ₪25
                  </span>
                  <span className="font-extrabold text-base text-[#C85A17]">₪20</span>
                </div>
              </div>
              <div className="flex items-center justify-between text-slate-700 pt-1 border-t border-[#F3E9DC]">
                <span className="font-semibold">יחידה בודדת</span>
                <span className="font-extrabold tabular-nums">₪5</span>
              </div>
            </div>
          </div>

          {/* 2. ג'חנון ביתי */}
          <div className="bg-white/95 rounded-2xl border border-[#DFC3A0] overflow-hidden">
            <div className="px-3.5 py-1.5 bg-[#4A2816] text-amber-100 font-bold text-xs">
              🍯 ג&apos;חנון ביתי
            </div>
            <div className="p-3 space-y-1.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-extrabold text-slate-900">מגש ג&apos;חנון (5 יח&apos;)</span>
                <div className="flex items-center gap-1.5 tabular-nums">
                  <span className="text-slate-400 line-through decoration-red-600 decoration-2 font-bold">
                    ₪45
                  </span>
                  <span className="font-extrabold text-base text-[#C85A17]">₪40</span>
                </div>
              </div>
              <div className="flex items-center justify-between pt-1 border-t border-[#F3E9DC]">
                <span className="font-bold text-slate-800">ג&apos;חנון (יחידה)</span>
                <div className="flex items-center gap-1.5 tabular-nums">
                  <span className="text-slate-400 line-through decoration-red-600 decoration-2 font-bold">
                    ₪9
                  </span>
                  <span className="font-extrabold text-base text-[#C85A17]">₪8</span>
                </div>
              </div>
            </div>
          </div>

          {/* 3. מיוחדים ומארזים */}
          <div className="bg-white/95 rounded-2xl border border-[#DFC3A0] overflow-hidden">
            <div className="px-3.5 py-1.5 bg-[#4A2816] text-amber-100 font-bold text-xs">
              ✨ מארזים ופריטים מיוחדים
            </div>
            <div className="p-3 space-y-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="font-extrabold text-slate-900">זלביה — מארז שלישייה</div>
                  <div className="text-[10px] font-extrabold text-emerald-700">מבצע: 2 מארזים ב-20 ₪</div>
                </div>
                <span className="font-extrabold text-base text-[#C85A17] tabular-nums">₪12</span>
              </div>
              <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-[#F3E9DC]">
                <div>
                  <div className="font-extrabold text-slate-900">ג&apos;בטה מאורכת בטעמים (שום, זעתר, שומשום, רגיל)</div>
                  <div className="text-[10px] font-extrabold text-emerald-700">
                    שלישייה 12 ₪ (2 ב-20 ₪ — ניתן לשלב טעמים!) · יחידה 5 ₪
                  </div>
                </div>
                <span className="font-extrabold text-base text-[#C85A17] tabular-nums">₪12</span>
              </div>
              <div className="flex items-center justify-between pt-1.5 border-t border-[#F3E9DC]">
                <span className="font-extrabold text-slate-900">חילבה טרייה (קטן / גדול)</span>
                <span className="font-extrabold text-sm text-[#C85A17] tabular-nums">₪12 / ₪20</span>
              </div>
              {otherItems.slice(0, 4).map((p) => (
                <div key={p.id} className="flex items-center justify-between pt-1.5 border-t border-[#F3E9DC]">
                  <span className="font-bold text-slate-800">{p.name}</span>
                  <span className="font-extrabold text-sm text-[#C85A17] tabular-nums">
                    {formatILS(p.customer_price)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="text-center text-[11px] font-extrabold text-[#6D280B] pt-1">
            מחירי מכירה מוקדמת תקפים להזמנות עד יום חמישי בשעה 24:00 · שבת שלום ומבורכת! 🕯️
          </div>
        </div>
      </div>

      {/* כפתור שיתוף פלייר ישירות לוואטסאפ (Web Share API) + העתקת קישור */}
      <div className="space-y-2">
        <button
          type="button"
          disabled={sharing}
          onClick={handleShareFlyerDirect}
          className="w-full min-h-[52px] py-3 px-4 rounded-2xl bg-[#25D366] hover:bg-[#1EB958] text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-md active:scale-[0.98]"
        >
          <Share2 className="w-5 h-5" />
          <span>{sharing ? 'מכין פלייר לשיתוף...' : 'שתף פלייר ישירות לוואטסאפ'}</span>
        </button>

        <button
          type="button"
          onClick={handleCopyLink}
          className="w-full py-2.5 px-4 rounded-xl bg-white border border-[#E8D5BE] text-[#8A330B] font-extrabold text-xs flex items-center justify-center gap-1.5"
        >
          {copiedLink ? <Check className="w-4 h-4 text-emerald-600" /> : <Link2 className="w-4 h-4" />}
          <span>{copiedLink ? 'קישור התפריט הועתק!' : 'העתק קישור לתפריט הלקוחות'}</span>
        </button>

        {shareNote && (
          <div className="text-center text-xs font-bold text-emerald-700">{shareNote}</div>
        )}
      </div>
    </div>
  );
}
