// Extracted from the existing interview pipeline without changing its behavior.
function cleanModelJson(text) {
  if (!text) return '';
  const trimmed = String(text).trim();
  const withoutFence = trimmed.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
  if (withoutFence.startsWith('{') && withoutFence.endsWith('}')) return withoutFence;
  const start = withoutFence.indexOf('{');
  const end = withoutFence.lastIndexOf('}');
  if (start >= 0 && end > start) return withoutFence.slice(start, end + 1);
  return withoutFence;
}

function cleanString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeEnum(value, allowed) {
  const normalized = cleanString(value).toLowerCase();
  return allowed.includes(normalized) ? normalized : '';
}

function normalizeStringArray(value, maxItems) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => cleanString(item))
    .filter(Boolean)
    .slice(0, maxItems);
}

function normalizeObjectArray(value, mapper, maxItems) {
  if (!Array.isArray(value)) return [];
  return value
    .map(mapper)
    .filter(Boolean)
    .slice(0, maxItems);
}

function normalizeTouchpoints(value, maxItems) {
  return normalizeObjectArray(
    value,
    (item) => {
      if (typeof item === 'string') {
        const touchpoint = cleanString(item);
        return touchpoint ? { touchpoint, interactsWith: '', channel: '' } : null;
      }
      if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
      const touchpoint = cleanString(item.touchpoint);
      const interactsWith = cleanString(item.interactsWith || item.actor || item.stakeholder);
      const channel = cleanString(item.channel);
      if (!touchpoint && !interactsWith && !channel) return null;
      return { touchpoint, interactsWith, channel };
    },
    maxItems
  );
}

function normalizeStagePainPoints(value, maxItems) {
  return normalizeObjectArray(
    value,
    (item) => {
      if (typeof item === 'string') {
        const description = cleanString(item);
        return description ? { title: '', description, severity: '' } : null;
      }
      if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
      const title = cleanString(item.title);
      const description = cleanString(item.description || item.problem || item.painPoint);
      const severity = normalizeEnum(item.severity, ['low', 'medium', 'high']);
      if (!title && !description && !severity) return null;
      return { title, description, severity };
    },
    maxItems
  );
}

