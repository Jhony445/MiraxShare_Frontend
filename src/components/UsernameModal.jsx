import { useEffect, useState } from 'react';
import { useI18n } from '../lib/i18n.jsx';

function UsernameModal({ open, onSave }) {
  const { t } = useI18n();
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const inputId = 'mx-username';

  useEffect(() => {
    if (open) {
      setValue('');
      setError('');
    }
  }, [open]);

  if (!open) return null;

  const handleSubmit = (event) => {
    event.preventDefault();
    const result = onSave(value);
    if (!result?.ok) {
      setError(t('user.errorRequired'));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/72 px-4 backdrop-blur-md">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="mx-username-title"
        className="mx-panel mx-panel-accent w-full max-w-lg px-6 py-6 md:px-7"
      >
        <div className="mx-kicker">{t('user.kicker')}</div>
        <div id="mx-username-title" className="mt-4 font-display text-3xl tracking-[-0.04em] text-white">
          {t('user.title')}
        </div>
        <p className="mt-3 text-sm leading-7 text-white/68">{t('user.subtitle')}</p>
        <form onSubmit={handleSubmit} className="mt-5 space-y-3">
          <label htmlFor={inputId} className="mx-field-label">
            {t('user.fieldLabel')}
          </label>
          <input
            id={inputId}
            autoFocus
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder={t('user.placeholder')}
            className="mx-input px-4 py-3 text-sm"
          />
          {error && (
            <div className="mx-inline-alert" data-tone="error">
              {error}
            </div>
          )}
          <button type="submit" className="mx-btn-primary w-full rounded-2xl px-4 py-3">
            {t('user.save')}
          </button>
          <div className="text-xs leading-6 text-white/45">{t('user.note')}</div>
        </form>
      </div>
    </div>
  );
}

export default UsernameModal;
