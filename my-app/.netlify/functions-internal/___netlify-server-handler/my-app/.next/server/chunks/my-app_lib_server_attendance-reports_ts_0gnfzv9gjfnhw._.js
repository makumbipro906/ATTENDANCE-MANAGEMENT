module.exports=[20313,e=>e.a(async(a,t)=>{try{var s=e.i(34339),r=e.i(65083),n=e.i(13704),i=a([s,r,n]);async function d(e,a,t={}){let i=await (0,r.O)(),{rows:m}=await (0,s.z)(`SELECT s.id, s.full_name, s.admission_number, CAST(y.year AS TEXT) AS academic_year,
                t.name AS term, c.name AS class_name, st.name AS stream, sec.name AS section, s.gender,
                t.start_date AS term_start_date, t.end_date AS term_end_date
         FROM students s
         JOIN student_enrollments e ON e.student_id = s.id AND e.status = 'Enrolled'
         JOIN terms t ON t.id = e.term_id
         JOIN school_years y ON y.id = t.school_year_id
         JOIN streams st ON st.id = e.stream_id
         JOIN classes c ON c.id = st.class_id
         JOIN sections sec ON sec.id = e.section_id
         WHERE s.status = 'Active' AND t.start_date <= ? AND t.end_date >= ?`,[a,e]),c=new Set((0,r.k)(i).map(e=>`${e.academicYear}\0${e.term}\0${e.className}\0${e.stream}`)),l=m.filter(e=>c.has(`${e.academic_year}\0${e.term}\0${e.class_name}\0${e.stream}`)),_=[...new Map(l.map(e=>{let a={academicYear:e.academic_year,term:e.term,className:e.class_name||"Unassigned",stream:e.stream||"Unassigned"};return[`${a.academicYear}\0${a.term}\0${a.className}\0${a.stream}`,a]})).values()],o=l.filter(e=>(!t.academicYear||e.academic_year===t.academicYear)&&(!t.term||e.term===t.term)&&(!t.className||e.class_name===t.className)&&(!t.stream||e.stream===t.stream)),u=o.map(e=>e.id),{rows:y}=u.length?await (0,s.z)(`SELECT a.student_id, a.attendance_date, a.occurred_at, d.time_zone
             FROM attendance_records a
             JOIN devices d ON d.device_key = a.device_key
             WHERE a.event_type = 'fingerprint_check_in'
               AND a.student_id IN (${u.map(()=>"?").join(", ")})
               AND a.attendance_date BETWEEN ? AND ?
             ORDER BY a.attendance_date`,[...u,e,a]):{rows:[]};return{settings:i,combinations:_,students:o,attendance:y,attendanceSettings:await (0,n.F)()}}[s,r,n]=i.then?(await i)():i,e.s(["J",0,function(e,a,t,s="07:30"){let r=new Map;for(let e of a){let a=r.get(e.student_id)??new Map,t=new Intl.DateTimeFormat("en-GB",{timeZone:e.time_zone,hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(new Date(e.occurred_at));a.set(e.attendance_date,t>s),r.set(e.student_id,a)}return e.map(e=>{let a=t.filter(a=>a>=e.term_start_date&&a<=e.term_end_date),s=new Set(a),n=r.get(e.id)??new Map,i=[...n.keys()].filter(e=>s.has(e)).length,d=[...n.entries()].filter(([e,a])=>s.has(e)&&a).length,m=a.length;return{id:e.id,name:e.full_name,admissionNumber:e.admission_number,className:e.class_name||"Unassigned",stream:e.stream||"Unassigned",presentDays:i,lateDays:d,expectedDays:m,absentDays:Math.max(0,m-i),attendanceRate:m?Math.round(i/m*100):null}})},"F",0,d,"R",0,function(e,a){let t=e.years.find(e=>e.isCurrent)??[...e.years].sort((e,a)=>a.year-e.year)[0];if(!t)return null;let s=e.terms.find(e=>e.year===t.year&&e.isCurrent)??[...e.terms].filter(e=>e.year===t.year).sort((e,a)=>a.startDate.localeCompare(e.startDate))[0];if(!s)return null;let r=a.filter(e=>e.academicYear===String(t.year)&&e.term===s.name);return{year:t,term:s,combinations:r}}]),t()}catch(e){t(e)}},!1)];

//# sourceMappingURL=my-app_lib_server_attendance-reports_ts_0gnfzv9gjfnhw._.js.map