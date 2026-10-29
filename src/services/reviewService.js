const groqService = require("./groqService");
const { config } = require("../config");

const REVIEW_SYSTEM = `You are BrandGuard, a brand-content reviewer for marketing copy.
Return JSON only, matching this shape:
{
  "summary": "short human-readable summary",
  "findings": [
    {
      "id": "stable-slug",
      "category": "brand_voice | unsupported_claim | accessibility | visual_compliance | other",
      "severity": "HIGH | MEDIUM | LOW",
      "title": "short title",
      "originalText": "exact excerpt copied from the submitted content",
      "explanation": "why this is an issue",
      "evidence": "quote from the provided brand guidelines, or null",
      "suggestedCorrection": "replacement phrasing that keeps the intended meaning",
      "claimVerification": {
        "status": "unverified | not_a_claim",
        "reason": "why the claim is unverified, or why it is not a factual claim"
      }
    }
  ]
}

Core Rules:
1. Return MULTIPLE DISTINCT findings when several risky, absolute, or unverified claims appear in the copy. Do NOT combine multiple distinct claims into a single finding, and do NOT stop after flagging only one issue. Inspect every sentence thoroughly and create a separate finding object for each distinct risky claim or issue found.
2. Specifically evaluate and flag claims across these critical risk categories:
   - 100% results / absolute performance / cure claims (e.g. "removes 100% of acne", "100% results", "completely eliminates").
   - Medical or clinical efficacy claims and professional endorsements (e.g. "revolutionary skincare cream", "dermatologists guarantee", clinical cure claims).
   - Precise timelines or unrealistic turnaround promises (e.g. "in just 24 hours", "overnight", "instant").
   - Universal guarantees and suitability claims (e.g. "guarantee", "for every skin type", "works for everyone").
   - Permanent results claims (e.g. "permanent results", "permanently removes").
   - Zero side effects and absolute safety claims (e.g. "zero side effects", "100% safe", "no adverse reactions").
   - Unverified market-ranking claims (e.g. "No. 1 solution", "best in India").
   - High-pressure sales calls to action (e.g. "Buy now!", "Hurry, act now!").
3. Verification status & truthfulness:
   - Do NOT automatically call a claim false merely because evidence or documentation is missing. Mark it as "unverified".
   - State in claimVerification.reason and explanation that the claim lacks approved substantiation or clinical validation, and requires evidence before publication.
   - Use "not_a_claim" only for style, tone, or formatting issues that do not make factual assertions.
   - Never set claimVerification.status to "verified".
4. originalText:
   - Must be the exact verbatim excerpt copied directly from the submitted content for that specific claim. Do not invent or summarize excerpts.
5. Severity:
   - Assign HIGH to absolute efficacy promises (100% results), medical/dermatological efficacy claims, zero side effects claims, permanent outcome claims, universal guarantees, and unsupported ranking claims.
   - Assign MEDIUM to urgent tone or high-pressure calls to action.
   - Assign LOW to minor phrasing or style improvements.
6. suggestedCorrection — strict rules that apply to every finding:
   a. NEVER introduce a new unverified claim in the correction. Do not swap one unsupported assertion for another implied one.
   b. Safety claims (e.g., "safe for most users", "zero side effects", "no adverse reactions"):
      - Do NOT suggest wording that implies the product is safe, tested, risk-minimised, gentle, or designed with safety in mind unless the brand guidelines confirm that approved evidence exists.
      - BAD: "designed with user safety in mind" — still implies verified safe design.
      - BAD: "formulated to be gentle on skin" — implies verified gentleness.
      - BAD: "dermatologist-tested" — implies clinical testing was performed.
      - GOOD: "Consult a healthcare professional before use to confirm suitability for you."
      - GOOD: "Review the ingredient list to check compatibility with your needs."
      - GOOD: "Add approved safety data or remove this claim before publishing."
   c. Medical / clinical efficacy claims (e.g., "clinically proven", "revolutionary", professional endorsements):
      - Do not replace with other efficacy language ("science-backed", "clinically formulated").
      - Describe the product category and its function without asserting medical outcomes.
      - Recommend professional consultation or adding clinical evidence.
   d. Performance / results claims (e.g., "100% results", "removes acne"):
      - Replace absolute language with observable product properties (ingredients, texture, application method) rather than outcome promises.
      - If no safe alternative exists, recommend adding substantiation: "Add approved clinical data or remove this claim."
   e. Environmental / sustainability claims:
      - Do not replace with other environmental assertions unless a specific certification is cited in the brand guidelines.
   f. Universal / permanent claims (e.g., "for every skin type", "permanent results"):
      - Replace with appropriately qualified scope: "for many skin types" only if the guidelines confirm broad suitability; otherwise recommend adding evidence.
   g. The correction must preserve the general communicative purpose (the product category, intended use, or audience) without asserting new unverified properties.
7. Low-risk copy:
   - If the content is ordinary, low-risk marketing copy that contains no unsubstantiated claims, absolute promises, or guideline violations, return an empty findings array ([]) and a summary confirming no issues were found.`;

