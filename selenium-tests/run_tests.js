import { spawn, spawnSync } from 'child_process';
import net from 'net';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const PORT = 5173;

function isPortOpen(port) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(1000);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('error', () => {
      socket.destroy();
      // If IPv4 fails, try IPv6
      const socket6 = new net.Socket();
      socket6.setTimeout(1000);
      socket6.once('connect', () => {
        socket6.destroy();
        resolve(true);
      });
      socket6.once('timeout', () => {
        socket6.destroy();
        resolve(false);
      });
      socket6.once('error', () => {
        socket6.destroy();
        resolve(false);
      });
      socket6.connect(port, '::1');
    });
    socket.connect(port, '127.0.0.1');
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForPort(port, timeoutMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await isPortOpen(port)) {
      return true;
    }
    await delay(600);
  }
  return false;
}

async function main() {
  // Pre-cleanup stray ChromeDriver processes on Windows to prevent driver init hangs
  if (process.platform === 'win32') {
    console.log('Cleaning up any existing ChromeDriver processes...');
    try {
      spawnSync('taskkill', ['/f', '/im', 'chromedriver.exe'], { stdio: 'ignore' });
    } catch (e) {}
  }

  let serverProc = null;
  let startedServer = false;

  const active = await isPortOpen(PORT);
  if (active) {
    console.log(`Port ${PORT} is active. Using already running Vite server instance.`);
  } else {
    console.log(`Starting Vite development server on port ${PORT}...`);
    // Spawn 'npm run dev'
    serverProc = spawn('npm', ['run', 'dev'], {
      cwd: projectRoot,
      shell: true,
      stdio: 'ignore' // Ignore output to prevent buffer blockage
    });
    startedServer = true;

    console.log(`Waiting for Vite server to bind to port ${PORT}...`);
    const ready = await waitForPort(PORT);
    if (!ready) {
      console.error(`Error: Server failed to start on port ${PORT} within timeout.`);
      if (process.platform === 'win32') {
        spawnSync('taskkill', ['/f', '/t', '/pid', serverProc.pid], { stdio: 'ignore' });
      } else {
        serverProc.kill();
      }
      process.exit(1);
    }
    console.log(`Server is ready on port ${PORT}!`);
  }

  // Spawn mocha tests
  console.log('\nRunning Selenium E2E test suite via Mocha...');
  const mochaProc = spawn('npx', ['mocha', 'selenium-tests/test_predictor.js'], {
    cwd: projectRoot,
    shell: true,
    stdio: 'inherit'
  });

  mochaProc.on('exit', (code) => {
    console.log(`\nMocha execution completed. Exit code: ${code}`);
    
    // Stop server if we started it
    if (startedServer && serverProc) {
      console.log('Stopping background Vite development server...');
      if (process.platform === 'win32') {
        spawnSync('taskkill', ['/f', '/t', '/pid', serverProc.pid], { stdio: 'ignore' });
      } else {
        serverProc.kill();
      }
      console.log('Server stopped.');
    }
    
    process.exit(code || 0);
  });
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
