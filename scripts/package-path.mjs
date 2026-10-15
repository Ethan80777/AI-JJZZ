export const normalizeArchivePath = name => name.replaceAll('\\', '/');
export const nativeArchivePath = (name, pathApi) => pathApi.normalize(name.slice(1));
