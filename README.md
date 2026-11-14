# Bookstore Starter

A small bookstore API built with Express and SQLite, plus a plain HTML/CSS/JS
frontend. One Express app serves both, so the UI and the API run as one service
on one port.

## Quick start

```bash
npm install
npm start          # runs src/server.js → http://localhost:3000
npm run dev        # same, restarts on file changes
npm test           # runs the test suite with Node's built-in test runner
```

Requires Node 22 or later. The dependencies are `express` and `better-sqlite3`.

## Configuration

Settings come from environment variables. Each one has a default.

| Variable  | Default               | Description                                         |
| --------- | --------------------- | --------------------------------------------------- |
| `PORT`    | `3000`                | Port the server listens on                          |
| `DB_PATH` | `./data/bookstore.db` | SQLite database file, relative to where you start the server. Use `:memory:` for a throwaway in-memory database. |

The folder for `DB_PATH` (`data/` by default) is created automatically if it
doesn't exist. `data/` is in `.gitignore`.

```bash
PORT=8080 DB_PATH=/tmp/books.db npm start               # macOS / Linux / Git Bash
$env:PORT=8080; $env:DB_PATH="C:\temp\books.db"; npm start  # PowerShell
```

## Database

`src/store.js` is the only module that touches the database. It exposes the
functions the routes call (`listBooks`, `findBook`, `createOrder`, `listOrders`,
`findOrder`), so the route handlers don't need to know about SQL.

- **Tables.** `books (id, title, author, price, stock)` and
  `orders (id, book_id, title, quantity, unit_price, total, created_at)`.
  They are created on startup if missing.
- **Seed data.** The five starter books, including one with zero stock, are
  inserted only when the `books` table is empty. Restarting the server keeps
  your existing stock and orders.
- **Placing an order** decrements stock and inserts the order in a single
  transaction, so either both happen or neither does. The stock update only
  succeeds if enough stock is left, so stock can never go negative.
- To reset to the seed data, stop the server and delete the `data/` folder.

## Project layout

```
src/
  app.js      createApp(): creates and exports the Express app (routes, static files, errors)
  server.js   entry point for "npm start": reads config and starts listening
  store.js    SQLite access: schema, seeding, queries, the order transaction
  config.js   reads PORT and DB_PATH from the environment, with defaults
public/
  index.html  the frontend page, served at "/"
  styles.css
  app.js      frontend logic (vanilla JS + fetch)
tests/
  app.test.js API and frontend tests (imports src/app.js only)
data/         SQLite database file (created at runtime, git-ignored)
docs/         reserved for documentation
monitoring/   reserved for monitoring config
```

## API

All responses are JSON. Errors look like `{ "error": "message" }`.

| Method | Path          | Description                          |
| ------ | ------------- | ------------------------------------ |
| GET    | `/health`     | `{ "status": "ok", "uptime": 12 }`   |
| GET    | `/books`      | List all books                       |
| GET    | `/books/:id`  | One book, or 404                     |
| GET    | `/orders`     | All orders                           |
| GET    | `/orders/:id` | One order, or 404                    |
| POST   | `/orders`     | Place an order                       |

A book looks like `{ "id": 1, "title": "...", "author": "...", "price": 42.5, "stock": 5 }`.

### POST /orders

Request body:

```json
{ "bookId": 1, "quantity": 2 }
```

| Status | When                                                        |
| ------ | ----------------------------------------------------------- |
| 201    | Order created. Stock goes down by `quantity`.               |
| 400    | `bookId` or `quantity` missing or not a positive integer, or the body isn't valid JSON |
| 404    | No book with that `bookId`                                  |
| 409    | Not enough stock for the requested quantity                 |

A created order looks like:

```json
{ "id": 1, "bookId": 1, "title": "The Pragmatic Programmer", "quantity": 2,
  "unitPrice": 42.5, "total": 85, "createdAt": "2026-11-14T18:30:00.000Z" }
```

## Frontend

The frontend lives in `public/` and is served by `express.static`, so opening
`http://localhost:3000/` loads it. It is plain HTML, CSS and vanilla JavaScript:
no framework, no bundler, no build step and no extra npm packages. Because the
page and the API share an origin, there is no CORS setup.

What the page does:

- **API status.** A badge in the header calls `GET /health` and shows "API ok"
  in green, or "API unreachable" in red.
- **Book list.** Calls `GET /books` and shows each book's title, author, price
  and current stock. Low stock (2 or fewer) is shown in amber and sold-out
  books in red.
- **Order form.** Pick a book, enter a quantity and submit. The page sends
  `POST /orders` and shows either the created order (order number, book,
  quantity, unit price, total, time) or the API's error message with its
  status code (400, 404 or 409).
- **Stock refresh.** After a successful order the page fetches `GET /books`
  again, so the list and the dropdown show the new stock. Counts that changed
  briefly pulse. The **Refresh** button reloads health and books by hand.

The page validates nothing itself; the API is the single source of truth. To
demo the error cases, order more copies than are in stock (409), order the
sold-out book (409), or clear the quantity field (400).

Layout: two columns on a laptop (books on the left, order form on the right),
stacked on a phone. It follows the system light or dark mode.

### How the page calls the API

All requests go through one helper in `public/app.js`:

```js
async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const err = new Error((body && body.error) || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return body;
}
```

Paths are relative (`/health`, `/books`, `/orders`), so the browser sends them
to whichever host served the page. Any non-2xx response becomes a thrown
`Error` that carries the API's `error` message and the HTTP status, which the
order form displays.

## Tests

`npm test` runs `tests/app.test.js` with Node's built-in test runner
(`node:test`), so there are no test dependencies. The test file sets
`DB_PATH=:memory:` before it loads `src/app.js`, and every test gets its own
freshly seeded in-memory database. Tests never create or touch a database
file, and they never start `server.js`.

Covered: `GET /` serves the HTML page, `/health`, `/books`, `/books/:id`
(including 404), `/orders/:id` (including 404), and `POST /orders` for 201,
400, 404 and 409. A rejected order is checked to leave stock and orders
unchanged.

## Notes

- Book 5 starts with zero stock, which makes it easy to show a 409 in a demo.
  Once you've sold out other books, delete `data/` to reset.
