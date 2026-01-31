import { useState, useRef, useEffect } from 'react';
import { useGameStore } from '../store/gameStore';
import clsx from 'clsx';

export default function ChatBox() {
  const { chatMessages, sendChat, showChat, toggleChat, playerId } = useGameStore();
  const [message, setMessage] = useState('');
  const messagesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    }
  }, [chatMessages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim()) {
      sendChat(message.trim());
      setMessage('');
    }
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

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
        {chatMessages.length > 0 && (
          <span className="px-2 py-0.5 bg-accent text-midnight-950 text-xs rounded-full">
            {chatMessages.length}
          </span>
        )}
      </button>
    );
  }

  return (
    <div className="card flex flex-col h-64">
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

      {/* Messages */}
      <div
        ref={messagesRef}
        className="flex-1 overflow-y-auto p-3 space-y-2"
      >
        {chatMessages.length === 0 ? (
          <p className="text-midnight-500 text-sm text-center py-4">
            No messages yet
          </p>
        ) : (
          chatMessages.map((msg, index) => (
            <div
              key={index}
              className={clsx(
                'max-w-[85%] rounded-lg px-3 py-2',
                msg.senderId === playerId
                  ? 'ml-auto bg-accent/20 text-white'
                  : 'bg-midnight-700 text-white'
              )}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-medium text-accent">
                  {msg.senderId === playerId ? 'You' : msg.senderName}
                </span>
                <span className="text-xs text-midnight-500">
                  {formatTime(msg.timestamp)}
                </span>
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
            placeholder="Type a message..."
            className="input flex-1 py-2 text-sm"
            maxLength={500}
          />
          <button
            type="submit"
            disabled={!message.trim()}
            className="px-3 py-2 bg-accent text-midnight-950 rounded-lg hover:bg-accent-light disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
      </form>
    </div>
  );
}
