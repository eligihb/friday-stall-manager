import React, { useState } from 'react';
import {
  Flame,
  LayoutDashboard,
  Tag,
  ShoppingBag,
  Store,
  HeartHandshake,
  Wallet,
  BarChart3,
  Settings,
  LogOut,
  Plus,
  Menu,
  Calendar,
  Repeat,
  ChevronLeft,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useFriday } from '../context/FridayContext';
import { formatShortFriday, getFridaysRange, ROLE_LABELS } from '../lib/format';
import { APP_BRAND_NAME, APP_VERSION } from '../lib/version';
import { BottomSheet } from './BottomSheet';
import { QuickOrderSheet } from './QuickOrderSheet';

export type AdminTab =
  | 'dashboard'
  | 'customer-orders'
  | 'supplier-orders'
  | 'charity-orders'
  | 'products'
  | 'finance'
  | 'reports'
  | 'settings';

interface NavItem {
  id: AdminTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const ADMIN_NAV: NavItem[] = [
  { id: 'dashboard', label: 'מסך ראשי ותפעול שישי', icon: LayoutDashboard },
  { id: 'customer-orders', label: 'הזמנות לקוחות', icon: ShoppingBag },
  { id: 'supplier-orders', label: 'הזמנות ספקים', icon: Store },
  { id: 'charity-orders', label: 'הזמנות מסובסדות', icon: HeartHandshake },
  { id: 'products', label: 'מחירון מוצרים', icon: Tag },
  { id: 'finance', label: 'הכנסות, הוצאות וקבועות', icon: Wallet },
  { id: 'reports', label: 'דוחות ורווח והפסד', icon: BarChart3 },
  { id: 'settings', label: 'הגדרות ומשתמשים', icon: Settings },
];

const TAB_TITLES: Record<AdminTab, string> = {
  dashboard: 'מסך ראשי',
  'customer-orders': 'הזמנות לקוחות',
  'supplier-orders': 'הזמנות ספקים',
  'charity-orders': 'הזמנות מסובסדות',
  products: 'מחירון מוצרים',
  finance: 'כספים וקופה',
  reports: 'דוחות ורווח והפסד',
  settings: 'הגדרות ומשתמשים',
};

interface LayoutProps {
  activeTab: AdminTab;
  onSelectTab: (tab: AdminTab) => void;
  children: React.ReactNode;
}

export function Layout({ activeTab, onSelectTab, children }: LayoutProps) {
  const { user, logout } = useAuth();
  const { fridayDate, setFridayDate } = useFriday();
  const [moreOpen, setMoreOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);

  if (!user) return null;

  const isAdmin = user.role === 'admin';
  const fridays = getFridaysRange(3, 6);
  const fridayOptions = fridays.includes(fridayDate) ? fridays : [fridayDate, ...fridays];

  const isOrdersGroup =
    activeTab === 'customer-orders' || activeTab === 'supplier-orders';
  const isFinanceGroup = activeTab === 'finance' || activeTab === 'reports';
  const isMoreGroup =
    activeTab === 'products' || activeTab === 'charity-orders' || activeTab === 'settings';

  const navigateAndCloseMore = (tab: AdminTab) => {
    onSelectTab(tab);
    setMoreOpen(false);
  };

  return (
    <div className="min-h-screen flex bg-[#FAF6F0] text-[#1E242B] overflow-x-hidden max-w-full">
      {/* סרגל צד לדסקטופ וטאבלט (>= 768px) */}
      <aside className="hidden md:flex md:flex-col md:w-64 md:fixed md:inset-y-0 md:right-0 bg-[#1E242B] text-cream-100 border-l border-white/10 z-30">
        <div className="p-5 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#C85A17] to-[#D97706] flex items-center justify-center shadow-md shrink-0">
              <Flame className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="font-serif text-xl font-bold text-white leading-tight truncate">
                {APP_BRAND_NAME}
              </h1>
              <p className="text-xs text-amber-300/90 mt-0.5 truncate">
                {user.role === 'admin'
                  ? 'ניהול דוכן שישי ושיווק'
                  : user.role === 'supplier'
                  ? 'פורטל ספק סיטונאי'
                  : 'פורטל הזמנות לקוח'}
              </p>
            </div>
          </div>

          {isAdmin && (
            <button
              type="button"
              onClick={() => setQuickOpen(true)}
              className="mt-4 w-full py-2.5 px-3.5 rounded-xl bg-gradient-to-l from-[#C85A17] to-[#D97706] hover:brightness-110 text-white font-bold text-xs shadow-md flex items-center justify-center gap-2 transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>קליטה מהירה (וואטסאפ / ידני)</span>
            </button>
          )}
        </div>

        <nav className="flex-1 p-3.5 space-y-1 overflow-y-auto">
          {isAdmin ? (
            ADMIN_NAV.map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectTab(item.id)}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                    active
                      ? 'bg-[#C85A17] text-white shadow-md'
                      : 'text-slate-300 hover:bg-white/8 hover:text-white'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })
          ) : (
            <div className="px-4 py-3 rounded-xl bg-[#C85A17] text-white flex items-center gap-3 text-sm font-semibold">
              {user.role === 'supplier' ? (
                <Store className="w-5 h-5" />
              ) : (
                <ShoppingBag className="w-5 h-5" />
              )}
              <span>{user.role === 'supplier' ? 'פורטל ספק' : 'פורטל לקוח'}</span>
            </div>
          )}
        </nav>

        <div className="p-4 border-t border-white/10 space-y-2.5">
          <div className="bg-white/5 rounded-2xl p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="font-bold text-sm text-white truncate">{user.name}</span>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 shrink-0">
                {ROLE_LABELS[user.role]}
              </span>
            </div>
            <p className="text-xs text-slate-400 truncate mt-1" dir="ltr">
              {user.email}
            </p>
          </div>

          <button
            type="button"
            onClick={() => logout()}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-white/8 hover:bg-red-500/20 text-slate-200 hover:text-red-200 text-sm font-semibold transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span>התנתקות</span>
          </button>

          <div className="text-center text-[11px] font-semibold text-slate-400 tabular-nums pt-0.5">
            גרסה {APP_VERSION}
          </div>
        </div>
      </aside>

      {/* תוכן ראשי */}
      <div className="flex-1 flex flex-col md:pr-64 min-w-0 max-w-full">
        {/* כותרת עליונה דביקה למובייל (< 768px) */}
        <header className="md:hidden sticky top-0 z-30 bg-[#1E242B] text-white px-3.5 py-2.5 shadow-md border-b border-white/10">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#C85A17] to-[#D97706] flex items-center justify-center shrink-0">
                <Flame className="w-4 h-4 text-white" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-serif font-bold text-base leading-none truncate">
                    {isAdmin ? TAB_TITLES[activeTab] : APP_BRAND_NAME}
                  </span>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-white/10 text-amber-300 tabular-nums shrink-0">
                    {APP_VERSION}
                  </span>
                </div>
                <div className="text-[11px] text-slate-300 truncate mt-0.5">
                  {user.name} · {ROLE_LABELS[user.role]}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {isAdmin && (
                <label className="inline-flex items-center gap-1 bg-white/10 border border-white/15 rounded-xl px-2 py-1.5 min-h-[44px] font-bold text-amber-200">
                  <Calendar className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <select
                    value={fridayDate}
                    onChange={(e) => setFridayDate(e.target.value)}
                    aria-label="בחירת יום שישי"
                    className="bg-transparent text-amber-100 font-bold text-base focus:outline-none max-w-[126px]"
                  >
                    {fridayOptions.map((f) => (
                      <option key={f} value={f} className="text-slate-900">
                        {formatShortFriday(f)}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {!isAdmin && (
                <button
                  type="button"
                  onClick={() => logout()}
                  className="min-w-[48px] min-h-[48px] rounded-xl bg-white/10 hover:bg-white/20 text-slate-200 flex items-center justify-center"
                  title="התנתקות"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* סרגל תת-לשוניות מהיר במובייל עבור קבוצת הזמנות או כספים */}
          {isAdmin && isOrdersGroup && (
            <div className="mt-2.5 grid grid-cols-3 gap-1.5 bg-white/8 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => onSelectTab('customer-orders')}
                className={`py-1.5 rounded-lg text-xs font-bold transition-colors ${
                  activeTab === 'customer-orders' ? 'bg-[#C85A17] text-white' : 'text-slate-300'
                }`}
              >
                לקוחות
              </button>
              <button
                type="button"
                onClick={() => onSelectTab('supplier-orders')}
                className={`py-1.5 rounded-lg text-xs font-bold transition-colors ${
                  activeTab === 'supplier-orders' ? 'bg-[#C85A17] text-white' : 'text-slate-300'
                }`}
              >
                ספקים
              </button>
              <button
                type="button"
                onClick={() => onSelectTab('charity-orders')}
                className="py-1.5 rounded-lg text-xs font-bold text-slate-300"
              >
                מסובסדות
              </button>
            </div>
          )}

          {isAdmin && isFinanceGroup && (
            <div className="mt-2.5 grid grid-cols-2 gap-1.5 bg-white/8 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => onSelectTab('finance')}
                className={`py-1.5 rounded-lg text-xs font-bold transition-colors ${
                  activeTab === 'finance' ? 'bg-[#C85A17] text-white' : 'text-slate-300'
                }`}
              >
                יומן וקופה
              </button>
              <button
                type="button"
                onClick={() => onSelectTab('reports')}
                className={`py-1.5 rounded-lg text-xs font-bold transition-colors ${
                  activeTab === 'reports' ? 'bg-[#C85A17] text-white' : 'text-slate-300'
                }`}
              >
                דוחות P&L
              </button>
            </div>
          )}
        </header>

        {/* גוף העמוד עם מעבר חלק */}
        <main
          key={activeTab}
          className={`flex-1 p-3.5 sm:p-6 md:p-8 max-w-7xl w-full mx-auto animate-fade-in ${
            isAdmin ? 'pb-28 md:pb-10' : 'pb-10'
          }`}
        >
          {children}
        </main>

        {/* סרגל ניווט תחתון קבוע למובייל (< 768px) — 5 עמודות עם כפתור + מרכזי בולט */}
        {isAdmin && (
          <nav
            aria-label="ניווט ראשי במובייל"
            className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur-md border-t border-[#E8D5BE] shadow-[0_-6px_24px_rgba(30,36,43,0.1)] pb-[env(safe-area-inset-bottom)]"
          >
            <div className="grid grid-cols-5 items-end px-1.5 pt-1 pb-1.5">
              {/* 1. ראשי */}
              <button
                type="button"
                onClick={() => onSelectTab('dashboard')}
                className={`min-h-[56px] flex flex-col items-center justify-center gap-1 rounded-2xl transition-colors ${
                  activeTab === 'dashboard' ? 'text-[#C85A17] bg-[#FFF7ED]' : 'text-slate-500'
                }`}
              >
                <LayoutDashboard className="w-5 h-5" />
                <span className="text-[11px] font-bold leading-none">ראשי</span>
              </button>

              {/* 2. הזמנות */}
              <button
                type="button"
                onClick={() =>
                  onSelectTab(activeTab === 'supplier-orders' ? 'supplier-orders' : 'customer-orders')
                }
                className={`min-h-[56px] flex flex-col items-center justify-center gap-1 rounded-2xl transition-colors ${
                  isOrdersGroup ? 'text-[#C85A17] bg-[#FFF7ED]' : 'text-slate-500'
                }`}
              >
                <ShoppingBag className="w-5 h-5" />
                <span className="text-[11px] font-bold leading-none">הזמנות</span>
              </button>

              {/* 3. קליטה מהירה — FAB מרכזי מוגבה */}
              <div className="flex flex-col items-center justify-end -mt-6">
                <button
                  type="button"
                  onClick={() => setQuickOpen(true)}
                  className="w-14 h-14 rounded-full bg-gradient-to-br from-[#C85A17] to-[#9A3412] text-white shadow-[0_8px_20px_rgba(200,90,23,0.45)] border-4 border-[#FAF6F0] flex items-center justify-center active:scale-95 transition-transform"
                  aria-label="קליטה מהירה"
                >
                  <Plus className="w-7 h-7 stroke-[2.6]" />
                </button>
                <span className="text-[10px] font-extrabold text-[#8A330B] mt-0.5 leading-none">
                  קליטה מהירה
                </span>
              </div>

              {/* 4. כספים */}
              <button
                type="button"
                onClick={() => onSelectTab(activeTab === 'reports' ? 'reports' : 'finance')}
                className={`min-h-[56px] flex flex-col items-center justify-center gap-1 rounded-2xl transition-colors ${
                  isFinanceGroup ? 'text-[#C85A17] bg-[#FFF7ED]' : 'text-slate-500'
                }`}
              >
                <Wallet className="w-5 h-5" />
                <span className="text-[11px] font-bold leading-none">כספים</span>
              </button>

              {/* 5. תפריט / עוד */}
              <button
                type="button"
                onClick={() => setMoreOpen(true)}
                className={`min-h-[56px] flex flex-col items-center justify-center gap-1 rounded-2xl transition-colors ${
                  isMoreGroup || moreOpen ? 'text-[#C85A17] bg-[#FFF7ED]' : 'text-slate-500'
                }`}
              >
                <Menu className="w-5 h-5" />
                <span className="text-[11px] font-bold leading-none">עוד</span>
              </button>
            </div>
          </nav>
        )}
      </div>

      {/* חלונית "עוד / תפריט" נפתחת מלמטה */}
      <BottomSheet
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        title="תפריט ניהול"
        subtitle={`${user.name} · ${ROLE_LABELS[user.role]} · גרסה ${APP_VERSION}`}
        maxWidthClass="md:max-w-md"
      >
        <div className="space-y-2.5">
          {[
            {
              tab: 'products' as AdminTab,
              title: 'מחירון מוצרים',
              desc: 'עריכת 4 מדרגות מחיר, מרווחי רווח והפעלה',
              icon: Tag,
              color: 'bg-amber-50 text-amber-800',
            },
            {
              tab: 'charity-orders' as AdminTab,
              title: 'הזמנות מסובסדות',
              desc: 'הכולל ומשפחות, תשלומים חודשיים ופער סבסוד',
              icon: HeartHandshake,
              color: 'bg-purple-50 text-purple-800',
            },
            {
              tab: 'supplier-orders' as AdminTab,
              title: 'כרטסת ספקים וחובות',
              desc: 'הזמנות סיטונאיות, זכויות וחוב מצטבר',
              icon: Store,
              color: 'bg-orange-50 text-[#8A330B]',
            },
            {
              tab: 'finance' as AdminTab,
              title: 'הוצאות קבועות, פחת ויומן כספים',
              desc: 'שכירות, פחת סוף יום, קופת דוכן מזומן ופייבוקס',
              icon: Repeat,
              color: 'bg-emerald-50 text-emerald-800',
            },
            {
              tab: 'reports' as AdminTab,
              title: 'דוחות רווח והפסד (P&L)',
              desc: 'התאמת קופה, חייבים וזכאים וייצוא CSV',
              icon: BarChart3,
              color: 'bg-sky-50 text-sky-800',
            },
            {
              tab: 'settings' as AdminTab,
              title: 'הגדרות וניהול משתמשים',
              desc: 'פרטי העסק, חתימת וואטסאפ ואיפוס סיסמאות',
              icon: Settings,
              color: 'bg-slate-100 text-slate-800',
            },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.tab}
                type="button"
                onClick={() => navigateAndCloseMore(item.tab)}
                className="w-full min-h-[60px] p-3.5 rounded-2xl border border-[#E8D5BE] bg-[#FDFBF7] hover:bg-[#FFF7ED] flex items-center justify-between gap-3 text-right active:scale-[0.99] transition-transform"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${item.color}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-bold text-sm text-slate-900">{item.title}</div>
                    <div className="text-xs text-slate-500 truncate">{item.desc}</div>
                  </div>
                </div>
                <ChevronLeft className="w-4 h-4 text-slate-400 shrink-0" />
              </button>
            );
          })}

          <div className="pt-3 border-t border-[#F3E9DC] flex items-center justify-between gap-3">
            <span className="text-xs font-bold text-slate-400 tabular-nums">
              {APP_BRAND_NAME} · גרסה {APP_VERSION}
            </span>
            <button
              type="button"
              onClick={() => {
                setMoreOpen(false);
                logout();
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-red-50 hover:bg-red-100 text-red-700 font-bold text-xs"
            >
              <LogOut className="w-4 h-4" />
              <span>התנתקות</span>
            </button>
          </div>
        </div>
      </BottomSheet>

      {/* חלונית קליטה מהירה (FAB +) */}
      {isAdmin && <QuickOrderSheet open={quickOpen} onClose={() => setQuickOpen(false)} />}
    </div>
  );
}
