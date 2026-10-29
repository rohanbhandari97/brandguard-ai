const OpenAI = require("openai");
const { config, isGroqConfigured } = require("../config");

let client;

function getClient() {
  if (!isGroqConfigured()) {
    const error = new Error("Groq is not configured. Set GROQ_API_KEY in your environment.");
    error.status = 503;
    error.error = "Service unavailable";
    throw error;
  }
  if (process.env.BRANDGUARD_MOCK_PROVIDER === "1") {
    const error = new Error("Groq network calls are disabled in tests. Mock completeJson instead.");
    error.status = 503;
    error.error = "Service unavailable";
    throw error;
  }
  if (!client) {
    client = new OpenAI({
      apiKey: config.groqApiKey,
      baseURL: config.groqBaseUrl
    });
  }
  return client;
}

function parseJsonObject(raw) {
  if (!raw || typeof raw !== "string") {
    throw new Error("The model returned an empty response.");
  }
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    const error = new Error("The model returned a response that was not valid JSON.");
    error.status = 502;
    error.error = "Upstream error";
    throw error;
  }
}

function redactSecrets(text) {
  return String(text)
    .replace(/gsk_[A-Za-z0-9_-]+/gi, "[REDACTED]")
    .replace(/sk-[A-Za-z0-9_-]+/gi, "[REDACTED]");
}

/**
 * Classify an error thrown by the Groq OpenAI-compatible API or the network.
 *
 *   401                 → 401 authentication_error
 *   429 quota exhausted → 402 quota_exceeded (free-tier limit, not paid billing)
 *   429 rate limit      → 429 rate_limited
 *   5xx provider        → 502 provider_error
 *   network / timeout   → 503 / 504
 */
function classifyGroqError(err) {
  const httpStatus = err.status;

  if (httpStatus === 401) {
    return {
      status: 401,
      errorCode: "authentication_error",
      message: "The Groq API key is invalid or has been revoked. Check your GROQ_API_KEY."
    };
  }

  if (httpStatus === 429) {
    const body = err.error || {};
    const inner = (typeof body === "object" && body.error) ? body.error : body;
    const errType = (inner && inner.type) ? String(inner.type) : "";
    const errCode = (inner && inner.code) ? String(inner.code) : "";
    const combined = `${errType} ${errCode} ${err.message || ""}`.toLowerCase();

    if (combined.includes("insufficient_quota") || combined.includes("quota")) {
      return {
        status: 402,
        errorCode: "quota_exceeded",
        message: "The Groq free-tier quota has been exhausted. Wait for the quota to reset. This app does not use paid Groq usage."
      };
    }

    return {
      status: 429,
      errorCode: "rate_limited",
      message: "The Groq free-tier rate limit was reached. Please wait a moment and try again."
    };
  }

  if (httpStatus >= 500 && httpStatus < 600) {
    return {
      status: 502,
      errorCode: "provider_error",
      message: `The Groq service returned an error (HTTP ${httpStatus}). Try again in a moment.`
    };
  }

  if (!httpStatus) {
    const nodeCode = err.code || "";
    if (nodeCode === "ECONNRESET" || nodeCode === "ECONNREFUSED" || nodeCode === "ETIMEDOUT" || nodeCode === "ENOTFOUND") {
      return {
        status: 503,
        errorCode: "network_error",
        message: "Could not reach the Groq API. Check your network connection and try again."
      };
    }
    if (err.name === "AbortError" || /timeout/i.test(err.message || "")) {
      return {
        status: 504,
        errorCode: "timeout",
        message: "The request to Groq timed out. Please try again."
      };
    }
    return {
      status: 503,
      errorCode: "network_error",
      message: "Could not reach the Groq API. Check your network connection and try again."
    };
  }

  return {
    status: 502,
    errorCode: "upstream_error",
    message: "The review service could not complete this request."
  };
}

async function completeJson({ system, user, temperature = 0.2 }) {
  try {
    const completion = await getClient().chat.completions.create({
      model: config.groqModel,
      temperature,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user }
      ]
    });
    const text = completion.choices && completion.choices[0] && completion.choices[0].message
      ? completion.choices[0].message.content
      : "";
    return parseJsonObject(text);
  } catch (err) {
    if (err.status === 503 && err.error === "Service unavailable") throw err;
    if (err.status === 502 && err.error === "Upstream error") throw err;

    const classified = classifyGroqError(err);
    const safeOriginal = err.message ? redactSecrets(err.message) : "(no message)";
    console.error(
      `BrandGuard Groq error [${classified.errorCode}] HTTP ${err.status || "none"}: ${safeOriginal}`
    );

    const error = new Error(classified.message);
    error.status = classified.status;
    error.error = classified.errorCode;
    throw error;
  }
}

module.exports = { completeJson, parseJsonObject, classifyGroqError, getClient };
