import React from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import {
  HiArrowDownTray,
  HiBellAlert,
  HiBookOpen,
  HiChartBar,
  HiSparkles,
  HiStar,
  HiUsers
} from 'react-icons/hi2'
import { FiMoon, FiSun } from 'react-icons/fi'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { useI18n } from '../context/I18nContext'
import API_BASE_URL from '../config'
import {
  PanelStatusSkeleton,
  useDelayedLoading
} from '../components/ui/Skeleton'
import AdminDashboardWorkspace from '../components/dashboard/admin/AdminDashboardWorkspace'
import CreateModuleForm from '../components/CreateModuleForm'
import CreateTaskForm from '../components/CreateTaskForm'
import { applyAnnouncementEvent, normalizeAnnouncementList, subscribeToAnnouncementStream } from '../utils/announcementRealtime'
import {
  ANNOUNCEMENT_TIMER_PRESETS,
  ANNOUNCEMENT_TIMER_UNITS,
  getAnnouncementExpiryMinutes,
  getDefaultAnnouncementTimerForm,
  isAnnouncementTimerValid,
} from '../utils/announcementTimerOptions'
import './Dashboard.css'

const getInitials = (name = '') => name
  .split(' ')
  .filter(Boolean)
  .slice(0, 2)
  .map((part) => part[0]?.toUpperCase() || '')
  .join('') || 'AD'

const ADMIN_DASHBOARD_STATE_KEY = 'admin_dashboard_state'
const DEFAULT_COURSE_FORM = {
  id: null,
  course_code: '',
  course_name: '',
  subject: '',
  description: '',
  instructor_name: '',
  course_test_questions: '5',
  points: '1000',
  is_active: true,
  is_analytics_course: false,
}

