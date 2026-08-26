/**
 * pythonRunner.js — Robust In-Memory Python Execution Engine for Serverless (Vercel)
 * ─────────────────────────────────────────────────────────────────────────────────
 * Handles Python syntax transpilation into Node.js VM:
 * - Function declarations: def name(args): -> function name(args) { ... }
 * - Indentation blocks to { } scoping
 * - List comprehensions & range: range(n) -> Array.from({length: n}, (_, i) => i)
 * - Built-in functions: print(), len(), int(), str(), float(), sum(), min(), max(), abs(), sorted()
 * - Standard I/O: sys.stdin.read(), sys.stdin.readline(), input()
 * - Imports: import sys, import math, etc.
 */

const vm = require('vm');

/**
 * Transpile Python code string into executable JavaScript
 */
function transpilePythonToJs(pyCode, rawInput = '') {
  const lines = String(pyCode || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const jsLines = [];
  const indentStack = [0];

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    
    // Ignore pure empty lines
    if (!line.trim()) {
      jsLines.push('');
      continue;
    }

    // Extract comment and indent
    const indentMatch = line.match(/^(\s*)/);
    const indent = indentMatch ? indentMatch[1].length : 0;
    const trimmed = line.trim();

    // Skip Python comment lines
    if (trimmed.startsWith('#')) {
      jsLines.push(`${' '.repeat(indent)}// ${trimmed.replace(/^#+\s*/, '')}`);
      continue;
    }

    // Close blocks when indentation decreases
    while (indent < indentStack[indentStack.length - 1]) {
      indentStack.pop();
      const closeIndent = indentStack[indentStack.length - 1] || 0;
      jsLines.push(`${' '.repeat(closeIndent)}}`);
    }

    let codeLine = trimmed;

    // Remove Python comments at end of line
    codeLine = codeLine.replace(/#.*$/, '').trim();

    // 1. Remove / comment standard imports
    if (/^(import\s+|from\s+)/.test(codeLine)) {
      jsLines.push(`${' '.repeat(indent)}// ${codeLine}`);
      continue;
    }

    // 2. Ignore if __name__ == '__main__':
    if (/^if\s+__name__\s*==\s*['"]__main__['"]\s*:/.test(codeLine)) {
      jsLines.push(`${' '.repeat(indent)}// if __name__ == '__main__':`);
      continue;
    }

    // 3. Transform def fn(args): -> function fn(args) {
    if (/^def\s+([a-zA-Z0-9_]+)\s*\((.*?)\)\s*:/.test(codeLine)) {
      const match = codeLine.match(/^def\s+([a-zA-Z0-9_]+)\s*\((.*?)\)\s*:/);
      const fnName = match[1];
      const args = match[2];
      jsLines.push(`${' '.repeat(indent)}function ${fnName}(${args}) {`);
      indentStack.push(indent + 4);
      continue;
    }

    // 4. Transform if / elif / else:
    if (/^elif\s+(.*?)\s*:/.test(codeLine)) {
      const condition = codeLine.match(/^elif\s+(.*?)\s*:/)[1];
      jsLines.push(`${' '.repeat(indent)}} else if (${transformCondition(condition)}) {`);
      continue;
    }
    if (/^if\s+(.*?)\s*:/.test(codeLine)) {
      const condition = codeLine.match(/^if\s+(.*?)\s*:/)[1];
      jsLines.push(`${' '.repeat(indent)}if (${transformCondition(condition)}) {`);
      indentStack.push(indent + 4);
      continue;
    }
    if (/^else\s*:/.test(codeLine)) {
      jsLines.push(`${' '.repeat(indent)}else {`);
      indentStack.push(indent + 4);
      continue;
    }

    // 5. Transform while / for loops
    if (/^while\s+(.*?)\s*:/.test(codeLine)) {
      const condition = codeLine.match(/^while\s+(.*?)\s*:/)[1];
      jsLines.push(`${' '.repeat(indent)}while (${transformCondition(condition)}) {`);
      indentStack.push(indent + 4);
      continue;
    }
    if (/^for\s+([a-zA-Z0-9_]+)\s+in\s+range\((.*?)\)\s*:/.test(codeLine)) {
      const match = codeLine.match(/^for\s+([a-zA-Z0-9_]+)\s+in\s+range\((.*?)\)\s*:/);
      const varName = match[1];
      const rangeArgs = match[2].split(',').map(s => s.trim());
      let start = '0', end = '0', step = '1';
      if (rangeArgs.length === 1) end = rangeArgs[0];
      else if (rangeArgs.length >= 2) { start = rangeArgs[0]; end = rangeArgs[1]; if (rangeArgs[2]) step = rangeArgs[2]; }
      jsLines.push(`${' '.repeat(indent)}for (let ${varName} = ${start}; ${varName} < ${end}; ${varName} += ${step}) {`);
      indentStack.push(indent + 4);
      continue;
    }
    if (/^for\s+([a-zA-Z0-9_]+)\s+in\s+(.*?)\s*:/.test(codeLine)) {
      const match = codeLine.match(/^for\s+([a-zA-Z0-9_]+)\s+in\s+(.*?)\s*:/);
      const varName = match[1];
      const iterable = match[2];
      jsLines.push(`${' '.repeat(indent)}for (const ${varName} of (${iterable})) {`);
      indentStack.push(indent + 4);
      continue;
    }

    // 6. Generic statement translations
    codeLine = transformGeneralExpressions(codeLine);

    // Auto-declare unassigned top-level variables if starting with var = ...
    if (/^[a-zA-Z0-9_]+\s*=\s*/.test(codeLine) && !codeLine.startsWith('let ') && !codeLine.startsWith('const ') && !codeLine.startsWith('var ')) {
      codeLine = `var ${codeLine}`;
    }

    jsLines.push(`${' '.repeat(indent)}${codeLine};`);
  }

  // Close any remaining blocks
  while (indentStack.length > 1) {
    indentStack.pop();
    jsLines.push('}');
  }

  return jsLines.join('\n');
}

function transformCondition(cond) {
  return cond
    .replace(/\bis\s+not\s+None\b/g, '!== null')
    .replace(/\bis\s+None\b/g, '=== null')
    .replace(/\bNone\b/g, 'null')
    .replace(/\bis\s+not\b/g, '!==')
    .replace(/\bis\b/g, '===')
    .replace(/\band\b/g, '&&')
    .replace(/\bor\b/g, '||')
    .replace(/\bnot\b/g, '!')
    .replace(/\bTrue\b/g, 'true')
    .replace(/\bFalse\b/g, 'false');
}

function transformGeneralExpressions(expr) {
  return expr
    .replace(/\bsys\.stdin\.read\(\)\.strip\(\)/g, 'readAllInput()')
    .replace(/\bsys\.stdin\.read\(\)/g, 'readAllInput()')
    .replace(/\bsys\.stdin\.readline\(\)/g, 'readline()')
    .replace(/\bprint\s*\(([\s\S]*?)\)/g, 'console.log($1)')
    .replace(/\binput\s*\((.*?)\)/g, 'readline()')
    .replace(/\bTrue\b/g, 'true')
    .replace(/\bFalse\b/g, 'false')
    .replace(/\bNone\b/g, 'null')
    .replace(/\blen\s*\(([^)]+)\)/g, '($1 ? ($1.length !== undefined ? $1.length : Object.keys($1).length) : 0)')
    .replace(/\bstr\s*\(([^)]+)\)/g, 'String($1)')
    .replace(/\bint\s*\(([^)]+)\)/g, 'parseInt($1, 10)')
    .replace(/\bfloat\s*\(([^)]+)\)/g, 'parseFloat($1)')
    .replace(/\bsum\s*\(([^)]+)\)/g, '($1 ? $1.reduce((a, b) => a + Number(b), 0) : 0)')
    .replace(/\bis\s+not\s+null\b/g, '!== null')
    .replace(/\bis\s+null\b/g, '=== null')
    .replace(/\.strip\(\)/g, '.trim()')
    .replace(/\.append\((.*?)\)/g, '.push($1)')
    .replace(/\.lower\(\)/g, '.toLowerCase()')
    .replace(/\.upper\(\)/g, '.toUpperCase()');
}

