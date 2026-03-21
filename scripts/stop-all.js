/**
 * Stop all services (backend and frontend)
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
        resolve([...new Set(pids)]); // Remove duplicates
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

async function stopService(port, name) {
  const pids = await getPidsFromPort(port);
  if (pids.length === 0) {
    console.log('\x1b[33m%s\x1b[0m', `${name} is not running`);
    return true;
  }

  console.log('\x1b[34m%s\x1b[0m', `Stopping ${name} service (PID: ${pids.join(', ')})...`);

  // Kill all processes on this port
  for (const pid of pids) {
    await killProcess(pid);
  }

  // Wait for process to fully terminate
  const died = await waitForProcessToDie(port, 5000);

  if (died) {
    console.log('\x1b[32m%s\x1b[0m', `${name} stopped`);
    return true;
  } else {
    // Force kill again
    const remainingPids = await getPidsFromPort(port);
    if (remainingPids.length > 0) {
      console.log('\x1b[31m%s\x1b[0m', `Force killing remaining processes...`);
      for (const pid of remainingPids) {
        await killProcess(pid);
      }
      await sleep(1000);
    }

    const finalCheck = await getPidsFromPort(port);
    if (finalCheck.length === 0) {
      console.log('\x1b[32m%s\x1b[0m', `${name} stopped`);
      return true;
    } else {
      console.log('\x1b[31m%s\x1b[0m', `Failed to stop ${name}. PIDs still running: ${finalCheck.join(', ')}`);
      return false;
    }
  }
}

async function main() {
  console.log('\n=== Stopping MonkAgents Services ===\n');

  const backendStopped = await stopService(3000, 'Backend');
  const frontendStopped = await stopService(5173, 'Frontend');

  if (backendStopped && frontendStopped) {
    console.log('\n\x1b[36m%s\x1b[0m', 'All services stopped.');
  } else {
    console.log('\n\x1b[31m%s\x1b[0m', 'Some services could not be stopped. Try running "npm run stop" again.');
    process.exit(1);
  }
}

main().catch(console.error);