require('dotenv').config();
const express = require('express');
const axios = require('axios');
const { Configuration, OpenAIApi } = require('openai');
const bodyParser = require('body-parser');
const app = express();

const ASSEMBLYAI_API_KEY = process.env.ASSEMBLYAI_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!ASSEMBLYAI_API_KEY || !OPENAI_API_KEY) {
  console.error("Please set ASSEMBLYAI_API_KEY and OPENAI_API_KEY in .env file");
  process.exit(1);
}

const openai = new OpenAIApi(new Configuration({ apiKey: OPENAI_API_KEY }));

app.use(express.static('public'));
app.use(bodyParser.json({ limit: '50mb' }));

app.post('/transcribe', async (req, res) => {
  const { audio, mimeType, previousMapping } = req.body;
  
  if (!audio) {
    return res.status(400).json({ error: 'No audio data provided' });
  }

  try {
    console.log('Received audio data:', {
      audioLength: audio.length,
      mimeType
    });

    // Upload audio to AssemblyAI
    console.log('Uploading audio to AssemblyAI...');
    const uploadResp = await axios.post(
      'https://api.assemblyai.com/v2/upload',
      Buffer.from(audio, 'base64'),
      {
        headers: {
          'authorization': ASSEMBLYAI_API_KEY,
          'content-type': 'application/octet-stream'
        }
      }
    );
    
    const uploadUrl = uploadResp.data.upload_url;
    console.log('Audio uploaded, got URL:', uploadUrl);

    // Create transcription
    const transcriptCreate = await axios.post(
      'https://api.assemblyai.com/v2/transcript',
      {
        audio_url: uploadUrl
      },
      {
        headers: {
          'authorization': ASSEMBLYAI_API_KEY,
          'content-type': 'application/json'
        }
      }
    );

    const transcriptId = transcriptCreate.data.id;
    console.log('Created transcription request with ID:', transcriptId);

    // Poll for transcription completion
    let transcriptStatus = 'processing';
    let transcriptText = '';
    while (transcriptStatus !== 'completed' && transcriptStatus !== 'error') {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      const statusResp = await axios.get(`https://api.assemblyai.com/v2/transcript/${transcriptId}`, {
        headers: {
          'authorization': ASSEMBLYAI_API_KEY
        }
      });
      transcriptStatus = statusResp.data.status;
      if (transcriptStatus === 'completed') {
        transcriptText = statusResp.data.text;
        console.log('Transcription completed. Text length:', transcriptText.length);
      } else if (transcriptStatus === 'error') {
        console.error('AssemblyAI Transcription Error:', statusResp.data.error);
        throw new Error('Transcription error: ' + statusResp.data.error);
      }
    }

    if (!transcriptText) {
      return res.json({ text: '', argumentsSummary: '' });
    }

    // Prepare request to OpenAI
    const messages = [
      {
        role: 'system',
        content: `You are an argument mapping assistant. Format your response as follows:
- Each main point starts with a bullet point and a line break
- Use indentation for supporting points
- Format key terms with *asterisks*
- Each point should be on its own line
- Use clear hierarchy with main points and sub-points
- No introductory text, just the structured points`
      },
      {
        role: 'user',
        content:
          `Map the key arguments from this transcript using this structure:
            - *Main Point:* Description
              - *Supporting Point 1:* Description
              - *Supporting Point 2:* Description
          Here is the transcript: "${transcriptText}"` +
          (previousMapping
            ? `\n\nHere is the existing argument mapping: "${previousMapping}"\nIncorporate the new points into the existing mapping using the same formatting style.`
            : '')
      }
    ];

    const openaiResp = await openai.createChatCompletion({
      model: 'gpt-4',
      messages,
      max_tokens: 2000,
      temperature: 0.7
    });

    const argumentsSummary = openaiResp.data.choices[0].message.content.trim();

    res.json({
      text: transcriptText,
      argumentsSummary: argumentsSummary
    });
  } catch (error) {
    console.error('Detailed error in /transcribe:', {
      name: error.name,
      message: error.message,
      stack: error.stack,
      response: error.response?.data
    });
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
