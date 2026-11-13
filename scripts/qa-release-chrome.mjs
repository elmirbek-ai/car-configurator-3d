import { mkdirSync, writeFileSync } from 'node:fs'

const pages = await (await fetch('http://127.0.0.1:9222/json')).json()
mkdirSync('codex-reports', { recursive: true })
const page = pages.find((item) => item.type === 'page' && item.url === 'http://127.0.0.1:4173/')
if (!page) throw new Error('Preview page is not open in Chrome')
const socket = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }) })
let id = 0
const pending = new Map()
const consoleErrors = []
const failedResponses = []
socket.addEventListener('message', ({ data }) => {
  const item = JSON.parse(data)
  if (item.id) { const p = pending.get(item.id); if (p) { pending.delete(item.id); item.error ? p.reject(Error(item.error.message)) : p.resolve(item.result) } }
  if (item.method === 'Runtime.exceptionThrown') consoleErrors.push({ text: item.params.exceptionDetails.text, description: item.params.exceptionDetails.exception?.description, url: item.params.exceptionDetails.url })
  if (item.method === 'Log.entryAdded' && item.params.entry.level === 'error') consoleErrors.push(item.params.entry.text)
  if (item.method === 'Network.responseReceived' && item.params.response.status >= 400) failedResponses.push({ status: item.params.response.status, url: item.params.response.url })
})
const send = (method, params = {}) => new Promise((resolve, reject) => { const next = ++id; pending.set(next, { resolve, reject }); socket.send(JSON.stringify({ id: next, method, params })) })
const evaluate = async (expression) => { const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (result.exceptionDetails) throw Error(result.exceptionDetails.text); return result.result.value }
const pause = (ms = 500) => new Promise((resolve) => setTimeout(resolve, ms))
const waitFor = async (expression, timeout = 60000) => {
  const started = Date.now()
  while (Date.now() - started < timeout) {
    if (await evaluate(expression)) return
    await pause(500)
  }
  throw Error('Timed out: ' + expression)
}
const action = async (expression) => { if (!await evaluate(expression)) throw Error('Missing element: ' + expression); await pause() }
const open = async (label) => action(`(() => { const b=[...document.querySelectorAll('.accordion-trigger')].find(x=>x.textContent.includes(${JSON.stringify(label)})); if(!b) return false; if(b.getAttribute('aria-expanded')!=='true') b.click(); return true })()`)
const select = async (selector, label) => action(`(() => { const b=[...document.querySelectorAll(${JSON.stringify(selector)})].find(x=>x.textContent.trim()===${JSON.stringify(label)}); b?.click(); return !!b })()`)
await send('Runtime.enable'); await send('Log.enable'); await send('Network.enable'); await send('Page.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1365, height: 900, deviceScaleFactor: 1, mobile: false })
await send('Page.navigate', { url: 'http://127.0.0.1:4173/' })
await waitFor("Boolean(document.querySelector('.accordion-trigger'))")
const results = []
for (const name of ['Concept GT', 'Toyota Camry 2018', 'BMW M5 F90']) {
  await open('Vehicle')
  await action(`(() => { const b=[...document.querySelectorAll('.vehicle-option')].find(x=>x.textContent.includes(${JSON.stringify(name)})); b?.click(); return !!b })()`)
  await pause(1500)
  await open('Exterior')
  await action("(() => { const b=[...document.querySelectorAll('[aria-label=\"Paint color\"] button')].find(x=>!x.disabled && x.getAttribute('aria-pressed')==='false'); b?.click(); return !!b })()")
  await select('[aria-label="Body finish"] button', 'Matte')
  await open('Wheels')
  await select('.wheel-design-options button', 'Double-Spoke')
  await select('[aria-label="Wheel finish"] button', 'Graphite')
  await action("(() => { const b=[...document.querySelectorAll('button')].find(x=>x.textContent.includes('Save configuration')); b?.click(); return !!b })()")
  const saved = await evaluate("({key:Object.keys(localStorage).find(x=>x.includes('car-configurator')),notice:document.querySelector('.notice')?.textContent,design:[...document.querySelectorAll('.wheel-design-options button')].find(x=>x.getAttribute('aria-pressed')==='true')?.textContent,finish:[...document.querySelectorAll('[aria-label=\"Wheel finish\"] button')].find(x=>x.getAttribute('aria-pressed')==='true')?.textContent,bodyFinish:[...document.querySelectorAll('[aria-label=\"Body finish\"] button')].find(x=>x.getAttribute('aria-pressed')==='true')?.textContent,modelError:document.querySelector('.viewer-overlay')?.textContent??null})")
  await evaluate("window.__releaseExport=null; window.__releaseCreateObjectURLOriginal ??= URL.createObjectURL; URL.createObjectURL=(b)=>{if(b.size<10000) b.text().then(t=>{try{const v=JSON.parse(t);if(v.schemaVersion&&v.vehicleId)window.__releaseExport=v}catch{}}); return window.__releaseCreateObjectURLOriginal(b)}")
  await action("(() => { const b=[...document.querySelectorAll('button')].find(x=>x.textContent.includes('Export JSON')); b?.click(); return !!b })()")
  await pause()
  const exported = await evaluate("({vehicleId:window.__releaseExport?.vehicleId,schemaVersion:window.__releaseExport?.schemaVersion})")
  await action("(() => { const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='Reset'); b?.click(); return !!b })()")
  const reset = await evaluate("({notice:document.querySelector('.notice')?.textContent,matte:[...document.querySelectorAll('[aria-label=\"Body finish\"] button')].find(x=>x.textContent==='Matte')?.getAttribute('aria-pressed')})")
  results.push({ name, saved, exported, reset })
}
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
await pause(1000)
const mobile = await evaluate("({innerWidth,scrollWidth:document.documentElement.scrollWidth,canvas:!!document.querySelector('canvas'),sidebar:!!document.querySelector('.sidebar'),modelError:document.querySelector('.viewer-overlay')?.textContent??null})")
const report = { results, mobile, consoleErrors, failedResponses }
writeFileSync('codex-reports/stage-9-1-browser-qa.json', JSON.stringify(report, null, 2))
console.log(JSON.stringify({ ...report, consoleErrors: report.consoleErrors.slice(0, 5), consoleErrorCount: report.consoleErrors.length }, null, 2))
socket.close()
if (results.some(x => !x.saved.key || x.saved.modelError || x.exported.vehicleId !== x.name.toLowerCase().replaceAll(' ', '-') || x.reset.matte === 'true') || mobile.scrollWidth > mobile.innerWidth || mobile.modelError || consoleErrors.length || failedResponses.some(x => !x.url.endsWith('/favicon.ico'))) process.exitCode = 1
