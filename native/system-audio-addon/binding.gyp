{
  "targets": [
    {
      "target_name": "system_audio",
      "sources": [
        "src/addon.cc",
        "src/wasapi_loopback.cc"
      ],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")"
      ],
      "dependencies": [
        "<!(node -p \"require('node-addon-api').gyp\")"
      ],
      "defines": [
        "NAPI_CPP_EXCEPTIONS",
        "WIN32_LEAN_AND_MEAN",
        "UNICODE",
        "_UNICODE"
      ],
      "libraries": [
        "ole32.lib",
        "uuid.lib",
        "avrt.lib"
      ],
      "msvs_settings": {
        "VCCLCompilerTool": {
          "ExceptionHandling": 1,
          "AdditionalOptions": [
            "/EHsc"
          ]
        }
      }
    }
  ]
}
