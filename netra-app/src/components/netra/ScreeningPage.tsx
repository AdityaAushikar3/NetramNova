'use client';

import React, { useState, useEffect } from 'react';
import { Patient, ScreeningCase } from './types';
import { RetinalAnalysisPanel } from './RetinalAnalysisPanel';
import { NewPatientModal } from './NewPatientModal';
import {
  UserPlus,
  Search,
  Upload,
  Activity,
  Image as ImageIcon,
  AlertCircle,
  FileImage,
  ChevronRight
} from 'lucide-react';

interface ScreeningPageProps {
  onCaseCompleted?: (newCase: ScreeningCase) => void;
  onPatientAdded?: (patient: Patient) => void;
  initialPatientId?: string;
  patients?: Patient[];
}

export const ScreeningPage: React.FC<ScreeningPageProps> = ({ 
  onCaseCompleted, 
  onPatientAdded, 
  initialPatientId, 
  patients: patientsProp 
}) => {
  const currentPatients = patientsProp ?? [];

  const [selectedPatient, setSelectedPatient] = useState<Patient>(() => {
    const src = patientsProp ?? [];
    if (initialPatientId) {
      const match = src.find((p) => p.id === initialPatientId);
      if (match) return match;
    }
    return src[0] || null;
  });

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [customImageUrl, setCustomImageUrl] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState<boolean>(false);

  const [stage, setStage] = useState<'idle' | 'processing' | 'completed'>('idle');
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [activeCase, setActiveCase] = useState<ScreeningCase>({
    id: '',
    patient: patientsProp?.[0] as Patient,
    timestamp: new Date().toISOString(),
    imageUrl: undefined,
    quality: { fovDetected: false, focusAcceptable: false, exposureAcceptable: false, retinaVisible: false, blurScore: 0, illuminationUniformity: 0 },
    qualityStatus: 'passed',
    status: 'new',
    result: undefined,
    synced: false,
  });

  useEffect(() => {
    if (initialPatientId) {
      const match = currentPatients.find((p) => p.id === initialPatientId);
      if (match) {
        setSelectedPatient(match);
        setActiveCase((prev) => ({ ...prev, patient: match }));
      }
    }
  }, [initialPatientId, currentPatients]);

  const handlePatientSelect = (p: Patient) => {
    setSelectedPatient(p);
    setCustomImageUrl(null);
    setSelectedFile(null);
    setStage('idle');
    setActiveCase((prev) => ({ ...prev, patient: p }));
  };

  const handleAddPatient = (newPatient: Patient) => {
    setSelectedPatient(newPatient);
    setStage('idle');
    setCustomImageUrl(null);
    setSelectedFile(null);
    setActiveCase((prev) => ({ ...prev, patient: newPatient, status: 'new', result: undefined }));
    onPatientAdded?.(newPatient);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64Url = event.target?.result as string;
        setCustomImageUrl(base64Url);
        setActiveCase((prev) => ({
          ...prev,
          imageUrl: base64Url,
        }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleStartAnalysis = async () => {
    if (!selectedFile && !customImageUrl) {
      setAnalysisError('Please upload a fundus image before running analysis.');
      return;
    }

    setStage('processing');
    setAnalysisError(null);

    try {
      const formData = new FormData();
      if (selectedFile) {
        formData.append('file', selectedFile);
      } else if (customImageUrl) {
        const res = await fetch(customImageUrl);
        if (!res.ok) throw new Error('Could not load the image for analysis.');
        const blob = await res.blob();
        formData.append('file', blob, 'sample_fundus.jpg');
      }

      // Direct call to Render to bypass Vercel's 10-second serverless timeout limit
      const ML_URL = process.env.NEXT_PUBLIC_ML_SERVICE_URL || 'http://127.0.0.1:5000';
      const apiRes = await fetch(`${ML_URL}/predict`, {
        method: 'POST',
        body: formData,
      });

      if (!apiRes.ok) {
        throw new Error(`Inference API returned status: ${apiRes.status}`);
      }

      const data = await apiRes.json();
      
      if (data.error || data.icdrLevel === undefined) {
        throw new Error(data.error || data.details || 'Inference pipeline failed.');
      }

      const completedCase: ScreeningCase = {
        id: `CASE-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
        patient: selectedPatient,
        timestamp: new Date().toISOString(),
        imageUrl: customImageUrl ?? undefined,
        status: 'completed',
        quality: data.quality || activeCase.quality,
        qualityStatus: data.qualityStatus || activeCase.qualityStatus,
        synced: false,
        doctorReviewStatus: 'pending',
        result: {
          diagnosis: data.diagnosis,
          icdrLevel: data.icdrLevel,
          severity: data.severity,
          confidence: data.confidence,
          confidenceScore: data.confidenceScore,
          triageTier: data.triageTier,
          findings: data.findings || [],
          progressionRisk: data.progressionRisk,
          recallAdvice: data.recallAdvice,
          csmeThreatDetected: data.csmeThreatDetected,
          csmeFoveaDistanceDiscDiameters: data.csmeFoveaDistanceDiscDiameters,
          gradcamOverlay: data.gradcamOverlay,
          preprocessedImage: data.preprocessedImage,
          probabilities: data.probabilities,
          rescuedBy: data.rescuedBy,
          clinicalGuidance: data.clinicalGuidance,
        },
      };

      setActiveCase(completedCase);
      setStage('completed');
      onCaseCompleted?.(completedCase);
    } catch (err) {
      setStage('idle');
      setAnalysisError(err instanceof Error ? err.message : 'Analysis failed unexpectedly.');
    }
  };

  const filteredPatients = currentPatients.filter((p) =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="max-w-7xl mx-auto h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <span className="text-slate-500 font-sans font-medium">Dashboard</span>
        <ChevronRight className="w-4 h-4 text-slate-300" />
        <span className="text-slate-900 font-sans font-semibold">New Screening</span>
      </div>

      {stage === 'completed' && activeCase.result ? (
        <RetinalAnalysisPanel
          caseData={activeCase}
          onRecapture={() => {
            setStage('idle');
            setCustomImageUrl(null);
            setSelectedFile(null);
          }}
          onSendToDoctor={() => {
            // Placeholder: Typically this would call an API or parent method to update status
            alert('Case successfully added to Specialist Review Queue.');
          }}
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Patient Selection Panel */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col h-fit">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-slate-900">Select Patient</h3>
              <button
                onClick={() => setIsRegisterModalOpen(true)}
                className="px-3 py-1.5 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>New</span>
              </button>
            </div>

            <div className="relative mb-4">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search by ID or Name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
              />
            </div>

            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {filteredPatients.map((p) => {
                const isSelected = selectedPatient.id === p.id;
                return (
                  <div
                    key={p.id}
                    onClick={() => handlePatientSelect(p)}
                    className={`p-3 rounded-lg border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-blue-50 border-blue-200 shadow-sm'
                        : 'bg-white border-slate-200 hover:border-blue-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className={`font-semibold text-sm ${isSelected ? 'text-blue-900' : 'text-slate-700'}`}>{p.name}</span>
                      <span className={`text-xs font-mono font-medium ${isSelected ? 'text-blue-600' : 'text-slate-500'}`}>{p.id}</span>
                    </div>
                    <div className="text-xs text-slate-500">
                      {p.age}Y • {p.sex} • {p.diabetesHistory}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Upload & Analysis Panel */}
          <div className="lg:col-span-2 flex flex-col">
            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm flex-1 flex flex-col">
              <h3 className="text-lg font-semibold text-slate-900 mb-1">Fundus Image Analysis</h3>
              <p className="text-sm text-slate-500 mb-6">Upload a clear retinal scan for AI-powered DR screening.</p>

              {analysisError && (
                <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-lg flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-sm font-semibold text-red-800">Analysis Failed</h4>
                    <p className="text-sm text-red-600 mt-1">{analysisError}</p>
                  </div>
                </div>
              )}

              <div className="flex-1 flex items-center justify-center">
                {customImageUrl ? (
                  <div className="w-full flex flex-col items-center">
                    <div className="relative w-full max-w-md aspect-square rounded-xl overflow-hidden shadow-md border border-slate-200 mb-6 bg-slate-50">
                      <img src={customImageUrl} alt="Fundus Preview" className="w-full h-full object-cover" />
                    </div>
                    <div className="flex items-center gap-4">
                      <label className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-semibold cursor-pointer transition-colors">
                        Change Image
                        <input type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
                      </label>
                      <button
                        onClick={handleStartAnalysis}
                        disabled={stage === 'processing'}
                        className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold flex items-center gap-2 transition-colors disabled:opacity-70 disabled:cursor-not-allowed shadow-sm shadow-blue-600/20"
                      >
                        {stage === 'processing' ? (
                          <>
                            <Activity className="w-4 h-4 animate-pulse" />
                            Analyzing...
                          </>
                        ) : (
                          <>
                            <ImageIcon className="w-4 h-4" />
                            Run AI Analysis
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                ) : (
                  <label className="w-full max-w-lg aspect-video border-2 border-dashed border-slate-300 rounded-xl flex flex-col items-center justify-center hover:bg-blue-50/50 hover:border-blue-400 cursor-pointer transition-all group">
                    <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                      <Upload className="w-6 h-6 text-blue-600" />
                    </div>
                    <span className="text-base font-semibold text-slate-700 mb-1">Upload Retinal Scan</span>
                    <span className="text-sm text-slate-500">Drag and drop or click to browse</span>
                    <input type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
                  </label>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <NewPatientModal
        isOpen={isRegisterModalOpen}
        onClose={() => setIsRegisterModalOpen(false)}
        onAddPatient={handleAddPatient}
      />
    </div>
  );
};
