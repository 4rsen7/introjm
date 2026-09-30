const fs = require('fs');
let code = fs.readFileSync('research/src/app/App.jsx', 'utf8');

code = code.replace("import TeamPanel from '../components/TeamPanel';", "import SettingsPanel from '../components/SettingsPanel';");
code = code.replace("const [teamOpen, setTeamOpen] = useState(false);", "const [settingsOpen, setSettingsOpen] = useState(false);");
code = code.replace("import { Layers3, LogOut, ArrowUpRight, Users } from 'lucide-react';", "import { Layers3, LogOut, ArrowUpRight, Settings } from 'lucide-react';");
code = code.replace(
  "{selectedWorkspace?.role === 'owner' && <button type=\"button\" className=\"research-secondary !px-3 sm:!px-4\" aria-label={t('research.teamTitle')} title={t('research.teamTitle')} onClick={() => setTeamOpen(true)}><Users size={16} /><span className=\"hidden sm:inline\">{t('research.teamTitle')}</span></button>}",
  "{selectedWorkspace?.role === 'owner' && <button type=\"button\" className=\"research-secondary !px-3 sm:!px-4\" aria-label={t('research.settingsTitle')} title={t('research.settingsTitle')} onClick={() => setSettingsOpen(true)}><Settings size={16} /><span className=\"hidden sm:inline\">{t('research.settingsTitle')}</span></button>}"
);
code = code.replace(
  "{teamOpen && selectedWorkspace?.role === 'owner' && <TeamPanel key={selectedWorkspace.id} userId={user.id} workspace={selectedWorkspace} onClose={() => setTeamOpen(false)} />}",
  "{settingsOpen && selectedWorkspace?.role === 'owner' && <SettingsPanel key={selectedWorkspace.id} userId={user.id} workspace={selectedWorkspace} onClose={() => setSettingsOpen(false)} onWorkspaceUpdated={() => workspacesQuery.refetch()} />}"
);

fs.writeFileSync('research/src/app/App.jsx', code);
