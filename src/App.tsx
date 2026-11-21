import React, { useState, useEffect, useCallback } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { FridayProvider } from './context/FridayContext';
import { ContactDrawerProvider } from './context/ContactDrawerContext';
import { ContactDrawer } from './components/ContactDrawer';
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
import { DigitalMenuPage } from './pages/DigitalMenuPage';
import { FlyerPage } from './pages/FlyerPage';
import { APP_BRAND_NAME } from './lib/version';
import { apiFetch } from './lib/api';
import { decodeOrderLinkPayload, persistImportedOrderBackup } from './lib/orderLinkCodec';

const VALID_TABS: AdminTab[] = [
  'dashboard',
  'customer-orders',
  'supplier-orders',
  'charity-orders',
  'users',
  'products',
  'flyer',
  'finance',
  'reports',
  'settings',
];

function parseSpecialRoute(): {
  customerPortalId: number | null;
  quickApproveOrderId: number | null;
  directOrderId: number | null;
  encodedOrderData: string | null;
  isDigitalMenu: boolean;
} {
  const rawHash = window.location.hash.replace(/^#\/?/, '');
  const [hashPath, hashQuery] = rawHash.split('?');
  const hashParams = new URLSearchParams(hashQuery || '');
  const searchParams = new URLSearchParams(window.location.search);
  const encodedOrderData = hashParams.get('d') || searchParams.get('d') || null;

  if (hashPath === 'menu' || hashPath === 'order') {
    return {
      customerPortalId: null,
      quickApproveOrderId: null,
      directOrderId: null,
      encodedOrderData: null,
      isDigitalMenu: true,
    };
  }

  const queryCustomer = searchParams.get('customer');
  if (queryCustomer && /^\d+$/.test(queryCustomer)) {
    return {
      customerPortalId: Number(queryCustomer),
      quickApproveOrderId: null,
      directOrderId: null,
      encodedOrderData: null,
      isDigitalMenu: false,
    };
  }

  const cMatch = hashPath.match(/^c\/(\d+)/);
  if (cMatch) {
    return {
      customerPortalId: Number(cMatch[1]),
      quickApproveOrderId: null,
      directOrderId: null,
      encodedOrderData: null,
      isDigitalMenu: false,
    };
  }

  const approveMatch = hashPath.match(/^approve-quick\/(\d+)/);
  if (approveMatch) {
    return {
      customerPortalId: null,
      quickApproveOrderId: Number(approveMatch[1]),
      directOrderId: null,
      encodedOrderData,
      isDigitalMenu: false,
    };
  }

  const orderMatch = hashPath.match(/^order\/(\d+)/);
  if (orderMatch) {
    return {
      customerPortalId: null,
      quickApproveOrderId: null,
      directOrderId: Number(orderMatch[1]),
      encodedOrderData,
      isDigitalMenu: false,
    };
  }

  return {
    customerPortalId: null,
    quickApproveOrderId: null,
    directOrderId: null,
    encodedOrderData: null,
    isDigitalMenu: false,
  };
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

  // ייבוא אוטומטי של הזמנה מקישור #/order/:id?d=... למאגר המנהל אם אינה קיימת במכשיר
  useEffect(() => {
    if (specialRoute.directOrderId !== null && specialRoute.encodedOrderData) {
      const decoded = decodeOrderLinkPayload(specialRoute.encodedOrderData);
      if (decoded) {
        persistImportedOrderBackup(decoded, 'awaiting_approval');
        apiFetch('/api/public/import-order', {
          method: 'POST',
          body: JSON.stringify({
            id: decoded.id || specialRoute.directOrderId,
            recipient_name: decoded.n,
            phone: decoded.p,
            friday_date: decoded.f,
            total_amount: decoded.t,
            notes: decoded.nt || '',
            items: decoded.i,
            status: 'awaiting_approval',
          }),
        }).catch(() => {});
      }
    }
  }, [specialRoute.directOrderId, specialRoute.encodedOrderData]);

  // עמוד תפריט לקוחות דיגיטלי מעוצב ללא סיסמה (#/menu ו-#/order)
  if (specialRoute.isDigitalMenu) {
    return <DigitalMenuPage />;
  }

  // אישור מיידי מהיר ללא טעינת מסכי הניהול
  if (specialRoute.quickApproveOrderId !== null) {
    return (
      <QuickApproveView
        orderId={specialRoute.quickApproveOrderId}
        encodedData={specialRoute.encodedOrderData}
      />
    );
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
          {adminTab === 'flyer' && <FlyerPage />}
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
        <ContactDrawerProvider>
          <AppRouter />
          <ContactDrawer />
        </ContactDrawerProvider>
      </FridayProvider>
    </AuthProvider>
  );
}
