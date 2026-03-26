import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import App from "./App";

vi.mock("./components/ForceGraph", () => ({
  default: () => <div data-testid="force-graph">graph</div>
}));

vi.mock("react-chartjs-2", () => ({
  Bar: () => <div data-testid="bar-chart">bar chart</div>,
  Doughnut: () => <div data-testid="doughnut-chart">doughnut chart</div>
}));

vi.mock("./api", () => ({
  fetchCurrentUser: vi.fn(),
  loginUser: vi.fn(),
  registerUser: vi.fn(),
  setAuthToken: vi.fn(),
  fetchGraph: vi.fn(),
  fetchRings: vi.fn(),
  fetchAnalytics: vi.fn(),
  fetchAlerts: vi.fn(),
  fetchNodeDetail: vi.fn(),
  fetchRingDetail: vi.fn(),
  fetchInvestigationSummary: vi.fn(),
  fetchCases: vi.fn(),
  saveCase: vi.fn(),
  predictTransaction: vi.fn()
}));

import { fetchAlerts, fetchAnalytics, fetchCases, fetchCurrentUser, fetchGraph, fetchInvestigationSummary, fetchNodeDetail, fetchRingDetail, fetchRings, loginUser, predictTransaction, registerUser, saveCase, setAuthToken } from "./api";

const graphResponse = {
  user_id: "user_01",
  nodes: [
    { id: "user_01", label: "user_01", risk_score: 0.84, community: 0 },
    { id: "merchant_24", label: "merchant_24", risk_score: 0.7, community: 0 }
  ],
  edges: [
    { source: "user_01", target: "merchant_24", amount: 5600, timestamp: "2026-03-26T11:30:00Z", risk_score: 0.88 }
  ],
  rings: []
};

const ringResponse = {
  user_id: "user_01",
  rings: [
    {
      ring_id: "ring_0",
      community: 0,
      node_ids: ["merchant_24", "user_01"],
      edge_count: 3,
      avg_risk_score: 0.82,
      total_amount: 17500,
      risk_label: "high"
    }
  ]
};

const analyticsResponse = {
  user_id: "user_01",
  total_nodes: 5,
  total_edges: 7,
  detected_rings: 1,
  high_risk_nodes: 2,
  high_risk_edges: 3,
  volume_by_risk_band: [
    { label: "Low", value: 2500 },
    { label: "Medium", value: 6000 },
    { label: "High", value: 17500 }
  ],
  ring_risk_distribution: [
    { label: "Medium rings", value: 0 },
    { label: "High rings", value: 1 }
  ]
};

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  window.URL.createObjectURL = vi.fn(() => "blob:case-export");
  window.URL.revokeObjectURL = vi.fn();
  fetchCurrentUser.mockRejectedValue(new Error("no stored session"));
  setAuthToken.mockImplementation(() => {});
  loginUser.mockResolvedValue({
    success: true,
    access_token: "token_analyst",
    token_type: "bearer",
    user: { user_id: "user_auth_asha", username: "asha", display_name: "Asha Patel", role: "analyst", linked_user_id: "user_01" }
  });
  registerUser.mockResolvedValue({
    success: true,
    access_token: "token_customer",
    token_type: "bearer",
    user: { user_id: "user_auth_ria", username: "ria", display_name: "Ria Sharma", role: "customer", linked_user_id: "user_01" }
  });
  fetchGraph.mockResolvedValue(graphResponse);
  fetchRings.mockResolvedValue(ringResponse);
  fetchAnalytics.mockResolvedValue(analyticsResponse);
  fetchAlerts.mockResolvedValue({
    user_id: "user_01",
    alerts: [
      {
        alert_id: "alert_001",
        user_id: "user_01",
        transaction_id: "demo_1009",
        fraud_probability: 0.91,
        risk_label: "high",
        message: "High risk transaction detected. Linked pattern: ring_0.",
        created_at: "2026-03-26T12:00:00Z",
        delivered: true,
        channel: "push"
      }
    ]
  });
  fetchCases.mockResolvedValue({
    user_id: "user_01",
    cases: []
  });
  fetchNodeDetail.mockResolvedValue({
    node_id: "user_01",
    label: "user_01",
    risk_score: 0.84,
    community: 0,
    transaction_count: 2,
    avg_amount: 5600,
    unique_counterparties: 1,
    device_diversity: 1,
    total_amount: 11200,
    counterparties: ["merchant_24"],
    recent_transactions: [
      {
        transaction_id: "seed_2",
        source: "user_01",
        target: "merchant_24",
        amount: 5600,
        timestamp: "2026-03-26T11:30:00Z",
        risk_score: 0.88,
        direction: "outgoing",
        counterparty: "merchant_24"
      }
    ]
  });
  fetchRingDetail.mockResolvedValue({
    ring_id: "ring_0",
    community: 0,
    risk_label: "high",
    avg_risk_score: 0.82,
    total_amount: 17500,
    edge_count: 3,
    node_count: 2,
    member_nodes: [
      { node_id: "merchant_24", label: "merchant_24", risk_score: 0.7, community: 0 },
      { node_id: "user_01", label: "user_01", risk_score: 0.84, community: 0 }
    ],
    top_counterparties: ["merchant_24"],
    recent_transactions: [
      {
        transaction_id: "seed_2",
        source: "user_01",
        target: "merchant_24",
        amount: 5600,
        timestamp: "2026-03-26T11:30:00Z",
        risk_score: 0.88,
        direction: "outgoing",
        counterparty: "merchant_24"
      }
    ]
  });
  fetchInvestigationSummary.mockResolvedValue({
    user_id: "user_01",
    ring_id: "ring_0",
    node_id: "user_01",
    risk_label: "high",
    headline: "Investigation summary for ring_0 focused on user_01",
    summary: "A connected ring and high-risk node are visible in the transaction network.",
    key_observations: [
      "2 entities are connected inside ring_0 with 3 observed internal payments."
    ],
    recommended_actions: [
      "Trigger an immediate customer alert and consider temporarily stepping up verification."
    ],
    evidence: {
      ring_nodes: 2,
      ring_edges: 3,
      node_transactions: 2,
      node_total_amount: 11200
    }
  });
  saveCase.mockResolvedValue({
    case_id: "case_001",
    user_id: "user_01",
    ring_id: "ring_0",
    node_id: "user_01",
    title: "Investigation summary for ring_0 focused on user_01",
    status: "escalated",
    assigned_to: "Rahul",
    due_at: "2026-03-26T17:00:00+05:30",
    is_stale: false,
    priority_label: "high",
    priority_score: 70,
    tags: ["upi", "ring", "priority"],
    analyst_notes: "Escalate this ring to fraud ops.",
    updated_at: "2026-03-26T11:45:00Z",
    history: [
      {
        status: "escalated",
        assigned_to: "Rahul",
        due_at: "2026-03-26T17:00:00+05:30",
        analyst_notes: "Escalate this ring to fraud ops.",
        tags: ["upi", "ring", "priority"],
        updated_at: "2026-03-26T11:45:00Z"
      }
    ]
  });
  predictTransaction.mockResolvedValue({
    transaction_id: "demo_1009",
    fraud_probability: 0.91,
    risk_label: "high",
    contributing_factors: ["High transaction amount", "Dense graph neighborhood around sender"],
    linked_ring_ids: ["ring_0"]
  });
});

