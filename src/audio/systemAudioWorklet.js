class SystemAudioWorkletProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();

    const processorOptions = options?.processorOptions || {};
    this.channels = processorOptions.channels || 2;
    this.maxQueueMs = processorOptions.maxQueueMs || 500;
    // Jitter buffer: IPC chunks arrive unevenly, so play only once this much audio is queued.
    // Without it the queue hovered at ~1 ms and every late chunk became an audible gap of silence.
    this.prebufferFrames = Math.floor(((processorOptions.prebufferMs || 60) / 1000) * sampleRate);
    this.buffering = true;
    this.rebuffers = 0;

    this.queue = [];
    this.currentChunk = null;
    this.currentFrameOffset = 0;
    this.queuedFrames = 0;

    this.framesRendered = 0;
    this.framesUnderrun = 0;
    this.framesDropped = 0;
    this.statsCounter = 0;

    this.port.onmessage = (event) => {
      const data = event.data;
      if (!data) return;

      if (data.type === 'chunk') {
        this.enqueueChunk(data);
      }

      if (data.type === 'flush') {
        this.flushQueue();
      }
    };
  }

  flushQueue() {
    this.buffering = true;
    this.queue = [];
    this.currentChunk = null;
    this.currentFrameOffset = 0;
    this.queuedFrames = 0;
  }

  resampleChunk(sourceSamples, sourceFrameCount, sourceChannels, sourceRate) {
    if (sourceRate === sampleRate && sourceChannels === this.channels) {
      return {
        samples: sourceSamples,
        frameCount: sourceFrameCount,
      };
    }

    const destinationFrameCount = Math.max(1, Math.round((sourceFrameCount * sampleRate) / sourceRate));
    const destinationSamples = new Int16Array(destinationFrameCount * this.channels);

    const sourceChannelCount = Math.max(1, sourceChannels);

    for (let outFrame = 0; outFrame < destinationFrameCount; outFrame += 1) {
      const sourcePos = (outFrame * sourceRate) / sampleRate;
      const i0 = Math.floor(sourcePos);
      const i1 = Math.min(i0 + 1, sourceFrameCount - 1);
      const fraction = sourcePos - i0;

      for (let outChannel = 0; outChannel < this.channels; outChannel += 1) {
        const sourceChannel = Math.min(outChannel, sourceChannelCount - 1);
        const s0 = sourceSamples[i0 * sourceChannelCount + sourceChannel] || 0;
        const s1 = sourceSamples[i1 * sourceChannelCount + sourceChannel] || s0;
        const mixed = s0 + (s1 - s0) * fraction;
        destinationSamples[outFrame * this.channels + outChannel] = mixed;
      }
    }

    return {
      samples: destinationSamples,
      frameCount: destinationFrameCount,
    };
  }

  enqueueChunk(data) {
    if (!data.pcm || !data.frameCount) return;

    const sourceSamples = new Int16Array(data.pcm);
    const sourceFrameCount = data.frameCount;
    const sourceChannels = data.channels || this.channels;
    const sourceRate = data.sampleRate || sampleRate;

    const normalized = this.resampleChunk(sourceSamples, sourceFrameCount, sourceChannels, sourceRate);

    this.queue.push({
      samples: normalized.samples,
      frameCount: normalized.frameCount,
      channels: this.channels,
    });
    this.queuedFrames += normalized.frameCount;

    const maxQueueFrames = Math.floor((this.maxQueueMs / 1000) * sampleRate);
    while (this.queuedFrames > maxQueueFrames && this.queue.length > 1) {
      const dropped = this.queue.shift();
      this.queuedFrames -= dropped.frameCount;
      this.framesDropped += dropped.frameCount;
    }
  }

  nextFrame() {
    if (this.buffering) {
      if (this.queuedFrames < this.prebufferFrames) {
        return [0, 0];
      }
      this.buffering = false;
    }

    if (!this.currentChunk) {
      this.currentChunk = this.queue.shift() || null;
      this.currentFrameOffset = 0;
    }

    if (!this.currentChunk) {
      // Ran dry: refill the cushion instead of clicking on every late chunk.
      this.framesUnderrun += 1;
      this.rebuffers += 1;
      this.buffering = true;
      return [0, 0];
    }

    const frameIndex = this.currentFrameOffset;
    const base = frameIndex * this.currentChunk.channels;

    const leftInt = this.currentChunk.samples[base] || 0;
    const rightInt =
      this.currentChunk.channels > 1
        ? this.currentChunk.samples[base + 1] || leftInt
        : leftInt;

    const left = leftInt / 32768;
    const right = rightInt / 32768;

    this.currentFrameOffset += 1;
    this.queuedFrames -= 1;
    if (this.currentFrameOffset >= this.currentChunk.frameCount) {
      this.currentChunk = null;
      this.currentFrameOffset = 0;
    }

    return [left, right];
  }

  process(_inputs, outputs) {
    const output = outputs[0];
    if (!output || output.length === 0) {
      return true;
    }

    const leftChannel = output[0];
    const rightChannel = output[1] || output[0];

    for (let i = 0; i < leftChannel.length; i += 1) {
      const [left, right] = this.nextFrame();
      leftChannel[i] = left;
      rightChannel[i] = right;
      this.framesRendered += 1;
    }

    this.statsCounter += 1;
    if (this.statsCounter >= 375) {
      this.statsCounter = 0;
      this.port.postMessage({
        type: 'stats',
        queueMs: Math.round((this.queuedFrames / sampleRate) * 1000),
        framesRendered: this.framesRendered,
        framesUnderrun: this.framesUnderrun,
        framesDropped: this.framesDropped,
        rebuffers: this.rebuffers,
      });
    }

    return true;
  }
}

registerProcessor('system-audio-worklet', SystemAudioWorkletProcessor);
