import { Link } from 'react-router-dom';
import Layout from '../components/Layout.jsx';
import { useI18n } from '../lib/i18n.jsx';
import { WINDOWS_DOWNLOAD_URL } from '../lib/config.js';

const tile = 'block rounded-lg px-4 py-5 text-center font-medium transition-colors';

function Landing() {
  const { t } = useI18n();
  const isElectronRuntime =
    typeof window !== 'undefined' &&
    Boolean(window.electronAPI?.isElectron || navigator.userAgent.includes('Electron'));

  return (
    <Layout>
      <div className="mx-auto max-w-xl space-y-8 pt-6">
        <section>
          <h2 className="mx-label">{t('landing.join')}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Link to="/join" className={`${tile} bg-accent text-white hover:bg-accent-hover`}>
              {t('nav.join')}
            </Link>
            <Link to="/audio/join" className={`${tile} bg-accent text-white hover:bg-accent-hover`}>
              {t('nav.audioJoin')}
            </Link>
          </div>
        </section>

        <section>
          <h2 className="mx-label">{t('landing.create')}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Link to="/host" className={`${tile} bg-surface-800 text-fg-strong hover:bg-surface-600`}>
              {t('nav.host')}
            </Link>
            <Link to="/audio/host" className={`${tile} bg-surface-800 text-fg-strong hover:bg-surface-600`}>
              {t('nav.audioHost')}
            </Link>
          </div>
        </section>

        {!isElectronRuntime && (
          <a
            href={WINDOWS_DOWNLOAD_URL}
            download="MiraxShare-Setup.exe"
            className="block text-center text-sm text-fg-muted transition-colors hover:text-fg-strong"
          >
            {t('landing.ctaWindows')}
          </a>
        )}
      </div>
    </Layout>
  );
}

export default Landing;
