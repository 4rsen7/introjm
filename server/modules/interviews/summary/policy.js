// Extracted from the existing interview pipeline without changing its behavior.
const { normalizeInterviewSummaryData } = require('./normalization');
const INTERVIEW_SYSTEM_KEY = '_system';

const INTERVIEW_SUMMARY_ANALYSIS_MODES = new Set(['service_design', 'prototype_testing']);
const INTERVIEW_SERVICE_DESIGN_SECTION_ORDER = [
    'summary',
    'journeyDraft',
    'jtbdProfile',
    'forcesOfProgress',
    'painPoints',
    'momentsOfFriction',
    'unmetNeeds',
    'workarounds',
    'opportunityAreas',
    'strengths',
    'quotes',
];
const INTERVIEW_PROTOTYPE_TESTING_SECTION_ORDER = [
    'summary',
    'testedProductContext',
    'taskSuccess',
    'whatWorked',
    'whatDidNotWork',
    'confusionsObjections',
    'featureRequests',
    'actionableRecommendations',
    'quotes',
];
const INTERVIEW_SUMMARY_SECTION_ORDER = [
    ...new Set([
        ...INTERVIEW_SERVICE_DESIGN_SECTION_ORDER,
        ...INTERVIEW_PROTOTYPE_TESTING_SECTION_ORDER,
    ]),
];
const INTERVIEW_PROTOTYPE_SUMMARY_SECTIONS = new Set([
    'testedProductContext',
    'taskSuccess',
    'whatWorked',
    'whatDidNotWork',
    'confusionsObjections',
    'featureRequests',
    'actionableRecommendations',
]);
const INTERVIEW_SUMMARY_PRESET_SECTIONS = {
    full_analysis: INTERVIEW_SERVICE_DESIGN_SECTION_ORDER,
    quick_summary: ['summary', 'painPoints', 'strengths', 'quotes'],
    research_insights: ['summary', 'painPoints', 'strengths', 'momentsOfFriction', 'unmetNeeds', 'workarounds', 'opportunityAreas', 'quotes'],
    journey_mapping: ['summary', 'journeyDraft', 'painPoints', 'strengths', 'momentsOfFriction', 'quotes'],
    jtbd_analysis: ['summary', 'jtbdProfile', 'forcesOfProgress', 'strengths', 'quotes'],
    prototype_testing: ['summary', 'testedProductContext', 'taskSuccess', 'whatWorked', 'whatDidNotWork', 'confusionsObjections', 'actionableRecommendations', 'quotes'],
    usability_findings: ['testedProductContext', 'taskSuccess', 'whatWorked', 'whatDidNotWork', 'confusionsObjections', 'quotes'],
    product_opportunities: ['summary', 'featureRequests', 'actionableRecommendations', 'quotes'],
    decision_ready_report: ['summary', 'testedProductContext', 'taskSuccess', 'whatWorked', 'whatDidNotWork', 'featureRequests', 'actionableRecommendations', 'quotes'],
};
const INTERVIEW_SUMMARY_PRESET_MODES = {
    quick_summary: 'service_design',
    research_insights: 'service_design',
    journey_mapping: 'service_design',
    jtbd_analysis: 'service_design',
    prototype_testing: 'prototype_testing',
    usability_findings: 'prototype_testing',
    product_opportunities: 'prototype_testing',
    decision_ready_report: 'prototype_testing',
};
const INTERVIEW_SUMMARY_SECTION_PROMPT_DEFS = {
    summary: {
        focus: [
            'what the respondent is trying to achieve',
            'the sharpest evidence-backed summary of the interview',
            'the overall emotional tone of the experience',
        ],
        schema: `"summary": {
    "jobToBeDone": "string",
    "generalInsight": "string",
    "overallSentiment": "positive|mixed|negative"
  }`,
        limits: [
            'summary.generalInsight: 1 concise paragraph',
        ],
    },
    journeyDraft: {
        focus: [
            'the customer journey they are moving through',
            'stages, customer actions, drivers, touchpoints, and pain points at each stage',
        ],
        schema: `"journeyDraft": {
    "jobContext": "string",
    "stages": [
      {
        "stage": "string",
        "customerActions": ["string"],
        "drivers": ["string"],
        "touchpoints": [
          {
            "touchpoint": "string",
            "interactsWith": "string",
            "channel": "string"
          }
        ],
        "painPoints": [
          {
            "title": "string",
            "description": "string",
            "severity": "low|medium|high"
          }
        ]
      }
    ]
  }`,
        limits: [
            'journeyDraft.stages: up to 8',
            'journeyDraft.customerActions: up to 6 per stage',
            'journeyDraft.drivers: up to 5 per stage',
            'journeyDraft.touchpoints: up to 6 per stage',
            'journeyDraft.painPoints: up to 5 per stage',
        ],
    },
    jtbdProfile: {
        focus: [
            'the customer\'s JTBD profile',
        ],
        schema: `"jtbdProfile": {
    "mainJob": "string",
    "functionalJob": "string",
    "emotionalJob": "string",
    "socialJob": "string",
    "jobContext": "string",
    "desiredOutcome": "string",
    "successCriteria": ["string"]
  }`,
        limits: [
            'jtbdProfile.successCriteria: up to 5',
        ],
    },
    forcesOfProgress: {
        focus: [
            'the 4 forces of progress (push, pull, anxiety, habit)',
        ],
        schema: `"forcesOfProgress": {
    "pushes": ["string"],
    "pulls": ["string"],
    "anxieties": ["string"],
    "habits": ["string"]
  }`,
        limits: [
            'forcesOfProgress.pushes/pulls/anxieties/habits: up to 5 each',
        ],
    },
    painPoints: {
        focus: [
            'broken expectations',
            'the likely root causes behind complaints',
            'the most important pain points and their impact',
        ],
        schema: `"painPoints": [
    {
      "title": "string",
      "description": "string",
      "rootCause": "string",
      "impact": "string",
      "severity": "low|medium|high",
      "evidenceQuote": "string"
    }
  ]`,
        limits: [
            'painPoints: up to 5',
        ],
    },
    momentsOfFriction: {
        focus: [
            'friction and service gaps across touchpoints',
            'moments where the experience breaks down and how the customer reacts',
        ],
        schema: `"momentsOfFriction": [
    {
      "stage": "string",
      "situation": "string",
      "breakdown": "string",
      "customerReaction": "string"
    }
  ]`,
        limits: [
            'momentsOfFriction: up to 5',
        ],
    },
    unmetNeeds: {
        focus: [
            'unmet needs',
        ],
        schema: `"unmetNeeds": [
    {
      "need": "string",
      "whyItMatters": "string"
    }
  ]`,
        limits: [
            'unmetNeeds: up to 5',
        ],
    },
    workarounds: {
        focus: [
            'workarounds',
        ],
        schema: `"workarounds": [
    {
      "workaround": "string",
      "whatItSignals": "string"
    }
  ]`,
        limits: [
            'workarounds: up to 3',
        ],
    },
    opportunityAreas: {
        focus: [
            'evidence-backed opportunity areas for improving the experience',
        ],
        schema: `"opportunityAreas": [
    {
      "area": "string",
      "rationale": "string"
    }
  ]`,
        limits: [
            'opportunityAreas: up to 5',
        ],
    },
    strengths: {
        focus: [
            'what already works well in the experience',
            'service elements, solutions, or touchpoints that genuinely help the customer',
            'positive moments worth preserving or scaling',
        ],
        schema: `"strengths": [
    {
      "title": "string",
      "description": "string",
      "whyItWorks": "string",
      "evidenceQuote": "string"
    }
  ]`,
        limits: [
            'strengths: up to 5',
        ],
    },
    testedProductContext: {
        focus: [
            'the product, prototype, concept, or flow being tested',
            'the scenario and research goal implied by the conversation',
            'the target user context if it is stated by the respondent or interviewer',
        ],
        schema: `"testedProductContext": {
    "productOrPrototype": "string",
    "testedScenario": "string",
    "researchGoal": "string",
    "targetUser": "string"
  }`,
        limits: [
            'testedProductContext: keep every field to one concise sentence',
        ],
    },
    taskSuccess: {
        focus: [
            'whether the respondent understood and completed the tested tasks',
            'where task progress was completed, partial, failed, or not observed',
            'observable evidence from the test session',
        ],
        schema: `"taskSuccess": [
    {
      "task": "string",
      "outcome": "completed|partial|failed|not_observed",
      "whatHappened": "string",
      "evidenceQuote": "string"
    }
  ]`,
        limits: [
            'taskSuccess: up to 6',
        ],
    },
    whatWorked: {
        focus: [
            'prototype elements that were clear, useful, desirable, or confidence-building',
            'what the respondent liked and why it helped',
        ],
        schema: `"whatWorked": [
    {
      "item": "string",
      "whyItWorked": "string",
      "evidenceQuote": "string"
    }
  ]`,
        limits: [
            'whatWorked: up to 5',
        ],
    },
    whatDidNotWork: {
        focus: [
            'prototype elements that were confusing, unusable, missing, or weak',
            'the impact of each issue on comprehension, trust, or task completion',
        ],
        schema: `"whatDidNotWork": [
    {
      "item": "string",
      "problem": "string",
      "impact": "string",
      "evidenceQuote": "string"
    }
  ]`,
        limits: [
            'whatDidNotWork: up to 5',
        ],
    },
    confusionsObjections: {
        focus: [
            'moments where the respondent hesitated, misunderstood, objected, or expected something different',
            'likely causes of confusion based only on the transcript',
        ],
        schema: `"confusionsObjections": [
    {
      "moment": "string",
      "confusionOrObjection": "string",
      "likelyCause": "string",
      "evidenceQuote": "string"
    }
  ]`,
        limits: [
            'confusionsObjections: up to 5',
        ],
    },
    featureRequests: {
        focus: [
            'explicit requests, expectations, or missing capabilities mentioned by the respondent',
            'the underlying need behind each requested feature',
        ],
        schema: `"featureRequests": [
    {
      "request": "string",
      "underlyingNeed": "string",
      "evidenceQuote": "string"
    }
  ]`,
        limits: [
            'featureRequests: up to 5',
        ],
    },
    actionableRecommendations: {
        focus: [
            'specific next design or product changes supported by the test evidence',
            'prioritized recommendations that help the team decide what to improve next',
        ],
        schema: `"actionableRecommendations": [
    {
      "recommendation": "string",
      "rationale": "string",
      "priority": "low|medium|high"
    }
  ]`,
        limits: [
            'actionableRecommendations: up to 5',
        ],
    },
    quotes: {
        focus: [
            'the strongest verbatim quotes that represent the customer\'s voice',
        ],
        schema: `"quotes": ["string"]`,
        limits: [
            'quotes: up to 3',
        ],
    },
};

function isPlainObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

function getInterviewSystemState(summaryData) {
    if (!isPlainObject(summaryData)) return {};
    const systemState = summaryData[INTERVIEW_SYSTEM_KEY];
    return isPlainObject(systemState) ? systemState : {};
}

function withInterviewSystemState(summaryData, nextSystemState) {
    const baseSummary = isPlainObject(summaryData) ? { ...summaryData } : {};
    if (!nextSystemState || Object.keys(nextSystemState).length === 0) {
        delete baseSummary[INTERVIEW_SYSTEM_KEY];
        return baseSummary;
    }
    baseSummary[INTERVIEW_SYSTEM_KEY] = nextSystemState;
    return baseSummary;
}

function normalizeInterviewSummarySections(value) {
    if (!Array.isArray(value)) return [];
    const seen = new Set();
    return value.reduce((sections, item) => {
        const sectionKey = typeof item === 'string' ? item.trim() : '';
        if (!INTERVIEW_SUMMARY_SECTION_ORDER.includes(sectionKey) || seen.has(sectionKey)) return sections;
        seen.add(sectionKey);
        sections.push(sectionKey);
        return sections;
    }, []);
}

function inferInterviewSummaryAnalysisMode({ requestedMode, preset, selectedSections }) {
    const modeCandidate = typeof requestedMode === 'string' ? requestedMode.trim() : '';
    if (INTERVIEW_SUMMARY_ANALYSIS_MODES.has(modeCandidate)) return modeCandidate;
    if (INTERVIEW_SUMMARY_PRESET_MODES[preset]) return INTERVIEW_SUMMARY_PRESET_MODES[preset];
    return selectedSections.some((sectionKey) => INTERVIEW_PROTOTYPE_SUMMARY_SECTIONS.has(sectionKey))
        ? 'prototype_testing'
        : 'service_design';
}

