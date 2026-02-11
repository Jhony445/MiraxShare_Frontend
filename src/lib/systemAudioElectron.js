const WORKLET_MODULE_URL = new URL('../audio/systemAudioWorklet.js', import.meta.url);

function toArrayBuffer(value) {
  if (value instanceof ArrayBuffer) {
    return value;
  }

  if (ArrayBuffer.isView(value)) {
    return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
  }

  return null;
}

export async function createElectronSystemAudioTrack({
  targetSampleRate = 48000,
  channels = 2,
  frameMs = 20,
  maxQueueMs = 500,
  onStats,
} = {}) {
  if (!window.electronAPI?.isElectron) {
    throw new Error('Electron runtime is required for system audio loopback.');
  }

  if (!window.electronAPI.startSystemAudio || !window.electronAPI.onAudioChunk) {
    throw new Error('Electron preload API for system audio is missing.');
  }

  const audioContext = new AudioContext({
    sampleRate: targetSampleRate,
    latencyHint: 'interactive',
  });

  await audioContext.audioWorklet.addModule(WORKLET_MODULE_URL);

  const workletNode = new AudioWorkletNode(audioContext, 'system-audio-worklet', {
    numberOfInputs: 0,
    numberOfOutputs: 1,
    outputChannelCount: [channels],
    processorOptions: {
      channels,
      maxQueueMs,
    },
  });

  const destination = audioContext.createMediaStreamDestination();
  workletNode.connect(destination);

  let workletStats = {
    queueMs: 0,
    framesRendered: 0,
    framesUnderrun: 0,
    framesDropped: 0,
  };

  workletNode.port.onmessage = (event) => {
    const data = event.data;
    if (!data || data.type !== 'stats') return;
    workletStats = {
      queueMs: data.queueMs || 0,
      framesRendered: data.framesRendered || 0,
      framesUnderrun: data.framesUnderrun || 0,
      framesDropped: data.framesDropped || 0,
    };
  };

  const unsubscribeChunk = window.electronAPI.onAudioChunk((chunk) => {
    if (!chunk?.pcm) return;

    const pcm = toArrayBuffer(chunk.pcm);
    if (!pcm) return;

    workletNode.port.postMessage(
      {
        type: 'chunk',
        pcm,
        frameCount: chunk.frameCount,
        sampleRate: chunk.sampleRate,
        channels: chunk.channels,
      },
      [pcm]
    );
  });

  const nativeStats = await window.electronAPI.startSystemAudio({
    targetSampleRate,
    channels,
    frameMs,
  });

  if (audioContext.state !== 'running') {
    await audioContext.resume();
  }

  const track = destination.stream.getAudioTracks()[0];
  if (!track) {
    unsubscribeChunk();
    await window.electronAPI.stopSystemAudio();
    await audioContext.close();
    throw new Error('Unable to create system audio MediaStreamTrack.');
  }

  if ('contentHint' in track) {
    track.contentHint = 'music';
  }

  let statsTimer = null;
  if (typeof onStats === 'function') {
    statsTimer = window.setInterval(async () => {
      try {
        const captureStats = await window.electronAPI.getSystemAudioStats();
        onStats({
          capture: captureStats,
          worklet: workletStats,
        });
      } catch (_err) {
        // Ignore stats polling errors.
      }
    }, 5000);
  }

  let stopped = false;
  async function stop() {
    if (stopped) return;
    stopped = true;

    if (statsTimer) {
      window.clearInterval(statsTimer);
      statsTimer = null;
    }

    try {
      unsubscribeChunk();
    } catch (_err) {
      // Ignore cleanup errors.
    }

    try {
      workletNode.port.postMessage({ type: 'flush' });
      workletNode.disconnect();
    } catch (_err) {
      // Ignore cleanup errors.
    }

    try {
      await window.electronAPI.stopSystemAudio();
    } catch (_err) {
      // Ignore stop errors.
    }

    try {
      track.stop();
    } catch (_err) {
      // Ignore track stop errors.
    }

    await audioContext.close();
  }

  return {
    track,
    nativeStats,
    stop,
    getStats: async () => {
      const captureStats = await window.electronAPI.getSystemAudioStats();
      return {
        capture: captureStats,
        worklet: workletStats,
      };
    },
  };
}
