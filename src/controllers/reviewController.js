const { reviewContent } = require("../services/reviewService");

async function createReview(req, res, next) {
  try {
    const result = await reviewContent({
      content: req.body.content,
      brandGuidelines: req.body.brandGuidelines,
      campaignName: req.body.campaignName,
      channel: req.body.channel
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = { createReview };
