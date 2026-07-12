// Shared state for chat routes
let piManager = null;
let entityBufferMap = new Map();

export function setPiManager(manager) {
  piManager = manager;
}

export function getPiManager() {
  return piManager;
}

export function setEntityBuffer(sessionId,entityBuffer){
  if(sessionId)  
      entityBufferMap.set(sessionId,entityBuffer)
}
export function getEntityBuffer(sessionId){
    return sessionId?? entityBufferMap.get(sessionId)
}
export function removeEntityBuffer(sessionId){
    if(sessionId)
      entityBufferMap.delete(sessionId)
}
