#include "wasapi_loopback.h"

#include <windows.h>

#include <audioclient.h>
#include <mmdeviceapi.h>
#include <mmreg.h>
#include <wrl/client.h>

#include <algorithm>
#include <chrono>
#include <cmath>
#include <cstdint>
#include <exception>
#include <iterator>
#include <sstream>
#include <vector>

#include <ks.h>
#include <ksmedia.h>

using Microsoft::WRL::ComPtr;

namespace {

enum class SampleFormat {
  kUnknown,
  kFloat32,
  kInt16,
  kInt32,
};

struct InputFormatInfo {
  SampleFormat sample_format = SampleFormat::kUnknown;
  uint32_t sample_rate = 0;
  uint16_t channels = 0;
  uint16_t bits_per_sample = 0;
  uint16_t valid_bits_per_sample = 0;
};

uint64_t NowMs() {
  const auto now = std::chrono::steady_clock::now().time_since_epoch();
  return static_cast<uint64_t>(
      std::chrono::duration_cast<std::chrono::milliseconds>(now).count());
}

int16_t FloatToInt16(float value) {
  const float clamped = std::clamp(value, -1.0f, 1.0f);
  if (clamped >= 1.0f) return 32767;
  if (clamped <= -1.0f) return -32768;
  return static_cast<int16_t>(std::lrintf(clamped * 32767.0f));
}

bool IsEqualGuid(const GUID& left, const GUID& right) {
  return left.Data1 == right.Data1 && left.Data2 == right.Data2 &&
         left.Data3 == right.Data3 &&
         std::equal(std::begin(left.Data4), std::end(left.Data4),
                    std::begin(right.Data4));
}

InputFormatInfo ParseInputFormat(const WAVEFORMATEX* format) {
  InputFormatInfo info;
  if (!format) return info;

  info.sample_rate = format->nSamplesPerSec;
  info.channels = format->nChannels;
  info.bits_per_sample = format->wBitsPerSample;
  info.valid_bits_per_sample = format->wBitsPerSample;

  if (format->wFormatTag == WAVE_FORMAT_IEEE_FLOAT &&
      format->wBitsPerSample == 32) {
    info.sample_format = SampleFormat::kFloat32;
    return info;
  }

  if (format->wFormatTag == WAVE_FORMAT_PCM) {
    if (format->wBitsPerSample == 16) {
      info.sample_format = SampleFormat::kInt16;
    } else if (format->wBitsPerSample == 32) {
      info.sample_format = SampleFormat::kInt32;
    }
    return info;
  }

  if (format->wFormatTag == WAVE_FORMAT_EXTENSIBLE &&
      format->cbSize >= sizeof(WAVEFORMATEXTENSIBLE) - sizeof(WAVEFORMATEX)) {
    const auto* extensible =
        reinterpret_cast<const WAVEFORMATEXTENSIBLE*>(format);
    info.valid_bits_per_sample = extensible->Samples.wValidBitsPerSample;

    if (IsEqualGuid(extensible->SubFormat, KSDATAFORMAT_SUBTYPE_IEEE_FLOAT) &&
        format->wBitsPerSample == 32) {
      info.sample_format = SampleFormat::kFloat32;
      return info;
    }

    if (IsEqualGuid(extensible->SubFormat, KSDATAFORMAT_SUBTYPE_PCM)) {
      if (format->wBitsPerSample == 16) {
        info.sample_format = SampleFormat::kInt16;
      } else if (format->wBitsPerSample == 24 || format->wBitsPerSample == 32) {
        info.sample_format = SampleFormat::kInt32;
      }
      return info;
    }
  }

  return info;
}

float DecodeSample(const uint8_t* frame_start,
                   uint16_t source_channel,
                   const InputFormatInfo& format) {
  if (!frame_start || format.channels == 0) return 0.0f;
  const uint16_t channel =
      std::min<uint16_t>(source_channel, static_cast<uint16_t>(format.channels - 1));

  switch (format.sample_format) {
    case SampleFormat::kFloat32: {
      const auto* samples = reinterpret_cast<const float*>(frame_start);
      return samples[channel];
    }
    case SampleFormat::kInt16: {
      const auto* samples = reinterpret_cast<const int16_t*>(frame_start);
      return static_cast<float>(samples[channel]) / 32768.0f;
    }
    case SampleFormat::kInt32: {
      const auto* samples = reinterpret_cast<const int32_t*>(frame_start);
      int32_t value = samples[channel];
      if (format.valid_bits_per_sample == 24 && format.bits_per_sample >= 24) {
        value >>= 8;
        return static_cast<float>(value) / 8388608.0f;
      }
      return static_cast<float>(value) / 2147483648.0f;
    }
    default:
      return 0.0f;
  }
}

std::string HResultToString(const char* stage, HRESULT hr) {
  std::ostringstream stream;
  stream << stage << " failed (HRESULT=0x" << std::hex << hr << ")";
  return stream.str();
}

}  // namespace

