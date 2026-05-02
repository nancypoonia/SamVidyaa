const path = require('path');
const multer = require('multer');

const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;
const TASK_DIFFICULTIES = new Set(['EASY', 'MEDIUM', 'HARD']);
const TASK_RESULT_STATUSES = new Set(['PASSED', 'FAILED']);
const ANNOUNCEMENT_AUDIENCES = new Set(['GLOBAL', 'COURSE']);
const TASK_IMPORT_EXTENSIONS = new Set(['.pdf', '.doc', '.docx', '.rtf', '.txt', '.md', '.csv', '.xlsx']);
const TASK_IMPORT_MIME_TYPES = new Set([
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/rtf',
    'text/rtf',
    'text/plain',
    'text/markdown',
    'text/csv',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);
const MODULE_FILE_EXTENSIONS = new Set([
    ...TASK_IMPORT_EXTENSIONS,
    '.xls',
    '.png',
    '.jpg',
    '.jpeg',
    '.gif',
    '.webp',
]);
const MODULE_FILE_MIME_TYPES = new Set([
    ...TASK_IMPORT_MIME_TYPES,
    'image/png',
    'image/jpeg',
    'image/gif',
    'image/webp',
]);
const PDF_EXTENSIONS = new Set(['.pdf']);
const INSTALLER_EXTENSIONS = new Set(['.exe', '.msi']);

const isAdminRole = (role) => String(role || '').toUpperCase() === 'ADMIN';
const addError = (errors, field, message) => {
    if (!errors[field]) {
        errors[field] = message;
    }
};

const trimmedString = (value) => (typeof value === 'string' ? value.trim() : '');
const hasValue = (value) => {
    if (value === undefined || value === null) return false;
    if (typeof value === 'string') return value.trim() !== '';
    return true;
};

const parseNumberLike = (value) => {
    if (typeof value === 'number') return value;
    if (typeof value === 'string' && value.trim() !== '') return Number(value);
    return Number.NaN;
};

const parseBooleanLike = (value) => {
    if (typeof value === 'boolean') return value;
    if (value === 'true') return true;
    if (value === 'false') return false;
    return null;
};

const normalizedExtension = (filename = '') => path.extname(filename || '').toLowerCase();

const validateObjectId = (value, field, errors, options = {}) => {
    const { required = false, message } = options;

    if (!hasValue(value)) {
        if (required) addError(errors, field, message || `${field} is required`);
        return;
    }

    if (!OBJECT_ID_PATTERN.test(String(value))) {
        addError(errors, field, `${field} must be a valid id`);
    }
};

const validateCourseIdentifier = (value, field, errors, options = {}) => {
    const { required = false } = options;

    if (!hasValue(value)) {
        if (required) addError(errors, field, `${field} is required`);
        return;
    }

    const normalized = String(value);
    if (OBJECT_ID_PATTERN.test(normalized)) {
        return;
    }

    if (normalized.startsWith('analytics:') && normalized.length > 'analytics:'.length && normalized.length <= 140) {
        return;
    }

    addError(errors, field, `${field} must be a valid id`);
};

const validateString = (value, field, errors, options = {}) => {
    const {
        required = false,
        minLength = 1,
        maxLength = 5000,
        message,
    } = options;

    if (!hasValue(value)) {
        if (required) addError(errors, field, message || `${field} is required`);
        return;
    }

    if (typeof value !== 'string') {
        addError(errors, field, `${field} must be a string`);
        return;
    }

    const normalized = value.trim();
    if (normalized.length < minLength) {
        addError(errors, field, `${field} must be at least ${minLength} characters`);
        return;
    }

    if (normalized.length > maxLength) {
        addError(errors, field, `${field} must be at most ${maxLength} characters`);
    }
};

const validateEmail = (value, field, errors, options = {}) => {
    validateString(value, field, errors, { ...options, required: true, maxLength: 254 });
    if (errors[field]) return;

    const normalized = trimmedString(value);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
        addError(errors, field, `${field} must be a valid email address`);
    }
};

