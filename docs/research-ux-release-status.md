# Research: стан погодженого релізу без моків

Оновлено: 2026-10-01. **Основний пакет deployed; завершальне уточнення повідомлення готове до випуску.** Власник прямо погодив [план](research-ux-release-plan.md), випуск, обидві перевірки та застосування конкретної міграції до production. Міграція застосована; commit `2e199e98f5d73625f719ffcb74e02678936c0b1a` pushed у main та розгорнутий. У продуктову збірку не підключено localPreview або демонстраційні дані.

## 1. Done

Реалізовано три основні вкладки Summary / Інтерв’ю / Бриф, повернення зліва та додавання справа. Summary інтерв’ю відкривається першим, транскрипт доступний додатково. Старт можливий із ручного брифу або набору записів. Сервер готує пропозицію брифу з усіх придатних матеріалів, а власник підтверджує її.

Спільний результат містить чотири категорії та реальні джерела; цитати звіряються з незмінною версією транскрипту. Автоматичне зведення чекає завершення завантаженого набору й потрібних summary. Зміна брифу залишає попередній результат доступним до ручного оновлення. Поточні сумісні транскрипти, summary та jobs повторно використовуються. Помилки не приховують попереднє зведення. Архівація, дублювання, експорт і старі дані порівняння збережені в додатковому доступі.

## 2. Agents/models

Головний агент координував реалізацію, інтеграцію та перевірки. `/root/research_map`: code_mapper, gpt-6-luna / low, читання. `/root/release_frontend` і `/root/release_backend`: implementer, gpt-6-sol / medium, послідовні пакети з одним writer. Backend-агент також окремо переглянув SQL, написаний головним агентом, без редагування; три знайдені помилки життєвого циклу виправлено й повторно переглянуто. Він адаптував три UI-тестові файли окремим послідовним пакетом.

Окремий reviewer не запущений через ліміт runtime; невдалий запуск не зараховується як review. `/root/research_validation` не завершив перевірку через ліміт використання. Незалежний перегляд SQL не доводить виконання міграції або повну production-готовність.

2026-10-01 backend-агент окремо переглянув новий тест збереження попередніх даних і фактичний log 11/11: accept, конкретних блокерів у тесті не знайшов. Обмеження: не порівняно повний рядок старого summary job або кожен рядок історії транскрипту; production-дані не використовувались.

## 3. Files і збереження попередніх змін

Baseline: `fb272c81778acabceeb81121e5a54e07d1d5e763`. Попередній diff і контрольні суми збережені в `/private/tmp/iterojm-research-release/baseline`. Попередні зміни не скасовано. `package-lock.json` та vault не змінювалися; generated файли `server/public/*` не редагувалися вручну.

Файли поточного пакета:

- `docs/research-ux-release-plan.md`, `docs/research-ux-release-status.md`.
- `research/src/pages/StudiesPage.jsx`, `StudyPage.jsx`, `InterviewPage.jsx`.
- `research/src/components/StudyStart.jsx`, `BulkInterviewUpload.jsx`, `SharedBriefPanel.jsx`, `SynthesisPanel.jsx`, `PreparationPanel.jsx`.
- `research/src/hooks/useResearch.js`, `research/src/utils/researchFlow.js`, `research/src/locales/en.json`, `uk.json`.
- `research/tests/research-flow.test.mjs`, `navigation.spec.js`, `ui.spec.js`, `workflows.spec.js`.
- `server/index.js` (зарезервований міст завантаження/summary).
- `server/modules/research/router.js`, `intelligence.js`, `synthesis.js`, `jobs/router.js`, `jobs/worker.js`.
- `server/workers/research.js`.
- `server/migrations/20260930_research_shared_brief_flow.sql`.
- `server/tests/research-core.test.js`, `research-shared-brief.test.js`, `research-synthesis-evidence.test.js`, `research-shared-brief-flow.test.js`.

Попередні зміни додатково включали `AnalysisAction.jsx`, `ImpactPanel.jsx`, `ResultsPanel.jsx`, `StudyPlanPanel.jsx`, `useAnalysisJob.js`, `InterviewPipeline.jsx`, `ParticipantPanel.jsx`, `research/vite.config.js`, продуктовий бриф, UX-специфікацію, статичний прототип і `research/dev/localPreview.js`. Частина файлів вище вже була змінена до цього пакета; frozen baseline відділяє їхню історію. Прототип і localPreview лишаються локальними матеріалами, не джерелом продуктового runtime. Поточна Vite-конфігурація використовує справжній API proxy.

## 4. Tests і межі доказів

