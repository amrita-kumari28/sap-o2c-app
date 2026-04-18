'use strict';

const cds = require('@sap/cds');

module.exports = cds.service.impl(async function () {

    const { Customers, Orders, OrderItems, Invoices } = this.entities;

    // ─── Helper Functions ─────────────────────────────────────────────

    function pad(n, width) {
        return String(n).padStart(width, '0');
    }

    async function nextOrderNumber(db) {
        const result = await db.run(
            SELECT.from(Orders).columns('orderNumber').orderBy('orderNumber desc').limit(1)
        );
        if (!result.length) return 'ORD-00001';
        const last = result[0].orderNumber || 'ORD-00000';
        const num = parseInt(last.split('-')[1] || '0', 10) + 1;
        return `ORD-${pad(num, 5)}`;
    }

    async function nextInvoiceNumber(db) {
        const result = await db.run(
            SELECT.from(Invoices).columns('invoiceNumber').orderBy('invoiceNumber desc').limit(1)
        );
        if (!result.length) return 'INV-00001';
        const last = result[0].invoiceNumber || 'INV-00000';
        const num = parseInt(last.split('-')[1] || '0', 10) + 1;
        return `INV-${pad(num, 5)}`;
    }

    function today() {
        return new Date().toISOString().split('T')[0];
    }

    function addDays(dateStr, days) {
        const d = new Date(dateStr);
        d.setDate(d.getDate() + days);
        return d.toISOString().split('T')[0];
    }

    // ─── BEFORE CREATE: Orders ─────────────────────────────────────────

    this.before('CREATE', Orders, async (req) => {

        const db = cds.db;
        const data = req.data;

        // UUID
        if (!data.ID) {
            data.ID = cds.utils.uuid();
        }

        // Ensure customer
        if (!data.customer_ID && data.customer?.ID) {
            data.customer_ID = data.customer.ID;
        }

        if (!data.customer_ID) {
            req.error(400, 'Customer is required');
            return;
        }

        // Validate customer exists
        const customer = await db.run(
            SELECT.one.from(Customers).where({ ID: data.customer_ID })
        );

        if (!customer) {
            req.error(400, 'Invalid customer');
            return;
        }

        // Defaults
        data.orderNumber = await nextOrderNumber(db);
        data.orderDate = data.orderDate || today();
        data.status = data.status || 'Created';
        data.totalAmount = data.totalAmount || 0;

        if (!data.deliveryDate) {
            data.deliveryDate = addDays(data.orderDate, 7);
        }
    });

    // ─── AFTER CREATE: Orders → CREATE INVOICE (FIXED) ────────────────

    this.after('CREATE', Orders, async (order) => {

        try {

            const db = cds.db;

            const invoice = {
                ID: cds.utils.uuid(),
                invoiceNumber: await nextInvoiceNumber(db),
                order_ID: order.ID,
                invoiceDate: today(),
                dueDate: addDays(today(), 30),
                amount: order.totalAmount || 0,
                gstAmount: parseFloat(((order.totalAmount || 0) * 0.18).toFixed(2)),
                totalAmount: parseFloat(((order.totalAmount || 0) * 1.18).toFixed(2)),
                status: 'Pending'
            };

            await db.run(INSERT.into(Invoices).entries(invoice));

            console.log("✅ Invoice created:", invoice.invoiceNumber);

        } catch (err) {
            console.error("❌ Invoice creation failed:", err);
        }
    });

    // ─── BEFORE CREATE: OrderItems ─────────────────────────────────────

    this.before('CREATE', OrderItems, async (req) => {

        const data = req.data;

        if (!data.ID) data.ID = cds.utils.uuid();

        const qty = data.quantity || 1;
        const price = data.unitPrice || 0;

        data.totalPrice = parseFloat((qty * price).toFixed(2));
    });

    // ─── RECALCULATE ORDER TOTAL ───────────────────────────────────────

    const recalcOrderTotal = async (req) => {

        const db = cds.db;
        const data = req.data;

        const orderID = data.order_ID || data.order?.ID;
        if (!orderID) return;

        const items = await db.run(
            SELECT.from(OrderItems).where({ order_ID: orderID })
        );

        const total = items.reduce((sum, i) => sum + (parseFloat(i.totalPrice) || 0), 0);

        await db.run(
            UPDATE(Orders).set({ totalAmount: total }).where({ ID: orderID })
        );

        // Update invoice
        await db.run(
            UPDATE(Invoices).set({
                amount: total,
                gstAmount: total * 0.18,
                totalAmount: total * 1.18
            }).where({ order_ID: orderID })
        );
    };

    this.after('CREATE', OrderItems, recalcOrderTotal);
    this.after('UPDATE', OrderItems, recalcOrderTotal);
    this.after('DELETE', OrderItems, recalcOrderTotal);

    // ─── UPDATE STATUS ────────────────────────────────────────────────

    this.on('updateStatus', Orders, async (req) => {

        const db = cds.db;
        const { ID } = req.params[0];
        const { status } = req.data;

        await db.run(
            UPDATE(Orders).set({ status }).where({ ID })
        );

        if (status === 'Delivered') {
            await db.run(
                UPDATE(Invoices).set({ status: 'Due' }).where({ order_ID: ID })
            );
        }

        return SELECT.one.from(Orders).where({ ID });
    });

    // ─── BEFORE CREATE: Invoices ──────────────────────────────────────

    this.before('CREATE', Invoices, async (req) => {

        const data = req.data;

        if (!data.ID) data.ID = cds.utils.uuid();

        if (!data.invoiceNumber) {
            data.invoiceNumber = await nextInvoiceNumber(cds.db);
        }

        data.invoiceDate = data.invoiceDate || today();
        data.dueDate = data.dueDate || addDays(data.invoiceDate, 30);
        data.status = data.status || 'Pending';
    });

});