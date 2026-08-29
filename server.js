const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const { WebSocketServer } = require('ws');
const { customAlphabet } = require('nanoid');

const dev = process.env.NODE_ENV !== 'production';
const hostname = '0.0.0.0';
const port = parseInt(process.env.PORT || '43123', 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// Generate 6-character room codes using uppercase letters and numbers
const generateRoomCode = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 6);

// Room storage: { roomCode: { host, speakers: Set, state, lastActivity } }
const rooms = new Map();

// Cleanup inactive rooms (2 hours)
const ROOM_TIMEOUT = 2 * 60 * 60 * 1000;
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms.entries()) {
    if (now - room.lastActivity > ROOM_TIMEOUT) {
      console.log(`Cleaning up inactive room: ${code}`);
      rooms.delete(code);
    }
  }
}, 60000); // Check every minute

app.prepare().then(() => {
  const server = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error handling request:', err);
      res.statusCode = 500;
      res.end('Internal server error');
    }
  });

  const wss = new WebSocketServer({ server });

  wss.on('connection', (ws) => {
    let currentRoom = null;
    let role = null;

    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message.toString());
        
        switch (data.type) {
          case 'create_room': {
            const roomCode = generateRoomCode();
            rooms.set(roomCode, {
              host: ws,
              speakers: new Set(),
              state: {
                videoId: data.videoId || null,
                isPlaying: false,
                currentTime: 0,
                playbackRate: 1,
                volume: 100
              },
              lastActivity: Date.now()
            });
            
            currentRoom = roomCode;
            role = 'host';
            
            ws.send(JSON.stringify({
              type: 'room_created',
              roomCode
            }));
            
            console.log(`Room created: ${roomCode}`);
            break;
          }

          case 'join_room': {
            const room = rooms.get(data.roomCode);
            
            if (!room) {
              ws.send(JSON.stringify({
                type: 'error',
                message: 'Room not found'
              }));
              break;
            }

            room.speakers.add(ws);
            room.lastActivity = Date.now();
            currentRoom = data.roomCode;
            role = 'speaker';

            ws.send(JSON.stringify({
              type: 'room_joined',
              roomCode: data.roomCode,
              state: room.state
            }));

            console.log(`Speaker joined room: ${data.roomCode}`);
            break;
          }

          case 'update_state': {
            const room = rooms.get(currentRoom);
            
            if (!room) {
              ws.send(JSON.stringify({
                type: 'error',
                message: 'Room not found'
              }));
              break;
            }

            room.lastActivity = Date.now();

            // Update room state
            if (data.videoId !== undefined) room.state.videoId = data.videoId;
            if (data.isPlaying !== undefined) room.state.isPlaying = data.isPlaying;
            if (data.currentTime !== undefined) room.state.currentTime = data.currentTime;
            if (data.playbackRate !== undefined) room.state.playbackRate = data.playbackRate;
            if (data.volume !== undefined) room.state.volume = data.volume;

            // Broadcast to all clients (host and speakers)
            const update = {
              type: 'state_update',
              state: room.state,
              timestamp: Date.now()
            };

            const updateStr = JSON.stringify(update);

            if (room.host && room.host.readyState === 1) {
              room.host.send(updateStr);
            }

            room.speakers.forEach((speaker) => {
              if (speaker.readyState === 1) {
                speaker.send(updateStr);
              }
            });

            break;
          }

          case 'heartbeat': {
            const room = rooms.get(currentRoom);
            if (room) {
              room.lastActivity = Date.now();
              
              // Host sends heartbeat with current time
              if (role === 'host' && data.currentTime !== undefined) {
                room.state.currentTime = data.currentTime;
                room.state.isPlaying = data.isPlaying;

                const update = {
                  type: 'heartbeat_sync',
                  currentTime: data.currentTime,
                  isPlaying: data.isPlaying,
                  timestamp: Date.now()
                };

                const updateStr = JSON.stringify(update);
                
                room.speakers.forEach((speaker) => {
                  if (speaker.readyState === 1) {
                    speaker.send(updateStr);
                  }
                });
              }
            }
            break;
          }
        }
      } catch (err) {
        console.error('Error processing message:', err);
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Invalid message format'
        }));
      }
    });

    ws.on('close', () => {
      if (currentRoom) {
        const room = rooms.get(currentRoom);
        
        if (room) {
          if (role === 'host' && room.host === ws) {
            // Host disconnected, clean up room
            console.log(`Host disconnected, closing room: ${currentRoom}`);
            
            room.speakers.forEach((speaker) => {
              if (speaker.readyState === 1) {
                speaker.send(JSON.stringify({
                  type: 'room_closed',
                  message: 'Host disconnected'
                }));
                speaker.close();
              }
            });
            
            rooms.delete(currentRoom);
          } else if (role === 'speaker') {
            // Speaker disconnected
            room.speakers.delete(ws);
            console.log(`Speaker disconnected from room: ${currentRoom}`);
          }
        }
      }
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
    });
  });

  server.listen(port, hostname, (err) => {
    if (err) throw err;
    console.log(`> Ready on http://${hostname}:${port}`);
  });
});
