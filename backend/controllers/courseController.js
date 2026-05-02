const Course = require('../models/Course');
const Enrollment = require('../models/Enrollment');
const StudentProgress = require('../models/StudentProgress');
const Module = require('../models/Module');
const Task = require('../models/Task');
const TaskCompletion = require('../models/TaskCompletion');
const DesktopTaskResult = require('../models/DesktopTaskResult');
const CodingQuestion = require('../models/CodingQuestion');
const multer = require('multer');
const path = require('path');
const archive = require('archiver');
const { clearCourseHandoutVectors, resolveUploadPath, syncCourseHandout } = require('../services/courseHandoutIngestionService');
const {
    buildAnalyticsTeacherStatsForUser,
    buildCourseAnalyticsResponseFromDocument,
    findAnalyticsCourseByCode,
    findAnalyticsCourseById,
    isAnalyticsCourseId,
    listAnalyticsCoursesForUser,
    mapAnalyticsCourseSummary,
    parseAnalyticsCourseId,
    updateAnalyticsCourseMetadata,
} = require('../services/analyticsCourseService');
const { ensureDir, removeFileIfPresent } = require('../utils/fileSystem');
const { parsePagination, applyPaginationHeaders } = require('../utils/pagination');

const normalizeRole = (role) => String(role || '').toUpperCase();
const isAdminRole = (role) => normalizeRole(role) === 'ADMIN';
const isStudentRole = (role) => normalizeRole(role) === 'STUDENT';
const isInstructorRole = (role) => {
    const normalizedRole = normalizeRole(role);
    return normalizedRole === 'INSTRUCTOR' || normalizedRole === 'TEACHER';
};

const verifyCourseAccess = async (courseId, user, options = {}) => {
    const { allowStudentReadActive = false } = options;
    const course = await Course.findById(courseId).populate('instructor', 'name email');

    if (!course) {
        return { error: { status: 404, message: 'Course not found' } };
    }

    if (isAdminRole(user.role)) {
        return { course };
    }

    if (course.instructor?._id?.toString() === user._id.toString()) {
        return { course };
    }

    if (allowStudentReadActive && isStudentRole(user.role) && course.is_active) {
        return { course };
    }

    return { error: { status: 401, message: 'Not authorized' } };
};

const userCanAccessAnalyticsCourse = (doc, user) => {
    if (!doc || !user) return false;
    if (isAdminRole(user.role)) return true;

    if (isStudentRole(user.role)) {
        const userEmail = String(user.email || '').trim().toLowerCase();
        return Array.isArray(doc.students) && doc.students.some((student) => (
            String(student.email || '').trim().toLowerCase() === userEmail
        ));
    }

    if (isInstructorRole(user.role)) {
        return String(doc.instructorName || '').trim().toLowerCase() === String(user.name || '').trim().toLowerCase();
    }

    return false;
};

// ---- Multer setup for handout PDFs ----
const handoutStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = path.join(__dirname, '..', 'uploads', 'handouts');
        ensureDir(dir)
            .then(() => cb(null, dir))
            .catch(cb);
    },
    filename: (req, file, cb) => {
        const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
        cb(null, `${unique}${path.extname(file.originalname)}`);
    }
});

const handoutUpload = multer({
    storage: handoutStorage,
    limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB max
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') cb(null, true);
        else cb(new Error('Only PDF files are allowed'));
    }
});

const handoutUploadMiddleware = handoutUpload.single('handout');

// @desc    Create a new course
// @route   POST /api/courses
// @access  Private (Instructor/Admin)
const createCourse = async (req, res) => {
    try {
        if (!isInstructorRole(req.user.role) && !isAdminRole(req.user.role)) {
            return res.status(401).json({ message: 'Not authorized' });
        }

        const { course_code, course_name, description, subject, course_test_questions, points } = req.body;

        const courseExists = await Course.findOne({ course_code });

        if (courseExists) {
            res.status(400).json({ message: 'Course code already exists' });
            return;
        }

        const course = await Course.create({
            course_code,
            course_name,
            description,
            subject,
            instructor: req.user._id, // Assign logged-in user as instructor
            course_test_questions,
            points,
        });

        res.status(201).json(course);
    } catch (error) {
        console.error(error);
        res.status(400).json({ message: 'Failed to create course' });
    }
};

// @desc    Update a course
// @route   PUT /api/courses/:id
// @access  Private (Instructor/Admin)
const updateCourse = async (req, res) => {
    try {
        if (isAnalyticsCourseId(req.params.id)) {
            if (!isAdminRole(req.user.role)) {
                return res.status(401).json({ message: 'Not authorized' });
            }

            const analyticsCourseId = parseAnalyticsCourseId(req.params.id);
            const existingAnalyticsCourse = await findAnalyticsCourseById(analyticsCourseId);
            if (!existingAnalyticsCourse) {
                return res.status(404).json({ message: 'Course not found' });
            }

            const {
                course_code,
                course_name,
                subject,
                instructor_name,
            } = req.body;

            if (course_code && course_code.toUpperCase() !== String(existingAnalyticsCourse.courseCode || '').toUpperCase()) {
                const [existingAppCourse, existingAnalyticsCodeCourse] = await Promise.all([
                    Course.findOne({ course_code: course_code.toUpperCase() }),
                    findAnalyticsCourseByCode(course_code),
                ]);

                if (existingAppCourse || (existingAnalyticsCodeCourse && String(existingAnalyticsCodeCourse.courseId) !== String(existingAnalyticsCourse.courseId))) {
                    return res.status(400).json({ message: 'Course code already exists' });
                }
            }

            const updatedAnalyticsCourse = await updateAnalyticsCourseMetadata(analyticsCourseId, {
                course_code,
                course_name,
                subject,
                instructor_name,
            });

            if (!updatedAnalyticsCourse) {
                return res.status(404).json({ message: 'Course not found' });
            }

            return res.json(mapAnalyticsCourseSummary(updatedAnalyticsCourse));
        }

        const access = await verifyCourseAccess(req.params.id, req.user);
        if (access.error) {
            return res.status(access.error.status).json({ message: access.error.message });
        }
        const course = access.course;

        const {
            course_code,
            course_name,
            description,
            subject,
            course_test_questions,
            points,
            is_active,
        } = req.body;

        if (course_code && course_code.toUpperCase() !== course.course_code) {
            const existingCourse = await Course.findOne({
                course_code: course_code.toUpperCase(),
                _id: { $ne: course._id }
            });

            if (existingCourse) {
                return res.status(400).json({ message: 'Course code already exists' });
            }

            course.course_code = course_code;
        }

        course.course_name = course_name ?? course.course_name;
        course.description = description ?? course.description;
        course.subject = subject ?? course.subject;
        course.course_test_questions = course_test_questions ?? course.course_test_questions;
        course.points = points ?? course.points;
        if (typeof is_active === 'boolean') course.is_active = is_active;

        const updatedCourse = await course.save();
        res.json(updatedCourse);
    } catch (error) {
        console.error(error);
        res.status(400).json({ message: 'Failed to update course' });
    }
};

