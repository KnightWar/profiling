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
    mcq: (topic, desc, count, diff) => `You are a principal software engineering and technical assessment architect.

Topic: ${topic}
Additional Context / Language / Tech Stack: ${desc || 'General / Core concepts'}
Difficulty Level: ${diff}
Target: Generate exactly ${count} high-quality Multiple Choice Questions (MCQs). Each worth 1 mark.

Output Format: Return a raw JSON array of objects with this EXACT structure:
[
  {
    "type": "mcq",
    "marks": 1,
    "difficulty": "${diff}",
    "content": "Clear, unambiguous question statement. If including code snippets, format them cleanly.",
    "options": [
      "Option A description without 'A)' prefix",
      "Option B description without 'B)' prefix",
      "Option C description without 'C)' prefix",
      "Option D description without 'D)' prefix"
    ],
    "correct_answer": "A"
  }
]

Strict Rules:
- Return ONLY the JSON array (no markdown code blocks, no intro/outro).
- "correct_answer" MUST be exactly one uppercase letter: "A", "B", "C", or "D".
- "options" MUST be an array of exactly 4 strings. Do NOT include prefixes like "A)" or "1." inside the option text.
- Ensure technical accuracy, distinct plausible distractors, and no duplicates.`,

    subjective: (topic, desc, count, diff) => `You are a lead technical interviewer and evaluator.

Topic: ${topic}
Additional Context: ${desc || 'General technical domain'}
Difficulty Level: ${diff}
Target: Generate exactly ${count} deep technical / conceptual questions. Each worth 2 to 5 marks.

Output Format: Return a raw JSON array of objects with this EXACT structure:
[
  {
    "type": "subjective",
    "marks": 2,
    "difficulty": "${diff}",
    "content": "Detailed technical question testing architecture, internal mechanisms, trade-offs, or debugging.",
    "correct_answer": "Comprehensive model answer (75-150 words) including key technical terms, algorithmic principles, or code snippets."
  }
]

Strict Rules:
- Return ONLY the JSON array.
- "correct_answer" must provide a thorough, accurate reference answer for evaluators to grade against.`,

    programming: (topic, desc, count, diff) => `You are a staff software engineer and competitive assessment author (HackerRank / LeetCode / Industry Standard).

Topic: ${topic}
Target Track / Language / Domain: ${desc || 'General Software Engineering / SQL Database / Linux Bash / Python / JavaScript / C / C++'}
Difficulty Level: ${diff}
Target: Generate exactly ${count} industry-standard technical challenges. Marks: easy=3, medium=5, hard=8.

Support all major technical assessment categories:
1. Algorithmic & Software Engineering (Python, JavaScript, C, C++): function/program reading input from stdin or arguments and printing/returning output.
2. Database Querying (SQL): Write queries (SELECT, JOIN, Aggregations, Window functions, Subqueries, CTEs). For SQL problems, the "test_cases" input MUST include the schema setup DDL/INSERT statements (e.g. "CREATE TABLE employees (id INT, name TEXT, salary INT); INSERT INTO employees VALUES (1, 'Alice', 70000), (2, 'Bob', 50000);") and "expected" MUST contain the expected tabular result.
3. Command Writing & Shell Scripting (Linux / Bash): Write shell commands / pipelines (grep, awk, sed, find, sort, uniq, cut, curl, pipes). "test_cases" input provides the raw text/log lines, and "expected" provides the expected command output.

Output Format: Return a raw JSON array of objects with this EXACT structure:
[
  {
    "type": "programming",
    "marks": 5,
    "difficulty": "${diff}",
    "content": "### Problem Description\\nState the problem clearly with background, schema/tables (if SQL) or file structure (if Bash), and objectives.\\n\\n### Input / Schema Format\\nDescribe input arguments, schema, or stdin format.\\n\\n### Output Format\\nDescribe expected return value, tabular result, or stdout.\\n\\n### Constraints\\n- Time Complexity: O(...)\\n- Edge cases to consider\\n\\n### Example 1\\n**Input:** ...\\n**Output:** ...\\n**Explanation:** ...\\n\\n### Example 2\\n**Input:** ...\\n**Output:** ...",
    "correct_answer": "Clean, syntactically correct, optimized reference solution (Python function, SQL query, or Bash command)",
    "test_cases": [
      { "input": "sample_input_or_sql_ddl_1", "expected": "sample_output_1" },
      { "input": "sample_input_or_sql_ddl_2", "expected": "sample_output_2" },
      { "input": "sample_input_or_sql_ddl_3", "expected": "sample_output_3" }
    ]
  }
]

Strict Rules:
- Return ONLY the JSON array.
- "content" MUST use clean Markdown with Problem Description, Input/Output/Schema Format, Constraints, and Examples.
- "correct_answer" MUST contain clean, valid, syntactically correct code in the requested domain (SQL, Bash, Python, JavaScript, C, etc.) with proper indentation. Escape quotes and newlines properly (\\\\n).
- Provide at least 3 concrete test cases in "test_cases".`,
  },

  aptitude: {
    mcq: (topic, desc, count, diff) => `You are an expert quantitative aptitude and logical reasoning examiner for top competitive assessments.

Topic: ${topic}
Specific Focus: ${desc || 'Arithmetic, Algebra, Data Interpretation, Logical Deductions, Series, Syllogisms, Blood Relations'}
Difficulty Level: ${diff}
Target: Generate exactly ${count} Aptitude / Logical Reasoning MCQs. Each worth 1 mark.

Output Format: Return a raw JSON array of objects with this EXACT structure:
[
  {
    "type": "mcq",
    "marks": 1,
    "difficulty": "${diff}",
    "content": "Clear mathematical or logical puzzle with all necessary numbers, statements, and conditions.",
    "options": [
      "Option A numerical or text answer",
      "Option B numerical or text answer",
      "Option C numerical or text answer",
      "Option D numerical or text answer"
    ],
    "correct_answer": "A"
  }
]

Strict Rules:
- Return ONLY the JSON array.
- "correct_answer" MUST be exactly one uppercase letter: "A", "B", "C", or "D".
- All mathematical values and logical conditions must be verified and consistent.
- Options must be 4 distinct choices without prefixes.`,

    subjective: (topic, desc, count, diff) => `You are a senior aptitude evaluator.

Topic: ${topic}
Focus: ${desc || 'Quantitative reasoning and logical proof'}
Difficulty Level: ${diff}
Target: Generate exactly ${count} multi-step problem-solving questions. Each worth 3 to 5 marks.

Output Format: Return a raw JSON array of objects with this EXACT structure:
[
  {
    "type": "subjective",
    "marks": 3,
    "difficulty": "${diff}",
    "content": "Problem requiring structured algebraic calculation, probability calculation, or logical deduction steps.",
    "correct_answer": "Step 1: Formula / Approach...\\nStep 2: Substitution & Calculation...\\nStep 3: Final Answer: ..."
  }
]

Strict Rules:
- Return ONLY the JSON array.
- "correct_answer" must contain the complete step-by-step mathematical working and final solution.`,
  },

  oral_english: {
    oral_task: (topic, desc, count, diff) => `You are an international English language assessment and IELTS/CEFR speech evaluator.

Topic: ${topic}
Context: ${desc || 'Professional communication, technical presentation, or conversational fluency'}
Difficulty Level: ${diff}
Target: Generate exactly ${count} oral tasks (read aloud or speech prompts). Each worth 10 marks.

Output Format: Return a raw JSON array of objects with this EXACT structure:
[
  {
    "type": "oral_task",
    "marks": 10,
    "difficulty": "${diff}",
    "content": "### Read Aloud & Speaking Task\\nPlease read the passage below aloud into your microphone clearly and at a natural pace:\\n\\n\\"[Passage Text to read aloud]\\"",
    "correct_answer": "[Passage Text for transcription and speech-to-text alignment]"
  }
]

Strict Rules:
- Return ONLY the JSON array.
- Passages must feature rich vocabulary, varied sentence structures, and natural cadence appropriate for ${diff} CEFR levels.`,
  },

  written_english: {
    mcq: (topic, desc, count, diff) => `You are a professional English language and verbal ability examiner.

Topic: ${topic}
Focus: ${desc || 'Grammar, sentence correction, vocabulary in context, idioms, reading comprehension'}
Difficulty Level: ${diff}
Target: Generate exactly ${count} Verbal Ability MCQs. Each worth 1 mark.

Output Format: Return a raw JSON array of objects with this EXACT structure:
[
  {
    "type": "mcq",
    "marks": 1,
    "difficulty": "${diff}",
    "content": "Grammar correction, spot the error, fill in the blank, or comprehension question.",
    "options": [
      "Choice A",
      "Choice B",
      "Choice C",
      "Choice D"
    ],
    "correct_answer": "A"
  }
]

Strict Rules:
- Return ONLY the JSON array.
- "correct_answer" MUST be "A", "B", "C", or "D".`,

    subjective: (topic, desc, count, diff) => `You are an expert English writing instructor.

Topic: ${topic}
Focus: ${desc || 'Short essay answers, summary writing, précis, paragraph rewriting'}
Difficulty Level: ${diff}
Target: Generate exactly ${count} subjective writing questions. Each worth 2 to 5 marks.

Output Format: Return a raw JSON array:
[
  {
    "type": "subjective",
    "marks": 3,
    "difficulty": "${diff}",
    "content": "Write a concise paragraph or rewrite the passage to improve clarity and tone...",
    "correct_answer": "Exemplary model response illustrating correct tone, coherence, grammar, and vocabulary."
  }
]

Strict Rules:
- Return ONLY the JSON array.`,

    writing_task: (topic, desc, count, diff) => `You are a corporate communication assessment designer.

Topic: ${topic}
Focus: ${desc || 'Formal email, incident report, executive proposal, or business letter'}
Difficulty Level: ${diff}
Target: Generate exactly ${count} comprehensive business writing task. Worth 15 marks.

Output Format: Return a raw JSON array:
[
  {
    "type": "writing_task",
    "marks": 15,
    "difficulty": "${diff}",
    "content": "### Business Writing Prompt\\n\\n**Scenario:** ...\\n**Task:** Write a formal email / report to [Audience].\\n\\n**Requirements:**\\n- State the primary objective clearly.\\n- Provide 3 actionable points.\\n- Maintain a professional, courteous tone.\\n- Word count: 150-250 words.",
    "correct_answer": "Exemplary full-length model document meeting all prompt requirements.",
    "rubric": {
      "criteria": ["content_relevance", "structure_organization", "grammar_vocabulary", "tone_style", "formatting"],
      "max_per_criterion": 3
    }
  }
]

Strict Rules:
- Return ONLY the JSON array.`,
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
  let cleaned = text.trim();
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.substring(7);
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.substring(3);
  }
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.substring(0, cleaned.length - 3);
  }
  cleaned = cleaned.trim();

  try {
    return JSON.parse(cleaned);
  } catch (parseErr) {
    // If there is leading/trailing text outside the JSON array, extract between first [ and last ]
    const firstBracket = cleaned.indexOf('[');
    const lastBracket = cleaned.lastIndexOf(']');
    if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
      return JSON.parse(cleaned.substring(firstBracket, lastBracket + 1));
    }
    throw parseErr;
  }
}

