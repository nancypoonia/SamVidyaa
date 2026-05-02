const User = require('../models/User');

const ANALYTICS_DB_NAME = process.env.MONGO_ANALYTICS_DB_NAME || 'samvidya_analytics';
const COURSE_ANALYTICS_COLLECTION = 'course_analytics';
const ANALYTICS_COURSE_ID_PREFIX = 'analytics:';

const clampPercent = (value) => {
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(100, Math.round(value)));
};

const average = (values = []) => {
    const safeValues = values.map(Number).filter(Number.isFinite);
    if (!safeValues.length) return 0;
    return Math.round(safeValues.reduce((sum, value) => sum + value, 0) / safeValues.length);
};

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();
const normalizeText = (value) => String(value || '').trim();
const normalizeCourseCode = (value) => normalizeText(value).toUpperCase();
const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const exactRegex = (value) => new RegExp(`^${escapeRegExp(value)}$`, 'i');

const getAnalyticsDb = () => {
    if (User.db.readyState !== 1 || !User.db.client) return null;
    return User.db.client.db(ANALYTICS_DB_NAME);
};

const createAnalyticsCourseId = (courseId) => `${ANALYTICS_COURSE_ID_PREFIX}${encodeURIComponent(String(courseId || ''))}`;
const isAnalyticsCourseId = (courseId) => String(courseId || '').startsWith(ANALYTICS_COURSE_ID_PREFIX);
const parseAnalyticsCourseId = (courseId) => decodeURIComponent(String(courseId || '').slice(ANALYTICS_COURSE_ID_PREFIX.length));

const normalizeRate = (value) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 0;
    return clampPercent(numeric <= 1 ? numeric * 100 : numeric);
};

const deriveProgressBand = ({ completionRate = 0, moduleCompletionRate = 0, completed = false }) => {
    if (completed || moduleCompletionRate >= 100) return 'completed';
    if (completionRate <= 0 && moduleCompletionRate <= 0) return 'not_started';
    if (completionRate >= 70 || moduleCompletionRate >= 60) return 'on_track';
    if (completionRate >= 30 || moduleCompletionRate >= 25) return 'steady';
    return 'needs_support';
};

const createScoreDistribution = () => ([
    { key: '0_19', label: '0-19', min: 0, max: 19, value: 0 },
    { key: '20_39', label: '20-39', min: 20, max: 39, value: 0 },
    { key: '40_59', label: '40-59', min: 40, max: 59, value: 0 },
    { key: '60_79', label: '60-79', min: 60, max: 79, value: 0 },
    { key: '80_100', label: '80-100', min: 80, max: 100, value: 0 },
]);

