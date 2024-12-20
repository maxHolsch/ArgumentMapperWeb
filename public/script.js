let mediaRecorder;
let audioChunks = [];

const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const transcriptEl = document.getElementById('transcriptText');
const argumentsEl = document.getElementById('argumentsSummary');
const recordingIndicator = document.getElementById('recordingIndicator');
const saveMappingBtn = document.getElementById('saveMappingBtn');
const processingOverlay = document.querySelector('.processing-overlay');

function showProcessing() {
  processingOverlay.classList.add('active');
}

function hideProcessing() {
  processingOverlay.classList.remove('active');
}

startBtn.addEventListener('click', async () => {
  audioChunks = [];
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  mediaRecorder = new MediaRecorder(stream);

  mediaRecorder.addEventListener('dataavailable', event => {
    audioChunks.push(event.data);
  });

  mediaRecorder.start();

  startBtn.style.display = 'none';
  stopBtn.style.display = 'inline';
  recordingIndicator.style.display = 'inline';
  recordingIndicator.classList.add('recording');
});

stopBtn.addEventListener('click', async () => {
  if (!mediaRecorder) return;
  mediaRecorder.stop();
  mediaRecorder.addEventListener('stop', async () => {
    const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
    showProcessing();

    try {
      const base64Audio = await blobToBase64(audioBlob);
      const previousMapping = argumentsEl.textContent.trim();
      const result = await fetch('/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audio: base64Audio,
          mimeType: audioBlob.type,
          previousMapping: previousMapping !== 'Click here to edit key arguments...' ? previousMapping : ''
        })
      }).then(r => r.json());

      transcriptEl.textContent = result.text || '(No transcription)';

      let formattedArguments = (result.argumentsSummary || '')
        .replace(/^(Certainly!|Here is|I will|Let me).+?\n/, '')
        .replace(/\*\*/g, '*')
        .replace(/^- /gm, '\n- ')
        .replace(/(?<=\n- .+\n)\s*-/gm, '  -')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

      argumentsEl.innerHTML = formattedArguments || '(No arguments extracted)';
    } catch (err) {
      console.error('Transcription error:', err);
      transcriptEl.textContent = `Error: ${err.message || 'could not transcribe audio'}`;
      argumentsEl.textContent = '';
    } finally {
      hideProcessing();
      startBtn.style.display = 'inline';
      stopBtn.style.display = 'none';
      recordingIndicator.style.display = 'none';
      recordingIndicator.classList.remove('recording');
    }
  });
});

saveMappingBtn.addEventListener('click', () => {
  const argumentsText = document.getElementById('argumentsSummary').innerText;
  const rtfContent = `
    {\\rtf1\\ansi\\ansicpg1252\\deff0\\nouicompat\\deflang1033
    {\\fonttbl{\\f0\\fnil\\fcharset0 Calibri;}}
    {\\*\\generator Riched20 10.0.18362;}\\viewkind4\\uc1 
    \\pard\\sa200\\sl276\\slmult1\\f0\\fs22\\lang9 ${argumentsText.replace(/\n/g, '\\par ')}\\par
    }
  `;

  const blob = new Blob([rtfContent], { type: 'application/rtf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'key_arguments.docx';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
});

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result.split(',')[1];
      resolve(base64String);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
