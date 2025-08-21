// Autosave config
let lastConfig = {};
let lastAnswers = {};
function saveConfig() {
  const config = {
    book: document.getElementById('bookName').value,
    chapters: document.getElementById('chapters').value,
    ageRange: document.getElementById('ageRange').value,
    useGeneric: document.getElementById('useGeneric').checked
  };
  localStorage.setItem('quizConfig', JSON.stringify(config));
  lastConfig = { ...config };
}

function loadConfig() {
  const saved = localStorage.getItem('quizConfig');
  if (saved) {
    const config = JSON.parse(saved);
    document.getElementById('bookName').value = config.book || '';
    document.getElementById('chapters').value = config.chapters || 'all';
    document.getElementById('ageRange').value = config.ageRange || '';
    document.getElementById('useGeneric').checked = config.useGeneric || false;
    lastConfig = { ...config };
  }
}

function showStatus(message, color = '#6c757d') {
  const status = document.getElementById('autosaveStatus');
  status.textContent = message;
  status.style.color = color;
  status.style.display = 'block';
  setTimeout(() => { status.style.display = 'none'; }, 2000);
}

// Periodic autosave
function startAutosave() {
  setInterval(() => {
    // Autosave config (1st page)
    if (document.getElementById('inputSection').style.display !== 'none') {
      const currentConfig = {
        book: document.getElementById('bookName').value,
        chapters: document.getElementById('chapters').value,
        ageRange: document.getElementById('ageRange').value,
        useGeneric: document.getElementById('useGeneric').checked
      };
      if (JSON.stringify(currentConfig) !== JSON.stringify(lastConfig)) {
        saveConfig();
      }
    }
    // Autosave answers (2nd page)
    if (document.getElementById('quizSection').style.display !== 'none') {
      const savedQuiz = JSON.parse(localStorage.getItem('generatedQuiz'));
      if (savedQuiz) {
        const currentAnswers = {};
        for (let i = 1; i <= savedQuiz.mcqs.length; i++) {
          const selected = document.querySelector(`input[name="mcq${i}"]:checked`);
          currentAnswers[`mcq${i}`] = selected ? selected.value : '';
        }
        for (let i = 1; i <= savedQuiz.openEnded.length; i++) {
          currentAnswers[`open${i}`] = document.getElementById(`open${i}`).value;
        }
        if (JSON.stringify(currentAnswers) !== JSON.stringify(lastAnswers)) {
          saveAnswers();
        }
      }
    }
  }, 30000); // Every 30 seconds
}

// Loading screen functions
function showLoading(message) {
  const loadingScreen = document.getElementById('loadingScreen');
  const loadingMessage = document.getElementById('loadingMessage');
  loadingMessage.textContent = message;
  loadingScreen.style.display = 'flex';
  document.getElementById('inputSection').style.display = 'none';
  document.getElementById('quizSection').style.display = 'none';
  document.getElementById('results').style.display = 'none';
}

function hideLoading() {
  document.getElementById('loadingScreen').style.display = 'none';
}

// Fetch book cover
async function getBookCover(bookName, ageRange, useGeneric) {
  if (useGeneric) {
    return { url: getAgeAppropriateBackground(ageRange), type: 'fallback' };
  }
  try {
    const encodedTitle = encodeURIComponent(bookName.trim().replace(/\s+/g, '+'));
    const response = await fetch(`https://covers.openlibrary.org/b/title/${encodedTitle}-M.jpg`);
    if (response.ok && response.headers.get('content-type').includes('image')) {
      return { url: response.url, type: 'cover' };
    }
    return { url: getAgeAppropriateBackground(ageRange), type: 'fallback', warning: `Book cover not found for "${bookName}", using generic background.` };
  } catch (error) {
    console.error('Book cover fetch error:', error.message);
    return { url: getAgeAppropriateBackground(ageRange), type: 'fallback', warning: `Book cover not found for "${bookName}", using generic background.` };
  }
}

