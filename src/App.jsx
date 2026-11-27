import { useEffect, useMemo, useState } from 'react'
import Papa from 'papaparse'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LabelList, Cell, CartesianGrid,
} from 'recharts'
import './App.css'

// Fast option: Google "gviz" CSV (needs the sheet shared as "Anyone with the link can view").
// Fallback: the old "Publish to web" CSV link.
const SHEET_ID = import.meta.env.VITE_SHEET_ID
const SHEET_GID = import.meta.env.VITE_SHEET_GID || '0'
const PUBLISHED_CSV_URL = import.meta.env.VITE_CSV_URL

function buildUrl() {
  const bust = `_=${Date.now()}`
  if (SHEET_ID) {
    return `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&gid=${SHEET_GID}&headers=1&${bust}`
  }
  if (PUBLISHED_CSV_URL) {
    return `${PUBLISHED_CSV_URL}${PUBLISHED_CSV_URL.includes('?') ? '&' : '?'}${bust}`
  }
  return ''
}

const CATS = [
  { key: 'N', label: 'New Install', color: '#f97316' },
  { key: 'S', label: 'Maintenance', color: '#8b86f0' },
  { key: 'R', label: 'Reinstall', color: '#22c58b' },
]

const totalsOf = list =>
  CATS.map(c => ({ ...c, value: list.reduce((n, r) => n + r[c.key], 0) }))

// Accepts 2026-11-04, 04-11-2026, 04/11/26
function toDate(s = '') {
  const t = s.trim()
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (m) return new Date(+m[1], +m[2] - 1, +m[3])
  m = t.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/)
  if (m) return new Date(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2] - 1, +m[1])
  return null
}

function parse(text) {
  const { data } = Papa.parse(text.trim(), {
    header: true,
    skipEmptyLines: true,
    transformHeader: h => h.trim().toLowerCase(),
  })
  return data
    .filter(r => r.date && r.electrician)
    .map((r, i) => ({
      id: i + 1,
      date: r.date.trim(),
      d: toDate(r.date),
      electrician: r.electrician.trim(),
      user: (r.user || '').trim(),
      N: +r['new install'] || 0,
      S: +r.maintenance || 0,
      R: +r.reinstall || 0,
      province: (r.province || '').trim(),
    }))
}

/* ---------- small pieces ---------- */

const Icon = ({ d }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
)
const ICONS = {
  dash: 'M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z',
  bolt: 'M13 2 4 14h7l-1 8 9-12h-7z',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
}

function Card({ icon, title, sub, right, children }) {
  return (
    <section className="card">
      <header className="card-head">
        <span className="card-icon"><Icon d={ICONS[icon]} /></span>
        <div className="card-title">
          <h2>{title}</h2>
          {sub && <p>{sub}</p>}
        </div>
        {right}
      </header>
      <div className="card-body">{children}</div>
    </section>
  )
}

function DarkTip({ active, payload, label, unit = '' }) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  return (
    <div className="tip">
      <div className="tip-row">
        <i style={{ background: p.color || 'var(--accent)' }} />
        <b>{payload[0].value}{unit}</b>
        <span>{p.label || label}</span>
      </div>
    </div>
  )
}

