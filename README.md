# ♔ Chess Online

A production-ready, real-time multiplayer chess game with rooms and unlimited spectators. Built with React, Node.js, Socket.IO, and Redis.

![Chess Online](https://img.shields.io/badge/version-1.0.0-blue.svg)
![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-green.svg)
![License](https://img.shields.io/badge/license-MIT-blue.svg)

## ✨ Features

- **Real-time Multiplayer**: Play chess with friends in real-time using WebSockets
- **Room System**: Create private or public rooms with unique shareable codes
- **Unlimited Spectators**: Watch games live with real-time board updates
- **FIDE-Compliant Rules**: All official chess rules including castling, en passant, promotion, and draw conditions
- **Server-Side Validation**: All moves validated on the server to prevent cheating
- **Time Controls**: Support for rapid (10+5) and blitz (3+2) formats
- **In-Game Chat**: Communicate with other players and spectators
- **Draw Offers**: Offer, accept, or decline draws
- **Reconnection Support**: Automatic reconnection with grace period
- **Mobile Responsive**: Play on any device

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Client (React)                          │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌───────────┐ │
│  │   Zustand   │ │  Socket.IO  │ │   Chess.js  │ │   React   │ │
│  │    Store    │ │   Client    │ │   (Display) │ │   Router  │ │
│  └─────────────┘ └─────────────┘ └─────────────┘ └───────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ WebSocket (wss://)
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        Server (Node.js)                         │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌───────────┐ │
│  │   Express   │ │  Socket.IO  │ │   Chess.js  │ │    Room   │ │
│  │     API     │ │   Server    │ │ (Validate)  │ │  Manager  │ │
│  └─────────────┘ └─────────────┘ └─────────────┘ └───────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ Redis Protocol
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                          Redis                                   │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────────────────────┐│
│  │    Rooms    │ │Game States  │ │  Pub/Sub (Scaling)          ││
│  └─────────────┘ └─────────────┘ └─────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

## 📁 Project Structure

```
chess-online/
├── client/                    # React frontend
│   ├── public/               # Static assets
│   ├── src/
│   │   ├── components/       # React components
│   │   │   ├── ChessBoard.tsx
│   │   │   ├── ChessPiece.tsx
│   │   │   ├── GameInfo.tsx
│   │   │   ├── MoveList.tsx
│   │   │   ├── ChatBox.tsx
│   │   │   └── ...
│   │   ├── pages/            # Page components
│   │   │   ├── HomePage.tsx
│   │   │   └── GamePage.tsx
│   │   ├── services/         # Socket service
│   │   ├── store/            # Zustand store
│   │   ├── types/            # TypeScript types
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── package.json
│   ├── tailwind.config.js
│   ├── vite.config.ts
│   ├── Dockerfile
│   └── nginx.conf
├── server/                    # Node.js backend
│   ├── src/
│   │   ├── services/
│   │   │   ├── ChessEngine.ts    # Chess logic
│   │   │   ├── RoomManager.ts    # Room management
│   │   │   └── RedisService.ts   # Redis operations
│   │   ├── sockets/
│   │   │   └── handlers.ts       # Socket event handlers
│   │   ├── types/
│   │   │   └── index.ts          # Shared types
│   │   └── index.ts              # Server entry point
│   ├── package.json
│   ├── tsconfig.json
│   └── Dockerfile
├── docker-compose.yml
├── render.yaml               # Render deployment config
└── README.md
```

## 🚀 Quick Start

### Prerequisites

- Node.js >= 18.0.0
- npm or yarn
- Redis (optional for development)

### Development Setup

1. **Clone the repository**
```bash
git clone https://github.com/yourusername/chess-online.git
cd chess-online
```

2. **Install dependencies**
```bash
npm run install:all
```

3. **Start development servers**
```bash
npm run dev
```

This will start:
- Backend server at `http://localhost:3001`
- Frontend dev server at `http://localhost:5173`

### Running with Docker

```bash
docker-compose up -d
```

Access the application at `http://localhost:5173`

## 🔌 WebSocket Events

### Client → Server Events

| Event | Payload | Description |
|-------|---------|-------------|
| `room:create` | `{ playerName, settings? }` | Create a new room |
| `room:join` | `{ roomId, playerName }` | Join room as opponent |
| `room:spectate` | `{ roomId, spectatorName? }` | Join room as spectator |
| `room:leave` | - | Leave current room |
| `game:move` | `{ roomId, from, to, promotion? }` | Make a move |
| `game:resign` | `{ roomId }` | Resign the game |
| `game:offer-draw` | `{ roomId }` | Offer a draw |
| `game:accept-draw` | `{ roomId }` | Accept draw offer |
| `game:decline-draw` | `{ roomId }` | Decline draw offer |
| `chat:send` | `{ roomId, message }` | Send chat message |

### Server → Client Events

| Event | Payload | Description |
|-------|---------|-------------|
| `room:created` | `{ room, playerId }` | Room created successfully |
| `room:joined` | `{ room, playerId, color }` | Joined room successfully |
| `room:updated` | `room` | Room state updated |
| `game:started` | `gameState` | Game has started |
| `game:move` | `{ move, gameState }` | Move made |
| `game:ended` | `{ gameState, reason }` | Game ended |
| `player:joined` | `{ player, room }` | Opponent joined |
| `player:disconnected` | `{ playerId, gracePeriod }` | Player disconnected |
| `spectator:joined` | `{ spectatorId, name, count }` | Spectator joined |
| `chat:message` | `{ senderId, senderName, message, timestamp }` | Chat message received |
| `draw:offered` | `{ fromPlayerId }` | Draw offer received |

## 📊 Data Models

### Room
```typescript
interface Room {
  roomId: string;
  hostId: string;
  hostName: string;
  opponentId: string | null;
  opponentName: string | null;
  spectatorCount: number;
  state: 'waiting_for_player' | 'in_progress' | 'finished';
  gameState: GameState | null;
  settings: RoomSettings;
}
```

### Game State
```typescript
interface GameState {
  fen: string;
  turn: 'white' | 'black';
  moves: MoveRecord[];
  status: 'active' | 'checkmate' | 'stalemate' | 'draw' | 'resigned' | 'timeout';
  winner: 'white' | 'black' | null;
  whiteTime: number | null;
  blackTime: number | null;
}
```

## 🚢 Deployment

### Deploy to Render

1. Fork this repository
2. Connect your GitHub account to Render
3. Create a new Blueprint instance
4. Select this repository
5. Render will automatically deploy all services

### Manual Deployment

#### Backend
```bash
cd server
npm install
npm run build
npm start
```

#### Frontend
```bash
cd client
npm install
npm run build
# Serve the dist folder with any static file server
```

### Environment Variables

#### Backend
| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3001` |
| `NODE_ENV` | Environment | `development` |
| `CLIENT_URL` | Frontend URL (CORS) | `http://localhost:5173` |
| `REDIS_URL` | Redis connection string | - |

#### Frontend
| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_WS_URL` | Backend WebSocket URL | `http://localhost:3001` |

## ✅ Production Checklist

- [ ] Set `NODE_ENV=production`
- [ ] Configure Redis for persistent storage
- [ ] Set up SSL/TLS certificates
- [ ] Configure CORS with production domain
- [ ] Enable rate limiting
- [ ] Set up monitoring (e.g., Sentry)
- [ ] Configure health checks
- [ ] Set up log aggregation
- [ ] Enable horizontal scaling with Redis pub/sub
- [ ] Test reconnection handling
- [ ] Verify mobile responsiveness

## 🔧 Common Issues & Fixes

### WebSocket Connection Fails
- Ensure the backend is running and accessible
- Check CORS configuration
- Verify firewall allows WebSocket connections

### Moves Not Syncing
- Check Redis connection
- Verify server logs for errors
- Ensure both players are connected

### Performance Issues
- Enable Redis for state management
- Consider horizontal scaling
- Optimize static asset delivery with CDN

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

## 📄 License

MIT License - feel free to use this project for any purpose.

## 🙏 Acknowledgments

- [chess.js](https://github.com/jhlywa/chess.js) - Chess logic library
- [Socket.IO](https://socket.io/) - Real-time communication
- [Tailwind CSS](https://tailwindcss.com/) - Styling
- [Zustand](https://zustand-demo.pmnd.rs/) - State management
