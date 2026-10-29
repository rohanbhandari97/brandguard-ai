const express = require("express");
const { createCorrection } = require("../controllers/correctionController");
const {
  requireContent,
  optionalGuidelines,
  optionalCampaignFields,
  optionalFlaggedText
} = require("../middleware/validate");

const router = express.Router();

router.post("/", requireContent, optionalGuidelines, optionalCampaignFields, optionalFlaggedText, createCorrection);

module.exports = router;
