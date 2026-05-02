const test = require('node:test');
const assert = require('node:assert/strict');
const User = require('../models/User');

const {
    buildCourseAnalyticsResponseFromDocument,
    createAnalyticsCourseId,
    isAnalyticsCourseId,
    listAnalyticsCoursesForUser,
    parseAnalyticsCourseId,
} = require('../services/analyticsCourseService');

function stubAnalyticsCourses(t, docs) {
    const originalDb = Object.getOwnPropertyDescriptor(User, 'db');
    let capturedQuery;

    Object.defineProperty(User, 'db', {
        configurable: true,
        value: {
            readyState: 1,
            client: {
                db() {
                    return {
                        collection() {
                            return {
                                find(query) {
                                    capturedQuery = query;
                                    return {
                                        project() {
                                            return this;
                                        },
                                        sort() {
                                            return this;
                                        },
                                        async toArray() {
                                            return docs.filter((doc) => {
                                                if (!query || !Object.keys(query).length) return true;
                                                if (query['students.email']) {
                                                    return doc.students?.some((student) => query['students.email'].test(student.email));
                                                }
                                                return true;
                                            });
                                        },
                                    };
                                },
                            };
                        },
                    };
                },
            },
        },
    });

    t.after(() => {
        if (originalDb) {
            Object.defineProperty(User, 'db', originalDb);
        } else {
            delete User.db;
        }
    });

    return () => capturedQuery;
}

test('analytics course ids round-trip safely', () => {
    const id = createAnalyticsCourseId('PY 101');

    assert.equal(isAnalyticsCourseId(id), true);
    assert.equal(parseAnalyticsCourseId(id), 'PY 101');
});

test('buildCourseAnalyticsResponseFromDocument maps analytics schema for dashboard use', () => {
    const analytics = buildCourseAnalyticsResponseFromDocument({
        courseId: 101,
        courseCode: 'PY101',
        courseName: 'Python Basics',
        subject: 'Python',
        instructorName: 'Dr. Rao',
        syncedAt: '2026-05-01T00:00:00.000Z',
        averages: {
            courseTestPassRate: 75,
        },
        moduleFunnel: [
            { moduleName: 'Intro', studentsReached: 2 },
        ],
        taskPassRates: [
            { taskName: 'Variables', passRate: 0.5 },
        ],
        students: [
            {
                studentId: 1,
                fullName: 'Asha Student',
                email: 'asha@example.com',
                enrollmentNumber: 'STU001',
                totalCoursePoints: 80,
                modulesCompleted: 1,
                totalModules: 1,
                courseTestCompleted: true,
                courseTestPassed: true,
                courseTestScore: 8,
                courseTestMaxScore: 10,
                moduleProgress: [
                    {
                        moduleId: 11,
                        moduleName: 'Intro',
                        moduleOrder: 1,
                        status: 'MODULE_COMPLETED',
                        tasksPassedCount: 1,
                        minTasksRequired: 1,
                        moduleTestPassed: true,
                        moduleTestScore: 5,
                        moduleTestMaxScore: 5,
                    },
                ],
            },
        ],
    });

    assert.equal(analytics.course.course_code, 'PY101');
    assert.equal(analytics.overview.activeStudents, 1);
    assert.equal(analytics.overview.avgScore, 75);
    assert.equal(analytics.moduleAnalytics[0].moduleName, 'Intro');
    assert.equal(analytics.taskDifficultyHotspots[0].passRate, 50);
    assert.equal(analytics.studentAnalytics[0].progressBand, 'completed');
});

test('listAnalyticsCoursesForUser scopes student analytics courses by email', async (t) => {
    const getQuery = stubAnalyticsCourses(t, [
        {
            courseId: 101,
            courseCode: 'PY101',
            courseName: 'Python Basics',
            students: [{ email: 'asha@example.com' }],
        },
        {
            courseId: 102,
            courseCode: 'JS101',
            courseName: 'JavaScript Basics',
            students: [{ email: 'other@example.com' }],
        },
    ]);

    const courses = await listAnalyticsCoursesForUser({
        role: 'STUDENT',
        email: 'Asha@Example.com',
    });

    assert.equal(getQuery()['students.email'].test('asha@example.com'), true);
    assert.deepEqual(courses.map((course) => course.course_code), ['PY101']);
});
