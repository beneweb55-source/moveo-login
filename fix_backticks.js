const fs = require('fs');
const path = require('path');

const files = [
  './components/admin/Dashboard.tsx',
  './components/admin/UsersManager.tsx',
  './components/admin/RolesManager.tsx',
  './components/admin/ContentManager.tsx',
  './components/admin/ModerationManager.tsx',
  './components/admin/WatchTimeManager.tsx',
  './components/admin/OnlineUsersManager.tsx'
];

files.forEach(file => {
  const filePath = path.join(__dirname, file);
  let content = fs.readFileSync(filePath, 'utf8');
  content = content.replace(/\\`/g, '`');
  fs.writeFileSync(filePath, content);
  console.log(`Fixed ${file}`);
});
