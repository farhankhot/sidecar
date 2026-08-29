# Sidecar

Watch YouTube on your desktop (muted), hear the audio on your phone. Perfect sync, no downloads.

## Features

- **Desktop Host**: Paste a YouTube URL, watch video muted
- **Phone Speaker**: Join via QR code or room code, hear the audio
- **Perfect Sync**: Sub-500ms synchronization between devices
- **Simple Rooms**: 6-character room codes, no accounts required
- **iOS Safari Support**: Works as a PWA on iPhone
- **Full Controls**: Play, pause, seek, and adjust playback speed from either device
- **Legal**: Uses official YouTube IFrame API (no audio extraction)

## How It Works

1. Open Sidecar on your desktop at `/desktop`
2. Paste a YouTube URL or video ID
3. Scan the QR code with your phone or manually enter the room code at `/phone`
4. Tap "Start Listening" on your phone to unlock audio
5. Watch and listen in perfect sync!

## Tech Stack

- **Framework**: Next.js 16 with App Router
- **Real-time**: WebSocket (ws library)
- **Sync**: YouTube IFrame Player API
- **Styling**: Tailwind CSS
- **Deployment**: Docker + Render.yaml included

## Quick Start

**Deploy your own instance** (free, no credit card needed):

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/farhankhot/sidecar)

Or manually:
1. Go to [render.com](https://render.com) and sign up (free)
2. Click "New +" → "Web Service"
3. Connect this GitHub repo: `https://github.com/farhankhot/sidecar`
4. Render will auto-detect the `render.yaml` config
5. Click "Create Web Service"
6. Wait 2-3 minutes for deployment
7. Open the URL Render provides, add `/desktop` to the path

## Running Locally

```bash
# Install dependencies
npm install

# Start the server
npm start

# Open http://localhost:43123/desktop
```

## Production Deployment

### Using Docker

```bash
# Build the image
docker build -t sidecar .

# Run the container
docker run -p 43123:43123 sidecar
```

### Using Render

1. Push this repo to GitHub
2. Connect to Render
3. Use the included `render.yaml` configuration
4. Deploy!

The app will automatically bind to `0.0.0.0:$PORT` in production.

## iOS Safari Notes

- **Audio Unlock**: iOS requires a user gesture to start audio. Tap "Start Listening" on first load.
- **Background Playback**: Limited in Safari. Keep the tab open and Safari in the foreground while listening.
- **Screen On**: For best results, prevent your phone from sleeping. Playback may pause if Safari loses focus.
- **PWA Support**: Add to Home Screen for a native-like experience with `apple-mobile-web-app-capable`.

## Room Behavior

- Rooms are created when a desktop host loads
- Rooms expire after 2 hours of inactivity
- If the host disconnects, the room closes
- Only one host per room; multiple speakers supported

## Sync Algorithm

- **Desktop** sends heartbeat every ~1s with current playback time
- **Phone** checks drift every ~1s
- If drift exceeds ~400ms, phone seeks to catch up
- Play/pause/seek commands are broadcast immediately

## Supported YouTube URLs

- `https://youtube.com/watch?v=VIDEO_ID`
- `https://youtu.be/VIDEO_ID`
- `https://youtube.com/shorts/VIDEO_ID`
- Direct 11-character video IDs

## Embed Restrictions

Some videos cannot be embedded due to creator restrictions (error 101/150). If this happens, try another video. The app will show a clear error message.

## License

MIT
