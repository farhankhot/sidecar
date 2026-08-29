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
  getPlaybackRate: () => number;
  mute: () => void;
  isMuted: () => boolean;
}

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

interface DesktopPlayerProps {
  videoId: string;
  onStateUpdate: (state: Partial<RoomState>) => void;
  onHeartbeat: (currentTime: number, isPlaying: boolean) => void;
}

export default function DesktopPlayer({ videoId, onStateUpdate, onHeartbeat }: DesktopPlayerProps) {
  const playerRef = useRef<YouTubePlayer | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const heartbeatRef = useRef<NodeJS.Timeout | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [volume, setVolume] = useState(100);
  const [embedError, setEmbedError] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

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
        videoId: videoId,
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
            event.target.mute();
            setIsReady(true);
            setDuration(event.target.getDuration());
            setEmbedError(null);
          },
          onStateChange: (event: any) => {
            const playing = event.data === window.YT.PlayerState.PLAYING;
            setIsPlaying(playing);
            
            if (playing) {
              startHeartbeat();
            } else {
              stopHeartbeat();
              const time = event.target.getCurrentTime();
              setCurrentTime(time);
              onStateUpdate({ isPlaying: false, currentTime: time });
            }
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
      stopHeartbeat();
      if (playerRef.current) {
        try {
          (playerRef.current as any).destroy?.();
        } catch (e) {
          console.error('Error destroying player:', e);
        }
      }
    };
  }, [videoId]);

  const startHeartbeat = () => {
    stopHeartbeat();
    
    heartbeatRef.current = setInterval(() => {
      if (playerRef.current) {
        const time = playerRef.current.getCurrentTime();
        const playing = playerRef.current.getPlayerState() === window.YT.PlayerState.PLAYING;
        setCurrentTime(time);
        onHeartbeat(time, playing);
      }
    }, 1000);
  };

  const stopHeartbeat = () => {
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
  };

  const handlePlayPause = () => {
    if (!playerRef.current) return;
    
    const playing = playerRef.current.getPlayerState() === window.YT.PlayerState.PLAYING;
    
    if (playing) {