function AdminDashboard() {
  const { theme, toggleTheme, isDark } = useTheme()
  const { translations, language, changeLanguage, t: translate } = useI18n()
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const common = translations.common
  const t = translations.dashboard.admin
  const installerInputRef = React.useRef(null)
  const testimonialImageInputRef = React.useRef(null)

  const [activeTab, setActiveTab] = React.useState(() => {
    try {
      const saved = sessionStorage.getItem(ADMIN_DASHBOARD_STATE_KEY)
      if (!saved) return 'overview'
      const parsed = JSON.parse(saved)
      return parsed.activeTab || 'overview'
    } catch (_error) {
      return 'overview'
    }
  })
  const [platformStats, setPlatformStats] = React.useState({ totalUsers: 0, totalCourses: 0 })
  const [platformStatsLoading, setPlatformStatsLoading] = React.useState(true)
  const [desktopApp, setDesktopApp] = React.useState(null)
  const [desktopAppLoading, setDesktopAppLoading] = React.useState(true)
  const [desktopVersion, setDesktopVersion] = React.useState('')
  const [selectedInstaller, setSelectedInstaller] = React.useState(null)
  const [desktopAppMessage, setDesktopAppMessage] = React.useState('')
  const [uploadingDesktopApp, setUploadingDesktopApp] = React.useState(false)
  const [removingDesktopApp, setRemovingDesktopApp] = React.useState(false)
  const [testimonials, setTestimonials] = React.useState([])
  const [testimonialsLoading, setTestimonialsLoading] = React.useState(true)
  const [testimonialForm, setTestimonialForm] = React.useState({
    id: null,
    name: '',
    role: '',
    quote: '',
    imageFile: null,
    imagePath: null,
  })
  const [testimonialMessage, setTestimonialMessage] = React.useState('')
  const [savingTestimonial, setSavingTestimonial] = React.useState(false)
  const [deletingTestimonialId, setDeletingTestimonialId] = React.useState(null)
  const [courses, setCourses] = React.useState([])
  const [courseForm, setCourseForm] = React.useState(DEFAULT_COURSE_FORM)
  const [courseMessage, setCourseMessage] = React.useState('')
  const [savingCourseId, setSavingCourseId] = React.useState(null)
  const [builderCourse, setBuilderCourse] = React.useState(null)
  const [builderModules, setBuilderModules] = React.useState([])
  const [builderTasks, setBuilderTasks] = React.useState([])
  const [builderSelectedModule, setBuilderSelectedModule] = React.useState(null)
  const [builderLoadingModules, setBuilderLoadingModules] = React.useState(false)
  const [builderLoadingTasks, setBuilderLoadingTasks] = React.useState(false)
  const [showBuilderModuleForm, setShowBuilderModuleForm] = React.useState(false)
  const [editingBuilderModule, setEditingBuilderModule] = React.useState(null)
  const [showBuilderTaskForm, setShowBuilderTaskForm] = React.useState(false)
  const [editingBuilderTask, setEditingBuilderTask] = React.useState(null)
  const [privilegedUserForm, setPrivilegedUserForm] = React.useState({
    name: '',
    email: '',
    password: '',
    role: 'INSTRUCTOR',
    institution: '',
  })
  const [privilegedUserMessage, setPrivilegedUserMessage] = React.useState('')
  const [savingPrivilegedUser, setSavingPrivilegedUser] = React.useState(false)
  const [announcements, setAnnouncements] = React.useState([])
  const [announcementsLoading, setAnnouncementsLoading] = React.useState(true)
  const [announcementMessage, setAnnouncementMessage] = React.useState('')
  const [savingAnnouncement, setSavingAnnouncement] = React.useState(false)
  const [deletingAnnouncementId, setDeletingAnnouncementId] = React.useState(null)
  const [announcementForm, setAnnouncementForm] = React.useState({
    audienceType: 'GLOBAL',
    courseId: '',
    title: '',
    message: '',
    ...getDefaultAnnouncementTimerForm(),
  })
  const showDesktopAppSkeleton = useDelayedLoading(desktopAppLoading)
  const showTestimonialStatus = useDelayedLoading(testimonialsLoading)
  const isCustomAnnouncementTimer = announcementForm.timerPreset === 'custom'
  const isAnnouncementTimerReady = isAnnouncementTimerValid(announcementForm)

  const dateFormatter = new Intl.DateTimeFormat(language === 'hi' ? 'hi-IN' : 'en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
  const announcementDateFormatter = new Intl.DateTimeFormat(language === 'hi' ? 'hi-IN' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })

  React.useEffect(() => {
    sessionStorage.setItem(ADMIN_DASHBOARD_STATE_KEY, JSON.stringify({ activeTab }))
  }, [activeTab])

  const handleLogout = () => {
    logout()
    navigate('/')
  }

  const formatDate = React.useCallback((value, formatter = dateFormatter) => {
    if (!value) return common.notAvailable
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? common.notAvailable : formatter.format(parsed)
  }, [common.notAvailable, dateFormatter])

  React.useEffect(() => {
    let isMounted = true

    const fetchPlatformStats = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/users/public-stats`)
        if (!response.ok) {
          throw new Error('platform_stats_fetch_failed')
        }

        const data = await response.json()
        if (isMounted) {
          setPlatformStats({
            totalUsers: Number(data.totalUsers) || 0,
            totalCourses: Number(data.totalCourses) || 0,
          })
        }
      } catch (error) {
        console.error('Failed to fetch platform stats', error)
        if (isMounted) {
          setPlatformStats({ totalUsers: 0, totalCourses: 0 })
        }
      } finally {
        if (isMounted) {
          setPlatformStatsLoading(false)
        }
      }
    }

    fetchPlatformStats()

    return () => {
      isMounted = false
    }
  }, [])

  React.useEffect(() => {
    let isMounted = true

    const fetchDesktopApp = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/desktop-app/latest`)
        if (!response.ok) {
          throw new Error('desktop_app_fetch_failed')
        }

        const data = await response.json()
        if (isMounted) {
          setDesktopApp(data.available === false ? null : data)
          setDesktopVersion(data.available === false ? '' : (data.version || ''))
        }
      } catch (error) {
        console.error('Failed to fetch desktop app', error)
        if (isMounted) {
          setDesktopApp(null)
        }
      } finally {
        if (isMounted) {
          setDesktopAppLoading(false)
        }
      }
    }

    fetchDesktopApp()

    return () => {
      isMounted = false
    }
  }, [])

  React.useEffect(() => {
    let isMounted = true

    const fetchTestimonials = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/testimonials`)
        if (!response.ok) {
          throw new Error('testimonials_fetch_failed')
        }

        const data = await response.json()
        if (isMounted) {
          setTestimonials(Array.isArray(data) ? data : [])
        }
      } catch (error) {
        console.error('Failed to fetch testimonials', error)
        if (isMounted) {
          setTestimonials([])
        }
      } finally {
        if (isMounted) {
          setTestimonialsLoading(false)
        }
      }
    }

    fetchTestimonials()

    return () => {
      isMounted = false
    }
  }, [])

  React.useEffect(() => {
    let isMounted = true

    const fetchCoursesAndAnnouncements = async () => {
      try {
        const token = user?.token
        const headers = token ? { Authorization: `Bearer ${token}` } : {}

        const [coursesResponse, announcementsResponse] = await Promise.all([
          fetch(`${API_BASE_URL}/api/courses`, { headers }),
          fetch(`${API_BASE_URL}/api/announcements/manage`, { headers }),
        ])

        if (coursesResponse.ok) {
          const courseData = await coursesResponse.json()
          if (isMounted) {
            setCourses(Array.isArray(courseData) ? courseData : [])
          }
        }

        if (announcementsResponse.ok) {
          const announcementData = await announcementsResponse.json()
          if (isMounted) {
            setAnnouncements(normalizeAnnouncementList(announcementData))
          }
        } else if (isMounted) {
          setAnnouncements([])
        }
      } catch (error) {
        console.error('Failed to fetch admin announcements', error)
        if (isMounted) {
          setAnnouncements([])
        }
      } finally {
        if (isMounted) {
          setAnnouncementsLoading(false)
        }
      }
    }

    fetchCoursesAndAnnouncements()

    return () => {
      isMounted = false
    }
  }, [user?.token])

  const formatFileSize = (size) => {
    if (!size) return '0 B'
    const units = ['B', 'KB', 'MB', 'GB']
    let value = size
    let unitIndex = 0

    while (value >= 1024 && unitIndex < units.length - 1) {
      value /= 1024
      unitIndex += 1
    }

    return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`
  }

  const getUploadUrl = (filePath = '') => `${API_BASE_URL}/${filePath.replace(/\\/g, '/')}`

  const resetTestimonialForm = () => {
    setTestimonialForm({
      id: null,
      name: '',
      role: '',
      quote: '',
      imageFile: null,
      imagePath: null,
    })
    setTestimonialMessage('')
    if (testimonialImageInputRef.current) testimonialImageInputRef.current.value = ''
  }

  const resetAnnouncementForm = () => {
    setAnnouncementForm({
      audienceType: 'GLOBAL',
      courseId: '',
      title: '',
      message: '',
      ...getDefaultAnnouncementTimerForm(),
    })
    setAnnouncementMessage('')
  }

  const resetPrivilegedUserForm = () => {
    setPrivilegedUserForm({
      name: '',
      email: '',
      password: '',
      role: 'INSTRUCTOR',
      institution: '',
    })
    setPrivilegedUserMessage('')
  }

  const resetCourseForm = () => {
    setCourseForm(DEFAULT_COURSE_FORM)
    setCourseMessage('')
  }

  const handleInstallerSelection = (event) => {
    const file = event.target.files?.[0] || null
    setSelectedInstaller(file)
    setDesktopAppMessage('')
  }

  const handlePrivilegedUserFieldChange = (field, value) => {
    setPrivilegedUserForm((prev) => ({ ...prev, [field]: value }))
    setPrivilegedUserMessage('')
  }

  const handleCourseFieldChange = (field, value) => {
    setCourseForm((prev) => ({ ...prev, [field]: value }))
    setCourseMessage('')
  }

  const handleEditCourse = (course) => {
    if (!course?._id) {
      return
    }

    setCourseForm({
      id: course._id,
      course_code: course.course_code || '',
      course_name: course.course_name || '',
      subject: course.subject || '',
      description: course.description || '',
      instructor_name: typeof course.instructor === 'object' ? course.instructor?.name || '' : '',
      course_test_questions: String(course.course_test_questions ?? ''),
      points: String(course.points ?? ''),
      is_active: course.is_active !== false,
      is_analytics_course: Boolean(course.is_analytics_course),
    })
    setCourseMessage('')
    setActiveTab('courses')
  }

  const handleStartCourseCreate = () => {
    setCourseForm(DEFAULT_COURSE_FORM)
    setCourseMessage('')
    setActiveTab('courses')
  }

  const fetchBuilderModules = React.useCallback(async (courseId) => {
    if (!user?.token || !courseId) return

    setBuilderLoadingModules(true)
    try {
      const response = await fetch(`${API_BASE_URL}/api/modules?course_id=${courseId}`, {
        headers: { Authorization: `Bearer ${user.token}` },
      })

      if (!response.ok) {
        throw new Error('modules_fetch_failed')
      }

      const data = await response.json()
      const modules = Array.isArray(data) ? data : []
      setBuilderModules(modules)
      setBuilderSelectedModule((prev) => {
        if (!prev) return null
        return modules.find((module) => module._id === prev._id) || null
      })
    } catch (error) {
      console.error('Failed to fetch admin course modules', error)
      setBuilderModules([])
    } finally {
      setBuilderLoadingModules(false)
    }
  }, [user?.token])

  const fetchBuilderTasks = React.useCallback(async (moduleId) => {
    if (!user?.token || !moduleId) return

    setBuilderLoadingTasks(true)
    try {
      const response = await fetch(`${API_BASE_URL}/api/tasks?module_id=${moduleId}`, {
        headers: { Authorization: `Bearer ${user.token}` },
      })

      if (!response.ok) {
        throw new Error('tasks_fetch_failed')
      }

      const data = await response.json()
      setBuilderTasks(Array.isArray(data) ? data : [])
    } catch (error) {
      console.error('Failed to fetch admin module tasks', error)
      setBuilderTasks([])
    } finally {
      setBuilderLoadingTasks(false)
    }
  }, [user?.token])

  const handleOpenCourseBuilder = (course) => {
    if (!course?._id || course.is_analytics_course) {
      return
    }

    setBuilderCourse(course)
    setBuilderSelectedModule(null)
    setBuilderTasks([])
    fetchBuilderModules(course._id)
    setActiveTab('courses')
  }

  const handleCloseCourseBuilder = () => {
    setBuilderCourse(null)
    setBuilderModules([])
    setBuilderSelectedModule(null)
    setBuilderTasks([])
    setEditingBuilderModule(null)
    setEditingBuilderTask(null)
    setShowBuilderModuleForm(false)
    setShowBuilderTaskForm(false)
  }

  const handleBuilderModuleSelect = (module) => {
    setBuilderSelectedModule(module)
    fetchBuilderTasks(module._id)
  }

  const openBuilderModuleForm = (module = null) => {
    if (!builderCourse) return
    setEditingBuilderModule(module)
    setShowBuilderModuleForm(true)
  }

  const handleBuilderModuleSaved = (moduleData, isEditing = false) => {
    if (isEditing) {
      setBuilderModules((prev) => prev.map((module) => module._id === moduleData._id ? { ...module, ...moduleData } : module))
      setBuilderSelectedModule((prev) => prev && prev._id === moduleData._id ? { ...prev, ...moduleData } : prev)
      setEditingBuilderModule(null)
      return
    }

    setBuilderModules((prev) => [...prev, moduleData])
    setBuilderCourse((prev) => prev ? { ...prev, modules_count: (prev.modules_count || 0) + 1 } : prev)
    setCourses((prev) => prev.map((course) => course._id === builderCourse?._id ? {
      ...course,
      modules_count: (course.modules_count || 0) + 1,
    } : course))
  }

  const openBuilderTaskForm = (task = null) => {
    if (!builderSelectedModule) return
    setEditingBuilderTask(task)
    setShowBuilderTaskForm(true)
  }

  const handleBuilderTaskSaved = (taskData, isEditing = false) => {
    if (isEditing) {
      setBuilderTasks((prev) => prev.map((task) => task._id === taskData._id ? taskData : task))
      setEditingBuilderTask(null)
      return
    }

    setBuilderTasks((prev) => [...prev, taskData])
    setBuilderModules((prev) => prev.map((module) => module._id === taskData.module_id ? {
      ...module,
      task_count: (module.task_count || module.total_tasks || 0) + 1,
      total_tasks: (module.total_tasks || module.task_count || 0) + 1,
    } : module))
  }

  const handleBuilderDeleteModule = async (moduleId) => {
    if (!user?.token || !moduleId || !window.confirm(t.courseManagement.deleteModuleConfirm)) return

    try {
      const response = await fetch(`${API_BASE_URL}/api/modules/${moduleId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${user.token}` },
      })

      if (!response.ok) {
        throw new Error('module_delete_failed')
      }

      setBuilderModules((prev) => prev.filter((module) => module._id !== moduleId))
      setBuilderCourse((prev) => prev ? { ...prev, modules_count: Math.max(0, (prev.modules_count || 0) - 1) } : prev)
      setCourses((prev) => prev.map((course) => course._id === builderCourse?._id ? {
        ...course,
        modules_count: Math.max(0, (course.modules_count || 0) - 1),
      } : course))
      if (builderSelectedModule?._id === moduleId) {
        setBuilderSelectedModule(null)
        setBuilderTasks([])
      }
    } catch (error) {
      console.error('Failed to delete admin module', error)
      setCourseMessage(t.courseManagement.deleteModuleFailed)
    }
  }

  const handleBuilderDeleteTask = async (taskId) => {
    if (!user?.token || !taskId || !window.confirm(t.courseManagement.deleteTaskConfirm)) return

    try {
      const response = await fetch(`${API_BASE_URL}/api/tasks/${taskId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${user.token}` },
      })

      if (!response.ok) {
        throw new Error('task_delete_failed')
      }

      setBuilderTasks((prev) => prev.filter((task) => task._id !== taskId))
      setBuilderModules((prev) => prev.map((module) => module._id === builderSelectedModule?._id ? {
        ...module,
        task_count: Math.max(0, (module.task_count || module.total_tasks || 0) - 1),
        total_tasks: Math.max(0, (module.total_tasks || module.task_count || 0) - 1),
      } : module))
    } catch (error) {
      console.error('Failed to delete admin task', error)
      setCourseMessage(t.courseManagement.deleteTaskFailed)
    }
  }

  const handleSaveCourse = async () => {
    if (!user?.token || !courseForm.course_code.trim() || !courseForm.course_name.trim() || !courseForm.subject.trim()) {
      return
    }

    setSavingCourseId(courseForm.id || 'new')
    setCourseMessage('')

    try {
      const isEditing = Boolean(courseForm.id)
      const isAnalyticsCourse = Boolean(isEditing && courseForm.is_analytics_course)
      const payload = {
        course_code: courseForm.course_code.trim().toUpperCase(),
        course_name: courseForm.course_name.trim(),
        subject: courseForm.subject.trim(),
        description: courseForm.description.trim(),
        course_test_questions: Number(courseForm.course_test_questions) || 0,
        points: Number(courseForm.points) || 0,
        is_active: Boolean(courseForm.is_active),
      }

      if (isAnalyticsCourse) {
        payload.instructor_name = courseForm.instructor_name.trim()
        delete payload.description
        delete payload.course_test_questions
        delete payload.points
        delete payload.is_active
      }

      const response = await fetch(`${API_BASE_URL}/api/courses${isEditing ? `/${courseForm.id}` : ''}`, {
        method: isEditing ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${user.token}`,
        },
        body: JSON.stringify(payload),
      })

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.message || 'course_update_failed')
      }

      if (isEditing) {
        setCourses((prev) => prev.map((course) => {
          if (course._id !== data._id) {
            return course
          }

          return {
            ...course,
            ...data,
            instructor: typeof data.instructor === 'object' && data.instructor !== null ? data.instructor : course.instructor,
            modules_count: course.modules_count,
          }
        }))
      } else {
        setCourses((prev) => [{
          ...data,
          instructor: typeof data.instructor === 'object' && data.instructor !== null
            ? data.instructor
            : { name: user.name, email: user.email },
          modules_count: 0,
        }, ...prev])
        setPlatformStats((prev) => ({
          ...prev,
          totalCourses: Number(prev.totalCourses || 0) + 1,
        }))
      }

      resetCourseForm()
      setCourseMessage(isEditing ? t.courseManagement.updated : t.courseManagement.created)
    } catch (error) {
      console.error('Course update failed', error)
      setCourseMessage(error.message || t.courseManagement.updateFailed)
    } finally {
      setSavingCourseId(null)
    }
  }

  const handleCreatePrivilegedUser = async () => {
    if (!user?.token) {
      return
    }

    if (!privilegedUserForm.name.trim() || !privilegedUserForm.email.trim() || !privilegedUserForm.password.trim()) {
      return
    }

    setSavingPrivilegedUser(true)
    setPrivilegedUserMessage('')

    try {
      const response = await fetch(`${API_BASE_URL}/api/users/staff`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${user.token}`,
        },
        body: JSON.stringify({
          name: privilegedUserForm.name.trim(),
          email: privilegedUserForm.email.trim(),
          password: privilegedUserForm.password,
          role: privilegedUserForm.role,
          institution: privilegedUserForm.institution.trim(),
        }),
      })

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.message || 'privileged_user_create_failed')
      }

      setPlatformStats((prev) => ({
        ...prev,
        totalUsers: Number(prev.totalUsers || 0) + 1,
      }))
      resetPrivilegedUserForm()
      setPrivilegedUserMessage(translate('dashboard.admin.userManagement.created', {
        role: data.role === 'ADMIN' ? translations.auth.roles.admin : translations.auth.roles.teacher,
      }))
    } catch (error) {
      console.error('Privileged user creation failed', error)
      setPrivilegedUserMessage(error.message || t.userManagement.createFailed)
    } finally {
      setSavingPrivilegedUser(false)
    }
  }

  const handleDesktopAppUpload = async () => {
    if (!selectedInstaller || !user?.token) {
      return
    }

    setUploadingDesktopApp(true)
    setDesktopAppMessage('')

    try {
      const formData = new FormData()
      formData.append('installer', selectedInstaller)
      formData.append('version', desktopVersion)

      const response = await fetch(`${API_BASE_URL}/api/desktop-app/upload`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${user.token}`,
        },
        body: formData,
      })

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.message || 'desktop_app_upload_failed')
      }

      setDesktopApp(data)
      setDesktopVersion(data.version || '')
      setSelectedInstaller(null)
      setDesktopAppMessage(t.desktopApp.uploadSuccess)
      if (installerInputRef.current) installerInputRef.current.value = ''
    } catch (error) {
      console.error('Desktop app upload failed', error)
      setDesktopAppMessage(error.message || t.desktopApp.uploadFailed)
    } finally {
      setUploadingDesktopApp(false)
    }
  }

  const handleDesktopAppRemove = async () => {
    if (!user?.token || !desktopApp) {
      return
    }

    setRemovingDesktopApp(true)
    setDesktopAppMessage('')

    try {
      const response = await fetch(`${API_BASE_URL}/api/desktop-app`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${user.token}`,
        },
      })

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.message || 'desktop_app_remove_failed')
      }

      setDesktopApp(null)
      setSelectedInstaller(null)
      setDesktopVersion('')
      setDesktopAppMessage(t.desktopApp.removeSuccess)
      if (installerInputRef.current) installerInputRef.current.value = ''
    } catch (error) {
      console.error('Desktop app remove failed', error)
      setDesktopAppMessage(error.message || t.desktopApp.removeFailed)
    } finally {
      setRemovingDesktopApp(false)
    }
  }

  const handleAnnouncementFieldChange = (field, value) => {
    setAnnouncementForm((prev) => {
      if (field === 'audienceType') {
        return {
          ...prev,
          audienceType: value,
          courseId: value === 'GLOBAL' ? '' : prev.courseId
        }
      }

      if (field === 'timerPreset') {
        return {
          ...prev,
          timerPreset: value,
        }
      }

      return { ...prev, [field]: value }
    })
    setAnnouncementMessage('')
  }

  const handleCreateAnnouncement = async () => {
    if (!user?.token || !announcementForm.title.trim() || !announcementForm.message.trim()) {
      return
    }

    if (announcementForm.audienceType === 'COURSE' && !announcementForm.courseId) {
      return
    }

    const expiresInMinutes = getAnnouncementExpiryMinutes(announcementForm)
    if (announcementForm.timerPreset === 'custom' && !isAnnouncementTimerValid(announcementForm)) {
      return
    }

    setSavingAnnouncement(true)
    setAnnouncementMessage('')

    try {
      const response = await fetch(`${API_BASE_URL}/api/announcements`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${user.token}`,
        },
        body: JSON.stringify({
          audience_type: announcementForm.audienceType,
          course_id: announcementForm.audienceType === 'COURSE' ? announcementForm.courseId : null,
          title: announcementForm.title.trim(),
          message: announcementForm.message.trim(),
          expires_in_minutes: expiresInMinutes,
        }),
      })

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.message || 'announcement_create_failed')
      }

      setAnnouncements((prev) => normalizeAnnouncementList([data, ...prev]))
      resetAnnouncementForm()
      setAnnouncementMessage(t.announcements.created)
    } catch (error) {
      console.error('Create announcement failed', error)
      setAnnouncementMessage(t.announcements.createFailed)
    } finally {
      setSavingAnnouncement(false)
    }
  }

  const handleDeleteAnnouncement = async (announcementId) => {
    if (!user?.token || !announcementId) {
      return
    }

    setDeletingAnnouncementId(announcementId)
    setAnnouncementMessage('')

    try {
      const response = await fetch(`${API_BASE_URL}/api/announcements/${announcementId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${user.token}`,
        },
      })

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.message || 'announcement_delete_failed')
      }

      setAnnouncements((prev) => prev.filter((item) => item._id !== announcementId))
      setAnnouncementMessage(t.announcements.deleted)
    } catch (error) {
      console.error('Delete announcement failed', error)
      setAnnouncementMessage(t.announcements.deleteFailed)
    } finally {
      setDeletingAnnouncementId(null)
    }
  }

  React.useEffect(() => {
    const expiryPruneInterval = window.setInterval(() => {
      setAnnouncements((prev) => normalizeAnnouncementList(prev))
    }, 30000)

    return () => {
      window.clearInterval(expiryPruneInterval)
    }
  }, [])

  React.useEffect(() => {
    if (!user?.token) {
      return undefined
    }

    return subscribeToAnnouncementStream({
      token: user.token,
      onEvent: async ({ event, data }) => {
        if (event !== 'announcement' || !data?.type) {
          return
        }

        setAnnouncements((prev) => applyAnnouncementEvent(prev, data))
      },
      onError: (error) => {
        console.error('Announcement stream error:', error)
      },
    })
  }, [user?.token])

  const handleTestimonialFieldChange = (field, value) => {
    setTestimonialForm((prev) => ({ ...prev, [field]: value }))
    setTestimonialMessage('')
  }

  const handleTestimonialImageSelection = (event) => {
    const file = event.target.files?.[0] || null
    setTestimonialForm((prev) => ({ ...prev, imageFile: file }))
    setTestimonialMessage('')
  }

  const handleEditTestimonial = (testimonial) => {
    setTestimonialForm({
      id: testimonial._id,
      name: testimonial.name || '',
      role: testimonial.role || '',
      quote: testimonial.quote || '',
      imageFile: null,
      imagePath: testimonial.image_path || null,
    })
    setTestimonialMessage('')
    setActiveTab('testimonials')
    if (testimonialImageInputRef.current) testimonialImageInputRef.current.value = ''
  }

  const handleSaveTestimonial = async () => {
    if (!user?.token || !testimonialForm.name.trim() || !testimonialForm.role.trim() || !testimonialForm.quote.trim()) {
      return
    }

    setSavingTestimonial(true)
    setTestimonialMessage('')

    try {
      const formData = new FormData()
      formData.append('name', testimonialForm.name)
      formData.append('role', testimonialForm.role)
      formData.append('quote', testimonialForm.quote)
      if (testimonialForm.imageFile) {
        formData.append('image', testimonialForm.imageFile)
      }

      const isEditing = Boolean(testimonialForm.id)
      const response = await fetch(
        `${API_BASE_URL}/api/testimonials${isEditing ? `/${testimonialForm.id}` : ''}`,
        {
          method: isEditing ? 'PUT' : 'POST',
          headers: {
            Authorization: `Bearer ${user.token}`,
          },
          body: formData,
        }
      )

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.message || 'testimonial_save_failed')
      }

      setTestimonials((prev) => {
        if (isEditing) {
          return prev.map((item) => item._id === data._id ? data : item)
        }

        return [data, ...prev]
      })

      resetTestimonialForm()
      setTestimonialMessage(isEditing ? t.testimonials.updated : t.testimonials.created)
    } catch (error) {
      console.error('Save testimonial failed', error)
      setTestimonialMessage(t.testimonials.createFailed)
    } finally {
      setSavingTestimonial(false)
    }
  }

  const handleDeleteTestimonial = async (testimonialId) => {
    if (!user?.token || !testimonialId) {
      return
    }

    setDeletingTestimonialId(testimonialId)
    setTestimonialMessage('')

    try {
      const response = await fetch(`${API_BASE_URL}/api/testimonials/${testimonialId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${user.token}`,
        },
      })

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.message || 'testimonial_delete_failed')
      }

      setTestimonials((prev) => prev.filter((item) => item._id !== testimonialId))
      if (testimonialForm.id === testimonialId) {
        resetTestimonialForm()
      }
      setTestimonialMessage(t.testimonials.deleted)
    } catch (error) {
      console.error('Delete testimonial failed', error)
      setTestimonialMessage(t.testimonials.deleteFailed)
    } finally {
      setDeletingTestimonialId(null)
    }
  }

  const globalAnnouncementCount = announcements.filter((announcement) => announcement.audience_type === 'GLOBAL').length
  const courseAnnouncementCount = announcements.length - globalAnnouncementCount
  const pendingActions = Number(!desktopApp) + Number(!announcements.length) + Number(!testimonials.length)
  const recentAnnouncements = announcements.slice(0, 3)
  const recentTestimonials = testimonials.slice(0, 3)
  const latestAnnouncement = announcements[0] || null
  const latestTestimonial = testimonials[0] || null
  const liveCourseCount = Math.max(Number(platformStats.totalCourses) || 0, courses.length)
  const liveCourseStatValue = platformStatsLoading && courses.length === 0 ? '...' : liveCourseCount
  const topbarTitle = activeTab === 'overview'
    ? translate('dashboard.admin.topbar.welcomeBack', { name: user?.name || translations.auth.roles.admin })
    : t.tabs[activeTab]
  const statsCards = [
    {
      id: 'users',
      icon: <HiUsers />,
      label: t.stats.totalUsers,
      value: platformStatsLoading ? '...' : platformStats.totalUsers,
    },
    {
      id: 'courses',
      icon: <HiBookOpen />,
      label: t.stats.liveCourses,
      value: liveCourseStatValue,
    },
    {
      id: 'announcements',
      icon: <HiBellAlert />,
      label: t.stats.announcements,
      value: announcementsLoading ? '...' : announcements.length,
    },
    {
      id: 'testimonials',
      icon: <HiSparkles />,
      label: t.stats.testimonials,
      value: testimonialsLoading ? '...' : testimonials.length,
    },
  ]
  const activityItems = [
    {
      time: desktopApp ? formatDate(desktopApp.updated_at) : common.notAvailable,
      text: desktopApp
        ? `${t.desktopApp.title}: ${desktopApp.filename}`
        : `${t.desktopApp.title}: ${t.desktopApp.noFile}`
    },
    {
      time: latestAnnouncement ? formatDate(latestAnnouncement.createdAt, announcementDateFormatter) : common.notAvailable,
      text: latestAnnouncement
        ? `${t.announcements.title}: ${latestAnnouncement.title}`
        : `${t.announcements.title}: ${t.announcements.empty}`
    },
    {
      time: latestTestimonial ? formatDate(latestTestimonial.updatedAt || latestTestimonial.createdAt) : common.notAvailable,
      text: latestTestimonial
        ? `${t.testimonials.title}: ${latestTestimonial.name}`
        : `${t.testimonials.title}: ${t.testimonials.noTestimonials}`
    }
  ]

  const adminWorkspaceProps = {
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
  }

  return (
    <div className="dashboard-layout" data-theme={theme}>
      <aside className="dashboard-sidebar">
        <div className="sidebar-logo">
          <h1 className="dashboard-title">{t.title}</h1>
        </div>

        <nav className="sidebar-nav">
          <button className={`sidebar-link ${activeTab === 'overview' ? 'active' : ''}`} onClick={() => setActiveTab('overview')}>
            <HiChartBar className="sidebar-icon" /> {t.tabs.overview}
          </button>
          <button className={`sidebar-link ${activeTab === 'users' ? 'active' : ''}`} onClick={() => setActiveTab('users')}>
            <HiUsers className="sidebar-icon" /> {t.tabs.users}
          </button>
          <button className={`sidebar-link ${activeTab === 'courses' ? 'active' : ''}`} onClick={() => setActiveTab('courses')}>
            <HiBookOpen className="sidebar-icon" /> {t.tabs.courses}
          </button>
          <button className={`sidebar-link ${activeTab === 'announcements' ? 'active' : ''}`} onClick={() => setActiveTab('announcements')}>
            <HiBellAlert className="sidebar-icon" /> {t.tabs.announcements}
          </button>
          <button className={`sidebar-link ${activeTab === 'testimonials' ? 'active' : ''}`} onClick={() => setActiveTab('testimonials')}>
            <HiSparkles className="sidebar-icon" /> {t.tabs.testimonials}
          </button>
          <button className={`sidebar-link ${activeTab === 'desktop' ? 'active' : ''}`} onClick={() => setActiveTab('desktop')}>
            <HiArrowDownTray className="sidebar-icon" /> {t.tabs.desktop}
          </button>
        </nav>

        <div className="sidebar-bottom">
          <div className="sidebar-profile">
            <div className="profile-info">
              <div className="profile-avatar">{getInitials(user?.name || translations.auth.roles.admin)}</div>
              <div className="profile-text">
                <span className="profile-name">{user?.name || translations.auth.roles.admin}</span>
                <span className="profile-role">{t.roleLabel}</span>
              </div>
            </div>
            <button onClick={handleLogout} className="btn-logout" title={t.logout}>
              <HiArrowDownTray style={{ transform: 'rotate(-90deg)', fontSize: '1.2rem' }} />
            </button>
          </div>
        </div>
      </aside>

      <main className="dashboard-content">
        <header className="dashboard-topbar">
          <div className="topbar-left">
            <h2 className="topbar-title">{topbarTitle}</h2>
          </div>

          <div className="topbar-right">
            <div className="admin-topbar-pill">
              <HiStar />
              <span>{translate('dashboard.admin.topbar.pendingActions', { count: pendingActions })}</span>
            </div>
            <select
              className="language-selector"
              value={language}
              onChange={(event) => changeLanguage(event.target.value)}
            >
              <option value="en">{common.languageNames.en}</option>
              <option value="hi">{common.languageNames.hi}</option>
            </select>
            <button className="theme-toggle topbar-theme-toggle" onClick={toggleTheme} aria-label={common.toggleTheme}>
              {isDark ? <FiSun size={18} /> : <FiMoon size={18} />}
            </button>
            <button onClick={handleLogout} className="btn-logout topbar-action-mobile" title={t.logout}>
              <HiArrowDownTray style={{ transform: 'rotate(-90deg)', fontSize: '1.4rem' }} />
            </button>
          </div>
        </header>

        <AdminDashboardWorkspace {...adminWorkspaceProps} />
      </main>

      {showBuilderModuleForm && builderCourse ? (
        <CreateModuleForm
          onClose={() => { setShowBuilderModuleForm(false); setEditingBuilderModule(null) }}
          onModuleSaved={handleBuilderModuleSaved}
          courseId={builderCourse._id}
          initialData={editingBuilderModule}
        />
      ) : null}

      {showBuilderTaskForm && builderSelectedModule ? (
        <CreateTaskForm
          onClose={() => { setShowBuilderTaskForm(false); setEditingBuilderTask(null) }}
          onTaskCreated={handleBuilderTaskSaved}
          moduleId={builderSelectedModule._id}
          initialData={editingBuilderTask}
        />
      ) : null}
    </div>
  )
}

export default AdminDashboard
