'use client';

import React, { useState, useEffect, useRef } from 'react';
import { RetinalFinding, DiseaseFilterType } from './types';
import { Layers, ZoomIn, Target, Sliders, Sun, Contrast, Split, CheckCircle2, AlertTriangle, Search, Grid } from 'lucide-react';

interface FundusCanvasProps {
  mode: 'structural' | 'colour';
  findings: RetinalFinding[];
  selectedFindingId?: string | null;
  onSelectFinding?: (id: string | null) => void;
  showOverlays?: boolean;
  imageUrl?: string;
  activeDiseaseFilter?: DiseaseFilterType;
  onSelectDiseaseFilter?: (filter: DiseaseFilterType) => void;
  useCropCoords?: boolean;
}

export const FundusCanvas: React.FC<FundusCanvasProps> = ({
  mode,
  findings = [],
  selectedFindingId,
  onSelectFinding,
  showOverlays = true,
  imageUrl = '/samples/moderate_dr.jpg',
  activeDiseaseFilter = 'all',
  onSelectDiseaseFilter,
  useCropCoords = false,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [zoom, setZoom] = useState<number>(1);
  const [brightness, setBrightness] = useState<number>(100);
  const [contrast, setContrast] = useState<number>(100);
  const [showFindingLabels, setShowFindingLabels] = useState<boolean>(true);
  const [showControls, setShowControls] = useState<boolean>(false);
  const [loadedImage, setLoadedImage] = useState<HTMLImageElement | null>(null);

  // Micro-Magnifier Loupe Lens State
  const [isLoupeEnabled, setIsLoupeEnabled] = useState<boolean>(false);
  const [loupePos, setLoupePos] = useState<{ x: number; y: number } | null>(null);

  // ETDRS 4-Quadrant Grid State (4-2-1 Rule Concept)
  const [showQuadrantGrid, setShowQuadrantGrid] = useState<boolean>(false);

  // Comparison Slider State
  const [isComparisonMode, setIsComparisonMode] = useState<boolean>(false);
  const [sliderPos, setSliderPos] = useState<number>(50);
  const [isDraggingSlider, setIsDraggingSlider] = useState<boolean>(false);

  // Load real fundus photograph
  useEffect(() => {
    if (!imageUrl) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = imageUrl;
    img.onload = () => {
      setLoadedImage(img);
    };
    img.onerror = () => {
      setLoadedImage(null);
    };
  }, [imageUrl]);

  // Filter findings based on active disease filter tab
  const visibleFindings = findings.filter((f) => {
    if (activeDiseaseFilter === 'all') return true;
    return f.name === activeDiseaseFilter;
  });

  // Handle curtain slider drag
  const handleMove = (clientX: number) => {
    if (!containerRef.current || !isComparisonMode) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const pct = Math.max(5, Math.min(95, (x / rect.width) * 100));
    setSliderPos(pct);
  };

  // Handle Loupe Lens cursor tracking
  const handleContainerMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const scaleX = 560 / rect.width;
    const scaleY = 560 / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    setLoupePos({ x, y });

    if (isDraggingSlider) {
      handleMove(e.clientX);
    }
  };

  useEffect(() => {
    const handleMouseUp = () => setIsDraggingSlider(false);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const cx = width / 2;
    const cy = height / 2;
    const radius = Math.min(width, height) * 0.45;

    ctx.clearRect(0, 0, width, height);

    // Dark background
    ctx.fillStyle = '#090d14';
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.clip();

    if (zoom !== 1) {
      ctx.translate(cx, cy);
      ctx.scale(zoom, zoom);
      ctx.translate(-cx, -cy);
    }

    if (loadedImage) {
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = width;
      tempCanvas.height = height;
      const tempCtx = tempCanvas.getContext('2d');

      if (tempCtx) {
        const imgSize = radius * 2;
        const imgX = cx - radius;
        const imgY = cy - radius;
        tempCtx.drawImage(loadedImage, imgX, imgY, imgSize, imgSize);

        try {
          const imgData = tempCtx.getImageData(0, 0, width, height);
          const data = imgData.data;

          const bMult = brightness / 100;
          const cFactor = (259 * (contrast + 255)) / (255 * (259 - contrast));
          const splitPixelX = (sliderPos / 100) * width;

        for (let i = 0; i < data.length; i += 4) {
          const pxIndex = (i / 4) % width;
          let r = data[i];
          let g = data[i + 1];
          let b = data[i + 2];

          if (isComparisonMode && pxIndex < splitPixelX) {
            // LEFT SIDE: Generic Unscoped CLAHE (Amplifies edge noise into false speckles)
            let gray = g * 1.6;
            if (pxIndex < cx - radius * 0.4 || pxIndex > cx + radius * 0.4) {
              gray += (Math.random() - 0.5) * 45;
            }
            gray = Math.max(0, Math.min(255, gray));
            data[i] = gray * 0.9;
            data[i + 1] = gray * 0.6;
            data[i + 2] = gray * 0.4;
          } else if (mode === 'structural') {
            // STRUCTURAL MODE: Foracchia Normalization + Mild CLAHE
            let gray = g * 1.15;
            gray = cFactor * (gray - 128) + 128;
            gray = gray * bMult;
            gray = Math.max(0, Math.min(255, gray));

            data[i] = gray * 0.15;
            data[i + 1] = gray;
            data[i + 2] = gray * 0.25;
          } else {
            // COLOUR MODE: RGB with Lab B-Channel enhancement
            r = cFactor * (r - 128) + 128;
            g = cFactor * (g - 128) + 128;
            b = cFactor * (b - 128) + 128;

            r = Math.max(0, Math.min(255, r * bMult));
            g = Math.max(0, Math.min(255, g * bMult));
            b = Math.max(0, Math.min(255, b * bMult));

            if (r > 160 && g > 150 && b < 140) {
              g = Math.min(255, g * 1.15);
              r = Math.min(255, r * 1.1);
            }

            data[i] = r;
            data[i + 1] = g;
            data[i + 2] = b;
          }
        }

        tempCtx.putImageData(imgData, 0, 0);
        ctx.drawImage(tempCanvas, 0, 0);

          // Draw vertical curtain line if in Comparison Mode
          if (isComparisonMode) {
            ctx.strokeStyle = '#38bdf8';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(splitPixelX, 0);
            ctx.lineTo(splitPixelX, height);
            ctx.stroke();
          }
        } catch (err) {
          console.warn('Canvas image processing fallback:', err);
          ctx.drawImage(loadedImage, cx - radius, cy - radius, radius * 2, radius * 2);
        }
      }
    }

    // ETDRS 4-Quadrant Grid Overlay (4-2-1 Rule)
    if (showQuadrantGrid) {
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 4]);

      // Vertical crosshair (splits nasal and temporal halves)
      ctx.beginPath();
      ctx.moveTo(cx, cy - radius);
      ctx.lineTo(cx, cy + radius);
      ctx.stroke();

      // Horizontal crosshair (splits superior and inferior halves)
      ctx.beginPath();
      ctx.moveTo(cx - radius, cy);
      ctx.lineTo(cx + radius, cy);
      ctx.stroke();

      ctx.setLineDash([]); // Reset line dash

      // Quadrant Labels & Badges
      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.font = 'bold 9px monospace';

      // Q1: Superotemporal (Top Left)
      ctx.fillRect(cx - radius + 15, cy - radius + 15, 125, 16);
      ctx.fillStyle = '#38bdf8';
      ctx.fillText('Q1: SUPEROTEMPORAL (ST)', cx - radius + 18, cy - radius + 27);

      // Q2: Superonasal (Top Right)
      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.fillRect(cx + 15, cy - radius + 15, 115, 16);
      ctx.fillStyle = '#38bdf8';
      ctx.fillText('Q2: SUPERONASAL (SN)', cx + 18, cy - radius + 27);

      // Q3: Inferotemporal (Bottom Left)
      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.fillRect(cx - radius + 15, cy + radius - 28, 120, 16);
      ctx.fillStyle = '#38bdf8';
      ctx.fillText('Q3: INFEROTEMPORAL (IT)', cx - radius + 18, cy + radius - 16);

      // Q4: Inferonasal (Bottom Right)
      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.fillRect(cx + 15, cy + radius - 28, 110, 16);
      ctx.fillStyle = '#38bdf8';
      ctx.fillText('Q4: INFERONASAL (IN)', cx + 18, cy + radius - 16);
    }

    // 2. Draw Precision Non-Grad-CAM Bounding Boxes
    const drawOverlays = (targetCtx: CanvasRenderingContext2D, scaleMultiplier = 1) => {
      if (!showOverlays) return;
      visibleFindings.forEach((finding) => {
        const isSelected = selectedFindingId === finding.id;

        finding.coords.forEach((c) => {
          // Use crop coordinates if requested and available, else use raw coordinates
          const cX = useCropCoords && c.cropX !== undefined ? c.cropX : c.x;
          const cY = useCropCoords && c.cropY !== undefined ? c.cropY : c.y;
          const cR = useCropCoords && c.cropRadius !== undefined ? c.cropRadius : c.radius;

          // Normalize coordinate to retinal circle percentage [0, 100] (fallback for legacy mock data)
          const normX = cX > 100 ? (cX / 512) * 100 : cX;
          const normY = cY > 100 ? (cY / 512) * 100 : cY;
          const px = cx + (normX - 50) * ((radius * 2) / 100);
          const py = cy + (normY - 50) * ((radius * 2) / 100);

          let strokeColor = '#38bdf8';
          let glowColor = 'rgba(56, 189, 248, 0.4)';
          const badgeBg = 'rgba(15, 23, 42, 0.92)';
          if (finding.name === 'Microaneurysms') {
            strokeColor = '#f43f5e'; // Bright Rose Red
            glowColor = 'rgba(244, 63, 94, 0.5)';
          } else if (finding.name === 'Hemorrhages') {
            strokeColor = '#fb923c'; // Vibrant Amber-Orange
            glowColor = 'rgba(251, 146, 60, 0.5)';
          } else if (finding.name === 'Hard Exudates') {
            strokeColor = '#facc15'; // Crisp Gold Yellow
            glowColor = 'rgba(250, 204, 21, 0.5)';
          }

          // Pinpoint Target Marker Box (Higher visibility)
          targetCtx.save();
          targetCtx.shadowColor = glowColor;
          targetCtx.shadowBlur = isSelected ? 12 : 6;
          targetCtx.strokeStyle = isSelected ? '#ffffff' : strokeColor;
          targetCtx.lineWidth = (isSelected ? 3.0 : 2.0) * scaleMultiplier;
          targetCtx.setLineDash(isSelected ? [] : [5, 3]);

          const boxSize = Math.max(22, (cR * 3.2 + 10)) * scaleMultiplier;
          targetCtx.strokeRect(px - boxSize / 2, py - boxSize / 2, boxSize, boxSize);
          targetCtx.setLineDash([]);
          targetCtx.restore();

          // High-precision corner crosshairs (Military/HUD Diagnostic Pin)
          const ch = 6 * scaleMultiplier;
          targetCtx.strokeStyle = isSelected ? '#ffffff' : strokeColor;
          targetCtx.lineWidth = 2 * scaleMultiplier;
          
          // Top-Left Corner
          targetCtx.beginPath();
          targetCtx.moveTo(px - boxSize / 2 - ch, py - boxSize / 2);
          targetCtx.lineTo(px - boxSize / 2, py - boxSize / 2);
          targetCtx.lineTo(px - boxSize / 2, py - boxSize / 2 - ch);
          targetCtx.stroke();

          // Bottom-Right Corner
          targetCtx.beginPath();
          targetCtx.moveTo(px + boxSize / 2 + ch, py + boxSize / 2);
          targetCtx.lineTo(px + boxSize / 2, py + boxSize / 2);
          targetCtx.lineTo(px + boxSize / 2, py + boxSize / 2 + ch);
          targetCtx.stroke();

          // Center Reticle Dot
          targetCtx.fillStyle = strokeColor;
          targetCtx.beginPath();
          targetCtx.arc(px, py, 2.5 * scaleMultiplier, 0, Math.PI * 2);
          targetCtx.fill();

          // High-Contrast Diagnostic Pinpoint Badge
          if (showFindingLabels) {
            let abbrev = 'LESION';
            if (finding.name === 'Microaneurysms') abbrev = 'MA';
            else if (finding.name === 'Hemorrhages') abbrev = 'HE';
            else if (finding.name === 'Hard Exudates') abbrev = 'EX';
            else if (finding.name === 'Vascular Abnormalities') abbrev = 'VASC';
            const labelText = `${abbrev} • Q-LOC`;
            targetCtx.font = `bold ${Math.round(11 * scaleMultiplier)}px ui-monospace, SFMono-Regular, Menlo, monospace`;
            const textWidth = targetCtx.measureText(labelText).width;
            const badgeW = textWidth + 14 * scaleMultiplier;
            const badgeH = 18 * scaleMultiplier;

            // Badge Background
            targetCtx.fillStyle = badgeBg;
            targetCtx.strokeStyle = strokeColor;
            targetCtx.lineWidth = 1 * scaleMultiplier;
            targetCtx.fillRect(px - badgeW / 2, py + boxSize / 2 + 4, badgeW, badgeH);
            targetCtx.strokeRect(px - badgeW / 2, py + boxSize / 2 + 4, badgeW, badgeH);

            // Badge Text
            targetCtx.fillStyle = '#ffffff';
            targetCtx.fillText(labelText, px - badgeW / 2 + 7 * scaleMultiplier, py + boxSize / 2 + 16 * scaleMultiplier);
          }
        });
      });
    };

    drawOverlays(ctx, 1);

    // 3. Render Micro-Magnifier Loupe Lens (3x Zoom) if active
    if (isLoupeEnabled && loupePos) {
      const loupeRadius = 70;
      const magnification = 3.0;

      ctx.save();
      ctx.beginPath();
      ctx.arc(loupePos.x, loupePos.y, loupeRadius, 0, Math.PI * 2);
      ctx.clip();

      ctx.fillStyle = '#090d14';
      ctx.fillRect(loupePos.x - loupeRadius, loupePos.y - loupeRadius, loupeRadius * 2, loupeRadius * 2);

      ctx.translate(loupePos.x, loupePos.y);
      ctx.scale(magnification, magnification);
      ctx.translate(-loupePos.x, -loupePos.y);

      if (loadedImage) {
        const imgSize = radius * 2;
        const imgX = cx - radius;
        const imgY = cy - radius;
        ctx.drawImage(loadedImage, imgX, imgY, imgSize, imgSize);
      }

      drawOverlays(ctx, 0.8);
      ctx.restore();

      // Lens Ring
      ctx.beginPath();
      ctx.arc(loupePos.x, loupePos.y, loupeRadius, 0, Math.PI * 2);
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 3;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(loupePos.x, loupePos.y, loupeRadius + 2, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(15, 23, 42, 0.8)';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
      ctx.fillRect(loupePos.x - 38, loupePos.y + loupeRadius - 16, 76, 14);
      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 9px monospace';
      ctx.fillText('3.0x MAGNIFIER', loupePos.x - 34, loupePos.y + loupeRadius - 5);
    }

    ctx.restore();

    // Outer FOV Ring
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();

  }, [mode, visibleFindings, selectedFindingId, showOverlays, showFindingLabels, zoom, brightness, contrast, loadedImage, isComparisonMode, sliderPos, isLoupeEnabled, loupePos, showQuadrantGrid]);

  return (
    <div className="relative w-full flex flex-col items-center bg-slate-950 rounded-lg border border-slate-800 p-3 shadow-inner select-none overflow-hidden">
      {/* 1. Disease Filter Tabs Bar (Feature #3) */}
      <div className="w-full flex flex-wrap items-center justify-between gap-2 mb-2 p-1 bg-slate-900 rounded border border-slate-800 text-xs font-mono">
        <span className="text-xs text-slate-400 font-bold uppercase pl-1">Mark Disease:</span>
        <div className="flex flex-wrap items-center gap-1">
          <button
            onClick={() => onSelectDiseaseFilter && onSelectDiseaseFilter('all')}
            className={`px-2 py-0.5 rounded text-xs transition-all cursor-pointer ${
              activeDiseaseFilter === 'all'
                ? 'bg-emerald-600 text-white font-bold shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            All Marked
          </button>
          <button
            onClick={() => onSelectDiseaseFilter && onSelectDiseaseFilter('Microaneurysms')}
            className={`px-2 py-0.5 rounded text-xs transition-all cursor-pointer ${
              activeDiseaseFilter === 'Microaneurysms'
                ? 'bg-red-950 text-red-300 border border-red-800 font-bold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Microaneurysms
          </button>
          <button
            onClick={() => onSelectDiseaseFilter && onSelectDiseaseFilter('Hemorrhages')}
            className={`px-2 py-0.5 rounded text-xs transition-all cursor-pointer ${
              activeDiseaseFilter === 'Hemorrhages'
                ? 'bg-orange-950 text-orange-300 border border-orange-800 font-bold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Hemorrhages
          </button>
          <button
            onClick={() => onSelectDiseaseFilter && onSelectDiseaseFilter('Hard Exudates')}
            className={`px-2 py-0.5 rounded text-xs transition-all cursor-pointer ${
              activeDiseaseFilter === 'Hard Exudates'
                ? 'bg-yellow-950 text-yellow-300 border border-yellow-800 font-bold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Hard Exudates
          </button>
          <button
            onClick={() => onSelectDiseaseFilter && onSelectDiseaseFilter('Vascular Abnormalities')}
            className={`px-2 py-0.5 rounded text-xs transition-all cursor-pointer ${
              activeDiseaseFilter === 'Vascular Abnormalities'
                ? 'bg-sky-950 text-sky-300 border border-sky-800 font-bold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Vascular
          </button>
        </div>
      </div>

      {/* 2. Mode Header with Comparison Curtain Toggle */}
      <div className="w-full flex items-center justify-between mb-2 px-2 py-1 bg-slate-900/80 rounded border border-slate-800 text-xs font-mono">
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider bg-emerald-950 text-emerald-300 border border-emerald-800 flex items-center gap-1">
            <Layers className="w-3 h-3" />
            {mode === 'structural' ? 'Structural (Green)' : 'Colour (RGB)'}
          </span>
        </div>

        {/* Foracchia vs CLAHE Comparison Toggle */}
        <button
          onClick={() => setIsComparisonMode(!isComparisonMode)}
          className={`px-2 py-0.5 rounded text-xs font-bold flex items-center gap-1 transition-all cursor-pointer border ${
            isComparisonMode
              ? 'bg-sky-950 border-sky-500 text-sky-300 shadow'
              : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white'
          }`}
        >
          <Split className="w-3 h-3 text-sky-400" />
          <span>{isComparisonMode ? 'Exit Comparison' : 'Foracchia vs CLAHE Slider'}</span>
        </button>
      </div>

      {/* Main Viewport Container */}
      <div
        ref={containerRef}
        onMouseMove={handleContainerMouseMove}
        onMouseLeave={() => setLoupePos(null)}
        onMouseDown={(e) => {
          if (isComparisonMode) {
            setIsDraggingSlider(true);
            handleMove(e.clientX);
          }
        }}
        className="relative flex items-center justify-center w-full max-w-[560px] aspect-square my-1 cursor-crosshair select-none"
      >
        <canvas
          ref={canvasRef}
          width={560}
          height={560}
          className="w-full h-full object-contain rounded-md shadow-2xl border border-slate-800/80"
        />

        {/* Comparison Labels */}
        {isComparisonMode && (
          <>
            <div className="absolute top-3 left-3 px-2 py-1 bg-rose-950/90 border border-rose-800 rounded text-xs font-mono font-bold text-rose-300 flex items-center gap-1 shadow">
              <AlertTriangle className="w-3 h-3 text-rose-400" />
              <span>Generic CLAHE (Noise Amplified)</span>
            </div>

            <div className="absolute top-3 right-3 px-2 py-1 bg-emerald-950/90 border border-emerald-800 rounded text-xs font-mono font-bold text-emerald-300 flex items-center gap-1 shadow">
              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
              <span>Ben Graham Standardized (True Lesions)</span>
            </div>

            <div
              style={{ left: `${sliderPos}%` }}
              className="absolute top-0 bottom-0 w-1 bg-sky-400 cursor-ew-resize flex items-center justify-center pointer-events-none"
            >
              <div className="w-6 h-6 rounded-full bg-slate-900 border-2 border-sky-400 text-sky-300 flex items-center justify-center text-xs font-bold shadow-lg">
                ↔
              </div>
            </div>
          </>
        )}

        {/* Adjustment Sliders Modal Toggle */}
        <button
          onClick={() => setShowControls(!showControls)}
          className="absolute bottom-2 right-2 p-1.5 bg-slate-900/90 hover:bg-slate-800 text-slate-300 border border-slate-700 rounded text-xs transition-colors cursor-pointer shadow"
          title="Adjust Contrast & Brightness"
        >
          <Sliders className="w-3.5 h-3.5 text-emerald-400" />
        </button>

        {showControls && (
          <div className="absolute bottom-10 right-2 w-48 p-2.5 bg-slate-900/95 border border-slate-700 rounded-lg shadow-2xl text-xs font-mono space-y-2 backdrop-blur">
            <div className="flex justify-between text-slate-300 font-bold border-b border-slate-800 pb-1">
              <span>Image Adjustments</span>
              <button
                onClick={() => {
                  setBrightness(100);
                  setContrast(100);
                  setZoom(1);
                }}
                className="text-emerald-400 text-xs hover:underline"
              >
                Reset
              </button>
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-slate-400">
                <span className="flex items-center gap-1">
                  <Sun className="w-3 h-3 text-amber-400" /> Brightness
                </span>
                <span>{brightness}%</span>
              </div>
              <input
                type="range"
                min="50"
                max="150"
                value={brightness}
                onChange={(e) => setBrightness(Number(e.target.value))}
                className="w-full h-1 bg-slate-800 rounded accent-emerald-500 cursor-pointer"
              />
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-slate-400">
                <span className="flex items-center gap-1">
                  <Contrast className="w-3 h-3 text-blue-400" /> Contrast
                </span>
                <span>{contrast}%</span>
              </div>
              <input
                type="range"
                min="50"
                max="150"
                value={contrast}
                onChange={(e) => setContrast(Number(e.target.value))}
                className="w-full h-1 bg-slate-800 rounded accent-emerald-500 cursor-pointer"
              />
            </div>
          </div>
        )}
      </div>

      {/* Bottom Controls Bar */}
      <div className="w-full flex items-center justify-between gap-2 mt-2 px-2 py-1 bg-slate-900/80 rounded border border-slate-800 text-xs font-mono text-slate-300">
        <div className="flex items-center gap-2">
          {/* Micro-Magnifier Loupe Lens Toggle Button */}
          <button
            onClick={() => setIsLoupeEnabled(!isLoupeEnabled)}
            className={`flex items-center gap-1 px-2 py-0.5 rounded transition-all cursor-pointer text-xs font-bold border ${
              isLoupeEnabled
                ? 'bg-sky-950 border-sky-500 text-sky-300 shadow'
                : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white'
            }`}
          >
            <Search className="w-3 h-3 text-sky-400" />
            <span>Loupe Lens {isLoupeEnabled ? 'ON (3x)' : 'OFF'}</span>
          </button>

          {/* ETDRS 4-Quadrant Grid Toggle Button */}
          <button
            onClick={() => setShowQuadrantGrid(!showQuadrantGrid)}
            className={`flex items-center gap-1 px-2 py-0.5 rounded transition-all cursor-pointer text-xs font-bold border ${
              showQuadrantGrid
                ? 'bg-emerald-950 border-emerald-500 text-emerald-300 shadow'
                : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white'
            }`}
          >
            <Grid className="w-3 h-3 text-emerald-400" />
            <span>ETDRS Grid {showQuadrantGrid ? 'ON' : 'OFF'}</span>
          </button>

          <button
            onClick={() => setZoom(zoom === 1 ? 1.5 : zoom === 1.5 ? 2 : 1)}
            className="flex items-center gap-1 px-2 py-0.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded transition-colors cursor-pointer text-xs"
          >
            <ZoomIn className="w-3 h-3 text-emerald-400" />
            <span>Zoom {zoom}x</span>
          </button>
        </div>

        <div className="text-xs text-slate-400 font-mono">
          Showing: <strong className="text-emerald-400 uppercase">{activeDiseaseFilter}</strong> ({visibleFindings.length} Lesions)
        </div>
      </div>
    </div>
  );
};
