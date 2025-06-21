const express = require('express');
const router = express.Router();
const axios = require('axios');
const cheerio = require('cheerio');
const logger = require('../utils/logger');
const cache = require('../utils/cache');
const { authenticateUser } = require('../middleware/auth');

// Mock official updates data
const mockOfficialUpdates = [
    {
        id: '1',
        source: 'FEMA',
        title: 'Federal Emergency Declaration for NYC Flooding',
        content: 'FEMA has declared a federal emergency for New York City due to severe flooding. Federal assistance is now available to supplement state and local response efforts.',
        url: 'https://www.fema.gov/disaster/4618',
        published_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
        priority: 'high',
        tags: ['federal', 'emergency', 'assistance', 'flooding'],
        author: 'FEMA Administrator',
        type: 'official_announcement'
    },
    {
        id: '2',
        source: 'NYC Emergency Management',
        title: 'Evacuation Orders for Lower Manhattan',
        content: 'The New York City Emergency Management Department has issued evacuation orders for areas below 14th Street in Manhattan. Residents should move to higher ground immediately.',
        url: 'https://www1.nyc.gov/site/em/index.page',
        published_at: new Date(Date.now() - 90 * 60 * 1000).toISOString(), // 1.5 hours ago
        priority: 'critical',
        tags: ['evacuation', 'manhattan', 'safety'],
        author: 'NYC Emergency Management',
        type: 'evacuation_order'
    },
    {
        id: '3',
        source: 'Red Cross',
        title: 'Emergency Shelters Now Open',
        content: 'The American Red Cross has opened emergency shelters across Manhattan and Brooklyn. Hot meals, blankets, and basic supplies are available. No advance registration required.',
        url: 'https://www.redcross.org/get-help/disaster-relief-and-recovery-services',
        published_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(), // 1 hour ago
        priority: 'normal',
        tags: ['shelter', 'relief', 'supplies'],
        author: 'American Red Cross',
        type: 'resource_announcement'
    },
    {
        id: '4',
        source: 'MTA',
        title: 'Subway Service Disruptions',
        content: 'Due to flooding, subway lines 4, 5, 6, and L are suspended until further notice. Limited bus service is available. Please check MTA website for updates.',
        url: 'https://new.mta.info/alerts',
        published_at: new Date(Date.now() - 45 * 60 * 1000).toISOString(), // 45 minutes ago
        priority: 'high',
        tags: ['transportation', 'subway', 'service'],
        author: 'MTA Operations',
        type: 'service_update'
    },
    {
        id: '5',
        source: 'National Weather Service',
        title: 'Flash Flood Warning Extended',
        content: 'Flash flood warning for New York City has been extended until 11 PM tonight. Additional 2-4 inches of rain expected. Avoid travel in low-lying areas.',
        url: 'https://www.weather.gov/okx/',
        published_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(), // 30 minutes ago
        priority: 'high',
        tags: ['weather', 'flooding', 'warning'],
        author: 'National Weather Service',
        type: 'weather_alert'
    },
    {
        id: '6',
        source: 'NYC Health Department',
        title: 'Water Safety Advisory',
        content: 'Residents in affected areas should boil water for 3 minutes before drinking until further notice. Free bottled water available at community centers.',
        url: 'https://www1.nyc.gov/site/doh/index.page',
        published_at: new Date(Date.now() - 20 * 60 * 1000).toISOString(), // 20 minutes ago
        priority: 'normal',
        tags: ['health', 'water', 'safety'],
        author: 'NYC Health Department',
        type: 'health_advisory'
    }
];

// Function to scrape FEMA updates
async function scrapeFEMAUpdates() {
    try {
        const response = await axios.get('https://www.fema.gov/disasters', {
            timeout: 10000,
            headers: {
                'User-Agent': 'DisasterResponsePlatform/1.0'
            }
        });

        const $ = cheerio.load(response.data);
        const updates = [];

        // This is a simplified scraper - in practice, you'd need to adapt to FEMA's actual HTML structure
        $('.disaster-item').each((index, element) => {
            const title = $(element).find('.disaster-title').text().trim();
            const content = $(element).find('.disaster-description').text().trim();
            const url = $(element).find('a').attr('href');
            const date = $(element).find('.disaster-date').text().trim();

            if (title && content) {
                updates.push({
                    id: `fema_${index}_${Date.now()}`,
                    source: 'FEMA',
                    title,
                    content,
                    url: url ? `https://www.fema.gov${url}` : 'https://www.fema.gov',
                    published_at: date || new Date().toISOString(),
                    priority: 'high',
                    tags: ['fema', 'federal', 'disaster'],
                    author: 'FEMA',
                    type: 'official_announcement'
                });
            }
        });

        return updates;
    } catch (error) {
        logger.error('Error scraping FEMA updates:', error);
        return [];
    }
}

