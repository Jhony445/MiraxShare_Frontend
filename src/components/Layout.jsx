import { Link, NavLink } from 'react-router-dom';
import { useI18n } from '../lib/i18n.jsx';

const navItems = ['host', 'join', 'audioHost', 'audioJoin'];

const navLinkClass = ({ isActive }) => `mx-nav-link block ${isActive ? 'mx-nav-link-active' : ''}`;

function Layout({ children }) {
  const { lang, setLang, t } = useI18n();
  const setEnglish = () => setLang('en');
  const setSpanish = () => setLang('es');

  return (
    <div className="mx-shell">
      <header className="mx-container pt-4 md:pt-6">
        <div className="mx-panel px-5 py-5 md:px-7 md:py-6">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <Link to="/" className="flex items-center gap-4">
                <div className="mx-brand-mark">MX</div>
                <div>
                  <div className="font-display text-2xl tracking-[-0.05em] text-white">MiraxShare</div>
                  <div className="mt-1 text-xs font-bold uppercase tracking-[0.16em] text-white/45">
                    {t('nav.tagline')}
                  </div>
                </div>
              </Link>
              <div className="mx-kicker">{t('nav.badge')}</div>
            </div>

            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <p className="max-w-md text-sm leading-7 text-white/62">{t('nav.description')}</p>
              <div className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.04] p-1 text-xs font-semibold text-white/70">
                <button
                  type="button"
                  onClick={setEnglish}
                  className={`rounded-full px-3 py-1.5 transition ${
                    lang === 'en' ? 'bg-white text-black' : 'text-white/70 hover:text-white'
                  }`}
                >
                  EN
                </button>
                <button
                  type="button"
                  onClick={setSpanish}
                  className={`rounded-full px-3 py-1.5 transition ${
                    lang === 'es' ? 'bg-white text-black' : 'text-white/70 hover:text-white'
                  }`}
                >
                  ES
                </button>
              </div>
            </div>
          </div>

          <div className="mt-6 grid gap-3 lg:grid-cols-[1fr_auto] lg:items-end">
            <nav className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {navItems.map((item) => {
                const path = item === 'audioHost' ? '/audio/host' : item === 'audioJoin' ? '/audio/join' : `/${item}`;

                return (
                  <NavLink key={item} to={path} className={navLinkClass}>
                    {({ isActive }) => (
                      <div className="space-y-1">
                        <div className={`text-sm font-bold ${isActive ? 'text-white' : 'text-white/86'}`}>{t(`nav.${item}`)}</div>
                        <div className="text-xs leading-5 text-white/45">{t(`nav.${item}Hint`)}</div>
                      </div>
                    )}
                  </NavLink>
                );
              })}
            </nav>
            <div className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-white/60">
              {t('nav.language')}: {lang.toUpperCase()}
            </div>
          </div>
        </div>
      </header>
      <main className="mx-container pb-16 pt-6 md:pt-8">{children}</main>
    </div>
  );
}

export default Layout;
