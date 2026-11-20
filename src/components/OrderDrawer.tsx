import React, { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';
import { useFriday } from '../context/FridayContext';
import { BottomSheet } from './BottomSheet';
import { WhatsAppOrderParser } from './WhatsAppOrderParser';
import type { AdminProduct, User } from '../types';

interface OrderDrawerProps {
  open: boolean;
  onClose: () => void;
}

export function OrderDrawer({ open, onClose }: OrderDrawerProps) {
  const { fridayDate, triggerRefresh } = useFriday();
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'regular' | 'quick'>('regular');

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    Promise.all([
      apiFetch<{ products: AdminProduct[] }>('/api/products'),
      apiFetch<{ users: User[] }>('/api/users'),
    ])
      .then(([pRes, uRes]) => {
        if (!active) return;
        setProducts(pRes.products);
        setUsers(uRes.users);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [open]);

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="הוסף הזמנה"
      subtitle={`הזמנה חדשה לשישי (${fridayDate})`}
      maxWidthClass="md:max-w-md"
    >
      {/* טאבים: הזמנה רגילה | הזמנה מהירה (וואטסאפ) */}
      <div className="flex border-b border-[#E8D5BE] mb-4">
        <button
          type="button"
          onClick={() => setActiveTab('regular')}
          className={`flex-1 py-2 text-sm font-bold text-center transition-colors ${
            activeTab === 'regular'
              ? 'text-[#C85A17] border-b-2 border-[#C85A17]'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          הזמנה רגילה
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('quick')}
          className={`flex-1 py-2 text-sm font-bold text-center transition-colors ${
            activeTab === 'quick'
              ? 'text-[#C85A17] border-b-2 border-[#C85A17]'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          הזמנה מהירה (וואטסאפ)
        </button>
      </div>

      {loading ? (
        <div className="py-10 text-center text-sm text-slate-400">טוען מוצרים ולקוחות...</div>
      ) : (
        <WhatsAppOrderParser
          fridayDate={fridayDate}
          products={products}
          users={users}
          compact
          mode={activeTab}
          onUserCreated={(newUser) => setUsers((prev) => [...prev, newUser])}
          onOrderCreated={async () => {
            triggerRefresh();
            setTimeout(onClose, 500);
          }}
        />
      )}
    </BottomSheet>
  );
}
