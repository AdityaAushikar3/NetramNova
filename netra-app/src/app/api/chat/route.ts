import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { streamText } from 'ai';
import { getSurvey } from '../../../lib/db';
import fs from 'fs';
import path from 'path';

// Resolve the API key robustly due to Next.js workspace root shifting
let apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY;

if (!apiKey) {
  try {
    const envPath = path.join(process.cwd(), '.env');
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

// Initialize the Google Generative AI provider using resolved apiKey
const google = createGoogleGenerativeAI({
  apiKey: apiKey,
});

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

export async function POST(req: Request) {
  if (!apiKey) {
    return new Response(
      JSON.stringify({
        error: "Missing Google Gemini API key. Please add GOOGLE_GENERATIVE_AI_API_KEY or GEMINI_API_KEY to your Vercel Project Environment Variables.",
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const { messages, surveyId } = await req.json();

  let systemPrompt = `You are an AI Interviewer conducting a user feedback survey.
Your persona is a "Formal Research Analyst". You are objective, structured, but polite.
You must adopt the language and dialect of the user. If they use Hinglish, you should seamlessly mirror their style.

Your Goal (The Survey Blueprint):
You are investigating why users drop off during the checkout process of an e-commerce app.
Your information goals to uncover are:
1. What was their primary reason for visiting the app today?
2. Did they encounter any confusing UI elements during checkout?
3. Was the pricing or shipping fee a factor in not completing the purchase?

Rules:
- Ask ONE question at a time. Do not overwhelm the user.
- Wait for their answer before moving to the next goal.
- If their answer is vague, ask a clarifying follow-up question.
- Start the conversation by warmly introducing the survey and asking the first question.
- Be concise. Keep your questions under 3 sentences.`;

  // Dynamically load custom blueprint if surveyId is provided
  if (surveyId) {
    const survey = getSurvey(surveyId);
    if (survey) {
      const goalsList = survey.goals.map((g, idx) => `${idx + 1}. ${g}`).join('\n');
      systemPrompt = `You are an AI Interviewer conducting a user feedback survey.
Your persona profile is: "${survey.persona}". You must strictly adopt this persona, tone, and vocabulary in all your responses.
You must adopt the language and dialect of the user. If they use Hinglish, you should seamlessly mirror their style.

Your Goal (The Survey Blueprint):
Topic: "${survey.topic}"
Description: "${survey.description}"

Your specific information goals to uncover from the respondent are:
${goalsList}

Rules:
- Ask ONE question at a time. Do not overwhelm the user.
- Wait for their answer before moving to the next goal.
- If their answer is vague, ask a clarifying follow-up question.
- Start the conversation by introducing yourself warmly according to your persona and asking the first question related to the topic.
- Be concise. Keep your questions under 3 sentences.`;
    }
  }

  try {
    const result = await streamText({
      model: google('gemini-2.5-flash-lite'),
      system: systemPrompt,
      messages,
    });

    return result.toTextStreamResponse();
  } catch (error: any) {
    console.error("Chat API error:", error);
    return new Response(
      JSON.stringify({ error: error.message || String(error) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}


