const path = require('node:path');
const express = require('express');
const { createStore } = require('./store');

function createApp({ store = createStore() } = {}) {
  const app = express();
  app.locals.store = store; // lets server.js and tests close the database
  app.use(express.json());

  // Frontend: public/index.html is served at "/", plus styles.css and app.js.
  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.get('/health', (req, res) => {
    res.json({ status: 'ok', uptime: Math.round(process.uptime()) });
  });

  app.get('/books', (req, res) => {
    res.json(store.listBooks());
  });

  app.get('/books/:id', (req, res) => {
    const book = store.findBook(Number(req.params.id));
    if (!book) return res.status(404).json({ error: `Book ${req.params.id} not found` });
    res.json(book);
  });

  app.get('/orders', (req, res) => {
    res.json(store.listOrders());
  });

  app.get('/orders/:id', (req, res) => {
    const order = store.findOrder(Number(req.params.id));
    if (!order) return res.status(404).json({ error: `Order ${req.params.id} not found` });
    res.json(order);
  });

  app.post('/orders', (req, res) => {
    const { bookId, quantity } = req.body || {};

    if (!Number.isInteger(bookId) || bookId < 1) {
      return res.status(400).json({ error: 'bookId must be a positive integer' });
    }
    if (!Number.isInteger(quantity) || quantity < 1) {
      return res.status(400).json({ error: 'quantity must be a positive integer' });
    }

    const book = store.findBook(bookId);
    if (!book) {
      return res.status(404).json({ error: `Book ${bookId} not found` });
    }
    if (book.stock < quantity) {
      return res.status(409).json({
        error: `Not enough stock for "${book.title}": requested ${quantity}, available ${book.stock}`,
      });
    }

    res.status(201).json(store.createOrder(book, quantity));
  });

  // Unknown API routes get JSON, not Express's default HTML page.
  app.use((req, res) => {
    res.status(404).json({ error: `Route ${req.method} ${req.path} not found` });
  });

  // Malformed JSON bodies and any unexpected error.
  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'Request body must be valid JSON' });
    }
    // Errors the store raises on purpose, e.g. 409 if stock ran out mid-transaction.
    if (err.status >= 400 && err.status < 500) {
      return res.status(err.status).json({ error: err.message });
    }
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

module.exports = { createApp };
