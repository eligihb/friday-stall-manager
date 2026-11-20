import React, { useEffect, useMemo, useState } from 'react';
import {
  Plus,
  CreditCard,
  Phone,
  Edit3,
  Trash2,
  Eye,
  Search,
  CheckCircle2,
  XCircle,
  Percent,
  Tag,
  AlertTriangle,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { formatILS, PAYMENT_METHOD_LABELS, ROLE_LABELS } from '../lib/format';
import { BottomSheet } from '../components/BottomSheet';
import type { AdminProduct, PaymentMethod, User, UserRole } from '../types';

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
    // ignore storage errors
  }
}

export function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [activeMap, setActiveMap] = useState<Record<number, boolean>>(() => loadActiveMap());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'customer' | 'supplier'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  // צפייה בפרטי לקוח/ספק
  const [viewUser, setViewUser] = useState<User | null>(null);

  // מודאל משתמש חדש / עריכה
  const [showCreate, setShowCreate] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    password: '',
    role: 'customer' as UserRole,
    balance: '0',
    notes: '',
    discount_percent: '0',
    custom_prices: {} as Record<number, string>,
  });

  // מודאל מחיקה עם אזהרה
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [deleting, setDeleting] = useState(false);

  // מודאל רישום תשלום לסגירת חוב
  const [payUser, setPayUser] = useState<User | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState<PaymentMethod>('transfer');
  const [payNotes, setPayNotes] = useState('');

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  };

  const load = async () => {
    setLoading(true);
    try {
      const [uRes, pRes] = await Promise.all([
        apiFetch<{ users: User[] }>('/api/users'),
        apiFetch<{ products: AdminProduct[] }>('/api/products'),
      ]);
      setUsers(uRes.users);
      setProducts(pRes.products.filter((p) => p.is_active));
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בטעינת לקוחות וספקים');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const isUserActive = (u: User): boolean => {
    if (activeMap[u.id] !== undefined) return activeMap[u.id];
    return u.is_active !== false;
  };

  const toggleUserActive = async (u: User) => {
    const next = !isUserActive(u);
    const updated = { ...activeMap, [u.id]: next };
    setActiveMap(updated);
    saveActiveMap(updated);
    try {
      await apiFetch(`/api/users/${u.id}`, {
        method: 'PUT',
        body: JSON.stringify({ is_active: next }),
      });
    } catch {
      // fallback to localStorage state if backend ignores is_active
    }
    showToast(`${u.name} סומן כ${next ? 'פעיל' : 'לא פעיל'}`);
  };

  const openCreate = (defaultRole: UserRole = 'customer') => {
    setEditUser(null);
    setForm({
      name: '',
      phone: '',
      email: '',
      password: '',
      role: defaultRole,
      balance: '0',
      notes: '',
      discount_percent: '0',
      custom_prices: {},
    });
    setShowCreate(true);
  };

  const openEdit = (u: User) => {
    setEditUser(u);
    const customMap: Record<number, string> = {};
    if (u.custom_prices) {
      for (const [pid, val] of Object.entries(u.custom_prices)) {
        customMap[Number(pid)] = String(val);
      }
    }
    setForm({
      name: u.name,
      phone: u.phone || '',
      email: u.email || '',
      password: '',
      role: u.role,
      balance: String(u.balance ?? 0),
      notes: u.notes || '',
      discount_percent: String(u.discount_percent ?? 0),
      custom_prices: customMap,
    });
    setShowCreate(true);
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const customPricesNumeric: Record<number, number> = {};
    for (const [pidStr, valStr] of Object.entries(form.custom_prices)) {
      const trimmed = valStr.trim();
      if (trimmed !== '' && !Number.isNaN(Number(trimmed)) && Number(trimmed) >= 0) {
        customPricesNumeric[Number(pidStr)] = Number(trimmed);
      }
    }

    try {
      if (editUser) {
        await apiFetch(`/api/users/${editUser.id}`, {
          method: 'PUT',
          body: JSON.stringify({
            name: form.name.trim(),
            phone: form.phone.trim(),
            role: form.role,
            balance: Number(form.balance) || 0,
            notes: form.notes.trim(),
            discount_percent: Math.max(0, Math.min(100, Number(form.discount_percent) || 0)),
            custom_prices: customPricesNumeric,
          }),
        });
        showToast('הפרטים עודכנו בהצלחה');
      } else {
        await apiFetch('/api/users', {
          method: 'POST',
          body: JSON.stringify({
            name: form.name.trim(),
            phone: form.phone.trim(),
            email: form.email.trim(),
            password: form.password || '123456',
            role: form.role,
            balance: Number(form.balance) || 0,
            notes: form.notes.trim(),
            discount_percent: Math.max(0, Math.min(100, Number(form.discount_percent) || 0)),
            custom_prices: customPricesNumeric,
          }),
        });
        showToast('נוסף בהצלחה');
      }
      setShowCreate(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בשמירת המשתמש');
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiFetch(`/api/users/${deleteTarget.id}`, { method: 'DELETE' });
      setUsers((prev) => prev.filter((u) => u.id !== deleteTarget.id));
      showToast(`${deleteTarget.name} נמחק בהצלחה`);
      setDeleteTarget(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה במחיקת המשתמש');
    } finally {
      setDeleting(false);
    }
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payUser) return;
    try {
      await apiFetch(`/api/users/${payUser.id}/payment`, {
        method: 'POST',
        body: JSON.stringify({
          amount: Number(payAmount),
          payment_method: payMethod,
          notes: payNotes.trim(),
        }),
      });
      setPayUser(null);
      setPayAmount('');
      setPayNotes('');
      showToast('התשלום נרשם בהצלחה');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה ברישום תשלום');
    }
  };

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users
      .filter((u) => u.role !== 'admin')
      .filter((u) => (roleFilter === 'all' ? true : u.role === roleFilter))
      .filter((u) => {
        const active = isUserActive(u);
        if (statusFilter === 'active') return active;
        if (statusFilter === 'inactive') return !active;
        return true;
      })
      .filter((u) => {
        if (!q) return true;
        return (
          u.name.toLowerCase().includes(q) ||
          (u.phone || '').toLowerCase().includes(q) ||
          (u.notes || '').toLowerCase().includes(q)
        );
      });
  }, [users, roleFilter, statusFilter, search, activeMap]);

  return (
    <div className="space-y-5">
      {/* כותרת ופעולות */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-serif text-3xl font-bold text-slateink-800">לקוחות וספקים</h2>
          <p className="text-sm text-slate-600 mt-0.5">
            ניהול מרוכז של לקוחות וספקים, סטטוס פעילות, הנחות אישיות ומחירון מותאם.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => openCreate('customer')}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#C85A17] hover:bg-[#A9440F] text-white font-bold text-xs shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>לקוח חדש</span>
          </button>
          <button
            type="button"
            onClick={() => openCreate('supplier')}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#1E242B] hover:bg-slate-800 text-white font-bold text-xs shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>ספק חדש</span>
          </button>
        </div>
      </div>

      {toast && (
        <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-bold">
          {toast}
        </div>
      )}
      {error && (
        <div className="p-3 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-sm font-bold">
          {error}
        </div>
      )}

      {/* סרגל חיפוש וסינון */}
      <div className="bg-white rounded-2xl border border-[#E8D5BE] p-3.5 shadow-soft flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="חיפוש לפי שם, טלפון או הערות..."
            className="w-full pr-9 pl-3 py-2 rounded-xl border border-[#E8D5BE] bg-[#FDFBF7] text-sm"
          />
        </div>

        <div className="flex items-center gap-1 bg-[#FAF6F0] p-1 rounded-xl border border-[#E8D5BE]">
          {(
            [
              ['all', 'הכל'],
              ['customer', 'לקוחות'],
              ['supplier', 'ספקים'],
            ] as const
          ).map(([val, label]) => (
            <button
              key={val}
              type="button"
              onClick={() => setRoleFilter(val)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                roleFilter === val ? 'bg-[#C85A17] text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1 bg-[#FAF6F0] p-1 rounded-xl border border-[#E8D5BE]">
          {(
            [
              ['all', 'כל הסטטוסים'],
              ['active', 'פעילים'],
              ['inactive', 'לא פעילים'],
            ] as const
          ).map(([val, label]) => (
            <button
              key={val}
              type="button"
              onClick={() => setStatusFilter(val)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                statusFilter === val ? 'bg-[#1E242B] text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* טבלת לקוחות וספקים */}
      {loading ? (
        <div className="py-12 text-center text-sm text-slate-400">טוען נתונים...</div>
      ) : filteredUsers.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[#E8D5BE] p-10 text-center text-slate-400 text-sm">
          לא נמצאו לקוחות או ספקים התואמים לחיפוש.
        </div>
      ) : (
        <div className="bg-white rounded-3xl border border-[#E8D5BE] shadow-soft overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead className="bg-[#FAF6F0] border-b border-[#E8D5BE] text-xs font-bold text-slate-600">
                <tr>
                  <th className="py-3 px-4">שם</th>
                  <th className="py-3 px-3">סוג</th>
                  <th className="py-3 px-3">טלפון</th>
                  <th className="py-3 px-3">הנחה / תמחור</th>
                  <th className="py-3 px-3">יתרה</th>
                  <th className="py-3 px-3">סטטוס</th>
                  <th className="py-3 px-4 text-left">פעולות</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F3E9DC]">
                {filteredUsers.map((u) => {
                  const active = isUserActive(u);
                  const customCount = u.custom_prices ? Object.keys(u.custom_prices).length : 0;
                  return (
                    <tr key={u.id} className={!active ? 'bg-slate-50/70 opacity-75' : 'hover:bg-[#FFFBF5]'}>
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900">{u.name}</div>
                        {u.notes && <div className="text-xs text-slate-500 truncate max-w-[220px]">{u.notes}</div>}
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-bold ${
                            u.role === 'supplier'
                              ? 'bg-indigo-50 text-indigo-800 border border-indigo-200'
                              : 'bg-amber-50 text-amber-800 border border-amber-200'
                          }`}
                        >
                          {ROLE_LABELS[u.role]}
                        </span>
                      </td>
                      <td className="py-3 px-3 tabular-nums text-xs text-slate-700" dir="ltr">
                        {u.phone || '—'}
                      </td>
                      <td className="py-3 px-3 text-xs">
                        <div className="flex flex-wrap gap-1">
                          {(u.discount_percent ?? 0) > 0 && (
                            <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-800 font-bold">
                              <Percent className="w-3 h-3" />
                              {u.discount_percent}%
                            </span>
                          )}
                          {customCount > 0 && (
                            <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-lg bg-sky-50 text-sky-800 font-bold">
                              <Tag className="w-3 h-3" />
                              {customCount} מחירים
                            </span>
                          )}
                          {!(u.discount_percent ?? 0) && customCount === 0 && (
                            <span className="text-slate-400">רגיל</span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-3 tabular-nums font-bold">
                        <span className={u.balance < 0 ? 'text-red-600' : 'text-emerald-700'}>
                          {formatILS(u.balance)}
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        <button
                          type="button"
                          onClick={() => toggleUserActive(u)}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-bold border transition-colors ${
                            active
                              ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                              : 'bg-slate-100 border-slate-300 text-slate-600'
                          }`}
                        >
                          {active ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                          <span>{active ? 'פעיל' : 'לא פעיל'}</span>
                        </button>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setViewUser(u)}
                            className="p-2 rounded-xl bg-[#FAF6F0] hover:bg-[#FFF7ED] text-slate-700"
                            title="צפייה"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => openEdit(u)}
                            className="p-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800"
                            title="עריכה"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setPayUser(u);
                              setPayAmount(u.balance < 0 ? String(Math.abs(u.balance)) : '');
                            }}
                            className="p-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800"
                            title="רישום תשלום"
                          >
                            <CreditCard className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(u)}
                            className="p-2 rounded-xl bg-red-50 hover:bg-red-100 text-red-700"
                            title="מחיקה"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* חלונית צפייה בפרטי לקוח/ספק */}
      <BottomSheet
        open={!!viewUser}
        onClose={() => setViewUser(null)}
        title={viewUser?.name || ''}
        subtitle={viewUser ? `${ROLE_LABELS[viewUser.role]} · ${isUserActive(viewUser) ? 'פעיל' : 'לא פעיל'}` : ''}
      >
        {viewUser && (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-2xl bg-[#FAF6F0] border border-[#E8D5BE]">
                <div className="text-xs text-slate-500">טלפון</div>
                <div className="font-bold mt-0.5 flex items-center gap-1.5" dir="ltr">
                  <Phone className="w-3.5 h-3.5 text-[#C85A17]" />
                  <span>{viewUser.phone || '—'}</span>
                </div>
              </div>
              <div className="p-3 rounded-2xl bg-[#FAF6F0] border border-[#E8D5BE]">
                <div className="text-xs text-slate-500">יתרה</div>
                <div className={`font-extrabold mt-0.5 tabular-nums ${viewUser.balance < 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                  {formatILS(viewUser.balance)}
                </div>
              </div>
            </div>

            <div className="p-3 rounded-2xl bg-[#FAF6F0] border border-[#E8D5BE]">
              <div className="text-xs text-slate-500">הערות</div>
              <div className="mt-1 text-slate-800">{viewUser.notes || 'אין הערות'}</div>
            </div>

            <div className="p-3 rounded-2xl bg-[#FAF6F0] border border-[#E8D5BE] space-y-2">
              <div className="text-xs font-bold text-slate-700">הנחה ותמחור אישי</div>
              <div className="text-xs text-slate-600">
                הנחה קבועה: <strong>{viewUser.discount_percent ?? 0}%</strong>
              </div>
              {viewUser.custom_prices && Object.keys(viewUser.custom_prices).length > 0 && (
                <div className="space-y-1 pt-1 border-t border-[#E8D5BE]">
                  {Object.entries(viewUser.custom_prices).map(([pid, price]) => {
                    const p = products.find((pr) => pr.id === Number(pid));
                    return (
                      <div key={pid} className="flex justify-between text-xs">
                        <span>{p ? p.name : `מוצר #${pid}`}</span>
                        <span className="font-bold text-[#8A330B]">{formatILS(Number(price))}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </BottomSheet>

      {/* חלונית יצירה / עריכה */}
      <BottomSheet
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title={editUser ? `עריכת ${editUser.name}` : 'הוספת לקוח / ספק חדש'}
        maxWidthClass="md:max-w-2xl"
      >
        <form onSubmit={handleSaveUser} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">שם מלא</label>
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-[#E8D5BE] bg-[#FDFBF7] text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">טלפון</label>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-[#E8D5BE] bg-[#FDFBF7] text-sm tabular-nums"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">סוג</label>
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}
                className="w-full px-3 py-2 rounded-xl border border-[#E8D5BE] bg-[#FDFBF7] text-sm"
              >
                <option value="customer">לקוח</option>
                <option value="supplier">ספק</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">הנחה קבועה (%)</label>
              <input
                type="number"
                min="0"
                max="100"
                step="0.5"
                dir="ltr"
                value={form.discount_percent}
                onChange={(e) => setForm({ ...form, discount_percent: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-[#E8D5BE] bg-[#FDFBF7] text-sm text-left tabular-nums"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">הערות</label>
            <textarea
              rows={2}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="w-full px-3 py-2 rounded-xl border border-[#E8D5BE] bg-[#FDFBF7] text-sm"
            />
          </div>

          {/* תמחור אישי למוצרים */}
          <div className="p-3.5 rounded-2xl bg-[#FAF6F0] border border-[#E8D5BE] space-y-2">
            <div className="text-xs font-extrabold text-slate-800">תמחור אישי (מחיר פיקס למוצר — אופציונלי)</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
              {products.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-2 bg-white px-2.5 py-1.5 rounded-xl border border-[#E8D5BE]">
                  <span className="text-xs font-semibold text-slate-700 truncate">{p.name}</span>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    dir="ltr"
                    placeholder={String(form.role === 'supplier' ? p.supplier_price : p.customer_price)}
                    value={form.custom_prices[p.id] ?? ''}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        custom_prices: { ...form.custom_prices, [p.id]: e.target.value },
                      })
                    }
                    className="w-20 px-2 py-1 rounded-lg border border-[#E8D5BE] text-left text-xs font-bold tabular-nums"
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="px-4 py-2 rounded-xl border border-[#E8D5BE] text-sm font-bold text-slate-600"
            >
              ביטול
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl bg-[#C85A17] hover:bg-[#A9440F] text-white text-sm font-bold"
            >
              שמור
            </button>
          </div>
        </form>
      </BottomSheet>

      {/* חלונית אזהרת מחיקה */}
      <BottomSheet
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="אישור מחיקת משתמש"
      >
        {deleteTarget && (
          <div className="space-y-4">
            <div className="p-3.5 rounded-2xl bg-red-50 border border-red-200 text-red-800 text-sm flex items-start gap-2.5">
              <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
              <div>
                האם למחוק לצמיתות את <strong>{deleteTarget.name}</strong>? פעולה זו אינה ניתנת לביטול.
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 rounded-xl border border-[#E8D5BE] text-sm font-bold text-slate-600"
              >
                ביטול
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={handleConfirmDelete}
                className="px-5 py-2 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-bold"
              >
                {deleting ? 'מוחק...' : 'מחק לצמיתות'}
              </button>
            </div>
          </div>
        )}
      </BottomSheet>

      {/* חלונית רישום תשלום */}
      <BottomSheet
        open={!!payUser}
        onClose={() => setPayUser(null)}
        title={`רישום תשלום — ${payUser?.name || ''}`}
      >
        <form onSubmit={handleRecordPayment} className="space-y-3.5">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">סכום ששולם (₪)</label>
            <input
              type="number"
              required
              min="1"
              step="0.5"
              dir="ltr"
              value={payAmount}
              onChange={(e) => setPayAmount(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-[#E8D5BE] bg-[#FDFBF7] text-left font-bold tabular-nums"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">אמצעי תשלום</label>
            <select
              value={payMethod}
              onChange={(e) => setPayMethod(e.target.value as PaymentMethod)}
              className="w-full px-3 py-2 rounded-xl border border-[#E8D5BE] bg-[#FDFBF7] text-sm"
            >
              {(['cash', 'paybox', 'transfer'] as const).map((pm) => (
                <option key={pm} value={pm}>
                  {PAYMENT_METHOD_LABELS[pm]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">הערה</label>
            <input
              type="text"
              value={payNotes}
              onChange={(e) => setPayNotes(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-[#E8D5BE] bg-[#FDFBF7] text-sm"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setPayUser(null)}
              className="px-4 py-2 rounded-xl border border-[#E8D5BE] text-sm font-bold text-slate-600"
            >
              ביטול
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold"
            >
              אשר תשלום
            </button>
          </div>
        </form>
      </BottomSheet>
    </div>
  );
}
