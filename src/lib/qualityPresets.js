export const QUALITY_PRESETS = {
  '720p30': {
    label: '720p 30fps',
    targetWidth: 1280,
    targetHeight: 720,
    maxBitrateKbps: 1800,
    maxFramerate: 30,
    scaleResolutionDownBy: 1,
  },
  '1080p30': {
    label: '1080p 30fps',
    targetWidth: 1920,
    targetHeight: 1080,
    maxBitrateKbps: 3500,
    maxFramerate: 30,
    scaleResolutionDownBy: 1,
  },
  '1080p60': {
    label: '1080p 60fps',
    targetWidth: 1920,
    targetHeight: 1080,
    maxBitrateKbps: 6000,
    maxFramerate: 60,
    scaleResolutionDownBy: 1,
  },
  '1440p30': {
    label: '1440p 30fps',
    targetWidth: 2560,
    targetHeight: 1440,
    maxBitrateKbps: 7000,
    maxFramerate: 30,
    scaleResolutionDownBy: 1,
  },
  '1440p60': {
    label: '1440p 60fps',
    targetWidth: 2560,
    targetHeight: 1440,
    maxBitrateKbps: 12000,
    maxFramerate: 60,
    scaleResolutionDownBy: 1,
  },
};

export const QUALITY_OPTIONS = Object.entries(QUALITY_PRESETS).map(
  ([value, preset]) => ({
    value,
    ...preset,
  })
);

export async function applySenderQuality(sender, preset) {
  if (!sender || !preset) return;

  const params = sender.getParameters();
  if (!params.encodings || params.encodings.length === 0) {
    params.encodings = [{}];
  }

  const encoding = params.encodings[0];
  encoding.maxBitrate = preset.maxBitrateKbps * 1000;
  encoding.maxFramerate = preset.maxFramerate;

  if (preset.scaleResolutionDownBy && preset.scaleResolutionDownBy !== 1) {
    encoding.scaleResolutionDownBy = preset.scaleResolutionDownBy;
  } else {
    delete encoding.scaleResolutionDownBy;
  }

  await sender.setParameters(params);
}
