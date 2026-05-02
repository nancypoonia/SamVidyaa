const Reward = require('../models/Reward');
const Course = require('../models/Course');
const Enrollment = require('../models/Enrollment');
const { parsePagination, applyPaginationHeaders } = require('../utils/pagination');

const isAdminRole = (role) => String(role || '').toUpperCase() === 'ADMIN';

// @desc    Create a new reward
// @route   POST /api/rewards
// @access  Private (Teacher)
const createReward = async (req, res) => {
    try {
        const { course_id, name, description, cost, icon_name } = req.body;

        if (!course_id || !name || !description || !cost) {
            return res.status(400).json({ message: 'Missing required fields' });
        }

        const course = await Course.findById(course_id);
        if (!course) {
            return res.status(404).json({ message: 'Course not found' });
        }

        if (course.instructor.toString() !== req.user._id.toString() && !isAdminRole(req.user.role)) {
            return res.status(401).json({ message: 'Not authorized to add rewards for this course' });
        }

        const newReward = await Reward.create({
            course_id,
            name,
            description,
            cost,
            icon_name: icon_name || 'HiGift',
            createdBy: req.user._id
        });

        res.status(201).json(newReward);
    } catch (error) {
        console.error(error);
        res.status(400).json({ message: 'Failed to create reward' });
    }
};

// @desc    Get all rewards for a specific course
// @route   GET /api/rewards/course/:courseId
// @access  Private 
const getCourseRewards = async (req, res) => {
    try {
        const query = { course_id: req.params.courseId };
        const pagination = parsePagination(req, { defaultLimit: 100, maxLimit: 200 });
        const [total, rewards] = await Promise.all([
            Reward.countDocuments(query),
            Reward.find(query)
                .sort({ cost: 1 })
                .skip(pagination.skip)
                .limit(pagination.limit)
                .lean(),
        ]);

        applyPaginationHeaders(res, { ...pagination, total });
        res.json(rewards);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
};

// @desc    Get all rewards for courses a student is enrolled in
// @route   GET /api/rewards/student
// @access  Private 
const getStudentRewards = async (req, res) => {
    try {
        const pagination = parsePagination(req, { defaultLimit: 100, maxLimit: 200 });
        const enrollments = await Enrollment.find({
            student_id: req.user._id,
            status: { $in: ['ACTIVE', 'APPROVED', 'PENDING'] }
        })
            .select('course_id')
            .lean();

        const courseIds = [...new Set(enrollments.map((enrollment) => enrollment.course_id?.toString()).filter(Boolean))];

        if (!courseIds.length) {
            applyPaginationHeaders(res, { ...pagination, total: 0 });
            return res.json([]);
        }

        const query = { course_id: { $in: courseIds } };
        const [total, rewards] = await Promise.all([
            Reward.countDocuments(query),
            Reward.find(query)
                .populate('course_id', 'course_name')
                .sort({ cost: 1 })
                .skip(pagination.skip)
                .limit(pagination.limit)
                .lean(),
        ]);

        applyPaginationHeaders(res, { ...pagination, total });
            
        res.json(rewards);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
};

// @desc    Delete a reward
// @route   DELETE /api/rewards/:id
// @access  Private (Teacher/Admin)
const deleteReward = async (req, res) => {
    try {
        const reward = await Reward.findById(req.params.id);

        if (!reward) {
            return res.status(404).json({ message: 'Reward not found' });
        }

        if (reward.createdBy.toString() !== req.user._id.toString() && !isAdminRole(req.user.role)) {
            return res.status(401).json({ message: 'Not authorized' });
        }

        await reward.deleteOne();
        res.json({ message: 'Reward removed' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to delete reward' });
    }
};

module.exports = {
    createReward,
    getCourseRewards,
    getStudentRewards,
    deleteReward
};
