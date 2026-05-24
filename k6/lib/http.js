// Thin wrappers around k6/http that attach auth headers, tag requests by
// endpoint name (so the summary breaks down per-route), and assert status.
import http from 'k6/http';
import { check } from 'k6';
import { HEADERS, API } from './config.js';

// `name` becomes the metric tag so k6 groups timings per logical endpoint
// instead of per-URL (which would explode the cardinality on {id} routes).
function opts(name, extra) {
  return { headers: HEADERS, tags: { endpoint: name }, ...extra };
}

export function get(name, path, extra) {
  const res = http.get(`${API}${path}`, opts(name, extra));
  check(res, { [`${name} 2xx`]: (r) => r.status >= 200 && r.status < 300 });
  return res;
}

export function post(name, path, body, extra) {
  const res = http.post(`${API}${path}`, JSON.stringify(body), opts(name, extra));
  check(res, { [`${name} 2xx`]: (r) => r.status >= 200 && r.status < 300 });
  return res;
}

export function del(name, path, extra) {
  const res = http.del(`${API}${path}`, null, opts(name, extra));
  check(res, { [`${name} 2xx/404`]: (r) => r.status < 300 || r.status === 404 });
  return res;
}

export function json(res) {
  try {
    return res.json();
  } catch (_) {
    return null;
  }
}
