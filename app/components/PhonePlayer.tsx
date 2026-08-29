'use client';

import { useEffect, useRef, useState } from 'react';
import type { RoomState } from '@/lib/websocket';

interface YouTubePlayer {
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  getPlayerState: () => number;
  setPlaybackRate: (rate: number) => void;
  setVolume: (volume: number) => void;
  unMute: () => void;
}

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

interface PhonePlayerProps {
  roomCode: string;
  roomState: RoomState;
  onStateUpdate: (state: Partial<RoomState>) => void;
  connectionStatus: string;
}

export default function PhonePlayer({ roomCode, roomState, onStateUpdate, connectionStatus }: PhonePlayerProps) {
  const playerRef = useRef<YouTubePlayer | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const syncCheckRef = useRef<NodeJS.Timeout | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [localPlaying, setLocalPlaying] = useState(false);
  const [localTime, setLocalTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [syncStatus, setSyncStatus] = useState<'synced' | 'syncing'>('synced');
  const [embedError, setEmbedError] = useState<string | null>(null);

  useEffect(() => {
    if (!roomState.videoId || !containerRef.current) return;

    const loadYouTubeAPI = () => {
      if (window.YT && window.YT.Player) {
        initPlayer();
        return;
      }

      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);

      window.onYouTubeIframeAPIReady = () => {
        initPlayer();
      };
    };

    const initPlayer = () => {
      if (!containerRef.current) return;

      const player = new window.YT.Player(containerRef.current, {
        height: '100%',
        width: '100%',
        videoId: roomState.videoId,
        playerVars: {
          autoplay: 0,
          controls: 0,
          disablekb: 1,
          fs: 0,
          modestbranding: 1,
          rel: 0,
        },
        events: {
          onReady: (event: any) => {
            playerRef.current = event.target;
            event.target.unMute();
            event.target.setVolume(roomState.volume || 100);
            event.target.setPlaybackRate(roomState.playbackRate || 1);
            
            if (roomState.currentTime > 0) {
              event.target.seekTo(roomState.currentTime, true);
            }
            
            setIsReady(true);
            setDuration(event.target.getDuration());
            setEmbedError(null);

            if (roomState.isPlaying) {
              event.target.playVideo();
            }

            startSyncCheck();
          },
          onStateChange: (event: any) => {
            const playing = event.data === window.YT.PlayerState.PLAYING;
            setLocalPlaying(playing);
            setLocalTime(event.target.getCurrentTime());
          },
          onError: (event: any) => {
            console.error('YouTube player error:', event.data);
            if (event.data === 101 || event.data === 150) {
              setEmbedError('This video cannot be embedded. Please try another video.');
            } else {
              setEmbedError('Failed to load video. Please try another one.');
            }
          }
        }
      });
    };

    loadYouTubeAPI();

    return () => {
      stopSyncCheck();
      if (playerRef.current) {
        try {
          (playerRef.current as any).destroy?.();
        } catch (e) {
          console.error('Error destroying player:', e);
        }
      }
    };
  }, [roomState.videoId]);

  const startSyncCheck = () => {
    stopSyncCheck();
    
    syncCheckRef.current = setInterval(() => {
      if (playerRef.current && roomState) {
        const currentTime = playerRef.current.getCurrentTime();
        const drift = Math.abs(currentTime - roomState.currentTime);
        
        setLocalTime(currentTime);

        // Sync if drift is more than 400ms
        if (drift > 0.4) {
          setSyncStatus('syncing');
          playerRef.current.seekTo(roomState.currentTime, true);
          setTimeout(() => setSyncStatus('synced'), 1000);
        }

        // Sync playing state
        const isPlaying = playerRef.current.getPlayerState() === window.YT.PlayerState.PLAYING;
        if (isPlaying !== roomState.isPlaying) {
          if (roomState.isPlaying) {
            playerRef.current.playVideo();
