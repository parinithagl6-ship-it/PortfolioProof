import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowRight, ArrowUpRight, BadgeCheck, BookOpen, BriefcaseBusiness,
  Check, ChevronDown, CircleHelp, Code2, ExternalLink, Github, LayoutDashboard,
  LoaderCircle, LogIn, LogOut, Menu, Plus, Search, Settings2, ShieldCheck, Sparkles, Target,
  Trash2, Trophy, X, Zap,
} from 'lucide-react'
import { api } from './api.js'
import { isPublicPortfolioUrl } from './publicUrl.js'
import AssistantChat from './AssistantChat.jsx'

const REPOSITORY_URL = 'https://github.com/parinithagl6-ship-it/PortfolioProof'
const CATEGORIES = ['Frontend', 'Backend', 'Programming', 'Database', 'AI/ML', 'Tools']
const LEVELS = ['Beginner', 'Intermediate', 'Advanced']
const NAV_ITEMS = [
  { id: 'dashboard', label: 'Overview', icon: LayoutDashboard },
  { id: 'skills', label: 'My skills', icon: Zap },
  { id: 'projects', label: 'Projects', icon: BriefcaseBusiness },
  { id: 'portfolio', label: 'Portfolio view', icon: BookOpen },
]
const PAGE_PATHS = {
  dashboard: '/',
  skills: '/skills',
  projects: '/projects',
  portfolio: '/portfolio',
  account: '/account',
}
let sessionRestorationRequest

function restoreSession() {
  if (!sessionRestorationRequest) {
    sessionRestorationRequest = api.me().finally(() => { sessionRestorationRequest = null })
  }
  return sessionRestorationRequest
}

function pageFromPath(pathname) {
  if (pathname === '/portfolio' || pathname.startsWith('/portfolio/')) return 'portfolio'
  const page = Object.keys(PAGE_PATHS).find((key) => PAGE_PATHS[key] === pathname.replace(/\/+$/, '') || (key === 'dashboard' && pathname === '/'))
  return page || 'dashboard'
}

function formatDate(value) {
  if (!value) return 'Recently'
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(value))
}

function initials(value = '') {
  return value.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()
}

function evidenceLines(items = []) {
  return items.map(({ label, url }) => `${label} | ${url}`).join('\n')
}

function parseEvidence(value) {
  return value.split('\n').map((line) => line.trim()).filter(Boolean).map((line) => {
    const separator = line.indexOf('|')
    if (separator < 0) return { label: 'Supporting evidence', url: line }
    return { label: line.slice(0, separator).trim(), url: line.slice(separator + 1).trim() }
  })
}

