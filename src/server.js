// Entry point for "npm start": creates the app and starts listening.
const { createApp } = require('./app');
const { loadConfig } = require('./config');

const { port, dbPath } = loadConfig();
const app = createApp();

const server = app.listen(port, () => {
  console.log(`Bookstore running at http://localhost:${port} (database: ${dbPath})`);
});

// Close the HTTP server and the database cleanly on Ctrl+C or a stop signal.
function shutdown() {
  server.close(() => {
    app.locals.store.close();
    process.exit(0);
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
