const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, mocks = {}, globals = {}) {
  const absolute = path.resolve(file);
  const code = ts.transpileModule(fs.readFileSync(absolute, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const module = { exports: {} };
  function localRequire(name) {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (name.startsWith('@/') || name.startsWith('.')) {
      const base = name.startsWith('@/') ? path.resolve('src', name.slice(2)) : path.resolve(path.dirname(absolute), name);
      const target = [base, base + '.ts', base + '.tsx'].find(p => fs.existsSync(p) && fs.statSync(p).isFile());
      return load(target, mocks, globals);
    }
    return require(name);
  }
  vm.runInNewContext(code, { module, exports: module.exports, require: localRequire, process: { env: {} }, URL, AbortSignal, fetch: () => { throw new Error('Unexpected network request in test'); }, ...globals }, { filename: absolute });
  return module.exports;
}
function response() {
  return { code: 200, headers: {}, body: null, status(code) { this.code = code; return this; }, setHeader(name, value) { this.headers[name] = value; }, json(body) { this.body = body; return this; } };
}
module.exports = { load, response };
