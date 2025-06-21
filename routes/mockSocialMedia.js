const express = require('express');
const router = express.Router();

// Mock social media data endpoint
const mockSocialMediaPosts = [
    {
        id: 'mock_1',
        post: '#floodrelief Need food in NYC Lower East Side. Water level rising. #emergency #help',
        user: 'citizen1',
        username: '@concerned_citizen',
        timestamp: new Date().toISOString(),
        location: 'Lower East Side, NYC',
        hashtags: ['floodrelief', 'emergency', 'help'],
        priority: 'urgent',
        engagement: { likes: 15, retweets: 8, replies: 3 }
    },
    {
        id: 'mock_2',
        post: 'Red Cross shelter open at 123 Main St. Hot food and blankets available. #disasterrelief #shelter',
        user: 'redcross_volunteer',
        username: '@RC_Volunteer',
        timestamp: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
        location: 'Main St, NYC',
        hashtags: ['disasterrelief', 'shelter'],
        priority: 'normal',
        engagement: { likes: 42, retweets: 18, replies: 5 }
    },
    {
        id: 'mock_3',
        post: 'URGENT: Bridge on Water St is unsafe. Alternative routes: Broadway or FDR Drive. #safety #traffic',
        user: 'traffic_alert',
        username: '@NYTrafficAlert',
        timestamp: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
        location: 'Water St, NYC',
        hashtags: ['safety', 'traffic'],
        priority: 'high',
        engagement: { likes: 67, retweets: 45, replies: 12 }
    },
    {
        id: 'mock_4',
        post: 'Medical team stationed at Central Park. Free checkups for flood victims. #medical #healthcare #relief',
        user: 'medical_volunteer',
        username: '@MedVolunteer',
        timestamp: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
        location: 'Central Park, NYC',
        hashtags: ['medical', 'healthcare', 'relief'],
        priority: 'normal',
        engagement: { likes: 28, retweets: 12, replies: 7 }
    },
    {
        id: 'mock_5',
        post: 'SOS! Family trapped on 4th floor, 456 Water St Apt 4B. Water too high to evacuate. Need rescue boat! #SOS #rescue',
        user: 'trapped_family',
        username: '@HelpUs456',
        timestamp: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
        location: '456 Water St, NYC',
        hashtags: ['SOS', 'rescue'],
        priority: 'critical',
        engagement: { likes: 89, retweets: 67, replies: 23 }
    },
    {
        id: 'mock_6',
        post: 'Power restored to downtown area. Charging stations available at Community Center. #power #update',
        user: 'power_company',
        username: '@ConEd_Updates',
        timestamp: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
        location: 'Downtown NYC',
        hashtags: ['power', 'update'],
        priority: 'normal',
        engagement: { likes: 156, retweets: 34, replies: 8 }
    }
];

// GET /mock-social-media - Mock social media endpoint
router.get('/', (req, res) => {
    try {
        const { keywords, limit = 10, priority } = req.query;

        let filteredPosts = [...mockSocialMediaPosts];

        // Filter by keywords if provided
        if (keywords) {
            const keywordList = keywords.split(',').map(k => k.trim().toLowerCase());
            filteredPosts = filteredPosts.filter(post => {
                const content = post.post.toLowerCase();
                return keywordList.some(keyword =>
                    content.includes(keyword) ||
                    post.hashtags.some(tag => tag.toLowerCase().includes(keyword))
                );
            });
        }

        // Filter by priority if provided
        if (priority) {
            filteredPosts = filteredPosts.filter(post => post.priority === priority);
        }

        // Apply limit
        const limitNum = Math.min(parseInt(limit), 50);
        filteredPosts = filteredPosts.slice(0, limitNum);

        // Add some randomization to simulate real-time updates
        const randomizedPosts = filteredPosts.map(post => ({
            ...post,
            id: `${post.id}_${Date.now()}_${Math.random().toString(36).substr(2, 3)}`,
            timestamp: new Date(Date.now() - Math.random() * 3600000).toISOString(),
            engagement: {
                likes: post.engagement.likes + Math.floor(Math.random() * 10),
                retweets: post.engagement.retweets + Math.floor(Math.random() * 5),
                replies: post.engagement.replies + Math.floor(Math.random() * 3)
            }
        }));

        res.json({
            posts: randomizedPosts,
            meta: {
                total_count: randomizedPosts.length,
                keywords: keywords ? keywords.split(',') : [],
                priority_filter: priority,
                source: 'mock_api',
                timestamp: new Date().toISOString()
            }
        });

    } catch (error) {
        res.status(500).json({
            error: 'Mock social media API error',
            message: error.message
        });
    }
});

// GET /mock-social-media/trending - Mock trending hashtags
router.get('/trending', (req, res) => {
    try {
        const trendingHashtags = [
            { tag: 'floodrelief', count: 1250, trend: 'up' },
            { tag: 'emergency', count: 890, trend: 'up' },
            { tag: 'NYC', count: 2340, trend: 'stable' },
            { tag: 'help', count: 567, trend: 'up' },
            { tag: 'safety', count: 445, trend: 'down' },
            { tag: 'rescue', count: 234, trend: 'up' },
            { tag: 'shelter', count: 189, trend: 'stable' },
            { tag: 'medical', count: 123, trend: 'up' }
        ];

        res.json({
            trending: trendingHashtags,
            updated_at: new Date().toISOString(),
            source: 'mock_api'
        });

    } catch (error) {
        res.status(500).json({
            error: 'Mock trending API error',
            message: error.message
        });
    }
});

module.exports = router;