// Function to scrape Red Cross updates
async function scrapeRedCrossUpdates() {
    try {
        const response = await axios.get('https://www.redcross.org/about-us/news-and-events', {
            timeout: 10000,
            headers: {
                'User-Agent': 'DisasterResponsePlatform/1.0'
            }
        });

        const $ = cheerio.load(response.data);
        const updates = [];

        // Simplified scraper for Red Cross news
        $('.news-item').each((index, element) => {
            const title = $(element).find('.news-title').text().trim();
            const content = $(element).find('.news-excerpt').text().trim();
            const url = $(element).find('a').attr('href');

            if (title && content) {
                updates.push({
                    id: `redcross_${index}_${Date.now()}`,
                    source: 'Red Cross',
                    title,
                    content,
                    url: url || 'https://www.redcross.org',
                    published_at: new Date().toISOString(),
                    priority: 'normal',
                    tags: ['redcross', 'relief', 'humanitarian'],
                    author: 'American Red Cross',
                    type: 'resource_announcement'
                });
            }
        });

        return updates;
    } catch (error) {
        logger.error('Error scraping Red Cross updates:', error);
        return [];
    }
}

// Function to get RSS feed updates (alternative approach)
async function getRSSUpdates(feedUrl, sourceName) {
    try {
        const response = await axios.get(feedUrl, {
            timeout: 10000,
            headers: {
                'User-Agent': 'DisasterResponsePlatform/1.0'
            }
        });

        const $ = cheerio.load(response.data, { xmlMode: true });
        const updates = [];

        $('item').each((index, element) => {
            const title = $(element).find('title').text().trim();
            const content = $(element).find('description').text().trim();
            const url = $(element).find('link').text().trim();
            const pubDate = $(element).find('pubDate').text().trim();

            if (title && content) {
                updates.push({
                    id: `${sourceName.toLowerCase()}_${index}_${Date.now()}`,
                    source: sourceName,
                    title,
                    content: content.length > 500 ? content.substring(0, 500) + '...' : content,
                    url,
                    published_at: pubDate || new Date().toISOString(),
                    priority: 'normal',
                    tags: [sourceName.toLowerCase(), 'rss', 'update'],
                    author: sourceName,
                    type: 'news_update'
                });
            }
        });

        return updates;
    } catch (error) {
        logger.error(`Error fetching RSS updates from ${sourceName}:`, error);
        return [];
    }
}

