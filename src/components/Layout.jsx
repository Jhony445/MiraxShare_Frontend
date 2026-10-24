import { Link } from 'react-router-dom';
import { useI18n } from '../lib/i18n.jsx';
import { useUsername } from '../lib/userProfile.js';
import UsernameModal from './UsernameModal.jsx';

const langs = ['en', 'es'];

function Layout({ title, requireName = false, children }) {
  const { lang, setLang, t } = useI18n();
  const { username, editing, persistUsername, editUsername, cancelEdit } = useUsername();

  return (
    <div className="min-h-screen">
      {editing || (requireName && !username) ? (
        <UsernameModal
          initialValue={editing ? username : ''}
          onSave={persistUsername}
          onCancel={editing ? cancelEdit : undefined}
        />
      ) : null}
      <header className="border-b border-black/20 bg-surface-800">
        <div className="mx-auto flex h-12 max-w-5xl items-center justify-between gap-3 px-4">
          <Link to="/" className="font-semibold text-fg-strong">
            MiraxShare
          </Link>
          <div className="flex items-center gap-3">
            {username ? (
              <button
                type="button"
                onClick={editUsername}
                title={t('user.change')}
                className="flex min-w-0 items-center gap-1.5 rounded px-2 py-1 text-sm text-fg transition-colors hover:bg-surface-600"
              >
                <span className="max-w-[10rem] truncate">{username}</span>
                <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5 shrink-0 text-fg-muted">
                  <path d="M13.6 2.6a2 2 0 0 1 2.8 2.8l-9 9-3.9 1.1 1.1-3.9 9-9Z" />
                </svg>
              </button>
            ) : null}
            <div className="flex gap-1 text-xs font-medium">
              {langs.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setLang(item)}
                  className={`rounded px-2 py-1 transition-colors ${
                    lang === item ? 'bg-surface-500 text-fg-strong' : 'text-fg-muted hover:text-fg-strong'
                  }`}
                >
                  {item.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">
        {title ? <h1 className="mb-4 text-xl font-semibold text-fg-strong">{title}</h1> : null}
        {children}
      </main>
    </div>
  );
}

export default Layout;
