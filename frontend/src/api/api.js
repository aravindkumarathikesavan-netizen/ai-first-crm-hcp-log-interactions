import axios from "axios";

const API_BASE = process.env.REACT_APP_API_BASE || "http://localhost:8000";

export const api = axios.create({
  baseURL: API_BASE,
  headers: { "Content-Type": "application/json" },
});

export const createInteraction = (payload) => api.post("/api/interactions", payload);
export const listInteractions = (hcpId) =>
  api.get("/api/interactions", { params: hcpId ? { hcp_id: hcpId } : {} });
export const updateInteraction = (id, payload) => api.patch(`/api/interactions/${id}`, payload);
export const deleteInteraction = (id) => api.delete(`/api/interactions/${id}`);
export const sendChatMessage = (payload) => api.post("/api/chat", payload);
