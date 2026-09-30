const fs = require('fs');

for (const lang of ['uk', 'en']) {
    const file = `research/src/locales/${lang}.json`;
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (lang === 'uk') {
        data.settingsTitle = "Налаштування";
        data.saveChanges = "Зберегти зміни";
        data.renameWorkspace = "Перейменувати воркспейс";
        data.general = "Загальні";
        data.teamTab = "Команда";
        data.workspaceRenamed = "Воркспейс перейменовано";
    } else {
        data.settingsTitle = "Settings";
        data.saveChanges = "Save changes";
        data.renameWorkspace = "Rename workspace";
        data.general = "General";
        data.teamTab = "Team";
        data.workspaceRenamed = "Workspace renamed";
    }
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
}
