# Interview Transcription And Summary Pipeline

This document describes the current interview AI pipeline in IteroJM as of March 2026.

It covers:
- upload transcription
- live transcription
- AI summary generation
- stored system metadata
- admin analytics
- operational requirements

## High-Level Overview

There are currently two different transcript flows:

1. Upload interview
   The uploaded media file is processed on the backend.
   The backend normalizes the file to MP3 and sends it to Gemini 2.5 Pro for transcription.

2. Live interview
   The browser uses the Web Speech API directly.
   This flow does not call Gemini or OpenAI for transcription.

Summary generation is separate from transcription and currently runs on Gemini 2.5 Pro.

## Current Providers

- Upload transcription: Gemini 2.5 Pro
- AI summary: Gemini 2.5 Pro
- Live transcript: browser SpeechRecognition / Web Speech API

OpenAI transcription helper code still exists in the server codebase, but the active upload flow no longer uses it.

## Upload Transcription Flow

### Frontend Behavior

File upload starts from the interview room upload mode.

Frontend responsibilities:
- validate allowed file types: MP3, WAV, M4A, MP4
- validate max upload size: 50 MB
- send `POST /api/interviews/:id/upload-audio`
- switch the interview into a waiting state
- poll the interview record every 4 seconds until status becomes `completed` or `failed`

If the upload fails, the frontend shows the backend error from `_system.uploadError` when available.

### Backend Algorithm

The backend route:
- authenticates the user
- verifies workspace access
- marks the interview as `processing`
- clears existing `transcript_data`
- dispatches background processing

The background processing algorithm is:

1. Accept the uploaded source file from `multer`
2. Normalize the uploaded media to MP3 using `ffmpeg-static`
3. Use mono audio, 16 kHz sample rate, 48 kbps bitrate
4. Upload the normalized MP3 to Gemini File Manager
5. Wait until Gemini file processing is complete
6. Call Gemini 2.5 Pro with a prompt that requests:
   - verbatim transcript
   - speaker turns
   - speaker role estimates
   - timestamps
   - JSON array output with `id`, `speaker`, `text`, `timestamp`
7. Parse Gemini JSON output
8. Normalize transcript entries:
   - trim empty text
   - generate missing IDs
   - default unknown speakers to `Respondent`
   - normalize timestamps to `MM:SS` or `HH:MM:SS`
   - strip milliseconds
9. Save transcript into `interviews.transcript_data`
10. Save technical metadata into `summary_data._system`
11. Mark interview as `completed`

If any step fails:
- the interview becomes `failed`
- the backend stores an error message in `_system.uploadError`
- temp files are deleted

### Why We Normalize To MP3

The current product assumption is that most uploads are MP4 recordings.

Normalizing to MP3 before transcription gives us:
- much smaller payloads than raw MP4
- lower Gemini token cost than sending video
- more stable upload-to-model behavior
- one consistent server-side preprocessing path for all uploaded media

The current normalization settings are optimized for transcription, not for media playback quality.

## Live Transcription Flow

Live transcription is not part of the backend AI pipeline.

In live mode:
- the browser creates a `SpeechRecognition` instance
- language is currently set to `uk-UA`
- final phrases are appended to local transcript state
- transcript data is persisted back to the interview record through `PUT /api/interviews/:id`

Important notes:
- this is browser-dependent
- it does not use Gemini
- it does not use OpenAI
- it is best understood as a lightweight client-side capture mode

## AI Summary Flow

Summary generation runs only after transcript data already exists.

### Frontend Behavior

The user can choose:
- a preset
- selected sections
- merge mode

The frontend sends `POST /api/interviews/:id/generate-summary` with:
- `preset`
- `selectedSections`
- `mergeMode`

### Backend Algorithm

The backend:

1. Authenticates the user
2. Verifies workspace access
3. Checks that transcript data exists
4. Resolves the requested summary configuration
5. Formats transcript lines like:
   `[timestamp] Speaker: text`
6. Builds a structured prompt with:
   - required summary sections
   - exact JSON schema
   - output limits per section
   - language matching rules
   - evidence-only constraints
   - separation between journey actions and stage-level drivers
