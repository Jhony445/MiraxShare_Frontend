const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const nativeDir = path.join(rootDir, 'electron', 'native');
const artifactDir = path.join(rootDir, 'artifacts');
const wavPath = path.join(artifactDir, 'system-audio-test.wav');

function resolveAddonPath() {
  const pointerPath = path.join(nativeDir, 'system_audio.current.json');
  if (fs.existsSync(pointerPath)) {
    try {
      const pointer = JSON.parse(fs.readFileSync(pointerPath, 'utf8'));
      if (pointer?.file) {
        const pointed = path.join(nativeDir, pointer.file);
        if (fs.existsSync(pointed)) {
          return pointed;
        }
      }
    } catch (_err) {
      // Ignore parse issues and continue fallback resolution.
    }
  }

  if (fs.existsSync(nativeDir)) {
    const candidates = fs
      .readdirSync(nativeDir)
      .filter((name) => /^system_audio-.*\.node$/i.test(name))
      .map((name) => ({
        fullPath: path.join(nativeDir, name),
        mtimeMs: fs.statSync(path.join(nativeDir, name)).mtimeMs,
      }))
      .sort((a, b) => b.mtimeMs - a.mtimeMs);

    if (candidates.length > 0) {
      return candidates[0].fullPath;
    }
  }

  return path.join(nativeDir, 'system_audio.node');
}

const addonPath = resolveAddonPath();

if (!fs.existsSync(addonPath)) {
  console.error(`Addon not found: ${addonPath}`);
  console.error('Run `npm run build:native` first.');
  process.exit(1);
}

const addon = require(addonPath);
const chunks = [];
let totalSamples = 0;
let sampleRate = 48000;
let channels = 2;

function writeWav(filePath, pcmInt16, wavSampleRate, wavChannels) {
  const bytesPerSample = 2;
  const blockAlign = wavChannels * bytesPerSample;
  const byteRate = wavSampleRate * blockAlign;
  const dataSize = pcmInt16.length * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(wavChannels, 22);
  buffer.writeUInt32LE(wavSampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < pcmInt16.length; i += 1) {
    buffer.writeInt16LE(pcmInt16[i], 44 + i * 2);
  }

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, buffer);
}

addon.setChunkCallback((chunk) => {
  if (!chunk || !chunk.pcm) return;
  sampleRate = chunk.sampleRate || sampleRate;
  channels = chunk.channels || channels;
  const chunkSamples = new Int16Array(chunk.pcm.buffer, chunk.pcm.byteOffset, chunk.pcm.byteLength / 2);
  chunks.push(Int16Array.from(chunkSamples));
  totalSamples += chunkSamples.length;
});

console.log('Capturing 10 seconds of system audio loopback...');
addon.start({ targetSampleRate: 48000, channels: 2, frameMs: 20 });

setTimeout(() => {
  addon.stop();
  addon.setChunkCallback(() => {});
  const stats = addon.getStats();

  const merged = new Int16Array(totalSamples);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }

  writeWav(wavPath, merged, sampleRate, channels);
  console.log(`WAV written: ${wavPath}`);
  console.log('Capture stats:', stats);
  process.exit(0);
}, 10000);
