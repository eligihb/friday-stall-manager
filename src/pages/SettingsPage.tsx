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
  Cloud,
  Database,
  RotateCcw,
  Trash2,
  Search,
  Tag,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { formatILS, PAYMENT_METHOD_LABELS, ROLE_LABELS } from '../lib/format';
import { filterUsersByNameOrPhone, getPhoneLast4 } from '../lib/whatsappParser';
import { APP_VERSION } from '../lib/version';
import { useAuth } from '../context/AuthContext';
import {
  DEFAULT_ADMIN_NAME,
  DEFAULT_ADMIN_WHATSAPP,
  DEFAULT_CUSTOMER_ORDER_TEMPLATE,
  DEFAULT_MENU_SHARE_TEMPLATE,
  loadStorefrontConfig,
  saveStorefrontConfig,
  type CustomerPriceMode,
  type StorefrontConfig,
} from '../lib/storefrontConfig';
import { BottomSheet } from '../components/BottomSheet';
import { BackupRestoreCard } from '../components/BackupRestoreCard';
import {
  DEFAULT_SUPABASE_ANON_KEY,
  DEFAULT_SUPABASE_URL,
  clearCloudConfig,
  getSavedCloudConfig,
  hasCloudCredentials,
  saveCloudConfig,
  type CloudConfig,
} from '../lib/cloudConfig';
import {
  getCloudSyncStatus,
  pushLocalStateToCloud,
  subscribeCloudSyncStatus,
  syncWithCloudOnStartupOrPoll,
  type CloudSyncStatusSnapshot,
} from '../lib/supabaseSync';
import type { AdminProduct, BusinessSettings, PaymentMethod, User, UserRole } from '../types';

