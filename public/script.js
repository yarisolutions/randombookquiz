require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const OpenAI = require('openai');

const app = express();
const port = process.env.PORT || 3000;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.use(bodyParser.json());
app.use(express.static('public'));

// Endpoint to generate quiz questions using OpenAI
app.post('/generate', async (req, res) => {
  const { book, chapters, ageRange, useGeneric } = req.body;

  try {
    let prompt;
    let isBookKnown = true;

    if (!useGeneric) {
      // Step 1: Check if the book is known
      const validationPrompt = `Is the book "${book}" a known published book? Respond with JSON: {"isKnown": boolean, "message": "string"}`;
      const validationCompletion = await openai.chat.completions.create({
        model: 'gpt-5-nano',
        messages: [{ role: 'user', content: validationPrompt }],
      });
      const validationResult = JSON.parse(validationCompletion.choices[0].message.content);

      if (!validationResult.isKnown) {
        isBookKnown = false;
        prompt = `The book "${book}" was not found. Generate a generic literature quiz suitable for age range ${ageRange}, not tied to a specific book.
- Create 6 multiple-choice questions (MCQs) about general reading comprehension, literary themes, or story elements (e.g., plot, characters, setting, themes).
- Each MCQ should have a question, 4 options (a, b, c, d), and specify the correct answer letter.
- Create 4 open-ended questions for written responses about general literature concepts (e.g., analyzing themes, character motivations).
- For each open-ended question, provide the question and a list of key points for evaluation.
- Adjust difficulty and language to be appropriate for the age range.
- Respond ONLY in JSON format: {
  "mcqs": [{"question": "str", "options": {"a": "str", "b": "str", "c": "str", "d": "str"}, "correct": "letter"} ...],
  "openEnded": [{"question": "str", "keyPoints": ["point1", "point2", ...]} ...],
  "warning": "Book '${book}' not found, using generic questions."
}`;
      } else {
        prompt = `Generate a quiz for the book "${book}" covering ${chapters === 'all' ? 'all chapters' : `chapters ${chapters}`}, suitable for age range ${ageRange}.
- Create 6 multiple-choice questions (MCQs). Each MCQ should have a question, 4 options (a, b, c, d), and specify the correct answer letter.
- Create 4 open-ended questions for written responses. For each, provide the question and a list of key points for evaluation.
- Adjust difficulty and language to be appropriate for the age range.
- Respond ONLY in JSON format: {
  "mcqs": [{"question": "str", "options": {"a": "str", "b": "str", "c": "str", "d": "str"}, "correct": "letter"} ...],
  "openEnded": [{"question": "str", "keyPoints": ["point1", "point2", ...]} ...]
}`;
      }
    } else {
      prompt = `Generate a generic literature quiz suitable for age range ${ageRange}, not tied to a specific book.
- Create 6 multiple-choice questions (MCQs) about general reading comprehension, literary themes, or story elements (e.g., plot, characters, setting, themes).
- Each MCQ should have a question, 4 options (a, b, c, d), and specify the correct answer letter.
- Create 4 open-ended questions for written responses about general literature concepts (e.g., analyzing themes, character motivations).
- For each open-ended question, provide the question and a list of key points for evaluation.
- Adjust difficulty and language to be appropriate for the age range.
- Respond ONLY in JSON format: {
  "mcqs": [{"question": "str", "options": {"a": "str", "b": "str", "c": "str", "d": "str"}, "correct": "letter"} ...],
  "openEnded": [{"question": "str", "keyPoints": ["point1", "point2", ...]} ...]
}`;
    }

    const completion = await openai.chat.completions.create({
      model: 'gpt-5-nano', // Using GPT-5 Nano
      messages: [{ role: 'user', content: prompt }],
    });
    const generated = JSON.parse(completion.choices[0].message.content);
    generated.isBookKnown = isBookKnown; // Add flag for frontend
    res.json(generated);
  } catch (error) {
    console.error('Quiz generation error:', error.message);
    res.status(500).json({ error: `Failed to generate quiz. Ensure GPT-5 Nano is available or check your API key.` });
  }
});

