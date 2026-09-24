const { ResearchError } = require('../access/productScope');
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

module.exports = { invalid, uuid, text, revision, transcript, pageLimit };