const buildScoreDistribution = (scores = []) => {
    const distribution = createScoreDistribution();
    scores.forEach((score) => {
        const normalized = clampPercent(Number(score) || 0);
        const bucket = distribution.find((entry) => normalized >= entry.min && normalized <= entry.max) || distribution[distribution.length - 1];
        bucket.value += 1;
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

const mapAnalyticsCourseSummary = (doc) => ({
    _id: createAnalyticsCourseId(doc.courseId),
    course_id: doc.courseId,
    course_code: doc.courseCode || String(doc.courseId || ''),
    course_name: doc.courseName || doc.courseCode || 'Analytics Course',
    description: 'Read-only course analytics',
    subject: doc.subject || 'General',
    instructor: {
        name: doc.instructorName || 'Analytics',
    },
    is_active: true,
    points: Math.round(Number(doc.averages?.avgPointsInCourse) || 0),
    modules_count: Array.isArray(doc.moduleFunnel) ? doc.moduleFunnel.length : 0,
    analytics_source: COURSE_ANALYTICS_COLLECTION,
    analytics_synced_at: doc.syncedAt || null,
    is_analytics_course: true,
});

const buildStudentAnalytics = (doc) => {
    const students = Array.isArray(doc.students) ? doc.students : [];
    const totalModules = Math.max(
        Number(students.find((student) => Number(student.totalModules))?.totalModules) || 0,
        Array.isArray(doc.moduleFunnel) ? doc.moduleFunnel.length : 0
    );
    const totalTasks = Array.isArray(doc.taskPassRates) ? doc.taskPassRates.length : 0;

    return students.map((student) => {
        const moduleProgress = Array.isArray(student.moduleProgress) ? student.moduleProgress : [];
        const completedTasks = moduleProgress.reduce((sum, module) => sum + (Number(module.tasksPassedCount) || 0), 0);
        const moduleCompletionCount = Number(student.modulesCompleted) || moduleProgress.filter((module) => (
            module.status === 'MODULE_COMPLETED' || module.moduleTestPassed
        )).length;
        const completionRate = totalTasks ? clampPercent((completedTasks / totalTasks) * 100) : 0;
        const moduleCompletionRate = totalModules ? clampPercent((moduleCompletionCount / totalModules) * 100) : 0;
        const scoreMax = Number(student.courseTestMaxScore) || 0;
        const averageScore = scoreMax ? clampPercent(((Number(student.courseTestScore) || 0) / scoreMax) * 100) : 0;
        const progressBand = deriveProgressBand({
            completionRate,
            moduleCompletionRate,
            completed: Boolean(student.courseTestPassed),
        });
        const engagementScore = clampPercent((completionRate * 0.55) + (moduleCompletionRate * 0.25) + (averageScore * 0.2));

        return {
            studentId: String(student.studentId || student.email || student.fullName || ''),
            name: student.fullName || student.name || student.email || 'Student',
            email: student.email,
            enrollmentNumber: student.enrollmentNumber,
            section: student.section,
            globalPoints: Number(student.totalCoursePoints) || 0,
            enrollmentStatus: student.courseTestCompleted ? 'COMPLETED' : 'ACTIVE',
            completedTasks,
            completionRate,
            moduleCompletionCount,
            moduleCompletionRate,
            averageScore,
            engagementScore,
            progressBand,
            lastActivityAt: doc.syncedAt || null,
            lastLoginAt: null,
        };
    }).sort((left, right) => {
        if (right.engagementScore !== left.engagementScore) return right.engagementScore - left.engagementScore;
        return right.globalPoints - left.globalPoints;
    });
};

const buildModuleAnalytics = (doc, studentCount) => {
    const students = Array.isArray(doc.students) ? doc.students : [];
    const modulesById = new Map();

    students.forEach((student) => {
        (student.moduleProgress || []).forEach((module) => {
            const moduleId = String(module.moduleId || module.moduleName || '');
            if (!moduleId) return;

            if (!modulesById.has(moduleId)) {
                modulesById.set(moduleId, {
                    moduleId,
                    moduleName: module.moduleName || 'Module',
                    moduleOrder: Number(module.moduleOrder) || 0,
                    records: [],
                });
            }

            modulesById.get(moduleId).records.push(module);
        });
    });

    (doc.moduleFunnel || []).forEach((module, index) => {
        const moduleId = String(module.moduleId || module.moduleName || `module-${index + 1}`);
        if (!modulesById.has(moduleId)) {
            modulesById.set(moduleId, {
                moduleId,
                moduleName: module.moduleName || `Module ${index + 1}`,
                moduleOrder: index + 1,
                records: [],
                studentsReached: Number(module.studentsReached) || 0,
            });
        } else {
            modulesById.get(moduleId).studentsReached = Number(module.studentsReached) || 0;
        }
    });

    return [...modulesById.values()]
        .sort((left, right) => left.moduleOrder - right.moduleOrder)
        .map((module) => {
            const records = module.records || [];
            const studentsStarted = Math.max(module.studentsReached || 0, records.filter((record) => (
                record.status && record.status !== 'NOT_STARTED'
            )).length);
            const studentsCompleted = records.filter((record) => (
                record.status === 'MODULE_COMPLETED' || record.moduleTestPassed
            )).length;
            const scorePercentages = records.map((record) => {
                const maxScore = Number(record.moduleTestMaxScore) || 0;
                return maxScore ? ((Number(record.moduleTestScore) || 0) / maxScore) * 100 : 0;
            });

            return {
                moduleId: module.moduleId,
                moduleName: module.moduleName,
                moduleOrder: module.moduleOrder,
                taskCount: average(records.map((record) => Number(record.minTasksRequired) || 0)),
                studentsStarted,
                studentsCompleted,
                startedRate: studentCount ? clampPercent((studentsStarted / studentCount) * 100) : 0,
                completedRate: studentCount ? clampPercent((studentsCompleted / studentCount) * 100) : 0,
                averageScore: average(scorePercentages),
                averageTaskCompletion: average(records.map((record) => normalizeRate(record.tasksPassedCount))),
            };
        });
};

const buildTaskHotspots = (doc) => (doc.taskPassRates || []).map((task, index) => {
    const passRate = normalizeRate(task.passRate);
    const challengeScore = clampPercent(100 - passRate);

    return {
        taskId: String(task.taskId || task.taskName || `task-${index + 1}`),
        taskName: task.taskName || `Task ${index + 1}`,
        courseId: createAnalyticsCourseId(doc.courseId),
        courseName: doc.courseName || '',
        courseCode: doc.courseCode || '',
        moduleId: null,
        moduleName: '',
        moduleOrder: 0,
        difficulty: '',
        language: '',
        points: 0,
        attempts: 0,
        passCount: 0,
        failCount: 0,
        passRate,
        completionCount: 0,
        completionRate: passRate,
        averageRuntimeMs: 0,
        averageTestCoverage: passRate,
        challengeScore,
        heatLevel: determineHeatLevel(challengeScore),
    };
}).sort((left, right) => right.challengeScore - left.challengeScore);

const buildCourseAnalyticsResponseFromDocument = (doc) => {
    const studentAnalytics = buildStudentAnalytics(doc);
    const activeStudents = studentAnalytics.length;
    const moduleAnalytics = buildModuleAnalytics(doc, activeStudents);
    const taskDifficultyHotspots = buildTaskHotspots(doc);
    const progressBandBreakdown = studentAnalytics.reduce((acc, student) => {
        acc[student.progressBand] = (acc[student.progressBand] || 0) + 1;
        return acc;
    }, { completed: 0, on_track: 0, steady: 0, needs_support: 0, not_started: 0 });
    const attentionNeeded = [...studentAnalytics]
        .filter((student) => ['needs_support', 'not_started'].includes(student.progressBand))
        .sort((left, right) => left.engagementScore - right.engagementScore)
        .slice(0, 5);
    const topPerformers = studentAnalytics.slice(0, 5);
    const bottleneckModule = [...moduleAnalytics]
        .sort((left, right) => left.completedRate - right.completedRate)[0] || null;
    const hardestTask = taskDifficultyHotspots[0] || null;
    const avgCompletionRate = doc.averages?.avgTasksCompleted
        ? average(studentAnalytics.map((student) => student.completionRate))
        : average(studentAnalytics.map((student) => student.moduleCompletionRate));
    const avgScore = doc.averages?.courseTestPassRate !== undefined
        ? normalizeRate(doc.averages.courseTestPassRate)
        : average(studentAnalytics.map((student) => student.averageScore));

    return {
        course: {
            _id: createAnalyticsCourseId(doc.courseId),
            course_name: doc.courseName,
            course_code: doc.courseCode,
            subject: doc.subject,
            analytics_source: COURSE_ANALYTICS_COLLECTION,
        },
        overview: {
            totalStudents: activeStudents,
            activeStudents,
            pendingStudents: 0,
            rejectedStudents: 0,
            completedEnrollments: studentAnalytics.filter((student) => student.enrollmentStatus === 'COMPLETED').length,
            totalModules: moduleAnalytics.length,
            totalTasks: Array.isArray(doc.taskPassRates) ? doc.taskPassRates.length : 0,
            avgCompletionRate,
            avgScore,
            studentsNeedingSupport: (progressBandBreakdown.needs_support || 0) + (progressBandBreakdown.not_started || 0),
            topPerformer: topPerformers[0] || null,
            bottleneckModule,
            hardestTask,
            avgTaskPassRate: average(taskDifficultyHotspots.map((task) => task.passRate)),
            dataMode: 'analytics_sync',
        },
        distributions: {
            enrollmentStatus: {
                ACTIVE: studentAnalytics.filter((student) => student.enrollmentStatus === 'ACTIVE').length,
                COMPLETED: studentAnalytics.filter((student) => student.enrollmentStatus === 'COMPLETED').length,
            },
            progressBand: progressBandBreakdown,
            scoreBand: buildScoreDistribution(studentAnalytics.map((student) => student.averageScore)),
        },
        topPerformers,
        attentionNeeded,
        moduleAnalytics,
        taskDifficultyHotspots,
        leaderboardSnapshot: buildLeaderboardSnapshot(topPerformers, attentionNeeded),
        studentAnalytics,
    };
};

async function findAnalyticsCourseById(courseId) {
    const analyticsDb = getAnalyticsDb();
    if (!analyticsDb || !courseId) return null;
    const collection = analyticsDb.collection(COURSE_ANALYTICS_COLLECTION);
    const stringMatch = await collection.findOne({ courseId: String(courseId) });
    if (stringMatch) return stringMatch;

    const numericCourseId = Number(courseId);
    if (Number.isFinite(numericCourseId)) {
        return collection.findOne({ courseId: numericCourseId });
    }

    return null;
}

async function findAnalyticsCourseByCode(courseCode) {
    const analyticsDb = getAnalyticsDb();
    if (!analyticsDb || !courseCode) return null;
    return analyticsDb.collection(COURSE_ANALYTICS_COLLECTION).findOne({ courseCode: exactRegex(courseCode) });
}

async function countAnalyticsCoursesExcludingCodes(courseCodes = []) {
    const analyticsDb = getAnalyticsDb();
    if (!analyticsDb) return 0;

    const existingCodes = new Set(courseCodes.map(normalizeCourseCode).filter(Boolean));
    const docs = await analyticsDb
        .collection(COURSE_ANALYTICS_COLLECTION)
        .find({}, { projection: { courseCode: 1, courseId: 1 } })
        .toArray();

    return docs.filter((doc) => {
        const courseCode = normalizeCourseCode(doc.courseCode || doc.courseId);
        return courseCode && !existingCodes.has(courseCode);
    }).length;
}

async function updateAnalyticsCourseMetadata(courseId, updates = {}) {
    const analyticsDb = getAnalyticsDb();
    if (!analyticsDb || !courseId) return null;

    const set = {};
    if (updates.course_code !== undefined) set.courseCode = normalizeCourseCode(updates.course_code);
    if (updates.course_name !== undefined) set.courseName = normalizeText(updates.course_name);
    if (updates.subject !== undefined) set.subject = normalizeText(updates.subject);
    if (updates.instructor_name !== undefined) set.instructorName = normalizeText(updates.instructor_name);

    Object.keys(set).forEach((key) => {
        if (!set[key]) delete set[key];
    });

    if (!Object.keys(set).length) {
        return findAnalyticsCourseById(courseId);
    }

    const query = [{ courseId: String(courseId) }];
    const numericCourseId = Number(courseId);
    if (Number.isFinite(numericCourseId)) {
        query.push({ courseId: numericCourseId });
    }

    const result = await analyticsDb.collection(COURSE_ANALYTICS_COLLECTION).findOneAndUpdate(
        { $or: query },
        { $set: set },
        { returnDocument: 'after' }
    );

    if (!result) return null;
    if (Object.prototype.hasOwnProperty.call(result, 'value')) {
        return result.value;
    }

    return result;
}

async function listAnalyticsCoursesForUser(user, options = {}) {
    const { includeAllForStudent = false, courseCodes = [] } = options;
    const analyticsDb = getAnalyticsDb();
    if (!analyticsDb || !user) return [];

    const role = String(user.role || '').toUpperCase();
    let query = {};

    if (role === 'STUDENT') {
        if (!includeAllForStudent) {
            const email = normalizeEmail(user.email);
            if (!email) return [];
            query = { 'students.email': exactRegex(email) };
        }
    } else if (role !== 'ADMIN') {
        const filters = [];
        const instructorName = normalizeText(user.name);
        const normalizedCourseCodes = courseCodes.map(normalizeCourseCode).filter(Boolean);

        if (instructorName) {
            filters.push({ instructorName: exactRegex(instructorName) });
        }

        if (normalizedCourseCodes.length) {
            filters.push({ courseCode: { $in: normalizedCourseCodes } });
        }

        if (!filters.length) return [];
        query = { $or: filters };
    }

    const docs = await analyticsDb.collection(COURSE_ANALYTICS_COLLECTION)
        .find(query)
        .project({
            courseId: 1,
            courseCode: 1,
            courseName: 1,
            subject: 1,
            instructorName: 1,
            syncedAt: 1,
            averages: 1,
            moduleFunnel: 1,
        })
        .sort({ syncedAt: -1, courseName: 1 })
        .toArray();

    return docs.map(mapAnalyticsCourseSummary);
}

async function listAnalyticsCourseDocumentsForUser(user, options = {}) {
    const { courseCodes = [] } = options;
    const analyticsDb = getAnalyticsDb();
    if (!analyticsDb || !user) return [];

    const role = String(user.role || '').toUpperCase();
    let query = {};

    if (role === 'STUDENT') {
        const email = normalizeEmail(user.email);
        if (!email) return [];
        query = { 'students.email': exactRegex(email) };
    } else if (role !== 'ADMIN') {
        const filters = [];
        const instructorName = normalizeText(user.name);
        const normalizedCourseCodes = courseCodes.map(normalizeCourseCode).filter(Boolean);

        if (instructorName) {
            filters.push({ instructorName: exactRegex(instructorName) });
        }

        if (normalizedCourseCodes.length) {
            filters.push({ courseCode: { $in: normalizedCourseCodes } });
        }

        if (!filters.length) return [];
        query = { $or: filters };
    }

    return analyticsDb.collection(COURSE_ANALYTICS_COLLECTION)
        .find(query)
        .sort({ syncedAt: -1, courseName: 1 })
        .toArray();
}

async function listAnalyticsEnrollmentsForStudent(user) {
    const courses = await listAnalyticsCoursesForUser(user);

    return courses.map((course) => ({
        _id: `analytics-enrollment:${course.course_id}:${user._id}`,
        course_id: course,
        student_id: user._id,
        status: 'ACTIVE',
        createdAt: course.analytics_synced_at || new Date(),
        updatedAt: course.analytics_synced_at || new Date(),
        analytics_source: COURSE_ANALYTICS_COLLECTION,
        is_analytics_enrollment: true,
    }));
}

async function buildAnalyticsTeacherStatsForUser(user, options = {}) {
    const excludedCourseCodes = new Set((options.excludeCourseCodes || []).map(normalizeCourseCode));
    const docs = (await listAnalyticsCourseDocumentsForUser(user, { courseCodes: options.courseCodes || [] }))
        .filter((doc) => !excludedCourseCodes.has(String(doc.courseCode || '').toUpperCase()));
    const analyticsResponses = docs.map(buildCourseAnalyticsResponseFromDocument);
    const allStudents = analyticsResponses.flatMap((entry) => entry.studentAnalytics || []);
    const uniqueStudentIds = new Set(allStudents.map((student) => normalizeEmail(student.email) || student.studentId).filter(Boolean));
    const progressBandBreakdown = allStudents.reduce((acc, student) => {
        acc[student.progressBand] = (acc[student.progressBand] || 0) + 1;
        return acc;
    }, { completed: 0, on_track: 0, steady: 0, needs_support: 0, not_started: 0 });
    const topPerformers = [...allStudents]
        .sort((left, right) => right.engagementScore - left.engagementScore)
        .slice(0, 5);
    const attentionNeeded = [...allStudents]
        .filter((student) => ['needs_support', 'not_started'].includes(student.progressBand))
        .sort((left, right) => left.engagementScore - right.engagementScore)
        .slice(0, 5);
    const taskDifficultyHotspots = analyticsResponses
        .flatMap((entry) => entry.taskDifficultyHotspots || [])
        .sort((left, right) => right.challengeScore - left.challengeScore)
        .slice(0, 10);
    const courseBreakdown = analyticsResponses.map((entry) => {
        const studentCount = entry.studentAnalytics.length;
        const supportCount = (entry.distributions.progressBand.needs_support || 0) + (entry.distributions.progressBand.not_started || 0);

        return {
            courseId: entry.course._id,
            courseName: entry.course.course_name,
            courseCode: entry.course.course_code,
            activeLearners: entry.overview.activeStudents,
            avgCompletionRate: entry.overview.avgCompletionRate,
            avgScore: entry.overview.avgScore,
            averageEngagement: average(entry.studentAnalytics.map((student) => student.engagementScore)),
            supportShare: studentCount ? clampPercent((supportCount / studentCount) * 100) : 0,
            topHotspot: entry.taskDifficultyHotspots[0] || null,
        };
    });
    const strongestCourse = [...courseBreakdown].sort((left, right) => (
        (right.avgCompletionRate + right.avgScore) - (left.avgCompletionRate + left.avgScore)
    ))[0] || null;
    const needsAttentionCourse = [...courseBreakdown].sort((left, right) => right.supportShare - left.supportShare)[0] || null;
    const toughestCourse = [...courseBreakdown].filter((course) => course.topHotspot).sort((left, right) => (
        (right.topHotspot?.challengeScore || 0) - (left.topHotspot?.challengeScore || 0)
    ))[0] || null;
    const avgCompletionRate = average(analyticsResponses.map((entry) => entry.overview.avgCompletionRate));
    const avgScore = average(analyticsResponses.map((entry) => entry.overview.avgScore));

    return {
        activeClasses: docs.length,
        totalStudents: uniqueStudentIds.size,
        pendingGrading: 0,
        avgPerformance: `${avgCompletionRate}%`,
        performanceAnalytics: {
            activeLearners: uniqueStudentIds.size,
            avgCompletionRate,
            avgScore,
            studentsNeedingSupport: (progressBandBreakdown.needs_support || 0) + (progressBandBreakdown.not_started || 0),
            progressBandBreakdown,
            topPerformers,
            attentionNeeded,
            leaderboardSnapshot: buildLeaderboardSnapshot(topPerformers, attentionNeeded),
            scoreDistribution: buildScoreDistribution(allStudents.map((student) => student.averageScore)),
            taskDifficultyHotspots,
            courseBreakdown,
            courseHighlights: {
                strongestCourse,
                needsAttentionCourse,
                toughestCourse,
            },
            studentCount: allStudents.length,
            dataMode: docs.length ? 'analytics_sync' : 'enrollment_only',
        },
    };
}

module.exports = {
    ANALYTICS_COURSE_ID_PREFIX,
    buildAnalyticsTeacherStatsForUser,
    buildCourseAnalyticsResponseFromDocument,
    countAnalyticsCoursesExcludingCodes,
    createAnalyticsCourseId,
    findAnalyticsCourseByCode,
    findAnalyticsCourseById,
    isAnalyticsCourseId,
    listAnalyticsCoursesForUser,
    listAnalyticsEnrollmentsForStudent,
    mapAnalyticsCourseSummary,
    parseAnalyticsCourseId,
    updateAnalyticsCourseMetadata,
};