7. Calls Gemini 2.5 Pro
8. Cleans and parses the JSON response
9. Normalizes the summary structure
10. Either:
    - merges only selected sections into existing summary
    - or replaces the full summary depending on `mergeMode`
11. Saves the result into `interviews.summary_data`
12. Stores summary-generation metadata in `summary_data._system.summaryGeneration`

### Summary Rules

The prompt instructs Gemini to:
- detect the dominant transcript language and answer in that language
- avoid inventing facts
- use only transcript evidence
- prioritize respondent statements over interviewer framing
- return only the requested top-level keys
- return JSON only

## Stored System Metadata

Technical metadata is stored inside `summary_data._system`.

This means `summary_data` contains both:
- user-facing AI summary content
- internal machine metadata

### Transcription Metadata

Upload transcription stores fields such as:
- `provider`
- `model`
- `responseFormat`
- `generatedAt`
- `fileName`
- `mimeType`
- `fileSizeBytes`
- `sourceUploadFileName`
- `sourceUploadFileSizeBytes`
- `durationSeconds` when available
- `usedFallbackSegmentation`
- `uploadStatus`
- `uploadError` on failure

### Summary Metadata

Summary generation stores:
- `summaryGeneration.provider`
- `summaryGeneration.model`
- `summaryGeneration.preset`
- `summaryGeneration.selectedSections`
- `summaryGeneration.mergeMode`
- `summaryGeneration.generatedAt`

## Interview Status Model

Interview records use these main statuses:
- `draft`
- `processing`
- `completed`
- `failed`

For upload processing:
- the backend first moves the interview into `processing`
- after successful transcript save it becomes `completed`
- on failure it becomes `failed`

There is compatibility logic around status persistence in case the DB constraint path needs a fallback representation through `_system.uploadStatus`.

## Timestamp Rules

Transcript timestamps are currently normalized to:
- `MM:SS` for recordings shorter than one hour
- `HH:MM:SS` for recordings longer than one hour

Milliseconds are intentionally removed for display consistency and cleaner transcript reading.

## Admin Analytics

The admin dashboard is wired to Supabase views and now exposes AI pipeline breakdowns.

Current dashboard coverage includes:
- total transcriptions
- OpenAI transcriptions
- Gemini transcriptions
- total AI summaries
- OpenAI summaries
- Gemini summaries
- average transcription duration
- longest transcription duration
- estimated transcription cost coverage

These values come from `public.admin_dashboard_stats`, which reads system metadata stored inside `summary_data._system`.

## Operational Requirements

### Required Runtime Configuration

For the current upload + summary pipeline to work in production:
- `GEMINI_API_KEY` must be configured

### Server Dependency

The upload normalization path depends on:
- `ffmpeg-static`

This means production installs must include updated server dependencies after deploy.

### Supabase SQL

If admin analytics fields change, this document is only descriptive.

The actual analytics definition lives in:
- `server/supabase_admin_views.sql`

That SQL must be applied in Supabase for admin dashboard metrics to match the application code.

## Current Limitations

- Live transcript and upload transcript use different engines and therefore different quality characteristics.
- Live transcript is browser-dependent.
- Upload transcript currently requests structured JSON from Gemini, which is convenient but still requires defensive parsing.
- OpenAI helper transcription code still exists in the backend, but it is not the active upload path.
- Cost tracking is currently richer for transcription than for summary generation.

## Recommended Mental Model

Think of the current system like this:

- Uploads are server-side AI processing jobs
- Live transcripts are browser-native speech capture
- Summaries are separate Gemini analysis passes on stored transcript data
- `_system` is the technical audit trail for how the interview was processed

## Practical Trace

Upload interview:

1. User uploads media
2. Frontend validates size and type
3. Backend marks interview as `processing`
4. Backend converts media to MP3
5. Backend uploads MP3 to Gemini
6. Gemini returns structured transcript JSON
7. Backend normalizes transcript
8. Backend stores transcript + `_system` metadata
9. Frontend polling observes `completed`
10. User may then generate summary
11. Gemini generates structured summary JSON
12. Backend stores summary + summary-generation metadata

Live interview:

1. User starts recording in browser
2. Browser SpeechRecognition produces transcript chunks
3. Frontend appends transcript lines locally
4. Frontend saves transcript to backend
5. User may later generate Gemini summary from that transcript
