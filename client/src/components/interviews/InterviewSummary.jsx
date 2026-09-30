import React from 'react';
import { useTranslation } from 'react-i18next';
import { Mic, CheckCircle2, AlertCircle } from 'lucide-react';
import { sentimentBadgeClass, sentimentLabel, taskOutcomeLabel, priorityLabel } from './summaryDisplay';

export default function InterviewSummary({ normalizedSummary }) {
  const { t } = useTranslation();
  if (!normalizedSummary) return null;
  return (
                <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">
                {/* Overview */}
                <div className="space-y-3">
                  <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider">{t('interviews.overview')}</h3>
                  <div className="bg-gradient-to-br from-indigo-50 to-purple-50 p-4 rounded-xl border border-indigo-100 space-y-3">
                    {normalizedSummary.summary.jobToBeDone && (
                      <div>
                        <div className="text-[11px] font-bold uppercase tracking-wider text-indigo-500 mb-1">{t('interviews.jobToBeDone')}</div>
                        <div className="text-sm text-indigo-900 leading-relaxed">{normalizedSummary.summary.jobToBeDone}</div>
                      </div>
                    )}
                    {normalizedSummary.summary.generalInsight && (
                      <div>
                        <div className="text-[11px] font-bold uppercase tracking-wider text-indigo-500 mb-1">{t('interviews.tldr')}</div>
                        <div className="text-sm text-indigo-900 leading-relaxed">{normalizedSummary.summary.generalInsight}</div>
                      </div>
                    )}
                    {normalizedSummary.summary.overallSentiment && (
                      <div className="pt-1">
                        <span className={`inline-flex items-center whitespace-nowrap px-2.5 py-1 rounded-full text-xs font-semibold capitalize ${sentimentBadgeClass(normalizedSummary.summary.overallSentiment)}`}>
                          {t('interviews.overallSentiment')}: {sentimentLabel(normalizedSummary.summary.overallSentiment, t)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {(normalizedSummary.testedProductContext.productOrPrototype ||
                  normalizedSummary.testedProductContext.testedScenario ||
                  normalizedSummary.testedProductContext.researchGoal ||
                  normalizedSummary.testedProductContext.targetUser) && (
                  <div className="space-y-3">
                    <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider">{t('interviews.testedProductContext')}</h3>
                    <div className="rounded-xl border border-sky-100 bg-sky-50/70 p-4 shadow-sm space-y-3">
                      {[
                        ['productOrPrototype', t('interviews.productOrPrototype')],
                        ['testedScenario', t('interviews.testedScenario')],
                        ['researchGoal', t('interviews.researchGoal')],
                        ['targetUser', t('interviews.targetUser')],
                      ].map(([key, label]) => {
                        const value = normalizedSummary.testedProductContext[key];
                        if (!value) return null;
                        return (
                          <div key={key}>
                            <div className="text-[11px] font-bold uppercase tracking-wider text-sky-600 mb-1">{label}</div>
                            <div className="text-sm text-sky-950 leading-relaxed">{value}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {normalizedSummary.taskSuccess.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider">{t('interviews.taskSuccess')}</h3>
                    <div className="space-y-3">
                      {normalizedSummary.taskSuccess.map((item, i) => (
                        <div key={`${item.task || item.whatHappened}-${i}`} className="rounded-lg border border-gray-100 bg-white p-4 shadow-sm space-y-2">
                          <div className="flex items-start justify-between gap-3">
                            <div className="text-sm font-semibold text-gray-900">{item.task || item.whatHappened}</div>
                            {item.outcome && (
                              <span className="inline-flex items-center whitespace-nowrap rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[11px] font-semibold text-gray-600">
                                {taskOutcomeLabel(item.outcome, t)}
                              </span>
                            )}
                          </div>
                          {item.task && item.whatHappened && <p className="text-sm text-gray-700 leading-relaxed">{item.whatHappened}</p>}
                          {item.evidenceQuote && (
                            <blockquote className="rounded-r-lg border-l-4 border-sky-300 bg-sky-50/70 pl-4 py-2 text-sm italic text-sky-900">
                              "{item.evidenceQuote}"
                            </blockquote>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {normalizedSummary.whatWorked.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                      <CheckCircle2 size={16} className="text-emerald-500" />
                      {t('interviews.whatWorked')}
                    </h3>
                    <div className="space-y-3">
                      {normalizedSummary.whatWorked.map((item, i) => (
                        <div key={`${item.item || item.whyItWorked}-${i}`} className="rounded-lg border border-emerald-100 bg-emerald-50/70 p-4 shadow-sm space-y-2">
                          <div className="text-sm font-semibold text-emerald-950">{item.item || item.whyItWorked}</div>
                          {item.item && item.whyItWorked && <p className="text-sm text-emerald-900 leading-relaxed">{item.whyItWorked}</p>}
                          {item.evidenceQuote && (
                            <blockquote className="rounded-r-lg border-l-4 border-emerald-300 bg-white/70 pl-4 py-2 text-sm italic text-emerald-900">
                              "{item.evidenceQuote}"
                            </blockquote>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {normalizedSummary.whatDidNotWork.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                      <AlertCircle size={16} className="text-rose-500" />
                      {t('interviews.whatDidNotWork')}
                    </h3>
                    <div className="space-y-3">
                      {normalizedSummary.whatDidNotWork.map((item, i) => (
                        <div key={`${item.item || item.problem}-${i}`} className="rounded-lg border border-rose-100 bg-rose-50/70 p-4 shadow-sm space-y-2">
                          <div className="text-sm font-semibold text-rose-950">{item.item || item.problem}</div>
                          {item.item && item.problem && <p className="text-sm text-rose-900 leading-relaxed">{item.problem}</p>}
                          {item.impact && <div className="text-xs text-rose-800"><span className="font-semibold text-rose-950">{t('interviews.customerImpact')}:</span> {item.impact}</div>}
                          {item.evidenceQuote && (
                            <blockquote className="rounded-r-lg border-l-4 border-rose-300 bg-white/70 pl-4 py-2 text-sm italic text-rose-900">
                              "{item.evidenceQuote}"
                            </blockquote>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {normalizedSummary.confusionsObjections.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider">{t('interviews.confusionsObjections')}</h3>
                    <div className="space-y-3">
                      {normalizedSummary.confusionsObjections.map((item, i) => (
                        <div key={`${item.moment || item.confusionOrObjection}-${i}`} className="rounded-lg border border-amber-100 bg-amber-50/70 p-4 shadow-sm space-y-2">
                          {item.moment && <div className="text-xs font-bold uppercase tracking-wider text-amber-600">{item.moment}</div>}
                          {item.confusionOrObjection && <div className="text-sm text-amber-950"><span className="font-semibold">{t('interviews.confusionOrObjection')}:</span> {item.confusionOrObjection}</div>}
                          {item.likelyCause && <div className="text-sm text-amber-900"><span className="font-semibold">{t('interviews.likelyCause')}:</span> {item.likelyCause}</div>}
                          {item.evidenceQuote && (
                            <blockquote className="rounded-r-lg border-l-4 border-amber-300 bg-white/70 pl-4 py-2 text-sm italic text-amber-900">
                              "{item.evidenceQuote}"
                            </blockquote>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {normalizedSummary.featureRequests.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider">{t('interviews.featureRequests')}</h3>
                    <div className="space-y-3">
                      {normalizedSummary.featureRequests.map((item, i) => (
                        <div key={`${item.request || item.underlyingNeed}-${i}`} className="bg-white border border-gray-100 shadow-sm p-4 rounded-lg space-y-2">
                          <div className="text-sm font-semibold text-gray-900">{item.request || item.underlyingNeed}</div>
                          {item.request && item.underlyingNeed && <div className="text-sm text-gray-700 leading-relaxed">{item.underlyingNeed}</div>}
                          {item.evidenceQuote && (
                            <blockquote className="text-sm italic text-gray-600 border-l-4 border-gray-300 bg-gray-50 pl-4 py-2 rounded-r-lg">
                              "{item.evidenceQuote}"
                            </blockquote>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {normalizedSummary.actionableRecommendations.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider">{t('interviews.actionableRecommendations')}</h3>
                    <div className="space-y-3">
                      {normalizedSummary.actionableRecommendations.map((item, i) => (
                        <div key={`${item.recommendation || item.rationale}-${i}`} className="bg-white border border-gray-100 shadow-sm p-4 rounded-lg space-y-2">
                          <div className="flex items-start justify-between gap-3">
                            <div className="text-sm font-semibold text-gray-900">{item.recommendation || item.rationale}</div>
                            {item.priority && (
                              <span className={`inline-flex items-center whitespace-nowrap px-2 py-0.5 rounded-full text-[11px] font-semibold capitalize ${sentimentBadgeClass(item.priority === 'high' ? 'negative' : item.priority === 'medium' ? 'mixed' : 'positive')}`}>
                                {priorityLabel(item.priority, t)}
                              </span>
                            )}
                          </div>
                          {item.recommendation && item.rationale && <div className="text-sm text-gray-700 leading-relaxed">{item.rationale}</div>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {normalizedSummary.journeyDraft.stages.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider">{t('interviews.journeyDraft')}</h3>
                    {normalizedSummary.journeyDraft.jobContext && (
                      <div className="rounded-lg border border-blue-100 bg-blue-50/70 px-4 py-3 text-sm text-blue-900 leading-relaxed">
                        <span className="font-semibold">{t('interviews.jobContext')}:</span> {normalizedSummary.journeyDraft.jobContext}
                      </div>
                    )}
                    <div className="space-y-3">
                      {normalizedSummary.journeyDraft.stages.map((stage, i) => (
                        <div key={`${stage.stage || 'stage'}-${i}`} className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm space-y-3">
                          {stage.stage && (
                            <div className="text-xs font-bold uppercase tracking-wider text-gray-400">{stage.stage}</div>
                          )}

                          {stage.customerActions.length > 0 && (
                            <div className="space-y-2">
                              <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">{t('interviews.customerActions')}</div>
                              <ul className="space-y-1">
                                {stage.customerActions.map((action, actionIndex) => (
                                  <li key={`${action}-${actionIndex}`} className="text-sm text-gray-800 leading-relaxed">• {action}</li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {stage.drivers.length > 0 && (
                            <div className="space-y-2">
                              <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">{t('interviews.stageDrivers')}</div>
                              <ul className="space-y-1">
                                {stage.drivers.map((driver, driverIndex) => (
                                  <li key={`${driver}-${driverIndex}`} className="text-sm text-gray-800 leading-relaxed">• {driver}</li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {stage.touchpoints.length > 0 && (
                            <div className="space-y-2">
                              <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">{t('interviews.touchpoints')}</div>
                              <div className="space-y-2">
                                {stage.touchpoints.map((touchpoint, touchpointIndex) => (
                                  <div key={`${touchpoint.touchpoint}-${touchpointIndex}`} className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-sm text-gray-700 space-y-1">
                                    {touchpoint.touchpoint && <div className="font-medium text-gray-900">{touchpoint.touchpoint}</div>}
                                    {(touchpoint.interactsWith || touchpoint.channel) && (
                                      <div className="text-xs text-gray-600">
                                        {touchpoint.interactsWith && <span>{t('interviews.interactsWith')}: {touchpoint.interactsWith}</span>}
                                        {touchpoint.interactsWith && touchpoint.channel && <span> • </span>}
                                        {touchpoint.channel && <span>{t('interviews.channel')}: {touchpoint.channel}</span>}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {stage.painPoints.length > 0 && (
                            <div className="space-y-2">
                              <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">{t('interviews.stagePainPoints')}</div>
                              <div className="space-y-2">
                                {stage.painPoints.map((point, pointIndex) => (
                                  <div key={`${point.title || point.description}-${pointIndex}`} className="rounded-lg border border-rose-100 bg-rose-50/60 px-3 py-2 text-sm text-rose-900 space-y-1">
                                    <div className="font-medium">{point.title || point.description}</div>
                                    {point.title && point.description && <div className="text-rose-800 leading-relaxed">{point.description}</div>}
                                    {point.severity && <div className="text-xs uppercase tracking-wider text-rose-600">{t('interviews.severity')}: {point.severity}</div>}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {(normalizedSummary.jtbdProfile.mainJob ||
                  normalizedSummary.jtbdProfile.functionalJob ||
                  normalizedSummary.jtbdProfile.emotionalJob ||
                  normalizedSummary.jtbdProfile.socialJob ||
                  normalizedSummary.jtbdProfile.jobContext ||
                  normalizedSummary.jtbdProfile.desiredOutcome ||
                  normalizedSummary.jtbdProfile.successCriteria.length > 0) && (
                  <div className="space-y-3">
                    <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider">{t('interviews.jtbdProfile')}</h3>
                    <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm space-y-3">
                      {normalizedSummary.jtbdProfile.mainJob && (
                        <div>
                          <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1">{t('interviews.mainJob')}</div>
                          <div className="text-sm text-gray-900 leading-relaxed">{normalizedSummary.jtbdProfile.mainJob}</div>
                        </div>
                      )}
                      {normalizedSummary.jtbdProfile.functionalJob && (
                        <div>
                          <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1">{t('interviews.functionalJob')}</div>
                          <div className="text-sm text-gray-900 leading-relaxed">{normalizedSummary.jtbdProfile.functionalJob}</div>
                        </div>
                      )}
                      {normalizedSummary.jtbdProfile.emotionalJob && (
                        <div>
                          <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1">{t('interviews.emotionalJob')}</div>
                          <div className="text-sm text-gray-900 leading-relaxed">{normalizedSummary.jtbdProfile.emotionalJob}</div>
                        </div>
                      )}
                      {normalizedSummary.jtbdProfile.socialJob && (
                        <div>
                          <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1">{t('interviews.socialJob')}</div>
                          <div className="text-sm text-gray-900 leading-relaxed">{normalizedSummary.jtbdProfile.socialJob}</div>
                        </div>
                      )}
                      {normalizedSummary.jtbdProfile.jobContext && (
                        <div>
                          <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1">{t('interviews.jobContext')}</div>
                          <div className="text-sm text-gray-900 leading-relaxed">{normalizedSummary.jtbdProfile.jobContext}</div>
                        </div>
                      )}
                      {normalizedSummary.jtbdProfile.desiredOutcome && (
                        <div>
                          <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1">{t('interviews.desiredOutcome')}</div>
                          <div className="text-sm text-gray-900 leading-relaxed">{normalizedSummary.jtbdProfile.desiredOutcome}</div>
                        </div>
                      )}
                      {normalizedSummary.jtbdProfile.successCriteria.length > 0 && (
                        <div>
                          <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-2">{t('interviews.successCriteria')}</div>
                          <ul className="space-y-1">
                            {normalizedSummary.jtbdProfile.successCriteria.map((criterion, criterionIndex) => (
                              <li key={`${criterion}-${criterionIndex}`} className="text-sm text-gray-900 leading-relaxed">• {criterion}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {(normalizedSummary.forcesOfProgress.pushes.length > 0 ||
                  normalizedSummary.forcesOfProgress.pulls.length > 0 ||
                  normalizedSummary.forcesOfProgress.anxieties.length > 0 ||
                  normalizedSummary.forcesOfProgress.habits.length > 0) && (
                  <div className="space-y-3">
                    <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider">{t('interviews.forcesOfProgress')}</h3>
                    <div className="grid gap-3">
                      {[
                        ['pushes', t('interviews.pushes'), 'bg-amber-50 border-amber-100 text-amber-900'],
                        ['pulls', t('interviews.pulls'), 'bg-emerald-50 border-emerald-100 text-emerald-900'],
                        ['anxieties', t('interviews.anxieties'), 'bg-rose-50 border-rose-100 text-rose-900'],
                        ['habits', t('interviews.habits'), 'bg-slate-50 border-slate-200 text-slate-900'],
                      ].map(([key, label, tone]) => {
                        const items = normalizedSummary.forcesOfProgress[key];
                        if (!items || items.length === 0) return null;
                        return (
                          <div key={key} className={`rounded-xl border p-4 shadow-sm space-y-2 ${tone}`}>
                            <div className="text-xs font-bold uppercase tracking-wider">{label}</div>
                            <ul className="space-y-1">
                              {items.map((item, itemIndex) => (
                                <li key={`${item}-${itemIndex}`} className="text-sm leading-relaxed">• {item}</li>
                              ))}
                            </ul>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {normalizedSummary.strengths.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                      <CheckCircle2 size={16} className="text-emerald-500" />
                      {t('interviews.strengths')}
                    </h3>
                    <div className="space-y-3">
                      {normalizedSummary.strengths.map((item, i) => (
                        <div key={`${item.title || item.description}-${i}`} className="rounded-lg border border-emerald-100 bg-emerald-50/70 p-4 shadow-sm space-y-2">
                          <div className="text-sm font-semibold text-emerald-950">{item.title || item.description}</div>
                          {item.title && item.description && (
                            <p className="text-sm text-emerald-900 leading-relaxed">{item.description}</p>
                          )}
                          {item.whyItWorks && (
                            <div className="text-xs text-emerald-800">
                              <span className="font-semibold text-emerald-950">{t('interviews.whyItWorks')}:</span> {item.whyItWorks}
                            </div>
                          )}
                          {item.evidenceQuote && (
                            <blockquote className="rounded-r-lg border-l-4 border-emerald-300 bg-white/70 pl-4 py-2 text-sm italic text-emerald-900">
                              "{item.evidenceQuote}"
                            </blockquote>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Pain Points */}
                {normalizedSummary.painPoints.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                      <AlertCircle size={16} className="text-rose-500" />
                      {t('interviews.painPoints')}
                    </h3>
                    <div className="space-y-3">
                      {normalizedSummary.painPoints.map((point, i) => (
                        <div key={i} className="bg-white border border-gray-100 shadow-sm p-4 rounded-lg space-y-2">
                          <div className="flex items-start justify-between gap-3">
                            <div className="text-sm font-semibold text-gray-900">{point.title || point.description}</div>
                            {point.severity && (
                              <span className={`inline-flex items-center whitespace-nowrap px-2 py-0.5 rounded-full text-[11px] font-semibold capitalize ${sentimentBadgeClass(point.severity === 'high' ? 'negative' : point.severity === 'medium' ? 'mixed' : 'positive')}`}>
                                {point.severity}
                              </span>
                            )}
                          </div>
                          {point.title && point.description && (
                            <p className="text-sm text-gray-700 leading-relaxed">{point.description}</p>
                          )}
                          {(point.rootCause || point.impact) && (
                            <div className="grid gap-2">
                              {point.rootCause && (
                                <div className="text-xs text-gray-600"><span className="font-semibold text-gray-800">{t('interviews.rootCause')}:</span> {point.rootCause}</div>
                              )}
                              {point.impact && (
                                <div className="text-xs text-gray-600"><span className="font-semibold text-gray-800">{t('interviews.customerImpact')}:</span> {point.impact}</div>
                              )}
                            </div>
                          )}
                          {point.evidenceQuote && (
                            <blockquote className="text-sm italic text-gray-600 border-l-4 border-rose-300 bg-rose-50/70 pl-4 py-2 rounded-r-lg">
                              "{point.evidenceQuote}"
                            </blockquote>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {normalizedSummary.momentsOfFriction.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider">{t('interviews.momentsOfFriction')}</h3>
                    <div className="space-y-3">
                      {normalizedSummary.momentsOfFriction.map((item, i) => (
                        <div key={i} className="bg-white border border-gray-100 shadow-sm p-4 rounded-lg space-y-2">
                          {item.stage && <div className="text-xs font-bold uppercase tracking-wider text-gray-400">{item.stage}</div>}
                          {item.situation && <div className="text-sm text-gray-800"><span className="font-semibold">{t('interviews.situation')}:</span> {item.situation}</div>}
                          {item.breakdown && <div className="text-sm text-gray-800"><span className="font-semibold">{t('interviews.breakdown')}:</span> {item.breakdown}</div>}
                          {item.customerReaction && <div className="text-sm text-gray-800"><span className="font-semibold">{t('interviews.customerReaction')}:</span> {item.customerReaction}</div>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {normalizedSummary.unmetNeeds.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider">{t('interviews.unmetNeeds')}</h3>
                    <div className="space-y-3">
                      {normalizedSummary.unmetNeeds.map((item, i) => (
                        <div key={i} className="bg-white border border-gray-100 shadow-sm p-4 rounded-lg space-y-1">
                          <div className="text-sm font-semibold text-gray-900">{item.need}</div>
                          {item.whyItMatters && <div className="text-sm text-gray-700 leading-relaxed">{item.whyItMatters}</div>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {normalizedSummary.workarounds.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider">{t('interviews.workarounds')}</h3>
                    <div className="space-y-3">
                      {normalizedSummary.workarounds.map((item, i) => (
                        <div key={i} className="bg-white border border-gray-100 shadow-sm p-4 rounded-lg space-y-1">
                          <div className="text-sm font-semibold text-gray-900">{item.workaround}</div>
                          {item.whatItSignals && <div className="text-sm text-gray-700 leading-relaxed">{item.whatItSignals}</div>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {normalizedSummary.opportunityAreas.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider">{t('interviews.opportunityAreas')}</h3>
                    <div className="space-y-3">
                      {normalizedSummary.opportunityAreas.map((item, i) => (
                        <div key={i} className="bg-white border border-gray-100 shadow-sm p-4 rounded-lg space-y-1">
                          <div className="text-sm font-semibold text-gray-900">{item.area}</div>
                          {item.rationale && <div className="text-sm text-gray-700 leading-relaxed">{item.rationale}</div>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Key Quotes */}
                {normalizedSummary.quotes.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                      <Mic size={16} className="text-emerald-500" />
                      {t('interviews.keyQuotes')}
                    </h3>
                    <div className="space-y-3">
                      {normalizedSummary.quotes.map((quote, i) => (
                        <blockquote key={i} className="text-sm italic text-gray-600 border-l-4 border-emerald-400 bg-emerald-50/50 pl-4 py-2 rounded-r-lg">
                          "{quote}"
                        </blockquote>
                      ))}
                    </div>
                  </div>
                )}
              </div>
  );
}
