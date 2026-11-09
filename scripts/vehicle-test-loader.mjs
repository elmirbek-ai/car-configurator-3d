import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
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
  const localRequire = (request) => request.startsWith('.')
    ? loadProjectModule(resolve(dirname(absolute), `${request}.ts`))
    : createRequire(absolute)(request)
  new Function('require', 'module', 'exports', outputText)(localRequire, module, module.exports)
  return module.exports
}
