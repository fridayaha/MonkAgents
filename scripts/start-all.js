/**
 * Start all services (backend and frontend)
 */
const { spawn, exec } = require('child_process');
const path = require('path');

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

async function startBackend() {
  const pid = await getPidFromPort(3000);
  if (pid) {
    console.log('\x1b[33m%s\x1b[0m', `Backend is already running (PID: ${pid})`);
    return;
  }

  console.log('\x1b[34m%s\x1b[0m', 'Starting backend service...');

  const backend = spawn('npm', ['run', 'start:dev', '-w', '@monkagents/backend'], {
    cwd: process.cwd(),
    shell: true,
    stdio: 'ignore',
    detached: true
  });

  backend.unref();

  // Wait for service to start
  await new Promise(resolve => setTimeout(resolve, 4000));

  const newPid = await getPidFromPort(3000);
  if (newPid) {
    console.log('\x1b[32m%s\x1b[0m', `Backend started successfully (PID: ${newPid}, Port: 3000)`);
  } else {
    console.log('\x1b[31m%s\x1b[0m', 'Failed to start backend');
  }
}

async function startFrontend() {
  const pid = await getPidFromPort(5173);
  if (pid) {
    console.log('\x1b[33m%s\x1b[0m', `Frontend is already running (PID: ${pid})`);
    return;
  }

  console.log('\x1b[34m%s\x1b[0m', 'Starting frontend service...');

  const frontend = spawn('npm', ['run', 'dev'], {
    cwd: path.join(process.cwd(), 'packages', 'frontend'),
    shell: true,
    stdio: 'ignore',
    detached: true
  });

  frontend.unref();

  // Wait for service to start
  await new Promise(resolve => setTimeout(resolve, 3000));

  const newPid = await getPidFromPort(5173);
  if (newPid) {
    console.log('\x1b[32m%s\x1b[0m', `Frontend started successfully (PID: ${newPid}, Port: 5173)`);
  } else {
    console.log('\x1b[31m%s\x1b[0m', 'Failed to start frontend');
  }
}

async function main() {
  console.log('\n=== Starting MonkAgents Services ===\n');

  await startBackend();
  await startFrontend();

  console.log('\n\x1b[36m%s\x1b[0m', 'Services started. Access the app at http://localhost:5173');
}

main().catch(console.error);