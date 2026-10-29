const { suggestCorrection } = require("../services/reviewService");

async function createCorrection(req, res, next) {
  try {
    const result = await suggestCorrection({
      content: req.body.content,
      brandGuidelines: req.body.brandGuidelines,
      flaggedText: req.body.flaggedText,
      campaignName: req.body.campaignName,
      channel: req.body.channel
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = { createCorrection };
