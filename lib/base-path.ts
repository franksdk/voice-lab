export function appPath(path: string) {
  const prefix = typeof document === 'undefined' ? '' : document.documentElement.dataset.basePath || '';
  return prefix + path;
}
