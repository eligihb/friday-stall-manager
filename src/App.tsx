import React, { useState, useEffect, useCallback } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { FridayProvider } from './context/FridayContext';
import { PublicStorefront } from './pages/PublicStorefront';
import { AuthScreen } from './components/AuthScreen';
import { Layout, type AdminTab } from './components/Layout';
import { AdminDashboard } from './pages/AdminDashboard';
import { CustomerOrdersPage } from './pages/CustomerOrdersPage';
import { SupplierOrdersPage } from './pages/SupplierOrdersPage';
import { CharityOrdersPage } from './pages/CharityOrdersPage';
import { UsersPage } from './pages/UsersPage';
import { ProductsCatalog } from './pages/ProductsCatalog';
import { FinancePage } from './pages/FinancePage';
import { ReportsPage } from './pages/ReportsPage';
import { SettingsPage } from './pages/SettingsPage';
import { SupplierPortal } from './pages/SupplierPortal';
import { CustomerPortal } from './pages/CustomerPortal';
import { CustomerLivePortal } from './pages/CustomerLivePortal';
import { QuickApproveView } from './pages/QuickApproveView';
import { APP_BRAND_NAME } from './lib/version';

const VALID_TABS: AdminTab[] = [
  'dashboard',
  'customer-orders',
  'supplier-orders',
  'charity-orders',
  'users',
  'products',
  'finance',
  'reports',
  'settings',
];

function parseSpecialRoute(): {
  customerPortalId: number | null;
  quickApproveOrderId: number | null;
  directOrderId: number | null;
} {
  const hashClean = window.location.hash.replace(/^#\/?/, '');
  const searchParams = new URLSearchParams(window.location.search);

  const queryCustomer = searchParams.get('customer');
  if (queryCustomer && /^\d+$/.test(queryCustomer)) {
    return { customerPortalId: Number(queryCustomer), quickApproveOrderId: null, directOrderId: null };
  }

  const cMatch = hashClean.match(/^c\/(\d+)/);
  if (cMatch) {
    return { customerPortalId: Number(cMatch[1]), quickApproveOrderId: null, directOrderId: null };
  }

  const approveMatch = hashClean.match(/^approve-quick\/(\d+)/);
  if (approveMatch) {
    return { customerPortalId: null, quickApproveOrderId: Number(approveMatch[1]), directOrderId: null };
  }

  const orderMatch = hashClean.match(/^order\/(\d+)/);
  if (orderMatch) {
    return { customerPortalId: null, quickApproveOrderId: null, directOrderId: Number(orderMatch[1]) };
  }

  return { customerPortalId: null, quickApproveOrderId: null, directOrderId: null };
}

function getTabFromHash(): AdminTab {
  const clean = window.location.hash.replace(/^#\/?/, '') as AdminTab;
  if (clean.startsWith('order/')) return 'customer-orders';
  return VALID_TABS.includes(clean) ? clean : 'dashboard';
}

function isLoginHash(): boolean {
  const clean = window.location.hash.replace(/^#\/?/, '');
  return clean === 'login';
}

function AppRouter() {
  const { user, loading } = useAuth();
  const [adminTab, setAdminTabState] = useState<AdminTab>(() => getTabFromHash());
  const [showStaffLogin, setShowStaffLogin] = useState<boolean>(() => isLoginHash());
  const [specialRoute, setSpecialRoute] = useState(() => parseSpecialRoute());

  const setAdminTab = useCallback((tab: AdminTab) => {
    setAdminTabState(tab);
    const targetHash = `#/${tab}`;
    if (window.location.hash !== targetHash) {
      window.location.hash = targetHash;
    }
  }, []);

  const openStaffLogin = useCallback(() => {
    setShowStaffLogin(true);
    window.location.hash = '#/login';
  }, []);

  const closeStaffLogin = useCallback(() => {
    setShowStaffLogin(false);
    window.location.hash = '';
  }, []);

  useEffect(() => {
    const onHashChange = () => {
      setAdminTabState(getTabFromHash());
      setShowStaffLogin(isLoginHash());
      setSpecialRoute(parseSpecialRoute());
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  // אישור מיידי מהיר ללא טעינת מסכי הניהול
  if (specialRoute.quickApproveOrderId !== null) {
    return <QuickApproveView orderId={specialRoute.quickApproveOrderId} />;
  }

  // אזור אישי חי ללקוח ללא סיסמה (#/c/:id או ?customer=:id)
  if (specialRoute.customerPortalId !== null) {
    return <CustomerLivePortal customerId={specialRoute.customerPortalId} />;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FAF6F0] flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-[#C85A17] border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="mt-3 text-sm font-bold text-slate-600">טוען את {APP_BRAND_NAME}...</p>
        </div>
      </div>
    );
  }

  // נתיב ברירת המחדל (/) נפתח ישירות לתפריט הלקוחות ללא צורך בהתחברות או הרשמה!
  if (!user) {
    if (showStaffLogin) {
      return <AuthScreen onBackToStorefront={closeStaffLogin} />;
    }
    return <PublicStorefront onOpenStaffLogin={openStaffLogin} />;
  }

  return (
    <Layout activeTab={adminTab} onSelectTab={setAdminTab}>
      {user.role === 'admin' ? (
        <>
          {adminTab === 'dashboard' && <AdminDashboard onNavigate={setAdminTab} />}
          {adminTab === 'customer-orders' && <CustomerOrdersPage />}
          {adminTab === 'supplier-orders' && <SupplierOrdersPage />}
          {adminTab === 'charity-orders' && <CharityOrdersPage />}
          {adminTab === 'users' && <UsersPage />}
          {adminTab === 'products' && <ProductsCatalog />}
          {adminTab === 'finance' && <FinancePage />}
          {adminTab === 'reports' && <ReportsPage />}
          {adminTab === 'settings' && <SettingsPage />}
        </>
      ) : user.role === 'supplier' ? (
        <SupplierPortal />
      ) : (
        <CustomerPortal />
      )}
    </Layout>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <FridayProvider>
        <AppRouter />
      </FridayProvider>
    </AuthProvider>
  );
}