const CORRECTION_SYSTEM = `You are BrandGuard, rewriting marketing copy so it better matches brand guidelines.
Return JSON only:
{
  "rewrittenText": "full rewritten draft",
  "explanation": "what changed and why",
  "preservedMeaning": true
}

Rules:
- Preserve the original meaning and intended message.
- Do not add new facts, rankings, guarantees, statistics, or citations.
- Soften unsupported claims into non-absolute, evidence-neutral language.
- Match a helpful, confident, customer-first voice.
- If flaggedText is provided, prioritize fixing that passage while keeping the rest coherent.
- rewrittenText must be the complete draft, not only a fragment.

Critical constraint — do NOT introduce new unsupported claims in rewrites:
- Safety claims ("safe for most users", "zero side effects"): Do NOT replace with other safety-implying language such as "designed with user safety in mind", "formulated to be gentle", or "minimises risk". These substitute one unverified safety assertion for another. Instead, describe the product's function or ingredients without asserting safety outcomes, or recommend that the user add approved safety data before publishing.
- Medical / clinical claims ("clinically proven", "dermatologists guarantee"): Do NOT replace with "science-backed", "clinically formulated", or any other efficacy language. Describe the product category and its function, and recommend professional consultation or adding approved evidence.
- Performance claims ("100% results"): Replace with observable product properties (ingredients, texture, application method) rather than promised outcomes. If no evidence-neutral rewrite exists, use: "[Add approved data here] before publishing this claim."
- Environmental claims: Do NOT introduce environmental assertions unless a specific approved certification is mentioned in the brand guidelines.`;

/**
 * Sanitise a model-generated suggestedCorrection to ensure it does not
 * introduce a new unverified safety, medical, performance, or environmental
 * claim in place of the original flagged claim.
 *
 * If the correction contains a known implied-claim pattern for a HIGH-severity
 * unsupported_claim finding, replace it with a neutral prompt-to-substantiate message.
 */
const IMPLIED_SAFETY_CLAIM_RE =
  /\b(?:safe\s+for|designed\s+with[\w\s]+safety|designed\s+to\s+be\s+safe|formulated\s+to\s+be\s+gentle|gentle\s+(?:on|formula|formulation)|minimize[sd]?\s+risk|risk[-\s]minimis|certified\s+safe|clinically\s+formulated|science[-\s]backed|dermatologist[-\s]tested|hypoallergenic(?:\s+formula)?|no\s+(?:harsh|harmful)\s+chemicals|proven\s+safe)\b/i;

function validateSuggestedCorrection(correction, category, severity) {
  // Only guard HIGH-severity unsupported claims — these are the ones where the
  // model is most likely to swap one unverified assertion for another.
  if (severity !== "HIGH" || category !== "unsupported_claim") return correction;

  if (IMPLIED_SAFETY_CLAIM_RE.test(correction)) {
    return "Add approved safety or clinical data, or remove this claim before publishing.";
  }
  return correction;
}

