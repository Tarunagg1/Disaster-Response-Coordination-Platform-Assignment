-- Disaster Response Coordination Platform
-- Supabase Database Schema

-- Enable PostGIS extension for geospatial data
CREATE EXTENSION IF NOT EXISTS postgis;

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Drop tables if they exist (for development)
DROP TABLE IF EXISTS cache CASCADE;
DROP TABLE IF EXISTS reports CASCADE;
DROP TABLE IF EXISTS resources CASCADE;
DROP TABLE IF EXISTS disasters CASCADE;

-- Disasters table
CREATE TABLE disasters (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(255) NOT NULL,
    location_name TEXT NOT NULL,
    location GEOGRAPHY(POINT, 4326), -- PostGIS geography type for lat/lng
    description TEXT NOT NULL,
    tags TEXT[] DEFAULT '{}', -- Array of tags
    owner_id VARCHAR(100) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    audit_trail JSONB DEFAULT '[]'::jsonb -- JSON array of audit entries
);

-- Resources table
CREATE TABLE resources (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    disaster_id UUID NOT NULL REFERENCES disasters(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    location_name TEXT NOT NULL,
    location GEOGRAPHY(POINT, 4326), -- PostGIS geography type
    type VARCHAR(100) NOT NULL, -- shelter, medical, food, supplies, evacuation, etc.
    capacity INTEGER DEFAULT 0,
    current_occupancy INTEGER DEFAULT 0,
    contact VARCHAR(255),
    amenities TEXT[] DEFAULT '{}', -- Array of amenities
    status VARCHAR(50) DEFAULT 'active', -- active, inactive, full
    created_by VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Reports table (for user-submitted reports)
CREATE TABLE reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    disaster_id UUID NOT NULL REFERENCES disasters(id) ON DELETE CASCADE,
    user_id VARCHAR(100) NOT NULL,
    content TEXT NOT NULL,
    image_url TEXT,
    verification_status VARCHAR(50) DEFAULT 'pending', -- pending, verified, rejected
    location_name TEXT,
    location GEOGRAPHY(POINT, 4326),
    priority VARCHAR(20) DEFAULT 'normal', -- critical, high, normal, low
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Cache table for API responses
CREATE TABLE cache (
    key VARCHAR(255) PRIMARY KEY,
    value JSONB NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance

-- Disasters indexes
CREATE INDEX idx_disasters_owner_id ON disasters(owner_id);
CREATE INDEX idx_disasters_created_at ON disasters(created_at DESC);
CREATE INDEX idx_disasters_tags ON disasters USING GIN(tags);
CREATE INDEX idx_disasters_location ON disasters USING GIST(location);

-- Resources indexes
CREATE INDEX idx_resources_disaster_id ON resources(disaster_id);
CREATE INDEX idx_resources_type ON resources(type);
CREATE INDEX idx_resources_status ON resources(status);
CREATE INDEX idx_resources_location ON resources USING GIST(location);
CREATE INDEX idx_resources_created_at ON resources(created_at DESC);

-- Reports indexes
CREATE INDEX idx_reports_disaster_id ON reports(disaster_id);
CREATE INDEX idx_reports_user_id ON reports(user_id);
CREATE INDEX idx_reports_verification_status ON reports(verification_status);
CREATE INDEX idx_reports_priority ON reports(priority);
CREATE INDEX idx_reports_location ON reports USING GIST(location);
CREATE INDEX idx_reports_created_at ON reports(created_at DESC);

-- Cache indexes
CREATE INDEX idx_cache_expires_at ON cache(expires_at);

-- Functions for geospatial queries

-- Function to find nearby resources
CREATE OR REPLACE FUNCTION find_nearby_resources(
    disaster_id UUID,
    center_lat FLOAT,
    center_lng FLOAT,
    radius_meters INTEGER DEFAULT 10000
)
RETURNS TABLE (
    id UUID,
    disaster_id UUID,
    name VARCHAR(255),
    location_name TEXT,
    location GEOGRAPHY,
    type VARCHAR(100),
    capacity INTEGER,
    current_occupancy INTEGER,
    contact VARCHAR(255),
    amenities TEXT[],
    status VARCHAR(50),
    created_by VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE,
    distance_meters FLOAT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        r.id,
        r.disaster_id,
        r.name,
        r.location_name,
        r.location,
        r.type,
        r.capacity,
        r.current_occupancy,
        r.contact,
        r.amenities,
        r.status,
        r.created_by,
        r.created_at,
        r.updated_at,
        ST_Distance(r.location, ST_SetSRID(ST_Point(center_lng, center_lat), 4326)) as distance_meters
    FROM resources r
    WHERE r.disaster_id = find_nearby_resources.disaster_id
    AND ST_DWithin(r.location, ST_SetSRID(ST_Point(center_lng, center_lat), 4326), radius_meters)
    ORDER BY distance_meters ASC;
END;
$$ LANGUAGE plpgsql;

-- Function to find disasters within a geographic area
CREATE OR REPLACE FUNCTION find_disasters_in_area(
    center_lat FLOAT,
    center_lng FLOAT,
    radius_meters INTEGER DEFAULT 50000
)
RETURNS TABLE (
    id UUID,
    title VARCHAR(255),
    location_name TEXT,
    location GEOGRAPHY,
    description TEXT,
    tags TEXT[],
    owner_id VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE,
    distance_meters FLOAT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        d.id,
        d.title,
        d.location_name,
        d.location,
        d.description,
        d.tags,
        d.owner_id,
        d.created_at,
        d.updated_at,
        ST_Distance(d.location, ST_SetSRID(ST_Point(center_lng, center_lat), 4326)) as distance_meters
    FROM disasters d
    WHERE d.location IS NOT NULL
    AND ST_DWithin(d.location, ST_SetSRID(ST_Point(center_lng, center_lat), 4326), radius_meters)
    ORDER BY distance_meters ASC;
END;
$$ LANGUAGE plpgsql;

-- Function to clean expired cache entries
CREATE OR REPLACE FUNCTION clean_expired_cache()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM cache WHERE expires_at < NOW();
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Insert sample data for testing

-- Sample disasters
INSERT INTO disasters (id, title, location_name, location, description, tags, owner_id, audit_trail) VALUES
(
    '00000000-0000-0000-0000-000000000001',
    'NYC Flood Emergency',
    'Manhattan, NYC',
    ST_SetSRID(ST_Point(-74.0060, 40.7128), 4326),
    'Severe flooding in Manhattan affecting multiple neighborhoods. Water levels rising rapidly.',
    '{"flood", "urgent", "manhattan"}',
    'netrunnerX',
    '[{"action": "create", "user_id": "netrunnerX", "timestamp": "2025-06-21T10:00:00Z"}]'::jsonb
),
(
    '00000000-0000-0000-0000-000000000002',
    'California Wildfire',
    'Los Angeles, CA',
    ST_SetSRID(ST_Point(-118.2437, 34.0522), 4326),
    'Large wildfire spreading rapidly through the hills near Los Angeles.',
    '{"wildfire", "evacuation", "california"}',
    'reliefAdmin',
    '[{"action": "create", "user_id": "reliefAdmin", "timestamp": "2025-06-21T09:30:00Z"}]'::jsonb
);

-- Sample resources
INSERT INTO resources (disaster_id, name, location_name, location, type, capacity, current_occupancy, contact, amenities, status, created_by) VALUES
(
    '00000000-0000-0000-0000-000000000001',
    'Red Cross Emergency Shelter',
    'Lower East Side Community Center, NYC',
    ST_SetSRID(ST_Point(-73.9857, 40.7831), 4326),
    'shelter',
    150,
    45,
    '+1-555-0123',
    '{"food", "medical", "blankets", "charging_stations"}',
    'active',
    'reliefAdmin'
),
(
    '00000000-0000-0000-0000-000000000001',
    'Manhattan General Hospital',
    'Manhattan General Hospital, NYC',
    ST_SetSRID(ST_Point(-73.9776, 40.7831), 4326),
    'medical',
    200,
    120,
    '+1-555-0456',
    '{"emergency_care", "surgery", "pharmacy", "ambulance"}',
    'active',
    'netrunnerX'
),
(
    '00000000-0000-0000-0000-000000000002',
    'Evacuation Center West',
    'Santa Monica Community Center, CA',
    ST_SetSRID(ST_Point(-118.4912, 34.0195), 4326),
    'evacuation',
    300,
    180,
    '+1-555-0567',
    '{"temporary_housing", "food", "medical", "pet_care"}',
    'active',
    'reliefAdmin'
);

-- Sample reports
INSERT INTO reports (disaster_id, user_id, content, verification_status, location_name, location, priority) VALUES
(
    '00000000-0000-0000-0000-000000000001',
    'citizen1',
    'Flooding on Water Street reaching 3 feet. Several cars stranded. Need immediate assistance.',
    'pending',
    'Water Street, NYC',
    ST_SetSRID(ST_Point(-74.0070, 40.7050), 4326),
    'high'
),
(
    '00000000-0000-0000-0000-000000000001',
    'volunteer1',
    'Shelter at community center is at capacity. Additional space needed urgently.',
    'verified',
    'Lower East Side, NYC',
    ST_SetSRID(ST_Point(-73.9857, 40.7831), 4326),
    'critical'
);

-- Create a trigger to automatically update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply the trigger to relevant tables
CREATE TRIGGER update_disasters_updated_at BEFORE UPDATE ON disasters
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_resources_updated_at BEFORE UPDATE ON resources
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_reports_updated_at BEFORE UPDATE ON reports
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS (Row Level Security) policies (optional - for multi-tenant setup)
-- Uncomment these if you want to implement row-level security

-- ALTER TABLE disasters ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE resources ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

-- Example RLS policy (customize based on your authentication system)
-- CREATE POLICY "Users can view all disasters" ON disasters FOR SELECT USING (true);
-- CREATE POLICY "Users can insert their own disasters" ON disasters FOR INSERT WITH CHECK (owner_id = current_user);
-- CREATE POLICY "Users can update their own disasters" ON disasters FOR UPDATE USING (owner_id = current_user);

-- Grant permissions (adjust based on your Supabase setup)
-- GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
-- GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
-- GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
