import { createRequire } from 'node:module'
import { existsSync, readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import ts from 'typescript'

const cache = new Map()
export function loadProjectModule(path) {
  const absolute = resolve(path)
  if (cache.has(absolute)) return cache.get(absolute).exports
  const module = { exports: {} }
  cache.set(absolute, module)
  const source = readFileSync(absolute, 'utf8')
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } })
  const localRequire = (request) => {
    if (!request.startsWith('.')) return createRequire(absolute)(request)
    const base = resolve(dirname(absolute), request)
    const file = [base, `${base}.ts`, `${base}.tsx`, `${base}.json`].find(existsSync)
    if (!file) throw new Error(`Cannot resolve ${request} from ${absolute}`)
    return file.endsWith('.json') ? JSON.parse(readFileSync(file, 'utf8')) : loadProjectModule(file)
  }
  new Function('require', 'module', 'exports', outputText)(localRequire, module, module.exports)
  return module.exports
}
