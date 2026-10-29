function notFoundHandler(req, res) {
  res.status(404).json({
    error: "Not found",
    message: `No route matches ${req.method} ${req.path}.`
  });
}

function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  if (err.type === "entity.too.large") {
    return res.status(413).json({
      error: "Payload too large",
      message: "The request body exceeds the allowed size."
    });
  }

  if (err.status === 400 || err.name === "ValidationError") {
    return res.status(400).json({
      error: "Invalid request",
      message: err.message || "The request could not be processed."
    });
  }

  const status = Number.isInteger(err.status) ? err.status : 500;

  // Expose accurate messages for all client-actionable and provider errors.
  // 401 = bad key, 402 = quota, 429 = rate limit, 4xx = client error,
  // 502 = provider bad response, 503 = unavailable / network, 504 = timeout.
  const expose = status < 500 || status === 502 || status === 503 || status === 504;

  // Log the real error message on the server so operators can see it.
  // Redact any accidental key leakage before logging.
  const safeMsg = err.message
    ? String(err.message).replace(/gsk_[A-Za-z0-9_-]+/gi, "[REDACTED]").replace(/sk-[A-Za-z0-9_-]+/g, "[REDACTED]")
    : "(no message)";
  console.error("BrandGuard error:", safeMsg);

  res.status(status).json({
    error: expose ? err.error || "Request failed" : "Server error",
    message: expose ? err.message : "Something went wrong. Try again in a moment."
  });
}

module.exports = { notFoundHandler, errorHandler };
