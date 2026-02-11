import { useEffect, useRef, useState } from 'react';
import Layout from '../components/Layout.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import LogPanel from '../components/LogPanel.jsx';
import { SignalingClient } from '../lib/signalingClient.js';
import { createPeerConnection, attachStream, closePeerConnection, applyAudioBitrate } from '../lib/webrtc.js';
import { QUALITY_OPTIONS, QUALITY_PRESETS, applySenderQuality } from '../lib/qualityPresets.js';
import { clearLog, logEvent } from '../lib/logger.js';
import { WS_URL } from '../lib/config.js';
import { useI18n } from '../lib/i18n.jsx';
import { useUsername } from '../lib/userProfile.js';
import UsernameModal from '../components/UsernameModal.jsx';

function createRoomId() {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => alphabet[b % alphabet.length])
    .join('');
}

const MAX_VIEWERS = 6;

function Host() {
  const [roomId] = useState(() => createRoomId());
  const [wsStatus, setWsStatus] = useState('connecting');
  const [peerId, setPeerId] = useState(null);
  const [joined, setJoined] = useState(false);
  const [viewerCount, setViewerCount] = useState(0);
  const [connectedCount, setConnectedCount] = useState(0);
  const [quality, setQuality] = useState('1080p30');
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
  const qualityRef = useRef(quality);
  const videoRef = useRef(null);


  useEffect(() => {
    qualityRef.current = quality;
  }, [quality]);

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

    const offStatus = client.on('status', ({ status }) => {
      setWsStatus(status);
    });

    const offOpen = client.on('open', () => {
      logEvent(tRef.current('log.wsConnected'), WS_URL);
    });

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
        logEvent(
          tRef.current('log.peers'),
          tRef.current('log.peersCount', { count: peers.length })
        );
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
      const roleLabel = tRef.current(`roles.${role}`);
      logEvent(
        tRef.current('log.peerJoined'),
        tRef.current('log.peerRole', { peerId: id, role: roleLabel })
      );
      if (role !== 'viewer') return;

      const accepted = registerViewer(id, { autoOffer: Boolean(streamRef.current) });
      if (accepted) {
        upsertMember(id, { name: tRef.current('members.unknown'), role: 'viewer' });
        broadcastRoster();
      }
    });

    const offPeerLeft = client.on('peer-left', ({ peerId: id }) => {
      logEvent(tRef.current('log.peerLeft'), tRef.current('log.peerId', { id }));
      removeViewer(id);
      removeMember(id);
      broadcastRoster();
    });

    const offSignal = client.on('signal', ({ from, data }) => {
      handleSignal(from, data);
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

  function updateViewerCounts() {
    const peers = peersRef.current;
    setViewerCount(peers.size);
    const connected = Array.from(peers.values()).filter((entry) => entry.state === 'connected').length;
    setConnectedCount(connected);
  }

  function updateMembersState() {
    setMembers(Array.from(membersRef.current.values()));
  }

  function upsertMember(peerId, { name, role }) {
    const existing = membersRef.current.get(peerId);
    const unknownLabel = tRef.current('members.unknown');
    const resolvedName =
      existing?.name && (name === unknownLabel || !name) ? existing.name : name;
    const next = {
      peerId,
      name: resolvedName || unknownLabel,
      role,
    };
    membersRef.current.set(peerId, next);
    updateMembersState();
  }

  function removeMember(peerId) {
    if (!membersRef.current.has(peerId)) return;
    membersRef.current.delete(peerId);
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
    for (const peerId of peersRef.current.keys()) {
      client.signal(peerId, { kind: 'roster', payload: { members: roster } });
    }
  }

  function registerViewer(peerId, { autoOffer }) {
    const peers = peersRef.current;
    if (peers.has(peerId)) return;

    if (peers.size >= MAX_VIEWERS) {
      setNotice(tRef.current('host.limitNotice'));
      logEvent(tRef.current('log.limit'), tRef.current('log.viewerIgnored'));
      return false;
    }

    setNotice('');
    peers.set(peerId, {
      pc: null,
      state: 'idle',
      videoSender: null,
      audioSender: null,
    });
    updateViewerCounts();

    if (autoOffer) {
      ensurePeerConnection(peerId, { autoOffer: true });
    }
    return true;
  }

  function removeViewer(peerId) {
    const peers = peersRef.current;
    const entry = peers.get(peerId);
    if (!entry) return;

    resetPeerConnection(entry);
    peers.delete(peerId);
    updateViewerCounts();
    if (peers.size < MAX_VIEWERS) {
      setNotice('');
    }
  }

  async function ensurePeerConnection(targetPeerId, { autoOffer = false } = {}) {
    const peers = peersRef.current;
    const entry = peers.get(targetPeerId);
    if (!entry) return null;
    if (entry.pc) return entry.pc;

    const client = clientRef.current;
    if (!client) return null;

    const pc = createPeerConnection({
      onIceCandidate: (candidate) => {
        client.signal(targetPeerId, { kind: 'ice', payload: candidate });
      },
      onConnectionStateChange: (state) => {
        entry.state = state;
        updateViewerCounts();
      },
    });

    entry.pc = pc;
    entry.state = pc.connectionState;
    updateViewerCounts();

    if (streamRef.current && autoOffer) {
      await attachStreamToPeerConnection(entry, streamRef.current);
      await createAndSendOffer(targetPeerId, pc);
    }

    return pc;
  }

  async function attachStreamToPeerConnection(entry, stream) {
    const pc = entry.pc;
    if (!pc) return;

    const hasVideoSender = pc
      .getSenders()
      .some((sender) => sender.track && sender.track.kind === 'video');

    if (hasVideoSender) return;

    attachStream(pc, stream);

    entry.videoSender = pc
      .getSenders()
      .find((sender) => sender.track && sender.track.kind === 'video') || null;

    if (entry.videoSender) {
      await applySenderQuality(entry.videoSender, QUALITY_PRESETS[qualityRef.current]);
    }

    entry.audioSender = pc
      .getSenders()
      .find((sender) => sender.track && sender.track.kind === 'audio') || null;

    if (entry.audioSender) {
      await applyAudioBitrate(entry.audioSender, 192);
      logEvent(tRef.current('log.audioEnabled'));
    }
  }

  async function applyCaptureConstraints(preset) {
    const stream = streamRef.current;
    if (!stream) return;

    const videoTrack = stream.getVideoTracks()[0];
    if (!videoTrack) return;

    try {
      await videoTrack.applyConstraints({
        width: { ideal: preset.targetWidth },
        height: { ideal: preset.targetHeight },
        frameRate: { ideal: preset.maxFramerate },
      });
      logEvent(tRef.current('log.constraints'), tRef.current('log.captureSet', { preset: preset.label }));
    } catch (_err) {
      logEvent(tRef.current('log.constraints'), tRef.current('log.constraintsRejected'));
    }
  }

  async function createAndSendOffer(targetPeerId, pc) {
    const client = clientRef.current;
    if (!client) return;

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    client.signal(targetPeerId, { kind: 'offer', payload: pc.localDescription });
    logEvent(tRef.current('log.signal'), tRef.current('log.offerSent'));
  }

  async function handleSignal(peerId, data) {
    if (!data) return;
    const entry = peersRef.current.get(peerId);
    if (data.kind === 'profile') {
      if (!data.payload?.name) return;
      upsertMember(peerId, { name: data.payload.name, role: 'viewer' });
      broadcastRoster();
      return;
    }

    if (!entry || !entry.pc) return;

    if (data.kind === 'answer') {
      await entry.pc.setRemoteDescription(data.payload);
      logEvent(tRef.current('log.signal'), tRef.current('log.answerReceived'));
      return;
    }

    if (data.kind === 'ice') {
      try {
        await entry.pc.addIceCandidate(data.payload);
        logEvent(tRef.current('log.signal'), tRef.current('log.iceAdded'));
      } catch (_err) {
        logEvent(tRef.current('log.signal'), tRef.current('log.iceFailed'));
      }
    }
  }

  async function startShare() {
    if (isSharing) return;
    setError('');
    if (!username) return;

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          channelCount: 2,
          sampleRate: 48000,
        },
      });

      streamRef.current = stream;
      setIsSharing(true);
      logEvent(tRef.current('log.screen'), tRef.current('log.captureStarted'));

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.onended = () => {
          stopShare();
        };
      }

      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack) {
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
          // Ignore unsupported audio constraints.
        }
      }

      await applyCaptureConstraints(QUALITY_PRESETS[qualityRef.current]);

      const peers = Array.from(peersRef.current.entries());
      if (peers.length === 0) {
        logEvent(tRef.current('log.status'), tRef.current('log.waitingViewer'));
        return;
      }

      for (const [peerId, entry] of peers) {
        await ensurePeerConnection(peerId, { autoOffer: false });
        if (entry.pc) {
          await attachStreamToPeerConnection(entry, stream);
          await createAndSendOffer(peerId, entry.pc);
        }
      }
    } catch (err) {
      setError(t('host.errorShare'));
      logEvent(tRef.current('log.error'), tRef.current('log.screenShareFailed'));
    }
  }

  function stopShare() {
    cleanupStream();
    resetAllPeerConnections();
    setIsSharing(false);
    logEvent(tRef.current('log.screen'), tRef.current('log.captureStopped'));
  }

  function cleanupStream() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }

  function resetPeerConnection(entry) {
    if (entry.pc) {
      closePeerConnection(entry.pc);
      entry.pc = null;
    }
    entry.state = 'idle';
    entry.videoSender = null;
    entry.audioSender = null;
  }

  function resetAllPeerConnections() {
    for (const entry of peersRef.current.values()) {
      resetPeerConnection(entry);
    }
    updateViewerCounts();
  }

  async function handleQualityChange(event) {
    const next = event.target.value;
    setQuality(next);
    qualityRef.current = next;
    logEvent(tRef.current('log.quality'), QUALITY_PRESETS[next].label);
    for (const entry of peersRef.current.values()) {
      if (entry.videoSender) {
        await applySenderQuality(entry.videoSender, QUALITY_PRESETS[next]);
      }
    }
    await applyCaptureConstraints(QUALITY_PRESETS[next]);
  }

  function copyRoomId() {
    navigator.clipboard.writeText(roomId).then(
      () => logEvent(t('log.clipboard'), t('log.room', { roomId })),
      () => setError(t('host.errorCopy'))
    );
  }

  return (
    <Layout>
      <UsernameModal open={needsPrompt} onSave={persistUsername} />
      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-6">
          <div className="mx-card px-6 py-5">
            <div className="text-sm font-semibold text-slate-800">{t('host.roomTitle')}</div>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
              <input
                className="w-full rounded-xl border border-slate-200 bg-white/90 px-4 py-2 text-sm font-semibold text-slate-800"
                value={roomId}
                readOnly
              />
              <button
                type="button"
                onClick={copyRoomId}
                className="rounded-xl border border-slate-200 bg-white/90 px-4 py-2 text-xs font-semibold text-slate-700 transition hover:border-brand-200 hover:text-brand-700"
              >
                {t('host.copy')}
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
                label={joined ? t('status.roomJoined') : t('status.joining')}
                tone={joined ? 'info' : 'neutral'}
              />
              <StatusBadge
                label={t('status.viewers', { count: viewerCount, max: MAX_VIEWERS })}
                tone={viewerCount > 0 ? 'ok' : 'neutral'}
              />
              <StatusBadge
                label={isSharing ? t('status.sharing') : t('status.notSharing')}
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
                <div className="text-sm font-semibold text-slate-800">{t('host.screenShareTitle')}</div>
                <div className="text-xs text-slate-500">
                  {peerId ? t('host.hostRole', { peerId }) : t('host.hostRoleWaiting')}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={startShare}
                  className="rounded-full bg-brand-600 px-4 py-2 text-xs font-semibold text-white shadow-soft transition hover:bg-brand-700"
                >
                  {t('host.startShare')}
                </button>
                <button
                  type="button"
                  onClick={stopShare}
                  className="rounded-full border border-slate-200 bg-white/90 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:border-rose-200 hover:text-rose-600"
                >
                  {t('host.stopShare')}
                </button>
              </div>
            </div>
            <div className="mt-4">
              <label className="text-xs font-semibold text-slate-600">{t('host.qualityLabel')}</label>
              <select
                value={quality}
                onChange={handleQualityChange}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white/90 px-3 py-2 text-sm text-slate-700"
              >
                {QUALITY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label} ({option.maxBitrateKbps} kbps)
                  </option>
                ))}
              </select>
            </div>
            <div className="mt-3 text-xs text-slate-500">
              {t('host.audioTip')}
            </div>
            <div className="mt-1 text-xs text-slate-500">
              {t('host.audioBestTip')}
            </div>
          </div>

          <LogPanel title={t('host.logTitle')} />
        </div>

        <div className="mx-card px-6 py-5">
          <div className="text-sm font-semibold text-slate-800">{t('host.previewTitle')}</div>
          <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-slate-900/5">
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className="h-72 w-full object-cover"
            />
          </div>
          <div className="mt-3 text-xs text-slate-500">
            {t('host.previewNote')}
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

export default Host;
