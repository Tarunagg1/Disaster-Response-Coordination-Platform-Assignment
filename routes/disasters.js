const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const logger = require('../utils/logger');
const { authenticateUser, requireRole } = require('../middleware/auth');

// Mock data for testing when Supabase is not available
const mockDisasters = [
    {
        id: '1',
        title: 'NYC Flood',
        location_name: 'Manhattan, NYC',
        location: { type: 'Point', coordinates: [-74.0060, 40.7128] },
        description: 'Heavy flooding in Manhattan area affecting multiple blocks',
        tags: ['flood', 'urgent'],
        owner_id: 'netrunnerX',
        created_at: new Date().toISOString(),
        audit_trail: [
            {
                action: 'create',
                user_id: 'netrunnerX',
                timestamp: new Date().toISOString()
            }
        ]
    },
    {
        id: '2',
        title: 'California Wildfire',
        location_name: 'Los Angeles, CA',
        location: { type: 'Point', coordinates: [-118.2437, 34.0522] },
        description: 'Wildfire spreading rapidly in the hills near LA',
        tags: ['wildfire', 'evacuation'],
        owner_id: 'reliefAdmin',
        created_at: new Date().toISOString(),
        audit_trail: [
            {
                action: 'create',
                user_id: 'reliefAdmin',
                timestamp: new Date().toISOString()
            }
        ]
    }
];

// Helper function to format location for Supabase
function formatLocationForDB(lat, lng) {
    return `POINT(${lng} ${lat})`;
}

// GET /disasters - List all disasters with optional filtering
router.get('/', authenticateUser, async (req, res) => {
    try {
        const { tag, limit = 50, offset = 0 } = req.query;

        let query = supabase
            .from('disasters')
            .select('*')
            .range(offset, offset + limit - 1)
            .order('created_at', { ascending: false });

        if (tag) {
            query = query.contains('tags', [tag]);
        }

        const { data, error } = await query;

        if (error) {
            logger.error('Error fetching disasters:', error);
            // Return mock data on error
            const filteredMockData = tag
                ? mockDisasters.filter(d => d.tags.includes(tag))
                : mockDisasters;

            return res.json({
                data: filteredMockData,
                count: filteredMockData.length,
                message: 'Using mock data due to database connection issue'
            });
        }

        logger.info(`Fetched ${data.length} disasters for user ${req.user.id}`);
        res.json({
            data: data || [],
            count: data ? data.length : 0
        });

    } catch (error) {
        logger.error('Error in GET /disasters:', error);
        res.status(500).json({
            error: 'Failed to fetch disasters',
            message: error.message
        });
    }
});

// GET /disasters/:id - Get specific disaster
router.get('/:id', authenticateUser, async (req, res) => {
    try {
        const { id } = req.params;

        const { data, error } = await supabase
            .from('disasters')
            .select('*')
            .eq('id', id)
            .single();

        if (error || !data) {
            // Return mock data if not found in database
            const mockDisaster = mockDisasters.find(d => d.id === id);
            if (mockDisaster) {
                return res.json({
                    data: mockDisaster,
                    message: 'Using mock data'
                });
            }

            return res.status(404).json({
                error: 'Disaster not found',
                id
            });
        }

        logger.info(`Fetched disaster ${id} for user ${req.user.id}`);
        res.json({ data });

    } catch (error) {
        logger.error(`Error fetching disaster ${req.params.id}:`, error);
        res.status(500).json({
            error: 'Failed to fetch disaster',
            message: error.message
        });
    }
});

