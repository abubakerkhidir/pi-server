interface ChatWindowProps {
  chatRef: React.RefObject<HTMLDivElement | null>;
  welcomeRef: React.RefObject<HTMLDivElement | null>;
}

export default function ChatWindow({ chatRef, welcomeRef }: ChatWindowProps) {
  return (
    <div className="chat" id="chatMessages" ref={chatRef}>
      <div className="welcome" ref={welcomeRef}>
        <h1>pi Coding Agent</h1>
        <p>Send a message to start a new conversation.</p>
      </div>
    </div>
  );
}
