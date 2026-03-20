const cleanString = (value) => (typeof value === 'string' ? value.trim() : '');

const normalizeStringArray = (value, maxItems) =>
  Array.isArray(value)
    ? value
        .map((item) => cleanString(item))
        .filter(Boolean)
        .slice(0, maxItems)
    : [];

export const normalizePortraitData = (raw) => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;

  const forcesOfProgress = raw.forcesOfProgress && typeof raw.forcesOfProgress === 'object' && !Array.isArray(raw.forcesOfProgress)
    ? raw.forcesOfProgress
    : {};

  const normalized = {
    title: cleanString(raw.title || raw.name || raw.portraitName),
    archetype: cleanString(raw.archetype || raw.portraitType || raw.segment),
    summary: cleanString(raw.summary || raw.description || raw.narrative),
    jobToBeDone: cleanString(raw.jobToBeDone || raw.mainJob),
    progressMoment: cleanString(raw.progressMoment || raw.triggerMoment || raw.switchMoment),
    decisionStyle: cleanString(raw.decisionStyle),
    dominantForce: cleanString(raw.dominantForce),
    forcesOfProgress: {
      pushes: normalizeStringArray(forcesOfProgress.pushes, 5),
      pulls: normalizeStringArray(forcesOfProgress.pulls, 5),
      anxieties: normalizeStringArray(forcesOfProgress.anxieties, 5),
      habits: normalizeStringArray(forcesOfProgress.habits, 5),
    },
    personalityTraits: normalizeStringArray(raw.personalityTraits || raw.traits, 5),
    opportunityAngles: normalizeStringArray(raw.opportunityAngles || raw.opportunities, 5),
    evidenceQuotes: normalizeStringArray(raw.evidenceQuotes || raw.quotes, 3),
    system: raw._system && typeof raw._system === 'object' && !Array.isArray(raw._system) ? raw._system : null,
  };

  const hasContent =
    normalized.title ||
    normalized.archetype ||
    normalized.summary ||
    normalized.jobToBeDone ||
    normalized.progressMoment ||
    normalized.decisionStyle ||
    normalized.dominantForce ||
    normalized.forcesOfProgress.pushes.length > 0 ||
    normalized.forcesOfProgress.pulls.length > 0 ||
    normalized.forcesOfProgress.anxieties.length > 0 ||
    normalized.forcesOfProgress.habits.length > 0 ||
    normalized.personalityTraits.length > 0 ||
    normalized.opportunityAngles.length > 0 ||
    normalized.evidenceQuotes.length > 0;

  return hasContent ? normalized : null;
};