WasapiLoopbackCapture::WasapiLoopbackCapture() = default;

WasapiLoopbackCapture::~WasapiLoopbackCapture() {
  Stop();
}

bool WasapiLoopbackCapture::Start(const CaptureConfig& config, std::string* error) {
  if (running_.load()) {
    if (error) *error = "System audio capture is already running.";
    return false;
  }

  config_ = config;
  if (config_.target_sample_rate == 0) config_.target_sample_rate = 48000;
  if (config_.target_channels == 0) config_.target_channels = 2;
  if (config_.frame_ms == 0) config_.frame_ms = 20;

  resample_accumulator_ = 0.0;
  last_left_sample_ = 0.0f;
  last_right_sample_ = 0.0f;

  captured_input_frames_.store(0);
  emitted_output_frames_.store(0);
  emitted_chunks_.store(0);
  dropped_chunks_.store(0);
  silent_input_frames_.store(0);
  input_sample_rate_.store(0);
  chunk_sequence_.store(0);
  SetError("");

  running_.store(true);

  try {
    capture_thread_ = std::thread([this]() { CaptureThreadMain(); });
  } catch (const std::exception& ex) {
    running_.store(false);
    SetError(ex.what());
    if (error) *error = ex.what();
    return false;
  }

  return true;
}

void WasapiLoopbackCapture::Stop() {
  if (!running_.load() && !capture_thread_.joinable()) {
    return;
  }

  running_.store(false);
  if (capture_thread_.joinable()) {
    capture_thread_.join();
  }
}

bool WasapiLoopbackCapture::IsRunning() const {
  return running_.load();
}

void WasapiLoopbackCapture::SetChunkCallback(ChunkCallback callback) {
  std::lock_guard<std::mutex> lock(callback_mutex_);
  chunk_callback_ = std::move(callback);
}

CaptureStats WasapiLoopbackCapture::GetStats() const {
  CaptureStats stats;
  stats.captured_input_frames = captured_input_frames_.load();
  stats.emitted_output_frames = emitted_output_frames_.load();
  stats.emitted_chunks = emitted_chunks_.load();
  stats.dropped_chunks = dropped_chunks_.load();
  stats.silent_input_frames = silent_input_frames_.load();
  stats.input_sample_rate = input_sample_rate_.load();
  stats.output_sample_rate = config_.target_sample_rate;
  stats.output_channels = config_.target_channels;
  stats.chunk_frame_ms = config_.frame_ms;
  stats.running = running_.load();
  {
    std::lock_guard<std::mutex> lock(error_mutex_);
    stats.last_error = last_error_;
  }
  return stats;
}

void WasapiLoopbackCapture::SetError(const std::string& message) {
  std::lock_guard<std::mutex> lock(error_mutex_);
  last_error_ = message;
}

