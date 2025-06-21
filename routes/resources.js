const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const logger = require('../utils/logger');
const cache = require('../utils/cache');
const { authenticateUser } = require('../middleware/auth');

// Mock resource data for testing
const mockResources = [
    {
        id: '1',
        disaster_id: '1',
        name: 'Red Cross Emergency Shelter',
        location_name: 'Lower East Side Community Center, NYC',
        location: { type: 'Point', coordinates: [-73.9857, 40.7831] },
        type: 'shelter',
        capacity: 150,
        current_occupancy: 45,
        contact: '+1-555-0123',
        amenities: ['food', 'medical', 'blankets', 'charging_stations'],
        status: 'active',
        created_at: new Date().toISOString()
    },
    {
        id: '2',
        disaster_id: '1',
        name: 'Manhattan General Hospital',
        location_name: 'Manhattan General Hospital, NYC',
        location: { type: 'Point', coordinates: [-73.9776, 40.7831] },
        type: 'medical',
        capacity: 200,
        current_occupancy: 120,
        contact: '+1-555-0456',
        amenities: ['emergency_care', 'surgery', 'pharmacy', 'ambulance'],
        status: 'active',
        created_at: new Date().toISOString()
    },
    {
        id: '3',
        disaster_id: '1',
        name: 'Food Distribution Center',
        location_name: 'Union Square, NYC',
        location: { type: 'Point', coordinates: [-73.9903, 40.7359] },
        type: 'food',
        capacity: 500,
        current_occupancy: 0,
        contact: '+1-555-0789',
        amenities: ['hot_meals', 'water', 'snacks', 'baby_formula'],
        status: 'active',
        created_at: new Date().toISOString()
    },
    {
        id: '4',
        disaster_id: '1',
        name: 'Emergency Supply Depot',
        location_name: 'Brooklyn Bridge Area, NYC',
        location: { type: 'Point', coordinates: [-73.9969, 40.7061] },
        type: 'supplies',
        capacity: 1000,
        current_occupancy: 300,
        contact: '+1-555-0234',
        amenities: ['blankets', 'clothing', 'hygiene_kits', 'flashlights'],
        status: 'active',
        created_at: new Date().toISOString()
    },
    {
        id: '5',
        disaster_id: '2',
        name: 'Evacuation Center West',
        location_name: 'Santa Monica, CA',
        location: { type: 'Point', coordinates: [-118.4912, 34.0195] },
        type: 'evacuation',
        capacity: 300,
        current_occupancy: 180,
        contact: '+1-555-0567',
        amenities: ['temporary_housing', 'food', 'medical', 'pet_care'],
        status: 'active',
        created_at: new Date().toISOString()
    },
    {
        id: '6',
        disaster_id: '1',
        name: 'Mobile Medical Unit #1',
        location_name: 'Central Park South, NYC',
        location: { type: 'Point', coordinates: [-73.9735, 40.7676] },
        type: 'medical',
        capacity: 50,
        current_occupancy: 15,
        contact: '+1-555-0890',
        amenities: ['first_aid', 'medication', 'triage'],
        status: 'active',
        created_at: new Date().toISOString()
    }
];

