/**
 * Show service status
 */
const { exec } = require('child_process');

const isWindows = process.platform === 'win32';

function getPidFromPort(port) {
  return new Promise((resolve) => {
    if (isWindows) {
      exec(`netstat -ano | findstr :${port} | findstr LISTENING`, (error, stdout) => {
        if (error || !stdout.trim()) {
          resolve(null);
          return;
        }
        const lines = stdout.trim().split('\n');
        if (lines.length > 0) {
          const parts = lines[0].trim().split(/\s+/);
          const pid = parts[parts.length - 1];
          resolve(pid);
        } else {
          resolve(null);
        }
      });
    } else {
      exec(`lsof -ti:${port}`, (error, stdout) => {
        if (error || !stdout.trim()) {
          resolve(null);
          return;
        }
        resolve(stdout.trim());
      });
    }
  });
}

async function main() {
  console.log('\n=== MonkAgents Service Status ===\n');

  // Backend status
  const backendPid = await getPidFromPort(3000);
  if (backendPid) {
    console.log('\x1b[32m%s\x1b[0m', `Backend:  Running (PID: ${backendPid}, Port: 3000)`);
    console.log('         API: http://localhost:3000');
  } else {
    console.log('\x1b[31m%s\x1b[0m', 'Backend:  Stopped');
  }

  // Frontend status
  const frontendPid = await getPidFromPort(5173);
  if (frontendPid) {
    console.log('\x1b[32m%s\x1b[0m', `Frontend: Running (PID: ${frontendPid}, Port: 5173)`);
    console.log('         Web: http://localhost:5173');
  } else {
    console.log('\x1b[31m%s\x1b[0m', 'Frontend: Stopped');
  }

  console.log('');
}

main().catch(console.error);