function resolveInterviewSummaryRequest(body = {}) {
    const requestedSections = normalizeInterviewSummarySections(body?.selectedSections);
    const presetCandidate = typeof body?.preset === 'string' ? body.preset.trim() : '';
    const preset = Object.prototype.hasOwnProperty.call(INTERVIEW_SUMMARY_PRESET_SECTIONS, presetCandidate)
        ? presetCandidate
        : (requestedSections.length > 0 ? 'custom' : 'full_analysis');
    const selectedSections = requestedSections.length > 0
        ? requestedSections
        : [...(INTERVIEW_SUMMARY_PRESET_SECTIONS[preset] || INTERVIEW_SUMMARY_PRESET_SECTIONS.full_analysis)];

    return {
        preset,
        analysisMode: inferInterviewSummaryAnalysisMode({
            requestedMode: body?.analysisMode,
            preset,
            selectedSections,
        }),
        selectedSections,
        mergeMode: body?.mergeMode === 'replace_all' ? 'replace_all' : 'merge_selected',
    };
}

function buildInterviewSummaryPrompt({ conversationText, selectedSections, analysisMode = 'service_design' }) {
    const sectionDefs = selectedSections
        .map((sectionKey) => INTERVIEW_SUMMARY_SECTION_PROMPT_DEFS[sectionKey])
        .filter(Boolean);
    const focusBullets = [...new Set(sectionDefs.flatMap((section) => section.focus || []))];
    const schema = sectionDefs.map((section) => section.schema).join(',\n');
    const limits = [...new Set(sectionDefs.flatMap((section) => section.limits || []))];
    const includesPrototypeSections = analysisMode === 'prototype_testing'
        || selectedSections.some((sectionKey) => INTERVIEW_PROTOTYPE_SUMMARY_SECTIONS.has(sectionKey));
    const prototypeRules = includesPrototypeSections
        ? `
PROTOTYPE TESTING RULES:
- Treat this as product/prototype/concept testing when the transcript contains product reactions, task attempts, screen feedback, or feature expectations.
- Separate what the respondent liked from what was actually clear, usable, or useful.
- Track task success only when a task or expected action is stated or observable.
- Turn recommendations into concrete next design or product decisions.
- Do not invent prototype context, screens, tasks, or product details that are not stated in the transcript.
`
        : '';

    return `You are a senior UX/CX Researcher.
Your task is to analyze this interview as evidence about the respondent's lived experience, service journey, or product/prototype test depending on the requested sections.

Only generate the requested analysis sections.

Focus on:
${focusBullets.map((item) => `- ${item}`).join('\n')}

CRITICAL RULES:
- Detect the dominant language of the transcript and write the entire output in that exact same language.
- Base every conclusion only on evidence from the transcript.
- Do not invent facts, motivations, stages, or context that are not supported by the transcript.
- Prioritize the respondent's statements over the interviewer's framing.
- Merge duplicate observations.
- Be specific, concise, and insight-rich.
- Highlight not only problems, but also what already works well when that section is requested.
- In journeyDraft, keep customerActions limited to observable steps or decisions, and place motivations, delights, incentives, or reasons in drivers instead of customerActions.
- If something is unclear, prefer an empty string or empty array instead of guessing.
- Return only the requested top-level keys and omit everything else.
${prototypeRules}

Return EXACTLY one valid JSON object with this schema:
{
  ${schema}
}

LIMITS:
${limits.map((item) => `- ${item}`).join('\n')}

Do not include markdown fences.
Return only JSON.

Transcript:
"""
${conversationText}
"""`;
}

