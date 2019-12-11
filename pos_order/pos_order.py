# -*- coding: utf-8 -*-
# Part of Inceptus ERP Solutions Pvt.ltd.
# See LICENSE file for copyright and licensing details.
from odoo import api, fields, models, _

import logging

_logger = logging.getLogger(__name__)


class PosOrder(models.Model):
    _name = 'pos.order'
    _inherit = ["pos.order", "ies.base"]

    @api.model
    def search(self, args, offset=0, limit=None, order=None, count=False):
        if args:
            for arg in args:
                if arg is list and arg[0] == 'pos_reference' and isinstance(arg[2], basestring):
                    arg[2] = arg[2].replace(' ', '-')
        res = super(PosOrder, self).search(args, offset, limit, order, count=count)
        return res

    @api.model
    def _get_is_refundable(self):
        return 'yes'

    parent_return_order = fields.Char('Return Order ID', size=64)  # Dont know why this field is defined.
    return_order = fields.Boolean('Return Order?')
    return_seq = fields.Integer('Return Sequence')
    refund_order_id = fields.Many2one('pos.order', 'Refund Order')  # need to remove replaced with parent order_id
    is_refundable = fields.Selection(selection=[('yes', 'yes'), ('no', 'no')],
                                     string="Is Refundable", default='yes')

    parent_order_id = fields.Many2one('pos.order', 'Return Order for')
    child_order_ids = fields.One2many('pos.order', 'parent_order_id', 'Child Orders')
    lines = fields.One2many('pos.order.line', 'order_id', string='Order Lines', states={'draft': [('readonly', False)]},
                            readonly=True, copy=False)

    @api.model
    def refund(self):
        return super(PosOrder, self.with_context(clone=1)).refund()

    @api.model
    def copy(self, default=None):
        self.ensure_one()
        order = self
        default.update({'pos_reference': "Return " + self.pos_reference})
        res = super(PosOrder, self).copy(default)
        res.parent_order_id = self.id
        res.return_order = True
        if not self._context.get('clone'):
            return res
        for line in order.lines:
            if line.remaining_qty > 0:
                line_default = {
                    'parent_line_id': line.id,
                    'order_id': res.id,
                    'return_order_line': True,
                    'qty': line.remaining_qty
                }
                new_line = line.copy(line_default)
                new_line.parent_line_id = line.id
        return res

    # write same product line merge function
    # @api./
    def get_return_order(self):
        """method used to load the products on the pos while return"""
        product_ids, line_list = [], []
        product_fields = ["barcode", "default_code", "description", "description_sale", "display_name", "list_price",
                          "pos_categ_id", "price", "product_tmpl_id", "taxes_id", "to_weight", "tracking", "uom_id",] #'is_coupon'
        line_fields = ['remaining_qty', 'return_qty', 'qty', 'id', 'price_unit', 'discount', 'price_subtotal',
                       'product_id']
        for line in self.lines:
            add_product = True
            # try:
            #     if line.product_id.is_coupon:
            #         add_product = False
            # except:
            #     pass
            if line.remaining_qty > 0 and add_product:
                line_data = line.product_id.read(product_fields)[0]
                line_data.update({'line_id': line.id, 'price': line.price_unit, 'rqty': line.qty, 'clean_cache': 1})
                product_ids.extend([line_data])
                line_list.extend(line.read(line_fields))
        return product_ids, line_list, self.partner_id.id

    @api.model
    def _order_fields(self, ui_order):
        ro_val = 0
        if (ui_order.get('parent_order_id')):
            ro_val = 1
        res = super(PosOrder, self.with_context(return_order=ro_val))._order_fields(ui_order)
        if ui_order.get('parent_order_id'):
            for statement in ui_order.get('statement_ids'):
                if statement[2].get('amount'):
                    statement[2]['amount'] = statement[2].get('amount') * -1
            res.update({'return_order': 1,
                        'parent_order_id': ui_order['parent_order_id'],
                        'pos_reference': 'Return ' + res.get('pos_reference'),
                        'amount_return': ui_order['amount_paid'],
                        'amount_paid': 0.0,
                        })
        return res

    @api.model
    def create_from_ui(self, orders, draft=False):
        res = super(PosOrder, self).create_from_ui(orders, draft=draft)
        for order in self.browse(res[0].get('id', False)):
            if not order.parent_order_id:
                continue
            for payment in order.payment_ids:
                payment_vals = {
                    'journal_id': payment.journal_id.id,
                    'payment_method_id': self.env.ref('account.account_payment_method_manual_out').id,
                    'payment_date': order.invoice_id.date_invoice or order.date_order,
                    'communication': order.name,
                    'payment_type': 'outbound',
                    'amount': abs(order.amount_total),
                    'currency_id': payment.journal_id.currency_id.id or payment.journal_id.company_id.currency_id.id,
                    'partner_id': order.partner_id.id or order.company_id.partner_id.id,
                    'partner_type': 'customer',
                }
                if order.invoice_id:
                    payment_vals.update({'invoice_ids': [(4, order.invoice_id.id)]})

                payment = self.env['account.payment'].create(payment_vals)
                payment.post()
        return res


class PosOrderLine(models.Model):
    _name = "pos.order.line"
    _inherit = ["pos.order.line", "ies.base"]

    def _order_line_fields(self, line, session_id=None):
        res = super(PosOrderLine, self)._order_line_fields(line, session_id=session_id)
        if self._context.get("return_order"):
            if line and line[2].get('qty'):
                line[2]['qty'] = line[2]['qty'] * -1.0
        return res

    @api.depends('child_line_ids', 'order_id.child_order_ids')
    @api.model
    def _remaining_qty(self):
        res = 0.0
        for line in self:
            rqty = 0
            parent_ids = self.search([('parent_line_id', '=', line.id)])
            if parent_ids:
                rqty = sum(map(lambda a: (a.qty * -1), parent_ids))
            res = line.qty - rqty
            line.remaining_qty = res

    @api.model
    def _get_qty(self):
        return self.qty

    return_qty = fields.Integer('Return QTY')
    parent_line_id = fields.Many2one('pos.order.line', 'Order Line Ref', index=True, ondelete='cascade')
    child_line_ids = fields.One2many('pos.order.line', 'parent_line_id', string="Child Lines")
    return_order_line = fields.Boolean('Return Order Line')
    remaining_qty = fields.Float(compute=_remaining_qty, string='Remaining Qty', store=True, default=_get_qty)


class account_journal(models.Model):
    _inherit = 'account.journal'

    allow_return = fields.Boolean('Allow in Return?')