const validateEnum = (value, field, errors, allowedValues, options = {}) => {
    const { required = false } = options;

    if (!hasValue(value)) {
        if (required) addError(errors, field, `${field} is required`);
        return;
    }

    if (typeof value !== 'string') {
        addError(errors, field, `${field} must be a string`);
        return;
    }

    const normalized = value.trim().toUpperCase();
    if (!allowedValues.has(normalized)) {
        addError(errors, field, `${field} must be one of: ${[...allowedValues].join(', ')}`);
    }
};

const validateNumber = (value, field, errors, options = {}) => {
    const {
        required = false,
        integer = false,
        min = null,
        max = null,
    } = options;

    if (!hasValue(value)) {
        if (required) addError(errors, field, `${field} is required`);
        return;
    }

    const parsed = parseNumberLike(value);
    if (!Number.isFinite(parsed)) {
        addError(errors, field, `${field} must be a valid number`);
        return;
    }

    if (integer && !Number.isInteger(parsed)) {
        addError(errors, field, `${field} must be an integer`);
        return;
    }

    if (min !== null && parsed < min) {
        addError(errors, field, `${field} must be at least ${min}`);
        return;
    }

    if (max !== null && parsed > max) {
        addError(errors, field, `${field} must be at most ${max}`);
    }
};

const validateBoolean = (value, field, errors, options = {}) => {
    const { required = false } = options;

    if (!hasValue(value)) {
        if (required) addError(errors, field, `${field} is required`);
        return;
    }

    if (parseBooleanLike(value) === null) {
        addError(errors, field, `${field} must be true or false`);
    }
};

const validateDateValue = (value, field, errors, options = {}) => {
    const { required = false } = options;

    if (!hasValue(value)) {
        if (required) addError(errors, field, `${field} is required`);
        return;
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        addError(errors, field, `${field} must be a valid date`);
    }
};

const validateObjectArray = (value, field, errors, itemValidator, options = {}) => {
    const { required = false } = options;

    if (!hasValue(value)) {
        if (required) addError(errors, field, `${field} is required`);
        return;
    }

    if (!Array.isArray(value)) {
        addError(errors, field, `${field} must be an array`);
        return;
    }

    value.forEach((item, index) => itemValidator(item, `${field}[${index}]`, errors));
};

const validateFile = (file, field, errors, options = {}) => {
    const {
        required = false,
        allowedExtensions = null,
        allowedMimeTypes = null,
    } = options;

    if (!file) {
        if (required) addError(errors, field, `${field} is required`);
        return;
    }

    const extension = normalizedExtension(file.originalname);
    if (allowedExtensions && !allowedExtensions.has(extension)) {
        addError(errors, field, `${field} has an unsupported file type`);
        return;
    }

    if (allowedMimeTypes && file.mimetype && !allowedMimeTypes.has(file.mimetype)) {
        addError(errors, field, `${field} has an unsupported file type`);
    }
};

const validateFiles = (files, field, errors, options = {}) => {
    if (!files) return;

    if (!Array.isArray(files)) {
        addError(errors, field, `${field} must be an array of files`);
        return;
    }

    files.forEach((file, index) => {
        validateFile(file, `${field}[${index}]`, errors, options);
    });
};

const validateRequest = (validator) => (req, res, next) => {
    const errors = {};
    validator(req, errors);

    if (Object.keys(errors).length > 0) {
        return res.status(400).json({
            message: 'Validation failed',
            errors,
        });
    }

    return next();
};

const handleUploadMiddleware = (uploadMiddleware) => (req, res, next) => uploadMiddleware(req, res, (error) => {
    if (!error) {
        return next();
    }

    const fileError = error instanceof multer.MulterError
        ? error.message
        : error.message || 'Invalid upload';

    return res.status(400).json({
        message: 'Validation failed',
        errors: {
            file: fileError,
        },
    });
});

