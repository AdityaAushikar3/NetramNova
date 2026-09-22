import { NextRequest, NextResponse } from 'next/server';
import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

const execFileAsync = promisify(execFile);

// Configurable ML service URL and timeouts
const ML_SERVICE_URL = process.env.ML_SERVICE_URL ?? 'http://127.0.0.1:5000';
const ML_REQUEST_TIMEOUT_MS = parseInt(process.env.ML_REQUEST_TIMEOUT_MS ?? '30000', 10);
const ML_FALLBACK_TIMEOUT_MS = parseInt(process.env.ML_FALLBACK_TIMEOUT_MS ?? '300000', 10);
const PYTHON_BIN = process.env.PYTHON_BIN ?? 'python';

// Allowed MIME types for retinal images
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_UPLOAD_SIZE = 50 * 1024 * 1024; // 50 MB

function getExtensionForMime(mime: string): string {
  if (mime === 'image/png') return '.png';
  if (mime === 'image/webp') return '.webp';
  return '.jpg';
}

export async function POST(req: NextRequest) {
  const requestId = randomUUID();
  const startTime = Date.now();

  try {
    const contentType = req.headers.get('content-type') || '';
    let imageBuffer: Buffer | null = null;
    let localImagePath: string | null = null;
    let originalMimeType = 'image/jpeg';

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const file = formData.get('file') as File | null;
      if (file) {
        // Validate file size
        if (file.size > MAX_UPLOAD_SIZE) {
          return NextResponse.json(
            { ok: false, stage: 'validation', code: 'FILE_TOO_LARGE', message: `File exceeds maximum size of ${MAX_UPLOAD_SIZE / 1024 / 1024}MB` },
            { status: 400 }
          );
        }
        // Validate MIME type
        if (file.type && !ALLOWED_MIME_TYPES.has(file.type)) {
          return NextResponse.json(
            { ok: false, stage: 'validation', code: 'INVALID_MIME_TYPE', message: `Unsupported file type: ${file.type}. Allowed: JPEG, PNG, WebP` },
            { status: 400 }
          );
        }
        originalMimeType = file.type || 'image/jpeg';
        const arrayBuffer = await file.arrayBuffer();
        imageBuffer = Buffer.from(arrayBuffer);
      }
    } else if (contentType.includes('application/json')) {
      const body = await req.json();
      if (body.imageBase64) {
        const base64Data = body.imageBase64.replace(/^data:image\/\w+;base64,/, '');
        imageBuffer = Buffer.from(base64Data, 'base64');
        // Extract MIME from data URI if present
        const mimeMatch = body.imageBase64.match(/^data:(image\/\w+);base64,/);
        if (mimeMatch) originalMimeType = mimeMatch[1];
      } else if (body.imagePath) {
        // SECURITY FIX: Prevent arbitrary file read via imagePath
        if (body.imagePath.includes('..') || body.imagePath.startsWith('/') || body.imagePath.startsWith('\\')) {
          return NextResponse.json(
            { ok: false, stage: 'validation', code: 'INVALID_PATH', message: 'Path traversal detected.' },
            { status: 400 }
          );
        }
        localImagePath = body.imagePath;
      }
    }

    if (!imageBuffer && !localImagePath) {
      return NextResponse.json(
        { ok: false, stage: 'validation', code: 'NO_IMAGE', message: 'No image provided. Please upload an image file or provide base64 data.' },
        { status: 400 }
      );
    }

    // Validate non-zero file size
    if (imageBuffer && imageBuffer.length === 0) {
      return NextResponse.json(
        { ok: false, stage: 'validation', code: 'EMPTY_FILE', message: 'Uploaded file is empty.' },
        { status: 400 }
      );
    }

    console.log(`[classify] requestId=${requestId} mimeType=${originalMimeType} fileSize=${imageBuffer?.length ?? 'path'} mlService=${ML_SERVICE_URL}`);

    // 1. Try warm microservice first (fastest, ~80ms)
    let mlServiceError: string | null = null;
    let mlServiceStatus: number | null = null;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), ML_REQUEST_TIMEOUT_MS);

      let fetchOptions: RequestInit;
      if (imageBuffer) {
        const fd = new FormData();
        // Preserve actual MIME type instead of always forcing image/jpeg
        const blob = new Blob([new Uint8Array(imageBuffer)], { type: originalMimeType });
        fd.append('file', blob, `scan${getExtensionForMime(originalMimeType)}`);
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

      const response = await fetch(`${ML_SERVICE_URL}/predict`, fetchOptions);
      clearTimeout(timeoutId);
      mlServiceStatus = response.status;

      if (response.ok) {
        const data = await response.json();
        console.log(`[classify] requestId=${requestId} mlStatus=200 result=success durationMs=${Date.now() - startTime}`);
        return NextResponse.json(data);
      }

      // ML service returned a non-OK response — PRESERVE the error body
      const errorData = await response.json().catch(() => null);
      mlServiceError = errorData?.message ?? errorData?.error ?? `ML service returned HTTP ${response.status}`;

      // If Flask returned a structured quality rejection (422), pass it through
      if (response.status === 422 && errorData) {
        console.log(`[classify] requestId=${requestId} mlStatus=422 result=quality_rejected durationMs=${Date.now() - startTime}`);
        return NextResponse.json(errorData, { status: 422 });
      }

      console.warn(`[classify] requestId=${requestId} mlStatus=${response.status} error=${mlServiceError} fallback=cli`);
    } catch (e: any) {
      mlServiceError = e.name === 'AbortError' ? 'ML service timeout' : (e.message || 'ML service unavailable');
      console.warn(`[classify] requestId=${requestId} mlServiceError=${mlServiceError} fallback=cli`);
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
      const ext = getExtensionForMime(originalMimeType);
      targetFile = path.join(tempDir, `scan_${Date.now()}_${Math.random().toString(36).substring(7)}${ext}`);
      fs.writeFileSync(targetFile, imageBuffer);
      cleanUp = true;
    }

    try {
      const scriptPath = path.join(projectRoot, 'ml_pipeline', 'inference_service.py');
      const { stdout, stderr } = await execFileAsync(PYTHON_BIN, [
        scriptPath,
        '--cli',
        '--image',
        targetFile as string,
      ], {
        maxBuffer: 50 * 1024 * 1024,
        timeout: ML_FALLBACK_TIMEOUT_MS,
      });

      const rawOut = stdout.trim();
      const jsonStart = rawOut.indexOf('{');
      const jsonEnd = rawOut.lastIndexOf('}');
      if (jsonStart === -1 || jsonEnd === -1) {
        throw new Error(`Invalid JSON output from Python CLI: ${rawOut.substring(0, 200)}`);
      }
      const parsed = JSON.parse(rawOut.substring(jsonStart, jsonEnd + 1));

      // Check if CLI returned an error result
      if (parsed.error) {
        console.log(`[classify] requestId=${requestId} fallbackUsed=true result=cli_error durationMs=${Date.now() - startTime}`);
        return NextResponse.json(
          { ok: false, stage: 'ml_inference', code: parsed.type ?? 'CLI_ERROR', message: parsed.error, fallbackAttempted: true },
          { status: 422 }
        );
      }

      console.log(`[classify] requestId=${requestId} fallbackUsed=true result=success durationMs=${Date.now() - startTime}`);
      return NextResponse.json(parsed);
    } finally {
      if (cleanUp && targetFile && fs.existsSync(targetFile)) {
        try {
          fs.unlinkSync(targetFile);
        } catch (_) {}
      }
    }
  } catch (error: any) {
    console.error(`[classify] requestId=${requestId} FATAL`, error);
    let details = error instanceof Error ? error.message : String(error);
    if (error.stdout) details += `\nSTDOUT: ${error.stdout.substring(0, 500)}`;
    if (error.stderr) details += `\nSTDERR: ${error.stderr.substring(0, 500)}`;

    return NextResponse.json(
      {
        ok: false,
        stage: 'ml_inference',
        code: 'ML_SERVICE_ERROR',
        message: details,
        fallbackAttempted: true,
      },
      { status: 500 }
    );
  }
}
