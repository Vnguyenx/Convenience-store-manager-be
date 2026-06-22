// seedStaffData.js  (chạy từ root: node seedStaffData.js)
const { auth, db } = require('./src/config/firebase');

// ── Helpers ──────────────────────────────────────────────────────────────────

function addDays(days) {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0]; // yyyy-mm-dd
}

function daysAgo(days) { return addDays(-days); }

/** Ngày trong tháng hiện tại theo offset từ ngày 1 */
function thisMonth(day) {
    const d = new Date();
    d.setDate(day);
    return d.toISOString().split('T')[0];
}

function toISO(dateStr, timeStr) {
    return new Date(`${dateStr}T${timeStr}:00+07:00`).toISOString();
}

function hoursWorked(checkIn, checkOut) {
    return parseFloat(((new Date(checkOut) - new Date(checkIn)) / (1000 * 60 * 60)).toFixed(2));
}

// ── Dữ liệu seed ─────────────────────────────────────────────────────────────

// 1. STAFF  ─────────────────────────────────────────────────────────────────
//    Tạo trên Firebase Auth trước, rồi lưu Firestore
const staffData = [
    {
        email: 'admin@csmanager.vn',
        password: 'Admin123',
        fullName: 'Nguyễn Quản Trị',
        phone: '0901000001',
        role: 'admin',
        isActive: true,
        photoURL: '',
    },
    {
        email: 'staff1@csmanager.vn',
        password: 'Staff123',
        fullName: 'Trần Văn An',
        phone: '0901000002',
        role: 'staff',
        isActive: true,
        photoURL: '',
    },
    {
        email: 'staff2@csmanager.vn',
        password: 'Staff123',
        fullName: 'Lê Thị Bình',
        phone: '0901000003',
        role: 'staff',
        isActive: true,
        photoURL: '',
    },
    {
        email: 'staff3@csmanager.vn',
        password: 'Staff123',
        fullName: 'Phạm Minh Cường',
        phone: '0901000004',
        role: 'staff',
        isActive: true,
        photoURL: '',
    },
    {
        email: 'staff_inactive@csmanager.vn',
        password: 'Staff123',
        fullName: 'Hoàng Thị Dung',
        phone: '0901000005',
        role: 'staff',
        isActive: false,       // nhân viên đã nghỉ (test case vô hiệu hoá)
        photoURL: '',
    },
];

// 2. CA LÀM VIỆC ────────────────────────────────────────────────────────────
const shiftData = [
    {
        title: 'Ca sáng',
        startTime: '07:00',
        endTime: '12:00',
        isActive: true,
    },
    {
        title: 'Ca chiều',
        startTime: '13:00',
        endTime: '18:00',
        isActive: true,
    },
    {
        title: 'Ca tối',
        startTime: '18:00',
        endTime: '22:00',
        isActive: true,
    },
    {
        title: 'Ca full ngày',
        startTime: '08:00',
        endTime: '17:00',
        isActive: false,       // test case ca không còn sử dụng
    },
];

// ── Main seed ─────────────────────────────────────────────────────────────────

async function seedStaff() {
    console.log('\n👤 Seed STAFF...');
    const uidMap = {}; // email → uid (dùng lại cho bước sau)

    for (const s of staffData) {
        try {
            // Thử tạo mới; nếu đã tồn tại thì lấy uid hiện tại
            let uid;
            try {
                const record = await auth.createUser({
                    email: s.email,
                    password: s.password,
                    displayName: s.fullName,
                    disabled: !s.isActive,
                });
                uid = record.uid;
            } catch (e) {
                if (e.code === 'auth/email-already-exists') {
                    const existing = await auth.getUserByEmail(s.email);
                    uid = existing.uid;
                    console.log(`  ⚠️  Auth đã tồn tại, dùng uid cũ: ${s.email}`);
                } else throw e;
            }

            const now = new Date().toISOString();
            await db.collection('users').doc(uid).set({
                email: s.email,
                fullName: s.fullName,
                phone: s.phone,
                role: s.role,
                isActive: s.isActive,
                photoURL: s.photoURL,
                createdAt: now,
                updatedAt: now,
            }, { merge: true });

            uidMap[s.email] = uid;
            console.log(`  ✅ ${s.fullName} (${s.role}) - uid: ${uid}`);
        } catch (err) {
            console.error(`  ❌ Lỗi tạo staff ${s.email}:`, err.message);
        }
    }
    return uidMap;
}

