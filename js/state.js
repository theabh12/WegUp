/**
 * WegUp State Management Module
 * Local-first persistent storage using browser localStorage.
 */

const STORAGE_KEY = "wegup.app.v2";

export function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function dateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function addDays(dateString, days) {
  const date = new Date(`${dateString}T12:00:00`);
  date.setDate(date.getDate() + days);
  return dateKey(date);
}

export function daysUntil(dateString) {
  const today = new Date(`${dateKey()}T12:00:00`);
  const target = new Date(`${dateString}T12:00:00`);
  return Math.ceil((target - today) / 86400000);
}

export function prettyDate(value) {
  if (!value) return "—";
  try {
    return new Date(`${value}T12:00:00`).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric"
    });
  } catch {
    return value;
  }
}

export function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function createDefaultState() {
  return {
    version: 2,
    apiKey: "",
    model: "gemini-2.0-flash",
    profile: null,
    goals: [],
    activeGoalId: null,
    interviews: [],
    resumeScans: [],
    quizAttempts: [],
    activity: []
  };
}

let state = createDefaultState();

// Initialize from storage or migrate from v1
export function initState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      state = { ...createDefaultState(), ...parsed };
    } else {
      // Check legacy v1 state for smooth migration
      const legacyRaw = localStorage.getItem("wegup.functional.v1");
      if (legacyRaw) {
        const legacy = JSON.parse(legacyRaw);
        state = {
          ...createDefaultState(),
          profile: legacy.profile ? { name: legacy.profile.name, college: "Engineering College", year: "3rd Year" } : null,
          goals: Array.isArray(legacy.goals) ? legacy.goals : [],
          activeGoalId: legacy.activeGoal || null,
          activity: Array.isArray(legacy.history) ? legacy.history : []
        };
        saveState();
      }
    }
  } catch (err) {
    console.warn("Could not load stored WegUp state, initializing clean state", err);
    state = createDefaultState();
  }
  return state;
}

export function getState() {
  return state;
}

export function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    window.dispatchEvent(new CustomEvent("wegup:state-updated", { detail: state }));
  } catch (err) {
    console.error("Failed to save state to localStorage", err);
  }
}

export function getApiKey() {
  return state.apiKey || "";
}

export function setApiKey(key, model = "gemini-2.0-flash") {
  state.apiKey = (key || "").trim();
  state.model = model || "gemini-2.0-flash";
  saveState();
  logActivity(state.apiKey ? "Connected Google Gemini API" : "Switched to Offline Demo mode");
}

export function getActiveGoal() {
  if (!state.goals.length) return null;
  const found = state.goals.find((g) => g.id === state.activeGoalId);
  return found || state.goals[0];
}

export function setActiveGoal(goalId) {
  if (state.goals.some((g) => g.id === goalId)) {
    state.activeGoalId = goalId;
    saveState();
  }
}

export function addGoal(goal) {
  state.goals.push(goal);
  state.activeGoalId = goal.id;
  logActivity(`Created career goal: ${goal.name}`, "goal");
  saveState();
}

export function updateGoal(id, updates) {
  const goal = state.goals.find((g) => g.id === id);
  if (goal) {
    Object.assign(goal, updates);
    saveState();
  }
}

export function deleteGoal(id) {
  const goal = state.goals.find((g) => g.id === id);
  const name = goal ? goal.name : "Goal";
  state.goals = state.goals.filter((g) => g.id !== id);
  if (state.activeGoalId === id) {
    state.activeGoalId = state.goals[0]?.id || null;
  }
  logActivity(`Deleted goal: ${name}`, "goal");
  saveState();
}

export function logActivity(text, type = "general") {
  state.activity.unshift({
    id: uid(),
    text,
    type,
    time: new Date().toISOString()
  });
  if (state.activity.length > 100) {
    state.activity = state.activity.slice(0, 100);
  }
  saveState();
}

export function exportData() {
  const dataStr = JSON.stringify(state, null, 2);
  const blob = new Blob([dataStr], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `WegUp_Backup_${dateKey()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function importData(jsonString) {
  try {
    const parsed = JSON.parse(jsonString);
    if (!parsed || typeof parsed !== "object") throw new Error("Invalid JSON data");
    state = { ...createDefaultState(), ...parsed, version: 2 };
    saveState();
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export function resetAllData() {
  localStorage.removeItem(STORAGE_KEY);
  state = createDefaultState();
  return state;
}
