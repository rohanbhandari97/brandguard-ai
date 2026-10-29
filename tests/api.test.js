const { test, before } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

process.env.GROQ_API_KEY = "";
process.env.BRANDGUARD_MOCK_PROVIDER = "1";
process.env.FRONTEND_ORIGIN = "http://localhost:3000";

const app = require("../src/app");
const { normalizeFinding, evaluateLocalRules, validateSuggestedCorrection } = require("../src/services/reviewService");
const { classifyGroqError } = require("../src/services/groqService");

before(() => {
  process.env.GROQ_API_KEY = "";
});

test("GET /api/health returns service status without secrets", async () => {
  const res = await request(app).get("/api/health");
  assert.equal(res.status, 200);
  assert.equal(res.body.status, "ok");
  assert.equal(res.body.service, "brandguard-ai");
  assert.equal(res.body.provider, "groq");
  assert.equal(typeof res.body.groqConfigured, "boolean");
  assert.equal(res.body.groqConfigured, false);
  assert.ok(!JSON.stringify(res.body).includes("sk-"));
  assert.ok(!JSON.stringify(res.body).includes("gsk_"));
  assert.equal(res.body.groqApiKey, undefined);
  assert.equal(res.body.openaiApiKey, undefined);
});

test("POST /api/reviews rejects missing content", async () => {
  const res = await request(app)
    .post("/api/reviews")
    .send({ brandGuidelines: "Be helpful." });
  assert.equal(res.status, 400);
  assert.equal(res.body.error, "Invalid request");
});

test("POST /api/corrections rejects empty content", async () => {
  const res = await request(app)
    .post("/api/corrections")
    .send({ content: "   " });
  assert.equal(res.status, 400);
});

test("POST /api/reviews returns 503 when Groq is not configured", async () => {
  const res = await request(app)
    .post("/api/reviews")
    .send({ content: "Buy now! We are number one." });
  assert.equal(res.status, 503);
  assert.match(res.body.message, /GROQ_API_KEY/i);
  assert.ok(!JSON.stringify(res.body).toLowerCase().includes("sk-"));
});

test("unknown API route returns 404 JSON", async () => {
  const res = await request(app).get("/api/does-not-exist");
  assert.equal(res.status, 404);
});

test("normalizeFinding never marks claims as verified", () => {
  const finding = normalizeFinding({
    id: "claim-1",
    category: "unsupported_claim",
    severity: "HIGH",
    title: "Ranking claim",
    originalText: "No. 1 solution",
    explanation: "Needs evidence",
    evidence: "Do not make ranking claims without approved evidence.",
    suggestedCorrection: "a solution designed for your team",
    claimVerification: { status: "verified", reason: "I checked the internet" }
  }, 0);

  assert.equal(finding.claimVerification.status, "unverified");
  assert.equal(finding.category, "Unsupported claim");
  assert.equal(finding.severity, "HIGH");
  assert.ok(finding.claimVerification.reason);
});

