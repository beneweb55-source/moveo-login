const { execSync } = require('child_process');
try {
  const output = execSync('git reflog').toString();
  console.log(output);
} catch (e) {
  console.error(e.message);
}
