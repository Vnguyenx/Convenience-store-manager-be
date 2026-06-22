const { auth, db } = require('./src/config/firebase');

const accounts = [
    { email: 'admin@dt22m.com', password: 'Admin1234', fullName: 'Chủ cửa hàng', role: 'admin' },
    { email: 'staff@dt22m.com', password: 'Staff1234', fullName: 'Nhân viên thu ngân', role: 'staff' },
];

async function seed() {
    for (const acc of accounts) {
        try {
            const userRecord = await auth.createUser({
                email: acc.email,
                password: acc.password,
                displayName: acc.fullName,
            });

            await db.collection('users').doc(userRecord.uid).set({
                email: acc.email,
                fullName: acc.fullName,
                role: acc.role,
                isActive: true,
                createdAt: new Date().toISOString(),
            });

            console.log(`✅ Tạo tài khoản ${acc.role} thành công:`, acc.email);
        } catch (err) {
            if (err.code === 'auth/email-already-exists') {
                console.log(`⚠️ Tài khoản ${acc.email} đã tồn tại, bỏ qua.`);
            } else {
                console.error(`❌ Lỗi tạo ${acc.email}:`, err.message);
            }
        }
    }
    process.exit(0);
}

seed();