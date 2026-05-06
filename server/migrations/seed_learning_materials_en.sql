INSERT INTO public.learning_materials (
  slug,
  locale,
  title,
  subtitle,
  excerpt,
  category,
  author_name,
  reading_time_minutes,
  hero_tone,
  body_html,
  status,
  featured,
  sort_order,
  published_at
)
VALUES
(
  'journey-map-persona-metrics-workflow',
  'en',
  'How to build a journey map with personas and metrics',
  'A practical workflow that connects customer journey, persona context, and KPIs into one working system.',
  'A step-by-step guide to starting from real customer context rather than a polished diagram: build a journey map, connect it to a persona, and attach metrics that can actually show change.',
  'Journey Mapping',
  'IteroJM Team',
  9,
  'cobalt',
  $journey_en$
  <h2>Why journey maps should not live separately from personas and metrics</h2>
  <p>The most common mistake in journey mapping is creating a polished map that sits apart from real users and apart from data. In that case the team gets an artifact, but not a decision-making system.</p>
  <p>When a journey is connected to a persona and metrics, it starts working as an operational product layer: it helps the team see <strong>who</strong> the problem affects, <strong>where</strong> it happens, and <strong>how</strong> it can be measured.</p>

  <h2>When to start with a journey</h2>
  <p>Start with a journey when you need to break the user experience into stages: from first contact to regular use, support, or churn. This is especially useful when the problem is spread across several teams or channels.</p>

  <h2>Step 1. Define one specific persona</h2>
  <p>Do not try to cover every user at once. For the first map, choose one focused persona: for example, a doctor creating research templates, or a researcher running interviews and collecting evidence.</p>
  <ul>
    <li>Capture the context: who this person is, where they work, and what is critical for them.</li>
    <li>Describe the outcome they are trying to achieve.</li>
    <li>Add their main motivations, pains, and constraints to the persona.</li>
  </ul>

  <h2>Step 2. Build the journey around the job, not the interface</h2>
  <p>A strong journey map starts not from screens, but from the work the person is trying to get done. Phrases like “open the dashboard” or “click the button” are usually too narrow.</p>
  <p>Look for job-level wording instead: <em>prepare a set of standard research templates for faster patient work</em> or <em>run an interview in a way that produces usable insights afterwards</em>.</p>

  <h2>Step 3. Add evidence to every stage</h2>
  <p>A map becomes convincing only when it is grounded in data. For every stage, add:</p>
  <ul>
    <li>typical user actions;</li>
    <li>touchpoints or interaction channels;</li>
    <li>pain points and friction moments;</li>
    <li>strengths in the experience that already work well;</li>
    <li>quotes or interview evidence that support the observation.</li>
  </ul>

  <h2>Step 4. Connect the persona to the map</h2>
  <p>At this point the journey stops being an “average process” and becomes a map of one real person's experience. The team should see not only the stages, but also the user portrait that makes those stages meaningful.</p>
  <p>If you have several personas, avoid mixing them into one map unless there is a clear reason. It is usually better to create separate journey maps or at least separate variants of key stages.</p>

  <h2>Step 5. Add metrics at the stage level</h2>
  <p>The most useful scenario is when every important stage has its own metric or at least a proxy signal. For example:</p>
  <ul>
    <li>time to first action;</li>
    <li>completion rate for the key scenario;</li>
    <li>number of errors or drop-offs at a specific stage;</li>
    <li>frequency of repeat feature use;</li>
    <li>percentage of users who move to the next step.</li>
  </ul>

  <h2>How this works in IteroJM</h2>
  <p>In a good workflow, the map does not exist on its own. You:</p>
  <ol>
    <li>create a journey map for one persona;</li>
    <li>capture stages, touchpoints, and friction;</li>
    <li>attach the persona as interpretation context;</li>
    <li>add metrics so the team sees signal, not only narrative;</li>
    <li>use the map as the place where research and performance data connect.</li>
  </ol>

  <h2>What to check before sharing the map with the team</h2>
  <ul>
    <li>Is there one clear persona at the center of the map?</li>
    <li>Are the stages framed as parts of the job, not only screens?</li>
    <li>Are pain points backed by interview evidence?</li>
    <li>Are there metrics that can show whether improvements worked?</li>
    <li>Does the map show what already works well, not only where things break?</li>
  </ul>

  <h2>Summary</h2>
  <p>The strongest journey map is not just a polished diagram. It is a layer that helps the team see the user, their context, the stages of the experience, and the signals from data at the same time. That is why the combination of <strong>journey + persona + metrics</strong> creates the most practical value.</p>
  $journey_en$,
  'published',
  true,
  10,
  timezone('utc'::text, now()) - interval '2 days'
),
(
  'from-transcription-to-portrait',
  'en',
  'From transcription to portrait: how to build a persona from interviews',
  'How to turn a raw transcript, AI insights, and quotes into a portrait the team can actually use.',
  'A guide to the post-interview workflow: how to move from transcription to a user portrait without losing evidence or turning the persona into an abstract template.',
  'Interview Analysis',
  'IteroJM Team',
  8,
  'emerald',
  $portrait_en$
  <h2>Why a transcript alone is not enough</h2>
  <p>A transcript is raw material. It is useful as an archive and a source of quotes, but by itself it does not answer the team's questions: who is this user, what moves them, what context are they in, what pains repeat, and how does this affect the product?</p>
  <p>That is why a strong workflow does not end with “we transcribed the audio.” It continues into interpretation: insight extraction, synthesis, and persona portrait.</p>

  <h2>What transcription gives you</h2>
  <ul>
    <li>the full sequence of the conversation without losing detail;</li>
    <li>the ability to return to exact quotes;</li>
    <li>a base for AI summaries, JTBD, pain points, and strengths;</li>
    <li>an evidence layer for building the persona.</li>
  </ul>

  <h2>What not to do right after transcription</h2>
  <p>Do not copy isolated phrases into the persona without synthesis. That creates chaotic descriptions that may sound believable but do not give the team a coherent view of the person.</p>

  <h2>Recommended workflow</h2>
  <ol>
    <li>Upload the recording and wait for transcription.</li>
    <li>Generate AI insights: overview, pain points, unmet needs, strengths, and quotes.</li>
    <li>Check that there are no critical distortions in the speaker roles or statements.</li>
    <li>Identify repeating patterns: motivations, fears, success criteria, and workarounds.</li>
    <li>Create a portrait where every key block is grounded in evidence.</li>
  </ol>

  <h2>Which portrait blocks should be filled from evidence</h2>
  <p>To make a persona vivid and useful, build it around work context rather than demographics:</p>
  <ul>
    <li><strong>context:</strong> where the person works and under which constraints;</li>
    <li><strong>jobs:</strong> what they are trying to get done;</li>
    <li><strong>pains:</strong> what slows them down or frustrates them;</li>
    <li><strong>motivations:</strong> why this matters to them;</li>
    <li><strong>success:</strong> how they know the experience worked.</li>
  </ul>

  <h2>How AI insights help build the portrait</h2>
  <p>After transcription, an AI summary gives you the first layer of structure. For example:</p>
  <ul>
    <li>pain points help form frustrations;</li>
    <li>strengths show what already works for the user and should not be broken;</li>
    <li>quotes add a living voice;</li>
    <li>JTBD and forces of progress help define the core motivation.</li>
  </ul>

  <h2>How to avoid making the portrait sterile</h2>
  <p>The weakest personas sound correct but do not feel real. To avoid that:</p>
  <ul>
    <li>include concrete statements or paraphrased evidence-based observations;</li>
    <li>do not remove contradictions if they are real;</li>
    <li>capture not only problems, but also habits and positive working solutions;</li>
    <li>make sure the portrait can be traced back to specific interviews.</li>
  </ul>

  <h2>When the portrait is good enough</h2>
  <p>A persona is ready not when it looks beautiful, but when the team can use it to make decisions. A good test is whether it can explain why a certain friction matters and what change should be tested next.</p>

  <h2>Summary</h2>
  <p>Transcription is the beginning of the evidence chain. The highest value appears when the transcript becomes insights, and insights become a portrait that helps the product team work with real user context rather than an abstract “audience.”</p>
  $portrait_en$,
  'published',
  true,
  20,
  timezone('utc'::text, now()) - interval '1 day'
),
(
  'interview-insights-to-system',
  'en',
  'How to connect interviews, insights, portraits, and journeys into one system',
  'A guide to preserving research value and turning separate artifacts into shared working context.',
  'This material shows how to connect transcripts, AI insights, portrait generation, and journey maps so the team does not lose context between stages of work.',
  'Research Workflow',
  'IteroJM Team',
  7,
  'amber',
  $system_en$
  <h2>The problem is not a lack of research, but a gap between artifacts</h2>
  <p>In many teams, interviews happen regularly, but knowledge breaks into pieces afterwards: the transcript lives in one place, the summary in another, personas are separate, journey maps are separate, and metrics live in a dashboard outside the research context.</p>

  <h2>What “a system” means instead of a set of documents</h2>
  <p>A system is when every artifact strengthens the others:</p>
  <ul>
    <li>interviews provide evidence;</li>
    <li>AI insights structure that evidence;</li>
    <li>a portrait captures a stable view of the user;</li>
    <li>a journey map shows where the problem unfolds over time;</li>
    <li>metrics help measure whether improvements actually worked.</li>
  </ul>

  <h2>Recommended sequence</h2>
  <ol>
    <li>Run the interview and save the transcript.</li>
    <li>Generate insights for the key sections: overview, friction, needs, strengths, and quotes.</li>
    <li>Create a portrait from repeating patterns.</li>
    <li>Connect the portrait to the journey map where those pains and strengths appear.</li>
    <li>Add metrics to check the effect of changes after prioritization.</li>
  </ol>

  <h2>How to know the system is working</h2>
  <ul>
    <li>The team can move from a quote to a specific pain point without losing context.</li>
    <li>The persona is not detached from real interviews.</li>
    <li>The journey map is not just an illustration; it is grounded in insights.</li>
    <li>Metrics are connected to critical stages of the experience instead of sitting nearby.</li>
  </ul>

  <h2>A practical quality criterion</h2>
  <p>If any stakeholder on the team can answer three questions — <strong>what hurts</strong>, <strong>who it hurts for</strong>, and <strong>how we will measure improvement</strong> — your research flow is already working as a system.</p>

  <h2>Summary</h2>
  <p>The biggest value does not appear when you create one more transcript or one more persona. It appears when you connect them into a shared working logic. That is what lets product and CX teams not just store research, but act on it.</p>
  $system_en$,
  'published',
  false,
  30,
  timezone('utc'::text, now()) - interval '12 hours'
)
ON CONFLICT (slug, locale) DO UPDATE
SET
  title = EXCLUDED.title,
  subtitle = EXCLUDED.subtitle,
  excerpt = EXCLUDED.excerpt,
  category = EXCLUDED.category,
  author_name = EXCLUDED.author_name,
  reading_time_minutes = EXCLUDED.reading_time_minutes,
  hero_tone = EXCLUDED.hero_tone,
  body_html = EXCLUDED.body_html,
  status = EXCLUDED.status,
  featured = EXCLUDED.featured,
  sort_order = EXCLUDED.sort_order,
  published_at = EXCLUDED.published_at,
  updated_at = timezone('utc'::text, now());

NOTIFY pgrst, 'reload schema';
