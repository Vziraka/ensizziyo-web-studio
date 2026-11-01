export const deskPath=path=>path.startsWith('/')?(document.documentElement.dataset.base??'')+path:path;
