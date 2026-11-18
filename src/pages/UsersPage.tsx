import React, { useEffect, useState } from 'react';
import { Plus, CreditCard, Phone, Mail, Edit3, X } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { formatILS, PAYMENT_METHOD_LABELS, ROLE_LABELS } from '../lib/format';
import type { PaymentMethod, User, UserRole } from '../types';

export function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('');

  // מודאל משתמש חדש / עריכה
  const [showCreate, setShowCreate] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    password: '',
    role: 'supplier' as UserRole,
    balance: '0',
    notes: '',
  });

  // מודאל רישום תשלום לסגירת חוב
  const [payUser, setPayUser] = useState<User | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState<PaymentMethod>('transfer');
  const [payNotes, setPayNotes] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ users: User[] }>('/api/users');
      setUsers(res.users);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בטעינת משתמשים');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openCreate = () => {
    setEditUser(null);
    setForm({ name: '', phone: '', email: '', password: '', role: 'supplier', balance: '0', notes: '' });
    setShowCreate(true);
  };

  const openEdit = (u: User) => {
    setEditUser(u);
    setForm({
      name: u.name,
      phone: u.phone,
      email: u.email,
      password: '',
      role: u.role,
      balance: String(u.balance),
      notes: u.notes,
    });
    setShowCreate(true);
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      if (editUser) {
        await apiFetch(`/api/users/${editUser.id}`, {
          method: 'PUT',
          body: JSON.stringify({
            name: form.name.trim(),
            phone: form.phone.trim(),
            role: form.role,
            balance: Number(form.balance),
            notes: form.notes.trim(),
          }),
        });
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
          }),
        });
      }
      setShowCreate(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בשמירת המשתמש');
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
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה ברישום התשלום');
    }
  };

  const filtered = users.filter((u) => (!roleFilter ? true : u.role === roleFilter));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="font-serif text-3xl font-bold text-slateink-800">משתמשים, ספקים וחשבונות</h2>
          <p className="text-sm text-slate-600 mt-1">
            ניהול הרשאות (מנהל / ספק / לקוח), מעקב יתרות חוב וזכות, ורישום קבלת תשלומים.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#C85A17] hover:bg-[#A9440F] text-white font-bold text-sm shadow-sm"
        >
          <Plus className="w-4 h-4" />
          <span>הוספת משתמש</span>
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {[
          { key: '', label: 'כולם' },
          { key: 'supplier', label: 'ספקים' },
          { key: 'customer', label: 'לקוחות' },
          { key: 'admin', label: 'מנהלים' },
        ].map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setRoleFilter(f.key)}
            className={`px-4 py-2 rounded-xl text-xs font-bold ${
              roleFilter === f.key
                ? 'bg-[#1E242B] text-white'
                : 'bg-white border border-[#E8D5BE] text-slate-700'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm font-semibold">
          {error}
        </div>
      )}

      {loading ? (
        <div className="bg-white rounded-2xl p-10 text-center text-slate-400 border border-[#E8D5BE]">
          טוען משתמשים...
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((u) => {
            const isDebt = u.balance < 0;
            const isCredit = u.balance > 0;
            return (
              <div
                key={u.id}
                className="bg-white rounded-2xl border border-[#E8D5BE]/80 shadow-soft p-5 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-bold text-base text-slate-900">{u.name}</h3>
                      <span className="inline-block mt-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#FAF6F0] text-[#8A330B] border border-[#E8D5BE]">
                        {ROLE_LABELS[u.role]}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => openEdit(u)}
                      className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-[#FAF6F0]"
                      title="ערוך משתמש"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="mt-3 space-y-1.5 text-xs text-slate-600">
                    {u.phone && (
                      <div className="flex items-center gap-2 tabular-nums">
                        <Phone className="w-3.5 h-3.5 text-slate-400" />
                        <span>{u.phone}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <Mail className="w-3.5 h-3.5 text-slate-400" />
                      <span dir="ltr">{u.email}</span>
                    </div>
                  </div>

                  {u.notes && (
                    <p className="mt-3 text-xs text-slate-500 bg-[#FAF6F0] rounded-xl p-2.5">{u.notes}</p>
                  )}
                </div>

                <div className="mt-4 pt-3.5 border-t border-[#F3E9DC]">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-semibold text-slate-500">יתרת חוב / זכות</span>
                    <span
                      className={`font-extrabold tabular-nums text-base ${
                        isDebt ? 'text-red-600' : isCredit ? 'text-emerald-700' : 'text-slate-700'
                      }`}
                    >
                      {isDebt
                        ? `חוב ${formatILS(Math.abs(u.balance))}`
                        : isCredit
                        ? `זכות ${formatILS(u.balance)}`
                        : 'מאוזן (₪0.00)'}
                    </span>
                  </div>

                  {u.role !== 'admin' && (
                    <button
                      type="button"
                      onClick={() => {
                        setPayUser(u);
                        setPayAmount(u.balance < 0 ? Math.abs(u.balance).toFixed(2) : '');
                      }}
                      className="w-full py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-bold flex items-center justify-center gap-1.5"
                    >
                      <CreditCard className="w-3.5 h-3.5" />
                      <span>רישום קבלת תשלום</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* מודאל יצירה / עריכה */}
      {showCreate && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-[#E8D5BE]">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-serif text-xl font-bold">
                {editUser ? `עריכת משתמש — ${editUser.name}` : 'הוספת משתמש חדש'}
              </h3>
              <button type="button" onClick={() => setShowCreate(false)} className="p-1 text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSaveUser} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">שם מלא / שם עסק</label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-xl border border-[#E8D5BE] text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">טלפון</label>
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-[#E8D5BE] text-sm tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">תפקיד</label>
                  <select
                    value={form.role}
                    onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}
                    className="w-full px-3 py-2 rounded-xl border border-[#E8D5BE] text-sm"
                  >
                    <option value="supplier">ספק</option>
                    <option value="customer">לקוח</option>
                    <option value="admin">מנהל</option>
                  </select>
                </div>
              </div>
              {!editUser && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">אימייל</label>
                    <input
                      type="email"
                      required
                      dir="ltr"
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-[#E8D5BE] text-sm text-left"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">סיסמה ראשונית</label>
                    <input
                      type="password"
                      minLength={6}
                      placeholder="123456"
                      value={form.password}
                      onChange={(e) => setForm({ ...form, password: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-[#E8D5BE] text-sm"
                    />
                  </div>
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  יתרה (מינוס = חוב, פלוס = זכות)
                </label>
                <input
                  type="number"
                  step="0.01"
                  dir="ltr"
                  value={form.balance}
                  onChange={(e) => setForm({ ...form, balance: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-[#E8D5BE] text-left tabular-nums font-bold"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">הערות</label>
                <input
                  type="text"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-[#E8D5BE] text-sm"
                />
              </div>
              <button
                type="submit"
                className="w-full py-2.5 rounded-xl bg-[#C85A17] hover:bg-[#A9440F] text-white font-bold text-sm"
              >
                שמור
              </button>
            </form>
          </div>
        </div>
      )}

      {/* מודאל תשלום */}
      {payUser && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-[#E8D5BE]">
            <h3 className="font-serif text-xl font-bold mb-1">רישום תשלום — {payUser.name}</h3>
            <p className="text-xs text-slate-500 mb-4 tabular-nums">
              יתרה נוכחית: {formatILS(payUser.balance)}
            </p>
            <form onSubmit={handleRecordPayment} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">סכום שהתקבל (₪)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  dir="ltr"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-[#E8D5BE] text-left tabular-nums font-bold"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">אמצעי תשלום</label>
                <select
                  value={payMethod}
                  onChange={(e) => setPayMethod(e.target.value as PaymentMethod)}
                  className="w-full px-3 py-2.5 rounded-xl border border-[#E8D5BE] text-sm"
                >
                  {(['transfer', 'bit', 'cash'] as const).map((pm) => (
                    <option key={pm} value={pm}>
                      {PAYMENT_METHOD_LABELS[pm]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">הערה</label>
                <input
                  type="text"
                  value={payNotes}
                  onChange={(e) => setPayNotes(e.target.value)}
                  placeholder="אסמכתא / הערה"
                  className="w-full px-3 py-2 rounded-xl border border-[#E8D5BE] text-sm"
                />
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm"
                >
                  רשום תשלום
                </button>
                <button
                  type="button"
                  onClick={() => setPayUser(null)}
                  className="px-4 py-2.5 rounded-xl border border-[#E8D5BE] text-slate-600 text-sm font-semibold"
                >
                  ביטול
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
