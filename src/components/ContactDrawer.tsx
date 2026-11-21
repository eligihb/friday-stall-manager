import React, { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, History, Save, UserPlus } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { formatFridayLabel, formatILS, ROLE_LABELS } from '../lib/format';
import { useContactDrawer } from '../context/ContactDrawerContext';
import { useFriday } from '../context/FridayContext';
import { BottomSheet } from './BottomSheet';
import type { Order, User, UserRole } from '../types';

const ACTIVE_STORAGE_KEY = 'fsm_user_active_map';

function loadActiveMap(): Record<number, boolean> {
  try {
    const raw = localStorage.getItem(ACTIVE_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveActiveMap(map: Record<number, boolean>) {
  try {
    localStorage.setItem(ACTIVE_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

export function ContactDrawer() {
  const { drawerState, closeDrawer } = useContactDrawer();
  const { triggerRefresh } = useFriday();

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [savedMsg, setSavedMsg] = useState('');
  const [userOrders, setUserOrders] = useState<Order[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<UserRole>('customer');
  const [isActive, setIsActive] = useState(true);
  const [discountPercent, setDiscountPercent] = useState('0');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!drawerState.open) return;
    setError('');
    setSavedMsg('');
    if (drawerState.mode === 'create') {
      setCurrentUser(null);
      setUserOrders([]);
      setName('');
      setPhone('');
      setRole(drawerState.defaultRole);
      setIsActive(true);
      setDiscountPercent('0');
      setNotes('');
      return;
    }

    if (drawerState.userId) {
      let active = true;
      setLoading(true);
      Promise.all([
        apiFetch<{ users: User[] }>('/api/users'),
        apiFetch<{ orders: Order[] }>('/api/orders'),
      ])
        .then(([uRes, oRes]) => {
          if (!active) return;
          const found = uRes.users.find((u) => u.id === drawerState.userId) || null;
          setCurrentUser(found);
          if (found) {
            const activeMap = loadActiveMap();
            setName(found.name);
            setPhone(found.phone || '');
            setRole(found.role);
            setIsActive(
              activeMap[found.id] !== undefined ? activeMap[found.id] : found.is_active !== false
            );
            setDiscountPercent(String(found.discount_percent ?? 0));
            setNotes(found.notes || '');
            setUserOrders(
              oRes.orders
                .filter((o) => o.user_id === found.id)
                .sort((a, b) => b.id - a.id)
                .slice(0, 6)
            );
          }
        })
        .catch((err) => {
          if (active) setError(err instanceof Error ? err.message : 'שגיאה בטעינת פרטי איש הקשר');
        })
        .finally(() => {
          if (active) setLoading(false);
        });
      return () => {
        active = false;
      };
    }
  }, [drawerState]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError('');
    try {
      const disc = Math.max(0, Math.min(100, Number(discountPercent) || 0));
      if (drawerState.mode === 'edit' && currentUser) {
        await apiFetch(`/api/users/${currentUser.id}`, {
          method: 'PUT',
          body: JSON.stringify({
            name: name.trim(),
            phone: phone.trim(),
            role,
            balance: currentUser.balance,
            notes: notes.trim(),
            discount_percent: disc,
            is_active: isActive,
          }),
        });
        const map = loadActiveMap();
        map[currentUser.id] = isActive;
        saveActiveMap(map);
        setSavedMsg('הפרטים עודכנו בהצלחה ✓');
      } else {
        const res = await apiFetch<{ id: number }>('/api/users', {
          method: 'POST',
          body: JSON.stringify({
            name: name.trim(),
            phone: phone.trim(),
            role,
            balance: 0,
            notes: notes.trim(),
            discount_percent: disc,
          }),
        });
        if (res?.id) {
          const map = loadActiveMap();
          map[res.id] = isActive;
          saveActiveMap(map);
        }
        setSavedMsg('נוסף בהצלחה ✓');
      }
      triggerRefresh();
      setTimeout(() => {
        closeDrawer();
      }, 450);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בשמירת הפרטים');
    } finally {
      setSaving(false);
    }
  };

  return (
    <BottomSheet
      open={drawerState.open}
      onClose={closeDrawer}
      title={
        drawerState.mode === 'edit'
          ? currentUser
            ? `כרטיס ${ROLE_LABELS[currentUser.role]} — ${currentUser.name}`
            : 'עריכת איש קשר'
          : 'הוסף לקוח / ספק חדש'
      }
      subtitle={
        drawerState.mode === 'edit' && currentUser
          ? `יתרה נוכחית: ${formatILS(currentUser.balance)}`
          : 'הוספה מהירה מכל מסך במערכת'
      }
      maxWidthClass="md:max-w-md"
    >
      {loading ? (
        <div className="py-10 text-center text-sm text-slate-400">טוען פרטים...</div>
      ) : (
        <form onSubmit={handleSave} className="space-y-4">
          {savedMsg && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold">
              {savedMsg}
            </div>
          )}
          {error && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-bold">
              {error}
            </div>
          )}

          {/* סוג + סטטוס פעיל/לא פעיל */}
          <div className="flex items-center justify-between gap-2">
            <div className="inline-flex bg-[#FAF6F0] p-1 rounded-xl border border-[#E8D5BE]">
              {(
                [
                  ['customer', 'לקוח'],
                  ['supplier', 'ספק'],
                ] as const
              ).map(([rVal, lbl]) => (
                <button
                  key={rVal}
                  type="button"
                  onClick={() => setRole(rVal)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-colors ${
                    role === rVal ? 'bg-[#C85A17] text-white' : 'text-slate-600'
                  }`}
                >
                  {lbl}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setIsActive((v) => !v)}
              className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-extrabold border ${
                isActive
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                  : 'bg-slate-100 border-slate-300 text-slate-600'
              }`}
            >
              {isActive ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
              <span>{isActive ? 'פעיל' : 'לא פעיל'}</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">שם מלא *</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="שם פרטי ומשפחה"
                className="w-full px-3 py-2 rounded-xl border border-[#E8D5BE] bg-[#FDFBF7] text-sm font-bold"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">טלפון</label>
              <input
                type="tel"
                inputMode="tel"
                dir="ltr"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="050-0000000"
                className="w-full px-3 py-2 rounded-xl border border-[#E8D5BE] bg-[#FDFBF7] text-left text-sm tabular-nums"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">הנחה אישית (%)</label>
              <input
                type="number"
                min="0"
                max="100"
                step="0.5"
                dir="ltr"
                value={discountPercent}
                onChange={(e) => setDiscountPercent(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-[#E8D5BE] bg-[#FDFBF7] text-left text-sm font-bold tabular-nums"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-600 mb-1">הערות</label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="הערות / העדפות / כתובת"
                className="w-full px-3 py-2 rounded-xl border border-[#E8D5BE] bg-[#FDFBF7] text-sm"
              />
            </div>
          </div>

          {/* היסטוריית הזמנות אחרונות */}
          {drawerState.mode === 'edit' && userOrders.length > 0 && (
            <div className="pt-2 border-t border-[#F3E9DC] space-y-1.5">
              <div className="text-xs font-extrabold text-slate-600 flex items-center gap-1">
                <History className="w-3.5 h-3.5 text-[#C85A17]" />
                <span>הזמנות אחרונות ({userOrders.length})</span>
              </div>
              <div className="space-y-1 max-h-36 overflow-y-auto">
                {userOrders.map((o) => (
                  <div
                    key={o.id}
                    className="flex items-center justify-between text-xs px-2.5 py-1.5 rounded-xl bg-[#FAF6F0] border border-[#E8D5BE]/70 tabular-nums"
                  >
                    <span>
                      #{o.id} · {formatFridayLabel(o.friday_date)}
                    </span>
                    <span className="font-extrabold text-slate-900">{formatILS(o.total_amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            className="w-full py-2.5 px-4 rounded-xl bg-[#C85A17] hover:bg-[#A9440F] disabled:opacity-50 text-white font-extrabold text-sm flex items-center justify-center gap-1.5 shadow-sm"
          >
            {drawerState.mode === 'edit' ? <Save className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
            <span>{saving ? 'שומר...' : drawerState.mode === 'edit' ? 'שמור שינויים' : 'הוסף לקוח / ספק'}</span>
          </button>
        </form>
      )}
    </BottomSheet>
  );
}
