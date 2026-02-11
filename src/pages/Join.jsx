import { useEffect, useRef, useState } from 'react';
import Layout from '../components/Layout.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import LogPanel from '../components/LogPanel.jsx';
import { SignalingClient } from '../lib/signalingClient.js';
import { createPeerConnection, closePeerConnection } from '../lib/webrtc.js';
import { clearLog, logEvent } from '../lib/logger.js';
import { WS_URL } from '../lib/config.js';
import { useI18n } from '../lib/i18n.jsx';
import { useUsername } from '../lib/userProfile.js';
import UsernameModal from '../components/UsernameModal.jsx';

function Join() {
  const [roomId, setRoomId] = useState('');
  const [wsStatus, setWsStatus] = useState('connecting');
  const [peerId, setPeerId] = useState(null);
  const [joined, setJoined] = useState(false);
  const [hostId, setHostId] = useState(null);
  const [pcState, setPcState] = useState('idle');
  const [error, setError] = useState('');
  const [viewMode, setViewMode] = useState('contain');
  const [volume, setVolume] = useState(100);
  const [members, setMembers] = useState([]);
  const { t } = useI18n();
  const tRef = useRef(t);
  const { username, needsPrompt, persistUsername } = useUsername();

  const clientRef = useRef(null);
  const pcRef = useRef(null);
  const hostRef = useRef(null);
  const videoRef = useRef(null);
  const membersRef = useRef(new Map());
  const clientCleanupRef = useRef(null);

  useEffect(() => {
    hostRef.current = hostId;
  }, [hostId]);

  useEffect(() => {
    tRef.current = t;
  }, [t]);

  useEffect(() => {
    if (hostId && username && peerId) {
      sendProfile(hostId);
    }
  }, [hostId, username, peerId]);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.volume = Math.min(1, Math.max(0, volume / 100));
    }
  }, [volume]);

  useEffect(() => {
    clearLog();
    connectClient();

    return () => {
      if (clientCleanupRef.current) {
        clientCleanupRef.current();
      }
      cleanupPeerConnection();
    };
  }, []);

  function connectClient() {
    const client = new SignalingClient(WS_URL);
    clientRef.current = client;

    const offStatus = client.on('status', ({ status }) => setWsStatus(status));

    const offOpen = client.on('open', () => {
      logEvent(tRef.current('log.wsConnected'), WS_URL);
    });

    const offWelcome = client.on('welcome', ({ peerId: id }) => {
      setPeerId(id);
      logEvent(tRef.current('log.welcome'), tRef.current('log.peerId', { id }));
    });

    const offJoined = client.on('joined', ({ hostId: host, peers }) => {
      setJoined(true);
      setHostId(host || null);
      logEvent(
        tRef.current('log.joined'),
        tRef.current('log.hostId', { hostId: host || tRef.current('common.none') })
      );
      if (Array.isArray(peers) && peers.length > 0) {
        logEvent(tRef.current('log.peers'), tRef.current('log.peersCount', { count: peers.length }));
      }
      if (host) {
        ensurePeerConnection(host);
      }

      if (peerId && username) {
        upsertMember(peerId, { name: username, role: 'viewer' });
      }
      if (host) {
        upsertMember(host, { name: tRef.current('members.unknown'), role: 'host' });
      }
    });

    const offPeerJoined = client.on('peer-joined', ({ peerId: id, role }) => {
      const roleLabel = tRef.current(`roles.${role}`);
      logEvent(
        tRef.current('log.peerJoined'),
        tRef.current('log.peerRole', { peerId: id, role: roleLabel })
      );
      if (role === 'host') {
        setHostId(id);
        ensurePeerConnection(id);
        upsertMember(id, { name: tRef.current('members.unknown'), role: 'host' });
      }
    });

    const offPeerLeft = client.on('peer-left', ({ peerId: id }) => {
      logEvent(tRef.current('log.peerLeft'), tRef.current('log.peerId', { id }));
      if (hostRef.current === id) {
        cleanupPeerConnection();
        setHostId(null);
      }
      removeMember(id);
    });

    const offSignal = client.on('signal', ({ from, data }) => {
      if (data?.kind === 'roster') {
        if (Array.isArray(data.payload?.members)) {
          setMembersFromRoster(data.payload.members);
        }
        return;
      }
      if (hostRef.current && from !== hostRef.current) return;
      handleSignal(data);
    });

    const offError = client.on('error', ({ code, message }) => {
      setError(`${code}: ${message}`);
      logEvent(tRef.current('log.error'), `${code}: ${message}`);
    });

    client.connect();

    clientCleanupRef.current = () => {
      offStatus();
      offOpen();
      offWelcome();
      offJoined();
      offPeerJoined();
      offPeerLeft();
      offSignal();
      offError();
      client.close();
    };
  }

  function updateMembersState() {
    setMembers(Array.from(membersRef.current.values()));
  }

  function upsertMember(peerIdValue, { name, role }) {
    membersRef.current.set(peerIdValue, { peerId: peerIdValue, name, role });
    updateMembersState();
  }

  function removeMember(peerIdValue) {
    if (!membersRef.current.has(peerIdValue)) return;
    membersRef.current.delete(peerIdValue);
    updateMembersState();
  }

  function setMembersFromRoster(roster) {
    const map = new Map();
    roster.forEach((member) => {
      map.set(member.peerId, member);
    });
    membersRef.current = map;
    updateMembersState();
  }

  function ensurePeerConnection(targetPeerId) {
    if (pcRef.current) return;
    const client = clientRef.current;
    if (!client) return;

    const pc = createPeerConnection({
      onIceCandidate: (candidate) => {
        client.signal(targetPeerId, { kind: 'ice', payload: candidate });
      },
      onTrack: (event) => {
        const stream = event.streams[0];
        if (videoRef.current && stream) {
          videoRef.current.srcObject = stream;
          videoRef.current.volume = Math.min(1, Math.max(0, volume / 100));
          videoRef.current
            .play()
            .catch(() => {
              // Autoplay can still be blocked by Chromium policy in some environments.
            });
        }
      },
      onConnectionStateChange: (state) => {
        setPcState(state);
      },
    });

    pcRef.current = pc;
    setPcState(pc.connectionState);
  }

  async function handleSignal(data) {
    if (!data) return;

    if (data.kind === 'offer') {
      if (pcRef.current) {
        cleanupPeerConnection();
      }
      if (hostRef.current) {
        ensurePeerConnection(hostRef.current);
      }
      const pc = pcRef.current;
      if (!pc) return;
      await pc.setRemoteDescription(data.payload);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      clientRef.current.signal(hostRef.current, {
        kind: 'answer',
        payload: pc.localDescription,
      });
      logEvent(tRef.current('log.signal'), tRef.current('log.answerSent'));
      return;
    }

    if (data.kind === 'ice') {
      if (!pcRef.current) return;
      try {
        await pcRef.current.addIceCandidate(data.payload);
        logEvent(tRef.current('log.signal'), tRef.current('log.iceAdded'));
      } catch (_err) {
        logEvent(tRef.current('log.signal'), tRef.current('log.iceFailed'));
      }
    }
  }

  function cleanupPeerConnection() {
    if (pcRef.current) {
      closePeerConnection(pcRef.current);
      pcRef.current = null;
    }
    setPcState('idle');
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }

  function joinRoom() {
    setError('');
    if (!username) {
      setError(t('user.errorRequired'));
      return;
    }
    const trimmed = roomId.trim().toUpperCase();
    if (!trimmed) {
      setError(t('join.errorEmptyRoom'));
      return;
    }

    if (wsStatus !== 'open') {
      setError(t('join.errorWs'));
      return;
    }

    cleanupPeerConnection();
    membersRef.current = new Map();
    setMembers([]);
    setJoined(false);
    setHostId(null);
    setRoomId(trimmed);
    clientRef.current.join(trimmed, 'viewer', { name: username });
    logEvent(t('log.join'), t('log.room', { roomId: trimmed }));
  }

  function disconnectRoom() {
    setError('');
    if (clientCleanupRef.current) {
      clientCleanupRef.current();
      clientCleanupRef.current = null;
    }
    cleanupPeerConnection();
    membersRef.current = new Map();
    setMembers([]);
    setJoined(false);
    setHostId(null);
    setPeerId(null);
    setWsStatus('closed');
    connectClient();
  }

  function sendProfile(targetPeerId) {
    const client = clientRef.current;
    if (!client || !username || !peerId) return;
    client.signal(targetPeerId, {
      kind: 'profile',
      payload: {
        peerId,
        name: username,
        role: 'viewer',
      },
    });
  }

  function toggleViewMode() {
    setViewMode((prev) => (prev === 'contain' ? 'cover' : 'contain'));
  }

  function requestFullscreen() {
    if (!videoRef.current) return;
    if (videoRef.current.requestFullscreen) {
      videoRef.current.requestFullscreen();
    }
  }

  return (
    <Layout>
      <UsernameModal open={needsPrompt} onSave={persistUsername} />
      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-6">
          <div className="mx-card px-6 py-5">
            <div className="text-sm font-semibold text-slate-800">{t('join.title')}</div>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
              <input
                className="w-full rounded-xl border border-slate-200 bg-white/90 px-4 py-2 text-sm text-slate-700"
                value={roomId}
                onChange={(event) => setRoomId(event.target.value.toUpperCase())}
                placeholder={t('join.placeholder')}
                disabled={joined}
              />
              <button
                type="button"
                onClick={joined ? disconnectRoom : joinRoom}
                className="rounded-xl bg-brand-600 px-4 py-2 text-xs font-semibold text-white shadow-soft transition hover:bg-brand-700"
              >
                {joined ? t('join.disconnect') : t('join.button')}
              </button>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <StatusBadge
                label={
                  wsStatus === 'open' ? t('status.wsConnected') : t('status.wsDisconnected')
                }
                tone={wsStatus === 'open' ? 'ok' : 'warn'}
              />
              <StatusBadge
                label={joined ? t('status.roomJoined') : t('status.notJoined')}
                tone={joined ? 'info' : 'neutral'}
              />
              <StatusBadge
                label={hostId ? t('status.hostAvailable') : t('status.waitingHost')}
                tone={hostId ? 'ok' : 'warn'}
              />
              <StatusBadge
                label={t('status.pc', {
                  state: t(`pc.${pcState}`) === `pc.${pcState}` ? pcState : t(`pc.${pcState}`),
                })}
                tone={pcState === 'connected' ? 'ok' : 'neutral'}
              />
            </div>

            <div className="mt-3 text-xs text-slate-500">
              {t('join.viewerId', { peerId: peerId || t('common.waiting') })}
            </div>

            {error && (
              <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700">
                {error}
              </div>
            )}
          </div>

          <LogPanel title={t('join.logTitle')} />
        </div>

        <div className="mx-card px-6 py-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm font-semibold text-slate-800">{t('join.liveViewTitle')}</div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={toggleViewMode}
                className="rounded-full border border-slate-200 bg-white/90 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:border-brand-200 hover:text-brand-700"
              >
                {viewMode === 'contain' ? t('join.fillScreen') : t('join.fitScreen')}
              </button>
              <button
                type="button"
                onClick={requestFullscreen}
                className="rounded-full border border-slate-200 bg-white/90 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:border-brand-200 hover:text-brand-700"
              >
                {t('join.fullscreen')}
              </button>
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-900/5 p-2">
            <div className="aspect-video w-full overflow-hidden rounded-xl bg-slate-900/10">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                className={`h-full w-full ${viewMode === 'contain' ? 'object-contain' : 'object-cover'}`}
              />
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs font-semibold text-slate-600">{t('join.volume')}</div>
            <div className="flex w-full items-center gap-3 sm:max-w-xs">
              <input
                type="range"
                min="0"
                max="100"
                value={volume}
                onChange={(event) => setVolume(Number(event.target.value))}
                className="w-full accent-brand-600"
              />
              <div className="w-10 text-right text-xs text-slate-500">{volume}</div>
            </div>
          </div>

          <div className="mt-3 text-xs text-slate-500">
            {t('join.videoHint')}
          </div>
        </div>

        <div className="mx-card px-6 py-5 lg:col-span-2">
          <div className="text-sm font-semibold text-slate-800">{t('members.title')}</div>
          <div className="mt-3 space-y-2">
            {members.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-200 bg-white/60 px-3 py-3 text-xs text-slate-500">
                {t('members.empty')}
              </div>
            ) : (
              members.map((member) => {
                const isSelf = member.peerId === peerId;
                return (
                  <div
                    key={member.peerId}
                    className="flex items-center justify-between rounded-xl border border-slate-100 bg-white/80 px-3 py-2"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
                        {member.name?.slice(0, 2)?.toUpperCase() || 'MX'}
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-slate-800">
                          {member.name}{' '}
                          {isSelf && <span className="text-xs text-slate-400">({t('members.you')})</span>}
                        </div>
                        <div className="text-xs text-slate-500">{t(`roles.${member.role}`)}</div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}

export default Join;