const clampPercent = (value) => {
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(100, Math.round(value)));
};

const average = (values) => {
    if (!values.length) return 0;
    return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
};

const deriveProgressBand = ({ enrollmentCompleted = false, recordCount = 0, completionRate = 0, moduleCompletionRate = 0 }) => {
    if (enrollmentCompleted || moduleCompletionRate >= 100) {
        return 'completed';
    }

    if (recordCount === 0) {
        return 'not_started';
    }

    if (completionRate >= 70 || moduleCompletionRate >= 60) {
        return 'on_track';
    }

    if (completionRate >= 30 || moduleCompletionRate >= 25) {
        return 'steady';
    }

    return 'needs_support';
};

const SCORE_DISTRIBUTION_BUCKETS = [
    { key: '0_19', label: '0-19', min: 0, max: 19 },
    { key: '20_39', label: '20-39', min: 20, max: 39 },
    { key: '40_59', label: '40-59', min: 40, max: 59 },
    { key: '60_79', label: '60-79', min: 60, max: 79 },
    { key: '80_100', label: '80-100', min: 80, max: 100 },
];

const createScoreDistribution = () => SCORE_DISTRIBUTION_BUCKETS.map((bucket) => ({
    key: bucket.key,
    label: bucket.label,
    value: 0,
    min: bucket.min,
    max: bucket.max,
}));

const buildScoreDistribution = (scores = []) => {
    const distribution = createScoreDistribution();

    scores
        .map((score) => Math.max(0, Math.min(100, Number(score) || 0)))
        .forEach((score) => {
            const bucketIndex = SCORE_DISTRIBUTION_BUCKETS.findIndex((bucket) => score >= bucket.min && score <= bucket.max);
            const safeIndex = bucketIndex >= 0 ? bucketIndex : distribution.length - 1;
            distribution[safeIndex].value += 1;
        });

    const total = distribution.reduce((sum, bucket) => sum + bucket.value, 0);
    return distribution.map((bucket) => ({
        ...bucket,
        share: total ? clampPercent((bucket.value / total) * 100) : 0,
    }));
};

const determineHeatLevel = (challengeScore) => {
    if (challengeScore >= 75) return 'critical';
    if (challengeScore >= 55) return 'high';
    if (challengeScore >= 35) return 'medium';
    return 'stable';
};

const buildLeaderboardSnapshot = (topPerformers = [], attentionNeeded = []) => {
    const topLane = topPerformers.slice(0, 3);
    const atRiskLane = attentionNeeded.slice(0, 3);
    const topAverageEngagement = average(topLane.map((student) => student.engagementScore || 0));
    const atRiskAverageEngagement = average(atRiskLane.map((student) => student.engagementScore || 0));

    return {
        topPerformers: topLane,
        atRiskStudents: atRiskLane,
        topAverageEngagement,
        atRiskAverageEngagement,
        engagementGap: Math.max(0, topAverageEngagement - atRiskAverageEngagement),
    };
};

const buildTaskDifficultyInsights = ({
    tasks = [],
    modules = [],
    courseLookup = new Map(),
    desktopResults = [],
    completions = [],
    activeLearnerCountByCourse = {},
}) => {
    const modulesById = new Map(
        modules.map((module) => [
            module._id.toString(),
            {
                moduleId: module._id.toString(),
                moduleName: module.module_name,
                moduleOrder: module.module_order,
                courseId: module.course_id?.toString?.() || module.course_id?.toString() || '',
            },
        ])
    );

    const resultsByTask = desktopResults.reduce((acc, result) => {
        const taskId = result.task_id?.toString();
        if (!taskId) return acc;
        if (!acc.has(taskId)) acc.set(taskId, []);
        acc.get(taskId).push(result);
        return acc;
    }, new Map());

    const completionsByTask = completions.reduce((acc, completion) => {
        const taskId = completion.task_id?.toString();
        const studentId = completion.student_id?.toString();
        if (!taskId || !studentId) return acc;
        if (!acc.has(taskId)) acc.set(taskId, new Set());
        acc.get(taskId).add(studentId);
        return acc;
    }, new Map());

    return tasks
        .map((task) => {
            const taskId = task._id.toString();
            const moduleMeta = modulesById.get(task.module_id?.toString()) || {};
            const courseMeta = courseLookup.get(moduleMeta.courseId) || {};
            const taskResults = resultsByTask.get(taskId) || [];
            const completionCount = completionsByTask.get(taskId)?.size || 0;
            const attempts = taskResults.length;
            const passCount = taskResults.filter((result) => result.status === 'PASSED').length;
            const failCount = taskResults.filter((result) => result.status === 'FAILED').length;
            const passRate = attempts ? clampPercent((passCount / attempts) * 100) : 0;
            const averageRuntimeMs = average(taskResults.map((result) => result.runtime_ms).filter((value) => Number.isFinite(value) && value > 0));
            const averageTestCoverage = average(taskResults.map((result) => {
                const totalTestCases = Number(result.total_test_cases) || 0;
                const passedTestCases = Number(result.passed_test_cases) || 0;

                if (totalTestCases > 0) {
                    return (passedTestCases / totalTestCases) * 100;
                }

                return result.status === 'PASSED' ? 100 : 0;
            }));
            const activeLearners = activeLearnerCountByCourse[moduleMeta.courseId] || 0;
            const completionRate = activeLearners ? clampPercent((completionCount / activeLearners) * 100) : 0;
            const failurePressure = attempts ? (failCount / attempts) * 100 : 0;
            const challengeScore = clampPercent(
                ((100 - passRate) * 0.45) +
                ((100 - averageTestCoverage) * 0.2) +
                ((100 - completionRate) * 0.25) +
                (failurePressure * 0.1)
            );

            return {
                taskId,
                taskName: task.task_name,
                courseId: moduleMeta.courseId || null,
                courseName: courseMeta.course_name || '',
                courseCode: courseMeta.course_code || '',
                moduleId: moduleMeta.moduleId || null,
                moduleName: moduleMeta.moduleName || '',
                moduleOrder: moduleMeta.moduleOrder || 0,
                difficulty: task.difficulty || 'MEDIUM',
                language: task.language || '',
                points: task.points || 0,
                attempts,
                passCount,
                failCount,
                passRate,
                completionCount,
                completionRate,
                averageRuntimeMs,
                averageTestCoverage,
                challengeScore,
                heatLevel: determineHeatLevel(challengeScore),
            };
        })
        .filter((item) => item.attempts > 0 || item.completionCount > 0)
        .sort((left, right) => {
            if (right.challengeScore !== left.challengeScore) return right.challengeScore - left.challengeScore;
            if (right.failCount !== left.failCount) return right.failCount - left.failCount;
            if (right.attempts !== left.attempts) return right.attempts - left.attempts;
            return right.completionCount - left.completionCount;
        });
};