function getAgeAppropriateBackground(ageRange) {
  switch (ageRange) {
    case '5-7':
      return 'https://source.unsplash.com/800x600/?books,children';
    case '8-10':
      return 'https://source.unsplash.com/800x600/?adventure,books';
    case '11-13':
      return 'https://source.unsplash.com/800x600/?literature,teen';
    case '14+':
      return 'https://source.unsplash.com/800x600/?literature,classic';
    default:
      return 'https://source.unsplash.com/800x600/?books';
  }
}

// Speech recognition setup
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
let activeMic = null;

if (SpeechRecognition) {
  recognition = new SpeechRecognition();
  recognition.lang = 'en-US';
  recognition.interimResults = true;
  recognition.continuous = true;

  recognition.onresult = function(event) {
    if (activeMic) {
      const textarea = document.getElementById(`open${activeMic}`);
      const transcript = Array.from(event.results)
        .map(result => result[0].transcript)
        .join('');
      textarea.value = transcript;
      saveAnswers();
    }
  };

  recognition.onerror = function(event) {
    console.error('Speech recognition error:', event.error);
    if (activeMic) {
      const btn = document.getElementById(`micBtn${activeMic}`);
      btn.textContent = '🎤 Start Speaking';
      btn.classList.remove('recording');
      activeMic = null;
      showStatus('Speech recognition failed. Try again.', '#dc3545');
    }
  };

  recognition.onend = function() {
    if (activeMic) {
      const btn = document.getElementById(`micBtn${activeMic}`);
      btn.textContent = '🎤 Start Speaking';
      btn.classList.remove('recording');
      activeMic = null;
    }
  };
}

// Generate quiz
document.getElementById('inputForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const book = document.getElementById('bookName').value;
  const chapters = document.getElementById('chapters').value.toLowerCase();
  const ageRange = document.getElementById('ageRange').value;
  const useGeneric = document.getElementById('useGeneric').checked;

  if (!ageRange) return alert('Please select an age range.');
  if (!useGeneric && !book) return alert('Please enter a book name or select generic questions.');

  showLoading('Generating quiz...');
  try {
    const { url: backgroundUrl, type: backgroundType, warning: backgroundWarning } = await getBookCover(book, ageRange, useGeneric);
    const res = await fetch('/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ book, chapters, ageRange, useGeneric })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    localStorage.setItem('generatedQuiz', JSON.stringify({ 
      mcqs: data.mcqs, 
      openEnded: data.openEnded, 
      ageRange, 
      isBookKnown: data.isBookKnown,
      backgroundUrl,
      backgroundType,
      backgroundWarning
    }));

    renderQuiz(data.mcqs, data.openEnded, data.warning, backgroundUrl, backgroundType, backgroundWarning);
    hideLoading();
    document.getElementById('inputSection').style.display = 'none';
    document.getElementById('quizSection').style.display = 'block';
  } catch (error) {
    hideLoading();
    showStatus(`Failed to generate quiz: ${error.message}`, '#dc3545');
  }
});

