import axios from "axios";

const baseURL =
  process.env.EXPO_PUBLIC_API_BASE_URL ||
  "http://127.0.0.1:8000";

const api = axios.create({
  baseURL
});

export async function runPrediction(transaction) {
  const { data } = await api.post("/predict", transaction);
  return data;
}

export async function fetchAlerts(userId) {
  const { data } = await api.get(`/alerts/${userId}`);
  return data;
}

export async function registerPushDevice(payload) {
  const { data } = await api.post("/devices/register", payload);
  return data;
}
