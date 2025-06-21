const express = require('express');
const router = express.Router();
const axios = require('axios');
const logger = require('../utils/logger');
const cache = require('../utils/cache');
const { authenticateUser } = require('../middleware/auth');

// Mock social media data
const mockSocialMediaPosts = [
    {
        id: '1',
        user: 'citizen1',
        username: '@citizen_reporter',
        content: '#floodrelief Need food and water in Lower East Side Manhattan. Families stuck on 3rd floor. #NYC #emergency',
        timestamp: new Date(Date.now() - 30 * 60 * 1000).toISOString(), // 30 minutes ago
        source: 'twitter',
        hashtags: ['floodrelief', 'NYC', 'emergency'],
        priority: 'urgent',
        location: 'Lower East Side, Manhattan',
        engagement: { likes: 45, retweets: 23, replies: 12 }
    },
    {
        id: '2',
        user: 'volunteer_helper',
        username: '@volunteer_help',
        content: 'Shelter available at Community Center on 42nd St. Can accommodate 50 people. Hot meals provided. #disasterrelief #NYC',
        timestamp: new Date(Date.now() - 45 * 60 * 1000).toISOString(), // 45 minutes ago
        source: 'twitter',
        hashtags: ['disasterrelief', 'NYC'],
        priority: 'normal',
        location: '42nd St, NYC',
        engagement: { likes: 78, retweets: 34, replies: 8 }
    },
    {
        id: '3',
        user: 'emergency_responder',
        username: '@emr_official',
        content: 'URGENT: Evacuation notice for blocks 15-20 on Water Street. Please move to higher ground immediately. #evacuation #safety',
        timestamp: new Date(Date.now() - 15 * 60 * 1000).toISOString(), // 15 minutes ago
        source: 'twitter',
        hashtags: ['evacuation', 'safety'],
        priority: 'critical',
        location: 'Water Street, NYC',
        engagement: { likes: 156, retweets: 89, replies: 23 }
    },
    {
        id: '4',
        user: 'local_news',
        username: '@ny_news_live',
        content: 'BREAKING: Flooding in Manhattan reaches 4 feet in some areas. MTA services suspended on Lines 4,5,6. Avoid downtown area.',
        timestamp: new Date(Date.now() - 60 * 60 * 1000).toISOString(), // 1 hour ago
        source: 'twitter',
        hashtags: ['breaking', 'flooding', 'MTA'],
        priority: 'high',
        location: 'Manhattan, NYC',
        engagement: { likes: 234, retweets: 156, replies: 45 }
    },
    {
        id: '5',
        user: 'red_cross_ny',
        username: '@RedCrossNY',
        content: 'Medical assistance available at Roosevelt Hospital. Non-emergency cases please use alternate facilities. Staff on standby. #medical #help',
        timestamp: new Date(Date.now() - 90 * 60 * 1000).toISOString(), // 1.5 hours ago
        source: 'twitter',
        hashtags: ['medical', 'help'],
        priority: 'normal',
        location: 'Roosevelt Hospital, NYC',
        engagement: { likes: 67, retweets: 45, replies: 12 }
    }
];

// Function to determine post priority based on keywords
function determinePriority(content) {
    const criticalKeywords = ['urgent', 'emergency', 'sos', 'help', 'trapped', 'evacuation', 'immediate'];
    const highKeywords = ['breaking', 'alert', 'warning', 'danger', 'rescue'];
    const normalKeywords = ['shelter', 'food', 'water', 'medical', 'assistance'];

    const lowerContent = content.toLowerCase();

    if (criticalKeywords.some(keyword => lowerContent.includes(keyword))) {
        return 'critical';
    }
    if (highKeywords.some(keyword => lowerContent.includes(keyword))) {
        return 'high';
    }
    if (normalKeywords.some(keyword => lowerContent.includes(keyword))) {
        return 'normal';
    }

    return 'low';
}

// Function to extract hashtags from content
function extractHashtags(content) {
    const hashtagRegex = /#[\w]+/g;
    const matches = content.match(hashtagRegex);
    return matches ? matches.map(tag => tag.substring(1)) : [];
}

// Function to extract location mentions from content
function extractLocationFromContent(content) {
    const locationPatterns = [
        /(?:in|at|on|near)\s+([A-Z][a-zA-Z\s]+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Manhattan|Brooklyn|Queens|Bronx))/gi,
        /(Manhattan|Brooklyn|Queens|Bronx|Staten Island)/gi,
        /([A-Z][a-zA-Z\s]+),\s*(NYC|New York)/gi
    ];

    for (const pattern of locationPatterns) {
        const matches = content.match(pattern);
        if (matches && matches.length > 0) {
            return matches[0].replace(/^(in|at|on|near)\s+/i, '');
        }
    }

    return null;
}

