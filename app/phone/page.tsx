'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { createWebSocket, type RoomState } from '@/lib/websocket';
import PhonePlayer from '@/app/components/PhonePlayer';

function PhoneContent() {
  const searchParams = useSearchParams();
  const [roomCode, setRoomCode] = useState(searchParams.get('code') || '');
  const [isJoined, setIsJoined] = useState(false);
  const [roomState, setRoomState] = useState<RoomState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  
  const wsRef = useRef<WebSocket | null>(null);

  const joinRoom = (code: string) => {
    if (!code.trim()) {
      setError('Please enter a room code');
      return;
    }

    const ws = createWebSocket('/ws');
    wsRef.current = ws;

    ws.onopen = () => {
      setConnectionStatus('connected');
      ws.send(JSON.stringify({
        type: 'join_room',
        roomCode: code.toUpperCase()
      }));
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      if (data.type === 'room_joined') {
        setIsJoined(true);
        setRoomState(data.state);
        setError(null);
      } else if (data.type === 'state_update') {
        setRoomState(data.state);
      } else if (data.type === 'heartbeat_sync') {
        setRoomState(prev => prev ? {
          ...prev,
          currentTime: data.currentTime,
          isPlaying: data.isPlaying
        } : null);
      } else if (data.type === 'error') {
        setError(data.message);
        setConnectionStatus('disconnected');
      } else if (data.type === 'room_closed') {
        setError('Host disconnected. Room closed.');
        setIsJoined(false);
        setConnectionStatus('disconnected');
      }
    };

    ws.onerror = () => {
      setConnectionStatus('disconnected');
      setError('Connection error. Please try again.');
    };

    ws.onclose = () => {
      setConnectionStatus('disconnected');
      if (isJoined) {
        setError('Connection lost. Please rejoin.');
        setIsJoined(false);
      }
    };
  };

  useEffect(() => {
    const code = searchParams.get('code');
    if (code) {
      setRoomCode(code);
      joinRoom(code);
    }

    return () => {
      wsRef.current?.close();
    };
  }, []);

  const handleJoinRoom = () => {
    joinRoom(roomCode);
  };

  const handleStateUpdate = (state: Partial<RoomState>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'update_state',
        ...state
      }));
    }
  };

  const handleUnlockAudio = () => {
    setAudioUnlocked(true);
  };

  if (!isJoined || !roomState) {
    return (
      <div className="flex flex-col h-screen items-center justify-center px-6">
        <div className="max-w-sm w-full space-y-6">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold mb-2">Sidecar</h1>
            <p className="text-zinc-400">Join a room to start listening</p>
          </div>

          <div className="space-y-3">
            <input
              type="text"
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && handleJoinRoom()}
              placeholder="Enter room code"
              maxLength={6}
              className="w-full px-4 py-4 bg-zinc-900 border border-zinc-700 rounded-lg focus:outline-none focus:border-zinc-500 text-center text-2xl font-mono tracking-wider uppercase"
            />
            
            <button
              onClick={handleJoinRoom}
              disabled={!roomCode.trim() || connectionStatus === 'connecting'}
              className="w-full px-6 py-4 bg-white text-zinc-950 rounded-lg font-semibold hover:bg-zinc-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-lg"
            >
              {connectionStatus === 'connecting' ? 'Connecting...' : 'Join Room'}
            </button>
          </div>

          {error && (
            <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm text-center">
              {error}
            </div>
          )}

          <div className="pt-6 text-center text-sm text-zinc-500">
            <p>Scan the QR code from your desktop or enter the 6-character room code above.</p>
          </div>
        </div>
      </div>
    );
  }

  if (!audioUnlocked) {
    return (
      <div className="flex flex-col h-screen items-center justify-center px-6 bg-zinc-950">
        <div className="max-w-sm w-full text-center space-y-6">
          <div className="w-20 h-20 mx-auto bg-zinc-800 rounded-full flex items-center justify-center">
            <svg className="w-10 h-10 text-white" fill="currentColor" viewBox="0 0 20 20">
              <path d="M18 3a1 1 0 00-1.196-.98l-10 2A1 1 0 006 5v9.114A4.369 4.369 0 005 14c-1.657 0-3 .895-3 2s1.343 2 3 2 3-.895 3-2V7.82l8-1.6v5.894A4.37 4.37 0 0015 12c-1.657 0-3 .895-3 2s1.343 2 3 2 3-.895 3-2V3z" />
            </svg>
          </div>

          <div>
            <h2 className="text-2xl font-bold mb-2">Ready to Listen</h2>
            <p className="text-zinc-400">
              Tap below to unlock audio playback. Keep this tab open while listening.
            </p>
          </div>

          <button
            onClick={handleUnlockAudio}
            className="w-full px-8 py-6 bg-white text-zinc-950 rounded-lg font-bold text-xl hover:bg-zinc-200 transition-colors"
          >
            Start Listening
          </button>

          <div className="pt-4 text-xs text-zinc-600">
            <p>Room: <span className="font-mono font-bold">{roomCode}</span></p>
            <p className="mt-2">iOS Safari: Keep screen on for best results</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <PhonePlayer
      roomCode={roomCode}
      roomState={roomState}
      onStateUpdate={handleStateUpdate}
      connectionStatus={connectionStatus}
    />
  );
}

export default function PhonePage() {
  return (
    <Suspense fallback={
      <div className="flex h-screen items-center justify-center">
        <div className="text-zinc-400">Loading...</div>
      </div>
    }>
      <PhoneContent />
    </Suspense>
  );
}
