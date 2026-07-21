import { useState, useEffect } from "react";
import { isAuthenticated, clearAuth } from "@/frontend/api";
import AuthForm from "@/frontend/auth/AuthForm";
import ChatLayout from "@/frontend/chat/window/ChatLayout";
import FilesPage from "@/frontend/files/FilesPage";

type View = "chat" | "files";

export default function App() {
  const [isAuthenticatedUser, setIsAuthenticatedUser] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [view, setView] = useState<View>("chat");

  useEffect(() => {
    setIsAuthenticatedUser(isAuthenticated());
    setInitializing(false);
  }, []);

  // Listen for auth:logout events
  useEffect(() => {
    const handleLogout = () => {
      setIsAuthenticatedUser(false);
    };
    window.addEventListener("auth:logout", handleLogout);
    return () => window.removeEventListener("auth:logout", handleLogout);
  }, []);

  const handleAuthenticated = () => {
    setIsAuthenticatedUser(true);
  };

  const handleLogout = () => {
    clearAuth();
    setIsAuthenticatedUser(false);
  };

  if (initializing) {
    return null; // Don't flash anything while checking auth
  }

  if (isAuthenticatedUser) {
    if (view === "files") {
      return <FilesPage onBack={() => setView("chat")} />;
    }
    return <ChatLayout onLogout={handleLogout} onShowFiles={() => setView("files")} />;
  }

  return <AuthForm onAuthenticated={handleAuthenticated} />;
}
