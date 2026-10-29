const express = require("express");
const { createReview } = require("../controllers/reviewController");
const { requireContent, optionalGuidelines, optionalCampaignFields } = require("../middleware/validate");

const router = express.Router();

router.post("/", requireContent, optionalGuidelines, optionalCampaignFields, createReview);

module.exports = router;
