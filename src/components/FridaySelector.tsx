import React from 'react';
import { Calendar } from 'lucide-react';
import { formatFridayLabel, getFridaysRange, getNextFridayISO } from '../lib/format';

interface FridaySelectorProps {
  value: string;
  onChange: (fridayIso: string) => void;
  label?: string;
  allowAll?: boolean;
}

export function FridaySelector({
  value,
  onChange,
  label = 'יום שישי:',
  allowAll = false,
}: FridaySelectorProps) {
  const nextFri = getNextFridayISO();
  const fridays = getFridaysRange(3, 6);
  const options = value && !fridays.includes(value) ? [value, ...fridays] : fridays;

  return (
    <div className="inline-flex items-center gap-2 bg-white border border-[#E8D5BE] rounded-xl px-3 py-2 shadow-sm">
      <Calendar className="w-4 h-4 text-[#C85A17] shrink-0" />
      <span className="text-xs font-semibold text-slate-500 hidden sm:inline">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="text-sm font-bold text-slate-800 bg-transparent focus:outline-none cursor-pointer"
      >
        {allowAll && <option value="">כל התאריכים</option>}
        {options.map((f) => (
          <option key={f} value={f}>
            {formatFridayLabel(f)}
            {f === nextFri ? ' (הקרוב)' : ''}
          </option>
        ))}
      </select>
    </div>
  );
}
