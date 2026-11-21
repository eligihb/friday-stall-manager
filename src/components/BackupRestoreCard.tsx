import React, { useEffect, useRef, useState } from 'react';
import {
  History,
  Download,
  Upload,
  RotateCcw,
  PlusCircle,
  CheckCircle2,
  AlertTriangle,
  Trash2,
  ShieldCheck,
  X,
} from 'lucide-react';
import {
  MAX_WEEKLY_SNAPSHOTS,
  createBackupSnapshot,
  deleteBackupSnapshot,
  downloadExternalBackupFile,
  ensureWeeklyFridayBackup,
  loadBackupSnapshots,
  parseExternalBackupFile,
  restoreFromExternalSnapshot,
  restoreFromSnapshotId,
  type BackupSnapshot,
} from '../lib/backupManager';

interface BackupRestoreCardProps {
  onAfterRestore?: () => void;
}

export function BackupRestoreCard({ onAfterRestore }: BackupRestoreCardProps) {
  const [snapshots, setSnapshots] = useState<BackupSnapshot[]>(() => loadBackupSnapshots());
  const [toast, setToast] = useState('');
  const [error, setError] = useState('');

  // מודאל אישור שחזור מנקודת גיבוי שמורה או מקובץ חיצוני
  const [confirmTarget, setConfirmTarget] = useState<{
    mode: 'snapshot' | 'file';
    snapshot: BackupSnapshot;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const updated = ensureWeeklyFridayBackup();
    setSnapshots(updated);
  }, []);

  const notify = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3200);
  };

  const handleCreateManualSnapshot = () => {
    setError('');
    const { all } = createBackupSnapshot('גיבוי ידני יזום', 'manual');
    setSnapshots(all);
    notify('נקודת גיבוי ידנית נשמרה בהצלחה ✓');
  };

  const handleDeleteSnapshot = (id: string) => {
    const next = deleteBackupSnapshot(id);
    setSnapshots(next);
    notify('נקודת הגיבוי הוסרה');
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    try {
      const text = await file.text();
      const parsedSnap = parseExternalBackupFile(text);
      setConfirmTarget({ mode: 'file', snapshot: parsedSnap });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בקריאת קובץ הגיבוי');
    }
  };

  const handleExecuteRestore = () => {
    if (!confirmTarget) return;
    setError('');
    try {
      if (confirmTarget.mode === 'snapshot') {
        restoreFromSnapshotId(confirmTarget.snapshot.id);
      } else {
        restoreFromExternalSnapshot(confirmTarget.snapshot);
      }
      setSnapshots(loadBackupSnapshots());
      setConfirmTarget(null);
      notify('הנתונים שוחזרו בהצלחה! (נשמר גיבוי אוטומטי של המצב הקודם)');
      if (onAfterRestore) {
        onAfterRestore();
      } else {
        setTimeout(() => window.location.reload(), 600);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בשחזור הנתונים');
      setConfirmTarget(null);
    }
  };

  const getKindBadge = (kind: BackupSnapshot['kind']) => {
    if (kind === 'auto_friday') {
      return {
        label: 'גיבוי שישי אוטומטי',
        cls: 'bg-amber-100 text-[#8A330B] border-amber-300',
      };
    }
    if (kind === 'pre_restore') {
      return {
        label: 'גיבוי בטיחות לפני שחזור',
        cls: 'bg-sky-100 text-sky-900 border-sky-300',
      };
    }
    return {
      label: 'גיבוי ידני',
      cls: 'bg-emerald-100 text-emerald-900 border-emerald-300',
    };
  };

  return (
    <div className="bg-white rounded-3xl border border-[#E8D5BE] shadow-soft p-5 sm:p-6 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-2xl bg-[#FFF7ED] border border-[#E8D5BE] text-[#C85A17] flex items-center justify-center shrink-0">
            <History className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-serif text-xl font-bold text-slate-900">
              גיבוי ושחזור גרסאות (ימי שישי)
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              המערכת שומרת אוטומטית עד {MAX_WEEKLY_SNAPSHOTS} גרסאות שבועיות של ימי שישי (הזמנות, לקוחות, מוצרים, קופה, פחת, הוצאות, ספקים והגדרות).
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleCreateManualSnapshot}
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#C85A17] hover:bg-[#A9440F] text-white font-extrabold text-xs shadow-sm shrink-0"
        >
          <PlusCircle className="w-4 h-4" />
          <span>צור נקודת גיבוי ידנית עכשיו</span>
        </button>
      </div>

      {toast && (
        <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-extrabold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{toast}</span>
        </div>
      )}
      {error && (
        <div className="p-3 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-xs font-bold">
          {error}
        </div>
      )}

      {/* כפתורי גיבוי ושחזור חיצוני לקובץ במכשיר (2 כפתורים בשורה) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
        <button
          type="button"
          onClick={() => {
            downloadExternalBackupFile();
            notify('קובץ הגיבוי הורד למכשיר בהצלחה ✓');
          }}
          className="py-2.5 px-4 rounded-xl bg-[#2B1B12] hover:bg-[#3d281c] text-amber-50 font-extrabold text-xs flex items-center justify-center gap-2 shadow-sm transition-colors"
        >
          <Download className="w-4 h-4 text-amber-300 shrink-0" />
          <span>⬇️ הורד קובץ גיבוי למכשיר</span>
        </button>

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="py-2.5 px-4 rounded-xl bg-[#FAF6F0] hover:bg-[#F3E9DC] border border-[#E8D5BE] text-[#8A330B] font-extrabold text-xs flex items-center justify-center gap-2 transition-colors"
        >
          <Upload className="w-4 h-4 text-[#C85A17] shrink-0" />
          <span>⬆️ שחזר מקובץ גיבוי</span>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          onChange={handleFileChange}
          className="hidden"
        />
      </div>

      {/* רשימת נקודות השחזור השמורות (עד 12 אחרונות) */}
      <div className="space-y-2 pt-2 border-t border-[#F3E9DC]">
        <div className="flex items-center justify-between text-xs font-extrabold text-slate-700">
          <span>נקודות שחזור שמורות במכשיר ({snapshots.length} מתוך {MAX_WEEKLY_SNAPSHOTS})</span>
          <span className="text-[11px] font-semibold text-slate-400">
            לפני כל שחזור נשמר גיבוי בטיחות אוטומטי
          </span>
        </div>

        {snapshots.length === 0 ? (
          <div className="py-6 text-center text-xs text-slate-400 bg-[#FAF6F0] rounded-2xl border border-[#E8D5BE]">
            אין עדיין נקודות שחזור שמורות. לחץ על ״צור נקודת גיבוי ידנית עכשיו״ ליצירת גיבוי ראשון.
          </div>
        ) : (
          <div className="space-y-2 max-h-80 overflow-y-auto pr-0.5">
            {snapshots.map((snap) => {
              const badge = getKindBadge(snap.kind);
              return (
                <div
                  key={snap.id}
                  className="p-3 rounded-2xl bg-[#FAF6F0] border border-[#E8D5BE] flex flex-wrap items-center justify-between gap-2.5"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-extrabold text-xs sm:text-sm text-slate-900">
                        {snap.label}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold border ${badge.cls}`}
                      >
                        {badge.label}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-600 font-semibold tabular-nums flex items-center gap-2 flex-wrap">
                      <span dir="ltr">{snap.displayDate}</span>
                      <span>·</span>
                      <span className="font-extrabold text-[#8A330B]">
                        {snap.summary.ordersCount} הזמנות | {snap.summary.customersCount} לקוחות
                      </span>
                      {snap.summary.suppliersCount > 0 && (
                        <span>| {snap.summary.suppliersCount} ספקים</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => setConfirmTarget({ mode: 'snapshot', snapshot: snap })}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white hover:bg-[#FFF7ED] border border-[#C85A17] text-[#C85A17] text-xs font-extrabold shadow-xs transition-colors"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>שחזר גרסה זו</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteSnapshot(snap.id)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50"
                      title="מחק נקודת גיבוי זו"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* מודאל אישור שחזור מובנה עם הגנת בטיחות אוטומטית */}
      {confirmTarget && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setConfirmTarget(null)}
        >
          <div
            className="max-w-md w-full bg-white rounded-3xl border border-[#E8D5BE] shadow-card p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-2 pb-2 border-b border-[#F3E9DC]">
              <div className="flex items-center gap-2 text-amber-900">
                <AlertTriangle className="w-5 h-5 text-[#C85A17] shrink-0" />
                <h3 className="font-serif text-lg font-extrabold">
                  {confirmTarget.mode === 'file'
                    ? 'אישור שחזור נתונים מקובץ גיבוי'
                    : 'אישור שחזור לגרסה שמורה'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setConfirmTarget(null)}
                className="w-8 h-8 rounded-xl bg-[#FAF6F0] flex items-center justify-center text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3.5 rounded-2xl bg-[#FAF6F0] border border-[#E8D5BE] space-y-1 text-xs">
              <div className="font-extrabold text-slate-900">{confirmTarget.snapshot.label}</div>
              <div className="text-slate-600 tabular-nums">
                תאריך גיבוי: <strong dir="ltr">{confirmTarget.snapshot.displayDate}</strong>
              </div>
              <div className="font-extrabold text-[#8A330B] pt-0.5">
                כולל: {confirmTarget.snapshot.summary.ordersCount} הזמנות |{' '}
                {confirmTarget.snapshot.summary.customersCount} לקוחות |{' '}
                {confirmTarget.snapshot.summary.productsCount} מוצרים
              </div>
            </div>

            <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
              <span>
                <strong>הגנת בטיחות אוטומטית:</strong> לפני השחזור, המערכת תשמור אוטומטית נקודת גיבוי של המצב הנוכחי (״גיבוי אוטומטי לפני שחזור״) כך שתמיד תוכל לחזור אחורה.
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => setConfirmTarget(null)}
                className="py-2.5 rounded-xl border border-[#E8D5BE] bg-[#FAF6F0] text-slate-700 font-bold text-xs"
              >
                ביטול
              </button>
              <button
                type="button"
                onClick={handleExecuteRestore}
                className="py-2.5 rounded-xl bg-[#C85A17] hover:bg-[#A9440F] text-white font-extrabold text-xs shadow-sm"
              >
                אשר ושחזר גרסה זו
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
