import React, { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { fetchAllDoctors } from "./store/interactionsSlice";
import LogInteractionScreen from "./components/LogInteractionScreen";

export default function App() {
  const dispatch = useDispatch();
  const [selectedHcp, setSelectedHcp] = useState(null);
  const doctors = useSelector((state) => state.interactions.doctors || []);

  useEffect(() => {
    dispatch(fetchAllDoctors());
  }, [dispatch]);

  const handleHcpSelected = (hcpIdOrObj) => {
    if (!hcpIdOrObj) {
      setSelectedHcp(null);
      return;
    }
    if (typeof hcpIdOrObj === "string") {
      const h = doctors.find((item) => item.id === hcpIdOrObj);
      setSelectedHcp(h || null);
    } else {
      setSelectedHcp(hcpIdOrObj);
    }
  };

  return (
    <div style={styles.shell}>
      <header style={styles.header}>
        <div style={styles.brand}>
          <div style={styles.brandMark}>H</div>
          <div>
            <div style={styles.brandTitle}>HCP CRM</div>
            <div style={styles.brandSub}>AI-first field engagement</div>
          </div>
        </div>

        <div style={styles.hcpPicker}>
          <label style={styles.hcpLabel}>Healthcare Professional</label>
          <select
            style={styles.select}
            value={selectedHcp ? selectedHcp.id : ""}
            onChange={(e) => handleHcpSelected(e.target.value || null)}
          >
            {doctors.length === 0 ? (
              <option value="" disabled>No doctors logged yet</option>
            ) : (
              <>
                <option value="">— All Interactions —</option>
                {doctors.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))}
              </>
            )}
          </select>
        </div>
      </header>

      <main style={styles.main}>
        <LogInteractionScreen hcp={selectedHcp} onHcpSelected={handleHcpSelected} />
      </main>
    </div>
  );
}

const styles = {
  shell: { minHeight: "100vh", display: "flex", flexDirection: "column" },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "16px 32px",
    background: "var(--color-surface)",
    borderBottom: "1px solid var(--color-border)",
    flexWrap: "wrap",
    gap: 16,
  },
  brand: { display: "flex", alignItems: "center", gap: 12 },
  brandMark: {
    width: 36,
    height: 36,
    borderRadius: "var(--radius-sm)",
    background: "var(--color-primary)",
    color: "#fff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 700,
    fontSize: 18,
  },
  brandTitle: { fontWeight: 700, fontSize: 16, lineHeight: 1.2 },
  brandSub: { fontSize: 12.5, color: "var(--color-ink-muted)" },
  hcpPicker: { display: "flex", alignItems: "center", gap: 10 },
  hcpLabel: { fontSize: 12.5, color: "var(--color-ink-muted)", fontWeight: 500 },
  select: {
    padding: "8px 12px",
    borderRadius: "var(--radius-sm)",
    border: "1px solid var(--color-border)",
    background: "#fff",
    fontSize: 14,
    minWidth: 260,
  },
  main: { flex: 1, padding: "28px 32px", maxWidth: 1180, margin: "0 auto", width: "100%" },
};
