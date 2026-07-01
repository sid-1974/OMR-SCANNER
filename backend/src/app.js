const express = require('express');
const cors = require('cors');
const { errorHandler, notFoundHandler } = require('./common/middleware/error.middleware');
const routes = require('./routes');
const connectDB = require('./config/database');

const app = express();

// Global Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Ensure DB is connected for serverless environments (Vercel)
app.use(async (req, res, next) => {
  await connectDB();
  next();
});

// Serve static files for uploads
app.use('/uploads', express.static('uploads'));

// API Routes
app.use('/api', routes);

// 404 Handler
app.use(notFoundHandler);

// Global Error Handler
app.use(errorHandler);

module.exports = app;
