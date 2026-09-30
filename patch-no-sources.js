const fs = require('fs');

const ukPath = 'research/src/locales/uk.json';
let uk = JSON.parse(fs.readFileSync(ukPath, 'utf8'));
uk.noSourcesBody = "Для генерації результатів потрібно щонайменше одне проаналізоване інтерв'ю. Якщо у вас вже є інтерв'ю, але ви змінювали План дослідження — перейдіть у ці інтерв'ю та оновіть їхні висновки за новими правилами.";
fs.writeFileSync(ukPath, JSON.stringify(uk, null, 2) + '\n');

const enPath = 'research/src/locales/en.json';
let en = JSON.parse(fs.readFileSync(enPath, 'utf8'));
en.noSourcesBody = "At least one analyzed interview is required. If you already have interviews but changed the Study Plan, please open those interviews and update their summaries against the new rules.";
fs.writeFileSync(enPath, JSON.stringify(en, null, 2) + '\n');

console.log('patched noSourcesBody');
