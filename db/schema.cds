namespace com.o2c;

using { cuid, managed } from '@sap/cds/common';

entity Customers : cuid {
    name        : String(100) not null;
    email       : String(150);
    phone       : String(20);
    city        : String(100);
    gstin       : String(20);
    creditLimit : Decimal(15,2) default 500000;
    orders      : Association to many Orders on orders.customer = $self;
}

entity Orders : cuid {
    orderNumber  : String(20);
    customer     : Association to Customers not null;
    orderDate    : Date;
    deliveryDate : Date;
    status       : String(20) default 'Created';
    totalAmount  : Decimal(15,2) default 0;
    notes        : String(500);
    items        : Composition of many OrderItems on items.order = $self;
    invoice      : Association to one Invoices on invoice.order = $self;
}

entity OrderItems : cuid {
    order       : Association to Orders;
    productName : String(200) not null;
    quantity    : Integer default 1;
    unitPrice   : Decimal(15,2) default 0;
    totalPrice  : Decimal(15,2) default 0;
}

entity Invoices : cuid {
    invoiceNumber : String(20);
    order         : Association to Orders;
    invoiceDate   : Date;
    dueDate       : Date;
    amount        : Decimal(15,2) default 0;
    gstAmount     : Decimal(15,2) default 0;
    totalAmount   : Decimal(15,2) default 0;
    status        : String(20) default 'Pending';
    paymentDate   : Date;
}