async function seedShifts() {
    console.log('\n🕐 Seed SHIFTS...');
    const shiftIds = []; // index tương ứng với shiftData

    for (const sh of shiftData) {
        try {
            const now = new Date().toISOString();
            const ref = db.collection('shifts').doc();
            await ref.set({ ...sh, createdAt: now, updatedAt: now });
            shiftIds.push(ref.id);
            console.log(`  ✅ "${sh.title}" (${sh.startTime}–${sh.endTime}) - id: ${ref.id}`);
        } catch (err) {
            console.error(`  ❌ Lỗi tạo shift "${sh.title}":`, err.message);
            shiftIds.push(null);
        }
    }
    return shiftIds; // [caSangId, caChieuId, caToidId, caFullId]
}

async function seedShiftAssignments(uidMap, shiftIds) {
    console.log('\n📅 Seed SHIFT ASSIGNMENTS...');

    const staff1 = uidMap['staff1@csmanager.vn'];
    const staff2 = uidMap['staff2@csmanager.vn'];
    const staff3 = uidMap['staff3@csmanager.vn'];
    const [caSang, caChieu, caToi] = shiftIds;

    if (!staff1 || !staff2 || !staff3 || !caSang || !caChieu) {
        console.log('  ⚠️  Thiếu uid/shiftId, bỏ qua bước này');
        return {};
    }

    // assignmentId → { staffUid, date }  (để dùng khi seed attendance)
    const assignMap = {};

    const assignments = [
        // Tuần trước
        { shiftId: caSang,  staffUid: staff1, date: daysAgo(6), status: 'completed' },
        { shiftId: caChieu, staffUid: staff2, date: daysAgo(6), status: 'completed' },
        { shiftId: caSang,  staffUid: staff1, date: daysAgo(5), status: 'completed' },
        { shiftId: caChieu, staffUid: staff3, date: daysAgo(5), status: 'completed' },
        { shiftId: caToi,   staffUid: staff2, date: daysAgo(4), status: 'completed' },
        { shiftId: caSang,  staffUid: staff3, date: daysAgo(3), status: 'completed' },
        { shiftId: caChieu, staffUid: staff1, date: daysAgo(3), status: 'completed' },
        // Hôm qua
        { shiftId: caSang,  staffUid: staff1, date: daysAgo(1), status: 'completed' },
        { shiftId: caChieu, staffUid: staff2, date: daysAgo(1), status: 'completed' },
        // Hôm nay
        { shiftId: caSang,  staffUid: staff1, date: addDays(0), status: 'scheduled' },
        { shiftId: caChieu, staffUid: staff2, date: addDays(0), status: 'scheduled' },
        { shiftId: caToi,   staffUid: staff3, date: addDays(0), status: 'scheduled' },
        // Tương lai
        { shiftId: caSang,  staffUid: staff3, date: addDays(1), status: 'scheduled' },
        { shiftId: caChieu, staffUid: staff1, date: addDays(2), status: 'scheduled' },
        { shiftId: caToi,   staffUid: staff2, date: addDays(2), status: 'scheduled' },
    ];

    for (const a of assignments) {
        try {
            const now = new Date().toISOString();
            const ref = db.collection('shiftAssignments').doc();
            await ref.set({ ...a, createdAt: now, updatedAt: now });
            assignMap[ref.id] = { staffUid: a.staffUid, date: a.date, status: a.status };
            console.log(`  ✅ ${a.date} | uid:...${a.staffUid.slice(-6)} | ${a.status}`);
        } catch (err) {
            console.error(`  ❌ Lỗi assignment ${a.date}:`, err.message);
        }
    }
    return assignMap;
}

async function seedAttendances(uidMap, assignMap) {
    console.log('\n🕒 Seed ATTENDANCES...');

    const staff1 = uidMap['staff1@csmanager.vn'];
    const staff2 = uidMap['staff2@csmanager.vn'];
    const staff3 = uidMap['staff3@csmanager.vn'];

    if (!staff1 || !staff2 || !staff3) {
        console.log('  ⚠️  Thiếu uid, bỏ qua'); return;
    }

    // Tìm assignmentId theo (staffUid, date)
    function findAssignId(staffUid, date) {
        return Object.entries(assignMap).find(
            ([, v]) => v.staffUid === staffUid && v.date === date
        )?.[0] ?? null;
    }

    // [staffUid, date, checkInTime, checkOutTime | null, note]
    const records = [
        // ── Tuần trước (đã check in + out) ────────────────────────────────
        [staff1, daysAgo(6), '07:05', '12:10', ''],
        [staff2, daysAgo(6), '13:02', '18:00', ''],
        [staff1, daysAgo(5), '07:00', '11:55', 'Về sớm 5 phút'],
        [staff3, daysAgo(5), '13:05', '18:10', ''],
        [staff2, daysAgo(4), '18:00', '22:05', 'Tăng ca thêm 5 phút'],
        [staff3, daysAgo(3), '07:08', '12:00', ''],
        [staff1, daysAgo(3), '13:00', '18:00', ''],
        // ── Hôm qua ────────────────────────────────────────────────────────
        [staff1, daysAgo(1), '07:03', '12:00', ''],
        [staff2, daysAgo(1), '13:01', '18:00', ''],
        // ── Hôm nay: staff1 đã check-in, chưa check-out (đang làm việc) ───
        [staff1, addDays(0), '07:00', null, ''],
    ];

    for (const [staffUid, date, inTime, outTime, note] of records) {
        try {
            const checkIn  = toISO(date, inTime);
            const checkOut = outTime ? toISO(date, outTime) : null;
            const hw       = checkOut ? hoursWorked(checkIn, checkOut) : null;
            const assignmentId = findAssignId(staffUid, date);
            const now = new Date().toISOString();

            const ref = db.collection('attendances').doc();
            await ref.set({
                staffUid,
                assignmentId,
                date,
                checkIn,
                checkOut,
                hoursWorked: hw,
                note,
                createdAt: now,
                updatedAt: now,
            });
            console.log(`  ✅ ${date} | ...${staffUid.slice(-6)} | in:${inTime} out:${outTime ?? '(chưa)'} | ${hw ?? '-'}h`);
        } catch (err) {
            console.error(`  ❌ Lỗi attendance ${date}:`, err.message);
        }
    }
}

async function seedPayrollConfig(uidMap) {
    console.log('\n💰 Seed PAYROLL CONFIG...');

    const staff1 = uidMap['staff1@csmanager.vn'];
    const staff2 = uidMap['staff2@csmanager.vn'];

    const configs = [
        // Mức mặc định cho tất cả staff chưa có cấu hình riêng
        { id: 'default', staffUid: 'default', hourlyRate: 25000 },
        // Staff1 có mức cao hơn (nhân viên kỳ cựu)
        { id: staff1,    staffUid: staff1,    hourlyRate: 35000 },
        // Staff2 bình thường
        { id: staff2,    staffUid: staff2,    hourlyRate: 27000 },
        // staff3 không có config riêng → dùng default
    ];

    for (const c of configs) {
        try {
            await db.collection('payrollConfig').doc(c.id).set({
                staffUid: c.staffUid,
                hourlyRate: c.hourlyRate,
                updatedAt: new Date().toISOString(),
            });
            const label = c.id === 'default' ? '[default]' : `...${c.id.slice(-6)}`;
            console.log(`  ✅ ${label} → ${c.hourlyRate.toLocaleString('vi-VN')}đ/giờ`);
        } catch (err) {
            console.error(`  ❌ Lỗi config ${c.id}:`, err.message);
        }
    }
}

