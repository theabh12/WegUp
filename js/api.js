/**
 * WegUp Gemini API Service & AI Engine
 * Handles direct integration with Google Gemini models (gemini-1.5-flash, gemini-2.0-flash)
 * with robust offline mock fallback for college viva demonstrations.
 */

import { getApiKey, getState } from "./state.js";

const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";

/**
 * Tests whether a given Gemini API key is valid and working
 */
export async function testGeminiConnection(apiKey, model = "gemini-1.5-flash") {
  if (!apiKey || !apiKey.trim()) {
    return { ok: false, error: "API key is required" };
  }
  const cleanKey = apiKey.trim();
  const url = `${GEMINI_BASE_URL}/${model}:generateContent?key=${cleanKey}`;
  
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: "Respond only with: 'PONG'" }] }]
      })
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      const msg = errJson?.error?.message || `HTTP ${res.status}: ${res.statusText}`;
      return { ok: false, error: msg };
    }

    const data = await res.json();
    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    return { ok: true, reply: reply.trim() };
  } catch (err) {
    return { ok: false, error: err.message || "Network error while connecting to Gemini API" };
  }
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
 * Generate text from Gemini
 */
export async function generateGeminiText(prompt, systemInstruction = "") {
  const apiKey = getApiKey();
  const state = getState();
  const model = state.model || "gemini-1.5-flash";

  if (!apiKey) {
    return null; // Signals caller to use offline fallback
  }

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

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    const errMessage = errData?.error?.message || `HTTP ${res.status}`;
    throw new Error(`Gemini API Error: ${errMessage}`);
  }

  const data = await res.json();
  const output = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!output) {
    throw new Error("No response returned by Gemini model.");
  }
  return output.trim();
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
