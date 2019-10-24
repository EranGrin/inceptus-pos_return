odoo.define('ies_pos_return.screens', function (require) {
	"use strict";
	
	var chrome = require('point_of_sale.chrome');
    var screens = require('point_of_sale.screens');
    var core = require('web.core');
    var gui = require('point_of_sale.gui');
    var models = require('point_of_sale.models');
    var PosBaseWidget = require('point_of_sale.BaseWidget');
    var PopupWidget = require('point_of_sale.popups');
    var Model = require('web.DataModel');
    var _t = core._t;
    var QWeb = core.qweb;
    var order_model = null;
    var account_journal = null;
    var model_list = models.PosModel.prototype.models;
    for (var i = 0, len = model_list.length; i < len; i++) {
        if (model_list[i].model == "pos.order")
            order_model = model_list[i];
        else if (model_list[i].model == "account.journal")
        	account_journal = model_list[i];
    }
    
    account_journal.fields.push('allow_return');
    
    var exports = {};
    
    var POSReturnPopup = PopupWidget.extend({
    	template: 'POSReturnTemplate',

    	barcode_product_action: function(code){
            var self = this;
            this.$('input,textarea').val(code.base_code).mask('99999-999-9999');
        },

    	show: function(options){
    	    var self = this;
            options = options || {};
            this._super(options);
            this.renderElement();
            this.$('input,textarea').mask('99999-999-9999').focus();
            this.pos.barcode_reader.set_action_callback({
                'product': _.bind(self.barcode_product_action, self),
                'weight': _.bind(self.barcode_product_action, self),
                'price': _.bind(self.barcode_product_action, self)
            });
        },
        click_confirm: function(){
            var value = this.$('input,textarea').val();
            this.gui.close_popup();
            if( this.options.confirm ){
                this.options.confirm.call(this,value);
            }
        },
    });
    gui.define_popup({name:'pos_return', widget: POSReturnPopup});
    
    var POSMessagePopup = PopupWidget.extend({
    	template: 'POSMessage',
    	show: function(options){
            this._super(options);
        },
    });
    gui.define_popup({name:'show_message', widget: POSMessagePopup});
    
    screens.ProductScreenWidget.include({

        return_confirm: function(ref,open_order){
            var super_self = this;
            var POSOrder = new Model('pos.order');
            var pos = this.pos;
            var domain = [['pos_reference', 'like', ref],
                ['return_order', '=', false],
                ['parent_order_id', '=', false],
              ];
            POSOrder.call('search_read', [domain, ['id', 'pos_reference', 'partner_id', 'remaining_tax_amount', 'lines']]).then(function (result) {
                if (result && result.length == 1) {
                    if (_.contains(open_order, result[0].id)){
                        super_self.gui.show_popup('show_message',{
                            title: _t('Order Already Open!'),
                            body:  _t('Can not open a order which is already open!'),
                        });
                        $('#mode_val').val(1);
                        $('div.cd-dropdown>span').html("<span class='icon-shop'>Sale</span>");
                        return true
                    }
                    POSOrder.call('get_return_order', [[result[0].id]]).then(function(ROrder){
                        if (ROrder[0].length <= 0) {
                            super_self.gui.show_popup('show_message',{
                                title: _t('No Products!'),
                                body:  _t('No products available for return in selected order.'),
                            });
                            $('#mode_val').val(1);
                            $('div.cd-dropdown>span').html("<span class='icon-shop'>Sale</span>");
                        }
                        else{
                            pos.get('selectedOrder')['pos_mode'] = 'return';
                            pos.get('selectedOrder')['return_order'] = {
                                'ref':result[0].pos_reference,
                                'id': result[0].id,
                                'lines': ROrder[1],
                                'products': ROrder[0],
                            };
                            super_self.product_list_widget.set_product_list(ROrder[0]);
                            $('#return_order_ref').html(result[0].pos_reference);

                            var client = super_self.pos.db.get_partner_by_id(ROrder[2])
                            super_self.pos.get_order().set_client(client);

                        }
                    })
                }
                else{
                    super_self.gui.show_popup('error',{
                        title: _t('Order not found!'),
                        body:  _t('Please enter correct reference number.'),
                    });
                    $('#mode_val').val(1);
                    $('div.cd-dropdown>span').html("<span class='icon-shop'>Sale</span>");
                }
            });
        },
        start: function(){
        	var self = this;
            var super_self = this;
            var shop = this.pos.shop;
            var pos_config = this.pos.get('pos_config');
            this._super();
            var pos = this.pos;
			$('div.cd-dropdown>ul>li').on('click', function() {
				if ($(this).data('value') === 1){
					var selectedOrder = pos.get('selectedOrder'),
	                pos_mode = selectedOrder.get('pos_mode');
	            	if (pos.get('selectedOrder').pos_mode == 'return'){
	            		selectedOrder.destroy({'reason':'abandon'});
	            	}
	            	delete pos.get('selectedOrder')['return_order'];
	            	var products = pos.db.get_product_by_category(0);
	            	super_self.product_list_widget.set_product_list(products);
	            	pos.get('selectedOrder')['pos_mode'] = 'sale';
				}
				else if ($(this).data('value') === 2){
					var selectedOrder = pos.get('selectedOrder'),
					pos_mode = selectedOrder.get('pos_mode');
					var open_order = [];
					if (pos.get('orders') !== undefined){
						var open_order = _.filter(pos.get('orders').models, function(o){ if (o.return_order !== undefined){return o.return_order.id}});
						open_order = _.pluck(_.pluck(open_order, 'return_order'), 'id')
					}
	            	selectedOrder.destroy({'reason':'abandon'});
					super_self.gui.show_popup('pos_return',{
	                    title: _t('POS Return'),
	                    confirm: function(ref,open_order) {
	                    console.log(super_self);
                            super_self.return_confirm(ref,open_order);
	                    },
	                    cancel: function(data){
	                    	$('#mode_val').val(1);
	                    	$('div.cd-dropdown>span').html("<span class='icon-shop'>Sale</span>");
	                    	var products = pos.db.get_product_by_category(0);
	    	            	super_self.product_list_widget.set_product_list(products);
	                    }
	                });	
				}
			});
        },
        
        click_product: function(product) {
            if(product.to_weight && this.pos.config.iface_electronic_scale){
                this.gui.show_screen('scale',{product: product});
            }else{
                this.pos.get_order().add_product(product);
            }
         },
    });
    
    screens.ProductListWidget.include({
    	init: function(parent, options) {
    		var self = this;
    		this._super(parent,options);
    		this.click_product_handler = function(){
                var product = self.pos.db.get_product_by_id(this.dataset.productId);
                if ($(this).data("line-id") !== undefined){
                	product['line_id'] = $(this).data("line-id");
                }
                options.click_product_action(product);
            };
    	},
    	render_product: function(product){
            this._super(product);
    		var cached = false;
            if(!cached){
                var image_url = this.get_product_image_url(product);
                var product_html = QWeb.render('Product',{ 
                        widget:  this, 
                        product: product, 
                        image_url: this.get_product_image_url(product),
                    });
                var product_node = document.createElement('div');
                product_node.innerHTML = product_html;
                product_node = product_node.childNodes[1];
                this.product_cache.cache_node(product.id,product_node);
                return product_node;
            }
            return cached;
        },
    })
    	
    screens.ProductCategoriesWidget.include({
    	renderElement: function(){
    		var self = this;
    		this._super();
    		var selectedOrder = this.pos.get_order();
    		if (selectedOrder.pos_mode == 'return'){
    			var return_products = selectedOrder.return_order.products;
    			var products = this.pos.db.get_product_by_category(this.category.id);
    			var filtered_product = self.filter_products(return_products, products);
	    		this.product_list_widget.set_product_list(filtered_product);
    		}
    	},
    	render_category : function( category, with_image ){
    		//for the selection dropdown
    		var vals = this._super(category, with_image);
    		$( '#cd-dropdown' ).dropdown({
				gutter : 0,
			});
    		return vals;
    	},
    	
    	filter_products: function(return_products, products){
    		var filtered_product_obj= {};
    		_.each(products, function (item) { filtered_product_obj[item.id] = true; });
    		return _.filter(return_products, function (val) {
    		    return filtered_product_obj[val.id];
    		}, products);
    	},
    	
    	perform_search: function(category, query, buy_result){
    		this._super(category, query, buy_result);
    		var self = this;
    		var products;
    		var selectedOrder = this.pos.get_order();
    		if (selectedOrder.pos_mode == 'return'){
    			var return_products = selectedOrder.return_order.products;
    			var filtered_product = self.filter_products(return_products, products);
                this.product_list_widget.set_product_list(filtered_product);
    		}
    	},
    });

    screens.ScreenWidget.include({
		show : function() {
			var self = this;
			var selectedOrder = self.pos.get('selectedOrder');
			if (selectedOrder.pos_mode == 'return'){
				var non_return_jr = _.pluck(_.pluck(_.filter(selectedOrder.pos.cashregisters, function(cr){
					return cr.journal.allow_return == false;
				}), 'journal'), 'id');
				_.each(this.$el.find('.paymentmethods').children(), function(el){
					if($.inArray(parseInt($(el).data('id')), non_return_jr) !== -1){
						$(el).remove();
					}
				})
			}
			else{
                var return_jr = _.pluck(_.pluck(_.filter(selectedOrder.pos.cashregisters, function(cr){
					return cr.journal.allow_return == true;
				}), 'journal'), 'id');
				_.each(this.$el.find('.paymentmethods').children(), function(el){
					if($.inArray(parseInt($(el).data('id')), return_jr) !== -1){
						$(el).remove();
					}
				})
			}
			this._super();
		}
	});
    
    
    var _super_orderline = models.Orderline.prototype;
    models.Orderline = models.Orderline.extend({
    	
    	set_quantity: function(quantity){
    		
    		var self = this;
    		var selectedOrder = this.pos.get_order();
    		if (selectedOrder && selectedOrder.pos_mode == 'return'){
    			var return_order_line = selectedOrder.return_order.lines;
    			var return_lines = _.find(return_order_line, function(line){ return self.get_product().line_id == line.id});
    			if (return_lines.remaining_qty < quantity){
    				self.pos.gui.show_popup('show_message',{
                        title: _t('Stop!'),
                        body:  _t('You can not return more then '+ return_lines.remaining_qty + ' quantity.'),
                    });
    			}
    			else{
    				_super_orderline.set_quantity.apply(this, arguments);
    			}
    		}
    		else{
    			_super_orderline.set_quantity.apply(this, arguments);
    		}
    	},
    	
    	export_as_JSON: function() {
    		var data = _super_orderline.export_as_JSON.apply(this, arguments);
    		data['parent_line_id'] = this.get_product().line_id;
    		return data;
    	}
    });
    
    var _super_order = models.Order.prototype;
    models.Order = models.Order.extend({

    	initialize: function(attributes,options) {
            var self = this;
            this.set({
                'pos_reference' : false
            });
            _super_order.initialize.apply(this,arguments);
        },

    	add_product: function(product, options){
    		var self = this;
    		options = options || {};
            var attr = JSON.parse(JSON.stringify(product));
            attr.pos = this.pos;
            attr.order = this;
    		var selectedOrder = this.pos.get_order();
    		
    		if (selectedOrder.pos_mode == 'return'){
    			var return_order_line = selectedOrder.return_order.lines;
    			var return_line = _.find(return_order_line, function(line){ return product.line_id == line.id});
    			var line = new models.Orderline({}, {pos: attr.pos, order: self, product: product});
    			line.set('origin_price', return_line.price_unit);
    			line['parent_line_id'] =  product.line_id; 
                if (return_line.discount) {
                    line.set_discount(return_line.discount);
                }
                if(return_line.remaining_qty){
                    line.set_quantity(1);
                }
                
                line['price'] = return_line.price_unit;
                
                var product_lines = _.filter(selectedOrder.get_orderlines(), function(line){return line.parent_line_id == product.line_id});
                var total_products = 0;
                _.each(product_lines, function(){total_products = total_products + 1});
    			if (total_products >= return_line.remaining_qty){
    				self.pos.gui.show_popup('show_message',{
                        title: _t('Hold on!'),
                        body:  _t('Line with product is already added. Please update the quantity.'),
                    });
    				return true;
    			}
    			else{
    				var last_orderline = this.get_last_orderline();
    				if( last_orderline && last_orderline.can_be_merged_with(line) && options.merge !== false){
    		            last_orderline.merge(line);
    		        }else{
    		            this.orderlines.add(line);
    		        }
    			}
    		}
    		else{
	    		_super_order.add_product.apply(this, arguments);
	    	}
    	},
        add_paymentline: function(cashregister) {
            this.assert_editable();
            var selectedOrder = this.pos.get_order();
            var newPaymentline = new models.Paymentline({},{order: this, cashregister:cashregister, pos: this.pos});
            if(cashregister.journal.type !== 'cash' || this.pos.config.iface_precompute_cash || selectedOrder.pos_mode == 'return'){
                newPaymentline.set_amount( Math.max(this.get_due(),0) );
            }
            this.paymentlines.add(newPaymentline);
            this.select_paymentline(newPaymentline);

        },
    	
    	export_as_JSON: function() {
    		//method over write for the parent_order_id
    		var order = _super_order.export_as_JSON.apply(this,arguments);
            var orderLines, paymentLines;
            var selectedOrder = this.pos.get_order();
            if (selectedOrder && selectedOrder.return_order !== undefined){
            	var return_order_id = selectedOrder.return_order.id;
            }
            orderLines = [];
            this.orderlines.each(_.bind( function(item) {
                return orderLines.push([0, 0, item.export_as_JSON()]);
            }, this));
            paymentLines = [];
            this.paymentlines.each(_.bind( function(item) {
                return paymentLines.push([0, 0, item.export_as_JSON()]);
            }, this));
            order['parent_order_id'] = return_order_id;
            return order;
        },

    });
    
    chrome.OrderSelectorWidget.include({
    	// need binding function
    	neworder_click_handler: function(event, $el) {
    		$('#mode_val').val(2);
    		$('div.cd-dropdown>span').html("<span class='icon-shop'>Sale</span>");
            this.pos.add_new_order();
        },
        
        deleteorder_click_handler: function(event, $el) {
        	/// future improvements
            var self  = this;
            var order = this.pos.get_order(),
            pos_mode = order.pos_mode;
            if (!order) {
                return;
            } else if ( !order.is_empty() ){
                this.gui.show_popup('confirm',{
                    'title': _t('Destroy Current Order ?'),
                    'body': _t('You will lose any data associated with the current order'),
                    confirm: function(){
                    	
                    	var index = _.indexOf(_.pluck(this.pos.get_order_list(), 'uid'), order.uid);
                    	
                    	if (index>0){
                    		var prev_order = this.pos.get_order_list()[index-1]
                    		if (prev_order.pos_mode === 'return'){
                    			$('#mode_val').val(2);
                            	$('div.cd-dropdown>span').html("<span class='icon-return'>Return</span>");
                    		}
                    		else {
                    			$('#mode_val').val(1);
                            	$('div.cd-dropdown>span').html("<span class='icon-shop'>Sale</span>");
                    		}
                    	}
                    	else {
                			$('#mode_val').val(1);
                        	$('div.cd-dropdown>span').html("<span class='icon-shop'>Sale</span>");
                		}
                        self.pos.delete_current_order();
                    },
                });
            } else {
            	if (pos_mode === 'return'){
        			$('#mode_val').val(2);
                	$('div.cd-dropdown>span').html("<span class='icon-return'>Return</span>");
        		}
        		else {
        			$('#mode_val').val(1);
                	$('div.cd-dropdown>span').html("<span class='icon-shop'>Sale</span>");
        		}
                this.pos.delete_current_order();
            }
        },
        
    	order_click_handler: function(event, $el) {
    		var vals = this._super(event, $el);
    		var selectedOrder = this.pos.get_order(),
    		pos_mode = selectedOrder.pos_mode;
    		if (pos_mode === 'return'){
    			this.pos.gui.screen_instances.products.product_list_widget.set_product_list(selectedOrder.return_order.products);
    			$('#mode_val').val(2);
            	$('div.cd-dropdown>span').html("<span class='icon-return'>Return</span>");
    		}
    		else {
    			var products = this.pos.db.get_product_by_category(0);
    			this.pos.gui.screen_instances.products.product_list_widget.set_product_list(products);
    			$('#mode_val').val(1);
            	$('div.cd-dropdown>span').html("<span class='icon-shop'>Sale</span>");
    		}
    		return vals
    	}
    });

    screens.ReceiptScreenWidget.include({
    	click_next: function() {
    		$('#mode_val').val(1);
        	$('div.cd-dropdown>span').html("<span class='icon-shop'>Sale</span>");
            this.pos.get_order().finalize();
        },

//        show: function(){
//            this._super();
//            var order = this.pos.get_order()
//            /*Set barcode in pos ticket.*/
//            var barcode_val = order.get_name();
//            if(order.get_pos_reference()){
//                order_barcode_val = order.get_pos_reference();
//                barcode_val = order_barcode_val.split("Order ").pop(-1)
//            }
//            if (barcode_val) {
//               $("#barcode_div").addClass(barcode_val.toString());
//               $("#barcode_div").barcode(barcode_val.toString(), "code128");
//            }
//        },

    });
    
});
