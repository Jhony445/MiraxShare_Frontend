import { useEffect, useRef, useState } from 'react';
import Layout from '../components/Layout.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import LogPanel from '../components/LogPanel.jsx';
import UsernameModal from '../components/UsernameModal.jsx';
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

  return (
    <Layout>
      <UsernameModal open={needsPrompt} onSave={persistUsername} />
      <div className="mb-6 rounded-3xl border border-brand-100 bg-gradient-to-r from-brand-50 to-white px-5 py-4">
        <div className="mx-kicker">{t('audioHost.consoleLabel')}</div>
        <div className="mt-2 text-sm text-slate-600">{t('audioHost.tip')}</div>
      </div>
      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-6">
          <div className="mx-card px-6 py-5">
            <div className="font-display text-base text-slate-900">{t('audioHost.roomTitle')}</div>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
              <input
                className="w-full rounded-xl border border-slate-200 bg-white/90 px-4 py-2 text-sm font-semibold text-slate-800"
                value={roomId}
                readOnly
              />
              <button
                type="button"
                onClick={copyRoomId}
                className="mx-btn-secondary px-4 py-2 text-xs"
              >
                {t('host.copy')}
              </button>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <StatusBadge
                label={wsStatus === 'open' ? t('status.wsConnected') : t('status.wsDisconnected')}
                tone={wsStatus === 'open' ? 'ok' : 'warn'}
              />
              <StatusBadge
                label={joined ? t('status.roomJoined') : t('status.joining')}
                tone={joined ? 'info' : 'neutral'}
              />
              <StatusBadge
                label={t('audioStatus.listeners', { count: listenerCount, max: MAX_LISTENERS })}
                tone={listenerCount > 0 ? 'ok' : 'neutral'}
              />
              <StatusBadge
                label={isSharing ? t('audioStatus.sharing') : t('audioStatus.notSharing')}
                tone={isSharing ? 'ok' : 'neutral'}
              />
              <StatusBadge
                label={t('status.connections', { count: connectedCount })}
                tone={connectedCount > 0 ? 'ok' : 'neutral'}
              />
            </div>

            {notice && (
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700">
                {notice}
              </div>
            )}
            {error && (
              <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700">
                {error}
              </div>
            )}
          </div>

          <div className="mx-card px-6 py-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-display text-base text-slate-900">{t('audioHost.shareTitle')}</div>
                <div className="text-xs text-slate-500">
                  {peerId ? t('host.hostRole', { peerId }) : t('host.hostRoleWaiting')}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={startShare}
                  className="mx-btn-primary px-4 py-2 text-xs"
                >
                  {t('audioHost.startShare')}
                </button>
                <button
                  type="button"
                  onClick={stopShare}
                  className="mx-btn-secondary px-4 py-2 text-xs hover:border-rose-200 hover:text-rose-600"
                >
                  {t('audioHost.stopShare')}
                </button>
              </div>
            </div>
            <div className="mt-3 rounded-xl border border-brand-100 bg-brand-50/70 px-4 py-3 text-xs text-slate-700">
              {t('audioHost.tip')}
            </div>
            <div className="mt-2 text-xs text-slate-500">{t('audioHost.qualityNote')}</div>
          </div>

          <LogPanel title={t('audioHost.logTitle')} />
        </div>

        <div className="mx-card px-6 py-5">
          <div className="font-display text-base text-slate-900">{t('members.title')}</div>
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

export default AudioHost;