function normalizeFinding(finding, index) {
  const categoryMap = {
    brand_voice: "Voice & tone",
    unsupported_claim: "Unsupported claim",
    accessibility: "Accessibility",
    visual_compliance: "Visual compliance (text-only)",
    other: "Other"
  };
  const categoryKey = String(finding.category || "other").toLowerCase();
  const severity = ["HIGH", "MEDIUM", "LOW"].includes(String(finding.severity).toUpperCase())
    ? String(finding.severity).toUpperCase()
    : "MEDIUM";
  const verification = finding.claimVerification || {};
  const verificationStatus = verification.status === "not_a_claim" ? "not_a_claim" : "unverified";

  // Task 5: Do not automatically call a claim false merely because evidence is missing. Mark it unverified when appropriate.
  let reason = String(verification.reason || "").trim();
  if (!reason) {
    reason = verificationStatus === "unverified"
      ? "This claim was not checked against an approved source."
      : "This item is a style or policy issue, not a factual claim.";
  } else if (verificationStatus === "unverified" && /\bclaim is false\b/i.test(reason) && !/\bproven false\b/i.test(reason)) {
    reason = reason.replace(/\bclaim is false\b/gi, "claim is unverified");
  }

  let explanation = String(finding.explanation || "").trim();
  if (verificationStatus === "unverified" && /\bthis claim is false\b/i.test(explanation)) {
    explanation = explanation.replace(/\bthis claim is false\b/gi, "this claim is unverified without approved clinical evidence");
  }

  return {
    id: String(finding.id || `finding-${index + 1}`),
    category: categoryMap[categoryKey] || categoryMap.other,
    categoryKey: categoryMap[categoryKey] ? categoryKey : "other",
    severity,
    title: String(finding.title || "Brand review finding"),
    originalText: String(finding.originalText || "").trim(),
    explanation,
    evidence: finding.evidence ? String(finding.evidence).trim() : null,
    suggestedCorrection: validateSuggestedCorrection(
      String(finding.suggestedCorrection || finding.suggestion || "").trim(),
      categoryMap[categoryKey] ? categoryKey : "other",
      severity
    ),
    claimVerification: {
      status: verificationStatus,
      reason
    }
  };
}

