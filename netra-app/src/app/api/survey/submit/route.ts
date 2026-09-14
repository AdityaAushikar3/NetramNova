import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { generateText } from 'ai';
import { getSurvey, saveSession, RespondentSession } from '../../../../lib/db';
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

const google = createGoogleGenerativeAI({
  apiKey: apiKey,
});

export async function POST(req: Request) {
  try {
    if (!apiKey) {
      return new Response(
        JSON.stringify({
          error: "Missing Google Gemini API key. Please add GOOGLE_GENERATIVE_AI_API_KEY or GEMINI_API_KEY to your Vercel Project Environment Variables.",
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const { surveyId, messages } = await req.json();

    if (!surveyId || !messages || !Array.isArray(messages)) {
      return new Response(
        JSON.stringify({ error: "surveyId and messages are required" }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const survey = getSurvey(surveyId);
    if (!survey) {
      return new Response(
        JSON.stringify({ error: "Survey blueprint not found" }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Call Gemini to extract structured opinions/facts matching the blueprint goals
    const goalsList = survey.goals.map((g, idx) => `${idx + 1}. ${g}`).join('\n');
    
    const systemPrompt = `You are an AI research analyst analyzing a completed conversational interview.
Your task is to read the chat transcript and extract the respondent's core feedback for each of the following survey goals:
${goalsList}

For each goal, write a one-sentence summary of the respondent's feedback. If they didn't discuss or answer a goal, write "Not discussed".
Your response must strictly be a JSON object mapping each goal to its one-sentence summary.
Example format:
{
  "Goal description 1": "The respondent likes the app layout but found the checkout button too small.",
  "Goal description 2": "Not discussed"
}

Do not include any explanation, markdown formatting (like \`\`\`json), or trailing commas. Return ONLY the raw JSON string.`;

    const transcript = messages
      .filter((m: any) => m.role === 'user' || m.role === 'assistant')
      .map((m: any) => `${m.role.toUpperCase()}: ${m.content}`)
      .join('\n');

    const result = await generateText({
      model: google('gemini-2.5-flash-lite'),
      system: systemPrompt,
      prompt: `Transcript:\n${transcript}`,
    });

    let extractedPoints: Record<string, string> = {};
    try {
      const cleanText = result.text.replace(/```json/g, '').replace(/```/g, '').trim();
      extractedPoints = JSON.parse(cleanText);
    } catch (e) {
      console.warn("Failed to parse extracted points JSON. Using fallback.", e);
      // Fallback: map all goals to "Analyzed by AI"
      survey.goals.forEach((g) => {
        extractedPoints[g] = "Response submitted successfully.";
      });
    }

    const session: RespondentSession = {
      id: Date.now().toString(),
      surveyId: surveyId,
      messages: messages,
      extractedPoints: extractedPoints,
      completed: true,
      createdAt: new Date().toISOString(),
    };

    saveSession(session);

    return new Response(JSON.stringify({ success: true, session }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error("Session submission failed:", error);
    return new Response(
      JSON.stringify({ error: "Failed to submit survey: " + error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
