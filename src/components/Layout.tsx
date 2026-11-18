import React from 'react';
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
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { ROLE_LABELS } from '../lib/format';

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
  shortLabel: string;
  icon: React.ComponentType<{ className?: string }>;
}

const ADMIN_NAV: NavItem[] = [
  { id: 'dashboard', label: 'מסך ראשי ותפעול שישי', shortLabel: 'ראשי', icon: LayoutDashboard },
  { id: 'customer-orders', label: 'הזמנות לקוחות', shortLabel: 'לקוחות', icon: ShoppingBag },
  { id: 'supplier-orders', label: 'הזמנות ספקים', shortLabel: 'ספקים', icon: Store },
  { id: 'charity-orders', label: 'המשפחות הנזקקות', shortLabel: 'תרומות', icon: HeartHandshake },
  { id: 'products', label: 'מחירון מוצרים', shortLabel: 'מחירון', icon: Tag },
  { id: 'finance', label: 'הכנסות, הוצאות וקבועות', shortLabel: 'כספים', icon: Wallet },
  { id: 'reports', label: 'דוחות ורווח והפסד', shortLabel: 'דוחות', icon: BarChart3 },
  { id: 'settings', label: 'הגדרות ומשתמשים', shortLabel: 'הגדרות', icon: Settings },
];

interface LayoutProps {
  activeTab: AdminTab;
  onSelectTab: (tab: AdminTab) => void;
  children: React.ReactNode;
}

export function Layout({ activeTab, onSelectTab, children }: LayoutProps) {
  const { user, logout } = useAuth();
  if (!user) return null;

  const isAdmin = user.role === 'admin';

  return (
    <div className="min-h-screen flex bg-[#FAF6F0] text-[#1E242B]">
      {/* סרגל צד לדסקטופ (מימין ב-RTL) */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 lg:right-0 bg-[#1E242B] text-cream-100 border-l border-white/10 z-30">
        <div className="p-6 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#C85A17] to-[#D97706] flex items-center justify-center shadow-md">
              <Flame className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-serif text-xl font-bold text-white leading-tight">המטבח התימני</h1>
              <p className="text-xs text-amber-300/90 mt-0.5">
                {user.role === 'admin'
                  ? 'ניהול מאפייה ודוכן שישי'
                  : user.role === 'supplier'
                  ? 'פורטל ספק סיטונאי'
                  : 'פורטל הזמנות לקוח'}
              </p>
            </div>
          </div>
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
              {user.role === 'supplier' ? <Store className="w-5 h-5" /> : <ShoppingBag className="w-5 h-5" />}
              <span>{user.role === 'supplier' ? 'פורטל ספק' : 'פורטל לקוח'}</span>
            </div>
          )}
        </nav>

        <div className="p-4 border-t border-white/10">
          <div className="bg-white/5 rounded-2xl p-3.5 mb-3">
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
        </div>
      </aside>

      {/* תוכן ראשי */}
      <div className="flex-1 flex flex-col lg:pr-64 min-w-0">
        {/* כותרת מובייל */}
        <header className="lg:hidden sticky top-0 z-20 bg-[#1E242B] text-white px-4 py-3 flex items-center justify-between shadow-md">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#C85A17] to-[#D97706] flex items-center justify-center">
              <Flame className="w-4 h-4 text-white" />
            </div>
            <div>
              <div className="font-serif font-bold text-lg leading-none">המטבח התימני</div>
              <div className="text-[11px] text-amber-300 mt-0.5">
                {user.name} · {ROLE_LABELS[user.role]}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => logout()}
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-slate-200"
            title="התנתקות"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </header>

        <main className={`flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto ${isAdmin ? 'pb-24 lg:pb-10' : 'pb-10'}`}>
          {children}
        </main>

        {/* ניווט תחתון למובייל למנהל */}
        {isAdmin && (
          <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t border-[#E8D5BE] shadow-lg px-1 py-1.5 overflow-x-auto">
            <div className="grid grid-cols-8 gap-0.5 min-w-[420px]">
              {ADMIN_NAV.map((item) => {
                const Icon = item.icon;
                const active = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onSelectTab(item.id)}
                    className={`flex flex-col items-center justify-center py-1.5 rounded-xl transition-colors ${
                      active ? 'text-[#C85A17] bg-[#FFF7ED]' : 'text-slate-500'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span className="text-[10px] font-bold mt-0.5 truncate max-w-full">{item.shortLabel}</span>
                  </button>
                );
              })}
            </div>
          </nav>
        )}
      </div>
    </div>
  );
}
