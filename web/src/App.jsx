import { useEffect, useState } from "react";
import { Bar } from "react-chartjs-2";
import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  ArcElement,
  Tooltip
} from "chart.js";
import { Doughnut } from "react-chartjs-2";
import ForceGraph from "./components/ForceGraph";
import { fetchAlerts, fetchAnalytics, fetchCases, fetchCurrentUser, fetchGraph, fetchInvestigationSummary, fetchNodeDetail, fetchRingDetail, fetchRings, loginUser, predictTransaction, registerUser, saveCase, setAuthToken } from "./api";

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend);

const demoTransaction = {
  transaction_id: "demo_1009",
  sender_id: "user_01",
  receiver_id: "merchant_24",
  amount: 5600,
  timestamp: new Date().toISOString(),
  device_id: "device_new",
  product_type: "UPI",
  email_domain: "mail.xyz",
  location: "Proxy"
};

const storyPoints = [
  {
    label: "Problem",
    title: "Fraud spreads through coordinated networks",
    body: "Traditional classifiers inspect one payment at a time. FraudSense maps the relationship graph so clusters become visible before the next burst lands."
  },
  {
    label: "Signal",
    title: "Graph risk exposes hidden ring behavior",
    body: "We combine node behavior, transaction velocity, counterparties, and linked-ring evidence to score suspicious movement instead of isolated anomalies."
  },
  {
    label: "Outcome",
    title: "Analysts and users both get an action path",
    body: "Investigators see the cluster, while customers receive a risk alert instantly. The same backend powers the dashboard and the mobile experience."
  }
];

const demoFlow = [
  "Simulate a risky UPI payment",
  "Watch the fraud graph refresh",
  "Inspect the linked ring and score",
  "Trigger the customer alert flow"
];

const caseFilters = ["all", "open", "monitoring", "escalated", "resolved"];
const analystOwners = ["All owners", "Asha", "Rahul", "Neha", "Unassigned"];

