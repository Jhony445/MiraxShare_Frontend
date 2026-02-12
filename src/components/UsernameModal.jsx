import { useEffect, useState } from 'react';
import { useI18n } from '../lib/i18n.jsx';

function UsernameModal({ open, onSave }) {
  const { t } = useI18n();
  const [value, setValue] = useState('');
  const [error, setError] = useState('');

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 px-4 backdrop-blur-sm">
      <div className="mx-card w-full max-w-md px-6 py-6">
        <div className="mx-kicker">Session Identity</div>
        <div className="mt-3 font-display text-2xl text-slate-900">{t('user.title')}</div>
        <p className="mt-2 text-sm text-slate-600">{t('user.subtitle')}</p>
        <form onSubmit={handleSubmit} className="mt-5 space-y-3">
          <input
            autoFocus
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder={t('user.placeholder')}
            className="w-full px-4 py-3 text-sm"
          />
          {error && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              {error}
            </div>
          )}
          <button
            type="submit"
            className="mx-btn-primary w-full rounded-xl px-4 py-3"
          >
            {t('user.save')}
          </button>
          <div className="text-xs text-slate-500">{t('user.note')}</div>
        </form>
      </div>
    </div>
  );
}

export default UsernameModal;
