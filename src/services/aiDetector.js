/**
 * AI Content Detector Service
 * ───────────────────────────
 * Analyzes student response text for AI generation markers:
 * 1. Formal transition grammar & AI buzzwords
 * 2. Uniform sentence structure & cadence
 * 3. Synthetic example phrases
 * 4. Structured markdown formatting (bold headers, bullet lists)
 *
 * @param {string} text - Student response text
 * @returns {{ isAiGenerated: boolean, score: number, level: 'high'|'medium'|'low'|'human', note: string, details: string[] }}
 */
function analyzeAiContent(text) {
  if (!text || typeof text !== 'string') {
    return {
      isAiGenerated: false,
      score: 0,
      level: 'human',
      note: 'Human response detected.',
      details: [],
    };
  }

  const raw = text.trim();
  if (raw.length < 35) {
    return {
      isAiGenerated: false,
      score: 0,
      level: 'human',
      note: 'Response too short for AI detection analysis.',
      details: [],
    };
  }

  const lower = raw.toLowerCase();
  const details = [];
  let scorePoints = 0;

  // 1. Check AI Transition Grammar & Vocabulary Buzzwords
  const aiKeywords = [
    'furthermore', 'moreover', 'in conclusion', 'additionally', 'consequently',
    'in summary', 'it is important to note', 'it is essential to', 'crucially',
    'paramount', 'tapestry', 'fostering', 'comprehensive', 'delve', 'leverage',
    'overall', 'as a result', 'in general', 'to summarize', 'plays a vital role',
    'key takeaway', 'in essence', 'it should be noted', 'it is worth noting',
    'testament to', 'seamlessly', 'pivotal', 'indispensable'
  ];

  let keywordCount = 0;
  aiKeywords.forEach(kw => {
    if (lower.includes(kw)) {
      keywordCount++;
      details.push(`Formal AI transition word found: "${kw}"`);
    }
  });

  if (keywordCount >= 3) scorePoints += 35;
  else if (keywordCount >= 1) scorePoints += 15 * keywordCount;

  // 2. Check Synthetic Example Patterns
  const examplePatterns = [
    'for example,', 'for instance,', 'consider a scenario', 'let us consider',
    'to illustrate this', 'a real-world example', 'case in point:', 'such as:'
  ];

  let exampleCount = 0;
  examplePatterns.forEach(pattern => {
    if (lower.includes(pattern)) {
      exampleCount++;
      details.push(`Synthetic example phrase pattern: "${pattern}"`);
    }
  });

  if (exampleCount >= 2) scorePoints += 25;
  else if (exampleCount === 1) scorePoints += 15;

  // 3. Structural Formatting (Bold headers: **Header** or bullet lists: - / 1.)
  const boldMatches = raw.match(/(\*\*|\#\#)[^\n]+\1/g) || [];
  const listMatches = raw.match(/^(\s*[-*•]|\d+\.)/gm) || [];

  if (boldMatches.length >= 2) {
    scorePoints += 20;
    details.push(`Structured bold headers (${boldMatches.length} detected)`);
  }
  if (listMatches.length >= 3) {
    scorePoints += 15;
    details.push(`Structured bullet point format (${listMatches.length} items)`);
  }

  // 4. Grammar & Uniform Sentence Length Analysis
  const sentences = raw.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 0);
  if (sentences.length >= 3) {
    const lengths = sentences.map(s => s.split(/\s+/).length);
    const avgLen = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    const variance = lengths.reduce((a, b) => a + Math.pow(b - avgLen, 2), 0) / lengths.length;
    const stdDev = Math.sqrt(variance);

    // AI text features highly uniform sentence length (low stdDev relative to avg)
    if (avgLen >= 10 && stdDev < 5.0) {
      scorePoints += 15;
      details.push(`Uniform sentence structure & length (avg ${Math.round(avgLen)} words/sentence)`);
    }
  }

  const finalScore = Math.min(100, Math.max(0, Math.round(scorePoints)));
  const isAiGenerated = finalScore >= 45;

  let level = 'human';
  let note = '';

  if (finalScore >= 75) {
    level = 'high';
    note = `⚠️ AI GENERATED ANSWER DETECTED (${finalScore}% Probability): High usage of formal transition grammar, structured bold headings, and synthetic example phrasing.`;
  } else if (finalScore >= 45) {
    level = 'medium';
    note = `⚠️ POTENTIAL AI ASSISTED ANSWER (${finalScore}% Probability): Text exhibits AI writing patterns, formal transition vocabulary, or structured formatting.`;
  } else {
    level = 'human';
    note = `✔ Human-written response (${finalScore}% AI probability).`;
  }

  return {
    isAiGenerated,
    score: finalScore,
    level,
    note,
    details,
  };
}

module.exports = {
  analyzeAiContent,
};
