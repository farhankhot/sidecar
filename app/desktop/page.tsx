'use client';

import { useState, useEffect, useRef } from 'react';
import { parseYouTubeUrl } from '@/lib/youtube';
import { createWebSocket, type RoomState } from '@/lib/websocket';
import DesktopPlayer from '@/app/components/DesktopPlayer';
import QRCode from 'qrcode';

export default function DesktopPage() {
  const [videoUrl, setVideoUrl] = useState('');
  const [videoId, setVideoId] = useState<string | null>(null);
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [joinUrl, setJoinUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [remotePlay, setRemotePlay] = useState<{ isPlaying: boolean; currentTime: number } | null>(null);
  
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    // Connect WebSocket when component mounts
    const ws = createWebSocket('/ws');
    wsRef.current = ws;

    ws.onopen = () => {
      setConnectionStatus('connected');
      // Create room immediately
      ws.send(JSON.stringify({ type: 'create_room' }));
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      if (data.type === 'room_created') {
        setRoomCode(data.roomCode);
      } else if (data.type === 'state_update' && data.state) {
        setRemotePlay({ isPlaying: !!data.state.isPlaying, currentTime: data.state.currentTime || 0 });
      } else if (data.type === 'error') {
        setError(data.message);
      }
    };

    ws.onerror = () => {
      setConnectionStatus('disconnected');
      setError('Connection error. Please refresh the page.');
    };

    ws.onclose = () => {
      setConnectionStatus('disconnected');
    };

    return () => {
      ws.close();
    };
  }, []);

  useEffect(() => {
    // Generate QR code and join URL when room code changes
    if (!roomCode) return;
    
    const url = `${window.location.origin}/phone?code=${roomCode}`;
    setJoinUrl(url);
    
    QRCode.toDataURL(url, { width: 256, margin: 2 })
      .then(setQrCodeUrl)
      .catch(console.error);
  }, [roomCode]);

  const handleLoadVideo = () => {
    const parsedVideoId = parseYouTubeUrl(videoUrl);
    
    if (!parsedVideoId) {
      setError('Invalid YouTube URL or video ID');
      return;
    }

    setVideoId(parsedVideoId);
    setError(null);

    // Send video ID to room
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'update_state',
        videoId: parsedVideoId
      }));
    }
  };

  const handleStateUpdate = (state: Partial<RoomState>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'update_state',
        ...state
      }));
    }
  };

  const handleHeartbeat = (currentTime: number, isPlaying: boolean) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'heartbeat',
        currentTime,
        isPlaying
      }));
    }
  };

  return (
    <div className="flex flex-col h-screen">
      <header className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
        <h1 className="text-xl font-semibold">Sidecar Desktop</h1>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${
            connectionStatus === 'connected' ? 'bg-green-500' :
            connectionStatus === 'connecting' ? 'bg-yellow-500' :
            'bg-red-500'
          }`} />
          <span className="text-sm text-zinc-400">
            {connectionStatus === 'connected' ? 'Connected' :
             connectionStatus === 'connecting' ? 'Connecting...' :
             'Disconnected'}
          </span>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Main player area */}
        <div className="flex-1 flex flex-col">
          {!videoId ? (
            <div className="flex-1 flex items-center justify-center p-8">
              <div className="max-w-xl w-full space-y-4">
                <h2 className="text-2xl font-semibold mb-6">Paste a YouTube URL</h2>
                
                <div className="space-y-2">
                  <input
                    type="text"
                    value={videoUrl}
                    onChange={(e) => setVideoUrl(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleLoadVideo()}
                    placeholder="https://youtube.com/watch?v=... or video ID"
                    className="w-full px-4 py-3 bg-zinc-900 border border-zinc-700 rounded-lg focus:outline-none focus:border-zinc-500"
                  />
                  
                  <button
                    onClick={handleLoadVideo}
                    disabled={!videoUrl.trim()}
                    className="w-full px-4 py-3 bg-white text-zinc-950 rounded-lg font-medium hover:bg-zinc-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Load Video
                  </button>
                </div>

                {error && (
                  <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
                    {error}
                  </div>
                )}

                <div className="pt-4 text-sm text-zinc-500">
                  <p>Supports:</p>
                  <ul className="list-disc list-inside mt-2 space-y-1">
                    <li>youtube.com/watch?v=...</li>
                    <li>youtu.be/...</li>
                    <li>youtube.com/shorts/...</li>
                    <li>Direct video ID (11 characters)</li>
                  </ul>
                </div>
              </div>
            </div>
          ) : (
            <DesktopPlayer
              videoId={videoId}
              onStateUpdate={handleStateUpdate}
              onHeartbeat={handleHeartbeat}
              remotePlay={remotePlay}
            />
          )}
        </div>

        {/* Sidebar with room info */}
        <div className="w-80 border-l border-zinc-800 p-6 space-y-6 overflow-y-auto">
          <div>
            <h3 className="text-sm font-semibold text-zinc-400 mb-3">ROOM CODE</h3>
            {roomCode ? (
              <div className="p-4 bg-zinc-900 rounded-lg text-center">
                <div className="text-4xl font-mono font-bold tracking-wider">
                  {roomCode}
                </div>
              </div>
            ) : (
              <div className="p-4 bg-zinc-900 rounded-lg text-center text-zinc-500">
                Generating...
              </div>
            )}
          </div>

          <div>
            <h3 className="text-sm font-semibold text-zinc-400 mb-3">QR CODE</h3>
            {qrCodeUrl ? (
              <div className="p-4 bg-white rounded-lg">
                <img src={qrCodeUrl} alt="QR Code" className="w-full" />
              </div>
            ) : (
              <div className="aspect-square bg-zinc-900 rounded-lg flex items-center justify-center text-zinc-500">
                Generating...
              </div>
            )}
          </div>

          {joinUrl && (
            <div>
              <h3 className="text-sm font-semibold text-zinc-400 mb-3">JOIN URL</h3>
              <div className="p-3 bg-zinc-900 rounded-lg">
                <input
                  type="text"
                  value={joinUrl}
                  readOnly
                  className="w-full bg-transparent text-xs text-zinc-300 focus:outline-none select-all"
                  onClick={(e) => e.currentTarget.select()}
                />
              </div>
              <p className="text-xs text-zinc-600 mt-2">
                Click to select and copy
              </p>
            </div>
          )}

          <div className="pt-4 border-t border-zinc-800">
            <h3 className="text-sm font-semibold text-zinc-400 mb-2">JOIN ON PHONE</h3>
            <ol className="text-sm text-zinc-500 space-y-2">
              <li>1. Scan the QR code or open the URL above</li>
              <li>2. Enter room code if needed</li>
              <li>3. Tap "Start Listening"</li>
              <li>4. Keep Safari in foreground</li>
            </ol>
          </div>

          <div className="pt-4 border-t border-zinc-800">
            <p className="text-xs text-zinc-600">
              Room expires after 2 hours of inactivity.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
