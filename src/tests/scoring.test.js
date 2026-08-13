const test = require('node:test');
const assert = require('node:assert/strict');
const { computeComposite, gradeMCQ } = require('../services/scoring');

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
