const { spawnSync } = require('node:child_process');

const pushCommands = [
  'npm rebuild better-sqlite3',
  'node db/scripts/migrate-narrative-archive.cjs',
  'drizzle-kit push',
];

let exitCode = 0;

try {
  for (const command of pushCommands) {
    exitCode = run(command);

    if (exitCode !== 0) {
      break;
    }
  }
} finally {
  const rebuildExitCode = run('npm run rebuild');

  if (exitCode === 0) {
    exitCode = rebuildExitCode;
  }
}

process.exitCode = exitCode;

function run(command) {
  const result = spawnSync(command, {
    shell: true,
    stdio: 'inherit',
  });

  if (result.error) {
    console.error(result.error);
    return 1;
  }

  return result.status ?? 1;
}
