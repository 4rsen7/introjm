// Shared display normalization, extracted without changing saved-summary behavior.
const cleanString = (value) => typeof value === 'string' ? value.trim() : '';

const normalizeStringArray = (value, maxItems) =>
  Array.isArray(value)
    ? value
        .map((item) => cleanString(item))
        .filter(Boolean)
        .slice(0, maxItems)
    : [];

const normalizeTouchpoints = (value, maxItems) =>
  Array.isArray(value)
    ? value
        .map((item) => {
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
        })
        .filter(Boolean)
        .slice(0, maxItems)
    : [];

const normalizeStagePainPoints = (value, maxItems) =>
  Array.isArray(value)
    ? value
        .map((item) => {
          if (typeof item === 'string') {
            const description = cleanString(item);
            return description ? { title: '', description, severity: '' } : null;
          }
          if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
          const title = cleanString(item.title);
          const description = cleanString(item.description || item.problem || item.painPoint);
          const severity = cleanString(item.severity);
          if (!title && !description && !severity) return null;
          return { title, description, severity };
        })
        .filter(Boolean)
        .slice(0, maxItems)
    : [];

export const normalizeInterviewSummary = (raw) => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;

  const summary = raw.summary && typeof raw.summary === 'object' && !Array.isArray(raw.summary) ? raw.summary : {};
  const journeyDraft = raw.journeyDraft && typeof raw.journeyDraft === 'object' && !Array.isArray(raw.journeyDraft) ? raw.journeyDraft : {};
  const jtbdProfile = raw.jtbdProfile && typeof raw.jtbdProfile === 'object' && !Array.isArray(raw.jtbdProfile) ? raw.jtbdProfile : {};
  const forcesOfProgress = raw.forcesOfProgress && typeof raw.forcesOfProgress === 'object' && !Array.isArray(raw.forcesOfProgress) ? raw.forcesOfProgress : {};
  const testedProductContext = raw.testedProductContext && typeof raw.testedProductContext === 'object' && !Array.isArray(raw.testedProductContext) ? raw.testedProductContext : {};
  const painPoints = Array.isArray(raw.painPoints)
    ? raw.painPoints
        .map((item) => {
          if (typeof item === 'string') {
            const description = cleanString(item);
            return description ? { title: '', description, rootCause: '', impact: '', severity: '', evidenceQuote: '' } : null;
          }
          if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
          const title = cleanString(item.title);
          const description = cleanString(item.description || item.problem || item.painPoint);
          if (!title && !description) return null;
          return {
            title,
            description,
            rootCause: cleanString(item.rootCause),
            impact: cleanString(item.impact),
            severity: cleanString(item.severity),
            evidenceQuote: cleanString(item.evidenceQuote || item.quote),
          };
        })
        .filter(Boolean)
    : [];

  const normalizePairList = (value, primaryKey, secondaryKey) =>
    Array.isArray(value)
      ? value
          .map((item) => {
            if (typeof item === 'string') {
              const primary = cleanString(item);
              return primary ? { [primaryKey]: primary, [secondaryKey]: '' } : null;
            }
            if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
            const primary = cleanString(item[primaryKey]);
            const secondary = cleanString(item[secondaryKey]);
            if (!primary && !secondary) return null;
            return { [primaryKey]: primary, [secondaryKey]: secondary };
          })
          .filter(Boolean)
      : [];

  const momentsOfFriction = Array.isArray(raw.momentsOfFriction)
    ? raw.momentsOfFriction
        .map((item) => {
          if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
          const stage = cleanString(item.stage);
          const situation = cleanString(item.situation);
          const breakdown = cleanString(item.breakdown);
          const customerReaction = cleanString(item.customerReaction);
          if (!stage && !situation && !breakdown && !customerReaction) return null;
          return { stage, situation, breakdown, customerReaction };
        })
        .filter(Boolean)
    : [];
  const strengths = Array.isArray(raw.strengths)
    ? raw.strengths
        .map((item) => {
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
        })
        .filter(Boolean)
    : [];
  const taskSuccess = Array.isArray(raw.taskSuccess)
    ? raw.taskSuccess
        .map((item) => {
          if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
          const task = cleanString(item.task);
          const outcome = cleanString(item.outcome);
          const whatHappened = cleanString(item.whatHappened || item.observation);
          const evidenceQuote = cleanString(item.evidenceQuote || item.quote);
          if (!task && !outcome && !whatHappened && !evidenceQuote) return null;
          return { task, outcome, whatHappened, evidenceQuote };
        })
        .filter(Boolean)
    : [];
  const whatWorked = Array.isArray(raw.whatWorked)
    ? raw.whatWorked
        .map((item) => {
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
        })
        .filter(Boolean)
    : [];
  const whatDidNotWork = Array.isArray(raw.whatDidNotWork)
    ? raw.whatDidNotWork
        .map((item) => {
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
        })
        .filter(Boolean)
    : [];
  const confusionsObjections = Array.isArray(raw.confusionsObjections)
    ? raw.confusionsObjections
        .map((item) => {
          if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
          const moment = cleanString(item.moment || item.stage);
          const confusionOrObjection = cleanString(item.confusionOrObjection || item.confusion || item.objection);
          const likelyCause = cleanString(item.likelyCause || item.cause);
          const evidenceQuote = cleanString(item.evidenceQuote || item.quote);
          if (!moment && !confusionOrObjection && !likelyCause && !evidenceQuote) return null;
          return { moment, confusionOrObjection, likelyCause, evidenceQuote };
        })
        .filter(Boolean)
    : [];
  const featureRequests = Array.isArray(raw.featureRequests)
    ? raw.featureRequests
        .map((item) => {
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
        })
        .filter(Boolean)
    : [];
  const actionableRecommendations = Array.isArray(raw.actionableRecommendations)
    ? raw.actionableRecommendations
        .map((item) => {
          if (typeof item === 'string') {
            const recommendation = cleanString(item);
            return recommendation ? { recommendation, rationale: '', priority: '' } : null;
          }
          if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
          const recommendation = cleanString(item.recommendation || item.action);
          const rationale = cleanString(item.rationale || item.reason);
          const priority = cleanString(item.priority);
          if (!recommendation && !rationale && !priority) return null;
          return { recommendation, rationale, priority };
        })
        .filter(Boolean)
    : [];

  const normalized = {
    summary: {
      jobToBeDone: cleanString(summary.jobToBeDone || raw.jobToBeDone),
      generalInsight: cleanString(summary.generalInsight || raw.generalInsight || raw.generalInsights),
      overallSentiment: cleanString(summary.overallSentiment || raw.overallSentiment),
    },
    journeyDraft: {
      jobContext: cleanString(journeyDraft.jobContext),
      stages: Array.isArray(journeyDraft.stages)
        ? journeyDraft.stages
            .map((item) => {
              if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
              const stage = cleanString(item.stage);
              const customerActions = normalizeStringArray(item.customerActions, 6);
              const drivers = normalizeStringArray(item.drivers, 5);
              const touchpoints = normalizeTouchpoints(item.touchpoints, 6);
              const painPoints = normalizeStagePainPoints(item.painPoints, 5);
              if (!stage && customerActions.length === 0 && drivers.length === 0 && touchpoints.length === 0 && painPoints.length === 0) return null;
              return { stage, customerActions, drivers, touchpoints, painPoints };
            })
            .filter(Boolean)
            .slice(0, 8)
        : [],
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
    painPoints,
    momentsOfFriction,
    unmetNeeds: normalizePairList(raw.unmetNeeds, 'need', 'whyItMatters'),
    workarounds: normalizePairList(raw.workarounds, 'workaround', 'whatItSignals'),
    opportunityAreas: normalizePairList(raw.opportunityAreas, 'area', 'rationale'),
    strengths,
    testedProductContext: {
      productOrPrototype: cleanString(testedProductContext.productOrPrototype || testedProductContext.product || testedProductContext.prototype),
      testedScenario: cleanString(testedProductContext.testedScenario || testedProductContext.scenario),
      researchGoal: cleanString(testedProductContext.researchGoal || testedProductContext.goal),
      targetUser: cleanString(testedProductContext.targetUser || testedProductContext.audience),
    },
    taskSuccess,
    whatWorked,
    whatDidNotWork,
    confusionsObjections,
    featureRequests,
    actionableRecommendations,
    quotes: Array.isArray(raw.quotes) ? raw.quotes.map((q) => cleanString(q)).filter(Boolean) : [],
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
};

export const sentimentBadgeClass = (sentiment) => {
  switch (sentiment) {
    case 'positive':
      return 'bg-emerald-50 text-emerald-700 border border-emerald-100';
    case 'negative':
      return 'bg-rose-50 text-rose-700 border border-rose-100';
    case 'mixed':
      return 'bg-amber-50 text-amber-700 border border-amber-100';
    default:
      return 'bg-gray-100 text-gray-600 border border-gray-200';
  }
};

export const sentimentLabel = (sentiment, t) => {
  switch (sentiment) {
    case 'positive':
      return t('interviews.sentimentPositive');
    case 'negative':
      return t('interviews.sentimentNegative');
    case 'mixed':
      return t('interviews.sentimentMixed');
    default:
      return sentiment;
  }
};

export const taskOutcomeLabel = (outcome, t) => {
  switch (outcome) {
    case 'completed':
      return t('interviews.taskOutcomeCompleted');
    case 'partial':
      return t('interviews.taskOutcomePartial');
    case 'failed':
      return t('interviews.taskOutcomeFailed');
    case 'not_observed':
      return t('interviews.taskOutcomeNotObserved');
    default:
      return outcome;
  }
};

export const priorityLabel = (priority, t) => {
  switch (priority) {
    case 'high':
      return t('interviews.priorityHigh');
    case 'medium':
      return t('interviews.priorityMedium');
    case 'low':
      return t('interviews.priorityLow');
    default:
      return priority;
  }
};
