const DEFAULT_BRAND_GUIDELINES = [
  "Voice & tone: Be helpful, confident, empathetic, and customer-first.",
  "Avoid high-pressure language such as “Buy now!” or “Hurry, act now!”.",
  "Prefer language like “Explore a solution designed for your goals.”",
  "Claims: Do not make absolute promises or market-ranking claims without approved evidence.",
  "Avoid “No. 1 solution” and “100% results”. Use specific, substantiated benefits.",
  "Absolute Efficacy: Avoid claims of 100% cure, complete eradication, or total elimination (e.g. “removes 100% of acne”).",
  "Medical & Clinical Efficacy: Do not assert revolutionary medical results, cure capabilities, or professional medical endorsements (e.g. “dermatologists guarantee”) without approved clinical evidence.",
  "Timelines: Do not promise precise, rapid turnaround timelines (e.g. “in just 24 hours”) unless clinically substantiated.",
  "Guarantees & Permanence: Avoid universal guarantees (e.g. “for every skin type”, “guarantee”) and promises of permanent results.",
  "Safety: Do not claim “zero side effects” or absolute safety without certified clinical trial safety documentation.",
  "Verification: Claims without evidence must be flagged as unverified rather than declared false. Unverified claims require substantiation before publication.",
  "Accessibility: Text should remain easy to read. Normal text should meet at least 4.5:1 contrast.",
  "Workflow: Automated checks help people review content. They do not publish automatically.",
  "Visual: This service does not analyze images. Do not invent visual findings from images that were not provided."
].join(" ");

const config = {
  port: Number.parseInt(process.env.PORT, 10) || 3000,
  nodeEnv: process.env.NODE_ENV || "development",
  groqApiKey: process.env.GROQ_API_KEY || "",
  groqBaseUrl: "https://api.groq.com/openai/v1",
  // Production Groq model on the free/developer path (official list, 2026-10-29):
  // https://console.groq.com/docs/models — openai/gpt-oss-20b
  groqModel: process.env.GROQ_MODEL || "openai/gpt-oss-20b",
  frontendOrigins: (process.env.FRONTEND_ORIGIN || "http://localhost:3000,http://127.0.0.1:3000")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
  defaultBrandGuidelines: DEFAULT_BRAND_GUIDELINES,
  limits: {
    jsonBytes: "256kb",
    contentMaxChars: 15000,
    guidelinesMaxChars: 12000,
    flaggedTextMaxChars: 2000
  }
};

function isGroqConfigured() {
  const key = config.groqApiKey;
  return Boolean(key && key !== "gsk_your-groq-api-key-here");
}

module.exports = { config, isGroqConfigured };
