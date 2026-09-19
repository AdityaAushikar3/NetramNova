/**
 * Netra Step 2: Fundus Image Quality Check Engine
 * Calculates real-time clinical quality metrics on fundus photos via HTML5 Canvas.
 */

export interface QualityMetrics {
  gradable: boolean;
  qualityStatus: 'passed' | 'warning' | 'rejected';
  rejectionReasons: string[];
  fovCoverageRatio: number; // 0.0 - 1.0 (Target: >= 0.45)
  focusScore: number;       // Laplacian Variance (Target: >= 120.0)
  meanIllumination: number; // 0 - 255 (Target: 35.0 - 210.0)
  glareRatio: number;       // 0.0 - 1.0 (Target: <= 0.04)
  retinaVisible: boolean;
}

/**
 * Analyzes an HTMLImageElement using canvas pixel data to run Step 2 Quality Gate
 */
export function analyzeFundusQuality(imgElement: HTMLImageElement): QualityMetrics {
  // Fallback for when image is unreadable / CORS-blocked / zero-sized.
  // Return gradable=false so the UI shows a warning instead of fake passing metrics.
  const fallbackMetrics: QualityMetrics = {
    gradable: false,
    qualityStatus: 'warning',
    rejectionReasons: ['Image quality analysis unavailable — CORS or decode error'],
    fovCoverageRatio: 0,
    focusScore: 0,
    meanIllumination: 0,
    glareRatio: 0,
    retinaVisible: false,
  };

  if (!imgElement || imgElement.naturalWidth === 0 || imgElement.naturalHeight === 0) {
    return fallbackMetrics;
  }

  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    const imgWidth = imgElement.naturalWidth || imgElement.width || 512;
    const imgHeight = imgElement.naturalHeight || imgElement.height || 512;

    // Downsample to max 512px for rapid real-time computation
    const scale = Math.min(1.0, 512 / Math.max(imgWidth, imgHeight));
    const width = Math.max(1, Math.floor(imgWidth * scale));
    const height = Math.max(1, Math.floor(imgHeight * scale));

    canvas.width = width;
    canvas.height = height;

    if (!ctx) return fallbackMetrics;

    ctx.drawImage(imgElement, 0, 0, width, height);
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;

  // 1. Extract Green Channel & Compute FOV Mask
  let retinaPixelCount = 0;
  let totalLuminanceSum = 0;
  let saturatedPixelCount = 0;

  const greenChannel = new Float32Array(width * height);

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const idx = i / 4;

    greenChannel[idx] = g;

    // Retinal FOV pixel condition: non-black background (R+G+B > 25)
    const isRetinaPixel = (r + g + b) > 25;
    if (isRetinaPixel) {
      retinaPixelCount++;
      totalLuminanceSum += g;
      if (g > 242 || (r > 245 && g > 245 && b > 245)) {
        saturatedPixelCount++;
      }
    }
  }

  const totalPixels = width * height;
  const fovCoverageRatio = retinaPixelCount / totalPixels;
  const meanIllumination = retinaPixelCount > 0 ? totalLuminanceSum / retinaPixelCount : 0;
  const glareRatio = retinaPixelCount > 0 ? saturatedPixelCount / retinaPixelCount : 0;

  // 2. Compute Focus Score via 3x3 Discrete Laplacian Variance on Green Channel
  // Kernel: [0, 1, 0; 1, -4, 1; 0, 1, 0]
  let laplacianSum = 0;
  let laplacianSqSum = 0;
  let validLaplacianCount = 0;

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;

      // Skip background pixels outside FOV
      if (greenChannel[idx] < 15) continue;

      const top = greenChannel[(y - 1) * width + x];
      const bottom = greenChannel[(y + 1) * width + x];
      const left = greenChannel[y * width + (x - 1)];
      const right = greenChannel[y * width + (x + 1)];
      const center = greenChannel[idx];

      const lapVal = top + bottom + left + right - (4 * center);

      laplacianSum += lapVal;
      laplacianSqSum += lapVal * lapVal;
      validLaplacianCount++;
    }
  }

  let focusScore = 150.0;
  if (validLaplacianCount > 0) {
    const meanLap = laplacianSum / validLaplacianCount;
    const varianceLap = (laplacianSqSum / validLaplacianCount) - (meanLap * meanLap);
    focusScore = Math.max(0, varianceLap * 10.0); // Scaled Laplacian variance
  }

  // 3. Clinical Rejection Rules
  const rejectionReasons: string[] = [];

  if (fovCoverageRatio < 0.35) {
    rejectionReasons.push('Insufficient Retinal Field of View (<35% of frame)');
  }
  if (focusScore < 25.0) {
    rejectionReasons.push('Out of Focus / Motion Blur detected (Laplacian Variance < 25)');
  }
  if (meanIllumination < 25.0) {
    rejectionReasons.push('Severe Under-Exposure (Dark unreadable fundus)');
  } else if (meanIllumination > 225.0) {
    rejectionReasons.push('Severe Over-Exposure (Flash saturation)');
  }
  if (glareRatio > 0.08) {
    rejectionReasons.push('Corneal Glare / Flash Reflection Artifact (>8% saturated pixels)');
  }

  const gradable = rejectionReasons.length === 0;
  const qualityStatus: 'passed' | 'warning' | 'rejected' = gradable
    ? (focusScore < 100 || glareRatio > 0.03 ? 'warning' : 'passed')
    : 'rejected';

    return {
      gradable,
      qualityStatus,
      rejectionReasons,
      fovCoverageRatio: Number(fovCoverageRatio.toFixed(3)),
      focusScore: Number(focusScore.toFixed(1)),
      meanIllumination: Number(meanIllumination.toFixed(1)),
      glareRatio: Number(glareRatio.toFixed(3)),
      retinaVisible: fovCoverageRatio >= 0.35 && meanIllumination >= 25.0,
    };
  } catch (err) {
    console.warn('Canvas Quality Analysis caught error (falling back):', err);
    return fallbackMetrics;
  }
}
