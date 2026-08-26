const test = require('node:test');
const assert = require('node:assert/strict');
const { runPythonInVm, transpilePythonToJs } = require('../services/pythonRunner');

test('runPythonInVm executes default Python starter template without SyntaxError', () => {
  const pyCode = `
def solution(input_data):
    # Write your solution logic here
    return input_data

if __name__ == '__main__':
    import sys
    input_str = sys.stdin.read().strip()
    result = solution(input_str)
    if result is not None:
        print(result)
  `;

  const res = runPythonInVm(pyCode, 'Hello Antigravity');
  assert.equal(res.status, 'success');
  assert.equal(res.stdout, 'Hello Antigravity');
  assert.equal(res.stderr, '');
});

test('runPythonInVm executes Python function with custom calculations and loops', () => {
  const pyCode = `
def solution(input_data):
    val = int(input_data)
    total = 0
    for i in range(val):
        total += i
    return total

print(solution(input()))
  `;

  const res = runPythonInVm(pyCode, '5'); // sum of 0,1,2,3,4 = 10
  assert.equal(res.status, 'success');
  assert.equal(res.stdout, '10');
});
