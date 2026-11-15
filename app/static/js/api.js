/**
 * VitalWatch API Client
 * Manages JWT tokens, authenticated network calls, and server communications.
 */
const VitalApi = (() => {
  const TOKEN_KEY = "vitalwatch_token";
  const USER_KEY = "vitalwatch_user";

  const getToken = () => localStorage.getItem(TOKEN_KEY);
  const setToken = (token) => localStorage.setItem(TOKEN_KEY, token);
  const getUser = () => {
    try {
      return JSON.parse(localStorage.getItem(USER_KEY));
    } catch {
      return null;
    }
  };
  const setUser = (user) => localStorage.setItem(USER_KEY, JSON.stringify(user));
  const clearSession = () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  };

  async function request(url, options = {}) {
    const headers = {
      "Content-Type": "application/json",
      ...(options.headers || {})
    };

    const token = getToken();
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers
      });

      const data = await response.json().catch(() => ({}));

      if (response.status === 401) {
        clearSession();
        window.dispatchEvent(new CustomEvent("vitalwatch:unauthorized"));
        throw new Error(data.error || "Session expired. Please log in again.");
      }

      if (!response.ok) {
        throw new Error(data.error || `Request failed with status ${response.status}`);
      }

      return data;
    } catch (err) {
      console.error(`[API Error] ${url}:`, err);
      throw err;
    }
  }

  return {
    getToken,
    setToken,
    getUser,
    setUser,
    clearSession,
    isAuthenticated: () => !!getToken(),

    // Auth
    async register(fullName, email, password, role) {
      const res = await request("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({ full_name: fullName, email, password, role })
      });
      if (res.token) {
        setToken(res.token);
        setUser(res.user);
      }
      return res;
    },

    async login(email, password) {
      const res = await request("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password })
      });
      if (res.token) {
        setToken(res.token);
        setUser(res.user);
      }
      return res;
    },

    async getMe() {
      const res = await request("/api/auth/me", { method: "GET" });
      if (res.user) {
        setUser(res.user);
      }
      return res.user;
    },

    // Vitals & Dashboard
    async logVital(vitals) {
      return await request("/api/vitals", {
        method: "POST",
        body: JSON.stringify(vitals)
      });
    },

    async getOverview() {
      return await request("/api/dashboard", { method: "GET" });
    },

    async getDashboard() {
      return await request("/api/vitals/dashboard", { method: "GET" });
    },

    async getHistory(limit = 50) {
      return await request(`/api/vitals/history?limit=${limit}`, { method: "GET" });
    },

    // Alerts (Feature #6 Early Warning Alerts)
    async getAlerts(status = "all", level = "all") {
      let url = `/api/alerts?status=${encodeURIComponent(status)}`;
      if (level && level !== "all") {
        url += `&level=${encodeURIComponent(level)}`;
      }
      return await request(url, { method: "GET" });
    },

    async createAlert(payload) {
      return await request("/api/alerts", {
        method: "POST",
        body: JSON.stringify(payload)
      });
    },

    async resolveAlert(alertId) {
      return await request(`/api/alerts/${alertId}/resolve`, {
        method: "PUT"
      });
    },

    async assignAlert(alertId, ashaName) {
      return await request(`/api/alerts/${alertId}/assign`, {
        method: "PUT",
        body: JSON.stringify({ assignedTo: ashaName })
      });
    },

    async acknowledgeAlert(alertId) {
      return await request(`/api/alerts/${alertId}/resolve`, {
        method: "PUT"
      });
    },

    // Villages Geospatial Risk Map (Feature #7)
    async getVillages() {
      return await request("/api/villages", { method: "GET" });
    }
  };
})();