const combinePerformanceAnalytics = (appAnalytics, analyticsSyncAnalytics) => {
    if (!analyticsSyncAnalytics?.studentCount && !analyticsSyncAnalytics?.courseBreakdown?.length) {
        return appAnalytics;
    }

    const topPerformers = [
        ...(appAnalytics.topPerformers || []),
        ...(analyticsSyncAnalytics.topPerformers || []),
    ].sort((left, right) => (right.engagementScore || 0) - (left.engagementScore || 0)).slice(0, 5);
    const attentionNeeded = [
        ...(appAnalytics.attentionNeeded || []),
        ...(analyticsSyncAnalytics.attentionNeeded || []),
    ].sort((left, right) => (left.engagementScore || 0) - (right.engagementScore || 0)).slice(0, 5);
    const taskDifficultyHotspots = [
        ...(appAnalytics.taskDifficultyHotspots || []),
        ...(analyticsSyncAnalytics.taskDifficultyHotspots || []),
    ].sort((left, right) => (right.challengeScore || 0) - (left.challengeScore || 0)).slice(0, 10);
    const courseBreakdown = [
        ...(analyticsSyncAnalytics.courseBreakdown || []),
        ...(appAnalytics.courseBreakdown || []),
    ];
    const totalStudents = (appAnalytics.studentCount || 0) + (analyticsSyncAnalytics.studentCount || 0);
    const progressBandBreakdown = { completed: 0, on_track: 0, steady: 0, needs_support: 0, not_started: 0 };

    for (const band of Object.keys(progressBandBreakdown)) {
        progressBandBreakdown[band] = (appAnalytics.progressBandBreakdown?.[band] || 0)
            + (analyticsSyncAnalytics.progressBandBreakdown?.[band] || 0);
    }

    return {
        ...appAnalytics,
        activeLearners: (appAnalytics.activeLearners || 0) + (analyticsSyncAnalytics.activeLearners || 0),
        avgCompletionRate: totalStudents
            ? average([
                ...(Array(appAnalytics.studentCount || 0).fill(appAnalytics.avgCompletionRate || 0)),
                ...(Array(analyticsSyncAnalytics.studentCount || 0).fill(analyticsSyncAnalytics.avgCompletionRate || 0)),
            ])
            : 0,
        avgScore: totalStudents
            ? average([
                ...(Array(appAnalytics.studentCount || 0).fill(appAnalytics.avgScore || 0)),
                ...(Array(analyticsSyncAnalytics.studentCount || 0).fill(analyticsSyncAnalytics.avgScore || 0)),
            ])
            : 0,
        studentsNeedingSupport: (appAnalytics.studentsNeedingSupport || 0) + (analyticsSyncAnalytics.studentsNeedingSupport || 0),
        progressBandBreakdown,
        topPerformers,
        attentionNeeded,
        leaderboardSnapshot: buildLeaderboardSnapshot(topPerformers, attentionNeeded),
        taskDifficultyHotspots,
        courseBreakdown,
        courseHighlights: {
            strongestCourse: analyticsSyncAnalytics.courseHighlights?.strongestCourse || appAnalytics.courseHighlights?.strongestCourse || null,
            needsAttentionCourse: analyticsSyncAnalytics.courseHighlights?.needsAttentionCourse || appAnalytics.courseHighlights?.needsAttentionCourse || null,
            toughestCourse: taskDifficultyHotspots[0]
                ? courseBreakdown.find((course) => course.courseId === taskDifficultyHotspots[0].courseId) || appAnalytics.courseHighlights?.toughestCourse || null
                : appAnalytics.courseHighlights?.toughestCourse || null,
        },
        studentCount: totalStudents,
        dataMode: appAnalytics.studentCount && analyticsSyncAnalytics.courseBreakdown?.length ? 'mixed' : analyticsSyncAnalytics.dataMode || appAnalytics.dataMode,
    };
};

// @desc    Get all courses (or instructor's courses)
// @route   GET /api/courses
// @access  Private
const getCourses = async (req, res) => {
    try {
        let query = {};
        const pagination = parsePagination(req, { defaultLimit: 100, maxLimit: 200 });

        // If user is an instructor, only show their courses? 
        // Or if they are student show enrolled? 
        // For now, let's allow fetching all active courses for students, and all created for instructors.
        if (isInstructorRole(req.user.role)) {
            query = { instructor: req.user._id };
        } else if (isStudentRole(req.user.role)) {
            query = { is_active: true };
        }

        const [total, courses] = await Promise.all([
            Course.countDocuments(query),
            Course.find(query)
                .sort({ createdAt: -1 })
                .skip(pagination.skip)
                .limit(pagination.limit)
                .populate('instructor', 'name email'),
        ]);
        const courseIds = courses.map((course) => course._id);

        let moduleCountsByCourse = new Map();

        if (courseIds.length) {
            const moduleCounts = await Module.aggregate([
                {
                    $match: {
                        course_id: { $in: courseIds }
                    }
                },
                {
                    $group: {
                        _id: '$course_id',
                        count: { $sum: 1 }
                    }
                }
            ]);

            moduleCountsByCourse = new Map(
                moduleCounts.map((entry) => [entry._id.toString(), entry.count])
            );
        }

        const coursesWithModuleCounts = courses.map((course) => {
            const courseObject = course.toObject();
            courseObject.modules_count = moduleCountsByCourse.get(course._id.toString()) || 0;
            return courseObject;
        });
        const existingCourseCodes = new Set(coursesWithModuleCounts.map((course) => String(course.course_code || '').toUpperCase()));
        const analyticsCourses = (await listAnalyticsCoursesForUser(req.user, {
            courseCodes: coursesWithModuleCounts.map((course) => course.course_code),
        })).filter((course) => !existingCourseCodes.has(String(course.course_code || '').toUpperCase()));
        const allCourses = [...analyticsCourses, ...coursesWithModuleCounts];

        applyPaginationHeaders(res, { ...pagination, total: total + analyticsCourses.length });
        res.json(allCourses);
    } catch (error) {
        console.error(error);
        res.status(400).json({ message: 'Failed to fetch courses' });
    }
};

// @desc    Get single course
// @route   GET /api/courses/:id
// @access  Private
const getCourseById = async (req, res) => {
    try {
        if (isAnalyticsCourseId(req.params.id)) {
            const analyticsCourse = await findAnalyticsCourseById(parseAnalyticsCourseId(req.params.id));
            if (!analyticsCourse) {
                return res.status(404).json({ message: 'Course not found' });
            }
            if (!userCanAccessAnalyticsCourse(analyticsCourse, req.user)) {
                return res.status(401).json({ message: 'Not authorized' });
            }
            return res.json(mapAnalyticsCourseSummary(analyticsCourse));
        }

        const access = await verifyCourseAccess(req.params.id, req.user, { allowStudentReadActive: true });
        if (access.error) {
            return res.status(access.error.status).json({ message: access.error.message });
        }

        res.json(access.course);
    } catch (error) {
        console.error(error);
        res.status(400).json({ message: 'Failed to fetch course' });
    }
};

// @desc    Delete a course
// @route   DELETE /api/courses/:id
// @access  Private (Instructor/Admin)
const deleteCourse = async (req, res) => {
    try {
        const access = await verifyCourseAccess(req.params.id, req.user);
        if (access.error) {
            return res.status(access.error.status).json({ message: access.error.message });
        }
        const course = access.course;

        await course.deleteOne();
        res.json({ message: 'Course removed' });
    } catch (error) {
        console.error(error);
        res.status(400).json({ message: 'Failed to delete course' });
    }
};