test("evaluateLocalRules returns multiple distinct findings for multi-claim risky skincare copy", () => {
  const riskyCopy = "Our revolutionary skincare cream removes 100% of acne in just 24 hours. Dermatologists guarantee permanent results for every skin type, with zero side effects.";
  const findings = evaluateLocalRules(riskyCopy);

  // Must detect multiple distinct findings, not just one "guarantee"
  assert.ok(findings.length >= 6, `Expected at least 6 findings, but got ${findings.length}`);

  // 1. 100% results / absolute removal
  const hundredPercent = findings.find(f => /100%/i.test(f.originalText));
  assert.ok(hundredPercent, "Must detect 100% results / absolute efficacy claim");
  assert.equal(hundredPercent.severity, "HIGH");
  assert.equal(hundredPercent.claimVerification.status, "unverified");
  assert.ok(hundredPercent.suggestedCorrection);
  assert.ok(!/false/i.test(hundredPercent.claimVerification.status));

  // 2. Medical efficacy claim
  const medical = findings.find(f => /revolutionary\s+skincare\s+cream/i.test(f.originalText));
  assert.ok(medical, "Must detect medical/revolutionary efficacy claim");
  assert.equal(medical.severity, "HIGH");
  assert.equal(medical.claimVerification.status, "unverified");
  assert.ok(medical.suggestedCorrection);

  // 3. Precise timelines
  const timeline = findings.find(f => /just\s+24\s+hours/i.test(f.originalText));
  assert.ok(timeline, "Must detect precise timeline promise");
  assert.equal(timeline.severity, "HIGH");
  assert.equal(timeline.claimVerification.status, "unverified");
  assert.ok(timeline.suggestedCorrection);

  // 4. Universal guarantee
  const guarantee = findings.find(f => /guarantee/i.test(f.originalText));
  assert.ok(guarantee, "Must detect universal guarantee");
  assert.equal(guarantee.severity, "HIGH");
  assert.equal(guarantee.claimVerification.status, "unverified");
  assert.ok(guarantee.suggestedCorrection);

  // 5. Permanent results
  const permanent = findings.find(f => /permanent\s+results/i.test(f.originalText));
  assert.ok(permanent, "Must detect permanent results claim");
  assert.equal(permanent.severity, "HIGH");
  assert.equal(permanent.claimVerification.status, "unverified");
  assert.ok(permanent.suggestedCorrection);

  // 6. Universal suitability for every skin type
  const universal = findings.find(f => /for\s+every\s+skin\s+type/i.test(f.originalText));
  assert.ok(universal, "Must detect universal suitability claim");
  assert.equal(universal.severity, "HIGH");
  assert.equal(universal.claimVerification.status, "unverified");
  assert.ok(universal.suggestedCorrection);

  // 7. Zero side effects
  const zeroSideEffects = findings.find(f => /zero\s+side\s+effects/i.test(f.originalText));
  assert.ok(zeroSideEffects, "Must detect zero side effects claim");
  assert.equal(zeroSideEffects.severity, "HIGH");
  assert.equal(zeroSideEffects.claimVerification.status, "unverified");
  assert.ok(zeroSideEffects.suggestedCorrection);

  // All findings must be in the source text verbatim
  for (const f of findings) {
    assert.ok(riskyCopy.includes(f.originalText), `originalText "${f.originalText}" must be in source text`);
    assert.ok(f.explanation.length > 0, "Finding must have explanation");
    assert.ok(f.suggestedCorrection.length > 0, "Finding must have suggestedCorrection");
    // Ensure claims without evidence are unverified, not called false
    assert.notEqual(f.claimVerification.status, "false");
  }
});

test("evaluateLocalRules returns 0 findings for ordinary low-risk copy", () => {
  const lowRiskCopy = "Our gentle daily moisturiser hydrates dry skin and leaves it feeling soft and refreshed.";
  const findings = evaluateLocalRules(lowRiskCopy);
  assert.equal(findings.length, 0, "Ordinary compliant copy must return 0 findings");
});

test("normalizeFinding handles multiple findings, severities, and unverified status properly", () => {
  const inputFindings = [
    {
      id: "f-high",
      category: "unsupported_claim",
      severity: "HIGH",
      title: "100% cure claim",
      originalText: "removes 100% of acne",
      explanation: "This claim is false because no evidence was given",
      suggestedCorrection: "helps reduce acne",
      claimVerification: { status: "false", reason: "This claim is false" }
    },
    {
      id: "f-med",
      category: "brand_voice",
      severity: "MEDIUM",
      title: "Urgent CTA",
      originalText: "Hurry, act now!",
      explanation: "Too aggressive",
      suggestedCorrection: "Learn more",
      claimVerification: { status: "not_a_claim", reason: "Style issue" }
    },
    {
      id: "f-low",
      category: "other",
      severity: "LOW",
      title: "Minor phrasing",
      originalText: "best choices",
      explanation: "Subtle phrasing suggestion",
      suggestedCorrection: "good options",
      claimVerification: { status: "unverified" }
    }
  ];

  const normalized = inputFindings.map(normalizeFinding);

  assert.equal(normalized.length, 3);
  assert.equal(normalized[0].severity, "HIGH");
  // Enforces unverified rather than false
  assert.equal(normalized[0].claimVerification.status, "unverified");
  assert.ok(!/\bclaim is false\b/i.test(normalized[0].claimVerification.reason));
  assert.ok(!/\bthis claim is false\b/i.test(normalized[0].explanation));

  assert.equal(normalized[1].severity, "MEDIUM");
  assert.equal(normalized[1].claimVerification.status, "not_a_claim");

  assert.equal(normalized[2].severity, "LOW");
  assert.equal(normalized[2].claimVerification.status, "unverified");
});