const validateRegisterRequest = validateRequest((req, errors) => {
    validateString(req.body.name, 'name', errors, { required: true, maxLength: 120 });
    validateEmail(req.body.email, 'email', errors);
    validateString(req.body.password, 'password', errors, { required: true, minLength: 6, maxLength: 128 });
    validateString(req.body.username, 'username', errors, { maxLength: 60 });
    validateString(req.body.institution, 'institution', errors, { maxLength: 160 });
    validateString(req.body.enrollment_number, 'enrollment_number', errors, { maxLength: 60 });
});

const validateLoginRequest = validateRequest((req, errors) => {
    validateEmail(req.body.email, 'email', errors);
    validateString(req.body.password, 'password', errors, { required: true, minLength: 1, maxLength: 128 });
});

const validateCourseCreateRequest = validateRequest((req, errors) => {
    validateString(req.body.course_code, 'course_code', errors, { required: true, maxLength: 30 });
    validateString(req.body.course_name, 'course_name', errors, { required: true, maxLength: 160 });
    validateString(req.body.subject, 'subject', errors, { required: true, maxLength: 120 });
    validateString(req.body.description, 'description', errors, { maxLength: 5000 });
    validateNumber(req.body.course_test_questions, 'course_test_questions', errors, { integer: true, min: 0 });
    validateNumber(req.body.points, 'points', errors, { integer: true, min: 0 });
});

const validateCourseUpdateRequest = validateRequest((req, errors) => {
    validateCourseIdentifier(req.params.id, 'id', errors, { required: true });
    validateString(req.body.course_code, 'course_code', errors, { maxLength: 30 });
    validateString(req.body.course_name, 'course_name', errors, { maxLength: 160 });
    validateString(req.body.subject, 'subject', errors, { maxLength: 120 });
    validateString(req.body.description, 'description', errors, { maxLength: 5000 });
    validateString(req.body.instructor_name, 'instructor_name', errors, { maxLength: 160 });
    validateNumber(req.body.course_test_questions, 'course_test_questions', errors, { integer: true, min: 0 });
    validateNumber(req.body.points, 'points', errors, { integer: true, min: 0 });
    validateBoolean(req.body.is_active, 'is_active', errors);
});

const validateCourseIdParam = validateRequest((req, errors) => {
    validateObjectId(req.params.id, 'id', errors, { required: true });
});

const validateCourseHandoutUploadRequest = validateRequest((req, errors) => {
    validateObjectId(req.params.id, 'id', errors, { required: true });
    validateFile(req.file, 'handout', errors, {
        required: true,
        allowedExtensions: PDF_EXTENSIONS,
    });
});

const validateModuleCreateRequest = validateRequest((req, errors) => {
    validateObjectId(req.body.course_id, 'course_id', errors, { required: true });
    validateString(req.body.module_name, 'module_name', errors, { required: true, maxLength: 160 });
    validateString(req.body.description, 'description', errors, { maxLength: 5000 });
    validateNumber(req.body.module_order, 'module_order', errors, { integer: true, min: 1 });
    validateNumber(req.body.tasks_per_module, 'tasks_per_module', errors, { integer: true, min: 0 });
    validateNumber(req.body.module_test_questions, 'module_test_questions', errors, { integer: true, min: 0 });
    validateNumber(req.body.points, 'points', errors, { integer: true, min: 0 });
    validateBoolean(req.body.is_active, 'is_active', errors);
    validateFiles(req.files, 'files', errors, {
        allowedExtensions: MODULE_FILE_EXTENSIONS,
        allowedMimeTypes: MODULE_FILE_MIME_TYPES,
    });
});

const validateModuleUpdateRequest = validateRequest((req, errors) => {
    validateObjectId(req.params.id, 'id', errors, { required: true });
    validateString(req.body.module_name, 'module_name', errors, { maxLength: 160 });
    validateString(req.body.description, 'description', errors, { maxLength: 5000 });
    validateNumber(req.body.module_order, 'module_order', errors, { integer: true, min: 1 });
    validateNumber(req.body.tasks_per_module, 'tasks_per_module', errors, { integer: true, min: 0 });
    validateNumber(req.body.module_test_questions, 'module_test_questions', errors, { integer: true, min: 0 });
    validateNumber(req.body.points, 'points', errors, { integer: true, min: 0 });
    validateBoolean(req.body.is_active, 'is_active', errors);
    validateFiles(req.files, 'files', errors, {
        allowedExtensions: MODULE_FILE_EXTENSIONS,
        allowedMimeTypes: MODULE_FILE_MIME_TYPES,
    });
});

