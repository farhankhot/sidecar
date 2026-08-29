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
  const [unlocked, setUnlocked] = useState(false);
  const stateRef = useRef(roomState);
  stateRef.current = roomState;
  const hostClockRef = useRef({ time: 0, at: 0, playing: false, rate: 1 });
  const lastSeekAtRef = useRef(0);

  useEffect(() => {
    hostClockRef.current = {
      time: roomState.currentTime || 0,
      at: Date.now(),
      playing: !!roomState.isPlaying,
      rate: roomState.playbackRate || 1,
    };
  }, [roomState.currentTime, roomState.isPlaying, roomState.playbackRate]);

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
          playsinline: 1,
          origin: window.location.origin,
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

  const expectedHostTime = () => {
    const clock = hostClockRef.current;
    if (!clock.playing) return clock.time;
    return clock.time + ((Date.now() - clock.at) / 1000) * clock.rate;
  };

  const startSyncCheck = () => {
    stopSyncCheck();

    syncCheckRef.current = setInterval(() => {
      const player = playerRef.current;
      const state = stateRef.current;
      if (!player || !state || !window.YT) return;

      const YTState = window.YT.PlayerState;
      const playerState = player.getPlayerState();
      if (playerState === YTState.BUFFERING || playerState === YTState.UNSTARTED) return;

      const currentTime = player.getCurrentTime();
      setLocalTime(currentTime);

      const expected = expectedHostTime();
      const drift = currentTime - expected;

      if (Date.now() - lastSeekAtRef.current < 2500) return;

      if (Math.abs(drift) > 1.25) {
        setSyncStatus('syncing');
        lastSeekAtRef.current = Date.now();
        player.seekTo(Math.max(0, expected), true);
        setTimeout(() => setSyncStatus('synced'), 800);
      } else {
        setSyncStatus('synced');
      }

      const isPlaying = playerState === YTState.PLAYING;
      if (state.isPlaying && !isPlaying) {
        player.playVideo();
      } else if (!state.isPlaying && isPlaying) {
        player.pauseVideo();
      }
    }, 1500);
  };

  const stopSyncCheck = () => {
    if (syncCheckRef.current) {
      clearInterval(syncCheckRef.current);
      syncCheckRef.current = null;
    }
  };

  useEffect(() => {
    if (!unlocked || !isReady || !playerRef.current || !window.YT) return;
    const st = playerRef.current.getPlayerState();
    const YTState = window.YT.PlayerState;
    if (roomState.isPlaying) {
      if (st !== YTState.PLAYING && st !== YTState.BUFFERING) {
        playerRef.current.playVideo();
      }
    } else if (st === YTState.PLAYING) {
      playerRef.current.pauseVideo();
    }
  }, [roomState.isPlaying, unlocked, isReady]);

  useEffect(() => {
    if (!unlocked || !isReady || !playerRef.current) return;
    const local = playerRef.current.getCurrentTime();
    const host = roomState.currentTime || 0;
    if (Math.abs(local - host) > 2.5) {
      lastSeekAtRef.current = Date.now();
      playerRef.current.seekTo(host, true);
    }
  }, [roomState.currentTime, unlocked, isReady]);

  const handleUnlock = () => {
    setUnlocked(true);
    const player = playerRef.current;
    if (!player) return;
    player.unMute();
    player.setVolume(stateRef.current.volume || 100);
    player.seekTo(stateRef.current.currentTime || 0, true);
    player.playVideo();
    if (!stateRef.current.isPlaying) {
      setTimeout(() => {
        if (!stateRef.current.isPlaying) player.pauseVideo();
      }, 80);
    }
  };

  useEffect(() => {
    if (!playerRef.current || !isReady) return;

    // Update volume
    if (roomState.volume !== undefined) {
      playerRef.current.setVolume(roomState.volume);
    }

    // Update playback rate
    if (roomState.playbackRate !== undefined) {
      playerRef.current.setPlaybackRate(roomState.playbackRate);
    }
  }, [roomState.volume, roomState.playbackRate, isReady]);

  const handlePlayPause = () => {
    if (!playerRef.current) return;
    
    const playing = playerRef.current.getPlayerState() === window.YT.PlayerState.PLAYING;
    
    if (playing) {
      playerRef.current.pauseVideo();
      onStateUpdate({ isPlaying: false, currentTime: playerRef.current.getCurrentTime() });
    } else {
      playerRef.current.playVideo();
      onStateUpdate({ isPlaying: true, currentTime: playerRef.current.getCurrentTime() });
    }
  };

  const handleSeek = (seconds: number) => {
    if (!playerRef.current) return;
    playerRef.current.seekTo(seconds, true);
    onStateUpdate({ currentTime: seconds });
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (embedError) {
    return (
      <div className="flex h-screen items-center justify-center p-6">
        <div className="max-w-sm text-center space-y-4">
          <div className="w-16 h-16 mx-auto bg-red-500/10 rounded-full flex items-center justify-center">
            <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className="text-xl font-semibold text-red-400">Embedding Restricted</h3>
          <p className="text-zinc-400 text-sm">{embedError}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex flex-col h-screen bg-zinc-950">
      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div>
          <div className="text-xs text-zinc-500">Room</div>
          <div className="font-mono font-bold text-sm">{roomCode}</div>
        </div>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${
            syncStatus === 'synced' ? 'bg-green-500' : 'bg-yellow-500'
          }`} />
          <span className="text-xs text-zinc-400">
            {syncStatus === 'synced' ? 'In sync' : 'Catching up'}
          </span>
        </div>
      </header>

      {!unlocked && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-zinc-950/95 px-6">
          <button
            onClick={handleUnlock}
            className="w-full max-w-sm px-8 py-6 bg-white text-zinc-950 rounded-lg font-bold text-xl active:scale-95"
          >
            Tap to hear
          </button>
          <p className="mt-4 text-sm text-zinc-400 text-center">
            Required on iPhone. After this, play/pause on the laptop controls the sound here.
          </p>
        </div>
      )}

      {/* In-viewport, near-invisible. Off-screen players get throttled by iOS and stutter. */}
      <div
        aria-hidden
        className="pointer-events-none"
        style={{ position: "fixed", left: 0, bottom: 0, width: 320, height: 180, opacity: 0.01, zIndex: 0 }}
      >
        <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
      </div>

      {/* Main content */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center p-6">
        {!roomState.videoId ? (
          <div className="text-center space-y-4">
            <p className="text-zinc-400">Waiting for a video on the laptop</p>
            <p className="text-xs text-zinc-600">Paste a YouTube link on desktop, then press play</p>
          </div>
        ) : !isReady ? (
          <div className="text-center space-y-4">
            <div className="w-16 h-16 mx-auto bg-zinc-800 rounded-full flex items-center justify-center animate-pulse">
              <svg className="w-8 h-8 text-zinc-400" fill="currentColor" viewBox="0 0 20 20">
                <path d="M18 3a1 1 0 00-1.196-.98l-10 2A1 1 0 006 5v9.114A4.369 4.369 0 005 14c-1.657 0-3 .895-3 2s1.343 2 3 2 3-.895 3-2V7.82l8-1.6v5.894A4.37 4.37 0 0015 12c-1.657 0-3 .895-3 2s1.343 2 3 2 3-.895 3-2V3z" />
              </svg>
            </div>
            <p className="text-zinc-500">Loading audio...</p>
          </div>
        ) : (
          <div className="w-full max-w-sm space-y-8">

            {/* Large play/pause button */}
            <div className="flex justify-center">
              <button
                onClick={handlePlayPause}
                className="w-24 h-24 bg-white text-zinc-950 rounded-full flex items-center justify-center hover:bg-zinc-200 transition-colors shadow-lg active:scale-95"
              >
                {localPlaying ? (
                  <svg className="w-12 h-12" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                ) : (
                  <svg className="w-12 h-12 ml-2" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                  </svg>
                )}
              </button>
            </div>

            {/* Time display */}
            <div className="text-center space-y-2">
              <div className="text-3xl font-mono font-bold">
                {formatTime(localTime)}
              </div>
              <div className="text-sm text-zinc-500">
                {formatTime(duration)}
              </div>
            </div>

            {/* Quick seek buttons */}
            <div className="flex justify-center gap-4">
              <button
                onClick={() => handleSeek(Math.max(0, localTime - 10))}
                className="px-6 py-3 bg-zinc-800 rounded-lg hover:bg-zinc-700 transition-colors active:scale-95"
              >
                <div className="flex items-center gap-2">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm.707-10.293a1 1 0 00-1.414-1.414l-3 3a1 1 0 000 1.414l3 3a1 1 0 001.414-1.414L9.414 11H13a1 1 0 100-2H9.414l1.293-1.293z" clipRule="evenodd" />
                  </svg>
                  <span className="text-sm font-medium">10s</span>
                </div>
              </button>
              
              <button
                onClick={() => handleSeek(Math.min(duration, localTime + 10))}
                className="px-6 py-3 bg-zinc-800 rounded-lg hover:bg-zinc-700 transition-colors active:scale-95"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">10s</span>
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-8.707l-3-3a1 1 0 00-1.414 1.414L10.586 9H7a1 1 0 100 2h3.586l-1.293 1.293a1 1 0 101.414 1.414l3-3a1 1 0 000-1.414z" clipRule="evenodd" />
                  </svg>
                </div>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Footer info */}
      <div className="relative z-10 px-4 py-3 border-t border-zinc-800 text-center">
        <p className="text-xs text-zinc-600">
          Keep this tab open and screen on for uninterrupted audio
        </p>
      </div>
    </div>
  );
}
