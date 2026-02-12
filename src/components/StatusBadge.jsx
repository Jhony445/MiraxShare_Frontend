const styles = {
  ok: 'border-brand-200 bg-brand-50 text-brand-800',
  info: 'border-sky-200 bg-sky-50 text-sky-700',
  warn: 'border-mint-200 bg-mint-50 text-mint-700',
  error: 'border-rose-200 bg-rose-50 text-rose-700',
  neutral: 'border-slate-200 bg-white/80 text-slate-600',
};

function StatusBadge({ label, tone = 'neutral' }) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-semibold tracking-[0.06em] uppercase ${
        styles[tone] || styles.neutral
      }`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}

export default StatusBadge;
