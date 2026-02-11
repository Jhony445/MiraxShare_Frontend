import { Link } from 'react-router-dom';
import Layout from '../components/Layout.jsx';
import { useI18n } from '../lib/i18n.jsx';
import { WINDOWS_DOWNLOAD_URL } from '../lib/config.js';

function Landing() {
  const { t } = useI18n();

  return (
    <Layout>
      <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="mx-card flex flex-col gap-6 px-6 py-8 md:px-8">
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-brand-100 bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">
            {t('landing.badge')}
          </div>
          <div>
            <h1 className="font-display text-3xl text-slate-900 md:text-4xl">
              {t('landing.title')}
            </h1>
            <p className="mt-3 text-base text-slate-600">
              {t('landing.desc')}
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              to="/host"
              className="rounded-full bg-brand-600 px-5 py-3 text-center text-sm font-semibold text-white shadow-soft transition hover:bg-brand-700"
            >
              {t('landing.ctaHost')}
            </Link>
            <Link
              to="/join"
              className="rounded-full border border-slate-200 bg-white/80 px-5 py-3 text-center text-sm font-semibold text-slate-700 transition hover:border-brand-200 hover:text-brand-700"
            >
              {t('landing.ctaJoin')}
            </Link>
          </div>
          <div className="rounded-2xl border border-brand-100 bg-brand-50/70 px-4 py-3">
            <a
              href={WINDOWS_DOWNLOAD_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center rounded-full bg-mint-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-mint-700"
            >
              {t('landing.ctaWindows')}
            </a>
            <div className="mt-2 text-xs text-slate-600">{t('landing.ctaWindowsHint')}</div>
          </div>
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 px-4 py-3 text-xs text-slate-500">
            {t('landing.browserNote')}
          </div>
        </section>

        <section className="mx-card px-6 py-8 md:px-8">
          <h2 className="font-display text-lg text-slate-900">{t('landing.howTitle')}</h2>
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
              <div key={step.title} className="flex gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-mint-100 text-xs font-semibold text-mint-700">
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
        </section>
      </div>

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
            <div className="text-sm font-semibold text-slate-800">
              {item.title}
            </div>
            <div className="mt-2 text-xs text-slate-500">{item.detail}</div>
          </div>
        ))}
      </section>
    </Layout>
  );
}

export default Landing;
