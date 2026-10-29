const { config } = require("../config");

function asTrimmedString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function requireContent(req, res, next) {
  const content = asTrimmedString(req.body && req.body.content);
  if (!content) {
    return res.status(400).json({
      error: "Invalid request",
      message: "content is required and must be a non-empty string."
    });
  }
  if (content.length > config.limits.contentMaxChars) {
    return res.status(400).json({
      error: "Invalid request",
      message: `content must be ${config.limits.contentMaxChars} characters or fewer.`
    });
  }
  req.body.content = content;
  next();
}

function optionalGuidelines(req, res, next) {
  const raw = req.body && req.body.brandGuidelines;
  if (raw == null || raw === "") {
    req.body.brandGuidelines = config.defaultBrandGuidelines;
    return next();
  }
  if (typeof raw !== "string") {
    return res.status(400).json({
      error: "Invalid request",
      message: "brandGuidelines must be a string when provided."
    });
  }
  const guidelines = raw.trim();
  if (guidelines.length > config.limits.guidelinesMaxChars) {
    return res.status(400).json({
      error: "Invalid request",
      message: `brandGuidelines must be ${config.limits.guidelinesMaxChars} characters or fewer.`
    });
  }
  req.body.brandGuidelines = guidelines || config.defaultBrandGuidelines;
  next();
}

function optionalCampaignFields(req, res, next) {
  const campaignName = asTrimmedString(req.body && req.body.campaignName);
  const channel = asTrimmedString(req.body && req.body.channel);
  if (campaignName.length > 200 || channel.length > 200) {
    return res.status(400).json({
      error: "Invalid request",
      message: "campaignName and channel must be 200 characters or fewer."
    });
  }
  req.body.campaignName = campaignName;
  req.body.channel = channel;
  next();
}

function optionalFlaggedText(req, res, next) {
  const flaggedText = asTrimmedString(req.body && req.body.flaggedText);
  if (flaggedText.length > config.limits.flaggedTextMaxChars) {
    return res.status(400).json({
      error: "Invalid request",
      message: `flaggedText must be ${config.limits.flaggedTextMaxChars} characters or fewer.`
    });
  }
  req.body.flaggedText = flaggedText;
  next();
}

module.exports = {
  requireContent,
  optionalGuidelines,
  optionalCampaignFields,
  optionalFlaggedText
};
