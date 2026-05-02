const User = require('../models/User');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { createUserAccount } = require('../services/userAccountService');
const { verifyGoogleIdToken } = require('../services/googleAuthService');

const generateToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET, {
        expiresIn: '30d',
    });
};

const registerUser = async (req, res) => {
    try {
        const { name, email, password, institution, enrollment_number, username } = req.body;

        // Removed email restriction for general testing
        // if (!email.endsWith('@bmu.edu.in')) {
        //     return res.status(400).json({ message: 'Only @bmu.edu.in emails are allowed' });
        // }

        const user = await createUserAccount({
            name,
            email,
            password,
            role: 'STUDENT',
            username,
            institution,
            enrollment_number,
        });

        if (user) {
            res.status(201).json({
                _id: user._id,
                name: user.name,
                username: user.username,
                email: user.email,
                role: user.role,
                institution: user.institution,
                token: generateToken(user._id),
            });
        } else {
            res.status(400).json({ message: 'Invalid user data' });
        }
    } catch (error) {
        console.error("Registration error:", error);
        res.status(error.statusCode || 400).json({ message: error.message || 'Registration failed' });
    }
};

const authUser = async (req, res) => {
    const { email, password } = req.body;

    const user = await User.findOne({ email });

    if (user && (await user.matchPassword(password))) {
        res.json({
            _id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            token: generateToken(user._id),
        });
    } else {
        res.status(401).json({ message: 'Invalid email or password' });
    }
};

const authGoogleUser = async (req, res) => {
    try {
        const { credential } = req.body;
        const googleProfile = await verifyGoogleIdToken(credential);
        let user = await User.findOne({ email: googleProfile.email });
        const isNewUser = !user;

        if (!user) {
            user = await createUserAccount({
                name: googleProfile.name,
                email: googleProfile.email,
                password: crypto.randomBytes(32).toString('hex'),
                role: 'STUDENT',
            });
        }

        const googleUpdates = {
            google_id: googleProfile.googleId,
            avatar_url: googleProfile.picture,
            auth_provider: isNewUser ? 'google' : user.auth_provider || 'google',
            last_login: new Date(),
        };

        await User.updateOne({ _id: user._id }, { $set: googleUpdates });
        Object.assign(user, googleUpdates);

        res.json({
            _id: user._id,
            name: user.name,
            username: user.username,
            email: user.email,
            role: user.role,
            institution: user.institution,
            avatar_url: user.avatar_url,
            token: generateToken(user._id),
        });
    } catch (error) {
        console.error('Google auth error:', {
            message: error.message,
            statusCode: error.statusCode,
            details: error.details,
        });
        res.status(error.statusCode || 500).json({
            message: error.message || 'Google login failed',
            details: process.env.NODE_ENV === 'production' ? undefined : error.details,
        });
    }
};

module.exports = { registerUser, authUser, authGoogleUser };
