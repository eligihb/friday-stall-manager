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
      {/* צד מיתוג חם */}
      <div className="lg:w-[44%] bg-gradient-to-br from-[#1E242B] via-[#2A1F1A] to-[#6D280B] text-cream-50 p-8 lg:p-14 flex flex-col justify-between relative overflow-hidden">
        <div className="absolute -left-24 -bottom-24 w-80 h-80 rounded-full bg-[#C85A17]/20 blur-3xl pointer-events-none" />
        <div className="absolute -right-16 top-16 w-56 h-56 rounded-full bg-[#D97706]/15 blur-3xl pointer-events-none" />

        <div className="relative z-10">
          <div className="inline-flex items-center gap-3 bg-white/10 backdrop-blur-sm border border-white/15 px-4 py-2 rounded-full mb-8">
            <Flame className="w-5 h-5 text-amber-400" />
            <span className="text-sm font-medium text-amber-100">דוכן שישי ושיווק סיטונאי</span>
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-200 tabular-nums">
              {APP_VERSION}
            </span>
          </div>

          <h1 className="font-serif text-4xl lg:text-5xl font-bold tracking-tight text-white mb-4">
            {APP_BRAND_NAME}
          </h1>
          <p className="text-cream-200/90 text-base lg:text-lg leading-relaxed max-w-md">
            כניסת צוות ניהול וספקים סיטונאיים — ניהול מחירון, אישור הזמנות שישי, סיכום רכש מהמאפייה, תזרים כספי ופורטל ספקים.
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

        <div className="relative z-10 mt-10 pt-8 border-t border-white/10 grid grid-cols-3 gap-4 text-center">
          <div className="bg-white/5 rounded-2xl p-3 border border-white/10">
            <div className="text-amber-400 font-bold text-xl tabular-nums">15+</div>
            <div className="text-xs text-cream-200/80 mt-1">מאפים ותוספות</div>
          </div>
          <div className="bg-white/5 rounded-2xl p-3 border border-white/10">
            <div className="text-amber-400 font-bold text-xl tabular-nums">4</div>
            <div className="text-xs text-cream-200/80 mt-1">מדרגות תמחור</div>
          </div>
          <div className="bg-white/5 rounded-2xl p-3 border border-white/10">
            <div className="text-amber-400 font-bold text-xl tabular-nums">RBAC</div>
            <div className="text-xs text-cream-200/80 mt-1">מנהל · ספק · לקוח</div>
          </div>
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
