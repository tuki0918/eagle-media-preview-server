let currentLibraryName = "";

export function getLibraryName() {
  return currentLibraryName;
}

export function setLibraryName(name: string) {
  currentLibraryName = name;
}
