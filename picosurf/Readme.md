# PicoSurf

**Browse freely. Think locally.**

A lightweight, privacy-first browser with a local AI that helps you search, explore, understand and remember the web.

- **No cloud AI required** — models run on your device with llama.cpp
- **No AI API key** — download a catalogue model once, use it locally
- **No per-query token bill**
- **No giant browser engine bundled** — uses the system WebView2 runtime

Just a small browser with a brain of its own.

## Homepage

`https://picoai.org/picosurf/`

## What it does

Tell PicoSurf what you're looking for:

- *"Find the top 5 milk brands in UAE and compare them."*
- *"Find five good research papers about local LLM inference."*
- *"Open this page and summarize it."*

PicoSurf can search, navigate, extract, compare and summarize using local AI and the browser itself. The browser remains the tool; AI makes it smarter.

**Your data stays local.** History, downloads metadata, saved pages, and AI context are stored on this device. Websites cannot read them.

Part of the **PicoAI** philosophy: *Small software. Local intelligence. Private by default.*

## Build
powershell -ExecutionPolicy Bypass -File .\scripts\build.ps1


## For android

cd picosurf\apps\picosurf-android

npm run android:build-apk-llama

npm run android:sign-apk -- "src-tauri\gen\android\app\build\outputs\apk\arm64\release\app-arm64-release-unsigned.apk"

& "$env:ANDROID_HOME\platform-tools\adb.exe" install -r "C:\projects\picosurf\apps\picosurf-android\src-tauri\gen\android\app\build\outputs\apk\arm64\release\app-arm64-release-signed.apk"

