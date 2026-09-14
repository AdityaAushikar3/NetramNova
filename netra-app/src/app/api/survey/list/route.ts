import { listSurveys, listSessionsForSurvey } from '../../../../lib/db';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const surveyId = searchParams.get('surveyId');

    if (surveyId) {
      const sessions = listSessionsForSurvey(surveyId);
      return new Response(JSON.stringify({ sessions }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const surveys = listSurveys();
    
    // For each survey, load its sessions count
    const surveysWithStats = surveys.map((survey) => {
      const sessions = listSessionsForSurvey(survey.id);
      return {
        ...survey,
        responseCount: sessions.length,
      };
    });

    return new Response(JSON.stringify({ surveys: surveysWithStats }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: "Failed to list surveys: " + error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
