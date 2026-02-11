#include <napi.h>

#include <memory>
#include <mutex>
#include <string>
#include <vector>

#include "wasapi_loopback.h"

namespace {

struct ChunkPayload {
  std::vector<int16_t> samples;
  uint32_t sample_rate = 48000;
  uint32_t channels = 2;
  uint64_t sequence = 0;
  uint64_t timestamp_ms = 0;
};

std::mutex g_capture_mutex;
std::unique_ptr<WasapiLoopbackCapture> g_capture;

std::mutex g_callback_mutex;
std::shared_ptr<Napi::ThreadSafeFunction> g_chunk_tsf;

WasapiLoopbackCapture* EnsureCapture() {
  std::lock_guard<std::mutex> lock(g_capture_mutex);
  if (!g_capture) {
    g_capture = std::make_unique<WasapiLoopbackCapture>();
  }
  return g_capture.get();
}

CaptureConfig ParseConfig(const Napi::Object& options) {
  CaptureConfig config;
  if (options.Has("targetSampleRate") && options.Get("targetSampleRate").IsNumber()) {
    config.target_sample_rate =
        options.Get("targetSampleRate").As<Napi::Number>().Uint32Value();
  }
  if (options.Has("channels") && options.Get("channels").IsNumber()) {
    config.target_channels = options.Get("channels").As<Napi::Number>().Uint32Value();
  }
  if (options.Has("frameMs") && options.Get("frameMs").IsNumber()) {
    config.frame_ms = options.Get("frameMs").As<Napi::Number>().Uint32Value();
  }
  return config;
}

Napi::Object ToStatsObject(Napi::Env env, const CaptureStats& stats) {
  Napi::Object result = Napi::Object::New(env);
  result.Set("running", Napi::Boolean::New(env, stats.running));
  result.Set("capturedInputFrames",
             Napi::Number::New(env, static_cast<double>(stats.captured_input_frames)));
  result.Set("emittedOutputFrames",
             Napi::Number::New(env, static_cast<double>(stats.emitted_output_frames)));
  result.Set("emittedChunks",
             Napi::Number::New(env, static_cast<double>(stats.emitted_chunks)));
  result.Set("droppedChunks",
             Napi::Number::New(env, static_cast<double>(stats.dropped_chunks)));
  result.Set("silentInputFrames",
             Napi::Number::New(env, static_cast<double>(stats.silent_input_frames)));
  result.Set("inputSampleRate", Napi::Number::New(env, stats.input_sample_rate));
  result.Set("outputSampleRate", Napi::Number::New(env, stats.output_sample_rate));
  result.Set("outputChannels", Napi::Number::New(env, stats.output_channels));
  result.Set("chunkFrameMs", Napi::Number::New(env, stats.chunk_frame_ms));
  result.Set("lastError", Napi::String::New(env, stats.last_error));
  return result;
}

void InstallChunkBridge(WasapiLoopbackCapture* capture) {
  capture->SetChunkCallback([](const int16_t* samples,
                               size_t sample_count,
                               uint32_t sample_rate,
                               uint32_t channels,
                               uint64_t sequence,
                               uint64_t timestamp_ms) {
    std::shared_ptr<Napi::ThreadSafeFunction> tsf;
    {
      std::lock_guard<std::mutex> lock(g_callback_mutex);
      tsf = g_chunk_tsf;
    }

    if (!tsf || !samples || sample_count == 0) {
      return;
    }

    auto* payload = new ChunkPayload();
    payload->samples.assign(samples, samples + sample_count);
    payload->sample_rate = sample_rate;
    payload->channels = channels;
    payload->sequence = sequence;
    payload->timestamp_ms = timestamp_ms;

    const napi_status status = tsf->NonBlockingCall(
        payload, [](Napi::Env env, Napi::Function callback, ChunkPayload* chunk) {
          Napi::Object message = Napi::Object::New(env);
          auto pcm_buffer =
              Napi::Buffer<int16_t>::Copy(env, chunk->samples.data(), chunk->samples.size());
          message.Set("pcm", pcm_buffer);
          message.Set("sampleRate", Napi::Number::New(env, chunk->sample_rate));
          message.Set("channels", Napi::Number::New(env, chunk->channels));
          const uint32_t frame_count =
              chunk->channels == 0
                  ? 0
                  : static_cast<uint32_t>(chunk->samples.size() / chunk->channels);
          message.Set("frameCount", Napi::Number::New(env, frame_count));
          message.Set("sequence", Napi::Number::New(env, static_cast<double>(chunk->sequence)));
          message.Set("timestampMs",
                      Napi::Number::New(env, static_cast<double>(chunk->timestamp_ms)));
          callback.Call({message});
          delete chunk;
        });

    if (status != napi_ok) {
      delete payload;
    }
  });
}

Napi::Value SetChunkCallback(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsFunction()) {
    Napi::TypeError::New(env, "setChunkCallback expects a function.")
        .ThrowAsJavaScriptException();
    return env.Undefined();
  }

  const Napi::Function callback = info[0].As<Napi::Function>();

  {
    std::lock_guard<std::mutex> lock(g_callback_mutex);
    if (g_chunk_tsf) {
      g_chunk_tsf->Release();
      g_chunk_tsf.reset();
    }

    auto tsf = Napi::ThreadSafeFunction::New(env, callback, "SystemAudioChunk", 256, 1);
    g_chunk_tsf = std::make_shared<Napi::ThreadSafeFunction>(std::move(tsf));
  }

  InstallChunkBridge(EnsureCapture());
  return env.Undefined();
}

Napi::Value Start(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  WasapiLoopbackCapture* capture = EnsureCapture();

  {
    std::lock_guard<std::mutex> lock(g_callback_mutex);
    if (!g_chunk_tsf) {
      Napi::Error::New(env, "Chunk callback is not set. Call setChunkCallback first.")
          .ThrowAsJavaScriptException();
      return env.Undefined();
    }
  }

  if (capture->IsRunning()) {
    return ToStatsObject(env, capture->GetStats());
  }

  CaptureConfig config;
  if (info.Length() > 0 && info[0].IsObject()) {
    config = ParseConfig(info[0].As<Napi::Object>());
  }

  std::string error;
  const bool started = capture->Start(config, &error);
  if (!started) {
    Napi::Error::New(env, error.empty() ? "Failed to start system audio capture." : error)
        .ThrowAsJavaScriptException();
    return env.Undefined();
  }

  InstallChunkBridge(capture);
  return ToStatsObject(env, capture->GetStats());
}

Napi::Value Stop(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  WasapiLoopbackCapture* capture = EnsureCapture();
  capture->Stop();
  return ToStatsObject(env, capture->GetStats());
}

Napi::Value GetStats(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  WasapiLoopbackCapture* capture = EnsureCapture();
  return ToStatsObject(env, capture->GetStats());
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("setChunkCallback", Napi::Function::New(env, SetChunkCallback));
  exports.Set("start", Napi::Function::New(env, Start));
  exports.Set("stop", Napi::Function::New(env, Stop));
  exports.Set("getStats", Napi::Function::New(env, GetStats));
  return exports;
}

}  // namespace

NODE_API_MODULE(system_audio, Init)
