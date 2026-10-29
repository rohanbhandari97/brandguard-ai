const fs = require("fs");
const path = require("path");

function inspect(filePath) {
  const exists = fs.existsSync(filePath);
  if (!exists) {
    return { path: filePath, exists: false };
  }
  const names = [];
  const flags = {};
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const name = trimmed.split("=")[0].trim();
    const value = trimmed.slice(trimmed.indexOf("=") + 1).trim().replace(/^['"]|['"]$/g, "");
    names.push(name);
    if (name === "GROQ_API_KEY") {
      flags.groqKeyPresent = Boolean(value);
      flags.groqKeyIsPlaceholder = value === "gsk_your-groq-api-key-here";
    }
    if (name === "GROQ_MODEL") {
      flags.groqModelPresent = Boolean(value);
    }
    if (name === "PORT") flags.portPresent = Boolean(value);
    if (name === "FRONTEND_ORIGIN") flags.frontendOriginPresent = Boolean(value);
    if (name === "NODE_ENV") flags.nodeEnvPresent = Boolean(value);
  }
  return { path: filePath, exists: true, variableNames: names, flags };
}

const results = [
  inspect(path.resolve(__dirname, "..", ".env")),
  inspect(path.resolve(__dirname, "..", "..", ".env"))
];
console.log(JSON.stringify(results, null, 2));
