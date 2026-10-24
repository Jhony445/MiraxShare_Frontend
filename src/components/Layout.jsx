import { Link } from 'react-router-dom';
import { useI18n } from '../lib/i18n.jsx';

const langs = ['en', 'es'];

function Layout({ title, children }) {
  const { lang, setLang } = useI18n();

  return (
    <div className="min-h-screen">
      <header className="border-b border-black/20 bg-surface-800">
        <div className="mx-auto flex h-12 max-w-5xl items-center justify-between px-4">
          <Link to="/" className="font-semibold text-fg-strong">
            MiraxShare
          </Link>
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
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">
        {title ? <h1 className="mb-4 text-xl font-semibold text-fg-strong">{title}</h1> : null}
        {children}
      </main>
    </div>
  );
}

export default Layout;