function evaluateLocalRules(text) {
  if (!text || typeof text !== "string") return [];
  const rules = [
    {
      id: "claim-100-percent",
      severity: "HIGH",
      category: "unsupported_claim",
      title: "Absolute efficacy claim",
      regex: /removes?\s+100%(?:\s+of\s+[\w]+)?|100%\s*(?:results|acne|cure|effective|elimination)/i,
      match: /removes?\s+100%(?:\s+of\s+[\w]+)?|100%\s*(?:results|acne|cure|effective|elimination)/i,
      suggestedCorrection: "helps visibly reduce acne",
      explanation: "Absolute promises of 100% elimination or results are unverified without approved clinical trial data.",
      evidence: "Avoid claims of 100% cure, complete eradication, or total elimination.",
      claimVerification: {
        status: "unverified",
        reason: "This claim was not checked against an approved source."
      }
    },
    {
      id: "claim-medical-efficacy",
      severity: "HIGH",
      category: "unsupported_claim",
      title: "Medical or clinical efficacy claim",
      regex: /revolutionary\s+skincare\s+cream|dermatologists?(?:\s+guarantee)?|clinically\s+proven|doctor\s+recommended/i,
      match: /revolutionary\s+skincare\s+cream|dermatologists?(?:\s+guarantee)?|clinically\s+proven|doctor\s+recommended/i,
      suggestedCorrection: "Add approved clinical or professional endorsement data, or remove this claim before publishing.",
      explanation: "Statements asserting revolutionary medical efficacy or professional endorsements require approved clinical validation. Do not replace with other efficacy language such as 'science-backed' or 'clinically formulated'; without evidence, remove or substantiate the claim.",
      evidence: "Do not assert revolutionary medical results, cure capabilities, or professional medical endorsements without approved clinical evidence.",
      claimVerification: {
        status: "unverified",
        reason: "This claim was not checked against an approved source."
      }
    },
    {
      id: "claim-timeline",
      severity: "HIGH",
      category: "unsupported_claim",
      title: "Precise timeline promise",
      regex: /(?:in\s+)?just\s+\d+\s*(?:hours?|days?|minutes?)|within\s+\d+\s*(?:hours?|days?)/i,
      match: /(?:in\s+)?just\s+\d+\s*(?:hours?|days?|minutes?)|within\s+\d+\s*(?:hours?|days?)/i,
      suggestedCorrection: "with regular daily use",
      explanation: "Definitive short-term speed or turnaround timelines (such as 24 hours) require documented clinical validation for typical consumers.",
      evidence: "Do not promise precise, rapid turnaround timelines unless clinically substantiated.",
      claimVerification: {
        status: "unverified",
        reason: "This claim was not checked against an approved source."
      }
    },
    {
      id: "claim-guarantee",
      severity: "HIGH",
      category: "unsupported_claim",
      title: "Universal guarantee",
      regex: /guarantee(?:s|d)?/i,
      match: /guarantee(?:s|d)?/i,
      suggestedCorrection: "helps achieve visible results",
      explanation: "Universal performance guarantees can mislead customers unless supported by approved documentation; mark unverified without proof.",
      evidence: "Avoid universal guarantees and promises of permanent results.",
      claimVerification: {
        status: "unverified",
        reason: "This claim was not checked against an approved source."
      }
    },
    {
      id: "claim-permanent-results",
      severity: "HIGH",
      category: "unsupported_claim",
      title: "Permanent results claim",
      regex: /permanent\s+results|permanently\s+removes?|permanent\s+cure/i,
      match: /permanent\s+results|permanently\s+removes?|permanent\s+cure/i,
      suggestedCorrection: "long-lasting visible results",
      explanation: "Promising permanent outcomes implies irreversible medical results that require longitudinal clinical substantiation.",
      evidence: "Avoid universal guarantees and promises of permanent results.",
      claimVerification: {
        status: "unverified",
        reason: "This claim was not checked against an approved source."
      }
    },
    {
      id: "claim-universal-suitability",
      severity: "HIGH",
      category: "unsupported_claim",
      title: "Universal suitability claim",
      regex: /for\s+every\s+skin\s+type|suitable\s+for\s+all(?:\s+skin\s+types)?|works\s+for\s+everyone/i,
      match: /for\s+every\s+skin\s+type|suitable\s+for\s+all(?:\s+skin\s+types)?|works\s+for\s+everyone/i,
      suggestedCorrection: "for many skin types",
      explanation: "Asserting universal compatibility across every skin type requires broad testing and should be stated carefully.",
      evidence: "Avoid universal guarantees across all users or skin types.",
      claimVerification: {
        status: "unverified",
        reason: "This claim was not checked against an approved source."
      }
    },
    {
      id: "claim-safe-for-users",
      severity: "HIGH",
      category: "unsupported_claim",
      title: "Unverified safety claim",
      regex: /safe\s+for\s+(?:most|all|every|any)\s+(?:users?|people|adults?|children|skin\s+types?)|designed\s+to\s+be\s+safe|proven\s+safe/i,
      match: /safe\s+for\s+(?:most|all|every|any)\s+(?:users?|people|adults?|children|skin\s+types?)|designed\s+to\s+be\s+safe|proven\s+safe/i,
      suggestedCorrection: "Consult a healthcare professional before use to confirm suitability for you.",
      explanation: "Asserting that a product is safe for a broad user group requires approved clinical safety documentation. Do not replace this with other safety-implying language (e.g. 'designed with user safety in mind', 'gentle formula'). Remove or add substantiation.",
      evidence: "Do not claim safety or suitability for broad user groups without certified documentation.",
      claimVerification: {
        status: "unverified",
        reason: "This claim was not checked against an approved source."
      }
    },
    {
      id: "claim-zero-side-effects",
      severity: "HIGH",
      category: "unsupported_claim",
      title: "Zero side effects claim",
      regex: /zero\s+side\s+effects|no\s+side\s+effects|100%\s+safe/i,
      match: /zero\s+side\s+effects|no\s+side\s+effects|100%\s+safe/i,
      suggestedCorrection: "Consult a healthcare professional before use to confirm suitability for you.",
      explanation: "Absolute safety claims stating zero adverse effects are unverified without certified clinical safety documentation. Do not replace with other safety-implying language.",
      evidence: "Do not claim “zero side effects” or absolute safety without certified clinical trial safety documentation.",
      claimVerification: {
        status: "unverified",
        reason: "This claim was not checked against an approved source."
      }
    },
    {
      id: "claim-ranking",
      severity: "HIGH",
      category: "unsupported_claim",
      title: "Unverified ranking claim",
      regex: /No\.\s*1|number\s*one|best solution/i,
      match: /No\.\s*1\s*solution(?:\s+in\s+India)?|No\.\s*1|number\s*one|best solution/i,
      suggestedCorrection: "a solution designed for your team",
      explanation: "A market-leading or number-one claim should be backed by reliable, approved evidence.",
      evidence: "Avoid “No. 1 solution” and “100% results”. Use specific, substantiated benefits.",
      claimVerification: {
        status: "unverified",
        reason: "This claim was not checked against an approved source."
      }
    },
    {
      id: "tone",
      severity: "MEDIUM",
      category: "brand_voice",
      title: "High-pressure call to action",
      regex: /Buy now!?|Click here immediately|Hurry(?:\s+up)?!?|act now/i,
      match: /Buy now!?|Click here immediately|Hurry(?:\s+up)?!?|act now/i,
      suggestedCorrection: "Explore the solution",
      explanation: "Urgent sales language may conflict with a helpful, customer-first brand voice.",
      evidence: "Avoid high-pressure language such as “Buy now!” or “Hurry, act now!”.",
      claimVerification: {
        status: "not_a_claim",
        reason: "This item is a style or policy issue, not a factual claim."
      }
    }
  ];

  return rules
    .filter(r => r.regex.test(text))
    .map((r, index) => {
      const match = text.match(r.match);
      return normalizeFinding({
        ...r,
        id: r.id || `finding-${index + 1}`,
        originalText: match ? match[0] : ""
      }, index);
    });
}

