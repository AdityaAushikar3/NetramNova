"""
NETRAMNOVA CLINICAL PRACTICE GUIDELINES KNOWLEDGE BASE (KB)
Authoritative references compiled from:
  1. American Academy of Ophthalmology (AAO) Preferred Practice Pattern (PPP) 2023 Update: Diabetic Retinopathy
  2. International Council of Ophthalmology (ICO) Guidelines for Diabetic Eye Care
  3. AIIMS & National Programme for Control of Blindness and Visual Impairment (NPCBVI, Ministry of Health, India)
"""

from typing import Dict, Any, List

CLINICAL_GUIDELINES: Dict[int, Dict[str, Any]] = {
    0: {
        "stage_name": "No Apparent Diabetic Retinopathy",
        "icdr_severity": "No abnormalities",
        "icd10_code": "E11.9 / Z13.5",
        "triage_category": "ROUTINE_ANNUAL_SCREENING",
        "referral_timeline": "Annual follow-up in 12 months at Primary Health Centre (PHC)",
        "clinical_findings": [
            "Absence of microaneurysms, retinal hemorrhages, hard exudates, or venous caliber changes.",
            "Normal foveal avascular zone (FAZ) and intact optic disc margin architecture."
        ],
        "aao_management_protocol": (
            "AAO PPP Guideline Table 4.1: Patients with diabetes but no visible retinopathy "
            "require annual dilated fundus examinations. Emphasize strict glycemic target "
            "(HbA1c < 7.0%), blood pressure control (< 130/80 mmHg), and lipid management. "
            "No immediate ophthalmic intervention or tertiary hospital referral is required."
        ),
        "required_diagnostic_tests": ["Annual Non-Mydriatic Fundus Photography", "Point-of-Care HbA1c", "Blood Pressure Check"],
        "patient_summary_en": (
            "Good news: Your retina examination shows no signs of diabetic damage at this time. "
            "Your blood vessels appear clear and healthy. To protect your vision, keep your blood sugar "
            "and blood pressure under control, and return for your next routine eye check in 12 months."
        ),
        "patient_summary_hi": (
            "अच्छी खबर: आपकी आँख के पर्दे (रेटिना) में मधुमेह का कोई नुकसान नहीं पाया गया है। "
            "खून की नसें स्वस्थ हैं। अपनी दृष्टि को सुरक्षित रखने के लिए शुगर और ब्लड प्रेशर को नियंत्रित "
            "रखें, और 12 महीने बाद अपनी अगली नियमित आँख की जांच करवाएं।"
        )
    },

    1: {
        "stage_name": "Mild Non-Proliferative Diabetic Retinopathy (Mild NPDR)",
        "icdr_severity": "Microaneurysms only",
        "icd10_code": "E11.319",
        "triage_category": "MONITORED_PRIMARY_CARE",
        "referral_timeline": "Follow-up in 6 to 12 months at PHC or Community Health Centre",
        "clinical_findings": [
            "Presence of isolated microaneurysms (< 5 total) without retinal hemorrhages, hard exudates, or macular involvement.",
            "Sub-pixel vascular outpouchings detectable on green/red-free channel."
        ],
        "aao_management_protocol": (
            "AAO PPP Guideline Table 4.2: Mild NPDR is characterized by microaneurysms only. "
            "The 1-year progression risk to proliferative disease is low (~5%). Management focuses on "
            "systemic medical optimization: rigorous glycemic control (HbA1c < 7.0%), arterial hypertension "
            "management, and lipid panel optimization. Routine retinal review in 6–12 months is standard."
        ),
        "required_diagnostic_tests": ["Repeat 6-12 Month Fundus Photography", "Serum HbA1c Panel", "Lipid Profile"],
        "patient_summary_en": (
            "Mild changes detected: You have early, tiny pinpoint swelling in the small blood vessels of your eye. "
            "Your sight is not currently at risk, but this is an early warning signal. With strict sugar and diet control, "
            "progression can be stopped. Schedule a follow-up eye scan in 6 to 12 months."
        ),
        "patient_summary_hi": (
            "शुरुआती बदलाव: आपकी आँख की बारीक नसों में बहुत छोटे उभार (माइक्रोएन्यूरिज्म) देखे गए हैं। "
            "अभी आपकी दृष्टि को कोई खतरा नहीं है, लेकिन यह एक चेतावनी संकेत है। सख्त शुगर नियंत्रण और स्वस्थ आहार से "
            "इसे रोका जा सकता है। 6 से 12 महीने बाद दोबारा अपनी आँख की जांच करवाएं।"
        )
    },

    2: {
        "stage_name": "Moderate Non-Proliferative Diabetic Retinopathy (Moderate NPDR)",
        "icdr_severity": "More than microaneurysms but less than Severe NPDR",
        "icd10_code": "E11.329",
        "triage_category": "ROUTINE_SPECIALIST_REFERRAL",
        "referral_timeline": "Refer to District Hospital / Ophthalmologist within 3 to 6 months",
        "clinical_findings": [
            "Definite retinal microaneurysms, dot-and-blot hemorrhages in 1 to 3 quadrants.",
            "Hard exudates (lipid deposits) present; soft exudates (cotton-wool spots) may be visible.",
            "Venous beading absent or limited to a single quadrant."
        ],
        "aao_management_protocol": (
            "AAO PPP Guideline Table 4.3: Moderate NPDR carries a 12-27% 1-year progression rate to severe disease. "
            "Referral to an ophthalmologist for comprehensive dilated biomicroscopy within 3 to 6 months is indicated. "
            "Evaluate for subclinical macular edema via Optical Coherence Tomography (OCT). Optimize cardiovascular "
            "and renal comorbidities; aggressive glycemic target (HbA1c < 7.0%) prevents vision deterioration."
        ),
        "required_diagnostic_tests": ["Dilated Slit-Lamp Biomicroscopy", "Macular Spectral-Domain OCT", "Quarterly HbA1c"],
        "patient_summary_en": (
            "Moderate diabetic eye changes: Small bleeding spots and protein deposits are present in your retina. "
            "You require a formal evaluation by an eye specialist within 3 to 6 months. Do not delay. Keep your blood "
            "sugar and blood pressure strictly controlled to protect your central vision."
        ),
        "patient_summary_hi": (
            "मध्यम स्थिति: आँख के पर्दे में खून के छोटे धब्बे और रिसाव के निशान देखे गए हैं। "
            "अगले 3 से 6 महीने के भीतर किसी नेत्र विशेषज्ञ (आई डॉक्टर) से अपनी आँखों की पूरी जांच करवाएं। "
            "लापरवाही न बरतें। अपनी नजर को सुरक्षित रखने के लिए शुगर और बीपी को पूरी तरह नियंत्रित रखें।"
        )
    },

    3: {
        "stage_name": "Severe Non-Proliferative Diabetic Retinopathy (Severe NPDR)",
        "icdr_severity": "Severe NPDR (ETDRS 4-2-1 Rule Met)",
        "icd10_code": "E11.349",
        "triage_category": "URGENT_TELE_REFERRAL",
        "referral_timeline": "Urgent specialist referral within 2 to 4 weeks",
        "clinical_findings": [
            "ETDRS 4-2-1 Rule Met: Intraretinal hemorrhages (≥ 20) in all 4 quadrants, OR",
            "Definite venous beading in ≥ 2 quadrants, OR",
            "Prominent intraretinal microvascular abnormalities (IRMA) in ≥ 1 quadrant.",
            "Absence of frank neovascularization on disc or retina."
        ],
        "aao_management_protocol": (
            "AAO PPP Guideline Section 4.4: Severe NPDR confers a 50% risk of progressing to high-risk proliferative "
            "retinopathy within 12 months. Mandatory urgent referral to a vitreoretinal specialist within 2 to 4 weeks. "
            "Perform baseline Macular OCT and Widefield Fluorescein Angiography (FFA). Prophylactic panretinal "
            "photocoagulation (PRP) or anti-VEGF intravitreal therapy may be considered if patient compliance is uncertain."
        ),
        "required_diagnostic_tests": ["Fundus Fluorescein Angiography (FFA)", "Macular OCT", "Urgent Retinal Biomicroscopy"],
        "patient_summary_en": (
            "Urgent medical attention needed: Serious diabetic damage and poor blood circulation are present across your retina. "
            "You are at high risk of rapid vision loss without treatment. Visit an eye specialist or district hospital within "
            "2 to 4 weeks for specialized retinal scans and possible laser/injection therapy."
        ),
        "patient_summary_hi": (
            "तत्काल ध्यान देने की आवश्यकता: आपकी आँख के पर्दे में गंभीर खराबी और खून के बहाव में रुकावट देखी गई है। "
            "बिना इलाज के नजर तेजी से कमजोर होने का बड़ा खतरा है। अगले 2 से 4 सप्ताह के भीतर किसी बड़े अस्पताल में "
            "रेटिना विशेषज्ञ को दिखाएं ताकि समय रहते लेजर या इंजेक्शन से रोशनी बचाई जा सके।"
        )
    },

    4: {
        "stage_name": "Proliferative Diabetic Retinopathy (PDR)",
        "icdr_severity": "High-Risk Proliferative Disease",
        "icd10_code": "E11.359",
        "triage_category": "EMERGENT_HOSPITAL_ESCALATION",
        "referral_timeline": "Emergent hospital referral within 24 to 48 hours",
        "clinical_findings": [
            "Active Neovascularization of the Disc (NVD ≥ 1/4 disc area) or elsewhere (NVE), OR",
            "Pre-retinal or vitreous hemorrhage secondary to fragile new vessel rupture, OR",
            "Tractional retinal detachment threatening the macular foveal center."
        ],
        "aao_management_protocol": (
            "AAO PPP Section 5.1 & ICO Protocol: High-risk PDR is a sight-threatening ophthalmic emergency. "
            "Immediate referral within 24 to 48 hours for urgent intervention. Primary treatment consists of prompt "
            "Panretinal Photocoagulation (PRP) and/or intravitreal anti-VEGF injections (e.g., Aflibercept / Ranibizumab). "
            "If dense non-clearing vitreous hemorrhage or tractional detachment is present, urgent pars plana vitrectomy is indicated."
        ),
        "required_diagnostic_tests": ["Emergent Vitreoretinal Consult", "B-Scan Ultrasonography (if media hazy)", "Widefield FFA", "Macular OCT"],
        "patient_summary_en": (
            "Sight-threatening emergency: Fragile abnormal new blood vessels have grown inside your eye and pose an immediate "
            "risk of severe bleeding and permanent blindness. Go to the nearest eye hospital or district medical college within "
            "24 to 48 hours for emergency laser or injection treatment."
        ),
        "patient_summary_hi": (
            "आपातकालीन स्थिति (अति गंभीर): आपकी आँख में नाजुक नई नसें उग आई हैं, जिनके फटने से आँख के भीतर भारी ब्लीडिंग "
            "और हमेशा के लिए अंधापन आने का खतरा है। तुरंत (24 से 48 घंटे के भीतर) नजदीकी मेडिकल कॉलेज या आँख के बड़े अस्पताल जाएं "
            "और आपातकालीन लेजर या इंजेक्शन का इलाज करवाएं।"
        )
    }
}

DME_GUIDELINE = {
    "condition": "Clinically Significant Diabetic Macular Edema (CSME)",
    "definition": (
        "Hard exudates or retinal thickening located within 500 microns (1/3 disc diameter) of the center "
        "of the foveal avascular zone (FAZ), or zone of thickening ≥ 1 disc area within 1 disc diameter of center."
    ),
    "triage_escalation": "Escalate any DR stage to URGENT REFERRAL (within 1 to 2 weeks).",
    "primary_treatment": (
        "Intravitreal Anti-VEGF pharmacotherapy (Aflibercept / Ranibizumab / Bevacizumab) as first-line therapy "
        "for center-involved DME, supplemented by targeted focal/grid laser photocoagulation for non-center DME."
    ),
    "clinical_note": (
        "Macular edema is the primary cause of moderate vision loss in diabetic patients. Even if the peripheral "
        "retina exhibits only Mild (Stage 1) or Moderate (Stage 2) NPDR, the presence of macular involvement "
        "mandates immediate referral for macular OCT and anti-VEGF consideration."
    )
}
