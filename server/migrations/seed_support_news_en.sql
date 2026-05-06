DELETE FROM public.support_news
WHERE locale = 'en'
  AND title = 'New: interview transcription, AI summaries, and portrait generation';

INSERT INTO public.support_news (
  locale,
  title,
  subtitle,
  summary,
  body_html,
  tone,
  status,
  pinned
)
VALUES (
  'en',
  'New: interview transcription, AI summaries, and portrait generation',
  'From audio recording to structured insights and persona portraits in one workflow.',
  'IteroJM can now upload interview audio, create a transcript, generate an AI summary with selected sections, and use those insights as the base for a user portrait.',
  $html_en$
  <p>We added a new workflow for teams working with interviews and customer insight.</p>

  <h2>What is new</h2>
  <ul>
    <li><strong>Interview transcription</strong> after uploading an audio file.</li>
    <li><strong>AI summaries</strong> with control over which sections should be generated.</li>
    <li><strong>Portrait generation</strong> based on transcripts and AI insights.</li>
  </ul>

  <h2>What this gives the team</h2>
  <p>Instead of a fragmented process where the transcript, summary, and persona all live separately, you now have one connected chain:</p>
  <p><strong>audio -> transcript -> AI summary -> portrait</strong></p>

  <h2>What you can get in the summary</h2>
  <p>When generating a summary, you can choose the focus. For example:</p>
  <ul>
    <li>overview and key takeaways;</li>
    <li>pain points, moments of friction, and unmet needs;</li>
    <li>strengths, or what already works well;</li>
    <li>quotes for the evidence base;</li>
    <li>JTBD / Forces of Progress / Journey Draft for deeper analysis.</li>
  </ul>

  <h2>Why this matters for portraits</h2>
  <p>A portrait can now be built from structured interview insights instead of starting from scratch. This helps make personas more vivid, evidence-based, and closer to the user's real context.</p>

  <h2>When this is especially useful</h2>
  <ul>
    <li>when the team runs interviews regularly and wants to move faster into synthesis;</li>
    <li>when evidence needs to stay close to the conclusions;</li>
    <li>when a portrait should be based on real conversations, not broad assumptions.</li>
  </ul>

  <p>Try the new interview workflow: upload audio, wait for transcription, generate an AI summary for your task, and use the result to build a portrait.</p>
  $html_en$,
  'cobalt',
  'published',
  true
);

NOTIFY pgrst, 'reload schema';