afterEach(() => {
  cleanup();
});

async function loginAsAnalyst(user = userEvent.setup()) {
  render(<App />);
  await user.clear(screen.getByPlaceholderText("asha"));
  await user.type(screen.getByPlaceholderText("asha"), "asha");
  await user.clear(screen.getByPlaceholderText("••••••••"));
  await user.type(screen.getByPlaceholderText("••••••••"), "asha@1234");
  await user.click(screen.getByRole("button", { name: "Sign in" }));
  await waitFor(() => {
    expect(loginUser).toHaveBeenCalledWith({ username: "asha", password: "asha@1234" });
    expect(setAuthToken).toHaveBeenCalledWith("token_analyst");
    expect(screen.getByText("Observed nodes")).toBeInTheDocument();
  });
  return user;
}

test("renders dashboard metrics from analytics and ring data", async () => {
  await loginAsAnalyst();

  expect(screen.getByText("Problem")).toBeInTheDocument();
  expect(screen.getByText("Live demo flow")).toBeInTheDocument();
  expect(screen.getByText("Top ring summary")).toBeInTheDocument();
  expect(screen.getByText("Investigation panel")).toBeInTheDocument();
  expect(screen.getByText("Transaction timeline")).toBeInTheDocument();
  expect(screen.getByText("Case export")).toBeInTheDocument();
  expect(screen.getByText("Case tracker")).toBeInTheDocument();
  expect(screen.getAllByText("ring_0").length).toBeGreaterThan(0);
  expect(screen.getByText(/Top counterparties:/)).toBeInTheDocument();
  expect(screen.getByText("Detected rings")).toBeInTheDocument();
  expect(screen.getByTestId("force-graph")).toBeInTheDocument();
});

test("switches to customer view and shows live protection information", async () => {
  const user = userEvent.setup();
  await loginAsAnalyst(user);

  await user.click(screen.getByRole("button", { name: "Customer view" }));

  expect(screen.getByText("Protection status")).toBeInTheDocument();
  expect(screen.getByText("Safety actions")).toBeInTheDocument();
  expect(screen.getByText("Risk timeline")).toBeInTheDocument();
  expect(screen.getAllByText("High risk transaction detected. Linked pattern: ring_0.").length).toBeGreaterThan(0);
});

