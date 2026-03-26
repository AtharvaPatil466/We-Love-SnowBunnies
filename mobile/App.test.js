import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import App from "./App";
import { fetchAlerts, registerPushDevice, runPrediction } from "./src/api";

jest.mock("./src/api", () => ({
  fetchAlerts: jest.fn(),
  registerPushDevice: jest.fn(),
  runPrediction: jest.fn()
}));

describe("FraudSense mobile app", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    fetchAlerts.mockResolvedValue({
      alerts: [
        {
          alert_id: "alert_1",
          user_id: "user_mobile_01",
          transaction_id: "mobile_demo_01",
          fraud_probability: 0.91,
          risk_label: "high",
          message: "High risk transaction detected. Linked pattern: ring_0.",
          created_at: "2026-03-26T11:30:00Z",
          delivered: true,
          channel: "push"
        }
      ]
    });
    runPrediction.mockResolvedValue({
      transaction_id: "mobile_demo_01",
      fraud_probability: 0.91,
      risk_label: "high",
      contributing_factors: ["High transaction amount", "Dense graph neighborhood around sender"],
      linked_ring_ids: ["ring_0"]
    });
    registerPushDevice.mockResolvedValue({
      registered: true,
      user_id: "user_mobile_01",
      channel: "expo-push",
      message: "Expo push registration ready"
    });
  });

  test("renders alert inbox from fetched alerts", async () => {
    render(<App />);

    await waitFor(() => {
      expect(fetchAlerts).toHaveBeenCalled();
    });

    fireEvent.press(screen.getByText(/Alerts \(1\)/));

    expect(await screen.findByText("HIGH ALERT")).toBeTruthy();
    expect(screen.getByText("91% fraud probability")).toBeTruthy();
    expect(screen.getByText("mobile_demo_01")).toBeTruthy();
  });

  test("runs live check and switches to alerts tab", async () => {
    render(<App />);

    fireEvent.press(screen.getByText("Check transaction risk"));

    await waitFor(() => {
      expect(runPrediction).toHaveBeenCalledTimes(1);
    });

    expect(await screen.findByText("Refresh inbox")).toBeTruthy();
    expect(screen.getByText("HIGH ALERT")).toBeTruthy();
  });
});
