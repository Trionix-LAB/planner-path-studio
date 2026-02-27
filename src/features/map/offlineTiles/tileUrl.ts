const pickSubdomain = (subdomains: string | string[] | undefined, x: number, y: number): string => {
  if (!subdomains) return '';
  const list = Array.isArray(subdomains) ? subdomains : subdomains.split('');
  if (list.length === 0) return '';
  const index = Math.abs((x + y) % list.length);
  return list[index] ?? '';
};

export const resolveTileUrl = (
  template: string,
  tile: { z: number; x: number; y: number },
  subdomains?: string | string[],
): string => {
  const subdomain = pickSubdomain(subdomains, tile.x, tile.y);
  return template
    .replace(/\{z\}/g, String(tile.z))
    .replace(/\{x\}/g, String(tile.x))
    .replace(/\{y\}/g, String(tile.y))
    .replace(/\{s\}/g, subdomain);
};
