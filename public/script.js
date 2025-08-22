document.getElementById('inputForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  console.log('Form submitted, preventing default behavior');

  const book = document.getElementById('bookName').value.trim();
  const chapters = document.getElementById('chapters').value.toLowerCase().trim();
  const ageRange = document.getElementById('ageRange').value;
  const useGeneric = document.getElementById('useGeneric').checked;

  console.log('Form data:', { book, chapters, ageRange, useGeneric });

  if (!ageRange) {
    alert('Please select an age range.');
    return;
  }
  if (!useGeneric && !book) {
    alert('Please enter a book name or select generic questions.');
    return;
  }

  showLoading('Generating quiz...');
  try {
    console.log('Sending fetch request to /generate');
    const { url: backgroundUrl, type: backgroundType, warning: backgroundWarning } = await getBookCover(book, ageRange, useGeneric);
    const res = await fetch('/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ book, chapters, ageRange, useGeneric })
    });
    console.log('Fetch response status:', res.status);
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
    console.error('Generate quiz error:', error);
    hideLoading();
    showStatus(`Failed to generate quiz: ${error.message}`, '#dc3545');
  }
});

document.getElementById('resetBtn').addEventListener('click', () => {
  document.getElementById('inputForm').reset();
  localStorage.removeItem('quizConfig');
  showStatus('Form reset.', '#6c757d');
});

document.getElementById('submitBtn').addEventListener('click', () => {
  const answers = {};
  document.querySelectorAll('input[type="radio"]:checked').forEach(radio => {
    answers[radio.name] = radio.value;
  });
  document.querySelectorAll('textarea').forEach((textarea, i) => {
    answers[`open${i + 1}`] = textarea.value;
  });

  const quizData = JSON.parse(localStorage.getItem('generatedQuiz'));
  fetch('/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mcqs: quizData.mcqs, openEnded: quizData.openEnded, answers, ageRange: quizData.ageRange })
  })
    .then(res => res.json())
    .then(data => {
      document.getElementById('resultsContent').innerHTML = data.feedback + '<p>' + data.score + '</p>';
      document.getElementById('quizSection').style.display = 'none';
      document.getElementById('resultsSection').style.display = 'block';
    })
    .catch(error => {
      console.error('Submit error:', error);
      showStatus('Failed to submit quiz.', '#dc3545');
    });
});

document.getElementById('resetAnswersBtn').addEventListener('click', () => {
  document.querySelectorAll('input[type="radio"]').forEach(radio => radio.checked = false);
  document.querySelectorAll('textarea').forEach(textarea => textarea.value = '');
  showStatus('Answers reset.', '#6c757d');
});

document.getElementById('backBtn').addEventListener('click', () => {
  document.getElementById('quizSection').style.display = 'none';
  document.getElementById('inputSection').style.display = 'block';
});

document.getElementById('newQuizBtn').addEventListener('click', () => {
  document.getElementById('resultsSection').style.display = 'none';
  document.getElementById('inputSection').style.display = 'block';
  document.getElementById('inputForm').reset();
  localStorage.removeItem('quizConfig');
  localStorage.removeItem('generatedQuiz');
  document.body.style.backgroundImage = '';
  showStatus('Started new quiz.', '#6c757d');
});

function showLoading(message) {
  const loading = document.getElementById('loading');
  loading.textContent = message;
  loading.style.display = 'block';
}

function hideLoading() {
  document.getElementById('loading').style.display = 'none';
}

function showStatus(message, color) {
  const status = document.getElementById('status');
  status.textContent = message;
  status.style.color = color;
  status.classList.add('animate__animated', 'animate__fadeIn');
  setTimeout(() => status.classList.remove('animate__fadeIn'), 1000);
}

