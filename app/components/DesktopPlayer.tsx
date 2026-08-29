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
  remotePlay?: { isPlaying: boolean; currentTime: number } | null;
}

export default function DesktopPlayer({ videoId, onStateUpdate, onHeartbeat, remotePlay }: DesktopPlayerProps) {
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
          mute: 1,
          controls: 1,
          playsinline: 1,
          origin: typeof window !== "undefined" ? window.location.origin : "",
          rel: 0,
          modestbranding: 1,
        },
        events: {
          onReady: (event: any) => {
            playerRef.current = event.target;
            event.target.mute();
            setIsReady(true);
            setDuration(event.target.getDuration() || 0);
            setEmbedError(null);
          },
          onStateChange: (event: any) => {
            const YTState = window.YT.PlayerState;
            const time = event.target.getCurrentTime();
            setCurrentTime(time);
            if (event.data === YTState.PLAYING) {
              setIsPlaying(true);
              startHeartbeat();
              onStateUpdate({ isPlaying: true, currentTime: time });
            } else if (event.data === YTState.PAUSED || event.data === YTState.ENDED) {
              setIsPlaying(false);
              stopHeartbeat();
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

  useEffect(() => {
    if (!remotePlay || !isReady || !playerRef.current || !window.YT) return;
    playerRef.current.mute();
    const st = playerRef.current.getPlayerState();
    const YTState = window.YT.PlayerState;
    if (remotePlay.isPlaying) {
      if (st !== YTState.PLAYING && st !== YTState.BUFFERING) {
        playerRef.current.playVideo();
      }
    } else if (st === YTState.PLAYING) {
      playerRef.current.pauseVideo();
    }
  }, [remotePlay, isReady]);

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
      playerRef.current.pauseVideo();
      const time = playerRef.current.getCurrentTime();
      onStateUpdate({ isPlaying: false, currentTime: time });
    } else {
      playerRef.current.playVideo();
      onStateUpdate({ isPlaying: true, currentTime: playerRef.current.getCurrentTime() });
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!playerRef.current) return;
    
    const time = parseFloat(e.target.value);
    setCurrentTime(time);
    playerRef.current.seekTo(time, true);
    onStateUpdate({ currentTime: time });
  };

  const handlePlaybackRateChange = (rate: number) => {
    if (!playerRef.current) return;
    
    playerRef.current.setPlaybackRate(rate);
    setPlaybackRate(rate);
    onStateUpdate({ playbackRate: rate });
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const vol = parseInt(e.target.value);
    setVolume(vol);
    onStateUpdate({ volume: vol });
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (embedError) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="max-w-md text-center space-y-4">
          <div className="w-16 h-16 mx-auto bg-red-500/10 rounded-full flex items-center justify-center">
            <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className="text-xl font-semibold text-red-400">Embedding Restricted</h3>
          <p className="text-zinc-400">{embedError}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-2 bg-zinc-800 rounded-lg hover:bg-zinc-700 transition-colors"
          >
            Try Another Video
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col">
      {/* Video player */}
      <div className="flex-1 bg-black relative">
        <div ref={containerRef} className="absolute inset-0" />
        
        {!isReady && (
          <div className="absolute inset-0 flex items-center justify-center bg-zinc-900">
            <div className="text-zinc-500">Loading video...</div>
          </div>
        )}

        {isReady && (
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4">
            <div className="text-xs text-zinc-400 mb-2">
              🔇 MUTED (audio on phone)
            </div>
          </div>
        )}
      </div>

      {/* Controls */}
      {isReady && (
        <div className="bg-zinc-900 border-t border-zinc-800 p-6 space-y-4">
          {/* Seek bar */}
          <div className="space-y-2">
            <input
              type="range"
              min="0"
              max={duration}
              value={currentTime}
              onChange={handleSeek}
              className="w-full h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer slider"
              style={{
                background: `linear-gradient(to right, white ${(currentTime / duration) * 100}%, rgb(63 63 70) ${(currentTime / duration) * 100}%)`
              }}
            />
            <div className="flex justify-between text-sm text-zinc-400">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          {/* Control buttons */}
          <div className="flex items-center gap-4">
            <button
              onClick={handlePlayPause}
              className="w-14 h-14 bg-white text-zinc-950 rounded-full flex items-center justify-center hover:bg-zinc-200 transition-colors"
            >
              {isPlaying ? (
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              ) : (
                <svg className="w-6 h-6 ml-1" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                </svg>
              )}
            </button>

            <div className="flex-1 grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">Speed</label>
                <select
                  value={playbackRate}
                  onChange={(e) => handlePlaybackRateChange(parseFloat(e.target.value))}
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm focus:outline-none focus:border-zinc-500"
                >
                  <option value="0.25">0.25x</option>
                  <option value="0.5">0.5x</option>
                  <option value="0.75">0.75x</option>
                  <option value="1">1x</option>
                  <option value="1.25">1.25x</option>
                  <option value="1.5">1.5x</option>
                  <option value="1.75">1.75x</option>
                  <option value="2">2x</option>
                </select>
              </div>

              <div>
                <label className="text-xs text-zinc-400 mb-1 block">Phone Volume</label>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={volume}
                    onChange={handleVolumeChange}
                    className="flex-1 h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer"
                  />
                  <span className="text-sm text-zinc-400 w-10 text-right">{volume}%</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
