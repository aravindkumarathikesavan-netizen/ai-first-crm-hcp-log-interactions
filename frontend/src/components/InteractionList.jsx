import React, { useState } from "react";
import { useDispatch } from "react-redux";
import { editInteraction, removeInteraction, fetchAllDoctors } from "../store/interactionsSlice";

const sentimentColor = (s) => {
  if (s === "Positive") return "var(--color-positive)";
  if (s === "Negative") return "var(--color-negative)";
  return "var(--color-neutral)";
};

export default function InteractionList({ items, hcp, onEdit, onView }) {
  const filtered = hcp
    ? items.filter((i) => i.hcp_id === hcp.id || i.hcp_name === hcp.name)
    : items;

  return (
    <div style={styles.card}>
      <div style={styles.header}>
        <div style={styles.headerTitle}>Interaction History</div>
        <div style={styles.headerCount}>{filtered.length} logged</div>
      </div>

      <div style={styles.list}>
        {filtered.length === 0 && (
          <div style={styles.empty}>
            {hcp ? `No interactions logged yet for ${hcp.name}.` : "No interactions have been logged yet."}
          </div>
        )}
        {filtered.map((item) => (
          <InteractionCard key={item.id} item={item} onEdit={onEdit} onView={onView} />
        ))}
      </div>
    </div>
  );
}

