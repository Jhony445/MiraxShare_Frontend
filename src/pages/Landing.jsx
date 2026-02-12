import { Link } from 'react-router-dom';
import Layout from '../components/Layout.jsx';
import { useI18n } from '../lib/i18n.jsx';
import { WINDOWS_DOWNLOAD_URL } from '../lib/config.js';

function Landing() {
  const { t } = useI18n();
  const isElectronRuntime =
    typeof window !== 'undefined' &&
    Boolean(window.electronAPI?.isElectron || navigator.userAgent.includes('Electron'));

  return (
    <Layout>
      <section className="grid gap-7 lg:grid-cols-[1.1fr_0.9fr]">
        <article className="mx-card flex flex-col gap-6 px-6 py-7 md:px-8 md:py-9">
          <div className="mx-kicker">{t('landing.badge')}</div>
          <div>
            <h1 className="font-display text-4xl leading-tight text-slate-900 md:text-5xl">
              {t('landing.title')}
            </h1>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-slate-600">{t('landing.desc')}</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Link to="/host" className="mx-btn-primary py-3 text-center">
              {t('landing.ctaHost')}
            </Link>
            <Link to="/join" className="mx-btn-secondary py-3 text-center">
              {t('landing.ctaJoin')}
            </Link>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Link
              to="/audio/host"
              className="rounded-2xl border border-brand-100 bg-brand-50/65 px-4 py-4 text-sm font-semibold text-brand-800 transition hover:border-brand-200"
            >
              {t('landing.ctaAudioHost')}
            </Link>
            <Link
              to="/audio/join"
              className="rounded-2xl border border-mint-100 bg-mint-50/70 px-4 py-4 text-sm font-semibold text-mint-800 transition hover:border-mint-200"
            >
              {t('landing.ctaAudioJoin')}
            </Link>
          </div>

          {!isElectronRuntime && (
            <div className="rounded-2xl border border-brand-100 bg-brand-50/70 px-4 py-3">
              <a
                href={WINDOWS_DOWNLOAD_URL}
                download="MiraxShare-Setup.exe"
                className="mx-btn-primary px-5 py-2"
              >
                {t('landing.ctaWindows')}
              </a>
              <div className="mt-2 text-xs text-slate-600">{t('landing.ctaWindowsHint')}</div>
            </div>
          )}

          <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 px-4 py-3 text-xs text-slate-500">
            {t('landing.browserNote')}
          </div>
        </article>

        <aside className="mx-card px-6 py-7 md:px-8 md:py-9">
          <h2 className="font-display text-2xl text-slate-900">{t('landing.howTitle')}</h2>
          <div className="mt-5 space-y-4">
            {[
              {
                title: t('landing.step1Title'),
                detail: t('landing.step1Detail'),
              },
              {
                title: t('landing.step2Title'),
                detail: t('landing.step2Detail'),
              },
              {
                title: t('landing.step3Title'),
                detail: t('landing.step3Detail'),
              },
            ].map((step, index) => (
              <div key={step.title} className="flex gap-3 rounded-2xl border border-slate-200/80 bg-white/70 p-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
                  0{index + 1}
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-800">
                    {step.title}
                  </div>
                  <div className="text-xs text-slate-500">{step.detail}</div>
                </div>
              </div>
            ))}
          </div>
        </aside>
      </section>

      <section className="mt-8 grid gap-4 md:grid-cols-3">
        {[
          {
            title: t('landing.card1Title'),
            detail: t('landing.card1Detail'),
          },
          {
            title: t('landing.card2Title'),
            detail: t('landing.card2Detail'),
          },
          {
            title: t('landing.card3Title'),
            detail: t('landing.card3Detail'),
          },
        ].map((item) => (
          <div key={item.title} className="mx-card px-5 py-4">
            <div className="text-sm font-semibold text-slate-800">{item.title}</div>
            <div className="mt-2 text-xs text-slate-500">{item.detail}</div>
          </div>
        ))}
      </section>
    </Layout>
  );
}

export default Landing;