const validateModuleFileDeleteRequest = validateRequest((req, errors) => {
    validateObjectId(req.params.id, 'id', errors, { required: true });
    validateString(req.body.filePath, 'filePath', errors, { required: true, maxLength: 500 });
});

const validateTaskPayload = (payload, errors, { isUpdate = false } = {}) => {
    validateObjectId(payload.module_id, 'module_id', errors, { required: !isUpdate });
    validateString(payload.task_name, 'task_name', errors, { required: !isUpdate, maxLength: 160 });
    validateString(payload.problem_statement, 'problem_statement', errors, { required: !isUpdate, maxLength: 20000 });
    validateString(payload.description, 'description', errors, { maxLength: 5000 });
    validateString(payload.expected_output, 'expected_output', errors, { maxLength: 10000 });
    validateString(payload.sample_input, 'sample_input', errors, { maxLength: 10000 });
    validateString(payload.sample_output, 'sample_output', errors, { maxLength: 10000 });
    validateString(payload.constraints, 'constraints', errors, { maxLength: 10000 });
    validateString(payload.language, 'language', errors, { maxLength: 60 });
    validateEnum(payload.difficulty, 'difficulty', errors, TASK_DIFFICULTIES);
    validateNumber(payload.points, 'points', errors, { integer: true, min: 0 });
    validateNumber(payload.collab_percentage, 'collab_percentage', errors, { integer: true, min: 0, max: 100 });
    validateNumber(payload.time_limit, 'time_limit', errors, { integer: true, min: 1 });
    validateBoolean(payload.allow_collaboration, 'allow_collaboration', errors);
    validateBoolean(payload.has_deadline, 'has_deadline', errors);
    validateDateValue(payload.deadline_at, 'deadline_at', errors);

    if (parseBooleanLike(payload.has_deadline) === true && !hasValue(payload.deadline_at)) {
        addError(errors, 'deadline_at', 'deadline_at is required when has_deadline is true');
    }

    validateObjectArray(payload.test_cases, 'test_cases', errors, (item, fieldPrefix, nestedErrors) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
            addError(nestedErrors, fieldPrefix, `${fieldPrefix} must be an object`);
            return;
        }

        validateString(item.input, `${fieldPrefix}.input`, nestedErrors, { required: true, maxLength: 10000 });
        validateString(item.expected_output, `${fieldPrefix}.expected_output`, nestedErrors, { required: true, maxLength: 10000 });
        validateBoolean(item.is_sample, `${fieldPrefix}.is_sample`, nestedErrors);
        validateNumber(item.order_index, `${fieldPrefix}.order_index`, nestedErrors, { integer: true, min: 1 });
    });
};

const validateTaskCreateRequest = validateRequest((req, errors) => {
    validateTaskPayload(req.body, errors);
});

const validateTaskUpdateRequest = validateRequest((req, errors) => {
    validateObjectId(req.params.id, 'id', errors, { required: true });
    validateTaskPayload(req.body, errors, { isUpdate: true });
});

const validateTaskDeleteRequest = validateRequest((req, errors) => {
    validateObjectId(req.params.id, 'id', errors, { required: true });
});

const validateTaskImportRequest = validateRequest((req, errors) => {
    validateObjectId(req.body.module_id, 'module_id', errors, { required: true });
    validateFile(req.file, 'document', errors, {
        required: true,
        allowedExtensions: TASK_IMPORT_EXTENSIONS,
        allowedMimeTypes: TASK_IMPORT_MIME_TYPES,
    });
});

