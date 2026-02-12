import { Link, NavLink } from 'react-router-dom';
import { useI18n } from '../lib/i18n.jsx';

const navLinkClass = ({ isActive }) =>
  `rounded-full px-4 py-2 text-sm font-semibold transition ${
    isActive
      ? 'bg-brand-600 text-white shadow-soft'
      : 'text-slate-700 hover:bg-white/90 hover:text-slate-900'
  }`;

function Layout({ children }) {
  const { lang, setLang, t } = useI18n();
  const setEnglish = () => setLang('en');
  const setSpanish = () => setLang('es');

  return (
    <div className="min-h-screen">
      <header className="mx-container pt-6 md:pt-8">
        <div className="mx-card px-5 py-5 md:px-7">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <Link to="/" className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-base font-bold text-white shadow-soft">
                MX
              </div>
              <div>
                <div className="font-display text-xl leading-none text-slate-900">MiraxShare</div>
                <div className="mt-1 text-xs tracking-[0.1em] text-slate-500 uppercase">
                  {t('nav.tagline')}
                </div>
              </div>
            </Link>

            <div className="flex flex-wrap items-center gap-3">
              <div className="mx-kicker">Web Studio</div>
              <div className="flex items-center rounded-full border border-slate-200 bg-white/80 p-1 text-xs font-semibold text-slate-600">
                <button
                  type="button"
                  onClick={setEnglish}
                  className={`rounded-full px-3 py-1 transition ${
                    lang === 'en' ? 'bg-brand-600 text-white' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  EN
                </button>
                <button
                  type="button"
                  onClick={setSpanish}
                  className={`rounded-full px-3 py-1 transition ${
                    lang === 'es' ? 'bg-brand-600 text-white' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  ES
                </button>
              </div>
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
            <nav className="flex flex-wrap items-center gap-2">
              <NavLink to="/host" className={navLinkClass}>
                {t('nav.host')}
              </NavLink>
              <NavLink to="/join" className={navLinkClass}>
                {t('nav.join')}
              </NavLink>
              <NavLink to="/audio/host" className={navLinkClass}>
                {t('nav.audioHost')}
              </NavLink>
              <NavLink to="/audio/join" className={navLinkClass}>
                {t('nav.audioJoin')}
              </NavLink>
            </nav>
            <div className="rounded-full border border-slate-200 bg-white/70 px-3 py-1 text-xs text-slate-600">
              {t('nav.language')}: {lang.toUpperCase()}
            </div>
          </div>
        </div>
      </header>
      <main className="mx-container pb-16 pt-7 md:pt-8">{children}</main>
    </div>
  );
}

export default Layout;
