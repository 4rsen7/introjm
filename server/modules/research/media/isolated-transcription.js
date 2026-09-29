const { fork } = require('node:child_process');
const path = require('node:path');

function transcribeIsolated(file, { signal, forkImpl = fork, timeoutMs = 17 * 60000 } = {}) {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) return reject(new Error('Transcription aborted'));
        const grouped = process.platform !== 'win32';
        const child = forkImpl(path.join(__dirname, 'transcription-child.js'), [], { detached: grouped, stdio: ['ignore', 'ignore', 'ignore', 'ipc'], execArgv: ['--max-old-space-size=384'] });
        let done = false;
        const kill = () => { try { if (grouped && child.pid) process.kill(-child.pid, 'SIGKILL'); else child.kill('SIGKILL'); } catch (_) { /* already exited */ } };
        const finish = (error, result) => {
            if (done) return;
            done = true; clearTimeout(timeout); signal?.removeEventListener('abort', abort); kill();
            if (error) reject(error); else resolve(result);
        };
        const abort = () => finish(new Error('Transcription aborted'));
        const timeout = setTimeout(() => finish(new Error('Transcription timed out')), timeoutMs);
        signal?.addEventListener('abort', abort, { once: true });
        child.once('message', result => result.error ? finish(new Error('Transcription failed')) : finish(null, result));
        child.once('error', () => finish(new Error('Transcription process failed')));
        child.once('exit', () => finish(new Error('Transcription process exited')));
        child.send(file);
    });
}
module.exports = { transcribeIsolated };
