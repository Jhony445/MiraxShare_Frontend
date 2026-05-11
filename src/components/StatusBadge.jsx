const styles = {
  ok: {
    className: 'border-brand-400/42 bg-brand-500/22 text-brand-50',
    dotClass: 'bg-brand-300 shadow-[0_0_0_4px_rgba(20,184,166,0.18)]',
  },
  info: {
    className: 'border-sky-400/42 bg-sky-500/22 text-sky-50',
    dotClass: 'bg-sky-300 shadow-[0_0_0_4px_rgba(56,189,248,0.18)]',
  },
  warn: {
    className: 'border-copper-400/42 bg-copper-500/22 text-copper-50',
    dotClass: 'bg-copper-300 shadow-[0_0_0_4px_rgba(207,109,32,0.18)]',
  },
  error: {
    className: 'border-rose-400/42 bg-rose-500/22 text-rose-50',
    dotClass: 'bg-rose-300 shadow-[0_0_0_4px_rgba(251,113,133,0.18)]',
  },
  neutral: {
    className: 'border-white/14 bg-white/[0.08] text-white/82',
    dotClass: 'bg-white/45 shadow-[0_0_0_4px_rgba(255,255,255,0.08)]',
  },
};

function StatusBadge({ label, tone = 'neutral' }) {
  const style = styles[tone] || styles.neutral;

  return (
    <span className={`mx-status-badge ${style.className}`}>
      <span aria-hidden="true" className={`mx-status-glyph ${style.dotClass}`} />
      {label}
    </span>
  );
}

export default StatusBadge;
