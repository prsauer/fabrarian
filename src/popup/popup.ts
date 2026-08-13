import { packratUrl } from '../config.js';
import { readToken, clearToken, type StoredToken } from '../storage.js';

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el as T;
};

const statusEl = $<HTMLParagraphElement>('status');
const detailEl = $<HTMLDivElement>('detail');
const openBtn = $<HTMLButtonElement>('open');
const clearBtn = $<HTMLButtonElement>('clear');

function fmt(ms: number): string {
  return new Date(ms).toLocaleString();
}

function preview(value: string): string {
  return `${value.slice(0, 12)}…${value.slice(-6)}`;
}

function row(label: string, value: string): HTMLDivElement {
  const div = document.createElement('div');
  div.className = 'row';
  const span = document.createElement('span');
  span.textContent = label;
  const code = document.createElement('code');
  code.textContent = value;
  div.append(span, code);
  return div;
}

function render(token: StoredToken | null): void {
  if (!token) {
    statusEl.textContent = 'No token captured yet.';
    statusEl.classList.remove('expired');
    detailEl.textContent = 'Open fabrary.net and sign in — the token is grabbed automatically.';
    openBtn.disabled = true;
    clearBtn.disabled = true;
    return;
  }

  const expired = token.expiresAt != null && token.expiresAt < Date.now();
  statusEl.textContent = expired ? 'Token captured (expired)' : 'Token captured';
  statusEl.classList.toggle('expired', expired);

  const rows = [
    row('Access', preview(token.value)),
    row('Refresh', token.refreshValue ? preview(token.refreshValue) : '—'),
    row('User', token.username || '—'),
    row('Source', token.source || '—'),
    row('Captured', fmt(token.capturedAt)),
  ];
  if (token.expiresAt != null) rows.push(row('Expires', fmt(token.expiresAt)));
  detailEl.replaceChildren(...rows);

  openBtn.disabled = false;
  clearBtn.disabled = false;
}

openBtn.addEventListener('click', async () => {
  const token = await readToken();
  if (!token) return;
  await chrome.tabs.create({ url: packratUrl(token.value, token.refreshValue) });
  window.close();
});

clearBtn.addEventListener('click', async () => {
  await clearToken();
  chrome.action.setBadgeText({ text: '' });
  render(null);
});

void readToken().then(render);
