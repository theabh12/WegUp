/**
 * WegUp Gemini API Service & AI Engine
 * Handles direct integration with Google Gemini models with live model auto-discovery
 * via Google's ListModels API, custom model override, and robust offline fallback.
 */

import { getApiKey, getState } from "./state.js";

const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";

export const DEFAULT_MODELS = [
  { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash (Hybrid Reasoning & High Speed)" },
  { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash (Fast & Reliable)" },
  { id: "gemini-2.5-flash-lite", name: "Gemini 2.5 Flash-Lite (Low Latency)" },
  { id: "gemini-2.0-flash-lite", name: "Gemini 2.0 Flash-Lite" },
  { id: "gemini-1.5-flash-latest", name: "Gemini 1.5 Flash (Latest)" }
];

/**
 * Fetch all available generation models directly from Google AI Studio for a given API key
 */
export async function fetchAccountModels(apiKey) {
  if (!apiKey || !apiKey.trim()) {
    throw new Error("Please enter an API key first.");
  }
  const cleanKey = apiKey.trim();
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${cleanKey}`;

  const res = await fetch(url);
  if (!res.ok) {
    const errJson = await res.json().catch(() => ({}));
    throw new Error(errJson?.error?.message || `HTTP ${res.status}: ${res.statusText}`);
  }

  const data = await res.json();
  const rawList = data?.models || [];
  
  // Filter for models that support generateContent
  const validModels = rawList
    .filter((m) => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes("generateContent"))
    .map((m) => {
      const id = m.name.replace("models/", "");
      return {
        id,
        name: `${m.displayName || id} (${id})`,
        description: m.description || ""
      };
    });

  if (!validModels.length) {
    throw new Error("No text generation models found for this API key.");
  }

  return validModels;
}

/**
 * Tests connection with a specified model or discovers the best working model
 */
export async function testGeminiConnection(apiKey, preferredModel = "") {
  if (!apiKey || !apiKey.trim()) {
    return { ok: false, error: "API key is required" };
  }
  const cleanKey = apiKey.trim();

  // First verify account models
  let available = [];
  try {
    available = await fetchAccountModels(cleanKey);
  } catch (err) {
    return { ok: false, error: err.message };
  }

  const modelIds = available.map((m) => m.id);
  
  // Determine target model
  let targetModel = preferredModel.trim();
  if (!targetModel || !modelIds.includes(targetModel)) {
    // Pick best modern model available
    targetModel = modelIds.find((id) => id.includes("2.5-flash"))
      || modelIds.find((id) => id.includes("2.0-flash"))
      || modelIds.find((id) => id.includes("flash"))
      || modelIds[0];
  }

  // Ping generateContent on target model
  try {
    const url = `${GEMINI_BASE_URL}/${targetModel}:generateContent?key=${cleanKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: "Respond with: PONG" }] }]
      })
    });

    if (res.ok) {
      const data = await res.json();
      const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
      return {
        ok: true,
        model: targetModel,
        availableModels: available,
        reply: reply.trim()
      };
    }

    const errJson = await res.json().catch(() => ({}));
    return {
      ok: false,
      error: errJson?.error?.message || `HTTP ${res.status}`,
      availableModels: available
    };
  } catch (err) {
    return {
      ok: false,
      error: err.message || "Network error while connecting to Gemini API",
      availableModels: available
    };
  }
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
 * Generate text from Gemini
 */
export async function generateGeminiText(prompt, systemInstruction = "") {
  const apiKey = getApiKey();
  const state = getState();
  const activeModel = state.model || "gemini-2.0-flash";

  if (!apiKey) {
    return null; // Offline fallback
  }

  const url = `${GEMINI_BASE_URL}/${activeModel}:generateContent?key=${apiKey}`;
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

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(`Gemini API Error (${activeModel}): ${errData?.error?.message || res.statusText}`);
  }

  const data = await res.json();
  const output = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!output) {
    throw new Error("No text response returned by Gemini model.");
  }
  return output.trim();
}

/**
 * Generate parsed JSON directly from Gemini
 */
export async function generateGeminiJSON(prompt, systemInstruction = "") {
  const apiKey = getApiKey();
  if (!apiKey) return null;

  const fullPrompt = `${prompt}\n\nIMPORTANT: Return ONLY valid, parseable JSON. No backticks, intro, or outro.`;
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
