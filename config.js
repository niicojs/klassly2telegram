import 'global-agent/bootstrap.js';
import fs from 'fs';
import path from 'path';
import toml from 'toml';

export default function getConfig(home) {
  const configFile = path.join(home, 'config.toml');

  if (!fs.existsSync(configFile)) {
    console.error('No config file!');
    process.exit(404);
  }

  const config = {
    http: {
      agent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/107.0.0.0 Safari/537.36',
    },
    telegram: {
      throttling: 1200,
    },
    ...toml.parse(fs.readFileSync(configFile, 'utf-8')),
  };

  if (config.proxy?.url) {
    global.GLOBAL_AGENT.HTTP_PROXY = config.proxy.url;
    process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = 0;
  }

  return config;
}
