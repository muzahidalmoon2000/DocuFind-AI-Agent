import React, { useRef, useState, useEffect } from "react";
import { FaGlobe, FaSearch } from "react-icons/fa";
import { MdEmail } from "react-icons/md";
import { FiSend, FiMic, FiMicOff } from "react-icons/fi";

export default function WelcomeScreen({ userInput,disabled, setUserInput, onSend }) {
  const recognitionRef = useRef(null);
  const [isListening, setIsListening] = useState(false);

  useEffect(() => {
    if (!("webkitSpeechRecognition" in window || "SpeechRecognition" in window)) {
      console.warn("🎤 Speech recognition not supported.");
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      console.log("🎤 Voice recognition started...");
      setIsListening(true);
    };

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      console.log("✅ Voice recognized:", transcript);
      setUserInput(transcript);
      setTimeout(() => {
        console.log("📤 Auto-submitting:", transcript);
        onSend(transcript);
      }, 300);
    };

    recognition.onerror = (event) => {
      console.error("❌ Voice recognition error:", event.error);
      setIsListening(false);
    };

    recognition.onend = () => {
      console.log("🛑 Voice recognition ended");
      setIsListening(false);
    };

    recognitionRef.current = recognition;
  }, [onSend, setUserInput]);

  const toggleVoiceInput = () => {
    const recognition = recognitionRef.current;
    if (!recognition) return;

    if (isListening) {
      recognition.stop();
    } else {
      try {
        recognition.start();
      } catch (e) {
        console.warn("⚠️ Mic already in use or cannot start:", e.message);
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
    <div className="flex items-center justify-center min-h-screen bg-white text-white p-4">
      <div className="bg-[#f9f9f9] w-full max-w-[700px] min-h-[446px] rounded-2xl p-6 shadow-custom-glow text-center flex flex-col">
        
        {/* Top Content */}
        <div>
          <div className="text-3xl text-[#BD945B] mb-4 flex justify-center gap-3"><img className="w-8" src="/web-images_full-logo (1).svg" />Hi, I'm DocuFind<img className="w-8" src="/web-images_full-logo (1).svg" /></div>
          <h1 className="text-2xl text-[#0d0d0d] font-semibold mb-2">How can I help you today?</h1>
          <p className="text-sm text-black mb-6">
            I can help you ask questions, search for files, and send them to your email — just ask.
          </p>
        </div>

        {/* Grid of Cards */}
        <div className="flex-1 flex flex-col">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 flex-1">
            <div className="bg-gray-800 p-4 rounded-lg hover:bg-gray-700 transition flex flex-col justify-between">
              <FaSearch className="mx-auto mb-2 text-[#BD945B] text-4xl" />
              <p className="font-medium text-2xl">Search File</p>
              <p className="text-gray-400 text-xs mt-2">Search for your desired files</p>
            </div>
            <div className="bg-gray-800 p-4 rounded-lg hover:bg-gray-700 transition flex flex-col justify-between">
              <MdEmail className="mx-auto mb-2 text-[#BD945B] text-4xl" />
              <p className="font-medium text-2xl">Send File</p>
              <p className="text-gray-400 text-xs mt-2">Send desired files to your email</p>
            </div>
            <div className="bg-gray-800 p-4 rounded-lg hover:bg-gray-700 transition flex flex-col justify-between">
              <FaGlobe className="mx-auto mb-2 text-[#BD945B] text-4xl" />
              <p className="font-medium text-2xl">HR & Admin Support</p>
              <p className="text-gray-400 text-xs mt-2">Better interaction</p>
            </div>
          </div>
        </div>

        {/* Bottom Input */}
        <div className="flex items-center bg-[#d6d6d6] rounded-full px-4 py-2 mt-6">
          <input
            type="text"
            ref={inputRef}
            className="flex-1 bg-transparent text-black placeholder-gray-500 outline-none"
            placeholder="Type your prompt here..."
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onSend(userInput)}
            disabled={disabled}
          />
          <button
            onClick={toggleVoiceInput}
            className={`ml-2 ${isListening ? "text-[#BD945B] animate-pulse" : "text-gray-400"} hover:text-white`}
            title={isListening ? "Stop voice input" : "Start voice input"}
          >
            {isListening ? <FiMicOff size={18} /> : <FiMic size={18} />}
          </button>
          <button
            onClick={() => onSend(userInput)}
            className="ml-2 text-[#BD945B] hover:text-[#a17d4b]"
            title="Send"
          >
            <FiSend size={18} />
          </button>
        </div>

      </div>
    </div>
  );
}
