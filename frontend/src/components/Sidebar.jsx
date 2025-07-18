import React, { useState, useEffect } from "react";

export default function Sidebar({ onNewChat, onSelectChat, activeChatId, refreshFlag }) {
  const [chats, setChats] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [userEmail, setUserEmail] = useState("");

  const fetchChats = () => {
    fetch("/api/chats", { credentials: "include" })
      .then((res) => res.json())
      .then((data) => setChats(data))
      .catch((err) => console.error("Failed to load chats:", err));
  };

  useEffect(() => {
    fetchChats();
  }, []);

  useEffect(() => {
    fetchChats();
  }, [refreshFlag]);

  useEffect(() => {
    fetch("/check_login", { credentials: "include" })
      .then((res) => res.json())
      .then((data) => {
        if (data?.user_email) {
          setUserEmail(data.user_email.toLowerCase());
        }
      });
  }, []);

  const handleNewChat = async () => {
    await onNewChat();
  };

const handleAdminRedirect = () => {
  window.open("/admin", "_blank");
};

  const allowedAdmins = ["suzon@ba3digitalmarketing.com"]; // ✅ Add more as needed
  const isAdmin = allowedAdmins.includes(userEmail);

  const filteredChats = chats.filter(
    (chat) =>
      typeof chat.title === "string" &&
      chat.title.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="w-[20rem] bg-[#f9f9f9] border-r border-[#ebebeb] text-black p-4 flex flex-col">
      <h2 className="text-lg font-semibold mb-2 flex justify-center items-center gap-2">
        <span>
          <img className="w-[92px]" src="/web-images_name-logo (1).svg" alt="Elpis Capital" />
        </span>
        DocuFind
      </h2>

      <input
        type="text"
        placeholder="Search"
        className="w-full p-2 mb-3 rounded bg-[#d6d6d6] text-sm text-white placeholder-gray-400"
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value.trimStart())}
      />

      <div className="text-sm text-[#0d0d0d] mb-2">Chats History</div>
      <h3 className="text-[12px] text-[#0d0d0d] mb-2">
        Chats are stored for 3 days only. Older messages will be deleted automatically.
      </h3>

      <div className="space-y-2 flex-1 overflow-y-auto custom-scrollbar">
        {filteredChats.length > 0 ? (
          filteredChats.map((chat) => (
            <button
              key={chat.id}
              onClick={() => onSelectChat(chat.id)}
              className={`w-full text-left p-2 rounded transition ${
                activeChatId === chat.id
                  ? "bg-[#1f2937] text-white"
                  : "bg-[#1f2937] hover:bg-zinc-700"
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
        className="mt-4 w-full py-2 bg-[#BD945B] hover:bg-[#a17d4b] rounded text-white font-semibold"
      >
        + New Chat
      </button>

      {isAdmin && (
        <button
          onClick={handleAdminRedirect}
          className="mt-2 w-full py-2 bg-[#142436] hover:bg-[#1e293b] rounded text-white text-sm font-semibold"
        >
          🔐 Admin Panel
        </button>
      )}
    </div>
  );
}
