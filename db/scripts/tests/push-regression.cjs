const { spawnSync } = require('node:child_process');

let testExitCode = 0;

try {
  run('npm rebuild better-sqlite3');
  testExitCode = run('node db/scripts/tests/push-regression-worker.cjs', {
    throwOnFailure: false,
  });
} catch (error) {
  testExitCode = 1;
  console.error(error);
} finally {
  const rebuildExitCode = run('npm run rebuild', { throwOnFailure: false });

  if (testExitCode === 0) {
    testExitCode = rebuildExitCode;
  }
}

process.exitCode = testExitCode;

function run(command, { throwOnFailure = true } = {}) {
  const result = spawnSync(command, {
    shell: true,
    stdio: 'inherit',
  });
  const exitCode = result.status ?? 1;

  if (result.error && throwOnFailure) {
    throw result.error;
  }

  if (exitCode !== 0 && throwOnFailure) {
    throw new Error(`Command failed with exit code ${exitCode}: ${command}`);
  }

  return exitCode;
}