void WasapiLoopbackCapture::CaptureThreadMain() {
  HRESULT hr = CoInitializeEx(nullptr, COINIT_MULTITHREADED);
  const bool should_uninitialize_com = SUCCEEDED(hr);
  if (!SUCCEEDED(hr) && hr != RPC_E_CHANGED_MODE) {
    SetError(HResultToString("CoInitializeEx", hr));
    running_.store(false);
    return;
  }

  ComPtr<IMMDeviceEnumerator> enumerator;
  hr = CoCreateInstance(__uuidof(MMDeviceEnumerator), nullptr, CLSCTX_ALL,
                        IID_PPV_ARGS(&enumerator));
  if (FAILED(hr)) {
    SetError(HResultToString("CoCreateInstance(MMDeviceEnumerator)", hr));
    running_.store(false);
    if (should_uninitialize_com) CoUninitialize();
    return;
  }

  ComPtr<IMMDevice> device;
  hr = enumerator->GetDefaultAudioEndpoint(eRender, eConsole, &device);
  if (FAILED(hr)) {
    SetError(HResultToString("GetDefaultAudioEndpoint", hr));
    running_.store(false);
    if (should_uninitialize_com) CoUninitialize();
    return;
  }

  ComPtr<IAudioClient> audio_client;
  hr = device->Activate(__uuidof(IAudioClient), CLSCTX_ALL, nullptr,
                        reinterpret_cast<void**>(audio_client.GetAddressOf()));
  if (FAILED(hr)) {
    SetError(HResultToString("IMMDevice::Activate(IAudioClient)", hr));
    running_.store(false);
    if (should_uninitialize_com) CoUninitialize();
    return;
  }

  WAVEFORMATEX* mix_format = nullptr;
  hr = audio_client->GetMixFormat(&mix_format);
  if (FAILED(hr) || !mix_format) {
    SetError(HResultToString("IAudioClient::GetMixFormat", hr));
    running_.store(false);
    if (should_uninitialize_com) CoUninitialize();
    return;
  }

  WAVEFORMATEXTENSIBLE desired_format = {};
  desired_format.Format.wFormatTag = WAVE_FORMAT_EXTENSIBLE;
  desired_format.Format.nChannels = static_cast<WORD>(config_.target_channels);
  desired_format.Format.nSamplesPerSec = config_.target_sample_rate;
  desired_format.Format.wBitsPerSample = 32;
  desired_format.Format.nBlockAlign =
      desired_format.Format.nChannels * (desired_format.Format.wBitsPerSample / 8);
  desired_format.Format.nAvgBytesPerSec =
      desired_format.Format.nSamplesPerSec * desired_format.Format.nBlockAlign;
  desired_format.Format.cbSize = sizeof(WAVEFORMATEXTENSIBLE) - sizeof(WAVEFORMATEX);
  desired_format.Samples.wValidBitsPerSample = 32;
  desired_format.dwChannelMask =
      config_.target_channels == 1
          ? SPEAKER_FRONT_CENTER
          : (SPEAKER_FRONT_LEFT | SPEAKER_FRONT_RIGHT);
  desired_format.SubFormat = KSDATAFORMAT_SUBTYPE_IEEE_FLOAT;

  WAVEFORMATEX* selected_format = reinterpret_cast<WAVEFORMATEX*>(&desired_format);
  WAVEFORMATEX* closest_format = nullptr;
  hr = audio_client->IsFormatSupported(AUDCLNT_SHAREMODE_SHARED,
                                       reinterpret_cast<WAVEFORMATEX*>(&desired_format),
                                       &closest_format);
  if (hr == S_OK) {
    selected_format = reinterpret_cast<WAVEFORMATEX*>(&desired_format);
  } else if (hr == S_FALSE && closest_format) {
    selected_format = closest_format;
  } else {
    selected_format = mix_format;
  }

  DWORD stream_flags = AUDCLNT_STREAMFLAGS_LOOPBACK | AUDCLNT_STREAMFLAGS_EVENTCALLBACK;
  hr = audio_client->Initialize(AUDCLNT_SHAREMODE_SHARED, stream_flags, 0, 0,
                                selected_format, nullptr);

  bool use_event_callback = SUCCEEDED(hr);
  if (!use_event_callback) {
    stream_flags = AUDCLNT_STREAMFLAGS_LOOPBACK;
    hr = audio_client->Initialize(AUDCLNT_SHAREMODE_SHARED, stream_flags, 0, 0,
                                  selected_format, nullptr);
  }

  if (FAILED(hr)) {
    SetError(HResultToString("IAudioClient::Initialize", hr));
    if (closest_format) CoTaskMemFree(closest_format);
    CoTaskMemFree(mix_format);
    running_.store(false);
    if (should_uninitialize_com) CoUninitialize();
    return;
  }

  HANDLE capture_event = nullptr;
  if (use_event_callback) {
    capture_event = CreateEvent(nullptr, FALSE, FALSE, nullptr);
    if (!capture_event) {
      SetError("CreateEvent failed for loopback capture.");
      if (closest_format) CoTaskMemFree(closest_format);
      CoTaskMemFree(mix_format);
      running_.store(false);
      if (should_uninitialize_com) CoUninitialize();
      return;
    }

    hr = audio_client->SetEventHandle(capture_event);
    if (FAILED(hr)) {
      SetError(HResultToString("IAudioClient::SetEventHandle", hr));
      CloseHandle(capture_event);
      if (closest_format) CoTaskMemFree(closest_format);
      CoTaskMemFree(mix_format);
      running_.store(false);
      if (should_uninitialize_com) CoUninitialize();
      return;
    }
  }

  ComPtr<IAudioCaptureClient> capture_client;
  hr = audio_client->GetService(IID_PPV_ARGS(&capture_client));
  if (FAILED(hr)) {
    SetError(HResultToString("IAudioClient::GetService(IAudioCaptureClient)", hr));
    if (capture_event) CloseHandle(capture_event);
    if (closest_format) CoTaskMemFree(closest_format);
    CoTaskMemFree(mix_format);
    running_.store(false);
    if (should_uninitialize_com) CoUninitialize();
    return;
  }

  const InputFormatInfo input_format = ParseInputFormat(selected_format);
  if (input_format.sample_format == SampleFormat::kUnknown ||
      input_format.channels == 0 || input_format.sample_rate == 0) {
    SetError("Unsupported loopback mix format.");
    if (capture_event) CloseHandle(capture_event);
    if (closest_format) CoTaskMemFree(closest_format);
    CoTaskMemFree(mix_format);
    running_.store(false);
    if (should_uninitialize_com) CoUninitialize();
    return;
  }

  input_sample_rate_.store(input_format.sample_rate);

  hr = audio_client->Start();
  if (FAILED(hr)) {
    SetError(HResultToString("IAudioClient::Start", hr));
    if (capture_event) CloseHandle(capture_event);
    if (closest_format) CoTaskMemFree(closest_format);
    CoTaskMemFree(mix_format);
    running_.store(false);
    if (should_uninitialize_com) CoUninitialize();
    return;
  }

  const uint32_t output_channels = config_.target_channels;
  const uint32_t output_sample_rate = config_.target_sample_rate;
  const uint32_t chunk_frames =
      std::max<uint32_t>(1, (output_sample_rate * config_.frame_ms) / 1000);
  const size_t chunk_samples = static_cast<size_t>(chunk_frames) * output_channels;

  std::vector<int16_t> pending_samples;
  pending_samples.reserve(chunk_samples * 4);

  auto emit_chunk = [&](const std::vector<int16_t>& chunk_samples_vec) {
    ChunkCallback callback_copy;
    {
      std::lock_guard<std::mutex> lock(callback_mutex_);
      callback_copy = chunk_callback_;
    }

    if (!callback_copy) {
      dropped_chunks_.fetch_add(1);
      return;
    }

    const uint64_t seq = chunk_sequence_.fetch_add(1) + 1;
    callback_copy(chunk_samples_vec.data(), chunk_samples_vec.size(),
                  output_sample_rate, output_channels, seq, NowMs());
    emitted_chunks_.fetch_add(1);
  };

  auto push_output_frame = [&](float left, float right) {
    pending_samples.push_back(FloatToInt16(left));
    if (output_channels > 1) {
      pending_samples.push_back(FloatToInt16(right));
    }
    emitted_output_frames_.fetch_add(1);

    while (pending_samples.size() >= chunk_samples) {
      std::vector<int16_t> chunk(pending_samples.begin(),
                                 pending_samples.begin() + chunk_samples);
      pending_samples.erase(pending_samples.begin(),
                            pending_samples.begin() + chunk_samples);
      emit_chunk(chunk);
    }
  };

  while (running_.load()) {
    if (use_event_callback) {
      const DWORD wait_result = WaitForSingleObject(capture_event, 200);
      if (wait_result == WAIT_TIMEOUT) {
        continue;
      }
    } else {
      Sleep(5);
    }

    UINT32 packet_length = 0;
    hr = capture_client->GetNextPacketSize(&packet_length);
    if (FAILED(hr)) {
      SetError(HResultToString("IAudioCaptureClient::GetNextPacketSize", hr));
      break;
    }

    while (packet_length > 0) {
      BYTE* data = nullptr;
      UINT32 num_frames = 0;
      DWORD flags = 0;

      hr = capture_client->GetBuffer(&data, &num_frames, &flags, nullptr, nullptr);
      if (FAILED(hr)) {
        SetError(HResultToString("IAudioCaptureClient::GetBuffer", hr));
        running_.store(false);
        break;
      }

      const bool is_silent = (flags & AUDCLNT_BUFFERFLAGS_SILENT) != 0;
      captured_input_frames_.fetch_add(num_frames);
      if (is_silent) {
        silent_input_frames_.fetch_add(num_frames);
      }

      const uint32_t input_rate = input_format.sample_rate;
      const uint16_t block_align =
          input_format.channels * (input_format.bits_per_sample / 8);

      for (UINT32 frame_index = 0; frame_index < num_frames; ++frame_index) {
        float left = 0.0f;
        float right = 0.0f;

        if (!is_silent && data) {
          const auto* frame_start =
              reinterpret_cast<const uint8_t*>(data) +
              static_cast<size_t>(frame_index) * block_align;
          left = DecodeSample(frame_start, 0, input_format);
          right = input_format.channels > 1
                      ? DecodeSample(frame_start, 1, input_format)
                      : left;
        }

        if (input_rate == output_sample_rate) {
          push_output_frame(left, right);
          continue;
        }

        last_left_sample_ = left;
        last_right_sample_ = right;
        resample_accumulator_ += static_cast<double>(output_sample_rate);

        while (resample_accumulator_ >= input_rate) {
          push_output_frame(last_left_sample_, last_right_sample_);
          resample_accumulator_ -= static_cast<double>(input_rate);
        }
      }

      hr = capture_client->ReleaseBuffer(num_frames);
      if (FAILED(hr)) {
        SetError(HResultToString("IAudioCaptureClient::ReleaseBuffer", hr));
        running_.store(false);
        break;
      }

      hr = capture_client->GetNextPacketSize(&packet_length);
      if (FAILED(hr)) {
        SetError(HResultToString("IAudioCaptureClient::GetNextPacketSize", hr));
        running_.store(false);
        break;
      }
    }
  }

  audio_client->Stop();

  if (capture_event) {
    CloseHandle(capture_event);
  }

  if (closest_format) {
    CoTaskMemFree(closest_format);
  }
  CoTaskMemFree(mix_format);

  running_.store(false);

  if (should_uninitialize_com) {
    CoUninitialize();
  }
}
