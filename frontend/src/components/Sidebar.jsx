import React, { useEffect, useState } from "react";

export default function Sidebar({ onNewChat, onSelectChat, activeChatId, refreshFlag }) {
  const [chats, setChats] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");

  const fetchChats = () => {
    fetch("/api/chats", { credentials: "include" })
      .then((res) => res.json())
      .then((data) => setChats(data))
      .catch((err) => console.error("Failed to load chats:", err));
  };

  useEffect(() => {
    fetchChats();
  }, []);

  // 👉 Re-fetch on external refreshFlag update
  useEffect(() => {
    fetchChats();
  }, [refreshFlag]);

  const handleNewChat = async () => {
    await onNewChat(); // this will trigger refreshFlag toggle
  };

  const filteredChats = chats.filter(
    (chat) =>
      typeof chat.title === "string" &&
      chat.title.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="w-[20rem] bg-zinc-900 text-white p-4 flex flex-col">
      <h2 className="text-lg font-semibold mb-2 flex justify-center items-center gap-2">
        <span><img className="w-[92px]" src="/elpise_white_logo.svg" alt="Elpis Capital" /></span> DocuFind
      </h2>

      <input
        type="text"
        placeholder="Search"
        className="w-full p-2 mb-3 rounded bg-zinc-800 text-sm text-white placeholder-gray-400"
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value.trimStart())}
      />

      <div className="text-sm text-zinc-400 mb-2 uppercase">Chats</div>
      <div className="space-y-2 flex-1 overflow-y-auto overflow-y-auto custom-scrollbar">
        {filteredChats.length > 0 ? (
          filteredChats.map((chat) => (
            <button
              key={chat.id}
              onClick={() => onSelectChat(chat.id)}
              className={`w-full text-left p-2 rounded transition ${
                activeChatId === chat.id
                  ? "bg-zinc-700 text-white"
                  : "bg-zinc-800 hover:bg-zinc-700"
              }`}
            >
              <div className="font-semibold text-white truncate">
                {chat.title || `Chat ${chat.id}`}
              </div>
              <div className="text-xs text-gray-400 truncate">
                {chat.preview || "No preview available"}
              </div>
            </button>
          ))
        ) : (
          <div className="text-sm text-gray-500 italic">No chats found</div>
        )}
      </div>

      <button
        onClick={handleNewChat}
        className="mt-4 w-full py-2 bg-green-600 hover:bg-green-700 rounded text-white font-semibold"
      >
        + New Chat
      </button>
    </div>
  );
}
