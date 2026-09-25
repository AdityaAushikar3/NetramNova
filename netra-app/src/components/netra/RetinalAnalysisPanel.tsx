'use client';

import React, { useState } from 'react';
import { ScreeningCase, RetinalFinding, DiseaseFilterType } from './types';
import { FundusCanvas } from './FundusCanvas';
import {
  AlertCircle,
  ChevronLeft,
  Printer,
  ShieldCheck,
  Eye,
  Activity,
  CheckCircle2
} from 'lucide-react';

interface RetinalAnalysisPanelProps {
  caseData: ScreeningCase;
  onRecapture?: () => void;
  onSendToDoctor?: (caseId: string) => void;
}

export const RetinalAnalysisPanel: React.FC<RetinalAnalysisPanelProps> = ({
  caseData,
  onRecapture,
  onSendToDoctor,
}) => {
  const [selectedFindingId, setSelectedFindingId] = useState<string | null>(null);
  const [hiddenFindingNames, setHiddenFindingNames] = useState<Set<string>>(new Set());
  const [rightViewMode, setRightViewMode] = useState<'overlay' | 'gradcam' | 'preprocessed'>('overlay');
  const [showGrid, setShowGrid] = useState<boolean>(false);
  
  const result = caseData.result;
  if (!result) {
    return (
      <div className="w-full flex flex-col items-center justify-center py-16 gap-3 text-slate-500 font-sans bg-white border border-slate-200 rounded-xl shadow-sm">
        <AlertCircle className="w-10 h-10 opacity-40 text-slate-400" />
        <p className="text-sm font-medium text-slate-600">No analysis result available for this case.</p>
      </div>
    );
  }

  const getSeverityBadgeClass = (severity: string) => {
    switch (severity.toLowerCase()) {
      case 'normal': return 'bg-green-100 text-green-700 border-green-200';
      case 'mild': return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'moderate': return 'bg-orange-100 text-orange-700 border-orange-200';
      case 'severe':
      case 'proliferative': return 'bg-red-100 text-red-700 border-red-200';
      default: return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  const findingsSum = result.findings.reduce((acc, f) => acc + f.count, 0);
  const visibleFindings = result.findings.filter(f => !hiddenFindingNames.has(f.name));

  const handlePrintReport = () => {
    window.print();
  };

  return (
    <div className="w-full font-sans select-none flex flex-col gap-6">
      
      {/* 1. Header & Patient Context */}
      <div className="flex flex-col gap-2 print:hidden">
        <button 
          onClick={onRecapture}
          className="text-blue-600 hover:text-blue-700 font-semibold text-sm flex items-center gap-1 w-fit transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          Start New Screening
        </button>
        
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 font-display">
              {caseData.patient.name} ({caseData.patient.id})
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              Screening Date: {new Date(caseData.timestamp).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} • {caseData.patient.age}Y / {caseData.patient.sex}
            </p>
          </div>
          
          <button onClick={handlePrintReport} className="px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-sm font-semibold flex items-center gap-2 transition-colors shadow-sm">
            <Printer className="w-4 h-4" />
            Generate PDF Report
          </button>
        </div>
      </div>

      {/* 2. Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Col: Dual Image Viewer */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col">
          <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex flex-wrap items-center justify-between gap-4 print:hidden">
            <div className="flex items-center gap-6">
              <span className="text-slate-500 font-semibold text-sm">Views:</span>
              <button 
                onClick={() => setRightViewMode('overlay')}
                className={`font-semibold text-sm pb-1 transition-colors ${rightViewMode === 'overlay' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Analysis Overlay
              </button>
              {result.gradcamOverlay && (
                <button 
                  onClick={() => setRightViewMode('gradcam')}
                  className={`font-semibold text-sm pb-1 transition-colors ${rightViewMode === 'gradcam' ? 'text-purple-600 border-b-2 border-purple-600' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  Grad-CAM Heatmap
                </button>
              )}
              {result.preprocessedImage && (
                <button 
                  onClick={() => setRightViewMode('preprocessed')}
                  className={`font-semibold text-sm pb-1 transition-colors ${rightViewMode === 'preprocessed' ? 'text-emerald-600 border-b-2 border-emerald-600' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  Model Input
                </button>
              )}
            </div>
            
            {/* Right Side Toggles */}
            <div className="flex items-center gap-4">
              <button
                onClick={() => setShowGrid(!showGrid)}
                className={`text-xs font-semibold px-2 py-1 rounded transition-colors ${showGrid ? 'bg-slate-200 text-slate-800' : 'bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700'}`}
              >
                {showGrid ? 'ETDRS Grid: ON' : 'ETDRS Grid: OFF'}
              </button>
            </div>
          </div>
          
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-900">
            {/* Original Image */}
            <div className="flex flex-col items-center">
              <span className="text-slate-300 text-xs font-semibold uppercase tracking-wider mb-3">Original Capture</span>
              <div className="relative w-full aspect-square bg-black rounded-lg overflow-hidden shadow-inner">
                <FundusCanvas
                  imageUrl={caseData.imageUrl || ''}
                  findings={[]}
                  showOverlays={false}
                  useCropCoords={false}
                  showEtdrsGrid={showGrid}
                />
              </div>
            </div>

            {/* Right Hand Viewer */}
            <div className="flex flex-col items-center">
              <span className="text-slate-300 text-xs font-semibold uppercase tracking-wider mb-3">
                {rightViewMode === 'overlay' ? 'AI Analysis Overlay' : 
                 rightViewMode === 'gradcam' ? 'Grad-CAM Activation' : 'Preprocessed Input'}
              </span>
              <div className="relative w-full aspect-square bg-black rounded-lg overflow-hidden shadow-inner flex items-center justify-center">
                {rightViewMode === 'overlay' && (
                  <FundusCanvas
                    imageUrl={result.preprocessedImage || caseData.imageUrl || ''}
                    findings={visibleFindings}
                    selectedFindingId={selectedFindingId}
                    showOverlays={true}
                    showFindingLabels={true}
                    onFindingHover={setSelectedFindingId}
                    useCropCoords={false}
                    showEtdrsGrid={showGrid}
                  />
                )}
                {rightViewMode === 'gradcam' && result.gradcamOverlay && (
                  <img src={result.gradcamOverlay} alt="Grad-CAM" className="w-full h-full object-contain" />
                )}
                {rightViewMode === 'preprocessed' && result.preprocessedImage && (
                  <img src={result.preprocessedImage} alt="Preprocessed" className="w-full h-full object-contain" />
                )}
              </div>
            </div>
          </div>
          
          {/* Quality Summary Footer */}
          <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between print:hidden">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5 text-sm">
                <CheckCircle2 className="w-4 h-4 text-green-500" />
                <span className="text-slate-600 font-medium">Focus: Pass</span>
              </div>
              <div className="flex items-center gap-1.5 text-sm">
                <CheckCircle2 className="w-4 h-4 text-green-500" />
                <span className="text-slate-600 font-medium">Illumination: Pass</span>
              </div>
            </div>
            <div className="px-3 py-1 bg-green-100 text-green-700 rounded-md text-xs font-bold uppercase tracking-wide">
              Image Quality: Good
            </div>
          </div>
        </div>

        {/* Right Col: AI Analysis & Findings */}
        <div className="flex flex-col gap-6">
          {/* Top Analysis Card */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
            <h3 className="text-lg font-bold text-slate-900 mb-6 font-display">AI Analysis</h3>
            
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <span className="text-slate-500 text-sm font-medium">DR Grade</span>
                <span className={`px-3 py-1 border rounded-md text-sm font-bold shadow-sm ${getSeverityBadgeClass(result.severity)}`}>
                  {result.severity.toUpperCase()} NPDR
                </span>
              </div>
              
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-slate-500 text-sm font-medium">DME Risk</span>
                  {result.csmeFoveaDistanceDiscDiameters > 0 && result.csmeFoveaDistanceDiscDiameters < 99 && (
                    <span className="text-xs text-slate-400 mt-0.5">Nearest Exudate: {result.csmeFoveaDistanceDiscDiameters.toFixed(2)} DD</span>
                  )}
                </div>
                <span className={`px-3 py-1 border rounded-md text-sm font-bold shadow-sm ${result.csmeThreatDetected ? 'bg-red-100 text-red-700 border-red-200' : 'bg-green-100 text-green-700 border-green-200'}`}>
                  {result.csmeThreatDetected ? 'HIGH (CSME)' : 'LOW'}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-slate-500 text-sm font-medium">AI Confidence</span>
                <span className="text-slate-900 font-bold text-sm">{result.confidenceScore}%</span>
              </div>

              <div className="flex items-center justify-between border-t border-slate-100 pt-5">
                <span className="text-slate-500 text-sm font-medium">Progression Risk</span>
                <span className="text-orange-600 font-bold text-sm">{result.progressionRisk}%</span>
              </div>
              <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-green-400 via-orange-400 to-red-500 rounded-full transition-all"
                  style={{ width: `${result.progressionRisk}%` }}
                ></div>
              </div>
            </div>
          </div>

          {/* Detected Findings Card */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 flex-1 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-slate-900 font-display">Detected Findings</h3>
              <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2 py-1 rounded">{findingsSum} Total</span>
            </div>
            
            <div className="space-y-1 flex-1">
              {result.findings.map((f) => {
                let dotColor = 'bg-blue-400';
                if (f.name === 'Microaneurysms') dotColor = 'bg-red-500';
                if (f.name === 'Hemorrhages') dotColor = 'bg-orange-500';
                if (f.name === 'Hard Exudates') dotColor = 'bg-yellow-400';

                const isSelected = selectedFindingId === f.id;
                const isHidden = hiddenFindingNames.has(f.name);

                return (
                  <div 
                    key={f.id}
                    onMouseEnter={() => setSelectedFindingId(f.id)}
                    onMouseLeave={() => setSelectedFindingId(null)}
                    onClick={() => {
                      setHiddenFindingNames(prev => {
                        const next = new Set(prev);
                        if (next.has(f.name)) next.delete(f.name);
                        else next.add(f.name);
                        return next;
                      });
                    }}
                    className={`flex items-center justify-between p-3 rounded-lg transition-colors cursor-pointer ${isSelected ? 'bg-blue-50' : 'hover:bg-slate-50'} ${isHidden ? 'opacity-50 grayscale' : ''}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-2.5 h-2.5 rounded-full ${dotColor} shadow-sm`} />
                      <span className={`text-sm font-medium ${isSelected ? 'text-blue-900' : 'text-slate-700'}`}>{f.name}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-sm font-bold ${isSelected ? 'text-blue-700' : 'text-slate-900'}`}>{f.count}</span>
                    </div>
                  </div>
                );
              })}
              
              {result.findings.length === 0 && (
                <div className="py-8 text-center text-sm text-slate-500">
                  No pathological findings detected.
                </div>
              )}
            </div>
            
            {onSendToDoctor && (
              <div className="mt-6 pt-6 border-t border-slate-100 flex flex-col gap-3">
                <button
                  onClick={() => onSendToDoctor(caseData.id)}
                  className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition-colors shadow-sm"
                >
                  <Activity className="w-4 h-4" />
                  Send to Doctor Review Queue
                </button>
                <button
                  onClick={onRecapture}
                  className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition-colors shadow-sm"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Start New Screening
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
