const test = require('node:test');
const assert = require('node:assert/strict');
const { analyzeAiContent } = require('../services/aiDetector');

test('analyzeAiContent detects AI-generated response with formal transitions, bold headings, and synthetic examples', () => {
  const aiSample = `
    Furthermore, it is important to note that microservice architecture provides high scalability.
    
    1. **High Availability:** Systems can scale independently across services.
    2. **Fault Isolation:** Crucially, a failure in one service does not crash the entire system.
    
    For example, consider a scenario where an e-commerce payment service experiences heavy load. Additionally, the inventory service remains unaffected. In conclusion, this approach is paramount for enterprise applications.
  `;

  const result = analyzeAiContent(aiSample);
  assert.equal(result.isAiGenerated, true);
  assert.ok(result.score >= 70, `Score ${result.score} should be >= 70`);
  assert.ok(result.note.includes('AI GENERATED'), 'Note should indicate AI generated content');
  assert.ok(result.details.length >= 3, 'Details should list multiple AI markers');
});

test('analyzeAiContent recognizes human-written response without AI markers', () => {
  const humanSample = `
    i used a simple for loop to iterate through the array and check if each element is even.
    if it is even I add it to the total sum and return it at the end. tested with input [1,2,3,4] and got 6.
  `;

  const result = analyzeAiContent(humanSample);
  assert.equal(result.isAiGenerated, false);
  assert.ok(result.score < 45, `Score ${result.score} should be < 45`);
  assert.ok(result.note.includes('Human-written'), 'Note should indicate human written response');
});