// ── Error classification tests ───────────────────────────────────────────────

test("classifyGroqError: 401 yields authentication_error with 401 status", () => {
  const err = { status: 401, message: "Incorrect API key provided.", error: {} };
  const result = classifyGroqError(err);
  assert.equal(result.status, 401);
  assert.equal(result.errorCode, "authentication_error");
  assert.ok(result.message.length > 0);
  // Must mention API key so operator knows what to fix
  assert.match(result.message, /api key/i);
});

test("classifyGroqError: 429 with insufficient_quota yields quota_exceeded with 402 status", () => {
  const err = {
    status: 429,
    message: "You exceeded your current quota.",
    error: { error: { type: "insufficient_quota", code: "insufficient_quota" } }
  };
  const result = classifyGroqError(err);
  assert.equal(result.status, 402);
  assert.equal(result.errorCode, "quota_exceeded");
  // Must NOT say "busy" — quota exhaustion is not a transient busy state
  assert.ok(!/busy/i.test(result.message), "quota_exceeded message must not say 'busy'");
  assert.ok(result.message.length > 0);
});

test("classifyGroqError: 429 rate limit (no quota code) yields rate_limited with 429 status", () => {
  const err = {
    status: 429,
    message: "Rate limit exceeded.",
    error: { error: { type: "requests", code: "rate_limit_exceeded" } }
  };
  const result = classifyGroqError(err);
  assert.equal(result.status, 429);
  assert.equal(result.errorCode, "rate_limited");
  assert.ok(result.message.length > 0);
});

test("classifyGroqError: 500 provider error yields 502 provider_error", () => {
  const err = { status: 500, message: "Internal server error.", error: {} };
  const result = classifyGroqError(err);
  assert.equal(result.status, 502);
  assert.equal(result.errorCode, "provider_error");
  // Must mention the original HTTP status so operators can diagnose
  assert.match(result.message, /500/);
});

test("classifyGroqError: ECONNRESET network error yields 503 network_error", () => {
  const err = new Error("connect ECONNRESET");
  err.code = "ECONNRESET";
  // No .status property — simulate network failure
  const result = classifyGroqError(err);
  assert.equal(result.status, 503);
  assert.equal(result.errorCode, "network_error");
  assert.ok(result.message.length > 0);
});

test("classifyGroqError: ETIMEDOUT network error yields 503 network_error", () => {
  const err = new Error("connect ETIMEDOUT");
  err.code = "ETIMEDOUT";
  const result = classifyGroqError(err);
  assert.equal(result.status, 503);
  assert.equal(result.errorCode, "network_error");
});

test("classifyGroqError: AbortError timeout yields 504", () => {
  const err = new Error("The operation was aborted");
  err.name = "AbortError";
  const result = classifyGroqError(err);
  assert.equal(result.status, 504);
  assert.equal(result.errorCode, "timeout");
});

test("classifyGroqError: unknown error without status yields 502 upstream_error", () => {
  const err = { status: 418, message: "I am a teapot." };
  const result = classifyGroqError(err);
  assert.equal(result.status, 502);
  assert.equal(result.errorCode, "upstream_error");
});

// ── Provider-error HTTP responses from the API ───────────────────────────────

