# -*- coding: utf-8 -*-
# Part of Inceptus ERP Solutions Pvt.ltd.
# See LICENSE file for copyright and licensing details.
{
    'name': 'POS Return',
    'version': '1.0',
    'category': 'Point of Sale',
    'description': """
        This module is used to return the products to the customer from POS Interface.
    """,
    'summary': 'POS Frontend & Backend product return',
    'author': 'Inceptus.io',
    'website': 'http://www.inceptus.io',
    'depends': ['web', 'point_of_sale', 'inceptus-base'],
    'data': [
        'views/templates.xml',
        'views/pos_backend.xml',
    ],
    'demo': [],
    'test': [],
    'qweb': [
        'static/src/xml/pos_return.xml'
    ],

    'application': True,
    "auto_install": False,
    "installable": True,

    'price': 99.00,
    'currency': 'EUR',
    'license': 'OPL-1',
}
# vim:expandtab:smartindent:tabstop=4:softtabstop=4:shiftwidth=4:
