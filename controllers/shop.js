const Product = require('../models/product');
const Order = require('../models/order');
const fs = require("fs")
const path = require("path")
const PdfDoc = require("pdfkit")
const stripe = require("stripe")("sk_test_vRAKDmwtvPagiIZ72EgE7SSU00P5PnnpiG")

const ITEMS_PER_PAGE = 1

exports.getProducts = (req, res, next) => {
  const page = parseInt(req.query.page) || 1
  let totalProducts;
  Product.find()
  .countDocuments()
  .then(productCount => {
    totalProducts = productCount
    return Product.find()
    .skip((page - 1) * ITEMS_PER_PAGE)
    .limit(ITEMS_PER_PAGE)
  })
  .then(products => {
    let pageCount = Math.ceil(totalProducts / ITEMS_PER_PAGE)
      res.render('shop/product-list.ejs', {
        prods: products,
        pageTitle: 'Products',
        path: '/product',
        hasNextPage: ITEMS_PER_PAGE * page < totalProducts,
        hasPreviousPage: page > 1,
        hasLastPage: pageCount > 2 && page !== pageCount && page !== pageCount -1,
        nextPage: page + 1,
        currentPage: page,
        previousPage: page - 1,
        lastPage: pageCount
      });
    })
    .catch(err => {
      const error = new Error(err);
      error.httpStatusCode = 500;
      return next(error);
    });
};

exports.getProduct = (req, res, next) => {
  const prodId = req.params.productId;
  Product.findById(prodId)

    .then(product => {
      res.render('shop/product-detail', {
        product: product,
        pageTitle: product.title,
        path: '/products'
      });
    })
    .catch(err => {
      const error = new Error(err);
      error.httpStatusCode = 500;
      return next(error);
    });
};

exports.getIndex = (req, res, next) => {
  const page = parseInt(req.query.page) || 1
  let totalProducts;
  Product.find()
  .countDocuments()
  .then(productCount => {
    totalProducts = productCount
    return Product.find()
    .skip((page - 1) * ITEMS_PER_PAGE)
    .limit(ITEMS_PER_PAGE)
  })
  .then(products => {
    let pageCount = Math.ceil(totalProducts / ITEMS_PER_PAGE)
    res.render('shop/index', {
      prods: products,
      pageTitle: 'Shop',
      path: '/',
      hasNextPage: ITEMS_PER_PAGE * page < totalProducts,
      hasPreviousPage: page > 1,
      hasLastPage: pageCount > 2 && page !== pageCount && page !== pageCount -1,
      nextPage: page + 1,
      currentPage: page,
      previousPage: page - 1,
      lastPage: pageCount
    });
  })
  .catch(err => {
    const error = new Error(err);
    error.httpStatusCode = 500;
    return next(error);
  });
};

exports.getCart = (req, res, next) => {
  req.user
    .populate('cart.items.productId')
    .execPopulate()
    .then(user => {
      const products = user.cart.items;
      res.render('shop/cart', {
        path: '/cart',
        pageTitle: 'Your Cart',
        products: products
      });
    })
    .catch(err => {
      const error = new Error(err);
      error.httpStatusCode = 500;
      return next(error);
    });
};

exports.postCart = (req, res, next) => {
  const prodId = req.body.productId;
  Product.findById(prodId)
    .then(product => {
      return req.user.addToCart(product);
    })
    .then(result => {
      console.log(result);
      res.redirect('/cart');
    })
    .catch(err => {
      const error = new Error(err);
      error.httpStatusCode = 500;
      return next(error);
    });
};

exports.postCartDeleteProduct = (req, res, next) => {
  const prodId = req.body.productId;
  req.user
    .removeFromCart(prodId)
    .then(result => {
      res.redirect('/cart');
    })
    .catch(err => {
      const error = new Error(err);
      error.httpStatusCode = 500;
      return next(error);
    });
};

exports.getCheckout = (req, res, next) => {
  let products = []
  let total = 0
  req.user
    .populate('cart.items.productId')
    .execPopulate()
    .then(user => {
      products = user.cart.items;
      total = 0
      products.forEach(prod => {
        total = total + prod.productId.price * prod.quantity
      })

      return stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        line_items: products.map(p => {
          return {
            name: p.productId.title,
            description: p.productId.description,
            amount: p.productId.price,
            currency: "cad",
            quantity: p.quantity
          }
        }),
        success_url: req.protocol + '://' + req.get('host') + '/checkout/success',
        cancel_url: req.protocol + '://' + req.get('host') + '/checkout/cancel'
      })
    })
    .then(session => {
      console.log(session.id.toString())
      res.render('shop/checkout.ejs', {
        path: '/checkout',
        pageTitle: 'Checkout',
        products: products,
        totalPrice: total,
        sessionId: session.id
      });
    })
    .catch(err => {
      let error = new Error(err);
      error.httpStatusCode = 500;
      return next(error);
    });
}

exports.postOrder = (req, res, next) => {
  req.user
    .populate('cart.items.productId')
    .execPopulate()
    .then(user => {
      const products = user.cart.items.map(i => {
        return { quantity: i.quantity, product: { ...i.productId._doc } };
      });
      const order = new Order({
        user: {
          email: req.user.email,
          userId: req.user
        },
        products: products
      });
      return order.save();
    })
    .then(result => {
      return req.user.clearCart();
    })
    .then(() => {
      res.redirect('/orders');
    })
    .catch(err => {
      const error = new Error(err);
      error.httpStatusCode = 500;
      return next(error);
    });
};

exports.getOrders = (req, res, next) => {
  Order.find({ 'user.userId': req.user._id })
    .then(orders => {
      res.render('shop/orders', {
        path: '/orders',
        pageTitle: 'Your Orders',
        orders: orders
      });
    })
    .catch(err => {
      const error = new Error(err);
      error.httpStatusCode = 500;
      return next(error);
    });
};

exports.getInvoice = (req, res, next) => {
  const orderId = req.params.orderId
  Order.findById(orderId)
  .then(order => {
    if (!order) {
      return next(new Error("No order found"))
    }

    if (order.user.userId.toString() !== req.user._id.toString()) {
      return next(new Error("You do not have access to this order"))
    }

    const invoiceName = "invoice-" + orderId + ".pdf"
    const invoicePath = path.join("data", "invoices", invoiceName)
    /* fs.readFile(invoicePath, (err, data) => {
      if (err) {
        return next(err)
      }
      res.set({
        "Content-Type": "application/pdf",
        "Content-Disposition": "inline; filename='"+ invoiceName + "'"
      })
      res.send(data)
    }) */
    const pdfDoc = new PdfDoc()

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": "inline; filename='"+ invoiceName + "'"
    })

    pdfDoc.pipe(fs.createWriteStream(invoicePath))
    pdfDoc.pipe(res)
    pdfDoc.text("Invoice")
    let total = 0
    order.products.forEach(product => {
      total = total + product.product.price * product.quantity
      pdfDoc.text(product.product.title + "  -  " + product.product.description + "  x  " + product.quantity + "    $" + product.product.price)
    })
    pdfDoc.text("Total: " + total)
    pdfDoc.end()
  })
  .catch(err => {
    console.log(err)
    const error = new Error(err);
    error.httpStatusCode = 500;
    return next(error);
  });
}
