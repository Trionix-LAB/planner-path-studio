#!/usr/bin/env node
const path = require('path');
const { createRwltComSimulator } = require('../electron/rwlt-com-simulator.cjs');

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

const toBoolean = (value) => {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return false;
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
};

const printHelp = () => {
  console.log(`
Usage:
  npm run rwlt-com:sim -- --port <path> [options]

Options:
  --port <path>          App serial port path (virtual app-side endpoint)
  --sim-port <path>      Simulator writer-side endpoint (optional)
  --baud <rate>          Baud rate (default 38400)
  --rate <hz>            Stream rate (default 2)
  --mode <mode>          stream | single | playback
  --message-mode <mode>  mix | valid | broken
  --rwlt-mode <mode>     pinger | divers (default pinger)
  --allow-runtime-mode-switch <bool>
                         Allow runtime mode switch by incoming PUNV0/PUWV0 (default false)
  --diver-ids <list>     comma-separated diver target IDs, e.g. 1,2,3
  --replay <path>        Scenario file (json/yaml-like)
  --virtual <bool>       Auto-create virtual COM pair via socat (default true)
  --only-valid           Force valid messages
  --only-broken          Force broken messages
  --auto <bool>          Use first available physical serial port (virtual=false)
  --list-ports           Print available serial ports and exit
  --help                 Show this message
`);
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  if (toBoolean(args.help)) {
    printHelp();
    return;
  }

  const replayPath = typeof args.replay === 'string' ? path.resolve(args.replay) : null;
  const simulator = createRwltComSimulator();

  if (toBoolean(args['list-ports'])) {
    const ports = await simulator.listPorts();
    console.log('[rwlt-com-sim] ports', ports);
    return;
  }

  if (replayPath) {
    await simulator.loadScenario(replayPath);
  }

  const modeRaw = typeof args.mode === 'string' ? args.mode : replayPath ? 'playback' : 'stream';
  const messageModeRaw = typeof args['message-mode'] === 'string' ? args['message-mode'] : 'mix';
  const started = await simulator.start({
    mode: modeRaw,
    messageMode: messageModeRaw,
    portPath: typeof args.port === 'string' ? args.port : '',
    simulatorPortPath: typeof args['sim-port'] === 'string' ? args['sim-port'] : '',
    baudRate: args.baud ?? args['baud-rate'],
    rateHz: args.rate,
    rwltMode: typeof args['rwlt-mode'] === 'string' ? args['rwlt-mode'] : 'pinger',
    allowRuntimeModeSwitch: toBoolean(args['allow-runtime-mode-switch']),
    diverTargetIds: typeof args['diver-ids'] === 'string' ? args['diver-ids'] : '',
    virtualPort: typeof args.virtual === 'string' ? toBoolean(args.virtual) : true,
    autoDetectPort: toBoolean(args.auto),
    onlyValid: toBoolean(args['only-valid']),
    onlyBroken: toBoolean(args['only-broken']),
  });

  console.log('[rwlt-com-sim] started', started);
  if (started && typeof started === 'object' && started.virtualPort) {
    console.log(
      '[rwlt-com-sim] connect app to:',
      started.virtualPort.appPortPath,
      '| simulator writes to:',
      started.virtualPort.simulatorPortPath,
    );
  }
  if (started && typeof started === 'object' && started.status !== 'running') {
    process.exit(started.status === 'error' ? 1 : 0);
  }

  const printStatus = async () => {
    const status = await simulator.getStatus();
    console.log('[rwlt-com-sim] status', status);
  };

  const statusTimer = setInterval(() => {
    void printStatus();
  }, 3000);

  const shutdown = async (signal) => {
    clearInterval(statusTimer);
    try {
      await simulator.stop();
    } finally {
      console.log(`[rwlt-com-sim] stopped by ${signal}`);
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
  console.error('[rwlt-com-sim] failed', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
