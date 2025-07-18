import React from "react";
import ChatBubble from "./ChatBubble";

export default function ChatPanel({
  messages,
  fileOptions,
  pauseGPT,
  toggleSelectFile,
  selectedFiles,
  sendSelectedFiles,
}) {
  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {messages.map((msg, i) => (
        <ChatBubble
          key={i}
          sender={msg.sender}
          message={msg.message}
          isStatus={msg.isStatus}
          statusType={msg.statusType} // ✅ Pass statusType to ChatBubble
          timestamp={msg.timestamp}
        />
      ))}

      {/* 🔽 File Selection Panel */}
      {pauseGPT && fileOptions.length > 0 && (
        <div className="bg-gray-800 p-6 rounded-2xl shadow-md border border-gray-700 space-y-4 w-full max-w-2xl">
          <h2 className="text-white text-xl font-semibold mb-2">
            📂 Files I Found for You:
          </h2>

          <div className="space-y-3">
            {fileOptions.map((file, index) => (
              <div
                key={file.id}
                className="bg-gray-700 rounded-lg p-4 hover:bg-gray-600 transition-colors cursor-pointer"
                onClick={() => toggleSelectFile(file)}
              >
                <div className="flex justify-between items-center mb-2">
                  <h3 className="text-white font-medium text-base">
                    {index + 1}. {file.name}
                  </h3>
                  <input
                    type="checkbox"
                    className="form-checkbox text-[#BD945B] h-5 w-5 pointer-events-none"
                    checked={selectedFiles.some((f) => f.id === file.id)}
                    onChange={(e) => {
                      toggleSelectFile(file);
                    }}
                  />
                </div>

                <div className="flex justify-between items-center text-sm text-blue-400">
                  <a
                    href={file.webUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    🔗 Preview File
                  </a>
                  <span className="text-gray-300">File #{index + 1}</span>
                </div>
              </div>
            ))}
          </div>

          <button
            className={`w-full mt-4 py-2 px-4 text-white font-semibold rounded-lg shadow-md transition 
              ${selectedFiles.length > 0
                ? "bg-[#BD945B] hover:bg-[#a17d4b]"
                : "bg-gray-600 cursor-not-allowed"}`}
            onClick={sendSelectedFiles}
            disabled={selectedFiles.length === 0}
          >
            Send Selected Files
          </button>
        </div>
      )}
    </div>
  );
}
