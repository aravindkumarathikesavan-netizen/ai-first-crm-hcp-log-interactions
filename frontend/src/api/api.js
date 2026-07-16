import axios from "axios";

const API_BASE = process.env.REACT_APP_API_BASE || "http://localhost:8000";

export const api = axios.create({
  baseURL: API_BASE,
  headers: { "Content-Type": "application/json" },
});

// Dynamic interceptor to inject X-Groq-API-Key header if set in localStorage
api.interceptors.request.use(
  (config) => {
    const customKey = localStorage.getItem("groq_api_key");
    if (customKey) {
      config.headers["X-Groq-API-Key"] = customKey.trim();
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

export const createInteraction = (payload) => api.post("/api/interactions", payload);
export const listInteractions = (hcpId) =>
  api.get("/api/interactions", { params: hcpId ? { hcp_id: hcpId } : {} });
export const updateInteraction = (id, payload) => api.patch(`/api/interactions/${id}`, payload);
export const deleteInteraction = (id) => api.delete(`/api/interactions/${id}`);
export const sendChatMessage = (payload) => api.post("/api/chat", payload);
