// Bookstore frontend. The page is served by the same Express app as the API,
// so every fetch uses a relative URL ("/books", "/orders") and needs no CORS.

const els = {
  health: document.getElementById('health'),
  healthText: document.getElementById('health-text'),
  bookList: document.getElementById('book-list'),
  booksStatus: document.getElementById('books-status'),
  refresh: document.getElementById('refresh-books'),
  form: document.getElementById('order-form'),
  select: document.getElementById('book-select'),
  quantity: document.getElementById('quantity'),
  submit: document.getElementById('order-submit'),
  result: document.getElementById('order-result'),
};

const money = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' });

// Small wrapper: parses JSON, and throws an Error carrying the HTTP status
// and the API's { error } message when the response is not 2xx.
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

// --- Health -------------------------------------------------------------

async function loadHealth() {
  try {
    const data = await api('/health');
    els.health.dataset.state = 'ok';
    els.healthText.textContent = `API ${data.status}`;
  } catch {
    els.health.dataset.state = 'down';
    els.healthText.textContent = 'API unreachable';
  }
}

// --- Books --------------------------------------------------------------

let previousStock = new Map();

function stockBadge(stock) {
  const span = document.createElement('span');
  span.className = 'stock';
  if (stock === 0) {
    span.classList.add('out');
    span.textContent = 'Out of stock';
  } else {
    if (stock <= 2) span.classList.add('low');
    span.textContent = `${stock} in stock`;
  }
  return span;
}

function renderBooks(books) {
  els.bookList.replaceChildren(
    ...books.map((book) => {
      const li = document.createElement('li');
      li.className = 'book';

      const info = document.createElement('div');
      const title = document.createElement('div');
      title.className = 'book-title';
      title.textContent = book.title;
      const author = document.createElement('div');
      author.className = 'book-author';
      author.textContent = book.author;
      info.append(title, author);

      const meta = document.createElement('div');
      meta.className = 'book-meta';
      const price = document.createElement('div');
      price.className = 'book-price';
      price.textContent = money.format(book.price);
      const badge = stockBadge(book.stock);
      // Briefly highlight a stock count that changed since the last load.
      if (previousStock.has(book.id) && previousStock.get(book.id) !== book.stock) {
        badge.classList.add('changed');
      }
      meta.append(price, document.createElement('br'), badge);

      li.append(info, meta);
      return li;
    })
  );
  previousStock = new Map(books.map((b) => [b.id, b.stock]));
}

function renderSelect(books) {
  const current = els.select.value;
  els.select.replaceChildren(
    ...books.map((book) => {
      const opt = document.createElement('option');
      opt.value = book.id;
      opt.textContent = `${book.title} (${book.stock} left)`;
      return opt;
    })
  );
  // Keep the user's selection across refreshes.
  if (current && books.some((b) => String(b.id) === current)) els.select.value = current;
}

async function loadBooks() {
  try {
    const books = await api('/books');
    renderBooks(books);
    renderSelect(books);
    els.booksStatus.hidden = books.length > 0;
    els.booksStatus.textContent = 'No books available.';
  } catch (err) {
    els.booksStatus.hidden = false;
    els.booksStatus.textContent = `Could not load books: ${err.message}`;
  }
}

// --- Orders -------------------------------------------------------------

function showOrder(order) {
  els.result.className = 'result success';
  els.result.innerHTML = '<h3>Order placed</h3><dl></dl>';
  const dl = els.result.querySelector('dl');
  const rows = [
    ['Order #', order.id],
    ['Book', order.title],
    ['Quantity', order.quantity],
    ['Unit price', money.format(order.unitPrice)],
    ['Total', money.format(order.total)],
    ['Placed', new Date(order.createdAt).toLocaleString()],
  ];
  for (const [label, value] of rows) {
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    dd.textContent = value;
    dl.append(dt, dd);
  }
  els.result.hidden = false;
}

function showError(err) {
  els.result.className = 'result error';
  els.result.replaceChildren();
  if (err.status) {
    const code = document.createElement('span');
    code.className = 'code';
    code.textContent = err.status;
    els.result.append(code);
  }
  els.result.append(document.createTextNode(err.message));
  els.result.hidden = false;
}

els.form.addEventListener('submit', async (event) => {
  event.preventDefault();

  // Send the raw values as numbers. The API does the validation, so an
  // empty or fractional quantity comes back as a 400 and is shown as-is.
  const payload = {
    bookId: Number(els.select.value),
    quantity: els.quantity.value === '' ? null : Number(els.quantity.value),
  };

  els.submit.disabled = true;
  try {
    const order = await api('/orders', { method: 'POST', body: JSON.stringify(payload) });
    showOrder(order);
    await loadBooks(); // refresh stock after a successful order
  } catch (err) {
    showError(err);
  } finally {
    els.submit.disabled = false;
  }
});

els.refresh.addEventListener('click', () => {
  loadHealth();
  loadBooks();
});

loadHealth();
loadBooks();
