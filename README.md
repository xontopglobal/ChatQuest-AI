# ChatQuest AI

Your chat. Your choices. Your adventure.

ChatQuest AI is an interactive adventure dashboard for Twitch livestreams. The current build includes local adventure controls, preview voting, a browser-source overlay, an Express API, Socket.IO readiness, and SQLite-backed adventure sessions and vote totals. Real Twitch OAuth/EventSub, AI story generation, and Twitch viewer identity validation are not implemented yet.

## Requirements

- Node.js 20.19+ or 22.12+
- npm 10+

## Run locally

```powershell
npm install
npm run dev
```

Open the Vite URL printed in the terminal (normally `http://localhost:5173`). The Express API listens on port `3001`.

The server loads configuration from a project-root `.env` file only. Copy `.env.example` to `.env` when you need to configure it. Keep credentials server-side and never prefix them with `VITE_`. SQLite data is stored at `data/chatquest.sqlite` by default; override this with `SQLITE_PATH`.

## Checks

```powershell
npm test
npm run typecheck
npm run build
```

The tests cover the health endpoint, Socket.IO readiness, local adventure lifecycle and voting endpoints, SQLite persistence across reopen, and server configuration parsing. No Twitch or OpenAI credentials are required to run the local preview.

## Planned phases

1. Local dashboard, SQLite persistence, API, realtime health signal, and developer checks.
2. Twitch OAuth with server-side token storage and validation, then EventSub WebSocket chat events.
3. One-vote-per-viewer validation and AI-generated branching stories with validated responses and a safe fallback.
4. Live OBS overlay updates, deployment hardening, and end-to-end verification.

To prepare Twitch integration, register a Twitch application and set `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`, and the exactly matching `TWITCH_REDIRECT_URI` in the server-only `.env`. OAuth and EventSub are still incomplete and the Connect Twitch action must not be treated as authentication. Set `OPENAI_API_KEY` server-side only when AI generation is implemented. Preview votes do not identify Twitch viewers and do not enforce one vote per person.
