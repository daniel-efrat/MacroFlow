import { config } from './config.js';

const API_KEY = config.GEMINI_API_KEY;
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`;

export async function generateMacroFromQuery(query) {
  if (!API_KEY) {
    throw new Error('Gemini API key is missing. Check .env');
  }

  const prompt = `
  You are an expert web automation assistant for the "MacroFlow" Chrome Extension.
  Your job is to convert the user's natural language request into a strict JSON sequence of automation steps.
  
  The JSON format MUST be:
  [
    { "action": "navigate", "target": "", "value": "https://example.com" },
    { "action": "click", "target": "#button-id", "value": "" },
    { "action": "type", "target": "input[name='q']", "value": "search query" },
    { "action": "wait", "target": "", "value": "2000" }
  ]
  
  Rules:
  1. ONLY return the raw JSON array. NO MARKDOWN, NO EXPLANATIONS.
  2. Use "navigate" for going to URLs (put URL in "value").
  3. Use standard CSS selectors for "target" in click/type actions. Guess the most likely logical selector.
  4. Always add a small "wait" action (e.g., 2000) after navigation or major changes if it makes sense.

  User Request: "${query}"
  `;

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1, // Low temp for more deterministic code output
        }
      })
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`API Error: ${response.status} ${errText}`);
    }

    const data = await response.json();
    let text = data.candidates[0].content.parts[0].text;
    
    // Clean up possible markdown wrappers
    text = text.replace(/```json/g, '').replace(/```/g, '').trim();
    
    const steps = JSON.parse(text);
    return steps;
  } catch (error) {
    console.error('[MacroFlow AI Error]', error);
    throw error;
  }
}