function renderQuiz(mcqs, openEnded, warning, backgroundUrl, backgroundType, backgroundWarning) {
  let html = '';
  if (warning) showStatus(warning, '#ffc107');
  if (backgroundWarning) showStatus(backgroundWarning, '#17a2b8');

  mcqs.forEach((mcq, index) => {
    html += `<p><strong>Question ${index + 1}:</strong> ${mcq.question}</p>`;
    html += '<div class="options">';
    for (const [key, value] of Object.entries(mcq.options)) {
      html += `<div><input type="radio" id="mcq${index + 1}${key}" name="mcq${index + 1}" value="${key}">
                <label for="mcq${index + 1}${key}">${key.toUpperCase()}: ${value}</label></div>`;
    }
    html += '</div>';
  });

  openEnded.forEach((open, index) => {
    html += `<p><strong>Question ${mcqs.length + index + 1}:</strong> ${open.question}</p>`;
    html += `<textarea class="form-control mt-2" rows="3" placeholder="Write your answer here..."></textarea>`;
  });

  document.getElementById('quizContent').innerHTML = html;
  if (backgroundUrl) {
    document.body.style.backgroundImage = `url(${backgroundUrl})`;
    document.body.classList.add(`background-${backgroundType}`);
    document.body.classList.remove('alert-info', 'alert-warning');
  }
}

function getBookCover(bookTitle, ageRange, useGeneric) {
  return new Promise((resolve) => {
    const coverUrl = `https://covers.openlibrary.org/b/title/${encodeURIComponent(bookTitle)}-M.jpg`;
    fetch(coverUrl)
      .then(response => {
        if (!response.ok) throw new Error('Cover not found');
        return response.blob();
      })
      .then(blob => {
        const url = URL.createObjectURL(blob);
        resolve({ url, type: 'cover', warning: '' });
      })
      .catch(error => {
        console.error('Cover fetch error:', error);
        const fallbackUrl = getAgeAppropriateBackground(ageRange);
        fetch(`https://source.unsplash.com/1920x1080/?${fallbackUrl}`)
          .then(response => {
            if (!response.ok) throw new Error('Fallback image failed');
            return response.blob();
          })
          .then(blob => {
            const url = URL.createObjectURL(blob);
            resolve({ url, type: 'fallback', warning: 'Book cover not available. Using a generic background.' });
          })
          .catch(fallbackError => {
            console.error('Fallback error:', fallbackError);
            resolve({ url: '', type: '', warning: 'Failed to load background image.' });
          });
      });
  });
}

function getAgeAppropriateBackground(ageRange) {
  const themes = {
    '5-7': 'children+storybook',
    '8-10': 'middle-grade+adventure',
    '11-13': 'young-adult+fantasy',
    '14+': 'teen+novel'
  };
  return themes[ageRange] || 'literature';
}

function showAlert(type, message, autoHide) {
  const alertDiv = document.createElement('div');
  alertDiv.className = `alert alert-${type} alert-dismissible fade show animate__animated animate__fadeIn`;
  alertDiv.role = 'alert';
  alertDiv.innerHTML = `${message}<button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>`;
  document.body.appendChild(alertDiv);
  if (autoHide) {
    setTimeout(() => alertDiv.classList.remove('show'), 5000);
    setTimeout(() => alertDiv.remove(), 5500);
  }
}

// Auto-save configuration every 30 seconds silently
let saveTimeout;
function saveConfig() {
  clearTimeout(saveTimeout);
  const config = {
    book: document.getElementById('bookName').value,
    chapters: document.getElementById('chapters').value,
    ageRange: document.getElementById('ageRange').value,
    useGeneric: document.getElementById('useGeneric').checked
  };
  localStorage.setItem('quizConfig', JSON.stringify(config));
  saveTimeout = setTimeout(saveConfig, 30000);
}

document.getElementById('bookName').addEventListener('input', saveConfig);
document.getElementById('chapters').addEventListener('input', saveConfig);
document.getElementById('ageRange').addEventListener('change', saveConfig);
document.getElementById('useGeneric').addEventListener('change', saveConfig);

// Load saved configuration on page load
window.addEventListener('load', () => {
  const savedConfig = localStorage.getItem('quizConfig');
  if (savedConfig) {
    const config = JSON.parse(savedConfig);
    document.getElementById('bookName').value = config.book || '';
    document.getElementById('chapters').value = config.chapters || '';
    document.getElementById('ageRange').value = config.ageRange || '';
    document.getElementById('useGeneric').checked = config.useGeneric || false;
  }
});
