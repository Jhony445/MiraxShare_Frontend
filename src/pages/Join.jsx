import { useEffect, useRef, useState } from 'react';
import Layout from '../components/Layout.jsx';
import { InlineMessage, MemberList, StatusDot } from '../components/StudioPrimitives.jsx';
import { SignalingClient } from '../lib/signalingClient.js';
import { createPeerConnection, closePeerConnection } from '../lib/webrtc.js';
import { clearLog, logEvent } from '../lib/logger.js';
import { WS_URL } from '../lib/config.js';
import { useI18n } from '../lib/i18n.jsx';
import { useUsername } from '../lib/userProfile.js';
import { playJoinSound, playLeaveSound } from '../lib/sounds.js';

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
  const { username } = useUsername();

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
      playJoinSound();
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
      playLeaveSound();
      if (hostRef.current === id) {
        // ponytail: no host means no stream, so the viewer goes back to the code input.
        disconnectRoom();
        setError(tRef.current('join.hostLeft'));
        return;
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

  const resolvedPcState = t(`pc.${pcState}`) === `pc.${pcState}` ? pcState : t(`pc.${pcState}`);

  const status = !joined
    ? { tone: 'off', label: t('status.notJoined') }
    : !hostId
      ? { tone: 'warn', label: t('status.waitingHost') }
      : { tone: pcState === 'connected' ? 'ok' : 'warn', label: resolvedPcState };

  function handleSubmit(event) {
    event.preventDefault();
    if (joined) {
      disconnectRoom();
    } else {
      joinRoom();
    }
  }

  return (
    <Layout title={t('nav.join')} requireName>
      <div className="grid gap-4 lg:grid-cols-[1fr_240px]">
        <div className="space-y-4">
          <form onSubmit={handleSubmit} className="mx-card space-y-2">
            <div className="flex gap-2">
              <input
                aria-label={t('host.roomTitle')}
                className="font-mono uppercase tracking-widest placeholder:font-sans placeholder:normal-case placeholder:tracking-normal"
                value={roomId}
                onChange={(event) => setRoomId(event.target.value.toUpperCase())}
                placeholder={t('join.placeholder')}
                disabled={joined}
              />
              <button type="submit" className={`shrink-0 ${joined ? 'mx-btn-secondary' : 'mx-btn-primary'}`}>
                {joined ? t('join.disconnect') : t('join.button')}
              </button>
            </div>
            <InlineMessage>{error}</InlineMessage>
          </form>

          <div className="overflow-hidden rounded-lg bg-surface-800">
            <div className="relative aspect-video bg-surface-950">
              {!hostId && (
                <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-fg-muted">
                  {joined ? t('status.waitingHost') : t('join.videoHint')}
                </div>
              )}
              <video
                ref={videoRef}
                autoPlay
                playsInline
                className={`h-full w-full ${viewMode === 'contain' ? 'object-contain' : 'object-cover'}`}
              />
            </div>

            <div className="flex flex-wrap items-center gap-3 px-4 py-3">
              <StatusDot tone={status.tone} label={status.label} />
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={volume}
                  onChange={(event) => setVolume(Number(event.target.value))}
                  aria-label={t('join.volume')}
                  className="w-24"
                />
                <span className="w-10 text-right text-xs text-fg-muted">{volume}%</span>
                <button type="button" onClick={toggleViewMode} className="mx-btn-secondary px-3 py-1.5 text-xs">
                  {viewMode === 'contain' ? t('join.fillScreen') : t('join.fitScreen')}
                </button>
                <button type="button" onClick={requestFullscreen} className="mx-btn-secondary px-3 py-1.5 text-xs">
                  {t('join.fullscreen')}
                </button>
              </div>
            </div>
          </div>
        </div>

        <MemberList members={members} selfPeerId={peerId} />
      </div>
    </Layout>
  );
}

export default Join;
