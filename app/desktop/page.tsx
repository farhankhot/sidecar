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
