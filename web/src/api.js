import axios from "axios";

const baseURL =
  import.meta.env.VITE_API_BASE_URL ||
  "http://127.0.0.1:8000";

const api = axios.create({
  baseURL
});

export function setAuthToken(token) {
  if (token) {
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
    return;
  }
  delete api.defaults.headers.common.Authorization;
}

export async function fetchGraph(userId) {
  const { data } = await api.get(`/graph/${userId}`);
  return data;
}

export async function loginUser(payload) {
  const { data } = await api.post("/auth/login", payload);
  return data;
}

export async function registerUser(payload) {
  const { data } = await api.post("/auth/register", payload);
  return data;
}

export async function fetchCurrentUser() {
  const { data } = await api.get("/auth/me");
  return data;
}

export async function fetchRings(userId) {
  const { data } = await api.get(`/rings/${userId}`);
  return data;
}

export async function fetchAnalytics(userId) {
  const { data } = await api.get(`/analytics/${userId}`);
  return data;
}

export async function fetchNodeDetail(nodeId) {
  const { data } = await api.get(`/node/${nodeId}`);
  return data;
}

export async function fetchRingDetail(ringId) {
  const { data } = await api.get(`/ring/${ringId}`);
  return data;
}

export async function fetchInvestigationSummary(userId, params = {}) {
  const { data } = await api.get(`/investigation/${userId}`, {
    params
  });
  return data;
}

export async function fetchCases(userId, params = {}) {
  const { data } = await api.get(`/cases/${userId}`, {
    params
  });
  return data;
}

export async function fetchAlerts(userId) {
  const { data } = await api.get(`/alerts/${userId}`);
  return data;
}

export async function saveCase(payload) {
  const { data } = await api.post("/cases", payload);
  return data;
}

export async function predictTransaction(payload) {
  const { data } = await api.post("/predict", payload);
  return data;
}
