const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

const User = require('../models/User');
const { admin, instructorOrAdmin, protect } = require('../middleware/authMiddleware');
const { createMockResponse, stubMethod } = require('./testUtils');

test('instructorOrAdmin allows instructor users', () => {
    const res = createMockResponse();
    let nextCalled = false;

    instructorOrAdmin(
        { user: { role: 'INSTRUCTOR' } },
        res,
        () => { nextCalled = true; }
    );

    assert.equal(nextCalled, true);
    assert.equal(res.statusCode, 200);
});

test('instructorOrAdmin rejects student users', () => {
    const res = createMockResponse();
    let nextCalled = false;

    instructorOrAdmin(
        { user: { role: 'STUDENT' } },
        res,
        () => { nextCalled = true; }
    );

    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 401);
    assert.deepEqual(res.body, { message: 'Not authorized as an instructor or admin' });
});

test('admin allows uppercase admin users', () => {
    const res = createMockResponse();
    let nextCalled = false;

    admin(
        { user: { role: 'ADMIN' } },
        res,
        () => { nextCalled = true; }
    );

    assert.equal(nextCalled, true);
    assert.equal(res.statusCode, 200);
});

test('protect rejects valid tokens for deleted users', async (t) => {
    const previousSecret = process.env.JWT_SECRET;
    process.env.JWT_SECRET = 'auth-middleware-test-secret';
    t.after(() => {
        if (previousSecret === undefined) {
            delete process.env.JWT_SECRET;
        } else {
            process.env.JWT_SECRET = previousSecret;
        }
    });

    stubMethod(t, User, 'findById', () => ({
        select: async () => null,
    }));

    const token = jwt.sign({ id: '507f1f77bcf86cd799439011' }, process.env.JWT_SECRET);
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = createMockResponse();
    let nextCalled = false;

    await protect(req, res, () => { nextCalled = true; });

    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 401);
    assert.deepEqual(res.body, { message: 'Not authorized, user not found' });
});
