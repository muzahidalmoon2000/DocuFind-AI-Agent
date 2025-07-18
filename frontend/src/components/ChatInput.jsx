import React, { useEffect, useRef, useState } from "react";
import { FiMic, FiMicOff, FiSend } from "react-icons/fi";

export default function ChatInput({ onSend, disabled, userInput, setUserInput }) {
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef(null);

  useEffect(() => {
    if (!("webkitSpeechRecognition" in window || "SpeechRecognition" in window)) {
      console.error("🎙️ Speech recognition not supported in this browser.");
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      console.log("🎙️ Voice recognition started...");
      setIsListening(true);
    };

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      console.log("✅ Voice recognized:", transcript);
      setUserInput(transcript);
      setTimeout(() => {
        console.log("📤 Auto-submitting voice input...");
        onSend(transcript);
      }, 300);
    };

    recognition.onerror = (e) => {
      console.error("❌ Voice recognition error:", e.error);
      setIsListening(false);
    };

    recognition.onend = () => {
      console.log("🔴 Voice recognition ended");
      setIsListening(false);
    };

    recognitionRef.current = recognition;

    // Global fallback
    window.triggerVoiceInput = () => {
      if (isListening) {
        recognition.stop();
      } else {
        try {
          recognition.start();
        } catch (e) {
          console.warn("⚠️ Voice recognition already running or failed:", e.message);
        }
      }
    };
  }, [onSend, setUserInput, isListening]);

  const toggleVoice = () => {
    if (!recognitionRef.current) return;
    const recognition = recognitionRef.current;
    if (isListening) {
      recognition.stop();
    } else {
      try {
        recognition.start();
      } catch (e) {
        console.warn("⚠️ Cannot start recognition:", e.message);
      }
    }
  };

    const inputRef = useRef(null);
    // ✅ Force focus on mount:
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // ✅ Optionally focus again if re-enabled
  useEffect(() => {
    if (!disabled) {
      inputRef.current?.focus();
    }
  }, [disabled]);

  return (
    <div className="p-4 border-t border-gray-300 bg-white">
      <div className="flex items-center bg-[#D6D6D6] rounded-full px-4 py-2">
        <input
          ref={inputRef}
          type="text"
          className="flex-1 bg-transparent text-black placeholder-gray-500 outline-none"
          placeholder="Type your prompt here..."
          value={userInput}
          onChange={(e) => setUserInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onSend(userInput)}
          disabled={disabled}
        />
        <button
          onClick={toggleVoice}
          className={`ml-2 ${
            isListening ? "text-[#BD945B] animate-pulse" : "text-gray-400"
          } hover:text-white`}
          title={isListening ? "Stop listening" : "Start voice input"}
        >
          {isListening ? <FiMicOff size={18} /> : <FiMic size={18} />}
        </button>
        <button
          onClick={() => onSend(userInput)}
          className="ml-2 text-[#BD945B] hover:text-[#BD945B]"
          title="Send"
        >
          <FiSend size={18} />
        </button>
      </div>
    </div>
  );
}
