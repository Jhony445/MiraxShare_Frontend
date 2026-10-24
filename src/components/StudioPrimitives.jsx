import { useState } from 'react';
import { useI18n } from '../lib/i18n.jsx';

const messageTones = {
  error: 'text-danger',
  warn: 'text-warn',
};

export function InlineMessage({ tone = 'error', children }) {
  if (!children) return null;
  return <p className={`text-sm ${messageTones[tone]}`}>{children}</p>;
}

const dotTones = {
  ok: 'bg-ok',
  warn: 'bg-warn',
  live: 'bg-danger',
  off: 'bg-surface-300',
};

export function StatusDot({ tone = 'off', label }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-fg">
      <span aria-hidden="true" className={`h-2 w-2 rounded-full ${dotTones[tone]}`} />
      {label}
    </span>
  );
}

export function RoomCode({ code }) {
  const { t } = useI18n();
  const [copyState, setCopyState] = useState('idle');

  const copy = () => {
    navigator.clipboard.writeText(code).then(
      () => setCopyState('ok'),
      () => setCopyState('error')
    );
    setTimeout(() => setCopyState('idle'), 1500);
  };

  const copyLabel =
    copyState === 'ok' ? t('host.copied') : copyState === 'error' ? t('host.errorCopy') : t('host.copy');

  return (
    <div>
      <div className="mx-label">{t('host.roomTitle')}</div>
      <div className="flex items-center gap-3">
        <span className="select-all font-mono text-2xl font-semibold tracking-widest text-fg-strong">{code}</span>
        <button type="button" onClick={copy} className="mx-btn-secondary px-3 py-1.5 text-xs">
          {copyLabel}
        </button>
      </div>
    </div>
  );
}

export function MemberList({ members, selfPeerId }) {
  const { t } = useI18n();

  return (
    <aside className="mx-card h-fit">
      <h2 className="mx-label">
        {t('members.title')} — {members.length}
      </h2>
      {members.length === 0 ? (
        <p className="text-sm text-fg-muted">{t('members.empty')}</p>
      ) : (
        <ul className="space-y-1">
          {members.map((member) => (
            <li key={member.peerId} className="flex items-center gap-2 py-1">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-500 text-xs font-semibold text-fg-strong">
                {member.name?.slice(0, 2)?.toUpperCase() || '?'}
              </span>
              <span className="truncate text-sm">
                {member.name}
                {member.peerId === selfPeerId ? <span className="text-fg-muted"> ({t('members.you')})</span> : null}
              </span>
              {member.role === 'host' ? <span className="ml-auto text-xs text-fg-muted">{t('roles.host')}</span> : null}
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
