/**
 * BrandHub API client
 * All requests go to /api/* on the Django backend.
 * Set VITE_API_BASE in .env.local: VITE_API_BASE=http://localhost:8000
 */

const BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000';

// ── Token storage ────────────────────────────────────────────────────────────
const getAccess = () => localStorage.getItem('bh_access');
const getRefresh = () => localStorage.getItem('bh_refresh');
const setTokens = ({ access, refresh }) => {
  localStorage.setItem('bh_access', access);
  if (refresh) localStorage.setItem('bh_refresh', refresh);
};
const clearTokens = () => {
  localStorage.removeItem('bh_access');
  localStorage.removeItem('bh_refresh');
};

// ── Core fetch with auto-refresh ─────────────────────────────────────────────
async function apiFetch(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  const token = getAccess();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  let res = await fetch(`${BASE}${path}`, { ...options, headers });

  // Token expired → try refresh once
  if (res.status === 401 && getRefresh()) {
    const refreshRes = await fetch(`${BASE}/api/auth/token/refresh/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh: getRefresh() }),
    });
    if (refreshRes.ok) {
      const data = await refreshRes.json();
      setTokens({ access: data.access });
      headers['Authorization'] = `Bearer ${data.access}`;
      res = await fetch(`${BASE}${path}`, { ...options, headers });
    } else {
      clearTokens();
      window.location.href = '/login';
      return;
    }
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw Object.assign(new Error(err.detail || 'API error'), { status: res.status, data: err });
  }

  if (res.status === 204) return null;
  return res.json();
}

const get = (path) => apiFetch(path);
const post = (path, body) => apiFetch(path, { method: 'POST', body: JSON.stringify(body) });
const patch = (path, body) => apiFetch(path, { method: 'PATCH', body: JSON.stringify(body) });
const del = (path) => apiFetch(path, { method: 'DELETE' });

// Multipart upload — do NOT set Content-Type manually, the browser sets the
// correct multipart boundary automatically when the body is a FormData.
async function postFile(path, file) {
  const headers = {};
  const token = getAccess();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch(`${BASE}${path}`, { method: 'POST', headers, body: formData });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw Object.assign(new Error(err.detail || 'Upload failed'), { status: res.status, data: err });
  }
  return res.json();
}

// ── Auth ──────────────────────────────────────────────────────────────────────
export const auth = {
  register: (data) => post('/api/auth/register/', data).then(r => { setTokens(r.tokens); return r; }),
  login: (data) => post('/api/auth/login/', data).then(r => { setTokens(r.tokens); return r; }),
  logout: () => post('/api/auth/logout/', { refresh: getRefresh() }).finally(clearTokens),
  me: () => get('/api/auth/me/'),
  updateOrg: (data) => patch('/api/auth/organization/', data),
};

// ── Clients ───────────────────────────────────────────────────────────────────
export const clients = {
  list: () => get('/api/clients/'),
  create: (data) => post('/api/clients/', data),
  update: (id, data) => patch(`/api/clients/${id}/`, data),
  remove: (id) => del(`/api/clients/${id}/`),
};

// ── Social Accounts ───────────────────────────────────────────────────────────
export const accounts = {
  /**
   * Connect/update an account.
   * data: { handle, access_token, page_id, is_connected }
   */
  update: (clientId, accountId, data) =>
    patch(`/api/clients/${clientId}/accounts/${accountId}/`, data),

  verify: (clientId, accountId) =>
    post(`/api/clients/${clientId}/accounts/${accountId}/verify/`, {}),

  disconnect: (clientId, accountId) =>
    post(`/api/clients/${clientId}/accounts/${accountId}/disconnect/`, {}),
};

// ── Posts ─────────────────────────────────────────────────────────────────────
export const posts = {
  list: () => get('/api/posts/'),
  detail: (id) => get(`/api/posts/${id}/`),

  /**
   * Publish a post to multiple accounts.
   * data: { content: string, account_ids: string[], image_url?: string }
   * Returns the created Post with all Distribution results.
   */
  publish: (data) => post('/api/publish/', data),
};

// ── Media ─────────────────────────────────────────────────────────────────────
export const media = {
  /**
   * Upload an image and get back a public URL to attach to a post.
   * Required before publishing an image to Facebook/Instagram — the Graph
   * API fetches images by URL, so a local blob/data URL won't work.
   */
  upload: (file) => postFile('/api/media/upload/', file),
};

// ── Dashboard ─────────────────────────────────────────────────────────────────
export const dashboard = {
  stats: () => get('/api/dashboard/stats/'),
};