// LuxQuant Assistant API — context-aware help assistant (MVP)
const API_BASE = "/api/v1";

// Attach the auth token when logged in so the backend can attribute the
// question to a user (for the admin AI Cost "who asked" tracking).
function authHeaders() {
  try {
    const token = localStorage.getItem("access_token");
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

export async function getAssistantStatus() {
  try {
    const r = await fetch(`${API_BASE}/assistant/status`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json(); // { enabled }
  } catch (e) {
    // On failure default to enabled so help stays available.
    return { enabled: true };
  }
}

export async function getPages() {
  try {
    const r = await fetch(`${API_BASE}/assistant/pages`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json(); // { pages: [{page_id, label}] }
  } catch (e) {
    console.error("[assistant] pages error:", e);
    return { pages: [] };
  }
}

export async function getSuggestions(pageId = "signals") {
  try {
    const r = await fetch(
      `${API_BASE}/assistant/suggestions?page_id=${encodeURIComponent(pageId)}`
    );
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } catch (e) {
    console.error("[assistant] suggestions error:", e);
    return { page_id: pageId, label: null, suggestions: [] };
  }
}

export async function askAssistant({ message, pageId = "signals", history = [], context = null }) {
  const r = await fetch(`${API_BASE}/assistant/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ message, page_id: pageId, history, context }),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return await r.json(); // { answer, cached, error? }
}
