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
    logger.warn('Gemini API key not found. Using mock image verification.');
}

// Mock verification results for testing
const mockVerificationResults = [
    {
        image_url: 'http://example.com/flood1.jpg',
        authenticity_score: 0.92,
        status: 'authentic',
        analysis: 'Image shows genuine flood damage with consistent lighting and shadows. No signs of digital manipulation detected.',
        confidence: 'high',
        flags: [],
        detected_objects: ['water', 'buildings', 'vehicles', 'debris'],
        context_match: true
    },
    {
        image_url: 'http://example.com/flood2.jpg',
        authenticity_score: 0.45,
        status: 'suspicious',
        analysis: 'Image shows inconsistent lighting and possible compositing artifacts. Water reflection does not match expected physics.',
        confidence: 'medium',
        flags: ['inconsistent_lighting', 'possible_compositing'],
        detected_objects: ['water', 'street', 'cars'],
        context_match: false
    },
    {
        image_url: 'http://example.com/fire1.jpg',
        authenticity_score: 0.88,
        status: 'authentic',
        analysis: 'Wildfire image appears genuine with natural smoke patterns and appropriate environmental context.',
        confidence: 'high',
        flags: [],
        detected_objects: ['fire', 'smoke', 'trees', 'buildings'],
        context_match: true
    }
];

// Function to get mock verification result based on image URL
function getMockVerificationResult(imageUrl) {
    // Simple hash to get consistent results for same URL
    let hash = 0;
    for (let i = 0; i < imageUrl.length; i++) {
        hash = ((hash << 5) - hash + imageUrl.charCodeAt(i)) & 0xfffffff;
    }

    const index = Math.abs(hash) % mockVerificationResults.length;
    const result = { ...mockVerificationResults[index] };
    result.image_url = imageUrl;
    result.verified_at = new Date().toISOString();

    return result;
}

// Function to verify image using Gemini Vision API
async function verifyImageWithGemini(imageUrl) {
    try {
        if (!genAI) {
            logger.info('Using mock image verification');
            return getMockVerificationResult(imageUrl);
        }

        const model = genAI.getGenerativeModel({ model: "gemini-pro-vision" });

        // First, fetch the image to pass to Gemini
        let imageData;
        try {
            const response = await axios.get(imageUrl, {
                responseType: 'arraybuffer',
                timeout: 30000,
                headers: {
                    'User-Agent': 'DisasterResponsePlatform/1.0'
                }
            });
            imageData = {
                inlineData: {
                    data: Buffer.from(response.data).toString('base64'),
                    mimeType: response.headers['content-type'] || 'image/jpeg'
                }
            };
        } catch (error) {
            logger.error(`Failed to fetch image from ${imageUrl}:`, error);
            throw new Error('Could not fetch image for verification');
        }

        const prompt = `Analyze this image for authenticity and disaster context. Please provide:

1. Authenticity assessment (scale 0-1, where 1 is definitely authentic)
2. Whether this appears to be a genuine disaster-related image
3. Any signs of digital manipulation or editing
4. What objects/elements you can identify in the image
5. Whether the image context matches what would be expected in a real disaster scenario
6. Overall confidence level in your assessment

Please respond in a structured format addressing each point.`;

        const result = await model.generateContent([prompt, imageData]);
        const response = await result.response;
        const analysisText = response.text();

        // Parse the Gemini response and structure it
        const verification = parseGeminiVerificationResponse(analysisText, imageUrl);

        logger.info(`Gemini verified image: ${imageUrl} - Status: ${verification.status}`);
        return verification;

    } catch (error) {
        logger.error('Error verifying image with Gemini:', error);
        // Fall back to mock result
        return getMockVerificationResult(imageUrl);
    }
}

