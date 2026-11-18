import React, { useEffect, useState } from 'react';
import {
  Building2,
  Users,
  Save,
  CheckCircle2,
  Plus,
  Edit3,
  KeyRound,
  CreditCard,
  Phone,
  Mail,
  X,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { formatILS, PAYMENT_METHOD_LABELS, ROLE_LABELS } from '../lib/format';
import type { BusinessSettings, PaymentMethod, User, UserRole } from '../types';

export function SettingsPage() {
  const [activeSection, setActiveSection] = useState<'business' | 'users'>('business');

  // הגדרות עסק
  const [settings, setSettings] = useState<BusinessSettings>({
    business_name: 'המטבח התימני',
    default_delivery_fee: 0,
    whatsapp_footer: 'שבת שלום ומבורכת! 🕯️',
  });
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);

  // ניהול משתמשים
  const [users, setUsers] = useState<User[]>([]);
  const [roleFilter, setRoleFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  // מודאל יצירה / עריכת משתמש
  const [showUserModal, setShowUserModal] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [userForm, setUserForm] = useState({
    name: '',
    phone: '',
    email: '',
    password: '',
    role: 'supplier' as UserRole,
    balance: '0',
    notes: '',
  });

  // מודאל איפוס סיסמה
  const [resetUser, setResetUser] = useState<User | null>(null);
  const [newPassword, setNewPassword] = useState('');

  // מודאל תשלום
  const [payUser, setPayUser] = useState<User | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState<PaymentMethod>('transfer');
  const [payNotes, setPayNotes] = useState('');

  const notify = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  };

  const loadAll = async () => {
    setLoading(true);
    try {
      const [setRes, usrRes] = await Promise.all([
        apiFetch<{ settings: BusinessSettings }>('/api/settings'),
        apiFetch<{ users: User[] }>('/api/users'),
      ]);
      setSettings(setRes.settings);
      setUsers(usrRes.users);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בטעינת ההגדרות');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    setError('');
    try {
      const res = await apiFetch<{ settings: BusinessSettings }>('/api/settings', {
        method: 'PUT',
        body: JSON.stringify(settings),
      });
      setSettings(res.settings);
      setSettingsSaved(true);
      setTimeout(() => setSettingsSaved(false), 2000);
      notify('הגדרות העסק נשמרו בהצלחה!');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בשמירת ההגדרות');
    } finally {
      setSavingSettings(false);
    }
  };

  const openCreateUser = () => {
    setEditUser(null);
    setUserForm({
      name: '',
      phone: '',
      email: '',
      password: '',
      role: 'supplier',
      balance: '0',
      notes: '',
    });
    setShowUserModal(true);
  };

  const openEditUser = (u: User) => {
    setEditUser(u);
    setUserForm({
      name: u.name,
      phone: u.phone,
      email: u.email,
      password: '',
      role: u.role,
      balance: String(u.balance),
      notes: u.notes,
    });
    setShowUserModal(true);
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      if (editUser) {
        await apiFetch(`/api/users/${editUser.id}`, {
          method: 'PUT',
          body: JSON.stringify({
            name: userForm.name.trim(),
            phone: userForm.phone.trim(),
            role: userForm.role,
            balance: Number(userForm.balance),
            notes: userForm.notes.trim(),
          }),
        });
        notify('פרטי המשתמש ויתרת החשבון עודכנו בהצלחה!');
      } else {
        await apiFetch('/api/users', {
          method: 'POST',
          body: JSON.stringify({
            name: userForm.name.trim(),
            phone: userForm.phone.trim(),
            email: userForm.email.trim(),
            password: userForm.password || '123456',
            role: userForm.role,
            balance: Number(userForm.balance) || 0,
            notes: userForm.notes.trim(),
          }),
        });
        notify('המשתמש החדש נוצר בהצלחה!');
      }
      setShowUserModal(false);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בשמירת המשתמש');
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetUser) return;
    setError('');
    try {
      await apiFetch(`/api/users/${resetUser.id}/reset-password`, {
        method: 'POST',
        body: JSON.stringify({ password: newPassword }),
      });
      setResetUser(null);
      setNewPassword('');
      notify(`הסיסמה עבור ${resetUser.name} אופסה בהצלחה!`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה באיפוס הסיסמה');
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
      notify('התשלום נרשם והיתרה עודכנה!');
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה ברישום התשלום');
    }
  };

  const filteredUsers = users.filter((u) => (!roleFilter ? true : u.role === roleFilter));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="font-serif text-3xl font-bold text-slateink-800">הגדרות וניהול משתמשים</h2>
          <p className="text-sm text-slate-600 mt-1">
            הגדרות העסק, תבנית חתימה לוואטסאפ, וניהול מלא של חשבונות ספקים ולקוחות (הרשאות, סיסמאות ויתרות פתיחה).
          </p>
        </div>

        <div className="inline-flex bg-white p-1.5 rounded-2xl border border-[#E8D5BE] shadow-soft">
          <button
            type="button"
            onClick={() => setActiveSection('business')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-colors ${
              activeSection === 'business'
                ? 'bg-[#C85A17] text-white'
                : 'text-slate-600 hover:bg-[#FAF6F0]'
            }`}
          >
            <Building2 className="w-4 h-4" />
            <span>הגדרות העסק</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveSection('users')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-colors ${
              activeSection === 'users'
                ? 'bg-[#C85A17] text-white'
                : 'text-slate-600 hover:bg-[#FAF6F0]'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>ניהול משתמשים ({users.length})</span>
          </button>
        </div>
      </div>

      {toast && (
        <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-bold flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 shrink-0" />
          <span>{toast}</span>
        </div>
      )}
      {error && (
        <div className="p-3.5 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-sm font-bold">
          {error}
        </div>
      )}

      {loading ? (
        <div className="bg-white rounded-3xl p-10 text-center text-slate-400 border border-[#E8D5BE]">
          טוען הגדרות...
        </div>
      ) : activeSection === 'business' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <form
            onSubmit={handleSaveSettings}
            className="lg:col-span-7 bg-white rounded-3xl border border-[#E8D5BE] shadow-soft p-6 space-y-5"
          >
            <h3 className="font-serif text-2xl font-bold text-slate-900">פרטי העסק והודעות</h3>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1.5">שם העסק</label>
              <input
                type="text"
                required
                value={settings.business_name}
                onChange={(e) => setSettings({ ...settings, business_name: e.target.value })}
                className="w-full px-4 py-2.5 rounded-xl border border-[#E8D5BE] bg-[#FDFBF7] focus:bg-white focus:border-[#C85A17] focus:outline-none font-semibold"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1.5">
                דמי משלוח ברירת מחדל (₪)
              </label>
              <input
                type="number"
                min="0"
                step="0.5"
                dir="ltr"
                value={settings.default_delivery_fee}
                onChange={(e) =>
                  setSettings({ ...settings, default_delivery_fee: Math.max(0, Number(e.target.value) || 0) })
                }
                className="w-44 px-4 py-2.5 rounded-xl border border-[#E8D5BE] bg-[#FDFBF7] focus:bg-white focus:border-[#C85A17] focus:outline-none text-left tabular-nums font-bold"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1.5">
                תבנית חתימה מותאמת להודעות וואטסאפ
              </label>
              <textarea
                rows={4}
                value={settings.whatsapp_footer}
                onChange={(e) => setSettings({ ...settings, whatsapp_footer: e.target.value })}
                placeholder="לדוגמה: לתשלום בביט: 050-5551000 | שבת שלום ומבורכת!"
                className="w-full px-4 py-3 rounded-xl border border-[#E8D5BE] bg-[#FDFBF7] focus:bg-white focus:border-[#C85A17] focus:outline-none text-sm leading-relaxed"
              />
            </div>

            <button
              type="submit"
              disabled={savingSettings}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#C85A17] hover:bg-[#A9440F] text-white font-bold text-sm shadow-sm"
            >
              <Save className="w-4 h-4" />
              <span>{savingSettings ? 'שומר...' : settingsSaved ? 'נשמר ✓' : 'שמור הגדרות עסק'}</span>
            </button>
          </form>

          {/* תצוגה מקדימה להודעת וואטסאפ */}
          <div className="lg:col-span-5 bg-white rounded-3xl border border-[#E8D5BE] shadow-soft p-6 space-y-3">
            <h4 className="font-bold text-base text-slate-900">תצוגה מקדימה לסיכום הזמנה בוואטסאפ</h4>
            <div className="bg-[#ECE5DD] rounded-2xl p-4">
              <div className="bg-[#DCF8C6] rounded-2xl rounded-tr-none p-4 text-xs text-slate-800 space-y-1 shadow-sm whitespace-pre-line leading-relaxed">
                <div className="font-bold">🫓 *{settings.business_name} — סיכום הזמנה #104*</div>
                <div>👤 דנה כהן</div>
                <div>📅 שישי הקרוב</div>
                <div>━━━━━━━━━━━━━━━━</div>
                <div>• 6 × לחוח — ₪24.00</div>
                <div>• 2 × קובנה — ₪60.00</div>
                {settings.default_delivery_fee > 0 && (
                  <div>🚗 דמי משלוח: {formatILS(settings.default_delivery_fee)}</div>
                )}
                <div className="font-bold">
                  💳 *סה״כ לתשלום: {formatILS(84 + settings.default_delivery_fee)}*
                </div>
                {settings.whatsapp_footer && <div className="pt-2">{settings.whatsapp_footer}</div>}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
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
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold ${
                    roleFilter === f.key
                      ? 'bg-[#1E242B] text-white'
                      : 'bg-white border border-[#E8D5BE] text-slate-700'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={openCreateUser}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#C85A17] hover:bg-[#A9440F] text-white font-bold text-xs shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span>הוספת משתמש חדש</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredUsers.map((u) => {
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
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setResetUser(u);
                            setNewPassword('');
                          }}
                          className="p-2 rounded-xl text-slate-400 hover:text-amber-700 hover:bg-amber-50"
                          title="איפוס סיסמה"
                        >
                          <KeyRound className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditUser(u)}
                          className="p-2 rounded-xl text-slate-400 hover:text-slate-800 hover:bg-[#FAF6F0]"
                          title="עריכת פרטים ויתרת פתיחה"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <div className="mt-3 space-y-1 text-xs text-slate-600">
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
                      <p className="mt-2.5 text-xs text-slate-500 bg-[#FAF6F0] rounded-xl p-2.5">{u.notes}</p>
                    )}
                  </div>

                  <div className="mt-4 pt-3.5 border-t border-[#F3E9DC]">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-semibold text-slate-500">יתרת חשבון</span>
                      <span
                        className={`font-extrabold tabular-nums text-sm ${
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
        </div>
      )}

      {/* מודאל יצירה / עריכת משתמש והתאמת יתרת פתיחה */}
      {showUserModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-[#E8D5BE]">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-serif text-xl font-bold">
                {editUser ? `עריכת משתמש — ${editUser.name}` : 'הוספת משתמש חדש'}
              </h3>
              <button type="button" onClick={() => setShowUserModal(false)} className="p-1 text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSaveUser} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">שם מלא / שם עסק</label>
                <input
                  type="text"
                  required
                  value={userForm.name}
                  onChange={(e) => setUserForm({ ...userForm, name: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-xl border border-[#E8D5BE] text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">טלפון</label>
                  <input
                    type="tel"
                    value={userForm.phone}
                    onChange={(e) => setUserForm({ ...userForm, phone: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-[#E8D5BE] text-sm tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">הרשאה (תפקיד)</label>
                  <select
                    value={userForm.role}
                    onChange={(e) => setUserForm({ ...userForm, role: e.target.value as UserRole })}
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
                      value={userForm.email}
                      onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-[#E8D5BE] text-sm text-left"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">סיסמה ראשונית</label>
                    <input
                      type="password"
                      minLength={6}
                      placeholder="123456"
                      value={userForm.password}
                      onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-[#E8D5BE] text-sm"
                    />
                  </div>
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  יתרת פתיחה / התאמת יתרה (מינוס = חוב, פלוס = זכות)
                </label>
                <input
                  type="number"
                  step="0.01"
                  dir="ltr"
                  value={userForm.balance}
                  onChange={(e) => setUserForm({ ...userForm, balance: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-[#E8D5BE] text-left tabular-nums font-bold"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">הערות</label>
                <input
                  type="text"
                  value={userForm.notes}
                  onChange={(e) => setUserForm({ ...userForm, notes: e.target.value })}
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

      {/* מודאל איפוס סיסמה */}
      {resetUser && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-[#E8D5BE]">
            <h3 className="font-serif text-xl font-bold mb-1">איפוס סיסמה — {resetUser.name}</h3>
            <p className="text-xs text-slate-500 mb-4" dir="ltr">
              {resetUser.email}
            </p>
            <form onSubmit={handleResetPassword} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  סיסמה חדשה (לפחות 6 תווים)
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#E8D5BE] text-sm"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-sm"
                >
                  אפס סיסמה
                </button>
                <button
                  type="button"
                  onClick={() => setResetUser(null)}
                  className="px-4 py-2.5 rounded-xl border border-[#E8D5BE] text-slate-600 text-sm font-semibold"
                >
                  ביטול
                </button>
              </div>
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
                  className="w-full px-3 py-2 rounded-xl border border-[#E8D5BE] text-sm"
                />
              </div>
              <div className="flex gap-2">
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
