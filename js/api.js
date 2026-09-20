/**
 * WegUp Gemini API Service & AI Engine
 * Handles direct integration with Google Gemini models (gemini-2.0-flash, gemini-2.5-flash)
 * with multi-model auto-discovery and robust offline fallback for college viva demonstrations.
 */

import { getApiKey, getState } from "./state.js";

const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";

export const SUPPORTED_MODELS = [
  { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash (Recommended & Fast)" },
  { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash (Hybrid Reasoning)" },
  { id: "gemini-2.5-flash-lite", name: "Gemini 2.5 Flash-Lite (Low Latency)" },
  { id: "gemini-1.5-flash-latest", name: "Gemini 1.5 Flash (Latest)" }
];

/**
 * Tests whether a given Gemini API key is valid and finds a working model
 */
export async function testGeminiConnection(apiKey, preferredModel = "gemini-2.0-flash") {
  if (!apiKey || !apiKey.trim()) {
    return { ok: false, error: "API key is required" };
  }
  const cleanKey = apiKey.trim();

  // Try candidate models in order of modern availability
  const candidateModels = [
    preferredModel,
    "gemini-2.0-flash",
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
    "gemini-1.5-flash-latest",
    "gemini-1.5-flash"
  ].filter((v, i, a) => v && a.indexOf(v) === i);

  let lastError = "";

  for (const model of candidateModels) {
    try {
      const url = `${GEMINI_BASE_URL}/${model}:generateContent?key=${cleanKey}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: "Respond only with: 'PONG'" }] }]
        })
      });

      if (res.ok) {
        const data = await res.json();
        const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
        return { ok: true, model, reply: reply.trim() };
      }

      const errJson = await res.json().catch(() => ({}));
      lastError = errJson?.error?.message || `HTTP ${res.status}`;
      
      // If it's an invalid API key, no need to retry other models
      if (res.status === 400 && lastError.toLowerCase().includes("api_key_invalid")) {
        return { ok: false, error: "Invalid API Key provided. Please check your Google AI Studio key." };
      }
    } catch (err) {
      lastError = err.message || "Network error while connecting to Gemini API";
    }
  }

  // If candidate generation failed, probe ModelService.ListModels for exact diagnostic
  try {
    const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${cleanKey}`;
    const listRes = await fetch(listUrl);
    if (listRes.ok) {
      const listData = await listRes.json();
      const available = (listData.models || [])
        .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
        .map((m) => m.name.replace("models/", ""));
      if (available.length > 0) {
        return {
          ok: false,
          error: `Selected model not available for this key. Supported models on your account: ${available.slice(0, 4).join(", ")}`,
          availableModels: available
        };
      }
    }
  } catch {}

  return { ok: false, error: lastError || "Could not establish connection with Gemini API." };
}

/**
 * Clean Markdown fences from JSON strings (e.g. ```json ... ```)
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
 * Generate text from Gemini with automatic model fallback
 */
export async function generateGeminiText(prompt, systemInstruction = "") {
  const apiKey = getApiKey();
  const state = getState();
  const preferredModel = state.model || "gemini-2.0-flash";

  if (!apiKey) {
    return null; // Signals caller to use offline fallback
  }

  const modelsToTry = [preferredModel, "gemini-2.0-flash", "gemini-2.5-flash", "gemini-2.5-flash-lite"]
    .filter((v, i, a) => v && a.indexOf(v) === i);

  let lastError = null;

  for (const model of modelsToTry) {
    try {
      const url = `${GEMINI_BASE_URL}/${model}:generateContent?key=${apiKey}`;
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
 * Generate parsed JSON directly from Gemini with schema guidance
 */
export async function generateGeminiJSON(prompt, systemInstruction = "") {
  const apiKey = getApiKey();
  if (!apiKey) return null;

  const fullPrompt = `${prompt}\n\nIMPORTANT: Return ONLY valid, parseable JSON matching the requested structure. Do not include markdown code block backticks, intro text, or outro explanation.`;
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

/**
 * Check if the app is operating in live AI mode
 */
export function isLiveAIMode() {
  return Boolean(getApiKey());
}
