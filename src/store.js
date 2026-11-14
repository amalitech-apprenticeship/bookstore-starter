// SQLite data store. This is the only module that touches the database.
// Route handlers use: listBooks, findBook, createOrder, listOrders, findOrder.

const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const { loadConfig } = require('./config');

const SEED_BOOKS = [
  { id: 1, title: 'The Pragmatic Programmer', author: 'Andrew Hunt & David Thomas', price: 42.5, stock: 5 },
  { id: 2, title: 'Clean Code', author: 'Robert C. Martin', price: 37.99, stock: 3 },
  { id: 3, title: 'Eloquent JavaScript', author: 'Marijn Haverbeke', price: 29.0, stock: 8 },
  { id: 4, title: 'Designing Data-Intensive Applications', author: 'Martin Kleppmann', price: 54.0, stock: 2 },
  { id: 5, title: 'Things Fall Apart', author: 'Chinua Achebe', price: 14.25, stock: 0 },
];

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS books (
    id     INTEGER PRIMARY KEY,
    title  TEXT    NOT NULL,
    author TEXT    NOT NULL,
    price  REAL    NOT NULL CHECK (price >= 0),
    stock  INTEGER NOT NULL CHECK (stock >= 0)
  );

  CREATE TABLE IF NOT EXISTS orders (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id    INTEGER NOT NULL REFERENCES books (id),
    title      TEXT    NOT NULL,
    quantity   INTEGER NOT NULL CHECK (quantity > 0),
    unit_price REAL    NOT NULL,
    total      REAL    NOT NULL,
    created_at TEXT    NOT NULL
  );
`;

function openDatabase(dbPath) {
  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true });
  }
  const db = new Database(dbPath);
  db.pragma('foreign_keys = ON');
  if (dbPath !== ':memory:') db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);
  return db;
}

function seedIfEmpty(db) {
  const { count } = db.prepare('SELECT COUNT(*) AS count FROM books').get();
  if (count > 0) return;
  const insert = db.prepare(
    'INSERT INTO books (id, title, author, price, stock) VALUES (@id, @title, @author, @price, @stock)'
  );
  db.transaction(() => SEED_BOOKS.forEach((book) => insert.run(book)))();
}

// Map an orders row (snake_case) to the API shape (camelCase).
function toOrder(row) {
  return row && {
    id: row.id,
    bookId: row.book_id,
    title: row.title,
    quantity: row.quantity,
    unitPrice: row.unit_price,
    total: row.total,
    createdAt: row.created_at,
  };
}

function isId(value) {
  return Number.isInteger(value) && value > 0;
}

function createStore({ dbPath = loadConfig().dbPath } = {}) {
  const db = openDatabase(dbPath);
  seedIfEmpty(db);

  const stmt = {
    listBooks: db.prepare('SELECT id, title, author, price, stock FROM books ORDER BY id'),
    findBook: db.prepare('SELECT id, title, author, price, stock FROM books WHERE id = ?'),
    decrementStock: db.prepare('UPDATE books SET stock = stock - ? WHERE id = ? AND stock >= ?'),
    insertOrder: db.prepare(`
      INSERT INTO orders (book_id, title, quantity, unit_price, total, created_at)
      VALUES (@bookId, @title, @quantity, @unitPrice, @total, @createdAt)
    `),
    listOrders: db.prepare('SELECT * FROM orders ORDER BY id'),
    findOrder: db.prepare('SELECT * FROM orders WHERE id = ?'),
  };

  // Decrement stock and insert the order atomically: both happen or neither.
  // The "stock >= ?" guard means stock can never go negative, even if another
  // process changed it after the route checked availability.
  const placeOrder = db.transaction((book, quantity) => {
    const { changes } = stmt.decrementStock.run(quantity, book.id, quantity);
    if (changes === 0) {
      const err = new Error(`Not enough stock for "${book.title}"`);
      err.status = 409;
      throw err; // rolls back the transaction
    }
    const order = {
      bookId: book.id,
      title: book.title,
      quantity,
      unitPrice: book.price,
      total: Math.round(book.price * quantity * 100) / 100,
      createdAt: new Date().toISOString(),
    };
    const { lastInsertRowid } = stmt.insertOrder.run(order);
    return { id: Number(lastInsertRowid), ...order };
  });

  return {
    listBooks() {
      return stmt.listBooks.all();
    },

    findBook(id) {
      return isId(id) ? stmt.findBook.get(id) : undefined;
    },

    // Assumes input is already validated by the route.
    createOrder(book, quantity) {
      return placeOrder(book, quantity);
    },

    listOrders() {
      return stmt.listOrders.all().map(toOrder);
    },

    findOrder(id) {
      return isId(id) ? toOrder(stmt.findOrder.get(id)) : undefined;
    },

    close() {
      db.close();
    },
  };
}

module.exports = { createStore };
