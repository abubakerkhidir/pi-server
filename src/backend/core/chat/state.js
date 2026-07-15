// Shared state for chat routes
let piManager = null;
let entityBufferMap = new Map();
let fullDebug = undefined

export function setPiManager(manager) {
  piManager = manager;
}

export function getPiManager() {
  return piManager;
}

export function setEntityBuffer(sessionId,entityBuffer){
  if(sessionId)  
      entityBufferMap.set(sessionId,entityBuffer)
  console.log('setting entity buffer: ',sessionId,entityBuffer)
}
export function getEntityBuffer(sessionId){
    return sessionId? entityBufferMap.get(sessionId) : undefined
}

export function removeEntityBuffer(sessionId){
    if(sessionId)
      entityBufferMap.delete(sessionId)
    console.log('removing entity buffer: ',sessionId)
}

export function fullDebug() {
  if(fullDebug === undefined)
    fullDebug = (process.env.FULL_DEBUG || 'false') === true
  return fullDebug;
}