/** A config image path (`images/logo.png`) under the site's base, or a logo saved in Settings (a data: URL) as it is. */
export function assetUrl(path: string): string {
  return /^(data:|blob:|https?:)/.test(path) ? path : `${import.meta.env.BASE_URL}${path}`;
}