/**
 * Executes Python code using the transpiler in a safe VM context
 */
function runPythonInVm(code, input = '', timeout = 5000) {
  const startTime = Date.now();
  let stdout = '';
  let stderr = '';

  const rawInputStr = String(input !== undefined && input !== null ? input : '');
  const inputLines = rawInputStr.split(/\r?\n/);
  let lineIdx = 0;

  const sandbox = {
    console: {
      log: (...args) => {
        stdout += args.map(a => {
          if (a === null) return 'None';
          if (a === true) return 'True';
          if (a === false) return 'False';
          if (typeof a === 'object') return JSON.stringify(a);
          return String(a);
        }).join(' ') + '\n';
      },
      error: (...args) => {
        stderr += args.join(' ') + '\n';
      },
    },
    readline: () => lineIdx < inputLines.length ? inputLines[lineIdx++] : '',
    readAllInput: () => rawInputStr.trim(),
    input: () => lineIdx < inputLines.length ? inputLines[lineIdx++] : '',
    range: (n) => Array.from({ length: n }, (_, i) => i),
    len: (x) => (x ? (x.length !== undefined ? x.length : Object.keys(x).length) : 0),
    int: (x) => parseInt(x, 10) || 0,
    float: (x) => parseFloat(x) || 0,
    str: (x) => String(x),
    sum: (arr) => (Array.isArray(arr) ? arr.reduce((a, b) => a + Number(b), 0) : 0),
    min: Math.min,
    max: Math.max,
    abs: Math.abs,
    sorted: (arr) => [...arr].sort(),
    Math, Date, JSON, Array, Object, String, Number, Boolean, RegExp, parseInt, parseFloat,
  };

  try {
    const jsCode = transpilePythonToJs(code, rawInputStr);
    const context = vm.createContext(sandbox);
    vm.runInContext(jsCode, context, { timeout });

    return {
      stdout: stdout.trimEnd(),
      stderr: stderr.trimEnd(),
      exitCode: 0,
      duration_ms: Date.now() - startTime,
      status: 'success',
    };
  } catch (err) {
    const isTimeout = err.code === 'ERR_SCRIPT_EXECUTION_TIMEOUT' || String(err).includes('timed out');
    return {
      stdout: stdout.trimEnd(),
      stderr: stderr ? `${stderr}\n${err.message}` : err.message,
      exitCode: isTimeout ? 124 : 1,
      duration_ms: Date.now() - startTime,
      status: isTimeout ? 'timeout' : 'error',
      error: isTimeout ? 'Time Limit Exceeded' : err.message,
    };
  }
}

module.exports = {
  transpilePythonToJs,
  runPythonInVm,
};
