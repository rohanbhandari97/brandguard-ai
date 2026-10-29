require("dotenv").config();

const { config, isGroqConfigured } = require("./src/config");
const app = require("./src/app");

app.listen(config.port, () => {
  console.log(`BrandGuard AI listening on http://localhost:${config.port}`);
  if (!isGroqConfigured()) {
    console.warn("GROQ_API_KEY is not set. /api/health will work; review endpoints will return 503.");
  }
});
