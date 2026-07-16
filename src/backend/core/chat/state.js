
// Shared state for chat routes
const logLevelMap = new Map([['ERROR',1],['WARN',2],['INFO',3],['DEBUG',4],['TRACE',5],['FINE',6]])

let piManager = null;
let entityBufferMap = new Map();
let logLevel = undefined

export function setPiManager(manager) {
  piManager = manager;
}

export function getPiManager() {
  return piManager;
}

export function setEntityBuffer(sessionId,entityBuffer){
  if(sessionId)  
      entityBufferMap.set(sessionId,entityBuffer)
  if(fullDebug()) console.log('setting entity buffer: ',sessionId,entityBuffer)
}
export function getEntityBuffer(sessionId){
    return sessionId? entityBufferMap.get(sessionId) : undefined
}

export function removeEntityBuffer(sessionId){
    if(sessionId)
      entityBufferMap.delete(sessionId)
    if(fullDebug()) console.log('removing entity buffer: ',sessionId)
}

export function fullDebug() {return getLogLevel() >= 6}
export function isTrace() {return getLogLevel() >= 5}
export function isDebug() {return getLogLevel() >= 4}
export function isInfo() {return getLogLevel() >= 3}
export function isWarn() {return getLogLevel() >= 2}
export function isErr() {return getLogLevel() >= 1}

export function getLogLevel() {
  if(logLevel === undefined)
    logLevel = logLevelMap.get((process.env.LOG_LEVEL || 'INFO').toUpperCase())??3
  return logLevel;
}