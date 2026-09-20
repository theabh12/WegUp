/**
 * WegUp Gemini API Service & AI Engine
 * Handles direct integration with Google Gemini models with robust multi-model fallback,
 * clear diagnostic reporting, and graceful offline mode.
 */

import { getApiKey, getState } from "./state.js";

const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";

export const DEFAULT_MODELS = [
  { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash (Fast & Highly Stable)" },
  { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash (Hybrid Reasoning)" },
  { id: "gemini-2.5-flash-lite", name: "Gemini 2.5 Flash-Lite (Low Latency)" },
  { id: "gemini-1.5-flash", name: "Gemini 1.5 Flash" },
  { id: "gemini-1.5-pro", name: "Gemini 1.5 Pro" }
];

/**
 * Tests connection directly using candidate models
 */
export async function testGeminiConnection(apiKey, preferredModel = "") {
  if (!apiKey || !apiKey.trim()) {
    return { ok: false, error: "API key is required. Please paste your Google AI Studio key." };
  }
  
  // Clean whitespace and accidental surrounding quotes
  const cleanKey = apiKey.trim().replace(/^['"]|['"]$/g, "");

  // Priority order of models to test
  const candidates = [
    preferredModel.trim(),
    "gemini-2.0-flash",
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
    "gemini-1.5-flash",
    "gemini-1.5-flash-latest",
    "gemini-1.5-pro"
  ].filter((v, i, a) => v && a.indexOf(v) === i);

  let lastError = "";
  let lastStatus = 0;

  for (const model of candidates) {
    try {
      const url = `${GEMINI_BASE_URL}/${model}:generateContent?key=${cleanKey}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: "Respond only with: PONG" }] }]
        })
      });

      lastStatus = res.status;

      if (res.ok) {
        const data = await res.json();
        const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
        return {
          ok: true,
          model,
          reply: reply.trim()
        };
      }

      const errJson = await res.json().catch(() => ({}));
      lastError = errJson?.error?.message || `HTTP ${res.status}`;

      // If invalid API key, no need to cycle through other models
      if (lastError.toLowerCase().includes("api_key_invalid") || lastError.toLowerCase().includes("invalid api key")) {
        return {
          ok: false,
          error: "API Key Invalid: Please verify you copied the full key correctly from Google AI Studio (starts with 'AIzaSy...')."
        };
      }
    } catch (err) {
      lastError = err.message || "Network request failed";
    }
  }

  // Diagnostic helper: check if ListModels can reveal available models
  try {
    const listRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${cleanKey}`);
    if (listRes.ok) {
      const listData = await listRes.json();
      const available = (listData.models || [])
        .filter((m) => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes("generateContent"))
        .map((m) => m.name.replace("models/", ""));
      if (available.length > 0) {
        return {
          ok: false,
          error: `${lastError}. Available models for your key: ${available.slice(0, 5).join(", ")}`,
          availableModels: available
        };
      }
    }
  } catch {}

  return {
    ok: false,
    error: `${lastError || "Could not connect to Gemini endpoint"} (HTTP ${lastStatus || "Network Error"}). Please check your internet connection or key restrictions.`
  };
}

/**
 * Fetch available account models directly from Google AI Studio
 */
export async function fetchAccountModels(apiKey) {
  const cleanKey = (apiKey || "").trim().replace(/^['"]|['"]$/g, "");
  if (!cleanKey) throw new Error("API key is required");

  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${cleanKey}`;
  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `HTTP ${res.status}`);
  }
  const data = await res.json();
  return (data.models || [])
    .filter((m) => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes("generateContent"))
    .map((m) => {
      const id = m.name.replace("models/", "");
      return { id, name: `${m.displayName || id} (${id})` };
    });
}

/**
 * Clean Markdown fences from JSON strings
 */
function cleanJsonString(str) {
  if (!str) return "{}";
  let cleaned = str.trim();
  if (cleaned.startsWith("```")) {
    const firstNewline = cleaned.indexOf("\n");
    if (firstNewline !== -1) {
      cleaned = cleaned.substring(firstNewline + 1);
    }
    if (cleaned.endsWith("```")) {
      cleaned = cleaned.substring(0, cleaned.length - 3);
    }
  }
  return cleaned.trim();
}

/**
 * Generate text from Gemini with automatic multi-model fallback
 */
export async function generateGeminiText(prompt, systemInstruction = "") {
  const apiKey = getApiKey();
  const state = getState();
  const cleanKey = (apiKey || "").trim().replace(/^['"]|['"]$/g, "");

  if (!cleanKey) {
    return null; // Offline fallback
  }

  const preferredModel = state.model || "gemini-2.0-flash";
  const modelsToTry = [
    preferredModel,
    "gemini-2.0-flash",
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
    "gemini-1.5-flash"
  ].filter((v, i, a) => v && a.indexOf(v) === i);

  let lastError = null;

  for (const model of modelsToTry) {
    try {
      const url = `${GEMINI_BASE_URL}/${model}:generateContent?key=${cleanKey}`;
      const requestBody = {
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }]
          }
        ]
      };

      if (systemInstruction) {
        requestBody.systemInstruction = {
          parts: [{ text: systemInstruction }]
        };
      }

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody)
      });

      if (res.ok) {
        const data = await res.json();
        const output = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (output) return output.trim();
      } else {
        const errData = await res.json().catch(() => ({}));
        lastError = new Error(`Gemini API (${model}): ${errData?.error?.message || res.statusText}`);
      }
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError || new Error("No response returned by Gemini models.");
}

/**
 * Generate parsed JSON directly from Gemini
 */
export async function generateGeminiJSON(prompt, systemInstruction = "") {
  const apiKey = getApiKey();
  if (!apiKey) return null;

  const fullPrompt = `${prompt}\n\nIMPORTANT: Return ONLY valid, parseable JSON. No markdown fences, intro, or outro.`;
  const rawText = await generateGeminiText(fullPrompt, systemInstruction);
  if (!rawText) return null;

  const cleaned = cleanJsonString(rawText);
  try {
    return JSON.parse(cleaned);
  } catch (err) {
    console.error("Failed to parse Gemini response as JSON:", rawText);
    throw new Error("Model returned invalid JSON format. Please retry.");
  }
}

export function isLiveAIMode() {
  return Boolean(getApiKey());
}
