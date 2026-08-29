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
