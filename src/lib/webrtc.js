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

export function findSenderByKind(pc, kind) {
  if (!pc || !kind) return null;
  return pc.getSenders().find((sender) => sender.track && sender.track.kind === kind) || null;
}

export async function upsertTrackSender(pc, stream, track) {
  if (!pc || !stream || !track) return null;

  const existing = findSenderByKind(pc, track.kind);
  if (existing) {
    if (existing.track !== track) {
      await existing.replaceTrack(track);
    }
    return existing;
  }

  return pc.addTrack(track, stream);
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

export async function applyHighQualityAudioSender(sender, maxBitrateKbps = 256) {
  if (!sender) return;

  const params = sender.getParameters();
  if (!params.encodings || params.encodings.length === 0) {
    params.encodings = [{}];
  }

  const encoding = params.encodings[0];
  encoding.maxBitrate = maxBitrateKbps * 1000;
  if ('dtx' in encoding) {
    encoding.dtx = 'disabled';
  }

  if ('priority' in encoding) {
    encoding.priority = 'high';
  }

  if ('networkPriority' in encoding) {
    encoding.networkPriority = 'high';
  }

  try {
    await sender.setParameters(params);
  } catch (_err) {
    // Some runtimes ignore advanced sender parameters.
  }
}

function parseFmtpParams(fmtpLine) {
  const params = new Map();
  if (!fmtpLine) return params;

  fmtpLine
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .forEach((pair) => {
      const [rawKey, rawValue] = pair.split('=');
      const key = rawKey?.trim();
      if (!key) return;
      params.set(key, (rawValue || '').trim());
    });
  return params;
}

function buildFmtpLine(payloadType, params) {
  const body = Array.from(params.entries())
    .map(([key, value]) => `${key}=${value}`)
    .join(';');
  return `a=fmtp:${payloadType} ${body}`;
}

export function optimizeOpusSdpForMusic(sdp, maxAverageBitrate = 256000) {
  if (!sdp) return sdp;

  const lines = sdp.split('\r\n');
  const opusIndex = lines.findIndex((line) => /a=rtpmap:(\d+) opus\/48000\/2/i.test(line));
  if (opusIndex === -1) {
    return sdp;
  }

  const payloadMatch = lines[opusIndex].match(/a=rtpmap:(\d+) opus\/48000\/2/i);
  if (!payloadMatch) {
    return sdp;
  }

  const payloadType = payloadMatch[1];
  const fmtpPrefix = `a=fmtp:${payloadType} `;
  const fmtpIndex = lines.findIndex((line) => line.startsWith(fmtpPrefix));

  const desired = new Map([
    ['stereo', '1'],
    ['sprop-stereo', '1'],
    ['maxaveragebitrate', String(maxAverageBitrate)],
    ['maxplaybackrate', '48000'],
    ['useinbandfec', '1'],
    ['usedtx', '0'],
    ['cbr', '0'],
  ]);

  if (fmtpIndex !== -1) {
    const existingParams = parseFmtpParams(lines[fmtpIndex].slice(fmtpPrefix.length));
    desired.forEach((value, key) => existingParams.set(key, value));
    lines[fmtpIndex] = buildFmtpLine(payloadType, existingParams);
  } else {
    lines.splice(opusIndex + 1, 0, buildFmtpLine(payloadType, desired));
  }

  return lines.join('\r\n');
}