test("POST /api/reviews returns 401 with actionable message when Groq key is wrong", async () => {
  process.env.GROQ_API_KEY = "gsk_wrongkey000000000000000000000000000000000000000";
  // Reload the config / client so the new key is picked up
  // (the singleton client must be reset — achieved by invalidating the require cache)
  delete require.cache[require.resolve("../src/config")];
  delete require.cache[require.resolve("../src/services/groqService")];
  delete require.cache[require.resolve("../src/services/reviewService")];
  delete require.cache[require.resolve("../src/controllers/reviewController")];
  delete require.cache[require.resolve("../src/routes/reviews")];
  delete require.cache[require.resolve("../src/app")];

  // Re-require with the wrong key active
  const freshApp = require("../src/app");

  // HTTP shape is tested with a mocked Groq completeJson — no live provider call.
  const freshGroq = require("../src/services/groqService");
  const origComplete = freshGroq.completeJson;
  freshGroq.completeJson = async () => {
    const e = new Error("classifyGroqError test: simulate 401");
    const { classifyGroqError: classify } = require("../src/services/groqService");
    const fakeApiErr = { status: 401, message: "Incorrect API key provided.", error: {} };
    const classified = classify(fakeApiErr);
    const err = new Error(classified.message);
    err.status = classified.status;
    err.error = classified.errorCode;
    throw err;
  };

  try {
    const res = await request(freshApp)
      .post("/api/reviews")
      .send({ content: "Test copy for auth error." });

    assert.equal(res.status, 401, `Expected 401, got ${res.status}: ${JSON.stringify(res.body)}`);
    assert.match(res.body.message, /api key/i);
    // Must never expose any key material
    assert.ok(!JSON.stringify(res.body).match(/sk-/));
    assert.ok(!JSON.stringify(res.body).match(/gsk_/));
  } finally {
    freshGroq.completeJson = origComplete;
    // Restore blank key and clear cache for subsequent tests
    process.env.GROQ_API_KEY = "";
    delete require.cache[require.resolve("../src/config")];
    delete require.cache[require.resolve("../src/services/groqService")];
    delete require.cache[require.resolve("../src/services/reviewService")];
    delete require.cache[require.resolve("../src/controllers/reviewController")];
    delete require.cache[require.resolve("../src/routes/reviews")];
    delete require.cache[require.resolve("../src/app")];
  }
});

test("POST /api/reviews returns 402 with quota message when quota is exhausted", async () => {
  process.env.GROQ_API_KEY = "gsk_quotakey00000000000000000000000000000000000000";
  delete require.cache[require.resolve("../src/config")];
  delete require.cache[require.resolve("../src/services/groqService")];
  delete require.cache[require.resolve("../src/services/reviewService")];
  delete require.cache[require.resolve("../src/controllers/reviewController")];
  delete require.cache[require.resolve("../src/routes/reviews")];
  delete require.cache[require.resolve("../src/app")];

  const freshApp = require("../src/app");
  const freshGroq = require("../src/services/groqService");
  const origComplete = freshGroq.completeJson;
  freshGroq.completeJson = async () => {
    const { classifyGroqError: classify } = require("../src/services/groqService");
    const fakeApiErr = {
      status: 429,
      message: "You exceeded your current quota.",
      error: { error: { type: "insufficient_quota", code: "insufficient_quota" } }
    };
    const classified = classify(fakeApiErr);
    const err = new Error(classified.message);
    err.status = classified.status;
    err.error = classified.errorCode;
    throw err;
  };

  try {
    const res = await request(freshApp)
      .post("/api/reviews")
      .send({ content: "Test copy for quota error." });

    assert.equal(res.status, 402, `Expected 402, got ${res.status}: ${JSON.stringify(res.body)}`);
    assert.ok(!/busy/i.test(res.body.message), "quota message must not say 'busy'");
    assert.match(res.body.message, /quota/i);
    assert.ok(!JSON.stringify(res.body).match(/sk-/));
    assert.ok(!JSON.stringify(res.body).match(/gsk_/));
  } finally {
    freshGroq.completeJson = origComplete;
    process.env.GROQ_API_KEY = "";
    delete require.cache[require.resolve("../src/config")];
    delete require.cache[require.resolve("../src/services/groqService")];
    delete require.cache[require.resolve("../src/services/reviewService")];
    delete require.cache[require.resolve("../src/controllers/reviewController")];
    delete require.cache[require.resolve("../src/routes/reviews")];
    delete require.cache[require.resolve("../src/app")];
  }
});

