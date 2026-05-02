const test = require('node:test');
const assert = require('node:assert/strict');

const rewardController = require('../controllers/rewardController');
const Reward = require('../models/Reward');
const Enrollment = require('../models/Enrollment');
const Course = require('../models/Course');

const {
    createMockResponse,
    stubMethod,
    createQueryChain,
    createAwaitableQuery,
    createSelectLeanQuery,
} = require('./testUtils');

test('createReward allows uppercase admin users on any course', async (t) => {
    let createdPayload = null;

    stubMethod(t, Course, 'findById', () => createAwaitableQuery({
        _id: 'course-1',
        instructor: { toString: () => 'teacher-1' },
    }));
    stubMethod(t, Reward, 'create', async (payload) => {
        createdPayload = payload;
        return { _id: 'reward-1', ...payload };
    });

    const req = {
        user: { _id: 'admin-1', role: 'ADMIN' },
        body: {
            course_id: 'course-1',
            name: 'Badge',
            description: 'Well done',
            cost: 10,
        },
    };
    const res = createMockResponse();

    await rewardController.createReward(req, res);

    assert.equal(res.statusCode, 201);
    assert.equal(createdPayload.createdBy, 'admin-1');
});

test('deleteReward allows uppercase admin users', async (t) => {
    let deleted = false;

    stubMethod(t, Reward, 'findById', () => createAwaitableQuery({
        _id: 'reward-1',
        createdBy: { toString: () => 'teacher-1' },
        async deleteOne() {
            deleted = true;
        },
    }));

    const req = {
        user: { _id: 'admin-1', role: 'ADMIN' },
        params: { id: 'reward-1' },
    };
    const res = createMockResponse();

    await rewardController.deleteReward(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(deleted, true);
});

test('getStudentRewards returns empty list when student has no qualifying enrollments', async (t) => {
    let rewardFindCalled = false;

    stubMethod(t, Enrollment, 'find', () => createSelectLeanQuery([]));
    stubMethod(t, Reward, 'find', () => {
        rewardFindCalled = true;
        return createQueryChain([], ['populate', 'sort']);
    });

    const req = { user: { _id: 'student-1', role: 'STUDENT' } };
    const res = createMockResponse();

    await rewardController.getStudentRewards(req, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, []);
    assert.equal(res.getHeader('x-total-count'), '0');
    assert.equal(rewardFindCalled, false);
});

test('getStudentRewards deduplicates course ids before fetching rewards', async (t) => {
    let capturedQuery = null;

    stubMethod(t, Enrollment, 'find', () => createSelectLeanQuery([
        { course_id: 'course-1' },
        { course_id: 'course-1' },
        { course_id: 'course-2' },
    ]));
    stubMethod(t, Reward, 'countDocuments', async () => 1);

    stubMethod(t, Reward, 'find', (query) => {
        capturedQuery = query;
        return createQueryChain([{ _id: 'reward-1' }], ['populate', 'sort', 'skip', 'limit']);
    });

    const req = { user: { _id: 'student-1', role: 'STUDENT' } };
    const res = createMockResponse();

    await rewardController.getStudentRewards(req, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, [{ _id: 'reward-1' }]);
    assert.equal(res.getHeader('x-total-count'), '1');
    assert.deepEqual(capturedQuery, {
        course_id: { $in: ['course-1', 'course-2'] },
    });
});
