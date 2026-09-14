import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { generateText } from 'ai';
import { saveSurvey, SurveyBlueprint } from '../../../../lib/db';
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

    const { topic, description } = await req.json();

    if (!topic || !description) {
      return new Response(
        JSON.stringify({ error: "Topic and Description are required" }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const systemPrompt = `You are a research analyst expert in designing surveys and customer interviews.
Given a topic and description of what the user wants to research, design a survey plan in JSON.
The JSON object must strictly match the following typescript structure:
{
  "title": string, // Catchy and short survey title
  "goals": string[], // A list of 3 to 4 specific information goals (insights to uncover)
  "persona": string // Description of the optimal AI interviewer persona profile (e.g., "Warm and empathetic retail manager", "Strict and structured HR analyst")
}

Do not include any explanation, markdown formatting (like \`\`\`json), or whitespace outside of the JSON block. Return ONLY the raw JSON string.`;

    const prompt = `Topic: "${topic}"\nDescription: "${description}"`;

    const result = await generateText({
      model: google('gemini-2.5-flash-lite'),
      system: systemPrompt,
      prompt: prompt,
    });

    const cleanText = result.text.replace(/```json/g, '').replace(/```/g, '').trim();
    const blueprintData = JSON.parse(cleanText);

    const survey: SurveyBlueprint = {
      id: Date.now().toString(),
      title: blueprintData.title || "Custom AI Survey",
      topic: topic,
      description: description,
      goals: blueprintData.goals || ["Gather user feedback"],
      persona: blueprintData.persona || "Professional analyst",
      createdAt: new Date().toISOString(),
    };

    saveSurvey(survey);

    return new Response(JSON.stringify(survey), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error("Survey generation failed:", error);
    return new Response(
      JSON.stringify({ error: "Failed to generate survey: " + error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