// Render quiz
function renderQuiz(mcqs, openEnded, bookWarning, backgroundUrl, backgroundType, backgroundWarning) {
  const mcqContainer = document.getElementById('mcqContainer');
  const openContainer = document.getElementById('openContainer');
  const quizSection = document.getElementById('quizSection');
  mcqContainer.innerHTML = '';
  openContainer.innerHTML = '';

  quizSection.style.backgroundImage = `url(${backgroundUrl})`;
  if (bookWarning) {
    mcqContainer.innerHTML += `<div class="alert alert-warning animate__animated animate__fadeIn">${bookWarning}</div>`;
  }
  if (backgroundWarning && backgroundType === 'fallback') {
    mcqContainer.innerHTML += `<div class="alert alert-info animate__animated animate__fadeIn">${backgroundWarning}</div>`;
  }

  mcqs.forEach((mcq, index) => {
    const qNum = index + 1;
    let html = `<div class="question"><p><strong>${qNum}. ${mcq.question}</strong></p>`;
    for (const opt in mcq.options) {
      html += `<div class="form-check"><input class="form-check-input" type="radio" name="mcq${qNum}" value="${opt}" id="mcq${qNum}${opt}"><label class="form-check-label" for="mcq${qNum}${opt}">${opt}) ${mcq.options[opt]}</label></div>`;
    }
    html += `</div>`;
    mcqContainer.innerHTML += html;
  });

  openEnded.forEach((open, index) => {
    const qNum = mcqs.length + index + 1;
    const html = `<div class="question"><p><strong>${qNum}. ${open.question} (Write or speak your answer)</strong></p><textarea id="open${index + 1}"></textarea><button type="button" class="mic-btn" id="micBtn${qNum}">🎤 Start Speaking</button></div>`;
    openContainer.innerHTML += html;
  });

  setupAutosaveAnswers(mcqs.length, openEnded.length);
  setupMicButtons(mcqs.length, openEnded.length);
  loadAnswers();
}

// Autosave answers
function setupAutosaveAnswers(numMcq, numOpen) {
  const form = document.getElementById('quizForm');
  form.querySelectorAll('input[type="radio"]').forEach(radio => radio.addEventListener('change', saveAnswers));
  let debounce;
  form.querySelectorAll('textarea').forEach(textarea => {
    textarea.addEventListener('input', () => {
      clearTimeout(debounce);
      debounce = setTimeout(saveAnswers, 500);
    });
  });
}

function saveAnswers() {
  const savedQuiz = JSON.parse(localStorage.getItem('generatedQuiz'));
  if (!savedQuiz) return;

  const answers = {};
  for (let i = 1; i <= savedQuiz.mcqs.length; i++) {
    const selected = document.querySelector(`input[name="mcq${i}"]:checked`);
    answers[`mcq${i}`] = selected ? selected.value : '';
  }
  for (let i = 1; i <= savedQuiz.openEnded.length; i++) {
    answers[`open${i}`] = document.getElementById(`open${i}`).value;
  }
  localStorage.setItem('quizAnswers', JSON.stringify(answers));
  lastAnswers = { ...answers };
}

function loadAnswers() {
  const saved = localStorage.getItem('quizAnswers');
  if (saved) {
    const answers = JSON.parse(saved);
    Object.keys(answers).forEach(key => {
      if (key.startsWith('mcq')) {
        const radio = document.querySelector(`input[name="${key}"][value="${answers[key]}"]`);
        if (radio) radio.checked = true;
      } else if (key.startsWith('open')) {
        const textarea = document.getElementById(key);
        if (textarea) textarea.value = answers[key];
      }
    });
    lastAnswers = { ...answers };
  }
}

// Mic setup
function setupMicButtons(numMcq, numOpen) {
  if (!SpeechRecognition) {
    for (let i = 1; i <= numOpen; i++) {
      const qNum = numMcq + i;
      const btn = document.getElementById(`micBtn${qNum}`);
      btn.disabled = true;
      btn.textContent = '🎤 Not Supported';
      btn.style.backgroundColor = '#6c757d';
    }
    return;
  }

  for (let i = 1; i <= numOpen; i++) {
    const qNum = numMcq + i;
    const btn = document.getElementById(`micBtn${qNum}`);
    btn.addEventListener('click', () => {
      if (activeMic === i.toString()) {
        recognition.stop();
        btn.textContent = '🎤 Start Speaking';
        btn.classList.remove('recording');
        activeMic = null;
      } else {
        if (activeMic) {
          recognition.stop();
          const prevBtn = document.getElementById(`micBtn${numMcq + parseInt(activeMic)}`);
          prevBtn.textContent = '🎤 Start Speaking';
          prevBtn.classList.remove('recording');
        }
        activeMic = i.toString();
        btn.textContent = '🎤 Stop Speaking';
        btn.classList.add('recording');
        recognition.start();
      }
    });
  }
}