test("POST /api/reviews returns 429 with rate-limit message when rate-limited", async () => {
  process.env.GROQ_API_KEY = "gsk_ratelimitkey0000000000000000000000000000000000";
  delete require.cache[require.resolve("../src/config")];
  delete require.cache[require.resolve("../src/services/groqService")];
  delete require.cache[require.resolve("../src/services/reviewService")];
  delete require.cache[require.resolve("../src/controllers/reviewController")];
  delete require.cache[require.resolve("../src/routes/reviews")];
  delete require.cache[require.resolve("../src/app")];

  const freshApp = require("../src/app");
  const freshGroq = require("../src/services/groqService");
  const origComplete = freshGroq.completeJson;
  freshGroq.completeJson = async () => {
    const { classifyGroqError: classify } = require("../src/services/groqService");
    const fakeApiErr = {
      status: 429,
      message: "Rate limit exceeded.",
      error: { error: { type: "requests", code: "rate_limit_exceeded" } }
    };
    const classified = classify(fakeApiErr);
    const err = new Error(classified.message);
    err.status = classified.status;
    err.error = classified.errorCode;
    throw err;
  };

  try {
    const res = await request(freshApp)
      .post("/api/reviews")
      .send({ content: "Test copy for rate limit." });

    assert.equal(res.status, 429, `Expected 429, got ${res.status}: ${JSON.stringify(res.body)}`);
    assert.ok(!JSON.stringify(res.body).match(/sk-/));
    assert.ok(!JSON.stringify(res.body).match(/gsk_/));
  } finally {
    freshGroq.completeJson = origComplete;
    process.env.GROQ_API_KEY = "";
    delete require.cache[require.resolve("../src/config")];
    delete require.cache[require.resolve("../src/services/groqService")];
    delete require.cache[require.resolve("../src/services/reviewService")];
    delete require.cache[require.resolve("../src/controllers/reviewController")];
    delete require.cache[require.resolve("../src/routes/reviews")];
    delete require.cache[require.resolve("../src/app")];
  }
});

test("POST /api/reviews returns 503 with network message when connection fails", async () => {
  process.env.GROQ_API_KEY = "gsk_netfailkey00000000000000000000000000000000000";
  delete require.cache[require.resolve("../src/config")];
  delete require.cache[require.resolve("../src/services/groqService")];
  delete require.cache[require.resolve("../src/services/reviewService")];
  delete require.cache[require.resolve("../src/controllers/reviewController")];
  delete require.cache[require.resolve("../src/routes/reviews")];
  delete require.cache[require.resolve("../src/app")];

  const freshApp = require("../src/app");
  const freshGroq = require("../src/services/groqService");
  const origComplete = freshGroq.completeJson;
  freshGroq.completeJson = async () => {
    const { classifyGroqError: classify } = require("../src/services/groqService");
    const fakeNetErr = new Error("connect ECONNRESET");
    fakeNetErr.code = "ECONNRESET";
    const classified = classify(fakeNetErr);
    const err = new Error(classified.message);
    err.status = classified.status;
    err.error = classified.errorCode;
    throw err;
  };

  try {
    const res = await request(freshApp)
      .post("/api/reviews")
      .send({ content: "Test copy for network error." });

    assert.equal(res.status, 503, `Expected 503, got ${res.status}: ${JSON.stringify(res.body)}`);
    assert.match(res.body.message, /network|connection|reach/i);
    assert.ok(!JSON.stringify(res.body).match(/sk-/));
    assert.ok(!JSON.stringify(res.body).match(/gsk_/));
  } finally {
    freshGroq.completeJson = origComplete;
    process.env.GROQ_API_KEY = "";
    delete require.cache[require.resolve("../src/config")];
    delete require.cache[require.resolve("../src/services/groqService")];
    delete require.cache[require.resolve("../src/services/reviewService")];
    delete require.cache[require.resolve("../src/controllers/reviewController")];
    delete require.cache[require.resolve("../src/routes/reviews")];
    delete require.cache[require.resolve("../src/app")];
  }
});

