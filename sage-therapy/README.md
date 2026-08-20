# Sage couples therapy prototype

## Run

```bash
npm start
```

Open the preview and sign in with `maya@example.com` / `demo123`.

## Configure credentials

```bash
cp .env.example .env
```

Edit `.env` and restart the app after changing credentials.

Required production values:

```env
OPENAI_API_KEY=sk-your-key
OPENAI_TEXT_MODEL=gpt-5.6
CARTESIA_API_KEY=sk_car_your-key
CARTESIA_VOICE_ID=your-selected-voice-id
CARTESIA_MODEL=sonic-3.5
```

`OPENAI_API_KEY` powers both Realtime transcription and original grounded responses. When Sage detects a current factual question, the response pipeline enables OpenAI's built-in web-search tool and requests authoritative sources. No separate search API key is required.

## Turn on Sage's ears — OpenAI Realtime transcription

1. Add the server-side `OPENAI_API_KEY` to `.env`.
2. Restart the app.
3. Open a solo or joint session.
4. Press the round microphone button and allow microphone access.
5. Speak naturally. Partial words appear in the composer. After server VAD detects a pause, the final transcript is submitted to Sage.
6. Press the microphone button again to stop and release the device.

The permanent OpenAI key remains on the server. The authenticated `/api/realtime-transcription-token` endpoint creates a short-lived, user-bound client secret. The browser uses it to connect the microphone directly to OpenAI over WebRTC. If Realtime transcription is unavailable, the app falls back to browser speech recognition.

## Turn on Sage's voice — Cartesia Sonic

1. Create a Cartesia API key.
2. Select or create a properly licensed Sage voice in Cartesia and copy its voice ID.
3. Add these values to `.env`:

```env
CARTESIA_API_KEY=sk_car_your-key
CARTESIA_VOICE_ID=your-voice-id
CARTESIA_MODEL=sonic-3.5
```

4. Restart the app.
5. Open a session or use **Settings → Run voice check**.

The authenticated `/api/cartesia-token` endpoint uses the permanent server key to mint a short-lived token with only the `tts` grant. The browser connects to Cartesia's WebSocket using that temporary token. Sage's text is streamed as raw float PCM and scheduled through Web Audio for low-gap playback. Device speech synthesis is retained only as an availability fallback when Cartesia is not configured or unreachable.

## Privacy and safety notes

- Use HTTPS in production; browsers require a secure context for microphone access.
- Permanent provider keys never enter browser code.
- The server sends a stable SHA-256 safety identifier—not an email address—when minting an OpenAI Realtime credential.
- Do not log access tokens, raw audio, or intimate transcript content.
- Add explicit audio/transcription consent and retention controls before production use.
- Use only licensed synthetic voices or voices whose owners gave documented consent.
- In joint mode, speaker diarization is still a separate production requirement. This prototype transcribes the shared microphone as one input stream.
