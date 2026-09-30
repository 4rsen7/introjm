const fs = require('fs');

const ukPath = 'research/src/locales/uk.json';
let uk = JSON.parse(fs.readFileSync(ukPath, 'utf8'));
uk.planHint = "План дослідження — це «мірило», за яким AI буде аналізувати та порівнювати всі ваші інтерв'ю. Ви можете згенерувати його автоматично на основі вашого першого завантаженого інтерв'ю та брифу.";
fs.writeFileSync(ukPath, JSON.stringify(uk, null, 2) + '\n');

const enPath = 'research/src/locales/en.json';
let en = JSON.parse(fs.readFileSync(enPath, 'utf8'));
en.planHint = "The Study Plan is the baseline against which AI will evaluate and compare all your interviews. You can generate it automatically based on your first uploaded interview and brief.";
fs.writeFileSync(enPath, JSON.stringify(en, null, 2) + '\n');

console.log('patched planHint');
