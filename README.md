# KESEX+ Cloudflare starter

This is an early Cloudflare Workers + Durable Objects prototype. It provides room creation, room links, WebSocket chat, participant list, and basic synchronized playback for direct video URLs.

## Deploy
- Connect this repository to Cloudflare Workers Builds.
- Build command: leave blank.
- Deploy command: `npx wrangler deploy`.
- Ensure the repository root contains `wrangler.jsonc`, `package.json`, `src/index.js`, and `public/index.html`.

## Important limitations
- A local file selected in the browser is only available on that device. For shared playback, use a public direct video URL that permits embedding and supports browser playback.
- This is a prototype, not production-ready: no accounts, moderation, durable chat history, TURN service, or abuse protections.
- Test on two devices before relying on it. Browser autoplay restrictions may require each participant to tap Play once.
- Cloudflare usage limits and plan terms apply. Do not assume unlimited free hosting or storage.
