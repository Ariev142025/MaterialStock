import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';

// Routes
import authRoutes from './routes/auth.js';
import projectRoutes from './routes/projects.js';
import materialRoutes from './routes/materials.js';
import requestRoutes from './routes/requests.js';
import inventoryRoutes from './routes/inventory.js';
import reportRoutes from './routes/reports.js';
import usersRoutes from './routes/users.js';

// Middleware
import { authenticateToken, errorHandler } from './middleware/index.js';
import { setupWebSocket } from './websocket/index.js';

// Config
import { initializeDatabase } from './database/connection.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true
  }
});

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});

app.use(limiter);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Public routes
app.post('/api/auth/login', require('./controllers/auth.js').login);
app.post('/api/auth/register', require('./controllers/auth.js').register);

// Protected routes
app.use(authenticateToken);

// API Routes
app.use('/api/projects', projectRoutes);
app.use('/api/materials', materialRoutes);
app.use('/api/requests', requestRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/users', usersRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date() });
});

// Error handling middleware
app.use(errorHandler);

// WebSocket setup
setupWebSocket(io);

// Initialize database and start server
const PORT = process.env.PORT || 3001;

async function startServer() {
  try {
    await initializeDatabase();
    console.log('✓ Database initialized');
    
    httpServer.listen(PORT, () => {
      console.log(`✓ Server running on port ${PORT}`);
      console.log(`✓ WebSocket enabled on ws://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('✗ Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

export { app, httpServer, io };
