// Shared state for chat routes
let piManager = null;

export function setPiManager(manager) {
  piManager = manager;
}

export function getPiManager() {
  return piManager;
}
