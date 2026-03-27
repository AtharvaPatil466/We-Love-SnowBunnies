import { useEffect, useState } from "react";
import { Bar, Doughnut } from "react-chartjs-2";
import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  Tooltip
} from "chart.js";

import ForceGraph from "./components/ForceGraph";
import {
  fetchAlerts,
  fetchAnalytics,
  fetchCases,
  fetchCurrentUser,
  fetchGraph,
  fetchInvestigationSummary,
  fetchNodeDetail,
  fetchRingDetail,
  fetchRings,
  loginUser,
  predictTransaction,
  registerUser,
  saveCase,
  setAuthToken
} from "./api";

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend);

const EMPTY_ANALYTICS = {
  total_nodes: 0,
  total_edges: 0,
  detected_rings: 0,
  high_risk_nodes: 0,
  high_risk_edges: 0,
  volume_by_risk_band: [],
  ring_risk_distribution: []
};

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
    title: "Fraud rings look normal until you zoom out",
    body: "Isolated transactions can appear harmless. The graph shows shared devices, repeated recipients, and coordinated movement that a row-by-row model misses."
  },
  {
    label: "Signal",
    title: "Scoring follows the network, not just the payment",
    body: "FraudSense blends transaction risk, neighborhood density, and ring linkage so investigators can see why a user or merchant is being escalated."
  },
  {
    label: "Outcome",
    title: "Analysts and customers act on the same signal",
    body: "The dashboard surfaces evidence for ops teams, while the customer experience stays focused on safe next steps and fast reassurance."
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

function formatCurrency(value) {
  return `Rs ${Math.round(value || 0).toLocaleString("en-IN")}`;
}

function formatPercent(value) {
  if (value === null || value === undefined) {
    return "0%";
  }
  return `${Math.round(value * 100)}%`;
}

function formatDateTime(value) {
  if (!value) {
    return "No timestamp yet";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(parsed);
}

function toneForRisk(label) {
  if (label === "high" || label === "critical" || label === "escalated") {
    return "high";
  }
  if (label === "medium" || label === "monitoring") {
    return "medium";
  }
  return "low";
}

function buildCaseParams(status, owner, staleOnly) {
  const params = {};
  if (status !== "all") {
    params.status = status;
  }
  if (owner !== "All owners") {
    params.assigned_to = owner;
  }
  if (staleOnly) {
    params.stale_only = true;
  }
  return params;
}

function byNewestTimestamp(left, right) {
  return new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime();
}

function Pill({ tone, children }) {
  return <span className={`risk-pill risk-${tone}`}>{children}</span>;
}

function StatCard({ label, value, meta }) {
  return (
    <article className="stat-card">
      <span>{label}</span>
      <strong>{value}</strong>
      {meta ? <small>{meta}</small> : null}
    </article>
  );
}

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
  const [analytics, setAnalytics] = useState(EMPTY_ANALYTICS);
  const [prediction, setPrediction] = useState(null);
  const [selectedRingId, setSelectedRingId] = useState(null);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [selectedTransactionId, setSelectedTransactionId] = useState(null);
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
    fetchCurrentUser()
      .then(setSession)
      .catch(() => {
        setAuthToken(null);
        window.localStorage.removeItem("fraudsense_token");
      });
  }, []);

  useEffect(() => {
    if (!session) {
      return;
    }

    let isMounted = true;

    async function bootstrapWorkspace() {
      setIsBootstrapping(true);
      try {
        const [nextGraph, nextRings, nextAnalytics, nextAlerts, nextCases] = await Promise.all([
          fetchGraph(dataUserId).catch(() => ({ nodes: [], edges: [] })),
          fetchRings(dataUserId).catch(() => ({ rings: [] })),
          fetchAnalytics(dataUserId).catch(() => EMPTY_ANALYTICS),
          fetchAlerts(dataUserId).catch(() => ({ alerts: [] })),
          fetchCases(dataUserId).catch(() => ({ cases: [] }))
        ]);

        if (!isMounted) {
          return;
        }

        setGraph(nextGraph);
        setRingData(nextRings);
        setAnalytics(nextAnalytics);
        setAlertData(nextAlerts);
        setCaseRecords(nextCases.cases);
        setActiveView(session.role === "customer" ? "customer" : "analyst");
      } finally {
        if (isMounted) {
          setIsBootstrapping(false);
        }
      }
    }

    bootstrapWorkspace();

    return () => {
      isMounted = false;
    };
  }, [dataUserId, session]);

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
    let isMounted = true;
    if (!selectedNodeId) {
      setNodeDetail(null);
      return undefined;
    }

    fetchNodeDetail(selectedNodeId)
      .then((payload) => {
        if (isMounted) {
          setNodeDetail(payload);
        }
      })
      .catch(() => {
        if (isMounted) {
          setNodeDetail(null);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [selectedNodeId]);

  useEffect(() => {
    let isMounted = true;
    if (!selectedRingId) {
      setRingDetail(null);
      return undefined;
    }

    fetchRingDetail(selectedRingId)
      .then((payload) => {
        if (isMounted) {
          setRingDetail(payload);
        }
      })
      .catch(() => {
        if (isMounted) {
          setRingDetail(null);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [selectedRingId]);

  useEffect(() => {
    let isMounted = true;
    if (!session) {
      return undefined;
    }

    fetchInvestigationSummary(dataUserId, {
      ring_id: selectedRingId || undefined,
      node_id: selectedNodeId || undefined
    })
      .then((payload) => {
        if (isMounted) {
          setInvestigationSummary(payload);
        }
      })
      .catch(() => {
        if (isMounted) {
          setInvestigationSummary(null);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [dataUserId, selectedNodeId, selectedRingId, session]);

  useEffect(() => {
    setSelectedTransactionId(null);
  }, [selectedNodeId, selectedRingId]);

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
  }, [caseRecords, selectedNodeId, selectedRingId]);

  async function refreshCases(nextStatus = caseFilter, nextOwner = ownerFilter, nextStaleOnly = staleOnly) {
    const params = buildCaseParams(nextStatus, nextOwner, nextStaleOnly);
    const payload = await fetchCases(dataUserId, params);
    setCaseRecords(payload.cases);
  }

  async function reloadWorkspace() {
    if (!session) {
      return;
    }

    setIsBootstrapping(true);
    try {
      const [nextGraph, nextRings, nextAnalytics, nextAlerts] = await Promise.all([
        fetchGraph(dataUserId).catch(() => ({ nodes: [], edges: [] })),
        fetchRings(dataUserId).catch(() => ({ rings: [] })),
        fetchAnalytics(dataUserId).catch(() => EMPTY_ANALYTICS),
        fetchAlerts(dataUserId).catch(() => ({ alerts: [] }))
      ]);

      setGraph(nextGraph);
      setRingData(nextRings);
      setAnalytics(nextAnalytics);
      setAlertData(nextAlerts);
      await refreshCases();
    } finally {
      setIsBootstrapping(false);
    }
  }

  async function runDemoPrediction() {
    setIsBootstrapping(true);
    try {
      const result = await predictTransaction(demoTransaction);
      setPrediction(result);
      await reloadWorkspace();
    } finally {
      setIsBootstrapping(false);
    }
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
    setAnalytics(EMPTY_ANALYTICS);
    setCaseRecords([]);
    setNodeDetail(null);
    setRingDetail(null);
    setInvestigationSummary(null);
    setAuthError("");
  }

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
      selected_ring: selectedRingId,
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

  const topRing = ringData.rings[0] || null;
  const selectedRing = ringData.rings.find((ring) => ring.ring_id === selectedRingId) || topRing;
  const selectedNode = graph.nodes.find((node) => node.id === selectedNodeId) || graph.nodes[0] || null;
  const selectedNodeTransactions = [...(nodeDetail?.recent_transactions || [])].sort(byNewestTimestamp);
  const selectedNodePeers = nodeDetail?.counterparties || [];
  const timelineEntries = [
    ...(ringDetail?.recent_transactions?.length ? ringDetail.recent_transactions : selectedNodeTransactions)
  ]
    .map((entry, index) => ({
      ...entry,
      id: entry.id || `${entry.transaction_id}-${index}`,
      direction: entry.direction === "outgoing" ? "Outgoing" : entry.direction === "incoming" ? "Incoming" : entry.direction || "Linked",
      counterparty: entry.counterparty || entry.target || entry.source || "Counterparty"
    }))
    .sort(byNewestTimestamp);
  const selectedTransaction = timelineEntries.find((entry) => entry.id === selectedTransactionId) || timelineEntries[0] || null;
  const selectedCase = caseRecords.find((entry) => entry.ring_id === selectedRingId && entry.node_id === selectedNodeId) || caseRecords[0] || null;
  const highestPriorityCase = caseRecords[0] || null;
  const latestAlert = alertData.alerts?.[0] || null;
  const customerRiskLabel = prediction?.risk_label || latestAlert?.risk_label || "low";
  const customerRiskScore = prediction
    ? Math.round(prediction.fraud_probability * 100)
    : latestAlert
      ? Math.round(latestAlert.fraud_probability * 100)
      : 12;
  const customerStatus = customerRiskLabel === "high"
    ? "Protected, but action needed"
    : customerRiskLabel === "medium"
      ? "Monitoring activity"
      : "All clear";

  const trendData = {
    labels: analytics.volume_by_risk_band.map((item) => item.label),
    datasets: [
      {
        label: "Transaction volume",
        data: analytics.volume_by_risk_band.map((item) => item.value),
        borderRadius: 999,
        backgroundColor: ["#53d7c1", "#ffbd73", "#ff7c68"]
      }
    ]
  };

  const ringMixData = {
    labels: analytics.ring_risk_distribution.map((item) => item.label),
    datasets: [
      {
        data: analytics.ring_risk_distribution.map((item) => item.value),
        backgroundColor: ["#ffbd73", "#ff7c68"],
        borderColor: "transparent",
        hoverOffset: 6
      }
    ]
  };

  if (!session) {
    return (
      <main className="page-shell auth-shell">
        <section className="auth-layout">
          <div className="auth-intro shell-panel">
            <p className="eyebrow">HackX 2.0 | Bharat 5.0</p>
            <h1>FraudSense secure access</h1>
            <p className="lede">
              A cleaner fraud-ops console for graph-native risk detection, investigation workflows, and customer-safe alerts.
            </p>
            <div className="auth-highlight-grid">
              {storyPoints.map((point) => (
                <article key={point.label} className="auth-highlight-card">
                  <span className="story-label">{point.label}</span>
                  <h2>{point.title}</h2>
                  <p>{point.body}</p>
                </article>
              ))}
            </div>
          </div>

          <aside className="auth-panel shell-panel">
            <div className="auth-panel-header">
              <p className="mini-label">Account access</p>
              <h2>{authMode === "login" ? "Sign in to the command center" : "Create a protected customer account"}</h2>
              <p>Use a real username and password. Analysts can inspect the whole graph, while customers land in the guided protection view.</p>
            </div>

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
              {authMode === "register" ? (
                <label className="auth-field">
                  <span>Display name</span>
                  <input
                    type="text"
                    value={authForm.display_name}
                    onChange={(event) => setAuthForm((current) => ({ ...current, display_name: event.target.value }))}
                    placeholder="Ria Sharma"
                  />
                </label>
              ) : null}
              {authError ? <p className="auth-error">{authError}</p> : null}
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
              <div className="credential-stack">
                <p>Seeded analyst: `asha / asha@1234`</p>
                <p>Seeded analyst: `rahul / rahul@1234`</p>
                <p>Seeded customer: `ria / ria@1234`</p>
              </div>
            </div>
          </aside>
        </section>
      </main>
    );
  }

  return (
    <main className="page-shell">
      <header className="topbar shell-panel">
        <div className="brand-block">
          <p className="eyebrow">HackX 2.0 | Bharat 5.0</p>
          <h1>FraudSense</h1>
          <p>Graph-native fraud defense for analyst ops and customer trust.</p>
        </div>
        <div className="topbar-actions">
          <div className="session-chip">
            <span>{session.display_name}</span>
            <strong>{session.role}</strong>
          </div>
          <button className="primary-button" onClick={runDemoPrediction}>
            Simulate high-risk payment
          </button>
          <button className="ghost-button" onClick={reloadWorkspace}>
            Refresh workspace
          </button>
          <button className="secondary-inline-button secondary-inline-button-compact" onClick={handleLogout}>
            Switch user
          </button>
        </div>
      </header>

      <section className="hero-shell shell-panel">
        <div className="hero-copy">
          <p className="eyebrow">Live operations briefing</p>
          <h2>FraudSense catches the ring, not just the transaction.</h2>
          <p className="lede">
            A cleaner fraud operations console that turns suspicious payments into connected evidence, live customer alerts, and handoff-ready investigations.
          </p>
          <div className="hero-status-row">
            <div className="hero-proof">
              <span>Workspace status</span>
              <strong>{isBootstrapping ? "Loading live workspace..." : "Live graph, alerts, and cases are synced"}</strong>
            </div>
            <div className="hero-proof">
              <span>Current focus</span>
              <strong>{selectedRing ? `${selectedRing.ring_id} | ${formatPercent(selectedRing.avg_risk_score)} avg risk` : "Waiting for ring activity"}</strong>
            </div>
            <div className="hero-proof">
              <span>Customer posture</span>
              <strong>{customerStatus}</strong>
            </div>
          </div>
        </div>

        <aside className="hero-sidecard">
          <div className="hero-sidecard-header">
            <div>
              <p className="mini-label">Live demo flow</p>
              <h3>Judge-ready walkthrough</h3>
            </div>
            {session.role === "analyst" ? (
              <div className="mode-switch-row">
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
              </div>
            ) : (
              <p className="session-badge">Customer session: protection experience only</p>
            )}
          </div>
          <ol className="demo-flow">
            {demoFlow.map((step, index) => (
              <li key={step}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <strong>{step}</strong>
              </li>
            ))}
          </ol>
        </aside>
      </section>

      <section className="story-grid">
        {storyPoints.map((point) => (
          <article key={point.label} className="story-card shell-panel">
            <span className="story-label">{point.label}</span>
            <h2>{point.title}</h2>
            <p>{point.body}</p>
          </article>
        ))}
      </section>

      <section className="stats-grid">
        <StatCard label="Observed nodes" value={analytics.total_nodes || 0} meta="Accounts and merchants in scope" />
        <StatCard label="Observed edges" value={analytics.total_edges || 0} meta="Payments flowing through the visible graph" />
        <StatCard label="Last risk score" value={prediction ? formatPercent(prediction.fraud_probability) : "Idle"} meta={prediction ? prediction.risk_label : "Awaiting a scored payment"} />
        <StatCard label="Detected rings" value={analytics.detected_rings || 0} meta="Connected communities under watch" />
      </section>

      {activeView === "analyst" ? (
        <>
          <section className="analyst-workspace">
            <article className="panel panel-graph shell-panel">
              <div className="panel-header">
                <div>
                  <p className="mini-label">Graph workspace</p>
                  <h2>Fraud ring explorer</h2>
                </div>
                <span>Click nodes to update the investigation panel</span>
              </div>
              <div className="graph-stage">
                <ForceGraph
                  graph={graph}
                  selectedNodeId={selectedNode?.id || null}
                  onSelectNode={(nodeId) => setSelectedNodeId(nodeId)}
                />
              </div>
              <div className="graph-legend">
                <span><i className="legend-dot legend-dot-low" /> Low risk</span>
                <span><i className="legend-dot legend-dot-medium" /> Medium risk</span>
                <span><i className="legend-dot legend-dot-high" /> High risk</span>
              </div>
            </article>

            <div className="analyst-rail">
              <article className="panel shell-panel">
                <div className="panel-header">
                  <div>
                    <p className="mini-label">Live focus</p>
                    <h2>Top ring summary</h2>
                  </div>
                  <span>Highest-risk connected cluster</span>
                </div>
                {topRing ? (
                  <div className="summary-stack">
                    <Pill tone={toneForRisk(topRing.risk_label)}>{topRing.risk_label} ring</Pill>
                    <h3>{topRing.ring_id}</h3>
                    <div className="summary-metric-list">
                      <div>
                        <span>Average node risk</span>
                        <strong>{formatPercent(topRing.avg_risk_score)}</strong>
                      </div>
                      <div>
                        <span>Cluster amount</span>
                        <strong>{formatCurrency(topRing.total_amount)}</strong>
                      </div>
                      <div>
                        <span>Linked entities</span>
                        <strong>{topRing.node_ids.length}</strong>
                      </div>
                    </div>
                    <button className="secondary-inline-button" onClick={() => setSelectedRingId(topRing.ring_id)}>
                      Open investigation view
                    </button>
                  </div>
                ) : (
                  <p className="empty-state">No risky community detected yet for this focus account.</p>
                )}
              </article>

              <article className="panel shell-panel">
                <div className="panel-header">
                  <div>
                    <p className="mini-label">Scoring output</p>
                    <h2>Prediction summary</h2>
                  </div>
                  <span>Latest model response</span>
                </div>
                {prediction ? (
                  <div className="prediction-card">
                    <Pill tone={toneForRisk(prediction.risk_label)}>{prediction.risk_label} risk</Pill>
                    <h3>{formatPercent(prediction.fraud_probability)} fraud probability</h3>
                    <ul className="signal-list">
                      {prediction.contributing_factors.map((factor) => (
                        <li key={factor}>{factor}</li>
                      ))}
                    </ul>
                    {prediction.linked_ring_ids.length > 0 ? (
                      <p className="ring-links">Touches rings: {prediction.linked_ring_ids.join(", ")}</p>
                    ) : null}
                  </div>
                ) : (
                  <p className="empty-state">Run the demo payment to populate a live risk response.</p>
                )}
              </article>

              <article className="panel shell-panel">
                <div className="panel-header">
                  <div>
                    <p className="mini-label">Alert posture</p>
                    <h2>Latest customer alert</h2>
                  </div>
                  <span>What the end user sees now</span>
                </div>
                {latestAlert ? (
                  <div className="summary-stack">
                    <Pill tone={toneForRisk(latestAlert.risk_label)}>{latestAlert.risk_label} alert</Pill>
                    <h3>{latestAlert.transaction_id}</h3>
                    <p>{latestAlert.message}</p>
                    <div className="summary-inline-meta">
                      <span>{Math.round(latestAlert.fraud_probability * 100)}% risk</span>
                      <span>{formatDateTime(latestAlert.created_at)}</span>
                      <span>{latestAlert.delivered ? "Delivered" : "Queued"}</span>
                    </div>
                  </div>
                ) : (
                  <p className="empty-state">Customer alerts will appear after medium or high-risk transactions are scored.</p>
                )}
              </article>
            </div>
          </section>

          <section className="analytics-grid">
            <article className="panel shell-panel">
              <div className="panel-header">
                <div>
                  <p className="mini-label">Volume by risk band</p>
                  <h2>Money flow profile</h2>
                </div>
                <span>Amounts routed through low, medium, and high-risk edges</span>
              </div>
              <Bar
                data={trendData}
                options={{
                  responsive: true,
                  plugins: { legend: { display: false } },
                  scales: {
                    x: { ticks: { color: "#93a6ba" }, grid: { display: false } },
                    y: { ticks: { color: "#93a6ba" }, grid: { color: "rgba(147, 166, 186, 0.15)" } }
                  }
                }}
              />
            </article>

            <article className="panel shell-panel">
              <div className="panel-header">
                <div>
                  <p className="mini-label">Network health</p>
                  <h2>Risk concentration</h2>
                </div>
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
                    <Doughnut
                      data={ringMixData}
                      options={{
                        plugins: {
                          legend: {
                            position: "bottom",
                            labels: { color: "#dbe7f3" }
                          }
                        }
                      }}
                    />
                  ) : (
                    <p className="empty-state">Ring severity mix will appear as communities are detected.</p>
                  )}
                </div>
              </div>
            </article>
          </section>

          <section className="detail-grid">
            <article className="panel shell-panel">
              <div className="panel-header">
                <div>
                  <p className="mini-label">Investigation workspace</p>
                  <h2>Investigation panel</h2>
                </div>
                <span>Select a ring or node to explain the risk</span>
              </div>
              <div className="investigation-grid">
                <div className="investigation-card">
                  <p className="mini-label">Selected ring</p>
                  {selectedRing ? (
                    <>
                      <Pill tone={toneForRisk(selectedRing.risk_label)}>{selectedRing.risk_label} ring</Pill>
                      <h3>{selectedRing.ring_id}</h3>
                      <p>{ringDetail?.node_count ?? selectedRing.node_ids.length} connected entities in this cluster</p>
                      <p>{ringDetail?.edge_count ?? selectedRing.edge_count} observed payments between members</p>
                      <p>Avg risk {formatPercent(ringDetail?.avg_risk_score ?? selectedRing.avg_risk_score)}</p>
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
                      <p>{formatPercent(selectedNode.risk_score)} node risk</p>
                      <p>Community {selectedNode.community}</p>
                      <p>{nodeDetail?.transaction_count ?? selectedNodeTransactions.length} linked transactions in the visible neighborhood</p>
                      <p>Avg amount: {formatCurrency(nodeDetail?.avg_amount || 0)}</p>
                      <p>Total amount: {formatCurrency(nodeDetail?.total_amount || 0)}</p>
                      <p>Touches: {selectedNodePeers.join(", ") || "No counterparties yet"}</p>
                    </>
                  ) : (
                    <p className="empty-state">Pick a node from the selected ring.</p>
                  )}
                </div>

                <div className="investigation-card">
                  <p className="mini-label">Transaction evidence</p>
                  {selectedNodeTransactions.length > 0 ? (
                    <div className="transaction-list">
                      {selectedNodeTransactions.slice(0, 5).map((edge, index) => (
                        <div key={`${edge.transaction_id}-${index}`} className="transaction-row">
                          <strong>{edge.direction === "outgoing" ? "Outgoing" : "Incoming"}: {edge.counterparty}</strong>
                          <span>{formatCurrency(edge.amount)}</span>
                          <span>{formatPercent(edge.risk_score)} edge risk</span>
                          <span>{formatDateTime(edge.timestamp)}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="empty-state">Transactions connected to the selected node will appear here.</p>
                  )}
                </div>
              </div>
            </article>

            <article className="panel shell-panel">
              <div className="panel-header">
                <div>
                  <p className="mini-label">Chronology</p>
                  <h2>Transaction timeline</h2>
                </div>
                <span>Chronological evidence for the selected node</span>
              </div>
              {timelineEntries.length > 0 ? (
                <div className="timeline-grid">
                  <div className="timeline-list">
                    {timelineEntries.map((entry) => (
                      <button
                        key={entry.id}
                        className={`timeline-item ${selectedTransaction?.id === entry.id ? "timeline-item-active" : ""}`}
                        onClick={() => setSelectedTransactionId(entry.id)}
                      >
                        <div className="timeline-marker" />
                        <div className="timeline-content">
                          <p className="mini-label">{entry.direction}</p>
                          <strong>{entry.counterparty}</strong>
                          <span>{formatCurrency(entry.amount)}</span>
                          <span>{formatDateTime(entry.timestamp)}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                  <div className="timeline-detail">
                    <p className="mini-label">Latest linked transaction</p>
                    {selectedTransaction ? (
                      <>
                        <h3>{selectedNode?.label} {selectedTransaction.direction.toLowerCase()} transaction</h3>
                        <p>Counterparty: {selectedTransaction.counterparty}</p>
                        <p>Amount: {formatCurrency(selectedTransaction.amount)}</p>
                        <p>Edge risk: {formatPercent(selectedTransaction.risk_score)}</p>
                        <p>Timestamp: {formatDateTime(selectedTransaction.timestamp)}</p>
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
          </section>

          <section className="case-grid">
            <article className="panel shell-panel">
              <div className="panel-header">
                <div>
                  <p className="mini-label">Case bundle</p>
                  <h2>Case export</h2>
                </div>
                <span>Turn the current investigation state into a handoff bundle</span>
              </div>
              {investigationSummary ? (
                <div className="case-export-grid">
                  <div className="case-export-card">
                    <p className="mini-label">Summary headline</p>
                    <Pill tone={toneForRisk(investigationSummary.risk_label)}>{investigationSummary.risk_label} priority</Pill>
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
                    <p className="mini-label case-subheading">Recommended actions</p>
                    <ul className="briefing-list case-list">
                      {investigationSummary.recommended_actions.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="case-export-card">
                    <p className="mini-label">Save case state</p>
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
                          <strong>{typeof value === "number" && label.includes("amount") ? formatCurrency(value) : value}</strong>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <p className="empty-state">Select a ring or node to generate an exportable investigation summary.</p>
              )}
            </article>

            <article className="panel shell-panel">
              <div className="panel-header">
                <div>
                  <p className="mini-label">Queue management</p>
                  <h2>Case tracker</h2>
                </div>
                <span>Saved investigation states for analyst follow-up</span>
              </div>
              <div className="case-filter-row">
                {caseFilters.map((filter) => (
                  <button
                    key={filter}
                    className={`filter-chip ${caseFilter === filter ? "filter-chip-active" : ""}`}
                    onClick={async () => {
                      setCaseFilter(filter);
                      await refreshCases(filter, ownerFilter, staleOnly);
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
                    await refreshCases(caseFilter, nextOwner, staleOnly);
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
                      await refreshCases(caseFilter, ownerFilter, nextStaleOnly);
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
                        <div className="case-tracker-content">
                          <div className="case-pill-row">
                            <Pill tone={toneForRisk(entry.status)}>{entry.status}</Pill>
                            <Pill tone={toneForRisk(entry.priority_label)}>{entry.priority_label} priority</Pill>
                            {entry.is_stale ? <span className="stale-flag">Needs follow-up</span> : null}
                          </div>
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
                              <Pill tone={toneForRisk(entry.status)}>{entry.status}</Pill>
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
          </section>

          <section className="narrator-grid">
            <article className="narrator-card shell-panel">
              <p className="mini-label">Demo narrator</p>
              <h2>Before click</h2>
              <p>Explain that most fraud systems judge one payment at a time, while rings hide in the network between accounts.</p>
            </article>
            <article className="narrator-card shell-panel">
              <p className="mini-label">During refresh</p>
              <h2>During refresh</h2>
              <p>Call out how one risky transaction updates node risk, edge risk, and the connected community instead of only a binary alert.</p>
            </article>
            <article className="narrator-card shell-panel">
              <p className="mini-label">Closing line</p>
              <h2>Closing line</h2>
              <p>End with: “We don’t just flag one payment. We surface the entire fraud ring and warn the user before the next hit.”</p>
            </article>
          </section>
        </>
      ) : (
        <section className="customer-grid">
          <article className="panel panel-customer-hero shell-panel">
            <div className="panel-header">
              <div>
                <p className="mini-label">Account posture</p>
                <h2>Protection status</h2>
              </div>
              <span>What the user sees after each scored transaction</span>
            </div>
            <div className="customer-hero-content">
              <div className="customer-score-card">
                <Pill tone={toneForRisk(customerRiskLabel)}>{customerRiskLabel} risk</Pill>
                <h3>{customerStatus}</h3>
                <p className="customer-risk-score">{customerRiskScore}% current risk score</p>
                <p>FraudSense monitors linked graph behavior in the background and warns the user when a payment touches a suspicious ring.</p>
              </div>
              <div className="customer-callout">
                <strong>Latest alert</strong>
                <span>{latestAlert ? latestAlert.message : "No live alerts yet. Simulate a risky payment to preview the customer protection flow."}</span>
              </div>
            </div>
          </article>

          <article className="panel shell-panel">
            <div className="panel-header">
              <div>
                <p className="mini-label">Recommended steps</p>
                <h2>Safety actions</h2>
              </div>
              <span>Clear next steps for the user</span>
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

          <article className="panel panel-wide shell-panel">
            <div className="panel-header">
              <div>
                <p className="mini-label">Customer feed</p>
                <h2>Risk timeline</h2>
              </div>
              <span>Recent alerts and scored activity from the customer perspective</span>
            </div>
            {alertData.alerts?.length > 0 ? (
              <div className="customer-alert-list">
                {alertData.alerts.map((alert) => (
                  <div key={alert.alert_id} className="customer-alert-row">
                    <div>
                      <Pill tone={toneForRisk(alert.risk_label)}>{alert.risk_label} alert</Pill>
                      <h3>{alert.transaction_id}</h3>
                      <p>{alert.message}</p>
                    </div>
                    <div className="customer-alert-meta">
                      <span>{Math.round(alert.fraud_probability * 100)}% risk</span>
                      <span>{formatDateTime(alert.created_at)}</span>
                      <span>{alert.delivered ? "Delivered" : "Queued"}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="empty-state">Customer alerts will appear here after medium or high-risk transactions are scored.</p>
            )}
          </article>

          <article className="panel panel-wide shell-panel">
            <div className="panel-header">
              <div>
                <p className="mini-label">Confidence layer</p>
                <h2>Shared intelligence</h2>
              </div>
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
