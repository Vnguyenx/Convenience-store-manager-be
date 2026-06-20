const { db } = require('./src/config/firebase');

// Field bổ sung cho từng sản phẩm: imageURL + discountPrice (nếu đang null)
// ⚠️ imageURL đang để trống — sẽ điền sau khi có danh sách URL ảnh thật
const updates = {
    SP0001: { imageURL: 'https://cdn.fast.vn/tmp/20200919113850-6-lon-nuoc-ngot-coca-cola-zero-330ml-1.JPG' },
    SP0002: { imageURL: 'https://minhcaumart.vn/media/com_eshop/products/8934588012228%201.jpg' },
    SP0003: { imageURL: 'https://bizweb.dktcdn.net/thumb/grande/100/432/143/products/bb98ef2a-dc44-4d28-890a-6c51506012a0.jpg?v=1714490858523' },
    SP0004: { imageURL: 'https://product.hstatic.net/200000663553/product/93da8b2e-f1d0-4ba1-bc64-338e56d715ce_80b2cabe9b64497fb02c13f932af2f79_master.jpg' },
    SP0005: { imageURL: 'https://product.hstatic.net/200000401369/product/5001424_sua-uong-len-men-yakult-5x65ml_efa8ff41473d432f8af73cc941104af3_grande.jpeg' },
    SP0006: { imageURL: 'https://cdn.lottemart.vn/media/description/product/cache/8934563138165-DT-1.png.webp' },
    SP0007: { imageURL: 'https://tse4.mm.bing.net/th/id/OIP.GkN6q2SFV8Wg8XIR_HL5kgHaHa?r=0&rs=1&pid=ImgDetMain&o=7&rm=3' }, // ⚠️ link cache Bing, có thể hết hạn
    SP0008: { imageURL: 'https://tse3.mm.bing.net/th/id/OIP.hm8E7YjJkPnreLNBqgLP-wHaHa?r=0&rs=1&pid=ImgDetMain&o=7&rm=3' }, // ⚠️ link cache Bing, có thể hết hạn
    SP0009: { imageURL: 'https://foodplaza.com.vn/wp-content/uploads/2020/07/11-keo-deo-haribo-goldbears-80g.jpg' },
    SP0010: { imageURL: 'https://product.hstatic.net/1000141988/product/khoai_tay_vi_tu_nhien_classic_lay_s_95_g_77dcaedd762c431f94f033dc8bd5e87d_1024x1024.jpg' },
    SP0011: { imageURL: 'https://nuocuongthanhtam.com/wp-content/uploads/2022/11/aquafina-500ml.jpg' },
    SP0012: { imageURL: 'https://www.nescafe.com/vn/sites/default/files/2024-06/NESCAFE_CAPHEVIET_MOCKUP-copy-2.png' },
    SP0013: { imageURL: 'https://tse1.mm.bing.net/th/id/OIP.PdA_LwpR9v7MLUXGt7avgAHaHa?r=0&rs=1&pid=ImgDetMain&o=7&rm=3' }, // ⚠️ link cache Bing, có thể hết hạn
    SP0014: { imageURL: 'https://tse2.mm.bing.net/th/id/OIP.hVBr0Ewq1LBSbDOHqLKDJAHaEH?r=0&rs=1&pid=ImgDetMain&o=7&rm=3' }, // ⚠️ link cache Bing, có thể hết hạn
    SP0015: { imageURL: 'https://cf.shopee.vn/file/248db64f21971c76b061cb4090029837' },
    SP0016: { imageURL: 'https://u-shop.vn/images/thumbs/0014286_nuoc-rua-chen-sunlight-chanh-chai-750g.png' },
    SP0017: { imageURL: 'https://trungsoncare.com/images/detailed/9/1_24q3-65.png' },
    SP0018: { imageURL: 'https://fact-depot.com/media/product/17029/Khau-trang-y-te-3-lop-Vinamask-xanh-50-hop-hop-55-cai-(1).webp' },
    SP0019: { imageURL: 'https://pin.net.vn/wp-content/uploads/Energizer-AA-4.jpg' },
    SP0020: { imageURL: 'https://cdn.lottemart.vn/media/catalog/product/cache/0x0/8/9/8934822801335-1.jpg.webp' },
};

// sellPrice gốc của các sản phẩm đang discountPrice = null (copy từ seedProducts.js)
// để tự tính discountPrice ~10-15% thấp hơn
const sellPriceMap = {
    SP0001: 10000,
    SP0003: 12000,
    SP0004: 8000,
    SP0006: 5000,
    SP0007: 13000,
    SP0009: 26000,
    SP0010: 13000,
    SP0011: 6000,
    SP0013: 30000,
    SP0014: 38000,
    SP0015: 60000,
    SP0017: 12000,
    SP0018: 45000,
    SP0019: 28000,
    SP0020: 17000,
};

// Làm tròn về hàng trăm cho đẹp giá (VNĐ)
function roundToHundred(n) {
    return Math.round(n / 100) * 100;
}

// Random % giảm trong khoảng 10-15%
function randomDiscountPercent() {
    return 0.10 + Math.random() * 0.05; // 10% - 15%
}

async function updateProductFields() {
    for (const code of Object.keys(updates)) {
        try {
            const payload = { ...updates[code] };

            // Nếu sản phẩm này thuộc danh sách discountPrice = null -> tự tính giá giảm
            if (sellPriceMap[code] !== undefined) {
                const sellPrice = sellPriceMap[code];
                const percent = randomDiscountPercent();
                const discountPrice = roundToHundred(sellPrice * (1 - percent));
                payload.discountPrice = discountPrice;
            }

            payload.updatedAt = new Date().toISOString();

            await db.collection('products').doc(code).update(payload);
            console.log(`✅ Cập nhật thành công: ${code}`, payload);
        } catch (err) {
            console.error(`❌ Lỗi cập nhật ${code}:`, err.message);
        }
    }
    process.exit(0);
}

updateProductFields();