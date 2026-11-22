import React, { useState } from 'react';
import { Flame, Lock, Mail, Phone, User as UserIcon, ShieldCheck, Store, ShoppingBag, ArrowLeft, ArrowRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { APP_BRAND_NAME, APP_VERSION } from '../lib/version';
import type { UserRole } from '../types';

interface AuthScreenProps {
  onBackToStorefront?: () => void;
}

export function AuthScreen({ onBackToStorefront }: AuthScreenProps) {
  const { login, signup } = useAuth();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Exclude<UserRole, 'admin'>>('supplier');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      if (mode === 'login') {
        await login(email, password);
      } else {
        await signup({ name, phone, email, password, role });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'אירעה שגיאה');
    } finally {
      setSubmitting(false);
    }
  };

  const quickLogin = async (demoEmail: string) => {
    setError('');
    setSubmitting(true);
    try {
      await login(demoEmail, '123456');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בכניסה מהירה');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF6F0] flex flex-col lg:flex-row">
      {/* צד מיתוג נקי */}
      <div className="lg:w-[40%] bg-[#231A14] text-cream-50 p-8 lg:p-14 flex flex-col justify-between">
        <div>
          <div className="inline-flex items-center gap-2.5 bg-white/10 border border-white/15 px-3.5 py-1.5 rounded-full mb-8">
            <Flame className="w-4 h-4 text-amber-400" />
            <span className="text-xs font-semibold text-amber-100">ניהול דוכן שישי</span>
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-white/10 text-amber-200 tabular-nums">
              {APP_VERSION}
            </span>
          </div>

          <h1 className="font-serif text-4xl font-bold tracking-tight text-white mb-3">
            {APP_BRAND_NAME}
          </h1>
          <p className="text-stone-300 text-sm lg:text-base leading-relaxed max-w-sm">
            כניסת צוות וספקים — ניהול הזמנות, מחירון, רכש מאפייה וכספים.
          </p>
          {onBackToStorefront && (
            <button
              type="button"
              onClick={onBackToStorefront}
              className="mt-6 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-amber-200 text-sm font-bold border border-white/15 transition-colors"
            >
              <ArrowRight className="w-4 h-4" />
              <span>חזרה לתפריט הלקוחות</span>
            </button>
          )}
        </div>
      </div>

      {/* צד טופס */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-3xl shadow-card border border-[#E8D5BE]/70 p-6 sm:p-8">
            <div className="flex bg-[#FAF6F0] p-1.5 rounded-2xl mb-6 border border-[#E8D5BE]/60">
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setError('');
                }}
                className={`flex-1 py-2.5 text-sm font-semibold rounded-xl transition-all ${
                  mode === 'login'
                    ? 'bg-[#C85A17] text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                כניסה למערכת
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('signup');
                  setError('');
                }}
                className={`flex-1 py-2.5 text-sm font-semibold rounded-xl transition-all ${
                  mode === 'signup'
                    ? 'bg-[#C85A17] text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                הרשמה חדשה
              </button>
            </div>

            {error && (
              <div className="mb-5 p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm font-medium">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === 'signup' && (
                <>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">שם מלא / שם עסק</label>
                    <div className="relative">
                      <UserIcon className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        required
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="לדוגמה: מעדניית השוק"
                        className="w-full pr-10 pl-4 py-2.5 rounded-xl border border-[#E8D5BE] bg-[#FDFBF7] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#C85A17]/30 focus:border-[#C85A17]"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">טלפון</label>
                    <div className="relative">
                      <Phone className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="tel"
                        inputMode="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="050-0000000"
                        className="w-full pr-10 pl-4 py-2.5 rounded-xl border border-[#E8D5BE] bg-[#FDFBF7] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#C85A17]/30 focus:border-[#C85A17] tabular-nums"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">סוג חשבון</label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setRole('supplier')}
                        className={`flex items-center justify-center gap-2 p-3 rounded-xl border text-sm font-semibold transition-all ${
                          role === 'supplier'
                            ? 'border-[#C85A17] bg-[#FFF7ED] text-[#8A330B]'
                            : 'border-[#E8D5BE] bg-white text-slate-600 hover:bg-[#FAF6F0]'
                        }`}
                      >
                        <Store className="w-4 h-4" />
                        ספק סיטונאי
                      </button>
                      <button
                        type="button"
                        onClick={() => setRole('customer')}
                        className={`flex items-center justify-center gap-2 p-3 rounded-xl border text-sm font-semibold transition-all ${
                          role === 'customer'
                            ? 'border-[#C85A17] bg-[#FFF7ED] text-[#8A330B]'
                            : 'border-[#E8D5BE] bg-white text-slate-600 hover:bg-[#FAF6F0]'
                        }`}
                      >
                        <ShoppingBag className="w-4 h-4" />
                        לקוח פרטי
                      </button>
                    </div>
                  </div>
                </>
              )}

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">אימייל</label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    dir="ltr"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@example.com"
                    className="w-full pr-10 pl-4 py-2.5 rounded-xl border border-[#E8D5BE] bg-[#FDFBF7] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#C85A17]/30 focus:border-[#C85A17] text-left"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">סיסמה</label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••"
                    className="w-full pr-10 pl-4 py-2.5 rounded-xl border border-[#E8D5BE] bg-[#FDFBF7] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#C85A17]/30 focus:border-[#C85A17]"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3 px-4 rounded-xl bg-[#C85A17] hover:bg-[#A9440F] disabled:opacity-60 text-white font-bold text-base shadow-sm transition-colors flex items-center justify-center gap-2"
              >
                <span>{submitting ? 'מתחבר...' : mode === 'login' ? 'כניסה' : 'יצירת חשבון'}</span>
                <ArrowLeft className="w-4 h-4" />
              </button>
            </form>

            {/* כניסה מהירה לחשבונות מנהל וספק */}
            <div className="mt-7 pt-6 border-t border-[#F3E9DC]">
              <p className="text-xs font-semibold text-slate-500 mb-3 text-center">
                כניסה מהירה למנהל או ספק (סיסמה: 123456)
              </p>
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => quickLogin('admin@teimani.co.il')}
                  className="min-h-[48px] flex flex-col items-center justify-center gap-1 p-2.5 rounded-xl border border-[#E8D5BE] bg-[#FDFBF7] hover:border-[#C85A17] hover:bg-[#FFF7ED] transition-colors"
                >
                  <ShieldCheck className="w-4 h-4 text-[#C85A17]" />
                  <span className="text-xs font-bold text-slate-800">מנהל</span>
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => quickLogin('supplier@teimani.co.il')}
                  className="min-h-[48px] flex flex-col items-center justify-center gap-1 p-2.5 rounded-xl border border-[#E8D5BE] bg-[#FDFBF7] hover:border-[#C85A17] hover:bg-[#FFF7ED] transition-colors"
                >
                  <Store className="w-4 h-4 text-amber-700" />
                  <span className="text-xs font-bold text-slate-800">ספק</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
