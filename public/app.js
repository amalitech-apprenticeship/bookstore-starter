// Bookstore frontend. The page is served by the same Express app as the API,
// so every fetch uses a relative URL ("/books", "/orders") and needs no CORS.

const $ = (id) => document.getElementById(id);

const els = {
  health: $('health'),
  healthText: $('health-text'),
  bookList: $('book-list'),
  booksStatus: $('books-status'),
  booksCount: $('books-count'),
  refresh: $('refresh-books'),
  form: $('order-form'),
  pickerButton: $('book-picker'),
  pickerValue: $('picker-value'),
  pickerList: $('picker-list'),
  quantity: $('quantity'),
  total: $('order-total'),
  submit: $('order-submit'),
  result: $('order-result'),
};

const money = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' });
const COVER_COLORS = ['#2f5d50', '#7a4b2a', '#3d4f7c', '#8a3b3b', '#5b4a7a', '#4a6b3a'];

let books = [];
let previousStock = new Map();
let selectedId = null; // id of the book chosen in the picker
let activeIndex = -1; // keyboard-highlighted option while the list is open

const coverColor = (book) => COVER_COLORS[(book.id - 1) % COVER_COLORS.length];
const selectedBook = () => books.find((b) => b.id === selectedId);

// Adds the cover photo from public/covers/<id>.jpg to a container. If the file
// is missing, the image removes itself and the generated cover shows instead.
function addCoverImage(container, book) {
  const img = el('img', 'cover-img');
  img.src = `covers/${book.id}.jpg`;
  img.alt = '';
  img.loading = 'lazy';
  img.decoding = 'async';
  img.addEventListener('error', () => {
    container.classList.remove('has-image');
    img.remove();
  });
  container.classList.add('has-image');
  container.append(img);
}

// Small helper for building elements without innerHTML.
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// Parses JSON, and throws an Error carrying the HTTP status and the API's
// { error } message when the response is not 2xx.
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

function stockBadge(stock) {
  const badge = el('span', 'stock');
  if (stock === 0) {
    badge.classList.add('out');
    badge.textContent = 'Out of stock';
  } else {
    if (stock <= 2) badge.classList.add('low');
    badge.textContent = `${stock} in stock`;
  }
  return badge;
}

function bookCard(book) {
  const li = el('li', 'book');
  if (book.stock === 0) li.classList.add('sold-out');

  const cover = el('div', 'cover');
  cover.style.setProperty('--cover', coverColor(book));
  cover.setAttribute('aria-hidden', 'true');
  cover.append(el('span', 'cover-title', book.title), el('span', 'cover-author', book.author));
  addCoverImage(cover, book);

  const body = el('div', 'book-body');
  body.append(el('h3', 'book-title', book.title), el('p', 'book-author', book.author));

  const badge = stockBadge(book.stock);
  // Briefly highlight a stock count that changed since the last load.
  if (previousStock.has(book.id) && previousStock.get(book.id) !== book.stock) {
    badge.classList.add('changed');
  }

  const footer = el('div', 'book-footer');
  footer.append(el('span', 'book-price', money.format(book.price)), badge);

  const choose = el('button', 'btn btn-secondary btn-block', book.stock === 0 ? 'Unavailable' : 'Select');
  choose.type = 'button';
  choose.disabled = book.stock === 0;
  choose.addEventListener('click', () => {
    selectBook(book.id);
    els.quantity.focus();
  });

  body.append(footer, choose);
  li.append(cover, body);
  return li;
}

function renderBooks() {
  els.bookList.replaceChildren(...books.map(bookCard));
  previousStock = new Map(books.map((b) => [b.id, b.stock]));
  els.booksCount.textContent = `${books.length} ${books.length === 1 ? 'title' : 'titles'}`;
}

// --- Book picker (accessible custom listbox) ------------------------------

function swatch(book) {
  const s = el('span', 'swatch');
  s.style.setProperty('--cover', coverColor(book));
  s.setAttribute('aria-hidden', 'true');
  addCoverImage(s, book);
  return s;
}

function bookSummary(book) {
  const text = el('span', 'picker-text');
  text.append(el('span', 'picker-title', book.title), el('span', 'picker-sub', book.author));
  return text;
}

