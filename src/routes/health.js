const express = require("express");
const { config, isGroqConfigured } = require("../config");

const router = express.Router();

router.get("/", (req, res) => {
  res.json({
    status: "ok",
    service: "brandguard-ai",
    provider: "groq",
    groqConfigured: isGroqConfigured(),
    model: config.groqModel,
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
