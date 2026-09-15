const { spawn } = require('node:child_process');

function runProcess(command, args, { signal, timeout = 120000, onLine = () => {}, maxOutput = 8 * 1024 * 1024 } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error('CANCELLED'));
    const child = spawn(command, args, { shell: false, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '', stderr = '', pending = '', failure = null, killTimer;
    const terminate = reason => {
      if (failure) return;
      failure = new Error(reason);
      const kill = signalName => {
        try { process.platform === 'win32' ? child.kill(signalName) : process.kill(-child.pid, signalName); } catch { /* Process may already have exited. */ }
      };
      kill('SIGTERM');
      killTimer = setTimeout(() => kill('SIGKILL'), 1000); killTimer.unref();
    };
    const abort = () => terminate('CANCELLED');
    const timer = setTimeout(() => terminate('TIMEOUT'), timeout);
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      output += chunk;
      if (output.length > maxOutput) { terminate('OUTPUT_LIMIT'); return; }
      pending += chunk;
      const lines = pending.split(/\r?\n/); pending = lines.pop();
      for (const line of lines) { try { onLine(line); } catch (error) { terminate(error.message); break; } }
    });
    child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-12000); });
    const cleanup = () => { clearTimeout(timer); clearTimeout(killTimer); signal?.removeEventListener('abort', abort); };
    child.on('error', error => { cleanup(); reject(error); });
    child.on('close', code => {
      cleanup();
      if (failure) return reject(failure);
      if (code !== 0) return reject(new Error(stderr || `PROCESS_EXIT_${code}`));
      if (pending) { try { onLine(pending); } catch (error) { reject(error); return; } }
      resolve(output);
    });
  });
}
module.exports = { runProcess };
