import { Link } from 'react-router-dom';
import Layout from '../components/Layout.jsx';
import { MetricStrip, PageHero, PanelCard } from '../components/StudioPrimitives.jsx';
import { useI18n } from '../lib/i18n.jsx';
import { WINDOWS_DOWNLOAD_URL } from '../lib/config.js';

function Landing() {
  const { t } = useI18n();
  const isElectronRuntime =
    typeof window !== 'undefined' &&
    Boolean(window.electronAPI?.isElectron || navigator.userAgent.includes('Electron'));

  const modeCards = [
    {
      badge: t('nav.host'),
      title: t('landing.modeScreenHostTitle'),
      detail: t('landing.modeScreenHostDetail'),
      action: t('landing.ctaHost'),
      to: '/host',
      tone: 'brand',
    },
    {
      badge: t('nav.join'),
      title: t('landing.modeScreenJoinTitle'),
      detail: t('landing.modeScreenJoinDetail'),
      action: t('landing.ctaJoin'),
      to: '/join',
      tone: 'neutral',
    },
    {
      badge: t('nav.audioHost'),
      title: t('landing.modeAudioHostTitle'),
      detail: t('landing.modeAudioHostDetail'),
      action: t('landing.ctaAudioHost'),
      to: '/audio/host',
      tone: 'neutral',
    },
    {
      badge: t('nav.audioJoin'),
      title: t('landing.modeAudioJoinTitle'),
      detail: t('landing.modeAudioJoinDetail'),
      action: t('landing.ctaAudioJoin'),
      to: '/audio/join',
      tone: 'copper',
    },
  ];

  const benefits = [
    {
      title: t('landing.card1Title'),
      detail: t('landing.card1Detail'),
      tone: 'border-brand-500/20 bg-brand-500/10',
    },
    {
      title: t('landing.card2Title'),
      detail: t('landing.card2Detail'),
      tone: 'border-white/10 bg-white/[0.04]',
    },
    {
      title: t('landing.card3Title'),
      detail: t('landing.card3Detail'),
      tone: 'border-copper-500/20 bg-copper-500/10',
    },
  ];

  const steps = [
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
  ];

  return (
    <Layout>
      <PageHero
        eyebrow={t('landing.badge')}
        title={t('landing.title')}
        description={t('landing.desc')}
        actions={
          <>
            <Link to="/host" className="mx-btn-primary">
              {t('landing.ctaHost')}
            </Link>
            <Link to="/join" className="mx-btn-secondary">
              {t('landing.ctaJoin')}
            </Link>
          </>
        }
      >
        <MetricStrip
          items={[
            {
              label: t('landing.stat1Label'),
              value: t('landing.stat1Value'),
              detail: t('landing.stat1Detail'),
              tone: 'brand',
            },
            {
              label: t('landing.stat2Label'),
              value: t('landing.stat2Value'),
              detail: t('landing.stat2Detail'),
              tone: 'neutral',
            },
            {
              label: t('landing.stat3Label'),
              value: t('landing.stat3Value'),
              detail: t('landing.stat3Detail'),
              tone: 'copper',
            },
          ]}
          className="lg:grid-cols-3 xl:grid-cols-3"
        />
      </PageHero>

      <section className="mt-6 grid gap-6 xl:grid-cols-[1.18fr_0.82fr]">
        <PanelCard title={t('landing.modeTitle')} description={t('landing.modeDesc')}>
          <div className="grid gap-4 md:grid-cols-2">
            {modeCards.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={`group rounded-[26px] border p-5 transition duration-200 hover:-translate-y-1 hover:shadow-panel ${
                  item.tone === 'brand'
                    ? 'border-brand-500/18 bg-brand-500/10'
                    : item.tone === 'copper'
                      ? 'border-copper-500/18 bg-copper-500/10'
                      : 'border-white/10 bg-white/[0.04]'
                }`}
              >
                <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/45">{item.badge}</div>
                <div className="mt-4 font-display text-2xl tracking-[-0.04em] text-white">{item.title}</div>
                <p className="mt-3 text-sm leading-7 text-white/64">{item.detail}</p>
                <div className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-white">
                  {item.action}
                  <span aria-hidden="true" className="transition group-hover:translate-x-1">
                    {'->'}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </PanelCard>

        <PanelCard tone="dark" title={t('landing.howTitle')} description={t('landing.browserNote')}>
          <div className="space-y-4">
            {steps.map((step, index) => (
              <div
                key={step.title}
                className="rounded-[24px] border border-white/10 bg-white/5 p-4"
              >
                <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-200">0{index + 1}</div>
                <div className="mt-3 font-display text-xl tracking-[-0.03em] text-white">{step.title}</div>
                <p className="mt-2 text-sm leading-7 text-white/72">{step.detail}</p>
              </div>
            ))}

            {!isElectronRuntime && (
              <div className="rounded-[24px] border border-copper-400/20 bg-white/6 p-4">
                <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-copper-200">
                  {t('landing.downloadTitle')}
                </div>
                <p className="mt-3 text-sm leading-7 text-white/72">{t('landing.ctaWindowsHint')}</p>
                <a href={WINDOWS_DOWNLOAD_URL} download="MiraxShare-Setup.exe" className="mx-btn-contrast mt-4">
                  {t('landing.ctaWindows')}
                </a>
              </div>
            )}
          </div>
        </PanelCard>
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-3">
        {benefits.map((item) => (
          <div key={item.title} className={`mx-panel px-5 py-5 ${item.tone}`}>
            <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/42">{t('landing.benefitLabel')}</div>
            <div className="mt-3 font-display text-2xl tracking-[-0.03em] text-white">{item.title}</div>
            <p className="mt-3 text-sm leading-7 text-white/64">{item.detail}</p>
          </div>
        ))}
      </section>
    </Layout>
  );
}

export default Landing;
