function cx(...values) {
  return values.filter(Boolean).join(' ');
}

export function PageHero({ eyebrow, title, description, actions, children, tone = 'brand' }) {
  return (
    <section className={cx('mx-panel mx-panel-accent px-5 py-6 md:px-7 md:py-7', tone === 'dark' && 'mx-panel-dark')}>
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          {eyebrow ? <div className="mx-kicker">{eyebrow}</div> : null}
          <h1 className="mt-4 font-display text-3xl tracking-[-0.04em] text-white sm:text-4xl lg:text-5xl">
            {title}
          </h1>
          {description ? <p className="mt-4 max-w-2xl text-sm leading-7 text-white/72 sm:text-base">{description}</p> : null}
        </div>
        {actions ? <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">{actions}</div> : null}
      </div>
      {children ? <div className="mt-6">{children}</div> : null}
    </section>
  );
}

export function PanelCard({ eyebrow, title, description, actions, children, className = '', tone = 'default' }) {
  return (
    <section
      className={cx(
        'mx-panel px-5 py-5 md:px-6 md:py-6',
        tone === 'soft' && 'mx-panel-soft',
        tone === 'accent' && 'mx-panel-accent',
        tone === 'dark' && 'mx-panel-dark',
        className
      )}
    >
      {(eyebrow || title || description || actions) && (
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="max-w-2xl">
            {eyebrow ? <div className="mx-kicker">{eyebrow}</div> : null}
            {title ? <h2 className="mt-4 font-display text-xl tracking-[-0.03em] text-white sm:text-2xl">{title}</h2> : null}
            {description ? <p className="mt-2 text-sm leading-7 text-white/68">{description}</p> : null}
          </div>
          {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
        </div>
      )}
      {children ? <div className={cx(eyebrow || title || description || actions ? 'mt-5' : '')}>{children}</div> : null}
    </section>
  );
}

export function FieldLabel({ htmlFor, label, aside }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-3">
      <label htmlFor={htmlFor} className="mx-field-label">
        {label}
      </label>
      {aside ? <div className="mx-helper text-right">{aside}</div> : null}
    </div>
  );
}

const metricToneStyles = {
  brand: 'border-brand-500/25 bg-brand-500/10',
  copper: 'border-copper-500/25 bg-copper-500/10',
  neutral: 'border-white/10 bg-white/[0.03]',
  dark: 'border-white/10 bg-black/20 text-white',
};

export function MetricStrip({ items, className = '' }) {
  return (
    <div className={cx('grid gap-3 sm:grid-cols-2 xl:grid-cols-4', className)}>
      {items.map((item) => (
        <div key={item.label} className={cx('mx-metric', metricToneStyles[item.tone] || metricToneStyles.neutral)}>
          <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/48">{item.label}</div>
          <div className="mx-metric-value mt-3">{item.value}</div>
          {item.detail ? <div className="mt-2 text-sm text-white/62">{item.detail}</div> : null}
        </div>
      ))}
    </div>
  );
}

export function InlineMessage({ tone = 'info', children }) {
  if (!children) return null;

  return (
    <div className="mx-inline-alert" data-tone={tone}>
      {children}
    </div>
  );
}

export function MemberList({ title, description, members, emptyLabel, selfPeerId, getRoleLabel }) {
  return (
    <PanelCard title={title} description={description}>
      <div className="space-y-3">
        {members.length === 0 ? (
          <div className="mx-empty text-sm">{emptyLabel}</div>
        ) : (
          members.map((member) => {
            const isSelf = member.peerId === selfPeerId;

            return (
              <div key={member.peerId} className="mx-member-row">
                <div className="flex items-center gap-3">
                  <div className="mx-member-avatar">{member.name?.slice(0, 2)?.toUpperCase() || 'MX'}</div>
                  <div>
                    <div className="text-sm font-bold text-white">
                      {member.name}{' '}
                      {isSelf ? <span className="text-xs font-medium text-white/45">({getRoleLabel('self')})</span> : null}
                    </div>
                    <div className="text-xs uppercase tracking-[0.16em] text-white/42">{getRoleLabel(member.role)}</div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </PanelCard>
  );
}

export function AudioPulse({ active = false }) {
  return (
    <div className={cx('mx-audio-pulse', active && 'is-live')} aria-hidden="true">
      {[44, 76, 58, 100, 68, 86, 52].map((height, index) => (
        <span
          key={height + index}
          className="mx-audio-bar"
          style={{ height: `${height}%`, animationDelay: `${index * 0.12}s` }}
        />
      ))}
    </div>
  );
}
