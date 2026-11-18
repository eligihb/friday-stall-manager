import React from 'react';
import { AlertTriangle, RefreshCw, RotateCcw } from 'lucide-react';
import { APP_VERSION } from '../lib/version';

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error?.message || 'שגיאת ריצה בלתי צפויה',
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('[ErrorBoundary] Caught error:', error, info);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleResetLocalAndReload = () => {
    try {
      localStorage.removeItem('ht_static_db_v1');
      localStorage.removeItem('ht_static_session_uid');
    } catch {}
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div
        dir="rtl"
        className="min-h-screen bg-[#FAF6F0] text-[#1E242B] flex items-center justify-center p-5"
      >
        <div className="max-w-md w-full bg-white rounded-3xl border border-[#E8D5BE] shadow-card p-6 sm:p-8 text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center mx-auto">
            <AlertTriangle className="w-7 h-7" />
          </div>

          <h1 className="font-serif text-2xl font-bold text-slate-900">
            אופס! אירעה שגיאה בטעינת המסך
          </h1>
          <p className="text-sm text-slate-600 leading-relaxed">
            המערכת זיהתה תקלה זמנית ומנעה מסך לבן. ניתן לרענן את הדף או לאפס את הנתונים המקומיים בדפדפן.
          </p>

          {this.state.errorMessage && (
            <div
              dir="ltr"
              className="text-xs text-left bg-[#FAF6F0] border border-[#E8D5BE] rounded-xl p-3 text-red-700 font-mono break-words"
            >
              {this.state.errorMessage}
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-2.5 pt-2">
            <button
              type="button"
              onClick={this.handleReload}
              className="flex-1 min-h-[46px] px-4 rounded-xl bg-[#C85A17] hover:bg-[#A9440F] text-white font-bold text-sm flex items-center justify-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              <span>רענן דף</span>
            </button>
            <button
              type="button"
              onClick={this.handleResetLocalAndReload}
              className="flex-1 min-h-[46px] px-4 rounded-xl bg-white border border-[#E8D5BE] hover:bg-[#FAF6F0] text-slate-700 font-bold text-sm flex items-center justify-center gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              <span>איפוס מקומי ורענון</span>
            </button>
          </div>

          <div className="text-[11px] text-slate-400 font-semibold tabular-nums pt-1">
            המטבח התימני · גרסה {APP_VERSION}
          </div>
        </div>
      </div>
    );
  }
}