// POST /disasters - Create new disaster
router.post('/', authenticateUser, async (req, res) => {
    try {
        const { title, location_name, description, tags, location } = req.body;

        if (!title || !location_name || !description) {
            return res.status(400).json({
                error: 'Missing required fields',
                required: ['title', 'location_name', 'description']
            });
        }

        const newDisaster = {
            title,
            location_name,
            description,
            tags: tags || [],
            owner_id: req.user.id,
            audit_trail: [{
                action: 'create',
                user_id: req.user.id,
                timestamp: new Date().toISOString()
            }]
        };

        // Add location if provided
        if (location && location.lat && location.lng) {
            newDisaster.location = formatLocationForDB(location.lat, location.lng);
        }

        const { data, error } = await supabase
            .from('disasters')
            .insert([newDisaster])
            .select()
            .single();

        if (error) {
            logger.error('Error creating disaster:', error);
            // For demo purposes, create a mock response
            const mockId = Math.random().toString(36).substr(2, 9);
            const mockResponse = {
                ...newDisaster,
                id: mockId,
                created_at: new Date().toISOString(),
                location: location ? { type: 'Point', coordinates: [location.lng, location.lat] } : null
            };

            // Emit socket event
            const io = req.app.get('io');
            io.emit('disaster_updated', {
                action: 'create',
                data: mockResponse
            });

            return res.status(201).json({
                data: mockResponse,
                message: 'Created with mock data due to database connection issue'
            });
        }

        logger.info(`Created disaster: ${data.title} by user ${req.user.id}`);

        // Emit socket event for real-time updates
        const io = req.app.get('io');
        io.emit('disaster_updated', {
            action: 'create',
            data
        });

        res.status(201).json({ data });

    } catch (error) {
        logger.error('Error in POST /disasters:', error);
        res.status(500).json({
            error: 'Failed to create disaster',
            message: error.message
        });
    }
});

// PUT /disasters/:id - Update disaster
router.put('/:id', authenticateUser, async (req, res) => {
    try {
        const { id } = req.params;
        const { title, location_name, description, tags, location } = req.body;

        // First check if disaster exists and user has permission
        const { data: existing, error: fetchError } = await supabase
            .from('disasters')
            .select('owner_id, audit_trail')
            .eq('id', id)
            .single();

        if (fetchError || !existing) {
            return res.status(404).json({
                error: 'Disaster not found',
                id
            });
        }

        // Check ownership or admin role
        if (existing.owner_id !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({
                error: 'Insufficient permissions',
                message: 'You can only update your own disasters'
            });
        }

        const updateData = {};
        if (title) updateData.title = title;
        if (location_name) updateData.location_name = location_name;
        if (description) updateData.description = description;
        if (tags) updateData.tags = tags;
        if (location && location.lat && location.lng) {
            updateData.location = formatLocationForDB(location.lat, location.lng);
        }

        // Update audit trail
        const newAuditEntry = {
            action: 'update',
            user_id: req.user.id,
            timestamp: new Date().toISOString(),
            changes: Object.keys(updateData)
        };

        updateData.audit_trail = [...(existing.audit_trail || []), newAuditEntry];

        const { data, error } = await supabase
            .from('disasters')
            .update(updateData)
            .eq('id', id)
            .select()
            .single();

        if (error) {
            logger.error(`Error updating disaster ${id}:`, error);
            return res.status(500).json({
                error: 'Failed to update disaster',
                message: error.message
            });
        }

        logger.info(`Updated disaster ${id} by user ${req.user.id}`);

        // Emit socket event
        const io = req.app.get('io');
        io.emit('disaster_updated', {
            action: 'update',
            data
        });

        res.json({ data });

    } catch (error) {
        logger.error(`Error in PUT /disasters/${req.params.id}:`, error);
        res.status(500).json({
            error: 'Failed to update disaster',
            message: error.message
        });
    }
});

// DELETE /disasters/:id - Delete disaster
router.delete('/:id', authenticateUser, requireRole(['admin']), async (req, res) => {
    try {
        const { id } = req.params;

        const { data, error } = await supabase
            .from('disasters')
            .delete()
            .eq('id', id)
            .select()
            .single();

        if (error) {
            logger.error(`Error deleting disaster ${id}:`, error);
            return res.status(404).json({
                error: 'Disaster not found or could not be deleted',
                id
            });
        }

        logger.info(`Deleted disaster ${id} by admin ${req.user.id}`);

        // Emit socket event
        const io = req.app.get('io');
        io.emit('disaster_updated', {
            action: 'delete',
            data: { id }
        });

        res.json({
            message: 'Disaster deleted successfully',
            data
        });

    } catch (error) {
        logger.error(`Error in DELETE /disasters/${req.params.id}:`, error);
        res.status(500).json({
            error: 'Failed to delete disaster',
            message: error.message
        });
    }
});

module.exports = router;
