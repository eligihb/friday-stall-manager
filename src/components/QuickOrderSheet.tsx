import React, { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';
import { useFriday } from '../context/FridayContext';
import { BottomSheet } from './BottomSheet';
import { WhatsAppOrderParser } from './WhatsAppOrderParser';
import type { AdminProduct, User } from '../types';

interface QuickOrderSheetProps {
  open: boolean;
  onClose: () => void;
}

export function QuickOrderSheet({ open, onClose }: QuickOrderSheetProps) {
  const { fridayDate, triggerRefresh } = useFriday();
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);

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
      title="קליטה מהירה — וואטסאפ או ידני"
      subtitle={`הזמנה חדשה לשישי (${fridayDate})`}
      maxWidthClass="md:max-w-3xl"
    >
      {loading ? (
        <div className="py-10 text-center text-sm text-slate-400">טוען מוצרים ולקוחות...</div>
      ) : (
        <WhatsAppOrderParser
          fridayDate={fridayDate}
          products={products}
          users={users}
          compact
          onOrderCreated={async () => {
            triggerRefresh();
            setTimeout(onClose, 500);
          }}
        />
      )}
    </BottomSheet>
  );
}
