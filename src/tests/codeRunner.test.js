const test = require('node:test');
const assert = require('node:assert/strict');
const { executeCode, runTestCases, detectLanguage } = require('../services/codeRunner');

test('detectLanguage correctly identifies Python vs JavaScript', () => {
  assert.equal(detectLanguage('def solution():\n    return 42'), 'python');
  assert.equal(detectLanguage('function solve() {\n  return 42;\n}'), 'javascript');
  assert.equal(detectLanguage('const x = 10; console.log(x);'), 'javascript');
  assert.equal(detectLanguage('print("hello")'), 'python');
});

test('executeCode runs Python code with stdin input', async () => {
  const result = await executeCode({
    code: 'a, b = map(int, input().split())\nprint(a + b)',
    language: 'python',
    input: '15 27\n',
  });

  assert.equal(result.status, 'success');
  assert.equal(result.exitCode, 0);
  assert.equal(result.stdout, '42');
});

test('executeCode runs JavaScript code with output', async () => {
  const result = await executeCode({
    code: 'console.log("Hello Node " + (5 * 6));',
    language: 'javascript',
  });

  assert.equal(result.status, 'success');
  assert.equal(result.exitCode, 0);
  assert.equal(result.stdout, 'Hello Node 30');
});

test('runTestCases checks test suite and reports pass/fail', async () => {
  const suiteResult = await runTestCases({
    code: 'n = int(input())\nprint(n * 2)',
    language: 'python',
    testCases: [
      { input: '4', expected: '8' },
      { input: '10', expected: '20' },
      { input: '3', expected: '99' }, // deliberate fail
    ],
  });

  assert.equal(suiteResult.allPassed, false);
  assert.equal(suiteResult.passedCount, 2);
  assert.equal(suiteResult.totalCount, 3);
  assert.equal(suiteResult.results[0].passed, true);
  assert.equal(suiteResult.results[1].passed, true);
  assert.equal(suiteResult.results[2].passed, false);
});
