import { z } from 'zod';

const LOOPBACK_HOSTS = new Set(['127.0.0.1', '[::1]', 'localhost']);

export const redirectUriSchema = z
  .url()
  .max(2_048)
  .refine((value): boolean => {
    const parsed = URL.parse(value);
    return (
      parsed !== null &&
      !value.includes('*') &&
      parsed.hash === '' &&
      parsed.username === '' &&
      parsed.password === ''
    );
  }, 'Redirect URIs must be exact and cannot contain wildcards, credentials, or fragments')
  .refine((value): boolean => {
    const parsed = URL.parse(value);
    return (
      parsed?.protocol === 'https:' ||
      (parsed?.protocol === 'http:' && LOOPBACK_HOSTS.has(parsed.hostname))
    );
  }, 'Redirect URIs must use HTTPS, except for HTTP loopback development clients');
