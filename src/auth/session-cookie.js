export const SESSION_COOKIE_NAME = 'rastreio_session';

function decodeCookieValue(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function parseCookieHeader(headerValue) {
  if (typeof headerValue !== 'string' || headerValue.trim().length === 0) {
    return {};
  }

  return headerValue.split(';').reduce((cookies, part) => {
    const separatorIndex = part.indexOf('=');
    if (separatorIndex <= 0) {
      return cookies;
    }

    const name = part.slice(0, separatorIndex).trim();
    const rawValue = part.slice(separatorIndex + 1).trim();
    if (!name) {
      return cookies;
    }

    cookies[name] = decodeCookieValue(rawValue);
    return cookies;
  }, {});
}

export function readSessionTokenFromCookieHeader(headerValue) {
  const cookies = parseCookieHeader(headerValue);
  return cookies[SESSION_COOKIE_NAME] ?? null;
}
