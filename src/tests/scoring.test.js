const test = require('node:test');
const assert = require('node:assert/strict');
const { computeComposite, gradeMCQ, gradeProgramming, isBoilerplateOrEmptyCode } = require('../services/scoring');
const { LANGUAGE_STARTERS } = require('../services/codeRunner');

test('computeComposite calculates scores and levels correctly', async (t) => {

  await t.test('Student A: T=450, L=400, O=300, W=250 => Level 2', () => {
    const result = computeComposite(450, 400, 300, 250);
    // S = 3(450) + 3(400) + 2(300) + 2(250) = 1350 + 1200 + 600 + 500 = 3650
    assert.equal(result.total_score, 3650);
    assert.equal(result.level, 2);
  });

  await t.test('Student B: T=500, L=480, O=350, W=300 => Level 3', () => {
    const result = computeComposite(500, 480, 350, 300);
    // S = 3(500) + 3(480) + 2(350) + 2(300) = 1500 + 1440 + 700 + 600 = 4240
    // O + W = 650 >= 500
    assert.equal(result.total_score, 4240);
    assert.equal(result.level, 3);
  });

  await t.test('Student C: T=200, L=180, O=100, W=120 => Level 1', () => {
    const result = computeComposite(200, 180, 100, 120);
    // S = 3(200) + 3(180) + 2(100) + 2(120) = 600 + 540 + 200 + 240 = 1580
    assert.equal(result.total_score, 1580);
    assert.equal(result.level, 1);
  });

  await t.test('English floor requirement for Level 3: Score >= 3750 but (O+W) < 500 results in Level 2', () => {
    // T=500, L=500, O=200, W=200 => S = 1500 + 1500 + 400 + 400 = 3800, but O+W = 400 < 500
    const result = computeComposite(500, 500, 200, 200);
    assert.equal(result.total_score, 3800);
    assert.equal(result.level, 2);
  });
});

test('gradeMCQ evaluates correct and incorrect options', () => {
  const question = { correct_answer: 'B', marks: 5 };

  assert.equal(gradeMCQ({ answer_data: 'B' }, question), 5);
  assert.equal(gradeMCQ({ answer_data: 'b' }, question), 5);
  assert.equal(gradeMCQ({ answer_data: 'A' }, question), 0);
  assert.equal(gradeMCQ({ answer_data: '' }, question), 0);
});

test('gradeProgramming awards 0 marks for unwritten logic or boilerplate', async () => {
  const question = {
    marks: 10,
    test_cases: [
      { input: 'racecar', expected: 'true' },
      { input: 'hello', expected: 'false' },
    ],
  };

  // 1. Default Python starter without logic
  const pythonStarterScore = await gradeProgramming({ answer_data: LANGUAGE_STARTERS.python }, question);
  assert.equal(pythonStarterScore, 0, 'Python starter should get 0 marks');

  // 2. Default JS starter without logic
  const jsStarterScore = await gradeProgramming({ answer_data: LANGUAGE_STARTERS.javascript }, question);
  assert.equal(jsStarterScore, 0, 'JavaScript starter should get 0 marks');

  // 3. Default C starter without logic
  const cStarterScore = await gradeProgramming({ answer_data: LANGUAGE_STARTERS.c }, question);
  assert.equal(cStarterScore, 0, 'C starter should get 0 marks');

  // 4. Empty and whitespace answers
  assert.equal(await gradeProgramming({ answer_data: '' }, question), 0);
  assert.equal(await gradeProgramming({ answer_data: '   \n \t  ' }, question), 0);
  assert.equal(await gradeProgramming({ answer_data: 'def solution(x): pass' }, question), 0);

  // 5. Code with failed test cases
  const failedCode = `
def solution(s):
    return "wrong"
if __name__ == '__main__':
    import sys
    print(solution(sys.stdin.read().strip()))
  `;
  const failedScore = await gradeProgramming({ answer_data: failedCode }, question);
  assert.equal(failedScore, 0, 'Wrong code failing all test cases should get 0 marks');

  // 6. Working code that passes all test cases
  const workingCode = `
def solution(s):
    return "true" if s == s[::-1] else "false"
if __name__ == '__main__':
    import sys
    print(solution(sys.stdin.read().strip()))
  `;
  const workingScore = await gradeProgramming({ answer_data: workingCode }, question);
  assert.equal(workingScore, 10, 'Correct code passing all test cases should get 10 marks');

  // 7. SQL Database Query grading
  const sqlQuestion = {
    marks: 5,
    test_cases: [
      {
        input: "CREATE TABLE dept (id INT, name TEXT); INSERT INTO dept VALUES (1, 'Engineering'), (2, 'Sales');",
        expected: 'name\nEngineering',
      },
    ],
  };

  // SQL starter gets 0 marks
  assert.equal(await gradeProgramming({ answer_data: LANGUAGE_STARTERS.sql }, sqlQuestion), 0);
  // Incorrect SQL query gets 0 marks
  assert.equal(await gradeProgramming({ answer_data: 'SELECT * FROM dept;' }, sqlQuestion), 0);
  // Correct SQL query gets full marks
  assert.equal(await gradeProgramming({ answer_data: 'SELECT name FROM dept WHERE id = 1;' }, sqlQuestion), 5);

  // 8. Bash Command Writing grading
  const bashQuestion = {
    marks: 5,
    test_cases: [
      {
        input: 'apple\nbanana\ncherry\navocado\n',
        expected: 'apple\navocado',
      },
    ],
  };

  // Bash starter gets 0 marks
  assert.equal(await gradeProgramming({ answer_data: LANGUAGE_STARTERS.bash }, bashQuestion), 0);
  // Incorrect bash gets 0 marks
  assert.equal(await gradeProgramming({ answer_data: 'grep "z"' }, bashQuestion), 0);
  // Correct bash gets full marks
  assert.equal(await gradeProgramming({ answer_data: 'grep "^a"' }, bashQuestion), 5);
});