function App() {
  const [activePage, setActivePage] = useState(() => pageFromPath(window.location.pathname))
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [dashboard, setDashboard] = useState(null)
  const [skills, setSkills] = useState([])
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [notice, setNotice] = useState(null)
  const [modal, setModal] = useState(null)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('All categories')
  const [technologyFilter, setTechnologyFilter] = useState('All technologies')
  const [account, setAccount] = useState(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [authModalOpen, setAuthModalOpen] = useState(() => window.location.pathname === '/reset-password')
  const [authError, setAuthError] = useState('')

  const refresh = useCallback(async ({ showLoading = true } = {}) => {
    if (showLoading) setLoading(true)
    setLoadError('')
    try {
      const [stats, skillList, projectList] = await Promise.all([
        api.dashboard(), api.skills(), api.projects(),
      ])
      setDashboard(stats)
      setSkills(skillList)
      setProjects(projectList)
    } catch (error) {
      setLoadError(error.message)
    } finally {
      if (showLoading) setLoading(false)
    }
  }, [])

  useEffect(() => {
    let active = true
    const params = new URLSearchParams(window.location.search)
    const oauthError = params.get('auth_error')
    if (oauthError) {
      const messages = {
        google_not_configured: 'Google sign-in is not configured on the backend.',
        github_not_configured: 'GitHub sign-in is not configured on the backend.',
        oauth_account_mismatch: 'The provider account could not be linked to the portfolio owner account.',
        oauth_cancelled: 'Sign-in was cancelled.',
        oauth_failed: 'The identity provider could not complete sign-in. Please try again.',
        oauth_state_invalid: 'The sign-in request expired or could not be verified. Please try again.',
      }
      setAuthError(messages[oauthError] || 'Sign-in could not be completed. Please try again.')
      setAuthModalOpen(true)
      params.delete('auth_error')
      const query = params.toString()
      window.history.replaceState({}, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`)
    }

    restoreSession()
      .then(({ user }) => { if (active) setAccount(user) })
      .catch((error) => {
        if (!active) return
        setAccount(null)
        setAuthModalOpen(true)
        if (error.status !== 401) setAuthError(error.message)
      })
      .finally(() => { if (active) setAuthChecked(true) })
    return () => { active = false }
  }, [])
  useEffect(() => {
    if (activePage === 'portfolio') {
      let active = true
      setLoading(true)
      setLoadError('')
      const username = window.location.pathname.startsWith('/portfolio/')
        ? decodeURIComponent(window.location.pathname.slice('/portfolio/'.length))
        : ''
      api.publicPortfolio(username)
        .then(({ skills: skillList, projects: projectList }) => {
          if (!active) return
          setSkills(skillList)
          setProjects(projectList)
        })
        .catch((error) => { if (active) setLoadError(error.message) })
        .finally(() => { if (active) setLoading(false) })
      return () => { active = false }
    }
    if (authChecked && account) refresh()
  }, [refresh, activePage, authChecked, account])
  useEffect(() => {
    const handlePopState = () => {
      setActivePage(pageFromPath(window.location.pathname))
      setMobileNavOpen(false)
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])
  useEffect(() => {
    if (!notice) return undefined
    const timeout = window.setTimeout(() => setNotice(null), 4200)
    return () => window.clearTimeout(timeout)
  }, [notice])

  const filteredSkills = useMemo(() => skills.filter((skill) => {
    const matchesSearch = `${skill.name} ${skill.category}`.toLowerCase().includes(search.toLowerCase())
    return matchesSearch && (categoryFilter === 'All categories' || skill.category === categoryFilter)
  }), [skills, search, categoryFilter])

  const technologies = useMemo(
    () => [...new Set(projects.flatMap((project) => project.technologies || []))].sort(),
    [projects],
  )
  const filteredProjects = useMemo(() => projects.filter((project) => {
    const matchesSearch = `${project.title} ${project.description} ${(project.technologies || []).join(' ')}`.toLowerCase().includes(search.toLowerCase())
    return matchesSearch && (technologyFilter === 'All technologies' || project.technologies?.includes(technologyFilter))
  }), [projects, search, technologyFilter])

  const mutate = async (operation, successMessage, updateState) => {
    try {
      const savedItem = await operation()
      updateState?.(savedItem)
      setModal(null)
      setNotice({ type: 'success', message: successMessage })
      await refresh()
    } catch (error) {
      setNotice({ type: 'error', message: error.message })
      throw error
    }
  }

  const saveSkill = (skill) => mutate(
    () => api.saveSkill(skill),
    skill._id ? 'Skill updated successfully.' : 'Skill added to your portfolio.',
    (savedSkill) => setSkills((current) => current.some((item) => item._id === savedSkill._id)
      ? current.map((item) => item._id === savedSkill._id ? savedSkill : item)
      : [savedSkill, ...current]),
  )
  const saveProject = (project) => mutate(
    () => api.saveProject(project),
    project._id ? 'Project updated successfully.' : 'Project added to your portfolio.',
    (savedProject) => setProjects((current) => current.some((item) => item._id === savedProject._id)
      ? current.map((item) => item._id === savedProject._id ? savedProject : item)
      : [savedProject, ...current]),
  )
  const deleteSkill = async (skill) => {
    if (!skill?._id) {
      setNotice({ type: 'error', message: 'This skill has no database ID and cannot be deleted. Refresh the skills list and try again.' })
      return
    }
    if (!window.confirm(`Delete “${skill.name}”? Projects will no longer be linked to this skill.`)) return
    try {
      await api.deleteSkill(skill._id)
      setSkills((current) => current.filter((item) => item._id !== skill._id))
      setProjects((current) => current.map((project) => ({
        ...project,
        skills: (project.skills || []).filter((linkedSkill) => linkedSkill && (linkedSkill._id || linkedSkill) !== skill._id),
      })))
      setNotice({ type: 'success', message: 'Skill deleted.' })
      await refresh({ showLoading: false })
    } catch (error) {
      setNotice({ type: 'error', message: error.message })
    }
  }
  const deleteProject = async (project) => {
    if (!window.confirm(`Delete “${project.title}”?`)) return
    try {
      await api.deleteProject(project._id)
      setProjects((current) => current.filter((item) => item._id !== project._id))
      setNotice({ type: 'success', message: 'Project deleted.' })
      await refresh({ showLoading: false })
    } catch (error) {
      setNotice({ type: 'error', message: error.message })
    }
  }

  const handleLogout = async () => {
    try {
      await api.logout()
      setAccount(null)
      setNotice({ type: 'success', message: 'You have been logged out.' })
    } catch (error) {
      setNotice({ type: 'error', message: error.message })
    }
  }

  const handleAuthenticated = (user, message) => {
    setAccount(user)
    setAuthError('')
    setAuthModalOpen(false)
    setNotice({ type: 'success', message })
  }

  const goTo = (page) => {
    const nextPath = page === 'portfolio' && account?.username
      ? `/portfolio/${encodeURIComponent(account.username)}`
      : PAGE_PATHS[page]
    if (nextPath && window.location.pathname !== nextPath) {
      window.history.pushState({}, '', nextPath)
    }
    setActivePage(page)
    setMobileNavOpen(false)
    setSearch('')
    if (page === 'skills') setCategoryFilter('All categories')
    if (page === 'projects') setTechnologyFilter('All technologies')
  }

  const pageTitle = {
    dashboard: ['Your evidence, all in one place.', 'A little proof goes a long way. Keep building a portfolio that speaks for itself.'],
    skills: ['Skills, with receipts.', 'Every strength is backed by something you can explore.'],
    projects: ['Work worth showing.', 'Your projects turn what you know into what you can do.'],
    portfolio: ['A portfolio that proves it.', 'A polished, public-facing view of your skills and the work behind them.'],
    account: ['Personal workspace', 'Your portfolio owner account.'],
  }[activePage]

  if (activePage !== 'portfolio' && (!authChecked || !account)) {
    return (
      <div className="app-shell">
        <AuthModal
          required
          initialError={authError}
          onClose={() => {}}
          onAuthenticated={handleAuthenticated}
        />
      </div>
    )
  }

  if (activePage === 'portfolio') {
    return (
      <div className="public-shell">
        <header className="public-topbar">
          <a className="brand-lockup public-brand" href="/" onClick={(event) => { event.preventDefault(); goTo('dashboard') }}>
            <span className="brand-mark"><span /></span>
            <span>portfolio<span className="brand-accent">proof</span></span>
          </a>
          <div className="public-topbar-actions">
            <a href={REPOSITORY_URL} target="_blank" rel="noreferrer"><Github size={15} /> GitHub <ArrowUpRight size={12} /></a>
            <a className="button button-secondary" href="/" onClick={(event) => { event.preventDefault(); goTo('dashboard') }}>Back to workspace</a>
          </div>
        </header>
        <main className="public-main">
          {loadError ? (
            <div className="error-state"><div className="error-icon"><CircleHelp size={22} /></div><div><h2>We couldn’t load this portfolio</h2><p>{loadError}</p><button className="button button-primary" onClick={refresh}>Try again</button></div></div>
          ) : loading ? (
            <div className="loading-state"><LoaderCircle className="spin" size={24} /><span>Loading portfolio...</span></div>
          ) : <PortfolioPage skills={skills} projects={projects} />}
        </main>
        <footer className="public-footer"><span>Evidence-backed skills. Work worth exploring.</span><a href={REPOSITORY_URL} target="_blank" rel="noreferrer"><Github size={14} /> PortfolioProof on GitHub <ArrowUpRight size={12} /></a></footer>
        {notice && <div className={`toast ${notice.type}`} role="status"><span className="toast-icon">{notice.type === 'success' ? <Check size={16} /> : <CircleHelp size={16} />}</span>{notice.message}<button className="icon-button" onClick={() => setNotice(null)} aria-label="Dismiss notification"><X size={15} /></button></div>}
        {authModalOpen && <AuthModal initialError={authError} onClose={() => setAuthModalOpen(false)} onAuthenticated={handleAuthenticated} />}
      </div>
    )
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNavOpen ? 'sidebar-open' : ''}`}>
        <div className="brand-lockup">
          <div className="brand-mark"><span /></div>
          <span>portfolio<span className="brand-accent">proof</span></span>
          <button className="icon-button mobile-close" onClick={() => setMobileNavOpen(false)} aria-label="Close navigation"><X size={18} /></button>
        </div>
        <div className="workspace-label">WORKSPACE</div>
        <nav className="side-nav" aria-label="Main navigation">
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
            <button key={id} className={`nav-item ${activePage === id ? 'active' : ''}`} onClick={() => goTo(id)}>
              <Icon size={18} strokeWidth={1.8} /><span>{label}</span>
              {id === 'portfolio' && <ArrowUpRight className="nav-external" size={14} />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button type="button" className="sidebar-tip" onClick={() => goTo('portfolio')} aria-label="Preview your portfolio">
            <div className="tip-icon"><Sparkles size={16} /></div>
            <div><strong>Proof beats promises.</strong><p>Link your work to stand out.</p></div>
            <ArrowRight size={15} />
          </button>
          <a className="sidebar-github" href={REPOSITORY_URL} target="_blank" rel="noreferrer">
            <Github size={16} /><span>View on GitHub</span><ArrowUpRight size={14} />
          </a>
          <div className="profile-block" role="button" tabIndex={0} onClick={() => goTo('account')} onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              goTo('account')
            }
          }}>
            <div className="avatar">PP</div>
            <div className="profile-copy"><strong>Portfolio owner</strong><span>Personal workspace</span></div>
            <Settings2 size={17} className="profile-settings" />
          </div>
        </div>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <button className="icon-button mobile-menu" onClick={() => setMobileNavOpen(true)} aria-label="Open navigation"><Menu size={20} /></button>
          <div className="breadcrumb"><span>Workspace</span><span className="breadcrumb-slash">/</span><strong>{NAV_ITEMS.find((item) => item.id === activePage)?.label || 'Personal workspace'}</strong></div>
          <div className="topbar-actions">
            <a className="topbar-github" href={REPOSITORY_URL} target="_blank" rel="noreferrer"><Github size={16} /><span>GitHub</span><ArrowUpRight size={13} /></a>
            <div className="topbar-divider" />
            <button className="topbar-auth-button" onClick={account ? handleLogout : () => setAuthModalOpen(true)}>{account ? <LogOut size={14} /> : <LogIn size={14} />}{account ? 'Log out' : 'Log in'}</button>
            <div className="avatar avatar-small">PP</div>
          </div>
        </header>

        <div className="page-content">
          <section className="page-intro">
            <div>
              <div className="eyebrow"><span className="eyebrow-dot" />YOUR SKILL STORY, IN FOCUS</div>
              <h1>{pageTitle[0]}</h1>
              <p>{pageTitle[1]}</p>
            </div>
            <div className="intro-actions">
              <a className="button button-secondary" href={account?.username ? `/portfolio/${encodeURIComponent(account.username)}` : '/portfolio'} target="_blank" rel="noreferrer"><ExternalLink size={16} /> Preview portfolio</a>
              {activePage === 'skills' && <button className="button button-primary" onClick={() => setModal({ type: 'skill' })}><Plus size={17} /> Add a skill</button>}
              {(activePage === 'projects' || activePage === 'dashboard') && <button className="button button-primary" onClick={() => setModal({ type: 'project' })}><Plus size={17} /> Add a project</button>}
            </div>
          </section>

          {activePage === 'account' ? (
            <section className="panel content-panel">
              <div className="panel-heading"><div><div className="section-kicker">PORTFOLIO OWNER</div><h2>Personal workspace</h2></div></div>
              <div className="category-list">
                <div className="category-row"><div className="category-name">Name</div><strong>{account.name}</strong></div>
                <div className="category-row"><div className="category-name">Username</div><strong>{account.username || '—'}</strong></div>
                <div className="category-row"><div className="category-name">Email</div><strong>{account.email}</strong></div>
              </div>
            </section>
          ) : loadError ? (
            <div className="error-state">
              <div className="error-icon"><CircleHelp size={22} /></div>
              <div><h2>We couldn’t load your portfolio</h2><p>{loadError}</p><button className="button button-primary" onClick={refresh}>Try again</button></div>
            </div>
          ) : loading ? (
            <div className="loading-state"><LoaderCircle className="spin" size={24} /><span>Loading your portfolio...</span></div>
          ) : (
            <>
              {activePage === 'dashboard' && <DashboardPage dashboard={dashboard} skills={skills} projects={projects} onPage={goTo} onProject={() => setModal({ type: 'project' })} />}
              {activePage === 'skills' && <SkillsPage skills={filteredSkills} projects={projects} search={search} setSearch={setSearch} category={categoryFilter} setCategory={setCategoryFilter} onEdit={(skill) => setModal({ type: 'skill', item: skill })} onDelete={deleteSkill} onAdd={() => setModal({ type: 'skill' })} />}
              {activePage === 'projects' && <ProjectsPage projects={filteredProjects} skills={skills} technologies={technologies} technology={technologyFilter} setTechnology={setTechnologyFilter} search={search} setSearch={setSearch} onEdit={(project) => setModal({ type: 'project', item: project })} onDelete={deleteProject} onAdd={() => setModal({ type: 'project' })} />}
              {activePage === 'portfolio' && <PortfolioPage skills={skills} projects={projects} />}
            </>
          )}
        </div>
        <footer className="page-footer"><span>Built on proof, not promises.</span><a href={REPOSITORY_URL} target="_blank" rel="noreferrer"><Github size={14} /> PortfolioProof on GitHub <ArrowUpRight size={12} /></a></footer>
      </main>

      {mobileNavOpen && <button className="mobile-backdrop" onClick={() => setMobileNavOpen(false)} aria-label="Close navigation" />}
      {notice && <div className={`toast ${notice.type}`} role="status"><span className="toast-icon">{notice.type === 'success' ? <Check size={16} /> : <CircleHelp size={16} />}</span>{notice.message}<button className="icon-button" onClick={() => setNotice(null)} aria-label="Dismiss notification"><X size={15} /></button></div>}
      {modal && <EditorModal modal={modal} skills={skills} onClose={() => setModal(null)} onSaveSkill={saveSkill} onSaveProject={saveProject} />}
      {authModalOpen && <AuthModal initialError={authError} onClose={() => setAuthModalOpen(false)} onAuthenticated={handleAuthenticated} />}
      <AssistantChat signedIn={Boolean(account)} onSignIn={() => setAuthModalOpen(true)} />
    </div>
  )
}

function DashboardPage({ dashboard, skills, projects, onPage, onProject }) {
  const stats = [
    { label: 'Skills captured', value: dashboard?.totalSkills ?? 0, icon: Zap, note: `${dashboard?.highlightedSkills ?? 0} highlighted`, color: 'violet' },
    { label: 'Projects shared', value: dashboard?.totalProjects ?? 0, icon: BriefcaseBusiness, note: 'Real work, real outcomes', color: 'blue' },
    { label: 'Evidence links', value: dashboard?.verifiedEvidence ?? 0, icon: BadgeCheck, note: 'Ready to explore', color: 'green' },
  ]
  const categories = dashboard?.categoryBreakdown || []
  const maxCategory = Math.max(1, ...categories.map((category) => category.count))

  return (
    <>
      <section className="stats-grid">
        {stats.map(({ label, value, icon: Icon, note, color }, index) => (
          <article key={label} className={`stat-card stat-${color}`}>
            <div className="stat-top"><div className={`stat-icon ${color}`}><Icon size={18} /></div><span className="stat-index">0{index + 1}</span></div>
            <div className="stat-value">{value}</div><div className="stat-label">{label}</div>
            <div className="stat-note"><span className="stat-note-dot" />{note}</div>
          </article>
        ))}
      </section>
      <section className="dashboard-grid">
        <article className="panel skill-overview">
          <div className="panel-heading"><div><div className="section-kicker">CAPABILITY MAP</div><h2>Skills at a glance</h2></div><button className="text-link" onClick={() => onPage('skills')}>All skills <ArrowRight size={15} /></button></div>
          {categories.length ? <div className="category-list">{categories.map((category) => (
            <div className="category-row" key={category._id}><div className="category-name">{category._id}</div><div className="category-track"><span style={{ width: `${Math.max(7, (category.count / maxCategory) * 100)}%` }} /></div><span className="category-count">{String(category.count).padStart(2, '0')}</span></div>
          ))}</div> : <EmptyState icon={Target} title="Your map starts here" detail="Add skills to see your strengths take shape." action="Add a skill" onClick={() => onPage('skills')} />}
          {skills.length > 0 && <div className="skill-chip-row">{skills.slice(0, 5).map((skill) => <span className="skill-chip" key={skill._id}>{skill.name}</span>)}{skills.length > 5 && <span className="skill-chip more-chip">+{skills.length - 5}</span>}</div>}
        </article>
        <article className="panel activity-panel">
          <div className="panel-heading"><div><div className="section-kicker">THE LATEST</div><h2>Recent activity</h2></div><span className="live-indicator"><i /> LIVE</span></div>
          {dashboard?.activities?.length ? <div className="activity-list">{dashboard.activities.slice(0, 5).map((activity, index) => (
            <div className="activity-item" key={`${activity.type}-${activity.id}`}><div className={`activity-icon activity-${activity.type}`}>{activity.type === 'skill' ? <Zap size={15} /> : <Code2 size={15} />}</div><div className="activity-copy"><strong>{activity.title}</strong><span>{activity.detail}</span></div><time>{formatDate(activity.date)}</time>{index < 4 && <span className="activity-rail" />}</div>
          ))}</div> : <EmptyState icon={Sparkles} title="Good things start small" detail="Add a skill or project to create your first activity." action="Add a project" onClick={onProject} />}
        </article>
      </section>
      <section className="projects-section">
        <div className="section-header"><div><div className="section-kicker">SELECTED WORK</div><h2>Projects that speak for you</h2></div><button className="text-link" onClick={() => onPage('projects')}>View all projects <ArrowRight size={15} /></button></div>
        {projects.length ? <div className="project-grid">{projects.slice(0, 2).map((project, index) => <ProjectCard key={project._id} project={project} index={index} compact />)}</div> : <EmptyState icon={BriefcaseBusiness} title="Your first project belongs here" detail="Connect the skills you used and give your work the context it deserves." action="Add a project" onClick={onProject} />}
      </section>
    </>
  )
}

function SkillsPage({ skills, projects, search, setSearch, category, setCategory, onEdit, onDelete, onAdd }) {
  return (
    <section className="panel content-panel">
      <div className="panel-heading list-heading"><div><div className="section-kicker">YOUR TOOLKIT</div><h2>All skills <span className="count-badge">{skills.length}</span></h2></div><button className="button button-primary button-compact" onClick={onAdd}><Plus size={16} /> Add skill</button></div>
      <div className="filter-toolbar">
        <label className="search-field"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Search skills" placeholder="Search skills..." /></label>
        <label className="select-field"><span className="sr-only">Filter by category</span><select value={category} onChange={(event) => setCategory(event.target.value)}><option>All categories</option>{CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select><ChevronDown size={15} /></label>
      </div>
      {skills.length ? <div className="skills-table-wrap"><table className="skills-table"><thead><tr><th>SKILL</th><th>CATEGORY</th><th>PROFICIENCY</th><th>EVIDENCE</th><th /></tr></thead><tbody>
        {skills.map((skill) => {
          const linkedProjects = projects.filter((project) => project.skills?.some((projectSkill) => (projectSkill._id || projectSkill) === skill._id))
          const evidenceCount = (skill.artifacts?.length || 0) + linkedProjects.length
          return <tr key={skill._id}><td><div className="table-skill"><span className="skill-symbol">{initials(skill.name)}</span><div><strong>{skill.name}</strong>{skill.highlighted && <span className="highlight-tag"><Sparkles size={11} /> Featured</span>}</div></div></td><td><span className="category-pill">{skill.category}</span></td><td><span className={`level-pill level-${skill.level.toLowerCase()}`}><i />{skill.level}</span></td><td><span className="evidence-link"><ShieldCheck size={14} />{evidenceCount} {evidenceCount === 1 ? 'item' : 'items'}</span></td><td><div className="row-actions"><button className="icon-button" onClick={() => onEdit(skill)} aria-label={`Edit ${skill.name}`}><Settings2 size={15} /></button><button className="icon-button danger-hover" onClick={() => onDelete(skill)} aria-label={`Delete ${skill.name}`}><Trash2 size={15} /></button></div></td></tr>
        })}
      </tbody></table></div> : <EmptyState icon={Search} title="No skills found" detail={search || category !== 'All categories' ? 'Try a different search or category.' : 'Add a skill and attach a link that demonstrates it.'} action={search || category !== 'All categories' ? 'Clear filters' : 'Add a skill'} onClick={search || category !== 'All categories' ? () => { setSearch(''); setCategory('All categories') } : onAdd} />}
    </section>
  )
}

function ProjectsPage({ projects, skills, technologies, technology, setTechnology, search, setSearch, onEdit, onDelete, onAdd }) {
  return (
    <section className="panel content-panel">
      <div className="panel-heading list-heading"><div><div className="section-kicker">PROOF IN PRACTICE</div><h2>All projects <span className="count-badge">{projects.length}</span></h2></div><button className="button button-primary button-compact" onClick={onAdd}><Plus size={16} /> Add project</button></div>
      <div className="filter-toolbar">
        <label className="search-field"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Search projects" placeholder="Search projects..." /></label>
        <label className="select-field"><span className="sr-only">Filter by technology</span><select value={technology} onChange={(event) => setTechnology(event.target.value)}><option>All technologies</option>{technologies.map((item) => <option key={item}>{item}</option>)}</select><ChevronDown size={15} /></label>
      </div>
      {projects.length ? <div className="project-grid project-grid-full">{projects.map((project, index) => <div className="editable-project" key={project._id}><ProjectCard project={project} index={index} /><div className="project-manage"><span>Added {formatDate(project.createdAt)}</span><div className="row-actions"><button className="icon-button" onClick={() => onEdit(project)} aria-label={`Edit ${project.title}`}><Settings2 size={15} /></button><button className="icon-button danger-hover" onClick={() => onDelete(project)} aria-label={`Delete ${project.title}`}><Trash2 size={15} /></button></div></div></div>)}</div> : <EmptyState icon={Search} title="No projects found" detail={search || technology !== 'All technologies' ? 'Try a different search or technology.' : 'Add a project and connect it to the skills it demonstrates.'} action={search || technology !== 'All technologies' ? 'Clear filters' : 'Add a project'} onClick={search || technology !== 'All technologies' ? () => { setSearch(''); setTechnology('All technologies') } : onAdd} />}
      {skills.length === 0 && <p className="subtle-note">Tip: add a few skills first so you can connect them to your projects.</p>}
    </section>
  )
}

function ProjectCard({ project, index = 0, compact = false }) {
  const palette = ['project-art-lilac', 'project-art-blue', 'project-art-peach', 'project-art-green']
  return (
    <article id={project._id ? `project-${project._id}` : undefined} className={`project-card ${compact ? 'compact-project' : ''}`}>
      <div className={`project-art ${palette[index % palette.length]}`}>
        <div className="art-grid" />
        <div className="art-orbit orbit-one" /><div className="art-orbit orbit-two" />
        <div className="project-art-icon">{index % 2 === 0 ? <Code2 size={22} /> : <Target size={22} />}</div>
        <span className="project-number">PROJECT&nbsp; {String(index + 1).padStart(2, '0')}</span>
      </div>
      <div className="project-card-body">
        <div className="project-title-row"><h3>{project.title}</h3><span className="project-verified" title="Evidence attached"><BadgeCheck size={17} /></span></div>
        <p>{project.description}</p>
        <div className="project-tags">{(project.technologies || []).slice(0, 4).map((technology) => <span key={technology}>{technology}</span>)}{(project.technologies || []).length > 4 && <span>+{project.technologies.length - 4}</span>}</div>
        {!!project.skills?.length && <div className="demonstrates"><span>DEMONSTRATES</span><div>{project.skills.slice(0, 3).map((skill) => <span key={skill._id || skill}>{skill.name || skill}</span>)}</div></div>}
        <div className="project-card-footer">
          <div className="project-evidence-count"><ShieldCheck size={14} /> {(project.evidence?.length || 0) + Number(Boolean(project.githubUrl)) + Number(Boolean(project.liveUrl))} evidence links</div>
          <div className="project-links">{isPublicPortfolioUrl(project.githubUrl) && <a href={project.githubUrl} target="_blank" rel="noreferrer" aria-label={`GitHub repository for ${project.title}`}><Github size={16} /></a>}{isPublicPortfolioUrl(project.liveUrl) && <a href={project.liveUrl} target="_blank" rel="noreferrer" aria-label={`Live demo for ${project.title}`}><ArrowUpRight size={16} /></a>}{(project.evidence || []).filter((item) => isPublicPortfolioUrl(item.url)).map((item) => <a key={item._id || item.url} href={item.url} target="_blank" rel="noreferrer" aria-label={item.label}><ExternalLink size={15} /></a>)}</div>
        </div>
      </div>
    </article>
  )
}

function PortfolioPage({ skills, projects }) {
  return (
    <div className="public-portfolio">
      <section className="portfolio-hero">
        <div className="portfolio-hero-copy"><div className="eyebrow"><span className="eyebrow-dot" />A LIVING PORTFOLIO</div><h2>Hi, I’m a <span>builder</span> who lets the work do the talking.</h2><p>I turn ideas into thoughtful digital experiences — and make sure there’s proof behind every skill.</p><div className="portfolio-hero-links"><a href={REPOSITORY_URL} target="_blank" rel="noreferrer"><Github size={16} /> GitHub <ArrowUpRight size={13} /></a><span><BadgeCheck size={15} /> Evidence-backed skills</span></div></div>
        <div className="portfolio-orb"><div className="orb-ring ring-outer" /><div className="orb-ring ring-inner" /><div className="orb-center"><Code2 size={35} /></div><span className="orb-label orb-label-top">LEARN · BUILD</span><span className="orb-label orb-label-bottom">SHOW · GROW</span></div>
        <div className="portfolio-count"><strong>{skills.length}</strong><span>skills with proof</span><i /><strong>{projects.length}</strong><span>projects shipped</span></div>
      </section>
      <section className="portfolio-section">
        <div className="section-header"><div><div className="section-kicker">MY CRAFT</div><h2>Skills I can stand behind</h2></div><span className="section-count">{skills.length} SKILLS</span></div>
        {skills.length ? <div className="portfolio-skills-grid">{skills.map((skill) => {
          const linkedProjects = projects.filter((project) => project.skills?.some((projectSkill) => (projectSkill._id || projectSkill) === skill._id))
          const safeArtifacts = (skill.artifacts || []).filter((artifact) => isPublicPortfolioUrl(artifact.url))
          return <article className="portfolio-skill" key={skill._id}><div className="portfolio-skill-top"><span className="skill-symbol">{initials(skill.name)}</span>{skill.highlighted && <Sparkles size={15} className="feature-spark" />}</div><h3>{skill.name}</h3><div className="portfolio-skill-meta"><span>{skill.category}</span><span>{skill.level}</span></div><div className="portfolio-skill-evidence">{safeArtifacts.map((artifact) => <a key={artifact._id || artifact.url} href={artifact.url} target="_blank" rel="noreferrer"><ShieldCheck size={14} />{artifact.label}<ArrowUpRight size={12} /></a>)}{linkedProjects.map((project) => <a key={project._id} href={`#project-${project._id}`}><BriefcaseBusiness size={13} />{project.title}<ArrowUpRight size={12} /></a>)}{!safeArtifacts.length && !linkedProjects.length && <span className="evidence-soon"><ShieldCheck size={14} />Add evidence to support this skill</span>}</div></article>
        })}</div> : <EmptyState icon={Zap} title="The story is yours to write" detail="Add your first skill to start your public portfolio." />}
      </section>
      <section className="portfolio-section">
        <div className="section-header"><div><div className="section-kicker">SELECTED PROJECTS</div><h2>Things I’ve made</h2></div><span className="section-count">{projects.length} PROJECTS</span></div>
        {projects.length ? <div className="project-grid">{projects.map((project, index) => <ProjectCard key={project._id} project={project} index={index} />)}</div> : <EmptyState icon={BriefcaseBusiness} title="Projects go here" detail="Share the work that shows your skills in action." />}
      </section>
      <div className="portfolio-cta"><div className="cta-mark"><Trophy size={20} /></div><div><strong>Every skill has a story.</strong><span>And every story is stronger with something to show for it.</span></div><a href={REPOSITORY_URL} target="_blank" rel="noreferrer">Explore the source <ArrowUpRight size={15} /></a></div>
    </div>
  )
}

function EmptyState({ icon: Icon, title, detail, action, onClick }) {
  return <div className="empty-state"><div className="empty-icon"><Icon size={19} /></div><h3>{title}</h3><p>{detail}</p>{action && <button className="text-link empty-action" onClick={onClick}>{action}<ArrowRight size={14} /></button>}</div>
}

function AuthModal({ onClose, onAuthenticated, required = false, initialError = '' }) {
  const [mode, setMode] = useState(() => new URLSearchParams(window.location.search).has('token') ? 'reset' : 'login')
  const [form, setForm] = useState({
    name: '',
    username: '',
    email: '',
    identifier: '',
    password: '',
    confirmPassword: '',
    resetEmail: '',
    resetToken: new URLSearchParams(window.location.search).get('token') || '',
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(initialError)
  const [message, setMessage] = useState('')
  const submitLock = useRef(false)
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }))

  useEffect(() => {
    if (initialError) setError(initialError)
  }, [initialError])

  const submit = async (event) => {
    event.preventDefault()
    if (submitLock.current) return
    submitLock.current = true
    setBusy(true)
    setError('')
    setMessage('')
    try {
      if (mode === 'forgot') {
        const result = await api.requestPasswordReset(form.resetEmail)
        setMessage(result.message)
      } else if (mode === 'reset') {
        const result = await api.resetPassword({
          token: form.resetToken,
          password: form.password,
          confirmPassword: form.confirmPassword,
        })
        setMode('login')
        setForm((current) => ({ ...current, identifier: form.resetEmail || '', password: '', confirmPassword: '' }))
        setMessage(result.message)
        window.history.replaceState({}, '', '/')
      } else {
        const { user } = mode === 'register'
          ? await api.register(form)
          : await api.login({ identifier: form.identifier, password: form.password })
        onAuthenticated(user, mode === 'register' ? 'Your portfolio owner account is ready.' : 'Welcome back.')
      }
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      submitLock.current = false
      setBusy(false)
    }
  }

  const title = {
    login: 'Log in to your workspace',
    register: 'Create your owner account',
    forgot: 'Recover your password',
    reset: 'Choose a new password',
  }[mode]

  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (!required && event.target === event.currentTarget && !busy) onClose() }}>
      <section className="editor-modal auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-title">
        <div className="modal-header"><div><div className="section-kicker">PORTFOLIO OWNER</div><h2 id="auth-title">{title}</h2></div>{!required && <button className="icon-button" onClick={onClose} aria-label="Close dialog" disabled={busy}><X size={18} /></button>}</div>
        <form className="editor-form" onSubmit={submit}>
          {mode === 'register' && <label className="form-field"><span>Your name <b>*</b></span><input required maxLength="80" autoComplete="name" value={form.name} onChange={(event) => update('name', event.target.value)} autoFocus /></label>}
          {mode === 'register'
            ? <>
              <label className="form-field"><span>Username <b>*</b></span><input required autoComplete="username" minLength="3" maxLength="32" pattern="[A-Za-z0-9._-]+" value={form.username} onChange={(event) => update('username', event.target.value)} /></label>
              <label className="form-field"><span>Email <b>*</b></span><input required type="email" autoComplete="email" maxLength="254" value={form.email} onChange={(event) => update('email', event.target.value)} /></label>
            </>
            : mode === 'login' && <label className="form-field"><span>Email or username <b>*</b></span><input required autoComplete="username" maxLength="254" value={form.identifier} onChange={(event) => update('identifier', event.target.value)} autoFocus /></label>}
          {mode === 'forgot' && <label className="form-field"><span>Registered email <b>*</b></span><input required type="email" autoComplete="email" maxLength="254" value={form.resetEmail} onChange={(event) => update('resetEmail', event.target.value)} autoFocus /></label>}
          {(mode === 'login' || mode === 'register' || mode === 'reset') && <>
            {mode === 'reset' && <label className="form-field"><span>New password <b>*</b></span><input required type="password" autoComplete="new-password" minLength="10" maxLength="128" value={form.password} onChange={(event) => update('password', event.target.value)} autoFocus /></label>}
            {mode === 'reset' && <label className="form-field"><span>Confirm new password <b>*</b></span><input required type="password" autoComplete="new-password" minLength="10" maxLength="128" value={form.confirmPassword} onChange={(event) => update('confirmPassword', event.target.value)} /></label>}
            {mode !== 'reset' && <label className="form-field"><span>Password <b>*</b></span><input required type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={mode === 'register' ? 10 : 1} maxLength="128" value={form.password} onChange={(event) => update('password', event.target.value)} /><small>{mode === 'register' ? 'Use at least 10 characters.' : 'Your password is sent only to this backend.'}</small></label>}
          </>}
          {mode === 'login' && <button type="button" className="text-link" disabled={busy} onClick={() => { setMode('forgot'); setError(''); setMessage('') }}>Forgot password?</button>}
          {error && <div className="form-error" role="alert"><CircleHelp size={15} />{error}</div>}
          {message && <div className="form-success" role="status">{message}</div>}
          <div className="modal-actions">
            <button type="button" className="text-link auth-mode-toggle" disabled={busy} onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); setMessage('') }}>{mode === 'login' ? 'Create owner account' : mode === 'register' ? 'Already registered? Log in' : 'Back to log in'}</button>
            <button type="submit" className="button button-primary" disabled={busy}>{busy ? <LoaderCircle size={16} className="spin" /> : <Check size={16} />}{busy ? 'Please wait...' : mode === 'login' ? 'Log in' : mode === 'register' ? 'Register' : mode === 'forgot' ? 'Send recovery link' : 'Reset password'}</button>
          </div>
        </form>
      </section>
    </div>
  )
}

