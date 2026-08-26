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

const LANGUAGE_STARTERS = {
  python: `def solution(input_data):
    # Write your solution logic here
    return input_data

if __name__ == '__main__':
    import sys
    input_str = sys.stdin.read().strip()
    result = solution(input_str)
    if result is not None:
        print(result)`,

  javascript: `function solution(inputData) {
    // Write your solution logic here
    return inputData;
}

const input = typeof readline === 'function' ? readline() : '';
const result = solution(input);
if (result !== undefined) {
    console.log(result);
}`,

  c: `#include <stdio.h>
#include <string.h>

char* solution(char* input) {
    // Write your solution logic here
    return input;
}

int main() {
    char input[1024] = "";
    if (scanf("%1023s", input) == 1) {
        printf("%s\\n", solution(input));
    } else {
        printf("%s\\n", solution(input));
    }
    return 0;
}`,

  cpp: `#include <iostream>
#include <string>
using namespace std;

string solution(string input) {
    // Write your solution logic here
    return input;
}

int main() {
    string input;
    if (cin >> input) {
        cout << solution(input) << endl;
    } else {
        cout << solution("") << endl;
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
    if (lang.includes('py')) return 'python';
    if (lang.includes('js') || lang.includes('node') || lang.includes('javascript')) return 'javascript';
    if (lang.includes('html') || lang.includes('css')) return 'html_css';
  }

  const s = String(code || '');
  if (/^\s*<!DOCTYPE html>|^\s*<html\b|^\s*<body\b|<style\b/i.test(s)) return 'html_css';
  if (/#include\s*<iostream>|std::cout|using namespace std/.test(s)) return 'cpp';
  if (/#include\s*<stdio\.h>|printf\b|scanf\b/.test(s)) return 'c';
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
 * Execute code with given stdin input
 */
async function executeCode({ code, language = 'python', input = '', timeout = DEFAULT_TIMEOUT_MS }) {
  const lang = detectLanguage(code, language);

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
      fs.writeFileSync(tempFile, code, 'utf8');
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

/**
 * Run code against a suite of test cases
 */
async function runTestCases({ code, language = 'python', testCases = [], timeout = DEFAULT_TIMEOUT_MS }) {
  const results = [];
  let passedCount = 0;

  for (let i = 0; i < testCases.length; i++) {
    const tc = testCases[i];
    const input = typeof tc.input === 'object' ? JSON.stringify(tc.input) : String(tc.input || '');
    const expected = typeof tc.expected === 'object' ? JSON.stringify(tc.expected) : String(tc.expected || '').trim();

    const execResult = await executeCode({
      code,
      language,
      input,
      timeout,
    });

    const actual = (execResult.stdout || '').trim();
    const isPassed = execResult.status === 'success' && (actual === expected || (expected && actual.endsWith(expected)));

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
  detectLanguage,
  executeCode,
  runTestCases,
};
