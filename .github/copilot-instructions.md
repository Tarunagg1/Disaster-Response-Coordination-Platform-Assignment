<!-- Use this file to provide workspace-specific custom instructions to Copilot. For more details, visit https://code.visualstudio.com/docs/copilot/copilot-customization#_use-a-githubcopilotinstructionsmd-file -->

# Disaster Response Coordination Platform - Copilot Instructions

This is a comprehensive Node.js/Express.js backend application for disaster response coordination with the following technical characteristics:

## Project Context

- **Technology Stack**: Node.js, Express.js, Supabase (PostgreSQL), Socket.IO, Google Gemini AI
- **Architecture**: RESTful API with real-time WebSocket updates and geospatial queries
- **External Integrations**: Google Gemini, Google Maps/Mapbox/OpenStreetMap, Twitter API, web scraping
- **Database**: Supabase with PostGIS for geospatial data

## Code Style & Patterns

- Use async/await for all asynchronous operations
- Implement comprehensive error handling with graceful fallbacks to mock data
- Follow RESTful API conventions with proper HTTP status codes
- Use Winston for structured logging with correlation IDs
- Implement caching using Supabase with TTL-based expiration
- Use middleware pattern for authentication and rate limiting

## Key Features to Maintain

1. **Geospatial Queries**: Always use PostGIS functions for location-based searches
2. **Real-time Updates**: Emit WebSocket events for all data mutations
3. **AI Integration**: Use Google Gemini for location extraction and image verification
4. **Caching Strategy**: Cache external API responses with appropriate TTL
5. **Mock Data Fallbacks**: Provide realistic mock responses when external services fail
6. **Rate Limiting**: Protect against API abuse with express-rate-limit

## Database Conventions

- Use UUID for all primary keys
- Store coordinates as PostGIS GEOGRAPHY(POINT, 4326) type
- Use JSONB for flexible data like audit trails and amenities
- Implement soft deletes where appropriate
- Create proper indexes for geospatial queries

## API Design Patterns

- Prefix all routes with `/api/`
- Use nested routes for related resources (e.g., `/disasters/:id/resources`)
- Include metadata in responses (pagination, filters, timestamps)
- Implement proper CORS and security headers
- Support query parameters for filtering and pagination

## Error Handling

- Always provide meaningful error messages
- Log errors with structured data
- Return appropriate HTTP status codes
- Implement circuit breaker pattern for external APIs
- Gracefully degrade to mock data when external services are unavailable

## Testing Considerations

- Include mock authentication with multiple user roles
- Provide comprehensive mock data for all endpoints
- Support both real and mock external API integrations
- Include sample data that demonstrates all features

## Security & Performance

- Use helmet for security headers
- Implement rate limiting on all API endpoints
- Validate and sanitize all user inputs
- Use prepared statements for database queries
- Implement proper session management

When generating code for this project, prioritize reliability, error handling, and user experience over feature completeness.
