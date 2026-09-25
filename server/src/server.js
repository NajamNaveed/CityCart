const app = require('./app');
const env = require('./config/env');

app.listen(env.port, () => {
  // eslint-disable-next-line no-console
  console.log(
    `CityCart server running in ${env.nodeEnv} mode on http://localhost:${env.port}`
  );
});
