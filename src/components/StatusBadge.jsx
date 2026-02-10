const styles = {
  ok: 'border-mint-200 bg-mint-100 text-mint-700',
  info: 'border-brand-200 bg-brand-100 text-brand-700',
  warn: 'border-amber-200 bg-amber-100 text-amber-700',
  error: 'border-rose-200 bg-rose-100 text-rose-700',
  neutral: 'border-slate-200 bg-slate-100 text-slate-600',
};

function StatusBadge({ label, tone = 'neutral' }) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${
        styles[tone] || styles.neutral
      }`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {label}
    </span>
  );
}

export default StatusBadge;