test("runs prediction flow and shows returned risk summary", async () => {
  const user = await loginAsAnalyst();

  await user.click(screen.getByRole("button", { name: "Simulate high-risk payment" }));

  await waitFor(() => {
    expect(predictTransaction).toHaveBeenCalledTimes(1);
    expect(screen.getByText("91% fraud probability")).toBeInTheDocument();
  });

  expect(screen.getByText("Demo narrator")).toBeInTheDocument();
  expect(screen.getByText("Touches rings: ring_0")).toBeInTheDocument();
  expect(screen.getByText("High transaction amount")).toBeInTheDocument();
  expect(screen.getByText("Latest linked transaction")).toBeInTheDocument();
  expect(screen.getByText("Copy summary")).toBeInTheDocument();
  expect(screen.getByText(/Avg amount:/)).toBeInTheDocument();
});

test("lets investigators switch focus to a selected ring and node", async () => {
  const user = await loginAsAnalyst();

  await user.click(screen.getByRole("button", { name: /Open investigation view/i }));

  expect(screen.getByText("Selected ring")).toBeInTheDocument();
  expect(screen.getByText("Selected node")).toBeInTheDocument();
  expect(screen.getAllByText("ring_0").length).toBeGreaterThan(0);
  expect(screen.getByRole("button", { name: "merchant_24" })).toBeInTheDocument();
});

test("supports exporting the current investigation bundle", async () => {
  const user = await loginAsAnalyst();
  const appendSpy = vi.spyOn(document.body, "appendChild");
  const removeSpy = vi.spyOn(document.body, "removeChild");
  const clickSpy = vi
    .spyOn(HTMLAnchorElement.prototype, "click")
    .mockImplementation(() => {});

  await user.click(screen.getByRole("button", { name: "Download JSON" }));

  expect(fetchInvestigationSummary).toHaveBeenCalled();
  expect(window.URL.createObjectURL).toHaveBeenCalled();
  expect(appendSpy).toHaveBeenCalled();
  expect(clickSpy).toHaveBeenCalled();
  expect(removeSpy).toHaveBeenCalled();
});

test("saves case workflow state and shows it in the tracker", async () => {
  const user = await loginAsAnalyst();

  await user.selectOptions(screen.getByDisplayValue("Open"), "escalated");
  await user.selectOptions(screen.getByDisplayValue("Asha"), "Rahul");
  fireEvent.change(screen.getByDisplayValue("2026-03-27T17:00"), { target: { value: "2026-03-26T17:00" } });
  await user.clear(screen.getByPlaceholderText("upi, ring, merchant"));
  await user.type(screen.getByPlaceholderText("upi, ring, merchant"), "upi, ring, priority");
  await user.type(screen.getByPlaceholderText("Capture why this case matters before handoff."), "Escalate this ring to fraud ops.");
  await user.click(screen.getByRole("button", { name: "Save case state" }));

  await waitFor(() => {
    expect(saveCase).toHaveBeenCalledTimes(1);
    expect(screen.getAllByText("Escalate this ring to fraud ops.").length).toBeGreaterThan(0);
  });

  expect(screen.getAllByText("high priority").length).toBeGreaterThan(0);
  expect(screen.getAllByText("Rahul").length).toBeGreaterThan(0);
  expect(screen.getByText("Due: 2026-03-26T17:00:00+05:30")).toBeInTheDocument();
  expect(screen.getByText("Case history")).toBeInTheDocument();
});

test("filters the case tracker by status", async () => {
  const user = userEvent.setup();
  fetchCases
    .mockResolvedValueOnce({
      user_id: "user_01",
      cases: [
        {
          case_id: "case_002",
          user_id: "user_01",
          ring_id: "ring_2",
          node_id: "merchant_24",
          title: "Monitor merchant ring",
          status: "monitoring",
          assigned_to: "Neha",
          due_at: "2026-03-25T17:00:00+05:30",
          is_stale: true,
          tags: ["merchant"],
          analyst_notes: "Keep watching this merchant.",
          updated_at: "2026-03-26T11:50:00Z",
          history: [
            {
              status: "monitoring",
              assigned_to: "Neha",
              due_at: "2026-03-25T17:00:00+05:30",
              analyst_notes: "Keep watching this merchant.",
              tags: ["merchant"],
              updated_at: "2026-03-26T11:50:00Z"
            }
          ]
        }
      ]
    })
    .mockResolvedValueOnce({
      user_id: "user_01",
      cases: [
        {
          case_id: "case_002",
          user_id: "user_01",
          ring_id: "ring_2",
          node_id: "merchant_24",
          title: "Monitor merchant ring",
          status: "monitoring",
          assigned_to: "Neha",
          due_at: "2026-03-25T17:00:00+05:30",
          is_stale: true,
          tags: ["merchant"],
          analyst_notes: "Keep watching this merchant.",
          updated_at: "2026-03-26T11:50:00Z",
          history: [
            {
              status: "monitoring",
              assigned_to: "Neha",
              due_at: "2026-03-25T17:00:00+05:30",
              analyst_notes: "Keep watching this merchant.",
              tags: ["merchant"],
              updated_at: "2026-03-26T11:50:00Z"
            }
          ]
        }
      ]
    });

  await loginAsAnalyst(user);

  await user.click(screen.getByRole("button", { name: "monitoring" }));

  await waitFor(() => {
    expect(fetchCases).toHaveBeenLastCalledWith("user_01", { status: "monitoring" });
    expect(screen.getAllByText("Monitor merchant ring").length).toBeGreaterThan(0);
  });
  expect(screen.getByText("Needs follow-up")).toBeInTheDocument();
});

