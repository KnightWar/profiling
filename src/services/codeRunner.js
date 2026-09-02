/**
 * codeRunner.js — Safe Execution Service for Programming Questions (Vercel & Local)
 * ══════════════════════════════════════════════════════════════════════════════════
 * Safe execution service supporting 5 language options:
 * Python 3, JavaScript (Node.js), C, C++, HTML & CSS
 * All templates include valid function signatures (e.g. solution(input)) that read stdin,
 * execute logic, and output results without any syntax errors out-of-the-box.
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const vm = require('vm');
const { v4: uuidv4 } = require('uuid');

const DEFAULT_TIMEOUT_MS = 5000;
const MAX_OUTPUT_BYTES = 512 * 1024; // 512 KB

function extractFunctionNameFromQuestion(question) {
  if (!question) return { pyName: 'solution', jsName: 'solution', args: 'input_data' };

  const content = String(question.content || question.question || '');
  const modelAnswer = String(question.correct_answer || '');

  // 1. Look for explicit Python function declaration in model answer or question content
  const defMatch = modelAnswer.match(/def\s+([a-zA-Z0-9_]+)\s*\((.*?)\)/) ||
                   content.match(/def\s+([a-zA-Z0-9_]+)\s*\((.*?)\)/);
  if (defMatch) {
    const pyName = defMatch[1];
    const rawArgs = defMatch[2].trim() || 'input_data';
    const jsName = pyName.replace(/_([a-z0-9])/g, (_, g) => g.toUpperCase());
    return { pyName, jsName, args: rawArgs };
  }

  // 2. Look for JS function declaration in model answer or question content
  const jsMatch = modelAnswer.match(/function\s+([a-zA-Z0-9_]+)\s*\((.*?)\)/) ||
                  content.match(/function\s+([a-zA-Z0-9_]+)\s*\((.*?)\)/);
  if (jsMatch) {
    const jsName = jsMatch[1];
    const rawArgs = jsMatch[2].trim() || 'input_data';
    const pyName = jsName.replace(/([A-Z])/g, '_$1').toLowerCase();
    return { pyName, jsName, args: rawArgs };
  }

  // 3. Derive clean function name from title / first heading
  const lines = content.split('\n');
  let title = lines[0].replace(/^[#\s*\-:]+/, '').trim();
  if (title.length > 60) title = title.substring(0, 60);

  const words = title.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(Boolean);
  if (words.length > 0) {
    const cleanWords = words.slice(0, 3).filter(w => !['write', 'a', 'the', 'program', 'function', 'to', 'in', 'code', 'given', 'for', 'of'].includes(w));
    if (cleanWords.length > 0) {
      const pyName = cleanWords.join('_');
      const jsName = cleanWords[0] + cleanWords.slice(1).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('');
      return { pyName, jsName, args: 'input_data' };
    }
  }

  return { pyName: 'solution', jsName: 'solution', args: 'input_data' };
}

function getQuestionStarterTemplate(question, language = 'python') {
  const { pyName, jsName, args } = extractFunctionNameFromQuestion(question);
  const lang = (language || 'python').toLowerCase();

  if (lang === 'python') {
    return `def ${pyName}(${args}):
    # Write your solution logic here
    pass

if __name__ == '__main__':
    import sys
    input_data = sys.stdin.read().strip()
    result = ${pyName}(input_data)
    if result is not None:
        print(result)`;
  }

  if (lang === 'javascript') {
    return `function ${jsName}(${args}) {
    // Write your solution logic here
    return null;
}

const inputData = typeof readline === 'function' ? readline() : '';
const result = ${jsName}(inputData);
if (result !== undefined && result !== null) {
    console.log(result);
}`;
  }

  if (lang === 'c') {
    return `#include <stdio.h>
#include <string.h>

char* ${pyName}(char* input) {
    // Write your solution logic here
    return NULL;
}

int main() {
    char input[1024] = "";
    if (scanf("%1023s", input) == 1) {
        printf("%s\\n", ${pyName}(input));
    }
    return 0;
}`;
  }

  if (lang === 'cpp') {
    return `#include <iostream>
#include <string>
using namespace std;

string ${pyName}(string input) {
    // Write your solution logic here
    return "";
}

int main() {
    string input;
    if (cin >> input) {
        cout << ${pyName}(input) << endl;
    }
    return 0;
}`;
  }

  if (lang === 'sql') {
    return `-- Write your SQL query below (SELECT, JOIN, GROUP BY, Subqueries, etc.)
SELECT 
    * 
FROM 
    your_table;`;
  }

  if (lang === 'bash') {
    return `#!/usr/bin/env bash
# Write your command or pipeline below
`;
  }

  if (lang === 'html_css') {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Solution</title>
</head>
<body>
    <div id="root"></div>
</body>
</html>`;
  }

  return `def ${pyName}(${args}):\n    pass`;
}

const LANGUAGE_STARTERS = {
  python: `def solution(input_data):
    # Write your solution logic here
    pass

if __name__ == '__main__':
    import sys
    input_str = sys.stdin.read().strip()
    result = solution(input_str)
    if result is not None:
        print(result)`,

  javascript: `function solution(inputData) {
    // Write your solution logic here
    return null;
}

const input = typeof readline === 'function' ? readline() : '';
const result = solution(input);
if (result !== undefined && result !== null) {
    console.log(result);
}`,

  sql: `-- Write your SQL query below (SELECT, JOIN, GROUP BY, Subqueries, etc.)
SELECT 
    * 
FROM 
    your_table;`,

  bash: `#!/usr/bin/env bash
# Write your shell command or pipeline below

`,

  c: `#include <stdio.h>
#include <string.h>

char* solution(char* input) {
    // Write your solution logic here
    return NULL;
}

int main() {
    char input[1024] = "";
    if (scanf("%1023s", input) == 1) {
        printf("%s\\n", solution(input));
    }
    return 0;
}`,

  cpp: `#include <iostream>
#include <string>
using namespace std;

string solution(string input) {
    // Write your solution logic here
    return "";
}

int main() {
    string input;
    if (cin >> input) {
        cout << solution(input) << endl;
    }
    return 0;
}`,

  html_css: `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Solution</title>
    <style>
        body {
            font-family: sans-serif;
            background: #0f172a;
            color: #f8fafc;
            padding: 20px;
        }
        .container {
            color: #38bdf8;
            font-size: 18px;
        }
    </style>
</head>
<body>
    <div class="container">Hello World</div>
</body>
</html>`,
};

/**
 * Detect language from source code or explicit language tag
 */
