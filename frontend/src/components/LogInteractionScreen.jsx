import React, { useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import StructuredForm from "./StructuredForm";
import ChatInterface from "./ChatInterface";
import InteractionList from "./InteractionList";
import { fetchInteractions } from "../store/interactionsSlice";

const getInitialFormState = () => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  const dateStr = `${year}-${month}-${day}`;

  const hours = String(today.getHours()).padStart(2, "0");
  const minutes = String(today.getMinutes()).padStart(2, "0");
  const timeStr = `${hours}:${minutes}`;

  return {
    hcp_name: "",          // Always empty — only filled by AI extraction or user typing
    interaction_type: "Visit",
    channel: "In-person",
    products_discussed: "",
    topics: "",
    sentiment: "Neutral",
    key_discussion_points: "",
    next_best_action: "",
    date: dateStr,
    time: timeStr,
    attendees: "",
    materials_shared: "",
    next_visit_date: "",
  };
};

const EMPTY_FORM = getInitialFormState();

export default function LogInteractionScreen({ hcp, onHcpSelected }) {
  const [mode, setMode] = useState("chat"); // "chat" | "form"
  const [form, setForm] = useState(EMPTY_FORM);
  const [aiExtractedFields, setAiExtractedFields] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [viewingItem, setViewingItem] = useState(null);
  const dispatch = useDispatch();
  const items = useSelector((s) => s.interactions.items);

  // Holds AI-extracted form data that must survive the hcp-change useEffect reset.
  // When the agent identifies a new HCP from the chat, onHcpSelected is called,
  // which changes the `hcp` prop and re-triggers this effect. Without this ref
  // the extracted data would be wiped before it can be shown in the form.
  const pendingExtractRef = useRef(null);

  useEffect(() => {
    dispatch(fetchInteractions(hcp?.id || null));
    if (pendingExtractRef.current) {
      // Apply the AI-extracted data that was queued just before the hcp changed.
      const { extractedForm, extractedKeys } = pendingExtractRef.current;
      pendingExtractRef.current = null;
      setForm(extractedForm);
      setAiExtractedFields(extractedKeys || []);
      setEditingId(null);
      setMode("form");
    } else {
      setForm(getInitialFormState());
      setAiExtractedFields([]);
      setEditingId(null);
    }
  }, [dispatch, hcp?.id]);

  const handleEdit = (item) => {
    setEditingId(item.id);
    setForm({
      hcp_name: item.hcp_name || "",
      interaction_type: item.interaction_type || "Visit",
      channel: item.channel || "In-person",
      products_discussed: (item.products_discussed || []).join(", "),
      topics: (item.topics || []).join(", "),
      sentiment: item.sentiment || "Neutral",
      key_discussion_points: item.key_discussion_points || "",
      next_best_action: item.next_best_action || "",
      date: item.date ? item.date.substring(0, 10) : "",
      time: item.interaction_time || "",
      attendees: (item.attendees || []).join(", "),
      materials_shared: (item.materials_shared || []).join(", "),
      next_visit_date: item.follow_up_date ? item.follow_up_date.substring(0, 10) : "",
    });
    setAiExtractedFields([]);
    setMode("form");
  };

  const handleView = (item) => {
    setViewingItem(item);
  };

  return (
    <div>
      <div style={styles.titleRow}>
        <div>
          <h1 style={styles.title}>Log Interaction</h1>
          <p style={styles.subtitle}>
            Record today's engagement with {hcp ? <strong>{hcp.name}</strong> : "a Healthcare Professional"} using a
            quick structured form, or just describe it conversationally —
            our AI agent will structure it for you.
          </p>
        </div>
        <div style={styles.toggle}>
          <button
            style={mode === "chat" ? styles.toggleBtnActive : styles.toggleBtn}
            onClick={() => {
              setMode("chat");
              setEditingId(null);
            }}
          >
            💬 Conversational
          </button>
          <button
            style={mode === "form" ? styles.toggleBtnActive : styles.toggleBtn}
            onClick={() => {
              setMode("form");
              setEditingId(null);
              setForm(getInitialFormState());
            }}
          >
            📋 Structured Form
          </button>
        </div>
      </div>

      <div style={styles.grid}>
        <div style={styles.leftCol}>
          {mode === "chat" ? (
            <ChatInterface
              hcp={hcp}
              interactionId={editingId}
              onHcpExtracted={(newHcpId) => {
                // onHcpSelected will change the `hcp` prop and re-trigger the
                // useEffect. The pendingExtractRef is already set at this point
                // (onExtract fires first inside ChatInterface), so the useEffect
                // will apply the AI data instead of resetting to defaults.
                onHcpSelected(newHcpId);
              }}
              onExtract={(extracted, extractedKeys) => {
                // Set the form immediately for the case where no HCP change
                // will happen (the HCP was already selected or stays null).
                // Also store in the ref so the useEffect can apply it if an
                // HCP change fires and re-runs the effect before we clear.
                pendingExtractRef.current = { extractedForm: extracted, extractedKeys };
                setForm(extracted);
                setAiExtractedFields(extractedKeys || []);
                setEditingId(null);
                setMode("form");
                // Auto-clear the ref after a short window in case onHcpExtracted
                // never fires (i.e., no new HCP was identified). This prevents
                // stale data from being applied on the next manual HCP change.
                setTimeout(() => {
                  pendingExtractRef.current = null;
                }, 500);
              }}
            />
          ) : (
            <StructuredForm
              hcp={hcp}
              form={form}
              setForm={setForm}
              aiExtractedFields={aiExtractedFields}
              setAiExtractedFields={setAiExtractedFields}
              editingId={editingId}
            />
          )}
        </div>
        <div style={styles.rightCol}>
          <InteractionList items={items} hcp={hcp} onEdit={handleEdit} onView={handleView} />
        </div>
      </div>

      {viewingItem && (
        <div style={styles.modalOverlay} onClick={() => setViewingItem(null)}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h2 style={styles.modalTitle}>Interaction Details</h2>
              <button style={styles.modalCloseX} onClick={() => setViewingItem(null)}>&times;</button>
            </div>
            <div style={styles.modalBody}>
              {[
                { label: "Healthcare Professional", value: viewingItem.hcp_name || "—" },
                { label: "Interaction Type", value: viewingItem.interaction_type || "—" },
                { label: "Channel", value: viewingItem.channel || "—" },
                { label: "Products Discussed", value: (viewingItem.products_discussed || []).join(", ") || "—" },
                { label: "Topics", value: (viewingItem.topics || []).join(", ") || "—" },
                { label: "Sentiment", value: viewingItem.sentiment || "—" },
                { label: "Key Discussion Points", value: viewingItem.key_discussion_points || "—" },
                { label: "Next Best Action", value: viewingItem.next_best_action || "—" },
                { label: "Attendees", value: (viewingItem.attendees || []).join(", ") || "—" },
                { label: "Materials Shared", value: (viewingItem.materials_shared || []).join(", ") || "—" },
                { label: "Date", value: viewingItem.date ? new Date(viewingItem.date).toLocaleDateString() : "—" },
                { label: "Time", value: viewingItem.interaction_time || "—" },
              ].map((f, idx) => (
                <div key={idx} style={styles.modalField}>
                  <div style={styles.modalLabel}>{f.label}</div>
                  <div style={styles.modalSeparator}>:</div>
                  <div style={styles.modalValue}>{f.value}</div>
                </div>
              ))}
            </div>
            <div style={styles.modalFooter}>
              <button style={styles.modalCloseBtn} onClick={() => setViewingItem(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  titleRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-end",
    flexWrap: "wrap",
    gap: 16,
    marginBottom: 24,
  },
  title: { fontSize: 24, fontWeight: 700, margin: 0 },
  subtitle: { fontSize: 14, color: "var(--color-ink-muted)", maxWidth: 560, marginTop: 6 },
  toggle: {
    display: "flex",
    gap: 4,
    background: "var(--color-surface)",
    border: "1px solid var(--color-border)",
    borderRadius: "var(--radius-md)",
    padding: 4,
  },
  toggleBtn: {
    border: "none",
    background: "transparent",
    padding: "8px 14px",
    borderRadius: "var(--radius-sm)",
    fontSize: 13.5,
    fontWeight: 500,
    color: "var(--color-ink-muted)",
  },
  toggleBtnActive: {
    border: "none",
    background: "var(--color-primary-tint)",
    color: "var(--color-primary-dark)",
    padding: "8px 14px",
    borderRadius: "var(--radius-sm)",
    fontSize: 13.5,
    fontWeight: 600,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "minmax(340px, 1fr) minmax(320px, 0.9fr)",
    gap: 24,
    alignItems: "start",
  },
  leftCol: {},
  rightCol: {},
  modalOverlay: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: "rgba(20, 33, 43, 0.5)",
    backdropFilter: "blur(4px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
    padding: "20px",
  },
  modalContent: {
    background: "var(--color-surface)",
    border: "1px solid var(--color-border)",
    borderRadius: "var(--radius-lg)",
    boxShadow: "0 10px 30px rgba(0, 0, 0, 0.15)",
    width: "100%",
    maxWidth: "580px",
    maxHeight: "85vh",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  modalHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "16px 20px",
    borderBottom: "1px solid var(--color-border)",
  },
  modalTitle: {
    fontSize: "18px",
    fontWeight: "700",
    margin: 0,
    color: "var(--color-ink)",
  },
  modalCloseX: {
    background: "transparent",
    border: "none",
    fontSize: "24px",
    cursor: "pointer",
    color: "var(--color-ink-muted)",
    lineHeight: 1,
    padding: 0,
  },
  modalBody: {
    padding: "20px",
    overflowY: "auto",
    flex: 1,
  },
  modalField: {
    display: "flex",
    marginBottom: "12px",
    fontSize: "14px",
    lineHeight: "1.5",
  },
  modalLabel: {
    fontWeight: "600",
    width: "160px",
    color: "var(--color-ink-muted)",
    flexShrink: 0,
  },
  modalSeparator: {
    marginRight: "12px",
    color: "var(--color-ink-muted)",
    flexShrink: 0,
  },
  modalValue: {
    color: "var(--color-ink)",
    wordBreak: "break-word",
    whiteSpace: "pre-wrap",
  },
  modalFooter: {
    padding: "14px 20px",
    borderTop: "1px solid var(--color-border)",
    display: "flex",
    justifyContent: "flex-end",
  },
  modalCloseBtn: {
    padding: "8px 16px",
    borderRadius: "var(--radius-sm)",
    border: "1px solid var(--color-border)",
    background: "#fff",
    fontSize: "13.5px",
    fontWeight: "600",
    cursor: "pointer",
    color: "var(--color-ink)",
    transition: "background 0.2s",
  },
};