async function reviewContent({ content, brandGuidelines, campaignName, channel }) {
  const payload = await groqService.completeJson({
    system: REVIEW_SYSTEM,
    user: JSON.stringify({
      campaignName: campaignName || null,
      channel: channel || null,
      brandGuidelines: brandGuidelines || config.defaultBrandGuidelines,
      content,
      capabilities: {
        imageAnalysis: false,
        sourceBackedFactVerification: false,
        authentication: false,
        databasePersistence: false
      }
    })
  });

  const findings = Array.isArray(payload.findings) ? payload.findings.map(normalizeFinding) : [];
  return {
    summary: String(payload.summary || (findings.length ? `${findings.length} issue(s) found.` : "No issues found.")),
    findings,
    capabilities: {
      imageAnalysis: false,
      sourceBackedFactVerification: false,
      authentication: false,
      databasePersistence: false
    }
  };
}

async function suggestCorrection({ content, brandGuidelines, flaggedText, campaignName, channel }) {
  const payload = await groqService.completeJson({
    system: CORRECTION_SYSTEM,
    temperature: 0.3,
    user: JSON.stringify({
      campaignName: campaignName || null,
      channel: channel || null,
      brandGuidelines: brandGuidelines || config.defaultBrandGuidelines,
      flaggedText: flaggedText || null,
      content
    })
  });

  const rewrittenText = String(payload.rewrittenText || "").trim();
  if (!rewrittenText) {
    const error = new Error("The correction service did not return rewritten text.");
    error.status = 502;
    error.error = "Upstream error";
    throw error;
  }

  return {
    rewrittenText,
    explanation: String(payload.explanation || "Rewrote the draft to better match the brand guidelines while keeping the intended message.").trim(),
    preservedMeaning: true,
    capabilities: {
      imageAnalysis: false,
      sourceBackedFactVerification: false
    }
  };
}

module.exports = { reviewContent, suggestCorrection, normalizeFinding, evaluateLocalRules, validateSuggestedCorrection };