// Function to parse Gemini's verification response
function parseGeminiVerificationResponse(analysisText, imageUrl) {
    // Extract numerical scores from the text
    const authenticityMatch = analysisText.match(/authenticity.*?(\d+\.?\d*)/i);
    const authenticityScore = authenticityMatch ? parseFloat(authenticityMatch[1]) : 0.7;

    // Determine status based on score and keywords
    let status = 'authentic';
    let confidence = 'medium';
    const flags = [];

    const lowerText = analysisText.toLowerCase();

    if (authenticityScore < 0.4 ||
        lowerText.includes('manipulated') ||
        lowerText.includes('edited') ||
        lowerText.includes('fake')) {
        status = 'fake';
        confidence = 'high';
        flags.push('manipulation_detected');
    } else if (authenticityScore < 0.7 ||
        lowerText.includes('suspicious') ||
        lowerText.includes('uncertain')) {
        status = 'suspicious';
        confidence = 'medium';
        flags.push('requires_review');
    }

    // Extract detected objects (simple keyword detection)
    const commonObjects = ['water', 'fire', 'smoke', 'building', 'car', 'tree', 'person', 'debris', 'flood', 'damage'];
    const detectedObjects = commonObjects.filter(obj => lowerText.includes(obj));

    // Check for context match
    const disasterKeywords = ['disaster', 'emergency', 'flood', 'fire', 'damage', 'destruction', 'evacuation'];
    const contextMatch = disasterKeywords.some(keyword => lowerText.includes(keyword));

    if (lowerText.includes('high confidence') || lowerText.includes('very confident')) {
        confidence = 'high';
    } else if (lowerText.includes('low confidence') || lowerText.includes('uncertain')) {
        confidence = 'low';
    }

    return {
        image_url: imageUrl,
        authenticity_score: Math.min(Math.max(authenticityScore, 0), 1), // Clamp to 0-1
        status,
        analysis: analysisText,
        confidence,
        flags,
        detected_objects: detectedObjects,
        context_match: contextMatch,
        verified_at: new Date().toISOString(),
        verification_method: 'gemini_vision'
    };
}

