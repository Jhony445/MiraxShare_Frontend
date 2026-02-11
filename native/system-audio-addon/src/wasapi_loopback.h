#pragma once

#include <atomic>
#include <cstddef>
#include <cstdint>
#include <functional>
#include <mutex>
#include <string>
#include <thread>

struct CaptureConfig {
  uint32_t target_sample_rate = 48000;
  uint32_t target_channels = 2;
  uint32_t frame_ms = 20;
};

struct CaptureStats {
  uint64_t captured_input_frames = 0;
  uint64_t emitted_output_frames = 0;
  uint64_t emitted_chunks = 0;
  uint64_t dropped_chunks = 0;
  uint64_t silent_input_frames = 0;
  uint32_t input_sample_rate = 0;
  uint32_t output_sample_rate = 0;
  uint32_t output_channels = 0;
  uint32_t chunk_frame_ms = 0;
  bool running = false;
  std::string last_error;
};

using ChunkCallback = std::function<void(const int16_t* samples,
                                         size_t sample_count,
                                         uint32_t sample_rate,
                                         uint32_t channels,
                                         uint64_t sequence,
                                         uint64_t timestamp_ms)>;

class WasapiLoopbackCapture {
 public:
  WasapiLoopbackCapture();
  ~WasapiLoopbackCapture();

  bool Start(const CaptureConfig& config, std::string* error);
  void Stop();
  bool IsRunning() const;

  void SetChunkCallback(ChunkCallback callback);
  CaptureStats GetStats() const;

 private:
  void CaptureThreadMain();
  void SetError(const std::string& message);

  CaptureConfig config_;
  std::thread capture_thread_;
  std::atomic<bool> running_{false};

  mutable std::mutex callback_mutex_;
  ChunkCallback chunk_callback_;

  mutable std::mutex error_mutex_;
  std::string last_error_;

  std::atomic<uint64_t> captured_input_frames_{0};
  std::atomic<uint64_t> emitted_output_frames_{0};
  std::atomic<uint64_t> emitted_chunks_{0};
  std::atomic<uint64_t> dropped_chunks_{0};
  std::atomic<uint64_t> silent_input_frames_{0};
  std::atomic<uint32_t> input_sample_rate_{0};
  std::atomic<uint64_t> chunk_sequence_{0};

  double resample_accumulator_ = 0.0;
  float last_left_sample_ = 0.0f;
  float last_right_sample_ = 0.0f;
};
