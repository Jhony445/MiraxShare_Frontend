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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="mx-username-title"
        className="w-full max-w-sm rounded-lg bg-surface-700 p-5 shadow-xl"
      >
        <h2 id="mx-username-title" className="text-lg font-semibold text-fg-strong">
          {t('user.title')}
        </h2>
        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <input
            autoFocus
            aria-labelledby="mx-username-title"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder={t('user.placeholder')}
          />
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          <button type="submit" className="mx-btn-primary w-full">
            {t('user.save')}
          </button>
        </form>
      </div>
    </div>
  );
}

export default UsernameModal;