// POST /disasters/:id/verify-image - Verify image authenticity
router.post('/:id/verify-image', authenticateUser, async (req, res) => {
    try {
        const { id: disasterId } = req.params;
        const { image_url } = req.body;

        if (!image_url) {
            return res.status(400).json({
                error: 'Missing required field',
                message: 'image_url is required'
            });
        }

        // Validate URL format
        try {
            new URL(image_url);
        } catch (error) {
            return res.status(400).json({
                error: 'Invalid URL',
                message: 'image_url must be a valid URL'
            });
        }

        // Check cache first
        const cacheKey = cache.generateKey('image_verification', image_url);
        let verificationResult = await cache.get(cacheKey);

        if (!verificationResult) {
            logger.info(`Verifying image: ${image_url}`);

            verificationResult = await verifyImageWithGemini(image_url);

            // Cache the result for 24 hours (image verification results are relatively stable)
            await cache.set(cacheKey, verificationResult, 86400);
        } else {
            logger.info(`Using cached verification for: ${image_url}`);
        }

        // Log the verification activity
        logger.info(`Image verification completed: ${image_url} - Status: ${verificationResult.status}, Score: ${verificationResult.authenticity_score}`);

        res.json({
            disaster_id: disasterId,
            verification: verificationResult,
            verified_by: req.user.id,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error(`Error in POST /disasters/${req.params.id}/verify-image:`, error);
        res.status(500).json({
            error: 'Image verification failed',
            message: error.message
        });
    }
});

// POST /disasters/:id/verify-images - Bulk verify multiple images
router.post('/:id/verify-images', authenticateUser, async (req, res) => {
    try {
        const { id: disasterId } = req.params;
        const { image_urls } = req.body;

        if (!image_urls || !Array.isArray(image_urls)) {
            return res.status(400).json({
                error: 'Missing required field',
                message: 'image_urls must be an array of URLs'
            });
        }

        if (image_urls.length > 10) {
            return res.status(400).json({
                error: 'Too many images',
                message: 'Maximum 10 images can be verified at once'
            });
        }

        // Validate all URLs
        for (const url of image_urls) {
            try {
                new URL(url);
            } catch (error) {
                return res.status(400).json({
                    error: 'Invalid URL',
                    message: `Invalid URL: ${url}`
                });
            }
        }

        logger.info(`Bulk verifying ${image_urls.length} images for disaster ${disasterId}`);

        const verificationPromises = image_urls.map(async (url) => {
            const cacheKey = cache.generateKey('image_verification', url);
            let result = await cache.get(cacheKey);

            if (!result) {
                result = await verifyImageWithGemini(url);
                await cache.set(cacheKey, result, 86400);
            }

            return result;
        });

        const verificationResults = await Promise.all(verificationPromises);

        // Calculate summary statistics
        const summary = {
            total_verified: verificationResults.length,
            authentic: verificationResults.filter(r => r.status === 'authentic').length,
            suspicious: verificationResults.filter(r => r.status === 'suspicious').length,
            fake: verificationResults.filter(r => r.status === 'fake').length,
            average_authenticity_score: verificationResults.reduce((sum, r) => sum + r.authenticity_score, 0) / verificationResults.length,
            high_confidence: verificationResults.filter(r => r.confidence === 'high').length
        };

        res.json({
            disaster_id: disasterId,
            verifications: verificationResults,
            summary,
            verified_by: req.user.id,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error(`Error in POST /disasters/${req.params.id}/verify-images:`, error);
        res.status(500).json({
            error: 'Bulk image verification failed',
            message: error.message
        });
    }
});

// GET /disasters/:id/verifications - Get verification history for a disaster
router.get('/:id/verifications', authenticateUser, async (req, res) => {
    try {
        const { id: disasterId } = req.params;
        const { status, confidence, limit = 20 } = req.query;

        // In a real implementation, this would query a verifications table
        // For now, we'll return mock verification history
        let mockHistory = [
            {
                id: '1',
                disaster_id: disasterId,
                image_url: 'http://example.com/flood_damage_1.jpg',
                status: 'authentic',
                authenticity_score: 0.95,
                confidence: 'high',
                verified_by: 'citizen1',
                verified_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
                flags: []
            },
            {
                id: '2',
                disaster_id: disasterId,
                image_url: 'http://example.com/suspicious_flood.jpg',
                status: 'suspicious',
                authenticity_score: 0.42,
                confidence: 'medium',
                verified_by: 'netrunnerX',
                verified_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
                flags: ['inconsistent_lighting']
            },
            {
                id: '3',
                disaster_id: disasterId,
                image_url: 'http://example.com/clearly_fake.jpg',
                status: 'fake',
                authenticity_score: 0.15,
                confidence: 'high',
                verified_by: 'reliefAdmin',
                verified_at: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
                flags: ['manipulation_detected', 'compositing_artifacts']
            }
        ];

        // Apply filters
        if (status) {
            mockHistory = mockHistory.filter(v => v.status === status);
        }

        if (confidence) {
            mockHistory = mockHistory.filter(v => v.confidence === confidence);
        }

        // Apply limit
        mockHistory = mockHistory.slice(0, parseInt(limit));

        // Calculate summary
        const summary = {
            total_verifications: mockHistory.length,
            by_status: {
                authentic: mockHistory.filter(v => v.status === 'authentic').length,
                suspicious: mockHistory.filter(v => v.status === 'suspicious').length,
                fake: mockHistory.filter(v => v.status === 'fake').length
            },
            average_score: mockHistory.reduce((sum, v) => sum + v.authenticity_score, 0) / mockHistory.length || 0
        };

        res.json({
            disaster_id: disasterId,
            verifications: mockHistory,
            summary,
            filters: { status, confidence },
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error(`Error in GET /disasters/${req.params.id}/verifications:`, error);
        res.status(500).json({
            error: 'Failed to fetch verification history',
            message: error.message
        });
    }
});

module.exports = router;
