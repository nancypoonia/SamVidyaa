const jwt = require('jsonwebtoken');
const User = require('../models/User');

const normalizeRole = (role) => String(role || '').toUpperCase();
const isAdminRole = (role) => normalizeRole(role) === 'ADMIN';
const isInstructorOrAdminRole = (role) => {
    const normalizedRole = normalizeRole(role);
    return normalizedRole === 'ADMIN' || normalizedRole === 'INSTRUCTOR' || normalizedRole === 'TEACHER';
};

const protect = async (req, res, next) => {
    let token;

    if (
        req.headers.authorization &&
        req.headers.authorization.startsWith('Bearer')
    ) {
        try {
            token = req.headers.authorization.split(' ')[1];

            const decoded = jwt.verify(token, process.env.JWT_SECRET);

            req.user = await User.findById(decoded.id).select('-password');
            if (!req.user) {
                return res.status(401).json({ message: 'Not authorized, user not found' });
            }

            next();
        } catch (error) {
            console.error(error);
            return res.status(401).json({ message: 'Not authorized, token failed' });
        }
    }

    if (!token) {
        return res.status(401).json({ message: 'Not authorized, no token' });
    }
};

const admin = (req, res, next) => {
    if (req.user && isAdminRole(req.user.role)) {
        next();
    } else {
        res.status(401).json({ message: 'Not authorized as an admin' });
    }
};

const instructorOrAdmin = (req, res, next) => {
    if (req.user && isInstructorOrAdminRole(req.user.role)) {
        next();
    } else {
        res.status(401).json({ message: 'Not authorized as an instructor or admin' });
    }
};

module.exports = { protect, admin, instructorOrAdmin };
