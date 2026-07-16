import React, { useRef, useState, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { addUserMessage, sendMessage } from "../store/chatSlice";

const SUGGESTIONS = [
  "Met Dr. Rao today, discussed CardioX efficacy data, she was very positive and asked for 2 samples",
  "What should I do next with this HCP?",
  "Show me the history for this HCP",
];

export default function ChatInterface({ hcp, interactionId, onExtract, onHcpExtracted }) {
  const dispatch = useDispatch();
  const { sessionId, messages, status } = useSelector((s) => s.chat);
  const [text, setText] = useState("");
  const endRef = useRef(null);
  const textareaRef = useRef(null);

  const [showSettings, setShowSettings] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState(localStorage.getItem("groq_api_key") || "");

  const hasApiKey = !!localStorage.getItem("groq_api_key");

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      const newHeight = Math.min(textareaRef.current.scrollHeight, 80);
      textareaRef.current.style.height = `${newHeight}px`;
    }
  }, [text]);

  const saveApiKey = (key) => {
    const trimmed = key.trim();
    if (trimmed) {
      localStorage.setItem("groq_api_key", trimmed);
    } else {
      localStorage.removeItem("groq_api_key");
    }
    setApiKeyInput(trimmed);
    setShowSettings(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const submit = (msg) => {
    const value = (msg ?? text).trim();
    if (!value) return;
    dispatch(addUserMessage(value));
    dispatch(
      sendMessage({
        session_id: sessionId,
        message: value,
        hcp_id: hcp?.id || null,
        hcp_name: hcp?.name || null,
        interaction_id: interactionId || null,
      })
    ).then((res) => {
      if (res.payload) {
        // ── Step 1: build & hand off the extracted form data FIRST ──────────
        // This must happen before onHcpExtracted so that LogInteractionScreen
        // can store the data in pendingExtractRef before the hcp-change
        // useEffect fires and resets the form.
        if (res.payload.tool_calls?.includes("log_interaction")) {
          const rawExt = res.payload.extracted || {};
          const extractedKeys = [];

          const today = new Date();
          const year = today.getFullYear();
          const month = String(today.getMonth() + 1).padStart(2, "0");
          const day = String(today.getDate()).padStart(2, "0");
          const defaultDateStr = `${year}-${month}-${day}`;

          const hours = String(today.getHours()).padStart(2, "0");
          const minutes = String(today.getMinutes()).padStart(2, "0");
          const defaultTimeStr = `${hours}:${minutes}`;

          // Guard against the LLM returning descriptive text instead of a date.
          // Only accept strict YYYY-MM-DD strings; anything else becomes empty/default.
          const sanitizeDate = (val) =>
            val && /^\d{4}-\d{2}-\d{2}$/.test(String(val).trim()) ? String(val).trim() : null;
          const sanitizeTime = (val) =>
            val && /^\d{2}:\d{2}$/.test(String(val).trim()) ? String(val).trim() : null;

          const extractedForm = {
            hcp_name: rawExt.hcp_name || "",
            interaction_type: rawExt.interaction_type || "Visit",
            channel: rawExt.channel || "In-person",
            products_discussed: (rawExt.products_discussed || []).join(", "),
            topics: (rawExt.topics || []).join(", "),
            sentiment: rawExt.sentiment || "Neutral",
            key_discussion_points: rawExt.key_discussion_points || "",
            next_best_action: rawExt.next_best_action || "",
            date: sanitizeDate(rawExt.date) || defaultDateStr,
            time: sanitizeTime(rawExt.time) || defaultTimeStr,
            attendees: (rawExt.attendees || []).join(", "),
            materials_shared: (rawExt.materials_shared || []).join(", "),
            next_visit_date: sanitizeDate(rawExt.next_visit_date) || "",
          };

          if (rawExt.hcp_name) extractedKeys.push("hcp_name");
          if (rawExt.interaction_type) extractedKeys.push("interaction_type");
          if (rawExt.channel) extractedKeys.push("channel");
          if (rawExt.products_discussed && rawExt.products_discussed.length > 0) extractedKeys.push("products_discussed");
          if (rawExt.topics && rawExt.topics.length > 0) extractedKeys.push("topics");
          if (rawExt.sentiment) extractedKeys.push("sentiment");
          if (rawExt.key_discussion_points) extractedKeys.push("key_discussion_points");
          if (rawExt.next_best_action) extractedKeys.push("next_best_action");
          if (rawExt.date) extractedKeys.push("date");
          if (rawExt.time) extractedKeys.push("time");
          if (rawExt.attendees && rawExt.attendees.length > 0) extractedKeys.push("attendees");
          if (rawExt.materials_shared && rawExt.materials_shared.length > 0) extractedKeys.push("materials_shared");
          if (rawExt.next_visit_date) extractedKeys.push("next_visit_date");

          if (onExtract) {
            onExtract(extractedForm, extractedKeys);
          }
        }

        // ── Step 2: notify parent of discovered HCP AFTER onExtract ─────────
        // onHcpExtracted changes the `hcp` prop which re-triggers the useEffect
        // in LogInteractionScreen. By calling it here (after onExtract has
        // already stored data in pendingExtractRef), the useEffect will apply
        // the AI data rather than resetting to blank defaults.
        const item = res.payload.interaction;
        if (item && item.hcp_id && item.hcp_id !== "unknown-hcp" && onHcpExtracted) {
          onHcpExtracted(item.hcp_id);
        }
      }
    });
    setText("");
  };

  return (
    <div style={styles.card}>
      <div style={styles.chatHeader}>
        <div style={styles.chatHeaderTitle}>🤖 LangGraph AI Agent</div>
        <button
          style={{
            ...styles.settingsToggleBtn,
            background: hasApiKey ? "var(--color-primary-tint)" : "var(--color-border)",
            color: hasApiKey ? "var(--color-primary-dark)" : "var(--color-ink-muted)",
          }}
          onClick={() => setShowSettings(!showSettings)}
          title="Configure API Settings"
        >
          ⚙️ {hasApiKey ? "Custom Key Configured" : "Set API Key"}
        </button>
      </div>

      {showSettings && (
        <div style={styles.settingsPanel}>
          <div style={styles.settingsLabel}>Custom Groq API Key (stored locally in browser):</div>
          <div style={styles.settingsRow}>
            <input
              type="password"
              style={styles.settingsInput}
              placeholder="gsk_..."
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
            />
            <button style={styles.saveBtn} onClick={() => saveApiKey(apiKeyInput)}>
              Save
            </button>
            <button style={styles.clearBtn} onClick={() => saveApiKey("")}>
              Clear
            </button>
          </div>
          <div style={styles.settingsHelp}>
            No key? Get a free key at{" "}
            <a
              href="https://console.groq.com"
              target="_blank"
              rel="noreferrer"
              style={styles.settingsLink}
            >
              console.groq.com
            </a>
          </div>
        </div>
      )}

      <div style={styles.log}>
        {messages.length === 0 && (
          <div style={styles.emptyState}>
            <div style={styles.emptyTitle}>Tell me what happened with {hcp ? hcp.name : "Select Healthcare Professional"}</div>
            <div style={styles.emptySub}>
              The LangGraph agent will extract the interaction type, products,
              sentiment, and next steps automatically.
            </div>
            <div style={styles.suggestions}>
              {SUGGESTIONS.map((s) => (
                <button key={s} style={styles.suggestionChip} onClick={() => submit(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div
            key={i}
            style={{
              ...styles.bubbleRow,
              justifyContent: m.role === "rep" ? "flex-end" : "flex-start",
            }}
          >
            <div style={m.role === "rep" ? styles.bubbleRep : styles.bubbleAgent}>
              {m.text}
              {m.toolCalls?.length > 0 && (
                <div style={styles.toolTag}>
                  🔧 {m.toolCalls.join(", ")}
                </div>
              )}
            </div>
          </div>
        ))}

        {status === "loading" && (
          <div style={styles.bubbleRow}>
            <div style={styles.bubbleAgent}>Thinking…</div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div style={styles.inputRow}>
        <textarea
          ref={textareaRef}
          rows={1}
          style={styles.textInput}
          placeholder="Describe the interaction, or ask a question…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button style={styles.sendBtn} onClick={() => submit()}>
          Send
        </button>
      </div>
    </div>
  );
}

const styles = {
  card: {
    background: "var(--color-surface)",
    border: "1px solid var(--color-border)",
    borderRadius: "var(--radius-lg)",
    boxShadow: "var(--shadow-card)",
    display: "flex",
    flexDirection: "column",
    height: 520,
  },
  chatHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "12px 18px",
    borderBottom: "1px solid var(--color-border)",
    background: "var(--color-bg)",
    borderTopLeftRadius: "var(--radius-lg)",
    borderTopRightRadius: "var(--radius-lg)",
  },
  chatHeaderTitle: {
    fontWeight: 600,
    fontSize: 14,
    color: "var(--color-ink)",
  },
  settingsToggleBtn: {
    border: "none",
    padding: "6px 12px",
    borderRadius: "var(--radius-sm)",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: 4,
    transition: "background 0.2s, color 0.2s",
  },
  settingsPanel: {
    background: "var(--color-surface)",
    borderBottom: "1px solid var(--color-border)",
    padding: "14px 18px",
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  settingsLabel: {
    fontSize: 12.5,
    fontWeight: 500,
    color: "var(--color-ink-muted)",
  },
  settingsRow: {
    display: "flex",
    gap: 8,
  },
  settingsInput: {
    flex: 1,
    padding: "8px 12px",
    borderRadius: "var(--radius-sm)",
    border: "1px solid var(--color-border)",
    fontSize: 13,
  },
  saveBtn: {
    padding: "8px 16px",
    borderRadius: "var(--radius-sm)",
    border: "none",
    background: "var(--color-primary)",
    color: "#fff",
    fontWeight: 600,
    fontSize: 13,
  },
  clearBtn: {
    padding: "8px 16px",
    borderRadius: "var(--radius-sm)",
    border: "1px solid var(--color-border)",
    background: "var(--color-surface)",
    color: "var(--color-ink-muted)",
    fontWeight: 600,
    fontSize: 13,
  },
  settingsHelp: {
    fontSize: 11.5,
    color: "var(--color-ink-muted)",
  },
  settingsLink: {
    color: "var(--color-primary)",
    textDecoration: "underline",
    fontWeight: 500,
  },
  log: { flex: 1, overflowY: "auto", padding: 20, display: "flex", flexDirection: "column", gap: 10 },
  emptyState: { margin: "auto", textAlign: "center", maxWidth: 380 },
  emptyTitle: { fontWeight: 600, fontSize: 15, marginBottom: 6 },
  emptySub: { fontSize: 13, color: "var(--color-ink-muted)", marginBottom: 16 },
  suggestions: { display: "flex", flexDirection: "column", gap: 8 },
  suggestionChip: {
    textAlign: "left",
    border: "1px solid var(--color-border)",
    background: "var(--color-accent-tint)",
    color: "var(--color-accent)",
    padding: "9px 12px",
    borderRadius: "var(--radius-md)",
    fontSize: 13,
  },
  bubbleRow: { display: "flex" },
  bubbleRep: {
    background: "var(--color-primary)",
    color: "#fff",
    padding: "10px 14px",
    borderRadius: "14px 14px 4px 14px",
    maxWidth: "78%",
    fontSize: 14,
    lineHeight: 1.45,
  },
  bubbleAgent: {
    background: "var(--color-accent-tint)",
    color: "var(--color-ink)",
    padding: "10px 14px",
    borderRadius: "14px 14px 14px 4px",
    maxWidth: "78%",
    fontSize: 14,
    lineHeight: 1.45,
    whiteSpace: "pre-line",
  },
  toolTag: {
    marginTop: 6,
    fontSize: 11,
    color: "var(--color-accent)",
    fontWeight: 600,
    letterSpacing: 0.2,
  },
  inputRow: { display: "flex", gap: 8, padding: 14, borderTop: "1px solid var(--color-border)", alignItems: "flex-end", justifyContent: "center" },
  textInput: {
    flex: 1,
    padding: "10px",
    borderRadius: "var(--radius-md)",
    border: "1px solid var(--color-border)",
    fontSize: 14,
    fontFamily: "inherit",
    resize: "none",
    height: "auto",
    lineHeight: "1.4",
    overflowY: "auto",
  },
  sendBtn: {
    height: "40px",
    width: "80px",
    borderRadius: "var(--radius-md)",
    border: "none",
    background: "var(--color-primary)",
    color: "#fff",
    fontWeight: 600,
    fontSize: 14,
  },
};
