'use strict';
// Mutate an in-memory copy only; the runtime module and shared files stay intact.
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const modelFile = path.resolve(__dirname, '../office_flow_model.js');
const suiteFile = path.join(__dirname, 'v16a_model_test.cjs');
const original = fs.readFileSync(modelFile, 'utf8');
const condition = "if (ended !== null && (s || flow.status !== 'expired'))";
assert.ok(original.includes(condition));
const mutated = original.replace(condition, 'if (ended !== null)');
const exportsObject = { exports: {} }, modelRequire = createRequire(modelFile);
vm.runInNewContext(mutated, { module: exportsObject, require: modelRequire });
const suiteRequire = createRequire(suiteFile), failures = [];
function localRequire(name) { return name === '../office_flow_model' ? exportsObject.exports : suiteRequire(name); }
localRequire.resolve = suiteRequire.resolve;
let caught;
try {
  const run = vm.runInThisContext('(function(require,console){' + fs.readFileSync(suiteFile, 'utf8') + '\n})', { filename: suiteFile });
  run(localRequire, { log() {}, error(name) { failures.push(name); } });
} catch (error) { caught = error; }
assert.equal(caught?.code, 'ERR_ASSERTION');
assert.deepEqual(failures, ['expiry is no fabricated result']);
assert.equal(fs.readFileSync(modelFile, 'utf8'), original);
console.log(JSON.stringify({ ok: true, mutationsRejected: 1, condition: 'expiry must not generate result packets', runtimeFileUnchanged: true }));
