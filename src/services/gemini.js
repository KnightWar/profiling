/**
 * Gemini AI Question Generation Service
 * ──────────────────────────────────────
 * Ported from the user's Python Create_MCQ_quiz.py to Node.js.
 * Generates questions per component with correct type mixes.
 */

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

// ─── Component-specific prompt templates ────────────────────────────────────

const COMPONENT_PROMPTS = {
  technical: {
    mcq: (topic, desc, count, diff) => `You are an expert technical quiz creator.

Topic: ${topic}
Description: ${desc}
Difficulty: ${diff}
Generate exactly ${count} MCQ questions. Each worth 1 mark.

Each JSON object must follow:
{ "type": "mcq", "marks": 1, "content": "question text", "options": ["A) ...", "B) ...", "C) ...", "D) ..."], "correct_answer": "A"|"B"|"C"|"D" }

Rules:
- Return a valid JSON array only — no markdown, no extra text.
- Questions must be clear, technically accurate, relevant to ${topic}.
- Cover different aspects of the topic. No repetition.
- Difficulty level: ${diff}.

Return JSON array only.`,

    subjective: (topic, desc, count, diff) => `You are an expert technical examiner.

Topic: ${topic}
Description: ${desc}
Difficulty: ${diff}
Generate exactly ${count} subjective/short-answer questions. Each worth 2 marks.

Each JSON object must follow:
{ "type": "subjective", "marks": 2, "content": "question text", "correct_answer": "model answer (50-100 words)" }

Rules:
- Return a valid JSON array only.
- Questions should require explanation, not just recall.
- Difficulty level: ${diff}.

Return JSON array only.`,

    programming: (topic, desc, count, diff) => `You are an expert programming question designer.

Topic: ${topic}
Description: ${desc}
Difficulty: ${diff}
Generate exactly ${count} programming questions. Marks vary: easy=3, medium=5, hard=7. Aim for total ~25 marks.

Each JSON object must follow:
{ "type": "programming", "marks": <number>, "content": "problem statement with input/output format", "correct_answer": "solution code in Python", "test_cases": [{"input": "...", "expected": "..."}, ...] }

Rules:
- Return a valid JSON array only.
- Each question must have at least 2 test cases.
- Problem statements must be clear with input/output formats.
- Mix of difficulties targeting ~25 total marks across all questions.

Return JSON array only.`,
  },

  aptitude: {
    mcq: (topic, desc, count, diff) => `You are an expert logical reasoning and aptitude quiz creator.

Topic: ${topic}
Description: ${desc}
Difficulty: ${diff}
Generate exactly ${count} MCQ questions testing logical/analytical reasoning. Each worth 1 mark.

Each JSON object must follow:
{ "type": "mcq", "marks": 1, "content": "question text", "options": ["A) ...", "B) ...", "C) ...", "D) ..."], "correct_answer": "A"|"B"|"C"|"D" }

Categories to cover: number series, pattern recognition, logical deduction, data interpretation, verbal reasoning, quantitative aptitude.
Difficulty level: ${diff}.

Return JSON array only.`,

    subjective: (topic, desc, count, diff) => `You are an expert aptitude examiner.

Topic: ${topic}
Description: ${desc}
Difficulty: ${diff}
Generate exactly ${count} subjective aptitude questions requiring detailed working/reasoning. Each worth 3 marks.

Each JSON object must follow:
{ "type": "subjective", "marks": 3, "content": "question text", "correct_answer": "step-by-step solution" }

Return JSON array only.`,
  },

  oral_english: {
    oral_task: (topic, desc, count, diff) => `You are an expert English speaking assessment designer.

Topic: ${topic}
Description: ${desc}
Difficulty: ${diff}
Generate exactly ${count} oral read-aloud assessment tasks. Each worth 10 marks.

Each JSON object must follow:
{ "type": "oral_task", "marks": 10, "content": "Please read the following passage clearly:", "correct_answer": "The actual passage text the student must read aloud" }

Rules:
- Return a valid JSON array with exactly ${count} objects.
- Passages should be appropriate for ${diff} level English speakers.
- Passages should be 2-4 sentences long.

Return JSON array only.`,
  },

  written_english: {
    mcq: (topic, desc, count, diff) => `You are an expert English language quiz creator.

Topic: ${topic}
Description: ${desc}
Difficulty: ${diff}
Generate exactly ${count} MCQ questions testing English grammar, vocabulary, comprehension. Each worth 1 mark.

Each JSON object must follow:
{ "type": "mcq", "marks": 1, "content": "question text", "options": ["A) ...", "B) ...", "C) ...", "D) ..."], "correct_answer": "A"|"B"|"C"|"D" }

Mix of: grammar correction, fill-in-the-blank, reading comprehension, vocabulary usage.
Difficulty level: ${diff}.

Return JSON array only.`,

    subjective: (topic, desc, count, diff) => `You are an expert English writing examiner.

Topic: ${topic}
Description: ${desc}
Difficulty: ${diff}
Generate exactly ${count} subjective English questions (sentence correction, paragraph writing, comprehension answers). Each worth 2-4 marks.

Each JSON object must follow:
{ "type": "subjective", "marks": <number 2-4>, "content": "question text", "correct_answer": "model answer" }

Total marks should sum to approximately 20.
Return JSON array only.`,

    writing_task: (topic, desc, count, diff) => `You are an expert business writing assessment designer.

Topic: ${topic}
Description: ${desc}
Difficulty: ${diff}
Generate exactly ${count} writing task(s) — email writing, report writing, or formal letter. Worth 15 marks total.

Each JSON object must follow:
{ "type": "writing_task", "marks": 15, "content": "detailed task description with context, audience, and requirements", "rubric": {"criteria": ["content_relevance","organization","language_accuracy","tone_appropriateness","format"], "max_per_criterion": 3} }

Return JSON array only.`,
  },
};