function mergeInterviewSummarySections(existingSummaryData, generatedSummaryData, selectedSections) {
    const existingSummary = normalizeInterviewSummaryData(existingSummaryData) || {};
    const mergedSummary = {};

    INTERVIEW_SUMMARY_SECTION_ORDER.forEach((sectionKey) => {
        if (selectedSections.includes(sectionKey)) {
            mergedSummary[sectionKey] = generatedSummaryData[sectionKey];
            return;
        }

        if (Object.prototype.hasOwnProperty.call(existingSummary, sectionKey)) {
            mergedSummary[sectionKey] = existingSummary[sectionKey];
            return;
        }

        mergedSummary[sectionKey] = generatedSummaryData[sectionKey];
    });

    return normalizeInterviewSummaryData(mergedSummary) || generatedSummaryData;
}

function buildInterviewSummarySystemState(currentSystemState, { provider, model, preset, analysisMode, selectedSections, mergeMode }) {
    return {
        ...currentSystemState,
        summaryGeneration: {
            provider,
            model,
            preset,
            analysisMode,
            selectedSections,
            mergeMode,
            generatedAt: new Date().toISOString(),
        },
    };
}

module.exports = {
    INTERVIEW_SYSTEM_KEY,
    INTERVIEW_SUMMARY_ANALYSIS_MODES,
    INTERVIEW_SERVICE_DESIGN_SECTION_ORDER,
    INTERVIEW_PROTOTYPE_TESTING_SECTION_ORDER,
    INTERVIEW_SUMMARY_SECTION_ORDER,
    INTERVIEW_PROTOTYPE_SUMMARY_SECTIONS,
    INTERVIEW_SUMMARY_PRESET_SECTIONS,
    INTERVIEW_SUMMARY_PRESET_MODES,
    INTERVIEW_SUMMARY_SECTION_PROMPT_DEFS,
    isPlainObject,
    getInterviewSystemState,
    withInterviewSystemState,
    normalizeInterviewSummarySections,
    inferInterviewSummaryAnalysisMode,
    resolveInterviewSummaryRequest,
    buildInterviewSummaryPrompt,
    mergeInterviewSummarySections,
    buildInterviewSummarySystemState,
};
