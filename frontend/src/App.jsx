import React, { useState, useEffect, useRef } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";

import Sidebar from "./components/Sidebar.jsx";
import ChatPanel from "./components/ChatPanel.jsx";
import ChatInput from "./components/ChatInput.jsx";
import WelcomeScreen from "./components/WelcomeScreen.jsx";
import HRAdminPanel from "./components/HRAdminPanel.jsx";

export default function App() {
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [pauseGPT, setPauseGPT] = useState(false);
  const [fileOptions, setFileOptions] = useState([]);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [showWelcome, setShowWelcome] = useState(true);
  const [userInput, setUserInput] = useState("");
  const [aiStatusMessage, setAiStatusMessage] = useState("");
  const [statusType, setStatusType] = useState("thinking");
  const [chatId, setChatId] = useState(null);
  const [refreshChats, setRefreshChats] = useState(false);
  const [userEmail, setUserEmail] = useState(null);
  const aiThinkingInterval = useRef(null);

  useEffect(() => {
    async function init() {
      try {
        const loginRes = await fetch("/check_login", { credentials: "include" });
        const loginData = await loginRes.json();
        if (!loginData.logged_in) {
          window.location.href = "/login";
          return;
        }

        setUserEmail(loginData.user_email);

        const storedChatId = sessionStorage.getItem("chat_id");

        if (storedChatId) {
          const msgRes = await fetch(`/api/messages/${storedChatId}`, {
            credentials: "include",
          });
          const msgData = await msgRes.json();

          if (msgData.messages && msgData.messages.length > 0) {
            setChatId(storedChatId);
            setMessages(msgData.messages);
            setShowWelcome(false);
          } else {
            sessionStorage.removeItem("chat_id");
            setShowWelcome(true);
          }
        } else {
          setShowWelcome(true);
        }

        const sessionRes = await fetch("/api/session_state", { credentials: "include" });
        const session = await sessionRes.json();

        if (session.stage === "awaiting_selection" && session.files?.length > 0) {
          setPauseGPT(true);
          setFileOptions(session.files);
        } else {
          setPauseGPT(false);
          setFileOptions([]);
          setSelectedFiles([]);
          setStatusType("thinking");
          setAiStatusMessage("");
        }
      } catch (err) {
        console.error("❌ Failed to initialize session:", err);
        setAiStatusMessage("❌ Something went wrong.");
        setStatusType("error");
      } finally {
        setIsInitializing(false);
      }
    }

    init();
  }, []);

  const handleNewChat = async () => {
    const res = await fetch("/api/new_chat", { credentials: "include" });
    const data = await res.json();

    setChatId(data.chat_id);
    sessionStorage.removeItem("chat_id");

    setMessages([]);
    setPauseGPT(false);
    setSelectedFiles([]);
    setFileOptions([]);
    setUserInput("");
    setShowWelcome(true);
    setAiStatusMessage("");
    setStatusType("thinking");
    clearInterval(aiThinkingInterval.current);
    setRefreshChats((prev) => !prev);
    console.log("🆕 Started new chat:", data.chat_id);
  };

  const handleSelectChat = async (chat_id) => {
    if (chat_id === chatId) return;

    setChatId(chat_id);
    sessionStorage.setItem("chat_id", chat_id);
    setShowWelcome(false);
    setIsLoading(true);

    try {
      const res = await fetch(`/api/messages/${chat_id}`, {
        credentials: "include",
      });
      const data = await res.json();

      setMessages(data.messages || []);
      setPauseGPT(false);
      setSelectedFiles([]);
      setFileOptions([]);
      setUserInput("");
      setIsLoading(false);
      console.log("📦 Loaded chat messages:", data.messages);
    } catch (err) {
      console.error("❌ Failed to load chat messages:", err);
      setIsLoading(false);
    }
  };

  const handleSend = async (inputText = userInput, selectedIndices = null) => {
    if (!inputText.trim() && !selectedIndices) return;

    const msg = inputText.trim();
    if (msg) {
      setMessages((prev) => [...prev, { sender: "You", message: msg }]);
    }

    setUserInput("");
    setShowWelcome(false);
    setIsLoading(true);

    if (pauseGPT || selectedIndices) {
      setAiStatusMessage("DocuFind is checking access...");
      setStatusType("checking-access");
    } else if (msg.toLowerCase().includes("file")) {
      setAiStatusMessage("DocuFind is searching the file...");
      setStatusType("searching-file");
    } else {
      setAiStatusMessage("DocuFind is thinking...");
      setStatusType("thinking");
    }

    try {
      const res = await fetch("/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          message: msg || "",
          selectionStage: pauseGPT,
          selectedIndices,
          chat_id: chatId,
        }),
      });

      const data = await res.json();
      console.log("✅ Chat response:", data);

      if (data.response) {
        setMessages((prev) => [...prev, { sender: "AI", message: data.response }]);
      }

      if (data.chat_id) {
        setChatId(data.chat_id);
      }

      if (data.pauseGPT && data.files) {
        setPauseGPT(true);
        setFileOptions(data.files);
      } else {
        setPauseGPT(false);
        setFileOptions([]);
        if (data.response) {
          setAiStatusMessage("DocuFind is thinking...");
          setStatusType("thinking");
        }
      }

      setIsLoading(false);
      clearInterval(aiThinkingInterval.current);
      setAiStatusMessage("");
      setRefreshChats((prev) => !prev);
    } catch (err) {
      console.error("❌ Chat fetch failed:", err);
      setIsLoading(false);
      clearInterval(aiThinkingInterval.current);
      setAiStatusMessage("❌ Something went wrong.");
      setStatusType("error");
    }
  };

  useEffect(() => {
    const hasUserMessage = messages.some((msg) => msg.sender === "You");
    const hasAIMessage = messages.some((msg) => msg.sender === "AI");

    if (hasUserMessage && hasAIMessage && chatId && !sessionStorage.getItem("chat_id")) {
      sessionStorage.setItem("chat_id", chatId);
      console.log("💾 chat_id saved to sessionStorage:", chatId);
    }
  }, [messages, chatId]);

  const toggleSelectFile = (file) => {
    setSelectedFiles((prev) =>
      prev.some((f) => f.id === file.id)
        ? prev.filter((f) => f.id !== file.id)
        : [...prev, file]
    );
  };

  const sendSelectedFiles = () => {
    if (!selectedFiles.length) return;

    const selectedIndices = selectedFiles
      .map((file) => fileOptions.findIndex((f) => f.id === file.id))
      .filter((index) => index !== -1)
      .map((i) => i + 1);

    const selectionMessage = selectedIndices.join(",");
    handleSend(selectionMessage, selectedIndices);

    setSelectedFiles([]);
    setPauseGPT(false);
    setFileOptions([]);
  };

  if (isInitializing) {
    return (
      <div className="flex h-screen items-center justify-center text-white bg-black">
        Loading...
      </div>
    );
  }

  return (
    <Router>
      <Routes>
        {/* Redirect /admin to /admin/upload */}
        <Route path="/admin" element={<Navigate to="/admin/upload" replace />} />

        {/* Admin dashboard */}
        <Route
          path="/admin/upload"
          element={
            <div className="flex h-screen bg-black text-white p-6">
              <HRAdminPanel userEmail={userEmail} />
            </div>
          }
        />

        {/* Default Chat Interface */}
        <Route
          path="*"
          element={
            <div className="flex h-screen bg-black text-white relative">
              <Sidebar
                onNewChat={handleNewChat}
                onSelectChat={handleSelectChat}
                activeChatId={chatId}
                refreshFlag={refreshChats}
              />
              <div className="flex flex-col flex-1 overflow-hidden">
                {showWelcome ? (
                  <WelcomeScreen
                    userInput={userInput}
                    setUserInput={setUserInput}
                    onSend={handleSend}
                  />
                ) : (
                  <>
                    <div className="flex-1 overflow-y-auto bg-white">
                      <ChatPanel
                        messages={
                          isLoading && aiStatusMessage
                            ? [
                                ...messages,
                                {
                                  sender: "AI",
                                  message: aiStatusMessage,
                                  isStatus: true,
                                  statusType: statusType,
                                },
                              ]
                            : messages
                        }
                        fileOptions={fileOptions}
                        pauseGPT={pauseGPT}
                        toggleSelectFile={toggleSelectFile}
                        selectedFiles={selectedFiles}
                        sendSelectedFiles={sendSelectedFiles}
                      />
                    </div>
                    <ChatInput
                      onSend={handleSend}
                      disabled={isLoading || pauseGPT}
                      userInput={userInput}
                      setUserInput={setUserInput}
                    />
                  </>
                )}
              </div>
            </div>
          }
        />
      </Routes>
    </Router>
  );
}
