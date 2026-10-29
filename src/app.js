const path = require("path");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { config } = require("./config");
const healthRouter = require("./routes/health");
const reviewsRouter = require("./routes/reviews");
const correctionsRouter = require("./routes/corrections");
const { notFoundHandler, errorHandler } = require("./middleware/errorHandler");

const app = express();
const rootDir = path.join(__dirname, "..");

app.set("trust proxy", 1);

app.use(helmet({
  contentSecurityPolicy: false
}));

app.use(cors({
  origin: config.frontendOrigins,
  optionsSuccessStatus: 200
}));

app.use(express.json({ limit: config.limits.jsonBytes }));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many requests",
    message: "Too many API requests from this address. Please wait and try again."
  }
});

const reviewLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many requests",
    message: "Too many review requests from this address. Please wait and try again."
  }
});

app.use("/api/health", healthRouter);
app.use("/api", apiLimiter);
app.use("/api/reviews", reviewLimiter, reviewsRouter);
app.use("/api/corrections", reviewLimiter, correctionsRouter);

app.use((req, res, next) => {
  const blocked = /^\/(\.env|src|node_modules|tests|server\.js|package(-lock)?\.json)(\/|$)/i;
  if (blocked.test(req.path)) {
    return res.status(404).json({ error: "Not found", message: "No route matches this path." });
  }
  next();
});

app.use(express.static(rootDir, {
  index: "index.html",
  extensions: ["html"],
  dotfiles: "deny"
}));

app.use("/api", notFoundHandler);
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
