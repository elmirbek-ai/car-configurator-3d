import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const pages = await (await fetch('http://127.0.0.1:9222/json')).json()
mkdirSync('codex-reports/visuals/stage-7-2-wheels', { recursive: true })
const page = pages.find((item) => item.type === 'page' && (item.url === 'about:blank' || item.url === 'http://127.0.0.1:4173/'))
if (!page) throw new Error('Chrome debug page is unavailable')
const socket = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((done, reject) => {
  socket.addEventListener('open', done, { once: true })
  socket.addEventListener('error', reject, { once: true })
})
let nextId = 1
const pending = new Map()
const browserErrors = []
const failedResponses = []
socket.addEventListener('message', (event) => {
  const packet = JSON.parse(event.data)
  if (packet.id) {
    const call = pending.get(packet.id)
    if (!call) return
    pending.delete(packet.id)
    if (packet.error) call.reject(new Error(JSON.stringify(packet.error)))
    else call.resolve(packet.result)
  } else if (packet.method === 'Runtime.exceptionThrown') {
    browserErrors.push(packet.params.exceptionDetails.text)
  } else if (packet.method === 'Log.entryAdded' && packet.params.entry.level === 'error') {
    browserErrors.push({ text: packet.params.entry.text, url: packet.params.entry.url ?? null })
  } else if (packet.method === 'Network.responseReceived' && packet.params.response.status >= 400) {
    failedResponses.push({ url: packet.params.response.url, status: packet.params.response.status })
  }
})
function send(method, params = {}) {
  const id = nextId++
  return new Promise((done, reject) => {
    pending.set(id, { resolve: done, reject })
    socket.send(JSON.stringify({ id, method, params }))
  })
}
async function evaluate(expression) {
  const response = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.text)
  return response.result.value
}
const sleep = (ms) => new Promise((done) => setTimeout(done, ms))
async function waitFor(expression, timeout = 60000) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    if (await evaluate(expression)) return
    await sleep(600)
  }
  throw new Error('Timed out: ' + expression)
}
async function click(expression) {
  if (!await evaluate(expression)) throw new Error('Element missing: ' + expression)
  await sleep(500)
}
async function screenshot(name) {
  const result = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  writeFileSync(resolve('codex-reports/visuals/stage-7-2-wheels/' + name + '.png'), Buffer.from(result.data, 'base64'))
}
await send('Page.enable')
await send('Runtime.enable')
await send('Log.enable')
await send('Network.enable')
await send('Page.navigate', { url: 'http://127.0.0.1:4173/' })
await waitFor("Boolean(document.querySelector('.accordion-trigger'))")
await click("(() => { const b=[...document.querySelectorAll('.accordion-trigger')].find(x=>x.textContent.includes('Vehicle')); b?.click(); return !!b })()")
await click("(() => { const b=[...document.querySelectorAll('.vehicle-option')].find(x=>x.textContent.includes('BMW M5 F90')); b?.click(); return !!b })()")
await waitFor("Boolean(document.querySelector('canvas')) && !Boolean(document.querySelector('.viewer-overlay'))")
await click("(() => { const b=[...document.querySelectorAll('.accordion-trigger')].find(x=>x.textContent.includes('Wheels')); b?.click(); return !!b })()")
const options = await evaluate("[...document.querySelectorAll('.wheel-design-options button')].map(b=>({text:b.textContent,disabled:b.disabled}))")
await screenshot('chrome-bmw-original')
for (const [name, label] of [['double-spoke','Double-Spoke'],['y-spoke','Y-Spoke'],['deep-concave','Deep Concave']]) {
  await click("(() => { const b=[...document.querySelectorAll('.wheel-design-options button')].find(x=>x.textContent==='" + label + "'); b?.click(); return !!b })()")
  await sleep(700)
  await screenshot('chrome-bmw-' + name)
}
await click("(() => { const b=[...document.querySelectorAll('[aria-label=\"Wheel finish\"] button')].find(x=>x.textContent==='Graphite'); b?.click(); return !!b })()")
await screenshot('chrome-bmw-deep-concave-graphite')
const status = await evaluate("({selectedVehicle:[...document.querySelectorAll('.vehicle-option')].find(x=>x.getAttribute('aria-pressed')==='true')?.textContent,selectedDesign:[...document.querySelectorAll('.wheel-design-options button')].find(x=>x.getAttribute('aria-pressed')==='true')?.textContent,selectedFinish:[...document.querySelectorAll('[aria-label=\"Wheel finish\"] button')].find(x=>x.getAttribute('aria-pressed')==='true')?.textContent,canvas:!!document.querySelector('canvas'),modelError:document.querySelector('.viewer-overlay')?.textContent??null,plateDisabled:document.querySelector('#plate-panel fieldset')?.disabled??null,webgl2:!!document.querySelector('canvas')?.getContext('webgl2')})")
const otherVehicles = []
for (const [name, label, design] of [
  ['concept', 'Concept GT', 'Deep Concave'],
  ['camry', 'Toyota Camry 2018', 'Double-Spoke'],
]) {
  await click("(() => { const b=[...document.querySelectorAll('.accordion-trigger')].find(x=>x.textContent.includes('Vehicle')); b?.click(); return !!b })()")
  await click("(() => { const b=[...document.querySelectorAll('.vehicle-option')].find(x=>x.textContent.includes('" + label + "')); b?.click(); return !!b })()")
  await waitFor("Boolean(document.querySelector('canvas')) && !Boolean(document.querySelector('.viewer-overlay'))")
  await click("(() => { const b=[...document.querySelectorAll('.accordion-trigger')].find(x=>x.textContent.includes('Wheels')); b?.click(); return !!b })()")
  await screenshot('chrome-' + name + '-original')
  await click("(() => { const b=[...document.querySelectorAll('.wheel-design-options button')].find(x=>x.textContent==='" + design + "'); b?.click(); return !!b })()")
  await screenshot('chrome-' + name + '-replacement')
  otherVehicles.push(await evaluate("({vehicle:[...document.querySelectorAll('.vehicle-option')].find(x=>x.getAttribute('aria-pressed')==='true')?.textContent,design:[...document.querySelectorAll('.wheel-design-options button')].find(x=>x.getAttribute('aria-pressed')==='true')?.textContent,modelError:document.querySelector('.viewer-overlay')?.textContent??null})"))
}
const report = { browser: 'Google Chrome headless via CDP', url: 'http://127.0.0.1:4173/', options, status, otherVehicles, browserErrors, failedResponses }
writeFileSync('codex-reports/stage-7-2-chrome-qa.json', JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))
socket.close()
if (status.modelError || !status.webgl2 || status.plateDisabled !== true ||
    otherVehicles.some((vehicle) => vehicle.modelError) ||
    failedResponses.some((item) => !item.url.endsWith('/favicon.ico'))) process.exitCode = 1
