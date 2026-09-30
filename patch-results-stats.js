const fs = require('fs');
const path = 'research/src/components/ResultsPanel.jsx';
let content = fs.readFileSync(path, 'utf8');

const oldMap = `[['sessions', 'sessionsLabel'], ['linked_participants', 'participantsLabel'], ['unlinked_sessions', 'unlinkedLabel'], ['current_summaries', 'currentSummariesLabel']]`;
const newMap = `[['sessions', 'sessionsLabel'], ['current_summaries', 'currentSummariesLabel'], ...(data.coverage.linked_participants > 0 ? [['linked_participants', 'participantsLabel'], ['unlinked_sessions', 'unlinkedLabel']] : [])]`;

content = content.replace(oldMap, newMap);

fs.writeFileSync(path, content);
console.log('patched results stats');
