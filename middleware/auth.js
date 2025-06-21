// Mock authentication middleware for development
const mockUsers = {
    'netrunnerX': {
        id: 'netrunnerX',
        role: 'admin',
        name: 'Net Runner X'
    },
    'reliefAdmin': {
        id: 'reliefAdmin',
        role: 'admin',
        name: 'Relief Administrator'
    },
    'citizen1': {
        id: 'citizen1',
        role: 'contributor',
        name: 'Citizen Reporter 1'
    },
    'volunteer1': {
        id: 'volunteer1',
        role: 'contributor',
        name: 'Volunteer Helper'
    }
};

const authenticateUser = (req, res, next) => {
    // In a real application, this would validate JWT tokens or session cookies
    // For this assignment, we'll use a simple header-based authentication

    const userId = req.headers['x-user-id'] || 'citizen1'; // Default to citizen1
    const user = mockUsers[userId];

    if (!user) {
        return res.status(401).json({
            error: 'Authentication failed',
            message: 'Invalid user ID'
        });
    }

    req.user = user;
    next();
};

const requireRole = (roles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                error: 'Authentication required',
                message: 'User not authenticated'
            });
        }

        const userRoles = Array.isArray(roles) ? roles : [roles];
        if (!userRoles.includes(req.user.role)) {
            return res.status(403).json({
                error: 'Insufficient permissions',
                message: `Required role: ${userRoles.join(' or ')}`
            });
        }

        next();
    };
};

module.exports = {
    authenticateUser,
    requireRole,
    mockUsers
};