function renderPicker() {
  // Keep the user's selection across refreshes; default to the first book in stock.
  if (!selectedBook()) selectedId = (books.find((b) => b.stock > 0) || books[0] || {}).id ?? null;

  els.pickerList.replaceChildren(
    ...books.map((book) => {
      const li = el('li', 'picker-option');
      li.id = `book-option-${book.id}`;
      li.setAttribute('role', 'option');
      li.dataset.id = book.id;
      li.setAttribute('aria-selected', String(book.id === selectedId));
      if (book.stock === 0) li.classList.add('sold-out');

      const meta = el('span', 'picker-meta');
      meta.append(
        el('span', 'picker-price', money.format(book.price)),
        el('span', 'picker-stock', book.stock === 0 ? 'Sold out' : `${book.stock} left`)
      );
      li.append(swatch(book), bookSummary(book), meta);
      return li;
    })
  );

  const book = selectedBook();
  els.pickerValue.replaceChildren(
    ...(book ? [swatch(book), bookSummary(book)] : [el('span', 'picker-placeholder', 'No books available')])
  );
}

function selectBook(id) {
  selectedId = id;
  renderPicker();
  updateTotal();
}

function setActive(index) {
  const options = els.pickerList.children;
  if (!options.length) return;
  activeIndex = (index + options.length) % options.length;
  for (const opt of options) opt.classList.remove('active');
  const opt = options[activeIndex];
  opt.classList.add('active');
  opt.scrollIntoView({ block: 'nearest' });
  els.pickerList.setAttribute('aria-activedescendant', opt.id);
}

function openPicker() {
  if (!books.length) return;
  els.pickerList.hidden = false;
  els.pickerButton.setAttribute('aria-expanded', 'true');
  setActive(Math.max(0, books.findIndex((b) => b.id === selectedId)));
  els.pickerList.focus();
}

function closePicker(returnFocus = true) {
  if (els.pickerList.hidden) return;
  els.pickerList.hidden = true;
  els.pickerButton.setAttribute('aria-expanded', 'false');
  els.pickerList.removeAttribute('aria-activedescendant');
  if (returnFocus) els.pickerButton.focus();
}

els.pickerButton.addEventListener('click', () => (els.pickerList.hidden ? openPicker() : closePicker()));

els.pickerButton.addEventListener('keydown', (e) => {
  if (['ArrowDown', 'ArrowUp'].includes(e.key)) {
    e.preventDefault();
    openPicker();
  }
});

els.pickerList.addEventListener('keydown', (e) => {
  const keys = {
    ArrowDown: () => setActive(activeIndex + 1),
    ArrowUp: () => setActive(activeIndex - 1),
    Home: () => setActive(0),
    End: () => setActive(books.length - 1),
    Enter: () => { selectBook(books[activeIndex].id); closePicker(); },
    ' ': () => { selectBook(books[activeIndex].id); closePicker(); },
    Escape: () => closePicker(),
  };
  if (e.key === 'Tab') return closePicker(false);
  if (keys[e.key]) {
    e.preventDefault();
    keys[e.key]();
  }
});

els.pickerList.addEventListener('click', (e) => {
  const opt = e.target.closest('.picker-option');
  if (!opt) return;
  selectBook(Number(opt.dataset.id));
  closePicker();
});

els.pickerList.addEventListener('mousemove', (e) => {
  const opt = e.target.closest('.picker-option');
  if (opt) setActive([...els.pickerList.children].indexOf(opt));
});

document.addEventListener('click', (e) => {
  if (!e.target.closest('.picker')) closePicker(false);
});

async function loadBooks() {
  try {
    books = await api('/books');
    renderBooks();
    renderPicker();
    updateTotal();
    els.booksStatus.hidden = books.length > 0;
    els.booksStatus.textContent = 'No books available.';
  } catch (err) {
    els.booksStatus.hidden = false;
    els.booksStatus.textContent = `Could not load books: ${err.message}`;
  }
}

// --- Orders -------------------------------------------------------------

// Display-only estimate. The API still validates and prices the order.
function updateTotal() {
  const book = selectedBook();
  const qty = Number(els.quantity.value);
  els.total.textContent = book && Number.isInteger(qty) && qty > 0 ? money.format(book.price * qty) : '—';
}

function showOrder(order) {
  els.result.className = 'result success';
  const head = el('div', 'result-head');
  head.append(el('span', 'check', '✓'), el('h3', null, 'Order confirmed'));

  const dl = el('dl');
  const rows = [
    ['Order #', order.id],
    ['Book', order.title],
    ['Quantity', order.quantity],
    ['Unit price', money.format(order.unitPrice)],
    ['Placed', new Date(order.createdAt).toLocaleString()],
    ['Total', money.format(order.total)],
  ];
  for (const [label, value] of rows) dl.append(el('dt', null, label), el('dd', null, String(value)));

  els.result.replaceChildren(head, dl);
  els.result.hidden = false;
}

const STATUS_TEXT = { 400: 'Bad Request', 404: 'Not Found', 409: 'Conflict', 500: 'Internal Server Error' };

