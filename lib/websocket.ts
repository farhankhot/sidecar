export interface RoomState {
  videoId: string | null;
  isPlaying: boolean;
  currentTime: number;
  playbackRate: number;
  volume: number;
}

export interface WebSocketMessage {
  type: string;
  [key: string]: any;
}

export function createWebSocket(url: string): WebSocket {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}${url}`;
  return new WebSocket(wsUrl);
}
