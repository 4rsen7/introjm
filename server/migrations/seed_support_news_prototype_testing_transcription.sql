DELETE FROM public.support_news
WHERE (locale = 'uk' AND title = 'Нове: транскрибація тестувань прототипів')
   OR (locale = 'en' AND title = 'New: prototype testing transcription');

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
VALUES
(
  'uk',
  'Нове: транскрибація тестувань прототипів',
  'Фіксуйте реакції користувачів на прототипи й одразу перетворюйте розмову на product insights.',
  'IteroJM тепер краще підтримує інтерв’ю для тестування прототипів: можна завантажити запис розмови, отримати транскрипт і сформувати summary навколо продукту, сценарію, того, що спрацювало, що заплутало користувача та які рішення варто перевірити далі.',
  $html_uk$
  <p>Ми розширили interview workflow для команд, які тестують прототипи, концепти, нові фічі або зміни в продукті з реальними користувачами.</p>

  <h2>Що можна робити</h2>
  <ul>
    <li><strong>Завантажити запис тестування</strong> після user session або prototype walkthrough.</li>
    <li><strong>Отримати транскрипт</strong> розмови, щоб не втрачати деталі реакцій, питань і заперечень.</li>
    <li><strong>Згенерувати summary для prototype testing</strong> з фокусом на продукт, завдання користувача та конкретні інсайти для команди.</li>
  </ul>

  <h2>Що саме витягується з розмови</h2>
  <p>Для тестувань прототипів summary може зібрати не тільки загальні висновки, а й більш продуктову структуру:</p>
  <ul>
    <li>який продукт, прототип або сценарій тестувався;</li>
    <li>чи вдалося користувачу пройти ключове завдання;</li>
    <li>що сподобалось або виглядало зрозумілим;</li>
    <li>що не спрацювало, заплутало або викликало сумніви;</li>
    <li>які product insights, feature requests і рекомендації варто передати команді.</li>
  </ul>

  <h2>Коли це корисно</h2>
  <ul>
    <li>після перевірки нового flow у Figma або клікабельному прототипі;</li>
    <li>коли команда хоче швидко зрозуміти, чи користувачі бачать цінність у фічі;</li>
    <li>коли потрібно перетворити якісне тестування на decision-ready summary для product, design або research команди.</li>
  </ul>

  <p>Спробуйте новий сценарій у розділі інтерв’ю: завантажте запис тестування, дочекайтесь транскрипції та згенеруйте summary з пресетом для prototype testing.</p>
  $html_uk$,
  'emerald',
  'published',
  true
),
(
  'en',
  'New: prototype testing transcription',
  'Capture user reactions to prototypes and turn each session into product insights.',
  'IteroJM now better supports interviews for prototype testing: upload a session recording, get a transcript, and generate a summary focused on the tested product, user task, what worked, what confused the participant, and what the team should validate next.',
  $html_en$
  <p>We expanded the interview workflow for teams testing prototypes, concepts, new features, or product changes with real users.</p>

  <h2>What you can do</h2>
  <ul>
    <li><strong>Upload a testing session recording</strong> after a user session or prototype walkthrough.</li>
    <li><strong>Get a transcript</strong> so important reactions, questions, and objections are not lost.</li>
    <li><strong>Generate a prototype testing summary</strong> focused on the product, the user's task, and concrete insights for the team.</li>
  </ul>

  <h2>What the summary captures</h2>
  <p>For prototype testing, the summary can capture not only general takeaways, but also a product-oriented structure:</p>
  <ul>
    <li>which product, prototype, or scenario was tested;</li>
    <li>whether the participant completed the key task;</li>
    <li>what felt useful, clear, or promising;</li>
    <li>what did not work, caused confusion, or raised objections;</li>
    <li>which product insights, feature requests, and recommendations should go back to the team.</li>
  </ul>

  <h2>When this is useful</h2>
  <ul>
    <li>after validating a new flow in Figma or another clickable prototype;</li>
    <li>when the team wants to quickly understand whether users see value in a feature;</li>
    <li>when qualitative testing needs to become a decision-ready summary for product, design, or research teams.</li>
  </ul>

  <p>Try the new scenario in Interviews: upload a prototype testing recording, wait for transcription, and generate a summary with the prototype testing preset.</p>
  $html_en$,
  'emerald',
  'published',
  true
);

NOTIFY pgrst, 'reload schema';
