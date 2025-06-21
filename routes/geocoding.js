const express = require('express');
const router = express.Router();
const { GoogleGenerativeAI } = require('@google/generative-ai');
const axios = require('axios');
const logger = require('../utils/logger');
const cache = require('../utils/cache');
const { authenticateUser } = require('../middleware/auth');

// Initialize Gemini AI
let genAI;
if (process.env.GEMINI_API_KEY) {
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
} else {
    logger.warn('Gemini API key not found. Using mock responses.');
}

// Mock location extraction for when Gemini API is not available
const mockLocationExtraction = (text) => {
    const locationPatterns = [
        /([A-Z][a-zA-Z\s]+),\s*([A-Z]{2})/g, // City, State format
        /([A-Z][a-zA-Z\s]+),\s*([A-Z][a-zA-Z\s]+)/g, // City, Country format
        /(Manhattan|Brooklyn|Queens|Bronx|Staten Island)/gi, // NYC boroughs
        /(Los Angeles|San Francisco|Chicago|Houston|Phoenix|Philadelphia|San Antonio|San Diego|Dallas|San Jose)/gi // Major cities
    ];

    for (const pattern of locationPatterns) {
        const matches = text.match(pattern);
        if (matches && matches.length > 0) {
            return matches[0];
        }
    }

    // Default fallback locations for testing
    const defaultLocations = ['Manhattan, NYC', 'Los Angeles, CA', 'Chicago, IL'];
    return defaultLocations[Math.floor(Math.random() * defaultLocations.length)];
};

// Mock geocoding for when mapping services are not available
const mockGeocode = (locationName) => {
    const mockLocations = {
        'Manhattan, NYC': { lat: 40.7831, lng: -73.9712 },
        'Manhattan': { lat: 40.7831, lng: -73.9712 },
        'NYC': { lat: 40.7128, lng: -74.0060 },
        'New York': { lat: 40.7128, lng: -74.0060 },
        'Los Angeles, CA': { lat: 34.0522, lng: -118.2437 },
        'Los Angeles': { lat: 34.0522, lng: -118.2437 },
        'Chicago, IL': { lat: 41.8781, lng: -87.6298 },
        'Chicago': { lat: 41.8781, lng: -87.6298 },
        'San Francisco, CA': { lat: 37.7749, lng: -122.4194 },
        'San Francisco': { lat: 37.7749, lng: -122.4194 },
        'Miami, FL': { lat: 25.7617, lng: -80.1918 },
        'Miami': { lat: 25.7617, lng: -80.1918 }
    };

    // Try exact match first
    if (mockLocations[locationName]) {
        return mockLocations[locationName];
    }

    // Try partial match
    for (const [key, value] of Object.entries(mockLocations)) {
        if (locationName.toLowerCase().includes(key.toLowerCase()) ||
            key.toLowerCase().includes(locationName.toLowerCase())) {
            return value;
        }
    }

    // Default to NYC if no match found
    return { lat: 40.7128, lng: -74.0060 };
};

// Extract location using Gemini AI
async function extractLocationWithGemini(text) {
    try {
        if (!genAI) {
            logger.info('Using mock location extraction');
            return mockLocationExtraction(text);
        }

        const model = genAI.getGenerativeModel({ model: "gemini-pro" });

        const prompt = `Extract the location name from the following text. Return only the location name in a clear format (e.g., "City, State" or "City, Country"). If no specific location is mentioned, return "Unknown". 

Text: "${text}"

Location:`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const locationName = response.text().trim();

        if (locationName === 'Unknown' || !locationName) {
            return null;
        }

        logger.info(`Gemini extracted location: ${locationName}`);
        return locationName;

    } catch (error) {
        logger.error('Error extracting location with Gemini:', error);
        return mockLocationExtraction(text);
    }
}

