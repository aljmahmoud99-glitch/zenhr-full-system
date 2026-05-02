export function After() {
  const rows = [
    { init: "A", name: "Ahmed Al-Hassan", email: "ahmed@zenjo.com", branch: "Amman Branch", node: "Human Resources", crumb: "ZenJO Technology Company › Amman Branch › Human Resources", title: "HR Specialist" },
    { init: "S", name: "Sara Mahmoud",    email: "sara@zenjo.com",   branch: "Amman Branch", node: "Information Technology", crumb: "ZenJO Technology Company › Amman Branch › Information Technology", title: "Software Engineer" },
    { init: "K", name: "Khaled Al-Nemer", email: "khaled@zenjo.com", branch: "Amman Branch", node: "Information Technology", crumb: "ZenJO Technology Company › Amman Branch › Information Technology", title: "IT Manager" },
  ];

  return (
    <div style={{ fontFamily: "'DM Sans', system-ui, sans-serif", background: "#F1F5F9", minHeight: "100vh", padding: "32px 24px" }}>
      <div style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ background: "#D1FAE5", color: "#065F46", padding: "3px 10px", borderRadius: 999, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em" }}>After</span>
        <span style={{ fontSize: 11, color: "#94A3B8", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".07em" }}>Polished — branch badge defined · breadcrumb light · cells aligned</span>
      </div>

      <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 10, overflow: "hidden", boxShadow: "0 0 0 1px rgba(0,0,0,.04), 0 2px 8px rgba(0,0,0,.06)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead style={{ background: "#F8FAFB" }}>
            <tr>
              {["Employee", "Branch", "Org Unit", "Job Title"].map(h => (
                <th key={h} style={{ padding: "12px 16px", textAlign: "left", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".6px", color: "#475569", borderBottom: "2px solid #E2E8F0", whiteSpace: "nowrap", verticalAlign: "middle" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} style={{ borderBottom: i < rows.length - 1 ? "1px solid #E2E8F0" : "none" }}>
                {/* Employee */}
                <td style={{ padding: "14px 16px", verticalAlign: "middle" }}>
                  <div style={{ display: "inline-flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 38, height: 38, borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg,#1A5C3E,#2D9E6B)", color: "#fff", fontWeight: 700, fontSize: 15, flexShrink: 0 }}>{r.init}</div>
                    <div style={{ display: "grid", gap: 4 }}>
                      <strong style={{ fontSize: 14, color: "#0F172A" }}>{r.name}</strong>
                      <small style={{ fontSize: 13, color: "#475569" }}>{r.email}</small>
                    </div>
                  </div>
                </td>
                {/* Branch — improved badge */}
                <td style={{ padding: "14px 16px", verticalAlign: "middle" }}>
                  <span style={{
                    display: "inline-flex", alignItems: "center",
                    fontSize: 11, fontWeight: 600, padding: "2px 9px",
                    borderRadius: 999,
                    background: "rgba(47,157,105,.08)",
                    color: "#2D9E6B",
                    border: "1px solid rgba(47,157,105,.22)",
                    whiteSpace: "nowrap",
                    letterSpacing: "0.01em"
                  }}>{r.branch}</span>
                </td>
                {/* Org Unit — tighter, lighter breadcrumb */}
                <td style={{ padding: "14px 16px", verticalAlign: "middle", background: "rgba(45,158,107,.03)" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 160, overflow: "hidden" }}>
                    <span style={{ fontSize: 14, fontWeight: 500, color: "#0F172A", lineHeight: 1.4 }}>{r.node}</span>
                    <span style={{ display: "block", fontSize: 10, fontWeight: 400, color: "#94A3B8", lineHeight: 1.3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>{r.crumb}</span>
                  </div>
                </td>
                {/* Job Title */}
                <td style={{ padding: "14px 16px", fontSize: 14, color: "#0F172A", verticalAlign: "middle" }}>{r.title}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
        {[
          "Branch badge: thin border + defined ring",
          "Breadcrumb: 10px, max-width: 100%, overflow: hidden on parent",
          "Gap tightened: 4px → 3px",
          "vertical-align: middle on all td/th",
        ].map(t => (
          <span key={t} style={{ background: "#F0FDF4", color: "#166534", borderRadius: 6, padding: "4px 10px", fontSize: 11, fontWeight: 500 }}>✓ {t}</span>
        ))}
      </div>
    </div>
  );
}
