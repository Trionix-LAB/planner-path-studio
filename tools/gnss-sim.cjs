#!/usr/bin/env node
const path = require('path');
const { createGnssSimulator } = require('../electron/gnss-simulator.cjs');

const parseArgs = (argv) => {
  const result = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      result[key] = true;
      continue;
    }
    result[key] = next;
    i += 1;
  }
  return result;
};

const parseHostPort = (value) => {
  if (typeof value !== 'string') return null;
  const [hostRaw, portRaw] = value.split(':');
  const host = (hostRaw || '').trim();
  const port = Number(portRaw);
  if (!host || !Number.isInteger(port) || port < 1 || port > 65535) return null;
  return { host, port };
};

const toBoolean = (value) => {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return false;
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  const target = parseHostPort(args.to);
  const replayPath = typeof args.replay === 'string' ? path.resolve(args.replay) : null;

  const simulator = createGnssSimulator();
  if (replayPath) {
    await simulator.loadScenario(replayPath);
  }

  const modeRaw = typeof args.mode === 'string' ? args.mode : replayPath ? 'playback' : 'stream';
  const messageModeRaw = typeof args['message-mode'] === 'string' ? args['message-mode'] : 'mix';
  const started = await simulator.start({
    mode: modeRaw,
    messageMode: messageModeRaw,
    targetHost: target?.host ?? '127.0.0.1',
    dataPort: target?.port ?? args['data-port'],
    rateHz: args.rate,
    onlyValid: toBoolean(args['only-valid']),
    onlyBroken: toBoolean(args['only-broken']),
  });

  console.log('[gnss-sim] started', started);
  if (started && typeof started === 'object' && started.status === 'stopped') {
    process.exit(0);
  }

  const printStatus = async () => {
    const status = await simulator.getStatus();
    console.log('[gnss-sim] status', status);
  };

  const statusTimer = setInterval(() => {
    void printStatus();
  }, 3000);

  const shutdown = async (signal) => {
    clearInterval(statusTimer);
    try {
      await simulator.stop();
    } finally {
      console.log(`[gnss-sim] stopped by ${signal}`);
      process.exit(0);
    }
  };

  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });
  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
};

void main().catch((error) => {
  console.error('[gnss-sim] failed', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
