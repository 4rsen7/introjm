const { assertDatabaseResult } = require('../../access/productScope');

function createResearchStorage(db, { fetchImpl = fetch } = {}) {
    return {
        async createSignedUploadUrl(bucket, key) {
            const signed = assertDatabaseResult(await db.storage.from(bucket).createSignedUploadUrl(key, { upsert: false }));
            const endpoint = new URL(signed.signedUrl);
            endpoint.pathname = '/storage/v1/upload/resumable'; endpoint.search = '';
            return { signedUrl: signed.signedUrl, token: signed.token, endpoint: endpoint.toString(), bucket, objectName: key };
        },
        async downloadStream(bucket, key, { signal } = {}) {
            const signed = assertDatabaseResult(await db.storage.from(bucket).createSignedUrl(key, 60));
            const response = await fetchImpl(signed.signedUrl, { signal, redirect: 'error' });
            if (!response.ok || !response.body) throw Object.assign(new Error('Recording is unavailable'), { code: 'RECORDING_UNAVAILABLE' });
            return response.body;
        },
        async copy(bucket, from, to) {
            const result = await db.storage.from(bucket).copy(from, to);
            // The sealed destination is immutable. Repeated complete verifies its checksum.
            if (result.error && !(['409'].includes(String(result.error.statusCode)) || ['Duplicate', 'ResourceAlreadyExists', 'KeyAlreadyExists'].includes(result.error.code) || result.error.message === 'The resource already exists')) throw result.error;
        },
        async remove(bucket, keys) { assertDatabaseResult(await db.storage.from(bucket).remove(keys)); },
    };
}
module.exports = { createResearchStorage };
