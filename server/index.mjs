import {createApplication} from './app.mjs';
import {readConfig} from './config.mjs';
process.umask(0o077);
const config = readConfig();
const app = createApplication({config});
app.server.listen(config.port, config.host, () => {
  console.log(`Race API listening on ${config.host}:${config.port}; API ${config.apiOrigin}; app ${new URL(config.appPath, config.appOrigin).href}`);
  if (config.devLogin) console.log('LOCAL TEST LOGIN ENABLED — never use this mode on a public server.');
});
for (const signal of ['SIGINT','SIGTERM']) process.once(signal, () => {void app.close().then(() => process.exit(0));});
