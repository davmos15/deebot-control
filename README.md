# Deebot Control

Mobile-friendly web app for controlling Ecovacs Deebot robot vacuums. Log in with your Ecovacs account and control your robot from any device.

**Live app:** https://deebot-control-production.up.railway.app

## Features

### Dashboard
- Real-time battery level and status monitoring
- Clean, Stop, Pause, Charge, Find, and Relocate controls
- Suction power selector (Quiet, Standard, Max, Max+)
- Touch joystick for manual movement (with D-pad toggle)
- Live map with robot position (tap for fullscreen with joystick overlay)
- Current room and position tracking
- Consumable life tracking (main brush, side brush, filter)

### Audio Lab
- Soundboard with 31 built-in sound IDs
- Volume slider (0-100)
- Voice prompts toggle
- Voice assistant toggle
- Bluetooth speaker mode toggle
- Custom voice pack upload (experimental)
- Debug log for all command responses

### Multi-User
- No hardcoded credentials - each user logs in with their own Ecovacs account
- Sessions auto-expire after 4 hours
- Share the URL with anyone who has an Ecovacs account

## Tech Stack

- **Backend:** Node.js, Express 5, [ecovacs-deebot.js](https://github.com/mrbungle64/ecovacs-deebot.js)
- **Frontend:** Vanilla HTML/CSS/JS (no build step)
- **Map rendering:** Server-side via `canvas` native module
- **Deployment:** Docker on Railway

## Running Locally

```bash
git clone https://github.com/davmos15/deebot-control.git
cd deebot-control
npm install
node server.js
```

Open http://localhost:3001 in your browser.

Note: The live map requires the native `canvas` module which needs system libraries (cairo, pango, etc.). On Linux/macOS this usually works. On Windows it may not compile - the app works fine without it, you just won't get the map image.

## Deploying

### Railway (recommended)

The project includes a Dockerfile that installs all native dependencies.

1. Fork or push this repo to GitHub
2. Create a new project on [Railway](https://railway.app)
3. Connect your GitHub repo
4. Railway auto-detects the Dockerfile and deploys
5. Add a public domain in Settings > Networking

### Other platforms

Any platform that supports Docker will work (Render, Fly.io, etc.). The Dockerfile handles all native dependency installation.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/login` | Login with Ecovacs credentials |
| POST | `/api/logout` | Destroy session |
| GET | `/api/state` | Get robot status, battery, position, consumables |
| GET | `/api/map` | Get map as PNG image |
| POST | `/api/clean` | Start cleaning (supports mode: auto, spot, edge) |
| POST | `/api/stop` | Stop cleaning |
| POST | `/api/pause` | Pause cleaning |
| POST | `/api/charge` | Return to dock |
| POST | `/api/move` | Manual movement (direction: forward, backward, left, right) |
| POST | `/api/playSound` | Play a sound (sid: 0-30) |
| POST | `/api/setSuction` | Set suction (level: quiet, standard, max, max+) |
| POST | `/api/setVolume` | Set volume (value: 0-100) |
| POST | `/api/setBlueSpeaker` | Toggle bluetooth speaker |
| POST | `/api/setVoiceSimple` | Toggle voice prompts |
| POST | `/api/setVoiceAssistant` | Toggle voice assistant |
| GET | `/api/audioInfo` | Query audio settings |
| GET | `/health` | Health check |

## License

MIT