// Endpoint for quiz submission and scoring
app.post('/submit', async (req, res) => {
  const { mcqs, openEnded, answers, ageRange } = req.body;
  let score = 0;
  let feedbackHtml = '';
  const mcqPoints = 1; // Each MCQ worth 1 point, total possible MCQ: 6
  const openPoints = 10; // Each open-ended out of 10, total possible open: 40
  const totalPossible = (mcqs.length * mcqPoints) + (openEnded.length * openPoints);

  // Score MCQs
  mcqs.forEach((mcq, index) => {
    const qNum = index + 1;
    const selected = answers[`mcq${qNum}`];
    if (selected === mcq.correct) {
      score += mcqPoints;
      feedbackHtml += `<p class="correct animate__animated animate__bounceIn">Question ${qNum} (MCQ): Correct!</p>`;
    } else {
      feedbackHtml += `<p class="incorrect animate__animated animate__shakeX">Question ${qNum} (MCQ): Incorrect. Correct is ${mcq.correct.toUpperCase()}.</p>`;
    }
  });

  // Batch evaluate open-ended questions
  const evalPrompts = openEnded.map((open, i) => {
    const qNum = mcqs.length + i + 1;
    const response = answers[`open${i + 1}`] || '';
    return {
      qNum,
      question: open.question,
      keyPoints: open.keyPoints,
      response
    };
  }).filter(item => item.response.trim() !== '').map(item => `
Evaluate the student's response to: "${item.question}" for age range ${ageRange}.
Key points to cover: ${item.keyPoints.join(', ')}.
Score out of 10 (considering age-appropriate understanding, completeness, and accuracy). Provide brief feedback.
Return result as: {"qNum": ${item.qNum}, "score": number, "feedback": "string"}
`);

  if (evalPrompts.length > 0) {
    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-5-nano',
        messages: [{ role: 'user', content: `Evaluate the following responses:\n${evalPrompts.join('\n')}\nRespond with JSON array: [{qNum, score, feedback}, ...]` }],
      });
      const results = JSON.parse(completion.choices[0].message.content);

      // Process results in order
      for (let i = 0; i < openEnded.length; i++) {
        const qNum = mcqs.length + i + 1;
        const response = answers[`open${i + 1}`] || '';
        if (response.trim() === '') {
          feedbackHtml += `<p>Question ${qNum} (Open): <span class="incorrect">Score: 0/10</span></p><div class="feedback animate__animated animate__fadeIn">No response provided.</div>`;
          continue;
        }

        const result = results.find(r => r.qNum === qNum);
        if (result) {
          score += result.score;
          const className = result.score >= 5 ? 'correct' : 'incorrect';
          feedbackHtml += `<p>Question ${qNum} (Open): <span class="${className}">Score: ${result.score}/10</span></p><div class="feedback animate__animated animate__fadeIn">${result.feedback}</div>`;
        } else {
          feedbackHtml += `<p>Question ${qNum} (Open): <span class="incorrect">Score: 0/10</span></p><div class="feedback animate__animated animate__fadeIn">Error evaluating response.</div>`;
        }
      }
    } catch (error) {
      console.error('Batch evaluation error:', error.message);
      for (let i = 0; i < openEnded.length; i++) {
        const qNum = mcqs.length + i + 1;
        feedbackHtml += `<p>Question ${qNum} (Open): <span class="incorrect">Score: 0/10</span></p><div class="feedback animate__animated animate__fadeIn">Error evaluating response. Ensure GPT-5 Nano is available.</div>`;
      }
    }
  } else {
    for (let i = 0; i < openEnded.length; i++) {
      const qNum = mcqs.length + i + 1;
      feedbackHtml += `<p>Question ${qNum} (Open): <span class="incorrect">Score: 0/10</span></p><div class="feedback animate__animated animate__fadeIn">No response provided.</div>`;
    }
  }

  const percentage = ((score / totalPossible) * 100).toFixed(0);
  res.json({ feedback: feedbackHtml, score: `Total Score: ${score}/${totalPossible} (${percentage}%)` });
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