test("filters the case tracker by assigned analyst", async () => {
  const user = userEvent.setup();
  fetchCases
    .mockResolvedValueOnce({
      user_id: "user_01",
      cases: []
    })
    .mockResolvedValueOnce({
      user_id: "user_01",
      cases: [
        {
          case_id: "case_003",
          user_id: "user_01",
          ring_id: "ring_4",
          node_id: "user_14",
          title: "Escalate proxy-linked ring",
          status: "escalated",
          assigned_to: "Rahul",
          due_at: "2026-03-26T18:30:00+05:30",
          is_stale: false,
          tags: ["proxy", "ring"],
          analyst_notes: "Rahul owns this case.",
          updated_at: "2026-03-26T12:05:00Z",
          history: [
            {
              status: "escalated",
              assigned_to: "Rahul",
              due_at: "2026-03-26T18:30:00+05:30",
              analyst_notes: "Rahul owns this case.",
              tags: ["proxy", "ring"],
              updated_at: "2026-03-26T12:05:00Z"
            }
          ]
        }
      ]
    });

  await loginAsAnalyst(user);

  await user.selectOptions(screen.getByDisplayValue("All owners"), "Rahul");

  await waitFor(() => {
    expect(fetchCases).toHaveBeenLastCalledWith("user_01", { assigned_to: "Rahul" });
    expect(screen.getAllByText("Escalate proxy-linked ring").length).toBeGreaterThan(0);
  });
});

test("filters the case tracker to stale cases only", async () => {
  const user = userEvent.setup();
  fetchCases
    .mockResolvedValueOnce({
      user_id: "user_01",
      cases: []
    })
    .mockResolvedValueOnce({
      user_id: "user_01",
      cases: [
        {
          case_id: "case_004",
          user_id: "user_01",
          ring_id: "ring_6",
          node_id: "merchant_88",
          title: "Follow up overdue mule ring",
          status: "monitoring",
          assigned_to: "Asha",
          due_at: "2026-03-24T09:00:00+05:30",
          is_stale: true,
          tags: ["mule", "overdue"],
          analyst_notes: "This case is overdue.",
          updated_at: "2026-03-26T12:10:00Z",
          history: [
            {
              status: "monitoring",
              assigned_to: "Asha",
              due_at: "2026-03-24T09:00:00+05:30",
              analyst_notes: "This case is overdue.",
              tags: ["mule", "overdue"],
              updated_at: "2026-03-26T12:10:00Z"
            }
          ]
        }
      ]
    });

  await loginAsAnalyst(user);

  await user.click(screen.getByRole("checkbox"));

  await waitFor(() => {
    expect(fetchCases).toHaveBeenLastCalledWith("user_01", { stale_only: true });
    expect(screen.getAllByText("Follow up overdue mule ring").length).toBeGreaterThan(0);
  });
});

test("customer login lands in the protected customer experience", async () => {
  const user = userEvent.setup();
  loginUser.mockResolvedValueOnce({
    success: true,
    access_token: "token_customer",
    token_type: "bearer",
    user: { user_id: "user_auth_ria", username: "ria", display_name: "Ria Sharma", role: "customer", linked_user_id: "user_01" }
  });

  render(<App />);
  await user.clear(screen.getByPlaceholderText("asha"));
  await user.type(screen.getByPlaceholderText("asha"), "ria");
  await user.clear(screen.getByPlaceholderText("••••••••"));
  await user.type(screen.getByPlaceholderText("••••••••"), "ria@1234");
  await user.click(screen.getByRole("button", { name: "Sign in" }));

  await waitFor(() => {
    expect(screen.getByText("Protection status")).toBeInTheDocument();
  });

  expect(screen.queryAllByRole("button", { name: "Analyst view" })).toHaveLength(0);
  expect(screen.getByText("Customer session: protection experience only")).toBeInTheDocument();
});
