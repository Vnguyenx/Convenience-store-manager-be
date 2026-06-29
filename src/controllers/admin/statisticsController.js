// src/controllers/admin/statisticsController.js
const { db } = require('../../config/firebase');

// Thống kê doanh thu dựa trên collection "orders".
// Chỉ tính các đơn có status === 'completed' (đơn "cancelled" không tính vào doanh thu).

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
function validateDate(d) { return DATE_REGEX.test(d) && !isNaN(Date.parse(d)); }
function toEndOfDayISO(dateStr) { return `${dateStr}T23:59:59.999Z`; }

/**
 * Lấy danh sách đơn hàng completed trong khoảng thời gian (nếu có truyền from/to)
 * @param {string} [from] "YYYY-MM-DD"
 * @param {string} [to]   "YYYY-MM-DD"
 */
async function fetchCompletedOrders(from, to) {
    let query = db.collection('orders').where('status', '==', 'completed');

    if (from) query = query.where('createdAt', '>=', from);
    if (to)   query = query.where('createdAt', '<=', toEndOfDayISO(to));
    if (from || to) query = query.orderBy('createdAt');

    const snap = await query.get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/**
 * Validate & lấy from/to từ query string. Throw Error nếu sai định dạng.
 */
function parseDateRange(query) {
    const { from, to } = query;
    if (from && !validateDate(from)) throw new Error('from phải có định dạng YYYY-MM-DD');
    if (to   && !validateDate(to))   throw new Error('to phải có định dạng YYYY-MM-DD');
    if (from && to && from > to)     throw new Error('from phải trước hoặc bằng to');
    return { from, to };
}

// Số ngày giữa 2 mốc (tính cả 2 đầu mút) — dùng để xác định kỳ liền trước
function diffDays(from, to) {
    return Math.round((new Date(to) - new Date(from)) / (1000 * 60 * 60 * 24)) + 1;
}

// Dịch khoảng [from, to] về kỳ liền trước có cùng số ngày
function shiftToPreviousPeriod(from, to) {
    const days = diffDays(from, to);
    const prevTo = new Date(from);
    prevTo.setDate(prevTo.getDate() - 1);
    const prevFrom = new Date(prevTo);
    prevFrom.setDate(prevFrom.getDate() - (days - 1));
    return {
        prevFrom: prevFrom.toISOString().split('T')[0],
        prevTo: prevTo.toISOString().split('T')[0],
    };
}

function round0(n) { return Math.round(n || 0); }
function round2(n) { return parseFloat((n || 0).toFixed(2)); }

function percentChange(current, previous) {
    if (!previous) return current > 0 ? 100 : 0;
    return round2(((current - previous) / previous) * 100);
}

/**
 * Trả về Map<productID, importPrice> CHỈ cho các productID bị thiếu costPrice
 * trong item (đơn tạo trước khi có snapshot costPrice). Đơn nào đã có costPrice
 * thì không cần join, tránh fetch dư.
 */
async function buildFallbackCostMap(orders) {
    const missingIds = new Set();
    for (const o of orders) {
        for (const item of (o.items || [])) {
            // FIX: chỉ thêm nếu item.id tồn tại
            if (item.id && (item.costPrice === undefined || item.costPrice === null)) {
                missingIds.add(item.id);
            }
        }
    }
    if (missingIds.size === 0) return {};

    const ids = Array.from(missingIds);
    const costMap = {};
    // Firestore 'in' giới hạn 30 phần tử/lần query
    for (let i = 0; i < ids.length; i += 30) {
        const chunk = ids.slice(i, i + 30);
        const snap = await db.collection('products').where('ID', 'in', chunk).get();
        snap.docs.forEach(d => {
            const p = d.data();
            costMap[p.ID] = p.importPrice ?? 0;
        });
    }
    return costMap;
}

/**
 * Giá vốn của 1 item: ưu tiên costPrice đã snapshot trong order (chính xác tại
 * thời điểm bán). Nếu đơn cũ chưa có field này thì lấy importPrice HIỆN TẠI của
 * product làm giá vốn ước tính (có thể lệch so với giá vốn thực lúc bán).
 */
function getItemCostPrice(item, fallbackCostMap) {
    if (item.costPrice !== undefined && item.costPrice !== null) return item.costPrice;
    // FIX: nếu item.id không có, trả 0
    return item.id ? (fallbackCostMap[item.id] ?? 0) : 0;
}

function buildSummary(orders, fallbackCostMap = {}) {
    let totalRevenue   = 0;
    let totalDiscount  = 0;
    let totalSubtotal  = 0;
    let totalItemsSold = 0;
    let totalCost       = 0;
    let costIsEstimated = false; // true nếu có ít nhất 1 item phải lấy giá vốn từ fallback (đơn cũ)

    for (const o of orders) {
        totalRevenue  += o.total || 0;
        totalDiscount += o.couponDiscount || 0;
        totalSubtotal += o.subtotal || 0;
        for (const item of (o.items || [])) {
            const qty = item.quantity || 0;
            totalItemsSold += qty;
            if (item.costPrice === undefined || item.costPrice === null) costIsEstimated = true;
            totalCost += getItemCostPrice(item, fallbackCostMap) * qty;
        }
    }

    const totalOrders = orders.length;
    const averageOrderValue = totalOrders > 0 ? round0(totalRevenue / totalOrders) : 0;
    const grossProfit  = totalRevenue - totalCost;
    const profitMargin = totalRevenue > 0 ? round2((grossProfit / totalRevenue) * 100) : 0;

    return {
        totalOrders,
        totalRevenue: round0(totalRevenue),
        totalSubtotal: round0(totalSubtotal),
        totalDiscount: round0(totalDiscount),
        totalItemsSold,
        averageOrderValue,
        totalCost: round0(totalCost),
        grossProfit: round0(grossProfit),
        profitMargin,
        costIsEstimated,
    };
}

// ── 1. Tổng quan doanh thu ───────────────────────────────────────────────────

/**
 * GET /admin/statistics/revenue/overview
 * Query: ?from=YYYY-MM-DD&to=YYYY-MM-DD&compare=true
 * Trả về tổng doanh thu, số đơn, AOV, tổng giảm giá, tổng sản phẩm đã bán.
 * Nếu compare=true và có cả from+to → so sánh với kỳ liền trước (cùng số ngày).
 */
exports.getRevenueOverview = async (req, res) => {
    try {
        const { from, to } = parseDateRange(req.query);
        const orders = await fetchCompletedOrders(from, to);
        const fallbackCostMap = await buildFallbackCostMap(orders);
        const summary = buildSummary(orders, fallbackCostMap);

        let comparison = null;
        if (req.query.compare === 'true' && from && to) {
            const { prevFrom, prevTo } = shiftToPreviousPeriod(from, to);
            const prevOrders = await fetchCompletedOrders(prevFrom, prevTo);
            const prevFallbackCostMap = await buildFallbackCostMap(prevOrders);
            const prevSummary = buildSummary(prevOrders, prevFallbackCostMap);

            comparison = {
                previousPeriod: { from: prevFrom, to: prevTo },
                previousRevenue: prevSummary.totalRevenue,
                previousOrders: prevSummary.totalOrders,
                previousProfit: prevSummary.grossProfit,
                revenueChangePercent: percentChange(summary.totalRevenue, prevSummary.totalRevenue),
                ordersChangePercent: percentChange(summary.totalOrders, prevSummary.totalOrders),
                profitChangePercent: percentChange(summary.grossProfit, prevSummary.grossProfit),
            };
        }

        res.status(200).json({
            range: { from: from || null, to: to || null },
            ...summary,
            comparison,
        });
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
};

// ── 2. Doanh thu theo thời gian (cho biểu đồ) ────────────────────────────────

/**
 * GET /admin/statistics/revenue/by-time
 * Query: ?from=YYYY-MM-DD&to=YYYY-MM-DD&groupBy=day|month
 */
exports.getRevenueByTime = async (req, res) => {
    try {
        const { from, to } = parseDateRange(req.query);
        const groupBy = req.query.groupBy === 'month' ? 'month' : 'day';

        const orders = await fetchCompletedOrders(from, to);
        const fallbackCostMap = await buildFallbackCostMap(orders);
        const buckets = {};

        for (const o of orders) {
            const dateStr = (o.createdAt || '').split('T')[0]; // "YYYY-MM-DD"
            if (!dateStr) continue;
            const key = groupBy === 'month' ? dateStr.slice(0, 7) : dateStr; // "YYYY-MM" | "YYYY-MM-DD"

            if (!buckets[key]) buckets[key] = { key, revenue: 0, cost: 0, orders: 0, itemsSold: 0 };
            buckets[key].revenue += o.total || 0;
            buckets[key].orders  += 1;
            for (const item of (o.items || [])) {
                const qty = item.quantity || 0;
                buckets[key].itemsSold += qty;
                buckets[key].cost += getItemCostPrice(item, fallbackCostMap) * qty;
            }
        }

        const series = Object.values(buckets)
            .map(b => ({
                ...b,
                revenue: round0(b.revenue),
                cost: round0(b.cost),
                profit: round0(b.revenue - b.cost),
            }))
            .sort((a, b) => a.key.localeCompare(b.key));

        res.status(200).json({ groupBy, range: { from: from || null, to: to || null }, series });
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
};

// ── 3. Doanh thu theo phương thức thanh toán ─────────────────────────────────

/**
 * GET /admin/statistics/revenue/by-payment-method
 * Query: ?from=YYYY-MM-DD&to=YYYY-MM-DD
 */
exports.getRevenueByPaymentMethod = async (req, res) => {
    try {
        const { from, to } = parseDateRange(req.query);
        const orders = await fetchCompletedOrders(from, to);

        const groups = {};
        let totalRevenue = 0;

        for (const o of orders) {
            const method = o.paymentMethod || 'khác';
            if (!groups[method]) groups[method] = { paymentMethod: method, revenue: 0, orders: 0 };
            groups[method].revenue += o.total || 0;
            groups[method].orders  += 1;
            totalRevenue += o.total || 0;
        }

        const breakdown = Object.values(groups)
            .map(g => ({
                ...g,
                revenue: round0(g.revenue),
                percentage: totalRevenue > 0 ? round2((g.revenue / totalRevenue) * 100) : 0,
            }))
            .sort((a, b) => b.revenue - a.revenue);

        res.status(200).json({
            range: { from: from || null, to: to || null },
            totalRevenue: round0(totalRevenue),
            breakdown,
        });
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
};

// ── 4. Top sản phẩm bán chạy ──────────────────────────────────────────────────

/**
 * GET /admin/statistics/revenue/top-products
 * Query: ?from=YYYY-MM-DD&to=YYYY-MM-DD&limit=10
 */
exports.getTopProducts = async (req, res) => {
    try {
        const { from, to } = parseDateRange(req.query);
        // FIX: Xử lý limit an toàn
        let limit = parseInt(req.query.limit, 10);
        if (isNaN(limit) || limit < 1) {
            limit = 10;  // mặc định
        } else {
            limit = Math.min(limit, 100);
        }

        const orders = await fetchCompletedOrders(from, to);
        const fallbackCostMap = await buildFallbackCostMap(orders);
        const productMap = {};

        for (const o of orders) {
            for (const item of (o.items || [])) {
                // FIX: bỏ qua item không có id
                if (!item.id) continue;
                const sellPrice = item.discountPrice ?? item.unitPrice ?? 0;
                const costPrice = getItemCostPrice(item, fallbackCostMap);
                const qty = item.quantity || 0;

                if (!productMap[item.id]) {
                    productMap[item.id] = {
                        productId: item.id,
                        productName: item.name,
                        quantitySold: 0,
                        revenue: 0,
                        cost: 0,
                        orderCount: 0,
                    };
                }
                productMap[item.id].quantitySold += qty;
                productMap[item.id].revenue       += sellPrice * qty;
                productMap[item.id].cost          += costPrice * qty;
                productMap[item.id].orderCount    += 1;
            }
        }

        const topProducts = Object.values(productMap)
            .map(p => ({
                ...p,
                revenue: round0(p.revenue),
                cost: round0(p.cost),
                profit: round0(p.revenue - p.cost),
            }))
            .sort((a, b) => b.revenue - a.revenue)
            .slice(0, limit);

        res.status(200).json({
            range: { from: from || null, to: to || null },
            total: topProducts.length,
            topProducts,
        });
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
};

// ── 5. Doanh thu theo nhân viên bán hàng (cashier) ───────────────────────────

/**
 * GET /admin/statistics/revenue/by-staff
 * Query: ?from=YYYY-MM-DD&to=YYYY-MM-DD
 */
exports.getRevenueByStaff = async (req, res) => {
    try {
        const { from, to } = parseDateRange(req.query);
        const orders = await fetchCompletedOrders(from, to);

        const groups = {};
        for (const o of orders) {
            const uid = o.cashierUID || 'anonymous';
            if (!groups[uid]) {
                groups[uid] = {
                    cashierUID: uid,
                    cashierName: o.cashierName || 'Không xác định',
                    revenue: 0,
                    orders: 0,
                };
            }
            groups[uid].revenue += o.total || 0;
            groups[uid].orders  += 1;
        }

        const staff = Object.values(groups)
            .map(g => ({
                ...g,
                revenue: round0(g.revenue),
                averageOrderValue: g.orders > 0 ? round0(g.revenue / g.orders) : 0,
            }))
            .sort((a, b) => b.revenue - a.revenue);

        res.status(200).json({ range: { from: from || null, to: to || null }, staff });
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
};

// ── 6. Doanh thu theo danh mục sản phẩm ──────────────────────────────────────

/**
 * GET /admin/statistics/revenue/by-category
 * Query: ?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Join với collection "products" (theo field ID) để lấy category.
 */
exports.getRevenueByCategory = async (req, res) => {
    try {
        const { from, to } = parseDateRange(req.query);
        const orders = await fetchCompletedOrders(from, to);

        // Map productID -> category (vẫn cần join riêng vì item không lưu category)
        const productsSnap = await db.collection('products').get();
        const categoryMap = {};
        productsSnap.docs.forEach(d => {
            const p = d.data();
            if (p.ID) categoryMap[p.ID] = p.category || 'Khác';
        });

        const fallbackCostMap = await buildFallbackCostMap(orders);
        const groups = {};

        for (const o of orders) {
            for (const item of (o.items || [])) {
                if (!item.id) continue; // FIX: bỏ qua item không có id
                const category  = categoryMap[item.id] || 'Khác';
                const sellPrice = item.discountPrice ?? item.unitPrice ?? 0;
                const costPrice = getItemCostPrice(item, fallbackCostMap);
                const qty = item.quantity || 0;

                if (!groups[category]) groups[category] = { category, revenue: 0, cost: 0, quantitySold: 0 };
                groups[category].revenue      += sellPrice * qty;
                groups[category].cost         += costPrice * qty;
                groups[category].quantitySold += qty;
            }
        }

        const categories = Object.values(groups)
            .map(g => ({
                ...g,
                revenue: round0(g.revenue),
                cost: round0(g.cost),
                profit: round0(g.revenue - g.cost),
            }))
            .sort((a, b) => b.revenue - a.revenue);

        res.status(200).json({ range: { from: from || null, to: to || null }, categories });
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
};