// @desc    Get teacher dashboard stats
// @route   GET /api/courses/stats
// @access  Private (Instructor)
const getTeacherStats = async (req, res) => {
    try {
        const courses = await Course.find({ instructor: req.user._id }).select('_id course_name course_code');
        const courseIds = courses.map(c => c._id);
        const activeClasses = courses.length;
        const analyticsStats = await buildAnalyticsTeacherStatsForUser(req.user, {
            courseCodes: courses.map((course) => course.course_code),
            excludeCourseCodes: courses.map((course) => course.course_code),
        });
        const courseLookup = new Map(courses.map((course) => [course._id.toString(), {
            _id: course._id,
            course_name: course.course_name,
            course_code: course.course_code,
        }]));
        const defaultPerformanceAnalytics = {
            activeLearners: 0,
            avgCompletionRate: 0,
            avgScore: 0,
            studentsNeedingSupport: 0,
            progressBandBreakdown: {
                completed: 0,
                on_track: 0,
                steady: 0,
                needs_support: 0,
                not_started: 0,
            },
            topPerformers: [],
            attentionNeeded: [],
            leaderboardSnapshot: buildLeaderboardSnapshot([], []),
            scoreDistribution: createScoreDistribution(),
            taskDifficultyHotspots: [],
            courseBreakdown: [],
            courseHighlights: {
                strongestCourse: null,
                needsAttentionCourse: null,
                toughestCourse: null,
            },
            studentCount: 0,
            dataMode: 'enrollment_only',
        };

        if (!courseIds.length) {
            if (analyticsStats.activeClasses > 0) {
                return res.json(analyticsStats);
            }

            return res.json({
                activeClasses,
                totalStudents: 0,
                pendingGrading: 0,
                avgPerformance: '0%',
                performanceAnalytics: defaultPerformanceAnalytics,
            });
        }

        const [distinctStudents, modules, enrollments, progressRecords] = await Promise.all([
            Enrollment.distinct('student_id', { course_id: { $in: courseIds } }),
            Module.find({ course_id: { $in: courseIds } }).select('course_id module_name module_order'),
            Enrollment.find({ course_id: { $in: courseIds } })
                .populate('student_id', 'name email enrollment_number points last_login'),
            StudentProgress.find({ course_id: { $in: courseIds } }).lean(),
        ]);

        const totalStudents = distinctStudents.length;
        const moduleIds = modules.map((module) => module._id);
        const tasks = moduleIds.length
            ? await Task.find({ module_id: { $in: moduleIds } })
                .select('module_id task_name difficulty language points time_limit')
                .lean()
            : [];
        const taskIds = tasks.map((task) => task._id);
        const [desktopResults, taskCompletions] = taskIds.length
            ? await Promise.all([
                DesktopTaskResult.find({ task_id: { $in: taskIds } })
                    .select('task_id status passed_test_cases total_test_cases runtime_ms')
                    .lean(),
                TaskCompletion.find({ task_id: { $in: taskIds } })
                    .select('task_id student_id')
                    .lean(),
            ])
            : [[], []];

        const moduleToCourseMap = new Map(modules.map((module) => [module._id.toString(), module.course_id.toString()]));
        const moduleTotalsByCourse = modules.reduce((acc, module) => {
            const courseId = module.course_id.toString();
            acc[courseId] = (acc[courseId] || 0) + 1;
            return acc;
        }, {});
        const taskTotalsByCourse = tasks.reduce((acc, task) => {
            const courseId = moduleToCourseMap.get(task.module_id.toString());
            if (!courseId) return acc;
            acc[courseId] = (acc[courseId] || 0) + 1;
            return acc;
        }, {});

        const activeEnrollmentStatuses = new Set(['ACTIVE', 'COMPLETED']);
        const activeStudentsById = new Map();
        const activeLearnerCountByCourse = {};

        for (const enrollment of enrollments) {
            if (!activeEnrollmentStatuses.has(enrollment.status) || !enrollment.student_id) continue;

            const student = enrollment.student_id;
            const studentId = student._id.toString();

            if (!activeStudentsById.has(studentId)) {
                activeStudentsById.set(studentId, {
                    studentId,
                    student,
                    courseIds: new Set(),
                    enrollmentCompleted: false,
                    latestEnrollmentActivity: null,
                });
            }

            const entry = activeStudentsById.get(studentId);
            const courseId = enrollment.course_id.toString();
            entry.courseIds.add(courseId);
            entry.enrollmentCompleted = entry.enrollmentCompleted || enrollment.status === 'COMPLETED';
            activeLearnerCountByCourse[courseId] = (activeLearnerCountByCourse[courseId] || 0) + 1;

            const enrollmentUpdatedAt = enrollment.updatedAt ? new Date(enrollment.updatedAt).getTime() : null;
            if (enrollmentUpdatedAt && (!entry.latestEnrollmentActivity || enrollmentUpdatedAt > entry.latestEnrollmentActivity)) {
                entry.latestEnrollmentActivity = enrollmentUpdatedAt;
            }
        }

        const progressByStudent = new Map();
        const progressByCourse = new Map();
        for (const record of progressRecords) {
            const studentId = record.student_id?.toString();
            if (!studentId || !activeStudentsById.has(studentId)) continue;

            if (!progressByStudent.has(studentId)) progressByStudent.set(studentId, []);
            progressByStudent.get(studentId).push(record);

            const courseId = record.course_id?.toString();
            if (courseId) {
                if (!progressByCourse.has(courseId)) progressByCourse.set(courseId, []);
                progressByCourse.get(courseId).push(record);
            }
        }

        const studentAnalytics = [...activeStudentsById.values()].map(({ studentId, student, courseIds: enrolledCourseIds, enrollmentCompleted, latestEnrollmentActivity }) => {
            const eligibleCourseIds = [...enrolledCourseIds];
            const eligibleCourseIdSet = new Set(eligibleCourseIds);
            const records = (progressByStudent.get(studentId) || []).filter((record) =>
                eligibleCourseIdSet.has(record.course_id?.toString())
            );

            const completedTasks = records.reduce((sum, record) => sum + (record.completed_tasks || 0), 0);
            const moduleCompletionCount = records.filter((record) =>
                record.module_status === 'MODULE_COMPLETED' || record.module_test_completed
            ).length;
            const averageScore = average(records.map((record) => record.total_score || 0));
            const eligibleTotalTasks = eligibleCourseIds.reduce((sum, courseId) => sum + (taskTotalsByCourse[courseId] || 0), 0);
            const eligibleTotalModules = eligibleCourseIds.reduce((sum, courseId) => sum + (moduleTotalsByCourse[courseId] || 0), 0);
            const completionRate = eligibleTotalTasks ? clampPercent((completedTasks / eligibleTotalTasks) * 100) : 0;
            const moduleCompletionRate = eligibleTotalModules ? clampPercent((moduleCompletionCount / eligibleTotalModules) * 100) : 0;
            const engagementScore = clampPercent((completionRate * 0.55) + (moduleCompletionRate * 0.25) + (Math.min(averageScore, 100) * 0.2));
            const progressBand = deriveProgressBand({
                enrollmentCompleted,
                recordCount: records.length,
                completionRate,
                moduleCompletionRate,
            });

            const latestProgressUpdate = records
                .map((record) => new Date(record.updatedAt).getTime())
                .filter(Boolean)
                .sort((a, b) => b - a)[0];

            return {
                studentId,
                name: student.name,
                email: student.email,
                enrollmentNumber: student.enrollment_number,
                globalPoints: student.points || 0,
                enrolledCourses: eligibleCourseIds.length,
                completedTasks,
                completionRate,
                moduleCompletionCount,
                moduleCompletionRate,
                averageScore,
                engagementScore,
                progressBand,
                lastActivityAt: latestProgressUpdate
                    ? new Date(latestProgressUpdate).toISOString()
                    : latestEnrollmentActivity
                        ? new Date(latestEnrollmentActivity).toISOString()
                        : student.last_login || null,
                lastLoginAt: student.last_login || null,
            };
        }).sort((a, b) => {
            if (b.engagementScore !== a.engagementScore) return b.engagementScore - a.engagementScore;
            if (b.averageScore !== a.averageScore) return b.averageScore - a.averageScore;
            if (b.completedTasks !== a.completedTasks) return b.completedTasks - a.completedTasks;
            return b.globalPoints - a.globalPoints;
        });

        const progressBandBreakdown = studentAnalytics.reduce((acc, student) => {
            acc[student.progressBand] = (acc[student.progressBand] || 0) + 1;
            return acc;
        }, { completed: 0, on_track: 0, steady: 0, needs_support: 0, not_started: 0 });

        const attentionNeeded = [...studentAnalytics]
            .filter((student) => ['needs_support', 'not_started'].includes(student.progressBand))
            .sort((a, b) => a.engagementScore - b.engagementScore)
            .slice(0, 5);
        const scoreDistribution = buildScoreDistribution(studentAnalytics.map((student) => student.averageScore));
        const taskDifficultyHotspots = buildTaskDifficultyInsights({
            tasks,
            modules,
            courseLookup,
            desktopResults,
            completions: taskCompletions,
            activeLearnerCountByCourse,
        }).slice(0, 8);
        const taskHotspotsByCourse = taskDifficultyHotspots.reduce((acc, task) => {
            if (!task.courseId) return acc;
            if (!acc.has(task.courseId)) acc.set(task.courseId, []);
            acc.get(task.courseId).push(task);
            return acc;
        }, new Map());
        const leaderboardSnapshot = buildLeaderboardSnapshot(studentAnalytics, attentionNeeded);
        const courseBreakdown = courseIds.map((courseIdValue) => {
            const courseId = courseIdValue.toString();
            const courseMeta = courseLookup.get(courseId);
            const courseTaskCount = taskTotalsByCourse[courseId] || 0;
            const courseModuleCount = moduleTotalsByCourse[courseId] || 0;
            const courseEnrollments = enrollments.filter((enrollment) =>
                enrollment.course_id?.toString?.() === courseId &&
                activeEnrollmentStatuses.has(enrollment.status) &&
                enrollment.student_id
            );
            const courseActiveLearners = courseEnrollments.length;
            const progressRecordsForCourse = progressByCourse.get(courseId) || [];
            const progressByStudentForCourse = new Map();

            for (const record of progressRecordsForCourse) {
                const studentId = record.student_id?.toString();
                if (!studentId) continue;
                if (!progressByStudentForCourse.has(studentId)) progressByStudentForCourse.set(studentId, []);
                progressByStudentForCourse.get(studentId).push(record);
            }

            const courseStudentAnalytics = courseEnrollments.map((enrollment) => {
                const studentId = enrollment.student_id._id.toString();
                const records = progressByStudentForCourse.get(studentId) || [];
                const completedTasks = records.reduce((sum, record) => sum + (record.completed_tasks || 0), 0);
                const moduleCompletionCount = records.filter((record) =>
                    record.module_status === 'MODULE_COMPLETED' || record.module_test_completed
                ).length;
                const averageScore = average(records.map((record) => record.total_score || 0));
                const completionRate = courseTaskCount ? clampPercent((completedTasks / courseTaskCount) * 100) : 0;
                const moduleCompletionRate = courseModuleCount ? clampPercent((moduleCompletionCount / courseModuleCount) * 100) : 0;
                const engagementScore = clampPercent((completionRate * 0.55) + (moduleCompletionRate * 0.25) + (Math.min(averageScore, 100) * 0.2));
                const progressBand = deriveProgressBand({
                    enrollmentCompleted: enrollment.status === 'COMPLETED',
                    recordCount: records.length,
                    completionRate,
                    moduleCompletionRate,
                });

                return {
                    studentId,
                    completionRate,
                    moduleCompletionRate,
                    averageScore,
                    engagementScore,
                    progressBand,
                };
            });

            const progressBandBreakdownForCourse = courseStudentAnalytics.reduce((acc, student) => {
                acc[student.progressBand] = (acc[student.progressBand] || 0) + 1;
                return acc;
            }, { completed: 0, on_track: 0, steady: 0, needs_support: 0, not_started: 0 });
            const supportNeeded = (progressBandBreakdownForCourse.needs_support || 0) + (progressBandBreakdownForCourse.not_started || 0);
            const topHotspot = (taskHotspotsByCourse.get(courseId) || [])[0] || null;

            return {
                courseId,
                courseName: courseMeta?.course_name || 'Untitled Course',
                courseCode: courseMeta?.course_code || '',
                activeLearners: courseActiveLearners,
                moduleCount: courseModuleCount,
                taskCount: courseTaskCount,
                avgCompletionRate: average(courseStudentAnalytics.map((student) => student.completionRate)),
                avgScore: average(courseStudentAnalytics.map((student) => student.averageScore)),
                averageEngagement: average(courseStudentAnalytics.map((student) => student.engagementScore)),
                supportNeeded,
                supportShare: courseActiveLearners ? clampPercent((supportNeeded / courseActiveLearners) * 100) : 0,
                completedLearners: progressBandBreakdownForCourse.completed || 0,
                progressBandBreakdown: progressBandBreakdownForCourse,
                topHotspot: topHotspot
                    ? {
                        taskId: topHotspot.taskId,
                        taskName: topHotspot.taskName,
                        challengeScore: topHotspot.challengeScore,
                        passRate: topHotspot.passRate,
                    }
                    : null,
            };
        }).sort((left, right) => {
            if (right.averageEngagement !== left.averageEngagement) return right.averageEngagement - left.averageEngagement;
            if (right.avgCompletionRate !== left.avgCompletionRate) return right.avgCompletionRate - left.avgCompletionRate;
            return left.courseName.localeCompare(right.courseName);
        });

        const strongestCourse = [...courseBreakdown]
            .filter((course) => course.activeLearners > 0)
            .sort((left, right) => {
                if (right.avgCompletionRate !== left.avgCompletionRate) return right.avgCompletionRate - left.avgCompletionRate;
                if (right.avgScore !== left.avgScore) return right.avgScore - left.avgScore;
                return right.averageEngagement - left.averageEngagement;
            })[0] || null;
        const needsAttentionCourse = [...courseBreakdown]
            .filter((course) => course.activeLearners > 0)
            .sort((left, right) => {
                if (right.supportShare !== left.supportShare) return right.supportShare - left.supportShare;
                if (left.avgCompletionRate !== right.avgCompletionRate) return left.avgCompletionRate - right.avgCompletionRate;
                return left.avgScore - right.avgScore;
            })[0] || null;
        const toughestCourse = [...courseBreakdown]
            .filter((course) => course.topHotspot)
            .sort((left, right) => {
                if ((right.topHotspot?.challengeScore || 0) !== (left.topHotspot?.challengeScore || 0)) {
                    return (right.topHotspot?.challengeScore || 0) - (left.topHotspot?.challengeScore || 0);
                }

                return left.avgCompletionRate - right.avgCompletionRate;
            })[0] || null;

        const performanceAnalytics = {
            activeLearners: studentAnalytics.length,
            avgCompletionRate: average(studentAnalytics.map((student) => student.completionRate)),
            avgScore: average(studentAnalytics.map((student) => student.averageScore)),
            studentsNeedingSupport: (progressBandBreakdown.needs_support || 0) + (progressBandBreakdown.not_started || 0),
            progressBandBreakdown,
            topPerformers: studentAnalytics.slice(0, 5),
            attentionNeeded,
            leaderboardSnapshot,
            scoreDistribution,
            taskDifficultyHotspots,
            courseBreakdown,
            courseHighlights: {
                strongestCourse,
                needsAttentionCourse,
                toughestCourse,
            },
            studentCount: studentAnalytics.length,
            dataMode: progressRecords.length ? 'progress' : 'enrollment_only',
        };
        const combinedPerformanceAnalytics = combinePerformanceAnalytics(
            performanceAnalytics,
            analyticsStats.performanceAnalytics
        );

        res.json({
            activeClasses: activeClasses + analyticsStats.activeClasses,
            totalStudents: totalStudents + analyticsStats.totalStudents,
            pendingGrading: 0,
            avgPerformance: `${combinedPerformanceAnalytics.avgScore}%`,
            performanceAnalytics: combinedPerformanceAnalytics,
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to fetch stats' });
    }
};

// @desc    Get detailed analytics for a single course
// @route   GET /api/courses/:id/analytics
// @access  Private (Instructor/Admin)
const getCourseAnalytics = async (req, res) => {
    try {
        if (isAnalyticsCourseId(req.params.id)) {
            const analyticsCourse = await findAnalyticsCourseById(parseAnalyticsCourseId(req.params.id));
            if (!analyticsCourse) {
                return res.status(404).json({ message: 'Course not found' });
            }
            if (!userCanAccessAnalyticsCourse(analyticsCourse, req.user)) {
                return res.status(401).json({ message: 'Not authorized' });
            }
            return res.json(buildCourseAnalyticsResponseFromDocument(analyticsCourse));
        }

        const access = await verifyCourseAccess(req.params.id, req.user);
        if (access.error) {
            return res.status(access.error.status).json({ message: access.error.message });
        }
        const course = access.course;
        const analyticsCourse = await findAnalyticsCourseByCode(course.course_code);
        if (analyticsCourse) {
            return res.json(buildCourseAnalyticsResponseFromDocument(analyticsCourse));
        }

        const [modules, enrollments, progressRecords] = await Promise.all([
            Module.find({ course_id: course._id })
                .select('course_id module_name module_order')
                .sort({ module_order: 1 }),
            Enrollment.find({ course_id: course._id })
                .populate('student_id', 'name email enrollment_number points last_login createdAt'),
            StudentProgress.find({ course_id: course._id }).lean(),
        ]);

        const moduleIds = modules.map(module => module._id);
        const tasks = moduleIds.length
            ? await Task.find({ module_id: { $in: moduleIds } })
                .select('module_id task_name difficulty language points time_limit')
                .lean()
            : [];
        const taskIds = tasks.map((task) => task._id);
        const [desktopResults, taskCompletions] = taskIds.length
            ? await Promise.all([
                DesktopTaskResult.find({ task_id: { $in: taskIds } })
                    .select('task_id status passed_test_cases total_test_cases runtime_ms')
                    .lean(),
                TaskCompletion.find({ task_id: { $in: taskIds } })
                    .select('task_id student_id')
                    .lean(),
            ])
            : [[], []];

        const tasksPerModule = tasks.reduce((acc, task) => {
            const moduleId = task.module_id.toString();
            acc[moduleId] = (acc[moduleId] || 0) + 1;
            return acc;
        }, {});

        const enrollmentStatusBreakdown = enrollments.reduce((acc, enrollment) => {
            acc[enrollment.status] = (acc[enrollment.status] || 0) + 1;
            return acc;
        }, {});

        const activeEnrollments = enrollments.filter((enrollment) => ['ACTIVE', 'COMPLETED'].includes(enrollment.status) && enrollment.student_id);
        const activeStudents = activeEnrollments
            .map((enrollment) => ({
                enrollment,
                student: enrollment.student_id,
            }))
            .filter(({ student }) => student);

        const progressByStudent = new Map();
        const progressByModule = new Map();

        for (const record of progressRecords) {
            const studentId = record.student_id?.toString();
            const moduleId = record.module_id?.toString();

            if (studentId) {
                if (!progressByStudent.has(studentId)) progressByStudent.set(studentId, []);
                progressByStudent.get(studentId).push(record);
            }

            if (moduleId) {
                if (!progressByModule.has(moduleId)) progressByModule.set(moduleId, []);
                progressByModule.get(moduleId).push(record);
            }
        }

        const totalTasks = tasks.length;
        const totalModules = modules.length;

        const studentAnalytics = activeStudents.map(({ enrollment, student }) => {
            const studentId = student._id.toString();
            const records = progressByStudent.get(studentId) || [];
            const completedTasks = records.reduce((sum, record) => sum + (record.completed_tasks || 0), 0);
            const moduleCompletionCount = records.filter((record) => record.module_status === 'MODULE_COMPLETED' || record.module_test_completed).length;
            const averageScore = average(records.map((record) => record.total_score || 0));
            const completionRate = totalTasks ? clampPercent((completedTasks / totalTasks) * 100) : 0;
            const moduleCompletionRate = totalModules ? clampPercent((moduleCompletionCount / totalModules) * 100) : 0;
            const engagementScore = clampPercent((completionRate * 0.55) + (moduleCompletionRate * 0.25) + (Math.min(averageScore, 100) * 0.2));

            let progressBand = 'not_started';
            if (enrollment.status === 'COMPLETED' || moduleCompletionRate >= 100) {
                progressBand = 'completed';
            } else if (records.length === 0) {
                progressBand = 'not_started';
            } else if (completionRate >= 70 || moduleCompletionRate >= 60) {
                progressBand = 'on_track';
            } else if (completionRate >= 30 || moduleCompletionRate >= 25) {
                progressBand = 'steady';
            } else {
                progressBand = 'needs_support';
            }

            const latestProgressUpdate = records
                .map((record) => new Date(record.updatedAt).getTime())
                .filter(Boolean)
                .sort((a, b) => b - a)[0];

            return {
                studentId,
                name: student.name,
                email: student.email,
                enrollmentNumber: student.enrollment_number,
                globalPoints: student.points || 0,
                enrollmentStatus: enrollment.status,
                completedTasks,
                completionRate,
                moduleCompletionCount,
                moduleCompletionRate,
                averageScore,
                engagementScore,
                progressBand,
                lastActivityAt: latestProgressUpdate ? new Date(latestProgressUpdate).toISOString() : enrollment.updatedAt?.toISOString?.() || enrollment.createdAt?.toISOString?.() || null,
                lastLoginAt: student.last_login || null,
            };
        }).sort((a, b) => {
            if (b.engagementScore !== a.engagementScore) return b.engagementScore - a.engagementScore;
            if (b.averageScore !== a.averageScore) return b.averageScore - a.averageScore;
            if (b.completedTasks !== a.completedTasks) return b.completedTasks - a.completedTasks;
            return b.globalPoints - a.globalPoints;
        });

        const moduleAnalytics = modules.map((module) => {
            const moduleId = module._id.toString();
            const records = progressByModule.get(moduleId) || [];
            const taskCount = tasksPerModule[moduleId] || 0;

            const studentsStarted = records.filter((record) =>
                (record.completed_tasks || 0) > 0 ||
                record.module_status !== 'NOT_STARTED' ||
                record.module_test_completed
            ).length;

            const studentsCompleted = records.filter((record) =>
                record.module_status === 'MODULE_COMPLETED' ||
                record.module_test_completed
            ).length;

            const avgTaskCompletion = taskCount
                ? average(records.map((record) => clampPercent(((record.completed_tasks || 0) / taskCount) * 100)))
                : 0;

            return {
                moduleId,
                moduleName: module.module_name,
                moduleOrder: module.module_order,
                taskCount,
                studentsStarted,
                studentsCompleted,
                startedRate: activeStudents.length ? clampPercent((studentsStarted / activeStudents.length) * 100) : 0,
                completedRate: activeStudents.length ? clampPercent((studentsCompleted / activeStudents.length) * 100) : 0,
                averageScore: average(records.map((record) => record.total_score || 0)),
                averageTaskCompletion: avgTaskCompletion,
            };
        });

        const progressBandBreakdown = studentAnalytics.reduce((acc, student) => {
            acc[student.progressBand] = (acc[student.progressBand] || 0) + 1;
            return acc;
        }, { completed: 0, on_track: 0, steady: 0, needs_support: 0, not_started: 0 });

        const attentionNeeded = [...studentAnalytics]
            .filter((student) => ['needs_support', 'not_started'].includes(student.progressBand))
            .sort((a, b) => a.engagementScore - b.engagementScore)
            .slice(0, 5);

        const topPerformers = studentAnalytics.slice(0, 5);
        const bottleneckModule = [...moduleAnalytics]
            .filter((module) => module.taskCount > 0)
            .sort((a, b) => a.completedRate - b.completedRate)[0] || null;
        const scoreDistribution = buildScoreDistribution(studentAnalytics.map((student) => student.averageScore));
        const taskDifficultyHotspots = buildTaskDifficultyInsights({
            tasks,
            modules,
            courseLookup: new Map([[course._id.toString(), {
                _id: course._id,
                course_name: course.course_name,
                course_code: course.course_code,
            }]]),
            desktopResults,
            completions: taskCompletions,
            activeLearnerCountByCourse: { [course._id.toString()]: activeStudents.length },
        }).slice(0, 10);
        const hardestTask = taskDifficultyHotspots[0] || null;
        const leaderboardSnapshot = buildLeaderboardSnapshot(topPerformers, attentionNeeded);

        res.json({
            course: {
                _id: course._id,
                course_name: course.course_name,
                course_code: course.course_code,
                subject: course.subject,
            },
            overview: {
                totalStudents: enrollments.length,
                activeStudents: activeStudents.length,
                pendingStudents: enrollmentStatusBreakdown.PENDING || 0,
                rejectedStudents: enrollmentStatusBreakdown.REJECTED || 0,
                completedEnrollments: enrollmentStatusBreakdown.COMPLETED || 0,
                totalModules,
                totalTasks,
                avgCompletionRate: average(studentAnalytics.map((student) => student.completionRate)),
                avgScore: average(studentAnalytics.map((student) => student.averageScore)),
                studentsNeedingSupport: (progressBandBreakdown.needs_support || 0) + (progressBandBreakdown.not_started || 0),
                topPerformer: topPerformers[0] || null,
                bottleneckModule,
                hardestTask,
                avgTaskPassRate: average(taskDifficultyHotspots.map((taskInsight) => taskInsight.passRate)),
                dataMode: progressRecords.length ? 'progress' : 'enrollment_only',
            },
            distributions: {
                enrollmentStatus: enrollmentStatusBreakdown,
                progressBand: progressBandBreakdown,
                scoreBand: scoreDistribution,
            },
            topPerformers,
            attentionNeeded,
            moduleAnalytics,
            taskDifficultyHotspots,
            leaderboardSnapshot,
            studentAnalytics,
        });
    } catch (error) {
        console.error('Course analytics error:', error);
        res.status(500).json({ message: 'Failed to fetch course analytics' });
    }
};

// @desc    Export course as JSON
// @route   GET /api/courses/:id/export
// @access  Private (Instructor/Admin)
const exportCourse = async (req, res) => {
    try {
        const access = await verifyCourseAccess(req.params.id, req.user);
        if (access.error) {
            return res.status(access.error.status).json({ message: access.error.message });
        }
        const course = access.course;

        console.log(`Exporting course JSON: ${course.course_name}`);

        // 1. Fetch all modules
        const modules = await Module.find({ course_id: course._id }).sort({ module_order: 1 });

        const modulesData = [];

        // 2. Fetch Course Test Questions
        const courseTestQs = await CodingQuestion.find({ course_id: course._id, question_type: 'COURSE_TEST' });
        const mappedCourseTestQs = courseTestQs.map(q => ({
            questionType: q.question_type,
            questionText: q.question_text,
            problemStatement: q.problem_statement,
            expectedOutput: q.expected_output,
            sampleInput: q.sample_input,
            sampleOutput: q.sample_output,
            difficulty: q.difficulty,
            points: q.points,
            timeLimit: q.time_limit,
            language: q.language,
            testCases: q.test_cases ? q.test_cases.map(tc => ({
                input: tc.input,
                expectedOutput: tc.expected_output,
                isSample: tc.is_sample,
                orderIndex: tc.order_index
            })) : []
        }));

        // 3. Loop through modules and fetch tasks & test questions
        for (const module of modules) {
            const tasks = await Task.find({ module_id: module._id });
            const moduleTestQs = await CodingQuestion.find({ module_id: module._id, question_type: 'MODULE_TEST' });

            const mappedTasks = tasks.map(t => ({
                taskName: t.task_name,
                description: t.description,
                problemStatement: t.problem_statement,
                expectedOutput: t.expected_output,
                sampleInput: t.sample_input,
                sampleOutput: t.sample_output,
                difficulty: t.difficulty,
                points: t.points,
                timeLimit: t.time_limit,
                language: t.language,
                testCases: t.test_cases ? t.test_cases.map(tc => ({
                    input: tc.input,
                    expectedOutput: tc.expected_output,
                    isSample: tc.is_sample,
                    orderIndex: tc.order_index
                })) : []
            }));

            const mappedModuleTestQs = moduleTestQs.map(q => ({
                questionType: q.question_type,
                questionText: q.question_text,
                problemStatement: q.problem_statement,
                expectedOutput: q.expected_output,
                sampleInput: q.sample_input,
                sampleOutput: q.sample_output,
                difficulty: q.difficulty,
                points: q.points,
                timeLimit: q.time_limit,
                language: q.language,
                testCases: q.test_cases ? q.test_cases.map(tc => ({
                    input: tc.input,
                    expectedOutput: tc.expected_output,
                    isSample: tc.is_sample,
                    orderIndex: tc.order_index
                })) : []
            }));

            const moduleObj = {
                moduleName: module.module_name,
                description: module.description,
                moduleOrder: module.module_order,
                tasksPerModule: module.tasks_per_module,
                moduleTestQuestionsCount: module.module_test_questions,
                isActive: module.is_active !== undefined ? module.is_active : true,
                tasks: mappedTasks,
                moduleTestQuestions: mappedModuleTestQs
            };

            modulesData.push(moduleObj);
        }

        // 4. Construct final JSON
        const exportData = {
            exportType: "COURSE",
            exportVersion: "1.0",
            exportDate: new Date().toISOString(),
            course: {
                courseCode: course.course_code,
                courseName: course.course_name,
                description: course.description,
                subject: course.subject,
                instructorName: course.instructor ? course.instructor.name : 'Unknown',
                courseTestQuestionsCount: course.course_test_questions,
                isActive: course.is_active !== undefined ? course.is_active : true,
                modules: modulesData,
                courseTestQuestions: mappedCourseTestQs
            }
        };

        // 5. Create ZIP and append JSON
        const archiveZip = archive('zip', {
            zlib: { level: 9 }
        });

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const zipFileName = `course_export_${course.course_code}_${timestamp}.zip`;

        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="${zipFileName}"`);

        archiveZip.pipe(res);

        archiveZip.append(JSON.stringify(exportData, null, 2), { name: 'course_data.json' });

        const readmeContent = `Course Export Metadata
----------------------
Course Code: ${course.course_code}
Course Name: ${course.course_name}
Export Date: ${exportData.exportDate}
Instructor: ${exportData.course.instructorName}
Modules Count: ${modulesData.length}
`;
        archiveZip.append(readmeContent, { name: 'README.txt' });

        await archiveZip.finalize();

    } catch (error) {
        console.error('Course export error:', error);
        res.status(500).json({ message: 'Course export failed' });
    }
};

// @desc    Upload / replace a handout PDF for a course
// @route   POST /api/courses/:id/handout
// @access  Private (Instructor)
const applyHandoutIndexState = (course, syncResult = {}) => {
    const status = syncResult.status || 'failed';

    course.handout_embedding_status = status;
    course.handout_last_indexed_at = status === 'indexed' ? new Date() : null;
    course.handout_chunks_stored = syncResult.chunksStored || 0;
    course.handout_pages = syncResult.pages || 0;
    course.handout_index_error = syncResult.reason || null;
};

const resetHandoutState = (course) => {
    course.handout_filename = null;
    course.handout_path = null;
    course.handout_embedding_status = 'not_uploaded';
    course.handout_last_indexed_at = null;
    course.handout_chunks_stored = 0;
    course.handout_pages = 0;
    course.handout_index_error = null;
};

const uploadHandout = async (req, res) => {
    try {
        const access = await verifyCourseAccess(req.params.id, req.user);
        if (access.error) {
            return res.status(access.error.status).json({ message: access.error.message });
        }
        const course = access.course;

        if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

        // Remove old handout file if one exists
        if (course.handout_path) {
            const oldFile = resolveUploadPath(course.handout_path);
            await removeFileIfPresent(oldFile, { bestEffort: true });
        }

        // Save relative path (e.g. uploads/handouts/xyz.pdf)
        const relativePath = path.join('uploads', 'handouts', req.file.filename);

        course.handout_filename = req.file.originalname;
        course.handout_path = relativePath;
        course.handout_embedding_status = 'processing';
        course.handout_last_indexed_at = null;
        course.handout_chunks_stored = 0;
        course.handout_pages = 0;
        course.handout_index_error = null;

        let syncResult;
        try {
            syncResult = await syncCourseHandout(course);
        } catch (ingestError) {
            console.error('Handout indexing error:', ingestError);
            syncResult = {
                status: 'failed',
                reason: ingestError.message || 'Failed to index handout.',
                chunksStored: 0,
                pages: 0,
            };
        }

        applyHandoutIndexState(course, syncResult);
        await course.save();

        res.json({
            message: syncResult.status === 'indexed'
                ? 'Handout uploaded and indexed.'
                : `Handout uploaded, but indexing ${syncResult.status === 'skipped' ? 'was skipped' : 'failed'}.`,
            handout_filename: course.handout_filename,
            handout_path: course.handout_path,
            handout_embedding_status: course.handout_embedding_status,
            handout_last_indexed_at: course.handout_last_indexed_at,
            handout_chunks_stored: course.handout_chunks_stored,
            handout_pages: course.handout_pages,
            handout_index_error: course.handout_index_error,
        });
    } catch (error) {
        console.error('Handout upload error:', error);
        res.status(500).json({ message: 'Failed to upload handout' });
    }
};

// @desc    Delete the handout PDF for a course
// @route   DELETE /api/courses/:id/handout
// @access  Private (Instructor)
const deleteHandout = async (req, res) => {
    try {
        const access = await verifyCourseAccess(req.params.id, req.user);
        if (access.error) {
            return res.status(access.error.status).json({ message: access.error.message });
        }
        const course = access.course;

        try {
            await clearCourseHandoutVectors(course._id);
        } catch (vectorCleanupError) {
            console.error('Handout vector cleanup error:', vectorCleanupError);
        }

        if (course.handout_path) {
            const filePath = resolveUploadPath(course.handout_path);
            await removeFileIfPresent(filePath);
        }

        resetHandoutState(course);
        await course.save();

        res.json({ message: 'Handout removed' });
    } catch (error) {
        console.error('Handout delete error:', error);
        res.status(500).json({ message: 'Failed to remove handout' });
    }
};

module.exports = { createCourse, updateCourse, getCourses, getCourseById, deleteCourse, getTeacherStats, getCourseAnalytics, exportCourse, uploadHandout, deleteHandout, handoutUploadMiddleware };
