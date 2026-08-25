/**
 * codeRunner.js — Safe Execution Service for Programming Questions
 * ═════════════════════════════════════════════════════════════════
 * Executes student solution code (Python 3 / Node.js) against
 * custom stdin inputs or automated test cases with timeouts and output bounds.
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { v4: uuidv4 } = require('uuid');

const DEFAULT_TIMEOUT_MS = 5000;
const MAX_OUTPUT_BYTES = 512 * 1024; // 512 KB

/**
 * Detect language from source code if unspecified
 */
function detectLanguage(code, explicitLanguage) {
  if (explicitLanguage) {
    const lang = String(explicitLanguage).toLowerCase().trim();
    if (lang.includes('py')) return 'python';
    if (lang.includes('js') || lang.includes('node') || lang.includes('javascript')) return 'javascript';
  }

  const s = String(code || '');
  if (/^\s*(def |import |from |print\b|class \w+:|elif |if __name__)/m.test(s)) {
    return 'python';
  }
  if (/^\s*(function|const |let |var |console\.log|module\.exports)/m.test(s)) {
    return 'javascript';
  }
  return 'python'; // Default to Python for competitive programming
}

/**
 * Execute code with given stdin input
 * @param {Object} options
 * @param {string} options.code - Source code to execute
 * @param {string} [options.language='python'] - 'python' or 'javascript'
 * @param {string} [options.input=''] - Input text passed to stdin
 * @param {number} [options.timeout=5000] - Timeout in milliseconds
 * @returns {Promise<{stdout: string, stderr: string, exitCode: number, duration_ms: number, status: string, error?: string}>}
 */
async function executeCode({ code, language = 'python', input = '', timeout = DEFAULT_TIMEOUT_MS }) {
  const lang = detectLanguage(code, language);
  const tempDir = os.tmpdir();
  const fileExt = lang === 'python' ? '.py' : '.js';
  const tempFile = path.join(tempDir, `exec_${uuidv4()}${fileExt}`);

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
      return resolve({
        stdout: '',
        stderr: `Failed to prepare execution environment: ${err.message}`,
        exitCode: 1,
        duration_ms: 0,
        status: 'error',
        error: err.message,
      });
    }

    const cmd = lang === 'python' ? 'python3' : 'node';
    const args = [tempFile];

    let proc;
    try {
      proc = spawn(cmd, args, {
        timeout: timeout + 500,
        env: { ...process.env, PYTHONUNBUFFERED: '1', NODE_ENV: 'production' },
      });
    } catch (err) {
      cleanup();
      return resolve({
        stdout: '',
        stderr: `Failed to spawn runtime (${cmd}): ${err.message}`,
        exitCode: 1,
        duration_ms: Date.now() - startTime,
        status: 'error',
        error: err.message,
      });
    }

    const timer = setTimeout(() => {
      isTimedOut = true;
      try {
        proc.kill('SIGKILL');
      } catch {}
    }, timeout);

    // Pass stdin input if available
    if (input !== undefined && input !== null) {
      try {
        proc.stdin.write(String(input));
        proc.stdin.end();
      } catch {}
    } else {
      try {
        proc.stdin.end();
      } catch {}
    }

    proc.stdout.on('data', (data) => {
      if (stdout.length < MAX_OUTPUT_BYTES) {
        stdout += data.toString();
        if (stdout.length >= MAX_OUTPUT_BYTES) {
          stdout += '\n[Output truncated - exceeded 512KB]';
        }
      }
    });

    proc.stderr.on('data', (data) => {
      if (stderr.length < MAX_OUTPUT_BYTES) {
        stderr += data.toString();
        if (stderr.length >= MAX_OUTPUT_BYTES) {
          stderr += '\n[Error output truncated]';
        }
      }
    });

    proc.on('error', (err) => {
      if (isResolved) return;
      isResolved = true;
      clearTimeout(timer);
      cleanup();
      resolve({
        stdout,
        stderr: stderr || err.message,
        exitCode: 1,
        duration_ms: Date.now() - startTime,
        status: 'error',
        error: err.message,
      });
    });

    proc.on('close', (code, signal) => {
      if (isResolved) return;
      isResolved = true;
      clearTimeout(timer);
      cleanup();

      const duration_ms = Date.now() - startTime;

      if (isTimedOut || signal === 'SIGKILL' || signal === 'SIGTERM') {
        return resolve({
          stdout,
          stderr: stderr ? `${stderr}\nExecution Timed Out (exceeded ${timeout / 1000}s limit)` : `Execution Timed Out (exceeded ${timeout / 1000}s limit)`,
          exitCode: 124,
          duration_ms,
          status: 'timeout',
          error: 'Time Limit Exceeded',
        });
      }

      resolve({
        stdout: stdout.trimEnd(),
        stderr: stderr.trimEnd(),
        exitCode: code !== null ? code : 0,
        duration_ms,
        status: code === 0 ? 'success' : 'error',
      });
    });
  });
}

/**
 * Run code against a suite of test cases
 * @param {Object} options
 * @param {string} options.code
 * @param {string} [options.language='python']
 * @param {Array<{input: string, expected: string}>} options.testCases
 * @param {number} [options.timeout=5000]
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
  detectLanguage,
  executeCode,
  runTestCases,
};
