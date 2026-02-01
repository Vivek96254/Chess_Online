import { useState, useRef, useEffect } from 'react';
import { useGameStore } from '../store/gameStore';
import clsx from 'clsx';

export default function ChatBox() {
  const { 
    publicChatMessages, 
    privateChatMessages, 
    activeChatTab, 
    sendChat, 
    setActiveChatTab,
    showChat, 
    toggleChat, 
    playerId,
    isSpectator,
    room
  } = useGameStore();
  const [message, setMessage] = useState('');
  const messagesRef = useRef<HTMLDivElement>(null);

  const chatMessages = activeChatTab === 'public' ? publicChatMessages : privateChatMessages;
  
  // Check if current user is a player (can use private chat)
  const isPlayer = !isSpectator && room && (room.hostId === playerId || room.opponentId === playerId);

  useEffect(() => {
    if (messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    }
  }, [chatMessages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim()) {
      sendChat(message.trim(), activeChatTab);
      setMessage('');
    }
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Get unread counts for tabs
  const publicCount = publicChatMessages.length;
  const privateCount = privateChatMessages.length;

  if (!showChat) {
    return (
      <button
        onClick={toggleChat}
        className="card p-4 flex items-center justify-center gap-2 hover:bg-midnight-700 transition-colors"
      >
        <svg className="w-5 h-5 text-midnight-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
        <span className="text-midnight-400">Open Chat</span>
        {(publicCount > 0 || privateCount > 0) && (
          <span className="px-2 py-0.5 bg-accent text-midnight-950 text-xs rounded-full">
            {publicCount + privateCount}
          </span>
        )}
      </button>
    );
  }

  return (
    <div className="card flex flex-col h-80">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-midnight-700">
        <h3 className="text-sm font-medium text-white">Chat</h3>
        <button
          onClick={toggleChat}
          className="p-1 hover:bg-midnight-700 rounded transition-colors"
        >
          <svg className="w-4 h-4 text-midnight-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Tabs - Only show if user is a player */}
      <div className="flex border-b border-midnight-700">
        <button
          onClick={() => setActiveChatTab('public')}
          className={clsx(
            'flex-1 px-4 py-2 text-sm font-medium transition-colors flex items-center justify-center gap-2',
            activeChatTab === 'public'
              ? 'text-accent border-b-2 border-accent bg-accent/5'
              : 'text-midnight-400 hover:text-white hover:bg-midnight-700'
          )}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
          Room
          {publicCount > 0 && activeChatTab !== 'public' && (
            <span className="px-1.5 py-0.5 bg-accent text-midnight-950 text-xs rounded-full">
              {publicCount}
            </span>
          )}
        </button>
        
        {/* Only show private tab if user is a player */}
        {isPlayer && (
          <button
            onClick={() => setActiveChatTab('private')}
            className={clsx(
              'flex-1 px-4 py-2 text-sm font-medium transition-colors flex items-center justify-center gap-2',
              activeChatTab === 'private'
                ? 'text-purple-400 border-b-2 border-purple-400 bg-purple-400/5'
                : 'text-midnight-400 hover:text-white hover:bg-midnight-700'
            )}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            Private
            {privateCount > 0 && activeChatTab !== 'private' && (
              <span className="px-1.5 py-0.5 bg-purple-400 text-midnight-950 text-xs rounded-full">
                {privateCount}
              </span>
            )}
          </button>
        )}
      </div>

      {/* Chat type indicator for spectators */}
      {isSpectator && (
        <div className="px-3 py-2 bg-midnight-800 text-xs text-midnight-400 flex items-center gap-1">
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
          Spectating - Room chat only
        </div>
      )}

      {/* Messages */}
      <div
        ref={messagesRef}
        className="flex-1 overflow-y-auto p-3 space-y-2"
      >
        {chatMessages.length === 0 ? (
          <div className="text-midnight-500 text-sm text-center py-4">
            <p>No messages yet</p>
            {activeChatTab === 'private' && (
              <p className="text-xs mt-1 text-purple-400/60">
                Private messages are only visible to players
              </p>
            )}
          </div>
        ) : (
          chatMessages.map((msg, index) => (
            <div
              key={index}
              className={clsx(
                'max-w-[85%] rounded-lg px-3 py-2',
                msg.senderId === playerId
                  ? msg.chatType === 'private' 
                    ? 'ml-auto bg-purple-500/20 text-white'
                    : 'ml-auto bg-accent/20 text-white'
                  : msg.chatType === 'private'
                    ? 'bg-purple-500/10 text-white border border-purple-500/20'
                    : 'bg-midnight-700 text-white'
              )}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className={clsx(
                  'text-xs font-medium',
                  msg.chatType === 'private' ? 'text-purple-400' : 'text-accent'
                )}>
                  {msg.senderId === playerId ? 'You' : msg.senderName}
                </span>
                <span className="text-xs text-midnight-500">
                  {formatTime(msg.timestamp)}
                </span>
                {msg.chatType === 'private' && (
                  <span className="text-[10px] px-1.5 py-0.5 bg-purple-500/20 text-purple-400 rounded">
                    Private
                  </span>
                )}
              </div>
              <p className="text-sm break-words">{msg.message}</p>
            </div>
          ))
        )}
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-3 border-t border-midnight-700">
        <div className="flex gap-2">
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={
              activeChatTab === 'private' 
                ? "Private message to opponent..." 
                : "Type a message..."
            }
            className={clsx(
              'input flex-1 py-2 text-sm',
              activeChatTab === 'private' && 'border-purple-500/30 focus:border-purple-500'
            )}
            maxLength={500}
          />
          <button
            type="submit"
            disabled={!message.trim()}
            className={clsx(
              'px-3 py-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors',
              activeChatTab === 'private'
                ? 'bg-purple-500 text-white hover:bg-purple-400'
                : 'bg-accent text-midnight-950 hover:bg-accent-light'
            )}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
        {activeChatTab === 'private' && (
          <p className="text-[10px] text-purple-400/60 mt-1 px-1">
            🔒 Only you and your opponent can see this
          </p>
        )}
      </form>
    </div>
  );
}
