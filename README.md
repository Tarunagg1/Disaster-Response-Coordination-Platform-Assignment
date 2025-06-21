# 🚨 Disaster Response Coordination Platform

A comprehensive backend-heavy MERN stack application for disaster response coordination that aggregates real-time data to aid disaster management teams.

## 🌟 Features

### Core Disaster Management
- **Robust CRUD Operations**: Full disaster lifecycle management with ownership and audit trail tracking
- **Real-time Updates**: WebSocket-powered live updates for disasters, social media, and resources
- **Mock Authentication**: Role-based access control with admin and contributor roles

### AI-Powered Location Intelligence
- **Google Gemini Integration**: Extract location names from disaster descriptions using AI
- **Multi-Provider Geocoding**: Support for Google Maps, Mapbox, and OpenStreetMap services
- **Intelligent Fallbacks**: Graceful degradation to mock data when APIs are unavailable

### Real-Time Social Media Monitoring
- **Multi-Source Support**: Twitter API, Bluesky, and comprehensive mock data
- **Priority Classification**: Automatic urgency detection based on content keywords
- **Hashtag Analysis**: Extract and categorize relevant hashtags
- **Location Extraction**: AI-powered location detection from social media posts

### Geospatial Resource Management
- **Supabase PostGIS**: Advanced geospatial queries with distance-based filtering
- **Resource Types**: Shelters, medical facilities, food distribution, supplies, evacuation centers
- **Capacity Tracking**: Real-time occupancy and availability monitoring
- **Proximity Search**: Find resources within specified radius

### Official Updates Aggregation
- **Web Scraping**: Automated fetching from FEMA, Red Cross, NWS, and local emergency services
- **RSS Feed Integration**: Support for official government and relief organization feeds
- **Source Verification**: Track update sources and reliability scores
- **Priority Filtering**: Categorize updates by urgency and importance

### Image Verification System
- **Google Gemini Vision**: AI-powered authenticity analysis for disaster images
- **Manipulation Detection**: Identify edited or fake disaster imagery
- **Context Validation**: Verify if images match reported disaster scenarios
- **Bulk Processing**: Handle multiple image verifications simultaneously

### Backend Optimization
- **Supabase Caching**: Intelligent API response caching with TTL management
- **Geospatial Indexing**: Optimized PostGIS indexes for fast location-based queries
- **Structured Logging**: Comprehensive audit trails and operational logging
- **Rate Limiting**: Protection against API abuse and external service limits
- **Error Handling**: Graceful fallbacks and comprehensive error management

## 🏗️ Architecture

### Backend (Node.js + Express.js)
```
├── server.js              # Main application entry point
├── config/
│   └── supabase.js        # Database configuration
├── routes/
│   ├── disasters.js       # Disaster CRUD operations
│   ├── geocoding.js       # Location extraction & geocoding
│   ├── socialMedia.js     # Social media monitoring
│   ├── resources.js       # Resource management
│   ├── officialUpdates.js # Government/relief updates
│   ├── verification.js    # Image authenticity verification
│   └── mockSocialMedia.js # Mock social media endpoints
├── middleware/
│   └── auth.js            # Mock authentication
├── utils/
│   ├── logger.js          # Winston logging
│   └── cache.js           # Supabase caching service
└── public/
    └── index.html         # Frontend test interface
```

### Database (Supabase/PostgreSQL)
```
├── disasters              # Main disaster records
├── resources             # Available resources and facilities
├── reports               # User-submitted reports
└── cache                 # API response caching
```

### External Integrations
- **Google Gemini AI**: Location extraction and image verification
- **Mapping Services**: Google Maps, Mapbox, OpenStreetMap geocoding
- **Social Media**: Twitter API, Bluesky API, comprehensive mocks
- **Official Sources**: FEMA, Red Cross, National Weather Service

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ 
- Supabase account (optional - works with mock data)
- Google Gemini API key (optional - falls back to mock responses)

### Installation

1. **Clone and Install**
   ```bash
   cd disaster-response-platform
   npm install
   ```

2. **Environment Setup**
   ```bash
   cp .env.example .env
   # Edit .env with your API keys (optional)
   ```

3. **Database Setup (Optional)**
   - Create Supabase project at https://supabase.com
   - Run the SQL schema from `database/schema.sql`
   - Update `.env` with your Supabase credentials

4. **Start Development Server**
   ```bash
   npm run dev
   ```

5. **Access Frontend**
   - Open http://localhost:5000 in your browser
   - Test all API endpoints through the web interface

## 🔧 Configuration

### Environment Variables
```env
# Core Settings
NODE_ENV=development
PORT=5000

# Database (Optional - uses mock data if not provided)
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_key

# AI Services (Optional - uses mock responses if not provided)
GEMINI_API_KEY=your_gemini_api_key

# Mapping Services (Optional - uses OpenStreetMap fallback)
GOOGLE_MAPS_API_KEY=your_google_maps_key
MAPBOX_API_KEY=your_mapbox_key

# Social Media (Optional - uses mock data if not provided)
TWITTER_BEARER_TOKEN=your_twitter_token

# Frontend
CLIENT_URL=http://localhost:3000

# Caching
CACHE_TTL=3600
USE_MOCK_DATA=true
```

## 📡 API Endpoints

### Disasters
- `GET /api/disasters` - List all disasters
- `POST /api/disasters` - Create new disaster
- `GET /api/disasters/:id` - Get specific disaster
- `PUT /api/disasters/:id` - Update disaster
- `DELETE /api/disasters/:id` - Delete disaster (admin only)

