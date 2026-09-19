import { NextRequest, NextResponse } from 'next/server';
import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';

const execFileAsync = promisify(execFile);

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get('content-type') || '';
    let imageBuffer: Buffer | null = null;
    let localImagePath: string | null = null;

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const file = formData.get('file') as File | null;
      if (file) {
        const arrayBuffer = await file.arrayBuffer();
        imageBuffer = Buffer.from(arrayBuffer);
      }
    } else if (contentType.includes('application/json')) {
      const body = await req.json();
      if (body.imageBase64) {
        const base64Data = body.imageBase64.replace(/^data:image\/\w+;base64,/, '');
        imageBuffer = Buffer.from(base64Data, 'base64');
      } else if (body.imagePath) {
        localImagePath = body.imagePath;
      }
    }

    if (!imageBuffer && !localImagePath) {
      return NextResponse.json(
        { error: 'No image provided. Please upload an image file or provide base64 data.' },
        { status: 400 }
      );
    }

    // 1. Try warm microservice on port 5000 first (fastest, ~80ms)
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);

      let fetchOptions: RequestInit;
      if (imageBuffer) {
        const fd = new FormData();
        const blob = new Blob([new Uint8Array(imageBuffer)], { type: 'image/jpeg' });
        fd.append('file', blob, 'scan.jpg');
        fetchOptions = {
          method: 'POST',
          body: fd,
          signal: controller.signal,
        };
      } else {
        fetchOptions = {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image_path: localImagePath }),
          signal: controller.signal,
        };
      }

      const response = await fetch('http://127.0.0.1:5000/predict', fetchOptions);
      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        return NextResponse.json(data);
      }
    } catch (e) {
      // Microservice not running or timed out; fall through to direct CLI execution
    }

    // 2. Fallback: Direct CLI execution with PyTorch
    const projectRoot = process.cwd();
    const tempDir = path.join(projectRoot, 'ml_pipeline', 'outputs', 'tmp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    let targetFile = localImagePath;
    let cleanUp = false;

    if (!targetFile && imageBuffer) {
      targetFile = path.join(tempDir, `scan_${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`);
      fs.writeFileSync(targetFile, imageBuffer);
      cleanUp = true;
    }

    try {
      const scriptPath = path.join(projectRoot, 'ml_pipeline', 'inference_service.py');
      const { stdout, stderr } = await execFileAsync('python', [
        scriptPath,
        '--cli',
        '--image',
        targetFile as string,
      ], {
        maxBuffer: 50 * 1024 * 1024,
        // API-1 FIX: Add timeout so a hung Python process doesn't block the server indefinitely.
        // 2 minutes is generous for cold-start CPU inference; GPU is typically ~5s.
        timeout: 120000,
      });

      const rawOut = stdout.trim();
      const jsonStart = rawOut.indexOf('{');
      const jsonEnd = rawOut.lastIndexOf('}');
      if (jsonStart === -1 || jsonEnd === -1) {
        throw new Error(`Invalid JSON output from Python CLI: ${rawOut}`);
      }
      const parsed = JSON.parse(rawOut.substring(jsonStart, jsonEnd + 1));
      return NextResponse.json(parsed);
    } finally {
      if (cleanUp && targetFile && fs.existsSync(targetFile)) {
        try {
          fs.unlinkSync(targetFile);
        } catch (_) {}
      }
    }
  } catch (error: unknown) {
    console.error('[API /api/classify Error]', error);
    return NextResponse.json(
      { error: 'Classification failed', details: error?.message || String(error) },
      { status: 500 }
    );
  }
}
