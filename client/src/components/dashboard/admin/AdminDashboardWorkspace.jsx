import React from 'react'
import { motion } from 'framer-motion'
import {
  HiBellAlert,
  HiBookOpen,
  HiFolderPlus,
  HiListBullet,
  HiPencilSquare,
  HiSparkles,
  HiStar,
  HiTrash,
  HiUsers,
} from 'react-icons/hi2'
import { FiDownload, FiTrash2, FiUpload } from 'react-icons/fi'
import API_BASE_URL from '../../../config'
import {
  PanelStatusSkeleton,
} from '../../ui/Skeleton'
import {
  ANNOUNCEMENT_TIMER_PRESETS,
  ANNOUNCEMENT_TIMER_UNITS,
} from '../../../utils/announcementTimerOptions'

function AdminDashboardWorkspace({
  activeTab,
  setActiveTab,
  t,
  common,
  translations,
  translate,
  pendingActions,
  desktopApp,
  announcements,
  testimonials,
  platformStatsLoading,
  platformStats,
  liveCourseStatValue,
  statsCards,
  globalAnnouncementCount,
  courseAnnouncementCount,
  latestAnnouncement,
  latestTestimonial,
  courses,
  courseForm,
  courseMessage,
  savingCourseId,
  handleEditCourse,
  handleStartCourseCreate,
  handleOpenCourseBuilder,
  handleCloseCourseBuilder,
  handleCourseFieldChange,
  handleSaveCourse,
  resetCourseForm,
  builderCourse,
  builderModules,
  builderTasks,
  builderSelectedModule,
  builderLoadingModules,
  builderLoadingTasks,
  openBuilderModuleForm,
  handleBuilderModuleSelect,
  handleBuilderDeleteModule,
  openBuilderTaskForm,
  handleBuilderDeleteTask,
  recentAnnouncements,
  announcementDateFormatter,
  showDesktopAppSkeleton,
  formatFileSize,
  formatDate,
  getUploadUrl,
  recentTestimonials,
  activityItems,
  announcementsLoading,
  showTestimonialStatus,
  privilegedUserForm,
  handlePrivilegedUserFieldChange,
  handleCreatePrivilegedUser,
  savingPrivilegedUser,
  resetPrivilegedUserForm,
  privilegedUserMessage,
  announcementForm,
  handleAnnouncementFieldChange,
  isCustomAnnouncementTimer,
  isAnnouncementTimerReady,
  savingAnnouncement,
  handleCreateAnnouncement,
  resetAnnouncementForm,
  announcementMessage,
  deletingAnnouncementId,
  handleDeleteAnnouncement,
  testimonialForm,
  handleTestimonialFieldChange,
  testimonialImageInputRef,
  handleTestimonialImageSelection,
  handleSaveTestimonial,
  resetTestimonialForm,
  testimonialMessage,
  testimonialsLoading,
  handleEditTestimonial,
  deletingTestimonialId,
  handleDeleteTestimonial,
  desktopAppLoading,
  desktopVersion,
  setDesktopVersion,
  installerInputRef,
  handleInstallerSelection,
  handleDesktopAppUpload,
  selectedInstaller,
  uploadingDesktopApp,
  desktopAppMessage,
  handleDesktopAppRemove,
  removingDesktopApp,
}) {
  const isEditingAnalyticsCourse = Boolean(courseForm?.is_analytics_course)
  const activeCourseSaveId = courseForm?.id || 'new'

  return (
    <div className="dashboard-workspace">
      {activeTab === 'overview' && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="workspace-panel">
          <div className="workspace-panel-header workspace-panel-header--stacked admin-overview-header">
            <div className="workspace-panel-header__copy">
              <span className="workspace-panel-header__eyebrow">{t.overview.eyebrow}</span>
              <h3>{t.header}</h3>
              <p className="workspace-panel-subtitle">{t.subtitle}</p>
            </div>

            <div className="dashboard-inline-metrics">
              <article className="dashboard-inline-metric">
                <span>{translate('dashboard.admin.topbar.pendingActions', { count: pendingActions })}</span>
                <strong>{pendingActions}</strong>
              </article>
              <article className="dashboard-inline-metric">
                <span>{t.desktopApp.versionLabel}</span>
                <strong>{desktopApp?.version || common.notAvailable}</strong>
              </article>
              <article className="dashboard-inline-metric">
                <span>{common.active}</span>
                <strong>{announcements.length + testimonials.length}</strong>
              </article>
            </div>
          </div>

          <div className="admin-overview-actions">
            <button type="button" className="btn btn-primary" onClick={() => setActiveTab('announcements')}>
              <HiBellAlert /> {t.overview.primaryAction}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setActiveTab('courses')}>
              <HiBookOpen /> {t.tabs.courses}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setActiveTab('desktop')}>
              <FiUpload /> {t.overview.secondaryAction}
            </button>
          </div>

          <div className="stats-grid admin-stats-grid">
            {statsCards.map((card) => (
              <motion.div key={card.id} className="stat-card" whileHover={{ y: -4 }}>
                <div className="stat-icon">{card.icon}</div>
                <div className="stat-info">
                  <h3>{card.label}</h3>
                  <p className="stat-number">{card.value}</p>
                </div>
              </motion.div>
            ))}
          </div>

          <div className="admin-overview-grid admin-overview-grid--compact">
            <section className="admin-overview-card">
              <div className="workspace-panel-header admin-card-header">
                <div>
                  <span className="admin-copy-badge">{t.desktopApp.title}</span>
                  <h3>{t.overview.releaseTitle}</h3>
                  <p>{t.overview.releaseDescription}</p>
                </div>
                <button type="button" className="btn btn-secondary" onClick={() => setActiveTab('desktop')}>
                  {t.tabs.desktop}
                </button>
              </div>

              {desktopAppLoading ? (
                <PanelStatusSkeleton visible={showDesktopAppSkeleton} />
              ) : desktopApp ? (
                <div className="admin-kpi-grid">
                  <article className="admin-kpi-card">
                    <span>{t.desktopApp.versionLabel}</span>
                    <strong>{desktopApp.version || common.notAvailable}</strong>
                  </article>
                  <article className="admin-kpi-card">
                    <span>{translate('landingDownload.downloadsLabel')}</span>
                    <strong>{desktopApp.download_count || 0}</strong>
                  </article>
                  <article className="admin-kpi-card">
                    <span>{common.files}</span>
                    <strong>{formatFileSize(desktopApp.file_size)}</strong>
                  </article>
                  <article className="admin-kpi-card">
                    <span>{translate('dashboard.admin.desktopApp.uploadedOn', { date: formatDate(desktopApp.updated_at) })}</span>
                    <strong>{desktopApp.filename}</strong>
                  </article>
                </div>
              ) : (
                <p className="empty-state">{t.desktopApp.noFile}</p>
              )}
            </section>

            <section className="admin-overview-card">
              <div className="workspace-panel-header admin-card-header">
                <div>
                  <span className="admin-copy-badge">{t.announcements.title}</span>
                  <h3>{t.overview.commsTitle}</h3>
                  <p>{t.overview.commsDescription}</p>
                </div>
                <button type="button" className="btn btn-secondary" onClick={() => setActiveTab('announcements')}>
                  {t.tabs.announcements}
                </button>
              </div>

              <div className="admin-kpi-grid">
                <article className="admin-kpi-card">
                  <span>{t.announcements.generalAudience}</span>
                  <strong>{globalAnnouncementCount}</strong>
                </article>
                <article className="admin-kpi-card">
                  <span>{t.announcements.courseAudience}</span>
                  <strong>{courseAnnouncementCount}</strong>
                </article>
                <article className="admin-kpi-card">
                  <span>{t.stats.liveCourses}</span>
                  <strong>{courses.length}</strong>
                </article>
                <article className="admin-kpi-card">
                  <span>{t.announcements.titleLabel}</span>
                  <strong>{latestAnnouncement?.title || common.notAvailable}</strong>
                </article>
              </div>
            </section>

            <section className="admin-overview-card">
              <div className="workspace-panel-header admin-card-header">
                <div>
                  <span className="admin-copy-badge">{t.overview.quickLinksTitle}</span>
                  <h3>{t.overview.quickLinksTitle}</h3>
                  <p>{t.overview.quickLinksDescription}</p>
                </div>
              </div>

              <div className="admin-quick-links">
                <button type="button" className="admin-quick-link" onClick={() => setActiveTab('courses')}>
                  <HiBookOpen />
                  <div>
                    <strong>{t.tabs.courses}</strong>
                    <span>{t.courseManagement.description}</span>
                  </div>
                </button>
                <button type="button" className="admin-quick-link" onClick={() => setActiveTab('announcements')}>
                  <HiBellAlert />
                  <div>
                    <strong>{t.tabs.announcements}</strong>
                    <span>{t.announcements.description}</span>
                  </div>
                </button>
                <button type="button" className="admin-quick-link" onClick={() => setActiveTab('users')}>
                  <HiUsers />
                  <div>
                    <strong>{t.tabs.users}</strong>
                    <span>{t.userManagement.description}</span>
                  </div>
                </button>
                <button type="button" className="admin-quick-link" onClick={() => setActiveTab('testimonials')}>
                  <HiSparkles />
                  <div>
                    <strong>{t.tabs.testimonials}</strong>
                    <span>{t.testimonials.description}</span>
                  </div>
                </button>
              </div>
            </section>
          </div>
        </motion.div>
      )}

      {activeTab === 'users' && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="workspace-panel">
          <div className="workspace-panel-header workspace-panel-header--stacked">
            <div className="workspace-panel-header__copy">
              <span className="workspace-panel-header__eyebrow">{t.tabs.users}</span>
              <h3>{t.userManagement.title}</h3>
              <p className="workspace-panel-subtitle">{t.userManagement.description}</p>
            </div>

            <div className="dashboard-inline-metrics">
              <article className="dashboard-inline-metric">
                <span>{t.userManagement.publicSignupLabel}</span>
                <strong>{translations.auth.roles.student}</strong>
              </article>
              <article className="dashboard-inline-metric">
                <span>{t.userManagement.allowedRolesLabel}</span>
                <strong>{t.userManagement.allowedRolesValue}</strong>
              </article>
            </div>
          </div>

          <div className="admin-staff-layout">
            <section className="admin-form-card admin-staff-form">
              <div className="admin-course-panel-heading">
                <span>{t.userManagement.primaryAction}</span>
                <strong>{t.userManagement.allowedRolesValue}</strong>
              </div>

              <div className="admin-staff-form__grid">
              <label className="admin-installer-panel__label">
                {t.userManagement.nameLabel}
                <input
                  type="text"
                  className="admin-installer-panel__input"
                  placeholder={t.userManagement.namePlaceholder}
                  value={privilegedUserForm.name}
                  onChange={(event) => handlePrivilegedUserFieldChange('name', event.target.value)}
                />
              </label>

              <label className="admin-installer-panel__label">
                {t.userManagement.emailLabel}
                <input
                  type="email"
                  className="admin-installer-panel__input"
                  placeholder={t.userManagement.emailPlaceholder}
                  value={privilegedUserForm.email}
                  onChange={(event) => handlePrivilegedUserFieldChange('email', event.target.value)}
                />
              </label>

              <label className="admin-installer-panel__label">
                {t.userManagement.passwordLabel}
                <input
                  type="password"
                  className="admin-installer-panel__input"
                  placeholder={t.userManagement.passwordPlaceholder}
                  value={privilegedUserForm.password}
                  onChange={(event) => handlePrivilegedUserFieldChange('password', event.target.value)}
                />
              </label>

              <label className="admin-installer-panel__label">
                {t.userManagement.roleLabel}
                <select
                  className="admin-installer-panel__input"
                  value={privilegedUserForm.role}
                  onChange={(event) => handlePrivilegedUserFieldChange('role', event.target.value)}
                >
                  <option value="INSTRUCTOR">{translations.auth.roles.teacher}</option>
                  <option value="ADMIN">{translations.auth.roles.admin}</option>
                </select>
              </label>

              <label className="admin-installer-panel__label">
                {t.userManagement.institutionLabel}
                <input
                  type="text"
                  className="admin-installer-panel__input"
                  placeholder={t.userManagement.institutionPlaceholder}
                  value={privilegedUserForm.institution}
                  onChange={(event) => handlePrivilegedUserFieldChange('institution', event.target.value)}
                />
              </label>
              </div>

              <div className="admin-installer-panel__actions">
                <button type="button" className="btn btn-primary" onClick={handleCreatePrivilegedUser}>
                  {savingPrivilegedUser ? t.userManagement.creating : t.userManagement.createAction}
                </button>
                <button type="button" className="btn btn-secondary" onClick={resetPrivilegedUserForm}>
                  {t.userManagement.clear}
                </button>
              </div>

              {privilegedUserMessage ? (
                <p className="admin-installer-panel__status admin-installer-panel__status--message">{privilegedUserMessage}</p>
              ) : null}
            </section>

            <section className="admin-staff-policy">
              <div className="admin-course-panel-heading">
                <span>{t.userManagement.securityBadge}</span>
                <strong>{t.userManagement.securityTitle}</strong>
              </div>
              <p>{t.userManagement.securityDescription}</p>

              <div className="admin-staff-policy__list">
                <article>
                  <span>{t.userManagement.publicSignupLabel}</span>
                  <strong>{translations.auth.roles.student}</strong>
                  <p>{t.userManagement.publicSignupDescription}</p>
                </article>
                <article>
                  <span>{t.userManagement.allowedRolesLabel}</span>
                  <strong>{t.userManagement.allowedRolesValue}</strong>
                  <p>{t.userManagement.allowedRolesDescription}</p>
                </article>
              </div>
            </section>
          </div>
        </motion.div>
      )}

      {activeTab === 'courses' && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className={`workspace-panel admin-courses-workspace ${builderCourse ? 'admin-courses-workspace--builder' : ''}`}
        >
          <div className="workspace-panel-header workspace-panel-header--stacked admin-courses-header">
            <div className="workspace-panel-header__copy">
              <span className="workspace-panel-header__eyebrow">
                {builderCourse ? t.courseManagement.builderEyebrow : t.tabs.courses}
              </span>
              <h3>{builderCourse ? builderCourse.course_name : t.courseManagement.title}</h3>
              <p className="workspace-panel-subtitle">
                {builderCourse
                  ? `${builderCourse.course_code} • ${builderCourse.subject || common.general}`
                  : t.courseManagement.description}
              </p>
            </div>

            {builderCourse ? (
              <div className="admin-course-header-actions">
                <button type="button" className="btn btn-primary" onClick={() => openBuilderModuleForm()}>
                  <HiFolderPlus /> {t.courseManagement.addModule}
                </button>
                <button type="button" className="btn btn-secondary" onClick={handleCloseCourseBuilder}>
                  {common.close}
                </button>
              </div>
            ) : (
              <>
                <div className="dashboard-inline-metrics">
                  <article className="dashboard-inline-metric">
                    <span>{t.stats.liveCourses}</span>
                    <strong>{courses.length}</strong>
                  </article>
                  <article className="dashboard-inline-metric">
                    <span>{common.active}</span>
                    <strong>{courses.filter((course) => course.is_active !== false).length}</strong>
                  </article>
                </div>

                <button type="button" className="btn btn-secondary" onClick={handleStartCourseCreate}>
                  <HiFolderPlus /> {t.courseManagement.newCourse}
                </button>
              </>
            )}
          </div>

          {!builderCourse ? (
            <div className="admin-course-shell">
              <section className="admin-course-editor-panel">
                <div className="admin-course-panel-heading">
                  <div>
                    <span>{courseForm.id ? t.courseManagement.edit : t.courseManagement.newCourse}</span>
                    <strong>{courseForm.course_name || t.courseManagement.formIntro}</strong>
                  </div>
                </div>

                <div className="admin-course-form-grid">
                  <label className="admin-installer-panel__label">
                    {t.courseManagement.codeLabel}
                    <input
                      type="text"
                      className="admin-installer-panel__input"
                      placeholder={t.courseManagement.codePlaceholder}
                      value={courseForm.course_code}
                      onChange={(event) => handleCourseFieldChange('course_code', event.target.value)}
                    />
                  </label>

                  <label className="admin-installer-panel__label">
                    {t.courseManagement.nameLabel}
                    <input
                      type="text"
                      className="admin-installer-panel__input"
                      placeholder={t.courseManagement.namePlaceholder}
                      value={courseForm.course_name}
                      onChange={(event) => handleCourseFieldChange('course_name', event.target.value)}
                    />
                  </label>

                  <label className="admin-installer-panel__label">
                    {t.courseManagement.subjectLabel}
                    <input
                      type="text"
                      className="admin-installer-panel__input"
                      placeholder={t.courseManagement.subjectPlaceholder}
                      value={courseForm.subject}
                      onChange={(event) => handleCourseFieldChange('subject', event.target.value)}
                    />
                  </label>

                  {isEditingAnalyticsCourse ? (
                    <label className="admin-installer-panel__label">
                      {t.courseManagement.instructorLabel}
                      <input
                        type="text"
                        className="admin-installer-panel__input"
                        placeholder={t.courseManagement.instructorPlaceholder}
                        value={courseForm.instructor_name}
                        onChange={(event) => handleCourseFieldChange('instructor_name', event.target.value)}
                      />
                    </label>
                  ) : (
                    <>
                      <label className="admin-installer-panel__label">
                        {t.courseManagement.testQuestionsLabel}
                        <input
                          type="number"
                          min="0"
                          className="admin-installer-panel__input"
                          value={courseForm.course_test_questions}
                          onChange={(event) => handleCourseFieldChange('course_test_questions', event.target.value)}
                        />
                      </label>

                      <label className="admin-installer-panel__label">
                        {t.courseManagement.pointsLabel}
                        <input
                          type="number"
                          min="0"
                          className="admin-installer-panel__input"
                          value={courseForm.points}
                          onChange={(event) => handleCourseFieldChange('points', event.target.value)}
                        />
                      </label>
                    </>
                  )}
                </div>

                <label className="admin-installer-panel__label">
                  {t.courseManagement.descriptionLabel}
                  <textarea
                    className="admin-testimonial-form__textarea admin-course-form__textarea"
                    placeholder={t.courseManagement.descriptionPlaceholder}
                    value={courseForm.description}
                    onChange={(event) => handleCourseFieldChange('description', event.target.value)}
                    disabled={isEditingAnalyticsCourse}
                  />
                </label>

                {!isEditingAnalyticsCourse ? (
                  <label className="admin-course-form__toggle">
                    <input
                      type="checkbox"
                      checked={courseForm.is_active}
                      onChange={(event) => handleCourseFieldChange('is_active', event.target.checked)}
                    />
                    <span>{t.courseManagement.activeLabel}</span>
                  </label>
                ) : null}

                <div className="admin-installer-panel__actions">
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleSaveCourse}
                    disabled={savingCourseId === activeCourseSaveId || !courseForm.course_code.trim() || !courseForm.course_name.trim() || !courseForm.subject.trim()}
                  >
                    {courseForm.id ? <HiPencilSquare /> : <HiFolderPlus />}
                    {savingCourseId === activeCourseSaveId
                      ? t.courseManagement.saving
                      : courseForm.id ? t.courseManagement.save : t.courseManagement.create}
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={resetCourseForm}>
                    {courseForm.id ? t.courseManagement.cancelEdit : t.courseManagement.clear}
                  </button>
                </div>

                {courseMessage ? (
                  <p className="admin-installer-panel__status admin-installer-panel__status--message">{courseMessage}</p>
                ) : null}
              </section>

              <section className="admin-course-catalog">
                {courses.length ? courses.map((course) => {
                  const instructorName = typeof course.instructor === 'object'
                    ? course.instructor?.name
                    : null
                  const isEditing = courseForm.id === course._id

                  return (
                    <article key={course._id} className={`admin-course-row ${isEditing ? 'admin-course-row--active' : ''}`}>
                      <div className="admin-course-row__icon">
                        <HiBookOpen />
                      </div>
                      <div className="admin-course-row__content">
                        <div className="admin-course-row__title">
                          <strong>{course.course_name}</strong>
                          <span>{course.course_code || common.notAvailable}</span>
                        </div>
                        <p>{course.description || t.courseManagement.noDescription}</p>
                        <div className="admin-course-row__meta">
                          <span>{course.subject || common.notAvailable}</span>
                          <span>{instructorName || t.courseManagement.unknownInstructor}</span>
                          <span>{course.is_active === false ? t.courseManagement.inactiveLabel : common.active}</span>
                          {course.is_analytics_course ? <span>{t.courseManagement.analyticsSource}</span> : null}
                        </div>
                      </div>
                      <div className="admin-course-row__actions">
                        <button
                          type="button"
                          className="btn btn-secondary admin-course-row__action"
                          onClick={() => handleEditCourse(course)}
                        >
                          <HiPencilSquare /> {t.courseManagement.edit}
                        </button>
                        {!course.is_analytics_course ? (
                          <button
                            type="button"
                            className="btn btn-secondary admin-course-row__action"
                            onClick={() => handleOpenCourseBuilder(course)}
                          >
                            <HiBookOpen /> {t.courseManagement.openBuilder}
                          </button>
                        ) : null}
                      </div>
                    </article>
                  )
                }) : (
                  <p className="empty-state">{t.courseManagement.empty}</p>
                )}
              </section>
            </div>
          ) : (
            <section className="admin-course-builder admin-course-builder--focused">
              <div className="admin-course-builder__layout">
                <div className="admin-course-builder__modules">
                  {builderLoadingModules ? (
                    <p className="empty-state">{common.loading}</p>
                  ) : builderModules.length ? builderModules.map((module, index) => {
                    const isSelected = builderSelectedModule?._id === module._id
                    const taskCount = module.task_count ?? module.total_tasks ?? 0

                    return (
                      <article key={module._id} className={`admin-builder-module ${isSelected ? 'admin-builder-module--active' : ''}`}>
                        <div className="admin-builder-module__main" onClick={() => handleBuilderModuleSelect(module)}>
                          <span className="admin-builder-module__order">{index + 1}</span>
                          <div>
                            <strong>{module.module_name}</strong>
                            <p>{module.description || t.courseManagement.noDescription}</p>
                            <span>{translate('dashboard.teacher.modules.tasksCount', { count: taskCount })}</span>
                          </div>
                        </div>
                        <div className="admin-course-row__actions">
                          <button type="button" className="btn-icon" onClick={() => openBuilderModuleForm(module)} title={t.courseManagement.editModule}>
                            <HiPencilSquare />
                          </button>
                          <button type="button" className="btn-icon delete-btn" onClick={() => handleBuilderDeleteModule(module._id)} title={t.courseManagement.deleteModule}>
                            <HiTrash />
                          </button>
                        </div>
                      </article>
                    )
                  }) : (
                    <p className="empty-state">{t.courseManagement.noModules}</p>
                  )}
                </div>

                <div className="admin-course-builder__tasks">
                  <div className="admin-course-builder__task-header">
                    <div>
                      <h4>{builderSelectedModule ? builderSelectedModule.module_name : t.courseManagement.selectModuleTitle}</h4>
                      <p>{builderSelectedModule ? t.courseManagement.tasksDescription : t.courseManagement.selectModuleHint}</p>
                    </div>
                    {builderSelectedModule ? (
                      <button type="button" className="btn btn-primary" onClick={() => openBuilderTaskForm()}>
                        <HiFolderPlus /> {t.courseManagement.addTask}
                      </button>
                    ) : null}
                  </div>

                  {builderLoadingTasks ? (
                    <p className="empty-state">{common.loading}</p>
                  ) : builderSelectedModule ? (
                    builderTasks.length ? builderTasks.map((task) => (
                      <article key={task._id} className="admin-builder-task">
                        <div className="admin-builder-task__icon">
                          <HiListBullet />
                        </div>
                        <div className="admin-builder-task__content">
                          <strong>{task.task_name}</strong>
                          <p>{task.problem_statement || t.courseManagement.noDescription}</p>
                          <div className="admin-course-row__meta">
                            <span>{task.language || common.general}</span>
                            <span>{task.difficulty || common.notAvailable}</span>
                            <span>{translate('dashboard.student.pointShop.cost', { points: task.points || 0 })}</span>
                          </div>
                        </div>
                        <div className="admin-course-row__actions">
                          <button type="button" className="btn-icon" onClick={() => openBuilderTaskForm(task)} title={t.courseManagement.editTask}>
                            <HiPencilSquare />
                          </button>
                          <button type="button" className="btn-icon delete-btn" onClick={() => handleBuilderDeleteTask(task._id)} title={t.courseManagement.deleteTask}>
                            <HiTrash />
                          </button>
                        </div>
                      </article>
                    )) : (
                      <p className="empty-state">{t.courseManagement.noTasks}</p>
                    )
                  ) : (
                    <p className="empty-state">{t.courseManagement.selectModuleHint}</p>
                  )}
                </div>
              </div>
            </section>
          )}
        </motion.div>
      )}

      {activeTab === 'announcements' && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="workspace-panel">
          <div className="workspace-panel-header workspace-panel-header--stacked">
            <div className="workspace-panel-header__copy">
              <span className="workspace-panel-header__eyebrow">{t.tabs.announcements}</span>
              <h3>{t.announcements.title}</h3>
              <p className="workspace-panel-subtitle">{t.announcements.description}</p>
            </div>

            <div className="dashboard-inline-metrics">
              <article className="dashboard-inline-metric">
                <span>{common.active}</span>
                <strong>{announcements.length}</strong>
              </article>
              <article className="dashboard-inline-metric">
                <span>{t.announcements.generalAudience}</span>
                <strong>{globalAnnouncementCount}</strong>
              </article>
              <article className="dashboard-inline-metric">
                <span>{t.announcements.courseAudience}</span>
                <strong>{courseAnnouncementCount}</strong>
              </article>
            </div>
          </div>

          <div className="dashboard-announcements-layout">
            <section className="dashboard-announcement-form-card">
              <p className="dashboard-announcement-form-card__intro">{t.announcements.description}</p>
              <label className="admin-installer-panel__label">
                {t.announcements.audienceLabel}
                <select
                  className="admin-installer-panel__input"
                  value={announcementForm.audienceType}
                  onChange={(event) => handleAnnouncementFieldChange('audienceType', event.target.value)}
                >
                  <option value="GLOBAL">{t.announcements.audienceGlobal}</option>
                  <option value="COURSE">{t.announcements.audienceCourse}</option>
                </select>
              </label>

              {announcementForm.audienceType === 'COURSE' ? (
                <label className="admin-installer-panel__label">
                  {t.announcements.courseLabel}
                  <select
                    className="admin-installer-panel__input"
                    value={announcementForm.courseId}
                    onChange={(event) => handleAnnouncementFieldChange('courseId', event.target.value)}
                  >
                    <option value="">{t.announcements.selectCourse}</option>
                    {courses.filter((course) => !course.is_analytics_course).map((course) => (
                      <option key={course._id} value={course._id}>
                        {course.course_name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              <label className="admin-installer-panel__label">
                {t.announcements.titleLabel}
                <input
                  type="text"
                  className="admin-installer-panel__input"
                  placeholder={t.announcements.titlePlaceholder}
                  value={announcementForm.title}
                  onChange={(event) => handleAnnouncementFieldChange('title', event.target.value)}
                />
              </label>

              <label className="admin-installer-panel__label">
                {t.announcements.messageLabel}
                <textarea
                  className="admin-testimonial-form__textarea"
                  placeholder={t.announcements.messagePlaceholder}
                  value={announcementForm.message}
                  onChange={(event) => handleAnnouncementFieldChange('message', event.target.value)}
                />
              </label>

              <label className="admin-installer-panel__label">
                {t.announcements.timerLabel}
                <select
                  className="admin-installer-panel__input"
                  value={announcementForm.timerPreset}
                  onChange={(event) => handleAnnouncementFieldChange('timerPreset', event.target.value)}
                >
                  {ANNOUNCEMENT_TIMER_PRESETS.map((preset) => (
                    <option key={preset.value} value={preset.value}>
                      {t.announcements[preset.labelKey]}
                    </option>
                  ))}
                </select>
                <span className="dashboard-announcement-item__detail">{t.announcements.timerHint}</span>
              </label>

              {isCustomAnnouncementTimer ? (
                <>
                  <div className="dashboard-announcement-timer-row">
                    <label className="admin-installer-panel__label">
                      {t.announcements.timerCustomValueLabel}
                      <input
                        type="number"
                        min="1"
                        className="admin-installer-panel__input"
                        placeholder={t.announcements.timerCustomPlaceholder}
                        value={announcementForm.customTimerValue}
                        onChange={(event) => handleAnnouncementFieldChange('customTimerValue', event.target.value)}
                      />
                    </label>

                    <label className="admin-installer-panel__label">
                      {t.announcements.timerCustomUnitLabel}
                      <select
                        className="admin-installer-panel__input"
                        value={announcementForm.customTimerUnit}
                        onChange={(event) => handleAnnouncementFieldChange('customTimerUnit', event.target.value)}
                      >
                        {ANNOUNCEMENT_TIMER_UNITS.map((unit) => (
                          <option key={unit.value} value={unit.value}>
                            {t.announcements[unit.labelKey]}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <span className="dashboard-announcement-item__detail">
                    {isAnnouncementTimerReady ? t.announcements.timerCustomHint : t.announcements.timerCustomInvalid}
                  </span>
                </>
              ) : null}

              <div className="admin-installer-panel__actions">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleCreateAnnouncement}
                  disabled={savingAnnouncement || !announcementForm.title.trim() || !announcementForm.message.trim() || (announcementForm.audienceType === 'COURSE' && !announcementForm.courseId) || !isAnnouncementTimerReady}
                >
                  {savingAnnouncement ? t.announcements.creating : t.announcements.create}
                </button>
                <button type="button" className="btn btn-secondary" onClick={resetAnnouncementForm}>
                  {t.announcements.clear}
                </button>
              </div>

              {announcementMessage ? (
                <p className="admin-installer-panel__status admin-installer-panel__status--message">{announcementMessage}</p>
              ) : null}
            </section>

            <div className="dashboard-announcements-feed">
              {announcementsLoading ? (
                <p className="empty-state">{common.loading}</p>
              ) : announcements.length ? announcements.map((announcement) => (
                <article key={announcement._id} className="dashboard-announcement-item">
                  <div className="dashboard-announcement-item__meta">
                    <div>
                      <h4>{announcement.title}</h4>
                      <p>
                        {announcement.audience_type === 'GLOBAL'
                          ? t.announcements.generalAudience
                          : announcement.course_id?.course_name || t.announcements.courseAudience}
                        {' • '}
                        {announcement.created_by?.name || translations.auth.roles.admin}
                        {' • '}
                        {formatDate(announcement.createdAt, announcementDateFormatter)}
                      </p>
                      {announcement.expires_at ? (
                        <p className="dashboard-announcement-item__detail">
                          {t.announcements.expiresOn.replace('{date}', formatDate(announcement.expires_at, announcementDateFormatter))}
                        </p>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      className="btn btn-secondary admin-installer-panel__remove"
                      disabled={deletingAnnouncementId === announcement._id}
                      onClick={() => handleDeleteAnnouncement(announcement._id)}
                    >
                      {deletingAnnouncementId === announcement._id ? t.announcements.deleting : t.announcements.delete}
                    </button>
                  </div>
                  <p className="dashboard-announcement-item__body">{announcement.message}</p>
                </article>
              )) : (
                <p className="empty-state">{t.announcements.empty}</p>
              )}
            </div>
          </div>
        </motion.div>
      )}

      {activeTab === 'testimonials' && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="workspace-panel">
          <div className="workspace-panel-header workspace-panel-header--stacked">
            <div className="workspace-panel-header__copy">
              <span className="workspace-panel-header__eyebrow">{t.tabs.testimonials}</span>
              <h3>{t.testimonials.title}</h3>
              <p className="workspace-panel-subtitle">{t.testimonials.description}</p>
            </div>

            <div className="dashboard-inline-metrics">
              <article className="dashboard-inline-metric">
                <span>{common.active}</span>
                <strong>{testimonials.length}</strong>
              </article>
              <article className="dashboard-inline-metric">
                <span>{testimonialForm.id ? common.update : common.create}</span>
                <strong>{testimonialForm.id ? t.testimonials.edit : t.testimonials.add}</strong>
              </article>
            </div>
          </div>

          <div className="admin-management-layout">
            <section className="admin-form-card">
              <p className="admin-form-card__intro">{t.testimonials.description}</p>
              <label className="admin-installer-panel__label">
                {t.testimonials.nameLabel}
                <input
                  type="text"
                  className="admin-installer-panel__input"
                  placeholder={t.testimonials.namePlaceholder}
                  value={testimonialForm.name}
                  onChange={(event) => handleTestimonialFieldChange('name', event.target.value)}
                />
              </label>

              <label className="admin-installer-panel__label">
                {t.testimonials.roleLabel}
                <input
                  type="text"
                  className="admin-installer-panel__input"
                  placeholder={t.testimonials.rolePlaceholder}
                  value={testimonialForm.role}
                  onChange={(event) => handleTestimonialFieldChange('role', event.target.value)}
                />
              </label>

              <label className="admin-installer-panel__label">
                {t.testimonials.quoteLabel}
                <textarea
                  className="admin-testimonial-form__textarea"
                  placeholder={t.testimonials.quotePlaceholder}
                  value={testimonialForm.quote}
                  onChange={(event) => handleTestimonialFieldChange('quote', event.target.value)}
                />
              </label>

              <input
                ref={testimonialImageInputRef}
                type="file"
                accept="image/*"
                className="admin-installer-panel__file-input"
                onChange={handleTestimonialImageSelection}
              />

              <div className="admin-installer-panel__actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => testimonialImageInputRef.current?.click()}
                >
                  <FiUpload /> {testimonialForm.imagePath ? t.testimonials.replaceImage : t.testimonials.chooseImage}
                </button>
                <button type="button" className="btn btn-primary" onClick={handleSaveTestimonial}>
                  {testimonialForm.id ? t.testimonials.update : t.testimonials.add}
                </button>
                {testimonialForm.id ? (
                  <button type="button" className="btn btn-secondary" onClick={resetTestimonialForm}>
                    {t.testimonials.cancelEdit}
                  </button>
                ) : null}
              </div>

              <p className="admin-installer-panel__hint">{t.testimonials.imageHint}</p>
              {testimonialForm.imageFile ? (
                <p className="admin-installer-panel__status">
                  {translate('dashboard.admin.testimonials.selectedImage', { name: testimonialForm.imageFile.name })}
                </p>
              ) : null}
              {testimonialMessage ? (
                <p className="admin-installer-panel__status admin-installer-panel__status--message">{testimonialMessage}</p>
              ) : null}
            </section>

            <div className="admin-list-card admin-testimonials-list">
              {testimonialsLoading ? (
                <PanelStatusSkeleton visible={showTestimonialStatus} />
              ) : testimonials.length ? testimonials.map((testimonial) => (
                <article key={testimonial._id} className="admin-testimonial-item">
                  <div className="admin-testimonial-item__header">
                    {testimonial.image_path ? (
                      <img
                        className="admin-testimonial-item__avatar"
                        src={getUploadUrl(testimonial.image_path)}
                        alt={testimonial.name}
                      />
                    ) : (
                      <div className="admin-testimonial-item__avatar admin-testimonial-item__avatar--placeholder">
                        {testimonial.name?.charAt(0)?.toUpperCase() || 'I'}
                      </div>
                    )}
                    <div className="admin-testimonial-item__meta">
                      <strong>{testimonial.name}</strong>
                      <span>{testimonial.role}</span>
                    </div>
                  </div>
                  <p className="admin-testimonial-item__quote">{testimonial.quote}</p>
                  <div className="admin-testimonial-item__actions">
                    <button type="button" className="btn btn-secondary" onClick={() => handleEditTestimonial(testimonial)}>
                      {t.testimonials.edit}
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary admin-installer-panel__remove"
                      disabled={deletingTestimonialId === testimonial._id}
                      onClick={() => handleDeleteTestimonial(testimonial._id)}
                    >
                      {deletingTestimonialId === testimonial._id ? common.deleting : t.testimonials.delete}
                    </button>
                  </div>
                </article>
              )) : (
                <p className="empty-state">{t.testimonials.noTestimonials}</p>
              )}
            </div>
          </div>
        </motion.div>
      )}

      {activeTab === 'desktop' && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="workspace-panel">
          <div className="workspace-panel-header workspace-panel-header--stacked">
            <div className="workspace-panel-header__copy">
              <span className="workspace-panel-header__eyebrow">{t.tabs.desktop}</span>
              <h3>{t.desktopApp.title}</h3>
              <p className="workspace-panel-subtitle">{t.desktopApp.description}</p>
            </div>

            <div className="dashboard-inline-metrics">
              <article className="dashboard-inline-metric">
                <span>{t.desktopApp.versionLabel}</span>
                <strong>{desktopApp?.version || common.notAvailable}</strong>
              </article>
              <article className="dashboard-inline-metric">
                <span>{translate('landingDownload.downloadsLabel')}</span>
                <strong>{desktopApp?.download_count || 0}</strong>
              </article>
              <article className="dashboard-inline-metric">
                <span>{common.files}</span>
                <strong>{desktopApp ? formatFileSize(desktopApp.file_size) : common.notAvailable}</strong>
              </article>
            </div>
          </div>

          <div className="admin-management-layout admin-management-layout--desktop">
            <section className="admin-overview-card">
              <div className="workspace-panel-header admin-card-header">
                <div>
                  <span className="admin-copy-badge">{t.overview.releaseTitle}</span>
                  <h3>{t.desktopApp.title}</h3>
                  <p>{t.overview.releaseDescription}</p>
                </div>
              </div>

              {desktopAppLoading ? (
                <PanelStatusSkeleton visible={showDesktopAppSkeleton} />
              ) : desktopApp ? (
                <div className="admin-desktop-metrics">
                  <article className="admin-desktop-metric">
                    <span>{t.desktopApp.versionLabel}</span>
                    <strong>{desktopApp.version || common.notAvailable}</strong>
                  </article>
                  <article className="admin-desktop-metric">
                    <span>{common.files}</span>
                    <strong>{desktopApp.filename}</strong>
                  </article>
                  <article className="admin-desktop-metric">
                    <span>{translate('landingDownload.downloadsLabel')}</span>
                    <strong>{desktopApp.download_count || 0}</strong>
                  </article>
                  <article className="admin-desktop-metric">
                    <span>{translate('dashboard.admin.desktopApp.uploadedOn', { date: formatDate(desktopApp.updated_at) })}</span>
                    <strong>{formatFileSize(desktopApp.file_size)}</strong>
                  </article>
                </div>
              ) : (
                <p className="empty-state">{t.desktopApp.noFile}</p>
              )}

              {desktopApp ? (
                <div className="admin-installer-panel__actions">
                  <a href={`${API_BASE_URL}/api/desktop-app/download`} className="btn btn-secondary">
                    <FiDownload /> {t.desktopApp.download}
                  </a>
                  <button
                    type="button"
                    className="btn btn-secondary admin-installer-panel__remove"
                    onClick={handleDesktopAppRemove}
                    disabled={removingDesktopApp}
                  >
                    <FiTrash2 /> {removingDesktopApp ? t.desktopApp.removing : t.desktopApp.remove}
                  </button>
                </div>
              ) : null}
            </section>

            <section className="admin-form-card admin-installer-panel admin-installer-panel--wide">
              <p className="admin-form-card__intro">{t.overview.releaseDescription}</p>
              <div className="admin-installer-panel__fields">
                <label className="admin-installer-panel__label">
                  {t.desktopApp.versionLabel}
                  <input
                    type="text"
                    className="admin-installer-panel__input"
                    placeholder={t.desktopApp.versionPlaceholder}
                    value={desktopVersion}
                    onChange={(event) => setDesktopVersion(event.target.value)}
                  />
                </label>

                <input
                  ref={installerInputRef}
                  type="file"
                  accept=".exe,.msi"
                  className="admin-installer-panel__file-input"
                  onChange={handleInstallerSelection}
                />

                <div className="admin-installer-panel__actions">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => installerInputRef.current?.click()}
                  >
                    <FiUpload /> {desktopApp ? t.desktopApp.replace : t.desktopApp.chooseFile}
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleDesktopAppUpload}
                    disabled={!selectedInstaller || uploadingDesktopApp}
                  >
                    <FiUpload /> {uploadingDesktopApp ? t.desktopApp.uploading : t.desktopApp.upload}
                  </button>
                </div>

                <p className="admin-installer-panel__hint">{t.desktopApp.onlyFormats}</p>
                {selectedInstaller ? (
                  <p className="admin-installer-panel__status">
                    {translate('dashboard.admin.desktopApp.selectedFile', { name: selectedInstaller.name })}
                  </p>
                ) : null}
                {desktopAppMessage ? (
                  <p className="admin-installer-panel__status admin-installer-panel__status--message">{desktopAppMessage}</p>
                ) : null}
              </div>
            </section>
          </div>
        </motion.div>
      )}
    </div>
  )
}

export default AdminDashboardWorkspace
