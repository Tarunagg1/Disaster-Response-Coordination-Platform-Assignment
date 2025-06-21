const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const http = require('http');
const socketIo = require('socket.io');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const logger = require('./utils/logger');
const supabaseClient = require('./config/supabase');

// Route imports
const disasterRoutes = require('./routes/disasters');
const socialMediaRoutes = require('./routes/socialMedia');
const resourceRoutes = require('./routes/resources');
const officialUpdatesRoutes = require('./routes/officialUpdates');
const geocodingRoutes = require('./routes/geocoding');
const verificationRoutes = require('./routes/verification');
const mockSocialMediaRoutes = require('./routes/mockSocialMedia');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: process.env.CLIENT_URL || "http://localhost:3000",
        methods: ["GET", "POST"]
    }
});

// Middleware
app.use(helmet());
app.use(cors({
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: {
        error: 'Too many requests from this IP, please try again later.'
    }
});
app.use('/api/', limiter);

// Socket.IO setup
app.set('io', io);

io.on('connection', (socket) => {
    logger.info(`Socket connected: ${socket.id}`);

    socket.on('join_disaster', (disasterId) => {
        socket.join(`disaster_${disasterId}`);
        logger.info(`Socket ${socket.id} joined disaster room: ${disasterId}`);
    });

    socket.on('disconnect', () => {
        logger.info(`Socket disconnected: ${socket.id}`);
    });
});

// Routes
app.use('/api/disasters', disasterRoutes);
app.use('/api/disasters', socialMediaRoutes);
app.use('/api/disasters', resourceRoutes);
app.use('/api/disasters', officialUpdatesRoutes);
app.use('/api/geocode', geocodingRoutes);
app.use('/api/disasters', verificationRoutes);
app.use('/api/mock-social-media', mockSocialMediaRoutes);

// Static files for frontend
app.use(express.static('public'));

// Root route
app.get('/', (req, res) => {
    res.json({
        message: 'Disaster Response Coordination Platform API',
        status: 'active',
        timestamp: new Date().toISOString(),
        endpoints: {
            disasters: '/api/disasters',
            geocoding: '/api/geocode',
            mockSocialMedia: '/api/mock-social-media'
        }
    });
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// Error handling middleware
app.use((err, req, res, next) => {
    logger.error('Unhandled error:', err);
    res.status(500).json({
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
    });
});

// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({
        error: 'Route not found',
        path: req.originalUrl
    });
});

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
    logger.info(`Server running on port ${PORT}`);
    logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = { app, server, io };