export function SettingsPage() {
  const { user: currentUser, updateUserName } = useAuth();
  const [activeSection, setActiveSection] = useState<'business' | 'users'>('business');
  const [adminDisplayName, setAdminDisplayName] = useState(() => currentUser?.name || DEFAULT_ADMIN_NAME);
  const [storefrontCfg, setStorefrontCfg] = useState<StorefrontConfig>(() => loadStorefrontConfig());

  // הגדרות עסק
  const [settings, setSettings] = useState<BusinessSettings>({
    business_name: 'דוכן שישי תימני',
    business_address: '',
    order_phone: DEFAULT_ADMIN_WHATSAPP,
    admin_whatsapp_phone: DEFAULT_ADMIN_WHATSAPP,
    default_delivery_fee: 0,
    free_delivery_threshold: 0,
    whatsapp_footer: 'שבת שלום ומבורכת! 🕯️',
  });
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);

  // הגדרות מסד נתונים בענן (Fallback ל-localStorage כשאין משתני סביבה)
  const [cloudCfg, setCloudCfg] = useState<CloudConfig>(() => getSavedCloudConfig());
  const [showCloudForm, setShowCloudForm] = useState(false);
  const [syncingNow, setSyncingNow] = useState(false);
  const [cloudSyncStatus, setCloudSyncStatus] = useState<CloudSyncStatusSnapshot>(() =>
    getCloudSyncStatus()
  );
  const cloudConfigured = hasCloudCredentials();

  useEffect(() => {
    return subscribeCloudSyncStatus(setCloudSyncStatus);
  }, []);

  const handleManualCloudSyncNow = async () => {
    setSyncingNow(true);
    setError('');
    try {
      saveCloudConfig(cloudCfg);
      const ok = await syncWithCloudOnStartupOrPoll(true);
      await loadAll();
      if (ok) {
        notify('הסנכרון מול ענן Supabase הושלם בהצלחה ✓');
      } else {
        const latestErr = getCloudSyncStatus().lastError;
        setError(
          latestErr
            ? `שגיאה מ-Supabase: ${latestErr}`
            : 'לא ניתן להתחבר לענן כרגע — הנתונים שמורים מקומית במכשיר.'
        );
      }
    } finally {
      setSyncingNow(false);
    }
  };

  // ניהול משתמשים
  const [users, setUsers] = useState<User[]>([]);
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [roleFilter, setRoleFilter] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  // מודאל יצירה / עריכת משתמש
  const [showUserModal, setShowUserModal] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [showCustomPrices, setShowCustomPrices] = useState(false);
  const [userForm, setUserForm] = useState({
    name: '',
    phone: '',
    email: '',
    password: '',
    role: 'supplier' as UserRole,
    balance: '0',
    discount_percent: '0',
    custom_prices: {} as Record<number, string>,
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
      const [setRes, usrRes, prodRes] = await Promise.all([
        apiFetch<{ settings: BusinessSettings }>('/api/settings'),
        apiFetch<{ users: User[] }>('/api/users'),
        apiFetch<{ products: AdminProduct[] }>('/api/products'),
      ]);
      let extra: Partial<BusinessSettings> = {};
      try {
        const raw = localStorage.getItem('fsm_business_settings_extra');
        if (raw) extra = JSON.parse(raw);
      } catch {
        // ignore
      }
      setSettings({ ...extra, ...setRes.settings });
      setUsers(usrRes.users);
      setProducts(prodRes.products.filter((p) => p.is_active));
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
      if (adminDisplayName.trim() && adminDisplayName.trim() !== currentUser?.name) {
        await updateUserName(adminDisplayName.trim());
      }
      saveStorefrontConfig(storefrontCfg);
      try {
        localStorage.setItem(
          'fsm_business_settings_extra',
          JSON.stringify({
            business_address: settings.business_address || '',
            order_phone: settings.order_phone || '',
            free_delivery_threshold: settings.free_delivery_threshold || 0,
          })
        );
      } catch {
        // ignore
      }
      setSettings({
        ...res.settings,
        business_address: settings.business_address || res.settings.business_address || '',
        order_phone: settings.order_phone || res.settings.order_phone || '',
        free_delivery_threshold: settings.free_delivery_threshold ?? res.settings.free_delivery_threshold ?? 0,
      });
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
    setShowCustomPrices(false);
    setUserForm({
      name: '',
      phone: '',
      email: '',
      password: '',
      role: 'supplier',
      balance: '0',
      discount_percent: '0',
      custom_prices: {},
      notes: '',
    });
    setShowUserModal(true);
  };

  const openEditUser = (u: User) => {
    setEditUser(u);
    const cpStrings: Record<number, string> = {};
    if (u.custom_prices) {
      for (const [k, v] of Object.entries(u.custom_prices)) {
        cpStrings[Number(k)] = String(v);
      }
    }
    setShowCustomPrices(Object.keys(cpStrings).length > 0);
    setUserForm({
      name: u.name,
      phone: u.phone,
      email: u.email,
      password: '',
      role: u.role,
      balance: String(u.balance),
      discount_percent: String(u.discount_percent ?? 0),
      custom_prices: cpStrings,
      notes: u.notes,
    });
    setShowUserModal(true);
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const parsedCustomPrices: Record<number, number> = {};
    for (const [pid, val] of Object.entries(userForm.custom_prices)) {
      if (val.trim() !== '' && !Number.isNaN(Number(val)) && Number(val) >= 0) {
        parsedCustomPrices[Number(pid)] = Number(val);
      }
    }
    try {
      if (editUser) {
        await apiFetch(`/api/users/${editUser.id}`, {
          method: 'PUT',
          body: JSON.stringify({
            name: userForm.name.trim(),
            phone: userForm.phone.trim(),
            role: userForm.role,
            balance: Number(userForm.balance),
            discount_percent: Number(userForm.discount_percent) || 0,
            custom_prices: parsedCustomPrices,
            notes: userForm.notes.trim(),
          }),
        });
        notify('פרטי המשתמש, ההנחה והמחירים המותאמים עודכנו בהצלחה!');
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
            discount_percent: Number(userForm.discount_percent) || 0,
            custom_prices: parsedCustomPrices,
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

  const handleDeleteUser = async (u: User) => {
    if (!window.confirm(`למחוק לצמיתות את "${u.name}"? (היסטוריית ההזמנות תישמר ללא שיוך)`)) return;
    setError('');
    try {
      await apiFetch(`/api/users/${u.id}`, { method: 'DELETE' });
      notify(`המשתמש "${u.name}" נמחק.`);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה במחיקת המשתמש');
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

  const filteredUsers = filterUsersByNameOrPhone(
    userSearch,
    users.filter((u) => (!roleFilter ? true : u.role === roleFilter))
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="font-serif text-3xl font-bold text-slateink-800">הגדרות וניהול משתמשים</h2>
            <span className="px-2.5 py-0.5 rounded-full bg-[#FFF7ED] border border-[#E8D5BE] text-[#8A330B] text-xs font-extrabold tabular-nums">
              גרסה {APP_VERSION}
            </span>
          </div>
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

      {/* סנכרון וגיבוי ענן Supabase (טבלת public.stall_sync) */}
      <div className="bg-white border border-[#E8D5BE] rounded-3xl p-5 shadow-soft space-y-3.5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center shrink-0">
              <Cloud className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-serif text-lg font-bold text-slate-900">
                  סנכרון וגיבוי ענן Supabase
                </h3>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[11px] font-extrabold border ${
                    cloudSyncStatus.state === 'synced'
                      ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                      : cloudSyncStatus.state === 'syncing'
                      ? 'bg-sky-100 text-sky-900 border-sky-300'
                      : 'bg-amber-100 text-amber-900 border-amber-300'
                  }`}
                >
                  {cloudSyncStatus.state === 'synced'
                    ? '☁️ מסונכרן לענן'
                    : cloudSyncStatus.state === 'syncing'
                    ? '🔄 מסנכרן...'
                    : '⚠️ מצב מקומי בלבד'}
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-0.5">
                כל הנתונים (הזמנות, לקוחות, מוצרים, קופה, פחת, הוצאות, ספקים ונקודות שחזור של ימי שישי) מסונכרנים אוטומטית לטבלת <code className="font-bold">public.stall_sync</code>.
              </p>
              <div className="text-[11px] text-slate-500 mt-1 font-mono" dir="ltr">
                URL: {cloudCfg.supabaseUrl || DEFAULT_SUPABASE_URL}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 self-start sm:self-center">
            <button
              type="button"
              disabled={syncingNow}
              onClick={handleManualCloudSyncNow}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs font-extrabold shadow-sm transition-colors"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${syncingNow ? 'animate-spin' : ''}`} />
              <span>{syncingNow ? 'מסנכרן...' : 'סנכרן עכשיו'}</span>
            </button>
            <button
              type="button"
              onClick={() => setShowCloudForm((v) => !v)}
              className="px-3.5 py-2 rounded-xl bg-[#FAF6F0] border border-[#E8D5BE] hover:border-[#C85A17] text-xs font-bold text-[#8A330B]"
            >
              {showCloudForm ? 'הסתר פרטי חיבור' : 'ערוך פרטי חיבור'}
            </button>
          </div>
        </div>

        {/* תצוגת הודעת שגיאה מדויקת מ-Supabase מתחת לכפתור הסנכרון במידה והתרחשה שגיאה */}
        {cloudSyncStatus.lastError && (
          <div className="p-3 rounded-2xl bg-red-50 border border-red-300 text-red-900 text-xs space-y-1">
            <div className="font-extrabold">שגיאת חיבור מ-Supabase:</div>
            <div className="font-mono text-[11px] break-all" dir="ltr">
              {cloudSyncStatus.lastError}
            </div>
          </div>
        )}

        {showCloudForm && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              saveCloudConfig(cloudCfg);
              await handleManualCloudSyncNow();
            }}
            className="pt-3 border-t border-[#E8D5BE] space-y-3"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Supabase URL
                </label>
                <input
                  type="url"
                  dir="ltr"
                  value={cloudCfg.supabaseUrl}
                  onChange={(e) => setCloudCfg({ ...cloudCfg, supabaseUrl: e.target.value })}
                  placeholder={DEFAULT_SUPABASE_URL}
                  className="w-full px-3 py-2 rounded-xl border border-[#E8D5BE] bg-white text-left text-xs font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Supabase Publishable / Anon Key
                </label>
                <input
                  type="text"
                  dir="ltr"
                  value={cloudCfg.supabaseAnonKey}
                  onChange={(e) => setCloudCfg({ ...cloudCfg, supabaseAnonKey: e.target.value })}
                  placeholder={DEFAULT_SUPABASE_ANON_KEY}
                  className="w-full px-3 py-2 rounded-xl border border-[#E8D5BE] bg-white text-left text-xs font-mono"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                כתובת שרת API נוסף (אופציונלי)
              </label>
              <input
                type="url"
                dir="ltr"
                value={cloudCfg.apiUrl}
                onChange={(e) => setCloudCfg({ ...cloudCfg, apiUrl: e.target.value })}
                placeholder="https://your-backend.onrender.com"
                className="w-full px-3 py-2 rounded-xl border border-[#E8D5BE] bg-white text-left text-xs"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-[#C85A17] hover:bg-[#A9440F] text-white text-xs font-extrabold"
              >
                שמור וסנכרן עכשיו
              </button>
              <button
                type="button"
                onClick={() => {
                  clearCloudConfig();
                  const defCfg = getSavedCloudConfig();
                  setCloudCfg(defCfg);
                  notify('פרטי הענן אופסו להגדרות ברירת המחדל של Supabase.');
                }}
                className="px-3.5 py-2 rounded-xl bg-white border border-[#E8D5BE] text-slate-600 text-xs font-bold"
              >
                שחזר ברירת מחדל של Supabase
              </button>
            </div>
          </form>
        )}
      </div>

      {/* כרטיסיית גיבוי ושחזור גרסאות (ימי שישי + קובץ חיצוני) */}
      <BackupRestoreCard
        onAfterRestore={() => {
          setStorefrontCfg(loadStorefrontConfig());
          loadAll();
        }}
      />

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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
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
                <label className="block text-sm font-bold text-slate-700 mb-1.5">שם המנהל לתצוגה</label>
                <input
                  type="text"
                  required
                  value={adminDisplayName}
                  onChange={(e) => setAdminDisplayName(e.target.value)}
                  placeholder="אליאב מנהל"
                  className="w-full px-4 py-2.5 rounded-xl border border-[#E8D5BE] bg-[#FDFBF7] focus:bg-white focus:border-[#C85A17] focus:outline-none font-semibold"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">כתובת העסק</label>
                <input
                  type="text"
                  value={settings.business_address || ''}
                  onChange={(e) => setSettings({ ...settings, business_address: e.target.value })}
                  placeholder="לדוגמה: רחוב הרצל 15, פתח תקווה"
                  className="w-full px-4 py-2.5 rounded-xl border border-[#E8D5BE] bg-[#FDFBF7] focus:bg-white focus:border-[#C85A17] focus:outline-none font-semibold"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">טלפון להזמנות</label>
                <input
                  type="tel"
                  inputMode="tel"
                  dir="ltr"
                  value={settings.order_phone || ''}
                  onChange={(e) => setSettings({ ...settings, order_phone: e.target.value })}
                  placeholder="050-0000000"
                  className="w-full px-4 py-2.5 rounded-xl border border-[#E8D5BE] bg-[#FDFBF7] focus:bg-white focus:border-[#C85A17] focus:outline-none text-left tabular-nums font-bold"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1.5">
                טלפון וואטסאפ של המנהל לקבלת הזמנות לקוחות
              </label>
              <input
                type="tel"
                inputMode="tel"
                dir="ltr"
                required
                value={settings.admin_whatsapp_phone || ''}
                onChange={(e) => setSettings({ ...settings, admin_whatsapp_phone: e.target.value })}
                placeholder="0542452100"
                className="w-56 px-4 py-2.5 rounded-xl border border-[#E8D5BE] bg-[#FDFBF7] focus:bg-white focus:border-[#C85A17] focus:outline-none text-left tabular-nums font-bold"
              />
              <p className="text-xs text-slate-500 mt-1">
                למספר זה נשלחות הודעות הוואטסאפ לאישור הזמנה מהתפריט הציבורי.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">
                  דמי משלוח ברירת מחדל (₪)
                </label>
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.5"
                  dir="ltr"
                  value={settings.default_delivery_fee}
                  onChange={(e) =>
                    setSettings({ ...settings, default_delivery_fee: Math.max(0, Number(e.target.value) || 0) })
                  }
                  className="w-full px-4 py-2.5 rounded-xl border border-[#E8D5BE] bg-[#FDFBF7] focus:bg-white focus:border-[#C85A17] focus:outline-none text-left tabular-nums font-bold"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">
                  משלוח חינם מעל סכום (₪)
                </label>
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="1"
                  dir="ltr"
                  placeholder="0 = ללא סף"
                  value={settings.free_delivery_threshold ?? 0}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      free_delivery_threshold: Math.max(0, Number(e.target.value) || 0),
                    })
                  }
                  className="w-full px-4 py-2.5 rounded-xl border border-[#E8D5BE] bg-[#FDFBF7] focus:bg-white focus:border-[#C85A17] focus:outline-none text-left tabular-nums font-bold"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  אם גדול מ-0, הזמנה מעל סכום זה תקבל משלוח חינם (0 ₪).
                </p>
              </div>
            </div>

            {/* בורר רמת מחירון ברירת מחדל לתפריט הלקוחות */}
            <div className="p-4 rounded-2xl bg-[#FAF6F0] border border-[#E8D5BE] space-y-2.5">
              <label className="block text-sm font-extrabold text-slate-800">
                רמת מחירון ברירת מחדל לתפריט הלקוחות
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {(
                  [
                    ['auto', 'אוטומטי (מחירי מכירה מוקדמת תקפים להזמנות עד יום חמישי בשעה 24:00)'],
                    ['preorder', 'מחיר הזמנה מוקדמת'],
                    ['stall', 'מחיר דוכן רגיל'],
                  ] as Array<[CustomerPriceMode, string]>
                ).map(([modeVal, lbl]) => (
                  <button
                    key={modeVal}
                    type="button"
                    onClick={() => setStorefrontCfg({ ...storefrontCfg, customerPriceMode: modeVal })}
                    className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all ${
                      storefrontCfg.customerPriceMode === modeVal
                        ? 'bg-[#C85A17] text-white border-[#C85A17] shadow-sm'
                        : 'bg-white text-slate-700 border-[#E8D5BE]'
                    }`}
                  >
                    {lbl}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-slate-500">
                לקוחות רואים רק מחירי לקוח וזמינות (במלאי / אזל) — ללא עלויות, ספקים או כמויות מלאי.
              </p>
            </div>

            {/* הגדרות תשלום מהיר ללקוחות (Bit / PayBox) */}
            <div className="p-4 rounded-2xl bg-[#FFFDF9] border border-[#E8D5BE] space-y-3">
              <div className="flex items-center gap-2 text-sm font-extrabold text-slate-800">
                <CreditCard className="w-4 h-4 text-[#C85A17]" />
                <span>הגדרות תשלום מהיר ללקוחות (Bit / PayBox)</span>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  מספר טלפון להעברה ב-Bit / PayBox
                </label>
                <input
                  type="tel"
                  inputMode="tel"
                  dir="ltr"
                  value={storefrontCfg.paymentPhone || ''}
                  onChange={(e) =>
                    setStorefrontCfg({ ...storefrontCfg, paymentPhone: e.target.value })
                  }
                  placeholder="054-2452100"
                  className="w-56 px-3.5 py-2 rounded-xl border border-[#E8D5BE] bg-white focus:border-[#C85A17] focus:outline-none text-left tabular-nums font-bold text-sm"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  מספר זה מוצג ללקוח עם כפתור העתקה במסך אישור ההזמנה ובאזור האישי.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    קישור מותאם ל-Bit (אופציונלי)
                  </label>
                  <input
                    type="url"
                    dir="ltr"
                    value={storefrontCfg.bitLink || ''}
                    onChange={(e) =>
                      setStorefrontCfg({ ...storefrontCfg, bitLink: e.target.value })
                    }
                    placeholder="https://www.bitpay.co.il/app/..."
                    className="w-full px-3 py-2 rounded-xl border border-[#E8D5BE] bg-white focus:border-[#C85A17] focus:outline-none text-left text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    קישור מותאם ל-PayBox (אופציונלי)
                  </label>
                  <input
                    type="url"
                    dir="ltr"
                    value={storefrontCfg.payboxLink || ''}
                    onChange={(e) =>
                      setStorefrontCfg({ ...storefrontCfg, payboxLink: e.target.value })
                    }
                    placeholder="https://payboxapp.page.link/..."
                    className="w-full px-3 py-2 rounded-xl border border-[#E8D5BE] bg-white focus:border-[#C85A17] focus:outline-none text-left text-xs"
                  />
                </div>
              </div>
            </div>

            {/* עורך 2 תבניות הודעות הוואטסאפ */}
            <div className="space-y-4 pt-2 border-t border-[#F3E9DC]">
              <div>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <label className="text-sm font-bold text-slate-700">
                    תבנית 1: שיתוף תפריט/מחירון ללקוחות
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      setStorefrontCfg({
                        ...storefrontCfg,
                        menuShareTemplate: DEFAULT_MENU_SHARE_TEMPLATE,
                      })
                    }
                    className="text-xs font-bold text-[#C85A17] hover:underline"
                  >
                    איפוס לברירת מחדל
                  </button>
                </div>
                <textarea
                  rows={5}
                  value={storefrontCfg.menuShareTemplate}
                  onChange={(e) =>
                    setStorefrontCfg({ ...storefrontCfg, menuShareTemplate: e.target.value })
                  }
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#E8D5BE] bg-[#FDFBF7] focus:bg-white focus:border-[#C85A17] focus:outline-none text-xs leading-relaxed"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  תגיות זמינות: <code className="bg-slate-100 px-1 rounded">{'{שם_עסק}'}</code>{' '}
                  <code className="bg-slate-100 px-1 rounded">{'{פריטים}'}</code>{' '}
                  <code className="bg-slate-100 px-1 rounded">{'{קישור}'}</code>
                </p>
              </div>

              <div>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <label className="text-sm font-bold text-slate-700">
                    תבנית 2: שליחת הזמנה מלקוח אליך (כולל קישורי אישור)
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      setStorefrontCfg({
                        ...storefrontCfg,
                        customerOrderTemplate: DEFAULT_CUSTOMER_ORDER_TEMPLATE,
                      })
                    }
                    className="text-xs font-bold text-[#C85A17] hover:underline"
                  >
                    איפוס לברירת מחדל
                  </button>
                </div>
                <textarea
                  rows={6}
                  value={storefrontCfg.customerOrderTemplate}
                  onChange={(e) =>
                    setStorefrontCfg({ ...storefrontCfg, customerOrderTemplate: e.target.value })
                  }
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#E8D5BE] bg-[#FDFBF7] focus:bg-white focus:border-[#C85A17] focus:outline-none text-xs leading-relaxed"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  תגיות זמינות: <code className="bg-slate-100 px-1 rounded">{'{שם}'}</code>{' '}
                  <code className="bg-slate-100 px-1 rounded">{'{טלפון}'}</code>{' '}
                  <code className="bg-slate-100 px-1 rounded">{'{פריטים}'}</code>{' '}
                  <code className="bg-slate-100 px-1 rounded">{'{סהכ}'}</code>{' '}
                  <code className="bg-slate-100 px-1 rounded">{'{קישור_אישור}'}</code>{' '}
                  <code className="bg-slate-100 px-1 rounded">{'{קישור_צפייה}'}</code>
                </p>
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1.5">
                תבנית חתימה מותאמת להודעות וואטסאפ
              </label>
              <textarea
                rows={3}
                value={settings.whatsapp_footer}
                onChange={(e) => setSettings({ ...settings, whatsapp_footer: e.target.value })}
                placeholder="לדוגמה: לתשלום בפייבוקס: 0542452100 | שבת שלום ומבורכת!"
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
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder="חיפוש שם או 4 ספרות אחרונות..."
                  className="pr-9 pl-3 py-2 rounded-xl border border-[#E8D5BE] bg-white text-xs w-56"
                />
              </div>
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
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#C85A17] hover:bg-[#A9440F] text-white font-bold text-xs shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span>הוספת לקוח / ספק</span>
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
                          title="עריכת פרטים, הנחה ותמחור אישי"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        {u.role !== 'admin' && (
                          <button
                            type="button"
                            onClick={() => handleDeleteUser(u)}
                            className="p-2 rounded-xl text-slate-400 hover:text-red-600 hover:bg-red-50"
                            title="מחק משתמש"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="mt-3 space-y-1 text-xs text-slate-600">
                      {u.phone && (
                        <div className="flex items-center gap-2 tabular-nums">
                          <Phone className="w-3.5 h-3.5 text-slate-400" />
                          <span>{u.phone}</span>
                          <span className="px-1.5 py-0.5 rounded bg-[#FAF6F0] border border-[#E8D5BE] text-[10px] font-extrabold text-[#8A330B]">
                            #{getPhoneLast4(u.phone)}
                          </span>
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <Mail className="w-3.5 h-3.5 text-slate-400" />
                        <span dir="ltr">{u.email}</span>
                      </div>
                      {((u.discount_percent ?? 0) > 0 ||
                        (u.custom_prices && Object.keys(u.custom_prices).length > 0)) && (
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {(u.discount_percent ?? 0) > 0 && (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 text-[11px] font-bold">
                              הנחה קבועה: {u.discount_percent}%
                            </span>
                          )}
                          {u.custom_prices && Object.keys(u.custom_prices).length > 0 && (
                            <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-900 text-[11px] font-bold">
                              {Object.keys(u.custom_prices).length} מחירים אישיים
                            </span>
                          )}
                        </div>
                      )}
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

      {/* חלונית Bottom Sheet יצירה / עריכת משתמש + הנחה קבועה + מחירים מותאמים */}
      <BottomSheet
        open={showUserModal}
        onClose={() => setShowUserModal(false)}
        title={editUser ? `עריכת משתמש — ${editUser.name}` : 'הוספת לקוח / ספק חדש'}
        subtitle="תומך בחיפוש 4 ספרות אחרונות, הנחה קבועה ומחירים מותאמים אישית"
        maxWidthClass="md:max-w-lg"
      >
        <form onSubmit={handleSaveUser} className="space-y-3.5">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">שם מלא / שם עסק</label>
            <input
              type="text"
              required
              value={userForm.name}
              onChange={(e) => setUserForm({ ...userForm, name: e.target.value })}
              className="w-full px-3.5 py-2.5 rounded-xl border border-[#E8D5BE] text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">טלפון נייד</label>
              <input
                type="tel"
                inputMode="tel"
                value={userForm.phone}
                onChange={(e) => setUserForm({ ...userForm, phone: e.target.value })}
                placeholder="050-0001015"
                className="w-full px-3 py-2.5 rounded-xl border border-[#E8D5BE] text-sm tabular-nums"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">הרשאה (תפקיד)</label>
              <select
                value={userForm.role}
                onChange={(e) => setUserForm({ ...userForm, role: e.target.value as UserRole })}
                className="w-full px-3 py-2.5 rounded-xl border border-[#E8D5BE] text-sm"
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
                <label className="block text-xs font-semibold text-slate-600 mb-1">אימייל (אופציונלי)</label>
                <input
                  type="email"
                  dir="ltr"
                  value={userForm.email}
                  onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                  placeholder="נוצר אוטומטית אם ריק"
                  className="w-full px-3 py-2.5 rounded-xl border border-[#E8D5BE] text-sm text-left"
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
                  className="w-full px-3 py-2.5 rounded-xl border border-[#E8D5BE] text-sm"
                />
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                יתרת חוב/זכות (מינוס=חוב)
              </label>
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                dir="ltr"
                value={userForm.balance}
                onChange={(e) => setUserForm({ ...userForm, balance: e.target.value })}
                className="w-full px-3 py-2.5 rounded-xl border border-[#E8D5BE] text-left tabular-nums font-bold"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                אחוז הנחה קבוע (%)
              </label>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                max="100"
                step="0.5"
                dir="ltr"
                value={userForm.discount_percent}
                onChange={(e) => setUserForm({ ...userForm, discount_percent: e.target.value })}
                className="w-full px-3 py-2.5 rounded-xl border border-[#E8D5BE] text-left tabular-nums font-bold"
              />
            </div>
          </div>

          {/* מחירים מותאמים אישית למוצרים */}
          {userForm.role !== 'admin' && (
            <div className="rounded-2xl border border-[#E8D5BE] bg-[#FAF6F0] p-3 space-y-2.5">
              <button
                type="button"
                onClick={() => setShowCustomPrices((v) => !v)}
                className="w-full flex items-center justify-between text-xs font-bold text-[#8A330B]"
              >
                <span className="inline-flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5" />
                  <span>מחירים מותאמים אישית למוצרים (אופציונלי)</span>
                </span>
                <span>{showCustomPrices ? 'הסתר' : 'פתח עריכה'}</span>
              </button>
              {showCustomPrices && (
                <div className="max-h-44 overflow-y-auto divide-y divide-[#E8D5BE]/60 bg-white rounded-xl border border-[#E8D5BE] px-2.5">
                  {products.map((p) => (
                    <div key={p.id} className="py-2 flex items-center justify-between gap-2 text-xs">
                      <span className="font-semibold text-slate-800 truncate">{p.name}</span>
                      <input
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        min="0"
                        dir="ltr"
                        placeholder={
                          userForm.role === 'supplier'
                            ? p.supplier_price.toFixed(2)
                            : p.preorder_price.toFixed(2)
                        }
                        value={userForm.custom_prices[p.id] ?? ''}
                        onChange={(e) =>
                          setUserForm((prev) => ({
                            ...prev,
                            custom_prices: { ...prev.custom_prices, [p.id]: e.target.value },
                          }))
                        }
                        className="w-20 px-2 py-1 rounded-lg border border-[#E8D5BE] text-left tabular-nums font-bold"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">הערות</label>
            <input
              type="text"
              value={userForm.notes}
              onChange={(e) => setUserForm({ ...userForm, notes: e.target.value })}
              className="w-full px-3 py-2.5 rounded-xl border border-[#E8D5BE] text-sm"
            />
          </div>
          <button
            type="submit"
            className="w-full min-h-[48px] rounded-xl bg-[#C85A17] hover:bg-[#A9440F] text-white font-bold text-sm"
          >
            שמור
          </button>
        </form>
      </BottomSheet>

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
                  inputMode="decimal"
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
                  {(['transfer', 'paybox', 'cash'] as const).map((pm) => (
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
