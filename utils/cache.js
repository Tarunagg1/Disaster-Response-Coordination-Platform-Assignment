const supabase = require('../config/supabase');
const logger = require('./logger');

class CacheService {
    constructor() {
        this.defaultTTL = parseInt(process.env.CACHE_TTL) || 3600; // 1 hour default
    }

    async get(key) {
        try {
            const { data, error } = await supabase
                .from('cache')
                .select('value, expires_at')
                .eq('key', key)
                .single();

            if (error || !data) {
                return null;
            }

            // Check if cache has expired
            if (new Date(data.expires_at) < new Date()) {
                // Delete expired cache entry
                await this.delete(key);
                return null;
            }

            logger.info(`Cache hit for key: ${key}`);
            return data.value;
        } catch (error) {
            logger.error(`Cache get error for key ${key}:`, error);
            return null;
        }
    }

    async set(key, value, ttlSeconds = null) {
        try {
            const ttl = ttlSeconds || this.defaultTTL;
            const expiresAt = new Date(Date.now() + ttl * 1000);

            const { error } = await supabase
                .from('cache')
                .upsert({
                    key,
                    value,
                    expires_at: expiresAt.toISOString()
                });

            if (error) {
                throw error;
            }

            logger.info(`Cache set for key: ${key}, TTL: ${ttl}s`);
            return true;
        } catch (error) {
            logger.error(`Cache set error for key ${key}:`, error);
            return false;
        }
    }

    async delete(key) {
        try {
            const { error } = await supabase
                .from('cache')
                .delete()
                .eq('key', key);

            if (error) {
                throw error;
            }

            logger.info(`Cache deleted for key: ${key}`);
            return true;
        } catch (error) {
            logger.error(`Cache delete error for key ${key}:`, error);
            return false;
        }
    }

    async clear() {
        try {
            const { error } = await supabase
                .from('cache')
                .delete()
                .lt('expires_at', new Date().toISOString());

            if (error) {
                throw error;
            }

            logger.info('Expired cache entries cleared');
            return true;
        } catch (error) {
            logger.error('Cache clear error:', error);
            return false;
        }
    }

    generateKey(prefix, params) {
        const paramString = typeof params === 'object'
            ? JSON.stringify(params)
            : String(params);
        return `${prefix}:${Buffer.from(paramString).toString('base64')}`;
    }
}

module.exports = new CacheService();
