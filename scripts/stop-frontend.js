/**
 * Stop frontend service only
 */
const { exec } = require('child_process');

const isWindows = process.platform === 'win32';

function getPidsFromPort(port) {
  return new Promise((resolve) => {
    if (isWindows) {
      exec(`netstat -ano | findstr :${port} | findstr LISTENING`, (error, stdout) => {
        if (error || !stdout.trim()) {
          resolve([]);
          return;
        }
        const lines = stdout.trim().split('\n');
        const pids = lines.map(line => {
          const parts = line.trim().split(/\s+/);
          return parts[parts.length - 1];
        }).filter(pid => pid && pid !== '0');
        resolve([...new Set(pids)]);
      });
    } else {
      exec(`lsof -ti:${port}`, (error, stdout) => {
        if (error || !stdout.trim()) {
          resolve([]);
          return;
        }
        resolve(stdout.trim().split('\n').filter(p => p));
      });
    }
  });
}

function killProcess(pid) {
  return new Promise((resolve) => {
    if (isWindows) {
      exec(`taskkill /PID ${pid} /F`, (error) => {
        resolve(!error);
      });
    } else {
      exec(`kill -9 ${pid}`, (error) => {
        resolve(!error);
      });
    }
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForProcessToDie(port, maxWaitMs = 5000) {
  const startTime = Date.now();
  while (Date.now() - startTime < maxWaitMs) {
    const pids = await getPidsFromPort(port);
    if (pids.length === 0) {
      return true;
    }
    await sleep(500);
  }
  return false;
}

async function main() {
  const pids = await getPidsFromPort(5173);
  if (pids.length === 0) {
    console.log('\x1b[33m%s\x1b[0m', 'Frontend is not running');
    return;
  }

  console.log('\x1b[34m%s\x1b[0m', `Stopping frontend service (PID: ${pids.join(', ')})...`);

  for (const pid of pids) {
    await killProcess(pid);
  }

  const died = await waitForProcessToDie(5173, 5000);

  if (died) {
    console.log('\x1b[32m%s\x1b[0m', 'Frontend stopped');
  } else {
    const remainingPids = await getPidsFromPort(5173);
    if (remainingPids.length > 0) {
      console.log('\x1b[31m%s\x1b[0m', 'Force killing remaining processes...');
      for (const pid of remainingPids) {
        await killProcess(pid);
      }
      await sleep(1000);
    }

    const finalCheck = await getPidsFromPort(5173);
    if (finalCheck.length === 0) {
      console.log('\x1b[32m%s\x1b[0m', 'Frontend stopped');
    } else {
      console.log('\x1b[31m%s\x1b[0m', `Failed to stop frontend. PIDs still running: ${finalCheck.join(', ')}`);
    }
  }
}

main().catch(console.error);