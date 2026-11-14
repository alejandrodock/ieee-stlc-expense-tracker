// Test process only: redirect every Supabase request to the in-memory fixture.
// This also catches URLs that Next inlined during build. No production DB access.
const originalFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  if (url.hostname.endsWith('.supabase.co') || url.hostname === 'supabase.test') {
    url.protocol = 'http:'; url.host = '127.0.0.1:54399';
    return originalFetch(url, init);
  }
  return originalFetch(input, init);
};