test("concurrent review requests do not interfere with each other", async () => {
  // Both requests go to the 503 path (no key configured); each must get its own
  // well-formed JSON error response rather than a garbled or shared response.
  process.env.GROQ_API_KEY = "";
  delete require.cache[require.resolve("../src/config")];
  delete require.cache[require.resolve("../src/services/groqService")];
  delete require.cache[require.resolve("../src/services/reviewService")];
  delete require.cache[require.resolve("../src/controllers/reviewController")];
  delete require.cache[require.resolve("../src/routes/reviews")];
  delete require.cache[require.resolve("../src/app")];
  const freshApp = require("../src/app");

  const [r1, r2, r3] = await Promise.all([
    request(freshApp).post("/api/reviews").send({ content: "Copy one." }),
    request(freshApp).post("/api/reviews").send({ content: "Copy two." }),
    request(freshApp).post("/api/reviews").send({ content: "Copy three." })
  ]);

  for (const res of [r1, r2, r3]) {
    assert.equal(res.status, 503);
    assert.ok(typeof res.body.error === "string");
    assert.ok(typeof res.body.message === "string");
    // No key material ever leaks
    assert.ok(!JSON.stringify(res.body).match(/sk-/));
    assert.ok(!JSON.stringify(res.body).match(/gsk_/));
  }
});

test("POST /api/reviews returns mocked findings without calling Groq", async () => {
  process.env.GROQ_API_KEY = "gsk_mockkey00000000000000000000000000000000000000";
  process.env.BRANDGUARD_MOCK_PROVIDER = "1";
  delete require.cache[require.resolve("../src/config")];
  delete require.cache[require.resolve("../src/services/groqService")];
  delete require.cache[require.resolve("../src/services/reviewService")];
  delete require.cache[require.resolve("../src/controllers/reviewController")];
  delete require.cache[require.resolve("../src/routes/reviews")];
  delete require.cache[require.resolve("../src/app")];

  const freshApp = require("../src/app");
  const freshGroq = require("../src/services/groqService");
  const origComplete = freshGroq.completeJson;
  let networkAttempted = false;
  const origGetClient = freshGroq.getClient;
  freshGroq.getClient = () => {
    networkAttempted = true;
    throw new Error("getClient must not run during mocked tests");
  };
  freshGroq.completeJson = async () => ({
    summary: "1 issue found.",
    findings: [{
      id: "tone",
      category: "brand_voice",
      severity: "MEDIUM",
      title: "High-pressure call to action",
      originalText: "Buy now!",
      explanation: "Urgent sales language may conflict with brand voice.",
      evidence: null,
      suggestedCorrection: "Explore the solution",
      claimVerification: { status: "not_a_claim", reason: "Tone issue" }
    }]
  });

  try {
    const res = await request(freshApp)
      .post("/api/reviews")
      .send({ content: "Buy now! Learn more about the product." });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.findings.length, 1);
    assert.equal(res.body.findings[0].originalText, "Buy now!");
    assert.equal(networkAttempted, false);
  } finally {
    freshGroq.completeJson = origComplete;
    freshGroq.getClient = origGetClient;
    process.env.GROQ_API_KEY = "";
    delete require.cache[require.resolve("../src/config")];
    delete require.cache[require.resolve("../src/services/groqService")];
    delete require.cache[require.resolve("../src/services/reviewService")];
    delete require.cache[require.resolve("../src/controllers/reviewController")];
    delete require.cache[require.resolve("../src/routes/reviews")];
    delete require.cache[require.resolve("../src/app")];
  }
});

// ─── Regression tests: correction quality ────────────────────────────────────

test("validateSuggestedCorrection blocks safety-implying correction for HIGH unsupported_claim", () => {
  const result = validateSuggestedCorrection(
    "designed with user safety in mind",
    "unsupported_claim",
    "HIGH"
  );
  assert.ok(
    !/designed\s+with\s+user\s+safety\s+in\s+mind/i.test(result),
    `Must not pass through original bad correction; got: "${result}"`
  );
  assert.ok(result.length > 0, "Must return a non-empty fallback");
});

test("validateSuggestedCorrection does NOT block safety text for MEDIUM brand_voice finding", () => {
  const original = "designed with user safety in mind";
  const result = validateSuggestedCorrection(original, "brand_voice", "MEDIUM");
  assert.equal(
    result,
    original,
    "MEDIUM brand_voice must not be blocked by the sanitiser"
  );
});

