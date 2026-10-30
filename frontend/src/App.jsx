import React, {useCallback, useEffect, useMemo, useState} from 'react'
import {
  BookOpen, LayoutDashboard, Armchair, CalendarDays, Bell, ShieldCheck,
  LogOut, Menu, X, Clock3, CheckCircle2, AlertCircle, Users, Activity,
  Fingerprint, CreditCard, RefreshCw, ChevronRight, Search, Settings,
  DoorOpen, CalendarCheck, CircleHelp, Wifi
} from 'lucide-react'
import {api, fmt, toLocalInput} from './api'

const cls = (...a)=>a.filter(Boolean).join(' ')
function Toast({toast}) { return toast ? <div className="toast">{toast}</div> : null }
function Status({status}) {
  const map={AVAILABLE:'green',RESERVED:'amber',OCCUPIED:'red',OVERDUE:'red',CANCELLED:'gray',COMPLETED:'gray',UNAVAILABLE:'gray'}
  return <span className={`status ${map[status]||'gray'}`}><i/> {status}</span>
}
function App(){
  const [user,setUser]=useState(null), [page,setPage]=useState('dashboard'), [mobileOpen,setMobileOpen]=useState(false)
  const [toast,setToast]=useState(''), [loading,setLoading]=useState(false)
  const [seats,setSeats]=useState([]), [bookings,setBookings]=useState([]), [notifications,setNotifications]=useState([])
  const [overview,setOverview]=useState(null), [adminBookings,setAdminBookings]=useState([]), [attendance,setAttendance]=useState([])
  const [selectedSeat,setSelectedSeat]=useState(null), [start,setStart]=useState(''), [end,setEnd]=useState('')
  const [filterDate,setFilterDate]=useState(''), [search,setSearch]=useState('')
  const [loginId,setLoginId]=useState('102'), [password,setPassword]=useState('Student@123')
  const [renewEnd,setRenewEnd]=useState('')

  const flash=msg=>{setToast(msg);setTimeout(()=>setToast(''),3500)}
  const loadStudent=useCallback(async()=>{
    const [s,b,n]=await Promise.all([api('/seats'),api('/bookings'),api('/notifications')])
    setSeats(s.seats);setBookings(b.bookings);setNotifications(n.notifications)
  },[])
  const loadAdmin=useCallback(async()=>{
    const [o,b,a]=await Promise.all([api('/admin/overview'),api('/admin/bookings'),api('/admin/attendance')])
    setOverview(o);setAdminBookings(b.bookings);setAttendance(a.events)
  },[])
  const boot=useCallback(async()=>{
    try{
      const m=await api('/auth/me')
      if(m.user){setUser(m.user); if(m.user.role==='admin') await loadAdmin(); else await loadStudent()}
    }catch(e){console.error(e)}
  },[loadAdmin,loadStudent])
  useEffect(()=>{boot()},[boot])
  useEffect(()=>{
    if(!user)return
    const id=setInterval(async()=>{
      try{
        if(user.role==='admin') await loadAdmin()
        else {
          const before=notifications.length
          await loadStudent()
          const n=await api('/notifications')
          if(n.notifications.length>before) {
            const newest=n.notifications[0]
            if(newest.kind==='RENEWAL' && 'Notification' in window && Notification.permission==='granted')
              new Notification(newest.title,{body:newest.message})
          }
          setNotifications(n.notifications)
        }
      }catch(e){console.error(e)}
    },10000)
    return ()=>clearInterval(id)
  },[user,loadStudent,loadAdmin,notifications.length])

  const login=async e=>{
    e.preventDefault();setLoading(true)
    try{const r=await api('/auth/login',{method:'POST',body:JSON.stringify({student_id:loginId,password})});setUser(r.user);setPage('dashboard');r.user.role==='admin'?await loadAdmin():await loadStudent();flash(`Welcome, ${r.user.name}`)}
    catch(e){flash(e.message)}finally{setLoading(false)}
  }
  const logout=async()=>{await api('/auth/logout',{method:'POST'});setUser(null);setPage('dashboard');setMobileOpen(false)}
  const refresh=async()=>{user.role==='admin'?await loadAdmin():await loadStudent()}
  const currentBooking=bookings.find(b=>['RESERVED','OCCUPIED','OVERDUE'].includes(b.status))
  const unread=notifications.filter(n=>!n.is_read).length
  const activePage=page

  const book=async e=>{
    e.preventDefault()
    if(!selectedSeat)return flash('Select an available seat first.')
    try{await api('/bookings',{method:'POST',body:JSON.stringify({seat_id:selectedSeat,start_at:start,end_at:end})});flash(`${selectedSeat} reserved successfully.`);setSelectedSeat(null);await loadStudent()}
    catch(e){flash(e.message)}
  }
  const checkin=async()=>{try{const r=await api('/checkin',{method:'POST',body:'{}'});flash(r.message);await loadStudent()}catch(e){flash(e.message)}}
  const checkout=async()=>{try{const r=await api('/checkout',{method:'POST',body:'{}'});flash(r.message);await loadStudent()}catch(e){flash(e.message)}}
  const renew=async()=>{if(!currentBooking)return;try{const r=await api(`/bookings/${currentBooking.id}/renew`,{method:'POST',body:JSON.stringify({new_end_at:renewEnd})});flash(r.message);setRenewEnd('');await loadStudent()}catch(e){flash(e.message)}}
  const cancel=async id=>{try{await api(`/bookings/${id}/cancel`,{method:'POST',body:'{}'});flash('Reservation cancelled.');await loadStudent()}catch(e){flash(e.message)}}
  const markRead=async id=>{try{await api(`/notifications/${id}/read`,{method:'POST',body:'{}'});await loadStudent()}catch(e){flash(e.message)}}
  const askNotifications=async()=>{if('Notification'in window){const p=await Notification.requestPermission();flash(p==='granted'?'Browser notifications enabled.':'Browser notifications not enabled.')}else flash('Browser notifications are not supported here.')}

  const setDefaultTimes=()=>{
    const d=new Date();d.setMinutes(0,0,0);d.setHours(d.getHours()+1)
    const e=new Date(d);e.setHours(e.getHours()+1)
    setStart(toLocalInput(d));setEnd(toLocalInput(e))
  }
  useEffect(()=>{setDefaultTimes()},[])
  const navStudent=[
    ['dashboard','Overview',LayoutDashboard],['book','Book a seat',Armchair],['bookings','My bookings',CalendarDays],['notifications','Notifications',Bell]
  ]
  const navAdmin=[['dashboard','Overview',LayoutDashboard],['admin-bookings','Bookings',CalendarDays],['attendance','Attendance',Activity],['students','Students',Users],['admin-seats','Seat management',Armchair]]
  const nav=user?.role==='admin'?navAdmin:navStudent

  if(!user)return <div className="login-shell"><div className="login-art"><div className="brand"><span className="brand-icon"><BookOpen/></span><span>LIBRARY<span className="brand-light">FLOW</span></span></div><div className="login-message"><span className="eyebrow">SMART CAMPUS EXPERIENCE</span><h1>Your space to<br/><em>focus and grow.</em></h1><p>Reserve your library seat before you arrive. Check in with your campus ID or fingerprint, and make every study hour count.</p><div className="login-pills"><span><Armchair size={15}/> Live seat availability</span><span><Clock3 size={15}/> Flexible time slots</span></div></div><div className="login-footer">SMART LIBRARY MANAGEMENT SYSTEM · 2026</div></div><div className="login-side"><form className="login-card" onSubmit={login}><div className="mobile-brand"><BookOpen/> LIBRARYFLOW</div><span className="eyebrow">WELCOME BACK</span><h2>Sign in to your account</h2><p className="muted">Use your student ID or administrator account.</p><label>Student ID / Email<input value={loginId} onChange={e=>setLoginId(e.target.value)} placeholder="Enter your ID" required/></label><label>Password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Enter password" required/></label><button className="btn primary full" disabled={loading}>{loading?'Signing in…':'Sign in'} <ChevronRight size={17}/></button><div className="demo-box"><strong>Demo accounts</strong><span>Student: <b>102</b> / <b>Student@123</b></span><span>Admin: <b>admin</b> / <b>Admin@123</b></span></div><p className="tiny muted">Prototype authentication. Change demo passwords before deployment.</p></form></div><Toast toast={toast}/></div>

  return <div className="app-shell">
    {mobileOpen&&<div className="mobile-scrim" onClick={()=>setMobileOpen(false)}/>}
    <aside className={cls('sidebar',mobileOpen&&'open')}>
      <div className="brand"><span className="brand-icon"><BookOpen/></span><span>LIBRARY<span className="brand-light">FLOW</span></span><button className="icon-btn close-menu" onClick={()=>setMobileOpen(false)}><X/></button></div>
      <div className="workspace-label">{user.role==='admin'?'ADMIN WORKSPACE':'STUDENT WORKSPACE'}</div>
      <nav>{nav.map(([key,label,Icon])=><button key={key} className={cls('nav-item',page===key&&'active')} onClick={()=>{setPage(key);setMobileOpen(false)}}><Icon size={18}/><span>{label}</span>{key==='notifications'&&unread>0&&<b className="nav-count">{unread}</b>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="help-card"><div className="help-icon"><CircleHelp size={17}/></div><strong>Need help?</strong><p>Ask the library desk for assistance with your account or booking.</p></div><div className="profile"><div className="avatar">{user.name.split(' ').map(x=>x[0]).slice(0,2).join('')}</div><div className="profile-text"><strong>{user.name}</strong><span>{user.role==='admin'?'Administrator':`ID: ${user.student_id}`}</span></div><button className="icon-btn" title="Log out" onClick={logout}><LogOut size={17}/></button></div></div>
    </aside>
    <main className="main-area">
      <header className="topbar"><button className="icon-btn mobile-menu" onClick={()=>setMobileOpen(true)}><Menu/></button><div className="crumb">Library / <b>{nav.find(x=>x[0]===page)?.[1]||'Overview'}</b></div><div className="top-actions"><span className="live-indicator"><i/> System live</span><button className="icon-btn notification-top" onClick={()=>setPage(user.role==='admin'?'admin-bookings':'notifications')}><Bell size={19}/>{unread>0&&<i className="notify-dot"/>}</button><div className="top-avatar">{user.name[0]}</div></div></header>
      <div className="content">
        {user.role==='student'&&page==='dashboard'&&<StudentDashboard user={user} seats={seats} bookings={bookings} current={currentBooking} onNavigate={setPage} onCheckin={checkin} onCheckout={checkout}/>}
        {user.role==='student'&&page==='book'&&<BookPage seats={seats} selected={selectedSeat} setSelected={setSelectedSeat} start={start} setStart={setStart} end={end} setEnd={setEnd} onSubmit={book} onDefault={setDefaultTimes}/>}
        {user.role==='student'&&page==='bookings'&&<BookingsPage bookings={bookings} onCancel={cancel}/>}
        {user.role==='student'&&page==='notifications'&&<NotificationsPage notifications={notifications} onRead={markRead} onPermission={askNotifications}/>}
        {user.role==='student'&&page==='dashboard'&&currentBooking&&['OCCUPIED','OVERDUE'].includes(currentBooking.status)&&<RenewalPanel booking={currentBooking} renewEnd={renewEnd} setRenewEnd={setRenewEnd} onRenew={renew} onLeave={checkout}/>}
        {user.role==='admin'&&page==='dashboard'&&<AdminDashboard overview={overview} bookings={adminBookings} attendance={attendance}/>}
        {user.role==='admin'&&page==='admin-bookings'&&<AdminBookings bookings={adminBookings}/>}
        {user.role==='admin'&&page==='attendance'&&<AttendancePage events={attendance}/>}
        {user.role==='admin'&&page==='students'&&<StudentsPage/>}
        {user.role==='admin'&&page==='admin-seats'&&<AdminSeats seats={seats} refresh={refresh} flash={flash}/>}
      </div>
      <footer className="footer"><span>© 2026 LibraryFlow · Smart Library System</span><span><ShieldCheck size={13}/> Secure campus access</span></footer>
    </main>
    <Toast toast={toast}/>
  </div>
}

function PageHeading({eyebrow,title,description,action}){return <div className="page-heading"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{action}</div>}
function StudentDashboard({user,seats,bookings,current,onNavigate,onCheckin,onCheckout}){
  const available=seats.filter(s=>s.status==='AVAILABLE').length
  const next=bookings.find(b=>b.status==='RESERVED'&&new Date(b.start_at)>new Date())
  return <><PageHeading eyebrow="STUDENT PORTAL" title={`Good day, ${user.name.split(' ')[0]}`} description="Here’s your library activity at a glance." action={<button className="btn primary" onClick={()=>onNavigate('book')}><Armchair size={17}/> Reserve a seat</button>}/>
    <div className="stats-grid"><Stat icon={Armchair} label="Available seats" value={available} sub="Available right now" color="green"/><Stat icon={CalendarCheck} label="My reservations" value={bookings.filter(b=>['RESERVED','OCCUPIED','OVERDUE'].includes(b.status)).length} sub="Active and upcoming" color="blue"/><Stat icon={Clock3} label="Hours booked" value={bookings.filter(b=>b.status==='COMPLETED').length+'+'} sub="Completed sessions" color="purple"/></div>
    <div className="dashboard-grid"><section className="card current-card"><div className="card-head"><div><span className="eyebrow">YOUR CURRENT SESSION</span><h3>{current?`Seat ${current.seat_id}`:'No active session'}</h3></div>{current&&<Status status={current.status}/>}</div>{current?<><div className="session-time"><div><span>START</span><b>{fmt(current.start_at)}</b></div><div className="time-line"/><div><span>END</span><b>{fmt(current.end_at)}</b></div></div>{current.status==='RESERVED'?<div className="info-strip amber"><Clock3 size={17}/><span>Check in within 15 minutes after your booking start time.</span></div>:<div className="info-strip green"><CheckCircle2 size={17}/><span>Your seat is assigned. Remember to scan your ID or fingerprint when leaving.</span></div>}{current.status==='RESERVED'?<button className="btn primary" onClick={onCheckin}><Fingerprint size={17}/> Simulate check-in scan</button>:<button className="btn outline" onClick={onCheckout}><DoorOpen size={17}/> Simulate exit scan</button>}</>:<div className="empty-state"><div className="empty-icon"><Armchair/></div><p>You don't have a current reservation.</p><button className="btn primary" onClick={()=>onNavigate('book')}>Find a seat</button></div>}</section>
      <section className="card quick-card"><div className="card-head"><div><span className="eyebrow">QUICK OVERVIEW</span><h3>Library floor</h3></div><span className="soft-label">10 seats</span></div><div className="mini-seat-grid">{seats.map(s=><div key={s.seat_id} className={`mini-seat ${s.status.toLowerCase()}`} title={`${s.seat_id}: ${s.status}`}>{s.seat_id.replace('A','')}</div>)}</div><div className="mini-legend"><span><i className="green-dot"/> Available</span><span><i className="amber-dot"/> Reserved</span><span><i className="red-dot"/> Occupied</span></div><button className="text-link" onClick={()=>onNavigate('book')}>View seat availability <ChevronRight size={15}/></button></section></div>
    <section className="card table-card"><div className="card-head"><div><span className="eyebrow">RECENT ACTIVITY</span><h3>Recent bookings</h3></div><button className="text-link" onClick={()=>onNavigate('bookings')}>View all <ChevronRight size={15}/></button></div><BookingTable bookings={bookings.slice(0,5)}/></section>
  </>
}
function Stat({icon:Icon,label,value,sub,color}){return <div className="stat-card"><div className={`stat-icon ${color}`}><Icon size={19}/></div><div><span>{label}</span><strong>{value}</strong><small>{sub}</small></div></div>}
function BookPage({seats,selected,setSelected,start,setStart,end,setEnd,onSubmit,onDefault}){
  const [slotSeats,setSlotSeats]=useState(seats)
  useEffect(()=>{
    if(!start || !end) return
    api(`/seats?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`)
      .then(r=>setSlotSeats(r.seats)).catch(()=>setSlotSeats(seats))
  },[start,end])
  useEffect(()=>{setSlotSeats(seats)},[seats])
  useEffect(()=>{if(selected && !slotSeats.some(s=>s.seat_id===selected && s.status==='AVAILABLE')) setSelected(null)},[slotSeats])
  return <><PageHeading eyebrow="RESERVATIONS" title="Find your study seat" description="Choose a time slot to see which seats are available."/><div className="booking-layout"><section className="card"><div className="card-head"><div><span className="eyebrow">SEAT MAP</span><h3>Library floor · Zone A</h3></div><span className="soft-label">10 seats</span></div><div className="seat-legend"><span><i className="green-dot"/> Available</span><span><i className="amber-dot"/> Reserved</span><span><i className="red-dot"/> Occupied</span></div><div className="seat-grid">{slotSeats.map(s=><button key={s.seat_id} disabled={s.status!=='AVAILABLE'} onClick={()=>setSelected(s.seat_id)} className={cls('seat-tile',s.status.toLowerCase(),selected===s.seat_id&&'selected')}><Armchair size={20}/><b>{s.seat_id}</b><small>{s.status==='AVAILABLE'?'Available':s.status==='RESERVED'?'Reserved':'Occupied'}</small></button>)}</div><div className="floor-label"><span/> WALKWAY <span/></div></section><section className="card booking-form-card"><span className="eyebrow">BOOK A SEAT</span><h3>Reservation details</h3><p className="muted">Select a date and time. Your seat will be held for a 15-minute check-in window after the start time.</p><form onSubmit={onSubmit}><label>Start date & time<input type="datetime-local" value={start} onChange={e=>setStart(e.target.value)} required/></label><label>End date & time<input type="datetime-local" value={end} onChange={e=>setEnd(e.target.value)} required/></label><div className="selected-seat-box"><div className="selected-icon"><Armchair/></div><div><small>SELECTED SEAT</small><b>{selected||'Choose a seat'}</b></div><span className={selected?'selection-ready':''}>{selected?'Ready':'Required'}</span></div><button className="btn primary full" disabled={!selected}>Confirm reservation <ChevronRight size={17}/></button><p className="tiny muted">Maximum booking duration: 4 hours. Overlapping reservations are blocked.</p></form></section></div></>
}
function BookingsPage({bookings,onCancel}){return <><PageHeading eyebrow="MY LIBRARY" title="My bookings" description="Track your upcoming sessions and past library visits."/><div className="card table-card"><BookingTable bookings={bookings} onCancel={onCancel} showCancel/></div></>}
function BookingTable({bookings,onCancel,showCancel=false}){return <div className="table-wrap"><table><thead><tr><th>SEAT</th><th>DATE & TIME</th><th>STATUS</th>{showCancel&&<th>ACTION</th>}</tr></thead><tbody>{bookings.length?bookings.map(b=><tr key={b.id}><td><b>{b.seat_id}</b><small>Booking #{b.id}</small></td><td>{fmt(b.start_at)}<small>Until {fmt(b.end_at)}</small></td><td><Status status={b.status}/></td>{showCancel&&<td>{b.status==='RESERVED'&&new Date(b.start_at)>new Date()?<button className="table-action" onClick={()=>onCancel(b.id)}>Cancel</button>:'—'}</td>}</tr>):<tr><td colSpan={showCancel?4:3} className="empty-cell">No bookings to display.</td></tr>}</tbody></table></div>}
function RenewalPanel({booking,renewEnd,setRenewEnd,onRenew,onLeave}){const suggested=new Date(booking.end_at);suggested.setHours(suggested.getHours()+1);const suggestedVal=toLocalInput(suggested);return <section className="renewal-card"><div className="renewal-symbol"><Bell/></div><div className="renewal-copy"><span className="eyebrow">EXTEND YOUR STUDY SESSION</span><h3>Want to stay a little longer?</h3><p>Your booking for {booking.seat_id} ends at {fmt(booking.end_at)}. Renew if the next time slot is free, or scan your ID/fingerprint when leaving.</p><div className="renew-controls"><label>New end time<input type="datetime-local" min={booking.end_at} value={renewEnd||suggestedVal} onChange={e=>setRenewEnd(e.target.value)}/></label><button className="btn primary" onClick={onRenew}><RefreshCw size={16}/> Book again</button><button className="btn outline" onClick={onLeave}><DoorOpen size={16}/> I'm leaving</button></div></div></section>}
function NotificationsPage({notifications,onRead,onPermission}){return <><PageHeading eyebrow="UPDATES" title="Notifications" description="Booking confirmations, reminders and library activity." action={<button className="btn outline" onClick={onPermission}><Bell size={16}/> Enable browser alerts</button>}/><div className="notification-list">{notifications.length?notifications.map(n=><div className={cls('notification-item',!n.is_read&&'unread')} key={n.id}><div className={`notification-icon ${n.kind.toLowerCase()}`}><Bell size={18}/></div><div className="notification-body"><div className="notification-title">{n.title}<span>{fmt(n.created_at)}</span></div><p>{n.message}</p></div>{!n.is_read&&<button className="text-link" onClick={()=>onRead(n.id)}>Mark read</button>}</div>):<div className="card empty-state">You're all caught up. No notifications yet.</div>}</div></>}
function AdminDashboard({overview,bookings,attendance}){return <><PageHeading eyebrow="ADMINISTRATION" title="Library overview" description="Monitor seat usage, reservations and student activity."/><div className="stats-grid admin-stats"><Stat icon={Armchair} label="Total seats" value={overview?.total_seats??10} sub="Active library seats" color="blue"/><Stat icon={CheckCircle2} label="Available" value={overview?.available??'—'} sub="Ready to reserve" color="green"/><Stat icon={CalendarDays} label="Reserved" value={overview?.reserved??'—'} sub="Awaiting check-in" color="purple"/><Stat icon={Users} label="Occupied" value={overview?.occupied??'—'} sub="Checked-in students" color="red"/></div><div className="dashboard-grid"><section className="card"><div className="card-head"><div><span className="eyebrow">LIVE MONITORING</span><h3>Seat utilization</h3></div><Activity size={18} className="muted"/></div><div className="utilization"><strong>{overview?.total_seats?Math.round((overview.occupied/overview.total_seats)*100):0}%</strong><span>currently occupied</span></div><div className="progress"><i style={{width:`${overview?.total_seats?overview.occupied/overview.total_seats*100:0}%`}}/></div><div className="util-row"><span>Overdue sessions</span><b className="danger-text">{overview?.overdue??0}</b></div><div className="util-row"><span>Registered students</span><b>{overview?.students??0}</b></div></section><section className="card"><div className="card-head"><div><span className="eyebrow">LATEST ACTIVITY</span><h3>Recent attendance</h3></div></div>{attendance.slice(0,5).map(e=><div className="activity-row" key={e.id}><div className={`activity-icon ${e.event==='ENTRY'?'green':'blue'}`}>{e.event==='ENTRY'?<Fingerprint size={16}/>:<DoorOpen size={16}/>}</div><div><b>{e.student_id}</b><small>{e.event} · {e.method}</small></div><time>{fmt(e.occurred_at)}</time></div>)}</section></div><section className="card table-card"><div className="card-head"><div><span className="eyebrow">RESERVATION LOG</span><h3>Latest bookings</h3></div></div><BookingTable bookings={bookings.slice(0,6)}/></section></>}
function AdminBookings({bookings}){return <><PageHeading eyebrow="ADMINISTRATION" title="All bookings" description="Review current and historical seat reservations."/><div className="card table-card"><BookingTable bookings={bookings} showCancel={false}/></div></>}
function AttendancePage({events}){return <><PageHeading eyebrow="ADMINISTRATION" title="Attendance records" description="Verified entry and exit events from RFID and fingerprint scans."/><div className="card table-card"><div className="table-wrap"><table><thead><tr><th>STUDENT</th><th>EVENT</th><th>METHOD</th><th>TIME</th><th>RESULT</th></tr></thead><tbody>{events.map(e=><tr key={e.id}><td><b>{e.student_id}</b></td><td>{e.event}</td><td>{e.method}</td><td>{fmt(e.occurred_at)}</td><td><Status status={e.result==='SUCCESS'?'OCCUPIED':'CANCELLED'}/></td></tr>)}</tbody></table></div></div></>}
function StudentsPage(){const [students,setStudents]=useState([]);useEffect(()=>{api('/admin/students').then(r=>setStudents(r.students)).catch(console.error)},[]);return <><PageHeading eyebrow="ADMINISTRATION" title="Students" description="Registered students and their linked authentication credentials."/><div className="card table-card"><div className="table-wrap"><table><thead><tr><th>STUDENT</th><th>STUDENT ID</th><th>EMAIL</th><th>ROLE</th></tr></thead><tbody>{students.map(s=><tr key={s.student_id}><td><b>{s.name}</b></td><td>{s.student_id}</td><td>{s.email}</td><td>Student</td></tr>)}</tbody></table></div></div></>}
function AdminSeats({seats,refresh,flash}){const toggle=async id=>{try{const r=await api(`/admin/seats/${id}/toggle`,{method:'POST',body:'{}'});flash(`${id} is now ${r.is_active?'active':'inactive'}.`);await refresh()}catch(e){flash(e.message)}};return <><PageHeading eyebrow="ADMINISTRATION" title="Seat management" description="Temporarily disable seats that are under maintenance."/><div className="card"><div className="seat-admin-grid">{seats.map(s=><div className="seat-admin-item" key={s.seat_id}><div><b>{s.seat_id}</b><small>{s.is_active?'Active':'Maintenance'}</small></div><button className={s.is_active?'btn outline small':'btn primary small'} onClick={()=>toggle(s.seat_id)}>{s.is_active?'Disable':'Enable'}</button></div>)}</div></div></>}
export default App
