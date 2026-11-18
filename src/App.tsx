import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AuthScreen } from './components/AuthScreen';
import { Layout, type AdminTab } from './components/Layout';
import { AdminDashboard } from './pages/AdminDashboard';
import { CustomerOrdersPage } from './pages/CustomerOrdersPage';
import { SupplierOrdersPage } from './pages/SupplierOrdersPage';
import { CharityOrdersPage } from './pages/CharityOrdersPage';
import { ProductsCatalog } from './pages/ProductsCatalog';
import { FinancePage } from './pages/FinancePage';
import { ReportsPage } from './pages/ReportsPage';
import { SettingsPage } from './pages/SettingsPage';
import { SupplierPortal } from './pages/SupplierPortal';
import { CustomerPortal } from './pages/CustomerPortal';

function AppRouter() {
  const { user, loading } = useAuth();
  const [adminTab, setAdminTab] = useState<AdminTab>('dashboard');

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FAF6F0] flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-[#C85A17] border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="mt-3 text-sm font-bold text-slate-600">טוען את המטבח התימני...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <AuthScreen />;
  }

  return (
    <Layout activeTab={adminTab} onSelectTab={setAdminTab}>
      {user.role === 'admin' ? (
        <>
          {adminTab === 'dashboard' && <AdminDashboard onNavigate={setAdminTab} />}
          {adminTab === 'customer-orders' && <CustomerOrdersPage />}
          {adminTab === 'supplier-orders' && <SupplierOrdersPage />}
          {adminTab === 'charity-orders' && <CharityOrdersPage />}
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
      <AppRouter />
    </AuthProvider>
  );
}
