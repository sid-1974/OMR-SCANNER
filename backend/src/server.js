const app = require('./app');
const connectDB = require('./config/database');
const env = require('./config/env');

// Connect to database
connectDB().then(() => {
  // Start server
  app.listen(env.port, () => {
    console.log(`Server running in ${env.nodeEnv} mode on port ${env.port}`);
  });
});