// Function to simulate real-time social media monitoring
function getRealtimeSocialMediaPosts(disasterId, keywords = []) {
    const relevantPosts = mockSocialMediaPosts.filter(post => {
        if (keywords.length === 0) return true;

        const content = post.content.toLowerCase();
        return keywords.some(keyword =>
            content.includes(keyword.toLowerCase()) ||
            post.hashtags.some(tag => tag.toLowerCase().includes(keyword.toLowerCase()))
        );
    });

    // Add some randomization to simulate real-time updates
    const randomPosts = relevantPosts.map(post => ({
        ...post,
        id: `${post.id}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        timestamp: new Date(Date.now() - Math.random() * 3600000).toISOString(), // Random time within last hour
        engagement: {
            likes: Math.floor(Math.random() * 200) + post.engagement.likes,
            retweets: Math.floor(Math.random() * 100) + post.engagement.retweets,
            replies: Math.floor(Math.random() * 50) + post.engagement.replies
        }
    }));

    return randomPosts;
}

// GET /disasters/:id/social-media - Get social media reports for a disaster
router.get('/:id/social-media', authenticateUser, async (req, res) => {
    try {
        const { id: disasterId } = req.params;
        const { keywords, limit = 20, priority, since } = req.query;

        // Parse keywords
        const keywordList = keywords ? keywords.split(',').map(k => k.trim()) : ['flood', 'emergency', 'help', 'rescue'];

        const cacheKey = cache.generateKey('social_media', { disasterId, keywords: keywordList, priority });
        let socialMediaData = await cache.get(cacheKey);

        if (!socialMediaData) {
            try {
                // Try to use real Twitter API if available
                if (process.env.TWITTER_BEARER_TOKEN) {
                    const response = await axios.get('https://api.twitter.com/2/tweets/search/recent', {
                        headers: {
                            'Authorization': `Bearer ${process.env.TWITTER_BEARER_TOKEN}`
                        },
                        params: {
                            query: keywordList.join(' OR '),
                            max_results: Math.min(parseInt(limit), 100),
                            'tweet.fields': 'created_at,author_id,public_metrics,context_annotations',
                            'user.fields': 'username,name,verified'
                        }
                    });

                    socialMediaData = {
                        posts: response.data.data || [],
                        meta: response.data.meta,
                        source: 'twitter_api'
                    };

                    logger.info(`Fetched ${socialMediaData.posts.length} real Twitter posts for disaster ${disasterId}`);
                } else {
                    // Use mock data
                    socialMediaData = {
                        posts: getRealtimeSocialMediaPosts(disasterId, keywordList),
                        source: 'mock_api'
                    };

                    logger.info(`Using mock social media data for disaster ${disasterId}`);
                }

                // Apply priority filtering if specified
                if (priority && socialMediaData.posts) {
                    socialMediaData.posts = socialMediaData.posts.filter(post => {
                        const postPriority = post.priority || determinePriority(post.content || post.text || '');
                        return postPriority === priority;
                    });
                }

                // Apply time filtering if specified
                if (since && socialMediaData.posts) {
                    const sinceDate = new Date(since);
                    socialMediaData.posts = socialMediaData.posts.filter(post => {
                        const postDate = new Date(post.timestamp || post.created_at);
                        return postDate >= sinceDate;
                    });
                }

                // Enhance posts with additional metadata
                if (socialMediaData.posts) {
                    socialMediaData.posts = socialMediaData.posts.map(post => ({
                        ...post,
                        priority: post.priority || determinePriority(post.content || post.text || ''),
                        hashtags: post.hashtags || extractHashtags(post.content || post.text || ''),
                        extracted_location: post.location || extractLocationFromContent(post.content || post.text || ''),
                        disaster_id: disasterId,
                        processed_at: new Date().toISOString()
                    }));
                }

                // Cache the results
                await cache.set(cacheKey, socialMediaData, 300); // Cache for 5 minutes for more real-time feel

            } catch (error) {
                logger.error(`Error fetching social media for disaster ${disasterId}:`, error);

                // Fallback to mock data
                socialMediaData = {
                    posts: getRealtimeSocialMediaPosts(disasterId, keywordList),
                    source: 'mock_fallback',
                    error: 'API request failed, using mock data'
                };
            }
        } else {
            logger.info(`Using cached social media data for disaster ${disasterId}`);
        }

        // Emit real-time update via WebSocket
        const io = req.app.get('io');
        io.to(`disaster_${disasterId}`).emit('social_media_updated', {
            disaster_id: disasterId,
            new_posts: socialMediaData.posts?.slice(0, 5) || [], // Send latest 5 posts
            total_count: socialMediaData.posts?.length || 0,
            timestamp: new Date().toISOString()
        });

        res.json({
            disaster_id: disasterId,
            data: socialMediaData.posts || [],
            meta: {
                total_count: socialMediaData.posts?.length || 0,
                keywords: keywordList,
                priority_filter: priority,
                source: socialMediaData.source,
                cached: !!socialMediaData,
                last_updated: new Date().toISOString()
            }
        });

    } catch (error) {
        logger.error(`Error in GET /disasters/${req.params.id}/social-media:`, error);
        res.status(500).json({
            error: 'Failed to fetch social media data',
            message: error.message
        });
    }
});

// GET /disasters/:id/social-media/priority - Get posts by priority level
router.get('/:id/social-media/priority', authenticateUser, async (req, res) => {
    try {
        const { id: disasterId } = req.params;
        const { level = 'all' } = req.query;

        const cacheKey = cache.generateKey('social_media_priority', { disasterId, level });
        let priorityData = await cache.get(cacheKey);

        if (!priorityData) {
            const allPosts = getRealtimeSocialMediaPosts(disasterId);

            // Categorize posts by priority
            const categorized = {
                critical: [],
                high: [],
                normal: [],
                low: []
            };

            allPosts.forEach(post => {
                const priority = determinePriority(post.content);
                post.priority = priority;
                categorized[priority].push(post);
            });

            priorityData = level === 'all' ? categorized : { [level]: categorized[level] || [] };

            await cache.set(cacheKey, priorityData, 300); // Cache for 5 minutes
        }

        res.json({
            disaster_id: disasterId,
            priority_level: level,
            data: priorityData,
            meta: {
                timestamp: new Date().toISOString(),
                total_posts: level === 'all'
                    ? Object.values(priorityData).reduce((sum, posts) => sum + posts.length, 0)
                    : priorityData[level]?.length || 0
            }
        });

    } catch (error) {
        logger.error(`Error in GET /disasters/${req.params.id}/social-media/priority:`, error);
        res.status(500).json({
            error: 'Failed to fetch priority social media data',
            message: error.message
        });
    }
});

module.exports = router;