// Helper function to calculate distance between two points (Haversine formula)
function calculateDistance(lat1, lng1, lat2, lng2) {
    const R = 6371; // Earth's radius in kilometers
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

// Helper function to filter resources by distance
function filterResourcesByDistance(resources, lat, lng, radiusKm = 10) {
    return resources.filter(resource => {
        if (!resource.location || !resource.location.coordinates) return false;

        const [resourceLng, resourceLat] = resource.location.coordinates;
        const distance = calculateDistance(lat, lng, resourceLat, resourceLng);

        // Add distance to resource object
        resource.distance_km = Math.round(distance * 100) / 100;

        return distance <= radiusKm;
    }).sort((a, b) => a.distance_km - b.distance_km);
}

// GET /disasters/:id/resources - Get resources for a disaster with geospatial filtering
router.get('/:id/resources', authenticateUser, async (req, res) => {
    try {
        const { id: disasterId } = req.params;
        const { lat, lng, radius = 10, type, status = 'active', limit = 50 } = req.query;

        const latitude = lat ? parseFloat(lat) : null;
        const longitude = lng ? parseFloat(lng) : null;
        const radiusKm = parseFloat(radius);

        if ((lat || lng) && (!latitude || !longitude || isNaN(latitude) || isNaN(longitude))) {
            return res.status(400).json({
                error: 'Invalid coordinates',
                message: 'Both lat and lng must be valid numbers'
            });
        }

        const cacheKey = cache.generateKey('resources', { disasterId, lat, lng, radius, type, status });
        let resourceData = await cache.get(cacheKey);

        if (!resourceData) {
            try {
                // Try to query Supabase with geospatial query
                let query = supabase
                    .from('resources')
                    .select('*')
                    .eq('disaster_id', disasterId)
                    .eq('status', status)
                    .limit(limit);

                // Add type filter if specified
                if (type) {
                    query = query.eq('type', type);
                }

                // Add geospatial filter if coordinates provided
                if (latitude && longitude) {
                    // Using ST_DWithin for distance-based query (radius in meters)
                    const radiusMeters = radiusKm * 1000;
                    query = query.rpc('find_nearby_resources', {
                        disaster_id: disasterId,
                        center_lat: latitude,
                        center_lng: longitude,
                        radius_meters: radiusMeters
                    });
                }

                const { data, error } = await query;

                if (error) {
                    throw error;
                }

                resourceData = {
                    resources: data || [],
                    source: 'supabase'
                };

                logger.info(`Fetched ${resourceData.resources.length} resources from Supabase for disaster ${disasterId}`);

            } catch (error) {
                logger.error(`Error querying Supabase for resources: ${error.message}`);

                // Fall back to mock data
                let filteredResources = mockResources.filter(r =>
                    r.disaster_id === disasterId && r.status === status
                );

                // Apply type filter
                if (type) {
                    filteredResources = filteredResources.filter(r => r.type === type);
                }

                // Apply geospatial filter if coordinates provided
                if (latitude && longitude) {
                    filteredResources = filterResourcesByDistance(filteredResources, latitude, longitude, radiusKm);
                }

                resourceData = {
                    resources: filteredResources.slice(0, limit),
                    source: 'mock_data',
                    fallback_reason: 'Database connection issue'
                };

                logger.info(`Using mock resource data for disaster ${disasterId}`);
            }

            // Cache the results
            await cache.set(cacheKey, resourceData, 600); // Cache for 10 minutes
        } else {
            logger.info(`Using cached resource data for disaster ${disasterId}`);
        }

        // Emit real-time update via WebSocket
        const io = req.app.get('io');
        io.to(`disaster_${disasterId}`).emit('resources_updated', {
            disaster_id: disasterId,
            resource_count: resourceData.resources.length,
            center_location: latitude && longitude ? { lat: latitude, lng: longitude } : null,
            radius_km: radiusKm,
            timestamp: new Date().toISOString()
        });

        res.json({
            disaster_id: disasterId,
            data: resourceData.resources,
            meta: {
                total_count: resourceData.resources.length,
                filters: {
                    location: latitude && longitude ? { lat: latitude, lng: longitude } : null,
                    radius_km: radiusKm,
                    type,
                    status
                },
                source: resourceData.source,
                last_updated: new Date().toISOString()
            }
        });

    } catch (error) {
        logger.error(`Error in GET /disasters/${req.params.id}/resources:`, error);
        res.status(500).json({
            error: 'Failed to fetch resources',
            message: error.message
        });
    }
});

// POST /disasters/:id/resources - Add new resource
router.post('/:id/resources', authenticateUser, async (req, res) => {
    try {
        const { id: disasterId } = req.params;
        const { name, location_name, type, capacity, contact, amenities, location } = req.body;

        if (!name || !location_name || !type) {
            return res.status(400).json({
                error: 'Missing required fields',
                required: ['name', 'location_name', 'type']
            });
        }

        const newResource = {
            disaster_id: disasterId,
            name,
            location_name,
            type,
            capacity: capacity || 0,
            current_occupancy: 0,
            contact: contact || '',
            amenities: amenities || [],
            status: 'active',
            created_by: req.user.id
        };

        // Add location if provided
        if (location && location.lat && location.lng) {
            newResource.location = `POINT(${location.lng} ${location.lat})`;
        }

        try {
            const { data, error } = await supabase
                .from('resources')
                .insert([newResource])
                .select()
                .single();

            if (error) {
                throw error;
            }

            logger.info(`Created resource: ${data.name} for disaster ${disasterId} by user ${req.user.id}`);

            // Emit real-time update
            const io = req.app.get('io');
            io.to(`disaster_${disasterId}`).emit('resources_updated', {
                action: 'create',
                data
            });

            res.status(201).json({ data });

        } catch (error) {
            logger.error('Error creating resource in Supabase:', error);

            // Create mock response
            const mockId = Math.random().toString(36).substr(2, 9);
            const mockResponse = {
                ...newResource,
                id: mockId,
                created_at: new Date().toISOString(),
                location: location ? { type: 'Point', coordinates: [location.lng, location.lat] } : null
            };

            res.status(201).json({
                data: mockResponse,
                message: 'Created with mock data due to database connection issue'
            });
        }

    } catch (error) {
        logger.error(`Error in POST /disasters/${req.params.id}/resources:`, error);
        res.status(500).json({
            error: 'Failed to create resource',
            message: error.message
        });
    }
});

// PUT /disasters/:id/resources/:resourceId - Update resource
router.put('/:id/resources/:resourceId', authenticateUser, async (req, res) => {
    try {
        const { id: disasterId, resourceId } = req.params;
        const updates = req.body;

        const { data, error } = await supabase
            .from('resources')
            .update(updates)
            .eq('id', resourceId)
            .eq('disaster_id', disasterId)
            .select()
            .single();

        if (error || !data) {
            return res.status(404).json({
                error: 'Resource not found or could not be updated',
                resourceId
            });
        }

        logger.info(`Updated resource ${resourceId} for disaster ${disasterId} by user ${req.user.id}`);

        // Emit real-time update
        const io = req.app.get('io');
        io.to(`disaster_${disasterId}`).emit('resources_updated', {
            action: 'update',
            data
        });

        res.json({ data });

    } catch (error) {
        logger.error(`Error in PUT /disasters/${req.params.id}/resources/${req.params.resourceId}:`, error);
        res.status(500).json({
            error: 'Failed to update resource',
            message: error.message
        });
    }
});

// GET /disasters/:id/resources/types - Get available resource types
router.get('/:id/resources/types', authenticateUser, async (req, res) => {
    try {
        const { id: disasterId } = req.params;

        // Get unique resource types for this disaster
        const resourceTypes = [...new Set(mockResources
            .filter(r => r.disaster_id === disasterId)
            .map(r => r.type)
        )];

        const typeCounts = resourceTypes.map(type => ({
            type,
            count: mockResources.filter(r => r.disaster_id === disasterId && r.type === type).length,
            available_capacity: mockResources
                .filter(r => r.disaster_id === disasterId && r.type === type)
                .reduce((sum, r) => sum + (r.capacity - r.current_occupancy), 0)
        }));

        res.json({
            disaster_id: disasterId,
            resource_types: typeCounts,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error(`Error in GET /disasters/${req.params.id}/resources/types:`, error);
        res.status(500).json({
            error: 'Failed to fetch resource types',
            message: error.message
        });
    }
});

module.exports = router;
