const { ResearchError } = require('../access/productScope');
const SUMMARY_SECTIONS = ['summary', 'testedProductContext', 'taskSuccess', 'whatWorked', 'whatDidNotWork', 'confusionsObjections', 'featureRequests', 'actionableRecommendations', 'quotes'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function invalid(message) { throw new ResearchError(400, 'INVALID_INPUT', message); }
function uuid(value, name = 'id') {
    if (typeof value !== 'string' || !UUID.test(value)) invalid(`${name} must be a UUID`);
    return value;
}
function text(value, name, max = 240, optional = false) {
    if (optional && (value == null || value === '')) return null;
    if (typeof value !== 'string' || !value.trim() || value.length > max) invalid(`${name} must contain 1–${max} characters`);
    return value.trim();
}
function revision(value, name = 'revision') {
    if (!Number.isSafeInteger(value) || value < 0) invalid(`${name} is required and must be a non-negative integer`);
    return value;
}
function transcript(value) {
    if (!Array.isArray(value) || value.length > 20000) invalid('transcript_data must be an array of at most 20000 entries');
    for (const row of value) {
        if (!row || typeof row !== 'object' || Array.isArray(row) || typeof row.text !== 'string' || row.text.length > 50000) {
            invalid('Each transcript entry must contain text');
        }
        if (row.speaker != null && (typeof row.speaker !== 'string' || row.speaker.length > 200)) invalid('Invalid speaker');
        if (row.timestamp != null && (typeof row.timestamp !== 'string' || row.timestamp.length > 80)) invalid('Invalid timestamp');
    }
    if (Buffer.byteLength(JSON.stringify(value), 'utf8') > 2 * 1024 * 1024) invalid('Transcript is too large');
    return value;
}
function pageLimit(value) {
    if (value == null) return 50;
    const result = Number(value);
    if (!Number.isInteger(result) || result < 1 || result > 100) invalid('limit must be between 1 and 100');
    return result;
}

function studyPlan(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) invalid('plan must be an object');
    const strings = (list, name, max, size) => {
        if (list == null) return [];
        if (!Array.isArray(list) || list.length > max) invalid(`Invalid ${name}`);
        return list.map(item => text(item, name, size));
    };
    if (value.prototype != null && (typeof value.prototype !== 'object' || Array.isArray(value.prototype))) invalid('Invalid prototype');
    if (JSON.stringify(value).length > 60000) invalid('Study plan must be at most 60000 characters');
    if (value.summary_sections !== undefined && (!Array.isArray(value.summary_sections) || value.summary_sections.length > 9 || !value.summary_sections.includes('summary') || value.summary_sections.some(key => !SUMMARY_SECTIONS.includes(key)))) invalid('Invalid summary sections');
    const prototype = value.prototype || {};
    const optional = (v, name, max) => v == null || v === '' ? '' : text(v, name, max);
    const prototypeUrl = optional(prototype.url, 'prototype.url', 2000);
    if (prototypeUrl) {
        try { if (!['https:', 'http:'].includes(new URL(prototypeUrl).protocol)) invalid('Invalid prototype URL'); }
        catch { invalid('Invalid prototype URL'); }
    }
    if (!Array.isArray(value.tasks || []) || (value.tasks || []).length > 30) invalid('At most 30 tasks are allowed');
    const ids = new Set();
    const tasks = (value.tasks || []).map(task => {
        if (!task || typeof task !== 'object') invalid('Invalid task');
        const id = uuid(task.id, 'task.id');
        if (ids.has(id)) invalid('Task IDs must be unique');
        ids.add(id);
        return { id, title: text(task.title, 'task.title', 240), instruction: text(task.instruction, 'task.instruction', 4000), success_criteria: text(task.success_criteria, 'task.success_criteria', 2000) };
    });
    return {
        questions: strings(value.questions, 'questions', 20, 1000),
        hypotheses: strings(value.hypotheses, 'hypotheses', 20, 1000),
        prototype: { name: optional(prototype.name, 'prototype.name', 240), url: prototypeUrl, version: optional(prototype.version, 'prototype.version', 240) },
        tasks, guide: strings(value.guide, 'guide', 100, 2000),
        ...(value.summary_sections ? { summary_sections: [...new Set(value.summary_sections)] } : {}),
    };
}

module.exports = { SUMMARY_SECTIONS, invalid, uuid, text, revision, transcript, pageLimit, studyPlan };
