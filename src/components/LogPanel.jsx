import { useState } from 'react';
import { useLog } from '../lib/logger.js';
import { useI18n } from '../lib/i18n.jsx';

function LogPanel({ title }) {
  const [open, setOpen] = useState(false);
  const logs = useLog(open);
  const { t } = useI18n();
  const resolvedTitle = title || t('logPanel.title');

  return (
    <div className="mx-panel px-5 py-5 md:px-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="mx-field-label">{t('logPanel.kicker')}</div>
          <div className="mt-2 font-display text-xl tracking-[-0.03em] text-white">{resolvedTitle}</div>
        </div>
        <button
          type="button"
          className="mx-btn-ghost px-4 py-2 text-xs"
          onClick={() => setOpen((prev) => !prev)}
        >
          {open ? t('logPanel.hide') : t('logPanel.show')}
        </button>
      </div>
      {open && (
        <div className="mt-4 max-h-72 space-y-3 overflow-auto text-xs text-white/62">
          {logs.length === 0 ? (
            <div className="mx-empty">
              {t('logPanel.empty')}
            </div>
          ) : (
            logs.map((entry) => (
              <div key={entry.id} className="mx-log-entry">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/42">{entry.label}</span>
                  <span className="text-[11px] text-white/28">{entry.time}</span>
                </div>
                {entry.detail && <div className="mt-2 text-sm leading-6 text-white/62">{entry.detail}</div>}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default LogPanel;
