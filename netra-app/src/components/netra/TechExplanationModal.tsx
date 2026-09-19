'use client';

import React from 'react';
import { X, Cpu, Layers, Eye, CheckCircle2, FileText } from 'lucide-react';

interface TechExplanationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const TechExplanationModal: React.FC<TechExplanationModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in select-none">
      <div className="bg-slate-900 border border-slate-700 rounded-lg max-w-2xl w-full p-6 text-slate-200 shadow-2xl overflow-y-auto max-h-[90vh] text-xs">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
          <div className="flex items-center gap-2">
            <Cpu className="w-5 h-5 text-emerald-400" />
            <div>
              <h3 className="text-sm font-bold font-sans text-slate-100">
                Technical Retinal Preprocessing & Dual-Output Pipeline Architecture
              </h3>
              <p className="text-xs text-slate-400 font-mono">
                Scientific rationale for Ben Graham Color Standardization (I_std = 4·I - 4·GaussianBlur(σ=10) + 128)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="space-y-4 font-sans leading-relaxed text-slate-300">
          {/* Section 1: Problem with Standard CLAHE */}
          <div className="p-3 bg-slate-950 rounded border border-slate-800">
            <h4 className="text-xs font-bold text-amber-400 mb-1 flex items-center gap-1.5 font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
              1. The Flaw of Generic CLAHE Alone
            </h4>
            <p className="text-xs text-slate-300">
              Standard CLAHE forces contrast amplification in local tiles indiscriminately. In fundus photography, camera flash falloff creates dark peripheral edges. Generic CLAHE amplifies sensor noise in peripheral shadows into false &quot;speckles&quot;, causing downstream AI networks to misclassify noise as early-stage <strong>microaneurysms</strong>.
            </p>
          </div>

          {/* Section 2: Ben Graham Standardization Solution */}
          <div className="p-3 bg-slate-950 rounded border border-slate-800">
            <h4 className="text-xs font-bold text-emerald-400 mb-1 flex items-center gap-1.5 font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
              2. Ben Graham Local Frequency Subtraction (I_std = 4·I - 4·GaussianBlur(σ≈17) + 128)
            </h4>
            <p className="text-xs text-slate-300 mb-2">
              NetramNova employs <strong>Ben Graham Color Standardization</strong> (Gold-Standard Retinal Illumination Normalization). By subtracting a wide Gaussian blur ($\sigma\approx17$), low-frequency camera vignetting and flash gradients are completely wiped out. High-frequency lesion boundaries are amplified $4\times$, and normal retinal tissue is re-centered to a uniform median gray ($128$) across all camera brands.
            </p>
            <div className="flex items-center gap-2 p-2 bg-slate-900 rounded font-mono text-xs text-slate-400 border border-slate-800">
              <FileText className="w-3.5 h-3.5 text-blue-400 shrink-0" />
              <span>Pipeline sequence: Raw Camera Photo → Tri-Color Quality Gate → Ben Graham Standardization (AMBER scans) → 512×512 Tensor</span>
            </div>
          </div>

          {/* Section 3: Dual Output Representations */}
          <div className="p-3 bg-slate-950 rounded border border-slate-800">
            <h4 className="text-xs font-bold text-sky-400 mb-1 flex items-center gap-1.5 font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-sky-400"></span>
              3. Dual Representations: Why Grayscale Alone is Not Enough
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
              <div className="p-2.5 bg-slate-900 rounded border border-emerald-900/50">
                <div className="font-bold text-emerald-300 text-xs mb-1 flex items-center gap-1">
                  <Layers className="w-3 h-3 text-emerald-400" />
                  Structural Image (Green Channel)
                </div>
                <p className="text-xs text-slate-400">
                  Maximum hemoglobin absorption wavelength. Provides razor-sharp contrast for blood vessels, microaneurysms, and dot/blot hemorrhages.
                </p>
              </div>

              <div className="p-2.5 bg-slate-900 rounded border border-yellow-900/50">
                <div className="font-bold text-yellow-300 text-xs mb-1 flex items-center gap-1">
                  <Eye className="w-3 h-3 text-yellow-400" />
                  Colour Image (L*a*b* B-Channel)
                </div>
                <p className="text-xs text-slate-400">
                  Preserves blue-yellow color spectrum. Yellow lipid hard exudates stand out intensely against the retinal background, preventing missed maculopathy.
                </p>
              </div>
            </div>
          </div>

          {/* Section 4: Non-Grad-CAM Clinical Localization */}
          <div className="p-3 bg-slate-950 rounded border border-slate-800">
            <h4 className="text-xs font-bold text-slate-200 mb-1 flex items-center gap-1.5 font-mono">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              4. Deterministic Non-Grad-CAM Evidence Overlays
            </h4>
            <p className="text-xs text-slate-300">
              Rather than vague heatmaps (Grad-CAM), NetramNova overlays exact bounding boxes with discrete spatial micro-coordinates (x, y) around every detected lesion, ensuring clinical explainability for reviewing ophthalmologists.
            </p>
          </div>

          {/* Section 5: Medical Finding & AI Preservation Matrix */}
          <div className="p-3 bg-slate-950 rounded border border-slate-800">
            <h4 className="text-xs font-bold text-amber-400 mb-2 flex items-center gap-1.5 font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
              5. Clinical Finding & AI Feature Preservation Matrix
            </h4>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[10.5px] border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 font-mono">
                    <th className="py-1.5 px-2 font-semibold">Medical Finding</th>
                    <th className="py-1.5 px-2 font-semibold">Appearance in Fundus</th>
                    <th className="py-1.5 px-2 font-semibold">AI Pipeline Requirement</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-850 text-slate-300 font-sans">
                  <tr>
                    <td className="py-1.5 px-2 font-semibold text-rose-400">Microaneurysm</td>
                    <td className="py-1.5 px-2 text-slate-400">Tiny red dot</td>
                    <td className="py-1.5 px-2 text-emerald-300">Preserve very small details</td>
                  </tr>
                  <tr>
                    <td className="py-1.5 px-2 font-semibold text-red-400">Hemorrhage</td>
                    <td className="py-1.5 px-2 text-slate-400">Red/dark lesions</td>
                    <td className="py-1.5 px-2 text-emerald-300">Preserve lesion color and texture</td>
                  </tr>
                  <tr>
                    <td className="py-1.5 px-2 font-semibold text-amber-300">Hard Exudate</td>
                    <td className="py-1.5 px-2 text-slate-400">Yellow/bright deposits</td>
                    <td className="py-1.5 px-2 text-emerald-300">Preserve color information</td>
                  </tr>
                  <tr>
                    <td className="py-1.5 px-2 font-semibold text-slate-200">Cotton Wool Spot</td>
                    <td className="py-1.5 px-2 text-slate-400">White fluffy lesion</td>
                    <td className="py-1.5 px-2 text-emerald-300">Preserve brightness patterns</td>
                  </tr>
                  <tr>
                    <td className="py-1.5 px-2 font-semibold text-sky-400">IRMA</td>
                    <td className="py-1.5 px-2 text-slate-400">Abnormal vessel structure</td>
                    <td className="py-1.5 px-2 text-emerald-300">Strong vessel representation</td>
                  </tr>
                  <tr>
                    <td className="py-1.5 px-2 font-semibold text-indigo-400">Venous Beading</td>
                    <td className="py-1.5 px-2 text-slate-400">Irregular vein morphology</td>
                    <td className="py-1.5 px-2 text-emerald-300">Vessel segmentation/analysis</td>
                  </tr>
                  <tr>
                    <td className="py-1.5 px-2 font-semibold text-purple-400">Neovascularization</td>
                    <td className="py-1.5 px-2 text-slate-400">Abnormal new vessels</td>
                    <td className="py-1.5 px-2 text-emerald-300">Fine vascular pattern detection</td>
                  </tr>
                  <tr>
                    <td className="py-1.5 px-2 font-semibold text-cyan-400">DME</td>
                    <td className="py-1.5 px-2 text-slate-400">Needs structural confirmation</td>
                    <td className="py-1.5 px-2 text-amber-400">Fundus screening ≠ complete structural diagnosis</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Footer Close */}
        <div className="mt-5 pt-3 border-t border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded text-xs transition-colors cursor-pointer"
          >
            Acknowledge & Close Rationale
          </button>
        </div>
      </div>
    </div>
  );
};
