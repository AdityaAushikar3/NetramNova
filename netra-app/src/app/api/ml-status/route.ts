import { NextResponse } from 'next/server';

// GET /api/ml-status — ping the Flask inference service and report if it's running
export async function GET() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1500);

    const res = await fetch('http://127.0.0.1:5000/health', {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      return NextResponse.json({ running: true, ...data });
    }
    return NextResponse.json({ running: false, reason: `HTTP ${res.status}` });
  } catch {
    return NextResponse.json({
      running: false,
      reason: 'Flask service not reachable on port 5000. Using CLI fallback.',
    });
  }
}