- **Deployment pass:** GitHub run [36826451151](https://github.com/4rsen7/introjm/actions/runs/36826451151), attempt 2, completed/success для commit `2e199e9`: збірки client/admin/research, передавання архівів та SSH deploy успішні. Перша спроба мала SSH connect timeout; повторна усунула тимчасовий збій. Hostinger показує цей commit як «Завершено / Поточний».
- **Автентифікована production UI-перевірка:** реальне дослідження з п’ятьма інтерв’ю відкривається; три вкладки та навігація зліва/дія справа присутні. Існуюче інтерв’ю відкриває summary першим, повернення веде до `#interviews`. Бриф і старі summary читаються; діалог додавання відкрито й закрито без запису. AI-генерація не запускалась.
- **Завершальне уточнення:** застаріла/скасована історична пропозиція брифу більше не показує помилку завантаження чинного брифу. Реальна невдала генерація має власне локалізоване повідомлення. Окремий read-only review backend-агента: accept. Scoped Research build та diff check pass.

- **17/17 pass:** `node --test server/tests/research-shared-brief.test.js server/tests/research-synthesis-evidence.test.js server/tests/research-worker.test.js server/tests/product-scope.test.js research/tests/research-flow.test.mjs`.
- **15/15 pass:** `node --test server/tests/research-core.test.js` — локальний Express із тестовими fixtures; production база й реальний AI не використовувались.
- **11/11 pass:** `node --test server/tests/research-shared-brief-flow.test.js` — дозволена порожня БД у пам’яті `iterojm-research-shared-brief-test`, закрита після тестів. Перевірено повний ланцюг міграцій, новий флоу, помилки та збереження існуючого дослідження, транскрипту, summary і aggregate без зміни старих полів або створення зайвих версій.
- **Build pass:** `npm run build --workspace=research -- --outDir /private/tmp/iterojm-research-release/validation/research-build --emptyOutDir`. Є попередження про великий bundle; помилки збірки відсутні.
- Синтаксис змінених серверних файлів і трьох UI-тестів, `git diff --check`: pass. Перевірка продуктового bundle не знайшла localPreview, тестового токена або відомих демонстраційних джерел.
- **Production schema review:** через SQL Editor виконано лише SELECT по каталогах колонок, функцій і тригерів. Попередня структура Research та 56 функцій присутні; сигнатури й видимі контрольні суми відповідають локальному ланцюгу до нової міграції. Нові поля стану брифу та нові RPC ще відсутні. Продуктові записи й тексти інтерв’ю не читалися.
- **Production migration pass:** точний погоджений файл виконано через Supabase SQL Editor; результат `Success. No rows returned`. Наступний SELECT підтвердив 10 нових колонок, 6 основних нових RPC, доступ service_role та відсутність доступу authenticated/anon до coordinator. Screenshot-докази: `production-migration-success.png`, `production-schema-confirmed.png` у validation каталозі.
- **Не виконано:** seed, Playwright UI-набір, наскрізний флоу із записом/AI-генерацією та справжні provider calls.
- Локальна справжня Research SPA на `http://127.0.0.1:5177/` показала сторінку входу. Backend на 5005 не запущений: це не є доказом роботи автентифікованого продукту.

Логи: `/private/tmp/iterojm-research-release/validation/{units,api,build,migration}.log`. Очікувані контрольні суми попередньої схеми: `expected-schema-functions.json` у тому ж каталозі. Fixtures перевіряють контракти, але не встановлюють production readiness.

## 5. Vault

No-op: дозволених Markdown-шляхів для оновлення не отримано; vault не змінювався.

## 6. Remaining risks

SQL додає стан брифу та координацію черги. Локальний SQL-тест, читання чинної схеми, погоджене застосування міграції й розгортання backend/SPA завершені. Історичні summary та бриф читаються на production. Реальна генерація нової пропозиції, автоматичне зведення нового набору й provider calls ще не перевірені на production. Тестові fixtures не замінюють цю перевірку. Наявні старі summary позначені як застарілі після попередньої зміни контексту; актуального aggregate у перевіреному дослідженні немає.

Попередня автоматична відмова в читанні Supabase вирішена явною згодою власника. SELECT успішно показав результат. Під час спроби зберегти CSV браузерний канал перервався; дві спроби відновити його не вдалися, screenshot/CSV не зараховуються як збережені докази. Приватні дані альтернативним шляхом не отримувалися.

## 7. Manual checks / наступні кроки

Власник дозволив обидві перевірки та відповів «погоджую» на застосування `server/migrations/20260930_research_shared_brief_flow.sql` до **production `onlcpxkvmvimbicivjlj`**. Міграція застосована. Перевірений SHA-256 міграції: `aec20e88b80d7d885c49abb3a25ec0adacb98f8a44097219a14e4b006f18c678`.

Основний пакет випущений і перевірений на новому deploy. Далі завершити випуск уточнення повідомлення, підтвердити його на production й запропонувати власнику перевірити нову генерацію загального summary на збережених транскриптах. Повторна транскрибація для такого оновлення не потрібна; новий AI-summary та aggregate споживатимуть provider tokens.
