const { execSync } = require('child_process');
try {
  const output = execSync('git show HEAD~1:app/profile/page.tsx').toString();
  console.log(output);
} catch (e) {
  console.error(e.message);
}
