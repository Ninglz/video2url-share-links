const SLUG_REGEX = /^[A-Za-z0-9_-]{1,128}$/;
const RAW_URL_REGEX = /^https:\/\/video2url\.com(?::443)?\/v\/([A-Za-z0-9_-]{1,128})(?:[?#].*)?$/;

export function parseShareUrl(input) {
  if (typeof input !== 'string') {
    return null;
  }
  if (input.includes('\\') || /%2[fF]|%5[cC]/i.test(input)) {
    return null;
  }
  const match = input.match(RAW_URL_REGEX);
  if (!match) {
    return null;
  }
  try {
    const parsed = new URL(input);
    if (parsed.protocol !== 'https:') return null;
    if (parsed.hostname !== 'video2url.com') return null;
    if (parsed.username || parsed.password) return null;
    if (parsed.port !== '' && parsed.port !== '443') return null;
    if (parsed.pathname !== `/v/${match[1]}`) return null;
  } catch {
    return null;
  }
  return {
    slug: match[1],
    url: `https://video2url.com/v/${match[1]}`
  };
}

export function buildShareUrl(slug) {
  if (typeof slug !== 'string' || !SLUG_REGEX.test(slug)) {
    throw new TypeError('Invalid slug: must be 1-128 characters of A-Z, a-z, 0-9, _, or -');
  }
  return `https://video2url.com/v/${slug}`;
}

export function buildDirectUrl(slug) {
  if (typeof slug !== 'string' || !SLUG_REGEX.test(slug)) {
    throw new TypeError('Invalid slug: must be 1-128 characters of A-Z, a-z, 0-9, _, or -');
  }
  return `https://video2url.com/api/shares/${slug}/direct`;
}

export function toMarkdownLink(slug, label) {
  if (typeof slug !== 'string' || !SLUG_REGEX.test(slug)) {
    throw new TypeError('Invalid slug: must be 1-128 characters of A-Z, a-z, 0-9, _, or -');
  }
  if (typeof label !== 'string') {
    throw new TypeError('Invalid label: must be a string');
  }
  const cleanLabel = label
    .replace(/[\r\n\x00-\x1f\x7f]/g, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/[\[\]<>`*_~!]/g, '\\$&');

  return `[${cleanLabel}](https://video2url.com/v/${slug})`;
}

export { Video2URL, Video2URLError } from './client.js';