function InteractionCard({ item, onEdit, onView }) {
  const dispatch = useDispatch();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({
    sentiment: item.sentiment,
    next_best_action: item.next_best_action || "",
  });

  const save = () => {
    dispatch(editInteraction({ id: item.id, payload: draft })).then(() => {
      dispatch(fetchAllDoctors());
    });
    setEditing(false);
  };

  return (
    <div style={styles.item}>
      <div style={styles.itemHeader}>
        <span style={styles.itemType}>{item.interaction_type}</span>
        <span style={{ ...styles.badge, color: sentimentColor(item.sentiment), borderColor: sentimentColor(item.sentiment) }}>
          {item.sentiment}
        </span>
        <span style={styles.itemDate}>
          {item.date ? new Date(item.date).toLocaleDateString() : ""}
        </span>
        <span style={styles.sourceTag}>{item.source === "chat" ? "🤖 AI-logged" : "📋 Form"}</span>
      </div>

      {/* ── Dr. Name + Attendees — single row ──────────────────────────── */}
      <div style={styles.metaRow}>
        <span style={styles.metaLabel}>Dr. Name</span>
        <span style={styles.metaValue}>{item.hcp_name || "—"}</span>

        {item.attendees && item.attendees.length > 0 && (
          <>
            <span style={styles.metaDivider}>|</span>
            <span style={styles.metaLabel}>Attendees</span>
            <div style={styles.attendeeList}>
              {item.attendees.map((a, idx) => (
                <span key={idx} style={styles.attendeeChip}>{a}</span>
              ))}
            </div>
          </>
        )}
      </div>

      {item.products_discussed?.length > 0 && (
        <div style={styles.products}>
          {item.products_discussed.map((p) => (
            <span key={p} style={styles.productChip}>{p}</span>
          ))}
        </div>
      )}

      <div style={styles.summary}>{item.key_discussion_points}</div>

      {!editing ? (
        <div style={styles.footerRow}>
          <div style={styles.nba}>
            <strong>Next:</strong> {item.next_best_action || "—"}
          </div>
          <div style={styles.actions}>
            <button style={styles.linkBtn} onClick={() => onEdit && onEdit(item)}>Edit</button>
            <button style={styles.linkBtn} onClick={() => onView && onView(item)}>View</button>
            <button
              style={{ ...styles.linkBtn, color: "var(--color-negative)" }}
              onClick={() => dispatch(removeInteraction(item.id)).then(() => {
                dispatch(fetchAllDoctors());
              })}
            >
              Delete
            </button>
          </div>
        </div>
      ) : (
        <div style={styles.editBox}>
          <select
            style={styles.editInput}
            value={draft.sentiment}
            onChange={(e) => setDraft({ ...draft, sentiment: e.target.value })}
          >
            <option>Positive</option>
            <option>Neutral</option>
            <option>Negative</option>
          </select>
          <input
            style={styles.editInput}
            value={draft.next_best_action}
            onChange={(e) => setDraft({ ...draft, next_best_action: e.target.value })}
            placeholder="Next best action"
          />
          <div style={styles.actions}>
            <button style={styles.linkBtn} onClick={save}>Save</button>
            <button style={styles.linkBtn} onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  card: {
    background: "var(--color-surface)",
    border: "1px solid var(--color-border)",
    borderRadius: "var(--radius-lg)",
    boxShadow: "var(--shadow-card)",
    padding: 18,
    maxHeight: 640,
    display: "flex",
    flexDirection: "column",
  },
  header: { display: "flex", justifyContent: "space-between", marginBottom: 12 },
  headerTitle: { fontWeight: 700, fontSize: 15 },
  headerCount: { fontSize: 12.5, color: "var(--color-ink-muted)" },
  list: { overflowY: "auto", display: "flex", flexDirection: "column", gap: 12 },
  empty: { fontSize: 13, color: "var(--color-ink-muted)", padding: "20px 0", textAlign: "center" },
  item: {
    border: "1px solid var(--color-border)",
    borderRadius: "var(--radius-md)",
    padding: 14,
  },
  itemHeader: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8 },
  itemType: { fontWeight: 600, fontSize: 13.5 },
  badge: {
    fontSize: 11,
    fontWeight: 700,
    border: "1px solid",
    borderRadius: 20,
    padding: "1px 8px",
  },
  itemDate: { fontSize: 12, color: "var(--color-ink-muted)", marginLeft: "auto" },
  sourceTag: { fontSize: 11, color: "var(--color-accent)", fontWeight: 600 },
  // ── Dr. Name / Attendees — single combined row ───────────────────────
  metaRow: {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 8,
  },
  metaLabel: {
    fontSize: 11,
    fontWeight: 700,
    color: "var(--color-ink-muted)",
    background: "var(--color-surface-alt, #f4f6f8)",
    border: "1px solid var(--color-border)",
    borderRadius: 4,
    padding: "1px 7px",
    whiteSpace: "nowrap",
    lineHeight: 1.8,
  },
  metaValue: {
    fontSize: 13,
    fontWeight: 600,
    color: "var(--color-ink)",
    lineHeight: 1.8,
  },
  metaDivider: {
    color: "var(--color-border)",
    fontSize: 14,
    lineHeight: 1,
    userSelect: "none",
    margin: "0 2px",
  },
  attendeeList: {
    display: "flex",
    flexWrap: "wrap",
    gap: 5,
    alignItems: "center",
  },
  attendeeChip: {
    fontSize: 13,
    color: "var(--color-ink)",
    fontWeight: 600,
    lineHeight: 1.8,
  },
  // ─────────────────────────────────────────────────────────────────────────
  products: { display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 },
  productChip: {
    fontSize: 11.5,
    background: "var(--color-primary-tint)",
    color: "var(--color-primary-dark)",
    padding: "2px 9px",
    borderRadius: 20,
    fontWeight: 600,
  },
  summary: { fontSize: 13.5, color: "var(--color-ink)", marginBottom: 10, lineHeight: 1.5 },
  footerRow: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 },
  nba: { fontSize: 12.5, color: "var(--color-ink-muted)", flex: 1 },
  actions: { display: "flex", gap: 10 },
  linkBtn: {
    border: "none",
    background: "none",
    color: "var(--color-primary)",
    fontSize: 12.5,
    fontWeight: 600,
    padding: 0,
  },
  editBox: { display: "flex", flexDirection: "column", gap: 8, marginTop: 6 },
  editInput: {
    padding: "7px 10px",
    borderRadius: "var(--radius-sm)",
    border: "1px solid var(--color-border)",
    fontSize: 13,
  },
};
