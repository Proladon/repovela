import type { Remote } from './types';

export function repositoryWebUrl(remote: string): string | null {
  const value = remote.trim();
  if (!value || /[\u0000-\u001f\u007f]/.test(value)) return null;
  const scp = /^([^@\s/:]+)@([^\s/:]+):(.+)$/.exec(value);
  try {
    const source = new URL(scp ? `ssh://${scp[1]}@${scp[2]}/${scp[3]}` : value);
    if (!['http:', 'https:', 'ssh:', 'git:'].includes(source.protocol) || !source.hostname)
      return null;
    const pathname = source.pathname.replace(/\/+$/, '').replace(/\.git$/, '');
    if (!pathname || pathname === '/') return null;
    const web = new URL(
      source.protocol === 'http:' || source.protocol === 'https:'
        ? source.origin
        : `https://${source.hostname}`,
    );
    web.pathname = pathname;
    return web.href;
  } catch {
    return null;
  }
}

export function repositoryWebLinks(remotes: Remote[] = []) {
  return remotes
    .flatMap((remote) => {
      const url = repositoryWebUrl(remote.url);
      return url ? [{ name: remote.name, url }] : [];
    })
    .sort((a, b) => Number(b.name === 'origin') - Number(a.name === 'origin'));
}
