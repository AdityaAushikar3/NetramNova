'use client';

import React, { useEffect, useRef, useState } from 'react';
import { RetinalFinding } from './types';

interface FundusCanvasProps {
  findings: RetinalFinding[];
  selectedFindingId?: string | null;
  onFindingHover?: (id: string | null) => void;
  showOverlays?: boolean;
  showFindingLabels?: boolean;
  imageUrl: string;
  useCropCoords?: boolean;
  showEtdrsGrid?: boolean;
}

export const FundusCanvas: React.FC<FundusCanvasProps> = ({
  findings = [],
  selectedFindingId,
  onFindingHover,
  showOverlays = true,
  showFindingLabels = true,
  imageUrl,
  showEtdrsGrid = false,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [loadedImage, setLoadedImage] = useState<HTMLImageElement | null>(null);
  
  // Track mouse coordinates for hover detection
  const [mousePos, setMousePos] = useState<{ x: number, y: number } | null>(null);

  // 1. Load Image
  useEffect(() => {
    if (!imageUrl) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = imageUrl;
    img.onload = () => setLoadedImage(img);
    img.onerror = () => setLoadedImage(null);
  }, [imageUrl]);

  // Track mouse over canvas
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    
    // Scale mouse coordinates to canvas internal resolution (800x800)
    const scaleX = canvasRef.current.width / rect.width;
    const scaleY = canvasRef.current.height / rect.height;
    
    setMousePos({
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    });
  };

  const handleMouseLeave = () => {
    setMousePos(null);
    onFindingHover?.(null);
  };

  // 2. Main Render Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Use a fixed high-res internal canvas size for crisp rendering
    const CANVAS_SIZE = 800;
    canvas.width = CANVAS_SIZE;
    canvas.height = CANVAS_SIZE;

    // Clear canvas
    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    let dX = 0;
    let dY = 0;
    let dW = CANVAS_SIZE;
    let dH = CANVAS_SIZE;

    // Draw the image preserving aspect ratio (object-contain behavior)
    if (loadedImage) {
      const imgAspect = loadedImage.width / loadedImage.height;
      if (imgAspect > 1) {
        dW = CANVAS_SIZE;
        dH = CANVAS_SIZE / imgAspect;
      } else {
        dH = CANVAS_SIZE;
        dW = CANVAS_SIZE * imgAspect;
      }
      dX = (CANVAS_SIZE - dW) / 2;
      dY = (CANVAS_SIZE - dH) / 2;
      
      // Draw image
      ctx.drawImage(loadedImage, dX, dY, dW, dH);
    } else {
      // Draw placeholder if no image loaded yet
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
      return; 
    }

    if (showEtdrsGrid) {
      ctx.save();
      const centerX = dX + dW / 2;
      const centerY = dY + dH / 2;
      const maxRadius = Math.min(dW, dH) / 2.2;
      
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)'; // Brighter white for visibility
      ctx.setLineDash([4, 4]); // Slightly tighter dash
      ctx.lineWidth = 2; // Thicker line

      // Concentric circles (Fovea, Inner Macula, Outer Macula approximation)
      ctx.beginPath();
      ctx.arc(centerX, centerY, maxRadius * 0.2, 0, Math.PI * 2);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(centerX, centerY, maxRadius * 0.6, 0, Math.PI * 2);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(centerX, centerY, maxRadius, 0, Math.PI * 2);
      ctx.stroke();

      // Crosshairs dividing quadrants
      ctx.beginPath();
      ctx.moveTo(centerX - maxRadius, centerY - maxRadius);
      ctx.lineTo(centerX + maxRadius, centerY + maxRadius);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(centerX - maxRadius, centerY + maxRadius);
      ctx.lineTo(centerX + maxRadius, centerY - maxRadius);
      ctx.stroke();

      // Optional text labels for quadrants
      ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.font = '10px monospace';
      ctx.fillText('ST', centerX - maxRadius * 0.7, centerY - maxRadius * 0.7);
      ctx.fillText('SN', centerX + maxRadius * 0.7, centerY - maxRadius * 0.7);
      ctx.fillText('IT', centerX - maxRadius * 0.7, centerY + maxRadius * 0.7);
      ctx.fillText('IN', centerX + maxRadius * 0.7, centerY + maxRadius * 0.7);

      ctx.restore();
    }

    if (!showOverlays) return;

    // Hover detection variables
    let hoveredFindingId: string | null = null;

    // Draw Overlays
    findings.forEach((finding) => {
      const isSelected = selectedFindingId === finding.id;

      // Set styles based on finding type
      let strokeColor = '#3b82f6'; // Blue-500
      let bgColor = 'rgba(59, 130, 246, 0.15)';
      
      if (finding.name === 'Microaneurysms') {
        strokeColor = '#ef4444'; // Red-500
        bgColor = 'rgba(239, 68, 68, 0.15)';
      } else if (finding.name === 'Hemorrhages') {
        strokeColor = '#f97316'; // Orange-500
        bgColor = 'rgba(249, 115, 22, 0.15)';
      } else if (finding.name === 'Hard Exudates') {
        strokeColor = '#eab308'; // Yellow-500
        bgColor = 'rgba(234, 179, 8, 0.15)';
      }

      finding.coords.forEach((c) => {
        // c.x and c.y are percentages [0, 100] relative to the original image dimensions.
        // We map these percentages precisely onto the drawn image area (dW, dH) starting at (dX, dY).
        const px = dX + (c.x / 100) * dW;
        const py = dY + (c.y / 100) * dH;
        
        // Base box size (dynamically scaled)
        const boxSize = isSelected ? 42 : 32;

        // Check for hover
        if (mousePos && !hoveredFindingId) {
          const hitRadius = boxSize / 2 + 5;
          if (Math.abs(mousePos.x - px) < hitRadius && Math.abs(mousePos.y - py) < hitRadius) {
            hoveredFindingId = finding.id;
          }
        }

        ctx.save();
        
        // Draw selection background highlight
        if (isSelected) {
          ctx.fillStyle = bgColor;
          ctx.beginPath();
          ctx.arc(px, py, boxSize * 0.8, 0, Math.PI * 2);
          ctx.fill();
        }

        // Draw solid clinical bounding box
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = isSelected ? 3 : 2;
        ctx.strokeRect(px - boxSize / 2, py - boxSize / 2, boxSize, boxSize);

        // Draw center dot
        ctx.fillStyle = strokeColor;
        ctx.beginPath();
        ctx.arc(px, py, 3, 0, Math.PI * 2);
        ctx.fill();

        // Label (only if selected to avoid clutter)
        if (showFindingLabels && isSelected) {
          let abbrev = 'LSN';
          if (finding.name === 'Microaneurysms') abbrev = 'MA';
          if (finding.name === 'Hemorrhages') abbrev = 'HEM';
          if (finding.name === 'Hard Exudates') abbrev = 'EXU';

          ctx.fillStyle = 'rgba(15, 23, 42, 0.9)'; // Slate-900 background
          ctx.beginPath();
          ctx.roundRect(px + boxSize/2 + 6, py - 12, 42, 24, 4);
          ctx.fill();

          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 12px sans-serif';
          ctx.fillText(abbrev, px + boxSize/2 + 12, py + 4);
        }

        ctx.restore();
      });
    });

    // Bubble hover state up
    if (mousePos && onFindingHover && hoveredFindingId !== selectedFindingId) {
       onFindingHover(hoveredFindingId);
    }

  }, [loadedImage, findings, selectedFindingId, showOverlays, showFindingLabels, mousePos, onFindingHover]);

  return (
    <div 
      ref={containerRef}
      className="w-full h-full flex items-center justify-center bg-slate-50 cursor-crosshair"
    >
      <canvas
        ref={canvasRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        className="w-full h-full object-contain"
      />
    </div>
  );
};
