// Configuration from environment variables, with defaults.
// Read when called (not at require time) so tests can set env vars first.

function loadConfig(env = process.env) {
  return {
    port: Number(env.PORT) || 3000,
    dbPath: env.DB_PATH || './data/bookstore.db',
  };
}

module.exports = { loadConfig };