function retryAction() {
  return { label: 'Try again', run: () => els.form.requestSubmit() };
}

// Turns an API error into a friendly title, explanation and optional fix.
// The raw status and message are still shown underneath for transparency.
function describeError(err) {
  const book = selectedBook();

  if (!err.status) {
    return {
      title: "Can't reach the store",
      message: 'Check your connection and try again.',
      action: retryAction(),
    };
  }
  if (err.status === 400 && /quantity/i.test(err.message)) {
    els.quantity.setAttribute('aria-invalid', 'true');
    return {
      title: 'Check the quantity',
      message: 'Enter a whole number of 1 or more.',
      action: { label: 'Fix quantity', run: () => els.quantity.select() },
    };
  }
  if (err.status === 400 && /bookId/i.test(err.message)) {
    return {
      title: 'Choose a book',
      message: 'Pick a book from the list before placing your order.',
      action: { label: 'Choose a book', run: openPicker },
    };
  }
  if (err.status === 404) {
    return {
      title: 'Book not found',
      message: "This book is no longer in the catalog. We've refreshed the list for you.",
      action: { label: 'Choose another book', run: openPicker },
    };
  }
  if (err.status === 409 && book && book.stock === 0) {
    return {
      title: 'Sold out',
      message: `“${book.title}” is out of stock right now.`,
      action: { label: 'Browse other books', run: openPicker },
    };
  }
  if (err.status === 409 && book) {
    return {
      title: 'Not enough stock',
      message: book.stock === 1
        ? `Only 1 copy of “${book.title}” is left.`
        : `Only ${book.stock} copies of “${book.title}” are left.`,
      action: {
        label: `Change to ${book.stock}`,
        run: () => {
          els.quantity.value = book.stock;
          els.quantity.removeAttribute('aria-invalid');
          updateTotal();
          els.quantity.focus();
        },
      },
    };
  }
  if (err.status >= 500) {
    return {
      title: 'Something went wrong on our end',
      message: 'Your order was not placed. Please try again in a moment.',
      action: retryAction(),
    };
  }
  return { title: "We couldn't place your order", message: 'Please review your order and try again.' };
}

const ALERT_ICON =
  '<svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true"><circle cx="10" cy="10" r="8.25" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M10 5.75v5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="10" cy="13.9" r="1.05" fill="currentColor"/></svg>';

function showError(err) {
  const info = describeError(err);
  els.result.className = 'result error';

  const icon = el('span', 'alert-icon');
  icon.innerHTML = ALERT_ICON; // static markup, no user data

  const close = el('button', 'alert-close', '×');
  close.type = 'button';
  close.setAttribute('aria-label', 'Dismiss');
  close.addEventListener('click', () => { els.result.hidden = true; });

  const body = el('div', 'alert-body');
  body.append(el('h3', 'alert-title', info.title), el('p', 'alert-message', info.message));

  if (info.action) {
    const btn = el('button', 'btn btn-alert', info.action.label);
    btn.type = 'button';
    // Stop the click reaching the document handler that closes the picker.
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      info.action.run();
    });
    body.append(btn);
  }

  const detail = el('p', 'alert-detail');
  const code = err.status ? `${err.status} ${STATUS_TEXT[err.status] || 'Error'}` : 'Network error';
  detail.append(el('span', 'code', code), el('span', 'alert-raw', err.message));
  body.append(detail);

  els.result.replaceChildren(icon, body, close);
  els.result.hidden = false;
}

els.form.addEventListener('submit', async (event) => {
  event.preventDefault();

  // Send the raw values as numbers. The API does the validation, so an
  // empty or fractional quantity comes back as a 400 and is shown as-is.
  const payload = {
    bookId: selectedId,
    quantity: els.quantity.value === '' ? null : Number(els.quantity.value),
  };

  els.submit.disabled = true;
  els.submit.textContent = 'Placing order…';
  try {
    const order = await api('/orders', { method: 'POST', body: JSON.stringify(payload) });
    showOrder(order);
    await loadBooks(); // refresh stock after a successful order
  } catch (err) {
    // Stock or catalog changed under us: reload so the message uses fresh numbers.
    if (err.status === 404 || err.status === 409) await loadBooks();
    showError(err);
  } finally {
    els.submit.disabled = false;
    els.submit.textContent = 'Place order';
  }
});

els.quantity.addEventListener('input', () => {
  els.quantity.removeAttribute('aria-invalid');
  updateTotal();
});
els.refresh.addEventListener('click', () => {
  loadHealth();
  loadBooks();
});

$('year').textContent = new Date().getFullYear();
loadHealth();
loadBooks();