// Submit quiz
document.getElementById('quizForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (activeMic) {
    recognition.stop();
    const btn = document.getElementById(`micBtn${activeMic}`);
    btn.textContent = '🎤 Start Speaking';
    btn.classList.remove('recording');
    activeMic = null;
  }

  const savedQuiz = JSON.parse(localStorage.getItem('generatedQuiz'));
  if (!savedQuiz) return alert('No quiz generated.');

  const answers = {};
  for (let i = 1; i <= savedQuiz.mcqs.length; i++) {
    answers[`mcq${i}`] = document.querySelector(`input[name="mcq${i}"]:checked`)?.value || '';
  }
  for (let i = 1; i <= savedQuiz.openEnded.length; i++) {
    answers[`open${i}`] = document.getElementById(`open${i}`).value;
  }

  showLoading('Evaluating answers...');
  try {
    const res = await fetch('/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mcqs: savedQuiz.mcqs, openEnded: savedQuiz.openEnded, answers, ageRange: savedQuiz.ageRange })
    });
    const data = await res.json();
    hideLoading();
    document.getElementById('feedback').innerHTML = data.feedback;
    document.getElementById('score').innerHTML = `<strong>${data.score}</strong>`;
    document.getElementById('results').style.backgroundImage = `url(${savedQuiz.backgroundUrl})`;
    document.getElementById('results').style.display = 'block';
    document.getElementById('quizSection').style.display = 'none';
    localStorage.removeItem('quizAnswers');
  } catch (error) {
    hideLoading();
    showStatus('Failed to submit quiz.', '#dc3545');
  }
});

// Reset quiz answers
document.getElementById('resetQuizBtn').addEventListener('click', () => {
  const savedQuiz = JSON.parse(localStorage.getItem('generatedQuiz'));
  if (!savedQuiz) return alert('No quiz to reset.');
  document.querySelectorAll('input[type="radio"]').forEach(radio => radio.checked = false);
  document.querySelectorAll('textarea').forEach(textarea => textarea.value = '');
  localStorage.removeItem('quizAnswers');
  lastAnswers = {};
  showStatus('Quiz answers reset.');
});

// Back to search
document.getElementById('backBtn').addEventListener('click', () => {
  localStorage.removeItem('generatedQuiz');
  localStorage.removeItem('quizAnswers');
  document.getElementById('inputSection').style.display = 'block';
  document.getElementById('quizSection').style.display = 'none';
  document.getElementById('results').style.display = 'none';
  hideLoading();
  showStatus('Returned to search.');
});

// Start new quiz
document.getElementById('startNewBtn').addEventListener('click', () => {
  localStorage.removeItem('generatedQuiz');
  localStorage.removeItem('quizAnswers');
  document.getElementById('inputSection').style.display = 'block';
  document.getElementById('quizSection').style.display = 'none';
  document.getElementById('results').style.display = 'none';
  hideLoading();
  showStatus('Ready for new quiz.');
});

// On load
document.addEventListener('DOMContentLoaded', () => {
  loadConfig();
  const inputs = document.querySelectorAll('#inputForm input, #inputForm select');
  inputs.forEach(input => input.addEventListener('input', saveConfig));
  const savedQuiz = localStorage.getItem('generatedQuiz');
  if (savedQuiz) {
    const data = JSON.parse(savedQuiz);
    renderQuiz(
      data.mcqs, 
      data.openEnded, 
      data.isBookKnown ? null : `Book not found, using generic questions.`,
      data.backgroundUrl,
      data.backgroundType,
      data.backgroundWarning
    );
    document.getElementById('inputSection').style.display = 'none';
    document.getElementById('quizSection').style.display = 'block';
    loadAnswers();
  }
  startAutosave();
});