export default function App() {
  const [session, setSession] = useState(null);
  const [activeView, setActiveView] = useState("analyst");
  const [authMode, setAuthMode] = useState("login");
  const [authForm, setAuthForm] = useState({
    username: "asha",
    password: "asha@1234",
    display_name: ""
  });
  const [authError, setAuthError] = useState("");
  const [graph, setGraph] = useState({ nodes: [], edges: [] });
  const [ringData, setRingData] = useState({ rings: [] });
  const [alertData, setAlertData] = useState({ alerts: [] });
  const [analytics, setAnalytics] = useState({
    total_nodes: 0,
    total_edges: 0,
    detected_rings: 0,
    high_risk_nodes: 0,
    high_risk_edges: 0,
    volume_by_risk_band: [],
    ring_risk_distribution: []
  });
  const [prediction, setPrediction] = useState(null);
  const [selectedRingId, setSelectedRingId] = useState(null);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [nodeDetail, setNodeDetail] = useState(null);
  const [ringDetail, setRingDetail] = useState(null);
  const [investigationSummary, setInvestigationSummary] = useState(null);
  const [caseRecords, setCaseRecords] = useState([]);
  const [caseStatus, setCaseStatus] = useState("open");
  const [assignedTo, setAssignedTo] = useState("Asha");
  const [dueAt, setDueAt] = useState("2026-03-27T17:00");
  const [caseTags, setCaseTags] = useState("upi, ring");
  const [analystNotes, setAnalystNotes] = useState("");
  const [caseFilter, setCaseFilter] = useState("all");
  const [ownerFilter, setOwnerFilter] = useState("All owners");
  const [staleOnly, setStaleOnly] = useState(false);
  const [isBootstrapping, setIsBootstrapping] = useState(false);

  const dataUserId = session?.linked_user_id || "user_01";

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const storedToken = window.localStorage.getItem("fraudsense_token");
    if (!storedToken) {
      return;
    }
    setAuthToken(storedToken);
    fetchCurrentUser().then(setSession).catch(() => {
      setAuthToken(null);
      window.localStorage.removeItem("fraudsense_token");
    });
  }, []);

  useEffect(() => {
    if (!session) {
      return;
    }
    setIsBootstrapping(true);
    fetchGraph(dataUserId).then(setGraph).catch(() => setGraph({ nodes: [], edges: [] }));
    fetchRings(dataUserId).then(setRingData).catch(() => setRingData({ rings: [] }));
    fetchAnalytics(dataUserId).then(setAnalytics).catch(() => setAnalytics({
      total_nodes: 0,
      total_edges: 0,
      detected_rings: 0,
      high_risk_nodes: 0,
      high_risk_edges: 0,
      volume_by_risk_band: [],
      ring_risk_distribution: []
    }));
    fetchCases(dataUserId).then((payload) => setCaseRecords(payload.cases)).catch(() => setCaseRecords([]));
    fetchAlerts(dataUserId).then(setAlertData).catch(() => setAlertData({ alerts: [] })).finally(() => setIsBootstrapping(false));
    if (session.role === "customer") {
      setActiveView("customer");
    } else {
      setActiveView("analyst");
    }
  }, [session, dataUserId]);

  useEffect(() => {
    if (!selectedRingId && ringData.rings.length > 0) {
      setSelectedRingId(ringData.rings[0].ring_id);
    }
  }, [ringData, selectedRingId]);

  useEffect(() => {
    if (!selectedNodeId && graph.nodes.length > 0) {
      setSelectedNodeId(graph.nodes[0].id);
    }
  }, [graph, selectedNodeId]);

  useEffect(() => {
    if (!selectedNodeId) return;
    fetchNodeDetail(selectedNodeId).then(setNodeDetail).catch(() => setNodeDetail(null));
  }, [selectedNodeId]);

  useEffect(() => {
    if (!selectedRingId) return;
    fetchRingDetail(selectedRingId).then(setRingDetail).catch(() => setRingDetail(null));
  }, [selectedRingId]);

  useEffect(() => {
    if (!session) return;
    fetchInvestigationSummary(dataUserId, {
      ring_id: selectedRingId || undefined,
      node_id: selectedNodeId || undefined
    }).then(setInvestigationSummary).catch(() => setInvestigationSummary(null));
  }, [selectedRingId, selectedNodeId, session, dataUserId]);

  useEffect(() => {
    const matchedCase = caseRecords.find((entry) => entry.ring_id === selectedRingId && entry.node_id === selectedNodeId);
    if (matchedCase) {
      setCaseStatus(matchedCase.status);
      setAssignedTo(matchedCase.assigned_to);
      setDueAt(matchedCase.due_at ? matchedCase.due_at.slice(0, 16) : "");
      setCaseTags(matchedCase.tags.join(", "));
      setAnalystNotes(matchedCase.analyst_notes);
      return;
    }
    setCaseStatus("open");
    setAssignedTo("Asha");
    setDueAt("2026-03-27T17:00");
    setCaseTags("upi, ring");
    setAnalystNotes("");
  }, [caseRecords, selectedRingId, selectedNodeId]);

  async function runDemoPrediction() {
    const result = await predictTransaction(demoTransaction);
    setPrediction(result);
    const updatedGraph = await fetchGraph(dataUserId);
    const updatedRings = await fetchRings(dataUserId);
    const updatedAnalytics = await fetchAnalytics(dataUserId);
    const updatedAlerts = await fetchAlerts(dataUserId);
    setGraph(updatedGraph);
    setRingData(updatedRings);
    setAnalytics(updatedAnalytics);
    setAlertData(updatedAlerts);
  }

  async function handleLogin(event) {
    event.preventDefault();
    setAuthError("");
    try {
      const response = authMode === "login"
        ? await loginUser({
            username: authForm.username,
            password: authForm.password
          })
        : await registerUser({
            username: authForm.username,
            password: authForm.password,
            display_name: authForm.display_name || authForm.username
          });
      setAuthToken(response.access_token);
      if (typeof window !== "undefined") {
        window.localStorage.setItem("fraudsense_token", response.access_token);
      }
      setSession(response.user);
    } catch (error) {
      setAuthError(error?.response?.data?.detail || "Could not sign in");
    }
  }

  function handleLogout() {
    setAuthToken(null);
    if (typeof window !== "undefined") {
      window.localStorage.removeItem("fraudsense_token");
    }
    setSession(null);
    setPrediction(null);
    setGraph({ nodes: [], edges: [] });
    setRingData({ rings: [] });
    setAlertData({ alerts: [] });
    setCaseRecords([]);
    setAuthError("");
  }

  const topRing = ringData.rings[0] || null;
  const selectedRing = ringData.rings.find((ring) => ring.ring_id === selectedRingId) || topRing;
  const selectedNode = graph.nodes.find((node) => node.id === selectedNodeId) || graph.nodes[0] || null;
  const selectedNodeTransactions = nodeDetail?.recent_transactions || [];
  const selectedNodeTimeline = selectedNodeTransactions.map((edge, index) => ({
    ...edge,
    id: `${edge.transaction_id}-${index}`,
    direction: edge.direction === "outgoing" ? "Outgoing" : "Incoming",
    counterparty: edge.counterparty
  }));
  const selectedNodePeers = nodeDetail?.counterparties || [];
  const selectedTransaction = selectedNodeTimeline[0] || null;
  const selectedCase = caseRecords.find((entry) => entry.ring_id === selectedRingId && entry.node_id === selectedNodeId) || caseRecords[0] || null;
  const highestPriorityCase = caseRecords[0] || null;
  const latestAlert = alertData.alerts?.[0] || null;
  const customerRiskLabel = prediction?.risk_label || latestAlert?.risk_label || "low";
  const customerRiskScore = prediction ? Math.round(prediction.fraud_probability * 100) : latestAlert ? Math.round(latestAlert.fraud_probability * 100) : 12;
  const customerStatus = customerRiskLabel === "high" ? "Protected, but action needed" : customerRiskLabel === "medium" ? "Monitoring activity" : "All clear";

  function copyCaseSummary() {
    if (!investigationSummary || !navigator?.clipboard?.writeText) {
      return;
    }
    const payload = [
      investigationSummary.headline,
      investigationSummary.summary,
      "",
      "Key observations:",
      ...investigationSummary.key_observations.map((item) => `- ${item}`),
      "",
      "Recommended actions:",
      ...investigationSummary.recommended_actions.map((item) => `- ${item}`)
    ].join("\n");
    navigator.clipboard.writeText(payload);
  }

  function downloadCaseBundle() {
    if (!investigationSummary || typeof document === "undefined") {
      return;
    }
    const bundle = {
      exported_at: new Date().toISOString(),
      selected_ring: selectedRing,
      selected_node: nodeDetail || selectedNode,
      summary: investigationSummary,
      latest_prediction: prediction
    };
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${investigationSummary.ring_id || "case"}-${investigationSummary.node_id || "summary"}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }

  async function persistCaseRecord() {
    if (!investigationSummary) {
      return;
    }
    const payload = {
      user_id: dataUserId,
      ring_id: selectedRingId || null,
      node_id: selectedNodeId || null,
      title: investigationSummary.headline,
      status: caseStatus,
      assigned_to: assignedTo,
      due_at: dueAt ? `${dueAt}:00+05:30` : null,
      tags: caseTags.split(",").map((item) => item.trim()).filter(Boolean),
      analyst_notes: analystNotes
    };
    const saved = await saveCase(payload);
    setCaseRecords((current) => [saved, ...current.filter((item) => item.case_id !== saved.case_id)]);
  }

  async function refreshCases(filter = caseFilter) {
    const params = {};
    if (filter !== "all") {
      params.status = filter;
    }
    if (ownerFilter !== "All owners") {
      params.assigned_to = ownerFilter;
    }
    if (staleOnly) {
      params.stale_only = true;
    }
    const payload = await fetchCases(dataUserId, params);
    setCaseRecords(payload.cases);
  }

  const trendData = {
    labels: analytics.volume_by_risk_band.map((item) => item.label),
    datasets: [
      {
        label: "Transaction volume",
        data: analytics.volume_by_risk_band.map((item) => item.value),
        backgroundColor: ["#4ecdc4", "#f4a261", "#f95738"]
      }
    ]
  };

  const ringMixData = {
    labels: analytics.ring_risk_distribution.map((item) => item.label),
    datasets: [
      {
        data: analytics.ring_risk_distribution.map((item) => item.value),
        backgroundColor: ["#f4a261", "#f95738"],
        borderWidth: 0
      }
    ]
  };

  if (!session) {
    return (
      <main className="page-shell">
        <section className="hero auth-hero">
          <div>
            <p className="eyebrow">HackX 2.0 | Bharat 5.0</p>
            <h1>FraudSense secure access</h1>
            <p className="lede">
              Sign in with a real username and password. Seeded analyst and customer accounts are available for local setup, and customers can create their own accounts.
            </p>
          </div>
          <aside className="hero-sidecard">
            <p className="mini-label">Account access</p>
            <form className="auth-form" onSubmit={handleLogin}>
              <label className="auth-field">
                <span>Username</span>
                <input
                  type="text"
                  value={authForm.username}
                  onChange={(event) => setAuthForm((current) => ({ ...current, username: event.target.value }))}
                  placeholder="asha"
                />
              </label>
              <label className="auth-field">
                <span>Password</span>
                <input
                  type="password"
                  value={authForm.password}
                  onChange={(event) => setAuthForm((current) => ({ ...current, password: event.target.value }))}
                  placeholder="••••••••"
                />
              </label>
              {authMode === "register" && (
                <label className="auth-field">
                  <span>Display name</span>
                  <input
                    type="text"
                    value={authForm.display_name}
                    onChange={(event) => setAuthForm((current) => ({ ...current, display_name: event.target.value }))}
                    placeholder="Ria Sharma"
                  />
                </label>
              )}
              {authError && <p className="auth-error">{authError}</p>}
              <button className="primary-button" type="submit">
                {authMode === "login" ? "Sign in" : "Create customer account"}
              </button>
            </form>
            <div className="auth-helper">
              <button
                className="secondary-inline-button"
                onClick={() => {
                  setAuthMode((current) => current === "login" ? "register" : "login");
                  setAuthError("");
                }}
              >
                {authMode === "login" ? "Need a customer account?" : "Back to sign in"}
              </button>
              <p>Seeded analyst: `asha / asha@1234`</p>
              <p>Seeded analyst: `rahul / rahul@1234`</p>
              <p>Seeded customer: `ria / ria@1234`</p>
            </div>
          </aside>
        </section>
      </main>
    );
  }

  return (
    <main className="page-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">HackX 2.0 | Bharat 5.0</p>
          <h1>FraudSense catches the ring, not just the transaction.</h1>
          <p className="lede">
            Graph-native fraud monitoring for UPI and card rails, with live risk scoring,
            fraud-ring detection, and analyst-friendly visuals.
          </p>
          <div className="hero-actions">
            <button className="primary-button" onClick={runDemoPrediction}>
              Simulate high-risk payment
            </button>
            <button className="secondary-inline-button" onClick={handleLogout}>
              Switch user
            </button>
            <div className="hero-proof">
              <span>{session.display_name} | {session.role}</span>
              <strong>{isBootstrapping ? "Loading live workspace..." : "Built for a live Bharat-scale demo story"}</strong>
            </div>
          </div>
        </div>
        <aside className="hero-sidecard">
          <p className="mini-label">Live demo flow</p>
          <ol className="demo-flow">
            {demoFlow.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </aside>
      </section>

      <section className="mode-switch-row">
        {session.role === "analyst" ? (
          <>
            <button
              className={`mode-chip ${activeView === "analyst" ? "mode-chip-active" : ""}`}
              onClick={() => setActiveView("analyst")}
            >
              Analyst view
            </button>
            <button
              className={`mode-chip ${activeView === "customer" ? "mode-chip-active" : ""}`}
              onClick={() => setActiveView("customer")}
            >
              Customer view
            </button>
          </>
        ) : (
          <p className="session-badge">Customer session: protection experience only</p>
        )}
      </section>

      <section className="story-grid">
        {storyPoints.map((point) => (
          <article key={point.label} className="story-card">
            <span className="story-label">{point.label}</span>
            <h2>{point.title}</h2>
            <p>{point.body}</p>
          </article>
        ))}
      </section>

      <section className="stats-grid">
        <article className="stat-card">
          <span>Observed nodes</span>
          <strong>{analytics.total_nodes || 0}</strong>
        </article>
        <article className="stat-card">
          <span>Observed edges</span>
          <strong>{analytics.total_edges || 0}</strong>
        </article>
        <article className="stat-card">
          <span>Last risk score</span>
          <strong>{prediction ? `${Math.round(prediction.fraud_probability * 100)}%` : "Idle"}</strong>
        </article>
        <article className="stat-card">
          <span>Detected rings</span>
          <strong>{analytics.detected_rings || 0}</strong>
        </article>
      </section>

      <section className="briefing-grid">
        <article className="briefing-card emphasis-card">
          <p className="mini-label">Judge takeaway</p>
          <h2>The story is simple: fraudsters collaborate, so detection should too.</h2>
          <p>
            This demo shows how a suspicious payment instantly enriches the transaction graph,
            updates ring-level risk, and creates a downstream alert for the user.
          </p>
        </article>
        <article className="briefing-card">
          <p className="mini-label">What to point at</p>
          <ul className="briefing-list">
            <li>The graph turns isolated transactions into connected evidence.</li>
            <li>The watchlist surfaces suspicious communities, not just red flags.</li>
            <li>The same score drives both analyst tooling and customer alerts.</li>
          </ul>
        </article>
      </section>

      {activeView === "analyst" ? (
      <section className="dashboard-grid">
        <article className="panel panel-large">
          <div className="panel-header">
            <h2>Fraud ring explorer</h2>
            <span>Red nodes show the riskiest accounts</span>
          </div>
          <ForceGraph
            graph={graph}
            selectedNodeId={selectedNode?.id || null}
            onSelectNode={(nodeId) => setSelectedNodeId(nodeId)}
          />
        </article>

        <article className="panel">
          <div className="panel-header">
            <h2>Top ring summary</h2>
            <span>Highest-risk connected cluster</span>
          </div>
          {topRing ? (
            <div className="ring-summary">
              <p className={`risk-pill risk-${topRing.risk_label}`}>{topRing.risk_label} ring</p>
              <h3>{topRing.ring_id}</h3>
              <p>{Math.round(topRing.avg_risk_score * 100)}% average node risk</p>
              <p>Rs {Math.round(topRing.total_amount).toLocaleString("en-IN")} routed inside the cluster</p>
              <p>{topRing.node_ids.length} linked accounts or merchants</p>
              <button className="secondary-inline-button" onClick={() => setSelectedRingId(topRing.ring_id)}>
                Open investigation view
              </button>
            </div>
          ) : (
            <p className="empty-state">No risky community detected yet for this focus account.</p>
          )}
        </article>

        <article className="panel">
          <div className="panel-header">
            <h2>Volume by risk band</h2>
            <span>Amounts routed through low, medium, and high-risk edges</span>
          </div>
          <Bar data={trendData} options={{ responsive: true, plugins: { legend: { display: false } } }} />
        </article>

        <article className="panel">
          <div className="panel-header">
            <h2>Prediction summary</h2>
            <span>Latest model response</span>
          </div>
          {prediction ? (
            <div className="prediction-card">
              <p className={`risk-pill risk-${prediction.risk_label}`}>{prediction.risk_label} risk</p>
              <h3>{Math.round(prediction.fraud_probability * 100)}% fraud probability</h3>
              <ul>
                {prediction.contributing_factors.map((factor) => (
                  <li key={factor}>{factor}</li>
                ))}
              </ul>
              {prediction.linked_ring_ids.length > 0 && (
                <p className="ring-links">Touches rings: {prediction.linked_ring_ids.join(", ")}</p>
              )}
            </div>
          ) : (
            <p className="empty-state">Run the demo payment to populate a live risk response.</p>
          )}
        </article>

        <article className="panel panel-wide">
          <div className="panel-header">
            <h2>Ring watchlist</h2>
            <span>Communities sorted by graph risk</span>
          </div>
          {ringData.rings.length > 0 ? (
            <div className="ring-list">
              {ringData.rings.map((ring) => (
                <button
                  key={ring.ring_id}
                  className={`ring-row ring-button ${selectedRing?.ring_id === ring.ring_id ? "ring-row-active" : ""}`}
                  onClick={() => {
                    setSelectedRingId(ring.ring_id);
                    setSelectedNodeId(ring.node_ids[0] || null);
                  }}
                >
                  <div>
                    <p className={`risk-pill risk-${ring.risk_label}`}>{ring.risk_label}</p>
                    <h3>{ring.ring_id}</h3>
                  </div>
                  <div className="ring-metrics">
                    <span>{ring.node_ids.length} nodes</span>
                    <span>{ring.edge_count} edges</span>
                    <span>{Math.round(ring.avg_risk_score * 100)}% avg risk</span>
                    <span>Rs {Math.round(ring.total_amount).toLocaleString("en-IN")}</span>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <p className="empty-state">Communities will appear here after enough suspicious activity accumulates.</p>
          )}
        </article>

        <article className="panel panel-wide">
          <div className="panel-header">
            <h2>Network health</h2>
            <span>Quick readout for judges and analysts</span>
          </div>
          <div className="network-health">
            <div className="health-metric">
              <strong>{analytics.high_risk_nodes}</strong>
              <span>high-risk nodes</span>
            </div>
            <div className="health-metric">
              <strong>{analytics.high_risk_edges}</strong>
              <span>high-risk edges</span>
            </div>
            <div className="health-chart">
              {analytics.ring_risk_distribution.length > 0 ? (
                <Doughnut data={ringMixData} options={{ plugins: { legend: { position: "bottom", labels: { color: "#d3dee6" } } } }} />
              ) : (
                <p className="empty-state">Ring severity mix will appear as communities are detected.</p>
              )}
            </div>
          </div>
        </article>

        <article className="panel panel-wide">
          <div className="panel-header">
            <h2>Investigation panel</h2>
            <span>Select a ring or node to explain the risk</span>
          </div>
          <div className="investigation-grid">
            <div className="investigation-card">
              <p className="mini-label">Selected ring</p>
              {selectedRing ? (
                <>
                  <p className={`risk-pill risk-${selectedRing.risk_label}`}>{selectedRing.risk_label} ring</p>
                  <h3>{selectedRing.ring_id}</h3>
                  <p>{ringDetail?.node_count ?? selectedRing.node_ids.length} connected entities in this cluster</p>
                  <p>{ringDetail?.edge_count ?? selectedRing.edge_count} observed payments between members</p>
                  <p>Avg risk {Math.round((ringDetail?.avg_risk_score ?? selectedRing.avg_risk_score) * 100)}%</p>
                  <p>Top counterparties: {(ringDetail?.top_counterparties || []).join(", ") || "Loading..."}</p>
                  <div className="entity-chips">
                    {(ringDetail?.member_nodes || selectedRing.node_ids.map((nodeId) => ({ node_id: nodeId }))).map((node) => (
                      <button
                        key={node.node_id}
                        className={`entity-chip ${selectedNode?.id === node.node_id ? "entity-chip-active" : ""}`}
                        onClick={() => setSelectedNodeId(node.node_id)}
                      >
                        {node.node_id}
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <p className="empty-state">Choose a ring to inspect its members.</p>
              )}
            </div>
            <div className="investigation-card">
              <p className="mini-label">Selected node</p>
              {selectedNode ? (
                <>
                  <h3>{selectedNode.label}</h3>
                  <p>{Math.round(selectedNode.risk_score * 100)}% node risk</p>
                  <p>Community {selectedNode.community}</p>
                  <p>{nodeDetail?.transaction_count ?? selectedNodeTransactions.length} linked transactions in the visible neighborhood</p>
                  <p>Avg amount: Rs {Math.round(nodeDetail?.avg_amount || 0).toLocaleString("en-IN")}</p>
                  <p>Total amount: Rs {Math.round(nodeDetail?.total_amount || 0).toLocaleString("en-IN")}</p>
                  <p>Touches: {selectedNodePeers.join(", ") || "No counterparties yet"}</p>
                </>
              ) : (
                <p className="empty-state">Pick a node from the selected ring.</p>
              )}
            </div>
            <div className="investigation-card">
              <p className="mini-label">Transaction evidence</p>
              {selectedNodeTimeline.length > 0 ? (
                <div className="transaction-list">
                  {selectedNodeTimeline.slice(0, 5).map((edge) => (
                    <div key={edge.id} className="transaction-row">
                      <strong>{edge.direction}: {edge.counterparty}</strong>
                      <span>Rs {Math.round(edge.amount).toLocaleString("en-IN")}</span>
                      <span>{Math.round(edge.risk_score * 100)}% edge risk</span>
                      <span>{edge.timestamp}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="empty-state">Transactions connected to the selected node will appear here.</p>
              )}
            </div>
          </div>
        </article>

        <article className="panel panel-wide">
          <div className="panel-header">
            <h2>Transaction timeline</h2>
            <span>Chronological evidence for the selected node</span>
          </div>
          {selectedNodeTimeline.length > 0 ? (
            <div className="timeline-grid">
              <div className="timeline-list">
                {(ringDetail?.recent_transactions || selectedNodeTimeline).map((entry, index) => (
                  <div
                    key={entry.id || `${entry.transaction_id}-${index}`}
                    className={`timeline-item ${selectedTransaction?.transaction_id === entry.transaction_id ? "timeline-item-active" : ""}`}
                  >
                    <div className="timeline-marker" />
                    <div className="timeline-content">
                      <p className="mini-label">{entry.direction || "Linked"}</p>
                      <strong>{entry.counterparty}</strong>
                      <span>Rs {Math.round(entry.amount).toLocaleString("en-IN")}</span>
                      <span>{entry.timestamp}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="timeline-detail">
                <p className="mini-label">Latest linked transaction</p>
                {selectedTransaction ? (
                  <>
                    <h3>{selectedNode?.label} {selectedTransaction.direction.toLowerCase()} transaction</h3>
                    <p>Counterparty: {selectedTransaction.counterparty}</p>
                    <p>Amount: Rs {Math.round(selectedTransaction.amount).toLocaleString("en-IN")}</p>
                    <p>Edge risk: {Math.round(selectedTransaction.risk_score * 100)}%</p>
                    <p>Timestamp: {selectedTransaction.timestamp}</p>
                    <p>
                      Interpretation: this payment is part of the visible neighborhood that explains why the selected entity remains linked to the suspicious cluster.
                    </p>
                  </>
                ) : (
                  <p className="empty-state">Select a node with recent transactions to inspect the timeline.</p>
                )}
              </div>
            </div>
          ) : (
            <p className="empty-state">No timeline is available until the selected node has linked transactions.</p>
          )}
        </article>

        <article className="panel panel-wide">
          <div className="panel-header">
            <h2>Case export</h2>
            <span>Turn the current investigation state into a handoff bundle</span>
          </div>
          {investigationSummary ? (
            <div className="case-export-grid">
              <div className="case-export-card">
                <p className="mini-label">Summary headline</p>
                <p className={`risk-pill risk-${investigationSummary.risk_label}`}>{investigationSummary.risk_label} priority</p>
                <h3>{investigationSummary.headline}</h3>
                <p>{investigationSummary.summary}</p>
                <div className="case-actions">
                  <button className="secondary-inline-button" onClick={copyCaseSummary}>
                    Copy summary
                  </button>
                  <button className="secondary-inline-button" onClick={downloadCaseBundle}>
                    Download JSON
                  </button>
                </div>
              </div>
              <div className="case-export-card">
                <p className="mini-label">Key observations</p>
                <ul className="briefing-list case-list">
                  {investigationSummary.key_observations.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
              <div className="case-export-card">
                <p className="mini-label">Recommended actions</p>
                <ul className="briefing-list case-list">
                  {investigationSummary.recommended_actions.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
                <div className="case-form">
                  <label className="case-field">
                    <span>Status</span>
                    <select value={caseStatus} onChange={(event) => setCaseStatus(event.target.value)}>
                      <option value="open">Open</option>
                      <option value="monitoring">Monitoring</option>
                      <option value="escalated">Escalated</option>
                      <option value="resolved">Resolved</option>
                    </select>
                  </label>
                  <label className="case-field">
                    <span>Assigned analyst</span>
                    <select value={assignedTo} onChange={(event) => setAssignedTo(event.target.value)}>
                      <option value="Asha">Asha</option>
                      <option value="Rahul">Rahul</option>
                      <option value="Neha">Neha</option>
                      <option value="Unassigned">Unassigned</option>
                    </select>
                  </label>
                  <label className="case-field">
                    <span>Due by</span>
                    <input
                      type="datetime-local"
                      value={dueAt}
                      onChange={(event) => setDueAt(event.target.value)}
                    />
                  </label>
                  <label className="case-field">
                    <span>Tags</span>
                    <input
                      type="text"
                      value={caseTags}
                      onChange={(event) => setCaseTags(event.target.value)}
                      placeholder="upi, ring, merchant"
                    />
                  </label>
                  <label className="case-field">
                    <span>Analyst notes</span>
                    <textarea
                      rows="4"
                      value={analystNotes}
                      onChange={(event) => setAnalystNotes(event.target.value)}
                      placeholder="Capture why this case matters before handoff."
                    />
                  </label>
                  <button className="secondary-inline-button" onClick={persistCaseRecord}>
                    Save case state
                  </button>
                </div>
                <div className="evidence-grid">
                  {Object.entries(investigationSummary.evidence).map(([label, value]) => (
                    <div key={label} className="evidence-chip">
                      <span>{label.replaceAll("_", " ")}</span>
                      <strong>{typeof value === "number" && label.includes("amount") ? `Rs ${Math.round(value).toLocaleString("en-IN")}` : value}</strong>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <p className="empty-state">Select a ring or node to generate an exportable investigation summary.</p>
          )}
        </article>

        <article className="panel panel-wide">
          <div className="panel-header">
            <h2>Case tracker</h2>
            <span>Saved investigation states for analyst follow-up</span>
          </div>
          <div className="case-filter-row">
            {caseFilters.map((filter) => (
              <button
                key={filter}
                className={`filter-chip ${caseFilter === filter ? "filter-chip-active" : ""}`}
                onClick={async () => {
                  setCaseFilter(filter);
                  await refreshCases(filter);
                }}
              >
                {filter}
              </button>
            ))}
            <select
              className="owner-filter-select"
              value={ownerFilter}
              onChange={async (event) => {
                const nextOwner = event.target.value;
                setOwnerFilter(nextOwner);
                const params = {};
                if (caseFilter !== "all") {
                  params.status = caseFilter;
                }
                if (nextOwner !== "All owners") {
                  params.assigned_to = nextOwner;
                }
                if (staleOnly) {
                  params.stale_only = true;
                }
                const payload = await fetchCases(dataUserId, params);
                setCaseRecords(payload.cases);
              }}
            >
              {analystOwners.map((owner) => (
                <option key={owner} value={owner}>{owner}</option>
              ))}
            </select>
            <label className="stale-toggle">
              <input
                type="checkbox"
                checked={staleOnly}
                onChange={async (event) => {
                  const nextStaleOnly = event.target.checked;
                  setStaleOnly(nextStaleOnly);
                  const params = {};
                  if (caseFilter !== "all") {
                    params.status = caseFilter;
                  }
                  if (ownerFilter !== "All owners") {
                    params.assigned_to = ownerFilter;
                  }
                  if (nextStaleOnly) {
                    params.stale_only = true;
                  }
                  const payload = await fetchCases(dataUserId, params);
                  setCaseRecords(payload.cases);
                }}
              />
              <span>Stale only</span>
            </label>
          </div>
          {caseRecords.length > 0 ? (
            <div className="case-workbench">
              <div className="case-tracker-list">
                {caseRecords.map((entry) => (
                  <button
                    key={entry.case_id}
                    className={`case-tracker-row ${selectedRingId === entry.ring_id && selectedNodeId === entry.node_id ? "case-tracker-row-active" : ""}`}
                    onClick={() => {
                      setSelectedRingId(entry.ring_id);
                      setSelectedNodeId(entry.node_id);
                    }}
                  >
                    <div>
                      <p className={`risk-pill risk-${entry.status === "escalated" ? "high" : entry.status === "monitoring" ? "medium" : "low"}`}>
                        {entry.status}
                      </p>
                      <p className={`risk-pill risk-${entry.priority_label === "critical" ? "high" : entry.priority_label === "high" ? "high" : entry.priority_label === "medium" ? "medium" : "low"}`}>
                        {entry.priority_label} priority
                      </p>
                      {entry.is_stale && <p className="stale-flag">Needs follow-up</p>}
                      <h3>{entry.title}</h3>
                      <p>{entry.analyst_notes || "No analyst notes yet."}</p>
                    </div>
                    <div className="case-tracker-meta">
                      <span>{entry.assigned_to}</span>
                      <span>{entry.due_at ? `Due ${entry.due_at}` : "No deadline"}</span>
                      <span>{entry.ring_id || "No ring"}</span>
                      <span>{entry.node_id || "No node"}</span>
                      <span>{entry.tags.join(", ") || "No tags"}</span>
                    </div>
                  </button>
                ))}
              </div>
              <div className="case-history-card">
                <p className="mini-label">Case history</p>
                {selectedCase ? (
                  <>
                    <h3>{selectedCase.title}</h3>
                    <div className="case-history-list">
                      {selectedCase.history.map((entry, index) => (
                        <div key={`${entry.updated_at}-${index}`} className="case-history-item">
                          <p className={`risk-pill risk-${entry.status === "escalated" ? "high" : entry.status === "monitoring" ? "medium" : "low"}`}>
                            {entry.status}
                          </p>
                          <strong>{entry.updated_at}</strong>
                          <span>Owner: {entry.assigned_to}</span>
                          <span>Due: {entry.due_at || "No deadline"}</span>
                          <span>{entry.analyst_notes || "No notes captured for this update."}</span>
                          <span>Tags: {entry.tags.join(", ") || "No tags"}</span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="empty-state">Select a saved case to inspect its history.</p>
                )}
              </div>
            </div>
          ) : (
            <p className="empty-state">Saved case states will appear here once an analyst captures notes or escalates a ring.</p>
          )}
        </article>

        <article className="panel panel-wide">
          <div className="panel-header">
            <h2>Demo narrator</h2>
            <span>Suggested talking points while the UI updates</span>
          </div>
          <div className="narrator-grid">
            <div className="narrator-card">
              <p className="mini-label">Before click</p>
              <p>
                Explain that most fraud systems judge one payment at a time, while rings hide in the network between accounts.
              </p>
            </div>
            <div className="narrator-card">
              <p className="mini-label">During refresh</p>
              <p>
                Call out how a single risky transaction updates node risk, edge risk, and the connected community instead of only a binary alert.
              </p>
            </div>
            <div className="narrator-card">
              <p className="mini-label">Closing line</p>
              <p>
                End with: “We don’t just flag one payment. We surface the entire fraud ring and warn the user before the next hit.”
              </p>
            </div>
          </div>
        </article>
      </section>
      ) : (
      <section className="customer-grid">
        <article className="panel customer-protection-panel">
          <div className="panel-header">
            <h2>Protection status</h2>
            <span>What the user sees after each scored transaction</span>
          </div>
          <p className={`risk-pill risk-${customerRiskLabel}`}>{customerRiskLabel} risk</p>
          <h3>{customerStatus}</h3>
          <p className="customer-risk-score">{customerRiskScore}% current risk score</p>
          <p>
            FraudSense monitors linked graph behavior in the background and warns the user when a payment touches a suspicious ring.
          </p>
          {latestAlert ? (
            <div className="customer-callout">
              <strong>Latest alert</strong>
              <span>{latestAlert.message}</span>
            </div>
          ) : (
            <p className="empty-state">No live alerts yet. Simulate a risky payment to preview the customer protection flow.</p>
          )}
        </article>

        <article className="panel">
          <div className="panel-header">
            <h2>Safety actions</h2>
            <span>Recommended next steps for the user</span>
          </div>
          <div className="customer-actions">
            <div className="customer-action-card">
              <strong>Review recipient</strong>
              <span>Double-check beneficiary identity before approving a flagged UPI transfer.</span>
            </div>
            <div className="customer-action-card">
              <strong>Pause the payment</strong>
              <span>High-risk payments should prompt a second look instead of instant approval.</span>
            </div>
            <div className="customer-action-card">
              <strong>Escalate quickly</strong>
              <span>If the alert feels unfamiliar, the user can dispute or report it immediately.</span>
            </div>
          </div>
        </article>

        <article className="panel panel-wide">
          <div className="panel-header">
            <h2>Risk timeline</h2>
            <span>Recent alerts and scored activity from the customer perspective</span>
          </div>
          {alertData.alerts?.length > 0 ? (
            <div className="customer-alert-list">
              {alertData.alerts.map((alert) => (
                <div key={alert.alert_id} className="customer-alert-row">
                  <div>
                    <p className={`risk-pill risk-${alert.risk_label}`}>{alert.risk_label} alert</p>
                    <h3>{alert.transaction_id}</h3>
                    <p>{alert.message}</p>
                  </div>
                  <div className="customer-alert-meta">
                    <span>{Math.round(alert.fraud_probability * 100)}% risk</span>
                    <span>{alert.created_at}</span>
                    <span>{alert.delivered ? "Delivered" : "Queued"}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="empty-state">Customer alerts will appear here after medium or high-risk transactions are scored.</p>
          )}
        </article>

        <article className="panel panel-wide">
          <div className="panel-header">
            <h2>Shared intelligence</h2>
            <span>The same model supports analyst operations and customer trust</span>
          </div>
          <div className="customer-summary-grid">
            <div className="customer-summary-card">
              <p className="mini-label">Linked ring watch</p>
              <strong>{prediction?.linked_ring_ids?.length || ringData.rings.length || 0}</strong>
              <span>connected ring signals available for review</span>
            </div>
            <div className="customer-summary-card">
              <p className="mini-label">Priority ops case</p>
              <strong>{highestPriorityCase?.title || "No saved case yet"}</strong>
              <span>{highestPriorityCase ? `${highestPriorityCase.priority_label} priority | ${highestPriorityCase.assigned_to}` : "Analyst queue will surface here after investigation begins."}</span>
            </div>
            <div className="customer-summary-card">
              <p className="mini-label">User confidence</p>
              <strong>{latestAlert ? "Live warning path ready" : "Monitoring quietly"}</strong>
              <span>The customer only sees actionable information, while the analyst handles the ring-level complexity.</span>
            </div>
          </div>
        </article>
      </section>
      )}
    </main>
  );
}
