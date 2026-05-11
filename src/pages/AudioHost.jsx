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
import {
  createPeerConnection,
  closePeerConnection,
  applyHighQualityAudioSender,
  optimizeOpusSdpForMusic,
  findSenderByKind,
  upsertTrackSender,
} from '../lib/webrtc.js';
import { clearLog, logEvent } from '../lib/logger.js';
import { WS_URL } from '../lib/config.js';
import { useI18n } from '../lib/i18n.jsx';
import { useUsername } from '../lib/userProfile.js';

const MAX_LISTENERS = 6;
const SYSTEM_AUDIO_BITRATE_KBPS = 256;
const SYSTEM_AUDIO_MAX_AVERAGE_BITRATE = 256000;

function createRoomId() {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => alphabet[b % alphabet.length])
    .join('');
}

function AudioHost() {
  const [roomId] = useState(() => createRoomId());
  const [wsStatus, setWsStatus] = useState('connecting');
  const [peerId, setPeerId] = useState(null);
  const [joined, setJoined] = useState(false);
  const [listenerCount, setListenerCount] = useState(0);
  const [connectedCount, setConnectedCount] = useState(0);
  const [isSharing, setIsSharing] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [members, setMembers] = useState([]);

  const { t } = useI18n();
  const tRef = useRef(t);
  const { username, needsPrompt, persistUsername } = useUsername();

  const clientRef = useRef(null);
  const streamRef = useRef(null);
  const peersRef = useRef(new Map());
  const membersRef = useRef(new Map());

  useEffect(() => {
    tRef.current = t;
  }, [t]);

  useEffect(() => {
    if (!peerId || !username || joined) return;
    const client = clientRef.current;
    if (!client) return;
    client.join(roomId, 'host', { name: username });
    logEvent(tRef.current('log.join'), tRef.current('log.room', { roomId }));
    upsertMember(peerId, { name: username, role: 'host' });
  }, [peerId, username, joined, roomId]);

  useEffect(() => {
    clearLog();
    const client = new SignalingClient(WS_URL);
    clientRef.current = client;

    const offStatus = client.on('status', ({ status }) => setWsStatus(status));
    const offOpen = client.on('open', () => logEvent(tRef.current('log.wsConnected'), WS_URL));
    const offWelcome = client.on('welcome', ({ peerId: id }) => {
      setPeerId(id);
      logEvent(tRef.current('log.welcome'), tRef.current('log.peerId', { id }));
    });

    const offJoined = client.on('joined', ({ hostId, peers }) => {
      setJoined(true);
      logEvent(
        tRef.current('log.joined'),
        tRef.current('log.hostId', { hostId: hostId || tRef.current('common.none') })
      );

      if (Array.isArray(peers) && peers.length > 0) {
        logEvent(tRef.current('log.peers'), tRef.current('log.peersCount', { count: peers.length }));
      }

      if (Array.isArray(peers)) {
        peers
          .filter((peer) => peer.role === 'viewer')
          .forEach((peer) => {
            const accepted = registerViewer(peer.peerId, { autoOffer: Boolean(streamRef.current) });
            if (accepted) {
              upsertMember(peer.peerId, { name: tRef.current('members.unknown'), role: 'viewer' });
            }
          });
      }
      broadcastRoster();
    });

    const offPeerJoined = client.on('peer-joined', ({ peerId: id, role }) => {
      if (role !== 'viewer') return;
      const accepted = registerViewer(id, { autoOffer: Boolean(streamRef.current) });
      if (accepted) {
        upsertMember(id, { name: tRef.current('members.unknown'), role: 'viewer' });
        broadcastRoster();
      }
    });

    const offPeerLeft = client.on('peer-left', ({ peerId: id }) => {
      removeViewer(id);
      removeMember(id);
      broadcastRoster();
    });

    const offSignal = client.on('signal', ({ from, data }) => {
      void handleSignal(from, data);
    });

    const offError = client.on('error', ({ code, message }) => {
      setError(`${code}: ${message}`);
      logEvent(tRef.current('log.error'), `${code}: ${message}`);
    });

    client.connect();

    return () => {
      offStatus();
      offOpen();
      offWelcome();
      offJoined();
      offPeerJoined();
      offPeerLeft();
      offSignal();
      offError();
      client.close();
      cleanupStream();
      resetAllPeerConnections();
    };
  }, [roomId]);

  function updateCounts() {
    const peers = peersRef.current;
    setListenerCount(peers.size);
    setConnectedCount(Array.from(peers.values()).filter((entry) => entry.state === 'connected').length);
  }

  function updateMembersState() {
    setMembers(Array.from(membersRef.current.values()));
  }

  function upsertMember(id, { name, role }) {
    const unknown = tRef.current('members.unknown');
    const existing = membersRef.current.get(id);
    const resolved = existing?.name && (name === unknown || !name) ? existing.name : name;
    membersRef.current.set(id, { peerId: id, name: resolved || unknown, role });
    updateMembersState();
  }

  function removeMember(id) {
    if (!membersRef.current.has(id)) return;
    membersRef.current.delete(id);
    updateMembersState();
  }

  function buildRoster() {
    const entries = Array.from(membersRef.current.values());
    entries.sort((a, b) => {
      if (a.role === 'host') return -1;
      if (b.role === 'host') return 1;
      return a.name.localeCompare(b.name);
    });
    return entries;
  }

  function broadcastRoster() {
    const client = clientRef.current;
    if (!client) return;
    const roster = buildRoster();
    for (const id of peersRef.current.keys()) {
      client.signal(id, { kind: 'roster', payload: { members: roster } });
    }
  }

  function registerViewer(id, { autoOffer }) {
    const peers = peersRef.current;
    if (peers.has(id)) return false;
    if (peers.size >= MAX_LISTENERS) {
      setNotice(tRef.current('host.limitNotice'));
      logEvent(tRef.current('log.limit'), tRef.current('log.viewerIgnored'));
      return false;
    }

    setNotice('');
    peers.set(id, { pc: null, state: 'idle', audioSender: null });
    updateCounts();
    if (autoOffer) {
      void ensurePeerConnection(id, { autoOffer: true });
    }
    return true;
  }

  function removeViewer(id) {
    const peers = peersRef.current;
    const entry = peers.get(id);
    if (!entry) return;
    resetPeerConnection(entry);
    peers.delete(id);
    updateCounts();
    if (peers.size < MAX_LISTENERS) setNotice('');
  }

  async function ensurePeerConnection(targetPeerId, { autoOffer = false } = {}) {
    const entry = peersRef.current.get(targetPeerId);
    if (!entry) return null;
    if (entry.pc) return entry.pc;

    const client = clientRef.current;
    if (!client) return null;

    const pc = createPeerConnection({
      onIceCandidate: (candidate) => client.signal(targetPeerId, { kind: 'ice', payload: candidate }),
      onConnectionStateChange: (state) => {
        entry.state = state;
        updateCounts();
      },
    });

    entry.pc = pc;
    entry.state = pc.connectionState;
    updateCounts();

    if (streamRef.current && autoOffer) {
      await attachAudioToPeerConnection(entry, streamRef.current);
      await createAndSendOffer(targetPeerId, pc);
    }

    return pc;
  }

  async function attachAudioToPeerConnection(entry, stream) {
    const pc = entry.pc;
    if (!pc || !stream) return;
    const audioTrack = stream.getAudioTracks()[0] || null;

    if (audioTrack) {
      entry.audioSender = await upsertTrackSender(pc, stream, audioTrack);
      if (entry.audioSender) {
        await applyHighQualityAudioSender(entry.audioSender, SYSTEM_AUDIO_BITRATE_KBPS);
      }
    } else {
      entry.audioSender = findSenderByKind(pc, 'audio');
    }
  }

  async function createAndSendOffer(targetPeerId, pc) {
    const client = clientRef.current;
    if (!client) return;
    const offer = await pc.createOffer();
    const optimizedSdp = optimizeOpusSdpForMusic(offer.sdp, SYSTEM_AUDIO_MAX_AVERAGE_BITRATE);
    await pc.setLocalDescription({ type: offer.type, sdp: optimizedSdp });
    client.signal(targetPeerId, { kind: 'offer', payload: pc.localDescription });
  }

  async function getWebAudioOnlyStream() {
    const enhancedConstraints = {
      video: true,
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: 2,
        sampleRate: 48000,
        sampleSize: 16,
        suppressLocalAudioPlayback: false,
      },
      systemAudio: 'include',
      monitorTypeSurfaces: 'include',
      surfaceSwitching: 'include',
      selfBrowserSurface: 'exclude',
    };

    let captureStream;
    try {
      captureStream = await navigator.mediaDevices.getDisplayMedia(enhancedConstraints);
    } catch (err) {
      if (!(err instanceof TypeError)) throw err;
      captureStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          channelCount: 2,
          sampleRate: 48000,
        },
      });
    }

    const audioTrack = captureStream.getAudioTracks()[0];
    captureStream.getVideoTracks().forEach((track) => track.stop());

    if (!audioTrack) {
      captureStream.getTracks().forEach((track) => track.stop());
      throw new Error(tRef.current('audioHost.errorNoAudioTrack'));
    }

    if ('contentHint' in audioTrack) {
      audioTrack.contentHint = 'music';
    }

    try {
      await audioTrack.applyConstraints({
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: 2,
        sampleRate: 48000,
      });
    } catch (_err) {
      // Ignore unsupported constraints.
    }

    const stream = new MediaStream();
    stream.addTrack(audioTrack);
    return stream;
  }

  async function handleSignal(from, data) {
    if (!data) return;
    const entry = peersRef.current.get(from);

    if (data.kind === 'profile') {
      if (!data.payload?.name) return;
      upsertMember(from, { name: data.payload.name, role: 'viewer' });
      broadcastRoster();
      return;
    }

    if (!entry || !entry.pc) return;

    if (data.kind === 'answer') {
      await entry.pc.setRemoteDescription(data.payload);
      return;
    }

    if (data.kind === 'ice') {
      try {
        await entry.pc.addIceCandidate(data.payload);
      } catch (_err) {
        // Ignore invalid ICE candidates.
      }
    }
  }

  async function activateAudioStream(stream) {
    streamRef.current = stream;
    setIsSharing(true);
    logEvent(tRef.current('audioLog.room'), tRef.current('audioLog.captureStarted'));

    const audioTrack = stream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.onended = () => stopShare();
    }

    const peers = Array.from(peersRef.current.entries());
    if (peers.length === 0) {
      logEvent(tRef.current('audioLog.room'), tRef.current('audioLog.waitingListener'));
      return;
    }

    for (const [id, entry] of peers) {
      await ensurePeerConnection(id);
      if (entry.pc) {
        await attachAudioToPeerConnection(entry, stream);
        await createAndSendOffer(id, entry.pc);
      }
    }
  }

  async function startShare() {
    if (isSharing || !username) return;
    setError('');

    try {
      const stream = await getWebAudioOnlyStream();
      await activateAudioStream(stream);
    } catch (err) {
      const detail = err?.message ? ` (${err.message})` : '';
      setError(`${tRef.current('audioHost.errorShare')}${detail}`);
      logEvent(tRef.current('log.error'), tRef.current('audioLog.captureFailed'));
    }
  }

  function stopShare() {
    cleanupStream();
    resetAllPeerConnections();
    setIsSharing(false);
    logEvent(tRef.current('audioLog.room'), tRef.current('audioLog.captureStopped'));
  }

  function cleanupStream() {
    if (!streamRef.current) return;
    streamRef.current.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }

  function resetPeerConnection(entry) {
    if (entry.pc) {
      closePeerConnection(entry.pc);
      entry.pc = null;
    }
    entry.state = 'idle';
    entry.audioSender = null;
  }

  function resetAllPeerConnections() {
    for (const entry of peersRef.current.values()) {
      resetPeerConnection(entry);
    }
    updateCounts();
  }

  function copyRoomId() {
    navigator.clipboard.writeText(roomId).then(
      () => logEvent(tRef.current('log.clipboard'), tRef.current('log.room', { roomId })),
      () => setError(tRef.current('host.errorCopy'))
    );
  }

  const heroMetrics = [
    {
      label: t('audioHost.roomTitle'),
      value: roomId,
      detail: joined ? t('status.roomJoined') : t('status.joining'),
      tone: 'brand',
    },
    {
      label: t('members.title'),
      value: `${listenerCount}/${MAX_LISTENERS}`,
      detail: t('status.connections', { count: connectedCount }),
      tone: 'neutral',
    },
    {
      label: t('audioStatus.sharing'),
      value: isSharing ? t('audioStatus.sharing') : t('audioStatus.notSharing'),
      detail: wsStatus === 'open' ? t('status.wsConnected') : t('status.wsDisconnected'),
      tone: isSharing ? 'copper' : 'neutral',
    },
    {
      label: t('audioHost.consoleLabel'),
      value: joined ? t('status.roomJoined') : t('status.joining'),
      detail: null,
      tone: 'neutral',
    },
  ];

  const statusBadges = [
    {
      label: wsStatus === 'open' ? t('status.wsConnected') : t('status.wsDisconnected'),
      tone: wsStatus === 'open' ? 'ok' : 'warn',
    },
    {
      label: joined ? t('status.roomJoined') : t('status.joining'),
      tone: joined ? 'ok' : 'neutral',
    },
    {
      label: t('audioStatus.listeners', { count: listenerCount, max: MAX_LISTENERS }),
      tone: listenerCount > 0 ? 'ok' : 'warn',
    },
    {
      label: isSharing ? t('audioStatus.sharing') : t('audioStatus.notSharing'),
      tone: isSharing ? 'ok' : 'warn',
    },
    {
      label: t('status.connections', { count: connectedCount }),
      tone: connectedCount > 0 ? 'ok' : 'neutral',
    },
  ];

  return (
    <Layout>
      <UsernameModal open={needsPrompt} onSave={persistUsername} />
      <PageHero
        eyebrow={t('audioHost.consoleLabel')}
        title={t('audioHost.shareTitle')}
        description={t('audioHost.tip')}
        actions={
          <>
            <button type="button" onClick={startShare} className="mx-btn-primary">
              {t('audioHost.startShare')}
            </button>
            <button type="button" onClick={stopShare} className="mx-btn-danger">
              {t('audioHost.stopShare')}
            </button>
          </>
        }
      >
        <MetricStrip items={heroMetrics} className="xl:grid-cols-4" />
      </PageHero>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-6">
          <PanelCard
            title={t('audioHost.roomTitle')}
            description={t('audioHost.tip')}
            actions={
              <button type="button" onClick={copyRoomId} className="mx-btn-secondary text-xs">
                {t('host.copy')}
              </button>
            }
          >
            <FieldLabel htmlFor="audio-host-room" label={t('audioHost.roomTitle')} aside={joined ? t('status.roomJoined') : t('status.joining')} />
            <input id="audio-host-room" className="mx-input mx-code text-lg font-semibold tracking-[0.24em]" value={roomId} readOnly />

            <div className="mt-4 flex flex-wrap gap-2">
              {statusBadges.map((badge) => (
                <StatusBadge key={badge.label} label={badge.label} tone={badge.tone} />
              ))}
            </div>

            {notice ? <div className="mt-4"><InlineMessage tone="warn">{notice}</InlineMessage></div> : null}
            {error ? <div className="mt-3"><InlineMessage tone="error">{error}</InlineMessage></div> : null}
          </PanelCard>

          <PanelCard tone="dark" title={t('audioHost.shareTitle')} description={t('audioHost.qualityNote')}>
            <div className="mx-stage-viewport mx-stage-audio px-6 py-8 sm:px-8">
              <AudioPulse active={isSharing} />
              <div className="mt-5 rounded-[22px] border border-white/10 bg-white/6 p-4 text-center">
                <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-200">
                  {isSharing ? t('audioStatus.sharing') : t('audioStatus.notSharing')}
                </div>
                <p className="mt-3 text-sm leading-7 text-white/72">{t('audioHost.tip')}</p>
              </div>
            </div>
          </PanelCard>
        </div>

        <div className="space-y-6">
          <PanelCard title={t('audioHost.consoleLabel')} description={t('audioHost.qualityNote')}>
            <div className="space-y-4">
              <InlineMessage tone="info">{t('audioHost.tip')}</InlineMessage>
              <div className="mx-control-strip text-sm leading-7 text-white/64">{t('audioHost.qualityNote')}</div>
            </div>
          </PanelCard>

          <MemberList
            title={t('members.title')}
            description={t('audioStatus.listeners', { count: listenerCount, max: MAX_LISTENERS })}
            members={members}
            emptyLabel={t('members.empty')}
            selfPeerId={peerId}
            getRoleLabel={(role) => (role === 'self' ? t('members.you') : t(`roles.${role}`))}
          />

          <LogPanel title={t('audioHost.logTitle')} />
        </div>
      </div>
    </Layout>
  );
}

export default AudioHost;
