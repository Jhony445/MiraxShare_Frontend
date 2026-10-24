import { useState } from 'react';
import { useI18n } from '../lib/i18n.jsx';

// Mounted only while open, so each opening starts from initialValue.
function UsernameModal({ initialValue = '', onSave, onCancel }) {
  const { t } = useI18n();
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState('');

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
          {onCancel ? t('user.change') : t('user.title')}
        </h2>
        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <input
            autoFocus
            aria-labelledby="mx-username-title"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => event.key === 'Escape' && onCancel?.()}
            placeholder={t('user.placeholder')}
          />
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          <div className="flex gap-2">
            {onCancel ? (
              <button type="button" onClick={onCancel} className="mx-btn-secondary flex-1">
                {t('user.cancel')}
              </button>
            ) : null}
            <button type="submit" className="mx-btn-primary flex-1">
              {t('user.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default UsernameModal;