### Location & Geocoding
- `POST /api/geocode` - Extract location from text and geocode
- `GET /api/geocode/reverse` - Reverse geocode coordinates

### Social Media Monitoring
- `GET /api/disasters/:id/social-media` - Get social media reports
- `GET /api/disasters/:id/social-media/priority` - Filter by priority
- `GET /api/mock-social-media` - Mock social media endpoint

### Resource Management
- `GET /api/disasters/:id/resources` - Find nearby resources
- `POST /api/disasters/:id/resources` - Add new resource
- `PUT /api/disasters/:id/resources/:resourceId` - Update resource
- `GET /api/disasters/:id/resources/types` - Get resource types

### Official Updates
- `GET /api/disasters/:id/official-updates` - Get official updates
- `GET /api/disasters/:id/official-updates/sources` - List sources
- `GET /api/disasters/:id/official-updates/summary` - Get summary

### Image Verification
- `POST /api/disasters/:id/verify-image` - Verify single image
- `POST /api/disasters/:id/verify-images` - Bulk verify images
- `GET /api/disasters/:id/verifications` - Get verification history

## 🔄 Real-Time Features

### WebSocket Events
```javascript
// Disaster updates
socket.on('disaster_updated', (data) => {
  // data.action: 'create', 'update', 'delete'
  // data.data: disaster object
});

// Social media updates
socket.on('social_media_updated', (data) => {
  // data.new_posts: array of latest posts
  // data.total_count: number of posts
});

// Resource updates
socket.on('resources_updated', (data) => {
  // data.resource_count: number of resources
  // data.center_location: search center
});
```

## 🛡️ Authentication

The platform uses mock authentication for development:

- **Headers**: Include `X-User-Id` header with user ID
- **Users**: `netrunnerX`, `reliefAdmin` (admins), `citizen1`, `volunteer1` (contributors)
- **Roles**: Admin users can delete disasters and access all resources

## 🗃️ Database Schema

### Disasters Table
```sql
- id (UUID)
- title (VARCHAR)
- location_name (TEXT)
- location (GEOGRAPHY POINT)
- description (TEXT)
- tags (TEXT[])
- owner_id (VARCHAR)
- audit_trail (JSONB)
- created_at, updated_at (TIMESTAMP)
```

### Resources Table
```sql
- id (UUID)
- disaster_id (UUID FK)
- name (VARCHAR)
- location (GEOGRAPHY POINT)
- type (VARCHAR)
- capacity, current_occupancy (INTEGER)
- amenities (TEXT[])
- status (VARCHAR)
```

### Advanced Geospatial Queries
```sql
-- Find resources within 10km
SELECT * FROM find_nearby_resources(
  disaster_id, lat, lng, radius_meters
);

-- Find disasters in area
SELECT * FROM find_disasters_in_area(
  center_lat, center_lng, radius_meters
);
```

## 🎨 Frontend Interface

The included frontend provides a comprehensive testing interface:

- **Tabbed Navigation**: Organized by feature area
- **Real-time Updates**: Live WebSocket notifications
- **User Switching**: Test different user roles
- **Form Validation**: Complete API testing capabilities
- **Response Display**: Formatted JSON and card-based views

## 🔧 AI Coding Tools Used

This project was built using AI coding assistants:

- **Route Generation**: AI-generated Express.js routes with comprehensive error handling
- **Supabase Integration**: AI-assisted database queries and caching logic
- **WebSocket Implementation**: AI-generated real-time update system
- **Geocoding Logic**: AI-powered multi-provider geocoding with intelligent fallbacks
- **Mock Data Systems**: Comprehensive mock APIs for testing without external dependencies

## 📊 Performance Features

- **Caching Strategy**: 1-hour TTL for API responses, 5-minute TTL for social media
- **Geospatial Indexing**: GIST indexes on location columns for fast proximity queries
- **Connection Pooling**: Optimized Supabase connection management
- **Rate Limiting**: 100 requests per 15 minutes per IP
- **Error Recovery**: Graceful fallbacks to mock data when external services fail

## 🌐 Deployment

### Backend (Render/Railway)
```bash
# Build command
npm install

# Start command
npm start

# Environment variables
PORT=5000
NODE_ENV=production
SUPABASE_URL=your_production_url
```

### Frontend (Vercel/Netlify)
- Deploy the `public` folder as a static site
- Configure API base URL for production backend

## 🔍 Testing

### Manual Testing
1. Start the development server: `npm run dev`
2. Open http://localhost:5000
3. Test each tab in the frontend interface
4. Monitor real-time updates in the bottom panel
5. Check browser network tab for API responses

### Sample Test Data
```javascript
// Create disaster
{
  "title": "NYC Flood Emergency",
  "location_name": "Manhattan, NYC",
  "description": "Severe flooding affecting Lower Manhattan",
  "tags": ["flood", "urgent", "manhattan"]
}

// Test geocoding
"Heavy flooding reported in Manhattan near Central Park"

// Test image verification
"http://example.com/flood-damage.jpg"
```

## 🤝 Contributing

1. Fork the repository
2. Create feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

For issues and questions:
- Check the browser console for error messages
- Verify environment variables are set correctly
- Ensure all required npm packages are installed
- Test with mock data before connecting external APIs

---

**Built with ❤️ for disaster response coordination and emergency management teams worldwide.**