// ─── API call ───────────────────────────────────────────────────────────────

async function callGemini(prompt) {
  const response = await fetch(GEMINI_API_URL + `?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.7,
        responseMimeType: 'application/json',
      },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API error (${response.status}): ${errText}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) {
    throw new Error('Empty response from Gemini');
  }

  // Strip markdown code fences if present
  const cleaned = text.replace(/^```[a-zA-Z]*\n?/, '').replace(/\n?```$/, '').trim();
  return JSON.parse(cleaned);
}

// ─── Main generation function ───────────────────────────────────────────────

/**
 * Generate questions for a component.
 * @param {Object} opts
 * @param {string} opts.topic - Topic for the questions
 * @param {string} opts.description - Additional description
 * @param {string} opts.difficulty - easy/medium/hard
 * @param {string} opts.component - technical/aptitude/oral_english/written_english
 * @param {Object} opts.typeMix - {mcq: 15, subjective: 10, programming: 25}
 * @returns {Array} Generated questions
 */
async function generateQuestions({ topic, description, difficulty, component, typeMix }) {
  const componentPrompts = COMPONENT_PROMPTS[component];
  if (!componentPrompts) {
    throw new Error(`Unknown component: ${component}. Valid: ${Object.keys(COMPONENT_PROMPTS).join(', ')}`);
  }

  const allQuestions = [];

  for (const [qType, totalMarks] of Object.entries(typeMix)) {
    if (totalMarks <= 0) continue;

    const promptBuilder = componentPrompts[qType];
    if (!promptBuilder) {
      console.warn(`  No prompt template for ${component}/${qType}, skipping`);
      continue;
    }

    // Estimate count based on marks
    let count;
    if (qType === 'mcq') count = totalMarks; // 1 mark each
    else if (qType === 'oral_task') count = 4; // fixed 4 tasks
    else if (qType === 'writing_task') count = 1; // single task
    else if (qType === 'programming') count = Math.ceil(totalMarks / 5); // ~5 marks each
    else count = Math.ceil(totalMarks / 2); // subjective ~2-3 marks each

    const prompt = promptBuilder(topic, description, count, difficulty);

    console.log(`  Generating ${count}x ${qType} for ${component}...`);

    try {
      const questions = await callGemini(prompt);

      if (Array.isArray(questions)) {
        // Validate and clean
        const validated = questions.map((q, i) => ({
          type: q.type || qType,
          marks: q.marks || 1,
          content: q.content || q.question || '',
          options: q.options || null,
          correct_answer: q.correct_answer || q.correct || null,
          test_cases: q.test_cases || null,
          rubric: q.rubric || null,
          difficulty: difficulty,
          sort_order: allQuestions.length + i + 1,
        }));

        allQuestions.push(...validated);
        console.log(`  ✓ Generated ${validated.length} ${qType} questions`);
      }
    } catch (err) {
      console.error(`  ✗ Failed to generate ${qType}: ${err.message}`);
      // If we completely fail to generate anything, throw the error
      if (allQuestions.length === 0) {
        throw new Error(`AI Generation Failed: ${err.message}`);
      }
    }
  }

  if (allQuestions.length === 0) {
    throw new Error('AI generated an empty response. Please check your API key and prompt.');
  }

  return allQuestions;
}

module.exports = { generateQuestions, callGemini };
