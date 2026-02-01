-- Migration: Create game history table
-- Version: 003
-- Description: Store completed game records for user history

CREATE TABLE IF NOT EXISTS game_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id VARCHAR(50) NOT NULL,
    white_player_id UUID REFERENCES users(id) ON DELETE SET NULL,
    black_player_id UUID REFERENCES users(id) ON DELETE SET NULL,
    white_player_name VARCHAR(100) NOT NULL,
    black_player_name VARCHAR(100) NOT NULL,
    winner VARCHAR(10), -- 'white', 'black', or NULL for draw
    result VARCHAR(50) NOT NULL, -- 'checkmate', 'resignation', 'timeout', 'draw', 'stalemate', 'abandoned'
    pgn TEXT, -- Full game in PGN format
    final_fen VARCHAR(100),
    move_count INTEGER DEFAULT 0,
    time_control_initial INTEGER, -- seconds
    time_control_increment INTEGER, -- seconds
    duration_seconds INTEGER,
    started_at TIMESTAMP WITH TIME ZONE NOT NULL,
    ended_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for game history queries
CREATE INDEX IF NOT EXISTS idx_game_history_white_player ON game_history(white_player_id);
CREATE INDEX IF NOT EXISTS idx_game_history_black_player ON game_history(black_player_id);
CREATE INDEX IF NOT EXISTS idx_game_history_ended_at ON game_history(ended_at);
CREATE INDEX IF NOT EXISTS idx_game_history_room_id ON game_history(room_id);