export default function App() {
  const [rows, setRows] = useState([])
  const [error, setError] = useState('')
  const [updatedAt, setUpdatedAt] = useState(null)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [range, setRange] = useState({ from: '', to: '' })
  const [tech, setTech] = useState(null)      // null = All electricians
  const [picked, setPicked] = useState(null)  // { tech, key?, date?, src }
  const [mode, setMode] = useState(null)      // 'view' | 'detail'

  useEffect(() => {
    const load = async () => {
      try {
        const url = buildUrl()
        if (!url) throw new Error('Missing VITE_SHEET_ID (or VITE_CSV_URL) in .env')
        const res = await fetch(url, { cache: 'no-store' })
        if (!res.ok) throw new Error('HTTP ' + res.status)
        setRows(parse(await res.text()))
        setUpdatedAt(new Date())
        setError('')
      } catch (e) {
        setError('Could not load the sheet: ' + e.message)
      }
    }
    load()
    const id = setInterval(load, 15000) // every 15 seconds
    const onFocus = () => load()        // also refresh when you return to the tab
    window.addEventListener('focus', onFocus)
    return () => { clearInterval(id); window.removeEventListener('focus', onFocus) }
  }, [])

  const techs = useMemo(
    () => [...new Set(rows.map(r => r.electrician).filter(Boolean))], [rows])

  const filtered = useMemo(() => {
    const f = range.from ? toDate(range.from) : null
    const t = range.to ? toDate(range.to) : null
    return rows.filter(r =>
      (!tech || r.electrician === tech) &&
      (!f || (r.d && r.d >= f)) &&
      (!t || (r.d && r.d <= t)))
  }, [rows, tech, range])

  // Top 3 electricians by New Install (respects the date range, not the electrician filter)
  const top3 = useMemo(() => {
    const f = range.from ? toDate(range.from) : null
    const t = range.to ? toDate(range.to) : null
    const sums = new Map()
    rows.forEach(r => {
      if ((f && !(r.d && r.d >= f)) || (t && !(r.d && r.d <= t))) return
      sums.set(r.electrician, (sums.get(r.electrician) || 0) + r.N)
    })
    return [...sums.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name))
      .slice(0, 3)
  }, [rows, range])

  // Jobs by type: All selected -> one chart per electrician. One selected -> one chart.
  const groups = useMemo(
    () => (tech ? [tech] : techs).map(name => ({
      name,
      totals: totalsOf(filtered.filter(r => r.electrician === name)),
    })),
    [filtered, tech, techs])

  // Plan chart: Quantity = number of "No" rows.
  // All -> one bar per electrician. One electrician -> one bar per date.
  const planData = useMemo(() => {
    if (!tech) {
      return techs.map(name => ({
        label: name, tech: name,
        value: filtered.filter(r => r.electrician === name).length,
      }))
    }
    const byDate = new Map()
    filtered.forEach(r => {
      const e = byDate.get(r.date) || { label: r.date, date: r.date, tech, value: 0, d: r.d }
      e.value += 1
      byDate.set(r.date, e)
    })
    return [...byDate.values()].sort((a, b) => (a.d || 0) - (b.d || 0))
  }, [filtered, tech, techs])

  const chooseTech = name => { setTech(name); setPicked(null); setMode(null) }
  const pickType = (name, key) => { setPicked({ src: 'type', tech: name, key }); setMode(null) }
  const pickPlan = d => { setPicked({ src: 'plan', tech: d.tech, date: d.date }); setMode(null) }

  const cat = picked?.key && CATS.find(c => c.key === picked.key)

  // Detail = same table as before
  const detailRows = picked
    ? filtered.filter(r =>
        r.electrician === picked.tech &&
        (!picked.key || r[picked.key] > 0) &&
        (!picked.date || r.date === picked.date))
    : []

  // View = bar chart Plan: how much New install / Maintenance / Reinstall
  const viewData = picked
    ? totalsOf(filtered.filter(r =>
        r.electrician === picked.tech && (!picked.date || r.date === picked.date)))
    : []

  const overview = totalsOf(filtered)
  const overviewSum = overview.reduce((n, c) => n + c.value, 0)

  return (
    <div className="shell">
      <aside className="side">
        <div className="brand">
          <a href='./' className="logo"><Icon d={ICONS.bolt} /></a>
          <b>ElectricHub</b>
        </div>

        <p className="side-label">Management</p>
        <button className={!tech ? 'nav on' : 'nav'} onClick={() => chooseTech(null)}>
          <Icon d={ICONS.dash} /> Dashboard
        </button>

        <p className="side-label">Electricians</p>
        <div className="nav-list">
          {techs.map(t => (
            <button key={t} className={tech === t ? 'nav on' : 'nav'} onClick={() => chooseTech(t)}>
              <Icon d={ICONS.users} /> {t}
            </button>
          ))}
        </div>

        <div className="workspace">
          <span className="logo sm"><Icon d={ICONS.bolt} /></span>
          <div><small>Workspace</small><b>Electric Plan</b></div>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="pill">
            <span className={error ? 'dot off' : 'dot'} />
            <b>Installations</b>
            <span className="muted">{tech || 'All electricians'}</span>
            <span className="updated">
              Last updated {updatedAt ? updatedAt.toLocaleTimeString() : '...'}
            </span>
          </div>
          <div className="dates">
            <label>From <input type="date" value={from} onChange={e => setFrom(e.target.value)} /></label>
            <label>To <input type="date" value={to} onChange={e => setTo(e.target.value)} /></label>
            <button className="apply" onClick={() => setRange({ from, to })}>Apply</button>
          </div>
        </header>

        {error && <p className="error" role="alert">{error}</p>}

        <div className="top-grid">
          <Card icon="chart" title="Plan" sub="Quantity by No. Select a bar for View or Detail."
                right={<div className="big"><b>{filtered.length}</b><span>jobs</span></div>}>
            {planData.length ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={planData} margin={{ top: 22, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 4" stroke="var(--line)" />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                  <Tooltip content={<DarkTip unit=" jobs" />} cursor={false} />
                  <Bar dataKey="value" radius={[8, 8, 0, 0]} cursor="pointer" maxBarSize={56}
                       onClick={pickPlan}>
                    <LabelList dataKey="value" position="top" />
                    {planData.map(d => {
                      const on = picked?.src === 'plan' && picked.tech === d.tech && picked.date === d.date
                      return <Cell key={d.label} className={on ? 'bar on' : 'bar'} />
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : <p className="hint">No data yet.</p>}
          </Card>

          <div className="stack">
            <Card icon="list" title="Job overview" sub="Spread across all job types">
              <p className="ov-total">Jobs <span>({overviewSum})</span></p>
              <div className="seg-bar">
                {overview.map(c => (
                  <i key={c.key} style={{ flexGrow: c.value || 0.001, background: c.color }} />
                ))}
              </div>
              <ul className="ov-list">
                {overview.map(c => (
                  <li key={c.key}>
                    <span><i style={{ background: c.color }} />{c.label}</span>
                    <b>{c.value}</b>
                  </li>
                ))}
              </ul>
            </Card>

            <Card icon="users" title="Top 3 New Install" sub="Electricians with the most new installs">
              {top3.length ? (
                <ol className="rank">
                  {top3.map((e, i) => (
                    <li key={e.name}>
                      <button onClick={() => chooseTech(e.name)} title={`Show ${e.name}`}>
                        <span className={'medal m' + (i + 1)}>{i + 1}</span>
                        <span className="rank-main">
                          <span className="rank-row"><b>{e.name}</b><span>{e.value}</span></span>
                          <span className="rank-track">
                            <i style={{ width: `${top3[0].value ? (e.value / top3[0].value) * 100 : 0}%` }} />
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ol>
              ) : <p className="hint">No data yet.</p>}
            </Card>
          </div>
        </div>

        <Card icon="bolt" title="Jobs by type" sub="Select a bar to see the plan or the job list.">
          <div className={groups.length > 1 ? 'grid' : ''}>
            {groups.map(g => (
              <div key={g.name} className={groups.length > 1 ? 'mini' : ''}>
                {groups.length > 1 && <h3>{g.name}</h3>}
                <ResponsiveContainer width="100%" height={groups.length > 1 ? 210 : 280}>
                  <BarChart data={g.totals} margin={{ top: 20, right: 8, left: -18, bottom: 0 }}>
                    <CartesianGrid vertical={false} strokeDasharray="3 4" stroke="var(--line)" />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} />
                    <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                    <Tooltip content={<DarkTip />} cursor={false} />
                    <Bar dataKey="value" radius={[8, 8, 0, 0]} cursor="pointer" maxBarSize={56}
                         onClick={d => pickType(g.name, d.key)}>
                      <LabelList dataKey="value" position="top" />
                      {g.totals.map(c => (
                        <Cell key={c.key} fill={c.color}
                          fillOpacity={picked?.src !== 'type' || (picked.tech === g.name && picked.key === c.key) ? 1 : 0.35} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ))}
            {!groups.length && <p className="hint">No data yet.</p>}
          </div>
        </Card>

        {picked && (
          <div className="choice" role="group" aria-label="Options">
            <span>{picked.tech}{cat ? `: ${cat.label}` : ''}{picked.date ? `: ${picked.date}` : ''}</span>
            <button className={mode === 'view' ? 'seg on' : 'seg'} onClick={() => setMode('view')}>View</button>
            <button className={mode === 'detail' ? 'seg on' : 'seg'} onClick={() => setMode('detail')}>Detail</button>
          </div>
        )}

        {mode === 'view' && (
          <Card icon="chart" title={`Plan: ${picked.tech}`}
                sub={picked.date ? `Date ${picked.date}` : 'New Install, Maintenance and Reinstall'}>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={viewData} margin={{ top: 22, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 4" stroke="var(--line)" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                <Tooltip content={<DarkTip />} cursor={false} />
                <Bar dataKey="value" radius={[8, 8, 0, 0]} maxBarSize={72}>
                  <LabelList dataKey="value" position="top" />
                  {viewData.map(c => <Cell key={c.key} fill={c.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Card>
        )}

        {mode === 'detail' && (
          <Card icon="list" title={`${picked.tech}${cat ? ': ' + cat.label : ''} jobs`}
                sub={`${detailRows.length} records`}>
            <div className="scroll">
              <table>
                <thead>
                  <tr>
                    <th>No</th><th>Date</th><th>Electrician</th><th>User</th>
                    <th>New Install</th><th>Maintenance</th><th>Reinstall</th><th>Province</th>
                  </tr>
                </thead>
                <tbody>
                  {detailRows.map((r, i) => (
                    <tr key={r.id}>
                      <td>{i + 1}</td><td>{r.date}</td><td>{r.electrician}</td><td>{r.user}</td>
                      <td>{r.N}</td><td>{r.S}</td><td>{r.R}</td>
                      <td><span className={'badge ' + (r.province === 'Yes' ? 'yes' : 'no')}>{r.province}</span></td>
                    </tr>
                  ))}
                  {!detailRows.length && <tr><td colSpan="8">No jobs match these filters.</td></tr>}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        <footer className="footer">
          <span>© {new Date().getFullYear()} Uta · Electric Plan Dashboard</span>
          <span>
            Data from Google Sheets · refreshes every 15 s
            {updatedAt ? ` · Last updated ${updatedAt.toLocaleTimeString()}` : ''}
          </span>
        </footer>
      </main>
    </div>
  )
}
