# KESEX+ — Watch Party

Node.js + Express + Socket.IO application for synchronized movie nights.

## Included
- Create private rooms and invite friends by link or 6-character code.
- Host-controlled playback synchronization (play, pause, seek) with drift correction.
- Direct video URLs and uploads (MP4, WebM, OGG, MOV; max 1 GB per file).
- Real-time room chat and participant list.
- Optional accounts (email + password), saved account room history, and guest room access.
- Optional peer-to-peer voice chat using WebRTC (microphone permission required).
- Responsive dark KESEX+ interface.

## Run locally
Requires Node.js 20+.

```bash
npm install
npm start
```

Open http://localhost:3000. To test with friends on the same Wi-Fi, use your computer's LAN IP and allow port 3000 through the firewall.

## Important deployment notes
- Set a long random `SESSION_SECRET` environment variable before public deployment. The fallback secret is for local testing only.
- Deploy on a Node.js host with persistent WebSocket support and persistent disk, because account and room-history JSON files and uploads are stored locally in `data/` and `uploads/`.
- Use HTTPS in production. Browsers require a secure context (HTTPS or localhost) for microphone access.
- WebRTC voice chat uses a public STUN server. Some restrictive networks require a TURN server; configure one for reliable cross-network voice.
- The included peer-to-peer voice mesh is intended for small rooms. For larger rooms use an SFU such as LiveKit or mediasoup.
- This starter stores accounts in JSON files and has no email verification, password reset, admin moderation, distributed database, rate limiting, upload malware scanning, or multi-instance coordination. Add these before a public launch.
- Video URLs must be direct video files or sources that permit embedding. Arbitrary Netflix/streaming pages do not become playable by pasting their page URL; DRM and platform restrictions are not bypassed.
- Only upload or share content you have permission to use.