const validateDesktopResultRequest = validateRequest((req, errors) => {
    validateObjectId(req.params.id, 'id', errors, { required: true });
    validateEnum(req.body.status, 'status', errors, TASK_RESULT_STATUSES, { required: true });
    validateNumber(req.body.passed_test_cases, 'passed_test_cases', errors, { integer: true, min: 0 });
    validateNumber(req.body.total_test_cases, 'total_test_cases', errors, { integer: true, min: 0 });
    validateNumber(req.body.runtime_ms, 'runtime_ms', errors, { integer: true, min: 0 });
    validateString(req.body.language, 'language', errors, { maxLength: 60 });
    validateString(req.body.app_version, 'app_version', errors, { maxLength: 60 });
    validateString(req.body.execution_ref, 'execution_ref', errors, { maxLength: 160 });

    if (hasValue(req.body.raw_result) && (typeof req.body.raw_result !== 'object' || Array.isArray(req.body.raw_result))) {
        addError(errors, 'raw_result', 'raw_result must be an object');
    }
});

const validateTaskCompleteRequest = validateRequest((req, errors) => {
    validateObjectId(req.params.id, 'id', errors, { required: true });

    if (req.body.collaboratorIds === undefined) {
        return;
    }

    if (!Array.isArray(req.body.collaboratorIds)) {
        addError(errors, 'collaboratorIds', 'collaboratorIds must be an array');
        return;
    }

    req.body.collaboratorIds.forEach((value, index) => {
        validateObjectId(value, `collaboratorIds[${index}]`, errors, { required: true });
    });
});

const validateRewardCreateRequest = validateRequest((req, errors) => {
    validateObjectId(req.body.course_id, 'course_id', errors, { required: true });
    validateString(req.body.name, 'name', errors, { required: true, maxLength: 120 });
    validateString(req.body.description, 'description', errors, { required: true, maxLength: 1000 });
    validateNumber(req.body.cost, 'cost', errors, { required: true, integer: true, min: 1 });
    validateString(req.body.icon_name, 'icon_name', errors, { maxLength: 80 });
});

const validateRewardDeleteRequest = validateRequest((req, errors) => {
    validateObjectId(req.params.id, 'id', errors, { required: true });
});

const validateAnnouncementCreateRequest = validateRequest((req, errors) => {
    validateString(req.body.title, 'title', errors, { required: true, maxLength: 160 });
    validateString(req.body.message, 'message', errors, { required: true, maxLength: 5000 });
    validateEnum(req.body.audience_type, 'audience_type', errors, ANNOUNCEMENT_AUDIENCES);
    validateNumber(req.body.expires_in_minutes, 'expires_in_minutes', errors, { integer: true, min: 1, max: 10080 });

    const normalizedAudience = trimmedString(req.body.audience_type || 'COURSE').toUpperCase() || 'COURSE';
    const courseRequired = normalizedAudience !== 'GLOBAL';
    validateObjectId(req.body.course_id, 'course_id', errors, { required: courseRequired });
});

const validateAnnouncementDeleteRequest = validateRequest((req, errors) => {
    validateObjectId(req.params.id, 'id', errors, { required: true });
});

const validateDesktopAppUploadRequest = validateRequest((req, errors) => {
    validateFile(req.file, 'installer', errors, {
        required: true,
        allowedExtensions: INSTALLER_EXTENSIONS,
    });
    validateString(req.body.version, 'version', errors, { maxLength: 60 });
});

module.exports = {
    handleUploadMiddleware,
    validateRegisterRequest,
    validateLoginRequest,
    validateCourseCreateRequest,
    validateCourseUpdateRequest,
    validateCourseIdParam,
    validateCourseHandoutUploadRequest,
    validateModuleCreateRequest,
    validateModuleUpdateRequest,
    validateModuleFileDeleteRequest,
    validateTaskCreateRequest,
    validateTaskUpdateRequest,
    validateTaskDeleteRequest,
    validateTaskImportRequest,
    validateDesktopResultRequest,
    validateTaskCompleteRequest,
    validateRewardCreateRequest,
    validateRewardDeleteRequest,
    validateAnnouncementCreateRequest,
    validateAnnouncementDeleteRequest,
    validateDesktopAppUploadRequest,
};
