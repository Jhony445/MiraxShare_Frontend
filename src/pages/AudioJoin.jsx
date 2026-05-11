import { useEffect, useRef, useState } from 'react';
import Layout from '../components/Layout.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import LogPanel from '../components/LogPanel.jsx';
import UsernameModal from '../components/UsernameModal.jsx';
import {
  AudioPulse,
  FieldLabel,
  InlineMessage,
  MemberList,
  MetricStrip,
  PageHero,
  PanelCard,
} from '../components/StudioPrimitives.jsx';
import { SignalingClient } from '../lib/signalingClient.js';
import { createPeerConnection, closePeerConnection } from '../lib/webrtc.js';
import { clearLog, logEvent } from '../lib/logger.js';
import { WS_URL } from '../lib/config.js';
import { useI18n } from '../lib/i18n.jsx';
import { useUsername } from '../lib/userProfile.js';

function AudioJoin() {
  const [roomId, setRoomId] = useState('');
  const [wsStatus, setWsStatus] = useState('connecting');
  const [peerId, setPeerId] = useState(null);
  const [joined, setJoined] = useState(false);
  const [hostId, setHostId] = useState(null);
  const [pcState, setPcState] = useState('idle');
  const [error, setError] = useState('');
  const [volume, setVolume] = useState(100);
  const [members, setMembers] = useState([]);

  const { t } = useI18n();
  const tRef = useRef(t);
  const { username, needsPrompt, persistUsername } = useUsername();

  const clientRef = useRef(null);
  const pcRef = useRef(null);
  const hostRef = useRef(null);
  const audioRef = useRef(null);
  const membersRef = useRef(new Map());
  const clientCleanupRef = useRef(null);

  useEffect(() => {
    tRef.current = t;
  }, [t]);

  useEffect(() => {
    hostRef.current = hostId;
  }, [hostId]);

  useEffect(() => {
    if (hostId && username && peerId) {
      sendProfile(hostId);
    }
  }, [hostId, username, peerId]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = Math.min(1, Math.max(0, volume / 100));
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
    const offOpen = client.on('open', () => logEvent(tRef.current('log.wsConnected'), WS_URL));
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
      if (role === 'host') {
        setHostId(id);
        ensurePeerConnection(id);
        upsertMember(id, { name: tRef.current('members.unknown'), role: 'host' });
      }
    });

    const offPeerLeft = client.on('peer-left', ({ peerId: id }) => {
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
      void handleSignal(data);
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
    roster.forEach((member) => map.set(member.peerId, member));
    membersRef.current = map;
    updateMembersState();
  }

  function ensurePeerConnection(targetPeerId) {
    if (pcRef.current) return;
    const client = clientRef.current;
    if (!client) return;

    const pc = createPeerConnection({
      onIceCandidate: (candidate) => client.signal(targetPeerId, { kind: 'ice', payload: candidate }),
      onTrack: (event) => {
        const stream = event.streams[0];
        if (audioRef.current && stream) {
          audioRef.current.srcObject = stream;
          audioRef.current.volume = Math.min(1, Math.max(0, volume / 100));
          audioRef.current.play().catch(() => {
            // Autoplay may require user interaction.
          });
        }
      },
      onConnectionStateChange: (state) => setPcState(state),
    });

    pcRef.current = pc;
    setPcState(pc.connectionState);
  }

  async function handleSignal(data) {
    if (!data) return;

    if (data.kind === 'offer') {
      if (pcRef.current) cleanupPeerConnection();
      if (hostRef.current) ensurePeerConnection(hostRef.current);
      const pc = pcRef.current;
      if (!pc) return;

      await pc.setRemoteDescription(data.payload);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      clientRef.current.signal(hostRef.current, { kind: 'answer', payload: pc.localDescription });
      return;
    }

    if (data.kind === 'ice') {
      if (!pcRef.current) return;
      try {
        await pcRef.current.addIceCandidate(data.payload);
      } catch (_err) {
        // Ignore invalid ICE candidates.
      }
    }
  }

  function cleanupPeerConnection() {
    if (pcRef.current) {
      closePeerConnection(pcRef.current);
      pcRef.current = null;
    }
    setPcState('idle');
    if (audioRef.current) {
      audioRef.current.srcObject = null;
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
    logEvent(tRef.current('log.join'), tRef.current('log.room', { roomId: trimmed }));
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

  const resolvedPcState = t(`pc.${pcState}`) === `pc.${pcState}` ? pcState : t(`pc.${pcState}`);

  const heroMetrics = [
    {
      label: t('audioJoin.title'),
      value: joined ? roomId : '--',
      detail: joined ? t('status.roomJoined') : t('status.notJoined'),
      tone: 'brand',
    },
    {
      label: t('status.hostAvailable'),
      value: hostId ? t('status.hostAvailable') : t('status.waitingHost'),
      detail: joined ? t('status.roomJoined') : t('common.waiting'),
      tone: hostId ? 'copper' : 'neutral',
    },
    {
      label: t('status.pc', { state: '' }).trim(),
      value: resolvedPcState,
      detail: wsStatus === 'open' ? t('status.wsConnected') : t('status.wsDisconnected'),
      tone: pcState === 'connected' ? 'brand' : 'neutral',
    },
    {
      label: t('audioJoin.volume'),
      value: `${volume}%`,
      detail: joined ? t('audioJoin.listenTitle') : t('common.waiting'),
      tone: 'neutral',
    },
  ];

  const statusBadges = [
    {
      label: wsStatus === 'open' ? t('status.wsConnected') : t('status.wsDisconnected'),
      tone: wsStatus === 'open' ? 'ok' : 'warn',
    },
    {
      label: joined ? t('status.roomJoined') : t('status.notJoined'),
      tone: joined ? 'ok' : 'neutral',
    },
    {
      label: hostId ? t('status.hostAvailable') : t('status.waitingHost'),
      tone: hostId ? 'ok' : 'warn',
    },
    {
      label: t('status.pc', { state: resolvedPcState }),
      tone: pcState === 'connected' ? 'ok' : 'neutral',
    },
  ];

  return (
    <Layout>
      <UsernameModal open={needsPrompt} onSave={persistUsername} />
      <PageHero eyebrow={t('audioJoin.consoleLabel')} title={t('audioJoin.title')} description={t('audioJoin.hint')}>
        <MetricStrip items={heroMetrics} className="xl:grid-cols-4" />
      </PageHero>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.18fr_0.82fr]">
        <div className="space-y-6">
          <PanelCard
            title={t('audioJoin.title')}
            description={hostId ? t('status.hostAvailable') : t('status.waitingHost')}
            actions={
              <button type="button" onClick={joined ? disconnectRoom : joinRoom} className="mx-btn-primary text-xs">
                {joined ? t('audioJoin.disconnect') : t('audioJoin.button')}
              </button>
            }
          >
            <FieldLabel htmlFor="audio-join-room" label={t('audioHost.roomTitle')} aside={joined ? t('status.roomJoined') : t('status.notJoined')} />
            <input
              id="audio-join-room"
              className="mx-input mx-code text-lg font-semibold tracking-[0.24em]"
              value={roomId}
              onChange={(event) => setRoomId(event.target.value.toUpperCase())}
              placeholder={t('audioJoin.placeholder')}
              disabled={joined}
            />

            {error ? <div className="mt-4"><InlineMessage tone="error">{error}</InlineMessage></div> : null}
          </PanelCard>

          <PanelCard tone="dark" title={t('audioJoin.listenTitle')} description={t('audioJoin.hint')}>
            <div className="mx-stage-viewport mx-stage-audio px-6 py-8 sm:px-8">
              <AudioPulse active={pcState === 'connected'} />

              <div className="mt-5 rounded-[22px] border border-white/10 bg-white/6 p-4">
                <audio ref={audioRef} autoPlay controls className="w-full" />
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-[1fr_auto] md:items-center">
                <div>
                  <div className="mx-field-label text-brand-100">{t('audioJoin.volume')}</div>
                  <div className="mt-3 flex items-center gap-3">
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={volume}
                      onChange={(event) => setVolume(Number(event.target.value))}
                      className="w-full accent-brand-600"
                    />
                    <div className="w-12 text-right text-sm font-semibold text-white">{volume}%</div>
                  </div>
                </div>
                <div className="rounded-full border border-white/10 bg-white/6 px-4 py-2 text-xs uppercase tracking-[0.16em] text-white/70">
                  {resolvedPcState}
                </div>
              </div>
            </div>
          </PanelCard>
        </div>

        <div className="space-y-6">
          <PanelCard title={t('status.roomJoined')} description={hostId ? t('status.hostAvailable') : t('status.waitingHost')}>
            <div className="flex flex-wrap gap-2">
              {statusBadges.map((badge) => (
                <StatusBadge key={badge.label} label={badge.label} tone={badge.tone} />
              ))}
            </div>
          </PanelCard>

          <MemberList
            title={t('members.title')}
            description={hostId ? t('status.hostAvailable') : t('status.waitingHost')}
            members={members}
            emptyLabel={t('members.empty')}
            selfPeerId={peerId}
            getRoleLabel={(role) => (role === 'self' ? t('members.you') : t(`roles.${role}`))}
          />

          <LogPanel title={t('audioJoin.logTitle')} />
        </div>
      </div>
    </Layout>
  );
}

export default AudioJoin;