function normalizeInterviewSummaryData(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;

  const summary = raw.summary && typeof raw.summary === 'object' && !Array.isArray(raw.summary) ? raw.summary : {};
  const journeyDraft = raw.journeyDraft && typeof raw.journeyDraft === 'object' && !Array.isArray(raw.journeyDraft) ? raw.journeyDraft : {};
  const jtbdProfile = raw.jtbdProfile && typeof raw.jtbdProfile === 'object' && !Array.isArray(raw.jtbdProfile) ? raw.jtbdProfile : {};
  const forcesOfProgress = raw.forcesOfProgress && typeof raw.forcesOfProgress === 'object' && !Array.isArray(raw.forcesOfProgress) ? raw.forcesOfProgress : {};
  const testedProductContext = raw.testedProductContext && typeof raw.testedProductContext === 'object' && !Array.isArray(raw.testedProductContext) ? raw.testedProductContext : {};
  const normalized = {
    summary: {
      jobToBeDone: cleanString(summary.jobToBeDone || raw.jobToBeDone),
      generalInsight: cleanString(summary.generalInsight || raw.generalInsight || raw.generalInsights),
      overallSentiment: normalizeEnum(summary.overallSentiment || raw.overallSentiment, ['positive', 'mixed', 'negative']),
    },
    journeyDraft: {
      jobContext: cleanString(journeyDraft.jobContext),
      stages: normalizeObjectArray(
        journeyDraft.stages,
        (item) => {
          if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
          const stage = cleanString(item.stage);
          const customerActions = normalizeStringArray(item.customerActions, 6);
          const drivers = normalizeStringArray(item.drivers, 5);
          const touchpoints = normalizeTouchpoints(item.touchpoints, 6);
          const painPoints = normalizeStagePainPoints(item.painPoints, 5);
          if (!stage && customerActions.length === 0 && drivers.length === 0 && touchpoints.length === 0 && painPoints.length === 0) return null;
          return { stage, customerActions, drivers, touchpoints, painPoints };
        },
        8
      ),
    },
    jtbdProfile: {
      mainJob: cleanString(jtbdProfile.mainJob),
      functionalJob: cleanString(jtbdProfile.functionalJob),
      emotionalJob: cleanString(jtbdProfile.emotionalJob),
      socialJob: cleanString(jtbdProfile.socialJob),
      jobContext: cleanString(jtbdProfile.jobContext),
      desiredOutcome: cleanString(jtbdProfile.desiredOutcome),
      successCriteria: normalizeStringArray(jtbdProfile.successCriteria, 5),
    },
    forcesOfProgress: {
      pushes: normalizeStringArray(forcesOfProgress.pushes, 5),
      pulls: normalizeStringArray(forcesOfProgress.pulls, 5),
      anxieties: normalizeStringArray(forcesOfProgress.anxieties, 5),
      habits: normalizeStringArray(forcesOfProgress.habits, 5),
    },
    painPoints: normalizeObjectArray(
      raw.painPoints,
      (item) => {
        if (typeof item === 'string') {
          const description = cleanString(item);
          if (!description) return null;
          return {
            title: '',
            description,
            rootCause: '',
            impact: '',
            severity: '',
            evidenceQuote: '',
          };
        }
        if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
        const description = cleanString(item.description || item.problem || item.painPoint);
        const title = cleanString(item.title);
        if (!title && !description) return null;
        return {
          title,
          description,
          rootCause: cleanString(item.rootCause),
          impact: cleanString(item.impact),
          severity: normalizeEnum(item.severity, ['low', 'medium', 'high']),
          evidenceQuote: cleanString(item.evidenceQuote || item.quote),
        };
      },
      5
    ),
    momentsOfFriction: normalizeObjectArray(
      raw.momentsOfFriction,
      (item) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
        const stage = cleanString(item.stage);
        const situation = cleanString(item.situation);
        const breakdown = cleanString(item.breakdown);
        const customerReaction = cleanString(item.customerReaction);
        if (!stage && !situation && !breakdown && !customerReaction) return null;
        return { stage, situation, breakdown, customerReaction };
      },
      5
    ),
    unmetNeeds: normalizeObjectArray(
      raw.unmetNeeds,
      (item) => {
        if (typeof item === 'string') {
          const need = cleanString(item);
          return need ? { need, whyItMatters: '' } : null;
        }
        if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
        const need = cleanString(item.need);
        const whyItMatters = cleanString(item.whyItMatters);
        if (!need && !whyItMatters) return null;
        return { need, whyItMatters };
      },
      5
    ),
    workarounds: normalizeObjectArray(
      raw.workarounds,
      (item) => {
        if (typeof item === 'string') {
          const workaround = cleanString(item);
          return workaround ? { workaround, whatItSignals: '' } : null;
        }
        if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
        const workaround = cleanString(item.workaround);
        const whatItSignals = cleanString(item.whatItSignals);
        if (!workaround && !whatItSignals) return null;
        return { workaround, whatItSignals };
      },
      3
    ),
    opportunityAreas: normalizeObjectArray(
      raw.opportunityAreas,
      (item) => {
        if (typeof item === 'string') {
          const area = cleanString(item);
          return area ? { area, rationale: '' } : null;
        }
        if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
        const area = cleanString(item.area);
        const rationale = cleanString(item.rationale);
        if (!area && !rationale) return null;
        return { area, rationale };
      },
      5
    ),
    strengths: normalizeObjectArray(
      raw.strengths,
      (item) => {
        if (typeof item === 'string') {
          const title = cleanString(item);
          return title ? { title, description: '', whyItWorks: '', evidenceQuote: '' } : null;
        }
        if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
        const title = cleanString(item.title);
        const description = cleanString(item.description);
        const whyItWorks = cleanString(item.whyItWorks);
        const evidenceQuote = cleanString(item.evidenceQuote || item.quote);
        if (!title && !description && !whyItWorks && !evidenceQuote) return null;
        return { title, description, whyItWorks, evidenceQuote };
      },
      5
    ),
    testedProductContext: {
      productOrPrototype: cleanString(testedProductContext.productOrPrototype || testedProductContext.product || testedProductContext.prototype),
      testedScenario: cleanString(testedProductContext.testedScenario || testedProductContext.scenario),
      researchGoal: cleanString(testedProductContext.researchGoal || testedProductContext.goal),
      targetUser: cleanString(testedProductContext.targetUser || testedProductContext.audience),
    },
    taskSuccess: normalizeObjectArray(
      raw.taskSuccess,
      (item) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
        const task = cleanString(item.task);
        const outcome = normalizeEnum(item.outcome, ['completed', 'partial', 'failed', 'not_observed']);
        const whatHappened = cleanString(item.whatHappened || item.observation);
        const evidenceQuote = cleanString(item.evidenceQuote || item.quote);
        if (!task && !outcome && !whatHappened && !evidenceQuote) return null;
        return { task, outcome, whatHappened, evidenceQuote };
      },
      6
    ),
    whatWorked: normalizeObjectArray(
      raw.whatWorked,
      (item) => {
        if (typeof item === 'string') {
          const value = cleanString(item);
          return value ? { item: value, whyItWorked: '', evidenceQuote: '' } : null;
        }
        if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
        const itemName = cleanString(item.item || item.title);
        const whyItWorked = cleanString(item.whyItWorked || item.reason);
        const evidenceQuote = cleanString(item.evidenceQuote || item.quote);
        if (!itemName && !whyItWorked && !evidenceQuote) return null;
        return { item: itemName, whyItWorked, evidenceQuote };
      },
      5
    ),
    whatDidNotWork: normalizeObjectArray(
      raw.whatDidNotWork,
      (item) => {
        if (typeof item === 'string') {
          const value = cleanString(item);
          return value ? { item: value, problem: '', impact: '', evidenceQuote: '' } : null;
        }
        if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
        const itemName = cleanString(item.item || item.title);
        const problem = cleanString(item.problem || item.description);
        const impact = cleanString(item.impact);
        const evidenceQuote = cleanString(item.evidenceQuote || item.quote);
        if (!itemName && !problem && !impact && !evidenceQuote) return null;
        return { item: itemName, problem, impact, evidenceQuote };
      },
      5
    ),
    confusionsObjections: normalizeObjectArray(
      raw.confusionsObjections,
      (item) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
        const moment = cleanString(item.moment || item.stage);
        const confusionOrObjection = cleanString(item.confusionOrObjection || item.confusion || item.objection);
        const likelyCause = cleanString(item.likelyCause || item.cause);
        const evidenceQuote = cleanString(item.evidenceQuote || item.quote);
        if (!moment && !confusionOrObjection && !likelyCause && !evidenceQuote) return null;
        return { moment, confusionOrObjection, likelyCause, evidenceQuote };
      },
      5
    ),
    featureRequests: normalizeObjectArray(
      raw.featureRequests,
      (item) => {
        if (typeof item === 'string') {
          const request = cleanString(item);
          return request ? { request, underlyingNeed: '', evidenceQuote: '' } : null;
        }
        if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
        const request = cleanString(item.request || item.feature);
        const underlyingNeed = cleanString(item.underlyingNeed || item.need);
        const evidenceQuote = cleanString(item.evidenceQuote || item.quote);
        if (!request && !underlyingNeed && !evidenceQuote) return null;
        return { request, underlyingNeed, evidenceQuote };
      },
      5
    ),
    actionableRecommendations: normalizeObjectArray(
      raw.actionableRecommendations,
      (item) => {
        if (typeof item === 'string') {
          const recommendation = cleanString(item);
          return recommendation ? { recommendation, rationale: '', priority: '' } : null;
        }
        if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
        const recommendation = cleanString(item.recommendation || item.action);
        const rationale = cleanString(item.rationale || item.reason);
        const priority = normalizeEnum(item.priority, ['low', 'medium', 'high']);
        if (!recommendation && !rationale && !priority) return null;
        return { recommendation, rationale, priority };
      },
      5
    ),
    quotes: normalizeStringArray(raw.quotes, 3),
  };

  const hasContent =
    normalized.summary.jobToBeDone ||
    normalized.summary.generalInsight ||
    normalized.summary.overallSentiment ||
    normalized.journeyDraft.jobContext ||
    normalized.journeyDraft.stages.length > 0 ||
    normalized.jtbdProfile.mainJob ||
    normalized.jtbdProfile.functionalJob ||
    normalized.jtbdProfile.emotionalJob ||
    normalized.jtbdProfile.socialJob ||
    normalized.jtbdProfile.jobContext ||
    normalized.jtbdProfile.desiredOutcome ||
    normalized.jtbdProfile.successCriteria.length > 0 ||
    normalized.forcesOfProgress.pushes.length > 0 ||
    normalized.forcesOfProgress.pulls.length > 0 ||
    normalized.forcesOfProgress.anxieties.length > 0 ||
    normalized.forcesOfProgress.habits.length > 0 ||
    normalized.painPoints.length > 0 ||
    normalized.momentsOfFriction.length > 0 ||
    normalized.unmetNeeds.length > 0 ||
    normalized.workarounds.length > 0 ||
    normalized.opportunityAreas.length > 0 ||
    normalized.strengths.length > 0 ||
    normalized.testedProductContext.productOrPrototype ||
    normalized.testedProductContext.testedScenario ||
    normalized.testedProductContext.researchGoal ||
    normalized.testedProductContext.targetUser ||
    normalized.taskSuccess.length > 0 ||
    normalized.whatWorked.length > 0 ||
    normalized.whatDidNotWork.length > 0 ||
    normalized.confusionsObjections.length > 0 ||
    normalized.featureRequests.length > 0 ||
    normalized.actionableRecommendations.length > 0 ||
    normalized.quotes.length > 0;

  return hasContent ? normalized : null;
}

module.exports = {
    cleanModelJson,
    cleanString,
    normalizeEnum,
    normalizeStringArray,
    normalizeObjectArray,
    normalizeTouchpoints,
    normalizeStagePainPoints,
    normalizeInterviewSummaryData,
};