test("validateSuggestedCorrection passes through a neutral correction unchanged", () => {
  const neutral = "Add approved safety data or remove this claim before publishing.";
  const result = validateSuggestedCorrection(neutral, "unsupported_claim", "HIGH");
  assert.equal(result, neutral, "Already-neutral correction must not be modified");
});

test("evaluateLocalRules flags 'designed to be safe for most users' as unverified safety claim", () => {
  const copy = "It is designed to be safe for most users.";
  const findings = evaluateLocalRules(copy);
  const safety = findings.find(f => /safe\s+for\s+most\s+users|designed\s+to\s+be\s+safe/i.test(f.originalText));
  assert.ok(safety, "Must detect 'designed to be safe for most users' safety claim");
  assert.equal(safety.severity, "HIGH");
  assert.equal(safety.claimVerification.status, "unverified");
  assert.ok(
    !/\b(?:safe|gentle|risk|tested|formulated)\b/i.test(safety.suggestedCorrection),
    `Correction must not introduce a new safety claim: "${safety.suggestedCorrection}"`
  );
  assert.ok(safety.suggestedCorrection.length > 0, "suggestedCorrection must be non-empty");
});

test("normalizeFinding sanitises safety-implying suggestedCorrection for HIGH unsupported_claim", () => {
  const f = normalizeFinding(
    {
      id: "safety-test",
      category: "unsupported_claim",
      severity: "HIGH",
      title: "Safety claim",
      originalText: "safe for most users",
      explanation: "Unverified safety claim",
      suggestedCorrection: "designed with user safety in mind",
      claimVerification: { status: "unverified", reason: "No approved source." }
    },
    0
  );
  assert.ok(
    !/designed\s+with\s+user\s+safety\s+in\s+mind/i.test(f.suggestedCorrection),
    "Must not output the original bad correction"
  );
  assert.ok(
    !/\b(?:safe|gentle|risk[-\s]minimi|tested)\b/i.test(f.suggestedCorrection),
    `Correction must not introduce a new safety claim: "${f.suggestedCorrection}"`
  );
  assert.ok(f.suggestedCorrection.length > 0, "suggestedCorrection must be non-empty");
});

test("normalizeFinding sanitises clinically-implying correction for medical efficacy finding", () => {
  const f = normalizeFinding(
    {
      id: "med-test",
      category: "unsupported_claim",
      severity: "HIGH",
      title: "Medical efficacy claim",
      originalText: "clinically proven to heal skin",
      explanation: "Requires clinical evidence",
      suggestedCorrection: "clinically formulated to support skin health",
      claimVerification: { status: "unverified", reason: "No approved source." }
    },
    0
  );
  assert.ok(
    !/clinically\s+formulated|science[-\s]backed/i.test(f.suggestedCorrection),
    `Correction must not substitute a new clinical claim: "${f.suggestedCorrection}"`
  );
});

test("evaluateLocalRules 100% efficacy rule has correction that does not introduce new performance claim", () => {
  const copy = "removes 100% of acne";
  const findings = evaluateLocalRules(copy);
  const f = findings.find(fi => /100%/i.test(fi.originalText));
  assert.ok(f, "Must detect 100% claim");
  assert.ok(
    !/\b(?:100%|removes|eliminates|cures|proven)\b/i.test(f.suggestedCorrection),
    `Correction must not introduce a new performance claim: "${f.suggestedCorrection}"`
  );
});

test("normalizeFinding rejects 'formulated to be gentle' as a new safety claim", () => {
  const f = normalizeFinding(
    {
      id: "gentle-test",
      category: "unsupported_claim",
      severity: "HIGH",
      title: "Safety claim",
      originalText: "zero side effects",
      explanation: "Absolute safety claim",
      suggestedCorrection: "formulated to be gentle on skin",
      claimVerification: { status: "unverified", reason: "No approved source." }
    },
    0
  );
  assert.ok(
    !/formulated\s+to\s+be\s+gentle/i.test(f.suggestedCorrection),
    `Must reject 'formulated to be gentle' — got: "${f.suggestedCorrection}"`
  );
  assert.ok(f.suggestedCorrection.length > 0, "suggestedCorrection must be non-empty");
});
