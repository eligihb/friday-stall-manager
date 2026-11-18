import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AuthScreen } from './components/AuthScreen';
import { Layout, type AdminTab } from './components/Layout';
import { AdminDashboard } from './pages/AdminDashboard';
import { ProductsCatalog } from './pages/ProductsCatalog';
import { AdminOrders } from './pages/AdminOrders';
import { FridayInventory } from './pages/FridayInventory';
import { FinancePage } from './pages/FinancePage';
import { UsersPage } from './pages/UsersPage';
import { SupplierPortal } from './pages/SupplierPortal';
import { CustomerPortal } from './pages/CustomerPortal';

function AppRouter() {
  const { user, loading } = useAuth();
  const [adminTab, setAdminTab] = useState<AdminTab>('products');

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
          {adminTab === 'products' && <ProductsCatalog />}
          {adminTab === 'orders' && <AdminOrders />}
          {adminTab === 'inventory' && <FridayInventory />}
          {adminTab === 'finance' && <FinancePage />}
          {adminTab === 'users' && <UsersPage />}
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
