/** URL of a file in `explorer/public/`, respecting the site base (`vite build --base=/sub/path/`). */
export function assetUrl(path: string): string {
  return `${import.meta.env.BASE_URL.replace(/\/?$/, '/')}${path.replace(/^\//, '')}`;
}
