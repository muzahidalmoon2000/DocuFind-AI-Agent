import React, { useRef, useState, useEffect } from "react";
import { FaGlobe, FaSearch } from "react-icons/fa";
import { MdEmail } from "react-icons/md";
import { FiSend, FiMic, FiMicOff } from "react-icons/fi";

export default function WelcomeScreen({ userInput, setUserInput, onSend }) {
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

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-b from-gray-950 via-black to-gray-950 text-white p-4">
      <div className="bg-[#1E1E1E] w-full max-w-[700px] min-h-[446px] rounded-2xl p-6 shadow-lg text-center flex flex-col">
        
        {/* Top Content */}
        <div>
          <div className="text-3xl text-pink-400 mb-4">🧠Hi, I'm DocuFind🧠</div>
          <h1 className="text-2xl font-semibold mb-2">How can I help you today?</h1>
          <p className="text-sm text-gray-400 mb-6">
            I can help you ask questions, search for files, and send them to your email — just ask.
          </p>
        </div>

        {/* Grid of Cards */}
        <div className="flex-1 flex flex-col">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 flex-1">
            <div className="bg-gray-800 p-4 rounded-lg hover:bg-gray-700 transition flex flex-col justify-between">
              <FaSearch className="mx-auto mb-2 text-green-400 text-4xl" />
              <p className="font-medium text-2xl">Search File</p>
              <p className="text-gray-400 text-xs mt-2">Search for your desired files</p>
            </div>
            <div className="bg-gray-800 p-4 rounded-lg hover:bg-gray-700 transition flex flex-col justify-between">
              <MdEmail className="mx-auto mb-2 text-green-400 text-4xl" />
              <p className="font-medium text-2xl">Send Email</p>
              <p className="text-gray-400 text-xs mt-2">Send desired files to your email</p>
            </div>
            <div className="bg-gray-800 p-4 rounded-lg hover:bg-gray-700 transition flex flex-col justify-between">
              <FaGlobe className="mx-auto mb-2 text-green-400 text-4xl" />
              <p className="font-medium text-2xl">Multilingual Support</p>
              <p className="text-gray-400 text-xs mt-2">Better interaction</p>
            </div>
          </div>
        </div>

        {/* Bottom Input */}
        <div className="flex items-center bg-[#2A2A2A] rounded-full px-4 py-2 mt-6">
          <input
            type="text"
            className="flex-1 bg-transparent text-white placeholder-gray-500 outline-none"
            placeholder="Type your prompt here..."
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onSend(userInput)}
          />
          <button
            onClick={toggleVoiceInput}
            className={`ml-2 ${isListening ? "text-green-400 animate-pulse" : "text-gray-400"} hover:text-white`}
            title={isListening ? "Stop voice input" : "Start voice input"}
          >
            {isListening ? <FiMicOff size={18} /> : <FiMic size={18} />}
          </button>
          <button
            onClick={() => onSend(userInput)}
            className="ml-2 text-green-400 hover:text-green-300"
            title="Send"
          >
            <FiSend size={18} />
          </button>
        </div>

      </div>
    </div>
  );
}
