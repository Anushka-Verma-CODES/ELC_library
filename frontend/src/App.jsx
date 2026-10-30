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
  const [loginId,setLoginId]=useState(''), [password,setPassword]=useState('')
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

  if(!user)return <div className="login-shell"><form className="login-card" onSubmit={login}><h1>Smart Library</h1><p className="muted">Sign in to continue.</p><label>Student ID or email<input value={loginId} onChange={e=>setLoginId(e.target.value)} placeholder="Enter your ID or email" autoComplete="username" required/></label><label>Password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Enter your password" autoComplete="current-password" required/></label><button className="btn primary full" disabled={loading}>{loading?'Signing in…':'Sign in'}</button></form><Toast toast={toast}/></div>

  return <div className="app-shell">
    {mobileOpen&&<div className="mobile-scrim" onClick={()=>setMobileOpen(false)}/>}
    <aside className={cls('sidebar',mobileOpen&&'open')}>
      <div className="brand"><span className="brand-icon"><BookOpen/></span><span>LIBRARY<span className="brand-light">FLOW</span></span><button className="icon-btn close-menu" onClick={()=>setMobileOpen(false)}><X/></button></div>
      <div className="workspace-label">{user.role==='admin'?'ADMIN WORKSPACE':'STUDENT WORKSPACE'}</div>
      <nav>{nav.map(([key,label,Icon])=><button key={key} className={cls('nav-item',page===key&&'active')} onClick={()=>{setPage(key);setMobileOpen(false)}}><Icon size={18}/><span>{label}</span>{key==='notifications'&&unread>0&&<b className="nav-count">{unread}</b>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="profile"><div className="avatar">{user.name.split(' ').map(x=>x[0]).slice(0,2).join('')}</div><div className="profile-text"><strong>{user.name}</strong><span>{user.role==='admin'?'Administrator':`ID: ${user.student_id}`}</span></div><button className="icon-btn" title="Log out" onClick={logout}><LogOut size={17}/></button></div></div>
    </aside>
    <main className="main-area">
      <header className="topbar"><button className="icon-btn mobile-menu" aria-label="Open menu" onClick={()=>setMobileOpen(true)}><Menu/></button><div className="crumb">{nav.find(x=>x[0]===page)?.[1]||'Overview'}</div><div className="top-actions">{user.role==='student'&&<button className="icon-btn notification-top" aria-label="Notifications" onClick={()=>setPage('notifications')}><Bell size={19}/>{unread>0&&<i className="notify-dot"/>}</button>}</div></header>
      <div className="content">
        {user.role==='student'&&page==='dashboard'&&<StudentDashboard user={user} seats={seats} current={currentBooking} onNavigate={setPage} onCheckin={checkin} onCheckout={checkout}/>}
        {user.role==='student'&&page==='book'&&<BookPage seats={seats} selected={selectedSeat} setSelected={setSelectedSeat} start={start} setStart={setStart} end={end} setEnd={setEnd} onSubmit={book} onDefault={setDefaultTimes}/>}
        {user.role==='student'&&page==='bookings'&&<BookingsPage bookings={bookings} onCancel={cancel}/>}
        {user.role==='student'&&page==='notifications'&&<NotificationsPage notifications={notifications} onRead={markRead} onPermission={askNotifications}/>}
        {user.role==='student'&&page==='dashboard'&&currentBooking&&['OCCUPIED','OVERDUE'].includes(currentBooking.status)&&<RenewalPanel booking={currentBooking} renewEnd={renewEnd} setRenewEnd={setRenewEnd} onRenew={renew} onLeave={checkout}/>}
        {user.role==='admin'&&page==='dashboard'&&<AdminDashboard overview={overview}/>}
        {user.role==='admin'&&page==='admin-bookings'&&<AdminBookings bookings={adminBookings}/>}
        {user.role==='admin'&&page==='attendance'&&<AttendancePage events={attendance}/>}
        {user.role==='admin'&&page==='students'&&<StudentsPage/>}
        {user.role==='admin'&&page==='admin-seats'&&<AdminSeats seats={seats} refresh={refresh} flash={flash}/>}
      </div>
      <footer className="footer"><span>Smart Library</span></footer>
    </main>
    <Toast toast={toast}/>
  </div>
}

function PageHeading({title,action}){return <div className="page-heading"><h1>{title}</h1>{action}</div>}
function StudentDashboard({user,seats,current,onNavigate,onCheckin,onCheckout}){
  const available=seats.filter(s=>s.status==='AVAILABLE').length
  const statusLabel=current?.status==='RESERVED'?'Reserved':current?.status==='OVERDUE'?'Overdue':current?.status==='OCCUPIED'?'Checked in':'No active booking'
  const checkInStart=current?.status==='RESERVED'?new Date(current.start_at):null
  const checkInAvailable=!!checkInStart&&Date.now()>=checkInStart.getTime()&&Date.now()<=checkInStart.getTime()+15*60*1000
  return <><PageHeading title={`Hello, ${user.name.split(' ')[0]}`}/><section className="card simple-status-card"><div className="simple-status-head"><div><span className="simple-label">BOOKING STATUS</span><h2 className={`simple-state ${current?current.status.toLowerCase():'gray'}`}>{statusLabel}</h2></div></div>{current?<div className="simple-booking-details"><div><span>SEAT</span><strong>{current.seat_id}</strong></div><div><span>START</span><strong>{fmt(current.start_at)}</strong></div><div><span>END</span><strong>{fmt(current.end_at)}</strong></div></div>:<p className="muted">No current booking.</p>}{checkInAvailable&&<button className="btn primary" onClick={onCheckin}>Check in</button>}{current?.status==='RESERVED'&&!checkInAvailable&&<p className="booking-hint">{Date.now()<checkInStart.getTime()?`Check-in opens at ${fmt(current.start_at)}.`:'Check-in window has passed.'}</p>}{current&&['OCCUPIED','OVERDUE'].includes(current.status)&&<button className="btn outline" onClick={onCheckout}>Check out</button>}{!current&&<button className="btn primary" onClick={()=>onNavigate('book')}>Book a seat</button>}</section><div className="simple-availability"><span><strong>{available}</strong> seats available</span><button className="text-link" onClick={()=>onNavigate('book')}>View seats <ChevronRight size={15}/></button></div></>
}
function Stat({label,value,color}){return <div className={`stat-card simple-stat ${color||''}`}><span>{label}</span><strong>{value}</strong></div>}
function BookPage({seats,selected,setSelected,start,setStart,end,setEnd,onSubmit,onDefault}){
  const [slotSeats,setSlotSeats]=useState(seats)
  useEffect(()=>{
    if(!start || !end) return
    api(`/seats?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`)
      .then(r=>setSlotSeats(r.seats)).catch(()=>setSlotSeats(seats))
  },[start,end])
  useEffect(()=>{setSlotSeats(seats)},[seats])
  useEffect(()=>{if(selected && !slotSeats.some(s=>s.seat_id===selected && s.status==='AVAILABLE')) setSelected(null)},[slotSeats])
  return <><PageHeading title="Book a seat"/><div className="booking-layout"><section className="card"><div className="card-head"><h3>Seats</h3></div><div className="seat-legend"><span><i className="green-dot"/> Available</span><span><i className="amber-dot"/> Reserved</span><span><i className="red-dot"/> Occupied</span></div><div className="seat-grid">{slotSeats.map(s=><button key={s.seat_id} disabled={s.status!=='AVAILABLE'} onClick={()=>setSelected(s.seat_id)} className={cls('seat-tile',s.status.toLowerCase(),selected===s.seat_id&&'selected')}><Armchair size={20}/><b>{s.seat_id}</b><small>{s.status==='AVAILABLE'?'Available':s.status==='RESERVED'?'Reserved':'Occupied'}</small></button>)}</div><div className="floor-label"><span/> WALKWAY <span/></div></section><section className="card booking-form-card"><h3>Reservation</h3><form onSubmit={onSubmit}><label>Start date & time<input type="datetime-local" value={start} onChange={e=>setStart(e.target.value)} required/></label><label>End date & time<input type="datetime-local" value={end} onChange={e=>setEnd(e.target.value)} required/></label><div className="selected-seat-box"><div className="selected-icon"><Armchair/></div><div><small>SEAT</small><b>{selected||'Choose a seat'}</b></div><span className={selected?'selection-ready':''}>{selected?'Ready':'Required'}</span></div><button className="btn primary full" disabled={!selected}>Confirm booking</button></form></section></div></>
}
function BookingsPage({bookings,onCancel}){return <><PageHeading eyebrow="MY LIBRARY" title="My bookings" description="Track your upcoming sessions and past library visits."/><div className="card table-card"><BookingTable bookings={bookings} onCancel={onCancel} showCancel/></div></>}
function BookingTable({bookings,onCancel,showCancel=false}){return <div className="table-wrap"><table><thead><tr><th>SEAT</th><th>DATE & TIME</th><th>STATUS</th>{showCancel&&<th>ACTION</th>}</tr></thead><tbody>{bookings.length?bookings.map(b=><tr key={b.id}><td><b>{b.seat_id}</b><small>Booking #{b.id}</small></td><td>{fmt(b.start_at)}<small>Until {fmt(b.end_at)}</small></td><td><Status status={b.status}/></td>{showCancel&&<td>{b.status==='RESERVED'&&new Date(b.start_at)>new Date()?<button className="table-action" onClick={()=>onCancel(b.id)}>Cancel</button>:'—'}</td>}</tr>):<tr><td colSpan={showCancel?4:3} className="empty-cell">No bookings to display.</td></tr>}</tbody></table></div>}
function RenewalPanel({booking,renewEnd,setRenewEnd,onRenew,onLeave}){const suggested=new Date(booking.end_at);suggested.setHours(suggested.getHours()+1);const suggestedVal=toLocalInput(suggested);return <section className="renewal-card"><div className="renewal-symbol"><Bell/></div><div className="renewal-copy"><span className="eyebrow">EXTEND YOUR STUDY SESSION</span><h3>Want to stay a little longer?</h3><p>Your booking for {booking.seat_id} ends at {fmt(booking.end_at)}. Renew if the next time slot is free, or scan your ID/fingerprint when leaving.</p><div className="renew-controls"><label>New end time<input type="datetime-local" min={booking.end_at} value={renewEnd||suggestedVal} onChange={e=>setRenewEnd(e.target.value)}/></label><button className="btn primary" onClick={onRenew}><RefreshCw size={16}/> Book again</button><button className="btn outline" onClick={onLeave}><DoorOpen size={16}/> I'm leaving</button></div></div></section>}
function NotificationsPage({notifications,onRead,onPermission}){return <><PageHeading eyebrow="UPDATES" title="Notifications" description="Booking confirmations, reminders and library activity." action={<button className="btn outline" onClick={onPermission}><Bell size={16}/> Enable browser alerts</button>}/><div className="notification-list">{notifications.length?notifications.map(n=><div className={cls('notification-item',!n.is_read&&'unread')} key={n.id}><div className={`notification-icon ${n.kind.toLowerCase()}`}><Bell size={18}/></div><div className="notification-body"><div className="notification-title">{n.title}<span>{fmt(n.created_at)}</span></div><p>{n.message}</p></div>{!n.is_read&&<button className="text-link" onClick={()=>onRead(n.id)}>Mark read</button>}</div>):<div className="card empty-state">You're all caught up. No notifications yet.</div>}</div></>}
function AdminDashboard({overview}){return <><PageHeading title="Overview"/><div className="simple-admin-stats"><Stat label="Available" value={overview?.available??'—'} color="available"/><Stat label="Reserved" value={overview?.reserved??'—'} color="reserved"/><Stat label="Occupied" value={overview?.occupied??'—'} color="occupied"/><Stat label="Overdue" value={overview?.overdue??'—'} color="overdue"/></div><section className="card simple-status-card admin-total"><div><span className="simple-label">ACTIVE SEATS</span><h2>{overview?.total_seats??'—'}</h2></div><span className="muted">{overview?.students??0} students</span></section></>}
function AdminBookings({bookings}){return <><PageHeading eyebrow="ADMINISTRATION" title="All bookings" description="Review current and historical seat reservations."/><div className="card table-card"><BookingTable bookings={bookings} showCancel={false}/></div></>}
function AttendancePage({events}){return <><PageHeading eyebrow="ADMINISTRATION" title="Attendance records" description="Verified entry and exit events from RFID and fingerprint scans."/><div className="card table-card"><div className="table-wrap"><table><thead><tr><th>STUDENT</th><th>EVENT</th><th>METHOD</th><th>TIME</th><th>RESULT</th></tr></thead><tbody>{events.map(e=><tr key={e.id}><td><b>{e.student_id}</b></td><td>{e.event}</td><td>{e.method}</td><td>{fmt(e.occurred_at)}</td><td><Status status={e.result==='SUCCESS'?'OCCUPIED':'CANCELLED'}/></td></tr>)}</tbody></table></div></div></>}
function StudentsPage(){const [students,setStudents]=useState([]);useEffect(()=>{api('/admin/students').then(r=>setStudents(r.students)).catch(console.error)},[]);return <><PageHeading eyebrow="ADMINISTRATION" title="Students" description="Registered students and their linked authentication credentials."/><div className="card table-card"><div className="table-wrap"><table><thead><tr><th>STUDENT</th><th>STUDENT ID</th><th>EMAIL</th><th>ROLE</th></tr></thead><tbody>{students.map(s=><tr key={s.student_id}><td><b>{s.name}</b></td><td>{s.student_id}</td><td>{s.email}</td><td>Student</td></tr>)}</tbody></table></div></div></>}
function AdminSeats({seats,refresh,flash}){const toggle=async id=>{try{const r=await api(`/admin/seats/${id}/toggle`,{method:'POST',body:'{}'});flash(`${id} is now ${r.is_active?'active':'inactive'}.`);await refresh()}catch(e){flash(e.message)}};return <><PageHeading eyebrow="ADMINISTRATION" title="Seat management" description="Temporarily disable seats that are under maintenance."/><div className="card"><div className="seat-admin-grid">{seats.map(s=><div className="seat-admin-item" key={s.seat_id}><div><b>{s.seat_id}</b><small>{s.is_active?'Active':'Maintenance'}</small></div><button className={s.is_active?'btn outline small':'btn primary small'} onClick={()=>toggle(s.seat_id)}>{s.is_active?'Disable':'Enable'}</button></div>)}</div></div></>}
export default App
