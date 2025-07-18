import React from "react";
import ReactMarkdown from "react-markdown";
import { FaUser } from 'react-icons/fa';
import { Bot } from "lucide-react";

export default function ChatBubble({
  sender,
  message,
  isStatus = false,
  statusType = "thinking",
  fileOptions = [],
  pauseGPT = false,
  toggleSelectFile,
  selectedFiles = [],
  sendSelectedFiles,
}) {
  const isUser = sender === "You";

  if (isStatus) {
    let statusMessage = "DocuFind is thinking...";
    if (statusType === "searching-file") {
      statusMessage = "DocuFind is searching the file...";
    } else if (statusType === "checking-access") {
      statusMessage = "DocuFind is checking access...";
    }

    return (
      <div className="my-2 flex justify-start items-start">
        <div className="mr-2 mt-1">
          <Bot className="w-8 h-8 text-blue-500" />
        </div>
        <div className="relative max-w-[80%] px-4 py-3 text-xl rounded-lg shadow-md bg-zinc-800 text-white rounded-bl-none">
          <div className="flex items-center space-x-2">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500"></span>
            </span>
            <span className="animate-pulse">{statusMessage}</span>
          </div>
          <div className="absolute top-2 w-2 h-2 rotate-45 bg-zinc-800 left-[-4px]"></div>
        </div>
      </div>
    );
  }

  const renderFileSelection = () => (
    <div className="bg-zinc-900 rounded-xl p-4 space-y-4 mt-4">
      <h3 className="text-lg font-semibold text-white">📁 Here are some files I found:</h3>
      {fileOptions.map((file, index) => {
        const isSelected = selectedFiles.some((f) => f.id === file.id);
        return (
          <div
            key={file.id}
            className="border border-zinc-700 bg-zinc-800 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between hover:shadow-md transition-shadow"
          >
            <div className="flex-1 space-y-1">
              <h4 className="text-white font-medium text-base">
                {index + 1}. {file.name}
              </h4>
              <a
                href={file.webUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 text-sm hover:underline inline-flex items-center gap-1"
              >
                🔗 Preview
              </a>
            </div>

            <label className="mt-3 md:mt-0 flex items-center gap-2 text-sm text-white cursor-pointer">
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => toggleSelectFile(file)}
                className="form-checkbox h-4 w-4 bg-[#BD945B] border-gray-300 rounded cursor-pointer"
              />
              Select file #{index + 1}
            </label>
          </div>
        );
      })}

      <div className="pt-2">
        <button
          onClick={sendSelectedFiles}
          className="bg-[#BD945B] hover:bg-[#a17d4b] text-white font-semibold py-2 px-6 rounded-xl w-full transition-colors shadow-lg"
        >
          Send Selected Files
        </button>
      </div>
    </div>
  );

  return (
    <div className={`my-2 flex ${isUser ? "justify-end" : "justify-start"} items-start`}>
      {!isUser && (
        <div className="mr-2 mt-1">
          <Bot className="w-8 h-8 text-blue-500" />
        </div>
      )}

      <div
        className={`relative max-w-[80%] px-4 py-3 text-xl rounded-lg shadow-md ${
          isUser
            ? "bg-[#BD945B] text-white rounded-br-none"
            : "bg-zinc-800 text-white rounded-bl-none"
        }`}
      >
        <ReactMarkdown
          className="prose prose-invert prose-sm max-w-none"
          components={{
            a: ({ href, children }) => (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:underline"
              >
                {children}
              </a>
            ),
            p: ({ children }) => <p className="mb-2">{children}</p>,
            ul: ({ children }) => <ul className="list-disc ml-5">{children}</ul>,
            li: ({ children }) => <li className="mb-1">{children}</li>,
          }}
        >
          {message}
        </ReactMarkdown>

        {pauseGPT && fileOptions.length > 0 && renderFileSelection()}

        <div
          className={`absolute top-2 w-2 h-2 transform rotate-45 ${
            isUser ? "bg-[#BD945B] right-[-4px]" : "bg-zinc-800 left-[-4px]"
          }`}
        ></div>
      </div>

      {isUser && (
        <div className="ml-2 mt-1">
          <FaUser className="w-8 h-8 text-gray-500" />
        </div>
      )}
    </div>
  );
}
