/**
 * WegUp Gemini API Service & AI Engine
 * Handles direct integration with Google Gemini models (gemini-2.5-flash, gemini-2.5-pro)
 * with robust multi-model fallback, clear diagnostic reporting, and graceful offline mode.
 */

import { getApiKey, getState } from "./state.js?v=3.5.0";

const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";

export const DEFAULT_MODELS = [
  { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash (Recommended - Ultra Fast & Hybrid Reasoning)" },
  { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro (Deep Reasoning & Analysis)" }
];

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
 * Tests connection directly using candidate models
 */
export async function testGeminiConnection(apiKey, preferredModel = "gemini-2.5-flash") {
  if (!apiKey || !apiKey.trim()) {
    return { ok: false, error: "API key is required. Please paste your Google AI Studio key." };
  }
  
  // Clean whitespace and accidental surrounding quotes
  const cleanKey = apiKey.trim().replace(/^['"]|['"]$/g, "");

  // First discover models actually available on this key
  let available = [];
  try {
    available = await fetchAccountModels(cleanKey);
  } catch (err) {
    console.warn("Could not list models:", err);
    const msg = (err.message || "").toLowerCase();
    if (msg.includes("api_key_invalid") || msg.includes("invalid api key") || msg.includes("400") || msg.includes("403")) {
      return {
        ok: false,
        error: `Invalid API Key: Google AI Studio rejected this key (${err.message}). Ensure you created the key in https://aistudio.google.com/ and that it starts with 'AIzaSy'.`
      };
    }
  }

  const modelIds = available.map((m) => m.id);

  // Build candidate models: strictly prioritize 2.5 models
  const candidateSet = new Set();
  
  // If user selected a valid model (and not an obsolete 1.x model)
  if (preferredModel && !preferredModel.startsWith("gemini-1.") && (modelIds.length === 0 || modelIds.includes(preferredModel))) {
    candidateSet.add(preferredModel);
  }

  // Prioritize gemini-2.5-flash and gemini-2.5-pro
  if (modelIds.includes("gemini-2.5-flash")) candidateSet.add("gemini-2.5-flash");
  if (modelIds.includes("gemini-2.5-pro")) candidateSet.add("gemini-2.5-pro");

  // Add other valid text-generation models discovered on the key (exclude audio/tts/embedding)
  for (const id of modelIds) {
    if (!id.includes("preview-tts") && !id.includes("embedding") && !id.includes("image")) {
      candidateSet.add(id);
    }
  }

  // Fallback candidates if list couldn't be fetched
  if (candidateSet.size === 0) {
    candidateSet.add("gemini-2.5-flash");
    candidateSet.add("gemini-2.5-pro");
  }

  const candidates = Array.from(candidateSet);
  let lastError = "";

  for (const model of candidates) {
    try {
      const url = `${GEMINI_BASE_URL}/${model}:generateContent?key=${cleanKey}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: "Hello! Respond only with: PONG" }]
            }
          ]
        })
      });

      if (res.ok) {
        const data = await res.json();
        const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
        return {
          ok: true,
          model,
          availableModels: available,
          reply: reply.trim()
        };
      }

      const errJson = await res.json().catch(() => ({}));
      lastError = errJson?.error?.message || `HTTP ${res.status}`;

      if (lastError.toLowerCase().includes("api_key_invalid") || lastError.toLowerCase().includes("invalid api key")) {
        return {
          ok: false,
          error: "API Key Invalid: Please verify you copied the full key correctly from Google AI Studio (starts with 'AIzaSy...').",
          availableModels: available
        };
      }
    } catch (err) {
      lastError = err.message || "Network request failed";
    }
  }

  return {
    ok: false,
    error: lastError || "Could not connect to Gemini endpoint. Please check your internet connection.",
    availableModels: available
  };
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

  const preferredModel = (state.model && !state.model.startsWith("gemini-1.") && state.model !== "gemini-2.0-flash") ? state.model : "gemini-2.5-flash";
  const modelsToTry = [
    preferredModel,
    "gemini-2.5-flash",
    "gemini-2.5-pro"
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