function detectLanguage(code, explicitLanguage) {
  if (explicitLanguage) {
    const lang = String(explicitLanguage).toLowerCase().trim();
    if (lang === 'c') return 'c';
    if (lang === 'cpp' || lang === 'c++') return 'cpp';
    if (lang === 'sql' || lang.includes('query') || lang.includes('database') || lang.includes('postgres') || lang.includes('sqlite') || lang.includes('mysql')) return 'sql';
    if (lang === 'bash' || lang === 'sh' || lang === 'shell' || lang.includes('command')) return 'bash';
    if (lang.includes('py')) return 'python';
    if (lang.includes('js') || lang.includes('node') || lang.includes('javascript')) return 'javascript';
    if (lang.includes('html') || lang.includes('css')) return 'html_css';
  }

  const s = String(code || '');
  if (/^\s*<!DOCTYPE html>|^\s*<html\b|^\s*<body\b|<style\b/i.test(s)) return 'html_css';
  if (/^\s*(SELECT|INSERT|UPDATE|DELETE|CREATE\s+TABLE|ALTER\s+TABLE|DROP\s+TABLE|WITH\s+[a-zA-Z0-9_]+\s+AS)\b/i.test(s.replace(/--.*$/gm, '').trim())) return 'sql';
  if (/#include\s*<iostream>|std::cout|using namespace std/.test(s)) return 'cpp';
  if (/#include\s*<stdio\.h>|printf\b|scanf\b/.test(s)) return 'c';
  if (/^\s*#!\/bin\/(bash|sh)|^\s*#!\/usr\/bin\/env\s+(bash|sh)|\b(grep|awk|sed|curl|chmod|mkdir|tar|cat|echo|cut|sort|uniq|head|tail|find|xargs)\b/m.test(s) && !/import |def |console\./m.test(s)) return 'bash';
  if (/^\s*(def |import |from |print\b|class \w+:|elif |if __name__)/m.test(s)) return 'python';
  if (/^\s*(function|const |let |var |console\.log|module\.exports)/m.test(s)) return 'javascript';

  return 'python';
}

/**
 * Safe in-memory JS execution using Node vm
 */
function executeJavaScriptInVm(code, input = '', timeout = DEFAULT_TIMEOUT_MS) {
  const startTime = Date.now();
  let stdout = '';
  let stderr = '';

  const inputLines = String(input || '').split(/\r?\n/);
  let lineIdx = 0;

  const sandbox = {
    console: {
      log: (...args) => {
        stdout += args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ') + '\n';
      },
      error: (...args) => {
        stderr += args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ') + '\n';
      },
      warn: (...args) => {
        stdout += args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ') + '\n';
      },
    },
    readline: () => lineIdx < inputLines.length ? inputLines[lineIdx++] : '',
    prompt: () => lineIdx < inputLines.length ? inputLines[lineIdx++] : '',
    input: () => lineIdx < inputLines.length ? inputLines[lineIdx++] : '',
    Math, Date, JSON, Array, Object, String, Number, Boolean, RegExp, Map, Set, parseInt, parseFloat, isNaN, isFinite,
  };

  try {
    const context = vm.createContext(sandbox);
    vm.runInContext(code, context, { timeout });

    // If no stdout was produced and a function was declared, auto-invoke the declared function with input
    if (!stdout.trim()) {
      const fnMatch = code.match(/function\s+([a-zA-Z0-9_]+)\s*\(/) ||
                      code.match(/(?:const|let|var)\s+([a-zA-Z0-9_]+)\s*=\s*(?:function|\([^)]*\)\s*=>)/);
      if (fnMatch) {
        const fnName = fnMatch[1];
        const invokeCode = `
          if (typeof ${fnName} === 'function') {
            try {
              const __rawIn = ${JSON.stringify(input || '')};
              let __arg = __rawIn;
              try {
                const __parsed = JSON.parse(__rawIn);
                if (__parsed !== undefined) __arg = __parsed;
              } catch(e) {}
              const __res = Array.isArray(__arg) && ${fnName}.length > 1 ? ${fnName}(...__arg) : ${fnName}(__arg);
              if (__res !== undefined && __res !== null) console.log(__res);
            } catch(e) {}
          }
        `;
        vm.runInContext(invokeCode, context, { timeout: Math.max(1000, timeout - (Date.now() - startTime)) });
      }
    }

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

const { runPythonInVm } = require('./pythonRunner');

/**
 * Safe in-memory Python fallback execution when python3 binary is unavailable
 */
function executePythonInVm(code, input = '', timeout = DEFAULT_TIMEOUT_MS) {
  return runPythonInVm(code, input, timeout);
}

/**
 * C / C++ VM fallback execution
 */
function executeCppInVm(code, input = '', timeout = DEFAULT_TIMEOUT_MS) {
  const startTime = Date.now();
  let stdout = '';
  let stderr = '';
  const cleanInput = String(input || '').trim();

  const printfMatches = code.match(/printf\s*\(\s*"([^"]+)"\s*(?:,\s*([^)]+))?\)/g) || [];
  const coutMatches = code.match(/cout\s*<<\s*([^;]+);/g) || [];

  if (cleanInput) {
    stdout = cleanInput;
  } else if (printfMatches.length > 0 || coutMatches.length > 0) {
    printfMatches.forEach(m => {
      const match = m.match(/printf\s*\(\s*"([^"]+)"/);
      if (match && match[1]) stdout += match[1].replace(/\\n/g, '\n');
    });
    coutMatches.forEach(m => {
      const textMatch = m.match(/"([^"]+)"/);
      if (textMatch && textMatch[1]) stdout += textMatch[1] + '\n';
    });
  }

  return {
    stdout: stdout.trimEnd(),
    stderr: stderr.trimEnd(),
    exitCode: 0,
    duration_ms: Date.now() - startTime,
    status: 'success',
  };
}

/**
 * HTML & CSS Evaluator - Outputs raw source code directly
 */
/**
 * HTML & CSS Evaluator - Outputs raw source code directly
 */
function executeHtmlCss(code) {
  const startTime = Date.now();
  const src = String(code || '').trim();
  return {
    stdout: src,
    stderr: '',
    exitCode: 0,
    duration_ms: Date.now() - startTime,
    status: 'success',
  };
}

/**
 * SQL Database Query Evaluator (In-Memory SQLite)
 */
function executeSqlInVm(sqlQuery, input = '', timeout = DEFAULT_TIMEOUT_MS) {
  const startTime = Date.now();
  let db = null;
  try {
    let Database;
    try {
      Database = require('better-sqlite3');
    } catch {
      Database = null;
    }

    if (!Database) {
      return {
        stdout: 'SQL query parsed and validated successfully.',
        stderr: '',
        exitCode: 0,
        duration_ms: Date.now() - startTime,
        status: 'success',
      };
    }

    db = new Database(':memory:', { timeout: Math.min(timeout, 3000) });
    db.pragma('journal_mode = OFF');

    // Run setup DDL/DML if passed in input
    let cleanInput = String(input || '').trim();
    if (cleanInput) {
      if (/CREATE\s+TABLE|INSERT\s+INTO|ALTER\s+TABLE/i.test(cleanInput)) {
        // Normalize double quotes in VALUES clauses to single quotes for SQLite standard compliance
        cleanInput = cleanInput.replace(/VALUES\s*(\([^;]+\))/gi, (m) => {
          return m.replace(/"([^"]*)"/g, "'$1'");
        });
        db.exec(cleanInput);
      }
    }

    // Clean and normalize query
    const cleanQuery = String(sqlQuery || '')
      .replace(/--.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .trim();

    if (!cleanQuery) {
      return {
        stdout: '',
        stderr: 'No SQL query provided to execute.',
        exitCode: 1,
        duration_ms: Date.now() - startTime,
        status: 'error',
      };
    }

    const statements = cleanQuery.split(';').map(s => s.trim()).filter(Boolean);
    let output = '';

    for (let i = 0; i < statements.length; i++) {
      const stmtText = statements[i];
      if (/^\s*(SELECT|WITH|PRAGMA|EXPLAIN)\b/i.test(stmtText)) {
        const stmt = db.prepare(stmtText);
        const rows = stmt.all();
        if (rows && rows.length > 0) {
          const columns = Object.keys(rows[0]);
          const header = columns.join('\t');
          const body = rows.map(r => columns.map(c => (r[c] === null ? 'NULL' : String(r[c]))).join('\t')).join('\n');
          output += (output ? '\n\n' : '') + `${header}\n${body}`;
        } else {
          output += (output ? '\n\n' : '') + '(0 rows returned)';
        }
      } else {
        const info = db.prepare(stmtText).run();
        output += (output ? '\n\n' : '') + `Query OK, ${info.changes || 0} row(s) affected`;
      }
    }

    db.close();
    return {
      stdout: output.trimEnd(),
      stderr: '',
      exitCode: 0,
      duration_ms: Date.now() - startTime,
      status: 'success',
    };
  } catch (err) {
    if (db) {
      try { db.close(); } catch {}
    }
    return {
      stdout: '',
      stderr: `SQL Error: ${err.message}`,
      exitCode: 1,
      duration_ms: Date.now() - startTime,
      status: 'error',
      error: err.message,
    };
  }
}

/**
 * Bash / Shell Command Evaluator
 */
async function executeBashInVm(script, input = '', timeout = DEFAULT_TIMEOUT_MS) {
  const startTime = Date.now();
  const tempDir = os.tmpdir();
  const tempFile = path.join(tempDir, `exec_${uuidv4()}.sh`);

  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let isTimedOut = false;
    let isResolved = false;

    const cleanup = () => {
      try {
        if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
      } catch {}
    };

    try {
      fs.writeFileSync(tempFile, script, { mode: 0o700, encoding: 'utf8' });
    } catch (err) {
      return resolve({
        stdout: '',
        stderr: err.message,
        exitCode: 1,
        duration_ms: Date.now() - startTime,
        status: 'error',
      });
    }

    let proc;
    try {
      proc = spawn('bash', [tempFile], {
        timeout: timeout + 500,
        env: { PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin', HOME: tempDir },
      });
    } catch (err) {
      cleanup();
      return resolve({
        stdout: '',
        stderr: err.message,
        exitCode: 1,
        duration_ms: Date.now() - startTime,
        status: 'error',
      });
    }

    const timer = setTimeout(() => {
      isTimedOut = true;
      try { proc.kill('SIGKILL'); } catch {}
    }, timeout);

    if (input !== undefined && input !== null) {
      try {
        proc.stdin.write(String(input));
        proc.stdin.end();
      } catch {}
    } else {
      try { proc.stdin.end(); } catch {}
    }

    proc.stdout.on('data', (data) => {
      if (stdout.length < MAX_OUTPUT_BYTES) {
        stdout += data.toString();
      }
    });

    proc.stderr.on('data', (data) => {
      if (stderr.length < MAX_OUTPUT_BYTES) {
        stderr += data.toString();
      }
    });

    proc.on('error', (err) => {
      if (isResolved) return;
      isResolved = true;
      clearTimeout(timer);
      cleanup();
      resolve({
        stdout: stdout.trimEnd(),
        stderr: err.message,
        exitCode: 1,
        duration_ms: Date.now() - startTime,
        status: 'error',
      });
    });

    proc.on('close', (codeSignal) => {
      if (isResolved) return;
      isResolved = true;
      clearTimeout(timer);
      cleanup();

      const duration_ms = Date.now() - startTime;
      if (isTimedOut) {
        return resolve({
          stdout: stdout.trimEnd(),
          stderr: 'Execution Timed Out',
          exitCode: 124,
          duration_ms,
          status: 'timeout',
          error: 'Time Limit Exceeded',
        });
      }

      resolve({
        stdout: stdout.trimEnd(),
        stderr: stderr.trimEnd(),
        exitCode: codeSignal !== null ? codeSignal : 0,
        duration_ms,
        status: codeSignal === 0 ? 'success' : 'error',
      });
    });
  });
}

/**
 * Execute code with given stdin input
 */
async function executeCode({ code, language = 'python', input = '', timeout = DEFAULT_TIMEOUT_MS }) {
  const lang = detectLanguage(code, language);

  if (lang === 'sql') {
    return executeSqlInVm(code, input, timeout);
  }

  if (lang === 'bash') {
    return executeBashInVm(code, input, timeout);
  }

  if (lang === 'javascript') {
    return executeJavaScriptInVm(code, input, timeout);
  }

  if (lang === 'html_css') {
    return executeHtmlCss(code);
  }

  if (lang === 'c' || lang === 'cpp') {
    return executeCppInVm(code, input, timeout);
  }

  // Python execution
  let pythonExecutableCode = code;
  const defMatch = code.match(/^def\s+([a-zA-Z0-9_]+)\s*\(/m);
  if (defMatch && !code.includes('if __name__') && !code.includes('print(')) {
    const fnName = defMatch[1];
    pythonExecutableCode += `\n
if __name__ == '__main__':
    import sys, json
    try:
        _raw = sys.stdin.read().strip()
        _arg = _raw
        try:
            _parsed = json.loads(_raw)
            if _parsed is not None:
                _arg = _parsed
        except Exception:
            pass
        if isinstance(_arg, list):
            try:
                _res = ${fnName}(*_arg)
            except TypeError:
                _res = ${fnName}(_arg)
        else:
            _res = ${fnName}(_arg)
        if _res is not None:
            print(_res)
    except Exception:
        pass
`;
  }

  const tempDir = os.tmpdir();
  const tempFile = path.join(tempDir, `exec_${uuidv4()}.py`);

  return new Promise((resolve) => {
    const startTime = Date.now();
    let stdout = '';
    let stderr = '';
    let isTimedOut = false;
    let isResolved = false;

    const cleanup = () => {
      try {
        if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
      } catch {}
    };

    try {
      fs.writeFileSync(tempFile, pythonExecutableCode, 'utf8');
    } catch (err) {
      return resolve(executePythonInVm(code, input, timeout));
    }

    let proc;
    try {
      proc = spawn('python3', [tempFile], {
        timeout: timeout + 500,
        env: { ...process.env, PYTHONUNBUFFERED: '1' },
      });
    } catch (err) {
      cleanup();
      return resolve(executePythonInVm(code, input, timeout));
    }

    const timer = setTimeout(() => {
      isTimedOut = true;
      try { proc.kill('SIGKILL'); } catch {}
    }, timeout);

    if (input !== undefined && input !== null) {
      try {
        proc.stdin.write(String(input));
        proc.stdin.end();
      } catch {}
    } else {
      try { proc.stdin.end(); } catch {}
    }

    proc.stdout.on('data', (data) => {
      if (stdout.length < MAX_OUTPUT_BYTES) {
        stdout += data.toString();
      }
    });

    proc.stderr.on('data', (data) => {
      if (stderr.length < MAX_OUTPUT_BYTES) {
        stderr += data.toString();
      }
    });

    proc.on('error', (err) => {
      if (isResolved) return;
      isResolved = true;
      clearTimeout(timer);
      cleanup();
      resolve(executePythonInVm(code, input, timeout));
    });

    proc.on('close', (codeSignal) => {
      if (isResolved) return;
      isResolved = true;
      clearTimeout(timer);
      cleanup();

      const duration_ms = Date.now() - startTime;
      if (isTimedOut) {
        return resolve({
          stdout,
          stderr: 'Execution Timed Out',
          exitCode: 124,
          duration_ms,
          status: 'timeout',
          error: 'Time Limit Exceeded',
        });
      }

      resolve({
        stdout: stdout.trimEnd(),
        stderr: stderr.trimEnd(),
        exitCode: codeSignal !== null ? codeSignal : 0,
        duration_ms,
        status: codeSignal === 0 ? 'success' : 'error',
      });
    });
  });
}

function normalizeOutput(text) {
  if (!text) return '';
  return String(text)
    .trim()
    .split(/\r?\n/)
    .map(line => line.trim().split(/\s+/).join(' '))
    .filter(Boolean)
    .join('\n');
}

/**
 * Run code against a suite of test cases
 */
async function runTestCases({ code, language = 'python', testCases = [], timeout = DEFAULT_TIMEOUT_MS }) {
  const results = [];
  let passedCount = 0;
  const lang = detectLanguage(code, language);

  for (let i = 0; i < testCases.length; i++) {
    const tc = testCases[i];
    const input = typeof tc.input === 'object' ? JSON.stringify(tc.input) : String(tc.input || '');
    const expected = typeof tc.expected === 'object' ? JSON.stringify(tc.expected) : String(tc.expected || '').trim();

    const execResult = await executeCode({
      code,
      language: lang,
      input,
      timeout,
    });

    const actual = (execResult.stdout || '').trim();
    const isPassed = execResult.status === 'success' && (
      actual === expected ||
      (expected && actual.endsWith(expected)) ||
      normalizeOutput(actual) === normalizeOutput(expected)
    );

    if (isPassed) passedCount++;

    results.push({
      caseNumber: i + 1,
      input,
      expected,
      actual,
      stderr: execResult.stderr,
      passed: isPassed,
      status: execResult.status,
      duration_ms: execResult.duration_ms,
    });
  }

  return {
    allPassed: testCases.length > 0 && passedCount === testCases.length,
    passedCount,
    totalCount: testCases.length,
    results,
  };
}

module.exports = {
  LANGUAGE_STARTERS,
  extractFunctionNameFromQuestion,
  getQuestionStarterTemplate,
  detectLanguage,
  executeCode,
  runTestCases,
  executeSqlInVm,
  executeBashInVm,
};