// Geocode location name to coordinates
async function geocodeLocation(locationName) {
    try {
        // Try Google Maps API first
        if (process.env.GOOGLE_MAPS_API_KEY) {
            const response = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
                params: {
                    address: locationName,
                    key: process.env.GOOGLE_MAPS_API_KEY
                }
            });

            if (response.data.results && response.data.results.length > 0) {
                const location = response.data.results[0].geometry.location;
                logger.info(`Google Maps geocoded ${locationName} to ${location.lat}, ${location.lng}`);
                return {
                    lat: location.lat,
                    lng: location.lng,
                    formatted_address: response.data.results[0].formatted_address,
                    source: 'google_maps'
                };
            }
        }

        // Try Mapbox API if Google Maps fails or is not configured
        if (process.env.MAPBOX_API_KEY) {
            const response = await axios.get(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(locationName)}.json`, {
                params: {
                    access_token: process.env.MAPBOX_API_KEY,
                    limit: 1
                }
            });

            if (response.data.features && response.data.features.length > 0) {
                const feature = response.data.features[0];
                const [lng, lat] = feature.center;
                logger.info(`Mapbox geocoded ${locationName} to ${lat}, ${lng}`);
                return {
                    lat,
                    lng,
                    formatted_address: feature.place_name,
                    source: 'mapbox'
                };
            }
        }

        // Fall back to OpenStreetMap Nominatim (free)
        const response = await axios.get('https://nominatim.openstreetmap.org/search', {
            params: {
                q: locationName,
                format: 'json',
                limit: 1
            },
            headers: {
                'User-Agent': 'DisasterResponsePlatform/1.0'
            }
        });

        if (response.data && response.data.length > 0) {
            const result = response.data[0];
            logger.info(`Nominatim geocoded ${locationName} to ${result.lat}, ${result.lon}`);
            return {
                lat: parseFloat(result.lat),
                lng: parseFloat(result.lon),
                formatted_address: result.display_name,
                source: 'nominatim'
            };
        }

        // If all services fail, use mock data
        logger.warn(`Geocoding failed for ${locationName}, using mock data`);
        const mockCoords = mockGeocode(locationName);
        return {
            ...mockCoords,
            formatted_address: locationName,
            source: 'mock'
        };

    } catch (error) {
        logger.error(`Error geocoding ${locationName}:`, error);
        const mockCoords = mockGeocode(locationName);
        return {
            ...mockCoords,
            formatted_address: locationName,
            source: 'mock'
        };
    }
}

// POST /geocode - Extract location from text and convert to coordinates
router.post('/', authenticateUser, async (req, res) => {
    try {
        const { text, location_name } = req.body;

        if (!text && !location_name) {
            return res.status(400).json({
                error: 'Missing required field',
                message: 'Either "text" or "location_name" is required'
            });
        }

        let extractedLocationName = location_name;

        // If text is provided, extract location using Gemini
        if (text) {
            const cacheKey = cache.generateKey('location_extraction', text);
            let cachedLocation = await cache.get(cacheKey);

            if (!cachedLocation) {
                extractedLocationName = await extractLocationWithGemini(text);
                if (extractedLocationName) {
                    await cache.set(cacheKey, extractedLocationName, 3600); // Cache for 1 hour
                }
            } else {
                extractedLocationName = cachedLocation;
                logger.info(`Using cached location extraction: ${extractedLocationName}`);
            }
        }

        if (!extractedLocationName) {
            return res.status(400).json({
                error: 'Location extraction failed',
                message: 'Could not extract location from provided text'
            });
        }

        // Geocode the location name
        const cacheKey = cache.generateKey('geocoding', extractedLocationName);
        let coordinates = await cache.get(cacheKey);

        if (!coordinates) {
            coordinates = await geocodeLocation(extractedLocationName);
            await cache.set(cacheKey, coordinates, 3600); // Cache for 1 hour
        } else {
            logger.info(`Using cached geocoding: ${extractedLocationName}`);
        }

        logger.info(`Geocoding completed: ${extractedLocationName} -> ${coordinates.lat}, ${coordinates.lng}`);

        res.json({
            original_text: text,
            extracted_location: extractedLocationName,
            coordinates,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error('Error in POST /geocode:', error);
        res.status(500).json({
            error: 'Geocoding failed',
            message: error.message
        });
    }
});

// GET /geocode/reverse - Reverse geocode coordinates to location name
router.get('/reverse', authenticateUser, async (req, res) => {
    try {
        const { lat, lng } = req.query;

        if (!lat || !lng) {
            return res.status(400).json({
                error: 'Missing required parameters',
                message: 'Both "lat" and "lng" query parameters are required'
            });
        }

        const latitude = parseFloat(lat);
        const longitude = parseFloat(lng);

        if (isNaN(latitude) || isNaN(longitude)) {
            return res.status(400).json({
                error: 'Invalid coordinates',
                message: 'Latitude and longitude must be valid numbers'
            });
        }

        const cacheKey = cache.generateKey('reverse_geocoding', { lat: latitude, lng: longitude });
        let locationData = await cache.get(cacheKey);

        if (!locationData) {
            try {
                // Try Google Maps reverse geocoding
                if (process.env.GOOGLE_MAPS_API_KEY) {
                    const response = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
                        params: {
                            latlng: `${latitude},${longitude}`,
                            key: process.env.GOOGLE_MAPS_API_KEY
                        }
                    });

                    if (response.data.results && response.data.results.length > 0) {
                        locationData = {
                            formatted_address: response.data.results[0].formatted_address,
                            components: response.data.results[0].address_components,
                            source: 'google_maps'
                        };
                    }
                }

                // Fall back to Nominatim if Google Maps fails
                if (!locationData) {
                    const response = await axios.get('https://nominatim.openstreetmap.org/reverse', {
                        params: {
                            lat: latitude,
                            lon: longitude,
                            format: 'json'
                        },
                        headers: {
                            'User-Agent': 'DisasterResponsePlatform/1.0'
                        }
                    });

                    if (response.data) {
                        locationData = {
                            formatted_address: response.data.display_name,
                            source: 'nominatim'
                        };
                    }
                }

                if (locationData) {
                    await cache.set(cacheKey, locationData, 3600);
                }
            } catch (error) {
                logger.error('Reverse geocoding error:', error);
                locationData = {
                    formatted_address: `Location at ${latitude}, ${longitude}`,
                    source: 'fallback'
                };
            }
        } else {
            logger.info(`Using cached reverse geocoding: ${latitude}, ${longitude}`);
        }

        res.json({
            coordinates: { lat: latitude, lng: longitude },
            location: locationData,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error('Error in GET /geocode/reverse:', error);
        res.status(500).json({
            error: 'Reverse geocoding failed',
            message: error.message
        });
    }
});

module.exports = router;
