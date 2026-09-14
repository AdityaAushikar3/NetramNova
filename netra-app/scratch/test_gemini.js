const { createGoogleGenerativeAI } = require('@ai-sdk/google');
const { generateText } = require('ai');
const fs = require('fs');
const path = require('path');

let apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY;

if (!apiKey) {
  try {
    const envPath = path.join(__dirname, '../.env');
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf8');
      const match = envContent.match(/GOOGLE_GENERATIVE_AI_API_KEY\s*=\s*([^\r\n]+)/);
      if (match) {
        apiKey = match[1].trim();
      }
    }
  } catch (err) {
    console.error("Local .env read failed:", err);
  }
}

console.log('Using API key:', apiKey ? apiKey.substring(0, 8) + '...' : 'undefined');

const google = createGoogleGenerativeAI({
  apiKey: apiKey,
});

async function main() {
  try {
    console.log('Sending request to gemini-2.5-flash-lite...');
    const result = await generateText({
      model: google('gemini-2.5-flash-lite'),
      prompt: 'Hello, reply with "OK".',
    });
    console.log('Success! Response:', result.text);
  } catch (error) {
    console.error('Error occurred for gemini-2.5-flash-lite:', error.message || error);
  }

  try {
    console.log('Sending request to gemini-2.0-flash...');
    const result = await generateText({
      model: google('gemini-2.0-flash'),
      prompt: 'Hello, reply with "OK".',
    });
    console.log('Success! Response:', result.text);
  } catch (error) {
    console.error('Error occurred for gemini-2.0-flash:', error.message || error);
  }
}

main();
