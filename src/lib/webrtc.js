const DEFAULT_CONFIG = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

export function createPeerConnection({
  onIceCandidate,
  onTrack,
  onConnectionStateChange,
} = {}) {
  const pc = new RTCPeerConnection(DEFAULT_CONFIG);

  pc.onicecandidate = (event) => {
    if (event.candidate && onIceCandidate) {
      onIceCandidate(event.candidate);
    }
  };

  pc.ontrack = (event) => {
    if (onTrack) {
      onTrack(event);
    }
  };

  pc.onconnectionstatechange = () => {
    if (onConnectionStateChange) {
      onConnectionStateChange(pc.connectionState);
    }
  };

  return pc;
}

export function attachStream(pc, stream) {
  if (!pc || !stream) return [];
  return stream.getTracks().map((track) => pc.addTrack(track, stream));
}

export function closePeerConnection(pc) {
  if (!pc) return;
  pc.onicecandidate = null;
  pc.ontrack = null;
  pc.onconnectionstatechange = null;
  try {
    pc.close();
  } catch (_err) {
    // Ignore close errors from already closed connections.
  }
}

export async function applyAudioBitrate(sender, maxBitrateKbps) {
  if (!sender || !maxBitrateKbps) return;

  const params = sender.getParameters();
  if (!params.encodings || params.encodings.length === 0) {
    params.encodings = [{}];
  }

  params.encodings[0].maxBitrate = maxBitrateKbps * 1000;
  try {
    await sender.setParameters(params);
  } catch (_err) {
    // Some browsers may ignore or reject audio bitrate constraints.
  }
}
