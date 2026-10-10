"use client";

import { useState, useRef, useEffect } from "react";
import { Sparkles, X, Send, Loader2, ExternalLink } from "lucide-react";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: Array<{ title: string; url: string }>;
}

interface AIAssistantProps {
  onClose: () => void;
  destinationSlug?: string;
  destinationName?: string;
}

const SUGGESTED_QUESTIONS = [
  "What can I do in Hampi in one day?",
  "Best time to visit Coorg?",
  "Weekend trips from Bangalore",
  "Waterfalls near Bangalore",
  "Must-visit temples in Karnataka",
  "Budget travel tips for Karnataka",
];

export default function AIAssistant({
  onClose,
  destinationSlug,
  destinationName,
}: AIAssistantProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content: destinationName
        ? `Hi! I'm Explore India AI 🌟\n\nI can help you explore **${destinationName}** — ask me about the best things to do, ideal trip duration, nearby places, or travel tips!`
        : "Hi! I'm Explore India AI 🌟\n\nAsk me anything about travelling in India — places to visit, best times, travel tips, or create a trip itinerary!",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const sendMessage = async (question: string) => {
    if (!question.trim() || loading) return;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: question.trim(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/ai/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: question.trim(),
          destinationSlug: destinationSlug || undefined,
        }),
      });

      const data = await res.json();

      const assistantMessage: Message = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: data.answer || "I couldn't generate a response. Please try again.",
        sources: data.sources || [],
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          role: "assistant",
          content:
            "Sorry, I'm having trouble connecting right now. Please check your API configuration and try again.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const formatMessage = (content: string) => {
    return content
      .split("\n")
      .map((line, i) => (
        <span key={i}>
          {line}
          {i < content.split("\n").length - 1 && <br />}
        </span>
      ));
  };

  return (
    <div
      className="ai-panel animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-label="Explore India AI Travel Assistant"
    >
      {/* Header */}
      <div className="ai-panel-header">
        <div
          style={{
            width: 30,
            height: 30,
            borderRadius: "50%",
            background: "linear-gradient(135deg, #16a34a, #0ea5e9)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Sparkles size={14} color="white" />
        </div>
        <div className="ai-panel-title">
          Explore India AI
          {destinationName && (
            <span
              style={{
                fontSize: "0.7rem",
                color: "var(--color-text-muted)",
                display: "block",
                fontWeight: 400,
              }}
            >
              Focused on {destinationName}
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "var(--color-text-muted)",
            padding: 4,
            borderRadius: 6,
            display: "flex",
            alignItems: "center",
          }}
          aria-label="Close AI assistant"
        >
          <X size={16} />
        </button>
      </div>

      {/* Messages */}
      <div className="ai-messages" aria-live="polite" aria-label="Chat messages">
        {messages.map((msg) => (
          <div key={msg.id}>
            <div
              className={`ai-message ${
                msg.role === "user" ? "ai-message-user" : "ai-message-assistant"
              }`}
            >
              {formatMessage(msg.content)}
            </div>
            {/* Sources */}
            {msg.sources && msg.sources.length > 0 && (
              <div
                style={{
                  marginTop: 4,
                  display: "flex",
                  flexDirection: "column",
                  gap: 3,
                }}
              >
                {msg.sources.map((source, i) => (
                  <a
                    key={i}
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                      fontSize: "0.7rem",
                      color: "var(--color-secondary)",
                      textDecoration: "none",
                    }}
                    aria-label={`Source: ${source.title}`}
                  >
                    <ExternalLink size={10} />
                    {source.title.slice(0, 50)}
                    {source.title.length > 50 ? "..." : ""}
                  </a>
                ))}
              </div>
            )}
          </div>
        ))}

        {/* Loading indicator */}
        {loading && (
          <div className="ai-message ai-message-assistant" style={{ display: "flex", gap: 4 }}>
            <div className="loading-dot" />
            <div className="loading-dot" />
            <div className="loading-dot" />
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Suggested questions (show when no conversation yet) */}
      {messages.length <= 1 && !loading && (
        <div
          style={{
            padding: "0 16px 10px",
            display: "flex",
            flexWrap: "wrap",
            gap: 6,
          }}
        >
          {SUGGESTED_QUESTIONS.slice(0, 3).map((q) => (
            <button
              key={q}
              onClick={() => sendMessage(q)}
              style={{
                padding: "5px 10px",
                border: "1.5px solid var(--color-border)",
                borderRadius: 999,
                background: "white",
                fontSize: "0.7rem",
                color: "var(--color-text-secondary)",
                cursor: "pointer",
                fontFamily: "inherit",
                transition: "all 0.15s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "var(--color-accent)";
                e.currentTarget.style.color = "var(--color-accent)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "var(--color-border)";
                e.currentTarget.style.color = "var(--color-text-secondary)";
              }}
            >
              {q}
            </button>
          ))}
        </div>
      )}

      {/* Input area */}
      <div className="ai-input-area">
        <textarea
          ref={inputRef}
          id="ai-chat-input"
          className="ai-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            destinationName
              ? `Ask about ${destinationName}...`
              : "Ask about Karnataka travel..."
          }
          rows={1}
          aria-label="Ask the AI travel assistant"
          disabled={loading}
        />
        <button
          id="ai-send-btn"
          className="ai-send-btn"
          onClick={() => sendMessage(input)}
          disabled={loading || !input.trim()}
          aria-label="Send message"
        >
          {loading ? <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> : <Send size={16} />}
        </button>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
