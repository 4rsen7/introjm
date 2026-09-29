// TUS 1.0 resumable upload. Credentials come from our scoped upload reservation.
// See Supabase's resumable uploads guide; chunks must be exactly 6 MiB except the last.
export const CHUNK_BYTES = 6 * 1024 * 1024;
const failure = () => Object.assign(new Error('Recording upload failed'), { code: 'UPLOAD_FAILED' });
export async function fileFingerprint(file) {
  const hash = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
}
export async function uploadRecording(file, session, { signal, onProgress = () => {}, onSession = () => {}, fetchImpl = fetch } = {}) {
  const signed = session.signed_upload;
  const endpoint = new URL(signed.endpoint);
  const headers = { 'Tus-Resumable': '1.0.0', 'x-signature': signed.token, 'x-upsert': 'false' };
  const request = async (url, options) => {
    const response = await fetchImpl(url, { ...options, signal, redirect: 'error', headers: { ...headers, ...options.headers } });
    if (!response.ok) throw failure();
    return response;
  };
  let url = session.uploadUrl;
  if (!url) {
    const metadata = { bucketName: signed.bucket, objectName: signed.objectName, contentType: file.type || 'application/octet-stream', cacheControl: '0' };
    const response = await request(endpoint, { method: 'POST', headers: { 'Upload-Length': String(file.size),
      'Upload-Metadata': Object.entries(metadata).map(([key, value]) => `${key} ${btoa(value)}`).join(',') } });
    url = new URL(response.headers.get('Location'), endpoint).toString();
    const location = new URL(url);
    if (location.origin !== endpoint.origin || !location.pathname.startsWith(`${endpoint.pathname}/`)) throw failure();
    onSession({ ...session, uploadUrl: url });
  } else {
    const location = new URL(url);
    if (location.origin !== endpoint.origin || !location.pathname.startsWith(`${endpoint.pathname}/`)) throw failure();
  }
  const head = await request(url, { method: 'HEAD' });
  if (head.headers.get('Upload-Offset') === null) throw failure();
  let offset = Number(head.headers.get('Upload-Offset'));
  if (!Number.isInteger(offset) || offset < 0 || offset > file.size) throw failure();
  onProgress(offset / file.size);
  while (offset < file.size) {
    const end = Math.min(offset + CHUNK_BYTES, file.size);
    const response = await request(url, { method: 'PATCH', headers: { 'Content-Type': 'application/offset+octet-stream', 'Upload-Offset': String(offset) }, body: file.slice(offset, end) });
    const next = Number(response.headers.get('Upload-Offset'));
    if (next !== end) throw failure();
    offset = next; onProgress(offset / file.size);
  }
}
