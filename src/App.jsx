import { useEffect, useMemo, useState } from 'react'
import Papa from 'papaparse'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LabelList, Cell,
  PieChart, Pie, Legend,
} from 'recharts'
import './app.css'

const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSkI-VKQaVlEKxB2uocirXJNIbJ1NTfO6JK28aOoqxYL6tV3eGK_vEtdZyaqQhKsmiKSq_h3ALBPr_E/pub?output=csv'

const CATS = [
  { key: 'N', label: 'New Install', color: '#4f46e5' },
  { key: 'S', label: 'Maintenance', color: '#e08a00' },
  { key: 'R', label: 'Reinstall', color: '#1f9d77' },
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

export default function App() {
  const [rows, setRows] = useState([])
  const [error, setError] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [range, setRange] = useState({ from: '', to: '' })
  const [tech, setTech] = useState(null)      // null = All electricians
  const [picked, setPicked] = useState(null)  // { tech, key }
  const [mode, setMode] = useState(null)      // 'view' | 'detail'

useEffect(() => {
  const load = async () => {
    try {
      const res = await fetch(`${CSV_URL}&_=${Date.now()}`, { cache: 'no-store' })
      if (!res.ok) throw new Error('HTTP ' + res.status)
      setRows(parse(await res.text()))
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

  // All selected -> one chart per electrician. One selected -> one chart.
  const groups = useMemo(
    () => (tech ? [tech] : techs).map(name => ({
      name,
      totals: totalsOf(filtered.filter(r => r.electrician === name)),
    })),
    [filtered, tech, techs])

  const chooseTech = name => { setTech(name); setPicked(null); setMode(null) }
  const pickBar = (name, key) => { setPicked({ tech: name, key }); setMode(null) }

  const cat = picked && CATS.find(c => c.key === picked.key)
  const detailRows = picked
    ? filtered.filter(r => r.electrician === picked.tech && r[picked.key] > 0)
    : []
  const pieData = totalsOf(
    filtered.filter(r => !picked || r.electrician === picked.tech)
  ).filter(c => c.value > 0)

  return (
    <main className="page">
      <header className="filters">
        <h1>Installations</h1>
        <div className="dates">
          <label>From <input type="date" value={from} onChange={e => setFrom(e.target.value)} /></label>
          <label>To <input type="date" value={to} onChange={e => setTo(e.target.value)} /></label>
          <button className="apply" onClick={() => setRange({ from, to })}>Apply</button>
        </div>
      </header>

      <nav className="chips" aria-label="Electrician">
        <button className={!tech ? 'chip on' : 'chip'} onClick={() => chooseTech(null)}>All</button>
        {techs.map(t => (
          <button key={t} className={tech === t ? 'chip on' : 'chip'} onClick={() => chooseTech(t)}>{t}</button>
        ))}
      </nav>

      {error && <p className="error" role="alert">{error}</p>}

      <section className="panel">
        <h2>Jobs by type</h2>
        <p className="hint">Select a bar to see the share or the job list.</p>

        <div className={groups.length > 1 ? 'grid' : ''}>
          {groups.map(g => (
            <div key={g.name} className={groups.length > 1 ? 'card' : ''}>
              {groups.length > 1 && <h3>{g.name}</h3>}
              <ResponsiveContainer width="100%" height={groups.length > 1 ? 220 : 300}>
                <BarChart data={g.totals} margin={{ top: 20, right: 8, left: -16, bottom: 0 }}>
                  <XAxis dataKey="label" tickLine={false} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                  <Tooltip cursor={{ fill: 'rgba(0,0,0,.04)' }} />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]} cursor="pointer"
                       onClick={d => pickBar(g.name, d.key)}>
                    <LabelList dataKey="value" position="top" />
                    {g.totals.map(c => (
                      <Cell key={c.key} fill={c.color}
                        fillOpacity={!picked || (picked.tech === g.name && picked.key === c.key) ? 1 : 0.35} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ))}
          {!groups.length && <p className="hint">No data yet.</p>}
        </div>

        {picked && (
          <div className="choice" role="group" aria-label="Options">
            <span>{picked.tech}: {cat.label}</span>
            <button className={mode === 'view' ? 'seg on' : 'seg'} onClick={() => setMode('view')}>View</button>
            <button className={mode === 'detail' ? 'seg on' : 'seg'} onClick={() => setMode('detail')}>Detail</button>
          </div>
        )}
      </section>

      {mode === 'view' && (
        <section className="panel">
          <h2>Share of jobs: {picked.tech}</h2>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie data={pieData} dataKey="value" nameKey="label" outerRadius={110}
                   label={({ name, value }) => `${name}: ${value}`}>
                {pieData.map(c => <Cell key={c.key} fill={c.color} />)}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </section>
      )}

      {mode === 'detail' && (
        <section className="panel">
          <h2>{picked.tech}: {cat.label} jobs</h2>
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
        </section>
      )}
    </main>
  )
}
