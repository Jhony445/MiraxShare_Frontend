import { useState } from 'react';
import { useLog } from '../lib/logger.js';
import { useI18n } from '../lib/i18n.jsx';

function LogPanel({ title }) {
  const [open, setOpen] = useState(false);
  const logs = useLog();
  const { t } = useI18n();
  const resolvedTitle = title || t('logPanel.title');

  return (
    <div className="mx-card px-5 py-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-slate-800">{resolvedTitle}</div>
        <button
          type="button"
          className="rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-xs font-semibold text-brand-700 transition hover:border-brand-200 hover:text-brand-800"
          onClick={() => setOpen((prev) => !prev)}
        >
          {open ? t('logPanel.hide') : t('logPanel.show')}
        </button>
      </div>
      {open && (
        <div className="mt-3 max-h-64 space-y-2 overflow-auto text-xs text-slate-600">
          {logs.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-white/60 px-3 py-3 text-slate-500">
              {t('logPanel.empty')}
            </div>
          ) : (
            logs.map((entry) => (
              <div key={entry.id} className="rounded-xl border border-slate-200/70 bg-white/75 px-3 py-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold tracking-[0.04em] text-slate-700 uppercase">{entry.label}</span>
                  <span className="text-[11px] text-slate-400">{entry.time}</span>
                </div>
                {entry.detail && <div className="mt-1 text-slate-500">{entry.detail}</div>}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default LogPanel;