async function seedPayrolls(uidMap) {
    console.log('\n📊 Seed PAYROLLS (tháng trước + tháng này)...');

    const staff1 = uidMap['staff1@csmanager.vn'];
    const staff2 = uidMap['staff2@csmanager.vn'];
    const staff3 = uidMap['staff3@csmanager.vn'];

    if (!staff1 || !staff2 || !staff3) { console.log('  ⚠️  Thiếu uid'); return; }

    const now = new Date();
    const thisMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonthStr = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;

    const payrolls = [
        // ── Tháng trước: đã thanh toán ────────────────────────────────────
        {
            staffUid: staff1, month: prevMonthStr,
            totalHours: 160, hourlyRate: 35000,
            baseSalary: 5600000, bonus: 200000, deduction: 0,
            finalSalary: 5800000, status: 'paid',
            note: 'Thưởng hoàn thành chỉ tiêu',
        },
        {
            staffUid: staff2, month: prevMonthStr,
            totalHours: 152, hourlyRate: 27000,
            baseSalary: 4104000, bonus: 0, deduction: 100000,
            finalSalary: 4004000, status: 'paid',
            note: 'Trừ 1 ngày vắng không phép',
        },
        {
            staffUid: staff3, month: prevMonthStr,
            totalHours: 144, hourlyRate: 25000,
            baseSalary: 3600000, bonus: 0, deduction: 0,
            finalSalary: 3600000, status: 'paid',
            note: '',
        },
        // ── Tháng này: draft (chờ tính cuối tháng) ────────────────────────
        {
            staffUid: staff1, month: thisMonthStr,
            totalHours: 42, hourlyRate: 35000,     // mới đầu tháng
            baseSalary: 1470000, bonus: 0, deduction: 0,
            finalSalary: 1470000, status: 'draft',
            note: '',
        },
        {
            staffUid: staff2, month: thisMonthStr,
            totalHours: 39, hourlyRate: 27000,
            baseSalary: 1053000, bonus: 0, deduction: 0,
            finalSalary: 1053000, status: 'draft',
            note: '',
        },
        {
            staffUid: staff3, month: thisMonthStr,
            totalHours: 35, hourlyRate: 25000,
            baseSalary: 875000, bonus: 0, deduction: 0,
            finalSalary: 875000, status: 'confirmed',   // test case đã duyệt chưa trả
            note: 'Đã xác nhận, chờ thanh toán',
        },
    ];

    for (const p of payrolls) {
        try {
            const nowISO = new Date().toISOString();
            const ref = db.collection('payrolls').doc();
            await ref.set({ ...p, createdAt: nowISO, updatedAt: nowISO });
            console.log(
                `  ✅ ${p.month} | ...${p.staffUid.slice(-6)} | ${p.totalHours}h | ` +
                `${p.finalSalary.toLocaleString('vi-VN')}đ | [${p.status}]`
            );
        } catch (err) {
            console.error(`  ❌ Lỗi payroll:`, err.message);
        }
    }
}

// ── Run ───────────────────────────────────────────────────────────────────────

async function main() {
    console.log('🚀 Bắt đầu seed dữ liệu nhân sự...');
    try {
        const uidMap    = await seedStaff();
        const shiftIds  = await seedShifts();
        const assignMap = await seedShiftAssignments(uidMap, shiftIds);
        await seedAttendances(uidMap, assignMap);
        await seedPayrollConfig(uidMap);
        await seedPayrolls(uidMap);
        console.log('\n✨ Seed hoàn tất!\n');
    } catch (err) {
        console.error('\n💥 Lỗi không mong muốn:', err);
    }
    process.exit(0);
}

main();