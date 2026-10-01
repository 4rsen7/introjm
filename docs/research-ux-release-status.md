# Research: стан погодженого релізу без моків

Оновлено: 2026-10-01. **Deployed і перевірено навігацію на production.** Власник прямо погодив [план](research-ux-release-plan.md), випуск, обидві перевірки та застосування конкретної міграції до production. Міграція застосована; основний commit `2e199e98f5d73625f719ffcb74e02678936c0b1a` і завершальне уточнення `c12deaa4b28b3287f2d14d0d1ab067116432c16d` pushed у main та розгорнуті. У продуктову збірку не підключено localPreview або демонстраційні дані. Цей фінальний запис звіту збережений локально після deploy.

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
- **Фінальний deployment pass:** [run 36827524866](https://github.com/4rsen7/introjm/actions/runs/36827524866), job 110256449173 completed/success; Hostinger commit `c12deaa4` «Завершено / Поточний». Після reload нова SPA показує локалізоване повідомлення про історичне невдале формування брифу замість загальної помилки завантаження. Це спостереження уточнює первісне припущення: на перевіреному дослідженні історичний job був failed, а не stale/canceled.
- Форми нового дослідження перевірено в обох сценаріях (ручний бриф / набір записів), потім скасовано без створення даних.

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

Пакет і завершальне уточнення випущені та перевірені на новому deploy. Власнику: відкрити реальне дослідження, на вкладці «Саммарі» натиснути «Сформувати результати» для оновлення за поточним брифом. Збережені транскрипти використовуються повторно; нові AI-summary та aggregate споживатимуть provider tokens. Генерацію в production агент не запускав.

Screenshot-докази фінального релізу: `production-research-final.png`, `production-brief-final.png`, `production-hostinger-final.png` у `/private/tmp/iterojm-research-release/validation`.

## Пакет наступного випуску: простий інтерфейс, PDF та архівування

2026-10-01 власник прямо попросив «на прод давай це все», після чого окремо дозволив перевірку міграції на новій порожній тимчасовій БД `iterojm-study-archive-test`. Попереднє відкладення цієї перевірки скасоване для цього випуску.

1. **Done:** підготовлено випуск компактного прогресу інтерв’ю без дублювання статусу, спрощеної сторінки інтерв’ю, графічних маркерів чотирьох категорій summary, прямого PDF-експорту збереженого зведення та доступного архівування з картки/сторінки дослідження. PDF не викликає AI. Архівування зберігає дані; новий SQL дозволяє архівувати порожні чернетки без переписування брифу, історії або результатів.
2. **Agents/models:** Sol/medium виконав фінальну валідацію; Astra/high незалежно прийняв сукупний пакет без блокерів; головний агент звірив докази й координує погоджений випуск. Виконавець валідації до повідомлення про ліміт використання завершив перевірки та передав writer. Попередні пакети реалізації й тести перелічені в локальних звітах PDF та архівування.
3. **Files:** `research/src/components/{InterviewPipeline,SynthesisPanel,ArchiveStudyDialog}.jsx`, `research/src/hooks/useAnalysisJob.js`, `research/src/pages/{InterviewPage,StudiesPage,StudyPage}.jsx`, `research/src/locales/{en,uk}.json`, `research/src/utils/exportStudyPdf.js`, `research/src/assets/pdf/{NotoSans-Regular.ttf,NotoSans-Bold.ttf,OFL.txt}`, `research/package.json`, `package-lock.json`, `research/tests/{workflows,study-pdf,study-archive}.spec.js`, `server/migrations/20261001_research_archive_drafts.sql`, `server/tests/research-study-archive.test.js` та цей документ. Прототип, localPreview, приклад PDF, тимчасовий аналіз та інші локальні матеріали не включені в runtime або випуск. Baseline: `c12deaa4b28b3287f2d14d0d1ab067116432c16d`; frozen patch `/private/tmp/iterojm-research-final-release/baseline.patch`.
4. **Tests:** фінальний локальний набір 17/17 UI (6 архівування, 2 PDF, 9 інтерв’ю), 1/1 графічні блоки, 6/6 справжній SQL у дозволеному PGlite, 2/2 research-flow units; scoped Research build та diff check pass. Логи: `/private/tmp/iterojm-research-final-release/{ui-test,db-test,build}.log`. Product bundle не містить localPreview, тестового токена або demo fixtures. Шрифти присутні; PDF завантажується окремим chunk. jsPDF 4.2.1 у lock відповідає ^4.1.0 у Research manifest. UI використовує тестові fixtures; це не є доказом роботи на production. Попередження про великий App chunk залишається.
5. **Vault:** no-op; дозволених Markdown-шляхів немає.
6. **Remaining risks:** реальна транскрибація та причина попередніх помилок збереження/polling не змінювались цим пакетом. Помилка скасування job не мала окремого нового UI-тесту; успішне скасування й захист від скасування завершеного job перевірені. Потрібна перевірка після розгортання.
7. **Manual checks:** координатор застосовує тільки перевірену міграцію, випускає погоджений пакет у main через штатний Deploy To Hostinger та перевіряє нову SPA, архівування і PDF. Генерацію AI та архівування реальних досліджень для smoke-check не запускати.

Production-міграція виконана через SQL Editor у проекті `onlcpxkvmvimbicivjlj`: `Success. No rows returned`. SHA-256 точного файлу: `e61d2c9f80e43beab02c3de4d9072288795c41c187a9e1ba48170eac69c4ec53`. До зміни контрольна сума тіла функції `34f4feee784b7e08c2f7aa3b6ef83cd4` збіглася з локальною попередньою версією; після зміни `b8d299c79b47f6fd7c07a82f2b5b71e5` збіглася з перевіреним новим SQL. Service-role доступ збережений, authenticated/anon доступ відсутній, SECURITY DEFINER не змінено. Screenshot: `/private/tmp/iterojm-research-final-release/production-schema.png`. Код цього пакета підготовлений до push; фактичний SHA/deploy і production smoke-check фіксуються після їх завершення, без передчасної заяви про deployed.