function EditorModal({ modal, skills, onClose, onSaveSkill, onSaveProject }) {
  const isSkill = modal.type === 'skill'
  const item = modal.item
  const [form, setForm] = useState(() => isSkill ? {
    name: item?.name || '', category: item?.category || 'Frontend', level: item?.level || 'Intermediate',
    highlighted: item?.highlighted || false, artifacts: evidenceLines(item?.artifacts),
  } : {
    title: item?.title || '', description: item?.description || '', githubUrl: item?.githubUrl || '',
    liveUrl: item?.liveUrl || '', technologies: (item?.technologies || []).join(', '),
    skills: (item?.skills || []).map((skill) => skill._id || skill),
    evidence: evidenceLines(item?.evidence),
  })
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const [error, setError] = useState('')
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }))

  const submit = async (event) => {
    event.preventDefault()
    if (savingRef.current) return
    savingRef.current = true
    setSaving(true)
    setError('')
    try {
      if (isSkill) {
        await onSaveSkill({
          ...(item?._id ? { _id: item._id } : {}),
          name: form.name.trim(), category: form.category, level: form.level,
          highlighted: form.highlighted, artifacts: parseEvidence(form.artifacts),
        })
      } else {
        await onSaveProject({
          ...(item?._id ? { _id: item._id } : {}),
          title: form.title.trim(), description: form.description.trim(),
          githubUrl: form.githubUrl.trim(), liveUrl: form.liveUrl.trim(),
          technologies: form.technologies.split(',').map((tag) => tag.trim()).filter(Boolean),
          skills: form.skills, evidence: parseEvidence(form.evidence),
        })
      }
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose() }}>
      <section className="editor-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div className="modal-header"><div><div className="section-kicker">{isSkill ? 'GROW YOUR TOOLKIT' : 'SHOW YOUR WORK'}</div><h2 id="modal-title">{item ? 'Edit' : 'Add a'} {isSkill ? 'skill' : 'project'}</h2></div><button className="icon-button" onClick={onClose} aria-label="Close dialog"><X size={18} /></button></div>
        <form onSubmit={submit} className="editor-form">
          {isSkill ? <>
            <label className="form-field"><span>Skill name <b>*</b></span><input required maxLength="60" value={form.name} onChange={(event) => update('name', event.target.value)} autoFocus placeholder="e.g. React" /></label>
            <div className="form-row"><label className="form-field"><span>Category <b>*</b></span><select value={form.category} onChange={(event) => update('category', event.target.value)}>{CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select></label><label className="form-field"><span>Proficiency <b>*</b></span><select value={form.level} onChange={(event) => update('level', event.target.value)}>{LEVELS.map((level) => <option key={level}>{level}</option>)}</select></label></div>
            <label className="form-field"><span>Evidence links</span><textarea rows="4" value={form.artifacts} onChange={(event) => update('artifacts', event.target.value)} placeholder={'One link per line: label | https://example.com'} /><small>Add a certificate, code sample, article, or project URL.</small></label>
            <label className="check-field"><input type="checkbox" checked={form.highlighted} onChange={(event) => update('highlighted', event.target.checked)} /><span><strong>Feature this skill</strong><small>Featured skills need at least one supporting evidence link.</small></span><Sparkles size={16} /></label>
          </> : <>
            <label className="form-field"><span>Project title <b>*</b></span><input required maxLength="100" value={form.title} onChange={(event) => update('title', event.target.value)} autoFocus placeholder="e.g. FocusFlow — mindful task manager" /></label>
            <label className="form-field"><span>What did you build? <b>*</b></span><textarea required maxLength="1200" rows="3" value={form.description} onChange={(event) => update('description', event.target.value)} placeholder="A short, clear description of the problem and your solution." /></label>
            <div className="form-row"><label className="form-field"><span>GitHub repository</span><input type="url" value={form.githubUrl} onChange={(event) => update('githubUrl', event.target.value)} placeholder="https://github.com/you/project" /></label><label className="form-field"><span>Live demo</span><input type="url" value={form.liveUrl} onChange={(event) => update('liveUrl', event.target.value)} placeholder="https://your-project.com" /></label></div>
            <label className="form-field"><span>Technologies</span><input value={form.technologies} onChange={(event) => update('technologies', event.target.value)} placeholder="React, Node.js, MongoDB" /><small>Separate technologies with commas.</small></label>
            <fieldset className="skill-picker"><legend>Skills demonstrated</legend>{skills.length ? <div className="skill-picker-grid">{skills.map((skill) => <label key={skill._id}><input type="checkbox" checked={form.skills.includes(skill._id)} onChange={(event) => update('skills', event.target.checked ? [...form.skills, skill._id] : form.skills.filter((id) => id !== skill._id))} /><span>{skill.name}</span></label>)}</div> : <p>Add skills before connecting them to a project.</p>}</fieldset>
            <label className="form-field"><span>More evidence links</span><textarea rows="3" value={form.evidence} onChange={(event) => update('evidence', event.target.value)} placeholder={'One link per line: label | https://example.com'} /><small>Case studies, demos, design files, or write-ups.</small></label>
          </>}
          {error && <div className="form-error" role="alert"><CircleHelp size={15} />{error}</div>}
          <div className="modal-actions"><button type="button" className="button button-secondary" onClick={onClose} disabled={saving}>Cancel</button><button type="submit" className="button button-primary" disabled={saving}>{saving ? <LoaderCircle size={16} className="spin" /> : <Check size={16} />}{saving ? 'Saving...' : item ? 'Save changes' : `Add ${isSkill ? 'skill' : 'project'}`}</button></div>
        </form>
      </section>
    </div>
  )
}

export default App