// ─── Main generation function ───────────────────────────────────────────────

/**
 * Generate questions for a component.
 * @param {Object} opts
 * @param {string} opts.topic - Topic for the questions
 * @param {string} opts.description - Additional description
 * @param {string} opts.difficulty - easy/medium/hard
 * @param {string} opts.component - technical/aptitude/oral_english/written_english or custom
 * @param {Object} opts.typeMix - {mcq: 15, subjective: 10, programming: 25}
 * @returns {Array} Generated questions
 */
async function generateQuestions({ topic, description, difficulty = 'medium', component = 'technical', typeMix = {} }) {
  // Normalize component or fallback to technical
  const normComponent = (component && COMPONENT_PROMPTS[component.toLowerCase()]) ? component.toLowerCase() : 'technical';
  const componentPrompts = COMPONENT_PROMPTS[normComponent] || COMPONENT_PROMPTS.technical;

  // If typeMix is empty or all zero, assign a sensible default
  let effectiveMix = typeMix;
  if (!effectiveMix || typeof effectiveMix !== 'object' || Object.keys(effectiveMix).length === 0 || Object.values(effectiveMix).every(v => v <= 0)) {
    if (normComponent === 'oral_english') {
      effectiveMix = { oral_task: 40 };
    } else if (normComponent === 'written_english') {
      effectiveMix = { mcq: 10, subjective: 10, writing_task: 15 };
    } else if (normComponent === 'aptitude') {
      effectiveMix = { mcq: 15, subjective: 10 };
    } else {
      effectiveMix = { mcq: 10, subjective: 10, programming: 15 };
    }
  }

  const allQuestions = [];

  for (const [qType, totalMarks] of Object.entries(effectiveMix)) {
    if (totalMarks <= 0) continue;

    // Look for prompt builder in current component or fallback to technical / written_english / oral_english
    const promptBuilder = componentPrompts[qType] ||
      COMPONENT_PROMPTS.technical[qType] ||
      COMPONENT_PROMPTS.written_english[qType] ||
      COMPONENT_PROMPTS.oral_english[qType];

    if (!promptBuilder) {
      console.warn(`  No prompt template for ${normComponent}/${qType}, skipping`);
      continue;
    }

    // Estimate count based on marks
    let count;
    if (qType === 'mcq') count = Math.min(totalMarks, 15); // max 15 per batch for fast response
    else if (qType === 'oral_task') count = 4; // fixed 4 tasks
    else if (qType === 'writing_task') count = 1; // single task
    else if (qType === 'programming') count = Math.max(1, Math.min(Math.ceil(totalMarks / 5), 4)); // 1-4 programming questions
    else count = Math.max(1, Math.min(Math.ceil(totalMarks / 2), 5)); // 1-5 subjective questions

    const prompt = promptBuilder(topic, description, count, difficulty);

    console.log(`  Generating ${count}x ${qType} for ${normComponent}...`);

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
