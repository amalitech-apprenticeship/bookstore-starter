// Use an in-memory SQLite database so tests never touch a real file.
// Must be set before the app (and its store) is loaded.
process.env.DB_PATH = ':memory:';

const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../src/app');

// Each test gets a fresh app with its own freshly seeded in-memory database,
// listening on a random free port.
let app;
let server;
let baseUrl;

beforeEach(async () => {
  app = createApp();
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

afterEach(async () => {
  await new Promise((resolve) => server.close(resolve));
  app.locals.store.close();
});

function postOrder(body) {
  return fetch(`${baseUrl}/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

test('GET / returns the frontend HTML page', async () => {
  const res = await fetch(`${baseUrl}/`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/html/);
  const html = await res.text();
  assert.match(html, /<title>Bookstore<\/title>/);
  assert.match(html, /<script src="app.js"><\/script>/);
});

test('GET /health reports ok', async () => {
  const res = await fetch(`${baseUrl}/health`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.status, 'ok');
});

test('GET /books lists books with title, author, price and stock', async () => {
  const res = await fetch(`${baseUrl}/books`);
  assert.equal(res.status, 200);
  const books = await res.json();
  assert.ok(books.length > 0);
  for (const book of books) {
    assert.equal(typeof book.title, 'string');
    assert.equal(typeof book.author, 'string');
    assert.equal(typeof book.price, 'number');
    assert.equal(typeof book.stock, 'number');
  }
  assert.equal(books.length, 5);
  assert.ok(books.some((b) => b.stock === 0), 'seed includes a sold-out book');
});

test('GET /books/:id returns one book', async () => {
  const res = await fetch(`${baseUrl}/books/2`);
  assert.equal(res.status, 200);
  const book = await res.json();
  assert.equal(book.id, 2);
  assert.equal(book.title, 'Clean Code');
});

test('GET /books/:id returns 404 for an unknown or invalid id', async () => {
  for (const id of ['999', 'abc']) {
    const res = await fetch(`${baseUrl}/books/${id}`);
    assert.equal(res.status, 404, id);
    assert.match((await res.json()).error, /not found/);
  }
});

test('GET /orders/:id returns a created order', async () => {
  const created = await (await postOrder({ bookId: 3, quantity: 2 })).json();

  const res = await fetch(`${baseUrl}/orders/${created.id}`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), created);

  const all = await (await fetch(`${baseUrl}/orders`)).json();
  assert.deepEqual(all, [created]);
});

test('GET /orders/:id returns 404 for an unknown or invalid id', async () => {
  for (const id of ['1', '999', 'abc']) {
    const res = await fetch(`${baseUrl}/orders/${id}`);
    assert.equal(res.status, 404, id);
    assert.match((await res.json()).error, /not found/);
  }
});

test('POST /orders creates an order and decrements stock', async () => {
  const res = await postOrder({ bookId: 1, quantity: 2 });
  assert.equal(res.status, 201);
  const order = await res.json();
  assert.equal(order.bookId, 1);
  assert.equal(order.quantity, 2);
  assert.equal(order.total, 85);

  const book = await (await fetch(`${baseUrl}/books/1`)).json();
  assert.equal(book.stock, 3);
});

test('POST /orders returns 400 for invalid input', async () => {
  for (const body of [{ bookId: 1 }, { bookId: 1, quantity: 0 }, { bookId: 1, quantity: 1.5 }, { quantity: 1 }]) {
    const res = await postOrder(body);
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.ok((await res.json()).error);
  }
  const malformed = await postOrder('{not json');
  assert.equal(malformed.status, 400);
});

test('POST /orders returns 404 for an unknown book', async () => {
  const res = await postOrder({ bookId: 999, quantity: 1 });
  assert.equal(res.status, 404);
  assert.match((await res.json()).error, /not found/);
});

test('POST /orders returns 409 when stock is insufficient', async () => {
  const res = await postOrder({ bookId: 2, quantity: 50 });
  assert.equal(res.status, 409);
  assert.match((await res.json()).error, /Not enough stock/);

  // A rejected order changes nothing.
  const book = await (await fetch(`${baseUrl}/books/2`)).json();
  assert.equal(book.stock, 3);
  const orders = await (await fetch(`${baseUrl}/orders`)).json();
  assert.equal(orders.length, 0);
});
