// Tests import modules that validate env at import time. Load the real .env when
// it exists so the suite runs the same code the server does.
try {
  process.loadEnvFile("../.env");
} catch {
  // No .env (CI, fresh clone). Fill in placeholders so imports resolve; any test
  // that needs a live service is responsible for skipping itself.
  process.env.MONGODB_URI ??= "mongodb://placeholder.invalid:27017/efinance";
  process.env.AUTH_SECRET ??= "test-secret-not-used-for-anything-real-0000";
  process.env.OPENROUTER_API_KEY ??= "placeholder";
  process.env.OPENROUTER_MODEL ??= "placeholder/model";
}