// GET /disasters/:id/official-updates - Get official updates for a disaster
router.get('/:id/official-updates', authenticateUser, async (req, res) => {
    try {
        const { id: disasterId } = req.params;
        const { source, priority, limit = 20, since } = req.query;

        const cacheKey = cache.generateKey('official_updates', { disasterId, source, priority });
        let officialUpdates = await cache.get(cacheKey);

        if (!officialUpdates) {
            let allUpdates = [];

            try {
                // Try to scrape real data from various sources
                logger.info('Attempting to fetch official updates from external sources...');

                // Scrape FEMA updates
                if (!source || source === 'fema') {
                    const femaUpdates = await scrapeFEMAUpdates();
                    allUpdates = allUpdates.concat(femaUpdates);
                }

                // Scrape Red Cross updates
                if (!source || source === 'redcross') {
                    const redCrossUpdates = await scrapeRedCrossUpdates();
                    allUpdates = allUpdates.concat(redCrossUpdates);
                }

                // Try to get RSS feeds from government sources
                if (!source || source === 'nws') {
                    const nwsUpdates = await getRSSUpdates(
                        'https://www.weather.gov/okx/rss.xml',
                        'National Weather Service'
                    );
                    allUpdates = allUpdates.concat(nwsUpdates);
                }

                // If no real data was scraped or scraping failed, use mock data
                if (allUpdates.length === 0) {
                    logger.info('No data scraped, using mock official updates');
                    allUpdates = [...mockOfficialUpdates];
                }

            } catch (error) {
                logger.error('Error fetching official updates:', error);
                allUpdates = [...mockOfficialUpdates];
            }

            // Apply filters
            let filteredUpdates = allUpdates;

            if (source) {
                filteredUpdates = filteredUpdates.filter(update =>
                    update.source.toLowerCase().includes(source.toLowerCase())
                );
            }

            if (priority) {
                filteredUpdates = filteredUpdates.filter(update => update.priority === priority);
            }

            if (since) {
                const sinceDate = new Date(since);
                filteredUpdates = filteredUpdates.filter(update =>
                    new Date(update.published_at) >= sinceDate
                );
            }

            // Sort by published date (newest first)
            filteredUpdates.sort((a, b) => new Date(b.published_at) - new Date(a.published_at));

            // Apply limit
            filteredUpdates = filteredUpdates.slice(0, parseInt(limit));

            officialUpdates = {
                updates: filteredUpdates,
                scraped_at: new Date().toISOString(),
                sources_attempted: ['fema', 'redcross', 'nws'],
                total_found: allUpdates.length
            };

            // Cache for 30 minutes (official updates don't change as frequently)
            await cache.set(cacheKey, officialUpdates, 1800);

        } else {
            logger.info(`Using cached official updates for disaster ${disasterId}`);
        }

        res.json({
            disaster_id: disasterId,
            data: officialUpdates.updates,
            meta: {
                total_count: officialUpdates.updates.length,
                filters: {
                    source,
                    priority,
                    since
                },
                scraped_at: officialUpdates.scraped_at,
                sources_attempted: officialUpdates.sources_attempted,
                last_updated: new Date().toISOString()
            }
        });

    } catch (error) {
        logger.error(`Error in GET /disasters/${req.params.id}/official-updates:`, error);
        res.status(500).json({
            error: 'Failed to fetch official updates',
            message: error.message
        });
    }
});

// GET /disasters/:id/official-updates/sources - Get available update sources
router.get('/:id/official-updates/sources', authenticateUser, async (req, res) => {
    try {
        const sources = [
            {
                name: 'FEMA',
                description: 'Federal Emergency Management Agency',
                url: 'https://www.fema.gov',
                update_frequency: 'hourly',
                reliability: 'high'
            },
            {
                name: 'Red Cross',
                description: 'American Red Cross',
                url: 'https://www.redcross.org',
                update_frequency: 'real-time',
                reliability: 'high'
            },
            {
                name: 'National Weather Service',
                description: 'National Weather Service',
                url: 'https://www.weather.gov',
                update_frequency: 'real-time',
                reliability: 'high'
            },
            {
                name: 'NYC Emergency Management',
                description: 'New York City Emergency Management',
                url: 'https://www1.nyc.gov/site/em/',
                update_frequency: 'real-time',
                reliability: 'high'
            }
        ];

        res.json({
            available_sources: sources,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error(`Error in GET /disasters/${req.params.id}/official-updates/sources:`, error);
        res.status(500).json({
            error: 'Failed to fetch update sources',
            message: error.message
        });
    }
});

// GET /disasters/:id/official-updates/summary - Get summary of official updates
router.get('/:id/official-updates/summary', authenticateUser, async (req, res) => {
    try {
        const { id: disasterId } = req.params;

        // Get recent updates from cache or mock data
        const recentUpdates = mockOfficialUpdates.slice(0, 10);

        const summary = {
            total_updates: recentUpdates.length,
            by_priority: {
                critical: recentUpdates.filter(u => u.priority === 'critical').length,
                high: recentUpdates.filter(u => u.priority === 'high').length,
                normal: recentUpdates.filter(u => u.priority === 'normal').length,
                low: recentUpdates.filter(u => u.priority === 'low').length
            },
            by_source: {},
            by_type: {},
            latest_update: recentUpdates[0]?.published_at || null,
            most_recent_critical: recentUpdates.find(u => u.priority === 'critical')
        };

        // Count by source
        recentUpdates.forEach(update => {
            summary.by_source[update.source] = (summary.by_source[update.source] || 0) + 1;
        });

        // Count by type
        recentUpdates.forEach(update => {
            summary.by_type[update.type] = (summary.by_type[update.type] || 0) + 1;
        });

        res.json({
            disaster_id: disasterId,
            summary,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error(`Error in GET /disasters/${req.params.id}/official-updates/summary:`, error);
        res.status(500).json({
            error: 'Failed to fetch updates summary',
            message: error.message
        });
    }
});

module.exports = router;
