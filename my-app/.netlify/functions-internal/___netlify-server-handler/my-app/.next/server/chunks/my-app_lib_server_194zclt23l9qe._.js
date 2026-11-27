module.exports=[59586,e=>e.a(async(t,n)=>{try{var a=e.i(66680),i=e.i(34339),r=e.i(79105),s=e.i(13704),d=t([i,s]);async function _(){return(0,i.h)(async e=>{let t=await e.prepare(`SELECT id, attempt_count FROM sms_notifications
             WHERE (
                status IN ('pending', 'failed') AND attempt_count < 5
                AND (retry_after IS NULL OR retry_after::timestamptz <= CURRENT_TIMESTAMP)
             ) OR (
                status = 'processing' AND updated_at <= CURRENT_TIMESTAMP - INTERVAL '5 minutes'
                AND attempt_count < 5
             )
             ORDER BY created_at LIMIT 20 FOR UPDATE SKIP LOCKED`).all(),n=e.prepare(`UPDATE sms_notifications
             SET status = 'processing', attempt_count = attempt_count + 1, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`),a=[];for(let{id:i}of t){await n.run(i);let t=await e.prepare("SELECT id, recipient_phone, message_body, attempt_count FROM sms_notifications WHERE id = ?").get(i);t&&a.push(t)}return a})}[i,s]=d.then?(await d)():d,e.s(["p",0,_,"r",0,function(e){return(0,i.h)(async t=>{let n,i=await t.prepare("SELECT device_key, time_zone FROM devices WHERE device_key = ? AND active = 1").get(e.deviceKey);if(!i)return{status:"unknown_device"};let d=(0,a.randomUUID)(),_=new Date(e.occurredAt).toISOString();if(0===(await t.prepare(`INSERT INTO raw_device_events
                (id, device_key, event_id, device_user_id, occurred_at, event_type, scan_result, payload, processing_status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'received')
             ON CONFLICT (device_key, event_id) DO NOTHING`).run(d,e.deviceKey,e.eventId,e.deviceUserId,_,e.eventType,e.result,JSON.stringify(e))).changes)return{status:"duplicate",eventId:e.eventId};let c=async()=>t.prepare(`UPDATE devices SET last_event_at =
                CASE WHEN last_event_at IS NULL OR last_event_at < ? THEN ? ELSE last_event_at END
             WHERE device_key = ?`).run(_,_,i.device_key);if("verified"!==e.result)return await t.prepare("UPDATE raw_device_events SET processing_status = 'rejected' WHERE id = ?").run(d),await c(),{status:"rejected",eventId:e.eventId};let u=await t.prepare(`SELECT s.id, s.full_name, c.name AS class_name, st.name AS stream,
                    sec.name AS section_name, e.id AS enrollment_id
             FROM device_user_mappings m
             JOIN students s ON s.id = m.student_id
             JOIN student_enrollments e ON e.student_id = s.id AND e.status = 'Enrolled'
             JOIN streams st ON st.id = e.stream_id
             JOIN classes c ON c.id = st.class_id
             JOIN sections sec ON sec.id = e.section_id
             WHERE m.device_key = ? AND m.device_user_id = ? AND s.status = 'Active'
             ORDER BY e.enrolled_at DESC
             LIMIT 1`).get(i.device_key,e.deviceUserId);if(!u)return await t.prepare("UPDATE raw_device_events SET processing_status = 'unknown_student' WHERE id = ?").run(d),await c(),{status:"unknown_student",eventId:e.eventId};let l=(0,r.W)(new Date(_),i.time_zone),o=(0,a.randomUUID)();if(0===(await t.prepare(`INSERT INTO attendance_records
                (id, student_id, enrollment_id, device_key, raw_event_id, attendance_date, event_type, occurred_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT DO NOTHING`).run(o,u.id,u.enrollment_id,i.device_key,d,l,e.eventType,_)).changes)return await t.prepare("UPDATE raw_device_events SET processing_status = 'duplicate' WHERE id = ?").run(d),await c(),{status:"duplicate",eventId:e.eventId};let p=await (0,s.q)(),E=(await t.prepare(`SELECT g.full_name, g.relationship, g.phone
             FROM student_guardians sg JOIN guardians g ON g.id = sg.guardian_id
             WHERE sg.student_id = ? AND sg.receives_sms = 1 AND g.phone IS NOT NULL
             ORDER BY sg.is_primary DESC, g.full_name`).all(u.id)).filter(e=>e.phone.trim());if(p.enabled){n=E.length?"pending":"blocked";let r=l.split("-").reverse().join("/"),s=new Intl.DateTimeFormat("en-GB",{timeZone:i.time_zone,hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(new Date(_)),d=(/\bboarding\b/i.test(u.section_name)?"fingerprint_check_in"===e.eventType?p.boardingSignInTemplate:p.boardingSignOutTemplate:"fingerprint_check_in"===e.eventType?p.daySignInTemplate:p.daySignOutTemplate).replaceAll("{student_name}",u.full_name).replaceAll("{date}",r).replaceAll("{time}",s),c=t.prepare(`INSERT INTO sms_notifications
                    (id, attendance_id, student_id, recipient_phone, message_body, status, last_error)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`);if(E.length)for(let e of E)await c.run((0,a.randomUUID)(),o,u.id,e.phone,d,"pending",null);else await c.run((0,a.randomUUID)(),o,u.id,null,d,"blocked","No guardian phone number is registered.")}else n="disabled";return await t.prepare("UPDATE raw_device_events SET processing_status = 'processed', student_id = ? WHERE id = ?").run(u.id,d),await c(),await t.prepare("INSERT INTO audit_log (id, actor_type, action, entity_type, entity_id, details) VALUES (?, 'device', 'attendance.recorded', 'attendance', ?, ?)").run((0,a.randomUUID)(),o,JSON.stringify({deviceKey:i.device_key,eventId:e.eventId})),{status:"recorded",eventId:e.eventId,attendanceId:o,notificationStatus:n}})}]),n()}catch(e){n(e)}},!1),63726,e=>{"use strict";var t=e.i(66680);e.s(["f",0,function(e,n,a){let i=process.env[a],r=e.headers.get(n);if(!i||!r)return!1;let s=Buffer.from(i),d=Buffer.from(r);return s.length===d.length&&(0,t.timingSafeEqual)(s,d)}])}];

//# sourceMappingURL=my-app_lib_server_194zclt23l9qe._.js.map