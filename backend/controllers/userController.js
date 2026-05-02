const User = require('../models/User');
const Course = require('../models/Course');
const Reward = require('../models/Reward');
const PointTransaction = require('../models/PointTransaction');
const { countAnalyticsCoursesExcludingCodes } = require('../services/analyticsCourseService');
const { createUserAccount, normalizeRole } = require('../services/userAccountService');

// @desc    Get public platform stats for landing page
// @route   GET /api/users/public-stats
// @access  Public
const getPublicPlatformStats = async (_req, res) => {
    try {
        const [totalUsers, appCourseStats] = await Promise.all([
            User.countDocuments(),
            Course.find().select('course_code').lean(),
        ]);
        const analyticsCourseCount = await countAnalyticsCoursesExcludingCodes(
            appCourseStats.map((course) => course.course_code)
        );
        const totalCourses = appCourseStats.length + analyticsCourseCount;

        res.json({ totalUsers, totalCourses });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to fetch public platform stats' });
    }
};

// @desc    Get current user's points
// @route   GET /api/users/me/points
// @access  Private
const getUserPoints = async (req, res) => {
    try {
        const user = await User.findById(req.user._id).select('points');
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        res.json({ points: user.points || 0 });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to fetch points' });
    }
};

// @desc    Claim a reward (deduct points)
// @route   POST /api/users/claim-reward
// @access  Private
const claimReward = async (req, res) => {
    try {
        const { rewardId } = req.body;

        if (!rewardId) {
            return res.status(400).json({ message: 'Reward ID is required' });
        }

        const reward = await Reward.findById(rewardId);
        if (!reward) {
            return res.status(404).json({ message: 'Reward not found' });
        }

        const cost = reward.cost;
        const rewardName = reward.name;

        if (cost <= 0) {
            return res.status(400).json({ message: 'Invalid reward cost' });
        }

        const user = await User.findById(req.user._id);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        if ((user.points || 0) < cost) {
            return res.status(400).json({ message: 'Not enough points' });
        }

        user.points = (user.points || 0) - cost;
        await user.save();

        await PointTransaction.create({
            user_id: user._id,
            amount: -cost,
            reason: `Claimed reward: ${rewardName}`
        });

        res.json({
            message: `Successfully claimed "${rewardName}"!`,
            points: user.points,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to claim reward' });
    }
};

// @desc    Create an instructor/admin account
// @route   POST /api/users/staff
// @access  Private/Admin
const createPrivilegedUser = async (req, res) => {
    try {
        const { name, email, password, role, username, institution } = req.body;
        const assignedRole = normalizeRole(role, '');

        if (!['INSTRUCTOR', 'ADMIN'].includes(assignedRole)) {
            return res.status(400).json({ message: 'Only instructor or admin accounts can be created here' });
        }

        const user = await createUserAccount({
            name,
            email,
            password,
            role: assignedRole,
            username,
            institution,
        });

        res.status(201).json({
            _id: user._id,
            name: user.name,
            username: user.username,
            email: user.email,
            role: user.role,
            institution: user.institution,
            createdAt: user.createdAt,
        });
    } catch (error) {
        console.error('Privileged user creation error:', error);
        res.status(error.statusCode || 400).json({ message: error.message || 'Failed to create user' });
    }
};

module.exports = { getUserPoints, claimReward, getPublicPlatformStats, createPrivilegedUser };
